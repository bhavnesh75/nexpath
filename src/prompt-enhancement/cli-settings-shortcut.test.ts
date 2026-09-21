import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1,
  PROMPT_ENHANCEMENT_SETTINGS_HINT_V1,
  PROMPT_ENHANCEMENT_SETTINGS_ROOT_ROWS_V1,
  PROMPT_ENHANCEMENT_SETTINGS_SHORTCUT_KEY_V1,
  buildPromptEnhancementSettingsStateV1,
  isPromptEnhancementSettingsShortcutKeyV1,
  promptEnhancementFrequencyLabelV1,
  promptEnhancementSettingsFocusIndexV1,
  reducePromptEnhancementSettingsV1,
  renderPromptEnhancementSettingsFrameV1,
  runPromptEnhancementSettingsChooserV1,
  type PromptEnhancementSettingsControlV1,
  type PromptEnhancementSettingsOptionV1,
} from './cli-settings-shortcut.js';
import {
  PROMPT_ENHANCEMENT_CLI_FOOTER_V1,
  renderPromptEnhancementPopupFrameV1,
  type PromptEnhancementCliPopupViewV1,
} from './cli-submit-popup.js';
import type { PromptEnhancementPopupRenderModelV1 } from './popup-render-model.js';

const ESC = String.fromCharCode(27);
const UP = `${ESC}[A`;
const DOWN = `${ESC}[B`;
const ENTER = String.fromCharCode(13);
const CTRL_C = String.fromCharCode(3);

/** The four roles the CLI installer offers — what the host passes in. */
const ROLES: readonly PromptEnhancementSettingsOptionV1[] = [
  { value: 'founder',      label: 'founder / product creator' },
  { value: 'vibe_coder',   label: 'vibe coder' },
  { value: 'indie_hacker', label: 'indie hacker' },
  { value: 'pm',           label: 'product manager' },
];

/** A control backed by plain variables — the store side is the CLI host's, not the popup's. */
function fakeControl(initial: { frequency?: string; role?: string } = {}) {
  const state = { ...initial };
  const writes: string[][] = [];
  const control: PromptEnhancementSettingsControlV1 = {
    readFrequency: () => state.frequency,
    writeFrequency: (level) => { writes.push(['frequency', level]); state.frequency = level; },
    roleOptions: ROLES,
    readRole: () => state.role,
    writeRole: (role) => { writes.push(['role', role]); state.role = role; },
  };
  return { control, writes, state };
}

/** Drive the chooser with a fixed key script; extra reads reject so a runaway loop fails loudly. */
function keyScript(keys: readonly string[]): () => Promise<string> {
  let index = 0;
  return async () => {
    if (index >= keys.length) throw new Error('the chooser read past the end of the key script');
    return keys[index++]!;
  };
}

/** Run the chooser and keep every painted frame. */
async function run(control: PromptEnhancementSettingsControlV1, keys: readonly string[]) {
  const painted: string[] = [];
  const outcome = await runPromptEnhancementSettingsChooserV1({
    control, readKey: keyScript(keys), paint: (f) => painted.push(f),
  });
  return { outcome, painted, last: painted[painted.length - 1] ?? '' };
}

describe('PE popup Ctrl+T — the shortcut key', () => {
  it('is Ctrl+T, and nothing else', () => {
    expect(PROMPT_ENHANCEMENT_SETTINGS_SHORTCUT_KEY_V1).toBe(String.fromCharCode(20));
    expect(isPromptEnhancementSettingsShortcutKeyV1(String.fromCharCode(20))).toBe(true);
    // The popup's own keys must never be mistaken for it — Ctrl+J (newline in the editor),
    // Ctrl+C (close), Enter, Esc, Space, a plain 't', and an uppercase 'T'.
    for (const other of [String.fromCharCode(10), CTRL_C, ENTER, ESC, ' ', 't', 'T', UP, DOWN, '']) {
      expect(isPromptEnhancementSettingsShortcutKeyV1(other), other).toBe(false);
    }
  });
});

