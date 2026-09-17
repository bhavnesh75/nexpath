import type { Store } from './db.js';
import { saveStore } from './db.js';
import {
  validatePromptEnhancementPrepareRequestV1,
  validatePromptEnhancementPrepareResultV1,
  type PromptEnhancementPrepareRequestV1,
  type PromptEnhancementPrepareResultV1,
} from '../prompt-enhancement/contracts.js';
import type { PromptEnhancementSequenceItemV1, PromptEnhancementSequenceOffsetRangeV1 } from '../prompt-enhancement/sequence-payload.js';

/**
 * Pending Prompt Enhancement — the UserPromptSubmit `auto` hook prepares a PE and stores it
 * here WITHOUT showing a popup (owner decision B-i, 2026-08-04); the Stop hook reads it,
 * shows the PE popup, and injects the enhanced prompt as a new turn.
 *
 * Mirrors `pending-advisories.ts`: one pending row per project_root, JSON-serialised typed
 * payload, fail-closed validation on read.
 */
/**
 * One phrase the submit popup renders in bold.
 *
 * Phrases, not offsets: the user edits the body, so a stored offset goes stale on the first
 * keystroke while a phrase is re-found on the live buffer at render time. Nothing here says where
 * the phrase sits, or which section it fell in — both are re-derived from the body being drawn.
 */
export interface PromptEnhancementEmphasisPhraseV1 {
  /** The phrase as it read in the body when it was chosen; re-located at render. */
  text: string;
  /** Which kind of emphasis it is (1–5). The kinds are fixed and are measured separately. */
  emphasisClass: 1 | 2 | 3 | 4 | 5;
  /**
   * Where the phrase came from. Everything written to the store is `'floor'` — a phrase produced
   * locally, with no call. `'model'` marks one produced at runtime and is never persisted.
   */
  source: 'floor' | 'model';
}

export interface PendingPromptEnhancement {
  id:          number;
  projectRoot: string;
  sessionId:   string;
  promptCount: number;
  status:      'pending' | 'shown';
  createdAt:   number;
  request:     PromptEnhancementPrepareRequestV1;
  result:      PromptEnhancementPrepareResultV1;
  /**
   * MPS P1b-ii: the UserPromptSubmit planner's full item list, carried so the Stop-hook background
   * wording batch can read it (planner and popup+batch run in different processes — owner B-i).
   * Undefined on every non-sequence prepare and on old rows / any corrupt stored value (fail-closed
   * → the batch simply does not run). Items are offsets/roles into the original; no wording yet.
   */
  plannerItems?: readonly PromptEnhancementSequenceItemV1[];
  /**
   * MPS P1b-ii: the sequence's whole-prompt directive ranges (offsets into the original), carried
   * beside {@link plannerItems} so the batch can resolve them to text. Undefined whenever plannerItems
   * is (non-sequence / old row / corrupt) — an empty sequence directive list stores as `[]`.
   */
  plannerPromptDirectives?: readonly PromptEnhancementSequenceOffsetRangeV1[];
  /**
   * The phrases the submit popup renders in bold, as they read in the body when they were chosen.
   * Undefined on old rows, on any prepare that produced none, and on a corrupt stored value — the
   * popup then draws no emphasis at all. A stored `[]` means something different: phrases WERE
   * computed and none qualified, and the two are kept apart on purpose. Display-only — this list
   * never reaches the send path, so it cannot change a single byte of what the agent receives.
   */
  emphasisPhrases?: readonly PromptEnhancementEmphasisPhraseV1[];
}

export interface UpsertPendingPromptEnhancementInput {
  projectRoot: string;
  sessionId:   string;
  promptCount: number;
  request:     PromptEnhancementPrepareRequestV1;
  result:      PromptEnhancementPrepareResultV1;
  /** MPS P1b-ii planner item list (see {@link PendingPromptEnhancement.plannerItems}). */
  plannerItems?: readonly PromptEnhancementSequenceItemV1[];
  /** MPS P1b-ii whole-prompt directive ranges (see {@link PendingPromptEnhancement.plannerPromptDirectives}). */
  plannerPromptDirectives?: readonly PromptEnhancementSequenceOffsetRangeV1[];
  /** Popup bold phrases (see {@link PendingPromptEnhancement.emphasisPhrases}). */
  emphasisPhrases?: readonly PromptEnhancementEmphasisPhraseV1[];
}

/**
 * Replace any existing pending PE for the project with a fresh one. Only one pending PE per
 * project_root is kept at a time (matches the pending-advisory single-row-per-project rule).
 */
export function upsertPendingPromptEnhancement(
  store: Store,
  input: UpsertPendingPromptEnhancementInput,
): void {
  store.db.run(
    'DELETE FROM pending_prompt_enhancements WHERE project_root = ?',
    [input.projectRoot],
  );
  store.db.run(
    `INSERT INTO pending_prompt_enhancements
       (project_root, session_id, prompt_count, status, created_at, request_json, result_json, planner_items_json, planner_prompt_directives_json, emphasis_phrases_json)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?)`,
    [
      input.projectRoot,
      input.sessionId,
      input.promptCount,
      Date.now(),
      JSON.stringify(input.request),
      JSON.stringify(input.result),
      // Nullable: only sequence prepares carry a planner item list; non-sequence stores NULL.
      input.plannerItems ? JSON.stringify(input.plannerItems) : null,
      // Directive ranges travel with the item list; a sequence with no directives stores '[]'.
      input.plannerPromptDirectives ? JSON.stringify(input.plannerPromptDirectives) : null,
      // Nullable on purpose: nothing computed stores NULL, while a computed-but-empty list stores '[]'.
      input.emphasisPhrases ? JSON.stringify(input.emphasisPhrases) : null,
    ],
  );
  saveStore(store);
}

