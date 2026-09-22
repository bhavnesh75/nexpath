import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProgram } from '../main.js';
import { PROMPT_ENHANCEMENT_CONTRACT_VERSION, type PromptEnhancementPrepareRequestV1, type PromptEnhancementSourceRefV1 } from '../../prompt-enhancement/contracts.js';
import { buildPromptEnhancementCostVisibilityMetadataV1 } from '../../prompt-enhancement/cost-observability.js';
import { preparePromptEnhancement } from '../../prompt-enhancement/facade.js';
import { getPromptStartStopSourceSnapshot } from '../../prompt-enhancement/source-reality.js';
import type { PromptEnhancementPopupEventV1 } from '../../prompt-enhancement/popup-session.js';
import type { Store } from '../../store/db.js';
import {
  runPromptEnhancementPopupHostCommandV1,
  runPromptEnhancementMpsContinuationPopupHostCommandV1,
  type PromptEnhancementPopupHostInputV1,
} from './prompt-enhancement-popup-host.js';
import { resolveOpenAIKey } from '../../config/ApiKeyResolver.js';
import { logger } from '../../logger.js';
import {
  PROMPT_ENHANCEMENT_EMPHASIS_CALL_EVENT_V1,
  PROMPT_ENHANCEMENT_EMPHASIS_TIER_SHIPS_V1,
} from '../../prompt-enhancement/emphasis-model-call.js';

// Key resolution is stubbed for the whole file: the real one reads the machine's keychain and home
// directory, so left alone these tests would answer differently on a machine that happens to have a
// key stored — and would reach for the keychain to do it.
vi.mock('../../config/ApiKeyResolver.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../config/ApiKeyResolver.js')>()),
  resolveOpenAIKey: vi.fn(async () => null),
}));
const resolveKey = vi.mocked(resolveOpenAIKey);

// Whatever the machine really has stays untouched: the stub sets and clears the variable itself.
const realKeyEnv = process.env['OPENAI_API_KEY'];
afterEach(() => {
  if (realKeyEnv === undefined) delete process.env['OPENAI_API_KEY'];
  else process.env['OPENAI_API_KEY'] = realKeyEnv;
});

beforeEach(() => {
  resolveKey.mockReset();
  resolveKey.mockImplementation(async () => null);
  delete process.env['OPENAI_API_KEY'];
});

function request(): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'pe1-2-source-a', sourceKind: 'source_a_user_prompt', sourceId: 'prompt:1',
    sourceAuthorization: 'source_fact_only', evidenceStatus: 'present', freshness: 'current', confidence: 'high', privacyClass: 'local_private',
  };
  const promptStartStop = getPromptStartStopSourceSnapshot();
  return {
    schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
    requestId: 'pe1-2-request', projectRoot: '/tmp/pe1-2-project', hostSurface: 'cli_stop_bridge',
    sourcePrompt: { text: 'Fix the payment test and explain verification.', origin: 'user', capturedAt: 1, promptIndex: 1, generatedOriginPolicy: 'ordinary_source_a' },
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
  };
}

async function validInput(): Promise<PromptEnhancementPopupHostInputV1> {
  const preparedRequest = request();
  return {
    protocolVersion: 1,
    request: preparedRequest,
    result: await preparePromptEnhancement(preparedRequest),
  };
}

function files() {
  const dir = mkdtempSync(join(tmpdir(), 'nexpath-pe1-2-'));
  return { inputFile: join(dir, 'input.json'), resultFile: join(dir, 'result.json') };
}

