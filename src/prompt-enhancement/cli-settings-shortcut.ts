/**
 * Ctrl+T — the settings chooser inside the PE popup: advisory frequency and project role.
 *
 * This is the shortcut the Decision Session popup used to carry. `TtySelectFn.ts:174` captured
 * Ctrl+T and `spawnRootChooserFlow` (:426) opened a root menu of "Adjust advisory frequency" /
 * "Configure role" / "Done!", each list writing a project-scoped key and LOOPING BACK to the root so
 * both could be changed in one visit. DS is disabled outright (MPS-7) and the install frequency
 * picker is hidden (owner ruling 2026-08-10), so that menu had become unreachable. Restored here on
 * owner request — frequency 2026-09-18, the root menu with role beside it 2026-09-19 — with the same
 * two entries and the same loop-back.
 *
 * The browser's PE dock carries the same chooser on Alt+Shift+T (`ext-browser/ui/surfaces/fixtures/
 * settings.ts`), because plain Ctrl+T is the browser's new-tab shortcut and cannot be intercepted
 * there. Same menu, same order, same wording; the key is the only difference.
 *
 * Everything here is pure or injected: the reducer and the renderer take state and return state or a
 * string, and the loop takes `readKey` / `paint` / `control` from its caller. The raw-TTY shell in
 * `cli-submit-popup.ts` is the only thing that knows about a terminal, and the store writes are the
 * host's. This file imports NOTHING, and a test pins that: `cli-submit-popup.ts` is bundled for the
 * browser, so a `store/` import here would drag sql.js into the extension — and the role options
 * arrive through the control rather than from `cli/shared/role-description.ts` for the same reason,
 * so that module stays the single source of truth without being pulled into the bundle.
 *
 * Deliberately NOT here:
 *   - `once_per_session` and `off`. Both stay valid and honoured by the gate; they are reachable with
 *     `nexpath config set advisory_frequency …`, exactly as in the old DS picker.
 *   - any change to the popup's own key decoding. Ctrl+T is handled beside Ctrl+C in the shell's key
 *     loop, so the shared reducer (which the browser also drives) is untouched.
 */

// Keys, as the terminal delivers them in raw mode. Written with fromCharCode rather than escapes to
// match `cli-submit-popup.ts`, and so no control character can hide inside a string literal.
const ESC = String.fromCharCode(27);
const KEY_UP = `${ESC}[A`;
const KEY_DOWN = `${ESC}[B`;
const KEY_ENTER = String.fromCharCode(13);
const KEY_ESCAPE = ESC;
const KEY_CTRL_C = String.fromCharCode(3);

/** Ctrl+T. */
export const PROMPT_ENHANCEMENT_SETTINGS_SHORTCUT_KEY_V1 = String.fromCharCode(20);

export function isPromptEnhancementSettingsShortcutKeyV1(raw: string): boolean {
  return raw === PROMPT_ENHANCEMENT_SETTINGS_SHORTCUT_KEY_V1;
}

/** The PE footer's hint. The current VALUES are named in the root menu, not here. */
export const PROMPT_ENHANCEMENT_SETTINGS_HINT_V1 = 'Ctrl+T settings';

/** The three frequency levels the popup offers, in the order the CLI lists them. */
export const PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1 = [
  { value: 'optimum',     label: 'High',   help: 'Surface every advisory that qualifies' },
  { value: 'every_event', label: 'Medium', help: 'Fewer advisories — capped per session' },
  { value: 'major_only',  label: 'Low',    help: 'Only major findings' },
] as const;

export type PromptEnhancementFrequencyLevelV1 = typeof PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1[number]['value'];

/**
 * Display name for a configured frequency. The two CLI-only levels get their own names rather than
 * being reported as one of the three rows — the menu must never tell a user who set `off` that their
 * frequency is "High". An unset or unknown value has no name, and the caller then shows none.
 */
export function promptEnhancementFrequencyLabelV1(value: string | undefined): string | undefined {
  const choice = PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1.find((c) => c.value === value);
  if (choice) return choice.label;
  if (value === 'once_per_session') return 'Once per session';
  if (value === 'off') return 'Off';
  return undefined;
}

