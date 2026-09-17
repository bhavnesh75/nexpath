/**
 * What the popup loop does with a removal.
 *
 * A removal is not an engine action: the key that made it has already changed the
 * body, and the loop's part is simply to carry on. So the checks here are that the
 * popup keeps running, that nothing is reported as a failed action — a refusal least
 * of all — and that the body the loop finally sends is the one the removal left.
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
    sourceRefId: 'removal-runner-source-a',
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
    requestId: 'removal-runner-request',
    projectRoot: '/tmp/removal-runner-project',
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

interface Run {
  state: string;
  bodyText: string;
  views: number;
  diagnostics: readonly { actionType: string; state: string; reasonCodes: readonly string[] }[];
}

async function runWith(commands: readonly PromptEnhancementCliPopupCommandV1[]): Promise<Run> {
  const baseRequest = request(SMALL_PROMPT);
  const prepared = await preparePromptEnhancement(baseRequest);
  const diagnostics: { actionType: string; state: string; reasonCodes: readonly string[] }[] = [];
  const ui = interaction(commands);
  const result = await runPromptEnhancementCliSubmitPopupV1({
    request: baseRequest,
    result: prepared,
    interaction: ui,
    actionDiagnosticsSink: (event) => diagnostics.push(event),
  });
  return {
    state: result.state,
    bodyText: result.state === 'selected_current' ? result.bodyText : '',
    views: ui.views.length,
    diagnostics,
  };
}

describe('the loop and a removal', () => {
  it('carries on after a removal, reporting nothing, and renders again', async () => {
    const run = await runWith([
      { type: 'remove_section', outcome: 'removed', sectionIndex: 1 },
      { type: 'close' },
    ]);
    expect(run.state).toBe('closed_no_send');
    expect(run.diagnostics).toEqual([]);
    // It rendered once before the removal and once after it.
    expect(run.views).toBe(2);
  });

  it('carries on after a refusal too — a refusal is not a failed action', async () => {
    for (const outcome of ['no_such_section', 'locked', 'would_blank'] as const) {
      const run = await runWith([{ type: 'remove_section', outcome }, { type: 'close' }]);
      expect(run.state).toBe('closed_no_send');
      expect(run.diagnostics).toEqual([]);
      expect(run.views).toBe(2);
    }
  });

  it('sends the body the removal left, through the ordinary edited-body path', async () => {
    // The key that removed the section also marked the body dirty, so the next Enter
    // commits it as an edit and then sends it — the path an edited body already takes.
    const run = await runWith([
      { type: 'remove_section', outcome: 'removed', sectionIndex: 1 },
      { type: 'edit_body', text: 'What is left after the removal.' },
      { type: 'use_current' },
    ]);
    expect(run.state).toBe('selected_current');
    expect(run.bodyText).toBe('What is left after the removal.');
    expect(run.diagnostics).toEqual([]);
  });
});
