import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../telemetry/index.js', () => ({
  writeTelemetry: vi.fn(),
  TELEMETRY_PATH: '/mock/telemetry.jsonl',
}));

vi.mock('../../telemetry/recent-prompts.js', () => ({
  recentPromptMetadata: vi.fn().mockReturnValue([]),
}));

vi.mock('../../decision-session/OptionGenerator.js', () => ({
  generateOptionList: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../telemetry/lifecycle-flush.js', () => ({
  flushIfTelemetryOn: vi.fn().mockResolvedValue(undefined),
  flushLifecycle:     vi.fn().mockResolvedValue(undefined),
}));

// The engine path (migrated signals) is mocked to null like the static generateOptionList above,
// so these flow tests stay deterministic and never make a live LLM call — regardless of which
// signals are in MIGRATED_SIGNALS. A null return exercises the static-content fallback in runLevel.
vi.mock('../../decision-session/engine-option-generator.js', () => ({
  generateFromEngine: vi.fn().mockResolvedValue(null),
  buildEngineGrounding: vi.fn().mockResolvedValue([]),
  // The deterministic fallback — mocked to null so flow tests fall through to the static generate
  // path (also mocked null) and exercise the static-content fallback. Its real behavior is unit-tested.
  composeDeterministicOptions: vi.fn().mockReturnValue(null),
}));

import { openStore } from '../../store/db.js';
import type { Store } from '../../store/db.js';
import { runStop, promptEnhancementMpsOfferDispositionFromPopupV1, recordPromptEnhancementMpsSequenceOfferDispositionV1, persistPromptEnhancementSequenceContinuationCancelV1 } from './stop.js';
import type { StopPayload } from './stop.js';
import { upsertPendingAdvisory, getPendingAdvisory } from '../../store/pending-advisories.js';
import { upsertPendingPromptEnhancement, getPendingPromptEnhancement, type PendingPromptEnhancement } from '../../store/pending-prompt-enhancements.js';
import { setConfig } from '../../store/config.js';
import { upsertPendingPromptSequence, getActivePendingPromptSequence, getPromptEnhancementSequenceOfferDisposition, recordPromptEnhancementSequenceOfferDeclined } from '../../store/pending-sequences.js';
import { applyPromptEnhancementSequenceRuntimeActionV1 } from '../../prompt-enhancement/sequence-runtime.js';
import type { PromptEnhancementCliPopupResultV1 } from '../../prompt-enhancement/cli-submit-popup.js';
import { emptyPromptEnhancementSequencePayloadV1 } from '../../prompt-enhancement/sequence-payload.js';
import { buildPromptEnhancementRequestForAuto } from './auto.js';
import { preparePromptEnhancement } from '../../prompt-enhancement/facade.js';
import type { PromptEnhancementStopLaunchFn } from './stop.js';
import { insertPrompt } from '../../store/prompts.js';
import { upsertProject, getProject } from '../../store/projects.js';
import { LANG_DETECT_INTERVAL } from '../../classifier/LanguageDetector.js';
import { writeTelemetry } from '../../telemetry/index.js';
import { SessionStateManager } from '../../classifier/SessionStateManager.js';
import { logger } from '../../logger.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePayload(overrides: Partial<StopPayload> = {}): StopPayload {
  return {
    session_id:          'sess-001',
    cwd:                 '/test/project',
    hook_event_name:     'Stop',
    stop_hook_active:    false,
    last_assistant_message: 'Done.',
    ...overrides,
  };
}

function makeAdvisory(projectRoot = '/test/project') {
  return {
    projectRoot,
    stage:       'implementation' as const,
    flagType:    'absence:test_creation' as const,
    pinchLabel:  'Hold up.',
    sessionId:   'sess-001',
    promptCount: 5,
  };
}

function insertAdvisory(store: Store, projectRoot = '/test/project') {
  const mgr = SessionStateManager.load(store, projectRoot);
  mgr.setDetectedLanguage(store, undefined); // persist session to DB so runStop finds same UUID
  upsertPendingAdvisory(store, { ...makeAdvisory(projectRoot), sessionId: mgr.current.sessionId });
}

async function insertPendingPe(store: Store, projectRoot = '/test/project') {
  const session = SessionStateManager.load(store, projectRoot);
  session.setDetectedLanguage(store, undefined); // persist session to DB so runStop finds the same UUID (matches insertAdvisory)
  const request = buildPromptEnhancementRequestForAuto({
    auto: { promptText: 'implement the login flow', projectRoot, currentAgentMode: 'workspace-write' },
    store,
    session,
    project: null,
    effectiveLanguage: 'en',
    configuredRole: null,
    effectiveFlagType: 'stage_transition',
    firedKey: 'stage_transition:idea→implementation',
    previousStage: 'idea',
    trigger: { kind: 'stage_transition' },
    stageResult: {
      classification: { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} },
      signalsPresent: [], signalsAbsent: [], fireRecommendation: true,
      selectedSignalKey: '', reason: 'test', degraded: false,
    },
    streamBOutputs: [],
  });
  const result = await preparePromptEnhancement(request);
  upsertPendingPromptEnhancement(store, { projectRoot, sessionId: session.current.sessionId, promptCount: 5, request, result });
}

