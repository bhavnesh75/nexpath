/**
 * ⭐ RC50/RC56 — duplicate hook registrations must not double-run the flow,
 * and the claim must be ATOMIC (exclusive create): the measured 2–100 ms
 * invocation stagger made a read-modify-write registry a coin-flip.
 */
import { describe, it, expect } from 'vitest';
import {
  checkAndRecordCursorInvocation,
  cursorInvocationMarkerName,
  WINDSURF_INVOCATION_DIRNAME,
} from './invocation-guard.js';

function memFs() {
  const files = new Set<string>();
  const mtimes = new Map<string, number>();
  return {
    files, mtimes,
    deps: (now: number) => ({
      now: () => now,
      mkdirFn: () => {},
      writeExclusiveFn: (p: string) => {
        if (files.has(p)) throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
        files.add(p); mtimes.set(p, now);
      },
      readdirFn: () => [...files].map((p) => p.split(/[\\/]/).pop()!), // either separator (Windows joins with backslashes)
      mtimeMsFn: (p: string) => mtimes.get(p) ?? [...mtimes.values()][0] ?? now,
      removeFn: (p: string) => { const base = p.split(/[\\/]/).pop()!; for (const f of [...files]) if (f.endsWith(base)) { files.delete(f); mtimes.delete(f); } },
    }),
  };
}

describe('⭐ RC50/RC56 — atomic duplicate-invocation claim', () => {
  it('⭐ first claim wins (false); the SAME key is a duplicate (true) — arbitration is the create itself', () => {
    const fs = memFs();
    expect(checkAndRecordCursorInvocation('/p', 'beforeSubmitPrompt', 'gen-1', fs.deps(1000))).toBe(false);
    expect(checkAndRecordCursorInvocation('/p', 'beforeSubmitPrompt', 'gen-1', fs.deps(1002))).toBe(true);
  });

  it('a different generation is not a duplicate', () => {
    const fs = memFs();
    checkAndRecordCursorInvocation('/p', 'beforeSubmitPrompt', 'gen-1', fs.deps(1000));
    expect(checkAndRecordCursorInvocation('/p', 'beforeSubmitPrompt', 'gen-2', fs.deps(1001))).toBe(false);
  });

  it('⭐ no generation id ⇒ never a duplicate (fail-open)', () => {
    expect(checkAndRecordCursorInvocation('/p', 'e', undefined, memFs().deps(1000))).toBe(false);
  });

  it('non-EEXIST fs errors ⇒ fail-open (run the flow)', () => {
    expect(checkAndRecordCursorInvocation('/p', 'e', 'gen-1', {
      mkdirFn: () => {}, writeExclusiveFn: () => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); },
    })).toBe(false);
  });

  it('stale markers are pruned by the winner', () => {
    const fs = memFs();
    checkAndRecordCursorInvocation('/p', 'e', 'old', fs.deps(1000));
    checkAndRecordCursorInvocation('/p', 'e', 'new', fs.deps(1000 + 10 * 60_000 + 1));
    const names = [...fs.files].map((p) => p.split(/[\\/]/).pop()!); // either separator (Windows joins with backslashes)
    expect(names).not.toContain(cursorInvocationMarkerName('e', 'old'));
    expect(names).toContain(cursorInvocationMarkerName('e', 'new'));
  });

  it('marker names are fs-safe', () => {
    expect(cursorInvocationMarkerName('beforeSubmitPrompt', 'a/b:c*d')).toBe('beforeSubmitPrompt-a_b_c_d');
  });
});

/**
 * ⭐ RC64 — the guard is reused for WINDSURF (Windows Devin executes both the
 * global and the workspace hooks.json — one submit, two full pipelines, two
 * different enhancements). Markers get their own dir, and short windows are
 * made HONEST: pruning only ever ran on winners, so a stale marker could sit
 * forever and dedupe a legitimate repeat of a fallback (trajectory+hash) key.
 */
