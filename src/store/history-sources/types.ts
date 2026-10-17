/**
 * A prompt recovered from a coding agent's own local history, before it is stored.
 *
 * Every history source returns this shape, so the import can treat all agents alike:
 * one list, merged by time, inserted oldest first.
 */
export interface HistoryEntry {
  /** The prompt as the user typed it, trimmed. Never empty. */
  text: string;
  /**
   * When the prompt was sent (Unix ms). Sources fill it whenever they can place the prompt
   * in time; a source that can only estimate the time says so in its own documentation.
   */
  capturedAt?: number;
  /** Ordering fallback (Unix ms), used only when `capturedAt` is absent. */
  orderHint: number;
  /** The agent whose history this is, e.g. `cursor` or `devin`. */
  agent: string;
  /** The source's own id for this row, when it has one — lets copies of one row be dropped. */
  rowId?: string;
}

/** Why a source returned no entries, when that is worth a log line. */
export type HistorySourceSkip =
  /** The agent keeps no history for this project on this machine. */
  | 'not_found'
  /** The running Node lacks something the source needs. */
  | 'runtime_unsupported'
  /** The history exists but could not be read. */
  | 'unreadable'
  /** The history exists but is not laid out the way this reader understands. */
  | 'unexpected_shape';

export interface HistorySourceResult {
  entries: HistoryEntry[];
  /** Set when `entries` is empty for a reason other than an empty history. */
  skipped?: HistorySourceSkip;
  /** Rows the source found but could not use (counted only — never their text). */
  unusableRows?: number;
}
