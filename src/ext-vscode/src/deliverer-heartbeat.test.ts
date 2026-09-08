/** ⭐ RC70 (F-4) — the deliverer heartbeat: the CLI's only way to know a poller exists before it cancels a prompt. */
import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import {
  startDelivererHeartbeat, delivererHeartbeatFilename, DELIVERER_HEARTBEAT_PRUNE_MS, DELIVERER_HEARTBEAT_INTERVAL_MS,
} from './deliverer-heartbeat.js';

function memFs(now: () => number) {
  const files = new Map<string, { data: string; mtime: number }>();
  return {
    files,
    deps: {
      dir: '/h/.nexpath',
      writeFileFn: (p: string, d: string) => { files.set(p, { data: d, mtime: now() }); },
      mkdirFn: () => {},
      readdirFn: () => [...files.keys()].map((p) => p.split(/[\\/]/).pop()!), // either separator
      mtimeMsFn: (p: string) => files.get(p)?.mtime ?? now(),
      unlinkFn: (p: string) => { files.delete(p); },
    },
  };
}
const parse = (fs: ReturnType<typeof memFs>, path: string) => JSON.parse(fs.files.get(path)!.data) as Record<string, unknown>;

describe('⭐ RC70 — startDelivererHeartbeat', () => {
  it('⭐ writes an armed beat immediately, per (host,pid), with the live armed/reason values', () => {
    let t = 1_000; const fs = memFs(() => t);
    let armed = false;
    const hb = startDelivererHeartbeat({ ...fs.deps, host: 'cursor', pid: 42, now: () => t,
      isArmed: () => armed, reason: () => 'consent_not_granted',
      setIntervalFn: () => ({}), clearIntervalFn: () => {} });
    const path = join('/h/.nexpath', delivererHeartbeatFilename('cursor', 42));
    expect(parse(fs, path)).toMatchObject({ schemaVersion: 1, host: 'cursor', pid: 42, at: 1_000, armed: false, reason: 'consent_not_granted' });
    armed = true; t = 2_000; hb.beat();
    expect(parse(fs, path)).toMatchObject({ at: 2_000, armed: true, reason: 'armed' });
  });

  it('⭐ ticks on the interval (unref-safe) and stop() writes a FINAL not-armed beat with the given reason', () => {
    let t = 0; const fs = memFs(() => t);
    let tick: (() => void) | null = null; const cleared: unknown[] = [];
    const hb = startDelivererHeartbeat({ ...fs.deps, host: 'windsurf', pid: 7, now: () => t, isArmed: () => true, reason: () => 'x',
      setIntervalFn: (fn, ms) => { expect(ms).toBe(DELIVERER_HEARTBEAT_INTERVAL_MS); tick = fn; return { unref: () => {} }; },
      clearIntervalFn: (h) => cleared.push(h) });
    const path = join('/h/.nexpath', delivererHeartbeatFilename('windsurf', 7));
    t = 10_000; tick!(); expect(parse(fs, path)).toMatchObject({ at: 10_000, armed: true });
    t = 20_000; hb.stop('deactivated');
    expect(cleared).toHaveLength(1);
    expect(parse(fs, path)).toMatchObject({ at: 20_000, armed: false, reason: 'deactivated' });
  });

  it('prunes sibling beats of the same host older than a day; keeps its own and other hosts', () => {
    let t = 10 * DELIVERER_HEARTBEAT_PRUNE_MS; const fs = memFs(() => t);
    fs.files.set(join('/h/.nexpath', 'deliverer-cursor-1.json'), { data: '{}', mtime: t - DELIVERER_HEARTBEAT_PRUNE_MS - 1 }); // old, same host
    fs.files.set(join('/h/.nexpath', 'deliverer-cursor-2.json'), { data: '{}', mtime: t - 1_000 });                             // fresh, same host
    fs.files.set(join('/h/.nexpath', 'deliverer-windsurf-3.json'), { data: '{}', mtime: 0 });                                  // other host, ancient
    startDelivererHeartbeat({ ...fs.deps, host: 'cursor', pid: 9, now: () => t, isArmed: () => true, reason: () => '',
      setIntervalFn: () => ({}), clearIntervalFn: () => {} });
    expect(fs.files.has(join('/h/.nexpath', 'deliverer-cursor-1.json'))).toBe(false);
    expect(fs.files.has(join('/h/.nexpath', 'deliverer-cursor-2.json'))).toBe(true);
    expect(fs.files.has(join('/h/.nexpath', 'deliverer-windsurf-3.json'))).toBe(true);
    expect(fs.files.has(join('/h/.nexpath', 'deliverer-cursor-9.json'))).toBe(true);
  });

  it('never throws: fs failures, throwing isArmed/reason, throwing timers are all swallowed', () => {
    expect(() => startDelivererHeartbeat({
      host: 'cursor', pid: 1, dir: '/h', isArmed: () => { throw new Error('x'); }, reason: () => { throw new Error('y'); },
      writeFileFn: () => { throw new Error('EACCES'); }, mkdirFn: () => { throw new Error('EACCES'); },
      readdirFn: () => { throw new Error('ENOENT'); },
      setIntervalFn: () => ({}), clearIntervalFn: () => { throw new Error('boom'); },
    }).stop()).not.toThrow();
  });
});
