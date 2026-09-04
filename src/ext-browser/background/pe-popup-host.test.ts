/**
 * PB4 — browser PE popup host, tested against the REAL engine state machine.
 *
 * `runBrowserPePopup` here runs the actual `runPromptEnhancementCliSubmitPopupV1`
 * over a REAL keyless prepare result (deterministic path, offline), with a fake
 * tab that scripts panel commands — so view projection, the command mailbox,
 * the synthesized edit_body, F2 smooth send and the terminal outcomes are all
 * proven against the engine's own popup logic, not a mock of it.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LogPort } from '../../core/ports/log.port.js';
import type { PendingPeRecord } from '../adapters/pe-pending-store.js';
import { buildBrowserPeRequest, prepareBrowserPe, type BrowserPeContext } from './pe-prepare.js';
import {
  buildPePanelView,
  deliverPePanelCommand,
  isPePopupOpen,
  runBrowserPePopup,
  runBrowserRatingPopup,
} from './pe-popup-host.js';
import { recordSignal, readSignals } from '../adapters/lifecycle-signals.js';
import { _resetIdentityInFlight } from '../adapters/rating-identity.js';
import type { PePanelCommandV1, PePanelViewV1 } from '../ui/pe-contract.js';

function makeLog(): { log: LogPort; events: Array<[string, Record<string, unknown> | undefined]> } {
  const events: Array<[string, Record<string, unknown> | undefined]> = [];
  const push = (key: string, data?: Record<string, unknown>) => { events.push([key, data]); };
  return { log: { debug: push, info: push, warn: push }, events };
}

const ROOT = 'https://bolt.new/~/sb1-pe-popup-test';

let record: PendingPeRecord;

beforeAll(async () => {
  const ctx: BrowserPeContext = {
    projectRoot: ROOT,
    promptText: 'add a login page with email and password to the app',
    sessionId: 'sess-popup-1',
    promptCount: 6,
    currentStage: 'implementation',
    prevStage: 'implementation',
    triggerKind: 'absence',
    effectiveFlagType: 'absence:tests_before_merge',
    firedKey: 'absence:tests_before_merge@implementation',
    triggerConfidence: 0.9,
    classifierState: 'fire_recommended',
    profile: null,
    configuredRole: 'founder',
    detectedLanguage: undefined,
    streamBOutputs: [],
    triggerEligibility: 'fresh_trigger_eligible',
    recentPromptRefs: ['prompt:3', 'prompt:4', 'prompt:5'],
  };
  const request = buildBrowserPeRequest(ctx);
  const prep = await prepareBrowserPe(request);
  if (prep.safeFallback) throw new Error('fixture prepare fell back — engine drift');
  record = {
    sessionId: 'sess-popup-1',
    promptCount: 6,
    status: 'pending',
    createdAt: 1000,
    request,
    result: prep.result,
  };
});

/**
 * A scripted tab: acks every show-pe render and answers each rendered view by
 * delivering the next command from the script (as the content script would).
 */
function scriptedTab(log: LogPort, commands: Array<(view: PePanelViewV1) => PePanelCommandV1 | null>): {
  sendToTab: (msg: unknown) => Promise<unknown>;
  views: PePanelViewV1[];
  sent: unknown[];
} {
  const views: PePanelViewV1[] = [];
  const sent: unknown[] = [];
  let step = 0;
  const sendToTab = async (msg: unknown): Promise<unknown> => {
    sent.push(msg);
    const m = msg as { type?: string; payload?: PePanelViewV1 };
    if (m.type !== 'nexpath:show-pe' || !m.payload) return { ok: true };
    const view = m.payload;
    views.push(view);
    const script = commands[step];
    if (script) {
      const command = script(view);
      step += 1;
      if (command) {
        // Deliver on the next tick — the loop must have registered its waiter.
        setTimeout(() => { deliverPePanelCommand(log, ROOT, view.viewSeq, command); }, 0);
      }
    }
    return { rendered: true };
  };
  return { sendToTab, views, sent };
}

describe('an uneditable body is never surfaced (CLI parity)', () => {
  /**
   * When the engine cannot compose enhanced wording it falls back to a
   * deterministic body and marks it read-only. The CLI does not show a popup in
   * that state, and a tester who met one in the browser concluded the whole
   * feature was broken — it refuses every keystroke and offers nothing to change.
   */
  function readOnlyRecord(): PendingPeRecord {
    const clone = structuredClone(record) as PendingPeRecord;
    const body = (clone.result as unknown as {
      uiView: { body: { fallbackMode: string } };
    }).uiView.body;
    body.fallbackMode = 'deterministic_body';
    return clone;
  }

  it('does not render, and reports not_shown with a reason', async () => {
    const { log } = makeLog();
    const { sendToTab, views } = scriptedTab(log, []);
    const onFirstRendered = vi.fn().mockResolvedValue(undefined);

    const { result: outcome } = await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record: readOnlyRecord(), sendToTab, onFirstRendered,
    });

    expect(outcome.state).toBe('not_shown');
    expect(outcome.state === 'not_shown' && outcome.reasonCodes).toContain('body_uneditable');
    expect(views).toHaveLength(0);          // nothing was ever pushed to the panel
    expect(onFirstRendered).not.toHaveBeenCalled(); // the pending row is untouched
  });

  it('an EDITABLE body still renders normally', async () => {
    const { log } = makeLog();
    const { sendToTab, views } = scriptedTab(log, [() => ({ type: 'close' })]);
    await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record,
      sendToTab, onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    expect(views.length).toBeGreaterThan(0);
  });
});