// Owner decision B-i: the deferred PE popup is shown on the Stop hook, before the advisory.
describe('runStop — deferred Prompt Enhancement popup (B-i)', () => {
  let store: Store;
  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  const inject = (text: string): PromptEnhancementStopLaunchFn => vi.fn().mockResolvedValue({ kind: 'inject', text });
  const shown = (): PromptEnhancementStopLaunchFn => vi.fn().mockResolvedValue({ kind: 'shown' });
  const notShown = (): PromptEnhancementStopLaunchFn => vi.fn().mockResolvedValue({ kind: 'not_shown' });

  it('injects the enhanced prompt as a new turn when the user picks Use enhanced', async () => {
    await insertPendingPe(store);
    const result = await runStop(makePayload(), store, undefined, undefined, undefined, inject('ENHANCED PROMPT BODY'));
    expect(result).toEqual({ outcome: 'blocked', reason: 'ENHANCED PROMPT BODY' });
  });

  it('marks the pending PE shown so a Stop re-fire does not re-show it', async () => {
    await insertPendingPe(store);
    await runStop(makePayload(), store, undefined, undefined, undefined, inject('BODY'));
    expect(getPendingPromptEnhancement(store, '/test/project')).toBeNull();
  });

  it('arms the injected-prompt echo guard so the enhanced turn does not re-trigger a PE', async () => {
    await insertPendingPe(store);
    await runStop(makePayload(), store, undefined, undefined, undefined, inject('ENHANCED BODY TEXT'));
    // The enhanced body is recorded as the last injected prompt; auto's -1 guard uses it to skip.
    expect(SessionStateManager.load(store, '/test/project').current.lastInjectedPrompt).toBe('ENHANCED BODY TEXT');
  });

  it('returns prompt_enhancement_shown when the popup shows but nothing is sent', async () => {
    await insertPendingPe(store);
    const result = await runStop(makePayload(), store, undefined, undefined, undefined, shown());
    expect(result).toEqual({ outcome: 'prompt_enhancement_shown' });
  });

  it('falls through to the advisory path when no PE host is available', async () => {
    await insertPendingPe(store); // pending PE exists, but the host cannot show it
    // No advisory seeded → falling through reaches the advisory lookup and finds nothing.
    const result = await runStop(makePayload(), store, undefined, undefined, undefined, notShown());
    expect(result).toEqual({ outcome: 'no_pending' });
  });

  // Popup cooldown (prompt_enhancement.popup_cooldown, default 3): after a PE/MPS-1 popup is shown,
  // new ones are suppressed for N prompts. The first popup always shows.
  it('popup cooldown: the FIRST popup always shows (no prior popup this session)', async () => {
    await insertPendingPe(store); // lastPromptEnhancementPromptIndex defaults to -1 → not in cooldown
    const launch = inject('ENHANCED FIRST');
    const result = await runStop(makePayload(), store, undefined, undefined, undefined, launch);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ outcome: 'blocked', reason: 'ENHANCED FIRST' });
  });

  it('popup cooldown: a NEW popup within the cooldown is SUPPRESSED — never launched, record consumed', async () => {
    await insertPendingPe(store);
    // A popup was just shown this prompt → cooldown active (default 3, promptCount unchanged).
    SessionStateManager.load(store, '/test/project').markPromptEnhancementPopupShown(store);
    const launch = inject('SHOULD NOT SHOW');
    const result = await runStop(makePayload(), store, undefined, undefined, undefined, launch);
    expect(launch).not.toHaveBeenCalled();                                       // suppressed
    expect(getPendingPromptEnhancement(store, '/test/project')).toBeNull();      // consumed, no lingering
    expect(result).toEqual({ outcome: 'no_pending' });
  });

  it('popup cooldown = 0 disables suppression (popup shows even right after one)', async () => {
    setConfig(store, 'prompt_enhancement.popup_cooldown', '0');
    await insertPendingPe(store);
    SessionStateManager.load(store, '/test/project').markPromptEnhancementPopupShown(store);
    const launch = inject('SHOWS ANYWAY');
    const result = await runStop(makePayload(), store, undefined, undefined, undefined, launch);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ outcome: 'blocked', reason: 'SHOWS ANYWAY' });
  });

  // MPS continuation launcher (P3, fail-closed) — an active pending-sequence row must NOT open a
  // popup, advance, or mutate while the runtime gate is closed. Proves the launcher is inert.
  // MPS-6: the continuation Stop is the `stop_hook_active` event (a sequence delivers each item by
  // blocking the Stop). It is EXEMPTED from the loop guard and routed to the fail-closed launcher.
  it('fail-closed continuation launcher: an active sequence row is read but never advanced/mutated/rendered', async () => {
    const session = SessionStateManager.load(store, '/test/project');
    session.setDetectedLanguage(store, undefined);
    upsertPendingPromptSequence(store, {
      sequenceId: 'seq-x', enhancementId: 'enh-x', projectRoot: '/test/project',
      sessionId: session.current.sessionId, itemCount: 3, currentItemIndex: 1,
      status: 'item_pending', lastActionId: 'prev',
    }, emptyPromptEnhancementSequencePayloadV1(64));
    // The active sequence caused this Stop (stop_hook_active) → exempted from the loop guard, routed to
    // the launcher, which is fail-closed in v1.
    const result = await runStop(makePayload({ stop_hook_active: true }), store, undefined, undefined, undefined, notShown());
    expect(result).toEqual({ outcome: 'mps_continuation_gated' });
    // The row is left EXACTLY as-is: no advance, no status change, no scrub (fail-closed).
    const after = getActivePendingPromptSequence(store, '/test/project', session.current.sessionId);
    expect(after).toMatchObject({ currentItemIndex: 1, status: 'item_pending', lastActionId: 'prev' });
  });

  // Phase 5 (interruption resume) — after "I need to do something else first" the row is left
  // `item_pending` WITHOUT blocking, so the next Stop is NOT stop_hook_active and the top launcher
  // never runs. A second entry point on the ordinary (non-stop_hook_active) path re-offers the held
  // item once the user's own turn resolves without blocking. In tests there is no host, so the launcher
  // is gated → the row is left untouched (a re-offer, never an advance). These lock that routing.
  const seedInterruptedSequence = (
    store: Store,
    status: 'item_pending' | 'awaiting_response',
    sessionId: string,
  ): void => {
    upsertPendingPromptSequence(store, {
      sequenceId: 'seq-i', enhancementId: 'enh-i', projectRoot: '/test/project',
      sessionId, itemCount: 3, currentItemIndex: 1, status, lastActionId: 'prev',
    }, emptyPromptEnhancementSequencePayloadV1(64));
  };

  it('resumes a held (item_pending) item on a non-stop_hook_active Stop with no pending PE', async () => {
    const session = SessionStateManager.load(store, '/test/project');
    session.setDetectedLanguage(store, undefined);
    seedInterruptedSequence(store, 'item_pending', session.current.sessionId);
    // Not stop_hook_active + no pending PE → before Phase 5 this returned 'no_pending'. Now it re-offers.
    const result = await runStop(makePayload({ stop_hook_active: false }), store, undefined, undefined, undefined, notShown());
    expect(result).toEqual({ outcome: 'mps_continuation_gated' });
    // Re-offer, NOT advance: the row stays item_pending at the SAME index, unmutated.
    const after = getActivePendingPromptSequence(store, '/test/project', session.current.sessionId);
    expect(after).toMatchObject({ currentItemIndex: 1, status: 'item_pending', lastActionId: 'prev' });
  });

  it('does NOT resume an awaiting_response sequence on a non-stop_hook_active Stop (that belongs to the top launcher)', async () => {
    const session = SessionStateManager.load(store, '/test/project');
    session.setDetectedLanguage(store, undefined);
    seedInterruptedSequence(store, 'awaiting_response', session.current.sessionId);
    const result = await runStop(makePayload({ stop_hook_active: false }), store, undefined, undefined, undefined, notShown());
    expect(result).toEqual({ outcome: 'no_pending' });
    // Left completely untouched — mid-delivery sequences are the stop_hook_active launcher's job.
    const after = getActivePendingPromptSequence(store, '/test/project', session.current.sessionId);
    expect(after).toMatchObject({ currentItemIndex: 1, status: 'awaiting_response', lastActionId: 'prev' });
  });

  it('resumes the held item after the "something else" PE is closed with use-original (shown)', async () => {
    await insertPendingPe(store); // the user's "something else" prompt, awaiting its deferred PE popup
    const session = SessionStateManager.load(store, '/test/project');
    seedInterruptedSequence(store, 'item_pending', session.current.sessionId);
    // PE popup shows and is closed without sending → no block → the held item returns this Stop.
    const result = await runStop(makePayload({ stop_hook_active: false }), store, undefined, undefined, undefined, shown());
    expect(result).toEqual({ outcome: 'mps_continuation_gated' });
  });

  it('does NOT double-fire when the "something else" PE is SENT — it blocks, and the next stop_hook_active Stop re-offers', async () => {
    await insertPendingPe(store);
    const session = SessionStateManager.load(store, '/test/project');
    seedInterruptedSequence(store, 'item_pending', session.current.sessionId);
    // Send enhanced → inject → block. The resume must NOT also fire this Stop (the block arms the next one).
    const result = await runStop(makePayload({ stop_hook_active: false }), store, undefined, undefined, undefined, inject('SOMETHING ELSE ENHANCED'));
    expect(result).toEqual({ outcome: 'blocked', reason: 'SOMETHING ELSE ENHANCED' });
    // The held item is untouched — it re-offers on the NEXT (stop_hook_active) Stop via the top launcher.
    const after = getActivePendingPromptSequence(store, '/test/project', session.current.sessionId);
    expect(after).toMatchObject({ currentItemIndex: 1, status: 'item_pending', lastActionId: 'prev' });
  });

  // MPS-11 sub-phase 1a: the fail-closed launcher must log the FULL missing-gate list + its count, not a
  // silent slice(0, 4) — so a debugger can tell how many gates are missing, not just the first four.
  it('fail-closed continuation launcher: logs the full missing-gate count, not a truncated four', async () => {
    const session = SessionStateManager.load(store, '/test/project');
    session.setDetectedLanguage(store, undefined);
    upsertPendingPromptSequence(store, {
      sequenceId: 'seq-log', enhancementId: 'enh-log', projectRoot: '/test/project',
      sessionId: session.current.sessionId, itemCount: 3, currentItemIndex: 1,
      status: 'item_pending', lastActionId: 'prev',
    }, emptyPromptEnhancementSequencePayloadV1(64));
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    try {
      // The continuation Stop is the stop_hook_active event (MPS-6).
      await runStop(makePayload({ stop_hook_active: true }), store, undefined, undefined, undefined, notShown());
      const call = debugSpy.mock.calls.find(([message]) => message === 'stop_mps_continuation_gate');
      expect(call).toBeDefined();
      const logged = call![1] as { missingGateCodeCount: number; missingGateCodes: readonly string[] };
      // The full list is logged with no silent slice — count equals the array length.
      expect(logged.missingGateCodes.length).toBe(logged.missingGateCodeCount);
      // UN-GATED (owner sign-off): the acceptance-oracle flag is passed in code, so it is NEVER in the
      // missing list. (This env has no OPENAI_API_KEY, so the PROVIDER flag is missing and the gate stays
      // fail-closed HERE on a REAL flag — as designed; production resolves a key and it is not.)
      expect(logged.missingGateCodes).not.toContain('focused_runtime_fixtures_pending');
      // The truncating `reasonCodes` field must no longer exist.
      expect(logged).not.toHaveProperty('reasonCodes');
    } finally {
      debugSpy.mockRestore();
    }
  });

  // UN-GATED (owner sign-off 2026-08-17): the acceptance-oracle flag is passed in code, so it is NEVER the
  // blocker. The gate still fails closed on the OTHER, REAL flags — e.g. provider availability. This env has
  // no OPENAI_API_KEY, so the provider flag is missing and the gate stays closed HERE on that real flag,
  // never on the un-gated sign-off. On a real machine with the key, every flag is satisfied → allowed:true.
  it('the gate stays fail-closed on a REAL missing flag (provider), never on the un-gated sign-off flag', async () => {
    const session = SessionStateManager.load(store, '/test/project');
    session.setDetectedLanguage(store, undefined);
    upsertPendingPromptSequence(store, {
      sequenceId: 'seq-1b', enhancementId: 'enh-1b', projectRoot: '/test/project',
      sessionId: session.current.sessionId, itemCount: 4, currentItemIndex: 2,
      status: 'item_pending', lastActionId: 'prev',
    }, emptyPromptEnhancementSequencePayloadV1(64));
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    try {
      const result = await runStop(makePayload({ stop_hook_active: true }), store, undefined, undefined, undefined, notShown());
      expect(result).toEqual({ outcome: 'mps_continuation_gated' });
      const call = debugSpy.mock.calls.find(([message]) => message === 'stop_mps_continuation_gate');
      expect(call).toBeDefined();
      const logged = call![1] as { allowed: boolean; missingGateCodes: readonly string[] };
      // Still fail-closed here — but on a REAL flag (no provider key), not the un-gated sign-off.
      expect(logged.allowed).toBe(false);
      expect(logged.missingGateCodes).not.toContain('focused_runtime_fixtures_pending');
      expect(logged.missingGateCodes).toContain('provider_api_availability_pending');
    } finally {
      debugSpy.mockRestore();
    }
    // And, as always, the row is left exactly as-is — no advance/mutation on this event.
    const after = getActivePendingPromptSequence(store, '/test/project', session.current.sessionId);
    expect(after).toMatchObject({ currentItemIndex: 2, status: 'item_pending', lastActionId: 'prev' });
  });

  it('the continuation gate is UN-GATED (owner sign-off) — `focused_runtime_fixtures_pending` is never the blocker, with NO env var', async () => {
    const session = SessionStateManager.load(store, '/test/project');
    session.setDetectedLanguage(store, undefined);
    upsertPendingPromptSequence(store, {
      sequenceId: 'seq-ung', enhancementId: 'enh-ung', projectRoot: '/test/project',
      sessionId: session.current.sessionId, itemCount: 3, currentItemIndex: 1,
      status: 'item_pending', lastActionId: 'prev',
    }, emptyPromptEnhancementSequencePayloadV1(64));
    const debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    const prev = process.env['NEXPATH_MPS_TEST_UNGATE'];
    try {
      // Un-gated: the acceptance-oracle flag is recorded as passed IN CODE (owner sign-off 2026-08-17), so
      // it is NEVER the blocker — with or without any env var. The `NEXPATH_MPS_TEST_UNGATE` dependency is
      // removed; a real user needs no command. (This no-key test env still misses the PROVIDER flag, so the
      // gate stays fail-closed HERE; on a real machine with the key present, every flag is satisfied and the
      // gate is allowed:true — the popup renders with no command.)
      delete process.env['NEXPATH_MPS_TEST_UNGATE'];
      await runStop(makePayload({ stop_hook_active: true }), store, undefined, undefined, undefined, notShown());
      const gate = debugSpy.mock.calls.filter(([m]) => m === 'stop_mps_continuation_gate').pop();
      expect((gate![1] as { missingGateCodes: readonly string[] }).missingGateCodes)
        .not.toContain('focused_runtime_fixtures_pending');
    } finally {
      if (prev === undefined) delete process.env['NEXPATH_MPS_TEST_UNGATE']; else process.env['NEXPATH_MPS_TEST_UNGATE'] = prev;
      debugSpy.mockRestore();
    }
  });

  // MPS-6: on a sequence-continuation Stop, ONLY the launcher runs — the pending-PE popup, the advisory,
  // and the standalone feedback popup all stay closed on that event (and nothing is consumed).
  it('sequence-continuation Stop suppresses the PE popup and the advisory (routes only to the launcher)', async () => {
    const session = SessionStateManager.load(store, '/test/project');
    session.setDetectedLanguage(store, undefined);
    upsertPendingPromptSequence(store, {
      sequenceId: 'seq-supp', enhancementId: 'enh-supp', projectRoot: '/test/project',
      sessionId: session.current.sessionId, itemCount: 3, currentItemIndex: 1,
      status: 'item_pending', lastActionId: 'prev',
    }, emptyPromptEnhancementSequencePayloadV1(64));
    // A pending PE AND a pending advisory both exist — neither may open on the continuation event.
    await insertPendingPe(store);
    insertAdvisory(store);
    const peLaunch = notShown(); // spy — must NOT be called on a sequence-continuation Stop
    const result = await runStop(makePayload({ stop_hook_active: true }), store, undefined, undefined, undefined, peLaunch);
    expect(result).toEqual({ outcome: 'mps_continuation_gated' });
    expect(peLaunch).not.toHaveBeenCalled();                                      // PE popup suppressed
    expect(getPendingPromptEnhancement(store, '/test/project')).not.toBeNull();   // PE not consumed
    expect(getPendingAdvisory(store, '/test/project')).not.toBeNull();            // advisory not consumed
  });

  it('leaves the pending PE PENDING on not_shown so a later Stop can retry it (Bug 2 — no silent loss)', async () => {
    await insertPendingPe(store);
    // Host could not display it this turn (e.g. an unsupported platform → not_shown).
    await runStop(makePayload(), store, undefined, undefined, undefined, notShown());
    // The record must NOT be consumed — a working host on a later Stop can still show it.
    expect(getPendingPromptEnhancement(store, '/test/project')).not.toBeNull();
  });

  it('consumes the pending PE only after it was actually shown (Bug 2 — mark after launch)', async () => {
    await insertPendingPe(store);
    await runStop(makePayload(), store, undefined, undefined, undefined, shown());
    // Displayed → consumed so a Stop re-fire cannot re-show it.
    expect(getPendingPromptEnhancement(store, '/test/project')).toBeNull();
  });

  it('ignores a pending PE queued under a different session (Bug 4 — session-scoped lookup)', async () => {
    await insertPendingPe(store);
    // Re-point the stored PE to a foreign session id, as if it were queued in an unrelated session.
    store.db.run("UPDATE pending_prompt_enhancements SET session_id = 'sess-unrelated-xyz'");
    const launch = notShown(); // spy — must NOT run for a foreign-session PE
    const result = await runStop(makePayload(), store, undefined, undefined, undefined, launch);
    expect(launch).not.toHaveBeenCalled();
    expect(result).toEqual({ outcome: 'no_pending' });
  });

  it('takes priority over the advisory (one popup per Stop): PE injects, advisory stays pending', async () => {
    await insertPendingPe(store);
    insertAdvisory(store);
    const result = await runStop(makePayload(), store, undefined, undefined, undefined, inject('ENH'));
    expect(result).toEqual({ outcome: 'blocked', reason: 'ENH' });
    // The advisory was not consumed this turn — it remains for a later Stop.
    expect(getPendingAdvisory(store, '/test/project')).not.toBeNull();
  });

  it('does not show the PE popup when no launcher is wired (default runStop)', async () => {
    await insertPendingPe(store);
    // No peLaunch arg → PE step skipped; with no advisory, outcome is no_pending.
    const result = await runStop(makePayload(), store);
    expect(result).toEqual({ outcome: 'no_pending' });
    // The pending PE is untouched (not consumed) when there is no launcher.
    expect(getPendingPromptEnhancement(store, '/test/project')).not.toBeNull();
  });
});

