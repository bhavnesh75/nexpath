/**
 * Where the marks land — the pure half, on a body written by hand so every offset in the
 * expectations below can be read off the fixture rather than trusted.
 *
 * The questions are: does a phrase land on the row and the columns it occupies, does it split
 * correctly when the line it sits on wraps, and — the ones that decide whether this is safe —
 * does it stay off the rows that are not the developer's sentence: the titles, the scroll
 * indicators, and the two sections the standard never marks.
 */
import { describe, expect, it } from 'vitest';
import { NEVER_MARKED_SECTION_KINDS } from './emphasis-classes.js';
import {
  buildPromptEnhancementEmphasisSpansV1,
  type PromptEnhancementEmphasisOverlayInputV1,
  type PromptEnhancementEmphasisOverlaySectionV1,
} from './popup-emphasis-overlay.js';
import type { PromptEnhancementEmphasisPhraseV1 } from '../store/pending-prompt-enhancements.js';

/**
 * A body with the same shape the composer writes: a title line, then the section's lines, a blank
 * line between sections. The clause `do not delete the cache` appears in all three sections, which
 * is exactly the case that matters — the developer's own words are quoted back in the first.
 */
const SECTION_TEXT: readonly string[] = [
  'do not delete the cache',
  '- do not delete the cache before the checks pass.',
  '- do not delete the cache here either.',
];
const SECTIONS: readonly PromptEnhancementEmphasisOverlaySectionV1[] = [
  { title: 'My original request (verbatim)', bodyText: SECTION_TEXT[0]!, sectionKind: 'original_request_or_goal' },
  { title: 'Impact and severity', bodyText: SECTION_TEXT[1]!, sectionKind: 'impact_severity' },
  { title: 'Best practices and standards', bodyText: SECTION_TEXT[2]!, sectionKind: 'source_signal_guidance' },
];
const TEXT = [
  `${SECTIONS[0]!.title}:`,
  SECTION_TEXT[0]!,
  '',
  `${SECTIONS[1]!.title}:`,
  SECTION_TEXT[1]!,
  '',
  `${SECTIONS[2]!.title}:`,
  SECTION_TEXT[2]!,
].join('\n');

/** The one row of this fixture a mark may land on. */
const ONLY_MARKABLE_ROW = 4;

const phrase = (text: string): PromptEnhancementEmphasisPhraseV1 => ({ text, emphasisClass: 3, source: 'floor' });

function spansOf(overrides: Partial<PromptEnhancementEmphasisOverlayInputV1> = {}) {
  const input: PromptEnhancementEmphasisOverlayInputV1 = {
    text: TEXT,
    sections: SECTIONS,
    phrases: [phrase('do not delete the cache')],
    fieldWidth: 100,
    windowStart: 0,
    windowRows: TEXT.split('\n').length,
    markerAbove: false,
    markerBelow: false,
    ...overrides,
  };
  return buildPromptEnhancementEmphasisSpansV1(input);
}

describe('the phrase on its row', () => {
  it('marks the columns it occupies, and nothing else on the row', () => {
    const rows = spansOf();
    expect(rows[ONLY_MARKABLE_ROW]).toEqual([{ startColumn: 2, endColumn: 25 }]);
    // Read off the fixture: the clause starts after "- " and is 23 characters long.
    expect(SECTION_TEXT[1]!.slice(2, 25)).toBe('do not delete the cache');
  });

  it('leaves every other row alone', () => {
    const rows = spansOf();
    expect(rows).toHaveLength(TEXT.split('\n').length);
    for (const [index, row] of rows.entries()) {
      if (index === ONLY_MARKABLE_ROW) continue;
      expect(row).toEqual([]);
    }
  });

  it('gives every row an empty list when there are no phrases at all', () => {
    expect(spansOf({ phrases: [] })).toEqual(TEXT.split('\n').map(() => []));
  });

  it('matches the way the phrases were found in the first place — case-insensitively', () => {
    expect(spansOf({ phrases: [phrase('DO NOT DELETE THE CACHE')] })[ONLY_MARKABLE_ROW])
      .toEqual([{ startColumn: 2, endColumn: 25 }]);
  });
});

