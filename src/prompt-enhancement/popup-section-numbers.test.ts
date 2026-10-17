/**
 * Where a section's number lands on screen, and how the renderer draws it.
 *
 * Synthetic bodies are enough here: the questions are about rows and segments —
 * which display row carries the number when a title wraps, when the window is
 * scrolled, when its edges are scroll markers — and about the bytes the renderer
 * emits for a number with colour on, colour off, and marks forced plain.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildPromptEnhancementCliInteractionStateV1,
  renderPromptEnhancementPopupFrameV1,
  windowPromptEnhancementFieldForDisplayWithStartV1,
  isPromptEnhancementScrollMarkerLineV1,
  type PromptEnhancementCliFrameStateV1,
} from './cli-submit-popup.js';
import { buildPromptEnhancementVisualLineMapV1 } from './multiline-editor.js';
import { buildPromptEnhancementSectionNumberSuffixesV1 } from './popup-section-numbers.js';
import type { PromptEnhancementSectionMapInputV1 } from './popup-section-map.js';
import type { PromptEnhancementPopupRenderModelV1 } from './popup-render-model.js';

const ESC = '\u001b';

const SECTIONS: PromptEnhancementSectionMapInputV1[] = [
  { title: 'My original request (verbatim)', bodyText: 'Add a retry to the client.' },
  { title: 'Context and constraints', bodyText: '- Keep the timeout unchanged.' },
  { title: 'Best practices and standards', bodyText: '- Cover it with a test.' },
];
const TEXT = SECTIONS.map((section) => `${section.title}:\n${section.bodyText}`).join('\n\n');

/** Suffixes for a window that shows the whole text, at a width where nothing wraps. */
function wholeSuffixes(text: string, sections: readonly PromptEnhancementSectionMapInputV1[], fieldWidth: number) {
  const rows = buildPromptEnhancementVisualLineMapV1(text, fieldWidth).length;
  return buildPromptEnhancementSectionNumberSuffixesV1({
    text, sections, fieldWidth, windowStart: 0, windowRows: rows, markerAbove: false, markerBelow: false,
  });
}

describe('which display row carries each number', () => {
  it('lands on the row of each title', () => {
    const suffixes = wholeSuffixes(TEXT, SECTIONS, 72);
    const lines = TEXT.split('\n');
    for (const [index, line] of lines.entries()) {
      const section = SECTIONS.find((candidate) => line === `${candidate.title}:`);
      expect(suffixes[index]).toBe(section ? SECTIONS.indexOf(section) + 1 : undefined);
    }
  });

  it('on a title wrapped at width 24, lands on its LAST segment', () => {
    // 'My original request (verbatim):' is 31 characters — two segments at width 24.
    const visual = buildPromptEnhancementVisualLineMapV1(TEXT, 24);
    const titleSegments = visual
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.physicalLine === 0);
    expect(titleSegments.length).toBeGreaterThan(1);
    const suffixes = wholeSuffixes(TEXT, SECTIONS, 24);
    const last = titleSegments[titleSegments.length - 1]!.index;
    expect(suffixes[last]).toBe(1);
    for (const { index } of titleSegments.slice(0, -1)) expect(suffixes[index]).toBeUndefined();
  });

  it('shifts with a scrolled window, and never numbers a marker row', () => {
    // The text is eight visual lines at this width; the titles sit on lines 0, 3 and 6.
    // A four-row window starting at 3 shows lines 3–6: the second title on its first row
    // and the third title on its last — and the window replaces BOTH edges with markers,
    // because lines are hidden above and below.
    const fieldWidth = 72;
    const buffer = {
      text: TEXT, cursor: TEXT.length, desiredVisualColumn: 0, scrollVisualRow: 3, dirty: false, focused: true,
    };
    const rows = 4;
    const window = windowPromptEnhancementFieldForDisplayWithStartV1(buffer, fieldWidth, rows);
    const shown = window.text.split('\n');
    expect(window.start).toBe(3);
    expect(isPromptEnhancementScrollMarkerLineV1(shown[0]!)).toBe(true);
    expect(isPromptEnhancementScrollMarkerLineV1(shown[shown.length - 1]!)).toBe(true);

    // With the markers in place, both title rows are under a marker and get nothing.
    const suffixes = buildPromptEnhancementSectionNumberSuffixesV1({
      text: TEXT, sections: SECTIONS, fieldWidth, windowStart: window.start, windowRows: rows,
      markerAbove: true, markerBelow: true,
    });
    expect(suffixes).toHaveLength(rows);
    expect(suffixes.every((entry) => entry === undefined)).toBe(true);

    // The same window without markers: the numbers shift by the window start — the second
    // title lands on row 0, the third on the last row. This is the shift, and it is what the
    // marker exclusion above suppresses.
    const unmasked = buildPromptEnhancementSectionNumberSuffixesV1({
      text: TEXT, sections: SECTIONS, fieldWidth, windowStart: window.start, windowRows: rows,
      markerAbove: false, markerBelow: false,
    });
    expect(unmasked[0]).toBe(2);
    expect(unmasked[rows - 1]).toBe(3);
  });

  it('gives no numbers when there are no sections', () => {
    expect(wholeSuffixes(TEXT, [], 72).every((entry) => entry === undefined)).toBe(true);
  });
});

