// ============================================================================
// Static content for the settings chooser — Alt+Shift+T.
// ----------------------------------------------------------------------------
// The CLI opens this with Ctrl+T (`TtySelectFn.ts:174` -> `spawnRootChooserFlow`):
// a root menu of "Adjust advisory frequency" / "Configure role" / "Done!", each
// opening a list, each save looping BACK to the root so both can be changed in
// one visit. This is that menu, on the PE dock.
//
// ── WHY NOT Ctrl+T HERE ──────────────────────────────────────────────────────
// Plain Ctrl+T is the browser's new-tab shortcut and is not interceptable by a
// page — `ui/panel.js:571` says so, and the advisory panel remapped it to
// Alt+Shift+T on 2026-07-11. The PE dock's own key handler documents the same
// family (`surface-controller.ts:509`): Alt+Shift+J and Alt+Shift+arrows mean
// nothing to Chrome, Firefox or the OS, so a press with strayed focus is
// harmless instead of a browser action. Ctrl+Shift stays disqualified
// (Ctrl+Shift+J is DevTools).
//
// ── WHY THIS LIVES ON THE PE DOCK AT ALL ─────────────────────────────────────
// The advisory panel (`ui/panel.js`) already has this chooser, but that panel is
// removed by default (MPS-7 parity), and the options page dropped its frequency
// control on 2026-08-25 because it "advertised a control over a surface this
// extension no longer shows". The PE dock IS shown — so this is where the
// control belongs now. Exactly the same gap the CLI had, and for the same
// reason: the chooser outlived the surface that carried it.
//
// The two value lists are the advisory panel's, verbatim (`panel.js:261-271`),
// which are in turn the CLI's (`TtySelectFn.ts:276-279` / `role-description.ts`).
// They are duplicated here rather than imported: `role-description.ts` is a CLI
// module that pulls in picocolors, and `panel.js` is the frozen advisory panel.
// A contract test pins these against the CLI's own list so they cannot drift.
// ============================================================================

import type { SurfaceModel, SurfaceRow } from '../surface-model.js';

/** Header suffix for each view: the frame reads `◆ NEXPATH CLI · <label>`. */
export const SETTINGS_ROOT_LABEL = 'Settings';
export const SETTINGS_FREQUENCY_LABEL = 'Advisory frequency';
export const SETTINGS_ROLE_LABEL = 'Project role';

/** Root: Enter opens a list, Esc returns to the prompt with the body untouched. */
export const SETTINGS_ROOT_FOOTER = '↑↓ move · Enter open · Esc back to prompt';
/** A list: Enter saves and returns to the root (the CLI's loop-back), Esc just returns. */
export const SETTINGS_LIST_FOOTER = '↑↓ move · Enter save · Esc back';

/** Appended to the PE footer so the shortcut is discoverable, per D1.3's rule
 *  that the Alt+Shift family is the ADVERTISED one. */
export const SETTINGS_HINT = 'Alt+Shift+T settings';

/** `panel.js:261-265` — the CLI's High / Medium / Low, in the CLI's order. */
export const SETTINGS_FREQUENCY_CHOICES = [
  { value: 'optimum',     label: 'High' },
  { value: 'every_event', label: 'Medium' },
  { value: 'major_only',  label: 'Low' },
] as const;

/** `panel.js:266-271` — the same four roles, labels and order as the CLI installer. */
export const SETTINGS_ROLE_CHOICES = [
  { value: 'founder',      label: 'founder / product creator' },
  { value: 'vibe_coder',   label: 'vibe coder' },
  { value: 'indie_hacker', label: 'indie hacker' },
  { value: 'pm',           label: 'product manager' },
] as const;

export const SETTINGS_DONE_LABEL = 'Done';

/** The display name of a stored value, or undefined when it is unset/unknown. */
export function settingsFrequencyLabel(value: string | undefined): string | undefined {
  const choice = SETTINGS_FREQUENCY_CHOICES.find((c) => c.value === value);
  if (choice) return choice.label;
  // Two levels stay settable from the CLI and are honoured by the gate, but are
  // not offered here. Naming them is what keeps the root menu honest — a user
  // who set `off` must not be told "High".
  if (value === 'once_per_session') return 'Once per session';
  if (value === 'off') return 'Off';
  return undefined;
}

export function settingsRoleLabel(value: string | undefined): string | undefined {
  return SETTINGS_ROLE_CHOICES.find((c) => c.value === value)?.label;
}

/** `Advisory frequency — High`, or just the name when nothing is stored yet. */
function rootRowLabel(name: string, value: string | undefined): string {
  return value ? `${name} — ${value}` : name;
}

/**
 * The root menu. Each row carries the CURRENT value in its label, which is what
 * confirms a save: a list returns here, and the new value is on screen without
 * an extra step or a round-trip to the worker.
 */
export function settingsRootModel(current: {
  frequency?: string;
  role?: string;
}): SurfaceModel {
  const rows: SurfaceRow[] = [
    {
      kind: 'action',
      label: rootRowLabel(SETTINGS_FREQUENCY_LABEL, settingsFrequencyLabel(current.frequency)),
      setting: 'frequency',
    },
    {
      kind: 'action',
      label: rootRowLabel(SETTINGS_ROLE_LABEL, settingsRoleLabel(current.role)),
      setting: 'role',
    },
    { kind: 'action', label: SETTINGS_DONE_LABEL, setting: 'done', blankBefore: true },
  ];
  return { id: 'settings', label: SETTINGS_ROOT_LABEL, rows, footer: SETTINGS_ROOT_FOOTER };
}

/** One value list. The stored value is marked, exactly as the CLI's sub-menus do. */
function listModel(
  label: string,
  setting: 'frequency' | 'role',
  choices: readonly { value: string; label: string }[],
  current: string | undefined,
): SurfaceModel {
  const rows: SurfaceRow[] = choices.map((choice) => ({
    kind: 'action',
    label: choice.value === current ? `${choice.label} (current)` : choice.label,
    setting,
    settingValue: choice.value,
  }));
  return { id: 'settings', label, rows, footer: SETTINGS_LIST_FOOTER };
}

export function settingsFrequencyModel(current: string | undefined): SurfaceModel {
  return listModel(SETTINGS_FREQUENCY_LABEL, 'frequency', SETTINGS_FREQUENCY_CHOICES, current);
}

export function settingsRoleModel(current: string | undefined): SurfaceModel {
  return listModel(SETTINGS_ROLE_LABEL, 'role', SETTINGS_ROLE_CHOICES, current);
}

/** Which list row is the stored one — the focus a list opens on. */
export function settingsFocusIndex(
  choices: readonly { value: string }[],
  current: string | undefined,
): number {
  const index = choices.findIndex((c) => c.value === current);
  return index >= 0 ? index : 0;
}

/** The harness fixture: the root, as a fresh install sees it. */
export const SETTINGS_FIXTURE: SurfaceModel = settingsRootModel({ frequency: 'optimum', role: 'founder' });
