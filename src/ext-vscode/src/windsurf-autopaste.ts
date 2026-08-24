/**
 * Windsurf auto-paste — put the advisory selection straight into Cascade's input.
 *
 * Why keystroke simulation: this module is the FALLBACK path — copy to clipboard,
 * focus the Cascade input, simulate the paste shortcut. It reuses the OS-automation
 * approach already used by `popup-foreground.ts` (xdotool/wmctrl).
 *
 * `windsurf.sendTextToChat` is only a defined ID (no registered handler →
 * `executeCommand` throws). **Re-confirmed 2026-08-10** against the shipped bundle:
 * it occurs exactly once, inside a command-ID constants table
 * (`SEND_TEXT_TO_CHAT:{id:"windsurf.sendTextToChat"}`), with no handler — while
 * `sendChatActionMessage` occurs ×7 and `addCascadeInput` ×6. This note was right;
 * `chat-input-injector.ts` previously claimed the opposite and has been corrected.
 *
 * **CORRECTED 2026-08-10 — this header used to say the `addCascadeInput` protobuf
 * was something "the extension can't construct". That is no longer true and had
 * been stale for some time.** `windsurf-cascade-action.ts` builds that exact
 * message by hand and it ships as the PRIMARY Windsurf insert, called from
 * `extension.ts:176` (advisory) and `extension.ts:491` (PE delivery). So the
 * accurate statement is: a direct insert DOES exist and is preferred; this
 * clipboard+keystroke path is what runs when that command is not registered on
 * the host build — and it is also the path with no reverse-engineering exposure,
 * which matters if the direct payload's provenance is ever ruled against.
 *
 * Fully dependency-injected; the real spawns are `spawnSync` (no shell).
 */
import { spawnSync } from 'node:child_process';
import { buildWin32KeystrokeScript, WIN32_KEYSTROKE_TIMEOUT_MS } from './submit-clipboard-delivery.js';

export interface AutoPasteDeps {
  /**
   * RC49 (win32): editor window-title candidates (live appName first). When
   * set, the paste uses the foreground-first targeted script instead of a
   * blind global ^v (the RC28 class — paste landing in whatever window is
   * foreground — was fixed for submit but never for paste). Absent ⇒ the old
   * bare SendKeys, byte-identical for every existing caller.
   */
  win32Titles?: readonly string[];
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  /** True if `cmd` is on PATH (test seam). */
  hasCommand?: (cmd: string) => boolean;
  /** Run `cmd args`; return true on exit 0 (test seam). */
  run?: (cmd: string, args: string[]) => boolean;
}

function defaultHasCommand(cmd: string): boolean {
  try {
    return spawnSync('which', [cmd], { stdio: 'ignore', timeout: 2000 }).status === 0;
  } catch {
    return false;
  }
}
function defaultRun(cmd: string, args: string[]): boolean {
  try {
    return spawnSync(cmd, args, { stdio: 'ignore', timeout: 3000 }).status === 0;
  } catch {
    return false;
  }
}

/**
 * Best-effort: raise the window of the given app class so the paste lands in it
 * (Linux/X11). No-op (returns false) elsewhere or when no tool is present.
 * `appClass` is matched against the X11 window class (e.g. 'windsurf', 'cursor').
 */
export function raiseAppWindow(appClass: string | readonly string[], deps: AutoPasteDeps = {}): boolean {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  if (platform !== 'linux') return false;
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return false;
  const has = deps.hasCommand ?? defaultHasCommand;
  const run = deps.run ?? defaultRun;
  // RC59: rebranded hosts (Devin) carry their own WM_CLASS — try every
  // candidate until one raises. A single string keeps the old behaviour.
  const candidates = typeof appClass === 'string' ? [appClass] : appClass;
  if (has('wmctrl')) return candidates.some((c) => run('wmctrl', ['-x', '-a', c]));
  if (has('xdotool')) return candidates.some((c) => run('xdotool', ['search', '--class', c, 'windowactivate', '--sync']));
  return false;
}

/** Back-compat wrapper: raise the Windsurf window. */
export function raiseWindsurfWindow(deps: AutoPasteDeps = {}): boolean {
  return raiseAppWindow('windsurf', deps);
}

/**
 * Simulate the paste shortcut into the currently-focused input. Returns true if a
 * keystroke tool was found and dispatched the paste; false otherwise (caller then
 * keeps the clipboard + toast fallback).
 */
export function pasteKeystroke(deps: AutoPasteDeps = {}): boolean {
  const platform = deps.platform ?? process.platform;
  const env = deps.env ?? process.env;
  const has = deps.hasCommand ?? defaultHasCommand;
  const run = deps.run ?? defaultRun;

  if (platform === 'darwin') {
    return run('osascript', [
      '-e',
      'tell application "System Events" to keystroke "v" using command down',
    ]);
  }
  if (platform === 'win32') {
    if (deps.win32Titles && deps.win32Titles.length > 0) {
      // RC49: same foreground-first targeting the submit keystroke uses.
      // RC52: the targeted script's Add-Type can take >8 s on a COLD first run
      // (measured on the Windows tester); defaultRun's 3 s ceiling would kill
      // every cold paste. Injected `run` (tests) keeps the plain seam; the
      // production path spawns with the shared 20 s ceiling.
      const script = buildWin32KeystrokeScript(deps.win32Titles, '^v');
      if (deps.run) return deps.run('powershell', ['-NoProfile', '-Command', script]);
      try {
        return spawnSync('powershell', ['-NoProfile', '-Command', script], {
          stdio: 'ignore', timeout: WIN32_KEYSTROKE_TIMEOUT_MS,
        }).status === 0;
      } catch {
        return false;
      }
    }
    return run('powershell', [
      '-NoProfile', '-Command',
      '$w=New-Object -ComObject WScript.Shell;$w.SendKeys("^v")',
    ]);
  }
  // Linux (X11 / Wayland-with-tool)
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return false;
  if (has('xdotool')) return run('xdotool', ['key', '--clearmodifiers', 'ctrl+v']);
  if (has('wtype')) return run('wtype', ['-M', 'ctrl', 'v', '-m', 'ctrl']);
  if (has('ydotool')) return run('ydotool', ['key', '29:1', '47:1', '47:0', '29:0']); // ctrl+v
  return false;
}
