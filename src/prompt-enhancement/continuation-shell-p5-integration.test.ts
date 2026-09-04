import { beforeAll, describe, expect, it } from 'vitest';
import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  type PromptEnhancementPrepareRequestV1,
  type PromptEnhancementPrepareResultV1,
  type PromptEnhancementSourceRefV1,
  type PromptEnhancementValidationGraphV1,
} from './contracts.js';
import { buildPromptEnhancementCostVisibilityMetadataV1 } from './cost-observability.js';
import { getPromptStartStopSourceSnapshot } from './source-reality.js';
import { preparePromptEnhancement } from './facade.js';
import { packageContinuationAtStopV1 } from './continuation-stop-package.js';
import {
  runPromptEnhancementCliMpsContinuationPopupV1,
  deliverPromptEnhancementCliMpsContinuationResultV1,
} from './cli-mps-continuation-run.js';
import type { PromptEnhancementCliMpsInteractionV1 } from './cli-mps-run.js';
import type { PromptEnhancementSequenceItemV1 } from './sequence-payload.js';
import { type PromptEnhancementSequenceRuntimeStateV1, PROMPT_ENHANCEMENT_SEQUENCE_MAX_ITEM_COUNT_V1 } from './sequence-runtime.js';
import { openStore, type Store } from '../store/db.js';
import {
  upsertPendingPromptSequence, getActivePendingPromptSequence, updatePendingPromptSequenceState,
} from '../store/pending-sequences.js';

// ─────────────────────────────────────────────────────────────────────────────
// MPS shell P5 — the acceptance-fixture SCENARIOS run against the LIVE assembled shell (package → render
// → deliver → persist), the exact composition stop.ts uses behind the gate. ⛔ This asserts the shell's
// observable behaviour; it does NOT set any acceptance fixture's actualResult or any evidence flag — the
// owner oracle judges readiness (flag 11) at un-gate. Real items carry a real prepare result's
// validationGraph, so the packaged result is builder-valid (the wall a minimal stub hit).
// ─────────────────────────────────────────────────────────────────────────────

const KEY = { enter: '\r', escape: '\x1b', down: '\x1b[B' } as const;

function scripted(keys: readonly string[]): PromptEnhancementCliMpsInteractionV1 & { frames: string[] } {
  const queue = [...keys];
  const frames: string[] = [];
  return {
    frames,
    size: () => ({ columns: 96, rows: 30 }),
    async next(frame: string) { frames.push(frame); const k = queue.shift(); if (k === undefined) throw new Error('missing key'); return k; },
    close() { /* noop */ },
  };
}

