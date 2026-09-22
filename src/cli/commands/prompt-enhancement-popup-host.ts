import { appendFileSync, chmodSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, closeSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import { closeStore, openStore, DEFAULT_DB_PATH, type Store } from '../../store/db.js';
import { recordActionSignal } from '../../store/feedback-signals.js';
import { resolveOpenAIKey } from '../../config/ApiKeyResolver.js';
import {
  validatePromptEnhancementPrepareRequestV1,
  validatePromptEnhancementPrepareResultV1,
  type PromptEnhancementPrepareRequestV1,
  type PromptEnhancementPrepareResultV1,
} from '../../prompt-enhancement/contracts.js';
import {
  runPromptEnhancementCliSubmitPopupV1,
  type PromptEnhancementCliPopupResultV1,
} from '../../prompt-enhancement/cli-submit-popup.js';
import type { PromptEnhancementPopupEventV1 } from '../../prompt-enhancement/popup-session.js';
import { emitPromptEnhancementCostObservabilityV1 } from '../../prompt-enhancement/cost-measurement.js';
import { evaluatePromptEnhancementMpsIntakeDecisionV1 } from '../../prompt-enhancement/intake-decision.js';
import { buildPromptEnhancementCliMpsIntakeEvidenceV1 } from '../../prompt-enhancement/cli-mps-intake-evidence.js';
import { runPromptEnhancementCliMpsFirstPopupV1, buildPromptEnhancementMpsCancelFeedbackEventV1, promptEnhancementMpsActionSignalKindV1 } from '../../prompt-enhancement/cli-mps-run.js';
import {
  runPromptEnhancementCliMpsContinuationPopupV1,
  type PromptEnhancementCliMpsContinuationOutcomeV1,
} from '../../prompt-enhancement/cli-mps-continuation-run.js';
import { recordPromptEnhancementCliFeedbackV1 } from './auto.js';
import {
  isPromptEnhancementEmphasisPhraseListV1,
  type PromptEnhancementEmphasisPhraseV1,
} from '../../store/pending-prompt-enhancements.js';
import { buildPromptEnhancementSettingsControlV1 } from '../shared/pe-settings-control.js';
import { logger } from '../../logger.js';
import { PROMPT_ENHANCEMENT_EMPHASIS_TIER_SHIPS_V1 } from '../../prompt-enhancement/emphasis-model-call.js';

const POPUP_HOST_PROTOCOL_VERSION_V1 = 1;

export interface PromptEnhancementPopupHostInputV1 {
  protocolVersion: typeof POPUP_HOST_PROTOCOL_VERSION_V1;
  request: unknown;
  result: unknown;
  /**
   * The popup's bold phrases, carried across the spawn so a window host renders what the in-process
   * popup would. Optional in both directions: a payload written without it stays valid, so the
   * protocol version does not move for it.
   */
  emphasisPhrases?: readonly PromptEnhancementEmphasisPhraseV1[];
}

export interface PromptEnhancementPopupHostOutputV1 {
  protocolVersion: typeof POPUP_HOST_PROTOCOL_VERSION_V1;
  result: PromptEnhancementCliPopupResultV1;
  // MPS Phase 1 (Option 2 — parent records): true ONLY when the user SENT the MPS first popup in this
  // spawned host. The host records no durable sequence row itself; this flag tells the parent (which
  // owns the store lock) to run the intake + upsert. Absent/false on a PE-popup send or any non-send.
  mpsFirstPopupSent?: boolean;
}

// ── MPS Phase 2 — continuation (2nd popup) host, Option D ─────────────────────────────────────────
// The SAME spawned child command renders the CONTINUATION popup when its input carries a `continuation`
// payload (dispatched by shape below), so the proven cross-platform spawn/plan-builder path is reused
// UNCHANGED for Mac/Windows/Linux. The payload is exactly what runPromptEnhancementCliMpsContinuationPopupV1
// consumes (the five fields off the packaged continuation); the outcome travels back to the parent, which
// owns delivery/persistence (Phase 3).
export interface PromptEnhancementMpsContinuationHostInputV1 {
  protocolVersion: typeof POPUP_HOST_PROTOCOL_VERSION_V1;
  continuation: {
    result: unknown;
    handoffMetadata: unknown;
    event: unknown;
    progress: unknown;
    itemKind: unknown;
  };
}

export interface PromptEnhancementMpsContinuationHostOutputV1 {
  protocolVersion: typeof POPUP_HOST_PROTOCOL_VERSION_V1;
  continuationOutcome: PromptEnhancementCliMpsContinuationOutcomeV1;
}

export interface PromptEnhancementPopupHostCommandOptionsV1 {
  inputFile: string;
  resultFile: string;
  readinessFile?: string;
  db?: string;
}

export interface PromptEnhancementPopupHostDependenciesV1 {
  readInputFile: (path: string) => string;
  writeResultAtomically: (
    path: string,
    output: PromptEnhancementPopupHostOutputV1 | PromptEnhancementMpsContinuationHostOutputV1,
  ) => void;
  openStore: (path: string) => Promise<Store>;
  closeStore: (store: Store) => void;
  runPopup: typeof runPromptEnhancementCliSubmitPopupV1;
  runMpsPopup: typeof runPromptEnhancementCliMpsFirstPopupV1;
  // MPS Phase 2 (Option D): the continuation (2nd popup) runner, injectable for tests. Called with no
  // `interaction` so it opens the spawned window's /dev/tty (same console the first popup uses).
  runMpsContinuationPopup: typeof runPromptEnhancementCliMpsContinuationPopupV1;
  recordFeedback: typeof recordPromptEnhancementCliFeedbackV1;
  recordActionSignal: typeof recordActionSignal;
  markReady: (path: string) => void;
}

const SAFE_NON_DELIVERY_RESULT_V1: PromptEnhancementCliPopupResultV1 = {
  state: 'closed_no_send',
};

function defaultDependencies(): PromptEnhancementPopupHostDependenciesV1 {
  return {
    readInputFile: (path) => readFileSync(path, 'utf8'),
    writeResultAtomically: writePromptEnhancementPopupHostResultAtomicallyV1,
    openStore,
    closeStore,
    runPopup: runPromptEnhancementCliSubmitPopupV1,
    runMpsPopup: runPromptEnhancementCliMpsFirstPopupV1,
    runMpsContinuationPopup: runPromptEnhancementCliMpsContinuationPopupV1,
    recordFeedback: recordPromptEnhancementCliFeedbackV1,
    recordActionSignal,
    markReady: writePromptEnhancementPopupHostReadyMarkerV1,
  };
}

function asInput(value: unknown): PromptEnhancementPopupHostInputV1 | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  if (input.protocolVersion !== POPUP_HOST_PROTOCOL_VERSION_V1) return undefined;
  if (!('request' in input) || !('result' in input)) return undefined;
  return {
    protocolVersion: POPUP_HOST_PROTOCOL_VERSION_V1,
    request: input.request,
    result: input.result,
    // Additive and optional, and held to the SAME shape the store holds it to, so a phrase list is
    // the same thing on both roads to the popup. Absent or malformed is simply dropped, exactly as a
    // payload written before this field existed behaves — it never makes an input invalid.
    ...(isPromptEnhancementEmphasisPhraseListV1(input.emphasisPhrases)
      ? { emphasisPhrases: input.emphasisPhrases }
      : {}),
  };
}

