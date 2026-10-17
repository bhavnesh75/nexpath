/**
 * Every key the submit popup answers to, on every row.
 *
 * Drives the popup's pure reducer — no terminal — with each raw input the shell can
 * deliver, on each selectable row of both views, and records one line per case:
 * the commands emitted, where focus ended up, whether help opened, whether the body
 * changed, and both field cursors.
 *
 * The table is the reference for any later change to key handling: a key that starts
 * doing something different, or stops doing what it does today, moves a line here.
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
  type PromptEnhancementCliActionRowV1,
  type PromptEnhancementCliInteractionStateV1,
} from './cli-submit-popup.js';
import { buildPromptEnhancementVisualLineMapV1 } from './multiline-editor.js';
import {
  buildPromptEnhancementPopupRenderModelV1,
  type PromptEnhancementPopupRenderModelV1,
} from './popup-render-model.js';

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
          outputId: 'llm-out-key-table',
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
const TIMESTAMP_MS = 1_000_000;
const COLUMNS = 80;
const ROWS = 24;

/** Every raw input the shell can hand the reducer, with a readable label. */
const KEYS: readonly { label: string; raw: string }[] = [
  { label: 'Up', raw: '\u001b[A' },
  { label: 'Down', raw: '\u001b[B' },
  { label: 'Enter', raw: '\r' },
  { label: 'Escape', raw: '\u001b' },
  { label: 'Space', raw: ' ' },
  { label: 'Ctrl+J', raw: '\n' },
  { label: 'Ctrl+Up (1;5A)', raw: '\u001b[1;5A' },
  { label: 'Ctrl+Down (1;5B)', raw: '\u001b[1;5B' },
  { label: 'Ctrl+Up (5A)', raw: '\u001b[5A' },
  { label: 'Ctrl+Down (5B)', raw: '\u001b[5B' },
  { label: 'Cmd+Up (1;9A)', raw: '\u001b[1;9A' },
  { label: 'Cmd+Down (1;9B)', raw: '\u001b[1;9B' },
  { label: 'Option+Up (1;3A)', raw: '\u001b[1;3A' },
  { label: 'Option+Down (1;3B)', raw: '\u001b[1;3B' },
  { label: 'Esc-prefixed Up', raw: '\u001b\u001b[A' },
  { label: 'Esc-prefixed Down', raw: '\u001b\u001b[B' },
  { label: 'Left', raw: '\u001b[D' },
  { label: 'Right', raw: '\u001b[C' },
  { label: 'Backspace (7f)', raw: '\u007f' },
  { label: 'Backspace (08)', raw: '\b' },
  { label: 'Delete', raw: '\u001b[3~' },
  { label: 'Letter a', raw: 'a' },
  { label: 'Digit 2', raw: '2' },
  { label: 'Ctrl+X', raw: '\u0018' },
];

function request(text: string): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'key-table-source-a',
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
    requestId: 'key-table-request',
    projectRoot: '/tmp/key-table-project',
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

interface View {
  model: PromptEnhancementPopupRenderModelV1;
  rows: readonly PromptEnhancementCliActionRowV1[];
  opening: PromptEnhancementCliInteractionStateV1;
}

async function view(withKey: boolean, refinement: boolean): Promise<View> {
  if (withKey) process.env['OPENAI_API_KEY'] = `sk-${'a'.repeat(24)}`;
  else delete process.env['OPENAI_API_KEY'];

  const result: PromptEnhancementPrepareResultV1 = await preparePromptEnhancement(request(SMALL_PROMPT));
  const built = buildPromptEnhancementPopupRenderModelV1({
    result,
    timestampMs: TIMESTAMP_MS,
    deliverySurface: result.delivery.deliveryChannel,
  });
  if (built.state !== 'render_model_ready') throw new Error(`render model not ready: ${built.state}`);
  const model = built.model;
  const { fieldWidth } = promptEnhancementCliViewportV1(COLUMNS, ROWS);
  return {
    model,
    rows: buildPromptEnhancementCliActionRowsV1(model, { refinement }),
    opening: buildPromptEnhancementCliInteractionStateV1({
      model,
      editedBodyText: model.body.text,
      additionalDetailsText: '',
      fieldWidth,
      viewportRows: buildPromptEnhancementVisualLineMapV1(model.body.text, fieldWidth).length,
      refinement,
    }),
  };
}

function press(
  state: PromptEnhancementCliInteractionStateV1,
  rows: readonly PromptEnhancementCliActionRowV1[],
  raw: string,
): { state: PromptEnhancementCliInteractionStateV1; commands: readonly { type: string }[] } {
  return reducePromptEnhancementCliInteractionV1(state, rows, decodePromptEnhancementCliKeyV1(raw));
}

