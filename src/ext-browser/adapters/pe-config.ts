/**
 * Prompt-enhancement configuration reads for the browser — hidden
 * `storage.local` keys mirroring the CLI's config table entries. NONE of these
 * keys are ever rendered in options.html or renderSelfCheck (guard-tested):
 * they are internal tuning knobs, set only from the extension's own DevTools
 * console when needed, exactly like the CLI's config-only keys.
 */

import browser from 'webextension-polyfill';

/** Mirrors the CLI's `prompt_enhancement.popup_cooldown` config key (stop.ts). */
export const PE_POPUP_COOLDOWN_KEY = 'prompt_enhancement.popup_cooldown';

/**
 * The CLI's default: suppress NEW PE popups for 3 prompts after one shows.
 *
 * Was 7 until 2026-09-17. The CLI measured the two values over a 392-prompt run — 7 showed 9 popups and
 * threw away 8 already-prepared ones, 3 showed 14 and threw away 5 — and shipped 3 as its default. This
 * literal is the browser's own copy of that number, so it has to move with it or the two surfaces show
 * popups at different rates for no reason a user could explain.
 */
export const PE_POPUP_COOLDOWN_DEFAULT = 3;

/**
 * Resolve the PE / MPS-1 popup cooldown (in prompts) — project-scoped key
 * first, then global, then the default. 0 disables the cooldown; non-numeric /
 * negative / missing fall back to the default. Byte-mirrors the CLI's
 * `resolvePromptEnhancementPopupCooldownV1` fallback order and parsing.
 */
export async function resolvePePopupCooldown(projectRoot: string): Promise<number> {
  const projectKey = `${PE_POPUP_COOLDOWN_KEY}:${projectRoot}`;
  let raw: unknown;
  try {
    const got = await browser.storage.local.get([projectKey, PE_POPUP_COOLDOWN_KEY]);
    const record = got as Record<string, unknown>;
    raw = record[projectKey] ?? record[PE_POPUP_COOLDOWN_KEY];
  } catch {
    return PE_POPUP_COOLDOWN_DEFAULT;
  }
  if (raw === undefined || raw === null) return PE_POPUP_COOLDOWN_DEFAULT;
  const n = typeof raw === 'number' ? Math.trunc(raw) : Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : PE_POPUP_COOLDOWN_DEFAULT;
}

/**
 * MPS sequence master switch — the browser mirror of the CLI's
 * `prompt_enhancement.sequence.enabled`, whose DEFAULT upstream changed to
 * 'off' (main, 2026-08-24: the facade gates the MPS-1 summary on it when its
 * CLI deps are threaded). The browser calls the engine's no-deps entry — which
 * upstream deliberately kept summary-emitting — so this hidden key restores
 * exact default parity: no MPS-1 offer unless the key is EXACTLY 'on' (A9
 * exact-equality read; hidden — never surfaced in the options UI).
 */
export const PE_SEQUENCE_ENABLED_KEY = 'prompt_enhancement.sequence.enabled';

export async function resolvePeSequenceEnabled(projectRoot: string): Promise<boolean> {
  const projectKey = `${PE_SEQUENCE_ENABLED_KEY}:${projectRoot}`;
  try {
    const got = await browser.storage.local.get([projectKey, PE_SEQUENCE_ENABLED_KEY]);
    const record = got as Record<string, unknown>;
    const raw = record[projectKey] ?? record[PE_SEQUENCE_ENABLED_KEY];
    return raw === 'on';
  } catch {
    return false; // fail to the CLI's default: sequences off
  }
}
