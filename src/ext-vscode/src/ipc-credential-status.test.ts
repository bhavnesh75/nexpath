/** `spawnCredentialStatus` — one JSON line in, `{source, configured}` out; null on anything else. */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawnCredentialStatus, CREDENTIAL_STATUS_TIMEOUT_MS } from './ipc.js';

function fakeChild(script: (child: FakeChild) => void) {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(), stderr: new EventEmitter(), pid: 4242,
    kill: vi.fn(), stdin: undefined,
  });
  setTimeout(() => script(child), 0);
  return child;
}
type FakeChild = ReturnType<typeof fakeChild>;
const spawnWith = (script: (c: FakeChild) => void) => {
  const spawnFn = vi.fn(() => fakeChild(script));
  return { spawnFn: spawnFn as never, calls: spawnFn.mock.calls as unknown as Array<[string, string[], Record<string, unknown>]> };
};

describe('spawnCredentialStatus', () => {
  it('⭐ spawns `credential-status` with piped stdout only and parses the JSON line', async () => {
    const s = spawnWith((c) => { c.stdout.emit('data', Buffer.from('{"source":"nexpath_token","configured":true}\n')); c.emit('close', 0); });
    const r = await spawnCredentialStatus({ cwd: '/proj', binaryPath: '/bin/nexpath', spawnFn: s.spawnFn });
    expect(r).toEqual({ source: 'nexpath_token', configured: true });
    const [, args, opts] = s.calls[0]!;
    expect(args).toContain('credential-status');
    expect(opts.stdio).toEqual(['ignore', 'pipe', 'ignore']);
    expect(opts.cwd).toBe('/proj');
  });
  it('uses the LAST line (a chatty CLI may print warnings first) and tolerates chunked output', async () => {
    const s = spawnWith((c) => {
      c.stdout.emit('data', Buffer.from('warning: something\n{"source":"no'));
      c.stdout.emit('data', Buffer.from('ne","configured":false}\n'));
      c.emit('close', 0);
    });
    expect(await spawnCredentialStatus({ binaryPath: '/bin/nexpath', spawnFn: s.spawnFn })).toEqual({ source: 'none', configured: false });
  });
  it('⭐ non-zero exit, garbage, wrong shape, spawn error ⇒ null (never a false "no credential")', async () => {
    const nonZero = spawnWith((c) => { c.stdout.emit('data', Buffer.from('{"source":"none","configured":false}')); c.emit('close', 1); });
    expect(await spawnCredentialStatus({ binaryPath: '/x', spawnFn: nonZero.spawnFn })).toBeNull();
    const garbage = spawnWith((c) => { c.stdout.emit('data', Buffer.from('not json')); c.emit('close', 0); });
    expect(await spawnCredentialStatus({ binaryPath: '/x', spawnFn: garbage.spawnFn })).toBeNull();
    const shape = spawnWith((c) => { c.stdout.emit('data', Buffer.from('{"configured":"yes"}')); c.emit('close', 0); });
    expect(await spawnCredentialStatus({ binaryPath: '/x', spawnFn: shape.spawnFn })).toBeNull();
    const errored = spawnWith((c) => { c.emit('error', new Error('ENOENT')); });
    expect(await spawnCredentialStatus({ binaryPath: '/x', spawnFn: errored.spawnFn })).toBeNull();
    const throwing = { spawnFn: (() => { throw new Error('spawn threw'); }) as never };
    expect(await spawnCredentialStatus({ binaryPath: '/x', spawnFn: throwing.spawnFn })).toBeNull();
  });
  it('⭐ a child that never answers is killed at the bound and resolves null', async () => {
    vi.useFakeTimers();
    try {
      let child: FakeChild | null = null;
      const spawnFn = vi.fn(() => { child = fakeChild(() => { /* never closes */ }); return child; }) as never;
      const p = spawnCredentialStatus({ binaryPath: '/x', spawnFn });
      await vi.advanceTimersByTimeAsync(CREDENTIAL_STATUS_TIMEOUT_MS + 1);
      expect(await p).toBeNull();
      expect(child!.kill).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
});
