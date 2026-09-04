// The typed secret-in-prompt recall source — body-level tests.
//
// The defect being closed: the system's one PRECISE risk detector (typed secret-in-prompt
// signals) had its output discarded, while the noisy keyword layer alone decided the
// confirmation line. This suite proves the typed verdict now reaches the line — as a SECOND
// recall source OR-ed after the clearance gate — without replacing, blocking, or becoming
// clearable.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { routePromptEnhancement } from './routing-taxonomy.js';
import { planPromptEnhancementSections } from './templates/section-plan.js';
import { composePromptEnhancementBody } from './compose-enhancement.js';
import {
  validatePromptEnhancementSafety,
  promptEnhancementRiskKindsForTextV1,
} from './safety-sendability.js';
import { preparePromptEnhancement } from './facade.js';
import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  type PromptEnhancementPrepareRequestV1,
  type PromptEnhancementSourceRefV1,
} from './contracts.js';
import { getPromptStartStopSourceSnapshot } from './source-reality.js';
import { buildPromptEnhancementCostVisibilityMetadataV1 } from './cost-observability.js';
import type {
  PromptEnhancementSensitiveActionClearanceV1,
  PromptEnhancementTypedSensitiveActionVerdictV1,
} from './sensitive-action-clearance.js';
import { SENSITIVE_ACTION_FIXTURE_ROWS as ROWS, FIRING_CONFIRM_IDS, FIRING_QUIET_IDS } from './sensitive-action-fixture-rows.js';

const MARKER = 'you must ask me for go-ahead confirmation';
// The whole issue in one prompt: a secret was pasted in recent history, the ask itself
// carries not one risk keyword — only the typed detector knows.
const SECRET_CONTEXT_PROMPT = 'add login so nobody else can see my dashboard';
const TYPED: PromptEnhancementTypedSensitiveActionVerdictV1 = { actionLabel: 'credential exposure' };
const CLEAR: PromptEnhancementSensitiveActionClearanceV1 = {
  verdict: 'not_proposed',
  reason: 'the risky word names a harmless thing; nothing is changed or removed',
};

const sourceA: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'src-a-1',
  sourceKind: 'source_a_user_prompt',
  sourceId: 'prompt:typed-1',
  freshness: 'current',
  confidence: 'high',
  privacyClass: 'local_private',
};

