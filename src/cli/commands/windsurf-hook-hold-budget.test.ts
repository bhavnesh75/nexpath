/**
 * H4 acceptance — "every named failure mode releases the original prompt
 * unmodified; a test per mode; no orphaned process survives the hold."
 *
 * The plan names four modes: classification error, composeDeterministicOptions()
 * returning null, popup failing to render, and NO DECISION BEFORE THE HOLD
 * EXPIRES. Each gets its own test here, asserted at the hook's real exit code
 * because that is what Windsurf actually acts on.
 */
import { describe, it, expect, vi } from 'vitest';
vi.mock('./submit-expiry-consumer.js', async (importOriginal) => {
  // RC71 hermetic: the real spawner would launch a detached `node <argv[1]> submit-expiry-consume`
  // from inside the test runner. The constant is kept real; only the spawn is stubbed.
  const mod = await importOriginal<typeof import('./submit-expiry-consumer.js')>();
  return { ...mod, spawnExpiryConsumer: vi.fn(() => ({ spawned: true, pid: 4242 })) };
});
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWindsurfHookAction } from './windsurf-hook.js';
import { createHoldBudget } from './submit-hold-budget.js';
import { buildDefaultPromptSubmitDecider } from './windsurf-hook.js';

const ON = { NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1' };
const PAYLOAD = JSON.stringify({ tool_info: { user_prompt: 'hi' } });

/** A budget driven by a fake clock, so nothing waits on real time. */
function fakeBudget(totalMs = 60_000) {
  let t = 0;
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
  };
}

async function run(over: Record<string, unknown> = {}, project = '/proj') {
  const exits: number[] = [];
  await runWindsurfHookAction('pre_user_prompt', { project }, {
    checkReplacementEcho: async () => false,
    env: { ...ON },
    readStdin: async () => PAYLOAD,
    handle: async () => ({ action: 'auto', child: null } as never),
    waitForChild: async () => {},
    decidePromptSubmit: async () => 'allow' as const,
    exit: (c: number) => { exits.push(c); },
    raisePopup: () => {},
    ...over,
  } as never);
  return exits;
}

describe('H4 — every named failure mode releases the prompt unmodified (A3)', () => {
  it('classification error ⇒ exit 0, never 2', async () => {
    const exits = await run({ decidePromptSubmit: async () => { throw new Error('classify failed'); } });
    expect(exits).not.toContain(2);
    expect(exits).toContain(0);
  });

  it('composeDeterministicOptions returned null ⇒ exit 0', async () => {
    // Routed through the REAL decider so the generator-returned-null guard is
    // actually executed. Uses a WRITABLE root deliberately: with an unwritable
    // one the persist would fail and the test would pass for the wrong reason —
    // which is exactly how the first version of this test survived mutation.
    const root = mkdtempSync(join(tmpdir(), 'nexpath-h4-'));
    try {
      const decide = buildDefaultPromptSubmitDecider({ project: root }, {
        optionSource: {
          composeOptions: () => null,                       // <- the mode under test
          renderPopup: async () => 'would-block-if-reached',
          consumeHandledTurn: () => {},
        } as never,
      });
      const exits = await run({ decidePromptSubmit: decide as never }, root);
      // MUTATION GUARD: drop the `!options` guard in the decider and this exits 2.
      expect(exits).not.toContain(2);
      expect(exits).toContain(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('popup fails to render ⇒ exit 0', async () => {
    // Distinct from the classification error above: options ARE composed and the
    // failure happens inside renderPopup. Writable root for the same reason as
    // the test above — with an unwritable one the persist failure would mask the
    // guard and the mutation would survive.
    const root = mkdtempSync(join(tmpdir(), 'nexpath-h4-'));
    try {
      const decide = buildDefaultPromptSubmitDecider({ project: root }, {
        optionSource: {
          composeOptions: () => ({ l1: [], l2: ['opt'], l3: [] }),
          renderPopup: async () => { throw new Error('tty gone'); },   // <- the mode
          consumeHandledTurn: () => {},
        } as never,
      });
      const exits = await run({ decidePromptSubmit: decide as never }, root);
      // MUTATION GUARD: turn the decider's popup catch into a block and this exits 2.
      expect(exits).not.toContain(2);
      expect(exits).toContain(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('popup returns no selection (user dismissed) ⇒ exit 0', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nexpath-h4-'));
    try {
      const decide = buildDefaultPromptSubmitDecider({ project: root }, {
        optionSource: {
          composeOptions: () => ({ l1: [], l2: ['opt'], l3: [] }),
          renderPopup: async () => null,
          consumeHandledTurn: () => {},
        } as never,
      });
      const exits = await run({ decidePromptSubmit: decide as never }, root);
      expect(exits).not.toContain(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('⭐ NO DECISION before the hold expires ⇒ exit 0, prompt released', async () => {
    // The popup waits for a human who may have walked away. Before H4 this was
    // unbounded and the prompt would be held indefinitely.
    const f = fakeBudget(60_000);
    const exits = await run({
      holdBudget: f.budget,
      decidePromptSubmit: () => new Promise(() => { f.advance(60_000); }), // never resolves
    });
    expect(exits).not.toContain(2);
    expect(exits).toContain(0);
  });

  it('an expired budget never blocks even if the decider later says block', async () => {
    // MUTATION GUARD: treating a timed-out run() as a real decision would exit 2
    // with no replacement written — cancelling the turn with nothing to inject.
    const f = fakeBudget(60_000);
    const exits = await run({
      holdBudget: f.budget,
      decidePromptSubmit: () => new Promise((r) => { f.advance(60_000); setTimeout(() => r('block'), 0); }),
    });
    expect(exits).not.toContain(2);
  });
});

describe('H4 — no orphaned process survives the hold', () => {
  it('kills the child when the wait times out', async () => {
    // R2: Cursor orphans timed-out hooks, so we cannot rely on the host to reap
    // anything. If the hold expires while `auto` is still running, we kill it.
    const f = fakeBudget(60_000);
    const kill = vi.fn();
    await run({
      holdBudget: f.budget,
      handle: async () => ({ action: 'auto', child: { kill } } as never),
      waitForChild: () => new Promise(() => { f.advance(60_000); }), // never settles
    });
    expect(kill).toHaveBeenCalled();
  });

  it('does NOT kill the child on the normal path', async () => {
    const kill = vi.fn();
    await run({
      handle: async () => ({ action: 'auto', child: { kill } } as never),
      waitForChild: async () => {},
    });
    expect(kill).not.toHaveBeenCalled();
  });

  it('does not decide after a timed-out child wait — the classification never landed', async () => {
    const f = fakeBudget(60_000);
    const decide = vi.fn().mockResolvedValue('block');
    const exits = await run({
      holdBudget: f.budget,
      handle: async () => ({ action: 'auto', child: { kill: () => {} } } as never),
      waitForChild: () => new Promise(() => { f.advance(60_000); }),
      decidePromptSubmit: decide,
    });
    expect(decide).not.toHaveBeenCalled();
    expect(exits).not.toContain(2);
  });
});

describe('H4 — the budget is not engaged when the switch is OFF', () => {
  it('switch off ⇒ no hold, no kill, handler runs as always', async () => {
    const kill = vi.fn();
    const exits = await run({
      env: {},
      handle: async () => ({ action: 'auto', child: { kill } } as never),
    });
    expect(kill).not.toHaveBeenCalled();
    expect(exits).toContain(0);
  });
});
