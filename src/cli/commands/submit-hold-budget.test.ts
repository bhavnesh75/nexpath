import { computePopupWaitBudgetMs, DEFAULT_POPUP_WAIT_MS, POPUP_WAIT_ENV, CURSOR_DEFAULT_HOOK_TIMEOUT_S, CURSOR_HOST_TIMEOUT_MARGIN_MS } from './submit-hold-budget.js';
/**
 * H4 — hold budget.
 *
 * The property under test is the one the dev plan actually demands: a HARD
 * 60–90 s cap on the whole blocking window, self-enforced. Per-segment timeouts
 * cannot deliver that because they sum, so these tests are written against the
 * TOTAL, not against individual calls.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createHoldBudget,
  DEFAULT_HOLD_BUDGET_MS,
  MIN_HOLD_BUDGET_MS,
  MAX_HOLD_BUDGET_MS,
} from './submit-hold-budget.js';

/** Deterministic clock + timer, so no test waits on real time. */
function harness(totalMs?: number) {
  let t = 1_000;
  const timers: Array<{ at: number; fn: () => void }> = [];
  const budget = createHoldBudget({
    totalMs,
    now: () => t,
    setTimeoutFn: (fn, ms) => { const e = { at: t + ms, fn }; timers.push(e); return e; },
    clearTimeoutFn: (h) => { const i = timers.indexOf(h as never); if (i >= 0) timers.splice(i, 1); },
  });
  return {
    budget,
    advance(ms: number) {
      t += ms;
      for (const e of [...timers]) if (e.at <= t) { timers.splice(timers.indexOf(e), 1); e.fn(); }
    },
    pending: () => timers.length,
  };
}

describe('the plan\'s 60–90 s window is enforced, not trusted', () => {
  it('defaults inside the window', () => {
    expect(DEFAULT_HOLD_BUDGET_MS).toBeGreaterThanOrEqual(MIN_HOLD_BUDGET_MS);
    expect(DEFAULT_HOLD_BUDGET_MS).toBeLessThanOrEqual(MAX_HOLD_BUDGET_MS);
  });

  it('clamps a caller who asks for far too long', () => {
    // 600_000 is awaitChild's old default — the exact value that made the hold
    // unbounded in practice. Passing it must not reinstate that.
    expect(harness(600_000).budget.remaining()).toBe(MAX_HOLD_BUDGET_MS);
  });

  it('clamps a caller who asks for too little', () => {
    expect(harness(0).budget.remaining()).toBe(MIN_HOLD_BUDGET_MS);
  });
});

describe('⭐ the budget is SHARED across segments — the property per-call timeouts cannot give', () => {
  it('time spent in one segment is taken from the next', async () => {
    const h = harness(60_000);
    await h.budget.run(() => new Promise<string>((r) => { h.advance(20_000); r('a'); }));
    expect(h.budget.remaining()).toBe(40_000);
    await h.budget.run(() => new Promise<string>((r) => { h.advance(25_000); r('b'); }));
    expect(h.budget.remaining()).toBe(15_000);
  });

  it('three segments cannot together exceed the cap', async () => {
    // MUTATION GUARD: if each run() used the FULL total instead of the
    // remainder, this would allow 180_000ms of hold and still pass everything
    // else. That is precisely the pre-H4 bug.
    const h = harness(60_000);
    for (let i = 0; i < 3; i += 1) {
      await h.budget.run(() => new Promise<void>((r) => { h.advance(25_000); r(); }));
    }
    expect(h.budget.remaining()).toBe(0);
    expect(h.budget.expired()).toBe(true);
  });

  it('does not START work once exhausted', async () => {
    // The last segment always getting to run is how a "bounded" path overshoots.
    const h = harness(60_000);
    await h.budget.run(() => new Promise<void>((r) => { h.advance(60_000); r(); }));
    const work = vi.fn().mockResolvedValue('should not run');
    const res = await h.budget.run(work);
    expect(work).not.toHaveBeenCalled();
    expect(res).toEqual({ timedOut: true });
  });
});

describe('expiry reports timedOut so the caller can fail open (A3)', () => {
  it('times out work that outlives the remaining budget', async () => {
    const h = harness(60_000);
    const p = h.budget.run(() => new Promise<string>(() => {})); // never settles
    h.advance(60_000);
    await expect(p).resolves.toEqual({ timedOut: true });
  });

  it('returns the value when work finishes in time', async () => {
    const h = harness(60_000);
    await expect(h.budget.run(async () => 'ok')).resolves.toEqual({ timedOut: false, value: 'ok' });
  });

  it('a THROWING segment is not reported as a timeout', async () => {
    // Both fail open, but conflating them would misreport the evidence packet:
    // "popup crashed" and "user never answered" are different findings.
    const h = harness(60_000);
    await expect(h.budget.run(async () => { throw new Error('popup died'); }))
      .resolves.toEqual({ timedOut: false, value: undefined });
  });

  it('never rejects, so no caller needs a try/catch around the budget', async () => {
    const h = harness(60_000);
    await expect(h.budget.run(() => Promise.reject(new Error('boom')))).resolves.toBeDefined();
  });
});

describe('timers are cleaned up — a hook must not be kept alive by its own guard', () => {
  it('clears the timer when work finishes first', async () => {
    const h = harness(60_000);
    await h.budget.run(async () => 'done');
    expect(h.pending()).toBe(0);
  });

  it('clears the timer when work throws', async () => {
    const h = harness(60_000);
    await h.budget.run(async () => { throw new Error('x'); });
    expect(h.pending()).toBe(0);
  });

  it('unrefs the real timer so it cannot hold the process open', async () => {
    const unref = vi.fn();
    const b = createHoldBudget({
      totalMs: 60_000,
      setTimeoutFn: () => ({ unref }),
      clearTimeoutFn: () => {},
    });
    void b.run(() => new Promise<void>(() => {}));
    await Promise.resolve();
    expect(unref).toHaveBeenCalled();
  });
});

