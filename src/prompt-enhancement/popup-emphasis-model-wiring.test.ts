/**
 * The suggestion pass as the popup drives it.
 *
 * Three questions the call module cannot answer about itself. Does the popup open without waiting
 * for it — asked with a call that never answers at all, so a popup that waited would hang the test
 * rather than slow it. Is it started exactly once per popup, including one whose body is replaced
 * partway through. And when a suggestion arrives late, does it survive the next keystroke — which
 * it did not, because the loop builds a fresh view every time round.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runPromptEnhancementCliSubmitPopupV1,
  type PromptEnhancementCliPopupCommandV1,
  type PromptEnhancementCliPopupInteractionV1,
  type PromptEnhancementCliPopupViewV1,
} from './cli-submit-popup.js';
import {
  buildPromptEnhancementEmphasisMarkableBodyV1,
  type PromptEnhancementEmphasisModelClientV1,
} from './emphasis-model-call.js';
import type { PromptEnhancementEmphasisPhraseV1 } from '../store/pending-prompt-enhancements.js';
import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  type PromptEnhancementPrepareRequestV1,
  type PromptEnhancementSourceRefV1,
} from './contracts.js';
import { buildPromptEnhancementCostVisibilityMetadataV1 } from './cost-observability.js';
import { preparePromptEnhancement } from './facade.js';
import { getPromptStartStopSourceSnapshot } from './source-reality.js';

const FLOOR: readonly PromptEnhancementEmphasisPhraseV1[] = [
  { text: 'only', emphasisClass: 3, source: 'floor' },
];

function request(id: string): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: `${id}-source-a`,
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
    requestId: id,
    projectRoot: `/test/${id}`,
    hostSurface: 'cli_stop_bridge',
    sourcePrompt: {
      text: 'add rate limiting to the upload endpoint, then roll it out to production',
      origin: 'user', capturedAt: 1, promptIndex: 1, generatedOriginPolicy: 'ordinary_source_a',
    },
    reviewMomentContext: {
      reviewMoment: 'UserPromptSubmit_preparation', currentAgentMode: 'workspace-write',
      projectId: 'project-1', sessionId: 'session-1', detectedLanguage: 'en',
      stageCandidate: 'implementation', promptCount: 1, recentPromptMetadataRefs: [],
      triggerProvenance: {
        currentStage: 'implementation', prevStage: 'task_breakdown', triggerKind: 'stage_transition',
        classifierState: 'fire_recommended', degradedNoActionState: 'none',
        promptStartBoundary: promptStartStop.hookBoundary,
        deliveryBoundary: promptStartStop.deliveryBoundary,
        promptStartCanReplaceSameTurn: false,
      },
    },
    sourceSignals: {
      sourceAOriginalPromptRef: sourceRef, sourceRefs: [sourceRef],
      normalizedStageAbsenceSignalRefs: [], contentTemplateRecordFactRefs: [],
      popupQuestionSourceRefs: [], whyHelpSourceRefs: [], profileRoleModeRefs: [],
      rightGoodWorkStyleEnvRuntimeRefs: [], missingMemoryCandidateRefs: [],
      sourceLabels: [{ sourceRefId: sourceRef.sourceRefId, label: 'original_prompt', evidenceStatus: 'present' }],
      promptStartStop: {
        hookBoundary: promptStartStop.hookBoundary, deliveryBoundary: promptStartStop.deliveryBoundary,
        runAutoCanHoldOrReplaceSubmittedPrompt: false,
        sharedSignalCount: promptStartStop.sharedSignalCount,
        classifierDegradedNoFireReasons: promptStartStop.classifierDegradedNoFireReasons,
      },
      store: { schemaVersion: 1, missingPromptEnhancementTables: [], cleanupGaps: [] },
      transcriptPathState: 'not_authority', streamBOutputs: [], paramEventChannels: [],
      servedVariantIdentityRefs: [], deliveryGateRefs: [], sourceOnlyHardFactRefs: [],
    },
    userPreferenceContext: { levelState: 'default', scopedFeedbackEvidenceRefs: [] },
    configSnapshot: { sequenceEnabledState: 'not_enabled_v1', validatedEffectiveConfigState: 'valid', arbitraryConfigRowsAreAuthority: false },
    callVisibilityState: buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', { callVisibilityMode: 'deterministic', plannedCallCount: 0, usedCallCount: 0 }),
    privacyAndStoragePolicy: {
      sensitivityClass: 'normal', localStorageEligibility: 'ids_and_categories_only',
      telemetryEligibility: 'allowlisted_counts_only', llmSharingEligibility: 'allowed_minimal',
      generatedBodyStoragePolicy: 'do_not_store_raw_by_default',
    },
  };
}

/** Scripted interaction that records every view it is handed, and every repaint it is asked for. */
function interaction(commands: readonly PromptEnhancementCliPopupCommandV1[]) {
  const queue = [...commands];
  const value = {
    views: [] as PromptEnhancementCliPopupViewV1[],
    repaints: [] as (readonly PromptEnhancementEmphasisPhraseV1[])[],
    async next(view: PromptEnhancementCliPopupViewV1) {
      value.views.push(view);
      const command = queue.shift();
      if (!command) throw new Error('missing scripted command');
      return command;
    },
    close() {},
    repaintWithPhrases(phrases: readonly PromptEnhancementEmphasisPhraseV1[]) { value.repaints.push(phrases); },
  };
  return value as PromptEnhancementCliPopupInteractionV1 & typeof value;
}

