// @vitest-environment jsdom
/**
 * The rating popup, end to end — every layer this feature crosses, wired to the
 * real thing.
 *
 * Every other test in this feature is per-LAYER: the cadence knows nothing about
 * the surface, the surface nothing about the sender. That leaves the seams
 * untested, and a seam is where this kind of feature dies — a view whose
 * `viewSeq` the mailbox drops, a command the dock never emits, a flush that runs
 * after the send instead of before. All of those pass a layer test and produce a
 * popup that does nothing.
 *
 * So this file mocks NOTHING of its own code. It uses the real cadence, the real
 * signal buffer, the real popup host and mailbox, the real dock adapter, the real
 * surface controller and view (rendered into jsdom), and the real sender. Only
 * two things are stand-ins, and both are things the browser itself provides:
 * `storage.local` (a Map) and `fetch` (a recorder).
 *
 * The chain each test drives:
 *
 *   cadence eligible ─▶ runBrowserRatingPopup ─▶ show-rating ─▶ dock adapter
 *        ▲                                                          │
 *        │                                                    real DOM click
 *   markFeedbackShown ◀─ sendRating ◀─ flushLifecycle ◀─ deliverPePanelCommand
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { recordActivity, isFeedbackEligible, markFeedbackShown } from './adapters/rating-cadence.js';
import { recordSignal, readSignals } from './adapters/lifecycle-signals.js';
import { _resetIdentityInFlight } from './adapters/rating-identity.js';
import { runBrowserRatingPopup, deliverPePanelCommand, isPePopupOpen } from './background/pe-popup-host.js';
import { mountNexpathPeDock } from './ui/pe-dock-adapter.js';
import type { PePanelControllerV1, PePanelEventV1, PeRatingViewV1 } from './ui/pe-contract.js';
import type { LogPort } from '../core/ports/log.port.js';

const ROOT = 'https://bolt.new/~/project';
const T0 = 1_700_000_000_000;

const log: LogPort = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as LogPort;

/** The extension's storage.local, as the adapters actually use it. */
function store() {
  const data = new Map<string, string>();
  return {
    data,
    getKey: async (n: string) => data.get(n) ?? null,
    setKey: async (n: string, v: string) => { data.set(n, v); },
  };
}

/** Records every envelope that would reach PostHog, in order. */
function wire(ok = true) {
  const posts: Record<string, unknown>[] = [];
  const fetch = (async (_url: string, init: { body: string }) => {
    posts.push(JSON.parse(init.body) as Record<string, unknown>);
    return { ok, status: ok ? 200 : 500 };
  }) as never;
  return { fetch, posts, events: () => posts.map((p) => p['event'] as string) };
}

/**
 * The content script's job, done for real: take the worker's `show-rating`, mount
 * the dock, render the view through it, and post the panel's commands back into
 * the worker's mailbox.
 */
/**
 * Mounted docks, torn down after each test.
 *
 * `dock.ts:366` keeps `current` at MODULE level (the D1.5 re-attach guard), so a
 * second `mountNexpathDock` hands back the first — detached, with no new shadow
 * root — and every later test sees an empty page. Destroying releases it.
 */
let liveAdapters: PePanelControllerV1[] = [];

function mountFor(root: string): PePanelControllerV1 {
  const a = mountNexpathPeDock({
    onEvent: (e: PePanelEventV1) => {
      if (e.type === 'command') deliverPePanelCommand(log, root, e.viewSeq, e.command);
    },
  });
  liveAdapters.push(a);
  return a;
}

function contentScript(root: string = ROOT): { sendToTab: (m: unknown) => Promise<unknown>; adapter: () => PePanelControllerV1 | null } {
  let adapter: PePanelControllerV1 | null = null;
  const sendToTab = async (msg: unknown): Promise<unknown> => {
    const m = msg as { type?: string; payload?: PeRatingViewV1 };
    if (m.type === 'nexpath:show-rating' && m.payload) {
      adapter ??= mountFor(root);
      adapter.show(m.payload);
    }
    if (m.type === 'nexpath:pe-close') adapter?.hide();
    return { ok: true };
  };
  return { sendToTab, adapter: () => adapter };
}

/** The surface DOM, reached the way the dock exposes it. */
let shadowRoots: ShadowRoot[];
const realAttachShadow = HTMLElement.prototype.attachShadow;

