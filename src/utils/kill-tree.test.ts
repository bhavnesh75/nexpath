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
