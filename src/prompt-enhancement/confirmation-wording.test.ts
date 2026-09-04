// The locked confirmation wording — the ground-level clause, at every surface that carries it.
//
// The danger in this change was never the edit; it is the six consumers of the string, three of
// which fail silently. These tests are the §6.1 assertion table made executable: each one names
// the consumer it discriminates, and the recorded mutations prove none of them is decorative.
import { describe, it, expect } from 'vitest';
import { routePromptEnhancement } from './routing-taxonomy.js';
import { planPromptEnhancementSections } from './templates/section-plan.js';
import { composePromptEnhancementBody } from './compose-enhancement.js';
import {
  validatePromptEnhancementSafety,
  buildPromptEnhancementCanonicalConfirmation,
  resolvePromptEnhancementSensitiveActionNamingV1,
  PROMPT_ENHANCEMENT_CANONICAL_CONFIRMATION,
} from './safety-sendability.js';
import { promptHistorySafeguardSentenceV1 } from './prompt-history-signals.js';
import { buildL2SafeguardSentence } from '../decision-session/r5-injection.js';
import type { PromptEnhancementSourceRefV1, PromptEnhancementStructuredComposerOutputV1 } from './contracts.js';
import type { PromptEnhancementTypedSensitiveActionVerdictV1 } from './sensitive-action-clearance.js';

// The two halves the locked wording adds. Asserted separately so a partial revert is visible.
const CERTAINTY_BAR = 'confirm the actual state at ground level by reading the real source';
const ANTI_ASSUMPTION = 'Do not assume, and do not rely on what you did earlier in this session.';
const SENTENCE_HEAD = 'Still, before you do this ';

const EXEC_RISKY_PROMPT = 'delete the old migrations folder before the demo';
const SECRET_CONTEXT_PROMPT = 'add login so nobody else can see my dashboard';
const TYPED: PromptEnhancementTypedSensitiveActionVerdictV1 = { actionLabel: 'credential exposure' };

const sourceA: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'src-a-1',
  sourceKind: 'source_a_user_prompt',
  sourceId: 'prompt:wording-1',
  freshness: 'current',
  confidence: 'high',
  privacyClass: 'local_private',
};

function planFor(prompt: string) {
  const route = routePromptEnhancement({
    routeDecisionId: 'wording-route',
    promptText: prompt,
    currentStage: 'implementation',
    prevStage: 'task_breakdown',
    triggerKind: 'absence',
    firedKey: 'absence:verification_gap@implementation',
    effectiveFiredSource: 'classifier_fire_recommendation',
    selectedQualifyingAbsence: 'verification_gap',
    absenceGateReason: 'selected_qualifying_absence',
    classifierState: 'fire_recommended',
    degradedNoActionState: 'none',
    generatedOriginState: 'ordinary_user_prompt',
  });
  return planPromptEnhancementSections({ routeResult: route, sourceRefs: [sourceA], guidanceFacts: [] });
}

function composeFor(prompt: string, typed?: PromptEnhancementTypedSensitiveActionVerdictV1) {
  return composePromptEnhancementBody({
    enhancementId: 'wording-enh',
    originalPromptText: prompt,
    sectionPlanningResult: planFor(prompt),
    ...(typed !== undefined ? { typedSensitiveActionVerdict: typed } : {}),
  });
}

/** Compose through the LLM-draft path, so the sentence lands via the draft-hosting insert. */
function composeWithDraft(prompt: string, draftText: string) {
  const planning = planFor(prompt);
  const host = planning.sectionPlans.find((section) => section.sectionKind !== 'original_request_or_goal');
  expect(host).toBeDefined();
  const factId = host!.structuredContentPartRefs[0] ?? 'wording-fact-missing';
  const structuredComposerOutput: PromptEnhancementStructuredComposerOutputV1 = {
    outputId: 'wording-llm-1',
    sectionDrafts: [{ sectionId: host!.sectionId, bodyText: draftText, sourceFactIds: [factId] }],
    composerClaims: [`claim:${factId}`],
  };
  return composePromptEnhancementBody({
    enhancementId: 'wording-enh-llm',
    originalPromptText: prompt,
    sectionPlanningResult: planning,
    composerRuntimeState: 'accepted_structured_output',
    structuredComposerOutput,
  });
}

const countOf = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

describe('§6.1 assertion 1 — the composed line carries the certainty bar AND the anti-assumption clause', () => {
  it('a firing body contains both halves of the locked wording', () => {
    const text = composeFor(EXEC_RISKY_PROMPT).currentBody.text;
    expect(text).toContain(CERTAINTY_BAR);
    expect(text).toContain(ANTI_ASSUMPTION);
  });

  it('the exported template constant carries the full locked wording around its placeholder', () => {
    expect(PROMPT_ENHANCEMENT_CANONICAL_CONFIRMATION).toContain('<specific sensitive action>');
    expect(PROMPT_ENHANCEMENT_CANONICAL_CONFIRMATION).toContain(CERTAINTY_BAR);
    expect(PROMPT_ENHANCEMENT_CANONICAL_CONFIRMATION).toContain(ANTI_ASSUMPTION);
  });
});

