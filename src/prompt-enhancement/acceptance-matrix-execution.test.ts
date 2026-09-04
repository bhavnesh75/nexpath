import { describe, expect, it } from 'vitest';
import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  type PromptEnhancementPrepareRequestV1,
  type PromptEnhancementSourceRefV1,
} from './contracts.js';
import { buildPromptEnhancementCostVisibilityMetadataV1 } from './cost-observability.js';
import { preparePromptEnhancement } from './facade.js';
import { getPromptStartStopSourceSnapshot } from './source-reality.js';
import {
  buildPromptEnhancementAcceptancePacketV1,
  validatePromptEnhancementAcceptancePacketV1,
  PROMPT_ENHANCEMENT_ACCEPTANCE_REQUIRED_FAMILIES_V1,
} from './acceptance-matrix.js';

/**
 * R1 — eval-rule-3 acceptance-matrix execution harness (ui-owner release-check role).
 *
 * The matrix (`acceptance-matrix.ts`, content-owner-content) is SHAPE-ONLY by design and STRUCTURALLY
 * refuses to claim readiness (`readinessClaimAllowed: false` literal; the validator enforces it).
 * The final readiness flip + numeric-threshold sign-off stay content-owner's — see the manual test-plan
 * `docs/dev/user-experience-improvements-sub-11-r1-acceptance-execution-test-plan-2026-08-06.md`.
 *
 * This harness executes the ONE thing the gate exists to catch programmatically: the
 * `BUG-PE-ENGINE-NO-LLM` regression — a debug/feature prompt returning the canned deterministic
 * skeleton (rubric dims 2/4/5 fail) instead of a grounded, source-covered body. Deterministic,
 * no API key: proves the WIRED engine grounds real prompts even without the LLM.
 */
function request(text: string): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'src-a-1', sourceKind: 'source_a_user_prompt', sourceId: 'prompt:1',
    sourceAuthorization: 'source_fact_only', evidenceStatus: 'present', freshness: 'current', confidence: 'high', privacyClass: 'public_safe',
  };
  const p = getPromptStartStopSourceSnapshot();
  return {
    schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION, requestId: 'r1-exec', projectRoot: '/tmp/r1-exec', hostSurface: 'cli_stop_bridge',
    sourcePrompt: { text, origin: 'user', capturedAt: 1, promptIndex: 1, generatedOriginPolicy: 'ordinary_source_a' },
    reviewMomentContext: { reviewMoment: 'UserPromptSubmit_preparation', currentAgentMode: 'workspace-write', projectId: 'p1', sessionId: 's1', detectedLanguage: 'en', stageCandidate: 'implementation', promptCount: 1, recentPromptMetadataRefs: [], triggerProvenance: { currentStage: 'implementation', prevStage: 'task_breakdown', triggerKind: 'stage_transition', classifierState: 'fire_recommended', degradedNoActionState: 'none', promptStartBoundary: p.hookBoundary, deliveryBoundary: p.deliveryBoundary, promptStartCanReplaceSameTurn: false } },
    sourceSignals: { sourceAOriginalPromptRef: sourceRef, sourceRefs: [sourceRef], normalizedStageAbsenceSignalRefs: [], contentTemplateRecordFactRefs: [], popupQuestionSourceRefs: [], whyHelpSourceRefs: [], profileRoleModeRefs: [], rightGoodWorkStyleEnvRuntimeRefs: [], missingMemoryCandidateRefs: [], sourceLabels: [{ sourceRefId: sourceRef.sourceRefId, label: 'original_prompt', evidenceStatus: 'present' }], promptStartStop: { hookBoundary: p.hookBoundary, deliveryBoundary: p.deliveryBoundary, runAutoCanHoldOrReplaceSubmittedPrompt: false, sharedSignalCount: p.sharedSignalCount, classifierDegradedNoFireReasons: p.classifierDegradedNoFireReasons }, store: { schemaVersion: 1, missingPromptEnhancementTables: [], cleanupGaps: [] }, transcriptPathState: 'not_authority', streamBOutputs: [], paramEventChannels: [], servedVariantIdentityRefs: [], deliveryGateRefs: [], sourceOnlyHardFactRefs: [] },
    userPreferenceContext: { levelState: 'default', scopedFeedbackEvidenceRefs: [] },
    configSnapshot: { sequenceEnabledState: 'not_enabled_v1', validatedEffectiveConfigState: 'valid', arbitraryConfigRowsAreAuthority: false },
    callVisibilityState: buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', { callVisibilityMode: 'deterministic', plannedCallCount: 0, usedCallCount: 0 }),
    privacyAndStoragePolicy: { sensitivityClass: 'normal', localStorageEligibility: 'ids_and_categories_only', telemetryEligibility: 'allowlisted_counts_only', llmSharingEligibility: 'allowed_minimal', generatedBodyStoragePolicy: 'do_not_store_raw_by_default' },
  };
}

