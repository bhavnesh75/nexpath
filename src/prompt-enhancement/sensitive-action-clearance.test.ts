// The sensitive-action clearance gate + its plumbing, tested at the level this phase ships:
// the gate truth table, the classifier reply's soft-parsed fields, the request-field ride,
// and the inertness proof (absent field => byte-identical body on the deterministic path).
//
// ⚠️ Deliberately NOT here (they belong to the activation phase, together with the prompt
// block): the full body-level battery — both decision functions on the frozen 45-row set,
// the five fail-closed ways asserted on bodies, and the mutations.
import { describe, it, expect } from 'vitest';
import {
  promptEnhancementSensitiveActionClearedForTextV1,
  type PromptEnhancementSensitiveActionClearanceV1,
} from './sensitive-action-clearance.js';
import { parseStageClassifierReply } from '../classifier/stage-classifier.js';
import { routePromptEnhancement } from './routing-taxonomy.js';
import { preparePromptEnhancement } from './facade.js';
import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  type PromptEnhancementPrepareRequestV1,
} from './contracts.js';
import { getPromptStartStopSourceSnapshot } from './source-reality.js';
import { buildPromptEnhancementCostVisibilityMetadataV1 } from './cost-observability.js';
import { planPromptEnhancementSections } from './templates/section-plan.js';
import { composePromptEnhancementBody } from './compose-enhancement.js';
import type { PromptEnhancementSourceRefV1 } from './contracts.js';

const CANONICAL_MARKER = 'you must ask me for go-ahead confirmation';
const BENIGN_RISKY_PROMPT = 'drop a shadow under the header and remove the extra padding around the cards';

// The deterministic body composed for BENIGN_RISKY_PROMPT at the moment this phase began
// (harvested at pre-change HEAD). The inertness proof asserts the absent-clearance compose
// still produces exactly these bytes — the sentence present, wording unchanged.
const GOLDEN_BODY: string = JSON.parse(
  '"My original request (verbatim):\\ndrop a shadow under the header and remove the extra padding around the cards\\n\\nScope and non-goals:\\n- Cover Scope and non-goals for this request with concrete, source-backed specifics \\u2014 state what is required, how to implement it, and how to verify it.\\n\\nAssumptions and open questions:\\n- Cover Assumptions and open questions for this request with concrete, source-backed specifics \\u2014 state what is required, how to implement it, and how to verify it.\\n\\nWhat done looks like:\\n- State the expected output and acceptance criteria clearly enough that the implementation can be checked.\\n\\nThe separate points:\\n- Preserve the original request, dependencies, and completion checks inside this one prompt body.\\n\\nRisk, safety and confirmation:\\n- Name risky or irreversible actions, ask for required confirmation, and include rollback or recovery checks.\\n- Still, before you do this destructive file or codebase change you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.\\n\\nHow to verify:\\n- Include the verification command, focused scenario, or regression check that should prove the change.\\n\\nBest practices and standards:\\n- Treat what your recent practice shows as a working constraint, and turn it into direct implementation guidance."',
);

const sourceA: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'src-a-1',
  sourceKind: 'source_a_user_prompt',
  sourceId: 'prompt:clearance-1',
  freshness: 'current',
  confidence: 'high',
  privacyClass: 'local_private',
};