function validatedInput(value: unknown): {
  request: PromptEnhancementPrepareRequestV1;
  result: PromptEnhancementPrepareResultV1;
  emphasisPhrases?: readonly PromptEnhancementEmphasisPhraseV1[];
} | undefined {
  const input = asInput(value);
  if (!input) return undefined;
  if (!validatePromptEnhancementPrepareRequestV1(input.request).ok) return undefined;
  if (!validatePromptEnhancementPrepareResultV1(input.result).ok) return undefined;

  const request = input.request as PromptEnhancementPrepareRequestV1;
  const result = input.result as PromptEnhancementPrepareResultV1;
  if (request.requestId !== result.requestId || request.projectRoot !== result.projectRoot) return undefined;
  return { request, result, ...(input.emphasisPhrases ? { emphasisPhrases: input.emphasisPhrases } : {}) };
}

/**
 * MPS Phase 2 (Option D): detect a continuation input by its `continuation` payload. A first-popup
 * input has top-level `request`/`result` and NO `continuation` key, so it is never matched here — the
 * first-popup dispatch is untouched. Deep validity of the five fields is the runner's fail-closed
 * concern; this only confirms the shape well enough to route.
 */
function asContinuationInput(value: unknown): PromptEnhancementMpsContinuationHostInputV1 | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>;
  if (v.protocolVersion !== POPUP_HOST_PROTOCOL_VERSION_V1) return undefined;
  const c = v.continuation;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return undefined;
  const cc = c as Record<string, unknown>;
  if (!('result' in cc && 'handoffMetadata' in cc && 'event' in cc && 'progress' in cc && 'itemKind' in cc)) {
    return undefined;
  }
  return {
    protocolVersion: POPUP_HOST_PROTOCOL_VERSION_V1,
    continuation: cc as PromptEnhancementMpsContinuationHostInputV1['continuation'],
  };
}

