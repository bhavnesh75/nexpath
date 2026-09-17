/**
 * The removal chord and the cut it performs.
 *
 * Pure throughout: an editor state in, an editor state out. The bodies are synthetic
 * because what is under test is the arithmetic of a cut — which lines go, where the
 * cursor lands, what stays untouched — and a synthetic body states those cases plainly.
 * Real composed bodies are exercised where the map is tested and where the frames are.
 */
import { describe, expect, it } from 'vitest';
import {
  buildPromptEnhancementMultilineEditorStateV1,
  type PromptEnhancementMultilineEditorStateV1,
} from './multiline-editor.js';
import { buildPromptEnhancementSectionMapV1, type PromptEnhancementSectionMapInputV1 } from './popup-section-map.js';
import {
  SECTION_REMOVAL_PREFIX_KEY_V1,
  removePromptEnhancementSectionV1,
  stepPromptEnhancementSectionRemovalChordV1,
} from './popup-section-removal.js';

const SECTIONS: PromptEnhancementSectionMapInputV1[] = [
  { title: 'My original request (verbatim)', bodyText: 'Add a retry to the client.' },
  { title: 'Context and constraints', bodyText: '- Keep the timeout unchanged.' },
  { title: 'Best practices and standards', bodyText: '- Cover it with a test.' },
];

/** A body composed the way the popup composes one: title line, body, blank between. */
function compose(sections: readonly PromptEnhancementSectionMapInputV1[]): string {
  return sections.map((section) => `${section.title}:\n${section.bodyText}`).join('\n\n');
}

const FIELD_WIDTH = 72;
const VIEWPORT_ROWS = 10;

function editorWith(
  bodyText: string,
  overrides: { detailsText?: string; locked?: boolean; focusedField?: 'enhanced_body' | 'additional_details' | null } = {},
): PromptEnhancementMultilineEditorStateV1 {
  return buildPromptEnhancementMultilineEditorStateV1({
    identity: { enhancementId: 'e', currentBodyId: 'b', bodyRevision: 1, validationDecisionId: 'v' },
    enhancedBodyText: bodyText,
    additionalDetailsText: overrides.detailsText ?? '',
    fieldWidth: FIELD_WIDTH,
    viewportRows: VIEWPORT_ROWS,
    editable: overrides.locked !== true,
    focusedField: overrides.focusedField === undefined ? 'additional_details' : overrides.focusedField,
  });
}

const editorKey = (raw: string) => ({ kind: 'editor', raw });

describe('the chord', () => {
  it('arms on the prefix key, and stays armed when it is pressed again', () => {
    const first = stepPromptEnhancementSectionRemovalChordV1(false, editorKey(SECTION_REMOVAL_PREFIX_KEY_V1));
    expect(first).toEqual({ armed: true, consumed: true });

    const second = stepPromptEnhancementSectionRemovalChordV1(true, editorKey(SECTION_REMOVAL_PREFIX_KEY_V1));
    expect(second).toEqual({ armed: true, consumed: true });
  });

  it('consumes a digit 1–9 while armed, and names the section', () => {
    for (const digit of ['1', '5', '9']) {
      expect(stepPromptEnhancementSectionRemovalChordV1(true, editorKey(digit)))
        .toEqual({ armed: false, consumed: true, sectionNumber: Number(digit) });
    }
  });

  it('does nothing at all when not armed — a digit types itself, as it does today', () => {
    for (const raw of ['1', '9', 'a', ' ']) {
      expect(stepPromptEnhancementSectionRemovalChordV1(false, editorKey(raw)))
        .toEqual({ armed: false, consumed: false });
    }
  });

  it('disarms and falls through on anything else after the prefix', () => {
    // A zero, a letter and a full-width digit are not the chord's digits; nor is any
    // key that is not an editor key at all.
    const others = [editorKey('0'), editorKey('a'), editorKey('１'), { kind: 'up' }, { kind: 'down' },
      { kind: 'enter' }, { kind: 'escape' }, { kind: 'space' }];
    for (const key of others) {
      expect(stepPromptEnhancementSectionRemovalChordV1(true, key))
        .toEqual({ armed: false, consumed: false });
    }
  });
});