// ── runStop — loop guard ──────────────────────────────────────────────────────

describe('runStop — loop guard', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('returns loop_guard when stop_hook_active is true', async () => {
    const result = await runStop(makePayload({ stop_hook_active: true }), store);
    expect(result.outcome).toBe('loop_guard');
  });

  it('stop_hook_active with no active sequence still loop-guards and leaves the advisory (MPS-6: the DB is read only for the sequence check)', async () => {
    // MPS-6 reads the DB on a stop_hook_active event to look up an active sequence (the exemption
    // evidence). With no sequence, the loop guard still fires and no other side effect runs — the
    // pending advisory is neither opened nor consumed.
    insertAdvisory(store);
    const result = await runStop(makePayload({ stop_hook_active: true }), store);
    expect(result.outcome).toBe('loop_guard');
    const advisory = getPendingAdvisory(store, '/test/project');
    expect(advisory).not.toBeNull();
  });
});

// ── runStop — no pending advisory ─────────────────────────────────────────────

describe('runStop — no pending advisory', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('returns no_pending when DB has no advisory for this project', async () => {
    const result = await runStop(makePayload(), store);
    expect(result.outcome).toBe('no_pending');
  });

  it('returns no_pending after advisory has been marked shown', async () => {
    insertAdvisory(store);
    // First call marks it shown (MPS-7: consumed silently, not rendered)
    await runStop(makePayload(), store);
    // Second call: advisory is now 'shown', not 'pending'
    const result = await runStop(makePayload(), store);
    expect(result.outcome).toBe('no_pending');
  });

  it('returns no_pending when advisory session_id does not match current session (cross-session guard)', async () => {
    // makeAdvisory() uses hardcoded sessionId 'sess-001'; runStop loads a fresh session with a different UUID
    upsertPendingAdvisory(store, makeAdvisory());
    const result = await runStop(makePayload(), store);
    expect(result.outcome).toBe('no_pending');
  });
});

