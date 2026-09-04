import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore, closeStore, type Store } from '../store/db.js';
import { setConfig } from '../store/config.js';
import { getInstallationId } from './identity.js';
import {
  FEEDBACK_EVENT,
  FEEDBACK_DISMISSED_EVENT,
  FEEDBACK_RATING_EVENTS,
  feedbackRatingEvent,
  sendFeedback,
  sendFeedbackDismissed,
  sendFeedbackRatingOption,
} from './feedback-send.js';
import { FEEDBACK_OPTIONS } from '../decision-session/feedback-popup.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FetchLike } from './TelemetryClient.js';
import type { PostHogSingleEnvelope } from './types.js';

interface Captured { url?: string; envelope?: PostHogSingleEnvelope; calls: number }

function okFetch(cap: Captured): FetchLike {
  return async (url, init) => {
    cap.calls++;
    cap.url = url;
    cap.envelope = JSON.parse(init.body) as PostHogSingleEnvelope;
    return { ok: true, status: 200, headers: { get: () => null } };
  };
}
function failFetch(cap: Captured): FetchLike {
  return async () => { cap.calls++; return { ok: false, status: 500, headers: { get: () => null } }; };
}
function rateLimitedFetch(cap: Captured): FetchLike {
  return async () => { cap.calls++; return { ok: false, status: 429, headers: { get: (n) => (n === 'Retry-After' ? '120' : null) } }; };
}
function throwFetch(cap: Captured): FetchLike {
  return async () => { cap.calls++; throw new Error('network down'); };
}

let store: Store;
let cap: Captured;

beforeEach(async () => {
  store = await openStore(':memory:');
  setConfig(store, 'telemetry_sync_api_key', 'phc_test');
  cap = { calls: 0 };
});
afterEach(() => closeStore(store));

describe('sendFeedback', () => {
  it('posts even when telemetry.enabled is false (the crux)', async () => {
    setConfig(store, 'telemetry.enabled', 'false');
    const ok = await sendFeedback(store, 3, { fetch: okFetch(cap) });
    expect(ok).toBe(true);
    expect(cap.calls).toBe(1);
    expect(cap.envelope?.event).toBe(FEEDBACK_EVENT);
    expect(cap.envelope?.properties.rating).toBe(3);
  });

  it('builds a lean payload: rating + feedback timestamp + installation id', async () => {
    await sendFeedback(store, 4, { fetch: okFetch(cap), now: 9_000 });

    const env = cap.envelope!;
    const installId = getInstallationId(store);
    expect(env.distinct_id).toBe(installId);
    expect(env.properties.installation_id).toBe(installId);
    expect(env.properties.rating).toBe(4);
    expect(env.properties.feedback_at).toBe(9_000);
    expect(env.timestamp).toBe(new Date(9_000).toISOString());
  });

  it('does not carry install or advisory context (those are their own events)', async () => {
    await sendFeedback(store, 2, { fetch: okFetch(cap) });
    const keys = Object.keys(cap.envelope!.properties).sort();
    expect(keys).toEqual(['$lib', '$lib_version', 'feedback_at', 'installation_id', 'rating'].sort());
    expect(cap.envelope?.properties.installed_at).toBeUndefined();
    expect(cap.envelope?.properties.advisory_fire_ts).toBeUndefined();
    expect(cap.envelope?.properties.option_select_ts).toBeUndefined();
  });

  it('defaults feedback_at to now when not provided', async () => {
    const before = Date.now();
    await sendFeedback(store, 1, { fetch: okFetch(cap) });
    const fa = cap.envelope?.properties.feedback_at as number;
    expect(fa).toBeGreaterThanOrEqual(before);
    expect(fa).toBeLessThanOrEqual(Date.now());
  });

  it('returns false on an HTTP failure', async () => {
    expect(await sendFeedback(store, 3, { fetch: failFetch(cap) })).toBe(false);
  });

  it('swallows network errors and returns false', async () => {
    expect(await sendFeedback(store, 3, { fetch: throwFetch(cap) })).toBe(false);
  });

  it('returns false and does not post when the api key is empty', async () => {
    setConfig(store, 'telemetry_sync_api_key', '');
    const ok = await sendFeedback(store, 3, { fetch: okFetch(cap) });
    expect(ok).toBe(false);
    expect(cap.calls).toBe(0);
  });

  it('carries the configured api key and PostHog lib metadata', async () => {
    await sendFeedback(store, 2, { fetch: okFetch(cap) });
    expect(cap.envelope?.api_key).toBe('phc_test');
    expect(cap.envelope?.properties.$lib).toBeDefined();
    expect(cap.envelope?.properties.$lib_version).toBeDefined();
  });

  it('posts to the configured endpoint', async () => {
    setConfig(store, 'telemetry_sync_endpoint', 'https://custom.example/capture/');
    await sendFeedback(store, 2, { fetch: okFetch(cap) });
    expect(cap.url).toBe('https://custom.example/capture/');
  });

  it('returns false on a 429 rate-limit', async () => {
    expect(await sendFeedback(store, 3, { fetch: rateLimitedFetch(cap) })).toBe(false);
  });
});

/**
 * The per-option event names against the popup that defines the options.
 *
 * The list in `feedback-send.ts` is a COPY — importing `feedback-popup.ts` from
 * telemetry would close a cycle (it imports `DecisionSession.js`, which imports
 * `telemetry/`). Same problem `submit-hold-budget.ts` has, same answer: keep the
 * copy and pin it here, so a reworded label fails a test instead of silently
 * renaming an event that dashboards are built on.
 */
