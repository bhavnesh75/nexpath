/**
 * The recorded popup frames, drawn with each section's number after its title.
 *
 * These are the frames the earlier recording captured, built by the same steps and
 * on the same prepared results, with one addition: the shell's numbering pass. Two
 * things are pinned. Each numbered frame is a snapshot of its own. And stripping the
 * numbers out of a numbered frame gives the recorded frame back byte for byte — so the
 * numbers are proven to be an addition and nothing else: no row moved, no character
 * changed, no caret shifted.
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
  buildPromptEnhancementCliInteractionStateV1,
  isPromptEnhancementScrollMarkerLineV1,
  promptEnhancementCliViewportV1,
  renderPromptEnhancementPopupFrameV1,
  windowPromptEnhancementFieldForDisplayWithStartV1,
  type PromptEnhancementCliFrameStateV1,
} from './cli-submit-popup.js';
import {
  buildPromptEnhancementVisualLineMapV1,
  promptEnhancementCursorVisualPositionV1,
} from './multiline-editor.js';
import { buildPromptEnhancementPopupRenderModelV1 } from './popup-render-model.js';
import { buildPromptEnhancementSectionNumberSuffixesV1 } from './popup-section-numbers.js';

const DRAFTED_SENTENCE = vi.hoisted(
  () => 'Keep the existing behaviour of the payment gateway client and cover it with a test.',
);

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
          outputId: 'llm-out-numbered-frames',
          sectionDrafts: plans.map((plan) => ({
            sectionId: plan.sectionId,
            bodyText: DRAFTED_SENTENCE,
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
const CONFIRMATION_PROMPT =
  'Fix the failing payment test, the test failure blocks ci, and explain the verification. also drop a shadow under the submit button.';
const TIMESTAMP_MS = 1_000_000;
const COLUMNS = 80;
const ROWS = 24;
const ESC = '\u001b';

function request(text: string): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'numbered-frames-source-a',
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
    requestId: 'numbered-frames-request',
    projectRoot: '/tmp/numbered-frames-project',
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

function readable(text: string): string {
  return text.split(ESC).join('\\e');
}

/**
 * Removes every number the shell adds — four spaces then `#N`, dim or plain — and
 * nothing else. Applied to a numbered frame it must give the recorded frame back.
 */
function stripNumbers(frame: string): string {
  return frame
    .replace(new RegExp(`    ${ESC}\\[2m#\\d+${ESC}\\[0m`, 'g'), '')
    .replace(/    #\d+(?=\n|$)/g, '');
}

interface FrameOptions {
  colorize: boolean;
  refinement?: boolean;
  windowed?: boolean;
  /** When set, the numbering pass is skipped — the recorded frame's own recipe. */
  plain?: boolean;
}

/** The recorded frame's recipe, with the shell's numbering pass added on top. */
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
        ROWS - 1 - (renderPromptEnhancementPopupFrameV1(
          { model, editedBodyText: 'x', additionalDetailsText: '' },
          { focusIndex: 0, helpExpanded: false, refinement, colorize: false },
        ).split('\n').length - 1),
      )
    : buildPromptEnhancementVisualLineMapV1(model.body.text, fieldWidth).length;

  const state = buildPromptEnhancementCliInteractionStateV1({
    model, editedBodyText: model.body.text, additionalDetailsText: '', fieldWidth, viewportRows: bodyRows, refinement,
  });
  const buffer = state.editor.buffers.enhanced_body;
  const window = windowPromptEnhancementFieldForDisplayWithStartV1(buffer, fieldWidth, bodyRows);

  let caret: PromptEnhancementCliFrameStateV1['caret'];
  const position = promptEnhancementCursorVisualPositionV1(buffer, fieldWidth);
  const visualRow = position.row - window.start;
  if (visualRow >= 0 && visualRow < window.text.split('\n').length) {
    caret = { field: 'enhanced_body', visualRow, visualColumn: position.column };
  }

  // The numbering pass, exactly as the shell performs it after windowing the body.
  const shown = window.text.split('\n');
  const bodyLineSuffixes = options.plain ? undefined : buildPromptEnhancementSectionNumberSuffixesV1({
    text: buffer.text,
    sections: result.currentBody.sections.map((section) => ({ title: section.title, bodyText: section.bodyText })),
    fieldWidth,
    windowStart: window.start,
    windowRows: shown.length,
    markerAbove: isPromptEnhancementScrollMarkerLineV1(shown[0] ?? ''),
    markerBelow: isPromptEnhancementScrollMarkerLineV1(shown[shown.length - 1] ?? ''),
  });

  const caretOut = { row: -1, col: -1 };
  const frame = renderPromptEnhancementPopupFrameV1(
    { model, editedBodyText: window.text, additionalDetailsText: '' },
    { focusIndex: 0, helpExpanded: false, refinement, colorize: options.colorize, caret, caretOut, bodyLineSuffixes },
  );
  return { frame, caretOut };
}