/**
 * ⭐ RC77 — the popup waits for the human: a second phase on the hold, and the budget it gets.
 * Devin/Windows tester, 2026-09-08: the popup vanished at the shared 75 s while they were
 * still reading. Spike-measured facts: Windsurf/Devin never kill a hook; Cursor honours a
 * configured timeout (seconds) and fails open + orphans at its 60 s default.
 */
describe('⭐ RC77 — extendFor / elapsed on the real budget', () => {
  function clock() {
    let t = 0; const timers: Array<{ at: number; fn: () => void }> = [];
    const budget = createHoldBudget({
      totalMs: 60_000, now: () => t,
      setTimeoutFn: (fn, ms) => { const e = { at: t + ms, fn }; timers.push(e); return e; },
      clearTimeoutFn: (h) => { const i = timers.indexOf(h as never); if (i >= 0) timers.splice(i, 1); },
    });
    return { budget, advance(ms: number) { t += ms; for (const e of [...timers]) if (e.at <= t) { timers.splice(timers.indexOf(e), 1); e.fn(); } } };
  }
  it('⭐ extendFor moves the deadline to now + ms, past the preparation clamp', async () => {
    const c = clock();
    c.advance(50_000);                                   // preparation used 50 of 60 s
    expect(c.budget.remaining()).toBe(10_000);
    c.budget.extendFor!(30 * 60_000);
    expect(c.budget.remaining()).toBe(30 * 60_000);      // unclamped
    expect(c.budget.elapsed!()).toBe(50_000);
    // work that outlives the OLD deadline but not the new one is NOT timed out
    const r = c.budget.run(async () => { c.advance(5 * 60_000); return 'block'; });
    await expect(r).resolves.toEqual({ timedOut: false, value: 'block' });
  });
  it('the extended window still expires — a forgotten popup is not forever', async () => {
    const c = clock();
    c.budget.extendFor!(120_000);
    const r = c.budget.run(() => new Promise(() => { c.advance(120_000); }));
    await expect(r).resolves.toEqual({ timedOut: true });
    expect(c.budget.expired()).toBe(true);
  });
  it('a non-positive extension leaves nothing (treated as 0)', () => {
    const c = clock(); c.budget.extendFor!(-5); expect(c.budget.remaining()).toBe(0);
  });
});

describe('⭐ RC77 — computePopupWaitBudgetMs', () => {
  it('⭐ Windsurf/Devin: the cap, 30 minutes by default — no host ceiling exists', () => {
    expect(computePopupWaitBudgetMs({ host: 'windsurf', elapsedMs: 55_000, env: {} })).toBe(DEFAULT_POPUP_WAIT_MS);
    expect(DEFAULT_POPUP_WAIT_MS).toBe(30 * 60_000);
    expect(computePopupWaitBudgetMs({ host: 'windsurf', elapsedMs: 0, env: {}, registeredCursorTimeoutSec: 120 })).toBe(DEFAULT_POPUP_WAIT_MS); // ignored off Cursor
  });
  it('⭐ Cursor: never past the registered timeout minus what the hook already used minus the margin', () => {
    // registered 1900 s (the new registration): the cap wins
    expect(computePopupWaitBudgetMs({ host: 'cursor', elapsedMs: 8_000, env: {}, registeredCursorTimeoutSec: 1900 })).toBe(DEFAULT_POPUP_WAIT_MS);
    // registered 120 s (an install not yet re-set-up): 120 s − 8 s − 10 s
    expect(computePopupWaitBudgetMs({ host: 'cursor', elapsedMs: 8_000, env: {}, registeredCursorTimeoutSec: 120 })).toBe(102_000);
    // unreadable registration ⇒ Cursor's measured 60 s default
    expect(computePopupWaitBudgetMs({ host: 'cursor', elapsedMs: 5_000, env: {}, registeredCursorTimeoutSec: null })).toBe(CURSOR_DEFAULT_HOOK_TIMEOUT_S * 1000 - 5_000 - CURSOR_HOST_TIMEOUT_MARGIN_MS);
    // never negative
    expect(computePopupWaitBudgetMs({ host: 'cursor', elapsedMs: 70_000, env: {}, registeredCursorTimeoutSec: 60 })).toBe(0);
    expect(computePopupWaitBudgetMs({ host: 'cursor', elapsedMs: Number.NaN, env: {}, registeredCursorTimeoutSec: 60 })).toBe(50_000);
  });
  it('the env override sets the cap (positive integers only); junk falls back to the default', () => {
    expect(computePopupWaitBudgetMs({ host: 'windsurf', elapsedMs: 0, env: { [POPUP_WAIT_ENV]: '90000' } })).toBe(90_000);
    expect(computePopupWaitBudgetMs({ host: 'cursor', elapsedMs: 0, env: { [POPUP_WAIT_ENV]: '90000' }, registeredCursorTimeoutSec: 1900 })).toBe(90_000);
    for (const junk of ['0', '-5', 'abc', '']) {
      expect(computePopupWaitBudgetMs({ host: 'windsurf', elapsedMs: 0, env: { [POPUP_WAIT_ENV]: junk } })).toBe(DEFAULT_POPUP_WAIT_MS);
    }
  });
});
