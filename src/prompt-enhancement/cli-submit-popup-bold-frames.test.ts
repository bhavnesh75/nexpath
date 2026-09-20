/**
 * The recorded popup frames, drawn with the emphasised phrases in bold.
 *
 * Built on the same prepared results and by the same steps as the numbered frames, with one more
 * pass on top: the overlay. Four things are pinned. Each frame is a snapshot of its own. Stripping
 * the bold out of a frame gives the frame drawn without it back byte for byte — so the marks are
 * an addition and nothing else: no row moved, no character changed, no caret shifted. Every bold
 * opened on a row is closed on that row, because each line is erased to its end after it is
 * written and an attribute left open would bleed into the next. And the bytes are asserted as
 * bytes — `ESC[1m` … `ESC[0m` — not as an appearance, because a good many Windows consoles draw
 * SGR 1 as bright rather than heavy and that is the intended look, not a failure.
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
import { buildPromptEnhancementEmphasisSpansV1 } from './popup-emphasis-overlay.js';
import { buildPromptEnhancementEmphasisPhrasesV1 } from './emphasis-locate.js';
import type { PromptEnhancementEmphasisPhraseV1 } from '../store/pending-prompt-enhancements.js';

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
          outputId: 'llm-out-bold-frames',
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

/** Phase 0's own two fixtures — the bodies every other phase pins against. */
const SMALL_PROMPT = 'Add a retry with exponential backoff to the payment gateway client.';
const CONFIRMATION_PROMPT =
  'Fix the failing payment test, the test failure blocks ci, and explain the verification. also drop a shadow under the submit button.';
const TIMESTAMP_MS = 1_000_000;
const COLUMNS = 80;
const ROWS = 24;
const ESC = String.fromCharCode(27);
const BOLD = `${ESC}[1m`;
const RESET = `${ESC}[0m`;

function request(text: string): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'bold-frames-source-a',
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
    requestId: 'bold-frames-request',
    projectRoot: '/tmp/bold-frames-project',
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

/** The phrases the hook would store for this body — the same derivation, in the same shape. */
function phrasesOf(result: PromptEnhancementPrepareResultV1): readonly PromptEnhancementEmphasisPhraseV1[] {
  return buildPromptEnhancementEmphasisPhrasesV1({
    originalPromptText: result.currentBody.originalPromptText,
    sections: result.currentBody.sections.map((section) => ({
      sectionKind: section.sectionKind,
      bodyText: section.bodyText,
      ...(section.groundedFactValues ? { groundedFactValues: section.groundedFactValues } : {}),
      ...(section.sourceFactIds ? { sourceFactIds: section.sourceFactIds } : {}),
      ...(section.sourceIds ? { sourceIds: section.sourceIds } : {}),
    })),
    detectedLanguage: 'en',
  });
}

/**
 * Whether any bold is still open at the end of a line. The scan reads the line's own SGR codes —
 * `1` opens, `0` closes everything — which is what a terminal does with them.
 */
function boldLeftOpen(line: string): boolean {
  let open = false;
  for (const match of line.matchAll(new RegExp(`${ESC}\\[([0-9;]*)m`, 'g'))) {
    for (const code of (match[1] ?? '').split(';')) {
      if (code === '1') open = true;
      if (code === '0' || code === '') open = false;
    }
  }
  return open;
}

interface FrameOptions {
  colorize: boolean;
  refinement?: boolean;
  windowed?: boolean;
  /** When set, the overlay pass is skipped — the frame as it is drawn without any marks. */
  plain?: boolean;
  /** The `NO_COLOR` rule: the marks draw plain, which for bold means they do not draw. */
  plainMarks?: boolean;
  /** Narrow the body so a marked phrase is forced across a wrap. */
  fieldWidth?: number;
  /** Put the caret inside the first marked stretch on screen. */
  caretInsideMark?: boolean;
}