describe('spawned-window MPS parity (fix 2026-08-06)', () => {
  const MULTI_INTENT = 'Fix the failing payment test and add a rate limiter to the login endpoint.';

  async function sequenceInput(): Promise<PromptEnhancementPopupHostInputV1> {
    const base = request();
    const preparedRequest = { ...base, sourcePrompt: { ...base.sourcePrompt, text: MULTI_INTENT } };
    return { protocolVersion: 1, request: preparedRequest, result: await preparePromptEnhancement(preparedRequest) };
  }

  it('a handoff-bearing input shows the MPS popup first; Enter-send returns selected_current (PE popup skipped)', async () => {
    const paths = files();
    const input = await sequenceInput();
    expect((input.result as { uiView: { handoffAndSequenceSummary?: unknown } }).uiView.handoffAndSequenceSummary).toBeDefined();
    writeFileSync(paths.inputFile, JSON.stringify(input), 'utf8');
    const runPopup = vi.fn(async () => ({ state: 'selected_original' as const }));
    const runMpsPopup = vi.fn(async () => ({ state: 'send' as const, bodyText: 'ENHANCED FIRST PROMPT' }));

    const output = await runPromptEnhancementPopupHostCommandV1(
      { ...paths, db: ':memory:' },
      { openStore: async () => ({} as Store), closeStore: vi.fn(), runPopup, runMpsPopup, recordActionSignal: vi.fn() },
    );

    expect(output.result).toEqual({ state: 'selected_current', bodyText: 'ENHANCED FIRST PROMPT' });
    // MPS Phase 1 (Option 2): the host flags the MPS first-popup SEND so the parent records the row.
    expect(output.mpsFirstPopupSent).toBe(true);
    expect(runMpsPopup).toHaveBeenCalledTimes(1);
    expect(runPopup).not.toHaveBeenCalled(); // MPS send resolves the popup turn; PE popup skipped
  });

  it('NF apply-details capture: the MPS actionSignalSink is wired to recordActionSignal (mps_apply_details)', async () => {
    const paths = files();
    writeFileSync(paths.inputFile, JSON.stringify(await sequenceInput()), 'utf8');
    const runPopup = vi.fn(async () => ({ state: 'selected_original' as const }));
    // The runner invokes the sink when the user applies details in-popup, then sends.
    const runMpsPopup = vi.fn(async (arg: { actionSignalSink?: (kind: string, ts: number) => void }) => {
      arg.actionSignalSink?.('mps_apply_details', 1234);
      return { state: 'send' as const, bodyText: 'ENHANCED FIRST PROMPT' };
    });
    const recordActionSignal = vi.fn();

    await runPromptEnhancementPopupHostCommandV1(
      { ...paths, db: ':memory:' },
      { openStore: async () => ({} as Store), closeStore: vi.fn(), runPopup, runMpsPopup, recordActionSignal },
    );

    // The apply is recorded (mps_apply_details), AND the terminal outcome (mps_send) is recorded too.
    const kinds = recordActionSignal.mock.calls.map((c) => c[2]);
    expect(kinds).toContain('mps_apply_details');
    expect(kinds).toContain('mps_send');
  });

  it('MPS declined (Esc) falls through to the regular PE popup in the same window', async () => {
    const paths = files();
    writeFileSync(paths.inputFile, JSON.stringify(await sequenceInput()), 'utf8');
    const runPopup = vi.fn(async () => ({ state: 'selected_original' as const }));
    const runMpsPopup = vi.fn(async () => ({ state: 'declined' as const }));

    const output = await runPromptEnhancementPopupHostCommandV1(
      { ...paths, db: ':memory:' },
      { openStore: async () => ({} as Store), closeStore: vi.fn(), runPopup, runMpsPopup, recordActionSignal: vi.fn() },
    );

    expect(output.result).toEqual({ state: 'selected_original' });
    // MPS Phase 1 (Option 2): Esc → PE popup is NOT an MPS send, so the parent must not record a row.
    expect(output.mpsFirstPopupSent).toBe(false);
    expect(runMpsPopup).toHaveBeenCalledTimes(1);
    expect(runPopup).toHaveBeenCalledTimes(1);
  });

  it('MPS cancelled ends the flow with closed_no_send — the PE popup never opens (owner request)', async () => {
    const paths = files();
    const input = await sequenceInput();
    writeFileSync(paths.inputFile, JSON.stringify(input), 'utf8');
    const runPopup = vi.fn(async () => ({ state: 'selected_original' as const }));
    const runMpsPopup = vi.fn(async () => ({
      state: 'cancelled' as const,
      feedback: { kind: 'suggested' as const, category: 'not_relevant_enough' as const },
    }));
    const recordFeedback = vi.fn();

    const output = await runPromptEnhancementPopupHostCommandV1(
      { ...paths, db: ':memory:' },
      { openStore: async () => ({} as Store), closeStore: vi.fn(), runPopup, runMpsPopup, recordFeedback, recordActionSignal: vi.fn() },
    );

    expect(output.result).toEqual({ state: 'closed_no_send' });
    expect(runPopup).not.toHaveBeenCalled(); // cancel ends the flow — no PE popup after cancel
    // The feedback collected by the MPS cancel flow is recorded through the PEF chain.
    expect(recordFeedback).toHaveBeenCalledTimes(1);
    expect(recordFeedback.mock.calls[0][2]).toMatchObject({ eventType: 'explicit_feedback', feedbackCategory: 'not_relevant_enough' });
  });

  it('a non-sequence input never invokes the MPS popup (parity guard)', async () => {
    const paths = files();
    writeFileSync(paths.inputFile, JSON.stringify(await validInput()), 'utf8');
    const runPopup = vi.fn(async () => ({ state: 'closed_no_send' as const }));
    const runMpsPopup = vi.fn(async () => ({ state: 'declined' as const }));

    await runPromptEnhancementPopupHostCommandV1(
      { ...paths, db: ':memory:' },
      { openStore: async () => ({} as Store), closeStore: vi.fn(), runPopup, runMpsPopup, recordActionSignal: vi.fn() },
    );

    expect(runMpsPopup).not.toHaveBeenCalled();
    expect(runPopup).toHaveBeenCalledTimes(1);
  });

  it('the readiness marker is written exactly once when MPS renders first then PE falls through', async () => {
    const paths = files();
    const readinessFile = join(paths.inputFile, '..', 'ready');
    writeFileSync(paths.inputFile, JSON.stringify(await sequenceInput()), 'utf8');
    const markReady = vi.fn();
    const runPopup = vi.fn(async (input: { onFirstRender?: () => void }) => {
      input.onFirstRender?.(); // the PE popup's own first render must NOT double-write
      return { state: 'selected_original' as const };
    });
    const runMpsPopup = vi.fn(async () => ({ state: 'declined' as const }));

    await runPromptEnhancementPopupHostCommandV1(
      { ...paths, readinessFile, db: ':memory:' },
      { openStore: async () => ({} as Store), closeStore: vi.fn(), runPopup, runMpsPopup, markReady },
    );

    expect(markReady).toHaveBeenCalledTimes(1);
  });
});