describe('runBrowserPePopup — the engine loop over the panel bridge', () => {
  it('renders the locked view shape and Use-enhanced (unedited) resolves selected_current with the engine body (F2 smooth send)', async () => {
    const { log } = makeLog();
    const onFirstRendered = vi.fn().mockResolvedValue(undefined);
    const { sendToTab, views } = scriptedTab(log, [
      (view) => ({ type: 'use_current', bodyText: view.bodyText }),
    ]);
    const { result: outcome, mpsFirstPopupSent } = await runBrowserPePopup({ log, projectRoot: ROOT, apiKey: null, record, sendToTab, onFirstRendered });

    expect(mpsFirstPopupSent).toBe(false);
    expect(outcome.state).toBe('selected_current');
    if (outcome.state !== 'selected_current') return;
    expect(outcome.bodyText.length).toBeGreaterThan(100);

    expect(onFirstRendered).toHaveBeenCalledTimes(1);
    expect(views.length).toBeGreaterThanOrEqual(1);
    const v = views[0]!;
    expect(v.title).toBe('Nexpath · Prompt enhancement');
    expect(v.editorHeading).toBe('Use enhanced prompt');
    expect(v.bodyText).toBe(outcome.bodyText);
    expect(v.bodyEditable).toBe(true);
    expect(v.viewSeq).toBe(1);
    // The engine's directional adjust row survives the whitelist projection.
    expect(v.directional.map((d) => d.actionType)).toEqual(
      expect.arrayContaining(['shorter', 'more_thorough', 'more_project_grounded']),
    );
    expect(isPePopupOpen(ROOT)).toBe(false); // mailbox torn down
  });

  it('an EDITED body goes through the engine edit path and comes back as the selected text', async () => {
    const { log } = makeLog();
    const edited = 'add a login page with email and password to the app, and write unit tests for the auth flow first';
    const { sendToTab } = scriptedTab(log, [
      (view) => ({ type: 'use_current', bodyText: `${view.bodyText}\n\nExtra constraint: ${edited}` }),
    ]);
    const { result: outcome } = await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record, sendToTab,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    expect(outcome.state).toBe('selected_current');
    if (outcome.state !== 'selected_current') return;
    expect(outcome.bodyText).toContain('Extra constraint:');
  });

  it('Use-original resolves selected_original; close resolves closed_no_send; the panel is told to close', async () => {
    for (const [command, expected] of [
      [{ type: 'use_original' }, 'selected_original'],
      [{ type: 'close' }, 'closed_no_send'],
    ] as const) {
      const { log } = makeLog();
      const { sendToTab, sent } = scriptedTab(log, [() => ({ ...command })]);
      const { result: outcome } = await runBrowserPePopup({
        log, projectRoot: ROOT, apiKey: null, record, sendToTab,
        onFirstRendered: vi.fn().mockResolvedValue(undefined),
      });
      expect(outcome.state).toBe(expected);
      expect(sent.some((m) => (m as { type?: string }).type === 'nexpath:pe-close')).toBe(true);
    }
  });

  it('an unreachable panel on the FIRST render resolves not_shown and never marks first-rendered', async () => {
    const { log } = makeLog();
    const onFirstRendered = vi.fn();
    const { result: outcome } = await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record,
      sendToTab: () => Promise.reject(new Error('no receiving end')),
      onFirstRendered,
    });
    expect(outcome).toMatchObject({ state: 'not_shown' });
    expect(onFirstRendered).not.toHaveBeenCalled();
    expect(isPePopupOpen(ROOT)).toBe(false);
  });

  it('a second popup for the same root while one is open resolves not_shown (double-open guard)', async () => {
    const { log } = makeLog();
    let releaseFirst: ((cmd: PePanelCommandV1) => void) | null = null;
    const holdTab = async (msg: unknown): Promise<unknown> => {
      const m = msg as { type?: string; payload?: PePanelViewV1 };
      if (m.type === 'nexpath:show-pe' && m.payload && !releaseFirst) {
        const seq = m.payload.viewSeq;
        releaseFirst = (cmd) => { deliverPePanelCommand(log, ROOT, seq, cmd); };
      }
      return { ok: true };
    };
    const first = runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record, sendToTab: holdTab,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    await vi.waitFor(() => expect(isPePopupOpen(ROOT)).toBe(true));
    const second = await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record, sendToTab: holdTab,
      onFirstRendered: vi.fn(),
    });
    expect(second.result).toMatchObject({ state: 'not_shown', reasonCodes: ['popup_already_open'] });
    releaseFirst!({ type: 'close' });
    await expect(first).resolves.toMatchObject({ result: { state: 'closed_no_send' } });
  });
});

