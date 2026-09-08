/**
 * RC78 — the hook side of the supervised popup: fast path unchanged on the wire,
 * late cancel at the deadline, and the in-order twin mirroring a block.
 */
import { describe, it, expect, vi } from 'vitest';
vi.mock('./submit-expiry-consumer.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./submit-expiry-consumer.js')>();
  return { ...mod, spawnExpiryConsumer: () => ({ spawned: true, pid: 1 }) };
});
import { runWindsurfHookAction, WINDSURF_BLOCK_CARD_MESSAGE } from './windsurf-hook.js';
import { popupSupervisionPaths, SUBMIT_POPUP_START_GRACE_MS, type PopupSupervisionStatus } from './submit-popup-supervisor.js';
import { WINDSURF_INVOCATION_DIRNAME } from '../../cursor-hook/invocation-guard.js';

const ON = { NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1' };
const PAYLOAD = JSON.stringify({ execution_id: 'exec-1', trajectory_id: 't', tool_info: { user_prompt: 'refactor the payment service retry logic' } });

type Status = PopupSupervisionStatus | null;
const running = (): Status => ({ schemaVersion: 1, state: 'running', startedAt: 1, pid: 77 });
const done = (decision: 'allow' | 'block'): Status => ({ schemaVersion: 1, state: 'done', startedAt: 1, pid: 77, finishedAt: 2, decision, selfDelivered: 'none', afterCancel: false });

/** Drives the REAL default decider (no `decidePromptSubmit` injected) on a virtual clock. */
async function run(statuses: () => Status, over: Record<string, unknown> = {}, deadlineMs = 45_000) {
  let t = Date.now() + 1;
  const exits: number[] = [];
  const logs: Array<[string, Record<string, unknown> | undefined]> = [];
  const stderr: string[] = [];
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((s: string) => { stderr.push(String(s)); return true; }) as never);
  const markInvocationBlocked = vi.fn(() => true);
  const claim = vi.fn(() => 'won' as const);
  try {
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, {
      checkReplacementEcho: async () => false,
      env: { ...ON },
      readStdin: async () => PAYLOAD,
      handle: async () => ({ action: 'auto', child: null } as never),
      waitForChild: async () => {},
      exit: (c: number) => { exits.push(c); },
      raisePopup: () => {},
      logEvent: ((_l: string, n: string, d?: Record<string, unknown>) => { logs.push([n, d]); }) as never,
      checkDuplicateInvocation: (() => ({ duplicate: false, key_kind: 'execution_id', key: 'exec-1' })) as never,
      markInvocationBlocked: markInvocationBlocked as never,
      lateCancelDeadlineMs: deadlineMs,
      supervisedDeciderPorts: {
        now: () => t,
        sleep: async (ms: number) => { t += ms; },
        spawnSupervisor: (() => ({ spawned: true, pid: 77, paths: popupSupervisionPaths('/proj', 'x') })) as never,
        readStatus: statuses,
        claim: claim as never,
        prune: () => 0,
      },
      ...over,
    } as never);
  } finally {
    stderrSpy.mockRestore();
  }
  return { exits, logs, stderr, markInvocationBlocked, claim };
}

describe('RC78 — fast path through the real default decider', () => {
  it('done/block before the deadline ⇒ exit 2, block card, twin marker, late_cancel:false', async () => {
    let polls = 0;
    const r = await run(() => (++polls < 4 ? running() : done('block')));
    expect(r.exits).toEqual([2]);
    expect(r.stderr.join('')).toContain(WINDSURF_BLOCK_CARD_MESSAGE);
    expect(r.claim).not.toHaveBeenCalled();
    expect(r.markInvocationBlocked).toHaveBeenCalledWith('/proj', 'pre_user_prompt', 'exec-1', { dirName: WINDSURF_INVOCATION_DIRNAME });
    const split = r.logs.find(([n]) => n === 'windsurf_hook_hold_split')?.[1];
    expect(split).toMatchObject({ decision: 'block', late_cancel: false });
  });

  it('done/allow before the deadline ⇒ exit 0, no card, no marker', async () => {
    let polls = 0;
    const r = await run(() => (++polls < 2 ? running() : done('allow')));
    expect(r.exits).toEqual([0]);
    expect(r.stderr.join('')).not.toContain(WINDSURF_BLOCK_CARD_MESSAGE);
    expect(r.markInvocationBlocked).not.toHaveBeenCalled();
    expect(r.logs.find(([n]) => n === 'windsurf_hook_hold_split')?.[1]).toMatchObject({ decision: 'allow', late_cancel: false });
  });
});

