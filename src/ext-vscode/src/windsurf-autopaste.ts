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
import { buildWin32KeystrokeScript, WIN32_KEYSTROKE_TIMEOUT_MS, win32HelperAssemblyPath } from './submit-clipboard-delivery.js';
import { activateDarwinApp, activateDarwinAppWindow } from './darwin-focus.js';
import {
  parseWmctrlList,
  rankEditorWindows,
  type EditorWindowTarget,
} from './editor-window-target.js';

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
  /** Capture `cmd args` stdout, or null on any failure (test seam). */
  runCapture?: (cmd: string, args: string[]) => string | null;
  /** Settle before the post-raise check (test seam; defaults to WINDOW_RAISE_SETTLE_MS). */
  settle?: (ms: number) => void;
  /**
   * RC73: identify WHICH window of this editor to raise (`env.appName` +
   * `workspace.name`). Set ⇒ the Linux raise names one window id instead of a
   * WM_CLASS. Absent ⇒ the pre-RC73 class raise, byte-identical.
   */
  windowTarget?: EditorWindowTarget;
}

/**
 * RC73: `wmctrl -i -a` returns BEFORE the window manager has switched the active window —
 * measured live on this Ubuntu/GNOME box: reading the active title straight after the call
 * still reported the previous window, and the raise landed a moment later. So the check
 * below settles first. Synchronous by necessity (the whole keystroke path is sync) and
 * without spawning anything.
 */
export const WINDOW_RAISE_SETTLE_MS = 120;
/** How many settles to wait for the WM to report the intended window as active. */
export const WINDOW_RAISE_CONFIRM_ATTEMPTS = 5;

function sleepSync(ms: number): void {
  if (!(ms > 0)) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const until = Date.now() + ms;
    while (Date.now() < until) { /* last-resort spin; only if SharedArrayBuffer is unavailable */ }
  }
}

/** Capture a command's stdout (trimmed), or null on any failure. */
function defaultRunCapture(cmd: string, args: string[]): string | null {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 3000 });
    if (r.status !== 0) return null;
    return (r.stdout ?? '').trim() || null;
  } catch {
    return null;
  }
}

/**
 * RC73 — raise ONE named window instead of "any window of this class".
 *
 * Returns true only when a window we identified as ours was activated; false hands the
 * caller back to the class raise, so a machine without `wmctrl -lx`, an unparseable
 * listing, or a title we cannot attribute all behave exactly as they did before.
 *
 * The post-raise check is deliberately lenient: an unreadable active title is accepted
 * (`xdotool` absent is normal), and only a title belonging to a DIFFERENT candidate of
 * ours is treated as "the raise did not take", which moves on to the next candidate.
 */
function raiseTargetedLinuxWindow(
  classNeedles: readonly string[],
  target: EditorWindowTarget,
  deps: AutoPasteDeps,
): boolean {
  const has = deps.hasCommand ?? defaultHasCommand;
  const run = deps.run ?? defaultRun;
  const runCapture = deps.runCapture ?? defaultRunCapture;
  if (!has('wmctrl')) return false;
  const ranked = rankEditorWindows(parseWmctrlList(runCapture('wmctrl', ['-lx'])), {
    ...target,
    classNeedles,
  });
  if (ranked.length === 0) return false;
  const settle = deps.settle ?? sleepSync;
  // Only ONE window of this editor: there is nothing to disambiguate, so raise it and
  // return — the same single call the class raise made, with no added wait. This keeps the
  // ordinary "one window, project open" case (verified working by the owner before RC73)
  // byte-for-byte as cheap as it was.
  if (ranked.length === 1) return run('wmctrl', ['-i', '-a', ranked[0]!.id]);
  for (const w of ranked) {
    // Only a REFUSED activation moves on; the id is the whole point of RC73.
    if (!run('wmctrl', ['-i', '-a', w.id])) continue;
    if (!has('xdotool')) return true;
    for (let attempt = 0; attempt < WINDOW_RAISE_CONFIRM_ATTEMPTS; attempt += 1) {
      settle(WINDOW_RAISE_SETTLE_MS);
      const active = runCapture('xdotool', ['getactivewindow', 'getwindowname']);
      if (active === null) return true;                        // cannot verify ⇒ trust the raise
      if (active.trim() === w.title.trim()) return true;       // confirmed, safe to type
    }
    // ⚠ Accepted but not observed switching in time. Measured live: a slow WM still
    // reported the PREVIOUS window after one settle, and an earlier version of this loop
    // read that as "the raise failed" and activated the next candidate — re-creating the
    // exact wrong-window bug RC73 exists to remove. Never raise a different window here.
    return true;
  }
  return false;
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
  const run = deps.run ?? defaultRun;
  // RC59: rebranded hosts (Devin) carry their own WM_CLASS — try every
  // candidate until one raises. A single string keeps the old behaviour.
  const candidates = typeof appClass === 'string' ? [appClass] : appClass;
  // F-9 (2026-09-07): macOS had no targeting at all — ⌘V and Enter went to
  // whatever was frontmost after the CLI popup's Terminal window closed. Bring
  // the first RUNNING candidate process to the front through System Events
  // (see darwin-focus.ts); `false` when none runs, and the paste still proceeds
  // exactly as before. win32 stays a no-op (RC49 targets inside its script).
  // RC74 (macOS): raise this host's own window when we can name it; otherwise front the app.
  if (platform === 'darwin') {
    return deps.windowTarget
      ? activateDarwinAppWindow(candidates, deps.windowTarget.workspaceName, { run })
      : activateDarwinApp(candidates, { run });
  }
  if (platform !== 'linux') return false;
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return false;
  const has = deps.hasCommand ?? defaultHasCommand;
  // RC73: name the window when the caller told us which one is ours; the class raise
  // below stays the fallback (and the only path when no target is supplied).
  if (deps.windowTarget && raiseTargetedLinuxWindow(candidates, deps.windowTarget, deps)) return true;
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
      // RC72: the cached user32 helper (see win32HelperPrelude) — no per-keystroke compile.
      const script = buildWin32KeystrokeScript(deps.win32Titles, '^v', { helperDll: win32HelperAssemblyPath(env), target: deps.windowTarget });
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