function surfaceEl(): HTMLElement {
  return shadowRoots.at(-1)!.querySelector('.np-surface-root') as HTMLElement;
}
function rowByLabel(label: string): HTMLElement {
  const hit = [...surfaceEl().querySelectorAll('.np-row')].find((r) => r.textContent?.includes(label));
  if (!hit) throw new Error(`no row containing "${label}"`);
  return hit as HTMLElement;
}

beforeEach(() => {
  document.body.innerHTML = '';
  shadowRoots = [];
  HTMLElement.prototype.attachShadow = function (init: ShadowRootInit): ShadowRoot {
    const root = realAttachShadow.call(this, init);
    shadowRoots.push(root);
    return root;
  };
  _resetIdentityInFlight();
  vi.clearAllMocks();
});

afterEach(() => {
  for (const a of liveAdapters.splice(0)) { try { a.destroy(); } catch { /* already gone */ } }
  HTMLElement.prototype.attachShadow = realAttachShadow;
});

describe('rating popup — end to end', () => {
  it('⭐ two hours of use, a rating clicked, and the whole chain reports', async () => {
    const s = store();
    const w = wire();

    // 1. The worker feeds cadence on each submit, as service-worker.ts does.
    //    Fifteen minutes at a time, because a longer gap is an idle break.
    for (let i = 0; i <= 8; i++) await recordActivity(s, T0 + i * 15 * 60_000);
    const at = T0 + 8 * 15 * 60_000;
    expect(await isFeedbackEligible(s, at)).toBe(true);   // the gate would open

    // 2. The user did things in the PE popup along the way; those buffered.
    await recordSignal(s, 'pe_shorter', at - 60_000);
    await recordSignal(s, 'pe_apply_details', at - 30_000);

    // 3. The stop handler opens the rating. The content script renders it for real.
    const cs = contentScript();
    const run = runBrowserRatingPopup({
      log, projectRoot: ROOT, store: s, sendToTab: cs.sendToTab, fetch: w.fetch, now: () => at,
    });

    // 4. It is on screen — the real surface, in the real dock.
    await vi.waitFor(() => expect(surfaceEl()).toBeTruthy());
    const text = surfaceEl().textContent ?? '';
    expect(text).toContain("How's nexpath working out for you?");
    expect(text).toContain('no prompt text');
    for (const l of ['Bad', 'Fine', 'Good', 'Excellent']) expect(text).toContain(l);

    // 5. The user clicks Good.
    rowByLabel('Good').click();
    const outcome = await run;

    expect(outcome).toEqual({ state: 'rated', rating: 3 });

    // 6. EVERY event, in the order the wire saw them. The buffer is released
    //    first — a numerator must not arrive before its denominator.
    expect(w.events()).toEqual([
      'nexpath_installed',
      'pe_shorter',
      'pe_apply_details',
      'feedback_submitted',
      'feedback_rating_good',      // the same answer under its own name (r16)
    ]);

    // The two rating envelopes carry the SAME payload — either can answer the
    // same question; only the event name differs.
    const rating = w.posts.find((p) => p['event'] === 'feedback_submitted')!;
    const named  = w.posts.find((p) => p['event'] === 'feedback_rating_good')!;
    expect(named['properties']).toEqual(rating['properties']);
    const props = rating['properties'] as Record<string, unknown>;
    expect(props['rating']).toBe(3);
    expect(props['surface']).toBe('browser');
    expect(props['$lib']).toBe('nexpath');

    // 7. One installation id across every envelope, and nothing else identifying.
    const ids = new Set(w.posts.map((p) => p['distinct_id']));
    expect(ids.size).toBe(1);

    // 8. The buffer is drained and the cadence reset — no second ask this window.
    expect(await readSignals(s)).toEqual([]);
    expect(await isFeedbackEligible(s, at)).toBe(false);
    expect(isPePopupOpen(ROOT)).toBe(false);           // mailbox released
  });

  it('⭐ nothing a user typed can reach the wire', async () => {
    const s = store();
    const w = wire();
    await recordSignal(s, 'pe_close', T0);

    const cs = contentScript();
    const run = runBrowserRatingPopup({
      log, projectRoot: ROOT, store: s, sendToTab: cs.sendToTab, fetch: w.fetch, now: () => T0,
    });
    await vi.waitFor(() => expect(surfaceEl()).toBeTruthy());
    rowByLabel('Excellent').click();
    await run;

    const body = JSON.stringify(w.posts);
    for (const secret of [ROOT, 'bolt.new', 'project', 'How\'s nexpath']) {
      expect(body).not.toContain(secret);
    }
    // Only these property names ever appear.
    const ALLOWED = new Set(['$lib', '$lib_version', 'surface', 'installation_id',
      'rating', 'feedback_at', 'installed_at', 'action_ts']);
    for (const p of w.posts) {
      for (const k of Object.keys(p['properties'] as Record<string, unknown>)) {
        expect(ALLOWED.has(k)).toBe(true);
      }
    }
  });

  it('⭐ Escape sends nothing and keeps the buffer for a later consent', async () => {
    const s = store();
    const w = wire();
    await recordSignal(s, 'mps_send', T0);

    const cs = contentScript();
    const run = runBrowserRatingPopup({
      log, projectRoot: ROOT, store: s, sendToTab: cs.sendToTab, fetch: w.fetch, now: () => T0,
    });
    await vi.waitFor(() => expect(surfaceEl()).toBeTruthy());

    surfaceEl().dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape', bubbles: true, composed: true, cancelable: true,
    }));

    expect(await run).toEqual({ state: 'dismissed' });
    // One envelope, and it is the dismissal — the buffered mps_send is NOT
    // released, because only the rating click consents to that.
    expect(w.events()).toEqual(['feedback_dismissed']);
    expect(await readSignals(s)).toHaveLength(1);      // still there for next time
    expect(s.data.get('feedback_last_shown_at')).toBe(String(T0));  // but asked
  });

  it('a failed network leaves the buffer intact and still marks the popup shown', async () => {
    const s = store();
    const w = wire(false);                             // every POST fails
    await recordSignal(s, 'pe_use_original', T0);

    const cs = contentScript();
    const run = runBrowserRatingPopup({
      log, projectRoot: ROOT, store: s, sendToTab: cs.sendToTab, fetch: w.fetch, now: () => T0,
    });
    await vi.waitFor(() => expect(surfaceEl()).toBeTruthy());
    rowByLabel('Bad').click();

    expect(await run).toEqual({ state: 'rated', rating: 1 });
    expect(await readSignals(s)).toHaveLength(1);      // nothing pruned on failure
    expect(s.data.get('feedback_last_shown_at')).toBe(String(T0));  // not re-asked
  });

  it.each(['https://bolt.new/~/p', 'https://replit.com/@u/p', 'https://lovable.dev/projects/p'])(
    'runs the same on %s — the flow is site-agnostic',
    async (root) => {
      const s = store();
      const w = wire();
      const cs = contentScript(root);

      const run = runBrowserRatingPopup({
        log, projectRoot: root, store: s, sendToTab: cs.sendToTab, fetch: w.fetch, now: () => T0,
      });
      await vi.waitFor(() => expect(surfaceEl()).toBeTruthy());
      rowByLabel('Fine').click();

      expect(await run).toEqual({ state: 'rated', rating: 2 });
      expect(w.events()).toContain('feedback_submitted');
      expect(isPePopupOpen(root)).toBe(false);
    },
  );
});