/** One selectable row. The role options arrive in this shape from the control. */
export interface PromptEnhancementSettingsOptionV1 {
  value: string;
  label: string;
}

/**
 * Reading and writing the two settings. The popup never touches a store itself: the CLI hosts own the
 * open store and pass this in. When it is absent the shortcut is inert and unadvertised — which is
 * the case for every non-CLI surface, since the browser drives the popup through its own interaction.
 */
export interface PromptEnhancementSettingsControlV1 {
  /** Configured frequency, project-scoped first then global, or undefined when unset. */
  readFrequency: () => string | undefined;
  /** Persist the chosen level. May throw — a throw is reported as "not saved", never rethrown. */
  writeFrequency: (level: PromptEnhancementFrequencyLevelV1) => void;
  /** The role options to offer, in display order. Supplied by the host so this file stays import-free. */
  roleOptions: readonly PromptEnhancementSettingsOptionV1[];
  /** Configured role, project-scoped first then global, or undefined when unset. */
  readRole: () => string | undefined;
  /** Persist the chosen role. May throw — same contract as `writeFrequency`. */
  writeRole: (role: string) => void;
}

export type PromptEnhancementSettingsViewV1 = 'root' | 'frequency' | 'role';

export interface PromptEnhancementSettingsStateV1 {
  view: PromptEnhancementSettingsViewV1;
  focusIndex: number;
  /** What the store holds right now — named in the root menu, marked "(current)" in a list. */
  frequency: string | undefined;
  role: string | undefined;
}

/** The root menu, in display order. "Done" closes it, exactly as the DS root chooser's did. */
export const PROMPT_ENHANCEMENT_SETTINGS_ROOT_ROWS_V1 = [
  { key: 'frequency', label: 'Advisory frequency', help: 'How often nexpath surfaces advisories in this project' },
  { key: 'role',      label: 'Project role',       help: 'What nexpath assumes you are building, and how it guides you' },
  { key: 'done',      label: 'Done',               help: 'Back to the prompt' },
] as const;

/** Open on the root menu, carrying whatever is configured now. */
export function buildPromptEnhancementSettingsStateV1(
  frequency: string | undefined,
  role: string | undefined,
): PromptEnhancementSettingsStateV1 {
  return { view: 'root', focusIndex: 0, frequency, role };
}

/** The rows of the open view, as value/label pairs; the root's values are its destinations. */
function rowsFor(
  state: PromptEnhancementSettingsStateV1,
  roleOptions: readonly PromptEnhancementSettingsOptionV1[],
): readonly { value: string; label: string }[] {
  if (state.view === 'frequency') return PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1;
  if (state.view === 'role') return roleOptions;
  return PROMPT_ENHANCEMENT_SETTINGS_ROOT_ROWS_V1.map((r) => ({ value: r.key, label: r.label }));
}

/** A list opens on the configured value, or on its first row when that value has none. */
export function promptEnhancementSettingsFocusIndexV1(
  choices: readonly { value: string }[],
  current: string | undefined,
): number {
  const index = choices.findIndex((c) => c.value === current);
  return index >= 0 ? index : 0;
}

export type PromptEnhancementSettingsResultV1 =
  | { kind: 'pending' }
  | { kind: 'close' }
  | { kind: 'chose_frequency'; level: PromptEnhancementFrequencyLevelV1 }
  | { kind: 'chose_role'; role: string };

/**
 * Reduce one key. Arrows move; Enter opens a list from the root or chooses a value inside one; Esc
 * leaves a list back to the root, and closes the chooser from the root. Every other key — including
 * Space, which types into a field in the popup behind this — is ignored rather than allowed to fall
 * through to that popup.
 */