/** Moves focus to `rowIndex` the way a user does: down-arrow from the opening state. */
function focusRow(source: View, rowIndex: number): PromptEnhancementCliInteractionStateV1 {
  let state = source.opening;
  for (let step = 0; step < rowIndex; step++) state = press(state, source.rows, '\u001b[B').state;
  return state;
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

/** One recorded line: what the key did, and everything about where it left the popup. */
function line(
  rowLabel: string,
  keyLabel: string,
  before: PromptEnhancementCliInteractionStateV1,
  after: { state: PromptEnhancementCliInteractionStateV1; commands: readonly { type: string }[] },
): string {
  const body = after.state.editor.buffers.enhanced_body;
  const details = after.state.editor.buffers.additional_details;
  const bodyChanged = body.text !== before.editor.buffers.enhanced_body.text;
  const commands = after.commands.length === 0 ? '-' : after.commands.map((command) => command.type).join('+');
  return [
    pad(rowLabel, 20),
    pad(keyLabel, 18),
    pad(`cmd=${commands}`, 26),
    `focus=${after.state.focusIndex}`,
    `help=${after.state.helpExpanded ? 'open' : 'shut'}`,
    `body=${bodyChanged ? 'changed' : 'same'}`,
    `bodyCur=${body.cursor}`,
    `details=${JSON.stringify(details.text)}`,
    `detailsCur=${details.cursor}`,
  ].join(' ');
}

function tableFor(source: View): string[] {
  const out: string[] = [];
  for (let rowIndex = 0; rowIndex < source.rows.length; rowIndex++) {
    const rowLabel = source.rows[rowIndex]!.kind;
    const start = focusRow(source, rowIndex);
    for (const key of KEYS) out.push(line(rowLabel, key.label, start, press(start, source.rows, key.raw)));
  }
  return out;
}

describe('submit popup key handling, row by row', () => {
  const savedKey = process.env['OPENAI_API_KEY'];
  let main: View;
  let refinement: View;

  beforeEach(async () => {
    main = await view(false, false);
    refinement = await view(true, true);
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env['OPENAI_API_KEY'];
    else process.env['OPENAI_API_KEY'] = savedKey;
  });

  it('premise: the two views offer the rows they are expected to', () => {
    expect(main.rows.map((row) => row.kind)).toEqual(['editor_heading', 'additional_details', 'use_original']);
    expect(refinement.rows.map((row) => row.kind)).toEqual(['editor_heading', 'go_back']);
  });

  it('premise: the editor refuses a lone control byte, so that key is free today', () => {
    const start = focusRow(main, 0);
    const after = press(start, main.rows, '\u0018');
    expect(after.commands).toEqual([]);
    expect(after.state.editor.buffers.enhanced_body.text).toBe(start.editor.buffers.enhanced_body.text);
    expect(after.state.focusIndex).toBe(start.focusIndex);
  });

  it('records every key on every row of the main view', () => {
    expect(tableFor(main).join('\n')).toMatchSnapshot();
  });

  it('records every key on every row of the refinement view', () => {
    expect(tableFor(refinement).join('\n')).toMatchSnapshot();
  });

  it('records what Enter does in each body state', () => {
    const out: string[] = [];

    const clean = focusRow(main, 0);
    out.push(line('editor_heading/clean', 'Enter', clean, press(clean, main.rows, '\r')));

    let edited = clean;
    for (const character of 'extra') edited = press(edited, main.rows, character).state;
    out.push(line('editor_heading/edited', 'Enter', edited, press(edited, main.rows, '\r')));

    let blank = clean;
    const bodyLength = clean.editor.buffers.enhanced_body.text.length;
    blank = { ...blank, editor: { ...blank.editor, buffers: { ...blank.editor.buffers, enhanced_body: { ...blank.editor.buffers.enhanced_body, text: '', cursor: 0 } } } };
    expect(bodyLength).toBeGreaterThan(0);
    out.push(line('editor_heading/blank', 'Enter', blank, press(blank, main.rows, '\r')));

    let details = focusRow(main, 1);
    for (const character of 'five') details = press(details, main.rows, character).state;
    out.push(line('additional_details/typed', 'Enter', details, press(details, main.rows, '\r')));

    const emptyDetails = focusRow(main, 1);
    out.push(line('additional_details/empty', 'Enter', emptyDetails, press(emptyDetails, main.rows, '\r')));

    expect(out.join('\n')).toMatchSnapshot();
  });
});
