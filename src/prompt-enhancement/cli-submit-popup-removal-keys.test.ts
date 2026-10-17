/**
 * Every key through the reducer, disarmed and armed.
 *
 * The promise the chord makes is that it takes nothing away: with the prefix pressed
 * first, every key still does exactly what it does without it — except the digits the
 * chord uses. That is not a claim a few spot checks can carry, so the whole key table
 * is replayed twice and the two results are compared case by case.
 *
 * The case list is declared here rather than shared: one builder per test file, so a
 * table edited for one suite cannot quietly change another.
 */
import { describe, expect, it } from 'vitest';
import {
  buildPromptEnhancementCliActionRowsV1,
  buildPromptEnhancementCliInteractionStateV1,
  decodePromptEnhancementCliKeyV1,
  reducePromptEnhancementCliInteractionV1,
  type PromptEnhancementCliActionRowV1,
  type PromptEnhancementCliInteractionStateV1,
  type PromptEnhancementCliPopupCommandV1,
} from './cli-submit-popup.js';
import { SECTION_REMOVAL_PREFIX_KEY_V1 } from './popup-section-removal.js';
import type { PromptEnhancementSectionMapInputV1 } from './popup-section-map.js';
import type { PromptEnhancementPopupRenderModelV1 } from './popup-render-model.js';

const SECTIONS: PromptEnhancementSectionMapInputV1[] = [
  { title: 'My original request (verbatim)', bodyText: 'Add a retry to the client.' },
  { title: 'Context and constraints', bodyText: '- Keep the timeout unchanged.' },
  { title: 'Best practices and standards', bodyText: '- Cover it with a test.' },
];
const BODY = SECTIONS.map((section) => `${section.title}:\n${section.bodyText}`).join('\n\n');

/** Every raw input the shell can deliver, as the recorded key table lists them. */
const KEYS: readonly { label: string; raw: string }[] = [
  { label: 'Up', raw: '\u001b[A' },
  { label: 'Down', raw: '\u001b[B' },
  { label: 'Enter', raw: '\r' },
  { label: 'Escape', raw: '\u001b' },
  { label: 'Space', raw: ' ' },
  { label: 'Ctrl+J', raw: '\n' },
  { label: 'Ctrl+Up', raw: '\u001b[1;5A' },
  { label: 'Ctrl+Down', raw: '\u001b[1;5B' },
  { label: 'Cmd+Up', raw: '\u001b[1;9A' },
  { label: 'Cmd+Down', raw: '\u001b[1;9B' },
  { label: 'Left', raw: '\u001b[D' },
  { label: 'Right', raw: '\u001b[C' },
  { label: 'Backspace', raw: '\u007f' },
  { label: 'Delete', raw: '\u001b[3~' },
  { label: 'Letter a', raw: 'a' },
  { label: 'Digit 0', raw: '0' },
  { label: 'Digit 1', raw: '1' },
  { label: 'Digit 2', raw: '2' },
  { label: 'Digit 9', raw: '9' },
  { label: 'the prefix key', raw: SECTION_REMOVAL_PREFIX_KEY_V1 },
];

/** The keys the chord uses when armed: the digits it acts on, and the prefix itself. */
const CHORD_KEYS = new Set(['Digit 1', 'Digit 2', 'Digit 9', 'the prefix key']);

function model(text: string, editable = true): PromptEnhancementPopupRenderModelV1 {
  const entry = (actionId: string, label: string) => ({
    actionId, actionType: 'use_current_body', label, availability: 'available',
  });
  return {
    title: 'Nexpath · Prompt enhancement',
    editorHeading: 'Use enhanced prompt',
    layout: 'single_editable_body_v1',
    identity: { enhancementId: 'e', currentBodyId: 'b', bodyRevision: 1, acceptedCanonicalBodyRevisionId: 'r', validationDecisionId: 'v' },
    session: {} as PromptEnhancementPopupRenderModelV1['session'],
    body: { text, displayState: 'shown_editable', editabilityState: editable ? 'editable' : 'locked_read_only_fallback', editable },
    controls: {
      currentBody: entry('use-current', 'Use enhanced prompt'),
      original: entry('use-original', 'Use original prompt'),
      directional: [],
      additionalDetails: entry('apply-details', 'Additional details'),
      close: entry('close', 'Close'),
    },
    publicCopy: { trustCues: [], diagnostics: [] },
  } as unknown as PromptEnhancementPopupRenderModelV1;
}

