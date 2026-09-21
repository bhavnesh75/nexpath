// @vitest-environment jsdom
//
// The Alt+Shift+T settings chooser — the CLI's Ctrl+T menu on the PE dock.
//
// Two layers are covered here because the behaviour is split across two by
// design: the CONTROLLER owns the key, the save slot and Esc (it is the only
// layer that sees a keypress and the edited body), while the ADAPTER owns the
// models and what activating a row means. The seam between them is the
// `settings` registry entry and `resolveActivation`.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createSurfaceController,
  type SurfaceController,
  type SurfaceEvent,
} from './surface-controller.js';
import { PE_FIXTURE } from './fixtures/pe.js';
import { PEF_FIXTURE } from './fixtures/pef.js';
import { RATING_FIXTURE } from './fixtures/rating.js';
import {
  SETTINGS_DONE_LABEL,
  SETTINGS_FREQUENCY_CHOICES,
  SETTINGS_FREQUENCY_LABEL,
  SETTINGS_HINT,
  SETTINGS_LIST_FOOTER,
  SETTINGS_ROLE_CHOICES,
  SETTINGS_ROLE_LABEL,
  SETTINGS_ROOT_FOOTER,
  settingsFocusIndex,
  settingsFrequencyLabel,
  settingsFrequencyModel,
  settingsRoleLabel,
  settingsRoleModel,
  settingsRootModel,
} from './fixtures/settings.js';
import type { SurfaceModel, SurfaceRow } from './surface-model.js';

let host: HTMLElement;
let events: SurfaceEvent[];
let controller: SurfaceController | undefined;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  events = [];
});

afterEach(() => {
  controller?.destroy();
  controller = undefined;
  document.body.innerHTML = '';
});

/** The adapter's transitions, reduced to what this seam needs. */
function settingsTransitions(current: { frequency?: string; role?: string }, saved: string[][]) {
  return (model: SurfaceModel, row: SurfaceRow) => {
    if (model.id !== 'settings' || row.kind !== 'action') return null;
    if (row.settingValue !== undefined && row.setting !== 'done') {
      saved.push([row.setting === 'role' ? 'set-role' : 'set-frequency', row.settingValue]);
      if (row.setting === 'role') current.role = row.settingValue;
      else current.frequency = row.settingValue;
      return { model: settingsRootModel(current) };
    }
    if (row.setting === 'frequency') {
      return {
        model: settingsFrequencyModel(current.frequency),
        focusIndex: settingsFocusIndex(SETTINGS_FREQUENCY_CHOICES, current.frequency),
      };
    }
    if (row.setting === 'role') {
      return {
        model: settingsRoleModel(current.role),
        focusIndex: settingsFocusIndex(SETTINGS_ROLE_CHOICES, current.role),
      };
    }
    return null; // 'Done' is the controller's — only it can restore the body
  };
}

function mount(
  current: { frequency?: string; role?: string } = { frequency: 'optimum', role: 'founder' },
  saved: string[][] = [],
  withSettings = true,
): SurfaceController {
  const registry: Record<string, SurfaceModel> = {
    prompt_enhancement: PE_FIXTURE,
    prompt_enhancement_feedback: PEF_FIXTURE,
    advisory_rating: RATING_FIXTURE,
  };
  if (withSettings) registry.settings = settingsRootModel(current);
  controller = createSurfaceController(host, {
    registry,
    initial: 'prompt_enhancement',
    onEvent: (e) => events.push(e),
    resolveActivation: settingsTransitions(current, saved),
  });
  return controller;
}

function key(target: Element, k: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent('keydown', {
    key: k, code: init.code ?? k, bubbles: true, cancelable: true, ...init,
  }));
}

/** Alt+Shift+T, as the browser delivers it (e.code, never e.key — macOS composes). */
function altShiftT(target: Element): void {
  key(target, 'T', { code: 'KeyT', altKey: true, shiftKey: true });
}

function header(): string {
  return host.textContent ?? '';
}

function focusedLabel(): string | undefined {
  return host.querySelector('.np-row.np-focused .np-label')?.textContent ?? undefined;
}

function labels(): string[] {
  return [...host.querySelectorAll('.np-row .np-label')].map((n) => n.textContent ?? '');
}

function bodyField(): HTMLTextAreaElement {
  return host.querySelector('textarea')!;
}

// ── the key ──────────────────────────────────────────────────────────────────

