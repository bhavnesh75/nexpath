import { setConfig } from '../../store/config.js';
import type { Store } from '../../store/db.js';
import { ConfigValidationError } from '../../config/prompt-enhancement-errors.js';
export { ConfigValidationError } from '../../config/prompt-enhancement-errors.js';

export const VALID_ROLES = ['founder', 'indie_hacker', 'pm', 'vibe_coder'] as const;
export type RoleValue = typeof VALID_ROLES[number];

export const VALID_ADVISORY_FREQUENCY_LEVELS = [
  'off',
  'major_only',
  'once_per_session',
  'every_event',
  'optimum',
] as const;
export type AdvisoryFrequencyValue = typeof VALID_ADVISORY_FREQUENCY_LEVELS[number];

/**
 * Validate and persist an advisory_frequency value at the given config key
 * (e.g. 'advisory_frequency' or 'advisory_frequency:/some/project').
 * Empty string is accepted and treated as unset.
 */
export function setAdvisoryFrequency(store: Store, key: string, value: string): void {
  if (value !== '' && !(VALID_ADVISORY_FREQUENCY_LEVELS as readonly string[]).includes(value)) {
    throw new ConfigValidationError(
      `Invalid advisory_frequency "${value}". Valid values: ${VALID_ADVISORY_FREQUENCY_LEVELS.join(', ')}`,
    );
  }
  setConfig(store, key, value);
}

/**
 * Validate and persist a role value at the given config key
 * (e.g. 'role' or 'role:/some/project').
 * Empty string is accepted and treated as unset.
 */
export function setRole(store: Store, key: string, value: string): void {
  if (value !== '' && !(VALID_ROLES as readonly string[]).includes(value)) {
    throw new ConfigValidationError(
      `Invalid role "${value}". Valid values: ${VALID_ROLES.join(', ')}`,
    );
  }
  setConfig(store, key, value);
}

export const PROMPT_ENHANCEMENT_POPUP_COOLDOWN_KEY = 'prompt_enhancement.popup_cooldown' as const;

/**
 * Validate and persist the PE / MPS-1 popup cooldown (a NON-NEGATIVE WHOLE NUMBER of prompts) at the
 * given config key (e.g. 'prompt_enhancement.popup_cooldown' or a ':/project' scoped variant).
 * After a popup is shown, new PE / MPS-1 popups are suppressed for this many prompts (default 3;
 * 0 disables the cooldown). Empty string is accepted and treated as unset (→ default).
 */
export function setPromptEnhancementPopupCooldown(store: Store, key: string, value: string): void {
  if (value !== '') {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0) {
      throw new ConfigValidationError(
        `Invalid ${key} "${value}". Expected a non-negative whole number of prompts (e.g. 0, 5, 15).`,
      );
    }
  }
  setConfig(store, key, value);
}
