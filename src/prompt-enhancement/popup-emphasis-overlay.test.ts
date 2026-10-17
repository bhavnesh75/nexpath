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
import { NEVER_MARKED_SECTION_KINDS, TERM_ONLY_SECTION_KINDS } from './emphasis-classes.js';
import { PROMPT_ENHANCEMENT_APPLIED_DETAILS_TITLE_V1 } from './popup-section-map.js';
import {
  buildPromptEnhancementEmphasisSpansV1,
  buildPromptEnhancementUnmarkableRowsV1,
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

/** The clause the fixture repeats, and where it sits on that row — read off, never assumed. */
const CLAUSE = 'do not delete the cache';
const CLAUSE_AT = SECTION_TEXT[1]!.indexOf(CLAUSE);
const CLAUSE_SPAN = { startColumn: CLAUSE_AT, endColumn: CLAUSE_AT + CLAUSE.length };

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
  it('marks the phrase where it sits, and nothing else on that row', () => {
    const rows = spansOf();
    // ⚠️ The unit is the PHRASE. The words that earned the mark are drawn and the rest of the
    // sentence stays plain — the bullet before it included.
    expect(rows[ONLY_MARKABLE_ROW]).toEqual([CLAUSE_SPAN]);
    // Read off the fixture rather than asserted: the clause starts after "- ".
    expect(SECTION_TEXT[1]!.slice(CLAUSE_SPAN.startColumn, CLAUSE_SPAN.endColumn)).toBe(CLAUSE);
    expect(CLAUSE_SPAN.endColumn).toBeLessThan(SECTION_TEXT[1]!.length);
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
      .toEqual([CLAUSE_SPAN]);
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

  it('DOES mark the practices section now — a phrase may land there', () => {
    // ⏪ This asserted the opposite until 2026-09-29: the practices section was never marked, so a
    // phrase held only by it and by the verbatim section had nowhere to go. The owner amended that —
    // the section names the fact its guidance is about, and that name is the main word on the screen.
    // The classifier produces only TERMS there now (`TERM_ONLY_SECTION_KINDS`); what this file decides
    // is only whether a mark may LAND there, and it may.
    const text = [`${SECTIONS[0]!.title}:`, SECTION_TEXT[0]!, '', `${SECTIONS[2]!.title}:`, SECTION_TEXT[2]!].join('\n');
    const sections = [SECTIONS[0]!, SECTIONS[2]!];
    const rows = spansOf({ text, sections, windowRows: text.split('\n').length });
    // Row 1 is the verbatim section's line — still never marked. Row 4 is the practices section's.
    expect(rows[1]).toEqual([]);
    expect(rows[4]).not.toEqual([]);
  });

  it('never marks the details the developer typed and applied — the same words, merged into the body', () => {
    // Pressing Apply merges the details field into the body word for word. The field itself is
    // never marked while they are typing in it; merging it in does not turn their words into the
    // body's instruction, so the whole block is left alone — not only its title line.
    const text = [
      `${SECTIONS[1]!.title}:`,
      '- this section holds nothing of the kind.',
      '',
      `${PROMPT_ENHANCEMENT_APPLIED_DETAILS_TITLE_V1}:`,
      'and please do not delete the cache during the rollout',
      'twice over, if it comes to that.',
    ].join('\n');
    expect(spansOf({ text, sections: [SECTIONS[1]!], windowRows: text.split('\n').length }))
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
    const line = '- Cover Impact and severity for this request.';
    const at = line.indexOf('Impact and severity');
    expect(rows[0]).toEqual([]);
    expect(rows[1]).toEqual([{ startColumn: at, endColumn: at + 'Impact and severity'.length }]);
  });

  it('marks the first occurrence when the same phrase is in the section twice', () => {
    const text = [
      `${SECTIONS[1]!.title}:`,
      '- retry twice, then retry once more.',
    ].join('\n');
    const rows = spansOf({ text, sections: [SECTIONS[1]!], phrases: [phrase('retry')], windowRows: 2 });
    // The FIRST one, and only it. Both are on the same row, so this is the case that says the
    // answer is "the first eligible occurrence" rather than "every occurrence" or "the last".
    const line = '- retry twice, then retry once more.';
    const at = line.indexOf('retry');
    expect(rows[1]).toEqual([{ startColumn: at, endColumn: at + 'retry'.length }]);
    expect(line.indexOf('retry', at + 1)).toBeGreaterThan(at);
  });

  it('finds nothing for a phrase the user has edited away', () => {
    expect(spansOf({ phrases: [phrase('a clause that is no longer in the body')] }))
      .toEqual(TEXT.split('\n').map(() => []));
  });

  it('keeps the verbatim section as the ONLY never-marked kind', () => {
    // The overlay shares this set with the classifier rather than keeping a second copy, so its
    // membership is pinned here: an edit on either side has to come past this test.
    //
    // ⏪ `source_signal_guidance` was the second entry until 2026-09-29 and is TERM-ONLY now: its
    // keyword may be marked, and no instruction, boundary or condition may.
    expect([...NEVER_MARKED_SECTION_KINDS].sort()).toEqual(['original_request_or_goal']);
    expect([...TERM_ONLY_SECTION_KINDS].sort()).toEqual(['source_signal_guidance']);
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
    expect(rows[ONLY_MARKABLE_ROW - 2]).toEqual([CLAUSE_SPAN]);
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
  it('becomes one sub-range per row it touches, and stops where the phrase does', () => {
    // Width 10 wraps "- do not delete the cache before the checks pass." into five rows. The unit
    // is the PHRASE, so only the rows it actually crosses are marked — the tail of the sentence
    // after it stays plain — and the first row's mark starts at the bullet's offset, not at 0.
    const rows = spansOf({ fieldWidth: 10, windowStart: 0, windowRows: 200 });
    const marked = rows.map((row, index) => ({ index, row })).filter((entry) => entry.row.length > 0);
    const width = 10;
    const expected = [];
    for (let at = CLAUSE_SPAN.startColumn; at < CLAUSE_SPAN.endColumn; at = Math.floor(at / width) * width + width) {
      const rowStart = Math.floor(at / width) * width;
      expected.push([{
        startColumn: at - rowStart,
        endColumn: Math.min(rowStart + width, CLAUSE_SPAN.endColumn) - rowStart,
      }]);
    }
    expect(marked.map((entry) => entry.row)).toEqual(expected);
    // The sentence is longer than the phrase, so some of it must have been left plain.
    expect(marked.length).toBeLessThan(Math.ceil(SECTION_TEXT[1]!.length / width));
    // Contiguous rows, and the pieces put back together are the line.
    expect(marked.map((entry) => entry.index))
      .toEqual(expected.map((_, offset) => marked[0]!.index + offset));
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
    const clause = 'Do not modify the auth middleware';
    const at = '- Do not modify the auth middleware.'.indexOf(clause);
    expect(rows[1]).toEqual([{ startColumn: at, endColumn: at + clause.length }]);
  });

  it('draws two ranges for two phrases on one row, with the plain words between them', () => {
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
    // ⚠️ They do NOT become one. The words between them earned no mark, and drawing them bold
    // because they happen to sit between two that did is exactly what the narrower unit avoids.
    const line = '- Do not modify the auth middleware.';
    const first = line.indexOf('Do not');
    const second = line.indexOf('middleware');
    expect(rows[1]).toEqual([
      { startColumn: first, endColumn: first + 'Do not'.length },
      { startColumn: second, endColumn: second + 'middleware'.length },
    ]);
    expect(second).toBeGreaterThan(first + 'Do not'.length);
  });
});

/**
 * The rows that carry nothing markable.
 *
 * Same set as the one the spans builder skips — that is the point of it existing rather than a
 * second rule beside it. A surface that draws unmarked text differently has to agree with the
 * surface that decides what may be marked, or the two will disagree about a row.
 */
describe('the rows no mark may land on', () => {
  const SECTIONS = [
    { sectionKind: 'original_request_or_goal', title: 'My original request (verbatim)', bodyText: 'add a retry to the payment gateway client' },
    { sectionKind: 'context_and_constraints', title: 'Context and constraints', bodyText: 'Keep the payment gateway client as it is.' },
  ];
  const text = SECTIONS.map((section) => `${section.title}:\n${section.bodyText}`).join('\n\n');
  const rows = () => buildPromptEnhancementUnmarkableRowsV1({
    text,
    sections: SECTIONS,
    fieldWidth: 200,
    windowStart: 0,
    windowRows: text.split('\n').length,
    markerAbove: false,
    markerBelow: false,
  });

  const rowFor = (needle: string) => text.split('\n').findIndex((line) => line.includes(needle));

  it('marks every title line', () => {
    expect(rows()[rowFor('My original request')]).toBe(true);
    expect(rows()[rowFor('Context and constraints')]).toBe(true);
  });

  it("marks the body of a section the standard never marks", () => {
    expect(NEVER_MARKED_SECTION_KINDS.has('original_request_or_goal')).toBe(true);
    expect(rows()[rowFor('add a retry to the payment')]).toBe(true);
  });

  it('leaves an ordinary body row alone — it is the text a mark can land on', () => {
    expect(rows()[rowFor('Keep the payment gateway client')]).toBe(false);
  });

  it('answers one entry per row the window shows, like the spans do', () => {
    expect(rows()).toHaveLength(text.split('\n').length);
  });
});

describe('which rows the contrast leaves at full weight', () => {
  // ⚠️ A different question from "where may a mark land". Both sections below are never marked, but
  // only one of them is the developer's own words — and exempting the other from the dim made it the
  // only full-brightness prose in a dimmed frame, which reads as emphasis on a section that has none.
  const SECTIONS: readonly PromptEnhancementEmphasisOverlaySectionV1[] = [
    { sectionKind: 'original_request_or_goal', title: 'My original request (verbatim)', bodyText: 'add a retry to the payment gateway client' },
    { sectionKind: 'context_and_constraints', title: 'Context and constraints', bodyText: 'Keep the payment gateway client as it is.' },
    { sectionKind: 'source_signal_guidance', title: 'Best practices and standards', bodyText: 'According to the signal, retries should be bounded.' },
  ];
  const text = SECTIONS.map((section) => `${section.title}:\n${section.bodyText}`).join('\n\n');
  const exempt = () => buildPromptEnhancementUnmarkableRowsV1({
    text,
    sections: SECTIONS,
    fieldWidth: 200,
    windowStart: 0,
    windowRows: text.split('\n').length,
    markerAbove: false,
    markerBelow: false,
  });
  const rowFor = (needle: string) => text.split('\n').findIndex((line) => line.includes(needle));

  it('leaves the developer’s own words alone', () => {
    expect(exempt()[rowFor('add a retry to the payment')]).toBe(true);
  });

  it('leaves every title alone, because a title is structure', () => {
    expect(exempt()[rowFor('My original request')]).toBe(true);
    expect(exempt()[rowFor('Best practices and standards')]).toBe(true);
  });

  it('does NOT exempt the practices section from the contrast', () => {
    // The body's own prose, so it reads like the body's own prose. Exempted, it was the brightest thing
    // on screen — which is exactly what was reported as "the last section is bold".
    //
    // ⏪ It used to be exempt BECAUSE no mark could land there. One can now, and the answer is unchanged
    // for a better reason: its unmarked rows are dimmed like every other section's, and its keyword
    // stands out by being MARKED rather than by everything around it being faded.
    expect(NEVER_MARKED_SECTION_KINDS.has('source_signal_guidance')).toBe(false);
    expect(exempt()[rowFor('According to the signal')]).toBe(false);
  });

  it('still leaves an ordinary body row to be dimmed', () => {
    expect(exempt()[rowFor('Keep the payment gateway client')]).toBe(false);
  });
});

/**
 * Which SECTION a mark lands in (2026-09-29).
 *
 * The cap spends four marks per section and decides which section each phrase belongs to. A surface
 * that then searches the whole body for the phrase's first occurrence quietly overrules that: the
 * budget the reader sees is not the budget the cap computed, and two phrases can land on overlapping
 * stretches the cap never compared — which {@link merged} then draws as one long heavy run.
 *
 * So the phrase carries its section. Both halves are tested: it is used when it is there, and its
 * absence still places the mark rather than losing it.
 */
describe('a mark lands in the section it was charged to', () => {
  /** The SAME words in two markable sections — the case where placement can go wrong. */
  const REPEATED = 'the retry queue';
  const TWO_SECTIONS: readonly PromptEnhancementEmphasisOverlaySectionV1[] = [
    { title: 'Context and constraints', bodyText: `- Leave ${REPEATED} alone for now.`, sectionKind: 'context_and_constraints' },
    { title: 'How to verify', bodyText: `- Drain ${REPEATED} and count what is left.`, sectionKind: 'verification_or_test_plan' },
  ];
  const TWO_TEXT = [
    `${TWO_SECTIONS[0]!.title}:`,
    TWO_SECTIONS[0]!.bodyText,
    '',
    `${TWO_SECTIONS[1]!.title}:`,
    TWO_SECTIONS[1]!.bodyText,
  ].join('\n');

  const rowsFor = (phrases: readonly PromptEnhancementEmphasisPhraseV1[]) =>
    buildPromptEnhancementEmphasisSpansV1({
      text: TWO_TEXT,
      sections: TWO_SECTIONS,
      phrases,
      fieldWidth: 100,
      windowStart: 0,
      windowRows: TWO_TEXT.split('\n').length,
      markerAbove: false,
      markerBelow: false,
    });

  /** Which display rows carry a mark. Row 1 is the first section's line, row 4 the second's. */
  const markedRows = (rows: readonly (readonly { startColumn: number }[])[]): number[] =>
    rows.flatMap((spans, index) => (spans.length > 0 ? [index] : []));

  it('places the mark in the later section when that is the one it was charged to', () => {
    const rows = rowsFor([{ text: REPEATED, emphasisClass: 2, source: 'floor', sectionIndex: 1 }]);
    expect(markedRows(rows)).toEqual([4]);
  });

  it('places it in the first section when THAT is the one it was charged to', () => {
    // The other direction, so the test above cannot pass by the mark simply moving.
    const rows = rowsFor([{ text: REPEATED, emphasisClass: 2, source: 'floor', sectionIndex: 0 }]);
    expect(markedRows(rows)).toEqual([1]);
  });

  it('still places it when no section travelled with it — an old row, or the model tier', () => {
    // ⛔ Backward compatibility is the load-bearing half: a stored row written before the field existed
    // must draw exactly as it always did, which is the first occurrence anywhere in the body.
    const rows = rowsFor([{ text: REPEATED, emphasisClass: 2, source: 'floor' }]);
    expect(markedRows(rows)).toEqual([1]);
  });

  it('falls back to the whole body when the phrase is not in its own section', () => {
    // The developer edited that section, or the composer never put those words there. A mark placed a
    // little wrong is better than a mark the reader never gets.
    const rows = rowsFor([{ text: 'Drain', emphasisClass: 1, source: 'floor', sectionIndex: 0 }]);
    expect(markedRows(rows)).toEqual([4]);
  });

  it('marks each section once when both sections were charged for the same words', () => {
    // What the seam was costing: two phrases charged to two sections were both landing in the first,
    // where the overlay's merge drew them as one run and the second section drew nothing.
    const rows = rowsFor([
      { text: REPEATED, emphasisClass: 2, source: 'floor', sectionIndex: 0 },
      { text: REPEATED, emphasisClass: 2, source: 'floor', sectionIndex: 1 },
    ]);
    expect(markedRows(rows)).toEqual([1, 4]);
  });
});