describe('Alt+Shift+T opens the chooser', () => {
  it('opens the root menu from the PE surface', () => {
    const c = mount();
    expect(header()).toContain('Prompt enhancement');

    altShiftT(c.element);

    expect(c.getModel().id).toBe('settings');
    expect(header()).toContain('◆ NEXPATH CLI · Settings');
    expect(labels()).toEqual([
      `${SETTINGS_FREQUENCY_LABEL} — High`,
      `${SETTINGS_ROLE_LABEL} — founder / product creator`,
      SETTINGS_DONE_LABEL,
    ]);
  });

  it('is a no-op when the host registered no settings model', () => {
    // The fixtures harness and the rating popup have nowhere to go; the key must
    // not open an empty surface there.
    const c = mount({}, [], false);
    altShiftT(c.element);
    expect(c.getModel().id).toBe('prompt_enhancement');
  });

  it('works from inside the body field — it changes no text', () => {
    const c = mount();
    const field = bodyField();
    field.value = 'half-written prompt';
    field.dispatchEvent(new Event('input', { bubbles: true }));

    altShiftT(field);

    expect(c.getModel().id).toBe('settings');
  });

  it('opens from a surface that has no body field at all', () => {
    // `withBodyText` throws on a field-less surface, and a throw inside a key
    // listener is swallowed by the browser: the chooser would never open and
    // nothing would say why. Found by mutation, 2026-09-19.
    controller = createSurfaceController(host, {
      registry: { advisory_rating: RATING_FIXTURE, settings: settingsRootModel({}) },
      initial: 'advisory_rating',
      onEvent: (e) => events.push(e),
    });
    altShiftT(controller.element);
    expect(controller.getModel().id).toBe('settings');

    key(controller.element, 'Escape');
    expect(controller.getModel().id).toBe('advisory_rating');
  });

  it('plain Ctrl+T is NOT the binding (the browser owns it — new tab)', () => {
    const c = mount();
    key(c.element, 't', { code: 'KeyT', ctrlKey: true });
    expect(c.getModel().id).toBe('prompt_enhancement');
    // …and neither is a bare T, which is ordinary typing.
    key(c.element, 'T', { code: 'KeyT' });
    expect(c.getModel().id).toBe('prompt_enhancement');
  });

  it('does not re-enter itself while already open', () => {
    const c = mount();
    altShiftT(c.element);
    const first = c.getModel();
    altShiftT(c.element);
    // Same root, and — the point — the saved return slot was not overwritten
    // with the chooser itself, which would strand the user inside it.
    expect(c.getModel()).toBe(first);
    key(c.element, 'Escape');
    expect(c.getModel().id).toBe('prompt_enhancement');
  });
});

// ── navigation and saving ────────────────────────────────────────────────────

describe('the chooser saves and loops back', () => {
  it('opens the frequency list focused on the stored value', () => {
    const c = mount({ frequency: 'major_only', role: 'founder' });
    altShiftT(c.element);
    key(c.element, 'Enter'); // root row 0 = Advisory frequency

    expect(header()).toContain(`◆ NEXPATH CLI · ${SETTINGS_FREQUENCY_LABEL}`);
    expect(labels()).toEqual(['High', 'Medium', 'Low (current)']);
    expect(focusedLabel()).toBe('Low (current)');
  });

  it('Enter on a value saves it, returns to the root, and the root names the new value', () => {
    const saved: string[][] = [];
    const c = mount({ frequency: 'major_only', role: 'founder' }, saved);
    altShiftT(c.element);
    key(c.element, 'Enter');    // open frequency
    key(c.element, 'ArrowUp');  // Low → Medium
    key(c.element, 'ArrowUp');  // Medium → High
    key(c.element, 'Enter');    // save

    expect(saved).toEqual([['set-frequency', 'optimum']]);
    expect(c.getModel().id).toBe('settings');
    expect(labels()[0]).toBe(`${SETTINGS_FREQUENCY_LABEL} — High`);
  });

  it('both settings can be changed in one visit (the CLI loop-back)', () => {
    const saved: string[][] = [];
    const c = mount({ frequency: 'optimum', role: 'founder' }, saved);
    altShiftT(c.element);
    key(c.element, 'Enter');                       // frequency list
    key(c.element, 'ArrowDown'); key(c.element, 'Enter');  // High → Medium, save
    key(c.element, 'ArrowDown'); key(c.element, 'Enter');  // root: role list
    key(c.element, 'ArrowDown'); key(c.element, 'Enter');  // founder → vibe coder, save

    expect(saved).toEqual([['set-frequency', 'every_event'], ['set-role', 'vibe_coder']]);
    expect(labels()).toEqual([
      `${SETTINGS_FREQUENCY_LABEL} — Medium`,
      `${SETTINGS_ROLE_LABEL} — vibe coder`,
      SETTINGS_DONE_LABEL,
    ]);
  });

  it('no row is marked current when nothing is stored', () => {
    const c = mount({});
    altShiftT(c.element);
    expect(labels()).toEqual([SETTINGS_FREQUENCY_LABEL, SETTINGS_ROLE_LABEL, SETTINGS_DONE_LABEL]);
    key(c.element, 'Enter');
    expect(labels().join('|')).not.toContain('(current)');
    expect(focusedLabel()).toBe('High'); // falls back to the first row
  });
});

