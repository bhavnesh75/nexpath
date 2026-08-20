import { describe, expect, it, vi } from 'vitest';
import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  type PromptEnhancementPrepareRequestV1,
  type PromptEnhancementPrepareResultV1,
  type PromptEnhancementSourceRefV1,
} from './contracts.js';
import { buildPromptEnhancementCostVisibilityMetadataV1 } from './cost-observability.js';
import { preparePromptEnhancement } from './facade.js';
import { getPromptStartStopSourceSnapshot } from './source-reality.js';
import { feedbackEventIdentity } from './feedback-sink.js';
import {
  buildClaudeUserPromptSubmitHookOutputV1,
  buildPromptEnhancementCliActionRowsV1,
  buildPromptEnhancementCliFeedbackStateV1,
  buildPromptEnhancementCliInteractionStateV1,
  decodePromptEnhancementCliKeyV1,
  PROMPT_ENHANCEMENT_CLI_CONTENT_INDENT_V1,
  PROMPT_ENHANCEMENT_CLI_CUSTOM_FEEDBACK_MAX_CHARS_V1,
  PROMPT_ENHANCEMENT_CLI_FOOTER_V1,
  promptEnhancementCliViewportV1,
  reducePromptEnhancementCliFeedbackV1,
  reducePromptEnhancementCliInteractionV1,
  renderPromptEnhancementCliFeedbackFrameV1,
  renderPromptEnhancementPopupFrameV1,
  runPromptEnhancementCliSubmitPopupV1,
  validatePromptEnhancementCliPopupResultV1,
  windowPromptEnhancementFieldForDisplayV1,
  windowPromptEnhancementFieldForDisplayWithStartV1,
  type PromptEnhancementCliPopupCommandV1,
  type PromptEnhancementCliPopupInteractionV1,
  type PromptEnhancementCliPopupViewV1,
} from './cli-submit-popup.js';
import {
  buildPromptEnhancementMultilineEditorStateV1,
  promptEnhancementCursorVisualPositionV1,
  promptEnhancementKeepFieldCursorVisibleV1,
  type PromptEnhancementEditorBufferV1,
} from './multiline-editor.js';
import {
  buildPromptEnhancementPopupRenderModelV1,
  type PromptEnhancementPopupRenderModelV1,
} from './popup-render-model.js';
import { PROMPT_ENHANCEMENT_MAX_SENDABLE_BODY_CHARS } from './safety-sendability.js';

function request(overrides: Partial<PromptEnhancementPrepareRequestV1> = {}): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'cli-popup-source-a', sourceKind: 'source_a_user_prompt', sourceId: 'prompt:1',
    sourceAuthorization: 'source_fact_only', evidenceStatus: 'present', freshness: 'current', confidence: 'high', privacyClass: 'local_private',
  };
  const promptStartStop = getPromptStartStopSourceSnapshot();
  return {
    schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
    requestId: 'cli-popup-request',
    projectRoot: '/tmp/cli-popup-project',
    hostSurface: 'cli_stop_bridge',
    sourcePrompt: { text: 'Fix the failing payment test, the test failure blocks ci, and explain verification.', origin: 'user', capturedAt: 1, promptIndex: 1, generatedOriginPolicy: 'ordinary_source_a' },
    reviewMomentContext: {
      reviewMoment: 'UserPromptSubmit_preparation', currentAgentMode: 'workspace-write', projectId: 'project-1', sessionId: 'session-1', detectedLanguage: 'en', stageCandidate: 'implementation', promptCount: 1, recentPromptMetadataRefs: [],
      triggerProvenance: { currentStage: 'implementation', prevStage: 'task_breakdown', triggerKind: 'stage_transition', classifierState: 'fire_recommended', degradedNoActionState: 'none', promptStartBoundary: promptStartStop.hookBoundary, deliveryBoundary: promptStartStop.deliveryBoundary, promptStartCanReplaceSameTurn: false },
    },
    sourceSignals: {
      sourceAOriginalPromptRef: sourceRef, sourceRefs: [sourceRef], normalizedStageAbsenceSignalRefs: [], contentTemplateRecordFactRefs: [], popupQuestionSourceRefs: [], whyHelpSourceRefs: [], profileRoleModeRefs: [], rightGoodWorkStyleEnvRuntimeRefs: [], missingMemoryCandidateRefs: [], sourceLabels: [{ sourceRefId: sourceRef.sourceRefId, label: 'original_prompt', evidenceStatus: 'present' }],
      promptStartStop: { hookBoundary: promptStartStop.hookBoundary, deliveryBoundary: promptStartStop.deliveryBoundary, runAutoCanHoldOrReplaceSubmittedPrompt: false, sharedSignalCount: promptStartStop.sharedSignalCount, classifierDegradedNoFireReasons: promptStartStop.classifierDegradedNoFireReasons },
      store: { schemaVersion: 1, missingPromptEnhancementTables: [], cleanupGaps: [] }, transcriptPathState: 'not_authority', streamBOutputs: [], paramEventChannels: [], servedVariantIdentityRefs: [], deliveryGateRefs: [], sourceOnlyHardFactRefs: [],
    },
    userPreferenceContext: { levelState: 'default', scopedFeedbackEvidenceRefs: [] },
    configSnapshot: { sequenceEnabledState: 'not_enabled_v1', validatedEffectiveConfigState: 'valid', arbitraryConfigRowsAreAuthority: false },
    callVisibilityState: buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', { callVisibilityMode: 'deterministic', plannedCallCount: 0, usedCallCount: 0 }),
    privacyAndStoragePolicy: { sensitivityClass: 'normal', localStorageEligibility: 'ids_and_categories_only', telemetryEligibility: 'allowlisted_counts_only', llmSharingEligibility: 'allowed_minimal', generatedBodyStoragePolicy: 'do_not_store_raw_by_default' },
    ...overrides,
  };
}

function interaction(commands: readonly PromptEnhancementCliPopupCommandV1[]): PromptEnhancementCliPopupInteractionV1 & { views: PromptEnhancementCliPopupViewV1[]; closed: boolean } {
  const queue = [...commands];
  return {
    views: [],
    closed: false,
    async next(view) {
      this.views.push(view);
      const command = queue.shift();
      if (!command) throw new Error('missing test command');
      return command;
    },
    close() { this.closed = true; },
  };
}

