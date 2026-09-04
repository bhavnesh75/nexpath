/**
 * User-initiated one-shot send of a feedback popup rating.
 *
 * This runs only when the user explicitly picks a rating and sends it. That
 * click is its own consent, so this send is intentionally independent of the
 * telemetry.enabled setting and of the batched telemetry sync — it posts the
 * single event directly. Best-effort: it never throws.
 *
 * The payload is lean: the rating, a feedback timestamp, and the installation
 * id. Install and advisory context are their own lifecycle events (see
 * lifecycle-send / lifecycle-flush), not properties here. No option text or
 * prompt text is ever included.
 */

import type { Store } from '../store/db.js';
import { getConfig } from '../store/config.js';
import { getInstallationId } from './identity.js';
import { postEvent, DEFAULT_POSTHOG_ENDPOINT, type FetchLike } from './TelemetryClient.js';
import { POSTHOG_LIB_NAME, POSTHOG_LIB_VERSION } from './TelemetryBatcher.js';
import type { PostHogSingleEnvelope } from './types.js';

export const FEEDBACK_EVENT = 'feedback_submitted';

/**
 * The popup was shown and the user closed it without answering.
 *
 * Without this, "asked and declined" and "never asked" are the same absence in
 * the data, so the rating has no denominator of its own — `nexpath_installed`
 * cannot say how often the prompt actually appeared.
 *
 * It carries the installation id and a timestamp, and nothing else: there is no
 * rating to report, and a dismissal is not consent to release anything that was
 * buffered. The caller must NOT flush the lifecycle buffer for it.
 */
export const FEEDBACK_DISMISSED_EVENT = 'feedback_dismissed';

/**
 * One event NAME per rating option, on top of `feedback_submitted`'s `rating`
 * property (plan §9.8: the property stays — replacing it would rename history
 * and break every existing chart).
 *
 * Why a name and not just the property: in PostHog an event name is a
 * first-class object with its own trend, funnel step and alert, where a property
 * filter has to be re-applied on every chart.
 *
 * ⚠️ WHY THIS LIST IS DUPLICATED RATHER THAN DERIVED FROM `FEEDBACK_OPTIONS`.
 * Importing `decision-session/feedback-popup.ts` from here would close a cycle:
 * that module imports `DecisionSession.js`, which imports `telemetry/`. So this
 * follows the discipline the repo already uses for exactly this problem
 * (`submit-hold-budget.ts`, `adapters/rating-cadence.ts`): keep the copy, and
 * pin it with a contract test that reads the shipped source as text. The names
 * are the labels lowercased, so a reworded label fails that test rather than
 * silently renaming an event.
 */
export const FEEDBACK_RATING_EVENTS: Readonly<Record<number, string>> = {
  1: 'feedback_rating_bad',
  2: 'feedback_rating_fine',
  3: 'feedback_rating_good',
  4: 'feedback_rating_excellent',
};

/** The per-option event for a rating, or undefined if it is not one of the four. */
export function feedbackRatingEvent(rating: number): string | undefined {
  return FEEDBACK_RATING_EVENTS[rating];
}

export interface SendFeedbackOptions {
  fetch?: FetchLike;
  now?:   number;
}

/**
 * Post the feedback rating + timestamp payload once. Returns true on a
 * successful post, false otherwise. Never throws.
 */