export function reducePromptEnhancementSettingsV1(
  state: PromptEnhancementSettingsStateV1,
  roleOptions: readonly PromptEnhancementSettingsOptionV1[],
  raw: string,
): { state: PromptEnhancementSettingsStateV1; result: PromptEnhancementSettingsResultV1 } {
  const rows = rowsFor(state, roleOptions);
  const last = Math.max(0, rows.length - 1);

  if (raw === KEY_UP) {
    return { state: { ...state, focusIndex: Math.max(0, state.focusIndex - 1) }, result: { kind: 'pending' } };
  }
  if (raw === KEY_DOWN) {
    return { state: { ...state, focusIndex: Math.min(last, state.focusIndex + 1) }, result: { kind: 'pending' } };
  }
  if (raw === KEY_ESCAPE) {
    // Esc inside a list goes BACK, not out: leaving the popup because the user changed their mind
    // about one setting would be a surprise, and the CLI's sub-menus behave the same way.
    if (state.view === 'root') return { state, result: { kind: 'close' } };
    return { state: { ...state, view: 'root', focusIndex: 0 }, result: { kind: 'pending' } };
  }
  if (raw === KEY_ENTER) {
    const row = rows[state.focusIndex];
    if (!row) return { state, result: { kind: 'pending' } };
    if (state.view === 'root') {
      if (row.value === 'done') return { state, result: { kind: 'close' } };
      const view = row.value as PromptEnhancementSettingsViewV1;
      const focusIndex = view === 'frequency'
        ? promptEnhancementSettingsFocusIndexV1(PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1, state.frequency)
        : promptEnhancementSettingsFocusIndexV1(roleOptions, state.role);
      return { state: { ...state, view, focusIndex }, result: { kind: 'pending' } };
    }
    if (state.view === 'frequency') {
      return { state, result: { kind: 'chose_frequency', level: row.value as PromptEnhancementFrequencyLevelV1 } };
    }
    return { state, result: { kind: 'chose_role', role: row.value } };
  }
  return { state, result: { kind: 'pending' } };
}

/**
 * ANSI styles, mirroring the popup's own palette (`PROMPT_ENHANCEMENT_CLI_SGR_V1`). Duplicated rather
 * than imported to keep this module free of a cycle with `cli-submit-popup.ts`, which imports it.
 */
const SETTINGS_SGR_V1 = (() => {
  const e = String.fromCharCode(27);
  return {
    cyan: `${e}[36m`,
    green: `${e}[32m`,
    gray: `${e}[90m`,
    dim: `${e}[2m`,
    bold: `${e}[1m`,
    reset: `${e}[0m`,
  };
})();

const ROOT_FOOTER_V1 = '↑↓ move · Enter open · Esc back to prompt' as const;
const LIST_FOOTER_V1 = '↑↓ move · Enter save · Esc back' as const;

function headingFor(view: PromptEnhancementSettingsViewV1): string {
  if (view === 'frequency') return '◆ NEXPATH CLI · Advisory frequency';
  if (view === 'role') return '◆ NEXPATH CLI · Project role';
  return '◆ NEXPATH CLI · Settings';
}

/**
 * Render the open view: the root menu with each setting's CURRENT value beside it, or one of the two
 * lists with the configured value marked. Naming the values in the root is what confirms a save — a
 * list returns here, and the new value is on screen without an extra keypress.
 */