describe('Claude CLI UserPromptSubmit PE popup consumer', () => {
  it('accepts only the bounded typed popup-result union at the child-parent boundary', () => {
    expect(validatePromptEnhancementCliPopupResultV1({ state: 'selected_original' })).toBe(true);
    expect(validatePromptEnhancementCliPopupResultV1({ state: 'closed_no_send' })).toBe(true);
    expect(validatePromptEnhancementCliPopupResultV1({ state: 'not_shown', reasonCodes: ['no_tty'] })).toBe(true);
    expect(validatePromptEnhancementCliPopupResultV1({ state: 'selected_current', bodyText: 'validated body' })).toBe(true);

    expect(validatePromptEnhancementCliPopupResultV1({ state: 'unknown' })).toBe(false);
    expect(validatePromptEnhancementCliPopupResultV1({ state: 'selected_current', bodyText: '' })).toBe(false);
    expect(validatePromptEnhancementCliPopupResultV1({ state: 'selected_current', bodyText: 'x'.repeat(PROMPT_ENHANCEMENT_MAX_SENDABLE_BODY_CHARS + 1) })).toBe(false);
  });

  it('renders one typed body and emits enhanced context only after explicit current selection', async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    const ui = interaction([{ type: 'use_current' }]);
    const result = await runPromptEnhancementCliSubmitPopupV1({ request: baseRequest, result: prepared, interaction: ui });
    const output = buildClaudeUserPromptSubmitHookOutputV1(result);

    expect(result.state).toBe('selected_current');
    expect(ui.views).toHaveLength(1);
    expect(ui.views[0]!.model.title).toBe('Nexpath · Prompt enhancement');
    expect(output?.decision).toBeUndefined();
    expect(output?.hookSpecificOutput?.hookEventName).toBe('UserPromptSubmit');
    expect(output?.hookSpecificOutput?.additionalContext).toContain(prepared.uiView.body.text);
    expect(ui.closed).toBe(true);
  });

  it('produces a pinch label end-to-end; why-help only when a reason exists (UI-9)', async () => {
    const prepared = await preparePromptEnhancement(request());
    // A shown popup always carries a deterministic pinch label.
    expect((prepared.uiView.pinchLabel?.text ?? '').length).toBeGreaterThan(0);
    // A plain (non-risky) prompt has no safety/risk reason → no why-help.
    expect(prepared.uiView.whyHelp).toBeUndefined();
  });

  it('passes the exact original prompt through without hook output when original is selected', async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    const result = await runPromptEnhancementCliSubmitPopupV1({ request: baseRequest, result: prepared, interaction: interaction([{ type: 'use_original' }]) });

    expect(result).toEqual({ state: 'selected_original' });
    expect(buildClaudeUserPromptSubmitHookOutputV1(result)).toBeUndefined();
  });

  it('NF Plan B (B-2): records a content-free action signal (kind + ts) for each captured popup action', async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    const signals: Array<{ kind: string; ts: number }> = [];
    await runPromptEnhancementCliSubmitPopupV1({
      request: baseRequest,
      result: prepared,
      interaction: interaction([{ type: 'shorter' }, { type: 'go_back' }, { type: 'use_original' }]),
      actionSignalSink: (kind, ts) => { signals.push({ kind, ts }); },
    });
    // One signal per action, in order, regardless of each action's downstream outcome.
    expect(signals.map((s) => s.kind)).toEqual(['pe_shorter', 'pe_back', 'pe_use_original']);
    expect(signals.every((s) => typeof s.ts === 'number' && s.ts > 0)).toBe(true);
  });

  it('NF Plan B (B-2): edit_body is NOT captured (edit noise); close IS captured', async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    const kinds: string[] = [];
    await runPromptEnhancementCliSubmitPopupV1({
      request: baseRequest,
      result: prepared,
      interaction: interaction([{ type: 'edit_body', text: `${prepared.uiView.body.text}\nx` }, { type: 'close' }]),
      actionSignalSink: (kind) => { kinds.push(kind); },
    });
    expect(kinds).toEqual(['pe_close']);
  });

  it("validates an edited body through the typed action facade before emitting context", async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    const edited = prepared.uiView.body.text + "\n\nKeep the verification output concise.";
    const result = await runPromptEnhancementCliSubmitPopupV1({
      request: baseRequest,
      result: prepared,
      interaction: interaction([{ type: "edit_body", text: edited }, { type: "use_current" }]),
    });
    const output = buildClaudeUserPromptSubmitHookOutputV1(result);

    expect(result.state).toBe("selected_current");
    expect(output?.hookSpecificOutput?.additionalContext).toContain("Keep the verification output concise.");
  });

  it('keeps close as explicit no-send and never leaks the original prompt in its block reason', async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    const result = await runPromptEnhancementCliSubmitPopupV1({ request: baseRequest, result: prepared, interaction: interaction([{ type: 'close' }]) });
    const output = buildClaudeUserPromptSubmitHookOutputV1(result);

    expect(output).toEqual({ decision: 'block', reason: 'Prompt enhancement was closed. Nothing was sent.', suppressOriginalPrompt: true });
    expect(JSON.stringify(output)).not.toContain(baseRequest.sourcePrompt.text);
  });

  it('does not open a surface or emit output for a typed no-popup result', async () => {
    const baseRequest = request();
    const noPopupRequest = { ...baseRequest, sourcePrompt: { ...baseRequest.sourcePrompt, origin: 'pe_generated_echo' as const, generatedOriginPolicy: 'exclude_from_ordinary_learning' as const } };
    const prepared = await preparePromptEnhancement(noPopupRequest);
    const ui = interaction([{ type: 'use_current' }]);
    const result = await runPromptEnhancementCliSubmitPopupV1({ request: noPopupRequest, result: prepared, interaction: ui });

    expect(result).toMatchObject({ state: 'not_shown', reasonCodes: ['typed_no_popup_disposition'] });
    expect(ui.views).toHaveLength(0);
    expect(buildClaudeUserPromptSubmitHookOutputV1(result)).toBeUndefined();
  });

  it('fails closed to no_tty without hook output when the default host interaction is unavailable', async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    const result = await runPromptEnhancementCliSubmitPopupV1({
      request: baseRequest,
      result: prepared,
      interaction: null,
    });

    expect(result).toEqual({ state: 'not_shown', reasonCodes: ['no_tty'] });
    expect(buildClaudeUserPromptSubmitHookOutputV1(result)).toBeUndefined();
  });

  it('routes directional actions through the typed facade and re-renders the accepted revision', async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    const ui = interaction([{ type: 'shorter' }, { type: 'use_current' }]);
    const result = await runPromptEnhancementCliSubmitPopupV1({ request: baseRequest, result: prepared, interaction: ui });

    expect(result.state).toBe('selected_current');
    expect(ui.views).toHaveLength(2);
    expect(ui.views[1]!.model.identity.bodyRevision).toBeGreaterThan(ui.views[0]!.model.identity.bodyRevision);
    expect(ui.views[1]!.editedBodyText).not.toBe(ui.views[0]!.editedBodyText);
  });

  it('E9: fires the cost-observability sink once per E8 directional/apply-details action, not on plain selection', async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    const measured: PromptEnhancementPrepareResultV1[] = [];
    const ui = interaction([
      { type: 'shorter' },
      { type: 'apply_details', text: 'Keep verification concise.' },
      { type: 'use_current' },
    ]);
    const result = await runPromptEnhancementCliSubmitPopupV1({
      request: baseRequest,
      result: prepared,
      interaction: ui,
      costObservabilitySink: (r) => measured.push(r),
    });
    expect(result.state).toBe('selected_current');
    // Two action recompositions were measured; use_current (plain send) is not an action call.
    expect(measured).toHaveLength(2);
    expect(measured.every((r) => r.callAndVisibilityMetadata !== undefined)).toBe(true);
  });

  it('restores the main body when Go back is selected after a refinement (GAP-1 end-to-end)', async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    const mainBody = prepared.uiView.body.text;
    const ui = interaction([{ type: 'shorter' }, { type: 'go_back' }, { type: 'use_current' }]);
    const result = await runPromptEnhancementCliSubmitPopupV1({ request: baseRequest, result: prepared, interaction: ui });

    expect(result.state).toBe('selected_current');
    // view 0 = main, view 1 = refined (Shorter), view 2 = restored main after Go back
    expect(ui.views[1]!.editedBodyText).not.toBe(mainBody);
    expect(ui.views[2]!.editedBodyText).toBe(mainBody);
    expect(ui.views[1]!.refinement).toBe(true);
    expect(ui.views[2]!.refinement).toBe(false);
    expect(buildClaudeUserPromptSubmitHookOutputV1(result)?.hookSpecificOutput?.additionalContext).toContain(mainBody);
  });

  it('keeps Additional Details and every remaining adjustment inside the controlled typed popup flow', async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    const ui = interaction([
      { type: 'apply_details', text: 'Keep the verification output concise.' },
      { type: 'more_thorough' },
      { type: 'more_project_grounded' },
      { type: 'use_current' },
    ]);
    const result = await runPromptEnhancementCliSubmitPopupV1({ request: baseRequest, result: prepared, interaction: ui });

    expect(result.state).toBe('selected_current');
    expect(ui.views).toHaveLength(4);
    expect(ui.views[1]!.editedBodyText).toContain('Keep the verification output concise.');
    expect(ui.views[3]!.model.identity.bodyRevision).toBeGreaterThan(ui.views[0]!.model.identity.bodyRevision);
  });

  it('contains a controlled renderer failure as not_shown without leaking the thrown detail', async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    const privateFailure = 'private terminal renderer failure detail';
    const close = vi.fn();
    const result = await runPromptEnhancementCliSubmitPopupV1({
      request: baseRequest,
      result: prepared,
      interaction: {
        next: async () => { throw new Error(privateFailure); },
        close,
      },
    });

    expect(result).toEqual({ state: 'not_shown', reasonCodes: ['renderer_failure'] });
    expect(buildClaudeUserPromptSubmitHookOutputV1(result)).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(privateFailure);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('records one suggested typed feedback event without sending or changing the current draft', async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    const ui = interaction([
      { type: 'feedback_suggested', category: 'not_relevant_enough' },
      { type: 'use_original' },
    ]);
    const events: unknown[] = [];
    const result = await runPromptEnhancementCliSubmitPopupV1({
      request: baseRequest,
      result: prepared,
      interaction: ui,
      feedbackSink: (event) => {
        events.push(event);
        return {
          stableEventIdentity: feedbackEventIdentity(event),
          status: 'accepted',
          publicSafeText: 'Feedback saved. Your prompt is unchanged.',
        };
      },
    });

    expect(result).toEqual({ state: 'selected_original' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: 'explicit_feedback',
      feedbackCategory: 'not_relevant_enough',
      sendPolicy: 'no_send',
      realUserInitiated: true,
    });
    expect(ui.views).toHaveLength(2);
    expect(ui.views[1]!.editedBodyText).toBe(ui.views[0]!.editedBodyText);
    expect(ui.views[1]!.model.identity.bodyRevision).toBe(ui.views[0]!.model.identity.bodyRevision);
    expect(ui.views[1]!.publicNotice).toBe('Feedback saved. Your prompt is unchanged.');
  });

  it('keeps Other feedback transient and emits only the custom_typed category', async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    const rawFeedback = 'Mention the exact verification command.';
    let serializedEvent = '';
    const result = await runPromptEnhancementCliSubmitPopupV1({
      request: baseRequest,
      result: prepared,
      interaction: interaction([
        { type: 'feedback_other', text: rawFeedback },
        { type: 'close' },
      ]),
      feedbackSink: (event) => {
        serializedEvent = JSON.stringify(event);
        return {
          stableEventIdentity: feedbackEventIdentity(event),
          status: 'accepted',
          publicSafeText: 'Feedback saved. Your prompt is unchanged.',
        };
      },
    });
    const hookOutput = buildClaudeUserPromptSubmitHookOutputV1(result);

    expect(serializedEvent).toContain('custom_typed');
    expect(serializedEvent).not.toContain(rawFeedback);
    expect(JSON.stringify(hookOutput)).not.toContain(rawFeedback);
    expect(result.state).toBe('closed_no_send');
  });

  it('rejects empty and over-limit Other drafts before the sink and preserves the popup', async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    let sinkCalls = 0;
    const ui = interaction([
      { type: 'feedback_other', text: '   ' },
      { type: 'feedback_other', text: 'x'.repeat(PROMPT_ENHANCEMENT_CLI_CUSTOM_FEEDBACK_MAX_CHARS_V1 + 1) },
      { type: 'use_original' },
    ]);
    const result = await runPromptEnhancementCliSubmitPopupV1({
      request: baseRequest,
      result: prepared,
      interaction: ui,
      feedbackSink: () => {
        sinkCalls += 1;
        throw new Error('must not be called');
      },
    });

    expect(result).toEqual({ state: 'selected_original' });
    expect(sinkCalls).toBe(0);
    expect(ui.views).toHaveLength(3);
    expect(ui.views[1]!.publicNotice).toContain('1 to 5000');
    expect(ui.views[2]!.publicNotice).toContain('1 to 5000');
  });

  it('renders unavailable acknowledgement without leaking sink failures or sending a prompt', async () => {
    const baseRequest = request();
    const prepared = await preparePromptEnhancement(baseRequest);
    const ui = interaction([
      { type: 'feedback_suggested', category: 'too_much_or_too_long' },
      { type: 'close' },
    ]);
    const result = await runPromptEnhancementCliSubmitPopupV1({
      request: baseRequest,
      result: prepared,
      interaction: ui,
      feedbackSink: () => { throw new Error('private persistence failure'); },
    });

    expect(result.state).toBe('closed_no_send');
    expect(ui.views[1]!.publicNotice).toBe('Feedback is unavailable right now. Your prompt is unchanged.');
    expect(JSON.stringify(buildClaudeUserPromptSubmitHookOutputV1(result))).not.toContain('private persistence failure');
  });
});

