/**
 * ⭐ RC71 — the detached expiry / floor consumer (tester §4b fix 1 + 6.1 floor).
 * Consume-only, bounded, `--before`-guarded, never throws on the hook's exit path.
 */
import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';
import { resolve } from 'node:path';
import {
  consumeExpiredSubmitRows,
  submitExpiryConsumeAction,
  spawnExpiryConsumer,
  registerSubmitExpiryConsumeCommand,
  SUBMIT_POPUP_MIN_REMAINING_MS,
  SUBMIT_EXPIRY_CONSUME_COMMAND,
} from './submit-expiry-consumer.js';
import { MIN_HOLD_BUDGET_MS } from './submit-hold-budget.js';

const adv = (id: number, createdAt: number) => ({ id, createdAt } as never);

describe('⭐ RC71 — consumeExpiredSubmitRows', () => {
  it('marks the pending advisory + PE rows created at or before `before`', () => {
    const advisories = [adv(11, 1_000)];
    const markedAdv: number[] = []; const markedPe: number[] = [];
    const counts = consumeExpiredSubmitRows({}, { projectRoot: '/proj', before: 1_000 }, {
      getPendingAdvisory: (() => advisories.shift() ?? null) as never,
      markAdvisoryShown: ((_s: unknown, id: number) => { markedAdv.push(id); }) as never,
      getPendingPromptEnhancement: (() => ({ id: 7, createdAt: 900 })) as never,
      markPromptEnhancementShown: ((_s: unknown, id: number) => { markedPe.push(id); }) as never,
    });
    expect(counts).toEqual({ advisories: 1, promptEnhancements: 1 });
    expect(markedAdv).toEqual([11]);
    expect(markedPe).toEqual([7]);
  });

  it('⭐ leaves rows the NEXT turn built (created after `before`) untouched', () => {
    const markedAdv: number[] = []; const markedPe: number[] = [];
    const counts = consumeExpiredSubmitRows({}, { projectRoot: '/proj', before: 1_000 }, {
      getPendingAdvisory: (() => adv(12, 1_001)) as never,
      markAdvisoryShown: ((_s: unknown, id: number) => { markedAdv.push(id); }) as never,
      getPendingPromptEnhancement: (() => ({ id: 8, createdAt: 5_000 })) as never,
      markPromptEnhancementShown: ((_s: unknown, id: number) => { markedPe.push(id); }) as never,
    });
    expect(counts).toEqual({ advisories: 0, promptEnhancements: 0 });
    expect(markedAdv).toEqual([]);
    expect(markedPe).toEqual([]);
  });

  it('nothing pending ⇒ zero counts, no marks; the advisory loop is bounded (8)', () => {
    const none = consumeExpiredSubmitRows({}, { projectRoot: '/proj', before: 1 }, {
      getPendingAdvisory: (() => null) as never,
      getPendingPromptEnhancement: (() => null) as never,
      markAdvisoryShown: (() => { throw new Error('must not mark'); }) as never,
      markPromptEnhancementShown: (() => { throw new Error('must not mark'); }) as never,
    });
    expect(none).toEqual({ advisories: 0, promptEnhancements: 0 });
    let marks = 0;
    const bounded = consumeExpiredSubmitRows({}, { projectRoot: '/proj', before: 1_000 }, {
      getPendingAdvisory: (() => adv(1, 1)) as never, // a row that never goes away
      markAdvisoryShown: (() => { marks += 1; }) as never,
      getPendingPromptEnhancement: (() => null) as never,
    });
    expect(bounded.advisories).toBe(8);
    expect(marks).toBe(8);
  });
});