describe('PE popup Ctrl+T — the root menu', () => {
  it('offers exactly the two settings and Done, in the CLI order', () => {
    expect(PROMPT_ENHANCEMENT_SETTINGS_ROOT_ROWS_V1.map((r) => r.key)).toEqual(['frequency', 'role', 'done']);
  });

  it('names the current value of each setting beside it', () => {
    const state = buildPromptEnhancementSettingsStateV1('optimum', 'pm');
    const frame = renderPromptEnhancementSettingsFrameV1(state, ROLES);
    expect(frame).toContain('Advisory frequency — High');
    expect(frame).toContain('Project role — product manager');
    expect(frame).toContain('Done');
    expect(frame).toContain('Esc back to prompt');
  });

  it('names no value for a setting that is unset', () => {
    const frame = renderPromptEnhancementSettingsFrameV1(
      buildPromptEnhancementSettingsStateV1(undefined, undefined), ROLES,
    );
    expect(frame).toContain('Advisory frequency\n');
    expect(frame).not.toContain('Advisory frequency —');
    expect(frame).not.toContain('Project role —');
  });

  it('opens each list from its root row', () => {
    let state = buildPromptEnhancementSettingsStateV1('optimum', 'founder');
    state = reducePromptEnhancementSettingsV1(state, ROLES, ENTER).state;
    expect(state.view).toBe('frequency');

    state = reducePromptEnhancementSettingsV1(state, ROLES, ESC).state;   // back to root
    state = reducePromptEnhancementSettingsV1(state, ROLES, DOWN).state;  // → Project role
    state = reducePromptEnhancementSettingsV1(state, ROLES, ENTER).state;
    expect(state.view).toBe('role');
  });

  it('Done closes the chooser', () => {
    let state = buildPromptEnhancementSettingsStateV1('optimum', 'founder');
    state = reducePromptEnhancementSettingsV1(state, ROLES, DOWN).state;
    state = reducePromptEnhancementSettingsV1(state, ROLES, DOWN).state;
    expect(reducePromptEnhancementSettingsV1(state, ROLES, ENTER).result).toEqual({ kind: 'close' });
  });
});

describe('PE popup Ctrl+T — the two lists', () => {
  it('a list opens focused on the stored value, and marks it', async () => {
    const { control } = fakeControl({ frequency: 'major_only', role: 'indie_hacker' });
    // Esc inside a list returns to the root, so closing the chooser takes a second one.
    const freq = await run(control, [ENTER, ESC, ESC]);
    const freqFrame = freq.painted.find((f) => f.includes('Enter save') && f.includes('High'))!;
    expect(freqFrame).toContain('Low (current)');
    expect(freqFrame).toContain('Only major findings'); // the focused row's help

    const role = await run(control, [DOWN, ENTER, ESC, ESC]);
    const roleFrame = role.painted.find((f) => f.includes('Enter save') && f.includes('vibe coder'))!;
    expect(roleFrame).toContain('indie hacker (current)');
  });

  it('focus falls back to the first row when the stored value has none', () => {
    expect(promptEnhancementSettingsFocusIndexV1(PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1, 'off')).toBe(0);
    expect(promptEnhancementSettingsFocusIndexV1(ROLES, undefined)).toBe(0);
    expect(promptEnhancementSettingsFocusIndexV1(ROLES, 'pm')).toBe(3);
  });

  it('arrows move one row and stop at both ends', () => {
    let state = buildPromptEnhancementSettingsStateV1('optimum', 'founder');
    state = { ...state, view: 'role', focusIndex: 0 };
    state = reducePromptEnhancementSettingsV1(state, ROLES, UP).state;
    expect(state.focusIndex, 'up at the top must not wrap').toBe(0);
    for (let i = 0; i < 6; i++) state = reducePromptEnhancementSettingsV1(state, ROLES, DOWN).state;
    expect(state.focusIndex, 'down must stop at the last role').toBe(ROLES.length - 1);
  });

  it('Enter chooses the FOCUSED row, not the stored one', () => {
    let state = buildPromptEnhancementSettingsStateV1('optimum', 'founder');
    state = { ...state, view: 'frequency', focusIndex: 0 };
    state = reducePromptEnhancementSettingsV1(state, ROLES, DOWN).state;
    expect(reducePromptEnhancementSettingsV1(state, ROLES, ENTER).result)
      .toEqual({ kind: 'chose_frequency', level: 'every_event' });

    let roleState = buildPromptEnhancementSettingsStateV1('optimum', 'founder');
    roleState = { ...roleState, view: 'role', focusIndex: 1 };
    expect(reducePromptEnhancementSettingsV1(roleState, ROLES, ENTER).result)
      .toEqual({ kind: 'chose_role', role: 'vibe_coder' });
  });

  it('every other key is swallowed rather than reaching the popup underneath', () => {
    const state = { ...buildPromptEnhancementSettingsStateV1('optimum', 'pm'), view: 'role' as const };
    // Space types into the popup's body field — while the chooser is open it must do nothing.
    for (const key of [' ', 'x', String.fromCharCode(10), `${ESC}[C`]) {
      const stepped = reducePromptEnhancementSettingsV1(state, ROLES, key);
      expect(stepped.result, key).toEqual({ kind: 'pending' });
      expect(stepped.state.focusIndex, key).toBe(state.focusIndex);
      expect(stepped.state.view, key).toBe('role');
    }
  });
});