async function renderModel(): Promise<PromptEnhancementPopupRenderModelV1> {
  const prepared = await preparePromptEnhancement(request());
  const rendered = buildPromptEnhancementPopupRenderModelV1({
    result: prepared,
    timestampMs: Date.now(),
    deliverySurface: prepared.delivery.deliveryChannel,
  });
  if (rendered.state !== 'render_model_ready') throw new Error(`expected render_model_ready, got ${rendered.state}`);
  return rendered.model;
}

/** A minimal typed model for the pure row-builder/renderer, with a deliberately unavailable directional and feedback. */
function fakeRenderModel(): PromptEnhancementPopupRenderModelV1 {
  return {
    title: 'Nexpath · Prompt enhancement',
    editorHeading: 'Use enhanced prompt',
    identity: { enhancementId: 'e1', currentBodyId: 'b1', bodyRevision: 1, validationDecisionId: 'v1' },
    body: { editable: true },
    publicCopy: { trustCues: [] },
    controls: {
      additionalDetails: { availability: 'available' },
      directional: [
        { action: { actionType: 'shorter', label: 'Shorter' }, uiAvailabilityState: 'available' },
        { action: { actionType: 'more_thorough', label: 'More thorough' }, uiAvailabilityState: 'unavailable' },
        { action: { actionType: 'more_project_grounded', label: 'More project-grounded' }, uiAvailabilityState: 'available' },
      ],
      // Feedback is typed-available, yet must NOT appear as a row (§8.3).
      feedback: { availability: 'available', label: 'Feedback' },
      original: { availability: 'available' },
    },
  } as unknown as PromptEnhancementPopupRenderModelV1;
}