/** A minimal render model — the renderer reads only what these tests exercise. */
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
      close: entry('close', 'Close'),
    },
    publicCopy: { trustCues: [], diagnostics: [] },
  } as unknown as PromptEnhancementPopupRenderModelV1;
}

function frameWith(state: Partial<PromptEnhancementCliFrameStateV1>, text = TEXT): { frame: string; caretOut: { row: number; col: number } } {
  const caretOut = { row: -1, col: -1 };
  const frame = renderPromptEnhancementPopupFrameV1(
    { model: model(text), editedBodyText: text, additionalDetailsText: '' },
    { focusIndex: 0, helpExpanded: false, caret: { field: 'enhanced_body', visualRow: 0, visualColumn: 0 }, caretOut, ...state },
  );
  return { frame, caretOut };
}

describe('how the renderer draws a number', () => {
  const suffixes = wholeSuffixes(TEXT, SECTIONS, 72);

  it('colour on: four spaces, then the number in dim', () => {
    const { frame } = frameWith({ colorize: true, bodyLineSuffixes: suffixes });
    expect(frame).toContain(`Context and constraints:    ${ESC}[2m#2${ESC}[0m`);
  });

  it('colour off: four spaces, then the number plain', () => {
    const { frame } = frameWith({ colorize: false, bodyLineSuffixes: suffixes });
    expect(frame).toContain('Context and constraints:    #2');
    expect(frame).not.toContain(`${ESC}[2m#2`);
  });

  it('plain marks: plain even with colour on', () => {
    const { frame } = frameWith({ colorize: true, bodyLineSuffixes: suffixes, plainMarks: true });
    expect(frame).toContain('Context and constraints:    #2');
    expect(frame).not.toContain(`${ESC}[2m#2`);
  });

  it('with no suffixes the frame is byte-identical to one drawn without the field at all', () => {
    const without = frameWith({ colorize: true });
    const empty = frameWith({ colorize: true, bodyLineSuffixes: [] });
    expect(empty.frame).toBe(without.frame);
  });

  it('caretOut is identical with and without suffixes', () => {
    const without = frameWith({ colorize: true });
    const withNumbers = frameWith({ colorize: true, bodyLineSuffixes: suffixes });
    expect(withNumbers.caretOut).toEqual(without.caretOut);
    expect(without.caretOut.row).toBeGreaterThan(0);
  });

  it('a locked body still shows its numbers', () => {
    const caretOut = { row: -1, col: -1 };
    const frame = renderPromptEnhancementPopupFrameV1(
      { model: model(TEXT, false), editedBodyText: TEXT, additionalDetailsText: '' },
      { focusIndex: 0, helpExpanded: false, colorize: false, caretOut, bodyLineSuffixes: suffixes },
    );
    expect(frame).toContain('Context and constraints:    #2');
  });
});

describe('the NO_COLOR rule, as the shell applies it', () => {
  // The shell reads the flag as `Boolean(process.env['NO_COLOR'])` at the frame call and
  // passes it as `plainMarks`. The shell itself opens a real console and cannot run here,
  // so the read is exercised the way the shell performs it, against the same renderer:
  // any non-empty value means plain marks, an unset or empty variable means dim ones.
  const suffixes = wholeSuffixes(TEXT, SECTIONS, 72);
  const saved = process.env['NO_COLOR'];
  const plainMarksNow = (): boolean => Boolean(process.env['NO_COLOR']);
  afterEach(() => {
    if (saved === undefined) delete process.env['NO_COLOR'];
    else process.env['NO_COLOR'] = saved;
  });

  it('unset: the marks are dim', () => {
    delete process.env['NO_COLOR'];
    const { frame } = frameWith({ colorize: true, bodyLineSuffixes: suffixes, plainMarks: plainMarksNow() });
    expect(frame).toContain(`Context and constraints:    ${ESC}[2m#2${ESC}[0m`);
  });

  it('set to any non-empty value: the marks are plain, and only the marks change', () => {
    delete process.env['NO_COLOR'];
    const dim = frameWith({ colorize: true, bodyLineSuffixes: suffixes, plainMarks: plainMarksNow() });
    for (const value of ['1', 'true', 'anything']) {
      process.env['NO_COLOR'] = value;
      const { frame } = frameWith({ colorize: true, bodyLineSuffixes: suffixes, plainMarks: plainMarksNow() });
      expect(frame).toContain('Context and constraints:    #2');
      expect(frame).not.toContain(`${ESC}[2m#2`);
      // The rest of the popup keeps its colour: the flag governs the new marks only.
      expect(frame.replace(/    #\d+/g, '')).toBe(dim.frame.replace(new RegExp(`    ${ESC}\\[2m#\\d+${ESC}\\[0m`, 'g'), ''));
    }
  });

  it('set but empty: treated as unset — the marks stay dim', () => {
    process.env['NO_COLOR'] = '';
    const { frame } = frameWith({ colorize: true, bodyLineSuffixes: suffixes, plainMarks: plainMarksNow() });
    expect(frame).toContain(`${ESC}[2m#2${ESC}[0m`);
  });
});

describe('the interaction state is untouched by numbering', () => {
  it('builds the same state whether or not sections are known', () => {
    const state = buildPromptEnhancementCliInteractionStateV1({
      model: model(TEXT), editedBodyText: TEXT, additionalDetailsText: '', fieldWidth: 72, viewportRows: 10,
    });
    expect(state.editor.buffers.enhanced_body.text).toBe(TEXT);
  });
});