function request(): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'p5-src-1', sourceKind: 'source_a_user_prompt', sourceId: 'prompt:p5',
    sourceAuthorization: 'source_fact_only', evidenceStatus: 'present', freshness: 'current', confidence: 'high', privacyClass: 'public_safe',
  };
  const p = getPromptStartStopSourceSnapshot();
  return {
    schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION, requestId: 'p5-req', projectRoot: '/tmp/p5', hostSurface: 'cli_stop_bridge',
    sourcePrompt: { text: 'Fix the payment test and add a rate limiter to login.', origin: 'user', capturedAt: 1, promptIndex: 1, generatedOriginPolicy: 'ordinary_source_a' },
    reviewMomentContext: { reviewMoment: 'UserPromptSubmit_preparation', currentAgentMode: 'workspace-write', projectId: 'p5', sessionId: 's1', detectedLanguage: 'en', stageCandidate: 'implementation', promptCount: 1, recentPromptMetadataRefs: [], triggerProvenance: { currentStage: 'implementation', prevStage: 'task_breakdown', triggerKind: 'stage_transition', classifierState: 'fire_recommended', degradedNoActionState: 'none', promptStartBoundary: p.hookBoundary, deliveryBoundary: p.deliveryBoundary, promptStartCanReplaceSameTurn: false } },
    sourceSignals: { sourceAOriginalPromptRef: sourceRef, sourceRefs: [sourceRef], normalizedStageAbsenceSignalRefs: [], contentTemplateRecordFactRefs: [], popupQuestionSourceRefs: [], whyHelpSourceRefs: [], profileRoleModeRefs: [], rightGoodWorkStyleEnvRuntimeRefs: [], missingMemoryCandidateRefs: [], sourceLabels: [{ sourceRefId: sourceRef.sourceRefId, label: 'original_prompt', evidenceStatus: 'present' }], promptStartStop: { hookBoundary: p.hookBoundary, deliveryBoundary: p.deliveryBoundary, runAutoCanHoldOrReplaceSubmittedPrompt: false, sharedSignalCount: p.sharedSignalCount, classifierDegradedNoFireReasons: p.classifierDegradedNoFireReasons }, store: { schemaVersion: 1, missingPromptEnhancementTables: [], cleanupGaps: [] }, transcriptPathState: 'not_authority', streamBOutputs: [], paramEventChannels: [], servedVariantIdentityRefs: [], deliveryGateRefs: [], sourceOnlyHardFactRefs: [] },
    userPreferenceContext: { levelState: 'default', scopedFeedbackEvidenceRefs: [] },
    configSnapshot: { sequenceEnabledState: 'not_enabled_v1', validatedEffectiveConfigState: 'valid', arbitraryConfigRowsAreAuthority: false },
    callVisibilityState: buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', { callVisibilityMode: 'deterministic', plannedCallCount: 0, usedCallCount: 0 }),
    privacyAndStoragePolicy: { sensitivityClass: 'normal', localStorageEligibility: 'ids_and_categories_only', telemetryEligibility: 'allowlisted_counts_only', llmSharingEligibility: 'allowed_minimal', generatedBodyStoragePolicy: 'do_not_store_raw_by_default' },
  };
}

let REAL_GRAPH: PromptEnhancementValidationGraphV1;
let ORIGINAL_LEN: number;
beforeAll(async () => {
  const prep: PromptEnhancementPrepareResultV1 = await preparePromptEnhancement(request());
  REAL_GRAPH = prep.validationGraph; // a full, builder-valid graph reused as the items' verdict
  ORIGINAL_LEN = 50;
  // 🔴 **EXPLICIT hook timeout, added at the phase-36 verification pass — and the reason is that the
  // default was producing a FALSE GREEN, not merely a flaky red.** This file sits marginally against
  // vitest's 10s default `hookTimeout` under parallel load. When it trips, vitest reports the file's
  // 14 tests as SKIPPED and the run still says 0 failed — so fourteen integration assertions can
  // vanish from a "clean" suite without anyone noticing. Measured 3/3 skipping in isolation before
  // this change, and 14/14 passing with the timeout lifted.
  //
  // ⚠️ The cost is NOT this module's work: a keyless `preparePromptEnhancement` measured 34ms cold
  // and 3ms warm. The time goes to worker + store initialisation resolving inside the hook, which is
  // environmental. So the honest fix is a realistic budget, not an optimisation hunt — and a
  // generous one, because a hook that fails on a slow machine is the same false-green risk again.
}, 60_000);

function items(): readonly PromptEnhancementSequenceItemV1[] {
  return [
    {
      itemKind: 'first_task', originalSliceRef: { start: 0, end: ORIGINAL_LEN }, sourcePointRanges: [{ start: 10, end: 20 }],
      roleLabel: 'fix', dependencyOrder: 0, complexity: 'not_complex', complexityReason: null,
      generatedWording: null, actionRiskKinds: [], authorityMode: 'plan_or_review', requiresConfirmationFloor: false,
      decompositionGroupId: 'g1', itemValidationGraph: null, itemSafetyClauseRef: null,
    },
    {
      itemKind: 'task', originalSliceRef: { start: 10, end: 40 }, sourcePointRanges: [{ start: 10, end: 20 }],
      roleLabel: 'fix', dependencyOrder: 1, complexity: 'not_complex', complexityReason: null,
      generatedWording: 'Add the rate limiter to the login endpoint.', actionRiskKinds: [],
      authorityMode: 'plan_or_review', requiresConfirmationFloor: false, decompositionGroupId: 'g1',
      itemValidationGraph: REAL_GRAPH, itemSafetyClauseRef: null,
    },
  ];
}

