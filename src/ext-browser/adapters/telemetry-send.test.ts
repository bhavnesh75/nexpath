import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildEnvelope, sendRating, sendRatingOption, sendInstalled, sendAdvisoryFired, sendOptionSelected,
  flushLifecycle,
  POSTHOG_ENDPOINT, POSTHOG_API_KEY, POSTHOG_LIB_NAME, POSTHOG_LIB_VERSION, SURFACE,
  FEEDBACK_EVENT, FEEDBACK_DISMISSED_EVENT, FEEDBACK_RATING_EVENTS, feedbackRatingEvent, EVENT_INSTALLED, EVENT_ADVISORY_FIRED, EVENT_OPTION_SELECTED,
  sendActionEvent,
  type FetchLike, type TelemetryKeyStore,
} from './telemetry-send.js';
import {
  recordSignal, readSignals, KEY_INSTALLED_AT, KEY_INSTALLED_EVENT_SENT,
  SIGNAL_ADVISORY_FIRED, SIGNAL_OPTION_SELECTED, ACTION_SIGNAL_KINDS,
} from './lifecycle-signals.js';
import { _resetIdentityInFlight, KEY_INSTALLATION_ID } from './rating-identity.js';
import { RATING_SCALE } from '../ui/surfaces/fixtures/rating.js';

const T0 = 1_700_000_000_000;
const ID = 'fixed-installation-id';

function memStore(seed: Record<string, string> = {}) {
  const data: Record<string, string> = { [KEY_INSTALLATION_ID]: ID, ...seed };
  const store: TelemetryKeyStore = {
    getKey: async (k) => (k in data ? data[k] : null),
    setKey: async (k, v) => { data[k] = v; },
  };
  return { store, data };
}

/** A fetch stand-in that records every call and answers per `decide`. */
function fakeFetch(decide: (body: Record<string, unknown>, n: number) => boolean = () => true) {
  const calls: { url: string; init: Parameters<FetchLike>[1]; body: Record<string, unknown> }[] = [];
  const fetch: FetchLike = async (url, init) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push({ url, init, body });
    const ok = decide(body, calls.length);
    return { ok, status: ok ? 200 : 500 };
  };
  return { fetch, calls, events: () => calls.map((c) => c.body.event as string) };
}

beforeEach(() => { _resetIdentityInFlight(); });

// ── the envelope ─────────────────────────────────────────────────────────────

describe('the envelope', () => {
  it('is the CLI\'s shape, field for field, plus `surface`', async () => {
    const { store } = memStore();
    const { fetch, calls } = fakeFetch();

    await sendRating(store, 3, { fetch, now: T0 });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(POSTHOG_ENDPOINT);
    expect(calls[0].body).toEqual({
      api_key:     POSTHOG_API_KEY,
      event:       'feedback_submitted',
      distinct_id: ID,
      timestamp:   new Date(T0).toISOString(),
      properties: {
        $lib:            'nexpath',
        $lib_version:    POSTHOG_LIB_VERSION,
        surface:         'browser',
        installation_id: ID,
        rating:          3,
        feedback_at:     T0,
      },
    });
  });

  it('posts JSON, and does NOT set a User-Agent (a forbidden fetch header)', async () => {
    const { store } = memStore();
    const { fetch, calls } = fakeFetch();

    await sendRating(store, 1, { fetch, now: T0 });

    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(Object.keys(calls[0].init.headers)).not.toContain('User-Agent');
  });

  it('backdates lifecycle events to when they happened, not to now', () => {
    const envelope = buildEnvelope(EVENT_ADVISORY_FIRED, ID, T0, { advisory_fire_ts: T0 });
    expect(envelope.timestamp).toBe(new Date(T0).toISOString());
  });

  it.each([
    [EVENT_INSTALLED,       'installed_at'],
    [EVENT_ADVISORY_FIRED,  'advisory_fire_ts'],
    [EVENT_OPTION_SELECTED, 'option_select_ts'],
  ])('%s carries only the id, the lib fields, surface and %s', async (event, tsProp) => {
    const { store } = memStore();
    const { fetch, calls } = fakeFetch();
    const senders = {
      [EVENT_INSTALLED]:       sendInstalled,
      [EVENT_ADVISORY_FIRED]:  sendAdvisoryFired,
      [EVENT_OPTION_SELECTED]: sendOptionSelected,
    };

    await senders[event](store, T0, { fetch });

    const props = (calls[0].body.properties as Record<string, unknown>);
    expect(calls[0].body.event).toBe(event);
    expect(Object.keys(props).sort())
      .toEqual(['$lib', '$lib_version', 'installation_id', 'surface', tsProp].sort());
    expect(props[tsProp]).toBe(T0);
  });
});

