import { getConfig } from '../../store/config.js';
import { setAdvisoryFrequency, setRole, VALID_ROLES } from './config-setters.js';
import { ROLE_OPTIONS } from './role-description.js';
import type { Store } from '../../store/db.js';
import type {
  PromptEnhancementSettingsControlV1,
  PromptEnhancementFrequencyLevelV1,
} from '../../prompt-enhancement/cli-settings-shortcut.js';

/**
 * The store side of the PE popup's Ctrl+T settings chooser (owner request 2026-09-18, role added
 * 2026-09-19). The popup itself never opens or imports a store — it is bundled for the browser — so
 * each CLI host hands it this. The role options travel through here too, which is what lets
 * `role-description.ts` stay the single source of truth for them without being pulled into that
 * bundle (it imports picocolors).
 *
 * Scope matches the Decision Session menu this restores, and the pipeline's own lookup order
 * (`auto.ts`: `<key>:<projectRoot>` ?? `<key>`): the chooser READS project-scoped-then-global and
 * WRITES project-scoped, for both settings. A choice made in one project's popup therefore takes
 * effect immediately for that project and leaves every other project alone — `nexpath config set
 * advisory_frequency|role <value>` remains the way to move the global default.
 *
 * ⚠️ The BROWSER's chooser deliberately differs: it writes the GLOBAL keys and clears any
 * per-project override (user decision 2026-07-10), because there the chooser and the visible options
 * page must be one setting. Same menu, different scope, each matching its own surface's history.
 */
export function buildPromptEnhancementSettingsControlV1(
  store: Store,
  projectRoot: string,
): PromptEnhancementSettingsControlV1 {
  const frequencyKey = `advisory_frequency:${projectRoot}`;
  const roleKey = `role:${projectRoot}`;
  const readScoped = (scopedKey: string, globalKey: string): string | undefined =>
    getConfig(store.db, scopedKey) ?? getConfig(store.db, globalKey) ?? undefined;
  return {
    readFrequency: () => readScoped(frequencyKey, 'advisory_frequency'),
    // Validated by the setters; a throw is reported to the chooser as "not saved" rather than taking
    // the popup down with it.
    writeFrequency: (level: PromptEnhancementFrequencyLevelV1) => setAdvisoryFrequency(store, frequencyKey, level),
    roleOptions: ROLE_OPTIONS.map((option) => ({ value: option.value, label: option.label })),
    readRole: () => {
      // A legacy 'clear' or an unrecognised value reads as unset, so no row is marked current and the
      // menu never names a role the pipeline would not honour.
      const value = readScoped(roleKey, 'role');
      return value && (VALID_ROLES as readonly string[]).includes(value) ? value : undefined;
    },
    writeRole: (role: string) => setRole(store, roleKey, role),
  };
}