describe('per-option event names — pinned to FEEDBACK_OPTIONS', () => {
  it('there is exactly one name per option, and no extras', () => {
    expect(Object.keys(FEEDBACK_RATING_EVENTS).map(Number).sort())
      .toEqual(FEEDBACK_OPTIONS.map((o) => o.rating).sort());
  });

  it('⭐ each name is its own label, lowercased', () => {
    for (const opt of FEEDBACK_OPTIONS) {
      expect(feedbackRatingEvent(opt.rating), opt.label)
        .toBe(`feedback_rating_${opt.label.toLowerCase()}`);
    }
  });

  it('the four names are distinct, and none collides with the two existing events', () => {
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

  it('⭐ the stop hook sends the per-option event AFTER the rating, on the same consent', () => {
    // Order matters and is asserted on the source, because a reordering here
    // would not fail any behavioural test: both sends succeed either way. The
    // rating is the record dashboards were built on; the per-option event is the
    // convenience. If one has to fail, it should be the second one.
    const stop = readFileSync(join(process.cwd(), 'src', 'cli', 'commands', 'stop.ts'), 'utf8');
    const flat = stop.replace(/\s+/g, ' ');
    expect(flat).toContain('await flushLifecycle(store); const answeredAt = Date.now(); await fbSend(store, result.rating, answeredAt);');
    // ONE timestamp, shared: the two envelopes describe a single click.
    expect(flat).toContain('await fbRatingOption(store, result.rating, answeredAt);');
    expect(stop.indexOf('fbRatingOption(store, result.rating, answeredAt)'))
      .toBeGreaterThan(stop.indexOf('fbSend(store, result.rating, answeredAt)'));
  });

  it('⭐ and it is NOT sent on a dismissal — there is no option to report', () => {
    const stop = readFileSync(join(process.cwd(), 'src', 'cli', 'commands', 'stop.ts'), 'utf8');
    const elseBranch = stop.slice(stop.indexOf('} else {', stop.indexOf('fbRatingOption')));
    expect(elseBranch.slice(0, 900)).not.toContain('fbRatingOption');
  });

  it('⭐ the browser ships the identical four names and sends them too', () => {
    // Dropped from this guard the moment Phase 3 ships, together with the
    // browser's own tests and the Privacy section that enumerates what is sent.
    const host = readFileSync(join(process.cwd(), 'src', 'ext-browser', 'background', 'pe-popup-host.ts'), 'utf8');
    expect(host).toContain('sendRatingOption');
  });
});

describe('sendFeedbackRatingOption', () => {
  it.each(FEEDBACK_OPTIONS.map((o) => [o.label, o.rating] as const))(
    '⭐ %s posts feedback_rating_%s',
    async (label, rating) => {
      const ok = await sendFeedbackRatingOption(store, rating, { fetch: okFetch(cap), now: 7_000 });

      expect(ok).toBe(true);
      expect(cap.calls).toBe(1);
      expect(cap.envelope?.event).toBe(`feedback_rating_${label.toLowerCase()}`);
      expect(cap.envelope?.properties.rating).toBe(rating);
      expect(cap.envelope?.properties.feedback_at).toBe(7_000);
      expect(cap.envelope?.timestamp).toBe(new Date(7_000).toISOString());
      expect(cap.envelope?.distinct_id).toBe(getInstallationId(store));
    },
  );

  it('carries the same payload as the rating event — either can answer the same question', async () => {
    await sendFeedbackRatingOption(store, 2, { fetch: okFetch(cap), now: 5_000 });
    const optionProps = { ...cap.envelope?.properties };

    cap = { calls: 0 };
    await sendFeedback(store, 2, { fetch: okFetch(cap), now: 5_000 });

    expect(optionProps).toEqual(cap.envelope?.properties);
  });

  it('⭐ a rating outside the scale sends NOTHING — no fifth option can be invented', async () => {
    for (const r of [0, 5, -1, 1.5, Number.NaN]) {
      expect(await sendFeedbackRatingOption(store, r, { fetch: okFetch(cap) }), String(r)).toBe(false);
    }
    expect(cap.calls).toBe(0);
  });

  it('posts even when telemetry.enabled is false — the click is the consent', async () => {
    setConfig(store, 'telemetry.enabled', 'false');
    expect(await sendFeedbackRatingOption(store, 3, { fetch: okFetch(cap) })).toBe(true);
  });

  it('sends nothing without an api key', async () => {
    const bare = await openStore(':memory:');
    setConfig(bare, 'telemetry_sync_api_key', '');
    expect(await sendFeedbackRatingOption(bare, 3, { fetch: okFetch(cap) })).toBe(false);
    expect(cap.calls).toBe(0);
    closeStore(bare);
  });

  it.each([['a 500', failFetch], ['a 429', rateLimitedFetch], ['a thrown error', throwFetch]])(
    'swallows %s and returns false',
    async (_label, make) => {
      expect(await sendFeedbackRatingOption(store, 4, { fetch: make(cap) })).toBe(false);
    },
  );
});

describe('the two rating envelopes describe ONE click', () => {
  it('⭐ given one timestamp, both carry it identically', async () => {
    // The source pin above catches someone writing `Date.now()` again; this
    // catches a sender that simply ignores the timestamp it was handed. The
    // browser's end-to-end suite found the original defect by comparing the two
    // payloads — this is the same guarantee, on this side.
    const a: Captured = { calls: 0 };
    await sendFeedback(store, 3, { fetch: okFetch(a), now: 4_242 });
    const rating = a.envelope!;

    const b: Captured = { calls: 0 };
    await sendFeedbackRatingOption(store, 3, { fetch: okFetch(b), now: 4_242 });
    const option = b.envelope!;

    expect(option.timestamp).toBe(rating.timestamp);
    expect(option.properties.feedback_at).toBe(rating.properties.feedback_at);
    expect(option.properties).toEqual(rating.properties);
    expect(option.event).not.toBe(rating.event);   // only the name differs
  });
});