describe('UI-1 PE frame renderer', () => {
  it('renders the section 3.1 order with no numeric menu, no `.done`, and one editor heading', async () => {
    const model = await renderModel();
    const view: PromptEnhancementCliPopupViewV1 = { model, editedBodyText: 'CONTROLLED-BODY', additionalDetailsText: '' };
    const frame = renderPromptEnhancementPopupFrameV1(view, { focusIndex: 0, helpExpanded: false });

    expect(frame.split('\n').some((line) => /^\s*(?:[│|]\s*)?\d+\)\s/.test(line))).toBe(false);
    expect(frame).not.toMatch(/\.done\b/);
    expect(frame).not.toMatch(/Show simpler options|Skip for now|Copy to clipboard/);

    const order = ['Use enhanced prompt', 'Additional details', 'Shorter', 'More thorough', 'More project-grounded', 'Use original prompt']
      .map((label) => frame.indexOf(label));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order]).toEqual([...order].sort((a, b) => a - b));
    // Directional refinements (Shorter / More thorough / More project-grounded) render in the PE
    // popup (owner 2026-08-20: re-enabled), between Additional details and Use original prompt.
    for (const shown of ['Shorter', 'More thorough', 'More project-grounded']) expect(frame).toContain(shown);
    expect(frame.split('Use enhanced prompt').length - 1).toBe(1);
    expect(frame).toContain(PROMPT_ENHANCEMENT_CLI_FOOTER_V1);
  });

  it('the focused editable body drops its sub-label help and ends with the Ctrl+J hint (owner request 2026-08-07)', async () => {
    const model = await renderModel();
    const view: PromptEnhancementCliPopupViewV1 = { model, editedBodyText: 'CONTROLLED-BODY', additionalDetailsText: '' };
    const frame = renderPromptEnhancementPopupFrameV1(view, { focusIndex: 0, helpExpanded: false });
    // The 'Edit current prompt' / full-help sub-label is gone so the body shows more lines…
    expect(frame).not.toContain('Edit current prompt');
    expect(frame).not.toContain('Open this inline editor to change the enhanced body.');
    // …and the Ctrl+J edit-keys + 'Enter sends this prompt' share ONE line below the body
    // (owner request 2026-08-07 — one fewer line so the body shows one more).
    const lines = frame.split('\n').map((l) => l.replace(/^│ ?/, ''));
    const bodyIdx = lines.findIndex((l) => l.includes('CONTROLLED-BODY'));
    const hintIdx = lines.findIndex((l) => l.includes('Ctrl+J new line') && l.includes('Enter sends this prompt'));
    expect(hintIdx).toBeGreaterThan(bodyIdx);
    // The two hints are NOT on separate lines.
    expect(lines.filter((l) => l.includes('Enter sends this prompt'))).toHaveLength(1);
    expect(lines.filter((l) => l.includes('Ctrl+J new line'))).toHaveLength(1);
  });
});