describe('the cut', () => {
  const text = compose(SECTIONS);

  it('removes the first section, and the next map renumbers the rest', () => {
    const result = removePromptEnhancementSectionV1(editorWith(text), SECTIONS, 1);
    expect(result.outcome).toBe('removed');
    expect(result.sectionIndex).toBe(0);

    const after = result.editor.buffers.enhanced_body.text;
    expect(after).not.toContain('My original request (verbatim):');
    expect(after).toContain('Context and constraints:');
    expect(after).toContain('Best practices and standards:');
    // What remains composes exactly as the two survivors would on their own.
    expect(after).toBe(compose(SECTIONS.slice(1)));

    const map = buildPromptEnhancementSectionMapV1(after, SECTIONS);
    expect(map.entries.map((entry) => [entry.number, entry.source])).toEqual([[1, 1], [2, 2]]);
  });

  it('removes a middle section, leaving the sections either side intact', () => {
    const result = removePromptEnhancementSectionV1(editorWith(text), SECTIONS, 2);
    expect(result.outcome).toBe('removed');
    expect(result.sectionIndex).toBe(1);
    expect(result.editor.buffers.enhanced_body.text).toBe(compose([SECTIONS[0]!, SECTIONS[2]!]));
  });

  it('removes the last section together with the blank line before it', () => {
    const result = removePromptEnhancementSectionV1(editorWith(text), SECTIONS, 3);
    expect(result.outcome).toBe('removed');
    const after = result.editor.buffers.enhanced_body.text;
    expect(after).toBe(compose(SECTIONS.slice(0, 2)));
    // No trailing blank left behind.
    expect(after.endsWith('\n')).toBe(false);
  });

  it('when the blank line before the last section was deleted, takes only its own lines', () => {
    // The user removed the separating blank; the line above now carries text, and the
    // section above must keep it.
    const joined = compose(SECTIONS).replace(/\n\n(Best practices and standards:)/, '\n$1');
    const result = removePromptEnhancementSectionV1(editorWith(joined), SECTIONS, 3);
    expect(result.outcome).toBe('removed');
    const after = result.editor.buffers.enhanced_body.text;
    expect(after).toContain('- Keep the timeout unchanged.');
    expect(after).not.toContain('Best practices and standards:');
    expect(after).toBe(compose(SECTIONS.slice(0, 2)));
  });

  it('removes the applied-details block, and reports no section index for it', () => {
    const withDetails = `${text}\n\nAdditional details to incorporate:\nKeep the retry count at five.`;
    const result = removePromptEnhancementSectionV1(editorWith(withDetails), SECTIONS, 4);
    expect(result.outcome).toBe('removed');
    expect(result.sectionIndex).toBeUndefined();
    expect(result.editor.buffers.enhanced_body.text).toBe(text);
  });

  it('removes a section whose range took in an edited-away title, and both go', () => {
    // The middle title was edited, so the map never finds it: its lines belong to the
    // section above, and removing that section removes them too.
    const edited = text.replace('Context and constraints:', 'Context and constraints');
    const result = removePromptEnhancementSectionV1(editorWith(edited), SECTIONS, 1);
    expect(result.outcome).toBe('removed');
    const after = result.editor.buffers.enhanced_body.text;
    expect(after).not.toContain('Context and constraints');
    expect(after).not.toContain('- Keep the timeout unchanged.');
    expect(after).toBe(compose([SECTIONS[2]!]));
  });

  it('removes the section carrying the confirmation exactly like any other', () => {
    // No section is special to the chord. Written as its own case so a guard
    // reintroduced later fails here loudly instead of passing quietly.
    const sections: PromptEnhancementSectionMapInputV1[] = [
      { title: 'My original request (verbatim)', bodyText: 'Delete the stale rows.' },
      {
        title: 'Risk, safety and confirmation',
        bodyText: '- Still, before you do this you must ask me for go-ahead confirmation.',
      },
      { title: 'Best practices and standards', bodyText: '- Cover it with a test.' },
    ];
    const result = removePromptEnhancementSectionV1(editorWith(compose(sections)), sections, 2);
    expect(result.outcome).toBe('removed');
    expect(result.editor.buffers.enhanced_body.text).not.toContain('go-ahead confirmation');
    expect(result.editor.buffers.enhanced_body.text).toBe(compose([sections[0]!, sections[2]!]));
  });
});