describe('PE popup Ctrl+T — saving', () => {
  it('saves a frequency, returns to the root, and the root names the new value', async () => {
    const { control, writes } = fakeControl({ frequency: 'major_only', role: 'founder' });
    const { outcome, last } = await run(control, [ENTER, UP, UP, ENTER, ESC]);
    expect(writes).toEqual([['frequency', 'optimum']]);
    expect(outcome.saved).toEqual([{ setting: 'frequency', value: 'optimum' }]);
    expect(last).toContain('Advisory frequency — High');
  });

  it('saves a role the same way', async () => {
    const { control, writes } = fakeControl({ frequency: 'optimum', role: 'founder' });
    const { outcome, last } = await run(control, [DOWN, ENTER, DOWN, ENTER, ESC]);
    expect(writes).toEqual([['role', 'vibe_coder']]);
    expect(outcome.saved).toEqual([{ setting: 'role', value: 'vibe_coder' }]);
    expect(last).toContain('Project role — vibe coder');
  });

  it('both settings can be changed in ONE visit — the DS loop-back', async () => {
    const { control, writes } = fakeControl({ frequency: 'optimum', role: 'founder' });
    const { outcome, last } = await run(control, [
      ENTER, DOWN, ENTER,        // frequency: High → Medium, save → root
      DOWN, ENTER, DOWN, ENTER,  // role: founder → vibe coder, save → root
      ESC,
    ]);
    expect(writes).toEqual([['frequency', 'every_event'], ['role', 'vibe_coder']]);
    expect(outcome.saved).toHaveLength(2);
    expect(last).toContain('Advisory frequency — Medium');
    expect(last).toContain('Project role — vibe coder');
  });

  it('moving the focus writes nothing by itself', async () => {
    const { control, writes } = fakeControl({ frequency: 'optimum' });
    const { outcome } = await run(control, [ENTER, DOWN, DOWN, ESC, ESC]);
    expect(writes).toEqual([]);
    expect(outcome.saved).toEqual([]);
  });

  it('Esc inside a list returns to the root, not out of the chooser', async () => {
    const { control } = fakeControl({ frequency: 'optimum', role: 'pm' });
    const { last } = await run(control, [ENTER, ESC, ESC]);
    // The final frame before the chooser closed was the ROOT, not the list.
    expect(last).toContain('Advisory frequency — High');
    expect(last).toContain('Esc back to prompt');
  });

  it('Ctrl+C closes the chooser only — it never writes', async () => {
    const { control, writes } = fakeControl({ frequency: 'optimum' });
    const { outcome } = await run(control, [CTRL_C]);
    expect(outcome).toEqual({ saved: [], failed: [] });
    expect(writes).toEqual([]);
  });

  it('a failed write is reported, not thrown — the popup survives a locked store', async () => {
    const control: PromptEnhancementSettingsControlV1 = {
      readFrequency: () => 'optimum',
      writeFrequency: () => { throw new Error('database is locked'); },
      roleOptions: ROLES,
      readRole: () => 'founder',
      writeRole: () => { throw new Error('database is locked'); },
    };
    const { outcome } = await run(control, [ENTER, DOWN, ENTER, ESC]);
    expect(outcome.saved).toEqual([]);
    expect(outcome.failed).toEqual([{ setting: 'frequency', reason: 'database is locked' }]);
  });

  it('a failed READ still opens the chooser, with nothing named current', async () => {
    const control: PromptEnhancementSettingsControlV1 = {
      readFrequency: () => { throw new Error('config read failed'); },
      writeFrequency: () => {},
      roleOptions: ROLES,
      readRole: () => { throw new Error('config read failed'); },
      writeRole: () => {},
    };
    const { painted } = await run(control, [ESC]);
    expect(painted[0]).not.toContain('—');
  });

  it('colorize reaches the frame (the live popup renders in colour, the tests do not)', async () => {
    const { control } = fakeControl({ frequency: 'optimum' });
    const painted: string[] = [];
    await runPromptEnhancementSettingsChooserV1({
      control, readKey: keyScript([ESC]), paint: (f) => painted.push(f), colorize: true,
    });
    expect(painted[0]).toContain(ESC);
  });
});

