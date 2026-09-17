/**
 * The notice a refused removal shows, and how long it is meant to last.
 *
 * A refusal hands the popup a notice AND the flag that says it should survive exactly one repaint;
 * a completed removal hands neither. Both are the loop's decision, and both are checked here.
 *
 * ⚠️ What this file does NOT reach: the repaint itself. Dropping the notice after the first render
 * happens inside the interactive shell's own `next`, and that shell opens a real console — it is
 * neither exported nor injectable, so no test can construct one. The flag's journey is pinned here
 * as far as the loop carries it; that it is then honoured on screen is a real-terminal check.
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
import { PROMPT_ENHANCEMENT_SECTION_REMOVAL_NOTICE_V1 } from './popup-section-removal.js';
import {
  runPromptEnhancementCliSubmitPopupV1,
  type PromptEnhancementCliPopupCommandV1,
  type PromptEnhancementCliPopupInteractionV1,
  type PromptEnhancementCliPopupViewV1,
} from './cli-submit-popup.js';

const PROMPT = 'Add a retry with exponential backoff to the payment gateway client.';

function request(): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'notice-repaint-source-a',
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
    requestId: 'notice-repaint-request',
    projectRoot: '/tmp/notice-repaint-project',
    hostSurface: 'cli_stop_bridge',
    sourcePrompt: { text: PROMPT, origin: 'user', capturedAt: 1, promptIndex: 1, generatedOriginPolicy: 'ordinary_source_a' },
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

/** Run the loop and hand back every view it offered. */
async function viewsFor(commands: readonly PromptEnhancementCliPopupCommandV1[]): Promise<PromptEnhancementCliPopupViewV1[]> {
  const baseRequest = request();
  const ui = interaction(commands);
  await runPromptEnhancementCliSubmitPopupV1({
    request: baseRequest,
    result: await preparePromptEnhancement(baseRequest),
    interaction: ui,
  });
  return ui.views;
}

describe('the notice a refused removal leaves behind', () => {
  it('says so once, for every way a removal can be refused', async () => {
    for (const outcome of ['no_such_section', 'locked', 'would_blank'] as const) {
      const views = await viewsFor([{ type: 'remove_section', outcome }, { type: 'close' }]);
      expect(views, outcome).toHaveLength(2);
      // Nothing on the frame the refusal happened on; the notice is on the one after it.
      expect(views[0]!.publicNotice, outcome).toBeUndefined();
      expect(views[1]!.publicNotice, outcome).toBe(PROMPT_ENHANCEMENT_SECTION_REMOVAL_NOTICE_V1);
      // …and it is marked as the kind that should not linger.
      expect(views[1]!.publicNoticeTransient, outcome).toBe(true);
    }
  });

  it('says nothing when the section actually went', async () => {
    const views = await viewsFor([
      { type: 'remove_section', outcome: 'removed', sectionIndex: 1 },
      { type: 'close' },
    ]);
    expect(views).toHaveLength(2);
    expect(views[1]!.publicNotice).toBeUndefined();
    expect(views[1]!.publicNoticeTransient).toBeFalsy();
  });

  it('drops the notice as soon as the next command arrives', async () => {
    const views = await viewsFor([
      { type: 'remove_section', outcome: 'no_such_section' },
      { type: 'edit_body', text: 'the body after the refusal' },
      { type: 'close' },
    ]);
    expect(views).toHaveLength(3);
    expect(views[1]!.publicNotice).toBe(PROMPT_ENHANCEMENT_SECTION_REMOVAL_NOTICE_V1);
    // The command that followed cleared both halves — text and flag together.
    expect(views[2]!.publicNotice).toBeUndefined();
    expect(views[2]!.publicNoticeTransient).toBeFalsy();
  });

  it('never marks an ordinary frame as transient', async () => {
    const views = await viewsFor([
      { type: 'edit_body', text: 'an ordinary edit' },
      { type: 'close' },
    ]);
    // Today's notices carry no flag, so nothing about how they behave changes.
    for (const view of views) expect(view.publicNoticeTransient).toBeFalsy();
  });

  it('carries the notice on the view, not in the body the user would send', async () => {
    const views = await viewsFor([
      { type: 'remove_section', outcome: 'locked' },
      { type: 'close' },
    ]);
    expect(views[1]!.publicNotice).toBe(PROMPT_ENHANCEMENT_SECTION_REMOVAL_NOTICE_V1);
    expect(views[1]!.editedBodyText).not.toContain(PROMPT_ENHANCEMENT_SECTION_REMOVAL_NOTICE_V1);
  });
});