describe('R1 — eval-rule-3 acceptance-matrix execution (ui-owner release-check)', () => {
  it('HARD-FAIL GATE: a real debug prompt yields a grounded, source-covered body — NOT the canned skeleton', async () => {
    // The regression BUG-PE-ENGINE-NO-LLM shipped: this exact class of prompt returned a generic
    // skeleton. Post E1-E9 the wired engine must ground it (multi-section, covered).
    const result = await preparePromptEnhancement(request('Fix failing tests after a migration while preserving behavior.'));
    expect(result.disposition).toBe('show_current_body');
    expect(result.sourceGuidanceCoverage).toBe('covered');
    // 🔒 RE-SET 2026-08-20 by owner ruling, and the rule changed SHAPE rather than threshold:
    // *"we are up and open to show enhanced prompt even with one section. but yeah one section is
    // mandatory. and that mandatory section is Source Signal Guidance."*
    //
    // The old bar was `sections.length > 3`, written when factless sections still counted toward
    // the total. I2's stage (a) drops those, so the count stopped measuring what this gate cares
    // about — a body of 3 sections that say something is not the skeleton this gate exists to
    // catch, and 6 sections of canned lines would have passed it. ⚠️ So the gate now asserts the
    // MANDATORY section is present and the body says more than the echo, which is the same intent
    // stated against what the body now actually is.
    expect(
      result.currentBody.sections.map((section) => section.sectionKind),
      'the mandatory Source Signal Guidance section is missing — that is the skeleton case now',
    ).toContain('source_signal_guidance');
    expect(result.currentBody.text.length).toBeGreaterThan(result.currentBody.originalPromptText.length);
    // The original request is preserved verbatim (original-intent-preservation rubric dim).
    expect(result.currentBody.text).toContain('Fix failing tests after a migration');
  });

  it('HARD-FAIL GATE: a second real debug/feature prompt is also grounded (not skeleton)', async () => {
    const result = await preparePromptEnhancement(request('Fix the failing payment test, the test failure blocks ci, and explain the verification.'));
    expect(result.disposition).toBe('show_current_body');
    // Same re-set as above: the mandatory section, not a section count.
    expect(result.currentBody.sections.map((section) => section.sectionKind))
      .toContain('source_signal_guidance');
    expect(result.currentBody.text).toContain('payment test');
  });

  it('the acceptance packet stays HONEST: shape-only, readiness structurally refused until content-owner sign-off', () => {
    const packet = buildPromptEnhancementAcceptancePacketV1();
    // The matrix must NOT self-certify: readiness flip + numeric threshold are content-owner's release sign-off.
    expect(packet.readinessClaimAllowed).toBe(false);
    expect(packet.numericThresholdOracleSignoffState).toBe('required_before_quality_or_readiness_claim');
    const validation = validatePromptEnhancementAcceptancePacketV1(packet);
    expect(validation.ok).toBe(true); // honest shape validates; it does not claim readiness
    // Every required family has a fixture (coverage) — the corpus the manual test-plan evaluates.
    const families = new Set(packet.fixtures.map((fixture) => fixture.family));
    for (const required of PROMPT_ENHANCEMENT_ACCEPTANCE_REQUIRED_FAMILIES_V1) {
      expect(families.has(required)).toBe(true);
    }
  });
});