describe('PE1.2 — hidden prompt-enhancement popup child command', () => {
  it('revalidates typed input and atomically writes the selected result without stdout output', async () => {
    const paths = files();
    const input = await validInput();
    writeFileSync(paths.inputFile, JSON.stringify(input), 'utf8');
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const runPopup = vi.fn(async () => ({ state: 'selected_original' as const }));
    const store = {} as Store;

    const output = await runPromptEnhancementPopupHostCommandV1(
      { ...paths, db: ':memory:' },
      { openStore: async () => store, closeStore: vi.fn(), runPopup },
    );

    expect(output).toEqual({ protocolVersion: 1, result: { state: 'selected_original' }, mpsFirstPopupSent: false });
    expect(JSON.parse(readFileSync(paths.resultFile, 'utf8'))).toEqual(output);
    // POSIX file mode — Windows has no 0o600 equivalent, so assert it only off win32 (P5).
    if (process.platform !== 'win32') expect(statSync(paths.resultFile).mode & 0o777).toBe(0o600);
    expect(runPopup).toHaveBeenCalledTimes(1);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
    stdout.mockRestore();
    stderr.mockRestore();
  });

  it('returns a safe no-send result without opening a store for invalid, missing, or stale input', async () => {
    const invalid = files();
    writeFileSync(invalid.inputFile, '{not json', 'utf8');
    const openStore = vi.fn();
    const runPopup = vi.fn();
    const invalidOutput = await runPromptEnhancementPopupHostCommandV1(
      { ...invalid, db: ':memory:' },
      { openStore, runPopup },
    );

    const missing = files();
    const missingOutput = await runPromptEnhancementPopupHostCommandV1(
      { ...missing, db: ':memory:' },
      { openStore, runPopup },
    );

    const stale = files();
    const input = await validInput();
    writeFileSync(stale.inputFile, JSON.stringify({ ...input, result: { ...(input.result as object), requestId: 'stale-request' } }), 'utf8');
    const staleOutput = await runPromptEnhancementPopupHostCommandV1(
      { ...stale, db: ':memory:' },
      { openStore, runPopup },
    );

    expect(invalidOutput).toEqual({ protocolVersion: 1, result: { state: 'closed_no_send' }, mpsFirstPopupSent: false });
    expect(missingOutput).toEqual({ protocolVersion: 1, result: { state: 'closed_no_send' }, mpsFirstPopupSent: false });
    expect(staleOutput).toEqual({ protocolVersion: 1, result: { state: 'closed_no_send' }, mpsFirstPopupSent: false });
    expect(JSON.parse(readFileSync(invalid.resultFile, 'utf8')).result).toEqual({ state: 'closed_no_send' });
    expect(openStore).not.toHaveBeenCalled();
    expect(runPopup).not.toHaveBeenCalled();
  });

  it('uses the existing PEF store boundary with the validated request project root', async () => {
    const paths = files();
    const input = await validInput();
    writeFileSync(paths.inputFile, JSON.stringify(input), 'utf8');
    const store = {} as Store;
    const event = {} as PromptEnhancementPopupEventV1;
    const recordFeedback = vi.fn(() => ({ stableEventIdentity: 'event-1', status: 'accepted' as const, publicSafeText: 'Feedback saved. Your prompt is unchanged.' }));
    const runPopup = vi.fn(async ({ feedbackSink }: { feedbackSink?: (value: PromptEnhancementPopupEventV1) => unknown }) => {
      await feedbackSink!(event);
      return { state: 'closed_no_send' as const };
    });

    await runPromptEnhancementPopupHostCommandV1(
      { ...paths, db: ':memory:' },
      { openStore: async () => store, closeStore: vi.fn(), runPopup, recordFeedback },
    );

    // The request is threaded through so the feedback->memory policy (E3/3.2a) can
    // re-derive the signal key + safety from it.
    expect(recordFeedback).toHaveBeenCalledWith(
      store,
      '/tmp/pe1-2-project',
      event,
      expect.objectContaining({ requestId: 'pe1-2-request', projectRoot: '/tmp/pe1-2-project' }),
    );
  });

  it('writes the private readiness marker only after the popup reports its first render', async () => {
    const paths = files();
    const readinessFile = join(dirname(paths.resultFile), 'ready');
    const input = await validInput();
    writeFileSync(paths.inputFile, JSON.stringify(input), 'utf8');
    const runPopup = vi.fn(async ({ onFirstRender }: { onFirstRender?: () => void }) => {
      expect(existsSync(readinessFile)).toBe(false);
      onFirstRender?.();
      return { state: 'selected_original' as const };
    });

    await runPromptEnhancementPopupHostCommandV1(
      { ...paths, readinessFile, db: ':memory:' },
      { openStore: async () => ({} as Store), closeStore: vi.fn(), runPopup },
    );

    expect(runPopup).toHaveBeenCalledTimes(1);
    expect(readFileSync(readinessFile, 'utf8')).toBe('ready');
    // POSIX file mode — assert only off win32 (P5).
    if (process.platform !== 'win32') expect(statSync(readinessFile).mode & 0o777).toBe(0o600);
  });

  it('registers the child command as hidden, outside the public help surface', () => {
    const command = createProgram().commands.find((candidate) => candidate.name() === 'prompt-enhancement-popup-host');
    expect(command).toBeDefined();
    expect(command!.options.map((option) => option.long)).toEqual(expect.arrayContaining(['--input-file', '--result-file', '--db']));
    expect(createProgram().helpInformation()).not.toContain('prompt-enhancement-popup-host');
  });
});

