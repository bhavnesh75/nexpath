import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import { spawnRecordSignal } from './ipc.js';

function makeFakeChild(opts: { exitCode?: number; errorBeforeClose?: Error } = {}) {
  const child = new EventEmitter() as EventEmitter & {
    stdin: Writable;
    stdout: Readable;
    stderr: Readable;
  };
  child.stdin = new Writable({ write(_chunk, _enc, cb) { cb(); } });
  child.stdout = new Readable({ read() {} });
  child.stderr = new Readable({ read() {} });
  queueMicrotask(() => {
    if (opts.errorBeforeClose) { child.emit('error', opts.errorBeforeClose); return; }
    child.emit('close', opts.exitCode ?? 0);
  });
  return child;
}

describe('spawnRecordSignal', () => {
  it('builds the record-signal argv (kind only) and resolves on exit 0', async () => {
    const spawnFn = vi.fn(() => makeFakeChild({ exitCode: 0 }));
    await expect(
      spawnRecordSignal('pe_shorter', { spawnFn: spawnFn as never }),
    ).resolves.toBeUndefined();
    expect(spawnFn).toHaveBeenCalledWith(
      'nexpath',
      ['record-signal', '--kind', 'pe_shorter'],
      expect.any(Object),
    );
  });

  it('includes --db when dbPath is provided', async () => {
    const spawnFn = vi.fn(() => makeFakeChild({ exitCode: 0 }));
    await spawnRecordSignal('pe_close', { spawnFn: spawnFn as never, dbPath: '/tmp/x.db' });
    expect(spawnFn).toHaveBeenCalledWith(
      'nexpath',
      ['record-signal', '--kind', 'pe_close', '--db', '/tmp/x.db'],
      expect.any(Object),
    );
  });

  it('sends NO stdin payload (content-free — only the kind travels in argv)', async () => {
    let written = '';
    const child = makeFakeChild({ exitCode: 0 });
    child.stdin = new Writable({ write(chunk, _enc, cb) { written += chunk.toString(); cb(); } });
    const spawnFn = vi.fn(() => child);
    await spawnRecordSignal('pe_apply_details', { spawnFn: spawnFn as never });
    expect(written).toBe('');
  });

  it('swallows a spawn error and resolves (never rejects)', async () => {
    const spawnFn = vi.fn(() => makeFakeChild({ errorBeforeClose: new Error('ENOENT') }));
    await expect(
      spawnRecordSignal('pe_use_current', { spawnFn: spawnFn as never }),
    ).resolves.toBeUndefined();
  });

  it('swallows a non-zero exit and resolves', async () => {
    const spawnFn = vi.fn(() => makeFakeChild({ exitCode: 1 }));
    await expect(
      spawnRecordSignal('pe_use_original', { spawnFn: spawnFn as never }),
    ).resolves.toBeUndefined();
  });

  it('never throws even if the spawner throws synchronously', async () => {
    const spawnFn = vi.fn(() => { throw new Error('boom'); });
    await expect(
      spawnRecordSignal('pe_more_thorough', { spawnFn: spawnFn as never }),
    ).resolves.toBeUndefined();
  });
});

/**
 * ⭐ RC69 (F-5) — a fire-and-forget spawn must not get pipes nobody drains: a
 * child whose stderr exceeds the OS pipe buffer (NEXPATH_DEBUG=1) would block
 * forever on its own write while holding the CLI store lock (next `auto`/`stop`
 * pays the 8 s lock fail-open) and leave a zombie per UI action.
 */
describe('⭐ RC69 — spawnRecordSignal never attaches undrained pipes', () => {
  it('⭐ spawns with stdio ignore on all three streams (nothing to read, nothing to write)', async () => {
    const spawnFn = vi.fn(() => makeFakeChild({ exitCode: 0 }));
    await spawnRecordSignal('pe_shown', { spawnFn: spawnFn as never });
    const opts = (spawnFn.mock.calls[0] as unknown[])[2] as { stdio?: unknown; cwd?: unknown; shell?: unknown };
    expect(opts.stdio).toEqual(['ignore', 'ignore', 'ignore']);
    expect(opts.cwd).toBeDefined();                       // the rest of buildSpawnOptions is untouched
    expect(opts.shell).toBe(process.platform === 'win32');
  });

  it('still resolves when the child exposes no stdin at all (the real shape under stdio ignore)', async () => {
    const child = makeFakeChild({ exitCode: 0 });
    (child as unknown as { stdin: unknown }).stdin = null;
    const spawnFn = vi.fn(() => child);
    await expect(spawnRecordSignal('pe_shown', { spawnFn: spawnFn as never })).resolves.toBeUndefined();
  });
});

describe('⭐ RC70 (F-1) — the true timestamp travels as --at', () => {
  it('appends --at <epochMs> when `at` is given (deferred signals keep their real time)', async () => {
    const spawnFn = vi.fn(() => makeFakeChild({ exitCode: 0 }));
    await spawnRecordSignal('pe_shown', { spawnFn: spawnFn as never, at: 1_788_000_000_123.7 });
    expect(spawnFn).toHaveBeenCalledWith('nexpath', ['record-signal', '--kind', 'pe_shown', '--at', '1788000000124'], expect.any(Object));
  });
  it('omits --at when not given (unchanged argv)', async () => {
    const spawnFn = vi.fn(() => makeFakeChild({ exitCode: 0 }));
    await spawnRecordSignal('pe_close', { spawnFn: spawnFn as never });
    expect((spawnFn.mock.calls[0] as unknown[])[1]).toEqual(['record-signal', '--kind', 'pe_close']);
  });
});
