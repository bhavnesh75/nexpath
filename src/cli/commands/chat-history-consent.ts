/**
 * Whether the user allowed NexPath to read each editor's AI chat history.
 *
 * The editor extension asks once — "Allow Nexpath to read your AI chat history for prompt-level
 * guidance?" — and keeps the answer inside the editor, where the CLI cannot read it. What the CLI
 * can read is the extension's heartbeat under `~/.nexpath/` (see `deliverer-state.ts`): every few
 * seconds each running editor window writes whether its submit poller is armed and, when it is
 * not, why — `consent_not_granted` whenever the answer is anything but yes.
 *
 * So, per editor: a fresh armed beat means allowed (the poller only arms after a yes); a fresh
 * not-armed beat means allowed unless its reason is `consent_not_granted` or a shutdown marker
 * that says nothing about consent. No heartbeat, a stale one, or anything unreadable means NOT
 * allowed — that editor's chat history is simply not read.
 *
 * Cursor's extension host is `cursor`; Devin Desktop's is `windsurf`.
 */
import { readDelivererState, type DelivererStateDeps } from './deliverer-state.js';

/** Not-armed reasons that say nothing about the consent answer (written when a window closes). */
const SHUTDOWN_REASONS: ReadonlySet<string> = new Set(['disposed', 'reactivated']);

export interface ChatHistoryConsent {
  cursor: boolean;
  devin: boolean;
}

function editorAllows(host: 'cursor' | 'windsurf', deps: DelivererStateDeps): boolean {
  const state = readDelivererState(host, deps);
  if (state.state === 'armed') return true;
  if (state.state !== 'not_armed' || state.reason === undefined) return false;
  return state.reason !== 'consent_not_granted' && !SHUTDOWN_REASONS.has(state.reason);
}

export function readChatHistoryConsent(deps: DelivererStateDeps = {}): ChatHistoryConsent {
  try {
    return { cursor: editorAllows('cursor', deps), devin: editorAllows('windsurf', deps) };
  } catch {
    return { cursor: false, devin: false };
  }
}