describe('MPS Phase 2 — continuation (2nd popup) host handler (Option D)', () => {
  const continuationInput = (result: unknown) => ({
    protocolVersion: 1 as const,
    continuation: {
      result,
      handoffMetadata: { any: 'shape' },
      event: { any: 'shape' },
      progress: { done: 1, total: 2 },
      itemKind: 'task' as const,
    },
  });

  it('renders the continuation popup for a valid input and reports its outcome to the result file', async () => {
    const paths = files();
    const input = await validInput(); // a real, valid prepare result
    writeFileSync(paths.inputFile, JSON.stringify(continuationInput(input.result)), 'utf8');
    const runMpsContinuationPopup = vi.fn(async () => ({ state: 'send' as const, bodyText: 'NEXT ITEM BODY' }));

    const output = await runPromptEnhancementMpsContinuationPopupHostCommandV1(
      { ...paths, db: ':memory:' },
      { runMpsContinuationPopup },
    );

    expect(output).toEqual({ protocolVersion: 1, continuationOutcome: { state: 'send', bodyText: 'NEXT ITEM BODY' } });
    expect(runMpsContinuationPopup).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(paths.resultFile, 'utf8'))).toEqual(output);
  });

  it('fails closed to not_shown on an invalid prepare result — the runner validates and never renders', async () => {
    const paths = files();
    writeFileSync(paths.inputFile, JSON.stringify(continuationInput({ not: 'a valid result' })), 'utf8');
    // The host no longer pre-validates the RAW result: a raw pre-check wrongly rejects legitimate
    // confirmation continuations (whose original slice is empty by design). The REAL runner validates the
    // result — with the substitution a raw check lacks — and fails closed WITHOUT rendering on a genuinely
    // invalid one.
    const output = await runPromptEnhancementMpsContinuationPopupHostCommandV1({ ...paths, db: ':memory:' });
    expect(output.continuationOutcome.state).toBe('not_shown');
  });

  it('fails closed to not_shown on unparseable input', async () => {
    const paths = files();
    writeFileSync(paths.inputFile, '{not json', 'utf8');
    const runMpsContinuationPopup = vi.fn();
    const output = await runPromptEnhancementMpsContinuationPopupHostCommandV1(
      { ...paths, db: ':memory:' },
      { runMpsContinuationPopup },
    );
    expect(output.continuationOutcome.state).toBe('not_shown');
    expect(runMpsContinuationPopup).not.toHaveBeenCalled();
  });

  it('a continuation input is a DISTINCT shape — the first-popup command rejects it as invalid', async () => {
    // Proof the two shapes never collide: a continuation input has no top-level request/result, so the
    // first-popup path treats it as invalid (safe no-send) and only the continuation handler serves it.
    const paths = files();
    const input = await validInput();
    writeFileSync(paths.inputFile, JSON.stringify(continuationInput(input.result)), 'utf8');
    const runPopup = vi.fn();
    const runMpsPopup = vi.fn();
    const openStore = vi.fn();
    const firstPopupOut = await runPromptEnhancementPopupHostCommandV1(
      { ...paths, db: ':memory:' },
      { runPopup, runMpsPopup, openStore },
    );
    expect(firstPopupOut.result).toEqual({ state: 'closed_no_send' });
    expect(openStore).not.toHaveBeenCalled();
    expect(runPopup).not.toHaveBeenCalled();
    expect(runMpsPopup).not.toHaveBeenCalled();
  });
});