// ── runStop — MPS-7: the old DS advisory popup is disabled outright ────────────

describe('runStop — MPS-7 advisory disabled', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('a pending advisory is consumed silently and never rendered (no popup, no selectFn consulted)', async () => {
    insertAdvisory(store);
    // No selectFn is passed — the old Decision-Session popup path is gone, so none is ever consulted.
    const result = await runStop(makePayload(), store);
    expect(result.outcome).toBe('advisory_disabled');
  });

  it('consumes the advisory so it never re-queues (marked shown; a later Stop finds nothing)', async () => {
    insertAdvisory(store);
    expect((await runStop(makePayload(), store)).outcome).toBe('advisory_disabled');
    // The row was marked shown by the disable path — the next Stop sees no pending advisory.
    expect((await runStop(makePayload(), store)).outcome).toBe('no_pending');
  });

  it('never returns a rendered advisory outcome (blocked / clipboard_only / skipped)', async () => {
    insertAdvisory(store);
    const result = await runStop(makePayload(), store);
    expect(['blocked', 'clipboard_only', 'skipped']).not.toContain(result.outcome);
  });
});

// ── runStop — advisory isolation per project ──────────────────────────────────

describe('runStop — project isolation', () => {
  let store: Store;

  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('does not trigger for a different project root', async () => {
    insertAdvisory(store, '/test/project-a');
    const result = await runStop(makePayload({ cwd: '/test/project-b' }), store);
    expect(result.outcome).toBe('no_pending');
  });

  it('finds the correct project root advisory (now disabled: consumed, not rendered)', async () => {
    insertAdvisory(store, '/test/project-a');
    insertAdvisory(store, '/test/project-b');
    const result = await runStop(makePayload({ cwd: '/test/project-a' }), store);
    expect(result.outcome).toBe('advisory_disabled');
  });
});