describe('deliverPePanelCommand — mailbox discipline', () => {
  it('rejects commands with no live popup, an invalid shape, or a stale viewSeq', async () => {
    const { log, events } = makeLog();
    expect(deliverPePanelCommand(log, ROOT, 1, { type: 'close' })).toBe(false);
    expect(events.map(([k]) => k)).toContain('pe_command_no_popup');

    let liveSeq = 0;
    const tab = async (msg: unknown): Promise<unknown> => {
      const m = msg as { type?: string; payload?: PePanelViewV1 };
      if (m.type === 'nexpath:show-pe' && m.payload) {
        liveSeq = m.payload.viewSeq;
        setTimeout(() => {
          // Invalid shape and a stale seq are both dropped; the correct one lands.
          expect(deliverPePanelCommand(log, ROOT, liveSeq, { type: 'launch_missiles' })).toBe(false);
          expect(deliverPePanelCommand(log, ROOT, liveSeq + 7, { type: 'close' })).toBe(false);
          expect(deliverPePanelCommand(log, ROOT, liveSeq, { type: 'close' })).toBe(true);
        }, 0);
      }
      return { ok: true };
    };
    const { result: outcome } = await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record, sendToTab: tab,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    expect(outcome.state).toBe('closed_no_send');
    const names = events.map(([k]) => k);
    expect(names).toContain('pe_command_invalid');
    expect(names).toContain('pe_command_stale');
  });
});

describe('buildPePanelView — whitelist projection', () => {
  it('never leaks engine internals (session, identity ids, validation graphs) into the panel payload', async () => {
    const { log } = makeLog();
    const { sendToTab, views } = scriptedTab(log, [() => ({ type: 'close' })]);
    await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record, sendToTab,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    const v = views[0]! as unknown as Record<string, unknown>;
    for (const forbidden of ['session', 'identity', 'validationGraph', 'controls', 'model', 'request', 'result']) {
      expect(v[forbidden], `panel view must not carry "${forbidden}"`).toBeUndefined();
    }
    const json = JSON.stringify(v);
    expect(json).not.toContain('validationDecisionId');
    expect(json).not.toContain(record.result.enhancementId);
  });
});

// ── PB6: MPS-1 sequence offer ─────────────────────────────────────────────────
import { buildPromptEnhancementHandoffMetadataV1 } from '../../prompt-enhancement/handoff-metadata.js';
import {
  buildPromptEnhancementCliMpsIntakeEvidenceV1,
  evaluatePromptEnhancementMpsIntakeDecisionV1,
} from './pe-engine.js';
import { buildBrowserMpsOffer, buildPeSequenceOfferView } from './pe-popup-host.js';
import type { PeSequenceOfferViewV1 } from '../ui/pe-contract.js';

/** The PE fixture result with an engine-built sequence handoff grafted in —
 * the same construction the engine's own first-popup tests use. */
function sequenceRecord(): PendingPeRecord {
  const result = structuredClone(record.result);
  const handoff = buildPromptEnhancementHandoffMetadataV1({
    handoffDecisionId: `${result.enhancementId}:mps-handoff`,
    requestId: result.requestId,
    projectRoot: result.projectRoot,
    currentBody: result.currentBody,
    safetySummary: result.safetySummary,
    handoffKind: 'first_prompt_handoff_candidate',
    summary: {
      summaryId: `${result.enhancementId}:mps-summary`,
      publicSafeText: 'Two remaining setup tasks are available as metadata.',
      remainingTaskCount: 2,
      taskRoleLabels: ['database', 'deploy'],
    },
  });
  result.uiView = { ...result.uiView, handoffAndSequenceSummary: handoff };
  return { ...record, result };
}