describe('UI-1 action-row model', () => {
  it('orders rows per stage-1-2a, drops Feedback entirely (§8.3), and reflects typed availability', () => {
    const rows = buildPromptEnhancementCliActionRowsV1(fakeRenderModel());
    expect(rows.map((row) => row.rowKey)).toEqual([
      'editor_heading', 'additional_details', 'shorter', 'more_thorough', 'more_project_grounded', 'use_original',
    ]);
    // Directional refinements render in the PE popup (owner 2026-08-20: re-enabled).
    expect(rows.some((row) => row.kind === 'directional')).toBe(true);
    // Feedback is typed-available but is never a row now.
    expect(rows.some((row) => row.rowKey === 'feedback')).toBe(false);
  });

  it('shows only the editable body and Go back in a refinement view (owner request)', () => {
    expect(buildPromptEnhancementCliActionRowsV1(fakeRenderModel()).some((row) => row.rowKey === 'go_back')).toBe(false);
    const refinement = buildPromptEnhancementCliActionRowsV1(fakeRenderModel(), { refinement: true });
    // The refinement view (after Shorter / More thorough / More project-grounded) is exactly the
    // editable body + a final Go back — no Additional details, directionals, or Use original.
    expect(refinement.map((row) => row.rowKey)).toEqual(['editor_heading', 'go_back']);
    expect(refinement.some((row) => row.rowKey === 'additional_details')).toBe(false);
    expect(refinement.some((row) => row.kind === 'directional')).toBe(false);
    expect(refinement.some((row) => row.rowKey === 'use_original')).toBe(false);
  });

  it('shows the directional refinement rows in the PE popup (owner 2026-08-20: re-enabled), keeping the other rows', () => {
    const view: PromptEnhancementCliPopupViewV1 = { model: fakeRenderModel(), editedBodyText: 'BODY-LINE', additionalDetailsText: '' };
    const frame = renderPromptEnhancementPopupFrameV1(view, { focusIndex: 0, helpExpanded: false });
    // Shorter / More thorough / More project-grounded render, but never the "(unavailable)" marker
    // (the row is always shown available per owner request; execution stays gated in the runner).
    for (const shown of ['Shorter', 'More thorough', 'More project-grounded']) expect(frame).toContain(shown);
    expect(frame).not.toContain('(unavailable)');
    expect(frame).not.toContain('Make it concise'); // focused-row help not shown for an unfocused directional row
    expect(frame).toContain('BODY-LINE');
    // The remaining rows still render: editor heading, Additional details, Use original.
    expect(frame).toContain('● Use enhanced prompt');
    expect(frame).toContain('○ Additional details');
    expect(frame).toContain('○ Use original prompt');
    // Feedback never appears as a row (§8.3).
    expect(frame).not.toContain('Feedback');
  });

  it('records the caret screen position on the field content line, not the label (caretOut)', () => {
    const view: PromptEnhancementCliPopupViewV1 = { model: fakeRenderModel(), editedBodyText: 'line-one\nline-two', additionalDetailsText: '' };
    const caretOut = { row: -1, col: -1 };
    const frame = renderPromptEnhancementPopupFrameV1(view, {
      focusIndex: 0, // editor_heading (enhanced body)
      helpExpanded: false,
      caret: { field: 'enhanced_body', visualRow: 1, visualColumn: 4 },
      caretOut,
    });
    const lines = frame.split('\n');
    expect(caretOut.col).toBe(7 + 4);
    // The recorded 1-based row lands on the body's SECOND content line (visualRow 1), not the
    // "Use enhanced prompt" label/bullet row.
    expect(lines[caretOut.row - 1]).toContain('line-two');
    expect(lines[caretOut.row - 1]).not.toContain('Use enhanced prompt');
  });

  it('viewport width leaves room for the content indent so wrapped lines never overflow the terminal', () => {
    for (const cols of [80, 100, 120, 146, 200]) {
      const { fieldWidth } = promptEnhancementCliViewportV1(cols, 40);
      // A wrapped content line is rendered with the 6-space indent; indent + wrap width must fit
      // the terminal, or the terminal re-wraps the line (splitting words) and the frame scrolls.
      expect(fieldWidth + PROMPT_ENHANCEMENT_CLI_CONTENT_INDENT_V1).toBeLessThanOrEqual(cols);
    }
  });

  it('renders a long body with no line wider than the terminal (else it re-wraps and scrolls)', () => {
    const cols = 146;
    const { fieldWidth, viewportRows } = promptEnhancementCliViewportV1(cols, 36);
    const longBody = Array.from({ length: 45 }, (_, i) =>
      `- Ground the request in current project facts and source references without inventing missing implementation details line ${i}`).join('\n');
    const buffer = { text: longBody, cursor: 0, desiredVisualColumn: 0, scrollVisualRow: 0, dirty: false, focused: true } as PromptEnhancementEditorBufferV1;
    const bodyDisplay = windowPromptEnhancementFieldForDisplayV1(buffer, fieldWidth, viewportRows);
    const frame = renderPromptEnhancementPopupFrameV1(
      { model: fakeRenderModel(), editedBodyText: bodyDisplay, additionalDetailsText: '' },
      { focusIndex: 0, helpExpanded: false },
    );
    for (const line of frame.split('\n')) {
      expect([...line].length).toBeLessThanOrEqual(cols);
    }
  });

  it('opens the enhanced body with the window at the top and the end cursor off-window (renderer hides it, no stray cursor)', () => {
    const longBody = Array.from({ length: 60 }, (_, i) => `line-${i}`).join('\n');
    const state = buildPromptEnhancementCliInteractionStateV1({
      model: fakeRenderModel(),
      editedBodyText: longBody,
      additionalDetailsText: '',
      fieldWidth: 80,
      viewportRows: 8,
    });
    const body = state.editor.buffers.enhanced_body;
    // Window at the top on open (the prompt is readable from its start).
    expect(body.scrollVisualRow).toBe(0);
    // Cursor at end-of-text so typing appends.
    expect(body.cursor).toBe(longBody.length);
    // The end cursor sits below the 8-row top window → the render caret guard hides it rather
    // than stranding it at the screen bottom (the stray-cursor bug).
    const pos = promptEnhancementCursorVisualPositionV1(body, 80);
    expect(pos.row - body.scrollVisualRow).toBeGreaterThanOrEqual(8);
  });

  it('syncs a focused field so a cursor-at-end long buffer keeps its caret inside the viewport (no stray bottom cursor)', () => {
    const longBody = Array.from({ length: 60 }, (_, i) => `line-${i}`).join('\n');
    const editor = buildPromptEnhancementMultilineEditorStateV1({
      identity: { enhancementId: 'e', currentBodyId: 'b', bodyRevision: 1, validationDecisionId: 'v' },
      enhancedBodyText: longBody,
      additionalDetailsText: '',
      fieldWidth: 80,
      viewportRows: 8,
      focusedField: 'enhanced_body',
      editable: true,
    });
    const raw = editor.buffers.enhanced_body; // buffer factory seeds the cursor at end-of-text, scroll 0
    // Before sync the caret is far below an 8-row window — this is the stray-cursor cause.
    const before = promptEnhancementCursorVisualPositionV1(raw, 80);
    expect(before.row - raw.scrollVisualRow).toBeGreaterThanOrEqual(8);
    // After sync the caret is inside the viewport [0, 8).
    const synced = promptEnhancementKeepFieldCursorVisibleV1(raw, 80, 8);
    const after = promptEnhancementCursorVisualPositionV1(synced, 80);
    const visualRow = after.row - synced.scrollVisualRow;
    expect(visualRow).toBeGreaterThanOrEqual(0);
    expect(visualRow).toBeLessThan(8);
  });

  it('marks the focused editable row with a filled bullet and the editing-keys hint (no sub-label help)', () => {
    const view: PromptEnhancementCliPopupViewV1 = { model: fakeRenderModel(), editedBodyText: 'BODY-LINE', additionalDetailsText: '' };
    const frame = renderPromptEnhancementPopupFrameV1(view, { focusIndex: 0, helpExpanded: false });
    expect(frame).toContain('● Use enhanced prompt');
    expect(frame).toContain('BODY-LINE');
    // Owner request 2026-08-07: the 'Edit current prompt' sub-label is removed…
    expect(frame).not.toContain('Edit current prompt');
    // …and the editable body still shows the editing-keys hint (now the last line of its block).
    expect(frame).toContain('Ctrl+J new line');
    // Directional rows and Use original prompt carry no description (owner request).
    expect(renderPromptEnhancementPopupFrameV1(view, { focusIndex: 2, helpExpanded: true }))
      .not.toContain('Request a typed concise refinement');
    expect(renderPromptEnhancementPopupFrameV1(view, { focusIndex: 5, helpExpanded: false }))
      .not.toContain('Send original prompt');
  });

  it('renders an empty Additional details field as blank, with no Apply hint (UI-8)', () => {
    const view: PromptEnhancementCliPopupViewV1 = { model: fakeRenderModel(), editedBodyText: 'BODY', additionalDetailsText: '' };
    const frame = renderPromptEnhancementPopupFrameV1(view, { focusIndex: 0, helpExpanded: false });
    expect(frame).toContain('○ Additional details'); // the row still renders
    expect(frame).not.toContain('(none)');            // empty field is blank
    expect(frame).not.toContain('Apply to prompt');   // no Apply button/hint
  });

  it('renders the pinch label always, and the why-help only when present (UI-9)', () => {
    const base = fakeRenderModel();
    const withBoth = { ...base, pinchLabel: { text: 'Bug hunt.', derivedFrom: 'family' }, whyHelp: { text: 'Shown because rollback risk.', reasonKind: 'risk_or_rollback' } } as unknown as PromptEnhancementPopupRenderModelV1;
    const frameBoth = renderPromptEnhancementPopupFrameV1({ model: withBoth, editedBodyText: 'BODY', additionalDetailsText: '' }, { focusIndex: 0, helpExpanded: false });
    expect(frameBoth).toContain('Bug hunt.');
    expect(frameBoth).toContain('Shown because rollback risk.');
    // pinch present, why-help absent → no why-help line
    const pinchOnly = { ...base, pinchLabel: { text: 'Bug hunt.', derivedFrom: 'family' } } as unknown as PromptEnhancementPopupRenderModelV1;
    const framePinch = renderPromptEnhancementPopupFrameV1({ model: pinchOnly, editedBodyText: 'BODY', additionalDetailsText: '' }, { focusIndex: 0, helpExpanded: false });
    expect(framePinch).toContain('Bug hunt.');
    expect(framePinch).not.toContain('Shown because');
  });

  it('shows a light-yellow action hint under each editable heading (UI-8)', () => {
    const ESC = String.fromCharCode(27);
    const view: PromptEnhancementCliPopupViewV1 = { model: fakeRenderModel(), editedBodyText: 'BODY', additionalDetailsText: '' };
    const plain = renderPromptEnhancementPopupFrameV1(view, { focusIndex: 0, helpExpanded: false });
    expect(plain).toContain('Enter sends this prompt');
    expect(plain).toContain('Enter applies these details · unapplied details are not sent');
    // The focused body's edit-keys + send hint share ONE line (owner request 2026-08-07).
    expect(plain).toContain('Ctrl+J new line · Ctrl+↑/↓ move line · Enter sends this prompt');
    // In colour mode that combined hint line is LIGHT YELLOW (owner request 2026-08-07 — a
    // distinct, all-OS-visible shortcut colour).
    const colored = renderPromptEnhancementPopupFrameV1(view, { focusIndex: 0, helpExpanded: false, colorize: true });
    expect(colored).toContain(`${ESC}[93mCtrl+J new line · Ctrl+↑/↓ move line · Enter sends this prompt`);
  });

  it('shows "Enter sends this prompt" ONLY when the enhanced-body row is focused (owner 2026-08-19)', () => {
    const view: PromptEnhancementCliPopupViewV1 = { model: fakeRenderModel(), editedBodyText: 'BODY', additionalDetailsText: '' };
    // Body focused (index 0) → the send hint shows.
    expect(renderPromptEnhancementPopupFrameV1(view, { focusIndex: 0, helpExpanded: false }))
      .toContain('Enter sends this prompt');
    // Focus on a non-body action row (index 2 = Shorter) → the send hint is GONE, so it never misleads
    // ("Enter" there runs the directional refine, not a send). The body itself still renders.
    const elsewhere = renderPromptEnhancementPopupFrameV1(view, { focusIndex: 2, helpExpanded: false });
    expect(elsewhere).not.toContain('Enter sends this prompt');
    expect(elsewhere).toContain('BODY');
  });

  it('applies the old-popup radio colours only when colorize is on (§8.1)', () => {
    const ESC = String.fromCharCode(27);
    const view: PromptEnhancementCliPopupViewV1 = { model: fakeRenderModel(), editedBodyText: 'BODY', additionalDetailsText: '' };
    const plain = renderPromptEnhancementPopupFrameV1(view, { focusIndex: 0, helpExpanded: false });
    const colored = renderPromptEnhancementPopupFrameV1(view, { focusIndex: 0, helpExpanded: false, colorize: true });
    expect(plain).not.toContain(ESC); // colorless by default (tests/logic)
    expect(colored).toContain(`${ESC}[36m`); // cyan rail
    expect(colored).toContain(`${ESC}[32m`); // green filled bullet on the focused row
    expect(colored).toContain(`${ESC}[90m`); // gray hollow bullet on the rest
  });
});

