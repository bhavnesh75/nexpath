/**
 * The browser's lifecycle signal buffer — a port of the CLI's
 * `store/feedback-signals.ts`, narrowed to what §4.2 of the dev plan asks for:
 * an install stamp, a one-time sent-flag, and a capped list of
 * `{kind, occurredAt}`.
 *
 * Content-free by construction. A signal is a KIND from a fixed enum of UI
 * actions plus a timestamp. No prompt text, option text, option index, project
 * root or URL is stored — there is no field here that could carry one.
 *
 * Writes are unconditional. Buffering locally is not sending: nothing leaves
 * the machine until the user clicks a rating, which is the browser's consent
 * moment (§4.2).
 *
 * ── WHAT CHANGED IN THE PORT, AND WHY ────────────────────────────────────────
 *
 * 1. **One `storage.local` key holding a JSON array, not a SQL table.** The CLI
 *    can `DELETE ... WHERE`; this has to read, filter and write back.
 *
 * 2. **CAPPED.** The CLI's table is unbounded because a flush is never far away
 *    — the CLI has an install-time consent, so telemetry-on users flush at each
 *    occurrence. The browser has no consent moment until the first rating, and
 *    a user who never rates buffers forever. The cap makes that bounded, and
 *    drops the OLDEST first so the buffer keeps the most recent picture.
 *
 * 3. **`project_root` is dropped.** The CLI stores it and then never sends it
 *    (`lifecycle-send.ts` posts a timestamp only), and its per-project readers
 *    serve CLI paths with no browser equivalent. Storing a field nothing reads
 *    and nothing sends would be collecting for its own sake.
 *
 * 4. **Never throws.** Same rule as the cadence: measurement must not be able to
 *    break the pipeline it measures. A damaged buffer reads as EMPTY.
 *
 * 5. **The kinds are the CLI's LIVE ones, which is not what §4.2 named.** The
 *    plan scoped this to `advisory_fired` + `option_selected`. Measured, the CLI
 *    has ZERO production call sites for either — the pair is dead there too, and
 *    porting only those would have given the browser a buffer that can never
 *    fill. What the CLI actually records is the Plan-B per-action enum via
 *    `recordActionSignal`, so that enum is carried here as well. Both sets are
 *    kept, because the CLI keeps both. (Owner instruction: follow the CLI.)
 */

/** The slice of the key store this module needs; injected so tests need no polyfill. */
export interface LifecycleSignalsKeyStore {
  getKey(name: string): Promise<string | null>;
  setKey(name: string, value: string): Promise<void>;
}

/**
 * `feedback-signals.ts:15-16` — the CLI's two original kinds.
 *
 * ⚠️ MEASURED 2026-08-31: the CLI has ZERO production call sites for
 * `recordAdvisoryFired` / `recordOptionSelected`. Both are dead there, and the
 * loops that flush them in `lifecycle-flush.ts` never have anything to send.
 * They are kept here only because the CLI keeps them — dropping them would be
 * the browser diverging first.
 */
export const SIGNAL_ADVISORY_FIRED  = 'advisory_fired';
export const SIGNAL_OPTION_SELECTED = 'option_selected';

/**
 * `feedback-signals.ts:24-28` — the CLI's Plan-B per-action kinds, and the ones
 * it ACTUALLY records (`auto.ts:841`, `prompt-enhancement-popup-host.ts:216`,
 * `:222`, `:259`, `stop.ts:377`).
 *
 * The kind IS the event name, and it is a fixed enum of UI actions. No prompt
 * text, option text or option index is ever recorded — the same guarantee the
 * CLI's own header makes.
 */
export const ACTION_SIGNAL_KINDS = [
  'pe_use_current', 'pe_use_original', 'pe_shorter', 'pe_more_thorough',
  'pe_more_project_grounded', 'pe_apply_details', 'pe_back', 'pe_close',
  'mps_send', 'mps_cancel', 'mps_decline', 'mps_interruption', 'mps_apply_details',
] as const;

export type PromptActionSignalKind = typeof ACTION_SIGNAL_KINDS[number];

export type SignalKind =
  | typeof SIGNAL_ADVISORY_FIRED
  | typeof SIGNAL_OPTION_SELECTED
  | PromptActionSignalKind;

/** True for the Plan-B action kinds, which flush through the action sender. */
export function isActionKind(kind: string): kind is PromptActionSignalKind {
  return (ACTION_SIGNAL_KINDS as readonly string[]).includes(kind);
}

/** CLI-mirrored config keys keep the CLI's bare names, as the cadence keys do. */
export const KEY_INSTALLED_AT         = 'installed_at';
export const KEY_INSTALLED_EVENT_SENT = 'installed_event_sent';

/**
 * The buffer itself is browser-only state with no CLI key to mirror — the CLI
 * keeps it in a table — so it takes the extension's own `nexpath_*` prefix.
 */
export const KEY_SIGNALS = 'nexpath_lifecycle_signals';

/**
 * Most signals kept. Chosen to sit far above any plausible pre-first-rating
 * count while staying trivially small on disk (~40 bytes each, so ~20 KB full).
 */
export const MAX_SIGNALS = 500;

export interface LifecycleSignal {
  kind:       SignalKind;
  occurredAt: number;
}

const KINDS: readonly string[] = [
  SIGNAL_ADVISORY_FIRED, SIGNAL_OPTION_SELECTED, ...ACTION_SIGNAL_KINDS,
];