describe('MPS-1 sequence offer (PB6 — popup-host order: offer first, PE after Esc)', () => {
  it('renders the offer view first; Send resolves selected_current with the sent text + the sequence identity', async () => {
    const { log } = makeLog();
    const rec = sequenceRecord();
    const { sendToTab, views } = scriptedTab(log, [
      (view) => {
        const offer = view as unknown as PeSequenceOfferViewV1;
        expect(offer.kind).toBe('sequence_offer');
        expect(offer.title).toBe('Nexpath · Multi-prompt sequence');
        expect(offer.remainingTaskCount).toBe(2);
        expect(offer.cancelLabel).toBe('Use original prompt');
        return { type: 'mps_send', bodyText: `${offer.bodyText} — edited before send` } as never;
      },
    ]);
    const outcome = await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record: rec, sequenceEnabled: true, sendToTab,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    expect(outcome.mpsFirstPopupSent).toBe(true);
    expect(outcome.result.state).toBe('selected_current');
    if (outcome.result.state !== 'selected_current') return;
    expect(outcome.result.bodyText).toContain('— edited before send');
    expect(outcome.mpsIdentity).toMatchObject({
      requestId: rec.result.requestId,
      currentBodyId: rec.result.currentBody.currentBodyId,
      bodyRevision: rec.result.currentBody.bodyRevision,
      remainingTaskCount: 2,
    });
    expect(views).toHaveLength(1); // the PE popup never opened
  });

  it('Esc (decline) falls through to the regular PE popup (CLI keyboard map)', async () => {
    const { log, events } = makeLog();
    const { sendToTab, views } = scriptedTab(log, [
      () => ({ type: 'mps_decline' }) as never,
      (view) => ({ type: 'use_original' }),
    ]);
    const outcome = await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record: sequenceRecord(), sequenceEnabled: true, sendToTab,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    expect(outcome.mpsFirstPopupSent).toBe(false);
    expect(outcome.result.state).toBe('selected_original');
    expect(views).toHaveLength(2);
    expect((views[0] as unknown as PeSequenceOfferViewV1).kind).toBe('sequence_offer');
    expect((views[1] as unknown as Record<string, unknown>)['kind']).toBeUndefined(); // the PE view
    expect(events.map(([, d]) => d?.['kind'])).toContain('mps_decline');
  });

  it('Cancel ENDS the flow — the PE popup never opens after a cancel (owner request 2026-08-06)', async () => {
    const { log, events } = makeLog();
    const { sendToTab, views } = scriptedTab(log, [
      () => ({ type: 'mps_cancel' }) as never,
    ]);
    const outcome = await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record: sequenceRecord(), sequenceEnabled: true, sendToTab,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    expect(outcome.mpsFirstPopupSent).toBe(false);
    expect(outcome.result.state).toBe('closed_no_send');
    expect(views).toHaveLength(1);
    expect(events.map(([, d]) => d?.['kind'])).toContain('mps_cancel');
  });

  it('a result with NO sequence handoff renders no offer (straight to the PE popup)', async () => {
    const { log } = makeLog();
    expect(buildBrowserMpsOffer(log, ROOT, record.result)).toBeNull();
  });

  it('FAIL-CLOSED pin: the extension_host surface stays blocked without the host_runtime evidence', () => {
    const rec = sequenceRecord();
    const cliEvidence = buildPromptEnhancementCliMpsIntakeEvidenceV1(rec.result);
    expect(cliEvidence).toBeDefined();
    const gate = evaluatePromptEnhancementMpsIntakeDecisionV1({
      surface: 'extension_host',
      evidence: cliEvidence ? [...cliEvidence] : undefined, // NO host_runtime row
    });
    expect(gate.renderPermission).toBe('mps_blocked_fail_closed');
    expect(gate.reasonCodes.join(',')).toContain('host_runtime');
  });

  it('the offer view is a whitelisted projection — no identity ids leak to the page', () => {
    const { log } = makeLog();
    const rec = sequenceRecord();
    const model = buildBrowserMpsOffer(log, ROOT, rec.result);
    expect(model).not.toBeNull();
    const view = buildPeSequenceOfferView(model!, 1);
    const json = JSON.stringify(view);
    expect(json).not.toContain(rec.result.currentBody.currentBodyId);
    expect(json).not.toContain(rec.result.requestId);
    expect(json).not.toContain('handoffDecisionId');
  });
});

describe('feedback v1 signal interception (PB5)', () => {
  it('feedback_suggested is logged as a content-free signal and does NOT enter the engine loop', async () => {
    const { log, events } = makeLog();
    let seq = 0;
    const tab = async (msg: unknown): Promise<unknown> => {
      const m = msg as { type?: string; payload?: PePanelViewV1 };
      if (m.type === 'nexpath:show-pe' && m.payload) {
        seq = m.payload.viewSeq;
        setTimeout(() => {
          // First a feedback command (must be consumed host-side, loop keeps
          // waiting on the SAME view), then the terminal close.
          deliverPePanelCommand(log, ROOT, seq, { type: 'feedback_suggested', category: 'not_relevant_enough' });
          setTimeout(() => { deliverPePanelCommand(log, ROOT, seq, { type: 'close' }); }, 0);
        }, 0);
      }
      return { ok: true };
    };
    const { result } = await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record, sendToTab: tab,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    expect(result.state).toBe('closed_no_send');
    const signal = events.find(([k, d]) => k === 'pe_action_signal' && d?.['kind'] === 'pe_feedback_suggested');
    expect(signal?.[1]).toMatchObject({ category: 'not_relevant_enough' });
    // Only ONE view was ever rendered — the feedback never caused an engine round-trip.
  });
});