describe('UI-2 interaction reducer', () => {
  const rows = () => buildPromptEnhancementCliActionRowsV1(fakeRenderModel());
  const state = (editedBodyText = 'BODY', additionalDetailsText = '') =>
    buildPromptEnhancementCliInteractionStateV1({ model: fakeRenderModel(), editedBodyText, additionalDetailsText, fieldWidth: 40, viewportRows: 6 });

  it('decodes navigation, activate, cancel, help vs editor keys', () => {
    expect(decodePromptEnhancementCliKeyV1('\u001b[A')).toEqual({ kind: 'up' });
    expect(decodePromptEnhancementCliKeyV1('\u001b[B')).toEqual({ kind: 'down' });
    expect(decodePromptEnhancementCliKeyV1('\r')).toEqual({ kind: 'enter' });
    expect(decodePromptEnhancementCliKeyV1('\u001b')).toEqual({ kind: 'escape' });
    expect(decodePromptEnhancementCliKeyV1(' ')).toEqual({ kind: 'space' });
    expect(decodePromptEnhancementCliKeyV1('x')).toEqual({ kind: 'editor', raw: 'x' });
    expect(decodePromptEnhancementCliKeyV1('\u001b[1;5A')).toEqual({ kind: 'editor', raw: '\u001b[1;5A' });
  });

  it('moves the radio focus and re-focuses the editor field for editable rows', () => {
    let s = state();
    expect(s.focusIndex).toBe(0);
    expect(s.editor.focusedField).toBe('enhanced_body'); // row 0 = editor heading
    s = reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'down' }).state;
    expect(s.focusIndex).toBe(1);
    expect(s.editor.focusedField).toBe('additional_details'); // row 1 = details
    s = reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'down' }).state;
    expect(s.focusIndex).toBe(2);
    expect(s.editor.focusedField).toBeNull(); // row 2 = Shorter (action, not editable)
    // clamps at the top
    s = reducePromptEnhancementCliInteractionV1(state(), rows(), { kind: 'up' }).state;
    expect(s.focusIndex).toBe(0);
  });

  it('types directly into the focused editable row, incl. Ctrl+J newline', () => {
    let s = state('ab'); // focus 0 = enhanced_body
    s = reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'editor', raw: 'X' }).state;
    expect(s.editor.buffers.enhanced_body.text).toBe('abX');
    expect(s.editor.buffers.enhanced_body.dirty).toBe(true);
    s = reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'editor', raw: '\n' }).state; // Ctrl+J
    expect(s.editor.buffers.enhanced_body.text).toBe('abX\n');
  });

  it('treats Space as help toggle on an action row but a space character while editing', () => {
    // Space on an editable row inserts a space
    let s = state('a');
    s = reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'space' }).state;
    expect(s.editor.buffers.enhanced_body.text).toBe('a ');
    // Space on an action row toggles help
    let a = reducePromptEnhancementCliInteractionV1(state(), rows(), { kind: 'down' }).state;
    a = reducePromptEnhancementCliInteractionV1(a, rows(), { kind: 'down' }).state; // focus 2 = Shorter
    const toggled = reducePromptEnhancementCliInteractionV1(a, rows(), { kind: 'space' });
    expect(toggled.state.helpExpanded).toBe(true);
    expect(toggled.state.editor.buffers.enhanced_body.text).toBe('BODY'); // unchanged
  });

  it('maps Enter per row, committing a dirty body before an action', () => {
    // Enter on the editor heading with a clean body => just send
    expect(reducePromptEnhancementCliInteractionV1(state(), rows(), { kind: 'enter' }).commands)
      .toEqual([{ type: 'use_current' }]);
    // Enter on the editor heading with a dirty body => commit then send
    let dirty = reducePromptEnhancementCliInteractionV1(state('ab'), rows(), { kind: 'editor', raw: 'Z' }).state;
    expect(reducePromptEnhancementCliInteractionV1(dirty, rows(), { kind: 'enter' }).commands)
      .toEqual([{ type: 'edit_body', text: 'abZ' }, { type: 'use_current' }]);
    // Enter on Additional details => APPLY into the body locally (MPS parity, owner request
    // 2026-08-07): one edit_body with the merged prompt; details cleared; focus back on the body.
    let s = reducePromptEnhancementCliInteractionV1(state('BODY', 'notes'), rows(), { kind: 'down' }).state;
    const applied = reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'enter' });
    expect(applied.commands)
      .toEqual([{ type: 'edit_body', text: 'BODY\n\nAdditional details to incorporate:\nnotes' }]);
    expect(applied.state.editor.buffers.additional_details.text).toBe('');
    expect(rows()[applied.state.focusIndex]!.kind).toBe('editor_heading');
    // (Directional-row Enter is exercised by the 'routes directional actions' test above.)
  });

  it('applies details onto the EDITED body (dirty edits kept), and no-ops an empty details draft', () => {
    // Edit the body (dirty), move to details, type a note, then Apply: the merge starts from the
    // edited body text, so nothing the user typed is lost.
    let s = reducePromptEnhancementCliInteractionV1(state('BODY', ''), rows(), { kind: 'editor', raw: 'Z' }).state;
    s = reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'down' }).state;
    s = reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'editor', raw: 'n' }).state;
    expect(reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'enter' }).commands)
      .toEqual([{ type: 'edit_body', text: 'BODYZ\n\nAdditional details to incorporate:\nn' }]);
    // Enter on an empty details draft does nothing.
    const empty = reducePromptEnhancementCliInteractionV1(state('BODY', ''), rows(), { kind: 'down' }).state;
    expect(reducePromptEnhancementCliInteractionV1(empty, rows(), { kind: 'enter' }).commands).toEqual([]);
  });

  it('a second Apply extends the ONE details block — never a duplicate heading (iMac report 2026-08-07)', () => {
    let s = reducePromptEnhancementCliInteractionV1(state('BODY', 'first'), rows(), { kind: 'down' }).state;
    s = reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'enter' }).state; // apply #1 -> focus back on body
    s = reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'down' }).state;  // back to details
    s = reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'editor', raw: 's' }).state;
    const second = reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'enter' });
    expect(second.commands).toHaveLength(1);
    const text = (second.commands[0] as { type: 'edit_body'; text: string }).text;
    expect(text.match(/Additional details to incorporate:/g)).toHaveLength(1);
    expect(text.endsWith('first\ns')).toBe(true);
  });

  it('never sends an empty/whitespace body (BF-1)', () => {
    expect(reducePromptEnhancementCliInteractionV1(state('', ''), rows(), { kind: 'enter' }).commands).toEqual([]);
    expect(reducePromptEnhancementCliInteractionV1(state('   ', ''), rows(), { kind: 'enter' }).commands).toEqual([]);
  });

  it('never Applies on a blank body (bug B)', () => {
    // (The directional "refine on blank body" path is guarded in the reducer; here we cover the
    // Apply-details blank guard.)
    // Apply details (focus 1) with a blank body + a note → no-op.
    const d = reducePromptEnhancementCliInteractionV1(state('', 'notes'), rows(), { kind: 'down' }).state;
    expect(reducePromptEnhancementCliInteractionV1(d, rows(), { kind: 'enter' }).commands).toEqual([]);
  });

  it('sends the body and ignores typed-but-unapplied details (UI-8)', () => {
    // Type a note into Additional details (index 1) but do not apply it…
    let s = reducePromptEnhancementCliInteractionV1(state('BODY', ''), rows(), { kind: 'down' }).state;
    s = reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'editor', raw: 'x' }).state;
    expect(s.editor.buffers.additional_details.text).toBe('x');
    // …then move back to the body and send: only use_current, no apply_details, no folded details.
    s = reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'up' }).state;
    expect(reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'enter' }).commands)
      .toEqual([{ type: 'use_current' }]);
  });

  it('emits go_back from the refinement Go back row (GAP-1)', () => {
    const refinementRows = buildPromptEnhancementCliActionRowsV1(fakeRenderModel(), { refinement: true });
    expect(refinementRows[refinementRows.length - 1]!.rowKey).toBe('go_back');
    let s = buildPromptEnhancementCliInteractionStateV1({
      model: fakeRenderModel(), editedBodyText: 'BODY', additionalDetailsText: '', fieldWidth: 40, viewportRows: 6, refinement: true,
    });
    for (let i = 0; i < refinementRows.length; i++) s = reducePromptEnhancementCliInteractionV1(s, refinementRows, { kind: 'down' }).state;
    expect(refinementRows[s.focusIndex]!.rowKey).toBe('go_back');
    expect(reducePromptEnhancementCliInteractionV1(s, refinementRows, { kind: 'enter' }).commands).toEqual([{ type: 'go_back' }]);
  });

  it('cancels on Esc and on Use original prompt', () => {
    expect(reducePromptEnhancementCliInteractionV1(state(), rows(), { kind: 'escape' }).commands)
      .toEqual([{ type: 'close' }]);
    // navigate to Use original prompt (last row = index rows.length-1)
    let s = state();
    const total = rows().length;
    for (let i = 0; i < total; i++) s = reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'down' }).state;
    expect(rows()[s.focusIndex]!.rowKey).toBe('use_original');
    expect(reducePromptEnhancementCliInteractionV1(s, rows(), { kind: 'enter' }).commands)
      .toEqual([{ type: 'use_original' }]);
  });
});