function composeBenignRiskyBody(clearance?: PromptEnhancementSensitiveActionClearanceV1): string {
  const route = routePromptEnhancement({
    routeDecisionId: 'clearance-route-1',
    promptText: BENIGN_RISKY_PROMPT,
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
  const planning = planPromptEnhancementSections({
    routeResult: route,
    sourceRefs: [sourceA],
    guidanceFacts: [],
  });
  const composed = composePromptEnhancementBody({
    enhancementId: 'clearance-enh-1',
    originalPromptText: BENIGN_RISKY_PROMPT,
    sectionPlanningResult: planning,
    ...(clearance !== undefined ? { sensitiveActionClearance: clearance } : {}),
  });
  return composed.currentBody.text;
}

describe('the clearance gate truth table — absent, degraded, malformed, reasonless, proposed ALL emit', () => {
  const text = BENIGN_RISKY_PROMPT;

  it('absent clearance never clears (the degraded call omits the field — same shape)', () => {
    expect(promptEnhancementSensitiveActionClearedForTextV1(text, undefined)).toBe(false);
  });

  it("verdict 'proposed' never clears", () => {
    expect(promptEnhancementSensitiveActionClearedForTextV1(text, { verdict: 'proposed', reason: 'a real deployment is proposed' })).toBe(false);
  });

  it('a malformed verdict never clears — only the exact literal counts', () => {
    for (const verdict of ['maybe', 'NOT_PROPOSED', 'not proposed', '', 'cleared']) {
      expect(promptEnhancementSensitiveActionClearedForTextV1(text, { verdict, reason: 'a stated reading' })).toBe(false);
    }
    expect(promptEnhancementSensitiveActionClearedForTextV1(text, { reason: 'a stated reading' })).toBe(false);
  });

  it('a reasonless clearance is VOID — asserting is not auditing', () => {
    expect(promptEnhancementSensitiveActionClearedForTextV1(text, { verdict: 'not_proposed' })).toBe(false);
    expect(promptEnhancementSensitiveActionClearedForTextV1(text, { verdict: 'not_proposed', reason: '' })).toBe(false);
    expect(promptEnhancementSensitiveActionClearedForTextV1(text, { verdict: 'not_proposed', reason: '   ' })).toBe(false);
  });

  it('only an explicit negative with a stated benign reading clears', () => {
    expect(promptEnhancementSensitiveActionClearedForTextV1(text, {
      verdict: 'not_proposed',
      reason: "'drop' here means a CSS box-shadow; no data or file is being removed",
    })).toBe(true);
  });

  it('an empty judged text has no candidates a clearance could apply to', () => {
    expect(promptEnhancementSensitiveActionClearedForTextV1('', { verdict: 'not_proposed', reason: 'benign' })).toBe(false);
    expect(promptEnhancementSensitiveActionClearedForTextV1('   ', { verdict: 'not_proposed', reason: 'benign' })).toBe(false);
  });
});

describe('the classifier reply fields parse SOFTLY, degrading to ABSENT — never to a default', () => {
  const baseReply = {
    stage: 'Implementation',
    stage_confidence: 0.8,
    signals_present: ['verification_gap'],
    signals_absent: [],
    fire_decision_session: false,
    reason: 'implementing',
  };

  it('valid verdict + reason are carried', () => {
    const parsed = parseStageClassifierReply(JSON.stringify({
      ...baseReply,
      sensitive_action_verdict: 'not_proposed',
      sensitive_action_reason: 'names a CSS effect only',
    }));
    expect(parsed.sensitiveActionVerdict).toBe('not_proposed');
    expect(parsed.sensitiveActionReason).toBe('names a CSS effect only');
  });

  it('an invalid verdict value degrades to absent without failing the classification', () => {
    const parsed = parseStageClassifierReply(JSON.stringify({
      ...baseReply,
      sensitive_action_verdict: 'definitely_fine',
      sensitive_action_reason: 'whatever',
    }));
    expect(parsed.stage).toBe('implementation');
    expect(parsed.sensitiveActionVerdict).toBeUndefined();
  });

  it('a non-string or whitespace-only reason degrades to absent', () => {
    for (const reason of [42, '', '   ', null, ['x']]) {
      const parsed = parseStageClassifierReply(JSON.stringify({
        ...baseReply,
        sensitive_action_verdict: 'not_proposed',
        sensitive_action_reason: reason,
      }));
      expect(parsed.sensitiveActionReason).toBeUndefined();
    }
  });

  it('fields absent entirely parse to absent — the pre-activation state of every real call', () => {
    const parsed = parseStageClassifierReply(JSON.stringify(baseReply));
    expect(parsed.sensitiveActionVerdict).toBeUndefined();
    expect(parsed.sensitiveActionReason).toBeUndefined();
  });
});

describe('the plumbing is CONNECTED end to end through compose (the wiring-exists proof)', () => {
  it('a valid clearance suppresses the canonical sentence on the deterministic path', () => {
    const body = composeBenignRiskyBody({
      verdict: 'not_proposed',
      reason: "'drop' here means a CSS box-shadow; no data or file is being removed",
    });
    expect(body).not.toContain(CANONICAL_MARKER);
  });

  it('a reasonless clearance is void ON THE WIRED PATH too — the sentence ships', () => {
    const body = composeBenignRiskyBody({ verdict: 'not_proposed' });
    expect(body).toContain(CANONICAL_MARKER);
  });
});

describe('the REQUEST field rides — request -> facade -> compose, end to end', () => {
  // A prompt shape the pipeline demonstrably shows a popup for (the facade suite's own
  // evidence-bearing shape), with a benign risky-word clause appended so the keyword
  // layer raises its candidate. Both tests assert a real popup composed (sections > 0)
  // so neither direction can pass vacuously on a skipped popup.
  const RIDE_PROMPT = 'Fix the failing payment test, the test failure blocks ci, and explain the verification. also drop a shadow under the submit button.';

  function prepareRequest(
    clearance?: PromptEnhancementSensitiveActionClearanceV1,
  ): PromptEnhancementPrepareRequestV1 {
    const promptStartStop = getPromptStartStopSourceSnapshot();
    return {
      schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
      requestId: 'clearance-ride-1',
      projectRoot: '/tmp/project',
      hostSurface: 'cli_stop_bridge',
      sourcePrompt: {
        text: RIDE_PROMPT,
        origin: 'user',
        capturedAt: 1,
        promptIndex: 1,
        generatedOriginPolicy: 'ordinary_source_a',
      },
      reviewMomentContext: {
        reviewMoment: 'UserPromptSubmit_preparation',
        currentAgentMode: 'workspace-write',
        projectId: 'project-1',
        sessionId: 'session-1',
        detectedLanguage: 'en',
        stageCandidate: 'implementation',
        promptCount: 1,
        recentPromptMetadataRefs: [],
        triggerProvenance: {
          currentStage: 'implementation',
          prevStage: 'task_breakdown',
          triggerKind: 'stage_transition',
          classifierState: 'fire_recommended',
          degradedNoActionState: 'none',
          promptStartBoundary: promptStartStop.hookBoundary,
          deliveryBoundary: promptStartStop.deliveryBoundary,
          promptStartCanReplaceSameTurn: false,
          ...(clearance !== undefined ? { classifierSensitiveActionClearance: clearance } : {}),
        },
      },
      sourceSignals: {
        sourceAOriginalPromptRef: { ...sourceA, sourceAuthorization: 'source_fact_only', evidenceStatus: 'present' },
        sourceRefs: [{ ...sourceA, sourceAuthorization: 'source_fact_only', evidenceStatus: 'present' }],
        normalizedStageAbsenceSignalRefs: [],
        contentTemplateRecordFactRefs: [],
        popupQuestionSourceRefs: [],
        whyHelpSourceRefs: [],
        profileRoleModeRefs: [],
        rightGoodWorkStyleEnvRuntimeRefs: [],
        missingMemoryCandidateRefs: [],
        sourceLabels: [{ sourceRefId: sourceA.sourceRefId, label: 'original_prompt', evidenceStatus: 'present' }],
        promptStartStop: {
          hookBoundary: promptStartStop.hookBoundary,
          deliveryBoundary: promptStartStop.deliveryBoundary,
          runAutoCanHoldOrReplaceSubmittedPrompt: false,
          sharedSignalCount: promptStartStop.sharedSignalCount,
          classifierDegradedNoFireReasons: promptStartStop.classifierDegradedNoFireReasons,
        },
        store: { schemaVersion: 1, missingPromptEnhancementTables: [], cleanupGaps: [] },
        transcriptPathState: 'not_authority',
        streamBOutputs: [],
        paramEventChannels: [],
        servedVariantIdentityRefs: [],
        deliveryGateRefs: [],
        sourceOnlyHardFactRefs: [],
      },
      userPreferenceContext: { levelState: 'default', scopedFeedbackEvidenceRefs: [] },
      configSnapshot: { sequenceEnabledState: 'not_enabled_v1', validatedEffectiveConfigState: 'valid', arbitraryConfigRowsAreAuthority: false },
      callVisibilityState: buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', {
        callVisibilityMode: 'deterministic',
        plannedCallCount: 0,
        usedCallCount: 0,
      }),
      privacyAndStoragePolicy: {
        sensitivityClass: 'normal',
        localStorageEligibility: 'ids_and_categories_only',
        telemetryEligibility: 'allowlisted_counts_only',
        llmSharingEligibility: 'allowed_minimal',
        generatedBodyStoragePolicy: 'do_not_store_raw_by_default',
      },
    };
  }

  it('a clearance in the trigger provenance reaches the composed body through the REAL facade path', async () => {
    const result = await preparePromptEnhancement(prepareRequest({
      verdict: 'not_proposed',
      reason: "'drop' here means a CSS box-shadow; no data or file is being removed",
    }));
    expect(result.currentBody.sections.length).toBeGreaterThan(0);
    expect(result.currentBody.text).not.toContain(CANONICAL_MARKER);
  });

  it('the same request WITHOUT the field emits the sentence — the fail-closed default on the real path', async () => {
    const result = await preparePromptEnhancement(prepareRequest(undefined));
    expect(result.currentBody.sections.length).toBeGreaterThan(0);
    expect(result.currentBody.text).toContain(CANONICAL_MARKER);
  });
});

describe('INERTNESS — with the field absent, behaviour is today\'s to the byte', () => {
  it('the absent-clearance body is byte-identical to the pre-change golden, sentence included', () => {
    const body = composeBenignRiskyBody(undefined);
    expect(body).toBe(GOLDEN_BODY);
    expect(body).toContain(CANONICAL_MARKER);
  });

  it('explicitly-undefined and key-absent compose identically', () => {
    const route = { a: composeBenignRiskyBody(undefined), b: composeBenignRiskyBody() };
    expect(route.a).toBe(route.b);
  });
});