// ── Stop hook output format ───────────────────────────────────────────────────

describe('Stop hook output format', () => {
  it('blocked JSON has correct shape for Claude Code Stop hook', () => {
    const reason = 'write tests before shipping';
    const output = JSON.stringify({ decision: 'block', reason });
    const parsed = JSON.parse(output) as { decision: string; reason: string };
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toBe(reason);
  });
});

// ── runStop — language detection (step 1.5) ───────────────────────────────────

describe('runStop — language detection', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    upsertProject(store, { projectRoot: '/test/project', name: 'Test' });
  });
  afterEach(() => { store.db.close(); });

  it('does not update detected_language when fewer than LANG_DETECT_INTERVAL prompts exist', async () => {
    // Insert LANG_DETECT_INTERVAL - 1 prompts (threshold not met)
    for (let i = 0; i < LANG_DETECT_INTERVAL - 1; i++) {
      insertPrompt(store, { projectRoot: '/test/project', promptText: 'I want to add a feature' });
    }
    await runStop(makePayload(), store);
    const proj = getProject(store, '/test/project');
    expect(proj?.detectedLanguage).toBeNull(); // detection did not fire
  });

  it('updates detected_language when >= LANG_DETECT_INTERVAL prompts exist', async () => {
    // Insert enough English prompts to meet the threshold
    const englishPrompt = 'I want to add a login page so users can reset their password and access settings';
    for (let i = 0; i < LANG_DETECT_INTERVAL; i++) {
      insertPrompt(store, { projectRoot: '/test/project', promptText: englishPrompt });
    }
    await runStop(makePayload(), store);
    const proj = getProject(store, '/test/project');
    // Detection ran — detectedLanguage should be set (may be 'en' or whatever tinyld returns)
    // We only assert it is no longer null (detection fired)
    expect(proj?.detectedLanguage).not.toBeNull();
  });

  it('detection fires even when no advisory is pending (outcome no_pending)', async () => {
    const englishPrompt = 'I want to add a login page so users can reset their password';
    for (let i = 0; i < LANG_DETECT_INTERVAL; i++) {
      insertPrompt(store, { projectRoot: '/test/project', promptText: englishPrompt });
    }
    // No advisory upserted → outcome should be no_pending
    const result = await runStop(makePayload(), store);
    expect(result.outcome).toBe('no_pending');
    // Detection still fired
    const proj = getProject(store, '/test/project');
    expect(proj?.detectedLanguage).not.toBeNull();
  });

  it('detection does NOT fire when stop_hook_active is true (loop guard exits first)', async () => {
    const englishPrompt = 'I want to add a login page so users can reset their password';
    for (let i = 0; i < LANG_DETECT_INTERVAL; i++) {
      insertPrompt(store, { projectRoot: '/test/project', promptText: englishPrompt });
    }
    const result = await runStop(makePayload({ stop_hook_active: true }), store);
    expect(result.outcome).toBe('loop_guard');
    // Loop guard exited before step 1.5 — detected_language stays null
    const proj = getProject(store, '/test/project');
    expect(proj?.detectedLanguage).toBeNull();
  });
});