describe('UI-3 feedback-on-cancel reducer + renderer', () => {
  const fb = () => buildPromptEnhancementCliFeedbackStateV1({ fieldWidth: 40, viewportRows: 4 });

  it('renders three radio rows, no Back, with an editable Other and footer', () => {
    const frame = renderPromptEnhancementCliFeedbackFrameV1(fb());
    expect(frame).toContain('● Not relevant enough'); // focused
    expect(frame).toContain('○ Too much or too long');
    expect(frame).toContain('○ Other');
    expect(frame).not.toContain('Back');
    expect(frame).toContain('(type your feedback)');
    expect(frame).toContain('Esc skip');
  });

  it('submits a suggested reason on Enter', () => {
    expect(reducePromptEnhancementCliFeedbackV1(fb(), { kind: 'enter' }).result)
      .toEqual({ kind: 'suggested', category: 'not_relevant_enough' });
    const down = reducePromptEnhancementCliFeedbackV1(fb(), { kind: 'down' }).state;
    expect(reducePromptEnhancementCliFeedbackV1(down, { kind: 'enter' }).result)
      .toEqual({ kind: 'suggested', category: 'too_much_or_too_long' });
  });

  it('types directly into Other and submits non-empty custom feedback', () => {
    let s = reducePromptEnhancementCliFeedbackV1(fb(), { kind: 'down' }).state;
    s = reducePromptEnhancementCliFeedbackV1(s, { kind: 'down' }).state; // focus Other
    // Enter on an empty Other does nothing.
    expect(reducePromptEnhancementCliFeedbackV1(s, { kind: 'enter' }).result).toEqual({ kind: 'pending' });
    s = reducePromptEnhancementCliFeedbackV1(s, { kind: 'editor', raw: 'h' }).state;
    s = reducePromptEnhancementCliFeedbackV1(s, { kind: 'editor', raw: 'i' }).state;
    expect(reducePromptEnhancementCliFeedbackV1(s, { kind: 'enter' }).result).toEqual({ kind: 'other', text: 'hi' });
  });

  it('skips on Esc with no feedback', () => {
    expect(reducePromptEnhancementCliFeedbackV1(fb(), { kind: 'escape' }).result).toEqual({ kind: 'dismiss' });
  });
});