describe('the popup and the suggestion pass', () => {
  it('opens without waiting, even for a call that never answers', async () => {
    // ⚠️ The strongest form of the question: if the popup awaited this, the test would time out
    // rather than report a slow frame.
    const create = vi.fn(() => new Promise(() => {}));
    const client = { chat: { completions: { create } } } as unknown as PromptEnhancementEmphasisModelClientV1;
    const base = request('emphasis-wiring-no-wait');
    const prepared = await preparePromptEnhancement(base);
    const ui = interaction([{ type: 'use_current' }]);

    const result = await runPromptEnhancementCliSubmitPopupV1({
      request: base, result: prepared, interaction: ui,
      emphasisPhrases: FLOOR, emphasisModel: { client },
    });

    expect(result.state).toBe('selected_current');
    expect(ui.views.length).toBeGreaterThan(0);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('starts it exactly once, however many times the reader acts', async () => {
    const create = vi.fn(async () => ({ choices: [{ message: { content: '{"phrases":[]}' } }] }));
    const client = { chat: { completions: { create } } } as unknown as PromptEnhancementEmphasisModelClientV1;
    const base = request('emphasis-wiring-once');
    const prepared = await preparePromptEnhancement(base);
    const ui = interaction([
      { type: 'edit_body', text: 'A body the reader typed over the draft.' },
      { type: 'edit_body', text: 'And typed over again.' },
      { type: 'use_current' },
    ]);

    await runPromptEnhancementCliSubmitPopupV1({
      request: base, result: prepared, interaction: ui,
      emphasisPhrases: FLOOR, emphasisModel: { client },
    });

    expect(ui.views).toHaveLength(3);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('starts no second call when a refinement replaces the body in the same popup', async () => {
    const create = vi.fn(async () => ({ choices: [{ message: { content: '{"phrases":[]}' } }] }));
    const client = { chat: { completions: { create } } } as unknown as PromptEnhancementEmphasisModelClientV1;
    const base = request('emphasis-wiring-refinement');
    const prepared = await preparePromptEnhancement(base);
    const ui = interaction([{ type: 'shorter' }, { type: 'use_current' }]);

    await runPromptEnhancementCliSubmitPopupV1({
      request: base, result: prepared, interaction: ui,
      emphasisPhrases: FLOOR, emphasisModel: { client },
    });

    // The refinement really did replace the body — otherwise this asserts nothing.
    expect(ui.views).toHaveLength(2);
    expect(ui.views[1]!.refinement).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('starts none at all when no popup is shown', async () => {
    const create = vi.fn(async () => ({ choices: [{ message: { content: '{"phrases":[]}' } }] }));
    const client = { chat: { completions: { create } } } as unknown as PromptEnhancementEmphasisModelClientV1;
    const base = request('emphasis-wiring-not-shown');
    const prepared = await preparePromptEnhancement(base);

    const result = await runPromptEnhancementCliSubmitPopupV1({
      request: base, result: prepared, emphasisPhrases: FLOOR, emphasisModel: { client },
    });

    expect(result.state).toBe('not_shown');
    expect(create).not.toHaveBeenCalled();
  });

  it('starts one and no more when the reader takes the original, and nothing repaints after', async () => {
    // The call is started once the popup is certain to be drawn, so taking the original still costs
    // the one call already in flight — what must not happen is a second one, or a repaint landing
    // on a popup that has closed.
    let answer: (value: unknown) => void = () => {};
    const create = vi.fn(() => new Promise((resolve) => { answer = resolve; }));
    const client = { chat: { completions: { create } } } as unknown as PromptEnhancementEmphasisModelClientV1;
    const base = request('emphasis-wiring-original');
    const prepared = await preparePromptEnhancement(base);
    const ui = interaction([{ type: 'use_original' }]);

    const result = await runPromptEnhancementCliSubmitPopupV1({
      request: base, result: prepared, interaction: ui,
      emphasisPhrases: FLOOR, emphasisModel: { client },
    });

    expect(result.state).toBe('selected_original');
    expect(create).toHaveBeenCalledTimes(1);
    // A reply arriving after the popup is gone reaches nobody.
    answer({ choices: [{ message: { content: '{"phrases":["retry"]}' } }] });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(ui.repaints).toEqual([]);
  });

  it('starts nothing at all when no client and no opt-in are given', async () => {
    const base = request('emphasis-wiring-none');
    const prepared = await preparePromptEnhancement(base);
    const ui = interaction([{ type: 'use_current' }]);

    await runPromptEnhancementCliSubmitPopupV1({
      request: base, result: prepared, interaction: ui, emphasisPhrases: FLOOR,
    });

    expect(ui.repaints).toEqual([]);
    for (const view of ui.views) expect(view.emphasisPhrases).toEqual(FLOOR);
  });

  it('keeps a late suggestion on the next keystroke, instead of losing it', async () => {
    // ⚠️ The defect this pins: the loop builds a fresh view every time round, so a merged list
    // that lived only in the repaint was replaced by the rule-based one the moment a key arrived.
    let answer: (value: unknown) => void = () => {};
    const create = vi.fn(() => new Promise((resolve) => { answer = resolve; }));
    const client = { chat: { completions: { create } } } as unknown as PromptEnhancementEmphasisModelClientV1;
    const base = request('emphasis-wiring-survives');
    const prepared = await preparePromptEnhancement(base);

    // The reply names a phrase the body really carries on a markable row, so it survives the
    // output rules the same way a real suggestion would.
    const target = buildPromptEnhancementEmphasisMarkableBodyV1({
      sections: prepared.currentBody.sections.map((section) => ({
        sectionKind: section.sectionKind, bodyText: section.bodyText,
      })),
    })
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 20)!
      .slice(0, 24)
      .trim();

    const queue: PromptEnhancementCliPopupCommandV1[] = [
      { type: 'edit_body', text: prepared.currentBody.text },
      { type: 'use_current' },
    ];
    const views: PromptEnhancementCliPopupViewV1[] = [];
    const repaints: (readonly PromptEnhancementEmphasisPhraseV1[])[] = [];
    const ui: PromptEnhancementCliPopupInteractionV1 = {
      async next(view) {
        views.push(view);
        // Answer while the popup is parked in its read, exactly as a late reply would arrive.
        if (views.length === 1) {
          answer({ choices: [{ message: { content: JSON.stringify({ phrases: [target] }) } }] });
          await new Promise((resolve) => { setTimeout(resolve, 0); });
        }
        const command = queue.shift();
        if (!command) throw new Error('missing scripted command');
        return command;
      },
      close() {},
      repaintWithPhrases(phrases) { repaints.push(phrases); },
    };

    await runPromptEnhancementCliSubmitPopupV1({
      request: base, result: prepared, interaction: ui,
      emphasisPhrases: FLOOR, emphasisModel: { client },
    });

    expect(repaints).toHaveLength(1);
    expect(repaints[0]!.some((phrase) => phrase.source === 'model')).toBe(true);
    // The view handed over AFTER the suggestion arrived must still carry it.
    const afterwards = views[views.length - 1]!;
    expect(afterwards.emphasisPhrases?.some((phrase) => phrase.source === 'model')).toBe(true);
    // And the rule-based marks are still all there, ahead of it.
    expect(afterwards.emphasisPhrases?.slice(0, FLOOR.length)).toEqual(FLOOR);
  });
});

describe('the suggestion pass marks the body, it never rewrites it', () => {
  // The same two prompts the frame snapshots are built from, verbatim, so this is asked of bodies
  // whose exact text is already recorded elsewhere.
  const SMALL_PROMPT = 'Add a retry with exponential backoff to the payment gateway client.';
  const CONFIRMATION_PROMPT =
    'Fix the failing payment test, the test failure blocks ci, and explain the verification. also drop a shadow under the submit button.';

  const savedKey = process.env['OPENAI_API_KEY'];
  beforeEach(() => { delete process.env['OPENAI_API_KEY']; });
  afterEach(() => {
    if (savedKey === undefined) delete process.env['OPENAI_API_KEY'];
    else process.env['OPENAI_API_KEY'] = savedKey;
  });

  /** Every piece of body text the popup carries: what it draws, and what it hands back. */
  async function bodyTextsFor(prompt: string, tier: 'on' | 'off') {
    const base = { ...request(`unchanged-body-${tier}`), sourcePrompt: { ...request('x').sourcePrompt, text: prompt } };
    const prepared = await preparePromptEnhancement(base);
    const emphasisSections = prepared.currentBody.sections.map((section) => ({
      sectionKind: section.sectionKind, bodyText: section.bodyText,
    }));
    // A reply naming real markable spans — the tier at its most active, not a quiet no-op.
    const offered = buildPromptEnhancementEmphasisMarkableBodyV1({ sections: emphasisSections })
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 20)
      .slice(0, 4)
      .map((line) => line.slice(0, 22).trim());
    const client = {
      chat: { completions: { create: async () => ({ choices: [{ message: { content: JSON.stringify({ phrases: offered }) } }] }) } },
    } as unknown as PromptEnhancementEmphasisModelClientV1;

    const ui = interaction([{ type: 'use_current' }]);
    const result = await runPromptEnhancementCliSubmitPopupV1({
      request: base, result: prepared, interaction: ui, emphasisPhrases: FLOOR,
      ...(tier === 'on' ? { emphasisModel: { client } } : {}),
    });

    return {
      offered,
      returned: result.state === 'selected_current' ? result.bodyText : undefined,
      composed: prepared.currentBody.text,
      drawn: ui.views.map((view) => view.model.body.text),
      edited: ui.views.map((view) => view.editedBodyText),
      sections: ui.views.map((view) => view.sections?.map((section) => section.bodyText)),
    };
  }

  for (const [name, prompt] of [['the small body', SMALL_PROMPT], ['the confirmation-carrying body', CONFIRMATION_PROMPT]] as const) {
    it(`leaves ${name} byte-identical with the tier on and off`, async () => {
      const off = await bodyTextsFor(prompt, 'off');
      const on = await bodyTextsFor(prompt, 'on');

      // The premise: the tier really had something to say about this body. Without this the
      // comparison would pass just as well on a tier that did nothing at all.
      expect(on.offered.length).toBeGreaterThan(0);

      expect(on.composed).toBe(off.composed);
      expect(on.drawn).toEqual(off.drawn);
      expect(on.edited).toEqual(off.edited);
      expect(on.sections).toEqual(off.sections);
      expect(on.returned).toBe(off.returned);
      // Byte-for-byte, not merely equal as strings the renderer happens to normalise.
      expect(Buffer.from(on.returned ?? '', 'utf8').equals(Buffer.from(off.returned ?? '', 'utf8'))).toBe(true);
    });
  }
});