// ── runStop — telemetry events ────────────────────────────────────────────────

describe('runStop — telemetry events', () => {
  let store: Store;

  beforeEach(async () => {
    store = await openStore(':memory:');
    vi.mocked(writeTelemetry).mockClear();
  });
  afterEach(() => {
    store.db.close();
    vi.restoreAllMocks();
  });

  it('emits stop_no_pending when no advisory is queued', async () => {
    await runStop(makePayload(), store);
    expect(writeTelemetry).toHaveBeenCalledWith('/test/project', 'stop_no_pending', undefined, expect.anything());
  });

  it('does not emit stop_no_pending when an advisory is present', async () => {
    insertAdvisory(store);
    await runStop(makePayload(), store);
    const calls = vi.mocked(writeTelemetry).mock.calls;
    expect(calls.some(([, evt]) => evt === 'stop_no_pending')).toBe(false);
  });

  it('emits language_detected when >= LANG_DETECT_INTERVAL prompts exist', async () => {
    upsertProject(store, { projectRoot: '/test/project', name: 'Test' });
    const englishPrompt = 'I want to add a login page so users can reset their password and access settings';
    for (let i = 0; i < LANG_DETECT_INTERVAL; i++) {
      insertPrompt(store, { projectRoot: '/test/project', promptText: englishPrompt });
    }
    await runStop(makePayload(), store);
    expect(writeTelemetry).toHaveBeenCalledWith(
      '/test/project',
      'language_detected',
      expect.objectContaining({ detectedLanguage: expect.anything() }),
      expect.anything(),
    );
  });

  it('does not emit language_detected when below LANG_DETECT_INTERVAL prompts', async () => {
    upsertProject(store, { projectRoot: '/test/project', name: 'Test' });
    for (let i = 0; i < LANG_DETECT_INTERVAL - 1; i++) {
      insertPrompt(store, { projectRoot: '/test/project', promptText: 'Add a feature' });
    }
    await runStop(makePayload(), store);
    const calls = vi.mocked(writeTelemetry).mock.calls;
    expect(calls.some(([, evt]) => evt === 'language_detected')).toBe(false);
  });
});

// ── MPS-4 (12.1): sequence-offer disposition mapping ──────────────────────────

describe('runStop — MPS-4 offer-disposition mapping (12.1)', () => {
  it('maps Use-original → rejected, close/Escape → not_engaged (the two non-accepted stub states)', () => {
    expect(promptEnhancementMpsOfferDispositionFromPopupV1({ state: 'selected_original' })).toBe('rejected');
    expect(promptEnhancementMpsOfferDispositionFromPopupV1({ state: 'closed_no_send' })).toBe('not_engaged');
  });

  it('records NO stub for accepted (selected_current) or a not-shown popup — accepted is the intake full row', () => {
    // selected_current is accepted (the intake writes the full row on send — no stub here).
    expect(promptEnhancementMpsOfferDispositionFromPopupV1({ state: 'selected_current', bodyText: 'x' })).toBeUndefined();
    // not_shown is no offer at all.
    expect(promptEnhancementMpsOfferDispositionFromPopupV1({ state: 'not_shown', reasonCodes: [] })).toBeUndefined();
  });
});

