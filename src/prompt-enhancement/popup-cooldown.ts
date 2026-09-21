/**
 * Shared PE / MPS-1 popup-cooldown logic.
 *
 * One source of truth for "how many prompts to suppress NEW popups after one is shown", so the Stop
 * hook (show-time enforcement) and the auto pipeline (prepare-time gating) cannot drift apart. No new
 * config and no new session state — it reuses `prompt_enhancement.popup_cooldown` and the session's
 * `lastPromptEnhancementPromptIndex`.
 *
 * ⚠️ It lives in its own module rather than being exported from `stop.ts` because `stop.ts` already
 * imports `auto.ts`; importing back the other way would close a module cycle.
 */

import type { Store } from '../store/db.js';
import { getConfig } from '../store/config.js';

/**
 * Resolve the PE / MPS-1 popup cooldown (in prompts). Config `prompt_enhancement.popup_cooldown`
 * (project-scoped first, then global), default 3. `0` disables the cooldown (every eligible prompt may
 * pop). Non-numeric / negative → default 3.
 *
 * Measured on s09 (392 prompts, High): at 7 the run showed 9 popups and threw away 8 that were already
 * prepared; at 3 it showed 14 and threw away 5, with gaps of 3-6 where 7 had been the floor. The silence
 * after the advisory budget runs out is unchanged by this value — that is a different cause.
 */
export function resolvePromptEnhancementPopupCooldownV1(store: Store, projectRoot: string): number {
  const raw = getConfig(store.db, `prompt_enhancement.popup_cooldown:${projectRoot}`)
    ?? getConfig(store.db, 'prompt_enhancement.popup_cooldown');
  const n = raw === undefined ? 3 : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

/**
 * True when a PE / MPS-1 popup was shown recently enough to still be in cooldown.
 *
 * @param lastPopupIndex promptCount at which the last popup was shown; -1 = none yet, and the first
 *                       popup of a session always shows.
 * @param promptCount    current session prompt count.
 * @param cooldown       resolved cooldown in prompts; <= 0 disables it (never active).
 */
export function isPromptEnhancementPopupCooldownActiveV1(
  lastPopupIndex: number,
  promptCount: number,
  cooldown: number,
): boolean {
  if (cooldown <= 0) return false;
  return lastPopupIndex >= 0 && (promptCount - lastPopupIndex) < cooldown;
}
