/** ⭐ RC62 — expiry reap takes the popup's terminal, not just the stop process. */
import { describe, it, expect, vi } from 'vitest';
import { killProcessTree } from './kill-tree.js';

const fakeChild = (pid: number | undefined) => {
  const kill = vi.fn();
  return { child: { pid, kill } as never, kill };
};

describe('⭐ RC62 — killProcessTree', () => {
  it('⭐ win32 uses taskkill /T /F on the child pid (tree incl. the start-window)', () => {
    const calls: string[][] = [];
    const { child } = fakeChild(4242);
    killProcessTree(child, { platform: 'win32', runSync: (c, a) => { calls.push([c, ...a]); return {}; } });
    expect(calls).toEqual([['taskkill', '/PID', '4242', '/T', '/F']]);
  });

  it('⭐ posix kills descendants (children-first) then the child itself', () => {
    const killed: number[] = [];
    const { child, kill } = fakeChild(100);
    killProcessTree(child, {
      platform: 'linux',
      runSync: (_c, a) => {
        const p = a[1];
        if (p === '100') return { stdout: '200\n' };
        if (p === '200') return { stdout: '300\n' };  // popup terminal under stop's child
        return { stdout: '' };
      },
      killFn: (pid) => killed.push(pid),
    });
    expect(killed).toEqual([300, 200]);   // grandchild before child
    expect(kill).toHaveBeenCalled();       // the stop child last
  });

  it('no child ⇒ no-op; no pid ⇒ falls back to plain kill (pre-RC62 behaviour)', () => {
    expect(() => killProcessTree(null)).not.toThrow();
    const { child, kill } = fakeChild(undefined);
    killProcessTree(child);
    expect(kill).toHaveBeenCalled();
  });

  it('a throwing runner still falls back to plain kill (fail-open reap)', () => {
    const { child, kill } = fakeChild(7);
    killProcessTree(child, { platform: 'linux', runSync: () => { throw new Error('no pgrep'); } });
    expect(kill).toHaveBeenCalled();
  });
});

/**
 * ⭐ RC68 — the reap reaches the popup HOST on Linux/macOS, where it lives
 * outside stop's process tree (gnome-terminal-server / Terminal.app). Measured
 * live (Experiment A): the RC62 tree kill left the host alive and the window
 * open. The host is found through the launcher's temp-dir marker in the tree's
 * argv, killed FIRST (so the terminal closes itself), then the tree is reaped
 * as before, then the temp dir (prompt content) is removed.
 */
import { extractPopupHostMarkers, POPUP_HOST_SETTLE_MS } from './kill-tree.js';

