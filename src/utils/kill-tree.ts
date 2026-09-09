/**
 * RC62 (Windows/Devin staging tester, 2026-08-24 — second live hit of the H4
 * orphan-window mode): when the hold budget expires with a popup unanswered,
 * the hook fails open (the prompt runs — correct) and reaps the `stop` child —
 * but a plain `child.kill()` leaves the popup's TERMINAL alive: on win32 the
 * console window `cmd start` opened, on Linux the gnome-terminal tab. The
 * user then sees a live-looking popup whose Enter does nothing.
 *
 * Kill the DESCENDANT TREE instead — used ONLY on the already-failed expiry
 * paths, so the normal flow is untouched by construction. Everything is
 * best-effort and swallowed: reaping must never break the fail-open exit.
 *
 * ── RC68 (2026-09-05, whole-repo read + live Experiments A/B2) ──────────────
 * The tree walk reaches the popup ONLY on Windows (`taskkill /T` follows the
 * `start /WAIT` chain). On Linux the popup host runs under gnome-terminal-server
 * — NOT under the `--wait` client that is stop's child — and on macOS it runs
 * under Terminal.app while stop's child is the osascript that would close the
 * window only AFTER the host exits. Measured on Ubuntu (GNOME Terminal 3.44):
 * the tree kill took the client and left the host alive and the window open.
 * Worse than cosmetic: that host still held the store open, and its later
 * close-write reverted every store write made meanwhile (Experiment B2).
 *
 * The host IS reachable from stop's own descendants: their argv carries the
 * launcher's private temp dir, `nexpath-pe-popup-host-<uuid>` — the
 * gnome-terminal client holds the full host command line, osascript's
 * AppleScript holds the launcher path. So the reap now (1) reads the tree's
 * argv and extracts the marker(s), (2) `pgrep -f`s the host(s) by marker and
 * kills them FIRST — the terminal then closes itself (a gnome-terminal tab ends
 * with its command; the AppleScript sees the popup exit), (3) pauses briefly
 * for that, (4) reaps the tree exactly as RC62 did, (5) removes the temp dir —
 * the launcher's own cleanup sits in a `finally` that never runs when stop is
 * killed, so prompt content used to outlive every expiry on disk. No marker
 * ⇒ byte-identical RC62 behaviour; win32 is untouched.
 */
import { spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';

/** The launcher's private temp-dir name (`prompt-enhancement-host.ts` makeTempDir) — the marker. */
export const POPUP_HOST_TEMP_DIR_RE = /nexpath-pe-popup-host-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
/** How long the terminal gets to close itself after its host is gone, before the tree reap. */
export const POPUP_HOST_SETTLE_MS = 300;
/**
 * The host's own subcommand. A marker match alone is NOT enough to kill: any
 * process whose command line merely mentions the temp dir (a developer's
 * `tail -f` on the result file, a shell running a script that names the path —
 * live-hit during RC68's own verification, where the reap killed the shell that
 * was running it) would be a bystander. The popup host is the one process whose
 * argv carries BOTH the marker and this subcommand.
 */
export const POPUP_HOST_COMMAND = 'prompt-enhancement-popup-host';

export interface KillProcessTreeDeps {
  platform?: NodeJS.Platform;
  runSync?: (cmd: string, args: string[]) => { stdout?: string | null };
  killFn?: (pid: number) => void;
  /** RC68: argv of one pid (default `ps -o args= -p <pid>`); '' when unreadable. */
  readArgvFn?: (pid: number) => string;
  /** RC68: pids whose argv contains the marker (default `pgrep -f <marker>`). */
  findByMarkerFn?: (marker: string) => number[];
  /** RC68: remove the launcher's temp dir (default rmSync recursive+force). */
  removeDirFn?: (path: string) => void;
  /** RC68: synchronous pause so the terminal can close itself (default Atomics.wait). */
  sleepFn?: (ms: number) => void;
  /** RC68: base of the temp dir (default os.tmpdir()). */
  tmpDir?: string;
}

/** Unique popup-host temp-dir markers found in an argv string. */
export function extractPopupHostMarkers(argv: string): string[] {
  return Array.from(new Set(argv.match(POPUP_HOST_TEMP_DIR_RE) ?? []));
}

function defaultSleep(ms: number): void {
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch { /* never block the reap on a sleep */ }
}

export function killProcessTree(
  child: ChildProcess | null | undefined,
  deps: KillProcessTreeDeps = {},
): void {
  if (!child) return;
  if (typeof child.pid !== 'number') {
    // No pid to walk (already-reaped or synthetic child) — plain kill is all
    // that is possible and all that was ever done here before RC62.
    try { child.kill(); } catch { /* already gone */ }
    return;
  }
  const platform = deps.platform ?? process.platform;
  const runSync = deps.runSync ?? ((cmd: string, args: string[]) => {
    try { return spawnSync(cmd, args, { encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch { return { stdout: null }; }
  });
  const kill = deps.killFn ?? ((pid: number) => { try { process.kill(pid); } catch { /* gone */ } });
  const parsePids = (out: string | null | undefined): number[] =>
    (out ?? '').split('\n').map((l) => parseInt(l.trim(), 10)).filter((n) => Number.isFinite(n) && n > 1);
  try {
    if (platform === 'win32') {
      // taskkill /T takes the whole tree — the start-window console included.
      runSync('taskkill', ['/PID', String(child.pid), '/T', '/F']);
      return;
    }
    // POSIX: walk descendants via pgrep -P (depth-first), children before parent.
    const collect = (pid: number, depth: number): number[] => {
      if (depth > 6) return [];
      const kids = parsePids(runSync('pgrep', ['-P', String(pid)]).stdout);
      return kids.flatMap((k) => [...collect(k, depth + 1), k]);
    };
    const tree = collect(child.pid, 0);

    // RC68 (1)+(2): the popup host lives OUTSIDE this tree on Linux/macOS —
    // find it through the marker its launcher left in the tree's argv.
    const readArgv = deps.readArgvFn ?? ((pid: number) => runSync('ps', ['-o', 'args=', '-p', String(pid)]).stdout ?? '');
    const findByMarker = deps.findByMarkerFn ?? ((marker: string) => parsePids(runSync('pgrep', ['-f', marker]).stdout));
    const markers = new Set<string>();
    for (const pid of [child.pid, ...tree]) {
      try { for (const m of extractPopupHostMarkers(readArgv(pid))) markers.add(m); } catch { /* unreadable argv — skip */ }
    }
    if (markers.size > 0) {
      const inTree = new Set<number>([child.pid, ...tree]);
      let killedHost = false;
      for (const marker of markers) {
        let hosts: number[] = [];
        try { hosts = findByMarker(marker); } catch { hosts = []; }
        for (const pid of hosts) {
          if (pid === process.pid || inTree.has(pid)) continue; // the tree is reaped below
          let argv = '';
          try { argv = readArgv(pid); } catch { argv = ''; }
          if (!argv.includes(POPUP_HOST_COMMAND)) continue;    // bystander that only mentions the path
          kill(pid);
          killedHost = true;
        }
      }
      // RC68 (3): let the terminal notice its command is gone and close itself
      // (gnome-terminal tab / Terminal.app window via the AppleScript's wait).
      if (killedHost) (deps.sleepFn ?? defaultSleep)(POPUP_HOST_SETTLE_MS);
    }

    // RC68 (4): the RC62 reap, unchanged — children before parent, then the child.
    for (const pid of tree) kill(pid);
    try { child.kill(); } catch { /* already gone */ }

    // RC68 (5): the launcher's temp dir (input.json carries the prompt text)
    // outlives a killed stop — its cleanup is in a `finally` that never ran.
    const removeDir = deps.removeDirFn ?? ((p: string) => rmSync(p, { recursive: true, force: true }));
    const base = deps.tmpDir ?? tmpdir();
    for (const marker of markers) {
      // This branch is POSIX-only (win32 reaps with taskkill above), so the temp-dir path is
      // built with posix semantics regardless of the host running it (a Windows test runner
      // would otherwise join with backslashes).
      try { removeDir(posix.join(base, marker)); } catch { /* best-effort */ }
    }
  } catch {
    try { child.kill(); } catch { /* already gone */ }
  }
}