// ── the privacy claim ────────────────────────────────────────────────────────

describe('⭐ no prompt or option text can reach the wire', () => {
  it('every payload from every sender is ids, timestamps and one number', async () => {
    const { store } = memStore();
    const { fetch, calls } = fakeFetch();

    await sendRating(store, 4, { fetch, now: T0 });
    await sendInstalled(store, T0, { fetch });
    await sendAdvisoryFired(store, T0, { fetch });
    await sendOptionSelected(store, T0, { fetch });

    const ALLOWED = new Set([
      '$lib', '$lib_version', 'surface', 'installation_id',
      'rating', 'feedback_at', 'installed_at', 'advisory_fire_ts', 'option_select_ts',
    ]);
    for (const call of calls) {
      expect(Object.keys(call.body).sort())
        .toEqual(['api_key', 'distinct_id', 'event', 'properties', 'timestamp']);
      for (const [k, v] of Object.entries(call.body.properties as Record<string, unknown>)) {
        expect(ALLOWED.has(k)).toBe(true);
        // Every value is a number, or one of three fixed strings. Nothing that
        // could be a prompt, an option label, a URL or a project root.
        if (typeof v === 'string') {
          expect([POSTHOG_LIB_NAME, POSTHOG_LIB_VERSION, SURFACE, ID]).toContain(v);
        } else {
          expect(typeof v).toBe('number');
        }
      }
    }
  });
});

// ── failure is swallowed ─────────────────────────────────────────────────────