describe('windowPromptEnhancementFieldForDisplayV1 (bounded body viewport)', () => {
  const buffer = (text: string, scrollVisualRow = 0): PromptEnhancementEditorBufferV1 => ({
    text, cursor: 0, desiredVisualColumn: 0, scrollVisualRow, dirty: false, focused: true,
  });

  it('returns the whole text unchanged when it fits the viewport', () => {
    const out = windowPromptEnhancementFieldForDisplayV1(buffer('a\nb\nc'), 40, 6);
    expect(out).toBe('a\nb\nc');
  });

  it('clips to exactly `rows` lines and shows a "↓ N more" hint at the bottom', () => {
    const out = windowPromptEnhancementFieldForDisplayV1(buffer('l1\nl2\nl3\nl4\nl5\nl6'), 40, 3);
    const lines = out.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('l1');
    expect(lines[2]).toBe('↓ 3 more lines below · the whole prompt is included');
  });

  it('shows a "↑ N more" hint at the top once scrolled down', () => {
    const out = windowPromptEnhancementFieldForDisplayV1(buffer('l1\nl2\nl3\nl4\nl5\nl6', 3), 40, 3);
    const lines = out.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('↑ 3 more lines above');
    expect(lines[2]).toBe('l6');
  });

  it('never exceeds the viewport height regardless of body length (frame stays bounded)', () => {
    const long = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const out = windowPromptEnhancementFieldForDisplayV1(buffer(long, 50), 40, 8);
    expect(out.split('\n')).toHaveLength(8);
  });
});

// Caret-parity regression (Phase 2): the raw-TTY caret uses the window's `start` (not the raw
// buffer scroll), so display and caret share one source of truth. The string form and the
// WithStart form must agree, and pos.row - start must land on the cursor's visible line.
describe('windowPromptEnhancementFieldForDisplayWithStartV1 (caret/display parity)', () => {
  const buffer = (text: string, scrollVisualRow = 0, cursor = 0): PromptEnhancementEditorBufferV1 => ({
    text, cursor, desiredVisualColumn: 0, scrollVisualRow, dirty: false, focused: true,
  });

  it('returns the same text as the string form plus the first-shown row as `start`', () => {
    const scrolled = buffer('l1\nl2\nl3\nl4\nl5\nl6', 3);
    const withStart = windowPromptEnhancementFieldForDisplayWithStartV1(scrolled, 40, 3);
    expect(withStart.text).toBe(windowPromptEnhancementFieldForDisplayV1(scrolled, 40, 3));
    expect(withStart.start).toBe(3);
    const fits = buffer('l1\nl2\nl3');
    expect(windowPromptEnhancementFieldForDisplayWithStartV1(fits, 40, 6).start).toBe(0);
  });

  it('places the caret on the cursor line for a scrolled field (pos.row - start in range)', () => {
    const b = buffer('l1\nl2\nl3\nl4\nl5\nl6', 3, 'l1\nl2\nl3\nl4\nl5\nl6'.length); // cursor on last row (5)
    const win = windowPromptEnhancementFieldForDisplayWithStartV1(b, 40, 3);
    const pos = promptEnhancementCursorVisualPositionV1(b, 40);
    const visualRow = pos.row - win.start;
    const shownLines = win.text.split('\n').length;
    expect(pos.row).toBe(5);
    expect(win.start).toBe(3);
    expect(visualRow).toBe(2); // 3rd (last) shown line — where 'l6' renders
    expect(visualRow).toBeGreaterThanOrEqual(0);
    expect(visualRow).toBeLessThan(shownLines);
  });

  it('uses a row-0 basis when the field fits, even if the buffer carries a stale scroll', () => {
    // The exact bug shape: the field fits (3 rows in a 6-row viewport) but the buffer scroll is 5.
    // The display shows from row 0; the caret must too — the OLD `pos.row - scrollVisualRow` would
    // have gone negative (2 - 5) and stranded the cursor.
    const b = buffer('l1\nl2\nl3', 5, 'l1\nl2\nl3'.length); // cursor on last row (2)
    const win = windowPromptEnhancementFieldForDisplayWithStartV1(b, 40, 6);
    const pos = promptEnhancementCursorVisualPositionV1(b, 40);
    const visualRow = pos.row - win.start;
    const shownLines = win.text.split('\n').length;
    expect(win.start).toBe(0);
    expect(shownLines).toBe(3);
    expect(visualRow).toBe(pos.row); // start 0 → caret row equals the real text row
    expect(visualRow).toBeGreaterThanOrEqual(0);
    expect(visualRow).toBeLessThan(shownLines);
  });
});