export async function sendFeedback(
  store:  Store,
  rating: number,
  opts:   SendFeedbackOptions = {},
): Promise<boolean> {
  try {
    const apiKey = getConfig(store.db, 'telemetry_sync_api_key');
    if (!apiKey) return false;   // nothing to authenticate the post with

    const endpoint = getConfig(store.db, 'telemetry_sync_endpoint') ?? DEFAULT_POSTHOG_ENDPOINT;
    const now      = opts.now ?? Date.now();

    const installationId = getInstallationId(store);

    const envelope: PostHogSingleEnvelope = {
      api_key:     apiKey,
      event:       FEEDBACK_EVENT,
      distinct_id: installationId,
      timestamp:   new Date(now).toISOString(),
      properties: {
        $lib:            POSTHOG_LIB_NAME,
        $lib_version:    POSTHOG_LIB_VERSION,
        rating,
        installation_id: installationId,
        feedback_at:     now,
      },
    };

    const result = await postEvent(endpoint, envelope, opts.fetch ? { fetch: opts.fetch } : {});
    return result.ok;
  } catch {
    // Best-effort — a send failure must never crash the caller.
    return false;
  }
}

/**
 * Post the per-option event for a rating — `feedback_rating_good` and its three
 * siblings — ALONGSIDE `feedback_submitted`, never instead of it (plan §9.8).
 *
 * The same payload as the rating send, so either event can answer the same
 * question; the difference is that this one is a NAME, which in PostHog is a
 * first-class object with its own trend, funnel step and alert.
 *
 * A rating outside the scale has no event and sends nothing — the caller cannot
 * invent a fifth option by passing 5.
 *
 * Best-effort: never throws. It is a second envelope on the same consent as the
 * rating, so the caller sends it after the flush and after `sendFeedback`; a
 * failure here must not affect either.
 */
export async function sendFeedbackRatingOption(
  store:  Store,
  rating: number,
  opts:   SendFeedbackOptions = {},
): Promise<boolean> {
  try {
    const event = feedbackRatingEvent(rating);
    if (!event) return false;

    const apiKey = getConfig(store.db, 'telemetry_sync_api_key');
    if (!apiKey) return false;

    const endpoint = getConfig(store.db, 'telemetry_sync_endpoint') ?? DEFAULT_POSTHOG_ENDPOINT;
    const now      = opts.now ?? Date.now();

    const installationId = getInstallationId(store);

    const envelope: PostHogSingleEnvelope = {
      api_key:     apiKey,
      event,
      distinct_id: installationId,
      timestamp:   new Date(now).toISOString(),
      properties: {
        $lib:            POSTHOG_LIB_NAME,
        $lib_version:    POSTHOG_LIB_VERSION,
        rating,
        installation_id: installationId,
        feedback_at:     now,
      },
    };

    const result = await postEvent(endpoint, envelope, opts.fetch ? { fetch: opts.fetch } : {});
    return result.ok;
  } catch {
    return false;
  }
}

/**
 * Post the dismissal. Same envelope as the rating with the rating left out —
 * there isn't one.
 *
 * Deliberately does NOT flush the lifecycle buffer, and the caller must not
 * either: the rating click is the consent that releases what was buffered
 * (`stop.ts:526`), and closing the popup is the opposite of that click.
 * Best-effort: never throws.
 */
export async function sendFeedbackDismissed(
  store: Store,
  opts:  SendFeedbackOptions = {},
): Promise<boolean> {
  try {
    const apiKey = getConfig(store.db, 'telemetry_sync_api_key');
    if (!apiKey) return false;   // nothing to authenticate the post with

    const endpoint = getConfig(store.db, 'telemetry_sync_endpoint') ?? DEFAULT_POSTHOG_ENDPOINT;
    const now      = opts.now ?? Date.now();

    const installationId = getInstallationId(store);

    const envelope: PostHogSingleEnvelope = {
      api_key:     apiKey,
      event:       FEEDBACK_DISMISSED_EVENT,
      distinct_id: installationId,
      timestamp:   new Date(now).toISOString(),
      properties: {
        $lib:            POSTHOG_LIB_NAME,
        $lib_version:    POSTHOG_LIB_VERSION,
        installation_id: installationId,
        dismissed_at:    now,
      },
    };

    const result = await postEvent(endpoint, envelope, opts.fetch ? { fetch: opts.fetch } : {});
    return result.ok;
  } catch {
    return false;
  }
}
