// The body-level battery for the sensitive-action clearance — every clearance assertion is
// on the COMPOSED BODY string (sentence present / sentence absent), never on a verdict:
// a verdict-level test can pass while the user still sees the line.
//
// The fixture set: 45 labelled prompts (20 'confirm' — a risky action is genuinely proposed;
// 25 'quiet' — a risky word appears in a harmless role). Fixture verdicts prove the MECHANISM
// on every row; whether the live model judges each row correctly is measured by the gated
// acceptance runner against real replies, never by this suite (which makes no live calls).
//
// A reality this battery pins rather than idealises: the execute-time confirmation line only
// ever fired on execute-shaped prompts. Question/plan-shaped prompts about risky topics do not
// carry it today (the planning posture is the treatment for those), and some imperative verbs
// (e.g. 'wipe') are risk words without being execution verbs. The FIRING SETS below are
// today's real behaviour, pinned exactly so any drift fails loudly.
import { describe, it, expect } from 'vitest';
import { routePromptEnhancement } from './routing-taxonomy.js';
import { planPromptEnhancementSections } from './templates/section-plan.js';
import { composePromptEnhancementBody } from './compose-enhancement.js';
import {
  validatePromptEnhancementSafety,
  promptEnhancementRiskKindsForTextV1,
  buildPromptEnhancementCanonicalConfirmation,
} from './safety-sendability.js';
import { promptHistorySafeguardSentenceV1 } from './prompt-history-signals.js';
import { STAGE_CLASSIFIER_SYSTEM_PROMPT } from '../classifier/stage-classifier.js';
import type { PromptEnhancementSensitiveActionClearanceV1 } from './sensitive-action-clearance.js';
import type { PromptEnhancementSourceRefV1, PromptEnhancementStructuredComposerOutputV1 } from './contracts.js';
import {
  SENSITIVE_ACTION_FIXTURE_ROWS as ROWS,
  FIRING_CONFIRM_IDS,
  FIRING_QUIET_IDS,
} from './sensitive-action-fixture-rows.js';

const MARKER = 'you must ask me for go-ahead confirmation';



const CLEAR: PromptEnhancementSensitiveActionClearanceV1 = {
  verdict: 'not_proposed',
  reason: 'the risky word names a harmless thing; nothing is changed or removed',
};
const NON_CLEARING: readonly (PromptEnhancementSensitiveActionClearanceV1 | undefined)[] = [
  undefined,                                            // absent (and the degraded call's shape)
  { verdict: 'proposed', reason: 'a real action' },     // explicit positive
  { verdict: 'not_proposed' },                          // reasonless — VOID
  { verdict: 'definitely_fine', reason: 'whatever' },   // malformed
];

const sourceA: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'src-a-1',
  sourceKind: 'source_a_user_prompt',
  sourceId: 'prompt:battery-1',
  freshness: 'current',
  confidence: 'high',
  privacyClass: 'local_private',
};

