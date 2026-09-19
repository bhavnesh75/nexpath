/**
 * The seam: what is computed, what is stored, and what the agent gets.
 *
 * The phrases are derived once from the final body and written beside the pending row, so the two
 * questions worth asking here are whether the column gives back exactly what was put in it, and
 * whether any of this reached the text the agent receives. The second is the one that matters:
 * emphasis is a display decision, and a display decision that changes the prompt is a defect, not
 * a feature.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { openStore, type Store } from '../store/db.js';
import {
  getPendingPromptEnhancement,
  upsertPendingPromptEnhancement,
} from '../store/pending-prompt-enhancements.js';
import { PROMPT_ENHANCEMENT_CONTRACT_VERSION, type PromptEnhancementPrepareRequestV1, type PromptEnhancementSourceRefV1 } from './contracts.js';
import { buildPromptEnhancementCostVisibilityMetadataV1 } from './cost-observability.js';
import { preparePromptEnhancement } from './facade.js';
import { getPromptStartStopSourceSnapshot } from './source-reality.js';
import { buildPromptEnhancementEmphasisPhrasesV1 } from './emphasis-locate.js';

/** A prompt whose body carries constraints, a verification plan and a risky action. */
const PROMPT = 'add rate limiting to the upload endpoint, then roll it out to production';

/**
 * Phase 0's own two fixtures, verbatim — the bodies every other phase pins its frames and its sent
 * text against. The display-only proof belongs on these rather than on a prompt chosen here: the
 * guarantee is about the bodies this feature will actually meet.
 */
const PHASE_0_FIXTURES: readonly { label: string; prompt: string }[] = [
  { label: 'the small body', prompt: 'Add a retry with exponential backoff to the payment gateway client.' },
  {
    label: 'the confirmation-carrying body',
    prompt: 'Fix the failing payment test, the test failure blocks ci, and explain the verification. also drop a shadow under the submit button.',
  },
];

function request(projectRoot: string, text: string = PROMPT): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'emphasis-persistence-source-a',
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
    requestId: `emphasis-persistence-${projectRoot}`,
    projectRoot,
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

/** The derivation the hook performs, in the same shape. */
const phrasesFor = (result: Awaited<ReturnType<typeof preparePromptEnhancement>>, req: PromptEnhancementPrepareRequestV1) =>
  buildPromptEnhancementEmphasisPhrasesV1({
    originalPromptText: result.currentBody.originalPromptText,
    sections: result.currentBody.sections.map((section) => ({
      sectionKind: section.sectionKind,
      bodyText: section.bodyText,
      ...(section.groundedFactValues ? { groundedFactValues: section.groundedFactValues } : {}),
      ...(section.sourceFactIds ? { sourceFactIds: section.sourceFactIds } : {}),
      ...(section.sourceIds ? { sourceIds: section.sourceIds } : {}),
    })),
    ...(req.reviewMomentContext.detectedLanguage ? { detectedLanguage: req.reviewMomentContext.detectedLanguage } : {}),
  });