describe('PE popup Ctrl+T — level names', () => {
  it('names the three popup levels the way the install picker does', () => {
    expect(promptEnhancementFrequencyLabelV1('optimum')).toBe('High');
    expect(promptEnhancementFrequencyLabelV1('every_event')).toBe('Medium');
    expect(promptEnhancementFrequencyLabelV1('major_only')).toBe('Low');
  });

  it('names the two CLI-only levels as themselves — never as one of the three rows', () => {
    // A user who ran `nexpath config set advisory_frequency off` must not be told "High".
    expect(promptEnhancementFrequencyLabelV1('once_per_session')).toBe('Once per session');
    expect(promptEnhancementFrequencyLabelV1('off')).toBe('Off');
    const offered = PROMPT_ENHANCEMENT_FREQUENCY_CHOICES_V1.map((c) => c.value) as readonly string[];
    expect(offered).not.toContain('off');
    expect(offered).not.toContain('once_per_session');
  });

  it('has no name for an unset or unrecognised value', () => {
    expect(promptEnhancementFrequencyLabelV1(undefined)).toBeUndefined();
    expect(promptEnhancementFrequencyLabelV1('')).toBeUndefined();
    expect(promptEnhancementFrequencyLabelV1('turbo')).toBeUndefined();
  });
});

describe('PE popup Ctrl+T — the footer hint', () => {
  function view(): PromptEnhancementCliPopupViewV1 {
    const model = {
      title: 'Nexpath · Prompt enhancement',
      editorHeading: 'Use enhanced prompt',
      identity: { enhancementId: 'e1', currentBodyId: 'b1', bodyRevision: 1, validationDecisionId: 'v1' },
      body: { editable: true },
      publicCopy: { trustCues: [] },
      controls: {
        additionalDetails: { availability: 'available' },
        directional: [],
        feedback: { availability: 'available', label: 'Feedback' },
        original: { availability: 'available' },
      },
    } as unknown as PromptEnhancementPopupRenderModelV1;
    return { model, editedBodyText: 'BODY', additionalDetailsText: '' };
  }

  it('is absent by default — a surface that cannot act on Ctrl+T must not advertise it', () => {
    const frame = renderPromptEnhancementPopupFrameV1(view(), { focusIndex: 0, helpExpanded: false });
    expect(frame).toContain(PROMPT_ENHANCEMENT_CLI_FOOTER_V1);
    expect(frame).not.toContain('Ctrl+T');
  });

  it('is appended to the footer line, leaving the existing footer text intact', () => {
    const frame = renderPromptEnhancementPopupFrameV1(
      view(),
      { focusIndex: 0, helpExpanded: false, settingsHint: PROMPT_ENHANCEMENT_SETTINGS_HINT_V1 },
    );
    const footerLine = frame.split('\n').find((line) => line.includes(PROMPT_ENHANCEMENT_CLI_FOOTER_V1));
    expect(footerLine).toContain('Ctrl+T settings');
    // One line, not two — the frame height is measured against a probe render and must not shift.
    expect(frame.split('\n').length).toBe(
      renderPromptEnhancementPopupFrameV1(view(), { focusIndex: 0, helpExpanded: false }).split('\n').length,
    );
  });

  it('names no value — the root menu carries those', () => {
    expect(PROMPT_ENHANCEMENT_SETTINGS_HINT_V1).toBe('Ctrl+T settings');
    expect(PROMPT_ENHANCEMENT_SETTINGS_HINT_V1).not.toContain('High');
  });
});