// ── MPS-4 (12.1): the wiring writes the stub to the store ─────────────────────

describe('recordPromptEnhancementMpsSequenceOfferDispositionV1 — 12.1 wiring (writes to the store)', () => {
  const PROJ = '/test/project';
  let store: Store;
  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  // A compound prompt whose result carries the sequence handoff (only the fields the writer reads).
  const compound = (): PendingPromptEnhancement => ({
    sessionId: 'sess-1',
    result: { enhancementId: 'enh-1', uiView: { handoffAndSequenceSummary: { handoffDecisionId: 'seq-1' } } },
  } as unknown as PendingPromptEnhancement);

  const popup = (state: PromptEnhancementCliPopupResultV1['state']): PromptEnhancementCliPopupResultV1 =>
    (state === 'selected_current' ? { state, bodyText: 'x' }
      : state === 'not_shown' ? { state, reasonCodes: [] }
      : { state }) as PromptEnhancementCliPopupResultV1;

  const rows = () => (store.db.exec('SELECT COUNT(*) FROM pending_prompt_sequences')[0]?.values[0][0] ?? 0) as number;

  it('Use original → writes a rejected stub; close/Escape → not_engaged; both readable, neither active', () => {
    expect(recordPromptEnhancementMpsSequenceOfferDispositionV1(store, compound(), popup('selected_original'), PROJ)).toBe('rejected');
    expect(getPromptEnhancementSequenceOfferDisposition(store, PROJ, 'seq-1')).toBe('rejected');
    // The stub is terminal (cancelled) — never picked up as an active sequence.
    expect(getActivePendingPromptSequence(store, PROJ, 'sess-1')).toBeNull();
  });

  it('close/Escape → writes a not_engaged stub', () => {
    expect(recordPromptEnhancementMpsSequenceOfferDispositionV1(store, compound(), popup('closed_no_send'), PROJ)).toBe('not_engaged');
    expect(getPromptEnhancementSequenceOfferDisposition(store, PROJ, 'seq-1')).toBe('not_engaged');
  });

  it('accepted (selected_current) and not_shown write NOTHING — accepted is the intake full row', () => {
    expect(recordPromptEnhancementMpsSequenceOfferDispositionV1(store, compound(), popup('selected_current'), PROJ)).toBeUndefined();
    expect(recordPromptEnhancementMpsSequenceOfferDispositionV1(store, compound(), popup('not_shown'), PROJ)).toBeUndefined();
    expect(rows()).toBe(0);
    expect(getPromptEnhancementSequenceOfferDisposition(store, PROJ, 'seq-1')).toBeNull();
  });

  it('a non-compound prompt (no sequence handoff) writes nothing whatever the state', () => {
    const plain = { sessionId: 'sess-1', result: { enhancementId: 'enh-1', uiView: {} } } as unknown as PendingPromptEnhancement;
    expect(recordPromptEnhancementMpsSequenceOfferDispositionV1(store, plain, popup('selected_original'), PROJ)).toBeUndefined();
    expect(rows()).toBe(0);
  });

  it('offer_disposition is written once — a second matching write is idempotent, no duplicate row', () => {
    recordPromptEnhancementMpsSequenceOfferDispositionV1(store, compound(), popup('selected_original'), PROJ);
    recordPromptEnhancementMpsSequenceOfferDispositionV1(store, compound(), popup('selected_original'), PROJ);
    expect(getPromptEnhancementSequenceOfferDisposition(store, PROJ, 'seq-1')).toBe('rejected');
    expect(rows()).toBe(1);
  });
});

