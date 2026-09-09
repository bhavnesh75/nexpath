/** ⭐ RC70 (F-4) — the decider's read of the extension's deliverer heartbeat. */
import { describe, it, expect } from 'vitest';
import { readDelivererState, DELIVERER_HEARTBEAT_STALE_MS } from './deliverer-state.js';

const beat = (host: string, pid: number, at: number, armed: boolean, reason?: string) =>
  JSON.stringify({ schemaVersion: 1, host, pid, at, armed, ...(reason ? { reason } : {}) });
function dir(files: Record<string, string>, now = 100_000) {
  return { dir: '/h/.nexpath', now: () => now, readdirFn: () => Object.keys(files), readFileFn: (p: string) => files[p.split(/[\\/]/).pop()!] ?? (() => { throw new Error('ENOENT'); })() }; // either separator
}

describe('⭐ RC70 — readDelivererState', () => {
  it('⭐ absent: no beats (or no dir) ⇒ UNKNOWN — the caller proceeds as before', () => {
    expect(readDelivererState('cursor', dir({}))).toEqual({ state: 'absent' });
    expect(readDelivererState('cursor', { dir: '/nope', readdirFn: () => { throw new Error('ENOENT'); } })).toEqual({ state: 'absent' });
  });
  it('⭐ armed: a FRESH armed beat for this host', () => {
    const r = readDelivererState('cursor', dir({ 'deliverer-cursor-42.json': beat('cursor', 42, 100_000 - 5_000, true) }));
    expect(r).toMatchObject({ state: 'armed', ageMs: 5_000, pid: 42 });
  });
  it('⭐ not_armed: fresh but disarmed (consent declined / gate off), reason carried', () => {
    const r = readDelivererState('windsurf', dir({ 'deliverer-windsurf-7.json': beat('windsurf', 7, 100_000 - 1_000, false, 'consent_not_granted') }));
    expect(r).toMatchObject({ state: 'not_armed', reason: 'consent_not_granted', pid: 7 });
  });
  it('⭐ stale: beats exist but none fresh (extension gone)', () => {
    const r = readDelivererState('cursor', dir({ 'deliverer-cursor-1.json': beat('cursor', 1, 100_000 - DELIVERER_HEARTBEAT_STALE_MS - 1, true) }));
    expect(r).toMatchObject({ state: 'stale', pid: 1 });
    expect(r.ageMs).toBeGreaterThan(DELIVERER_HEARTBEAT_STALE_MS);
  });
  it('⭐ two windows: any fresh ARMED beat wins over a fresh not-armed one', () => {
    const r = readDelivererState('cursor', dir({
      'deliverer-cursor-1.json': beat('cursor', 1, 100_000 - 2_000, false, 'consent_not_granted'),
      'deliverer-cursor-2.json': beat('cursor', 2, 100_000 - 9_000, true),
    }));
    expect(r).toMatchObject({ state: 'armed', pid: 2 });
  });
  it('ignores other hosts, corrupt files, wrong schema, and unreadable files', () => {
    const r = readDelivererState('cursor', dir({
      'deliverer-windsurf-9.json': beat('windsurf', 9, 100_000, true),
      'deliverer-cursor-3.json': 'not json',
      'deliverer-cursor-4.json': JSON.stringify({ schemaVersion: 2, host: 'cursor', pid: 4, at: 100_000, armed: true }),
      'unrelated.json': '{}',
    }));
    expect(r).toEqual({ state: 'absent' });
  });
});