function composeFor(prompt: string, options: {
  typed?: PromptEnhancementTypedSensitiveActionVerdictV1;
  clearance?: PromptEnhancementSensitiveActionClearanceV1;
} = {}) {
  const route = routePromptEnhancement({
    routeDecisionId: 'typed-route',
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
  const planning = planPromptEnhancementSections({ routeResult: route, sourceRefs: [sourceA], guidanceFacts: [] });
  return composePromptEnhancementBody({
    enhancementId: 'typed-enh',
    originalPromptText: prompt,
    sectionPlanningResult: planning,
    ...(options.typed !== undefined ? { typedSensitiveActionVerdict: options.typed } : {}),
    ...(options.clearance !== undefined ? { sensitiveActionClearance: options.clearance } : {}),
  });
}

describe('the whole issue in one assertion — emit AND not block', () => {
  it('the secret-context prompt matches NO risk pattern (the premise)', () => {
    expect(promptEnhancementRiskKindsForTextV1(SECRET_CONTEXT_PROMPT).length).toBe(0);
  });

  it('with the typed verdict, the composed body CONTAINS the canonical line', () => {
    expect(composeFor(SECRET_CONTEXT_PROMPT, { typed: TYPED }).currentBody.text).toContain(MARKER);
  });

  it('and validation PASSES — required-and-present, never required-and-missing (the parity proof)', () => {
    const composed = composeFor(SECRET_CONTEXT_PROMPT, { typed: TYPED });
    const validation = validatePromptEnhancementSafety({
      currentBody: composed.currentBody,
      typedSensitiveActionVerdict: TYPED,
    });
    expect(validation.failures.some((f) => f.failureCode.startsWith('missing_or_weak_confirmation'))).toBe(false);
  });

  it('a validator-only wiring would have blocked: the same body WITHOUT compose-side insertion fails', () => {
    // Compose withOUT the verdict (no sentence), validate WITH it — the mismatch the
    // both-layers rule exists to prevent, demonstrated rather than asserted.
    const composed = composeFor(SECRET_CONTEXT_PROMPT);
    const validation = validatePromptEnhancementSafety({
      currentBody: composed.currentBody,
      typedSensitiveActionVerdict: TYPED,
    });
    expect(validation.failures.some((f) => f.failureCode.startsWith('missing_or_weak_confirmation'))).toBe(true);
  });
});

describe('ADD, never replace — the keyword layer is untouched by the typed path', () => {
  it('with the typed verdict ABSENT, the firing sets are exactly the pinned baseline (all 45 rows)', () => {
    const firing = ROWS.filter((row) => composeFor(row.prompt).currentBody.text.includes(MARKER)).map((row) => row.id);
    expect(firing).toEqual([...FIRING_CONFIRM_IDS, ...FIRING_QUIET_IDS]);
  });

  it('adding the typed verdict to a keyword-firing row changes nothing about its sentence', () => {
    const row = ROWS.find((r) => r.id === 1)!;
    expect(composeFor(row.prompt, { typed: TYPED }).currentBody.text).toContain(MARKER);
  });
});

describe('fail-closed — absent and malformed both mean today, at both layers', () => {
  it('absent: the secret-context prompt composes with NO sentence (no keyword candidate exists)', () => {
    expect(composeFor(SECRET_CONTEXT_PROMPT).currentBody.text).not.toContain(MARKER);
  });

  it('runtime-malformed shapes count as absent', () => {
    for (const bad of [{ actionLabel: '' }, { actionLabel: '   ' }, { actionLabel: 42 as unknown as string }]) {
      expect(composeFor(SECRET_CONTEXT_PROMPT, { typed: bad }).currentBody.text).not.toContain(MARKER);
    }
  });
});

describe('clearance independence — the typed half is NEVER clearable', () => {
  it('a keyword-firing prompt with a valid clearance AND the typed verdict keeps its sentence', () => {
    const row = ROWS.find((r) => r.id === 21)!; // benign keyword-firing row
    // Clearance alone removes the sentence (the clearance battery proves that); the typed
    // verdict sits OUTSIDE the clearance gate and keeps it.
    expect(composeFor(row.prompt, { clearance: CLEAR }).currentBody.text).not.toContain(MARKER);
    expect(composeFor(row.prompt, { clearance: CLEAR, typed: TYPED }).currentBody.text).toContain(MARKER);
  });
});

describe('fail-closed at the VALIDATOR layer — absent and malformed contribute nothing', () => {
  it('a non-firing body validated with malformed typed shapes reads none, exactly as with no verdict', () => {
    const composed = composeFor(SECRET_CONTEXT_PROMPT); // no keyword candidate, no sentence
    const baseline = validatePromptEnhancementSafety({ currentBody: composed.currentBody });
    expect(baseline.safetySummary.sensitiveActionState).toBe('none');
    for (const bad of [{ actionLabel: '' }, { actionLabel: '   ' }, { actionLabel: 42 as unknown as string }]) {
      const validation = validatePromptEnhancementSafety({
        currentBody: composed.currentBody,
        typedSensitiveActionVerdict: bad,
      });
      expect(validation.safetySummary.sensitiveActionState).toBe('none');
      expect(validation.blocking).toBe(baseline.blocking);
    }
  });
});

describe('the validator OR direction is discriminated — a replacement cannot hide', () => {
  it('a keyword-firing body with NO typed verdict still validates as confirmation-required', () => {
    // Kills the OR -> replacement mutation at the VALIDATOR: under a replacement, a keyword
    // candidate no longer sets confirmationRequired and the state below reads none.
    const row = ROWS.find((r) => r.id === 1)!;
    const composed = composeFor(row.prompt);
    const validation = validatePromptEnhancementSafety({ currentBody: composed.currentBody });
    expect(validation.safetySummary.sensitiveActionState).toMatch(/^confirmation_required/);
  });

  it('the typed verdict alone also sets the required state — the second recall source at the validator', () => {
    const composed = composeFor(SECRET_CONTEXT_PROMPT, { typed: TYPED });
    const validation = validatePromptEnhancementSafety({
      currentBody: composed.currentBody,
      typedSensitiveActionVerdict: TYPED,
    });
    expect(validation.safetySummary.sensitiveActionState).toMatch(/^confirmation_required/);
  });
});

describe('the still-dead fields stay dead — pinned so the deliberate choice is never read as an oversight', () => {
  it('the facade consumes neither bodyShape nor gateReasonCode from the gate decision', () => {
    const facadeSource = readFileSync(fileURLToPath(new URL('./facade.ts', import.meta.url)), 'utf8');
    expect(facadeSource).not.toContain('.bodyShape');
    expect(facadeSource).not.toContain('.gateReasonCode');
  });
});

describe('the REAL derivation — request with a secret-class survivor, end to end through the facade', () => {
  function prepareRequest(qualifyingAbsence: string): PromptEnhancementPrepareRequestV1 {
    const promptStartStop = getPromptStartStopSourceSnapshot();
    const ref: PromptEnhancementSourceRefV1 = { ...sourceA, sourceAuthorization: 'source_fact_only', evidenceStatus: 'present' };
    return {
      schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
      requestId: 'typed-ride-1',
      projectRoot: '/tmp/project',
      hostSurface: 'cli_stop_bridge',
      sourcePrompt: {
        text: SECRET_CONTEXT_PROMPT,
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
          triggerKind: 'absence',
          firedKey: `absence:${qualifyingAbsence}@implementation`,
          effectiveFiredSource: 'classifier_fire_recommendation',
          selectedQualifyingAbsence: qualifyingAbsence,
          absenceGateReason: 'qualifying_absence_signal',
          classifierState: 'fire_recommended',
          degradedNoActionState: 'none',
          promptStartBoundary: promptStartStop.hookBoundary,
          deliveryBoundary: promptStartStop.deliveryBoundary,
          promptStartCanReplaceSameTurn: false,
        },
      },
      sourceSignals: {
        sourceAOriginalPromptRef: ref,
        sourceRefs: [ref],
        normalizedStageAbsenceSignalRefs: [],
        contentTemplateRecordFactRefs: [],
        popupQuestionSourceRefs: [],
        whyHelpSourceRefs: [],
        profileRoleModeRefs: [],
        rightGoodWorkStyleEnvRuntimeRefs: [],
        missingMemoryCandidateRefs: [],
        sourceLabels: [{ sourceRefId: ref.sourceRefId, label: 'original_prompt', evidenceStatus: 'present' }],
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

  it('a secret_in_prompt survivor produces the confirmation on a prompt with zero risk keywords', async () => {
    const result = await preparePromptEnhancement(prepareRequest('secret_in_prompt'));
    expect(result.currentBody.sections.length).toBeGreaterThan(0); // a real popup — never vacuous
    expect(result.currentBody.text).toContain(MARKER);
  });

  it('an ordinary (non-secret) absence survivor does NOT — the predicate is not widened', async () => {
    const result = await preparePromptEnhancement(prepareRequest('verification_gap'));
    expect(result.currentBody.sections.length).toBeGreaterThan(0);
    expect(result.currentBody.text).not.toContain(MARKER);
  });
});