describe('persistPromptEnhancementSequenceContinuationCancelV1 — 6.5 §5b destructive-trap guard', () => {
  const PROJ = '/test/project';
  let store: Store;
  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  const projRows = () => (store.db.exec(`SELECT COUNT(*) FROM pending_prompt_sequences WHERE project_root = '${PROJ}'`)[0]?.values[0][0] ?? 0) as number;
  const col = (sequenceId: string, column: string) =>
    (store.db.exec(`SELECT ${column} FROM pending_prompt_sequences WHERE sequence_id = '${sequenceId}'`)[0]?.values[0]?.[0] ?? null);

  const acceptedActive = () => ({
    sequenceId: 'seq-x', enhancementId: 'enh-x', projectRoot: PROJ, sessionId: 'sess-1',
    itemCount: 3, currentItemIndex: 1, status: 'item_pending' as const, lastActionId: 'prev',
  });

  // A valid terminal cancelled state (the mapper's cancel_sequence output the launcher would pass in).
  const cancelledState = () => {
    const applied = applyPromptEnhancementSequenceRuntimeActionV1(acceptedActive(), { type: 'cancel_sequence', actionId: 'c1' });
    if (!applied.ok) throw new Error('cancel_sequence invalid in fixture');
    return applied.state;
  };

  it('cancel moves the ONE accepted row to terminal cancelled via the writer — a declined stub SURVIVES (no project-wide delete)', () => {
    upsertPendingPromptSequence(store, acceptedActive(), emptyPromptEnhancementSequencePayloadV1(64));
    // A coexisting MPS-4 declined-offer stub for the SAME project — a project-wide delete would wipe it too.
    recordPromptEnhancementSequenceOfferDeclined(store, { projectRoot: PROJ, sessionId: 'sess-1', sequenceId: 'seq-declined', enhancementId: 'enh-d', disposition: 'not_engaged' });
    expect(projRows()).toBe(2);

    const active = getActivePendingPromptSequence(store, PROJ, 'sess-1');
    expect(active).not.toBeNull();
    expect(persistPromptEnhancementSequenceContinuationCancelV1(store, active!.id, cancelledState())).toEqual({ outcome: 'cancelled' });

    // The accepted row is UPDATED to cancelled (still present), not deleted…
    expect(col('seq-x', 'status')).toBe('cancelled');
    // …and §6a holds — offer_disposition is untouched.
    expect(col('seq-x', 'offer_disposition')).toBe('accepted');
    // ⛔ The project-wide delete was NOT used: BOTH rows survive (it would have wiped every row for PROJ).
    expect(projRows()).toBe(2);
    expect(col('seq-declined', 'offer_disposition')).toBe('not_engaged');
  });

  it('writer false when the row is GONE → fall_through (ordinary flow, never throws)', () => {
    expect(() => persistPromptEnhancementSequenceContinuationCancelV1(store, 999999, cancelledState())).not.toThrow();
    expect(persistPromptEnhancementSequenceContinuationCancelV1(store, 999999, cancelledState())).toEqual({ outcome: 'fall_through' });
  });

  it('writer false when the row is NOT accepted (a declined stub) → fall_through — a stub is never resurrected into a cancel', () => {
    recordPromptEnhancementSequenceOfferDeclined(store, { projectRoot: PROJ, sessionId: 'sess-1', sequenceId: 'seq-declined', enhancementId: 'enh-d', disposition: 'rejected' });
    const stubId = col('seq-declined', 'id') as number | null;
    expect(stubId).not.toBeNull();
    expect(persistPromptEnhancementSequenceContinuationCancelV1(store, stubId!, cancelledState())).toEqual({ outcome: 'fall_through' });
    // The stub is left exactly as it was — offer_disposition unchanged, row still present.
    expect(col('seq-declined', 'offer_disposition')).toBe('rejected');
    expect(projRows()).toBe(1);
  });
});

// ── Phase 1 — the session budget is charged at the moment a popup is SHOWN ────
//
// The auto hook writes the keys to charge with the pending row; the Stop hook spends them only when
// the popup actually reaches the user. A row that is prepared and never displayed costs nothing, which
// is what stops a discarded popup from silencing its own signal for the rest of the session.

describe('runStop — shown-popup budget charge (Phase 1)', () => {
  let store: Store;
  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  const inject = (text: string): PromptEnhancementStopLaunchFn => vi.fn().mockResolvedValue({ kind: 'inject', text });
  const shown = (): PromptEnhancementStopLaunchFn => vi.fn().mockResolvedValue({ kind: 'shown' });
  const notShown = (): PromptEnhancementStopLaunchFn => vi.fn().mockResolvedValue({ kind: 'not_shown' });

  /** The key the pending-PE fixture carries — what the charge must record. */
  const FIXTURE_KEY = 'stage_transition:idea→implementation';

  it('charges on the inject path (Use enhanced)', async () => {
    await insertPendingPe(store);
    await runStop(makePayload(), store, undefined, undefined, undefined, inject('ENHANCED BODY'));
    const mgr = SessionStateManager.load(store, '/test/project');
    expect(mgr.current.shownPopupCount).toBe(1);
    expect(mgr.hasShownAdvisoryKeyV1(FIXTURE_KEY)).toBe(true);
  });

  it('charges on the shown path too — dismiss and use-original still mean the user saw the guidance', async () => {
    await insertPendingPe(store);
    await runStop(makePayload(), store, undefined, undefined, undefined, shown());
    const mgr = SessionStateManager.load(store, '/test/project');
    expect(mgr.current.shownPopupCount).toBe(1);
    expect(mgr.hasShownAdvisoryKeyV1(FIXTURE_KEY)).toBe(true);
  });

  it('charges nothing when no host could display it (not_shown) — the row stays pending', async () => {
    await insertPendingPe(store);
    await runStop(makePayload(), store, undefined, undefined, undefined, notShown());
    const mgr = SessionStateManager.load(store, '/test/project');
    expect(mgr.current.shownPopupCount).toBe(0);
    expect(mgr.current.shownAdvisoryKeys).toEqual([]);
    expect(getPendingPromptEnhancement(store, '/test/project')).not.toBeNull();
  });

  it('charges nothing when the popup cooldown suppresses it — the key stays spendable later', async () => {
    await insertPendingPe(store);
    SessionStateManager.load(store, '/test/project').markPromptEnhancementPopupShown(store);
    const launch = inject('SHOULD NOT SHOW');
    await runStop(makePayload(), store, undefined, undefined, undefined, launch);
    expect(launch).not.toHaveBeenCalled();
    const mgr = SessionStateManager.load(store, '/test/project');
    expect(mgr.current.shownPopupCount).toBe(0);
    expect(mgr.hasShownAdvisoryKeyV1(FIXTURE_KEY)).toBe(false);
  });

  it('a gated MPS continuation charges nothing — nothing was rendered', async () => {
    const session = SessionStateManager.load(store, '/test/project');
    session.setDetectedLanguage(store, undefined);
    upsertPendingPromptSequence(store, {
      sequenceId: 'seq-charge', enhancementId: 'enh-charge', projectRoot: '/test/project',
      sessionId: session.current.sessionId, itemCount: 3, currentItemIndex: 1,
      status: 'item_pending', lastActionId: 'prev',
    }, emptyPromptEnhancementSequencePayloadV1(64));
    const result = await runStop(makePayload({ stop_hook_active: true }), store, undefined, undefined, undefined, notShown());
    expect(result).toEqual({ outcome: 'mps_continuation_gated' });
    expect(SessionStateManager.load(store, '/test/project').current.shownPopupCount).toBe(0);
  });
});