describe('PB2 storage-quota sanity — realistic pending-PE payload size', () => {
  it('a real prepared record serializes well under the storage.local budget', () => {
    const serialized = JSON.stringify({
      sessionId: record.sessionId, promptCount: record.promptCount, status: 'pending',
      createdAt: record.createdAt, request: record.request, result: record.result,
    });
    const bytes = new TextEncoder().encode(serialized).length;
    // Realistic engine result today ≈ tens of KB. chrome.storage.local default
    // quota is 10 MB total; flag loudly (fail) if a contract change ever pushes
    // one row past 1 MB — the IDB fallback lever gets pulled then, not silently.
    expect(bytes).toBeGreaterThan(5_000);
    expect(bytes).toBeLessThan(1_000_000);
  });
});

describe('sequence master switch (CLI default parity — upstream defaulted sequences OFF, 2026-08-24)', () => {
  it('DEFAULT (switch absent): a sequence-carrying result skips the offer with a gated ring event and goes straight to the PE popup', async () => {
    const { log, events } = makeLog();
    const { sendToTab, views } = scriptedTab(log, [() => ({ type: 'use_original' })]);
    const outcome = await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record: sequenceRecord(), sendToTab,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    expect(outcome.mpsFirstPopupSent).toBe(false);
    expect(outcome.result.state).toBe('selected_original');
    expect(views).toHaveLength(1);
    expect((views[0] as unknown as Record<string, unknown>)['kind']).toBeUndefined(); // PE view, not the offer
    expect(events.map(([k]) => k)).toContain('pe_mps_gated_sequence_disabled');
  });

  it('exact-equality: sequenceEnabled must be true — a truthy non-true value still gates (A9)', async () => {
    const { log } = makeLog();
    const { sendToTab, views } = scriptedTab(log, [() => ({ type: 'close' })]);
    await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record: sequenceRecord(),
      sequenceEnabled: 1 as unknown as boolean, sendToTab,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    expect((views[0] as unknown as Record<string, unknown>)['kind']).toBeUndefined();
  });

  it('a result with NO handoff never logs the gated event (the gate is sequence-scoped)', async () => {
    const { log, events } = makeLog();
    const { sendToTab } = scriptedTab(log, [() => ({ type: 'close' })]);
    await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record, sendToTab,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    expect(events.map(([k]) => k)).not.toContain('pe_mps_gated_sequence_disabled');
  });
});

describe('edit_body command (the dock\'s CLI-parity local details merge)', () => {
  it('an explicit edit_body flows through the ENGINE\'s edit path and the merged text is what a later send carries', async () => {
    const { log } = makeLog();
    const merged = 'Enhanced base\n\nAdditional details to incorporate:\nkeep the retry helper';
    const { sendToTab } = scriptedTab(log, [
      () => ({ type: 'edit_body', bodyText: merged } as never),
      () => ({ type: 'use_current', bodyText: merged }),
    ]);
    const { result } = await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record, sendToTab,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    expect(result.state).toBe('selected_current');
    if (result.state !== 'selected_current') return;
    expect(result.bodyText).toContain('keep the retry helper');
  });
});