/**
 * PE1.2 hidden child-command boundary. Invalid, missing, stale, or failed
 * input always resolves to an explicit no-send result. It never prints prompt
 * text/body text to stdout or stderr.
 */
export async function runPromptEnhancementPopupHostCommandV1(
  options: PromptEnhancementPopupHostCommandOptionsV1,
  overrides: Partial<PromptEnhancementPopupHostDependenciesV1> = {},
): Promise<PromptEnhancementPopupHostOutputV1> {
  const dependencies = { ...defaultDependencies(), ...overrides };
  let popupResult: PromptEnhancementCliPopupResultV1 = SAFE_NON_DELIVERY_RESULT_V1;
  let diagnosticError = 'none';
  // MPS Phase 1 (Option 2): set only when the MPS first popup was SENT; travels to the parent so it
  // records the pending-sequence row (the host writes no durable sequence state itself).
  let mpsFirstPopupSent = false;

  try {
    const parsed = JSON.parse(dependencies.readInputFile(options.inputFile)) as unknown;
    const input = validatedInput(parsed);
    if (input) {
      let store: Store | undefined;
      try {
        store = await dependencies.openStore(options.db ?? DEFAULT_DB_PATH);
        // MPS-first (spawned-window parity fix, 2026-08-06): the direct-TTY Stop branch shows the
        // MPS sequence popup before the PE popup — this child (the spawned-window host) must do the
        // SAME, or environments whose Stop hook has no TTY can never see MPS. Enter returns the
        // existing selected_current shape (the parent's inject path handles it unchanged);
        // Esc/declined/gate-blocked falls through to the regular PE popup below. Fail-closed.
        // The readiness marker uses 'wx' (throws on a second write), so guard it to fire ONCE
        // whether the first rendered frame is the MPS popup or the PE popup fallthrough.
        let readyMarked = false;
        const markReadyOnce = (): void => {
          if (readyMarked || !options.readinessFile) return;
          readyMarked = true;
          dependencies.markReady(options.readinessFile);
        };
        let mpsHandled = false;
        if (input.result.uiView.handoffAndSequenceSummary) {
          const mpsEvidence = buildPromptEnhancementCliMpsIntakeEvidenceV1(input.result);
          const mpsGate = evaluatePromptEnhancementMpsIntakeDecisionV1({
            surface: 'cli_stop_bridge',
            evidence: mpsEvidence ? [...mpsEvidence] : undefined,
          });
          logger.debug('popup_host_mps_intake_gate', {
            projectRoot: input.request.projectRoot,
            renderPermission: mpsGate.renderPermission,
            reasonCodes: mpsGate.reasonCodes.slice(0, 6),
          });
          if (mpsGate.renderPermission === 'mps_render_permitted') {
            markReadyOnce();
            const mps = await dependencies.runMpsPopup({
              result: input.result,
              // NF Plan B — content-free capture of the in-popup APPLY action (mps_apply_details),
              // mirroring the PE popup. The terminal outcome is captured just below.
              actionSignalSink: (kind, occurredAt) => dependencies.recordActionSignal(store!, input.request.projectRoot, kind, occurredAt),
            });
            logger.info('popup_host_mps_first_popup', { projectRoot: input.request.projectRoot, outcome: mps.state });
            // NF Plan B (B-3): content-free per-action capture of the MPS outcome (send/cancel/decline),
            // buffered locally, sent on the feedback-consent flush.
            const mpsActionKind = promptEnhancementMpsActionSignalKindV1(mps.state);
            if (mpsActionKind) dependencies.recordActionSignal(store!, input.request.projectRoot, mpsActionKind);
            if (mps.state === 'send' && mps.bodyText.trim().length > 0) {
              popupResult = { state: 'selected_current', bodyText: mps.bodyText };
              mpsFirstPopupSent = true;
              mpsHandled = true;
            } else if (mps.state === 'cancelled') {
              // Cancel ends the flow (owner request 2026-08-06): the MPS shell already showed the
              // PEF feedback popup — never open the PE popup after a cancel. Record any collected
              // feedback (best-effort) and close with the safe no-send result.
              if (mps.feedback) {
                const feedbackEvent = buildPromptEnhancementMpsCancelFeedbackEventV1(input.result, mps.feedback, Date.now());
                if (feedbackEvent) {
                  try {
                    await dependencies.recordFeedback(store!, input.request.projectRoot, feedbackEvent, input.request);
                  } catch { /* feedback recording is best-effort — never blocks the cancel */ }
                }
              }
              popupResult = { state: 'closed_no_send' };
              mpsHandled = true;
            }
            // declined (Esc) / not_shown -> fall through to the regular PE popup below.
          }
        }
        if (!mpsHandled) {
          // ⚠️ The key is resolved HERE, in the child, and never carried in the payload file — a
          // secret does not belong in a temp file. On Windows and macOS this child is always where
          // the popup lives, so without this the optional pass would run on Linux only, and the
          // tier most people get would be the one nobody measured. Nothing resolving is simply
          // "no key": the popup shows its rule-based marks and starts no call.
          // 🔒 …and it does not ship — see PROMPT_ENHANCEMENT_EMPHASIS_TIER_SHIPS_V1, which carries
          // the numbers that decided it. The key is still resolved because this process resolves it
          // for whatever else needs it, and because the day the tier is turned back on the only
          // change here is the constant.
          let emphasisEnabled = false;
          try {
            await resolveOpenAIKey(input.request.projectRoot);
            emphasisEnabled = PROMPT_ENHANCEMENT_EMPHASIS_TIER_SHIPS_V1
              && typeof process.env['OPENAI_API_KEY'] === 'string'
              && process.env['OPENAI_API_KEY'].length > 0;
          } catch {
            // Resolution is best effort; a failure here must never keep the popup from opening.
          }
          popupResult = await dependencies.runPopup({
            request: input.request,
            result: input.result,
            // The pass reports under its OWN event name, so a timeout costing a few unbolded
            // words is never read here as the stage classifier's provider failure.
            // ⚠️ The SINK is handed over unconditionally and only `enabled` is gated. The pass
            // reports once for every outcome **including the ones where it started nothing**, so
            // this way the log records that the tier did not run instead of saying nothing at all
            // — and someone reading it is not left to guess whether a key failed to resolve.
            // `tierShips` is in the record for exactly that: the outcome alone reads as "no
            // client", which would send a reader hunting for a missing key.
            emphasisModel: {
              ...(emphasisEnabled ? { enabled: true } : {}),
              onOutcome: (event: { event: string; outcome: string; phraseCount: number }) => logger.debug(event.event, {
                projectRoot: input.request.projectRoot,
                outcome: event.outcome,
                phraseCount: event.phraseCount,
                tierShips: PROMPT_ENHANCEMENT_EMPHASIS_TIER_SHIPS_V1,
              }),
            },
            onFirstRender: options.readinessFile ? markReadyOnce : undefined,
            feedbackSink: (event: PromptEnhancementPopupEventV1) => dependencies.recordFeedback(
              store!,
              input.request.projectRoot,
              event,
              input.request,
            ),
            costObservabilitySink: (result) => emitPromptEnhancementCostObservabilityV1(result, 'popup_action', logger),
            emphasisPhrases: input.emphasisPhrases,
            // NF Plan B (B-2): content-free per-action telemetry — buffered locally, sent on the
            // feedback-consent flush. Store-backed sink (this child process owns the store).
            actionSignalSink: (kind, occurredAt) => dependencies.recordActionSignal(store!, input.request.projectRoot, kind, occurredAt),
            // F3 (2026-08-07): failed actions stay silent in the popup — reason codes go to the
            // log so a spawned-window failure (the live Windows report) is diagnosable post-hoc.
            actionDiagnosticsSink: (event) => logger.debug('pe_action_failed', {
              projectRoot: input.request.projectRoot,
              actionType: event.actionType,
              state: event.state,
              reasonCodes: event.reasonCodes.slice(0, 8),
            }),
            // Ctrl+T inside the popup (owner request 2026-09-18). This child owns the store it
            // opened above — the same connection the feedback/action sinks already write through.
            settingsControl: buildPromptEnhancementSettingsControlV1(store!, input.request.projectRoot),
          });
        }
      } finally {
        if (store) dependencies.closeStore(store);
      }
    } else {
      diagnosticError = 'input_invalid_or_stale';
    }
  } catch (error) {
    diagnosticError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    popupResult = SAFE_NON_DELIVERY_RESULT_V1;
  }

  // NEXPATH_DEBUG diagnostics → a persistent file (temp dir is cleaned up, and the window may vanish),
  // so a render-then-close can be diagnosed with a simple `cat`. No prompt/body text — only TTY state,
  // the resolved result state, and any caught error class/message.
  if (process.env.NEXPATH_DEBUG) {
    try {
      const debugDir = join(homedir(), '.nexpath');
      mkdirSync(debugDir, { recursive: true });
      appendFileSync(
        join(debugDir, 'pe-popup-child-debug.log'),
        `[${new Date().toISOString()}] stdin.isTTY=${Boolean(process.stdin.isTTY)} stdout.isTTY=${Boolean(process.stdout.isTTY)} platform=${process.platform} result=${popupResult.state} error=${diagnosticError}\n`,
      );
    } catch { /* diagnostics are best-effort */ }
  }

  const output: PromptEnhancementPopupHostOutputV1 = {
    protocolVersion: POPUP_HOST_PROTOCOL_VERSION_V1,
    result: popupResult,
    mpsFirstPopupSent,
  };
  try {
    dependencies.writeResultAtomically(options.resultFile, output);
  } catch {
    // The parent launcher treats a missing result file as a safe failed launch.
  }
  return output;
}