describe('§6.1 assertion 2 — inserted exactly once, the duplication guard still recognises the line', () => {
  it('a firing deterministic body carries the sentence head exactly once', () => {
    expect(countOf(composeFor(EXEC_RISKY_PROMPT).currentBody.text, SENTENCE_HEAD)).toBe(1);
  });

  it('a draft that already contains the canonical sentence is not given a second copy (the parity-path guard)', () => {
    // The duplication guard lives on the parity re-render path: point 1 must NOT have fired
    // (question-shaped prompt), the draft itself carries risk words AND the exact canonical
    // sentence — without the guard the parity re-render would append a SECOND copy.
    const prompt = 'how should I clean up the old migrations folder?';
    const sentence = buildPromptEnhancementCanonicalConfirmation(prompt);
    const composed = composeWithDraft(prompt, `Delete the old migrations folder carefully. ${sentence}`);
    expect(countOf(composed.currentBody.text, SENTENCE_HEAD)).toBe(1);
  });
});

describe('§6.1 assertion 3 — both insertion paths place the line', () => {
  it('the deterministic standalone-line path inserts it', () => {
    expect(composeFor(EXEC_RISKY_PROMPT).currentBody.text)
      .toContain(buildPromptEnhancementCanonicalConfirmation(EXEC_RISKY_PROMPT));
  });

  it('the draft-hosting bulleted path inserts it after a model draft', () => {
    const composed = composeWithDraft(EXEC_RISKY_PROMPT, 'Handle the folder cleanup as requested.');
    expect(composed.currentBody.text)
      .toContain(buildPromptEnhancementCanonicalConfirmation(EXEC_RISKY_PROMPT));
  });
});

describe('§6.1 assertions 4+5+6 — parity matches, both strippers strip, and the body is NOT blocked', () => {
  it('a risky body carrying the new line validates clean: no missing-confirmation, no escalation, not blocking', () => {
    const composed = composeFor(EXEC_RISKY_PROMPT);
    const validation = validatePromptEnhancementSafety({ currentBody: composed.currentBody });
    expect(validation.failures.some((f) => f.failureCode.startsWith('missing_or_weak_confirmation'))).toBe(false);
    expect(validation.failures.some((f) => f.failureCode.startsWith('authority_escalation'))).toBe(false);
    expect(validation.sendPolicy).not.toBe('no_send');
  });
});

describe('Half B — §6i.6 activated: the typed body NAMES the credential exposure (P4\'s obligation consumed)', () => {
  it('the sentence says "this credential exposure" on a typed secret-in-prompt body', () => {
    const text = composeFor(SECRET_CONTEXT_PROMPT, TYPED).currentBody.text;
    expect(text).toContain('this credential exposure you must ask me for go-ahead confirmation');
  });

  it('the named sentence round-trips the WHOLE validator — parity and both strippers use the carried string', () => {
    // The §6d.13 prediction this seam exists to forbid: a per-site rebuild would derive the
    // KEYWORD naming, miss the strip of the TYPED-named sentence, and scan the safety line
    // itself ("credential" matches a risk pattern). Zero failures here proves the carry.
    const composed = composeFor(SECRET_CONTEXT_PROMPT, TYPED);
    const validation = validatePromptEnhancementSafety({
      currentBody: composed.currentBody,
      typedSensitiveActionVerdict: TYPED,
    });
    expect(validation.failures.some((f) => f.failureCode.startsWith('missing_or_weak_confirmation'))).toBe(false);
    expect(validation.failures.some((f) => f.failureCode.startsWith('authority_escalation'))).toBe(false);
    expect(validation.sendPolicy).not.toBe('no_send');
  });
});

describe('the naming ladder — typed beats keyword beats generic, deterministic and fail-closed', () => {
  it('typed beats keyword: a risky-keyword prompt WITH the typed verdict is named by the verdict', () => {
    expect(resolvePromptEnhancementSensitiveActionNamingV1(EXEC_RISKY_PROMPT, TYPED)).toBe('credential exposure');
  });

  it('keyword when no typed: the phrase derivation names the matched risk', () => {
    expect(resolvePromptEnhancementSensitiveActionNamingV1(EXEC_RISKY_PROMPT))
      .toBe('destructive file or codebase change');
  });

  it('generic when neither: the fallback naming, exactly as today', () => {
    expect(resolvePromptEnhancementSensitiveActionNamingV1('center the hero text')).toBe('sensitive action');
  });

  it('a malformed typed verdict falls through to the keyword rung, never into the sentence', () => {
    expect(resolvePromptEnhancementSensitiveActionNamingV1(EXEC_RISKY_PROMPT, { actionLabel: '   ' }))
      .toBe('destructive file or codebase change');
  });
});

describe('the deploy-phrase fix — an OUTPUT phrase changed, no match pattern touched', () => {
  it('a release-shaped prompt is named with the reworded phrase, and the trap phrase is gone', () => {
    const sentence = buildPromptEnhancementCanonicalConfirmation('Deploy this release to production.');
    expect(sentence).toContain('production release or rollout');
    expect(sentence).not.toContain('production deploy or release');
  });
});

describe('the lane split — the enhanced-prompt history sentence is PE-owned; decision-session surfaces are untouched', () => {
  it('the history-lane sentence carries the full locked clause', () => {
    const sentence = promptHistorySafeguardSentenceV1();
    expect(sentence).toContain('this sensitive action');
    expect(sentence).toContain(CERTAINTY_BAR);
    expect(sentence).toContain(ANTI_ASSUMPTION);
  });

  it('the decision-session builder still produces its own OLD sentence, byte-identical to before the split', () => {
    // The split ruling's whole point: rewording the shared builder would have changed
    // decision-session option desc-bases outside this change's scope.
    expect(buildL2SafeguardSentence([]))
      .toBe('Still, before you do this this sensitive action you must ask me for go-ahead confirmation.');
    expect(buildL2SafeguardSentence([])).not.toContain(CERTAINTY_BAR);
  });
});