describe('a failed post is swallowed', () => {
  it('a non-2xx returns false and does not throw', async () => {
    const { store } = memStore();
    const { fetch } = fakeFetch(() => false);

    await expect(sendRating(store, 2, { fetch, now: T0 })).resolves.toBe(false);
  });

  it('a fetch that throws returns false and does not throw', async () => {
    const { store } = memStore();
    const fetch: FetchLike = async () => { throw new Error('offline'); };

    await expect(sendRating(store, 2, { fetch, now: T0 })).resolves.toBe(false);
  });

  it('a store that can be neither read nor written still sends, with a fresh id', async () => {
    // Deliberate, and documented in rating-identity.ts: a broken store must not
    // silence the one thing the user explicitly asked to send. The id cannot be
    // persisted, so continuity across sends is lost — that is the lesser harm.
    const store: TelemetryKeyStore = {
      getKey: async () => { throw new Error('gone'); },
      setKey: async () => { throw new Error('gone'); },
    };
    const { fetch, calls } = fakeFetch();

    await expect(sendRating(store, 2, { fetch, now: T0 })).resolves.toBe(true);
    expect(calls[0].body.distinct_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('with no fetch available at all, it returns false rather than throwing', async () => {
    // globalThis.fetch is REMOVED for this one case, not left in place with a
    // short timeout: `opts.fetch ?? globalThis.fetch` would otherwise reach the
    // real one and fire a live request at PostHog from the test suite.
    const { store } = memStore();
    const saved = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = undefined;
    try {
      await expect(sendRating(store, 2, { now: T0 })).resolves.toBe(false);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = saved;
    }
  });

  it('⭐ no test in this file can reach the network', async () => {
    // The guard for the mistake above: every send here must go through an
    // injected fetch. If one ever forgets, this fails instead of quietly
    // posting a test event into production analytics.
    const { store } = memStore();
    const saved = globalThis.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = () => { throw new Error('live network reached from a test'); };
    try {
      const { fetch, calls } = fakeFetch();
      await sendRating(store, 1, { fetch, now: T0 });
      await flushLifecycle(store, { fetch });
      expect(calls.length).toBeGreaterThan(0);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fetch = saved;
    }
  });
});

// ── the flush ────────────────────────────────────────────────────────────────

describe('flushLifecycle', () => {
  it('sends the install event, then the buffer oldest first', async () => {
    const { store } = memStore({ [KEY_INSTALLED_AT]: String(T0) });
    await recordSignal(store, SIGNAL_OPTION_SELECTED, T0 + 20);
    await recordSignal(store, SIGNAL_ADVISORY_FIRED,  T0 + 10);
    const { fetch, events } = fakeFetch();

    await flushLifecycle(store, { fetch });

    expect(events()).toEqual([EVENT_INSTALLED, EVENT_ADVISORY_FIRED, EVENT_OPTION_SELECTED]);
    expect(await readSignals(store)).toEqual([]);          // all pruned on success
  });

  it('⭐ the install event fires ONCE, and only after a successful post', async () => {
    const { store, data } = memStore({ [KEY_INSTALLED_AT]: String(T0) });

    // First flush: the post fails, so the flag must NOT be set.
    const failing = fakeFetch(() => false);
    await flushLifecycle(store, { fetch: failing.fetch });
    expect(failing.events()).toEqual([EVENT_INSTALLED]);
    expect(data[KEY_INSTALLED_EVENT_SENT]).toBeUndefined();

    // Second flush: it succeeds, so the flag is set...
    const ok = fakeFetch();
    await flushLifecycle(store, { fetch: ok.fetch });
    expect(ok.events()).toEqual([EVENT_INSTALLED]);
    expect(data[KEY_INSTALLED_EVENT_SENT]).toBe('true');

    // ...and it never fires again.
    const third = fakeFetch();
    await flushLifecycle(store, { fetch: third.fetch });
    expect(third.events()).toEqual([]);
  });

  it('⭐ a buffered signal survives a failed send and is not double-counted', async () => {
    const { store } = memStore({
      [KEY_INSTALLED_AT]: String(T0),
      [KEY_INSTALLED_EVENT_SENT]: 'true',
    });
    await recordSignal(store, SIGNAL_ADVISORY_FIRED,  T0 + 1);
    await recordSignal(store, SIGNAL_OPTION_SELECTED, T0 + 2);

    // Only the advisory one succeeds this round.
    const round1 = fakeFetch((body) => body.event === EVENT_ADVISORY_FIRED);
    await flushLifecycle(store, { fetch: round1.fetch });

    expect(round1.events()).toEqual([EVENT_ADVISORY_FIRED, EVENT_OPTION_SELECTED]);
    expect(await readSignals(store))
      .toEqual([{ kind: SIGNAL_OPTION_SELECTED, occurredAt: T0 + 2 }]);   // the failure stayed

    // Next round sends ONLY the survivor — the delivered one is gone for good.
    const round2 = fakeFetch();
    await flushLifecycle(store, { fetch: round2.fetch });

    expect(round2.events()).toEqual([EVENT_OPTION_SELECTED]);
    expect(await readSignals(store)).toEqual([]);
  });

  it('an empty buffer with the install already sent posts nothing at all', async () => {
    const { store } = memStore({
      [KEY_INSTALLED_AT]: String(T0),
      [KEY_INSTALLED_EVENT_SENT]: 'true',
    });
    const { fetch, calls } = fakeFetch();

    await flushLifecycle(store, { fetch });

    expect(calls).toEqual([]);
  });

  it('never throws, even when everything fails', async () => {
    const store: TelemetryKeyStore = {
      getKey: async () => { throw new Error('gone'); },
      setKey: async () => { throw new Error('gone'); },
    };
    const fetch: FetchLike = async () => { throw new Error('offline'); };

    await expect(flushLifecycle(store, { fetch })).resolves.toBeUndefined();
  });
});

// ── contract with the CLI ────────────────────────────────────────────────────

/**
 * Same discipline as `rating-cadence.test.ts` and `fixtures/rating.test.ts`:
 * read the shipped CLI modules as text and pin what this copy mirrors.
 */
describe('contract with the shipped CLI telemetry (the two must not drift)', () => {
  const cwd = process.cwd();
  const config    = readFileSync(join(cwd, 'src', 'store', 'config.ts'), 'utf8');
  const batcher   = readFileSync(join(cwd, 'src', 'telemetry', 'TelemetryBatcher.ts'), 'utf8');
  const feedback  = readFileSync(join(cwd, 'src', 'telemetry', 'feedback-send.ts'), 'utf8');
  const lifecycle = readFileSync(join(cwd, 'src', 'telemetry', 'lifecycle-send.ts'), 'utf8');
  const flush     = readFileSync(join(cwd, 'src', 'telemetry', 'lifecycle-flush.ts'), 'utf8');

  it('the endpoint and api key are the CLI\'s built-in defaults', () => {
    expect(config).toContain(`telemetry_sync_endpoint: '${POSTHOG_ENDPOINT}'`);
    expect(config).toContain(`telemetry_sync_api_key:  '${POSTHOG_API_KEY}'`);
  });

  it('the $lib name and version are the CLI\'s', () => {
    expect(batcher).toContain(`export const POSTHOG_LIB_NAME    = '${POSTHOG_LIB_NAME}';`);
    expect(batcher).toContain(`export const POSTHOG_LIB_VERSION = '${POSTHOG_LIB_VERSION}';`);
  });

  it('⭐ the dismissal event is the CLI\'s, by name and by shape', () => {
    // Agreed across three surfaces before any of them was written (plan r15).
    // If the CLI renames it, the browser must follow in the same commit — the
    // drift would not surface until someone built the dashboard.
    expect(feedback).toContain(`export const FEEDBACK_DISMISSED_EVENT = '${FEEDBACK_DISMISSED_EVENT}';`);
    expect(feedback.replace(/\s+/g, ' ')).toContain('dismissed_at: now');
    // And the CLI must NOT flush on it — a dismissal is not consent.
    const stop = readFileSync(join(cwd, 'src', 'cli', 'commands', 'stop.ts'), 'utf8');
    const flat = stop.replace(/\s+/g, ' ');
    expect(flat).toContain('await fbDismissed(store);');
    expect(flat).not.toMatch(/await fbDismissed\(store\); *await flushLifecycle/);
  });

  it('the four event names are the CLI\'s', () => {
    expect(feedback).toContain(`export const FEEDBACK_EVENT = '${FEEDBACK_EVENT}';`);
    expect(lifecycle).toContain(`export const EVENT_INSTALLED       = '${EVENT_INSTALLED}';`);
    expect(lifecycle).toContain(`export const EVENT_ADVISORY_FIRED  = '${EVENT_ADVISORY_FIRED}';`);
    expect(lifecycle).toContain(`export const EVENT_OPTION_SELECTED = '${EVENT_OPTION_SELECTED}';`);
  });

  it('the CLI still names the same envelope properties', () => {
    const flat = feedback.replace(/\s+/g, ' ');
    expect(flat).toContain('$lib: POSTHOG_LIB_NAME');
    expect(flat).toContain('$lib_version: POSTHOG_LIB_VERSION');
    expect(flat).toContain('installation_id: installationId');
    expect(flat).toContain('feedback_at: now');
  });

  it('the CLI still marks the install event sent only after a successful post', () => {
    const flat = flush.replace(/\s+/g, ' ');
    expect(flat).toContain('if (await sendInstalled(store, installedAt, opts)) { markInstalledEventSent(store); }');
  });

  it('the CLI still prunes a signal only after its own send succeeds', () => {
    const flat = flush.replace(/\s+/g, ' ');
    expect(flat).toContain('if (await sendAdvisoryFired(store, ts, opts)) { pruneSignalAt(store, SIGNAL_ADVISORY_FIRED, ts); }');
    expect(flat).toContain('if (await sendOptionSelected(store, ts, opts)) { pruneSignalAt(store, SIGNAL_OPTION_SELECTED, ts); }');
  });
});

// ── the CLI's live kinds ─────────────────────────────────────────────────────

describe('the Plan-B action kinds — the ones the CLI actually records', () => {
  it('an action signal flushes under its OWN name, with action_ts', async () => {
    const { store } = memStore({
      [KEY_INSTALLED_AT]: String(T0),
      [KEY_INSTALLED_EVENT_SENT]: 'true',
    });
    await recordSignal(store, 'pe_shorter', T0 + 1);
    await recordSignal(store, 'mps_send',   T0 + 2);
    const { fetch, calls, events } = fakeFetch();

    await flushLifecycle(store, { fetch });

    expect(events()).toEqual(['pe_shorter', 'mps_send']);
    expect((calls[0].body.properties as Record<string, unknown>).action_ts).toBe(T0 + 1);
    expect(await readSignals(store)).toEqual([]);
  });

  it('carries no more than the id, the lib fields, surface and action_ts', async () => {
    const { store } = memStore();
    const { fetch, calls } = fakeFetch();

    await sendActionEvent(store, 'pe_close', T0, { fetch });

    expect(Object.keys(calls[0].body.properties as Record<string, unknown>).sort())
      .toEqual(['$lib', '$lib_version', 'action_ts', 'installation_id', 'surface']);
  });

  it('the three kind families share one buffer and each takes its own sender', async () => {
    const { store } = memStore({
      [KEY_INSTALLED_AT]: String(T0),
      [KEY_INSTALLED_EVENT_SENT]: 'true',
    });
    await recordSignal(store, SIGNAL_ADVISORY_FIRED,  T0 + 1);
    await recordSignal(store, 'pe_back',              T0 + 2);
    await recordSignal(store, SIGNAL_OPTION_SELECTED, T0 + 3);
    const { fetch, events } = fakeFetch();

    await flushLifecycle(store, { fetch });

    expect(events()).toEqual([EVENT_ADVISORY_FIRED, 'pe_back', EVENT_OPTION_SELECTED]);
  });
});

/**
 * The measurement that put the action kinds here at all. If the CLI ever starts
 * calling `recordAdvisoryFired` / `recordOptionSelected` for real, or stops
 * calling `recordActionSignal`, this fails and the browser should follow.
 */
describe('contract: which kinds the CLI actually records', () => {
  const cwd = process.cwd();
  const read = (...p: string[]) => readFileSync(join(cwd, ...p), 'utf8');
  const signals = read('src', 'store', 'feedback-signals.ts');
  const callers = ['auto.ts', 'prompt-enhancement-popup-host.ts', 'stop.ts']
    .map((f) => read('src', 'cli', 'commands', f)).join('\n');

  it('the CLI still records the per-action kinds', () => {
    expect(callers).toMatch(/recordActionSignal\(/);
  });

  it('⭐ the CLI still records NEITHER advisory_fired NOR option_selected', () => {
    expect(callers).not.toMatch(/recordAdvisoryFired\(/);
    expect(callers).not.toMatch(/recordOptionSelected\(/);
  });

  it('the action-kind enum is a SUBSET of the CLI\'s, in the CLI\'s order', () => {
    // Was a contiguous-substring match, which only held while the two lists were
    // identical. The CLI then inserted `pe_shown` mid-list — it and the VS Code
    // extension emit it from a popup-shown hook the browser does not have — and a
    // contiguous match cannot express "same names, same order, fewer of them".
    //
    // Subset-in-order is the contract that was always meant: every kind the
    // browser records must exist in the CLI under the same name, and their
    // relative order must match, so the two never drift into disagreeing about
    // what a name means. It still fails loudly if the browser invents a kind the
    // CLI does not have, or reorders one.
    const cliOrder = [...signals.matchAll(/'(pe_[a-z_]+|mps_[a-z_]+)'/g)].map((m) => m[1]);
    const cliIndex = new Map(cliOrder.map((k, i) => [k, i] as const));

    const missing = ACTION_SIGNAL_KINDS.filter((k) => !cliIndex.has(k));
    expect(missing, 'browser records kinds the CLI has never heard of').toEqual([]);

    const positions = ACTION_SIGNAL_KINDS.map((k) => cliIndex.get(k)!);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions, 'browser kinds are out of order versus the CLI').toEqual(sorted);
  });

  it('⭐ the browser deliberately does NOT record the CLI\'s pe_shown', () => {
    // Not an oversight. The browser has no popup-shown hook, and adding the kind
    // without one would put a seventeenth event into a store disclosure that
    // promises sixteen. `pe-popup-host.ts` narrows it away at the boundary.
    // Delete this test only in the change that adds the hook AND updates the
    // Chrome/Firefox data disclosures together.
    expect(signals).toContain("'pe_shown'");
    expect(ACTION_SIGNAL_KINDS as readonly string[]).not.toContain('pe_shown');
  });

  it('the CLI still posts an action event under the kind as the event name', () => {
    const flat = read('src', 'telemetry', 'lifecycle-send.ts').replace(/\s+/g, ' ');
    expect(flat).toContain('return sendLifecycle(store, kind, occurredAt, { action_ts: occurredAt }, opts);');
  });
});

/**
 * The per-option names, pinned in BOTH directions.
 *
 * They are a copy — see the constant's comment for why neither derivation is
 * available — so drift can appear on either side: the browser's own scale
 * (which the surface renders from) or the CLI's list (which the CLI sends from).
 * Both are checked.
 */
describe('per-option event names — pinned to the scale AND to the CLI', () => {
  const cliSrc = readFileSync(join(process.cwd(), 'src', 'telemetry', 'feedback-send.ts'), 'utf8');

  it('one name per row of the browser\'s own scale, and no extras', () => {
    expect(Object.keys(FEEDBACK_RATING_EVENTS).map(Number).sort())
      .toEqual(RATING_SCALE.map((c) => c.rating).sort());
  });

  it('⭐ each name is the scale\'s label, lowercased', () => {
    for (const c of RATING_SCALE) {
      expect(feedbackRatingEvent(c.rating), c.label)
        .toBe(`feedback_rating_${c.label.toLowerCase()}`);
    }
  });

  it('⭐ the CLI ships the identical four names', () => {
    // Two surfaces reporting one user action must not name it two ways; that
    // drift would not surface until someone built the dashboard.
    for (const name of Object.values(FEEDBACK_RATING_EVENTS)) {
      expect(cliSrc, name).toContain(`'${name}'`);
    }
    expect(cliSrc).toContain('export const FEEDBACK_RATING_EVENTS');
  });

  it('the four are distinct and collide with neither existing event', () => {
    const names = Object.values(FEEDBACK_RATING_EVENTS);
    expect(new Set(names).size).toBe(names.length);
    expect(names).not.toContain(FEEDBACK_EVENT);
    expect(names).not.toContain(FEEDBACK_DISMISSED_EVENT);
  });

  it('a rating outside the scale has no event', () => {
    for (const r of [0, 5, -1, 1.5, Number.NaN]) {
      expect(feedbackRatingEvent(r), String(r)).toBeUndefined();
    }
  });

  it('⭐ the host sends the per-option event AFTER the rating, on the same consent', () => {
    // Asserted on the source, because a reordering fails nothing behaviourally:
    // both sends succeed either way. The rating is the record the dashboards
    // were built on; this is the convenience, so it goes second.
    const host = readFileSync(join(process.cwd(), 'src', 'ext-browser', 'background', 'pe-popup-host.ts'), 'utf8');
    expect(host.indexOf('sendRatingOption(store, command.rating'))
      .toBeGreaterThan(host.indexOf('sendRating(store, command.rating'));
  });

  it('⭐ and NOT on a dismissal — there is no option to report', () => {
    const host = readFileSync(join(process.cwd(), 'src', 'ext-browser', 'background', 'pe-popup-host.ts'), 'utf8');
    const dismissal = host.slice(host.indexOf('Anything else is a dismissal'));
    expect(dismissal.slice(0, 900)).not.toContain('sendRatingOption');
  });
});

describe('sendRatingOption', () => {
  it.each(RATING_SCALE.map((c) => [c.label, c.rating] as const))(
    '⭐ %s posts its own event name',
    async (label, rating) => {
      const { store } = memStore();
      const { fetch, calls } = fakeFetch();

      expect(await sendRatingOption(store, rating, { fetch, now: T0 })).toBe(true);

      expect(calls).toHaveLength(1);
      expect(calls[0].body.event).toBe(`feedback_rating_${label.toLowerCase()}`);
      const props = calls[0].body.properties as Record<string, unknown>;
      expect(props.rating).toBe(rating);
      expect(props.feedback_at).toBe(T0);
      expect(props.surface).toBe('browser');
      expect(calls[0].body.timestamp).toBe(new Date(T0).toISOString());
    },
  );

  it('⭐ carries the SAME payload as feedback_submitted — either answers the same question', async () => {
    const { store } = memStore();
    const a = fakeFetch();
    const b = fakeFetch();

    await sendRatingOption(store, 2, { fetch: a.fetch, now: T0 });
    await sendRating(store, 2, { fetch: b.fetch, now: T0 });

    expect(a.calls[0].body.properties).toEqual(b.calls[0].body.properties);
    expect(a.calls[0].body.event).not.toBe(b.calls[0].body.event);   // only the name differs
  });

  it('⭐ a rating outside the scale sends NOTHING — no fifth option can be invented', async () => {
    const { store } = memStore();
    const { fetch, calls } = fakeFetch();

    for (const r of [0, 5, -1, 1.5, Number.NaN]) {
      expect(await sendRatingOption(store, r, { fetch }), String(r)).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it('a failed post is swallowed, like every other sender here', async () => {
    const { store } = memStore();
    const { fetch } = fakeFetch(() => false);
    await expect(sendRatingOption(store, 3, { fetch, now: T0 })).resolves.toBe(false);
  });
});