function state(over: Partial<PromptEnhancementSequenceRuntimeStateV1> = {}): PromptEnhancementSequenceRuntimeStateV1 {
  return { sequenceId: 'seq-1', enhancementId: 'enh-1', projectRoot: '/tmp/p5', sessionId: 's1', itemCount: 2, currentItemIndex: 0, status: 'awaiting_response', lastActionId: null, ...over };
}

/** A confirmation item (any of the three kinds) at `order`: no slice, no authority, a token wording. */
function confirmItem(kind: 'binary_confirmation' | 'double_confirmation' | 'cross_confirmation', order: number): PromptEnhancementSequenceItemV1 {
  return {
    itemKind: kind, originalSliceRef: null, sourcePointRanges: [], roleLabel: 'fix', dependencyOrder: order,
    complexity: null, complexityReason: 'This item changes a shipped contract.',
    generatedWording: kind === 'binary_confirmation' ? 'YES/NO' : 'Check it.', actionRiskKinds: [],
    authorityMode: null, requiresConfirmationFloor: false, decompositionGroupId: null,
    itemValidationGraph: REAL_GRAPH, itemSafetyClauseRef: null,
  };
}

/** An n-item stored list: item 0 the whole original (no wording), items 1…n-1 worded tasks. */
function itemsN(n: number): readonly PromptEnhancementSequenceItemV1[] {
  return Array.from({ length: n }, (_unused, order) => order === 0
    ? items()[0]
    : {
        itemKind: 'task' as const, originalSliceRef: { start: 10, end: 40 }, sourcePointRanges: [{ start: 10, end: 20 }],
        roleLabel: 'fix' as const, dependencyOrder: order, complexity: 'not_complex' as const, complexityReason: null,
        generatedWording: `Do sub-task ${order}.`, actionRiskKinds: [], authorityMode: 'plan_or_review' as const,
        requiresConfirmationFloor: false, decompositionGroupId: 'g1', itemValidationGraph: REAL_GRAPH, itemSafetyClauseRef: null,
      });
}

/** Compose the shell exactly as stop.ts does: package (offer+package) → run (scripted) → deliver. */
async function runShell(keys: readonly string[] | null, st = state(), itemList = items()) {
  const packaged = packageContinuationAtStopV1({
    state: st, actionId: `${st.sequenceId}:${st.currentItemIndex}`, items: itemList,
    redactedOriginalPromptText: 'x'.repeat(ORIGINAL_LEN), handoffKind: 'compact_sequence_summary_candidate',
  });
  if (!packaged.ok) return { packaged, delivery: null, frames: [] as string[] };
  // keys === null models NO TTY: the runner cannot render and reports not_shown.
  const io = keys === null ? null : scripted(keys);
  const outcome = await runPromptEnhancementCliMpsContinuationPopupV1({
    result: packaged.packaged.result, handoffMetadata: packaged.packaged.handoffMetadata, event: packaged.packaged.event,
    progress: packaged.packaged.progress, itemKind: packaged.packaged.itemKind, interaction: io,
  });
  const delivery = deliverPromptEnhancementCliMpsContinuationResultV1(packaged.offeredState, outcome, `${st.sequenceId}:${st.currentItemIndex}:deliver`);
  return { packaged, delivery, frames: io ? io.frames : [] as string[] };
}

