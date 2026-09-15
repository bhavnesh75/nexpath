/**
 * Frame snapshots for the prompt-enhancement submit popup.
 *
 * Records the frames today's popup draws, so any later change to the popup's
 * appearance shows up as an explicit snapshot diff instead of passing quietly.
 *
 * The frames are built from the renderer's own exported steps, in the order the
 * interactive shell runs them (probe for the chrome height, size the body, window
 * it, place the caret, draw): the shell itself opens a real console, so it cannot
 * run under vitest, but every step it performs is exported and is repeated here.
 *
 * Every premise each fixture rests on is asserted rather than assumed, so a change
 * to the pruner, the composer or the validator fails loudly here instead of
 * silently reshaping a snapshot.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  type PromptEnhancementPrepareRequestV1,
  type PromptEnhancementPrepareResultV1,
  type PromptEnhancementSourceRefV1,
} from './contracts.js';
import { buildPromptEnhancementCostVisibilityMetadataV1 } from './cost-observability.js';
import { preparePromptEnhancement } from './facade.js';
import { getPromptStartStopSourceSnapshot } from './source-reality.js';
import {
  buildPromptEnhancementCliActionRowsV1,
  buildPromptEnhancementCliInteractionStateV1,
  decodePromptEnhancementCliKeyV1,
  promptEnhancementCliViewportV1,
  reducePromptEnhancementCliInteractionV1,
  renderPromptEnhancementPopupFrameV1,
  windowPromptEnhancementFieldForDisplayWithStartV1,
  type PromptEnhancementCliFrameStateV1,
  type PromptEnhancementCliInteractionStateV1,
} from './cli-submit-popup.js';
import {
  buildPromptEnhancementVisualLineMapV1,
  promptEnhancementCursorVisualPositionV1,
} from './multiline-editor.js';
import {
  buildPromptEnhancementPopupRenderModelV1,
  type PromptEnhancementPopupRenderModelV1,
} from './popup-render-model.js';

// The composer is mocked so the wording path can be exercised without a network
// call: it drafts every planned section except the verbatim one, from the user's
// own prompt, with no risk words and no placeholders. The route-rescue path is
// stubbed for the same reason — with a (fake) key present neither may reach a
// real client.
vi.mock('./llm-composer.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./llm-composer.js')>();
  return {
    ...original,
    composeStructuredComposerOutputV1: vi.fn(async (input: {
      planning: {
        sectionPlans: readonly {
          sectionId: string;
          sectionKind: string;
          structuredContentPartRefs: readonly string[];
        }[];
      };
    }) => {
      const plans = input.planning.sectionPlans.filter(
        (plan) => plan.sectionKind !== 'original_request_or_goal' && plan.structuredContentPartRefs.length > 0,
      );
      if (plans.length === 0) return { ok: false, reason: 'no_eligible_sections' };
      return {
        ok: true,
        output: {
          outputId: 'llm-out-frames-snapshot',
          sectionDrafts: plans.map((plan) => ({
            sectionId: plan.sectionId,
            bodyText: 'Keep the existing behaviour of the payment gateway client and cover it with a test.',
            sourceFactIds: [plan.structuredContentPartRefs[0]!],
          })),
          composerClaims: plans.map((plan) => `claim:${plan.structuredContentPartRefs[0]!}`),
          detectedLanguageSelfReport: 'en',
        },
      };
    }),
  };
});
vi.mock('./llm-route-decision.js', () => ({
  decidePromptEnhancementRouteViaLlmV1: vi.fn(async () => undefined),
}));

const SMALL_PROMPT = 'Add a retry with exponential backoff to the payment gateway client.';
/** A prompt the pipeline composes a confirmation-carrying section for. */
const CONFIRMATION_PROMPT =
  'Fix the failing payment test, the test failure blocks ci, and explain the verification. also drop a shadow under the submit button.';

/** A fixed clock: the renderer reads none, and the model builder only bounds-checks this. */
const TIMESTAMP_MS = 1_000_000;
/** The columns the docked popup is laid out for. */
const COLUMNS = 80;
const ROWS = 24;