/**
 * MPS Phase 2 (Option D) — the CONTINUATION (2nd popup) child-command handler. Same spawned window and
 * spawn/plan infra as the first popup (dispatched by input shape); here it renders the continuation
 * popup and reports its outcome. Fail-closed: invalid/missing/stale input, or any error, resolves to a
 * `not_shown` outcome (which the parent treats as "keep the item pending" — never a crash, never a
 * fabricated send). It opens NO store and does no delivery/persistence — the parent owns those (Phase 3).
 */
export async function runPromptEnhancementMpsContinuationPopupHostCommandV1(
  options: PromptEnhancementPopupHostCommandOptionsV1,
  overrides: Partial<PromptEnhancementPopupHostDependenciesV1> = {},
): Promise<PromptEnhancementMpsContinuationHostOutputV1> {
  const dependencies = { ...defaultDependencies(), ...overrides };
  let outcome: PromptEnhancementCliMpsContinuationOutcomeV1 = {
    state: 'not_shown',
    reasonCodes: ['input_invalid_or_stale'],
  };
  try {
    const input = asContinuationInput(JSON.parse(dependencies.readInputFile(options.inputFile)) as unknown);
    // Mark ready as soon as the child is up and about to REPORT an outcome — BEFORE validation — so a
    // validation refusal (or a legitimately-rendered not_shown) surfaces to the parent as a reported
    // outcome WITH its reason, instead of being hidden behind the launcher's `terminal_renderer_not_ready`.
    // A crash before this point still writes no result, so the launcher detects it via the non-zero exit.
    if (options.readinessFile) dependencies.markReady(options.readinessFile);
    if (!input) {
      outcome = { state: 'not_shown', reasonCodes: ['input_invalid_or_stale'] };
    } else {
      // Do NOT pre-validate the RAW result here: a confirmation item carries no original slice (empty by
      // design, MPS-12), and the runner validates the result WITH the required substitution
      // (originalPromptText ← text) that a raw pre-validation lacks — so a raw check wrongly rejects every
      // confirmation continuation with `missing_current_body`. The runner is the single, correct validator;
      // it returns a REPORTED not_shown with its own reason codes if the result is genuinely invalid.
      outcome = await dependencies.runMpsContinuationPopup({
        result: input.continuation.result,
        handoffMetadata: input.continuation.handoffMetadata,
        event: input.continuation.event,
        progress: input.continuation.progress,
        itemKind: input.continuation.itemKind,
      } as Parameters<typeof runPromptEnhancementCliMpsContinuationPopupV1>[0]);
    }
  } catch (error) {
    // Diagnostic: propagate WHAT threw through the result so the PARENT logs it persistently — the child
    // runs in the spawned window, which is gone by the time anyone could read its stderr. The message is
    // truncated and carries no prompt text (it is an Error message, not content).
    const detail = (error instanceof Error ? error.message : String(error)).slice(0, 160);
    outcome = { state: 'not_shown', reasonCodes: ['host_error', detail] };
  }
  const output: PromptEnhancementMpsContinuationHostOutputV1 = {
    protocolVersion: POPUP_HOST_PROTOCOL_VERSION_V1,
    continuationOutcome: outcome,
  };
  try {
    dependencies.writeResultAtomically(options.resultFile, output);
  } catch {
    // The parent launcher treats a missing result file as a safe failed launch.
  }
  return output;
}