describe('⭐ RC64 — custom dir + honest claim window', () => {
  it('dirName routes markers to the windsurf dir (cursor default untouched)', () => {
    const paths: string[] = [];
    const capture = {
      mkdirFn: () => {}, readdirFn: () => [] as string[],
      writeExclusiveFn: (p: string) => { paths.push(p); },
    };
    checkAndRecordCursorInvocation('/p', 'e', 'k', capture);
    checkAndRecordCursorInvocation('/p', 'e', 'k', { ...capture, dirName: WINDSURF_INVOCATION_DIRNAME });
    expect(paths[0]).toContain('cursor-hook-invocations');
    expect(paths[1]).toContain('windsurf-hook-invocations');
  });

  it('⭐ a marker OLDER than the window is stale: reclaimed, NOT a duplicate', () => {
    const fs = memFs();
    expect(checkAndRecordCursorInvocation('/p', 'pre', 'k', { ...fs.deps(1_000), maxAgeMs: 10_000 })).toBe(false);
    expect(checkAndRecordCursorInvocation('/p', 'pre', 'k', { ...fs.deps(12_000), maxAgeMs: 10_000 })).toBe(false);
  });

  it('⭐ inside the window the repeat IS a duplicate', () => {
    const fs = memFs();
    expect(checkAndRecordCursorInvocation('/p', 'pre', 'k', { ...fs.deps(1_000), maxAgeMs: 10_000 })).toBe(false);
    expect(checkAndRecordCursorInvocation('/p', 'pre', 'k', { ...fs.deps(10_999), maxAgeMs: 10_000 })).toBe(true);
  });

  it('EEXIST again after the stale removal ⇒ a live twin re-claimed ⇒ duplicate', () => {
    const fs = memFs();
    checkAndRecordCursorInvocation('/p', 'pre', 'k', { ...fs.deps(1_000), maxAgeMs: 10 });
    // removeFn is a no-op ⇒ the retry hits EEXIST again, as if a twin re-claimed.
    expect(checkAndRecordCursorInvocation('/p', 'pre', 'k', {
      ...fs.deps(50_000), maxAgeMs: 10, removeFn: () => {},
    })).toBe(true);
  });
});

// ── RC78: the twin mirrors a block ───────────────────────────────────────────
import { markInvocationBlocked, isInvocationBlocked, invocationBlockedMarkerPath } from './invocation-guard.js';
import { mkdtempSync as _mkdtemp, existsSync as _exists, utimesSync as _utimes, writeFileSync as _write } from 'node:fs';
import { tmpdir as _tmpdir } from 'node:os';
import { join as _join } from 'node:path';

describe('RC78 — blocked marker for the in-order twin', () => {
  it('the primary marks, the twin sees it while fresh, and a stale marker is ignored', () => {
    const root = _mkdtemp(_join(_tmpdir(), 'nexpath-rc78-guard-'));
    expect(isInvocationBlocked(root, 'pre_user_prompt', 'exec-1', { dirName: 'w' })).toBe(false);
    expect(markInvocationBlocked(root, 'pre_user_prompt', 'exec-1', { dirName: 'w' })).toBe(true);
    const p = invocationBlockedMarkerPath(root, 'pre_user_prompt', 'exec-1', 'w');
    expect(_exists(p)).toBe(true);
    expect(isInvocationBlocked(root, 'pre_user_prompt', 'exec-1', { dirName: 'w' })).toBe(true);
    expect(isInvocationBlocked(root, 'pre_user_prompt', 'exec-2', { dirName: 'w' })).toBe(false); // another action
    expect(isInvocationBlocked(root, 'post_cascade_response', 'exec-1', { dirName: 'w' })).toBe(false); // another event
    const past = (Date.now() - 11 * 60_000) / 1000;
    _utimes(p, past, past);
    expect(isInvocationBlocked(root, 'pre_user_prompt', 'exec-1', { dirName: 'w' })).toBe(false); // outside the window
  });

  it('an empty key marks nothing and matches nothing; failures never throw', () => {
    expect(markInvocationBlocked('/nonexistent-root-for-rc78', 'pre_user_prompt', '', {})).toBe(false);
    expect(isInvocationBlocked('/nonexistent-root-for-rc78', 'pre_user_prompt', '', {})).toBe(false);
    // A regular file where a directory must go: mkdir fails at once (ENOTDIR), and the helper reports it.
    const blocked = _mkdtemp(_join(_tmpdir(), 'nexpath-rc78-guard-'));
    _write(_join(blocked, '.nexpath'), 'not a directory');
    expect(markInvocationBlocked(blocked, 'pre_user_prompt', 'k', {})).toBe(false);
  });
});