function opening(text = BODY): {
  state: PromptEnhancementCliInteractionStateV1;
  rows: readonly PromptEnhancementCliActionRowV1[];
} {
  const built = model(text);
  return {
    rows: buildPromptEnhancementCliActionRowsV1(built),
    state: buildPromptEnhancementCliInteractionStateV1({
      model: built,
      editedBodyText: text,
      additionalDetailsText: '',
      fieldWidth: 72,
      viewportRows: 10,
    }),
  };
}

function press(
  state: PromptEnhancementCliInteractionStateV1,
  rows: readonly PromptEnhancementCliActionRowV1[],
  raw: string,
): { state: PromptEnhancementCliInteractionStateV1; commands: readonly PromptEnhancementCliPopupCommandV1[] } {
  return reducePromptEnhancementCliInteractionV1(state, rows, decodePromptEnhancementCliKeyV1(raw), SECTIONS);
}

function focusRow(rowIndex: number, text = BODY): {
  state: PromptEnhancementCliInteractionStateV1;
  rows: readonly PromptEnhancementCliActionRowV1[];
} {
  const { state, rows } = opening(text);
  let moved = state;
  for (let step = 0; step < rowIndex; step++) moved = press(moved, rows, '\u001b[B').state;
  return { state: moved, rows };
}

/** Everything about where a key left the popup, apart from the arming flag. */
function outcome(after: { state: PromptEnhancementCliInteractionStateV1; commands: readonly PromptEnhancementCliPopupCommandV1[] }) {
  const body = after.state.editor.buffers.enhanced_body;
  const details = after.state.editor.buffers.additional_details;
  return {
    commands: after.commands.map((command) => command.type).join('+') || '-',
    focusIndex: after.state.focusIndex,
    helpExpanded: after.state.helpExpanded,
    bodyText: body.text,
    bodyCursor: body.cursor,
    bodyDirty: body.dirty,
    focusedField: after.state.editor.focusedField,
    detailsText: details.text,
    detailsCursor: details.cursor,
  };
}