// ── leaving ──────────────────────────────────────────────────────────────────

describe('leaving the chooser keeps the prompt intact', () => {
  it('Esc inside a list returns to the root, not to the prompt', () => {
    const c = mount();
    altShiftT(c.element);
    key(c.element, 'Enter');
    expect(header()).toContain(SETTINGS_FREQUENCY_LABEL);

    key(c.element, 'Escape');

    expect(c.getModel().id).toBe('settings');
    expect(host.textContent).toContain(SETTINGS_ROOT_FOOTER);
    expect(events).toEqual([]); // nothing was cancelled
  });

  it('Esc at the root returns to the prompt WITH the edited body', () => {
    const c = mount();
    const field = bodyField();
    field.value = 'text the user typed before checking a setting';
    field.dispatchEvent(new Event('input', { bubbles: true }));

    altShiftT(c.element);
    key(c.element, 'Escape');

    expect(c.getModel().id).toBe('prompt_enhancement');
    expect(bodyField().value).toBe('text the user typed before checking a setting');
    // Esc here is NOT the PE surface's close — the popup must survive a settings trip.
    expect(events).toEqual([]);
  });

  it('Done leaves the same way as Esc, body and all', () => {
    const c = mount();
    const field = bodyField();
    field.value = 'still here';
    field.dispatchEvent(new Event('input', { bubbles: true }));

    altShiftT(c.element);
    key(c.element, 'ArrowDown'); key(c.element, 'ArrowDown'); // → Done
    expect(focusedLabel()).toBe(SETTINGS_DONE_LABEL);
    key(c.element, 'Enter');

    expect(c.getModel().id).toBe('prompt_enhancement');
    expect(bodyField().value).toBe('still here');
    expect(events).toEqual([]);
  });

  it('a save then Esc still returns the edited body', () => {
    const saved: string[][] = [];
    const c = mount({ frequency: 'optimum' }, saved);
    const field = bodyField();
    field.value = 'survives a save too';
    field.dispatchEvent(new Event('input', { bubbles: true }));

    altShiftT(c.element);
    key(c.element, 'Enter');
    key(c.element, 'ArrowDown');
    key(c.element, 'Enter');     // saved → back at root
    key(c.element, 'Escape');    // leave

    expect(saved).toEqual([['set-frequency', 'every_event']]);
    expect(bodyField().value).toBe('survives a save too');
  });
});

// ── the content ──────────────────────────────────────────────────────────────

describe('chooser content', () => {
  it('offers the CLI levels and roles, in the CLI order', () => {
    expect(SETTINGS_FREQUENCY_CHOICES.map((c) => [c.value, c.label])).toEqual([
      ['optimum', 'High'], ['every_event', 'Medium'], ['major_only', 'Low'],
    ]);
    expect(SETTINGS_ROLE_CHOICES.map((c) => c.value))
      .toEqual(['founder', 'vibe_coder', 'indie_hacker', 'pm']);
  });

  it('never offers the two CLI-only levels, but names them when they are stored', () => {
    const offered = SETTINGS_FREQUENCY_CHOICES.map((c) => c.value) as readonly string[];
    expect(offered).not.toContain('off');
    expect(offered).not.toContain('once_per_session');
    // A user who ran `nexpath config set advisory_frequency off` must not be told "High".
    expect(settingsFrequencyLabel('off')).toBe('Off');
    expect(settingsFrequencyLabel('once_per_session')).toBe('Once per session');
    expect(settingsFrequencyLabel('turbo')).toBeUndefined();
    expect(settingsRoleLabel('nonsense')).toBeUndefined();
  });

  it('each view carries its own footer', () => {
    const c = mount();
    altShiftT(c.element);
    expect(host.textContent).toContain(SETTINGS_ROOT_FOOTER);
    key(c.element, 'Enter');
    expect(host.textContent).toContain(SETTINGS_LIST_FOOTER);
  });

  it('the row identity is on the ROW, never in its label', () => {
    // The labels carry the current value, so a label match would unhook the row
    // the moment a value changes — the same rule `rating` follows.
    const root = settingsRootModel({ frequency: 'optimum', role: 'pm' });
    expect(root.rows.map((r) => (r.kind === 'action' ? r.setting : null)))
      .toEqual(['frequency', 'role', 'done']);
    const list = settingsFrequencyModel('optimum');
    expect(list.rows.every((r) => r.kind === 'action' && r.settingValue !== undefined)).toBe(true);
    // …and the root's rows carry NO settingValue, which is how Esc tells the two apart.
    expect(root.rows.some((r) => r.kind === 'action' && r.settingValue !== undefined)).toBe(false);
  });

  it('the hint names the shortcut that actually works in a browser', () => {
    expect(SETTINGS_HINT).toBe('Alt+Shift+T settings');
    expect(SETTINGS_HINT).not.toContain('Ctrl+T');
  });
});
