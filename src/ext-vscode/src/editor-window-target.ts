/**
 * RC73 — WHICH editor window a synthetic keystroke must be aimed at.
 *
 * ⚠ LIVE ROOT CAUSE (owner report + `wmctrl -lx` capture, 2026-09-07, Ubuntu/Cursor).
 * The delivery raise was `wmctrl -x -a <class>`, which activates the FIRST window whose
 * WM_CLASS matches — with two Cursor windows open:
 *
 *     0x03800004  cursor.Cursor  "nexpath - Cursor"   <- an older project window
 *     0x0380002f  cursor.Cursor  "Cursor"             <- the window the prompt came from
 *
 * the raise took the project window every time. The right window had already claimed the
 * decision and focused its own composer, but the OS focus was on the other one, so the
 * Ctrl+V and the Enter landed in a chat the user was not looking at: "old cursor opened
 * automatically … i did not see any inject back or auto submit".
 *
 * So the raise must name ONE window, not a class. VS Code/Cursor/Windsurf title their
 * windows `<file> - <folder> - <appName>` (a folder-less window is just `<appName>`, and
 * `<file> - <appName>` with a file open), and the delivering extension host knows its own
 * `workspace.name` and `env.appName`. That pair identifies its window in the WM listing,
 * and `wmctrl -i -a <id>` then raises exactly that one.
 *
 * Pure on purpose: every function here is string-in/number-out so the ranking is pinned
 * without a window manager, and the one impure step (running `wmctrl`) stays a seam in
 * `windsurf-autopaste.ts`.
 */

/** One row of `wmctrl -lx`: `<id> <desktop> <wm_class> <client host> <title…>`. */
export interface X11Window {
  id: string;
  wmClass: string;
  title: string;
}

/**
 * Parse `wmctrl -lx`. The title is the remainder of the line (it contains spaces, and on
 * some builds a dash), so the split is bounded to the four fixed columns. Rows that are
 * short, blank, or not window ids are dropped rather than guessed at.
 */
export function parseWmctrlList(stdout: string | null | undefined): X11Window[] {
  const out: X11Window[] = [];
  for (const line of String(stdout ?? '').split('\n')) {
    const row = line.trimEnd();
    if (!row.trim()) continue;
    const m = /^(0x[0-9a-fA-F]+)\s+(-?\d+)\s+(\S+)\s+(\S+)\s?(.*)$/.exec(row);
    if (!m) continue;
    out.push({ id: m[1]!, wmClass: m[3]!, title: (m[5] ?? '').trim() });
  }
  return out;
}

export interface EditorWindowTarget {
  /** `vscode.env.appName` — "Cursor", "Windsurf", "Devin", a rebrand… */
  appName?: string;
  /** `vscode.workspace.name` — the folder/workspace segment of the title; absent for a folder-less window. */
  workspaceName?: string;
}

/**
 * How well a window title identifies THIS extension host's window. Higher is better;
 * 0 means "not this application at all". Exact titles outrank shapes, and a folder-less
 * host deliberately prefers the bare app name — that is the window in the capture above
 * that the class raise kept missing.
 */
export function scoreEditorWindow(title: string, target: EditorWindowTarget = {}): number {
  const t = String(title ?? '').trim();
  const app = String(target.appName ?? '').trim();
  const ws = String(target.workspaceName ?? '').trim();
  if (!t || !app) return 0;

  // Is this a window of THIS application at all? The same four delimiter-safe shapes the
  // shipped win32 foreground check has accepted since RC60: exact, suffix, prefix, and
  // MID-TITLE — the Devin build titles its window "<folder> - Devin - <session title>",
  // and a suffix-only guard here scored that 0 on the Windows tester's machine (RC74a:
  // `window=0`, so the targeting never engaged). A title with none of these shapes is
  // another application (a browser tab "nexpath - Chrome") or a custom `window.title`;
  // both fall through to the class raise rather than being attributed to us.
  const ofThisApp =
    t === app || t.endsWith(` - ${app}`) || t.endsWith(app) ||
    t.startsWith(`${app} - `) || t.includes(` - ${app} - `);
  if (!ofThisApp) return 0;

  if (ws) {
    if (t === `${ws} - ${app}`) return 100;             // folder open, no editor tab
    if (t.startsWith(`${ws} - ${app} - `)) return 95;   // Devin: "<folder> - Devin - <session>"
    if (t.endsWith(` - ${ws} - ${app}`)) return 90;     // a file open inside that folder
    if (t.includes(` - ${ws} - ${app} - `)) return 85;  // "<file> - <folder> - Devin - <session>"
    if (t.includes(` - ${ws} - `)) return 80;           // custom window.title layouts
    if (t.startsWith(`${ws} - `)) return 75;
    if (t.includes(ws)) return 30;                      // weak: the name appears somewhere
  } else {
    if (t === app) return 100;                          // folder-less window: exactly "Cursor"
    if (t.startsWith(`${app} - `)) return 70;           // folder-less Devin: "Devin - <session>"
    // "file.ts - Cursor" — a folder-less window with a tab open. Two segments only, so a
    // folder window ("nexpath - Cursor") scores here too; it is deliberately below an
    // exact app-name match and above the bare application tier.
    if (t.endsWith(` - ${app}`) && t.split(' - ').length === 2) return 60;
  }
  // Some window of this application, but not identifiable as ours.
  return 10;
}

/**
 * RC75 — the gate every synthetic keystroke passes in the instant before it is sent: is the
 * window in front, right now, THIS host's window? With a workspace name the title must hit
 * one of the identifying tiers (≥ 75); the weak "contains the name somewhere" tier and the
 * bare "some window of this app" tier are refused — a second window of the same editor is
 * exactly the wrong place to type. Without a workspace name the folder-less shapes (100 / 70
 * / 60) count. A title of another application is always refused.
 */
export function isOurWindowTitle(title: string | null | undefined, target: EditorWindowTarget = {}): boolean {
  const score = scoreEditorWindow(String(title ?? ''), target);
  return String(target.workspaceName ?? '').trim() ? score >= 75 : score >= 60;
}

/** True when a WM_CLASS ("cursor.Cursor") matches any of the raise candidates ("cursor", "devin"…). */
export function windowClassMatches(wmClass: string, classNeedles: readonly string[]): boolean {
  const c = String(wmClass ?? '').toLowerCase();
  if (!c) return false;
  return classNeedles.some((n) => {
    const needle = String(n ?? '').trim().toLowerCase();
    return needle.length > 0 && c.includes(needle);
  });
}

/**
 * Windows of this application, best match first. Ties keep the WM's own order (stable),
 * and anything that scores 0 is dropped — we never raise a window that is not this editor.
 */
export function rankEditorWindows(
  windows: readonly X11Window[],
  opts: EditorWindowTarget & { classNeedles: readonly string[] },
): X11Window[] {
  return windows
    .filter((w) => windowClassMatches(w.wmClass, opts.classNeedles))
    .map((w, i) => ({ w, i, score: scoreEditorWindow(w.title, opts) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.i - b.i))
    .map((e) => e.w);
}
