/**
 * H6 — host-agnostic submit-advisory wiring.
 *
 * Exists because the poller was built inside extension.ts's `host === 'windsurf'`
 * branch, so Cursor had NO construction site: the CLI could write a cursor
 * decision and nothing would ever read it.
 */
import { describe, it, expect, vi } from 'vitest';
import { createSubmitAdvisoryForHost } from './submit-advisory-wiring.js';

function deps(over: Record<string, unknown> = {}) {
  const captured: Record<string, unknown> = {};
  return {
    captured,
    d: {
      host: 'cursor' as const,
      enabled: true,
      projectRoots: ['/proj'],
      createPoller: (o: Record<string, unknown>) => { Object.assign(captured, o); return { start: vi.fn(), stop: vi.fn(), pollOnce: vi.fn() } as never; },
      readPendingDecision: vi.fn().mockResolvedValue(null),
      injectDirect: vi.fn().mockResolvedValue(true),
      fallbackClipboard: vi.fn().mockResolvedValue(true),
      submit: vi.fn().mockResolvedValue(true),
      notify: vi.fn(),
      log: vi.fn(),
      deliver: vi.fn().mockResolvedValue({ outcome: 'injected', landed: true }),
      ...over,
    },
  };
}

describe('⭐ switch OFF constructs NOTHING', () => {
  it('returns null without calling createPoller', () => {
    // Unreachable by control flow, not merely inert.
    const createPoller = vi.fn();
    const { d } = deps({ enabled: false, createPoller });
    expect(createSubmitAdvisoryForHost(d as never)).toBeNull();
    expect(createPoller).not.toHaveBeenCalled();
  });

  it('does not even build the delivery path', () => {
    const deliver = vi.fn();
    const { d } = deps({ enabled: false, deliver });
    createSubmitAdvisoryForHost(d as never);
    expect(deliver).not.toHaveBeenCalled();
  });
});

describe('⭐ each host reads only ITS OWN records', () => {
  it('passes cursor as the expected host', async () => {
    const readPendingDecision = vi.fn().mockResolvedValue(null);
    const { captured, d } = deps({ host: 'cursor', readPendingDecision });
    createSubmitAdvisoryForHost(d as never);
    await (captured.readPendingDecision as (r: string) => Promise<unknown>)('/proj');
    expect(readPendingDecision).toHaveBeenCalledWith('/proj', 'cursor');
  });

  it('passes windsurf as the expected host', async () => {
    // MUTATION GUARD: hardcoding either value would make one platform silently
    // deliver the other's records - injecting into the wrong editor.
    const readPendingDecision = vi.fn().mockResolvedValue(null);
    const { captured, d } = deps({ host: 'windsurf', readPendingDecision });
    createSubmitAdvisoryForHost(d as never);
    await (captured.readPendingDecision as (r: string) => Promise<unknown>)('/proj');
    expect(readPendingDecision).toHaveBeenCalledWith('/proj', 'windsurf');
  });
});

describe('direct injection stays PRIMARY for every host', () => {
  it('passes injectDirect through, not the clipboard', async () => {
    const { captured, d } = deps();
    createSubmitAdvisoryForHost(d as never);
    await (captured.onInject as (t: string) => Promise<boolean>)('refined');
    const arg = (d.deliver as ReturnType<typeof vi.fn>).mock.calls[0][1] as Record<string, unknown>;
    expect(arg.injectDirect).toBe(d.injectDirect);
    expect(arg.fallbackClipboard).toBe(d.fallbackClipboard);
  });

  it('reports failure only when delivery failed outright', async () => {
    const { captured, d } = deps({ deliver: vi.fn().mockResolvedValue({ outcome: 'failed', landed: false }) });
    createSubmitAdvisoryForHost(d as never);
    await expect((captured.onInject as (t: string) => Promise<boolean>)('x')).resolves.toBe(false);
  });

  it('a clipboard fallback still counts as delivered', async () => {
    const { captured, d } = deps({ deliver: vi.fn().mockResolvedValue({ outcome: 'clipboard_fallback', landed: false }) });
    createSubmitAdvisoryForHost(d as never);
    await expect((captured.onInject as (t: string) => Promise<boolean>)('x')).resolves.toBe(true);
  });
});

describe('auto-submit is gated on having actually landed', () => {
  it('submits after a real injection', async () => {
    const { captured, d } = deps();
    createSubmitAdvisoryForHost(d as never);
    await (captured.onInject as (t: string) => Promise<boolean>)('x');
    await expect((captured.onSubmit as () => Promise<boolean>)()).resolves.toBe(true);
    expect(d.submit).toHaveBeenCalled();
  });

  it('does NOT submit after a clipboard fallback', async () => {
    // Enter would submit a composer the user has not pasted into yet.
    const { captured, d } = deps({ deliver: vi.fn().mockResolvedValue({ outcome: 'clipboard_fallback', landed: false }) });
    createSubmitAdvisoryForHost(d as never);
    await (captured.onInject as (t: string) => Promise<boolean>)('x');
    await expect((captured.onSubmit as () => Promise<boolean>)()).resolves.toBe(false);
    expect(d.submit).not.toHaveBeenCalled();
  });
});

describe('⭐ RC70 (F-3) — onOutcome reaches the poller on every host', () => {
  it('passes the host\'s onOutcome through to createPoller (Cursor used to get none)', () => {
    const onOutcome = vi.fn();
    const { captured, d } = deps({ host: 'cursor', onOutcome });
    createSubmitAdvisoryForHost(d as never);
    expect(captured.onOutcome).toBe(onOutcome);
  });
  it('absent onOutcome stays absent (no behaviour invented)', () => {
    const { captured, d } = deps({ host: 'windsurf' });
    createSubmitAdvisoryForHost(d as never);
    expect(captured.onOutcome).toBeUndefined();
  });
});