describe('what a mark is kept away from', () => {
  it('passes over the developer\'s own words, quoted back, and marks the next occurrence', () => {
    // The first occurrence is line 1 — inside "My original request (verbatim)". Marking it would
    // emphasise the developer's own prompt at them, so the clause is marked where the body says it.
    const rows = spansOf();
    expect(rows[1]).toEqual([]);
    expect(rows[ONLY_MARKABLE_ROW]).not.toEqual([]);
  });

  it('never marks the practices section either, even when nothing else holds the phrase', () => {
    // Only the two excluded sections hold it now: there is nowhere left to draw it.
    const text = [`${SECTIONS[0]!.title}:`, SECTION_TEXT[0]!, '', `${SECTIONS[2]!.title}:`, SECTION_TEXT[2]!].join('\n');
    const sections = [SECTIONS[0]!, SECTIONS[2]!];
    expect(spansOf({ text, sections, windowRows: text.split('\n').length }))
      .toEqual(text.split('\n').map(() => []));
  });

  it('drops a phrase whose only occurrence is a title line', () => {
    expect(spansOf({ phrases: [phrase('Impact and severity')] })).toEqual(TEXT.split('\n').map(() => []));
  });

  it('marks the body occurrence of a phrase that also reads as a title', () => {
    const text = [
      `${SECTIONS[1]!.title}:`,
      '- Cover Impact and severity for this request.',
    ].join('\n');
    const rows = spansOf({
      text,
      sections: [SECTIONS[1]!],
      phrases: [phrase('Impact and severity')],
      windowRows: 2,
    });
    expect(rows[0]).toEqual([]);
    expect(rows[1]).toEqual([{ startColumn: 8, endColumn: 27 }]);
  });

  it('marks the first occurrence when the same phrase is in the section twice', () => {
    const text = [
      `${SECTIONS[1]!.title}:`,
      '- retry twice, then retry once more.',
    ].join('\n');
    const rows = spansOf({ text, sections: [SECTIONS[1]!], phrases: [phrase('retry')], windowRows: 2 });
    expect(rows[1]).toEqual([{ startColumn: 2, endColumn: 7 }]);
  });

  it('finds nothing for a phrase the user has edited away', () => {
    expect(spansOf({ phrases: [phrase('a clause that is no longer in the body')] }))
      .toEqual(TEXT.split('\n').map(() => []));
  });

  it('keeps the two never-marked kinds as the only two', () => {
    // The overlay shares this set with the classifier rather than keeping a second copy, so its
    // membership is pinned here: an edit on either side has to come past this test.
    expect([...NEVER_MARKED_SECTION_KINDS].sort()).toEqual(['original_request_or_goal', 'source_signal_guidance']);
  });
});

describe('the window', () => {
  it('drops a mark on a row that has scrolled above the window', () => {
    expect(spansOf({ windowStart: ONLY_MARKABLE_ROW + 1, windowRows: 3 })).toEqual([[], [], []]);
  });

  it('drops a mark on a row that is below the last shown one', () => {
    expect(spansOf({ windowStart: 0, windowRows: ONLY_MARKABLE_ROW })).toEqual([[], [], [], []]);
  });

  it('keeps the mark when the window starts above it, at the shifted row', () => {
    const rows = spansOf({ windowStart: 2, windowRows: 4 });
    expect(rows[ONLY_MARKABLE_ROW - 2]).toEqual([{ startColumn: 2, endColumn: 25 }]);
  });

  it('gives a scroll marker row no mark — it is the window\'s text, not the buffer\'s', () => {
    // The window replaced the first shown row with "↑ N more lines above"; whatever the buffer
    // holds under it is not what is drawn there.
    expect(spansOf({ windowStart: ONLY_MARKABLE_ROW, windowRows: 4, markerAbove: true })[0]).toEqual([]);
    expect(spansOf({ windowStart: 1, windowRows: ONLY_MARKABLE_ROW, markerBelow: true })[ONLY_MARKABLE_ROW - 1])
      .toEqual([]);
  });
});

describe('a phrase that crosses a wrap', () => {
  it('becomes one sub-range per row, with the columns the wrap leaves it', () => {
    // Width 10 wraps "- do not delete the cache before the checks pass." every ten characters, so
    // the clause at offsets 2..25 of that line falls across rows starting at 0, 10 and 20.
    const rows = spansOf({ fieldWidth: 10, windowStart: 0, windowRows: 200 });
    const marked = rows.map((row, index) => ({ index, row })).filter((entry) => entry.row.length > 0);
    expect(marked.map((entry) => entry.row)).toEqual([
      [{ startColumn: 2, endColumn: 10 }],
      [{ startColumn: 0, endColumn: 10 }],
      [{ startColumn: 0, endColumn: 5 }],
    ]);
    // Contiguous rows, and the pieces put back together are the phrase.
    expect(marked.map((entry) => entry.index)).toEqual([marked[0]!.index, marked[0]!.index + 1, marked[0]!.index + 2]);
  });

  it('keeps a sub-range inside the window and drops the part that is outside it', () => {
    const all = spansOf({ fieldWidth: 10, windowStart: 0, windowRows: 200 });
    const first = all.findIndex((row) => row.length > 0);
    const rows = spansOf({ fieldWidth: 10, windowStart: first + 1, windowRows: 1 });
    expect(rows).toEqual([[{ startColumn: 0, endColumn: 10 }]]);
  });
});

describe('two phrases on one row', () => {
  const text = [`${SECTIONS[1]!.title}:`, '- Do not modify the auth middleware.'].join('\n');
  const sections = [SECTIONS[1]!];

  it('merges a term inside a clause into one range, so the clause is not cut short', () => {
    // ⚠️ The standard marks both — the developer's word and the boundary around it. Drawn as two
    // ranges the inner reset would close the outer bold early and the rest of the clause would
    // come out plain, so the two become one.
    const rows = buildPromptEnhancementEmphasisSpansV1({
      text,
      sections,
      phrases: [phrase('Do not modify the auth middleware'), phrase('auth')],
      fieldWidth: 100,
      windowStart: 0,
      windowRows: 2,
      markerAbove: false,
      markerBelow: false,
    });
    expect(rows[1]).toEqual([{ startColumn: 2, endColumn: 35 }]);
  });

  it('keeps two ranges apart when they do not touch', () => {
    const rows = buildPromptEnhancementEmphasisSpansV1({
      text,
      sections,
      phrases: [phrase('Do not'), phrase('middleware')],
      fieldWidth: 100,
      windowStart: 0,
      windowRows: 2,
      markerAbove: false,
      markerBelow: false,
    });
    expect(rows[1]).toEqual([{ startColumn: 2, endColumn: 8 }, { startColumn: 25, endColumn: 35 }]);
  });
});
