/**
 * Session reset after a credential change (Bhavnesh handoff 2026-09-06, our half).
 *
 * ── WHY ───────────────────────────────────────────────────────────────────────
 * A key that ran out of credit degraded the classifier to the keyword cascade,
 * which persisted a wrong stage into session state; adding a working key did
 * not undo it, so a benign prompt was enhanced as a production rollout. The
 * fix expires the session at every credential change. The four API-key sites
 * are Bhavnesh's; the two Nexpath-token sites (`token.ts`) are ours.
 *
 * ── SHAPE (mirrors the helper his four sites use) ────────────────────────────
 * Machine-global `DELETE FROM session_states`: a credential is machine-global
 * and `set-token` has no project argument to bind — scoping would leave every
 * other project poisoned while printing success. BEST-EFFORT: the credential
 * is already saved when this runs; a locked or unreadable store must never
 * turn that into a failed command. Never throws; the caller prints the outcome.
 */
import { openStore, closeStore, saveStore, DEFAULT_DB_PATH, type Store } from '../../store/db.js';

export interface CredentialSessionResetResult {
  ok: boolean;
  /** Rows removed (only when `ok`). */
  deleted?: number;
  error?: string;
}

export interface CredentialSessionResetDeps {
  openStoreFn?: (dbPath: string) => Promise<Store>;
  closeStoreFn?: (store: Store) => void;
  saveStoreFn?: (store: Store) => void;
  dbPath?: string;
}

export async function resetSessionsAfterCredentialChange(
  deps: CredentialSessionResetDeps = {},
): Promise<CredentialSessionResetResult> {
  let store: Store | null = null;
  try {
    store = await (deps.openStoreFn ?? openStore)(deps.dbPath ?? DEFAULT_DB_PATH);
    store.db.run('DELETE FROM session_states');
    const deleted = store.db.getRowsModified();
    (deps.saveStoreFn ?? saveStore)(store);
    return { ok: true, deleted };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message ?? 'unknown' };
  } finally {
    if (store) { try { (deps.closeStoreFn ?? closeStore)(store); } catch { /* best-effort */ } }
  }
}

/** The line the token commands print after a successful reset. */
export const SESSION_RESET_DONE_LINE = '✓ Session state reset — guidance starts fresh with the new credential.';
/** …and when the reset could not run (the credential is saved either way). */
export function sessionResetSkippedLine(error: string): string {
  return `Note: session state was not reset (${error}); it resets by itself after 30 minutes of inactivity.`;
}