describe('feedback persistence — PE-BR-11 closed (the CLI feedback store, browser-side)', () => {
  function memoryStore(): { getKey(n: string): Promise<string | null>; setKey(n: string, v: string): Promise<void>; data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
      data,
      getKey: async (n: string) => data.get(n) ?? null,
      setKey: async (n: string, v: string) => { data.set(n, v); },
    };
  }

  it('feedback_other persists the ENGINE-shaped event — content-free, exactly what the CLI stores (the typed text stays transient, feedback-adapter.ts:72)', async () => {
    const { log, events } = makeLog();
    const store = memoryStore();
    let seq = 0;
    const tab = async (msg: unknown): Promise<unknown> => {
      const m = msg as { type?: string; payload?: PePanelViewV1 };
      if (m.type === 'nexpath:show-pe' && m.payload) {
        seq = m.payload.viewSeq;
        setTimeout(() => {
          deliverPePanelCommand(log, ROOT, seq, { type: 'feedback_other', text: 'needs my project names' });
          setTimeout(() => { deliverPePanelCommand(log, ROOT, seq, { type: 'use_original' }); }, 0);
        }, 0);
      }
      return { ok: true };
    };
    const { result } = await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record, sendToTab: tab,
      feedbackStore: store,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    expect(result.state).toBe('selected_original');
    const raw = store.data.get('nexpath_pe_feedback_events');
    expect(raw).toBeTruthy();
    const list = JSON.parse(raw!) as Array<{ at: number; event: Record<string, unknown> }>;
    expect(list).toHaveLength(1);
    const eventJson = JSON.stringify(list[0]!.event);
    expect(eventJson).toContain('"feedbackCategory":"custom_typed"');      // the CLI's event shape
    expect(eventJson).not.toContain('needs my project names');             // the CLI never persists the text either
    const signal = events.find(([k, d]) => k === 'pe_action_signal' && d?.['kind'] === 'pe_feedback_other');
    expect(signal?.[1]).toMatchObject({ category: 'custom_typed', chars: 22, stored: true });
    expect(JSON.stringify(signal?.[1])).not.toContain('needs my project names'); // ring stays content-free
  });

  it('feedback_suggested persists as a category event through the same store', async () => {
    const { log } = makeLog();
    const store = memoryStore();
    let seq = 0;
    const tab = async (msg: unknown): Promise<unknown> => {
      const m = msg as { type?: string; payload?: PePanelViewV1 };
      if (m.type === 'nexpath:show-pe' && m.payload) {
        seq = m.payload.viewSeq;
        setTimeout(() => {
          deliverPePanelCommand(log, ROOT, seq, { type: 'feedback_suggested', category: 'too_much_or_too_long' });
          setTimeout(() => { deliverPePanelCommand(log, ROOT, seq, { type: 'close' }); }, 0);
        }, 0);
      }
      return { ok: true };
    };
    await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record, sendToTab: tab,
      feedbackStore: store,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    const list = JSON.parse(store.data.get('nexpath_pe_feedback_events')!) as Array<{ event: unknown }>;
    expect(JSON.stringify(list[0]!.event)).toContain('too_much_or_too_long');
  });
  /**
   * CLI parity for the per-action signals (§4.2). The CLI wires its
   * `actionSignalSink` to the STORE — `auto.ts:841`,
   * `prompt-enhancement-popup-host.ts:216`, `:259`, `stop.ts:817`, `:899`. The
   * browser used to wire it to `log.debug` alone, so every action was observable
   * for a moment and then gone, and the flush had nothing to send.
   *
   * A wire test, because losing the call again would look like nothing: no error,
   * no failing assertion, just lifecycle events that never arrive.
   */
  it('⭐ a popup action is BUFFERED, not merely logged — the CLI records these', async () => {
    const { log } = makeLog();
    const store = memoryStore();
    let seq = 0;
    const tab = async (msg: unknown): Promise<unknown> => {
      const m = msg as { type?: string; payload?: PePanelViewV1 };
      if (m.type === 'nexpath:show-pe' && m.payload) {
        seq = m.payload.viewSeq;
        setTimeout(() => { deliverPePanelCommand(log, ROOT, seq, { type: 'use_original' }); }, 0);
      }
      return { ok: true };
    };

    await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record, sendToTab: tab,
      feedbackStore: store,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });

    // The sink is fire-and-forget (`void recordSignal(...)`) and the buffer's
    // writes are serialised, so the write lands a microtask or two after the
    // popup resolves. Waiting for it is the honest assertion; asserting
    // immediately would only pass by accident of scheduling.
    await vi.waitFor(() => expect(store.data.get('nexpath_lifecycle_signals')).toBeTruthy());

    const raw = store.data.get('nexpath_lifecycle_signals');
    const signals = JSON.parse(raw!) as Array<{ kind: string; occurredAt: number }>;
    expect(signals.map((s) => s.kind)).toContain('pe_use_original');
    for (const s of signals) {
      expect(Object.keys(s).sort()).toEqual(['kind', 'occurredAt']);   // content-free
      expect(typeof s.occurredAt).toBe('number');
    }
  });

  /**
   * The details merge — the one browser action whose signal was missing.
   *
   * The CLI's Enter on "Additional details" sends `apply_details` and the engine
   * maps it to `pe_apply_details`. The browser's dock merges locally and sends
   * `edit_body`, which is NOT in that map (in the CLI it means an inline body
   * edit), so the action was recorded on one surface and not the other.
   */
  it('⭐ a details merge records pe_apply_details — the CLI records it, so the browser must too', async () => {
    const { log } = makeLog();
    const store = memoryStore();
    let shows = 0;
    const tab = async (msg: unknown): Promise<unknown> => {
      const m = msg as { type?: string; payload?: PePanelViewV1 };
      if (m.type === 'nexpath:show-pe' && m.payload) {
        const seq = m.payload.viewSeq;
        shows += 1;
        // First frame: merge details. Second frame (the engine's echo): finish.
        const cmd: PePanelCommandV1 = shows === 1
          ? { type: 'edit_body', bodyText: 'body plus the merged details' }
          : { type: 'use_original' };
        setTimeout(() => { deliverPePanelCommand(log, ROOT, seq, cmd); }, 0);
      }
      return { ok: true };
    };

    await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record, sendToTab: tab,
      feedbackStore: store,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });

    await vi.waitFor(() => {
      const raw = store.data.get('nexpath_lifecycle_signals');
      expect(raw).toBeTruthy();
      expect(JSON.parse(raw!).map((s: { kind: string }) => s.kind)).toContain('pe_apply_details');
    });
  });

  it('with no store wired, an action still completes — buffering is best-effort', async () => {
    const { log } = makeLog();
    let seq = 0;
    const tab = async (msg: unknown): Promise<unknown> => {
      const m = msg as { type?: string; payload?: PePanelViewV1 };
      if (m.type === 'nexpath:show-pe' && m.payload) {
        seq = m.payload.viewSeq;
        setTimeout(() => { deliverPePanelCommand(log, ROOT, seq, { type: 'use_original' }); }, 0);
      }
      return { ok: true };
    };

    const { result } = await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record, sendToTab: tab,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.state).toBe('selected_original');
  });
});