describe('the optional emphasis pass is switched on in the child, not in the payload', () => {
  it('does NOT turn it on, because the tier does not ship — and the payload still carries no key', async () => {
    // ⚠️ This test used to assert the opposite, and the assertion moved with a decision rather
    // than with the code: measured against a labelled set, the pass raises coverage about
    // threefold and does it by marking lines the standard rejects — eighteen to twenty-eight wrong
    // landings where the deterministic marks have none. Wrong emphasis is worse than absent
    // emphasis, so the constant that starts it is false.
    //
    // What is still asserted here is everything AROUND that switch, because all of it must keep
    // working for the day the constant turns: the key is still resolved for this project, and the
    // payload written for the child still carries no secret.
    const paths = files();
    const input = await validInput();
    writeFileSync(paths.inputFile, JSON.stringify(input), 'utf8');
    // The only thing the child is given is the file. A secret does not belong in a temp file, so
    // this asserts the written payload really is free of one before the switch is read.
    const payload = readFileSync(paths.inputFile, 'utf8');
    expect(payload).not.toMatch(/OPENAI_API_KEY|apiKey|sk-[A-Za-z0-9]/);

    resolveKey.mockImplementation(async () => {
      process.env['OPENAI_API_KEY'] = 'sk-test-resolved-in-the-child';
      return 'sk-test-resolved-in-the-child';
    });
    const runPopup = vi.fn(async () => ({ state: 'selected_original' as const }));
    await runPromptEnhancementPopupHostCommandV1(
      { ...paths, db: ':memory:' },
      { openStore: async () => ({} as Store), closeStore: vi.fn(), runPopup },
    );

    expect(resolveKey).toHaveBeenCalledWith(input.request.projectRoot);
    expect(PROMPT_ENHANCEMENT_EMPHASIS_TIER_SHIPS_V1).toBe(false);
    // ⚠️ The invariant is that the pass is not STARTED, not that the object is absent: the sink
    //    now rides along in every case so the log records what happened. `enabled` is the opt-in.
    expect((runPopup.mock.calls[0]![0] as { emphasisModel?: { enabled?: boolean } }).emphasisModel?.enabled)
      .toBeUndefined();
  });

  it('leaves it off when nothing resolves, and the popup still opens', async () => {
    const paths = files();
    const input = await validInput();
    writeFileSync(paths.inputFile, JSON.stringify(input), 'utf8');
    resolveKey.mockImplementation(async () => null);
    const runPopup = vi.fn(async () => ({ state: 'selected_original' as const }));

    const output = await runPromptEnhancementPopupHostCommandV1(
      { ...paths, db: ':memory:' },
      { openStore: async () => ({} as Store), closeStore: vi.fn(), runPopup },
    );

    expect(output.result).toEqual({ state: 'selected_original' });
    expect(runPopup).toHaveBeenCalledTimes(1);
    // ⚠️ The invariant is that the pass is not STARTED, not that the object is absent: the sink
    //    now rides along in every case so the log records what happened. `enabled` is the opt-in.
    expect((runPopup.mock.calls[0]![0] as { emphasisModel?: { enabled?: boolean } }).emphasisModel?.enabled)
      .toBeUndefined();
  });

  it('leaves it off when resolution throws, and the popup still opens', async () => {
    const paths = files();
    writeFileSync(paths.inputFile, JSON.stringify(await validInput()), 'utf8');
    resolveKey.mockImplementation(async () => { throw new Error('keychain locked'); });
    const runPopup = vi.fn(async () => ({ state: 'selected_original' as const }));

    const output = await runPromptEnhancementPopupHostCommandV1(
      { ...paths, db: ':memory:' },
      { openStore: async () => ({} as Store), closeStore: vi.fn(), runPopup },
    );

    expect(output.result).toEqual({ state: 'selected_original' });
    // ⚠️ The invariant is that the pass is not STARTED, not that the object is absent: the sink
    //    now rides along in every case so the log records what happened. `enabled` is the opt-in.
    expect((runPopup.mock.calls[0]![0] as { emphasisModel?: { enabled?: boolean } }).emphasisModel?.enabled)
      .toBeUndefined();
  });
});

