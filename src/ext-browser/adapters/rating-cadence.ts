/**
 * Rating-popup cadence, browser shape — a port of the CLI's
 * `src/store/feedback-cadence.ts`, which is where the behaviour is defined and
 * where any change to the RULES belongs. This file only re-homes them onto
 * `storage.local`.
 *
 * The rule, unchanged: "active usage" is accumulated from the gaps between
 * successive hook invocations, and a gap longer than `IDLE_CAP_MS` is an idle
 * break that does not count — so the total reflects time the agent was actually
 * being worked with, not wall-clock elapsed time. Once the popup is shown the
 * accumulator resets and the gap timer restarts.
 *
 * ── WHAT CHANGED IN THE PORT, AND WHY ────────────────────────────────────────
 *
 * 1. **Asynchronous.** The CLI reads a synchronous in-memory sql.js table;
 *    `storage.local` is promise-based, so every entry point here returns one.
 *    Callers must await — a floating `recordActivity()` would silently lose the
 *    heartbeat it was called to record.
 *
 * 2. **No `saveStore`.** That call flushes sql.js to disk. A `storage.local`
 *    write is already durable, so there is nothing to flush.
 *
 * 3. **The key names are IDENTICAL and deliberately unprefixed.** The browser
 *    uses two conventions: `nexpath_*` for its own runtime state
 *    (`nexpath_pending_pe`, `nexpath_pe_feedback_events`) and bare CLI names for
 *    CLI-mirrored settings (`advisory_frequency`, `role`, `openai_api_key`).
 *    Cadence is the second kind, so it keeps the CLI's names.
 *
 *    ⚠️ Same NAMES, different STORE. `storage.local` and the CLI's SQLite
 *    config table never see each other, so cadence is global within the browser
 *    only — a user of both Cursor and Bolt can be asked on each. There is no
 *    cross-surface store to fix that with; it is recorded, not solved.
 *
 * 4. **Corrupt values are treated as absent** (see `readNum`). The CLI owns its
 *    config table exclusively; `storage.local` is shared with everything else
 *    the extension keeps and survives extension updates, so a non-numeric value
 *    is reachable here in a way it is not there. With valid data the behaviour
 *    is identical — this only decides what a damaged store means.
 *
 * 5. **Never throws.** A cadence failure must not break the pipeline it is
 *    measured from: writes swallow their errors, and the eligibility read fails
 *    CLOSED (no popup) rather than open.
 */

/** The slice of the key store this module needs; injected so tests need no polyfill. */
export interface RatingCadenceKeyStore {
  getKey(name: string): Promise<string | null>;
  setKey(name: string, value: string): Promise<void>;
}

/** Active usage that must accumulate before the popup is eligible again. */
export const USAGE_THRESHOLD_MS = 2 * 60 * 60 * 1000;   // 2 hours

/** Minimum time that must pass after the popup was last shown before it can reappear. */
export const MIN_GAP_MS = 2 * 24 * 60 * 60 * 1000;      // 2 days

/** A gap between hook invocations longer than this is an idle break (not counted). */
export const IDLE_CAP_MS = 15 * 60 * 1000;              // 15 minutes

export const KEY_ACTIVE_MS        = 'feedback_active_ms';
export const KEY_LAST_ACTIVITY_AT = 'feedback_last_activity_at';
export const KEY_LAST_SHOWN_AT    = 'feedback_last_shown_at';

export interface CadenceState {
  activeMs:       number;
  lastActivityAt: number | null;
  lastFeedbackAt: number | null;
}

/**
 * Read one stored number, or null.
 *
 * A missing key, an unreadable store and a value that is not a finite number all
 * answer the same way: absent. The last of those is the one the CLI does not
 * need — `Number('')` is 0 and `Number('x')` is NaN, and a NaN reaching
 * `isFeedbackEligible` would make `activeMs + tail < USAGE_THRESHOLD_MS` false
 * and hand back "eligible" on a store that says nothing of the kind.
 */
async function readNum(store: RatingCadenceKeyStore, key: string): Promise<number | null> {
  let raw: string | null;
  try {
    raw = await store.getKey(key);
  } catch {
    return null;
  }
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Write one number. Best-effort: a storage failure must not break the caller. */
async function writeNum(store: RatingCadenceKeyStore, key: string, value: number): Promise<void> {
  try {
    await store.setKey(key, String(value));
  } catch {
    /* cadence is measurement, never a gate on the pipeline it measures */
  }
}

/** Read the current cadence state. */
export async function readCadence(store: RatingCadenceKeyStore): Promise<CadenceState> {
  const [activeMs, lastActivityAt, lastFeedbackAt] = await Promise.all([
    readNum(store, KEY_ACTIVE_MS),
    readNum(store, KEY_LAST_ACTIVITY_AT),
    readNum(store, KEY_LAST_SHOWN_AT),
  ]);
  return {
    activeMs: activeMs ?? 0,
    lastActivityAt,
    lastFeedbackAt,
  };
}

/**
 * Record a hook invocation at `now`. Adds the gap since the previous activity to
 * the accumulator when that gap is within `IDLE_CAP_MS`, then advances the
 * last-activity marker.
 *
 * The two writes are sequential rather than parallel on purpose: if the second
 * fails, the marker still points at the older time, so the next invocation
 * re-measures a gap that was already counted. Over-counting a single gap is a
 * far smaller error than losing the marker and having every later gap measured
 * from nothing.
 */
export async function recordActivity(
  store: RatingCadenceKeyStore,
  now: number = Date.now(),
): Promise<void> {
  const state = await readCadence(store);
  const delta = state.lastActivityAt !== null ? now - state.lastActivityAt : null;
  const add   = delta !== null && delta > 0 && delta <= IDLE_CAP_MS ? delta : 0;

  await writeNum(store, KEY_ACTIVE_MS, state.activeMs + add);
  await writeNum(store, KEY_LAST_ACTIVITY_AT, now);
}

/**
 * True when enough active usage has accumulated AND enough time has passed since
 * the popup was last shown. If it has never been shown, only the usage threshold
 * applies.
 *
 * The `tail` term is the CLI's live clamp: it counts the in-progress turn (the
 * gap since the last activity, capped) so the popup can become eligible in the
 * same session that crosses the threshold, rather than waiting for the next
 * heartbeat to bank it.
 */
export async function isFeedbackEligible(
  store: RatingCadenceKeyStore,
  now: number = Date.now(),
): Promise<boolean> {
  const state = await readCadence(store);
  const tail = state.lastActivityAt === null
    ? 0
    : Math.min(Math.max(now - state.lastActivityAt, 0), IDLE_CAP_MS);
  if (state.activeMs + tail < USAGE_THRESHOLD_MS) return false;
  if (state.lastFeedbackAt === null) return true;
  return now - state.lastFeedbackAt >= MIN_GAP_MS;
}

/**
 * Mark the popup as shown: reset the accumulator and the last-activity marker,
 * and stamp the last-shown time so the next cycle needs a fresh usage + gap
 * window.
 *
 * Resetting last-activity is what stops the gap that preceded the popup from
 * leaking into the fresh accumulator on the next heartbeat.
 */
export async function markFeedbackShown(
  store: RatingCadenceKeyStore,
  now: number = Date.now(),
): Promise<void> {
  await writeNum(store, KEY_ACTIVE_MS, 0);
  await writeNum(store, KEY_LAST_ACTIVITY_AT, now);
  await writeNum(store, KEY_LAST_SHOWN_AT, now);
}