describe('the key table, disarmed and armed', () => {
  const { rows } = opening();

  it('premise: the popup offers the three rows this table walks', () => {
    expect(rows.map((row) => row.kind)).toEqual(['editor_heading', 'additional_details', 'use_original']);
  });

  it('disarmed, every key does exactly what it does without the chord', () => {
    // The disarmed pass is the reference the armed pass is compared against, and it is
    // recorded so a change to any key's meaning shows up here too.
    const table: string[] = [];
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      for (const key of KEYS) {
        const start = focusRow(rowIndex);
        const result = outcome(press(start.state, start.rows, key.raw));
        table.push(`${rows[rowIndex]!.kind} · ${key.label} → ${JSON.stringify(result)}`);
      }
    }
    expect(table.join('\n')).toMatchSnapshot();
  });

  it("armed, every key but the chord's own leaves exactly the same outcome", () => {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      for (const key of KEYS) {
        if (CHORD_KEYS.has(key.label)) continue;
        const plain = focusRow(rowIndex);
        const disarmed = outcome(press(plain.state, plain.rows, key.raw));

        const primed = focusRow(rowIndex);
        const armedState = press(primed.state, primed.rows, SECTION_REMOVAL_PREFIX_KEY_V1).state;
        expect(armedState.sectionRemovalArmed).toBe(true);
        const armed = press(armedState, primed.rows, key.raw);

        expect(outcome(armed)).toEqual(disarmed);
        // And the key disarmed the chord on its way through.
        expect(armed.state.sectionRemovalArmed).toBe(false);
      }
    }
  });

  it('the prefix key alone changes nothing but the arming flag', () => {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const start = focusRow(rowIndex);
      const before = outcome({ state: start.state, commands: [] });
      const after = press(start.state, start.rows, SECTION_REMOVAL_PREFIX_KEY_V1);
      expect(outcome(after)).toEqual(before);
      expect(after.state.sectionRemovalArmed).toBe(true);
    }
  });

  it('a digit while armed removes its section, from whichever row has focus', () => {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const start = focusRow(rowIndex);
      const armed = press(start.state, start.rows, SECTION_REMOVAL_PREFIX_KEY_V1).state;
      const after = press(armed, start.rows, '2');

      expect(after.commands).toEqual([{ type: 'remove_section', outcome: 'removed', sectionIndex: 1 }]);
      expect(after.state.editor.buffers.enhanced_body.text).not.toContain('Context and constraints:');
      expect(after.state.sectionRemovalArmed).toBe(false);
      // Focus did not move, and the digit never reached a field.
      expect(after.state.focusIndex).toBe(start.state.focusIndex);
      expect(after.state.editor.buffers.additional_details.text).toBe('');
    }
  });

  it('a digit naming no section reports the refusal and changes nothing', () => {
    const start = focusRow(0);
    const armed = press(start.state, start.rows, SECTION_REMOVAL_PREFIX_KEY_V1).state;
    const after = press(armed, start.rows, '9');
    expect(after.commands).toEqual([{ type: 'remove_section', outcome: 'no_such_section' }]);
    expect(after.state.editor.buffers.enhanced_body.text).toBe(BODY);
    expect(after.state.sectionRemovalArmed).toBe(false);
  });
});

describe('the keys that must keep their meaning while armed', () => {
  it('Up disarms and moves', () => {
    const start = focusRow(0);
    const armed = press(start.state, start.rows, SECTION_REMOVAL_PREFIX_KEY_V1).state;
    const down = press(armed, start.rows, '\u001b[B');
    expect(down.state.focusIndex).toBe(1);
    expect(down.state.sectionRemovalArmed).toBe(false);

    const rearmed = press(down.state, start.rows, SECTION_REMOVAL_PREFIX_KEY_V1).state;
    const up = press(rearmed, start.rows, '\u001b[A');
    expect(up.state.focusIndex).toBe(0);
    expect(up.state.sectionRemovalArmed).toBe(false);
  });

  it('Escape while armed still closes', () => {
    const start = focusRow(0);
    const armed = press(start.state, start.rows, SECTION_REMOVAL_PREFIX_KEY_V1).state;
    const after = press(armed, start.rows, '\u001b');
    expect(after.commands).toEqual([{ type: 'close' }]);
  });

  it('Enter while armed sends the buffer as it stands', () => {
    const start = focusRow(0);
    const armed = press(start.state, start.rows, SECTION_REMOVAL_PREFIX_KEY_V1).state;
    const after = press(armed, start.rows, '\r');
    expect(after.commands).toEqual([{ type: 'use_current' }]);
    expect(after.state.sectionRemovalArmed).toBe(false);
  });
});

describe('after a removal', () => {
  it('Enter commits the new body, then sends it', () => {
    const start = focusRow(0);
    const armed = press(start.state, start.rows, SECTION_REMOVAL_PREFIX_KEY_V1).state;
    const removed = press(armed, start.rows, '2').state;
    const sent = press(removed, start.rows, '\r');

    expect(sent.commands.map((command) => command.type)).toEqual(['edit_body', 'use_current']);
    const commit = sent.commands[0] as { type: 'edit_body'; text: string };
    expect(commit.text).toBe(removed.editor.buffers.enhanced_body.text);
    expect(commit.text).not.toContain('Context and constraints:');
  });
});