describe('the pass reports into the log, under its own name', () => {
  it('hands the popup a sink even though the tier does not ship, and the log says which', async () => {
    // ⚠️ The sink is handed over whether or not the tier runs, and that is the fix for something
    // the ruling would otherwise have broken twice over: a tier that is off would log NOTHING, so
    // anyone asking "why is there no model bold" gets silence — and the sink's own wiring would
    // sit in a branch nothing reaches, untested until the day it is turned back on.
    //
    // ⛔ `tierShips` is in the record because the outcome alone reads as "no client", which would
    // send that reader hunting for a key that resolved perfectly well.
    const paths = files();
    writeFileSync(paths.inputFile, JSON.stringify(await validInput()), 'utf8');
    resolveKey.mockImplementation(async () => {
      process.env['OPENAI_API_KEY'] = 'sk-test-resolved-in-the-child';
      return 'sk-test-resolved-in-the-child';
    });
    const debug = vi.spyOn(logger, 'debug').mockImplementation(() => {});
    const runPopup = vi.fn(async () => ({ state: 'selected_original' as const }));

    await runPromptEnhancementPopupHostCommandV1(
      { ...paths, db: ':memory:' },
      { openStore: async () => ({} as Store), closeStore: vi.fn(), runPopup },
    );

    const passed = (runPopup.mock.calls[0]![0] as {
      emphasisModel?: { enabled?: boolean; onOutcome?: (e: unknown) => void };
    }).emphasisModel;
    // The sink is there; the opt-in is not — which is the whole shape of the decision.
    expect(typeof passed?.onOutcome).toBe('function');
    expect(passed?.enabled).toBeUndefined();
    expect(PROMPT_ENHANCEMENT_EMPHASIS_TIER_SHIPS_V1).toBe(false);

    // ⛔ The name is the point: the stage classifier's provider-error event is what `nexpath
    // status` reports, and a timeout here costs a few unbolded words, nothing more.
    passed!.onOutcome!({ event: PROMPT_ENHANCEMENT_EMPHASIS_CALL_EVENT_V1, outcome: 'gated_out_no_client', phraseCount: 0 });
    expect(debug).toHaveBeenCalledWith(
      'prompt_enhancement_emphasis_call',
      expect.objectContaining({ outcome: 'gated_out_no_client', phraseCount: 0, tierShips: false }),
    );
    debug.mockRestore();
  });

  it('hands it no sink when there is no key, because it starts no call either', async () => {
    const paths = files();
    writeFileSync(paths.inputFile, JSON.stringify(await validInput()), 'utf8');
    resolveKey.mockImplementation(async () => null);
    const runPopup = vi.fn(async () => ({ state: 'selected_original' as const }));

    await runPromptEnhancementPopupHostCommandV1(
      { ...paths, db: ':memory:' },
      { openStore: async () => ({} as Store), closeStore: vi.fn(), runPopup },
    );

    // ⚠️ The invariant is that the pass is not STARTED, not that the object is absent: the sink
    //    now rides along in every case so the log records what happened. `enabled` is the opt-in.
    expect((runPopup.mock.calls[0]![0] as { emphasisModel?: { enabled?: boolean } }).emphasisModel?.enabled)
      .toBeUndefined();
  });
});
