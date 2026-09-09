import type { Store } from './db.js';
import { saveStore } from './db.js';

/**
 * End every project's live session, so the next prompt starts a fresh one.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * When a credential stops working, the stage classifier's call fails and it degrades to the
 * local keyword cascade — which reads `deploy` as the `release` stage at full weight, with
 * none of the LLM classifier's hardening rules. `processPrompt` persists whatever stage that
 * guess proposes, and the session outlives the outage: the credential gets replaced, the model
 * returns, and the session is still sitting where a keyword left it, shaping every later
 * prompt. Replacing the credential does not undo that on its own, because nothing in the
 * pipeline reconsiders the session when the credential changes.
 *
 * A deliberate credential change is the one moment where "start clean" is unambiguously right,
 * so that is where this is called from — never from the hook path, and never on a transient
 * provider failure, where wiping an in-flight session would cost far more than the stale stage.
 *
 * ── Why DELETE rather than expiring the row ──────────────────────────────────
 * Removing the row makes the next `SessionStateManager.load()` find nothing and build a fresh
 * session — the same path a brand-new project takes on its first ever prompt, which is the
 * most exercised path in the codebase.
 *
 * The alternative was to age the row (`lastPromptAt = 0`) so the load takes its 30-minute
 * expiry branch instead. Rejected deliberately: that branch also folds a maturity graduation
 * observation, so it MOVES A PERSISTED COUNTER. Deleting moves none. The cost is one skipped
 * maturity observation for the ended session, against a months-scale counter — and not moving
 * a counter is the safer of the two failures.
 *
 * ── What a caller must know ──────────────────────────────────────────────────
 * ⛔ This is HYGIENE, and the credential is the user's actual intent. Every call site wraps it
 * so that a failure here — a locked database, most likely — still leaves the credential saved
 * and still prints its success line. A credential must never fail to store because a session
 * could not be cleared.
 *
 * What the next session loses: prompt history, signal counters, absence flags, fired-event
 * keys, the cached profile, and the prompt/advisory counts. All of it is rebuilt, and all of it
 * is already lost after thirty idle minutes — which every user crosses several times a day.
 */
export function expireSessionsForCredentialChange(store: Store): void {
  store.db.run('DELETE FROM session_states');
  saveStore(store);
}
