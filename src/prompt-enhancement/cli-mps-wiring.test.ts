import { describe, expect, it, vi } from 'vitest';
import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  type PromptEnhancementPrepareRequestV1,
  type PromptEnhancementSourceRefV1,
} from './contracts.js';
import { buildPromptEnhancementCostVisibilityMetadataV1 } from './cost-observability.js';
import { preparePromptEnhancement } from './facade.js';
import { getPromptStartStopSourceSnapshot } from './source-reality.js';
import { evaluatePromptEnhancementMpsIntakeDecisionV1 } from './intake-decision.js';
import { buildPromptEnhancementCliMpsIntakeEvidenceV1 } from './cli-mps-intake-evidence.js';
import { runPromptEnhancementCliMpsFirstPopupV1, buildPromptEnhancementMpsCancelFeedbackEventV1, promptEnhancementMpsActionSignalKindV1 } from './cli-mps-run.js';
import { isPromptEnhancementSequenceShapedTextV1 } from './routing-taxonomy.js';

const MULTI_INTENT = 'Fix the failing payment test and add a rate limiter to the login endpoint.';
const SINGLE_INTENT = 'Fix the failing payment test.';

function request(text: string): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'src-a-1', sourceKind: 'source_a_user_prompt', sourceId: 'prompt:1',
    sourceAuthorization: 'source_fact_only', evidenceStatus: 'present', freshness: 'current', confidence: 'high', privacyClass: 'public_safe',
  };
  const p = getPromptStartStopSourceSnapshot();
  return {
    schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION, requestId: 'mps-wire-1', projectRoot: '/tmp/mps-wire', hostSurface: 'cli_stop_bridge',
    sourcePrompt: { text, origin: 'user', capturedAt: 1, promptIndex: 1, generatedOriginPolicy: 'ordinary_source_a' },
    reviewMomentContext: { reviewMoment: 'UserPromptSubmit_preparation', currentAgentMode: 'workspace-write', projectId: 'p1', sessionId: 's1', detectedLanguage: 'en', stageCandidate: 'implementation', promptCount: 1, recentPromptMetadataRefs: [], triggerProvenance: { currentStage: 'implementation', prevStage: 'task_breakdown', triggerKind: 'stage_transition', classifierState: 'fire_recommended', degradedNoActionState: 'none', promptStartBoundary: p.hookBoundary, deliveryBoundary: p.deliveryBoundary, promptStartCanReplaceSameTurn: false } },
    sourceSignals: { sourceAOriginalPromptRef: sourceRef, sourceRefs: [sourceRef], normalizedStageAbsenceSignalRefs: [], contentTemplateRecordFactRefs: [], popupQuestionSourceRefs: [], whyHelpSourceRefs: [], profileRoleModeRefs: [], rightGoodWorkStyleEnvRuntimeRefs: [], missingMemoryCandidateRefs: [], sourceLabels: [{ sourceRefId: sourceRef.sourceRefId, label: 'original_prompt', evidenceStatus: 'present' }], promptStartStop: { hookBoundary: p.hookBoundary, deliveryBoundary: p.deliveryBoundary, runAutoCanHoldOrReplaceSubmittedPrompt: false, sharedSignalCount: p.sharedSignalCount, classifierDegradedNoFireReasons: p.classifierDegradedNoFireReasons }, store: { schemaVersion: 1, missingPromptEnhancementTables: [], cleanupGaps: [] }, transcriptPathState: 'not_authority', streamBOutputs: [], paramEventChannels: [], servedVariantIdentityRefs: [], deliveryGateRefs: [], sourceOnlyHardFactRefs: [] },
    userPreferenceContext: { levelState: 'default', scopedFeedbackEvidenceRefs: [] },
    configSnapshot: { sequenceEnabledState: 'not_enabled_v1', validatedEffectiveConfigState: 'valid', arbitraryConfigRowsAreAuthority: false },
    callVisibilityState: buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', { callVisibilityMode: 'deterministic', plannedCallCount: 0, usedCallCount: 0 }),
    privacyAndStoragePolicy: { sensitivityClass: 'normal', localStorageEligibility: 'ids_and_categories_only', telemetryEligibility: 'allowlisted_counts_only', llmSharingEligibility: 'allowed_minimal', generatedBodyStoragePolicy: 'do_not_store_raw_by_default' },
  };
}

// Raw key sequences (the shell decodes them with the shared PE key decoder).
const KEY = { enter: '\r', escape: '', up: '[A', down: '[B' } as const;