/** The recorded frame's recipe, with the numbering pass and then the overlay pass on top. */
function frameOf(result: PromptEnhancementPrepareResultV1, options: FrameOptions): {
  frame: string;
  caretOut: { row: number; col: number };
  spans: readonly (readonly { startColumn: number; endColumn: number }[])[];
  shown: readonly string[];
} {
  const built = buildPromptEnhancementPopupRenderModelV1({
    result,
    timestampMs: TIMESTAMP_MS,
    deliverySurface: result.delivery.deliveryChannel,
  });
  if (built.state !== 'render_model_ready') throw new Error(`render model not ready: ${built.state}`);
  const model = built.model;
  const fieldWidth = options.fieldWidth ?? promptEnhancementCliViewportV1(COLUMNS, ROWS).fieldWidth;
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
  const shown = window.text.split('\n');
  const sections = result.currentBody.sections.map((section) => ({
    title: section.title,
    bodyText: section.bodyText,
    sectionKind: section.sectionKind,
  }));

  const bodyLineSuffixes = buildPromptEnhancementSectionNumberSuffixesV1({
    text: buffer.text,
    sections,
    fieldWidth,
    windowStart: window.start,
    windowRows: shown.length,
    markerAbove: isPromptEnhancementScrollMarkerLineV1(shown[0] ?? ''),
    markerBelow: isPromptEnhancementScrollMarkerLineV1(shown[shown.length - 1] ?? ''),
  });

  // The overlay pass, exactly as the shell performs it from the same window.
  const spans = buildPromptEnhancementEmphasisSpansV1({
    text: buffer.text,
    sections,
    phrases: phrasesOf(result),
    fieldWidth,
    windowStart: window.start,
    windowRows: shown.length,
    markerAbove: isPromptEnhancementScrollMarkerLineV1(shown[0] ?? ''),
    markerBelow: isPromptEnhancementScrollMarkerLineV1(shown[shown.length - 1] ?? ''),
  });

  let caret: PromptEnhancementCliFrameStateV1['caret'];
  const marked = spans.findIndex((row) => row.length > 0);
  if (options.caretInsideMark && marked >= 0) {
    caret = { field: 'enhanced_body', visualRow: marked, visualColumn: spans[marked]![0]!.startColumn + 1 };
  } else {
    const position = promptEnhancementCursorVisualPositionV1(buffer, fieldWidth);
    const visualRow = position.row - window.start;
    if (visualRow >= 0 && visualRow < shown.length) {
      caret = { field: 'enhanced_body', visualRow, visualColumn: position.column };
    }
  }

  const caretOut = { row: -1, col: -1 };
  const frame = renderPromptEnhancementPopupFrameV1(
    { model, editedBodyText: window.text, additionalDetailsText: '' },
    {
      focusIndex: 0,
      helpExpanded: false,
      refinement,
      colorize: options.colorize,
      caret,
      caretOut,
      bodyLineSuffixes,
      ...(options.plain ? {} : { bodyLineSpans: spans }),
      ...(options.plainMarks ? { plainMarks: true } : {}),
    },
  );
  return { frame, caretOut, spans, shown };
}

/**
 * Removes exactly the bold the overlay adds, and nothing else.
 *
 * The focused row's own label is drawn bold too, and it is the FIRST bold in the frame — every
 * overlay mark comes after it, inside the body block. So the marks are removed from the end
 * backwards, one opener and its own closer at a time, which leaves the label's pair untouched.
 */
function stripBold(frame: string, marks: number): string {
  let out = frame;
  for (let removed = 0; removed < marks; removed++) {
    const open = out.lastIndexOf(BOLD);
    if (open < 0) break;
    const close = out.indexOf(RESET, open + BOLD.length);
    if (close < 0) break;
    out = out.slice(0, open) + out.slice(open + BOLD.length, close) + out.slice(close + RESET.length);
  }
  return out;
}

describe('the recorded frames, emphasised', () => {
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
    { name: 'largest body, colour on', prompt: CONFIRMATION_PROMPT, withKey: true, options: { colorize: true } },
    { name: 'largest body, windowed at 80 x 24', prompt: CONFIRMATION_PROMPT, withKey: true, options: { colorize: true, windowed: true } },
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
        const drawn = frameOf(result, testCase.options);
        expect({ frame: readable(drawn.frame), caretOut: drawn.caretOut }).toMatchSnapshot();
      });

      it('stripped of its bold, equals the frame drawn without it', () => {
        const drawn = frameOf(result, testCase.options);
        const plain = frameOf(result, { ...testCase.options, plain: true });
        expect(stripBold(drawn.frame, drawn.spans.flat().length)).toBe(plain.frame);
        expect(drawn.caretOut).toEqual(plain.caretOut);
      });

      it('leaves no bold open at the end of any line', () => {
        for (const line of frameOf(result, testCase.options).frame.split('\n')) {
          expect(boldLeftOpen(line)).toBe(false);
        }
      });

      it('draws nothing under NO_COLOR, whatever the marks say', () => {
        const plainMarks = frameOf(result, { ...testCase.options, plainMarks: true });
        const plain = frameOf(result, { ...testCase.options, plain: true, plainMarks: true });
        expect(plainMarks.frame).toBe(plain.frame);
      });

      it('never puts a marked stretch where the body does not hold one', () => {
        const drawn = frameOf(result, testCase.options);
        for (const [index, row] of drawn.spans.entries()) {
          for (const span of row) {
            const text = drawn.shown[index]!.slice(span.startColumn, span.endColumn);
            expect(text.length).toBeGreaterThan(0);
            if (testCase.options.colorize) expect(drawn.frame).toContain(`${BOLD}${text}${RESET}`);
          }
        }
      });
    });
  }
});

