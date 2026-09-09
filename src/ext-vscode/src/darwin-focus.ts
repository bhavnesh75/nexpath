/**
 * F-9 (2026-09-05) — darwin foreground targeting for the submit-time keystrokes.
 *
 * ── WHY ───────────────────────────────────────────────────────────────────────
 * Every synthetic keystroke goes to whatever is FRONTMOST. Linux got the RC11
 * whitelist (Enter only when the editor window is focused, after one raise);
 * Windows got RC28/RC49 (`AppActivate`, foreground-first). macOS had neither:
 * `raiseAppWindow` is X11-only and `focusedWindowIsEditor` returned `true`
 * unconditionally off Linux, so after the CLI popup's Terminal window closed,
 * ⌘V and Enter were fired blind — into the editor if macOS happened to hand
 * focus back to it, into anything else otherwise (the RC11 hazard).
 *
 * ── HOW ───────────────────────────────────────────────────────────────────────
 * Everything goes through System Events, which the keystroke already needs
 * (Accessibility, RC16). We never `tell application "<name>"` by name: a name
 * that is not installed makes osascript raise the blocking "Where is …?"
 * chooser. Referring to a running *process* instead simply errors when absent,
 * which the script catches. Candidates are tried in order — the live
 * `vscode.env.appName` first (rebrands: "Devin", "Devin Next"), then the bare
 * product names — the same rule RC47 established for Windows.
 *
 * Pure over its seams: no Mac was available to run this, so the script text,
 * candidate order and the frontmost match are pinned; the osascript calls are
 * the same shape `submitKeystroke` already uses on darwin.
 */
import { spawnSync } from 'node:child_process';

export interface DarwinFocusDeps {
  /** Run and report success (exit 0). Defaults to a 3 s-bounded spawnSync. */
  run?: (cmd: string, args: string[]) => boolean;
  /** Run and capture trimmed stdout, or null on failure. Defaults to a 3 s-bounded spawnSync. */
  runCapture?: (cmd: string, args: string[]) => string | null;
}

/** The live appName first, then the host's product names — deduped, trimmed, non-empty. */
export function darwinAppCandidates(appName: string | undefined, host: 'windsurf' | 'cursor'): string[] {
  const product = host === 'cursor' ? ['Cursor'] : ['Devin', 'Windsurf'];
  const out: string[] = [];
  for (const c of [appName?.trim(), ...product]) {
    if (c && !out.some((o) => o.toLowerCase() === c.toLowerCase())) out.push(c);
  }
  return out;
}

const quote = (s: string): string => `"${s.replace(/["\\]/g, '')}"`;

/** AppleScript: bring the first RUNNING candidate process to the front; error when none is running. */
export function buildDarwinActivateScript(candidates: readonly string[]): string {
  const list = candidates.map(quote).join(', ');
  return [
    'tell application "System Events"',
    `  repeat with n in {${list}}`,
    // `whose name is` uses AppleScript's default case-insensitive comparison, so
    // the lowercase X11 class names the extension already passes ('cursor',
    // 'devin', 'windsurf') match the real process names ("Cursor", …).
    '    if exists (first application process whose name is (n as text)) then',
    '      set frontmost of (first application process whose name is (n as text)) to true',
    '      return (n as text)',
    '    end if',
    '  end repeat',
    'end tell',
    'error "nexpath: editor process not running"',
  ].join('\n');
}

/** AppleScript: the name of the frontmost application process. */
/**
 * RC74 (macOS) — raise ONE window of the editor, not just the application.
 *
 * `buildDarwinActivateScript` fronts the PROCESS, so on a Mac with two editor windows open
 * macOS restores whichever window that app last had in front — the same wrong-window defect
 * measured on Linux, where the class raise always took the first window and the paste and
 * Enter landed in a chat the user was not watching.
 *
 * Unlike Linux and Windows we do not need the app name in the title: the search is already
 * scoped to this editor's process, so the workspace name alone identifies the window. Every
 * step is guarded by `exists`, and the script `error`s when no window matches, which the
 * caller reads as "front the application instead" — i.e. exactly today's behaviour.
 *
 * ⚠ NOT EXECUTED ON macOS by the author. Written so that any failure is inert.
 */
export function buildDarwinActivateWindowScript(
  candidates: readonly string[],
  windowNeedle: string,
): string {
  const list = candidates.map(quote).join(', ');
  return [
    'tell application "System Events"',
    `  repeat with n in {${list}}`,
    '    if exists (first application process whose name is (n as text)) then',
    '      set p to first application process whose name is (n as text)',
    `      if exists (first window of p whose name contains ${quote(windowNeedle)}) then`,
    `        perform action "AXRaise" of (first window of p whose name contains ${quote(windowNeedle)})`,
    '        set frontmost of p to true',
    '        return (n as text)',
    '      end if',
    '    end if',
    '  end repeat',
    'end tell',
    'error "nexpath: no editor window matching this workspace"',
  ].join('\n');
}

/**
 * Raise this host's own window when we can name it, otherwise front the application exactly
 * as the shipped path does. True when either step reported success.
 */
export function activateDarwinAppWindow(
  candidates: readonly string[],
  windowNeedle: string | undefined,
  deps: DarwinFocusDeps = {},
): boolean {
  if (candidates.length === 0) return false;
  const run = deps.run ?? defaultRun;
  const needle = windowNeedle?.trim();
  if (needle && run('osascript', ['-e', buildDarwinActivateWindowScript(candidates, needle)])) return true;
  return activateDarwinApp(candidates, deps);
}

export const DARWIN_FRONTMOST_SCRIPT =
  'tell application "System Events" to get name of first application process whose frontmost is true';

function defaultRun(cmd: string, args: string[]): boolean {
  try { return spawnSync(cmd, args, { stdio: 'ignore', timeout: 3000 }).status === 0; } catch { return false; }
}
function defaultRunCapture(cmd: string, args: string[]): string | null {
  try {
    const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000, encoding: 'utf8' });
    return r.status === 0 ? String(r.stdout ?? '').trim() : null;
  } catch { return null; }
}

/** Activate the first running candidate. `false` when none is running or osascript fails — never throws. */
export function activateDarwinApp(candidates: readonly string[], deps: DarwinFocusDeps = {}): boolean {
  if (candidates.length === 0) return false;
  return (deps.run ?? defaultRun)('osascript', ['-e', buildDarwinActivateScript(candidates)]);
}

/** The frontmost process name, or null when it cannot be read (no Accessibility, no osascript). */
export function frontmostDarwinApp(deps: DarwinFocusDeps = {}): string | null {
  const name = (deps.runCapture ?? defaultRunCapture)('osascript', ['-e', DARWIN_FRONTMOST_SCRIPT]);
  return name ? name.trim() : null;
}

/**
 * Is one of our candidates frontmost? Case-insensitive; a candidate may be a
 * prefix of the process name (rebrands add suffixes) but never a substring of
 * an unrelated app. `null` frontmost (cannot read) ⇒ `false`: a keystroke we
 * cannot target must not fire — the caller reports `submit_failed` and the
 * one-time hint tells the user to press Enter themselves (RC16/F-3).
 */
export function darwinEditorIsFrontmost(candidates: readonly string[], deps: DarwinFocusDeps = {}): boolean {
  const front = frontmostDarwinApp(deps);
  if (!front) return false;
  const f = front.toLowerCase();
  return candidates.some((c) => {
    const k = c.trim().toLowerCase();
    return k.length > 0 && (f === k || f.startsWith(k + ' ') || f.startsWith(k + '-'));
  });
}
