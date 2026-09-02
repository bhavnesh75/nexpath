/**
 * Shared PE / MPS-1 popup-cooldown logic.
 *
 * Single source of truth for "how many prompts to suppress NEW popups after one is shown" so the
 * Stop hook (show-time enforcement) and the auto pipeline (prepare-time gating) agree on the same
 * numbers and rule. No new config or session state — reuses `prompt_enhancement.popup_cooldown`
 * and the session's `lastPromptEnhancementPromptIndex`.
 */

import type { Store } from '../store/db.js';
import { getConfig } from '../store/config.js';

/**
 * Resolve the PE / MPS-1 popup cooldown (in prompts). Config `prompt_enhancement.popup_cooldown`
 * (project-scoped first, then global), default 7. `0` disables the cooldown (every eligible prompt
 * may pop). Non-numeric / negative → default 7.
 */
export function resolvePromptEnhancementPopupCooldownV1(store: Store, projectRoot: string): number {
  const raw = getConfig(store.db, `prompt_enhancement.popup_cooldown:${projectRoot}`)
    ?? getConfig(store.db, 'prompt_enhancement.popup_cooldown');
  const n = raw === undefined ? 7 : Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 7;
}

/**
 * True when a PE / MPS-1 popup was shown recently enough to still be in cooldown.
 *
 * @param lastPopupIndex promptCount at which the last popup was shown; -1 = none yet (first popup
 *                       always shows).
 * @param promptCount    current session prompt count.
 * @param cooldown       resolved cooldown in prompts; <= 0 disables (never active).
 *
 * Mirrors the Stop hook rule exactly: active iff a popup has shown AND fewer than `cooldown` prompts
 * have elapsed since it.
 */
export function isPromptEnhancementPopupCooldownActiveV1(
  lastPopupIndex: number,
  promptCount: number,
  cooldown: number,
): boolean {
  if (cooldown <= 0) return false;
  return lastPopupIndex >= 0 && (promptCount - lastPopupIndex) < cooldown;
}