describe('what the cut leaves alone, and where it puts the cursor', () => {
  const text = compose(SECTIONS);

  it('marks the body dirty and puts the cursor at the splice point', () => {
    const result = removePromptEnhancementSectionV1(editorWith(text), SECTIONS, 1);
    const body = result.editor.buffers.enhanced_body;
    expect(body.dirty).toBe(true);
    // The first section went, so the cursor sits at the start of what followed it.
    expect(body.cursor).toBe(0);
    expect(body.text.slice(body.cursor)).toContain('Context and constraints:');
  });

  it('puts the cursor at the new end when the last section went', () => {
    const result = removePromptEnhancementSectionV1(editorWith(text), SECTIONS, 3);
    const body = result.editor.buffers.enhanced_body;
    expect(body.cursor).toBe(body.text.length);
  });

  it('leaves the details text, the focused field and the viewport exactly as they were', () => {
    const before = editorWith(text, { detailsText: 'Keep the retry count at five.', focusedField: 'additional_details' });
    const result = removePromptEnhancementSectionV1(before, SECTIONS, 2);

    expect(result.editor.buffers.additional_details).toEqual(before.buffers.additional_details);
    expect(result.editor.focusedField).toBe('additional_details');
    expect(result.editor.viewportRows).toBe(before.viewportRows);
    expect(result.editor.fieldWidth).toBe(before.fieldWidth);
    expect(result.editor.identity).toEqual(before.identity);
  });

  it('brings the window back to the cursor when the body was scrolled away from it', () => {
    // A body short enough to fit the viewport can never show this: the window sits at
    // the top whatever the cut does. So the case needs a body long enough to scroll,
    // and a window scrolled far from where the cut will land.
    const long: PromptEnhancementSectionMapInputV1[] = Array.from({ length: 8 }, (_, index) => ({
      title: `Section ${index + 1}`,
      bodyText: Array.from({ length: 6 }, (_, line) => `- line ${line + 1} of section ${index + 1}`).join('\n'),
    }));
    const base = buildPromptEnhancementMultilineEditorStateV1({
      identity: { enhancementId: 'e', currentBodyId: 'b', bodyRevision: 1, validationDecisionId: 'v' },
      enhancedBodyText: compose(long),
      fieldWidth: FIELD_WIDTH,
      viewportRows: 6,
      focusedField: 'enhanced_body',
    });
    const scrolledAway = {
      ...base,
      buffers: { ...base.buffers, enhanced_body: { ...base.buffers.enhanced_body, scrollVisualRow: 40 } },
    };
    expect(compose(long).split('\n').length).toBeGreaterThan(6 * 6);

    // Cutting the first section puts the cursor at the top, so the window follows it there.
    const first = removePromptEnhancementSectionV1(scrolledAway, long, 1);
    expect(first.outcome).toBe('removed');
    expect(first.editor.buffers.enhanced_body.cursor).toBe(0);
    expect(first.editor.buffers.enhanced_body.scrollVisualRow).toBe(0);

    // Cutting the last section puts the cursor at the new end, and the window follows it
    // there instead — far from where it started, and inside the shortened body.
    const last = removePromptEnhancementSectionV1(scrolledAway, long, long.length);
    const buffer = last.editor.buffers.enhanced_body;
    const lineCount = buffer.text.split('\n').length;
    expect(last.outcome).toBe('removed');
    expect(buffer.cursor).toBe(buffer.text.length);
    expect(buffer.scrollVisualRow).toBeLessThanOrEqual(lineCount - 1);
    expect(buffer.scrollVisualRow + 6).toBeGreaterThanOrEqual(lineCount);
  });

  it("leaves the body buffer's own focused flag as it was", () => {
    for (const focusedField of ['enhanced_body', 'additional_details'] as const) {
      const before = editorWith(text, { focusedField });
      const result = removePromptEnhancementSectionV1(before, SECTIONS, 2);
      expect(result.editor.buffers.enhanced_body.focused).toBe(before.buffers.enhanced_body.focused);
    }
  });
});

describe('the refusals', () => {
  const text = compose(SECTIONS);

  it('a number no section carries: nothing is removed', () => {
    for (const number of [4, 9]) {
      const before = editorWith(text);
      const result = removePromptEnhancementSectionV1(before, SECTIONS, number);
      expect(result.outcome).toBe('no_such_section');
      expect(result.sectionIndex).toBeUndefined();
      expect(result.editor).toBe(before);
    }
  });

  it('a locked body: refused exactly as a locked body refuses a typed character', () => {
    const before = editorWith(text, { locked: true });
    const result = removePromptEnhancementSectionV1(before, SECTIONS, 1);
    expect(result.outcome).toBe('locked');
    expect(result.editor).toBe(before);
  });

  it('a cut that would leave the body empty, or only whitespace', () => {
    const only: PromptEnhancementSectionMapInputV1[] = [
      { title: 'My original request (verbatim)', bodyText: 'Add a retry to the client.' },
    ];
    const before = editorWith(compose(only));
    const result = removePromptEnhancementSectionV1(before, only, 1);
    expect(result.outcome).toBe('would_blank');
    expect(result.editor).toBe(before);

    // Whitespace left behind counts as blank, the same test the send path uses.
    const padded = editorWith(`${compose(only)}\n\n   `);
    const paddedResult = removePromptEnhancementSectionV1(padded, only, 1);
    expect(paddedResult.outcome).toBe('would_blank');
    expect(paddedResult.editor).toBe(padded);
  });

  it('no sections at all: every number is no_such_section', () => {
    const before = editorWith(text);
    expect(removePromptEnhancementSectionV1(before, [], 1).outcome).toBe('no_such_section');
  });
});
