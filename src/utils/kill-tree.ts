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
 */
import { spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';

export function killProcessTree(
  child: ChildProcess | null | undefined,
  deps: {
    platform?: NodeJS.Platform;
    runSync?: (cmd: string, args: string[]) => { stdout?: string | null };
    killFn?: (pid: number) => void;
  } = {},
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
  try {
    if (platform === 'win32') {
      // taskkill /T takes the whole tree — the start-window console included.
      runSync('taskkill', ['/PID', String(child.pid), '/T', '/F']);
      return;
    }
    // POSIX: walk descendants via pgrep -P (depth-first), children before parent.
    const collect = (pid: number, depth: number): number[] => {
      if (depth > 6) return [];
      const out = runSync('pgrep', ['-P', String(pid)]).stdout ?? '';
      const kids = out.split('\n').map((l) => parseInt(l.trim(), 10)).filter((n) => Number.isFinite(n) && n > 1);
      return kids.flatMap((k) => [...collect(k, depth + 1), k]);
    };
    for (const pid of collect(child.pid, 0)) kill(pid);
    try { child.kill(); } catch { /* already gone */ }
  } catch {
    try { child.kill(); } catch { /* already gone */ }
  }
}