function isSignal(v: unknown): v is LifecycleSignal {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.kind === 'string' && KINDS.includes(o.kind)
    && typeof o.occurredAt === 'number' && Number.isFinite(o.occurredAt);
}

/**
 * Every buffered signal, oldest first — the CLI's `ORDER BY occurred_at ASC`.
 *
 * A missing key, an unreadable store, malformed JSON and a non-array all answer
 * the same way: empty. Entries that are not well-formed signals are dropped
 * rather than passed on, so a damaged buffer cannot put a junk `kind` on the
 * wire as an event name.
 */
export async function readSignals(store: LifecycleSignalsKeyStore): Promise<LifecycleSignal[]> {
  let raw: string | null;
  try {
    raw = await store.getKey(KEY_SIGNALS);
  } catch {
    return [];
  }
  if (raw === null) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isSignal).sort((a, b) => a.occurredAt - b.occurredAt);
}

/**
 * Every read-modify-write on the buffer runs through here, one at a time.
 *
 * The CLI needs nothing like this: its `recordSignal` is a synchronous SQL
 * INSERT. Here the whole list lives under ONE `storage.local` key, so a record
 * or a prune is read → modify → write with two awaits in the middle, and two
 * overlapping calls both read the OLD list and the second write erases the
 * first. Measured: two concurrent `recordSignal` calls left ONE signal.
 *
 * That is reachable in production — `pe-popup-host.ts` fires these off with
 * `void` on every popup action, and a flush's prunes interleave with them the
 * same way. A lost action signal is silent: the event simply never arrives.
 *
 * A plain promise chain is enough because there is exactly one worker thread;
 * this orders the await points, it is not a cross-process lock. Failures are
 * swallowed into the chain so one broken write cannot wedge every later one.
 */
let writeChain: Promise<unknown> = Promise.resolve();

function serialize<T>(task: () => Promise<T>): Promise<T> {
  const next = writeChain.then(task, task);
  writeChain = next.then(() => undefined, () => undefined);
  return next;
}

async function writeSignals(store: LifecycleSignalsKeyStore, list: LifecycleSignal[]): Promise<void> {
  try {
    await store.setKey(KEY_SIGNALS, JSON.stringify(list));
  } catch {
    /* buffering is best-effort; a lost signal must not break the caller */
  }
}

/**
 * Buffer one signal. Over the cap the OLDEST are dropped, so the buffer holds
 * the most recent `MAX_SIGNALS`.
 */
export function recordSignal(
  store:      LifecycleSignalsKeyStore,
  kind:       SignalKind,
  occurredAt: number = Date.now(),
): Promise<void> {
  return serialize(async () => {
    const list = await readSignals(store);
    list.push({ kind, occurredAt });
    list.sort((a, b) => a.occurredAt - b.occurredAt);
    await writeSignals(store, list.slice(Math.max(0, list.length - MAX_SIGNALS)));
  });
}

/**
 * Drop every signal matching this exact (kind, occurredAt).
 *
 * Matches the CLI's `pruneSignalAt` — a `DELETE ... WHERE kind = ? AND
 * occurred_at = ?`, which also removes duplicates of the pair. Called only
 * after that signal's own send succeeded, so a failed send stays buffered.
 */
export function pruneSignalAt(
  store:      LifecycleSignalsKeyStore,
  kind:       SignalKind,
  occurredAt: number,
): Promise<void> {
  return serialize(async () => {
    const list = await readSignals(store);
    const kept = list.filter((s) => !(s.kind === kind && s.occurredAt === occurredAt));
    if (kept.length !== list.length) await writeSignals(store, kept);
  });
}

async function readNum(store: LifecycleSignalsKeyStore, key: string): Promise<number | null> {
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

/**
 * Record the install time, but only if one is not already set — the CLI's
 * `setInstalledAtIfMissing`. Safe to call on every install AND update, which is
 * what backfills the stamp for an installation that predates this field.
 */
export async function setInstalledAtIfMissing(
  store: LifecycleSignalsKeyStore,
  now:   number = Date.now(),
): Promise<void> {
  if (await readNum(store, KEY_INSTALLED_AT) !== null) return;
  try {
    await store.setKey(KEY_INSTALLED_AT, String(now));
  } catch {
    /* best-effort */
  }
}

/**
 * The install timestamp, setting it to `now` once if it is missing — the CLI's
 * `getInstalledAt`, so the field is never absent going forward.
 */
export async function getInstalledAt(
  store: LifecycleSignalsKeyStore,
  now:   number = Date.now(),
): Promise<number> {
  const stored = await readNum(store, KEY_INSTALLED_AT);
  if (stored !== null) return stored;
  await setInstalledAtIfMissing(store, now);
  return now;
}

/** True once the install event has been successfully sent, so it fires only once. */
export async function isInstalledEventSent(store: LifecycleSignalsKeyStore): Promise<boolean> {
  try {
    return (await store.getKey(KEY_INSTALLED_EVENT_SENT)) === 'true';
  } catch {
    // Unreadable → treat as NOT sent. Re-sending an install event is a
    // duplicate row; never sending one loses the denominator entirely.
    return false;
  }
}

/** Mark the install event as sent so it is not emitted again. */
export async function markInstalledEventSent(store: LifecycleSignalsKeyStore): Promise<void> {
  try {
    await store.setKey(KEY_INSTALLED_EVENT_SENT, 'true');
  } catch {
    /* best-effort; an unmarked send is retried next flush */
  }
}