describe('PE popup Ctrl+T — wiring', () => {
  const sourceOf = (...parts: string[]): string => readFileSync(join(__dirname, '..', ...parts), 'utf8');

  it('the popup shell opens the chooser on the shortcut and forwards the control', () => {
    // The raw-TTY shell cannot be unit-tested (it needs a real console), so this pins the four lines
    // that connect the tested pieces to it. Remove any of them and Ctrl+T silently does nothing.
    const shell = sourceOf('prompt-enhancement', 'cli-submit-popup.ts');
    expect(shell).toContain('createPromptEnhancementCliPopupInteractionV1(input.onFirstRender, input.settingsControl)');
    expect(shell).toContain('isPromptEnhancementSettingsShortcutKeyV1(raw)');
    expect(shell).toContain('runPromptEnhancementSettingsChooserV1({');
    expect(shell).toContain('settingsHint: settingsHint()');
  });

  it('the shared key decoder stays unaware of Ctrl+T, so the browser panel is untouched', () => {
    // `decodePromptEnhancementCliKeyV1` and the interaction reducer also drive the browser, which has
    // its own Alt+Shift+T chooser. Ctrl+T is handled in the terminal shell's key loop, beside Ctrl+C.
    const shell = sourceOf('prompt-enhancement', 'cli-submit-popup.ts');
    const decoder = shell.slice(shell.indexOf('export function decodePromptEnhancementCliKeyV1'));
    const decoderBody = decoder.slice(0, decoder.indexOf('export interface'));
    expect(decoderBody).not.toContain('fromCharCode(20)');
    expect(decoderBody.toLowerCase()).not.toContain('settings');
  });

  it('every CLI host that opens the popup supplies a control', () => {
    // Three surfaces render the PE popup: the UserPromptSubmit hook's direct TTY, the Stop hook's
    // direct TTY, and the spawned popup window. A host that forgets this shows no Ctrl+T at all.
    for (const host of [
      ['cli', 'commands', 'auto.ts'],
      ['cli', 'commands', 'stop.ts'],
      ['cli', 'commands', 'prompt-enhancement-popup-host.ts'],
    ]) {
      const source = sourceOf(...host);
      expect(source, host.join('/')).toContain('settingsControl: buildPromptEnhancementSettingsControlV1(');
    }
  });
});

describe('PE popup Ctrl+T — bundling', () => {
  it('the chooser imports no store, so the browser bundle stays free of sql.js', () => {
    // `cli-submit-popup.ts` is imported by the browser's PE host, and it imports this file. The store
    // side deliberately lives in `cli/shared/pe-settings-control.ts`, which only the CLI hosts import
    // — and that is also why the ROLE options arrive through the control rather than from
    // `role-description.ts`, which pulls in picocolors.
    const source = readFileSync(join(__dirname, 'cli-settings-shortcut.ts'), 'utf8');
    const imports = source.split('\n').filter((line) => /^\s*import\b/.test(line));
    expect(imports, 'this module must stay dependency-free').toEqual([]);
    expect(source).not.toMatch(/\brequire\s*\(|\bimport\s*\(|^\s*export\s+\*/m);
  });
});