describe('⭐ RC71 — submitExpiryConsumeAction', () => {
  const collect = () => {
    const events: Array<{ level: string; name: string; data: Record<string, unknown> }> = [];
    return { events, logEvent: (level: string, name: string, data?: Record<string, unknown>) => { events.push({ level, name, data: data ?? {} }); } };
  };

  it('invalid --before ⇒ exit 1 and the store is never opened', async () => {
    const openStoreFn = vi.fn();
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as never);
    try {
      expect(await submitExpiryConsumeAction({ project: '/p', before: 'nope', db: '/x' }, { openStoreFn })).toBe(1);
      expect(await submitExpiryConsumeAction({ project: '/p', before: '0', db: '/x' }, { openStoreFn })).toBe(1);
    } finally { spy.mockRestore(); }
    expect(openStoreFn).not.toHaveBeenCalled();
  });

  it('store open failure ⇒ exit 1 + one warn line (stage open)', async () => {
    const c = collect();
    const code = await submitExpiryConsumeAction({ project: '/p', before: '1000', reason: 'decider_expired', db: '/x' }, {
      openStoreFn: async () => { throw new Error('locked'); }, logEvent: c.logEvent as never,
    });
    expect(code).toBe(1);
    expect(c.events).toEqual([{ level: 'warn', name: 'submit_expiry_consume_failed', data: { reason: 'decider_expired', stage: 'open', message: 'locked' } }]);
  });

  it('⭐ success ⇒ exit 0, the store is closed, counts logged (no content, no path)', async () => {
    const c = collect(); const closed: unknown[] = []; const store = { tag: 's' };
    let t = 100;
    const code = await submitExpiryConsumeAction({ project: '/p', before: '1000', reason: 'below_floor', db: '/x' }, {
      openStoreFn: async () => store,
      closeStoreFn: (s) => { closed.push(s); },
      consume: ((s: unknown, input: { projectRoot: string; before: number }) => {
        expect(s).toBe(store); expect(input).toEqual({ projectRoot: '/p', before: 1000 });
        return { advisories: 1, promptEnhancements: 1 };
      }) as never,
      logEvent: c.logEvent as never,
      now: () => (t += 50),
    });
    expect(code).toBe(0);
    expect(closed).toEqual([store]);
    expect(c.events).toEqual([{ level: 'info', name: 'submit_expiry_consumed', data: {
      reason: 'below_floor', before: 1000, advisories: 1, prompt_enhancements: 1, ms: 50,
    } }]);
    expect(JSON.stringify(c.events)).not.toContain('/p');
  });

  it('a throwing consume ⇒ exit 1, the store is STILL closed; an unknown reason is logged as unknown', async () => {
    const c = collect(); const closed: unknown[] = [];
    const code = await submitExpiryConsumeAction({ project: '/p', before: '1000', reason: 'whatever', db: '/x' }, {
      openStoreFn: async () => ({}),
      closeStoreFn: (s) => { closed.push(s); },
      consume: (() => { throw new Error('boom'); }) as never,
      logEvent: c.logEvent as never,
    });
    expect(code).toBe(1);
    expect(closed).toHaveLength(1);
    expect(c.events[0]).toMatchObject({ level: 'warn', name: 'submit_expiry_consume_failed', data: { reason: 'unknown', stage: 'consume', message: 'boom' } });
  });
});

describe('⭐ RC71 — spawnExpiryConsumer (detached, unref, never throws)', () => {
  it('⭐ spawns `submit-expiry-consume` detached + stdio ignore + windowsHide, unref\'d, no shell', () => {
    const unref = vi.fn(); const on = vi.fn();
    const spawnFn = vi.fn(() => ({ pid: 4242, unref, on })) as never;
    const r = spawnExpiryConsumer({ projectRoot: '/my proj', before: 1234.6, reason: 'auto_expired', spawnFn, binaryPath: '/bin/nexpath' });
    expect(r).toEqual({ spawned: true, pid: 4242 });
    const [cmd, args, opts] = (spawnFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[], Record<string, unknown>];
    expect(cmd).toBe('/bin/nexpath');
    expect(args).toEqual([SUBMIT_EXPIRY_CONSUME_COMMAND, '--project', '/my proj', '--before', '1235', '--reason', 'auto_expired']);
    expect(opts).toMatchObject({ detached: true, stdio: 'ignore', windowsHide: true });
    expect(opts.shell).toBeUndefined();
    expect(unref).toHaveBeenCalledTimes(1);
    expect(on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('default invocation re-invokes THIS node + cli script (never a bare `nexpath` on PATH)', () => {
    const prev = process.env.NEXPATH_BIN; delete process.env.NEXPATH_BIN;
    try {
      const spawnFn = vi.fn(() => ({ pid: 1, unref: () => {}, on: () => {} })) as never;
      spawnExpiryConsumer({ projectRoot: '/p', before: 1, reason: 'below_floor', spawnFn });
      const [cmd, args] = (spawnFn as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string[]];
      expect(cmd).toBe(process.execPath);
      expect(args[0]).toBe(resolve(process.argv[1]));
      expect(args[1]).toBe(SUBMIT_EXPIRY_CONSUME_COMMAND);
    } finally { if (prev !== undefined) process.env.NEXPATH_BIN = prev; }
  });

  it('a throwing spawn ⇒ { spawned:false, error } — never throws on the hook\'s exit path', () => {
    const r = spawnExpiryConsumer({ projectRoot: '/p', before: 1, reason: 'decider_expired',
      spawnFn: (() => { throw new Error('EACCES'); }) as never, binaryPath: '/x' });
    expect(r.spawned).toBe(false);
    expect(r.error).toContain('EACCES');
  });
});

describe('RC71 — command registration + constants', () => {
  it('registers `submit-expiry-consume` with --project/--before/--reason/--db', () => {
    const program = new Command();
    registerSubmitExpiryConsumeCommand(program);
    const cmd = program.commands.find((c) => c.name() === SUBMIT_EXPIRY_CONSUME_COMMAND);
    expect(cmd).toBeDefined();
    const flags = cmd!.options.map((o) => o.long);
    expect(flags).toEqual(expect.arrayContaining(['--project', '--before', '--reason', '--db']));
  });

  it('the floor sits strictly inside (0, MIN_HOLD_BUDGET_MS) so a normal turn is never affected', () => {
    expect(SUBMIT_POPUP_MIN_REMAINING_MS).toBe(30_000);
    expect(SUBMIT_POPUP_MIN_REMAINING_MS).toBeGreaterThan(0);
    expect(SUBMIT_POPUP_MIN_REMAINING_MS).toBeLessThan(MIN_HOLD_BUDGET_MS);
  });
});