function request(text: string): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'frames-source-a',
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
    requestId: 'frames-request',
    projectRoot: '/tmp/frames-project',
    hostSurface: 'cli_stop_bridge',
    sourcePrompt: {
      text,
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
    configSnapshot: {
      sequenceEnabledState: 'not_enabled_v1',
      validatedEffectiveConfigState: 'valid',
      arbitraryConfigRowsAreAuthority: false,
    },
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

/** Escapes are written as visible text so the snapshot file holds no control bytes. */
function readable(text: string): string {
  return text.split('\u001b').join('\\e');
}

interface FrameOptions {
  colorize: boolean;
  refinement?: boolean;
  /** Size the body from the terminal instead of showing it whole, so the scroll markers appear. */
  windowed?: boolean;
}

/**
 * One frame, built the way the interactive shell builds it: measure the chrome with
 * a one-line-body probe, give the body what is left, window it, place the caret from
 * that same window, then draw.
 */
function frameOf(result: PromptEnhancementPrepareResultV1, options: FrameOptions): {
  frame: string;
  caretOut: { row: number; col: number };
} {
  const built = buildPromptEnhancementPopupRenderModelV1({
    result,
    timestampMs: TIMESTAMP_MS,
    deliverySurface: result.delivery.deliveryChannel,
  });
  if (built.state !== 'render_model_ready') throw new Error(`render model not ready: ${built.state}`);
  const model = built.model;

  const { fieldWidth } = promptEnhancementCliViewportV1(COLUMNS, ROWS);
  const refinement = options.refinement ?? false;

  const bodyRows = options.windowed
    ? Math.max(
        4,
        ROWS
          - 1
          - (renderPromptEnhancementPopupFrameV1(
              { model, editedBodyText: 'x', additionalDetailsText: '' },
              { focusIndex: 0, helpExpanded: false, refinement, colorize: false },
            ).split('\n').length - 1),
      )
    : buildPromptEnhancementVisualLineMapV1(model.body.text, fieldWidth).length;

  const state = buildPromptEnhancementCliInteractionStateV1({
    model,
    editedBodyText: model.body.text,
    additionalDetailsText: '',
    fieldWidth,
    viewportRows: bodyRows,
    refinement,
  });

  const buffer = state.editor.buffers.enhanced_body;
  const window = windowPromptEnhancementFieldForDisplayWithStartV1(buffer, fieldWidth, bodyRows);

  let caret: PromptEnhancementCliFrameStateV1['caret'];
  const position = promptEnhancementCursorVisualPositionV1(buffer, fieldWidth);
  const visualRow = position.row - window.start;
  if (visualRow >= 0 && visualRow < window.text.split('\n').length) {
    caret = { field: 'enhanced_body', visualRow, visualColumn: position.column };
  }

  const caretOut = { row: -1, col: -1 };
  const frame = renderPromptEnhancementPopupFrameV1(
    { model, editedBodyText: window.text, additionalDetailsText: '' },
    { focusIndex: 0, helpExpanded: false, refinement, colorize: options.colorize, caret, caretOut },
  );
  return { frame: readable(frame), caretOut };
}

function sectionTitles(result: PromptEnhancementPrepareResultV1): readonly string[] {
  return result.currentBody.sections.map((section) => section.title);
}

describe('prompt-enhancement submit popup frames', () => {
  const savedKey = process.env['OPENAI_API_KEY'];
  afterEach(() => {
    if (savedKey === undefined) delete process.env['OPENAI_API_KEY'];
    else process.env['OPENAI_API_KEY'] = savedKey;
  });

  describe('without a key, the body is the floor the pruner keeps', () => {
    let small: PromptEnhancementPrepareResultV1;
    let confirmation: PromptEnhancementPrepareResultV1;

    beforeEach(async () => {
      delete process.env['OPENAI_API_KEY'];
      small = await preparePromptEnhancement(request(SMALL_PROMPT));
      confirmation = await preparePromptEnhancement(request(CONFIRMATION_PROMPT));
    });

    it('premise: each body equals its own floor, and one of them carries the confirmation', () => {
      expect(small.currentBody.sections.length).toBe(small.floorSectionCount);
      expect(confirmation.currentBody.sections.length).toBe(confirmation.floorSectionCount);

      const carrying = confirmation.currentBody.sections.filter(
        (section) => section.confirmationRequired && section.confirmationPresent,
      );
      expect(carrying).toHaveLength(1);
      expect(small.currentBody.sections.some((section) => section.confirmationRequired)).toBe(false);
    });

    it('draws the small body, colour off', () => {
      expect(sectionTitles(small)).toMatchSnapshot('titles');
      expect(frameOf(small, { colorize: false })).toMatchSnapshot();
    });

    it('draws the small body, colour on', () => {
      expect(frameOf(small, { colorize: true })).toMatchSnapshot();
    });

    it('draws the confirmation-carrying body, colour off', () => {
      expect(sectionTitles(confirmation)).toMatchSnapshot('titles');
      expect(frameOf(confirmation, { colorize: false })).toMatchSnapshot();
    });

    it('draws the confirmation-carrying body, colour on', () => {
      expect(frameOf(confirmation, { colorize: true })).toMatchSnapshot();
    });
  });

  describe('with a key, the wording path adds what the cap allows', () => {
    let medium: PromptEnhancementPrepareResultV1;
    let largest: PromptEnhancementPrepareResultV1;

    beforeEach(async () => {
      process.env['OPENAI_API_KEY'] = `sk-${'a'.repeat(24)}`;
      medium = await preparePromptEnhancement(request(SMALL_PROMPT));
      largest = await preparePromptEnhancement(request(CONFIRMATION_PROMPT));
    });

    it('premise: each body is its floor plus the two extras the cap allows', () => {
      expect(medium.currentBody.sections.length).toBe((medium.floorSectionCount ?? 0) + 2);
      expect(largest.currentBody.sections.length).toBe((largest.floorSectionCount ?? 0) + 2);
    });

    it('premise: exactly one section of the largest body carries the confirmation', () => {
      const carrying = largest.currentBody.sections.filter(
        (section) => section.confirmationRequired && section.confirmationPresent,
      );
      expect(carrying).toHaveLength(1);
    });

    it('premise: every drawn section but the verbatim one carries its drafted sentence', () => {
      for (const section of medium.currentBody.sections) {
        if (section.sectionKind === 'original_request_or_goal') continue;
        expect(section.bodyText.length).toBeGreaterThan(0);
      }
    });

    it('draws the medium body, colour off', () => {
      expect(sectionTitles(medium)).toMatchSnapshot('titles');
      expect(frameOf(medium, { colorize: false })).toMatchSnapshot();
    });

    it('draws the medium body, colour on', () => {
      expect(frameOf(medium, { colorize: true })).toMatchSnapshot();
    });

    it('draws the largest body, colour off', () => {
      expect(sectionTitles(largest)).toMatchSnapshot('titles');
      expect(frameOf(largest, { colorize: false })).toMatchSnapshot();
    });

    it('draws the largest body, colour on', () => {
      expect(frameOf(largest, { colorize: true })).toMatchSnapshot();
    });

    it('draws the largest body sized to the terminal, so the scroll marker shows', () => {
      const windowed = frameOf(largest, { colorize: false, windowed: true });
      expect(windowed.frame).toContain('more lines below');
      expect(windowed).toMatchSnapshot();
    });

    it('draws the refinement view, colour off', () => {
      expect(frameOf(medium, { colorize: false, refinement: true })).toMatchSnapshot();
    });

    it('draws the refinement view, colour on', () => {
      expect(frameOf(medium, { colorize: true, refinement: true })).toMatchSnapshot();
    });
  });
});

/** Draws a frame from an interaction state the reducer has already produced. */
function frameOfState(
  model: PromptEnhancementPopupRenderModelV1,
  state: PromptEnhancementCliInteractionStateV1,
  fieldWidth: number,
  bodyRows: number,
  colorize: boolean,
): { frame: string; caretOut: { row: number; col: number } } {
  const buffer = state.editor.buffers.enhanced_body;
  const window = windowPromptEnhancementFieldForDisplayWithStartV1(buffer, fieldWidth, bodyRows);
  let caret: PromptEnhancementCliFrameStateV1['caret'];
  const position = promptEnhancementCursorVisualPositionV1(buffer, fieldWidth);
  const visualRow = position.row - window.start;
  if (visualRow >= 0 && visualRow < window.text.split('\n').length) {
    caret = { field: 'enhanced_body', visualRow, visualColumn: position.column };
  }
  const caretOut = { row: -1, col: -1 };
  const frame = renderPromptEnhancementPopupFrameV1(
    { model, editedBodyText: window.text, additionalDetailsText: '' },
    { focusIndex: state.focusIndex, helpExpanded: state.helpExpanded, colorize, caret, caretOut },
  );
  return { frame: readable(frame), caretOut };
}

describe('prompt-enhancement submit popup frames with applied details', () => {
  const savedKey = process.env['OPENAI_API_KEY'];
  const DETAILS_TEXT = 'Keep the retry count at five.';

  afterEach(() => {
    if (savedKey === undefined) delete process.env['OPENAI_API_KEY'];
    else process.env['OPENAI_API_KEY'] = savedKey;
  });

  async function applied(): Promise<{
    model: PromptEnhancementPopupRenderModelV1;
    state: PromptEnhancementCliInteractionStateV1;
    fieldWidth: number;
    bodyRows: number;
  }> {
    delete process.env['OPENAI_API_KEY'];
    const result = await preparePromptEnhancement(request(SMALL_PROMPT));
    const built = buildPromptEnhancementPopupRenderModelV1({
      result,
      timestampMs: TIMESTAMP_MS,
      deliverySurface: result.delivery.deliveryChannel,
    });
    if (built.state !== 'render_model_ready') throw new Error(`render model not ready: ${built.state}`);
    const model = built.model;
    const { fieldWidth } = promptEnhancementCliViewportV1(COLUMNS, ROWS);

    let state = buildPromptEnhancementCliInteractionStateV1({
      model,
      editedBodyText: model.body.text,
      additionalDetailsText: '',
      fieldWidth,
      viewportRows: buildPromptEnhancementVisualLineMapV1(model.body.text, fieldWidth).length,
    });
    const rows = buildPromptEnhancementCliActionRowsV1(model);
    const press = (raw: string): void => {
      state = reducePromptEnhancementCliInteractionV1(state, rows, decodePromptEnhancementCliKeyV1(raw)).state;
    };

    press('\u001b[B');
    for (const character of DETAILS_TEXT) press(character);
    press('\r');

    const bodyRows = buildPromptEnhancementVisualLineMapV1(
      state.editor.buffers.enhanced_body.text,
      fieldWidth,
    ).length;
    return { model, state, fieldWidth, bodyRows };
  }

  it('premise: applying details merges them into the body under their own heading', async () => {
    const { model, state } = await applied();
    const merged = state.editor.buffers.enhanced_body.text;
    expect(merged).toContain('Additional details to incorporate:');
    expect(merged).toContain(DETAILS_TEXT);
    expect(merged.startsWith(model.body.text)).toBe(true);
    expect(state.editor.buffers.additional_details.text).toBe('');
  });

  it('draws the body with applied details, colour off', async () => {
    const { model, state, fieldWidth, bodyRows } = await applied();
    expect(frameOfState(model, state, fieldWidth, bodyRows, false)).toMatchSnapshot();
  });

  it('draws the body with applied details, colour on', async () => {
    const { model, state, fieldWidth, bodyRows } = await applied();
    expect(frameOfState(model, state, fieldWidth, bodyRows, true)).toMatchSnapshot();
  });
});

describe('prompt-enhancement submit popup frames on macOS', () => {
  const originalPlatform = process.platform;
  const savedKey = process.env['OPENAI_API_KEY'];

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    if (savedKey === undefined) delete process.env['OPENAI_API_KEY'];
    else process.env['OPENAI_API_KEY'] = savedKey;
    vi.resetModules();
  });

  // The shortcut hint is fixed when the popup module is first loaded, so the platform
  // has to be set before a fresh import of it — hence the reset and the dynamic import.
  it('names the Mac keys in the shortcut hint', async () => {
    delete process.env['OPENAI_API_KEY'];
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    vi.resetModules();

    const popup = await import('./cli-submit-popup.js');
    const renderModel = await import('./popup-render-model.js');
    const editor = await import('./multiline-editor.js');
    const facade = await import('./facade.js');

    const result = await facade.preparePromptEnhancement(request(SMALL_PROMPT));
    const built = renderModel.buildPromptEnhancementPopupRenderModelV1({
      result,
      timestampMs: TIMESTAMP_MS,
      deliverySurface: result.delivery.deliveryChannel,
    });
    if (built.state !== 'render_model_ready') throw new Error(`render model not ready: ${built.state}`);
    const model = built.model;

    const { fieldWidth } = popup.promptEnhancementCliViewportV1(COLUMNS, ROWS);
    const bodyRows = editor.buildPromptEnhancementVisualLineMapV1(model.body.text, fieldWidth).length;
    const state = popup.buildPromptEnhancementCliInteractionStateV1({
      model,
      editedBodyText: model.body.text,
      additionalDetailsText: '',
      fieldWidth,
      viewportRows: bodyRows,
    });
    const buffer = state.editor.buffers.enhanced_body;
    const window = popup.windowPromptEnhancementFieldForDisplayWithStartV1(buffer, fieldWidth, bodyRows);
    const position = editor.promptEnhancementCursorVisualPositionV1(buffer, fieldWidth);
    const visualRow = position.row - window.start;
    const caret = visualRow >= 0 && visualRow < window.text.split('\n').length
      ? { field: 'enhanced_body' as const, visualRow, visualColumn: position.column }
      : undefined;

    const caretOut = { row: -1, col: -1 };
    const frame = popup.renderPromptEnhancementPopupFrameV1(
      { model, editedBodyText: window.text, additionalDetailsText: '' },
      { focusIndex: 0, helpExpanded: false, colorize: false, caret, caretOut },
    );

    expect(frame).toContain('Cmd+J');
    expect(frame).not.toContain('Ctrl+J');
    expect({ frame: readable(frame), caretOut }).toMatchSnapshot();
  });
});
