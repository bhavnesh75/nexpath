// The confirmation instruction may never travel through the fact-VALUE channel.
//
// 🔴 Measured on a real body (sim-s12 RUN 2, P38). The `history_sensitive_action:` fact carried the
// safeguard SENTENCE as its value, and the possibility clamp rendered:
//   "deployment appears to be Still, before you do this sensitive action you must ask me for
//    go-ahead confirmation … (from a recent project check) — confirm before relying on it."
// Ungrammatical, because the value slot holds a state and not an imperative; and inverted, because
// a mandatory instruction arrived wrapped in a hedge that demotes it. The same body already carried
// the correct code-inserted clause, naming the real category — so this was a worse duplicate of
// something said better three lines below.
//
// These tests fix the shape of the fix rather than its wording: the value states an observation,
// the imperative never appears in a value, and the section that the fact exists to feed still gets
// a line of its own.
import { describe, it, expect } from 'vitest';
import {
  promptHistorySafeguardSentenceV1,
  promptHistorySensitiveActionObservationV1,
} from './prompt-history-signals.js';
import { promptEnhancementFactValueLinesV1 } from './fact-value-render.js';
import type { PromptEnhancementGuidanceFact } from './contracts.js';

/** The fact as `guidance-facts.ts` builds it for a `history_sensitive_action:` ref. */
function historySafetyFact(value: string): PromptEnhancementGuidanceFact {
  return {
    factId: 'history-safety-1',
    sourceType: 'prompt_derived_fact',
    sourceIds: ['history_sensitive_action:deployment'],
    sourceEligibilityState: 'support_only_not_triggering',
    guidanceKind: 'safety_or_confirmation',
    suggestedActionKind: 'confirm_risk',
    targetFamily: 'family_agnostic',
    targetSectionKind: '',
    sourceEvidenceState: 'partial',
    sourceOriginScope: 'recent_prompt_history',
    claimVerbPolicy: 'must_phrase_as_possibility',
    factRole: 'safety_confirmation_support',
    priority: 'normal',
    renderPolicy: 'render_as_section',
    riskLevel: 'sensitive_authority_risky',
    safetyHooks: ['safety_sensitive_source'],
    privacyClass: 'public_safe',
    sanitizationState: 'not_applicable',
    evidence: {
      key: 'deployment',
      value,
      runtimePath: 'local_store',
      anchorScope: 'current_prompt_scope',
    },
    confidenceBand: 'low',
    recencyBand: 'recent_project',
    publicCopySafe: true,
  } as unknown as PromptEnhancementGuidanceFact;
}

function riskLines(value: string): readonly string[] {
  return promptEnhancementFactValueLinesV1('risk_safety_or_confirmation', [historySafetyFact(value)]);
}

describe('the safeguard instruction never occupies a fact value', () => {
  it('the observation reads as a state under the possibility clamp', () => {
    const lines = riskLines(promptHistorySensitiveActionObservationV1());
    expect(lines).toHaveLength(1);
    // "<key> appears to be <value>" only reads as English when the value is a state. The clamp's
    // own hedge is kept: this detector is uncorroborated, so the hedge is honest here.
    expect(lines[0]).toContain('deployment appears to be something you raised in recent prompts');
    expect(lines[0]).toContain('confirm before relying on it');
  });

  it('the imperative is absent from the rendered value line', () => {
    const lines = riskLines(promptHistorySensitiveActionObservationV1());
    expect(lines[0]).not.toContain('you must ask me for go-ahead confirmation');
    // The whole defect in one assertion: no value line may open a sentence mid-imperative.
    expect(lines[0]).not.toContain('appears to be Still,');
  });

  it('and the old value is what produced the measured defect — proving this test can fail', () => {
    // Guards against a vacuous pass: fed the ORIGINAL value, the renderer still emits the exact
    // broken sentence. The fix is the producer's choice of value, so the producer is what is pinned.
    const lines = riskLines(promptHistorySafeguardSentenceV1());
    expect(lines[0]).toContain('deployment appears to be Still, before you do this sensitive action');
    expect(lines[0]).toContain('you must ask me for go-ahead confirmation');
  });

  it('the section the fact exists to feed still states a line of its own', () => {
    // The fact keeps a value rather than dropping to none: dropping it would leave
    // `risk_safety_or_confirmation` with only its standing instruction, and the fact's
    // safety hook is what makes that section floor material in the first place.
    expect(riskLines(promptHistorySensitiveActionObservationV1())).not.toHaveLength(0);
  });
});