function parseTyped<T>(raw: unknown, validate: (value: unknown) => { ok: boolean }): T | null {
  if (typeof raw !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return validate(parsed).ok ? (parsed as T) : null;
}

/**
 * Parse the carried planner item list, fail-closed. NULL (old rows / non-sequence prepares),
 * non-JSON, or a shape that is not an array of `{ itemKind: string, … }` all read back as
 * undefined — the batch then simply does not run. This is a lightweight structural guard only;
 * the background wording batch performs the full semantic validation (offsets, coverage) with the
 * original length it holds at consumption time.
 */
function parsePlannerItems(raw: unknown): readonly PromptEnhancementSequenceItemV1[] | undefined {
  if (typeof raw !== 'string') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const wellFormed = parsed.every(
    (item) => item !== null && typeof item === 'object'
      && typeof (item as { itemKind?: unknown }).itemKind === 'string',
  );
  return wellFormed ? (parsed as readonly PromptEnhancementSequenceItemV1[]) : undefined;
}

/**
 * Parse the carried whole-prompt directive ranges, fail-closed to undefined (same posture as
 * {@link parsePlannerItems}): NULL, non-JSON, or a shape that is not an array of numeric
 * `{ start, end }` reads back as undefined. An empty `[]` is a valid, meaningful value (a sequence
 * that has no directives) and is preserved as an empty array.
 */
function parsePlannerPromptDirectives(raw: unknown): readonly PromptEnhancementSequenceOffsetRangeV1[] | undefined {
  if (typeof raw !== 'string') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const wellFormed = parsed.every(
    (range) => range !== null && typeof range === 'object'
      && typeof (range as { start?: unknown }).start === 'number'
      && typeof (range as { end?: unknown }).end === 'number',
  );
  return wellFormed ? (parsed as readonly PromptEnhancementSequenceOffsetRangeV1[]) : undefined;
}

/**
 * Parse the carried bold phrases, fail-OPEN to undefined: NULL (old rows, or a prepare that produced
 * none), non-JSON, a value that is not an array, or any entry without a string `text` all read back
 * as undefined — the popup then draws plain text. A corrupt value here must never hide the popup, so
 * this never joins the fail-closed request/result pair. An empty `[]` is a valid, meaningful value
 * (phrases were computed and none qualified) and is preserved as an empty array.
 */
function parseEmphasisPhrases(raw: unknown): readonly PromptEnhancementEmphasisPhraseV1[] | undefined {
  if (typeof raw !== 'string') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  const wellFormed = parsed.every(
    (phrase) => phrase !== null && typeof phrase === 'object'
      && typeof (phrase as { text?: unknown }).text === 'string',
  );
  return wellFormed ? (parsed as readonly PromptEnhancementEmphasisPhraseV1[]) : undefined;
}

/**
 * Return the most recent pending PE for a project, or null if none / corrupt. When sessionId is
 * provided only PEs from that session are returned. A row whose stored JSON fails typed
 * validation is treated as absent (fail-closed) — the Stop hook then shows no PE popup.
 */
export function getPendingPromptEnhancement(
  store: Store,
  projectRoot: string,
  sessionId?: string,
): PendingPromptEnhancement | null {
  const sessionFilter = sessionId !== undefined ? ' AND session_id = ?' : '';
  const params: (string | number)[] = sessionId !== undefined
    ? [projectRoot, sessionId]
    : [projectRoot];
  const result = store.db.exec(
    `SELECT id, project_root, session_id, prompt_count, status, created_at, request_json, result_json, planner_items_json, planner_prompt_directives_json, emphasis_phrases_json
     FROM pending_prompt_enhancements
     WHERE project_root = ?${sessionFilter} AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 1`,
    params,
  );
  const row = result[0]?.values[0];
  if (!row) return null;
  const request = parseTyped<PromptEnhancementPrepareRequestV1>(row[6], validatePromptEnhancementPrepareRequestV1);
  const resultPayload = parseTyped<PromptEnhancementPrepareResultV1>(row[7], validatePromptEnhancementPrepareResultV1);
  if (!request || !resultPayload) return null;
  // Additive/nullable: a corrupt or absent item list / directive list only disables the batch, never
  // the popup — so a bad planner_* column must NOT fail-close the whole pending PE (unlike req/result).
  const plannerItems = parsePlannerItems(row[8]);
  const plannerPromptDirectives = parsePlannerPromptDirectives(row[9]);
  // Same posture, one step further: a bad emphasis column costs the bold, never the popup.
  const emphasisPhrases = parseEmphasisPhrases(row[10]);
  return {
    id:          row[0] as number,
    projectRoot: row[1] as string,
    sessionId:   row[2] as string,
    promptCount: row[3] as number,
    status:      row[4] as 'pending' | 'shown',
    createdAt:   row[5] as number,
    request,
    result:      resultPayload,
    ...(plannerItems ? { plannerItems } : {}),
    ...(plannerPromptDirectives ? { plannerPromptDirectives } : {}),
    ...(emphasisPhrases ? { emphasisPhrases } : {}),
  };
}

/** Mark a pending PE as shown so the Stop hook doesn't re-show it. */
export function markPromptEnhancementShown(store: Store, id: number): void {
  store.db.run(
    "UPDATE pending_prompt_enhancements SET status = 'shown' WHERE id = ?",
    [id],
  );
  saveStore(store);
}