describe('the phrases beside the pending row', () => {
  let store: Store;
  beforeEach(async () => { store = await openStore(':memory:'); });

  it('round-trips through the column unchanged', async () => {
    const root = '/test/emphasis-persistence-roundtrip';
    const req = request(root);
    const result = await preparePromptEnhancement(req);
    const phrases = phrasesFor(result, req);

    upsertPendingPromptEnhancement(store, {
      projectRoot: root, sessionId: 's', promptCount: 1, request: req, result,
      emphasisPhrases: phrases,
    });

    expect(getPendingPromptEnhancement(store, root)!.emphasisPhrases).toEqual(phrases);
  });

  it('derives the same list every time from the same body — one derivation, two store sites', async () => {
    // The row is written in two branches and only one runs per prepare, so what has to hold is
    // that both would write the same thing.
    const req = request('/test/emphasis-persistence-stable');
    const result = await preparePromptEnhancement(req);
    expect(phrasesFor(result, req)).toEqual(phrasesFor(result, req));
  });

  it('stores an empty list when the pass ran and nothing qualified, never NULL', async () => {
    const root = '/test/emphasis-persistence-empty';
    const req = request(root);
    const result = await preparePromptEnhancement(req);

    upsertPendingPromptEnhancement(store, {
      projectRoot: root, sessionId: 's', promptCount: 1, request: req, result,
      emphasisPhrases: [],
    });

    const raw = store.db.exec('SELECT emphasis_phrases_json FROM pending_prompt_enhancements WHERE project_root = ?', [root]);
    // "[]" and NULL mean different things: the pass ran and found nothing, versus it never ran.
    expect(raw[0]?.values[0]?.[0]).toBe('[]');
    expect(getPendingPromptEnhancement(store, root)!.emphasisPhrases).toEqual([]);
  });

  it('carries only the phrase, its class and its source — no offsets reach the disk', async () => {
    const req = request('/test/emphasis-persistence-shape');
    const result = await preparePromptEnhancement(req);
    for (const phrase of phrasesFor(result, req)) {
      expect(Object.keys(phrase).sort()).toEqual(['emphasisClass', 'source', 'text']);
      expect(phrase.source).toBe('floor');
    }
  });
});

describe('what the agent receives', () => {
  it('marks something real on a body that has something to mark — so the proof above is not vacuous', async () => {
    const req = request('/test/emphasis-not-vacuous', PHASE_0_FIXTURES[1]!.prompt);
    const result = await preparePromptEnhancement(req);
    const phrases = phrasesFor(result, req);
    expect(phrases.length).toBeGreaterThan(0);
    expect(phrases.some((phrase) => phrase.emphasisClass === 5)).toBe(true);
  });

  it('marks nothing on a no-key small body — recorded, because it is what the floor alone does', async () => {
    // ⚠️ A finding, not an assertion of quality. Phase 0's small fixture composes three sections and
    // TWO of them are excluded by the standard — the developer's own text and the practices section
    // — leaving one stretch of deterministic filler with no grounded values and no instruction in
    // it. Tier 1 therefore has nothing to say about this body, and the measurement phase is where
    // that stops being an anecdote. The column keeps "ran and found nothing" apart from "never ran".
    const req = request('/test/emphasis-no-key-floor', PHASE_0_FIXTURES[0]!.prompt);
    const result = await preparePromptEnhancement(req);
    expect(result.currentBody.sections.map((section) => section.sectionKind))
      .toEqual(['original_request_or_goal', 'context_and_constraints', 'source_signal_guidance']);
    expect(phrasesFor(result, req)).toEqual([]);
  });

  // On Phase 0's own fixtures, because those are the bodies every other phase pins against — a
  // display-only guarantee proved on some other prompt is a guarantee about some other prompt.
  for (const fixture of PHASE_0_FIXTURES) {
    it(`is byte-identical on ${fixture.label}, whether the phrases are derived or not`, async () => {
      const req = request(`/test/emphasis-display-only-${fixture.label.replace(/\s+/g, '-')}`, fixture.prompt);
      const result = await preparePromptEnhancement(req);

      const before = result.currentBody.text;
      const sectionsBefore = result.currentBody.sections.map((section) => section.bodyText);

      phrasesFor(result, req);

      expect(result.currentBody.text).toBe(before);
      expect(result.currentBody.sections.map((section) => section.bodyText)).toEqual(sectionsBefore);
    });

    it(`never puts a phrase into ${fixture.label} that it did not already hold`, async () => {
      const req = request(`/test/emphasis-no-invention-${fixture.label.replace(/\s+/g, '-')}`, fixture.prompt);
      const result = await preparePromptEnhancement(req);
      const bodyLower = result.currentBody.sections.map((section) => section.bodyText).join('\n').toLowerCase();
      for (const phrase of phrasesFor(result, req)) {
        expect(bodyLower).toContain(phrase.text.toLowerCase());
      }
    });
  }
});