describe('⭐ wrong-stage rating command', () => {
  it('a rating command must NOT close the PE popup', async () => {
    const { log } = makeLog();
    let seq = 0;
    const tab = async (msg: unknown): Promise<unknown> => {
      const m = msg as { type?: string; payload?: PePanelViewV1 };
      if (m.type === 'nexpath:show-pe' && m.payload) {
        seq = m.payload.viewSeq;
        setTimeout(() => {
          deliverPePanelCommand(log, ROOT, seq, { type: 'rating', rating: 3 });
          setTimeout(() => { deliverPePanelCommand(log, ROOT, seq, { type: 'use_original' }); }, 0);
        }, 0);
      }
      return { ok: true };
    };
    const { result } = await runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record, sendToTab: tab,
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    expect(result.state).toBe('selected_original');
  });
});

// ── the rating popup loop (Phase 5) ─────────────────────────────────────────

describe('runBrowserRatingPopup', () => {
  /** A storage.local stand-in; the same shape the other suites here use. */
  function memoryStore() {
    const data = new Map<string, string>();
    return {
      data,
      getKey: async (n: string) => data.get(n) ?? null,
      setKey: async (n: string, v: string) => { data.set(n, v); },
    };
  }

  beforeEach(() => { _resetIdentityInFlight(); });

  /** Records every POST so the tests assert the real envelope, not a mock. */
  function wire(ok = true) {
    const posts: Record<string, unknown>[] = [];
    const fetch = (async (_url: string, init: { body: string }) => {
      posts.push(JSON.parse(init.body) as Record<string, unknown>);
      return { ok, status: ok ? 200 : 500 };
    }) as never;
    return { fetch, posts, events: () => posts.map((p) => p['event'] as string) };
  }

  /** Show the popup and answer it with `command` once the view has gone out. */
  async function run(
    command: unknown,
    opts: { ok?: boolean; seq?: number; store?: ReturnType<typeof memoryStore>; failPush?: boolean } = {},
  ) {
    const { log, events } = makeLog();
    const store = opts.store ?? memoryStore();
    const w = wire(opts.ok ?? true);
    const sent: unknown[] = [];
    const sendToTab = async (msg: unknown): Promise<unknown> => {
      sent.push(msg);
      const m = msg as { type?: string; payload?: { viewSeq: number } };
      if (m.type === 'nexpath:show-rating') {
        if (opts.failPush) throw new Error('no content script');
        const seq = opts.seq ?? m.payload!.viewSeq;
        if (command !== null) setTimeout(() => { deliverPePanelCommand(log, ROOT, seq, command); }, 0);
      }
      return { ok: true };
    };

    const outcome = await runBrowserRatingPopup({
      log, projectRoot: ROOT, store, sendToTab, fetch: w.fetch, now: () => 1_700_000_000_000,
    });
    return { outcome, store, posts: w.posts, events: w.events(), sent, logEvents: events };
  }

  it('⭐ a selection sends the rating and marks the popup shown', async () => {
    const { outcome, store, events, posts } = await run({ type: 'rating', rating: 3 });

    expect(outcome).toEqual({ state: 'rated', rating: 3 });
    expect(events).toContain('feedback_submitted');
    const rating = posts.find((p) => p['event'] === 'feedback_submitted');
    expect((rating!['properties'] as Record<string, unknown>)['rating']).toBe(3);
    expect(store.data.get('feedback_last_shown_at')).toBe('1700000000000');
  });

  it('⭐ the lifecycle buffer is flushed BEFORE the rating — denominator first', async () => {
    const store = memoryStore();
    await recordSignal(store, 'pe_shorter', 1_699_999_000_000);

    const { events } = await run({ type: 'rating', rating: 4 }, { store });

    // install event, then the buffered action, then the rating — in that order.
    // The per-option event (r16) trails the rating on the same consent.
    expect(events.slice(-2)).toEqual(['feedback_submitted', 'feedback_rating_excellent']);
    expect(events).toContain('pe_shorter');
    expect(events.indexOf('pe_shorter')).toBeLessThan(events.indexOf('feedback_submitted'));
    expect(await readSignals(store)).toEqual([]);      // pruned after their sends
  });

  it('⭐ a dismissal reports ONLY the dismissal — no rating, no flush', async () => {
    const store = memoryStore();
    await recordSignal(store, 'pe_close', 1_699_999_000_000);

    const { outcome, posts, events } = await run({ type: 'close' }, { store });

    expect(outcome).toEqual({ state: 'dismissed' });
    // Exactly one envelope: the dismissal. Not the rating, and NOT the buffer —
    // releasing that is what the rating click consents to (§4.2).
    expect(events).toEqual(['feedback_dismissed']);
    const props = posts[0]!['properties'] as Record<string, unknown>;
    expect(Object.keys(props).sort())
      .toEqual(['$lib', '$lib_version', 'dismissed_at', 'installation_id', 'surface']);
    expect(store.data.get('feedback_last_shown_at')).toBe('1700000000000');
    expect(await readSignals(store)).toHaveLength(1);   // the buffer is untouched
  });

  it('⭐ a failed push marks NOTHING shown — §4.1 M3, cadence is not spent on a popup nobody saw', async () => {
    const { outcome, store, posts } = await run(null, { failPush: true });

    expect(outcome).toEqual({ state: 'not_shown', reasonCodes: ['panel_unreachable'] });
    expect(store.data.get('feedback_last_shown_at')).toBeUndefined();
    expect(posts).toEqual([]);
  });

  it('⭐ a command with a stale viewSeq is dropped, not acted on', async () => {
    // §4.1 M1: the seq guard is why the view carries one and the box expects it
    // before the push. A stale reply must not send a rating.
    const store = memoryStore();
    const { log } = makeLog();
    const sendToTab = async (msg: unknown): Promise<unknown> => {
      const m = msg as { type?: string };
      if (m.type === 'nexpath:show-rating') {
        setTimeout(() => {
          // wrong seq first — dropped; then the right one
          deliverPePanelCommand(log, ROOT, 99, { type: 'rating', rating: 1 });
          deliverPePanelCommand(log, ROOT, 1, { type: 'rating', rating: 4 });
        }, 0);
      }
      return { ok: true };
    };
    const w = wire();

    const outcome = await runBrowserRatingPopup({
      log, projectRoot: ROOT, store, sendToTab, fetch: w.fetch, now: () => 1_700_000_000_000,
    });

    expect(outcome).toEqual({ state: 'rated', rating: 4 });   // NOT 1
    const rating = w.posts.find((p) => p['event'] === 'feedback_submitted');
    expect((rating!['properties'] as Record<string, unknown>)['rating']).toBe(4);
  });

  it('⭐ refuses to open when a PE popup already owns the root — §4.1 M2', async () => {
    const { log } = makeLog();
    const store = memoryStore();
    let release: (() => void) | undefined;
    const held = new Promise<void>((r) => { release = r; });

    // A PE popup holding the mailbox for ROOT.
    const pe = runBrowserPePopup({
      log, projectRoot: ROOT, apiKey: null, record,
      sendToTab: async (msg: unknown) => {
        const m = msg as { type?: string; payload?: PePanelViewV1 };
        if (m.type === 'nexpath:show-pe' && m.payload) {
          const seq = m.payload.viewSeq;
          void held.then(() => { deliverPePanelCommand(log, ROOT, seq, { type: 'close' }); });
        }
        return { ok: true };
      },
      onFirstRendered: vi.fn().mockResolvedValue(undefined),
    });
    await vi.waitFor(() => expect(isPePopupOpen(ROOT)).toBe(true));

    const outcome = await runBrowserRatingPopup({
      log, projectRoot: ROOT, store,
      sendToTab: async () => ({ ok: true }),
      now: () => 1_700_000_000_000,
    });

    expect(outcome).toEqual({ state: 'not_shown', reasonCodes: ['popup_already_open'] });
    expect(store.data.get('feedback_last_shown_at')).toBeUndefined();  // no cadence spent
    release!();
    await pe;
  });

  it('releases the mailbox afterwards, so the next stop can open one', async () => {
    await run({ type: 'rating', rating: 2 });
    expect(isPePopupOpen(ROOT)).toBe(false);
  });

  it('closes the panel on the way out', async () => {
    const { sent } = await run({ type: 'close' });
    expect((sent as { type?: string }[]).some((m) => m.type === 'nexpath:pe-close')).toBe(true);
  });
});
