// The LIVE wiring for the two expectation lanes — the hook path, not the producer.
//
// Every layer of this milestone that shipped correct logic and reached nobody was caught the same
// way: by asking what the production path actually runs. The producers for "what done looks like"
// and "how to verify" are exercised elsewhere; what these tests cover is the hook that has to feed
// them — that the refs and their evidence are built at all, and that a failure in a NEIGHBOURING
// grounding source cannot silently take them down with it.
import { describe, it, expect, vi } from 'vitest';

const recentPrompts = vi.hoisted(() => ({ value: [] as { text: string }[], throws: false }));
const envFacts = vi.hoisted(() => ({ throws: false }));

vi.mock('../../store/prompts.js', () => ({
  getRecentPrompts: (_store: unknown, _root: string, limit: number) => {
    if (recentPrompts.throws) throw new Error('prompt store unavailable');
    // Newest-last, as the store returns it; the caller reverses.
    return recentPrompts.value.slice(-limit).map((record) => ({ ...record }));
  },
}));

vi.mock('../../store/env-facts.js', () => ({
  getProjectEnvFacts: () => {
    if (envFacts.throws) throw new Error('env facts unavailable');
    return null;
  },
  getProjectEnvFactHistory: () => [],
}));

const { buildPromptEnhancementGroundingRefsV1 } = await import('./auto.js');

function refsFor(prompts: readonly string[], options: { envFactsThrow?: boolean; promptsThrow?: boolean } = {}) {
  recentPrompts.value = prompts.map((text) => ({ text }));
  recentPrompts.throws = options.promptsThrow === true;
  envFacts.throws = options.envFactsThrow === true;
  return buildPromptEnhancementGroundingRefsV1({} as never, '/tmp/project', []);
}

const HISTORY_THAT_STATES = [
  'building a checkout page for my store',
  'it is done when the cart total updates without a page reload',
  'make sure the discount code still applies at checkout',
  'now add the payment step',
];

describe('the hook builds the expectation refs from recent prompts', () => {
  it('both lanes reach the request, with the developer own words as their evidence', () => {
    const built = refsFor(HISTORY_THAT_STATES);
    const acceptance = built.rightGoodWorkStyleEnvRuntimeRefs.filter((ref) => ref.startsWith('history_acceptance:'));
    const verification = built.rightGoodWorkStyleEnvRuntimeRefs.filter((ref) => ref.startsWith('history_verification:'));
    expect(acceptance.length).toBeGreaterThan(0);
    expect(verification.length).toBeGreaterThan(0);
    expect(built.groundingEvidenceByRef[acceptance[0]!]!.value).toContain('the cart total updates without a page reload');
    expect(built.groundingEvidenceByRef[verification[0]!]!.value).toContain('the discount code still applies at checkout');
  });

  it('a history that states nothing produces no refs — no filler crosses the boundary', () => {
    const built = refsFor(['fix the header', 'make it blue', 'why is this slow']);
    expect(built.rightGoodWorkStyleEnvRuntimeRefs.some((ref) => ref.startsWith('history_acceptance:'))).toBe(false);
    expect(built.rightGoodWorkStyleEnvRuntimeRefs.some((ref) => ref.startsWith('history_verification:'))).toBe(false);
  });
});

describe('the guard — a neighbouring failure cannot silence these lanes', () => {
  it('the env-facts source failing leaves the expectation refs intact', () => {
    // These loops first sat inside the env-facts try block, where this exact failure would have
    // skipped them with nothing in the record. A project with no stored env facts is ordinary.
    const built = refsFor(HISTORY_THAT_STATES, { envFactsThrow: true });
    expect(built.rightGoodWorkStyleEnvRuntimeRefs.some((ref) => ref.startsWith('history_acceptance:'))).toBe(true);
    expect(built.rightGoodWorkStyleEnvRuntimeRefs.some((ref) => ref.startsWith('history_verification:'))).toBe(true);
  });

  it('and their OWN failure is contained — the request still builds', () => {
    const built = refsFor(HISTORY_THAT_STATES, { promptsThrow: true });
    expect(built.rightGoodWorkStyleEnvRuntimeRefs.some((ref) => ref.startsWith('history_acceptance:'))).toBe(false);
    expect(Array.isArray(built.rightGoodWorkStyleEnvRuntimeRefs)).toBe(true);
  });
});