describe('⭐ RC68 — killProcessTree reaches the out-of-tree popup host', () => {
  const MARKER = 'nexpath-pe-popup-host-38f154e9-6ae3-4240-a85a-2d6b179a1354';
  const HOST_ARGV = `/usr/bin/node /x/dist/cli/index.js prompt-enhancement-popup-host --input-file /tmp/${MARKER}/input.json --result-file /tmp/${MARKER}/result.json --db /home/u/.nexpath/prompt-store.db`;
  const GT_ARGV = `/usr/bin/gnome-terminal.real --wait --title=Nexpath -- ${HOST_ARGV}`;

  it('extractPopupHostMarkers: unique markers only; none ⇒ []', () => {
    expect(extractPopupHostMarkers(GT_ARGV)).toEqual([MARKER]);
    expect(extractPopupHostMarkers('node index.js stop')).toEqual([]);
    expect(extractPopupHostMarkers(`sh '/var/folders/zz/T/${MARKER}/launch.sh'; exit`)).toEqual([MARKER]); // macOS AppleScript argv
  });

  it('⭐ linux: host (out of tree) is killed FIRST, then settle, then the tree children-first, then the child; temp dir removed', () => {
    const order: string[] = [];
    const { child, kill } = fakeChild(100);
    (kill as ReturnType<typeof vi.fn>).mockImplementation(() => { order.push('child.kill'); });
    killProcessTree(child, {
      platform: 'linux',
      runSync: (_c, a) => {                         // pgrep -P walk: 100 → 200 (gnome-terminal client) → 300 (.real)
        if (a[0] === '-P' && a[1] === '100') return { stdout: '200\n' };
        if (a[0] === '-P' && a[1] === '200') return { stdout: '300\n' };
        return { stdout: '' };
      },
      readArgvFn: (pid) => (pid === 200 || pid === 300 ? GT_ARGV
        : pid === 9999 ? HOST_ARGV
        : pid === 7777 ? `tail -f /tmp/${MARKER}/result.json`   // bystander: marker but NOT the host command
        : 'node index.js stop'),
      findByMarkerFn: (m) => (m === MARKER ? [200, 300, 9999, 7777] : []), // 9999 = the host under gnome-terminal-server
      killFn: (pid) => order.push(`kill:${pid}`),
      sleepFn: (ms) => order.push(`sleep:${ms}`),
      removeDirFn: (p) => order.push(`rm:${p}`),
      tmpDir: '/tmp',
    });
    expect(order).toEqual([
      'kill:9999',                       // host first — in-tree matches (200/300) are NOT double-killed here; bystander 7777 untouched
      `sleep:${POPUP_HOST_SETTLE_MS}`,   // the terminal gets to close itself
      'kill:300', 'kill:200',            // RC62 reap, children before parent
      'child.kill',
      `rm:/tmp/${MARKER}`,               // prompt-content temp dir gone
    ]);
  });

  it('⭐ no marker anywhere ⇒ byte-identical RC62 behaviour (no pgrep -f, no sleep, no rm)', () => {
    const order: string[] = [];
    const findByMarkerFn = vi.fn(() => [] as number[]);
    const { child, kill } = fakeChild(100);
    (kill as ReturnType<typeof vi.fn>).mockImplementation(() => { order.push('child.kill'); });
    killProcessTree(child, {
      platform: 'linux',
      runSync: (_c, a) => (a[0] === '-P' && a[1] === '100' ? { stdout: '200\n' } : { stdout: '' }),
      readArgvFn: () => 'node /x/dist/cli/index.js stop',
      findByMarkerFn,
      killFn: (pid) => order.push(`kill:${pid}`),
      sleepFn: () => order.push('sleep'),
      removeDirFn: () => order.push('rm'),
    });
    expect(findByMarkerFn).not.toHaveBeenCalled();
    expect(order).toEqual(['kill:200', 'child.kill']);
  });

  it('argv/pgrep failures never stop the reap (fail-open)', () => {
    const order: string[] = [];
    const { child, kill } = fakeChild(100);
    (kill as ReturnType<typeof vi.fn>).mockImplementation(() => { order.push('child.kill'); });
    killProcessTree(child, {
      platform: 'linux',
      runSync: (_c, a) => (a[0] === '-P' && a[1] === '100' ? { stdout: '200\n' } : { stdout: '' }),
      readArgvFn: () => { throw new Error('ps missing'); },
      findByMarkerFn: () => { throw new Error('pgrep missing'); },
      killFn: (pid) => order.push(`kill:${pid}`),
      sleepFn: () => order.push('sleep'),
      removeDirFn: () => order.push('rm'),
    });
    expect(order).toEqual(['kill:200', 'child.kill']);
  });

  it('own pid is never killed even if it matches the marker', () => {
    const killed: number[] = [];
    const { child } = fakeChild(100);
    killProcessTree(child, {
      platform: 'linux',
      runSync: () => ({ stdout: '' }),
      readArgvFn: (pid) => (pid === 100 ? GT_ARGV : HOST_ARGV),
      findByMarkerFn: () => [process.pid, 4242],
      killFn: (pid) => killed.push(pid),
      sleepFn: () => {}, removeDirFn: () => {},
    });
    expect(killed).toEqual([4242]);
  });
});