describe('the bytes, and the caret', () => {
  beforeEach(() => { process.env['OPENAI_API_KEY'] = `sk-${'a'.repeat(24)}`; });
  afterEach(() => { delete process.env['OPENAI_API_KEY']; });

  let result: PromptEnhancementPrepareResultV1;
  beforeEach(async () => { result = await preparePromptEnhancement(request(CONFIRMATION_PROMPT)); });

  it('has something to say on this body — so the proofs above are not vacuous', () => {
    const drawn = frameOf(result, { colorize: true });
    expect(phrasesOf(result).length).toBeGreaterThan(0);
    expect(drawn.spans.some((row) => row.length > 0)).toBe(true);
    // Asserted as bytes, not as an appearance: many Windows consoles render SGR 1 as bright
    // rather than heavy, and that is the intended look.
    expect(drawn.frame).toContain(BOLD);
    expect(drawn.frame.split(BOLD).length - 1).toBeGreaterThan(0);
  });

  it('draws no SGR at all on a frame with colour off, even when the marks are supplied', () => {
    // The chrome probe renders with a one-character body and colour off; nothing it measures can
    // carry a mark, and the marks could not draw on it even if they reached it.
    const drawn = frameOf(result, { colorize: false });
    expect(drawn.frame).not.toContain(ESC);
    expect(drawn.frame).toBe(frameOf(result, { colorize: false, plain: true }).frame);
  });

  it('measures the same chrome with the marks as without them', () => {
    const built = buildPromptEnhancementPopupRenderModelV1({
      result, timestampMs: TIMESTAMP_MS, deliverySurface: result.delivery.deliveryChannel,
    });
    if (built.state !== 'render_model_ready') throw new Error('render model not ready');
    const probe = (spans?: readonly (readonly { startColumn: number; endColumn: number }[])[]) =>
      renderPromptEnhancementPopupFrameV1(
        { model: built.model, editedBodyText: 'x', additionalDetailsText: '' },
        { focusIndex: 0, helpExpanded: false, colorize: false, ...(spans ? { bodyLineSpans: spans } : {}) },
      );
    expect(probe([[{ startColumn: 0, endColumn: 1 }]])).toBe(probe());
  });

  it('keeps the caret where it was, with the marks on and off', () => {
    const drawn = frameOf(result, { colorize: true, caretInsideMark: true });
    const plain = frameOf(result, { colorize: true, caretInsideMark: true, plain: true });
    expect(drawn.caretOut).toEqual(plain.caretOut);
    expect(drawn.caretOut.row).toBeGreaterThan(0);
  });

  it('keeps the caret where it was when the marked phrase wraps across two rows', () => {
    // A narrow field forces a marked stretch over a wrap, so a mark and the cursor meet on one
    // visual line — the case with the most ways to go wrong. The caret is placed inside the first
    // marked stretch, and it may not move by a column.
    const width = 24;
    const narrow = { colorize: true, caretInsideMark: true, fieldWidth: width };
    const drawn = frameOf(result, narrow);
    const plain = frameOf(result, { ...narrow, plain: true });
    // A real wrap, not merely two marked rows: a stretch that runs to the last column of one row
    // and continues from the first column of the next.
    const wrapped = drawn.spans.some((row, index) => row.some((span) => span.endColumn === width)
      && (drawn.spans[index + 1] ?? []).some((next) => next.startColumn === 0));
    expect(wrapped).toBe(true);
    expect(drawn.caretOut).toEqual(plain.caretOut);
  });
});