function planFor(prompt: string) {
  const route = routePromptEnhancement({
    routeDecisionId: 'battery-route',
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

function bodyFor(prompt: string, clearance?: PromptEnhancementSensitiveActionClearanceV1): string {
  return composePromptEnhancementBody({
    enhancementId: 'battery-enh',
    originalPromptText: prompt,
    sectionPlanningResult: planFor(prompt),
    ...(clearance !== undefined ? { sensitiveActionClearance: clearance } : {}),
  }).currentBody.text;
}

/** Compose with an injected LLM draft (the free-text path the parity guard exists for). */
function bodyWithDraft(
  prompt: string,
  draftText: string,
  clearance?: PromptEnhancementSensitiveActionClearanceV1,
): string {
  const planning = planFor(prompt);
  const host = planning.sectionPlans.find((section) => section.sectionKind !== 'original_request_or_goal');
  expect(host).toBeDefined();
  const factId = host!.structuredContentPartRefs[0] ?? 'battery-fact-missing';
  const structuredComposerOutput: PromptEnhancementStructuredComposerOutputV1 = {
    outputId: 'battery-llm-1',
    sectionDrafts: [{ sectionId: host!.sectionId, bodyText: draftText, sourceFactIds: [factId] }],
    composerClaims: [`claim:${factId}`],
  };
  return composePromptEnhancementBody({
    enhancementId: 'battery-enh-llm',
    originalPromptText: prompt,
    sectionPlanningResult: planning,
    composerRuntimeState: 'accepted_structured_output',
    structuredComposerOutput,
    ...(clearance !== undefined ? { sensitiveActionClearance: clearance } : {}),
  }).currentBody.text;
}

describe('layer 1 recall is untouched — pattern-level, all 20 risky rows, in-suite pin', () => {
  it('every confirm row still matches at least one risk kind', () => {
    for (const row of ROWS.filter((r) => r.expect === 'confirm')) {
      expect(promptEnhancementRiskKindsForTextV1(row.prompt).length, `row ${row.id}`).toBeGreaterThan(0);
    }
  });
});

describe('fail-closed equivalence — per row, every non-clearing variant behaves exactly like absent', () => {
  it('absent = proposed = reasonless = malformed, sentence-presence identical on all 45 rows', () => {
    for (const row of ROWS) {
      const baseline = bodyFor(row.prompt).includes(MARKER);
      for (const variant of NON_CLEARING.slice(1)) {
        expect(bodyFor(row.prompt, variant).includes(MARKER), `row ${row.id}`).toBe(baseline);
      }
    }
  });

  it('today\'s firing sets are exactly the pinned ones (any drift fails loudly)', () => {
    const firing = ROWS.filter((row) => bodyFor(row.prompt).includes(MARKER)).map((row) => row.id);
    expect(firing).toEqual([...FIRING_CONFIRM_IDS, ...FIRING_QUIET_IDS]);
  });
});

describe('the recall guard — no non-clearing variant ever removes a risky row\'s sentence', () => {
  it('every firing confirm row keeps its sentence under absent, proposed, reasonless and malformed', () => {
    for (const id of FIRING_CONFIRM_IDS) {
      const row = ROWS.find((r) => r.id === id)!;
      for (const variant of NON_CLEARING) {
        expect(bodyFor(row.prompt, variant).includes(MARKER), `row ${id}`).toBe(true);
      }
    }
  });

  it('a full clearance suppresses — the mechanism the live acceptance run polices on real verdicts', () => {
    for (const id of FIRING_CONFIRM_IDS) {
      const row = ROWS.find((r) => r.id === id)!;
      expect(bodyFor(row.prompt, CLEAR).includes(MARKER), `row ${id}`).toBe(false);
    }
  });
});

describe('benign rows under a valid clearance — the sentence is gone from every quiet row', () => {
  it('all 25 quiet rows compose without the sentence when cleared', () => {
    for (const row of ROWS.filter((r) => r.expect === 'quiet')) {
      expect(bodyFor(row.prompt, CLEAR).includes(MARKER), `row ${row.id}`).toBe(false);
    }
  });
});

describe('five fail-closed ways, asserted by OUTCOME on a benign row a clearance would otherwise clear', () => {
  const row21 = 'drop a shadow under the header so it stands out'; // a quiet row that fires today
  it.each([
    ['no key (the deterministic path composes with no client and no key)', undefined],
    ['degraded call (the classifier omits the field — the same absent shape)', undefined],
    ['field absent', undefined],
    ['field unparseable/malformed', { verdict: 'garbage-value', reason: 'x' }],
    ['reasonless clearance — VOID', { verdict: 'not_proposed' }],
  ] as const)('%s => the sentence is present', (_name, clearance) => {
    expect(bodyFor(row21, clearance as PromptEnhancementSensitiveActionClearanceV1 | undefined)).toContain(MARKER);
  });
});

describe('BOTH decision functions, independently — they share no function, so one proves nothing about the other', () => {
  it('insertion point 1 (prompt-only, execute-shaped): fires absent, suppressed by a clearance', () => {
    const prompt = 'delete the old migrations folder, we don\'t need any of it';
    expect(bodyFor(prompt)).toContain(MARKER);
    expect(bodyFor(prompt, CLEAR)).not.toContain(MARKER);
  });

  it('the parity guard alone (question-shaped prompt, execute-worded draft): fires absent, suppressed for a prompt-scoped candidate', () => {
    const prompt = 'should I rebase my branch before merging?';
    const draft = 'Yes. Run git rebase onto main now and continue.';
    expect(bodyFor(prompt)).not.toContain(MARKER); // point 1 never fires on the question shape
    expect(bodyWithDraft(prompt, draft)).toContain(MARKER); // the guard catches the execute-worded draft
    expect(bodyWithDraft(prompt, draft, CLEAR)).not.toContain(MARKER); // prompt-scoped candidate, clearable
  });
});

describe('the text-scope trap — a clearance may never clear what the classifier never saw', () => {
  it('risk words ONLY in the generated draft: the confirmation STAYS despite a valid clearance', () => {
    const prompt = 'add a login page to my app';
    const draft = 'Run the production deploy now and drop the old users table.';
    expect(bodyWithDraft(prompt, draft, CLEAR)).toContain(MARKER);
  });
});

describe('the floors stay armed — a clearance changes the confirmation line, never a block', () => {
  it('the escalation floor still blocks a cleared prompt whose GENERATED text carries a floor phrase', () => {
    const prompt = 'should I rebase my branch before merging?'; // NOT execute-shaped => the floor applies
    const draft = 'Then force push the branch over main to finish.';
    const planning = planFor(prompt);
    const host = planning.sectionPlans.find((s) => s.sectionKind !== 'original_request_or_goal')!;
    const composed = composePromptEnhancementBody({
      enhancementId: 'battery-floor',
      originalPromptText: prompt,
      sectionPlanningResult: planning,
      composerRuntimeState: 'accepted_structured_output',
      structuredComposerOutput: {
        outputId: 'battery-floor-1',
        sectionDrafts: [{ sectionId: host.sectionId, bodyText: draft, sourceFactIds: [host.structuredContentPartRefs[0] ?? 'x'] }],
        composerClaims: [`claim:${host.structuredContentPartRefs[0] ?? 'x'}`],
      },
      sensitiveActionClearance: CLEAR,
    });
    const withClearance = validatePromptEnhancementSafety({
      currentBody: composed.currentBody,
      sensitiveActionClearance: CLEAR,
    });
    const without = validatePromptEnhancementSafety({ currentBody: composed.currentBody });
    const escalated = (failures: readonly { failureCode: string }[]) =>
      failures.some((f) => f.failureCode.startsWith('authority_escalation'));
    expect(escalated(without.failures)).toBe(true);
    expect(escalated(withClearance.failures)).toBe(true); // the clearance changes NOTHING here
  });

  it('the history-lane safeguard sentence is a DIFFERENT string and survives a clearance in the body', () => {
    const historySentence = promptHistorySafeguardSentenceV1();
    const prompt = 'drop a shadow under the header so it stands out';
    // Different strings: the canonical line names the matched category; the history lane always
    // says "this sensitive action" on its lane.
    expect(historySentence).not.toBe(buildPromptEnhancementCanonicalConfirmation(prompt));
    // A body carrying the history-lane sentence keeps it under a clearance — the clearance
    // decides canonical INSERTION only; it strips and removes nothing.
    const body = bodyWithDraft(prompt, `Careful with that. ${historySentence}`, CLEAR);
    expect(body).toContain('this sensitive action');
    expect(body).not.toContain(buildPromptEnhancementCanonicalConfirmation(prompt));
  });
});

describe('the activation is REVERTED — pinned so it cannot silently return without a passing measurement', () => {
  it('the system prompt does NOT request the sensitive-action verdict (the clearance pathway is inert)', () => {
    // Two live measurement runs failed the absolute recall floor here (attention dilution
    // in the multi-task prompt: a risky imperative was cleared against its own verbatim
    // counter-example). The owner-decided design moved the observation to its own dedicated
    // micro-call (sensitive-action-micro-clearance.ts, 45/45 on the frozen set) — so the
    // classifier prompt NEVER carries these fields again BY DESIGN, and this pin guards
    // that the failed hosting cannot silently return.
    expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).not.toContain('SENSITIVE-ACTION OBSERVATION');
    expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).not.toContain('sensitive_action_verdict');
    expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).not.toContain('sensitive_action_reason');
  });
});