/**
 * Every event this extension can emit, driven through the real chain in one run.
 *
 * The suite above proves the SEAMS hold; this proves the INVENTORY is complete —
 * that each of the eleven live events reaches the wire with the right name and
 * the right shape, and that the six that exist in code but are unreachable stay
 * unreachable.
 */
describe('the whole event inventory', () => {
  /** The nine action kinds a browser user can actually produce. */
  const LIVE_ACTIONS = [
    'pe_use_current', 'pe_use_original', 'pe_apply_details', 'pe_close',
    'mps_send', 'mps_cancel', 'mps_decline', 'mps_interruption', 'mps_apply_details',
  ] as const;

  /** In the code, but no browser UI can reach them — see the commit for why. */
  const UNREACHABLE = [
    'pe_shorter', 'pe_more_thorough', 'pe_more_project_grounded', 'pe_back',
    'advisory_fired', 'option_selected',
  ] as const;

  it('⭐ all eleven live events reach the wire, each with the right shape', async () => {
    const s = store();
    const w = wire();

    // Nine actions, buffered by the real buffer exactly as the popup host does.
    for (const [i, kind] of LIVE_ACTIONS.entries()) {
      await recordSignal(s, kind, T0 - 10_000 + i);
    }

    const cs = contentScript();
    const run = runBrowserRatingPopup({
      log, projectRoot: ROOT, store: s, sendToTab: cs.sendToTab, fetch: w.fetch, now: () => T0,
    });
    await vi.waitFor(() => expect(surfaceEl()).toBeTruthy());
    rowByLabel('Excellent').click();
    expect(await run).toEqual({ state: 'rated', rating: 4 });

    // ── 1. Every one of the eleven, in the order the wire saw them ──────────
    expect(w.events()).toEqual([
      'nexpath_installed',
      ...LIVE_ACTIONS,
      'feedback_submitted',
      'feedback_rating_excellent',
    ]);

    // ── 2. Each carries what it should, and nothing more ───────────────────
    const byEvent = new Map(w.posts.map((p) => [p['event'] as string, p]));
    const props = (name: string) => byEvent.get(name)!['properties'] as Record<string, unknown>;
    const COMMON = ['$lib', '$lib_version', 'installation_id', 'surface'];

    expect(Object.keys(props('nexpath_installed')).sort())
      .toEqual([...COMMON, 'installed_at'].sort());

    expect(Object.keys(props('feedback_submitted')).sort())
      .toEqual([...COMMON, 'feedback_at', 'rating'].sort());
    expect(props('feedback_submitted')['rating']).toBe(4);

    for (const kind of LIVE_ACTIONS) {
      expect(Object.keys(props(kind)).sort(), kind)
        .toEqual([...COMMON, 'action_ts'].sort());
      expect(props(kind)['surface'], kind).toBe('browser');
      expect(props(kind)['$lib'], kind).toBe('nexpath');
    }

    // ── 3. Backdated, not stamped at flush time ────────────────────────────
    for (const [i, kind] of LIVE_ACTIONS.entries()) {
      expect(props(kind)['action_ts'], kind).toBe(T0 - 10_000 + i);
      expect(byEvent.get(kind)!['timestamp'], kind)
        .toBe(new Date(T0 - 10_000 + i).toISOString());
    }

    // ── 4. Nothing unreachable slipped in ──────────────────────────────────
    for (const kind of UNREACHABLE) expect(w.events(), kind).not.toContain(kind);

    // ── 5. One identity, and the buffer is empty afterwards ────────────────
    expect(new Set(w.posts.map((p) => p['distinct_id'])).size).toBe(1);
    expect(await readSignals(s)).toEqual([]);
  });

  it('⭐ the install event fires ONCE, however many ratings follow', async () => {
    const s = store();

    for (const round of [1, 2, 3]) {
      const w = wire();
      await recordSignal(s, 'pe_close', T0 + round);
      // A fresh window each time: cadence is reset by the previous rating.
      await markFeedbackShown(s, T0 - 10 * 24 * 60 * 60_000);
      const cs = contentScript();
      const run = runBrowserRatingPopup({
        log, projectRoot: ROOT, store: s, sendToTab: cs.sendToTab, fetch: w.fetch, now: () => T0 + round,
      });
      await vi.waitFor(() => expect(surfaceEl()).toBeTruthy());
      rowByLabel('Fine').click();
      await run;

      const installs = w.events().filter((e) => e === 'nexpath_installed').length;
      expect(installs, `round ${round}`).toBe(round === 1 ? 1 : 0);
      expect(w.events()).toContain('feedback_submitted');
      for (const a of liveAdapters.splice(0)) a.destroy();
    }
  });

  it('a signal recorded while the popup is open still goes out on the NEXT rating', async () => {
    const s = store();
    const first = wire();
    const cs = contentScript();
    const run = runBrowserRatingPopup({
      log, projectRoot: ROOT, store: s, sendToTab: cs.sendToTab, fetch: first.fetch, now: () => T0,
    });
    await vi.waitFor(() => expect(surfaceEl()).toBeTruthy());
    await recordSignal(s, 'mps_decline', T0);          // arrives mid-popup
    rowByLabel('Bad').click();
    await run;

    // It may or may not have made this flush — but it must not be LOST.
    const sentNow = first.events().includes('mps_decline');
    const stillBuffered = (await readSignals(s)).some((x) => x.kind === 'mps_decline');
    expect(sentNow || stillBuffered).toBe(true);
  });
});