/** Every section title, so the test can prove each one got a number. */
function titles(result: PromptEnhancementPrepareResultV1): readonly string[] {
  return result.currentBody.sections.map((section) => section.title);
}

describe('the recorded frames, numbered', () => {
  const savedKey = process.env['OPENAI_API_KEY'];
  afterEach(() => {
    if (savedKey === undefined) delete process.env['OPENAI_API_KEY'];
    else process.env['OPENAI_API_KEY'] = savedKey;
  });

  const cases: { name: string; prompt: string; withKey: boolean; options: FrameOptions }[] = [
    { name: 'small body, colour off', prompt: SMALL_PROMPT, withKey: false, options: { colorize: false } },
    { name: 'small body, colour on', prompt: SMALL_PROMPT, withKey: false, options: { colorize: true } },
    { name: 'confirmation-carrying body, colour off', prompt: CONFIRMATION_PROMPT, withKey: false, options: { colorize: false } },
    { name: 'confirmation-carrying body, colour on', prompt: CONFIRMATION_PROMPT, withKey: false, options: { colorize: true } },
    { name: 'medium body, colour off', prompt: SMALL_PROMPT, withKey: true, options: { colorize: false } },
    { name: 'medium body, colour on', prompt: SMALL_PROMPT, withKey: true, options: { colorize: true } },
    { name: 'largest body, colour off', prompt: CONFIRMATION_PROMPT, withKey: true, options: { colorize: false } },
    { name: 'largest body, colour on', prompt: CONFIRMATION_PROMPT, withKey: true, options: { colorize: true } },
    { name: 'largest body, windowed at 80 x 24', prompt: CONFIRMATION_PROMPT, withKey: true, options: { colorize: false, windowed: true } },
    { name: 'refinement view, colour off', prompt: SMALL_PROMPT, withKey: true, options: { colorize: false, refinement: true } },
    { name: 'refinement view, colour on', prompt: SMALL_PROMPT, withKey: true, options: { colorize: true, refinement: true } },
  ];

  for (const testCase of cases) {
    describe(testCase.name, () => {
      let result: PromptEnhancementPrepareResultV1;
      beforeEach(async () => {
        if (testCase.withKey) process.env['OPENAI_API_KEY'] = `sk-${'a'.repeat(24)}`;
        else delete process.env['OPENAI_API_KEY'];
        result = await preparePromptEnhancement(request(testCase.prompt));
      });

      it('is recorded', () => {
        const numbered = frameOf(result, testCase.options);
        expect({ frame: readable(numbered.frame), caretOut: numbered.caretOut }).toMatchSnapshot();
      });

      it('carries a number after every title shown, in order', () => {
        const { frame } = frameOf(result, testCase.options);
        let expected = 1;
        for (const title of titles(result)) {
          // A windowed frame may have scrolled a title out of view or under a marker;
          // a title that is shown must carry its number, and the numbers must be in order.
          const shown = frame.includes(`${title}:`);
          if (!shown) { expected += 1; continue; }
          const mark = testCase.options.colorize ? `${ESC}[2m#${expected}${ESC}[0m` : `#${expected}`;
          expect(frame).toContain(`${title}:    ${mark}`);
          expected += 1;
        }
      });

      it('stripped of its numbers, equals the recorded frame byte for byte', () => {
        const numbered = frameOf(result, testCase.options);
        const recorded = frameOf(result, { ...testCase.options, plain: true });
        expect(stripNumbers(numbered.frame)).toBe(recorded.frame);
        expect(numbered.caretOut).toEqual(recorded.caretOut);
      });
    });
  }
});