describe('MPS shell P5 — acceptance scenarios against the live assembled shell', () => {
  it('send → inject the advanced item body (the offer advanced 0→1, the send injects item 1)', async () => {
    const { packaged, delivery } = await runShell([KEY.enter]);
    expect(packaged.ok).toBe(true);
    expect(delivery?.kind).toBe('inject');
    if (delivery?.kind !== 'inject') return;
    expect(delivery.bodyText.trim().length).toBeGreaterThan(0);
    expect(delivery.nextState.currentItemIndex).toBe(1); // advanced past the already-sent item 0
  });

  it('custom interruption → keep the same item pending (pointer does NOT advance past the offer)', async () => {
    const { delivery } = await runShell([KEY.down, KEY.down, KEY.enter]);
    expect(delivery?.kind).toBe('keep');
  });

  it('cancel-mid-sequence → terminal cancel scoped to this row', async () => {
    const { delivery } = await runShell([KEY.down, KEY.down, KEY.down, KEY.enter, KEY.enter]);
    expect(delivery?.kind).toBe('cancel');
  });

  it('persist-before-block: the inject nextState round-trips through the store (MPS-9)', async () => {
    const store: Store = await openStore(':memory:');
    const st = state();
    upsertPendingPromptSequence(store, st, { items: items(), promptDirectives: [], suggestedNextPromptPolicy: 'generated_not_rendered_pending_acceptance', originalLength: ORIGINAL_LEN, offerDisposition: 'accepted' }, { redactedOriginalPromptText: 'x'.repeat(ORIGINAL_LEN), handoffKind: 'compact_sequence_summary_candidate' });
    const row = getActivePendingPromptSequence(store, '/tmp/p5', 's1');
    expect(row).not.toBeNull();
    const { delivery } = await runShell([KEY.enter], row!);
    expect(delivery?.kind).toBe('inject');
    if (delivery?.kind !== 'inject') return;
    // Persist the advanced state, as stop.ts does before the block/force-exit, and read it back.
    expect(updatePendingPromptSequenceState(store, row!.id, delivery.nextState)).toBe(true);
    expect(getActivePendingPromptSequence(store, '/tmp/p5', 's1')?.currentItemIndex).toBe(1);
  });

  it('no TTY → not_shown → keep the item pending (a headless Stop never drops the sequence)', async () => {
    const { delivery } = await runShell(null);
    expect(delivery?.kind).toBe('keep');
  });

  it('item_pending re-offers the SAME item unchanged, and a send then injects it (advanced:false)', async () => {
    const { packaged, delivery } = await runShell([KEY.enter], state({ status: 'item_pending', currentItemIndex: 1 }));
    expect(packaged.ok).toBe(true);
    if (!packaged.ok) return;
    expect(packaged.advanced).toBe(false); // re-offered after a prior interruption, not advanced
    expect(delivery?.kind).toBe('inject');
  });

  it('a stale/duplicate action id is rejected — why the offer and deliver ids must differ', async () => {
    const st = state();
    const packaged = packageContinuationAtStopV1({
      state: st, actionId: `${st.sequenceId}:${st.currentItemIndex}`, items: items(),
      redactedOriginalPromptText: 'x'.repeat(ORIGINAL_LEN), handoffKind: 'compact_sequence_summary_candidate',
    });
    expect(packaged.ok).toBe(true);
    if (!packaged.ok) return;
    // Deliver with the SAME id the offer's advance already consumed → the runtime rejects the duplicate,
    // which is exactly why stop.ts uses a distinct `:deliver` id for the send.
    const delivery = deliverPromptEnhancementCliMpsContinuationResultV1(
      packaged.offeredState, { state: 'send', bodyText: 'x' }, `${st.sequenceId}:${st.currentItemIndex}`,
    );
    expect(delivery.kind).toBe('reject');
  });

  it('a served CONFIRMATION item carries its kind and no original-text slice (MPS-12)', async () => {
    // Items 0 (first_task) · 1 (task) · 2 (binary_confirmation). From index 1, the offer advances to
    // serve item 2 — the confirmation, which carries a token wording and no original slice.
    const confirmItems: readonly PromptEnhancementSequenceItemV1[] = [
      ...items(),
      {
        itemKind: 'binary_confirmation', originalSliceRef: null, sourcePointRanges: [], roleLabel: 'fix',
        dependencyOrder: 2, complexity: null, complexityReason: 'This item changes a shipped contract.',
        generatedWording: 'YES/NO', actionRiskKinds: [], authorityMode: null, requiresConfirmationFloor: false,
        decompositionGroupId: null, itemValidationGraph: REAL_GRAPH, itemSafetyClauseRef: null,
      },
    ];
    const { packaged } = await runShell([KEY.enter], state({ itemCount: 3, currentItemIndex: 1 }), confirmItems);
    expect(packaged.ok).toBe(true);
    if (!packaged.ok) return;
    expect(packaged.offeredState.currentItemIndex).toBe(2);
    expect(packaged.packaged.itemKind).toBe('binary_confirmation');
  });

  it('mid-sequence: from item 1 the offer advances to serve item 2 of a 3-item sequence', async () => {
    const { packaged, delivery } = await runShell([KEY.enter], state({ itemCount: 3, currentItemIndex: 1 }), itemsN(3));
    expect(packaged.ok).toBe(true);
    if (!packaged.ok) return;
    expect(packaged.offeredState.currentItemIndex).toBe(2);
    expect(delivery?.kind).toBe('inject');
    if (delivery?.kind !== 'inject') return;
    expect(delivery.nextState.currentItemIndex).toBe(2);
  });

  it('sequence complete: advancing off the last item yields no package (nothing to serve, no popup)', async () => {
    const { packaged } = await runShell([KEY.enter], state({ itemCount: 3, currentItemIndex: 2 }), itemsN(3));
    expect(packaged.ok).toBe(false);
    if (packaged.ok) return;
    expect(packaged.reason).toBe('sequence_complete');
  });

  it('same item returns identical: re-packaging a pending item twice yields the same served body', async () => {
    const st = state({ status: 'item_pending', currentItemIndex: 1 });
    const a = await runShell([KEY.enter], st);
    const b = await runShell([KEY.enter], st);
    expect(a.packaged.ok && b.packaged.ok).toBe(true);
    if (!a.packaged.ok || !b.packaged.ok) return;
    expect(b.packaged.packaged.result.currentBody.text).toBe(a.packaged.packaged.result.currentBody.text);
    expect(b.packaged.packaged.itemKind).toBe(a.packaged.packaged.itemKind);
  });

  it('max item count: a sequence at the locked 30-item cap still packages and serves (clamped, never dropped)', async () => {
    const max = PROMPT_ENHANCEMENT_SEQUENCE_MAX_ITEM_COUNT_V1;
    const { packaged, delivery } = await runShell([KEY.enter], state({ itemCount: max, currentItemIndex: 0 }), itemsN(max));
    expect(packaged.ok).toBe(true);
    if (!packaged.ok) return;
    expect(packaged.offeredState.currentItemIndex).toBe(1);
    expect(delivery?.kind).toBe('inject');
  });

  // Every confirmation kind serves the same way — its kind travels through, and it carries NO original
  // slice (MPS-12: a confirmation covers both classes with a token, not a cut of the user's prompt).
  for (const kind of ['double_confirmation', 'cross_confirmation'] as const) {
    it(`a ${kind} item serves with its kind and no original-text slice (MPS-12)`, async () => {
      const list = [...items(), confirmItem(kind, 2)];
      const { packaged } = await runShell([KEY.enter], state({ itemCount: 3, currentItemIndex: 1 }), list);
      expect(packaged.ok).toBe(true);
      if (!packaged.ok) return;
      expect(packaged.packaged.itemKind).toBe(kind);
    });
  }
});