describe('⭐ RC78 — the late cancel', () => {
  it('popup still open at the deadline ⇒ the hook claims, exits 2 with the card, marks the twin, logs late_cancel', async () => {
    const r = await run(() => running());
    expect(r.exits).toEqual([2]);
    expect(r.claim).toHaveBeenCalledTimes(1);
    expect(r.stderr.join('')).toContain(WINDSURF_BLOCK_CARD_MESSAGE);
    expect(r.markInvocationBlocked).toHaveBeenCalledTimes(1);
    const lc = r.logs.find(([n]) => n === 'windsurf_hook_late_cancel')?.[1];
    expect(lc).toMatchObject({ deadline_ms: 45_000, supervisor_pid: 77 });
    expect(r.logs.find(([n]) => n === 'windsurf_hook_hold_split')?.[1]).toMatchObject({ decision: 'block', late_cancel: true });
  });

  it('the deadline is the injected one (a 3 s deadline cancels at ~3 s on the virtual clock)', async () => {
    const r = await run(() => running(), {}, 3_000);
    expect(r.exits).toEqual([2]);
    const lc = r.logs.find(([n]) => n === 'windsurf_hook_late_cancel')?.[1];
    expect(lc?.elapsed_ms as number).toBeGreaterThanOrEqual(3_000);
    expect(lc?.elapsed_ms as number).toBeLessThan(4_000);
  });

  it('a supervisor that never reports `running` ⇒ exit 0 after the start grace — nothing on screen, nothing cancelled', async () => {
    const r = await run(() => null);
    expect(r.exits).toEqual([0]);
    expect(r.claim).not.toHaveBeenCalled();
    expect(r.logs.some(([n]) => n === 'windsurf_hook_popup_supervisor_not_started')).toBe(true);
    expect(SUBMIT_POPUP_START_GRACE_MS).toBeLessThan(45_000);
  });

  it('an injected decider (every existing pin) bypasses the supervisor entirely — those tests keep their semantics', async () => {
    const r = await run(() => running(), { decidePromptSubmit: async () => 'allow' as const });
    expect(r.exits).toEqual([0]);
    expect(r.claim).not.toHaveBeenCalled();
  });
});

describe('RC78 — the in-order twin mirrors a block', () => {
  async function twin(blocked: boolean) {
    const exits: number[] = [];
    const stderr: string[] = [];
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(((s: string) => { stderr.push(String(s)); return true; }) as never);
    const handle = vi.fn(async () => ({ action: 'auto', child: null } as never));
    const isInvocationBlocked = vi.fn(() => blocked);
    try {
      await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, {
        checkReplacementEcho: async () => false,
        env: { ...ON },
        readStdin: async () => PAYLOAD,
        handle,
        waitForChild: async () => {},
        exit: (c: number) => { exits.push(c); },
        raisePopup: () => {},
        checkDuplicateInvocation: (() => ({ duplicate: true, key_kind: 'execution_id', key: 'exec-1' })) as never,
        isInvocationBlocked: isInvocationBlocked as never,
        decidePromptSubmit: async () => { throw new Error('the twin must never decide'); },
      } as never);
    } finally {
      stderrSpy.mockRestore();
    }
    return { exits, stderr, handle, isInvocationBlocked };
  }

  it('primary blocked ⇒ the twin exits 2 with the same card, spawning nothing', async () => {
    const r = await twin(true);
    expect(r.exits).toEqual([2]);
    expect(r.stderr.join('')).toContain(WINDSURF_BLOCK_CARD_MESSAGE);
    expect(r.handle).not.toHaveBeenCalled();
    expect(r.isInvocationBlocked).toHaveBeenCalledWith('/proj', 'pre_user_prompt', 'exec-1', { dirName: WINDSURF_INVOCATION_DIRNAME });
  });

  it('primary allowed ⇒ the twin exits 0 exactly as RC64 shipped it', async () => {
    const r = await twin(false);
    expect(r.exits).toEqual([0]);
    expect(r.stderr.join('')).not.toContain(WINDSURF_BLOCK_CARD_MESSAGE);
    expect(r.handle).not.toHaveBeenCalled();
  });
});