export function writePromptEnhancementPopupHostResultAtomicallyV1(
  resultFile: string,
  output: PromptEnhancementPopupHostOutputV1 | PromptEnhancementMpsContinuationHostOutputV1,
): void {
  const temporaryFile = `${resultFile}.tmp-${process.pid}-${randomUUID()}`;
  try {
    writeFileSync(temporaryFile, JSON.stringify(output), { encoding: 'utf8', mode: 0o600 });
    renameSync(temporaryFile, resultFile);
    chmodSync(resultFile, 0o600);
  } catch (error) {
    try { unlinkSync(temporaryFile); } catch { /* best-effort cleanup */ }
    throw error;
  }
}

export function writePromptEnhancementPopupHostReadyMarkerV1(readinessFile: string): void {
  const fd = openSync(readinessFile, 'wx', 0o600);
  try {
    writeFileSync(fd, 'ready', 'utf8');
    chmodSync(readinessFile, 0o600);
  } finally {
    closeSync(fd);
  }
}

export function registerPromptEnhancementPopupHostCommand(program: Command): void {
  program
    .command('prompt-enhancement-popup-host', { hidden: true })
    .description('Internal PE popup child-process host')
    .requiredOption('--input-file <path>', 'Private validated PE request/result file')
    .requiredOption('--result-file <path>', 'Private typed popup-result file')
    .option('--readiness-file <path>', 'Private first-render readiness marker')
    .option('--db <path>', 'Path to the SQLite database file')
    .action(async (opts: PromptEnhancementPopupHostCommandOptionsV1) => {
      // Option D dispatch: the SAME hidden command renders the first popup OR the continuation popup,
      // chosen by the input's shape, so the cross-platform spawn/plan infra is reused unchanged.
      let parsed: unknown;
      try { parsed = JSON.parse(readFileSync(opts.inputFile, 'utf8')); } catch { parsed = undefined; }
      if (asContinuationInput(parsed)) {
        await runPromptEnhancementMpsContinuationPopupHostCommandV1(opts);
      } else {
        await runPromptEnhancementPopupHostCommandV1(opts);
      }
    });
}
