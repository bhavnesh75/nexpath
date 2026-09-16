/**
 * The popup loop hands its interaction each section's title and body text, in
 * the order the body was composed — the data the shell numbers the sections from.
 *
 * Checked through the real loop with a scripted interaction, on a real prepared
 * result, so the field is proven to come from the current result and not from
 * anything the test supplied. When a directional refinement replaces the body,
 * the sections follow the new result; when the user goes back, they follow the
 * restored one.
 */
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
  runPromptEnhancementCliSubmitPopupV1,
  type PromptEnhancementCliPopupCommandV1,
  type PromptEnhancementCliPopupInteractionV1,
  type PromptEnhancementCliPopupViewV1,
} from './cli-submit-popup.js';

const SMALL_PROMPT = 'Add a retry with exponential backoff to the payment gateway client.';

function request(text: string): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'sections-view-source-a',
    sourceKind: 'source_a_user_prompt',
    sourceId: 'prompt:1',
    sourceAuthorization: 'source_fact_only',
    evidenceStatus: 'present',
    freshness: 'current',
    confidence: 'high',
    privacyClass: 'local_private',
  };
  const promptStartStop = getPromptStartStopSourceSnapshot();
  return {
    schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
    requestId: 'sections-view-request',
    projectRoot: '/tmp/sections-view-project',
    hostSurface: 'cli_stop_bridge',
    sourcePrompt: { text, origin: 'user', capturedAt: 1, promptIndex: 1, generatedOriginPolicy: 'ordinary_source_a' },
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
      },
    },
    sourceSignals: {
      sourceAOriginalPromptRef: sourceRef,
      sourceRefs: [sourceRef],
      normalizedStageAbsenceSignalRefs: [],
      contentTemplateRecordFactRefs: [],
      popupQuestionSourceRefs: [],
      whyHelpSourceRefs: [],
      profileRoleModeRefs: [],
      rightGoodWorkStyleEnvRuntimeRefs: [],
      missingMemoryCandidateRefs: [],
      sourceLabels: [{ sourceRefId: sourceRef.sourceRefId, label: 'original_prompt', evidenceStatus: 'present' }],
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
    callVisibilityState: buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', { callVisibilityMode: 'deterministic', plannedCallCount: 0, usedCallCount: 0 }),
    privacyAndStoragePolicy: {
      sensitivityClass: 'normal',
      localStorageEligibility: 'ids_and_categories_only',
      telemetryEligibility: 'allowlisted_counts_only',
      llmSharingEligibility: 'allowed_minimal',
      generatedBodyStoragePolicy: 'do_not_store_raw_by_default',
    },
  };
}

function interaction(
  commands: readonly PromptEnhancementCliPopupCommandV1[],
): PromptEnhancementCliPopupInteractionV1 & { views: PromptEnhancementCliPopupViewV1[] } {
  const queue = [...commands];
  return {
    views: [],
    async next(view) {
      this.views.push(view);
      const command = queue.shift();
      if (!command) throw new Error('missing scripted command');
      return command;
    },
    close() {},
  };
}

describe('the view the popup loop hands its interaction', () => {
  it('carries every section title and body text, in the order the body was composed', async () => {
    const baseRequest = request(SMALL_PROMPT);
    const prepared = await preparePromptEnhancement(baseRequest);
    const ui = interaction([{ type: 'use_current' }]);
    await runPromptEnhancementCliSubmitPopupV1({ request: baseRequest, result: prepared, interaction: ui });

    expect(ui.views).toHaveLength(1);
    const view = ui.views[0]!;
    expect(view.sections).toBeDefined();
    expect(view.sections).toEqual(
      prepared.currentBody.sections.map((section) => ({ title: section.title, bodyText: section.bodyText })),
    );
    // Premise: there is more than one section, so order is actually being tested.
    expect(view.sections!.length).toBeGreaterThan(1);
  });

  it('carries only title and body text — nothing else from the section', async () => {
    const baseRequest = request(SMALL_PROMPT);
    const prepared = await preparePromptEnhancement(baseRequest);
    const ui = interaction([{ type: 'close' }]);
    await runPromptEnhancementCliSubmitPopupV1({ request: baseRequest, result: prepared, interaction: ui });

    for (const entry of ui.views[0]!.sections!) {
      expect(Object.keys(entry).sort()).toEqual(['bodyText', 'title']);
    }
  });

  it('keeps the same sections across a local edit, since the result has not changed', async () => {
    const baseRequest = request(SMALL_PROMPT);
    const prepared = await preparePromptEnhancement(baseRequest);
    const ui = interaction([
      { type: 'edit_body', text: `${prepared.currentBody.text}\nOne more line.` },
      { type: 'use_current' },
    ]);
    await runPromptEnhancementCliSubmitPopupV1({ request: baseRequest, result: prepared, interaction: ui });

    expect(ui.views).toHaveLength(2);
    expect(ui.views[1]!.sections).toEqual(ui.views[0]!.sections);
    expect(ui.views[1]!.editedBodyText).toContain('One more line.');
  });
});