export function renderPromptEnhancementSettingsFrameV1(
  state: PromptEnhancementSettingsStateV1,
  roleOptions: readonly PromptEnhancementSettingsOptionV1[],
  options: { colorize?: boolean } = {},
): string {
  const c = options.colorize ? SETTINGS_SGR_V1 : null;
  const header = headingFor(state.view);
  const lines: string[] = [
    c ? `${c.cyan}${c.bold}${header}${c.reset}` : header,
    c ? `${c.dim}${'─'.repeat(header.length)}${c.reset}` : '─'.repeat(header.length),
    '',
  ];

  const pushRow = (label: string, focused: boolean, help: string | undefined): void => {
    if (c) {
      const bullet = focused ? `${c.green}●${c.reset}` : `${c.gray}○${c.reset}`;
      lines.push(`${c.cyan}│${c.reset} ${bullet} ${focused ? `${c.bold}${label}${c.reset}` : `${c.dim}${label}${c.reset}`}`);
    } else {
      lines.push(`  ${focused ? '●' : '○'} ${label}`);
    }
    if (focused && help) lines.push(c ? `      ${c.dim}${help}${c.reset}` : `      ${help}`);
  };

  if (state.view === 'root') {
    const roleLabel = roleOptions.find((o) => o.value === state.role)?.label;
    PROMPT_ENHANCEMENT_SETTINGS_ROOT_ROWS_V1.forEach((row, index) => {
      const value = row.key === 'frequency' ? promptEnhancementFrequencyLabelV1(state.frequency)
        : row.key === 'role' ? roleLabel
          : undefined;
      pushRow(value ? `${row.label} — ${value}` : row.label, index === state.focusIndex, row.help);
    });
    lines.push('', c ? `${c.dim}${ROOT_FOOTER_V1}${c.reset}` : ROOT_FOOTER_V1);
    return lines.join('\n');
  }

  const current = state.view === 'frequency' ? state.frequency : state.role;
  const rows: readonly { value: string; label: string; help?: string }[] =
    state.view === 'frequency' ? PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1 : roleOptions;
  rows.forEach((row, index) => {
    pushRow(
      row.value === current ? `${row.label} (current)` : row.label,
      index === state.focusIndex,
      row.help,
    );
  });
  lines.push('', c ? `${c.dim}${LIST_FOOTER_V1}${c.reset}` : LIST_FOOTER_V1);
  return lines.join('\n');
}

export interface PromptEnhancementSettingsOutcomeV1 {
  /** What was saved in this visit, in order. Empty when the user only looked. */
  saved: readonly { setting: 'frequency' | 'role'; value: string }[];
  /** Writes that threw, with the reason — the popup survives a locked or read-only store. */
  failed: readonly { setting: 'frequency' | 'role'; reason: string }[];
}

/**
 * Run the chooser to completion against an injected terminal. Returns when the user picks "Done",
 * presses Esc at the root, or presses Ctrl+C — which closes the CHOOSER, not the popup behind it
 * (losing an enhanced prompt the user had been editing because they wanted to check a setting would
 * be a poor trade). A save returns to the root, so both settings can be changed in one visit, exactly
 * as the DS root chooser did. A failed write is reported, never thrown.
 */
export async function runPromptEnhancementSettingsChooserV1(input: {
  control: PromptEnhancementSettingsControlV1;
  readKey: () => Promise<string>;
  paint: (frame: string) => void;
  colorize?: boolean;
}): Promise<PromptEnhancementSettingsOutcomeV1> {
  const { control } = input;
  const read = (fn: () => string | undefined): string | undefined => {
    try {
      return fn();
    } catch {
      return undefined;
    }
  };
  const saved: { setting: 'frequency' | 'role'; value: string }[] = [];
  const failed: { setting: 'frequency' | 'role'; reason: string }[] = [];

  let state = buildPromptEnhancementSettingsStateV1(read(control.readFrequency), read(control.readRole));
  const paint = (): void => input.paint(
    renderPromptEnhancementSettingsFrameV1(state, control.roleOptions, { colorize: input.colorize }),
  );
  paint();

  for (;;) {
    const raw = await input.readKey();
    if (raw === KEY_CTRL_C) return { saved, failed };
    const stepped = reducePromptEnhancementSettingsV1(state, control.roleOptions, raw);
    state = stepped.state;
    const result = stepped.result;

    if (result.kind === 'close') return { saved, failed };

    if (result.kind === 'chose_frequency' || result.kind === 'chose_role') {
      const setting = result.kind === 'chose_frequency' ? 'frequency' : 'role';
      const value = result.kind === 'chose_frequency' ? result.level : result.role;
      try {
        if (result.kind === 'chose_frequency') control.writeFrequency(result.level);
        else control.writeRole(result.role);
        saved.push({ setting, value });
      } catch (error) {
        failed.push({ setting, reason: error instanceof Error ? error.message : String(error) });
      }
      // Re-read rather than assume the write landed, then return to the root, where both current
      // values are on screen — that is the confirmation.
      state = {
        ...state,
        view: 'root',
        focusIndex: 0,
        frequency: read(control.readFrequency),
        role: read(control.readRole),
      };
    }
    paint();
  }
}