function scripted(keys: readonly string[]): {
  next(frame: string, cursor?: { row: number; col: number } | null): Promise<string>;
  close(): void;
  frames: string[];
  cursors: ({ row: number; col: number } | null)[];
} {
  const queue = [...keys];
  const frames: string[] = [];
  const cursors: ({ row: number; col: number } | null)[] = [];
  return {
    frames,
    cursors,
    async next(frame, cursor) {
      frames.push(frame);
      cursors.push(cursor ?? null);
      const key = queue.shift();
      if (key === undefined) throw new Error('missing scripted key');
      return key;
    },
    close() { /* noop */ },
  };
}

describe('MPS CLI wiring (owner ruling 2026-08-06: CLI complete, extension pending)', () => {
  it('the engine emits the handoff/sequence summary for a multi-intent prompt (metadata-only)', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    const handoff = result.uiView.handoffAndSequenceSummary;
    expect(handoff).toBeDefined();
    expect(handoff!.handoffKind).toBe('compact_sequence_summary_candidate');
    // The runtime stays policy-blocked — metadata only, never activation.
    expect(handoff!.sequenceActivationPolicy).toBe('blocked_pending_sequence_runtime_and_cost_gates');
    expect(handoff!.applicability.receiverCanActivateRuntime).toBe(false);
  });

  it('Sequence-plan summary carries REAL display data (fix 2026-08-07): remaining count + fixed-vocab role labels', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    const summary = result.uiView.handoffAndSequenceSummary!.compactFirstPopupSequenceSummary!;
    // "Fix the failing payment test AND add a rate limiter…" = 2 points -> 1 remaining after the first.
    expect(summary.remainingTaskCount).toBe(1);
    expect(summary.taskRoleLabels).toEqual(['fix', 'build']);
    // Safety flags stay locked — count + fixed vocabulary only, never prompt text.
    expect(summary.containsFuturePromptText).toBe(false);
    expect(summary.rawPromptTextExcluded).toBe(true);
    expect(summary.bodyBoundMetadataOnly).toBe(true);
    // …and the popup FRAME shows it (end-to-end).
    const ui = scripted([KEY.escape]);
    await runPromptEnhancementCliMpsFirstPopupV1({ result, interaction: ui });
    expect(ui.frames[0]).toContain('Total: 1');
    expect(ui.frames[0]).toContain('Types: fix, build');
  });

  it('a single-intent prompt emits NO sequence summary (no MPS popup)', async () => {
    const result = await preparePromptEnhancement(request(SINGLE_INTENT));
    expect(result.uiView.handoffAndSequenceSummary).toBeUndefined();
  });

  it('a multi-POINT same-family list (>=3 points) also emits the sequence summary (script-style sequence prompt)', async () => {
    const result = await preparePromptEnhancement(request(
      'Build the whole recurring-billing flow: schema, cron job, email sender, and the dashboard widget - do it as one sequence.',
    ));
    const handoff = result.uiView.handoffAndSequenceSummary;
    expect(handoff).toBeDefined();
    expect(handoff!.handoffKind).toBe('compact_sequence_summary_candidate');
  });

  it('a plain two-part same-family prompt stays on the PE popup (no sequence summary)', async () => {
    // "add X and Y" is list-shaped but not a real multi-step sequence — MPS must not hijack it.
    const result = await preparePromptEnhancement(request('Add a tax field and a discount field to the invoice page.'));
    expect(result.uiView.handoffAndSequenceSummary).toBeUndefined();
  });

  it('the shared sequence-shape text predicate matches the facade emission rule (used by the auto fallback)', () => {
    // The UserPromptSubmit fallback uses this predicate to prepare sequence prompts on
    // NON-trigger turns — it must agree with what the facade will actually emit for.
    expect(isPromptEnhancementSequenceShapedTextV1(MULTI_INTENT)).toBe(true);
    expect(isPromptEnhancementSequenceShapedTextV1(
      'Build the whole recurring-billing flow: schema, cron job, email sender, and the dashboard widget — do it as one sequence.',
    )).toBe(true);
    expect(isPromptEnhancementSequenceShapedTextV1(SINGLE_INTENT)).toBe(false);
    expect(isPromptEnhancementSequenceShapedTextV1('Add a tax field and a discount field to the invoice page.')).toBe(false);
  });

  it('CLI surface gate PERMITS with the three non-extension evidence rows', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    const evidence = buildPromptEnhancementCliMpsIntakeEvidenceV1(result);
    expect(evidence).toBeDefined();
    const gate = evaluatePromptEnhancementMpsIntakeDecisionV1({ surface: 'cli_stop_bridge', evidence: [...evidence!] });
    expect(gate.renderPermission).toBe('mps_render_permitted');
  });

  it('the DEFAULT (extension/global) surface stays fail-closed on the missing host evidence (extension host pending)', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    const evidence = buildPromptEnhancementCliMpsIntakeEvidenceV1(result);
    const gate = evaluatePromptEnhancementMpsIntakeDecisionV1({ evidence: [...evidence!] });
    expect(gate.renderPermission).toBe('mps_blocked_fail_closed');
    expect(gate.intakePacket.missingEvidenceKinds).toContain('host_runtime');
  });

  it('MPS first popup: Enter sends the enhanced first-prompt body; the frame shows ALL locked rows', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    const ui = scripted([KEY.enter]);
    const outcome = await runPromptEnhancementCliMpsFirstPopupV1({ result, interaction: ui });
    expect(outcome.state).toBe('send');
    if (outcome.state === 'send') {
      expect(outcome.bodyText).toContain('Fix the failing payment test');
      expect(outcome.bodyText.length).toBeGreaterThan(result.currentBody.originalPromptText.length);
    }
    // The locked §3.3 frame: header + all 3 interactive rows + dim plan + footer, in ONE frame.
    expect(ui.frames[0]).toContain('Multi-prompt sequence');
    expect(ui.frames[0]).toContain('Use enhanced sequence prompt');
    expect(ui.frames[0]).toContain('Additional details');
    expect(ui.frames[0]).toContain('Use original prompt');
    expect(ui.frames[0]).toContain('Sequence plan');
    expect(ui.frames[0]).toContain('Enter send · Esc actions');
    // The hardware cursor is placed in the focused editable body on open (owner request): the
    // body opens at the TOP with the caret on its first content line, at column 7.
    expect(ui.cursors[0]).not.toBeNull();
    expect(ui.cursors[0]!.col).toBe(7);
    expect(ui.cursors[0]!.row).toBeGreaterThan(1);
  });

  it('no-scroll: every frame fits the reported window height (stacking regression guard)', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    const ui = { ...scripted([KEY.down, KEY.up, KEY.enter]), size: () => ({ columns: 90, rows: 32 }) };
    const outcome = await runPromptEnhancementCliMpsFirstPopupV1({ result, interaction: ui });
    expect(outcome.state).toBe('send');
    // The body is windowed so the WHOLE frame fits the window — the render can never scroll,
    // which is what previously stacked stale frames in scrollback.
    for (const frame of ui.frames) {
      expect(frame.split('\n').length).toBeLessThanOrEqual(31);
    }
  });

  it('the body FILLS the window height (owner request 2026-08-07 — no dead space below the footer)', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    // At several window heights the enhanced body must expand so the frame uses the window down
    // to (rows-1), never leaving a large empty gap AND never overflowing (which would scroll).
    for (const rows of [30, 40, 50]) {
      const ui = { ...scripted([KEY.escape]), size: () => ({ columns: 100, rows }) };
      await runPromptEnhancementCliMpsFirstPopupV1({ result, interaction: ui });
      const frame = ui.frames[0]!;
      const frameLines = frame.split('\n').length;
      expect(frameLines).toBeLessThanOrEqual(rows - 1); // never overflow -> never scroll/stack
      // Either the body grew to fill the window (frame reaches near the bottom), or the whole
      // body is already shown (nothing clipped) — never a tiny body with a large dead gap, which
      // is what the reservation bug produced (frame pinned ~22 lines regardless of window height).
      const bodyFullyShown = !frame.includes('more lines below');
      expect(frameLines >= rows - 3 || bodyFullyShown).toBe(true);
    }
  });

  it('Cancel opens the PEF feedback popup and ends the flow as cancelled — never the PE popup (owner request)', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    // Down×2 -> Cancel; Enter -> the PEF feedback popup opens; Esc skips feedback -> cancelled.
    const ui = scripted([KEY.down, KEY.down, KEY.enter, KEY.escape]);
    const outcome = await runPromptEnhancementCliMpsFirstPopupV1({ result, interaction: ui });
    expect(outcome.state).toBe('cancelled');
    if (outcome.state === 'cancelled') expect(outcome.feedback).toBeUndefined();
    // The frame painted after Enter-on-Cancel is the PEF feedback popup, not the PE popup.
    expect(ui.frames[ui.frames.length - 1]).toContain('Prompt enhancement feedback');
    expect(ui.frames[ui.frames.length - 1]).toContain('Not relevant enough');
  });

  it('Cancel -> feedback reason submitted -> cancelled WITH the typed feedback, and it builds a valid PEF event', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    // Enter on Cancel opens feedback; Enter on the first reason submits it.
    const outcome = await runPromptEnhancementCliMpsFirstPopupV1({
      result,
      interaction: scripted([KEY.down, KEY.down, KEY.enter, KEY.enter]),
    });
    expect(outcome.state).toBe('cancelled');
    if (outcome.state !== 'cancelled') return;
    expect(outcome.feedback).toEqual({ kind: 'suggested', category: 'not_relevant_enough' });
    // The caller records it through the SAME typed PEF event chain the PE popup uses.
    const event = buildPromptEnhancementMpsCancelFeedbackEventV1(result, outcome.feedback!, Date.now());
    expect(event).not.toBeNull();
    expect(event!.eventType).toBe('explicit_feedback');
    expect(event!.feedbackCategory).toBe('not_relevant_enough');
  });

  it('Additional details: Enter APPLIES the details into the enhanced sequence prompt (PE parity) — then Enter on the body sends the merged prompt', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    // down -> details row; type; Enter -> APPLY (popup stays open, focus returns to the body);
    // Enter again -> send the merged body.
    const ui = scripted([KEY.down, 'u', 's', 'e', ' ', 'p', 'g', KEY.enter, KEY.enter]);
    const outcome = await runPromptEnhancementCliMpsFirstPopupV1({ result, interaction: ui });
    expect(outcome.state).toBe('send');
    if (outcome.state === 'send') {
      expect(outcome.bodyText).toContain('Additional details to incorporate:\nuse pg');
      expect(outcome.bodyText).toContain('Fix the failing payment test');
    }
    // The apply did NOT send — a further frame was painted after it (the merged-body view),
    // and the details field is empty again on that frame (the text moved into the body).
    const afterApply = ui.frames[ui.frames.length - 1]!;
    expect(afterApply).toContain('Additional details to incorporate:');
    // Issue #160: the field is empty again, so the apply hint goes with it. Advice about applying
    // details reads as a stray instruction once there is nothing left to apply, and this frame is
    // precisely the case the issue was raised about.
    expect(afterApply).not.toContain('Enter applies these details · unapplied details are not sent');
  });

  it('a second Apply extends the ONE details block — never a duplicate heading (iMac report 2026-08-07)', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    // apply 'a', then apply 'b', then send: one heading, both detail lines under it.
    const outcome = await runPromptEnhancementCliMpsFirstPopupV1({
      result,
      interaction: scripted([KEY.down, 'a', KEY.enter, KEY.down, 'b', KEY.enter, KEY.enter]),
    });
    expect(outcome.state).toBe('send');
    if (outcome.state === 'send') {
      expect(outcome.bodyText.match(/Additional details to incorporate:/g)).toHaveLength(1);
      expect(outcome.bodyText.endsWith('a\nb')).toBe(true);
    }
  });

  it('UNAPPLIED details are not sent: typing details and sending from the body row sends the body only (PE parity)', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    const outcome = await runPromptEnhancementCliMpsFirstPopupV1({
      result,
      interaction: scripted([KEY.down, 'z', 'z', KEY.up, KEY.enter]),
    });
    expect(outcome.state).toBe('send');
    if (outcome.state === 'send') {
      expect(outcome.bodyText).not.toContain('zz');
      expect(outcome.bodyText).toContain('Fix the failing payment test');
    }
  });

  it('details helpers (PE parity): apply-hint only once details exist (#160); focus adds ONLY the edit-keys hint (no sub-label)', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    const ui = scripted([KEY.down, KEY.escape]);
    await runPromptEnhancementCliMpsFirstPopupV1({ result, interaction: ui });
    // ── Issue #160 ──────────────────────────────────────────────────────────────────────────
    // The apply hint used to render unconditionally (owner request 2026-08-07, PE parity). The
    // parity still holds — both surfaces changed together — but the hint is now keyed on the
    // field having content, because an empty field was advertising an action with nothing to
    // act on. Neither frame here has typed any details, so neither shows it.
    expect(ui.frames[0]).not.toContain('Enter applies these details · unapplied details are not sent');
    expect(ui.frames[1]).not.toContain('Enter applies these details · unapplied details are not sent');
    // The removed 'Add extra requirement' sub-label still never shows — unrelated to #160, and
    // kept here so that removal does not quietly come back.
    expect(ui.frames[0]).not.toContain('Add extra requirement');
    expect(ui.frames[1]).not.toContain('Add extra requirement');
    // Focusing the details row (frame 1) adds the editing-keys hint as the last line of the block.
    // Still focus-keyed, deliberately: those keys only work while the row holds focus, which is a
    // different question from whether there is anything to apply.
    expect(ui.frames[1]).toContain('Ctrl+J new line');
  });

  it('the apply hint DOES appear as soon as details are typed (#160, the other half)', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    // Move onto the details row and type — no Enter, so the text is still unapplied.
    const ui = scripted([KEY.down, 'u', 's', 'e', ' ', 'p', 'g', KEY.escape]);
    await runPromptEnhancementCliMpsFirstPopupV1({ result, interaction: ui });
    const typed = ui.frames[ui.frames.length - 1]!;
    expect(typed).toContain('use pg');
    // This is the case the hint exists for: text is present and not yet applied, so the reader
    // needs to be told what Enter does with it.
    expect(typed).toContain('Enter applies these details · unapplied details are not sent');
  });

  it('MPS first popup: Esc declines (caller falls through to the regular PE popup)', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    const outcome = await runPromptEnhancementCliMpsFirstPopupV1({ result, interaction: scripted([KEY.escape]) });
    expect(outcome.state).toBe('declined');
  });

  it('no handoff summary -> not_shown (single-intent result can never open MPS)', async () => {
    const result = await preparePromptEnhancement(request(SINGLE_INTENT));
    const outcome = await runPromptEnhancementCliMpsFirstPopupV1({ result, interaction: scripted([]) });
    expect(outcome.state).toBe('not_shown');
  });

  it('NF Plan B (B-3): maps MPS outcome states to content-free action kinds; non-actions → undefined', () => {
    expect(promptEnhancementMpsActionSignalKindV1('send')).toBe('mps_send');
    expect(promptEnhancementMpsActionSignalKindV1('cancelled')).toBe('mps_cancel');
    expect(promptEnhancementMpsActionSignalKindV1('declined')).toBe('mps_decline');
    expect(promptEnhancementMpsActionSignalKindV1('interruption')).toBe('mps_interruption');
    expect(promptEnhancementMpsActionSignalKindV1('not_shown')).toBeUndefined();
  });

  it('NF apply-details capture: a real Apply fires mps_apply_details once (content-free kind + timestamp, no text)', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    const sink = vi.fn();
    // down -> details row; type; Enter -> APPLY (fires the sink); Enter -> send.
    await runPromptEnhancementCliMpsFirstPopupV1({
      result,
      interaction: scripted([KEY.down, 'p', 'g', KEY.enter, KEY.enter]),
      actionSignalSink: sink,
    });
    expect(sink).toHaveBeenCalledTimes(1);
    const [kind, occurredAt] = sink.mock.calls[0]!;
    expect(kind).toBe('mps_apply_details');
    expect(typeof occurredAt).toBe('number');
    // Content-free: the sink carries only the kind + timestamp — never the details/body text.
    expect(sink.mock.calls[0]).toHaveLength(2);
  });

  it('NF apply-details capture: two Applies fire twice', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    const sink = vi.fn();
    await runPromptEnhancementCliMpsFirstPopupV1({
      result,
      interaction: scripted([KEY.down, 'a', KEY.enter, KEY.down, 'b', KEY.enter, KEY.enter]),
      actionSignalSink: sink,
    });
    expect(sink).toHaveBeenCalledTimes(2);
    expect(sink.mock.calls.every(([k]) => k === 'mps_apply_details')).toBe(true);
  });

  it('NF apply-details capture: a BLANK Apply (Enter on empty details) fires nothing', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    const sink = vi.fn();
    // down -> details row; Enter with no text -> blank apply (no-op); Esc -> declined.
    await runPromptEnhancementCliMpsFirstPopupV1({
      result,
      interaction: scripted([KEY.down, KEY.enter, KEY.escape]),
      actionSignalSink: sink,
    });
    expect(sink).not.toHaveBeenCalled();
  });

  it('NF apply-details capture: a send with no Apply fires nothing via the sink (the outcome is captured by the caller)', async () => {
    const result = await preparePromptEnhancement(request(MULTI_INTENT));
    const sink = vi.fn();
    const outcome = await runPromptEnhancementCliMpsFirstPopupV1({
      result,
      interaction: scripted([KEY.enter]),
      actionSignalSink: sink,
    });
    expect(outcome.state).toBe('send');
    expect(sink).not.toHaveBeenCalled();
  });
});
