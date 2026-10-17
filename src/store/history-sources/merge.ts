import type { HistoryEntry } from './types.js';

/** The time an entry sorts by: its own time, else its ordering fallback. */
export function historyTime(entry: HistoryEntry): number {
  return entry.capturedAt ?? entry.orderHint;
}

/**
 * Drops later rows that repeat an earlier row's source id (the first one seen is kept).
 *
 * Some agents write the same prompt into more than one file or node — a resumed conversation
 * starts its new file with copies of the earlier prompts, a summarised branch repeats the rows
 * it summarises. Without this, one prompt would be stored more than once. Rows without an id
 * are always kept: nothing proves they are copies.
 */
export function dropRepeatedRows(entries: readonly HistoryEntry[]): HistoryEntry[] {
  const seen = new Set<string>();
  const out: HistoryEntry[] = [];
  for (const entry of entries) {
    if (entry.rowId !== undefined) {
      const key = `${entry.agent}\u0000${entry.rowId}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(entry);
  }
  return out;
}

/**
 * Merges the entries of several sources into one list, oldest first, keeping only the newest
 * `cap` when `cap` is positive.
 *
 * Ties keep the order the sources gave them (lists in argument order, rows in list order), so
 * the rows of one conversation that share an estimated time stay in the order they were written.
 */
export function mergeHistoryEntries(
  lists: readonly (readonly HistoryEntry[])[],
  cap: number,
): HistoryEntry[] {
  const indexed = lists.flatMap((list) => [...list]).map((entry, index) => ({ entry, index }));
  indexed.sort((a, b) => historyTime(a.entry) - historyTime(b.entry) || a.index - b.index);
  const ordered = indexed.map((item) => item.entry);
  return cap > 0 && ordered.length > cap ? ordered.slice(ordered.length - cap) : ordered;
}

/** How long after being written a history row can still be the live prompt itself. */
export const LIVE_PROMPT_ECHO_WINDOW_MS = 10 * 60 * 1000;

/** Clock skew tolerated when a history row looks slightly newer than `now`. */
const CLOCK_SKEW_MS = 60 * 1000;

/**
 * Drops the newest entry of each listed agent when it is the live prompt itself: the same text,
 * written within `windowMs` before `now`.
 *
 * An agent may record the prompt in its own history before the hook that stores it runs. The
 * live prompt is stored separately, so without this it would be counted twice. Only the newest
 * entry per agent is ever considered, so an older identical prompt is never touched.
 */
export function dropLivePromptEcho(
  entries: readonly HistoryEntry[],
  livePrompt: string | undefined,
  now: number,
  agents: ReadonlySet<string>,
  windowMs: number = LIVE_PROMPT_ECHO_WINDOW_MS,
): HistoryEntry[] {
  const live = livePrompt?.trim();
  if (!live) return [...entries];

  const newestIndexByAgent = new Map<string, number>();
  entries.forEach((entry, index) => {
    if (!agents.has(entry.agent)) return;
    const previous = newestIndexByAgent.get(entry.agent);
    if (previous === undefined || historyTime(entry) >= historyTime(entries[previous]!)) {
      newestIndexByAgent.set(entry.agent, index);
    }
  });

  const drop = new Set<number>();
  for (const index of newestIndexByAgent.values()) {
    const entry = entries[index]!;
    const age = now - historyTime(entry);
    if (entry.text === live && age >= -CLOCK_SKEW_MS && age <= windowMs) drop.add(index);
  }
  return entries.filter((_, index) => !drop.has(index));
}
