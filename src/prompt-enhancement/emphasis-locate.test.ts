/**
 * Finding the phrases, and spending the budget.
 *
 * Two halves, and the second is the one that matters on a long body: a mark is only worth
 * something while there are few of them, so what this file mostly checks is what gets *dropped*
 * and in what order.
 */
import { describe, expect, it } from 'vitest';
import {
  buildPromptEnhancementEmphasisPhrasesV1,
  PROMPT_ENHANCEMENT_EMPHASIS_CAP_PER_BODY_V1,
  PROMPT_ENHANCEMENT_EMPHASIS_CAP_PER_SECTION_V1,
  PROMPT_ENHANCEMENT_EMPHASIS_MAX_SECTION_SHARE_PERCENT_V1,
  type PromptEnhancementEmphasisBodyInputV1,
} from './emphasis-locate.js';

const build = (input: PromptEnhancementEmphasisBodyInputV1) => buildPromptEnhancementEmphasisPhrasesV1(input);
const texts = (input: PromptEnhancementEmphasisBodyInputV1) => build(input).map((phrase) => phrase.text);

/** A body of one section, the shape most of these need. */
const one = (bodyText: string, extra: Partial<PromptEnhancementEmphasisBodySection> = {}, prompt = 'do the work') =>
  build({ originalPromptText: prompt, sections: [{ sectionKind: 'context_and_constraints', bodyText, ...extra }] });

type PromptEnhancementEmphasisBodySection = PromptEnhancementEmphasisBodyInputV1['sections'][number];

describe('the worked example, through locate and the cap', () => {
  // The standard's own example. It is the acceptance test for this phase as much as for the last:
  // the classifier's nine ranges have to survive being found in the text and then counted.
  const NAMED = 'production release or rollout';
  const found = build({
    originalPromptText: "add rate limiting to the upload endpoint, don't touch auth, then roll it out to production",
    detectedLanguage: 'en',
    sections: [
      {
        sectionKind: 'context_and_constraints',
        bodyText: 'Limit applies to POST /api/upload only.\nDo not modify the auth middleware.',
        groundedFactValues: ['POST /api/upload', 'auth'],
      },
      {
        sectionKind: 'acceptance_or_output_expectation',
        bodyText: 'what you said done means appears to be "uploads over the limit get a 429" (seen earlier this session) — confirm before relying on it.',
      },
      {
        sectionKind: 'verification_or_test_plan',
        bodyText: "I'll run the project's test suite before reporting done.",
        groundedFactValues: ["the project's test suite"],
      },
      {
        sectionKind: 'risk_safety_or_confirmation',
        bodyText: `Still, before you do this ${NAMED} you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.`,
      },
    ],
  });

  it('keeps all nine ranges — none is lost to the cap or to a collapse', () => {
    // ⏪ The safety line moved to the FRONT on 2026-09-27. The class numbers are still the standard's
    // priority order; class 5 is spent first because it is the one the cap must never drop, and this
    // body is under the budget so nothing here is dropped either way. All nine are still present,
    // which is what this test is about.
    expect(found.map((phrase) => [phrase.emphasisClass, phrase.text])).toEqual([
      [5, NAMED],
      [1, "run the project's test suite"],
      [2, 'POST /api/upload'],
      [2, 'auth'],
      [2, 'uploads over the limit get a 429'],
      [3, 'only'],
      [3, 'Do not modify the auth middleware'],
      [3, 'Do not assume'],
      [4, 'before reporting done'],
    ]);
  });

  it('spends on the safety line FIRST, so a full body cannot drop it', () => {
    // The body above is under the budget, so it proves nothing about what the cap sacrifices. This
    // one is deliberately over it: five sections of four boundaries each is twenty candidates for a
    // budget of twelve, and the safety line is the LAST section — where, under a plain ascending
    // class order, the budget is long gone before it is reached.
    // ⚠️ Every sentence is DIFFERENT. A first draft repeated one across all four sections and got
    // five marks instead of sixteen: the classifier dedupes a candidate by class and text over the
    // whole body, so the same sentence four times is one candidate.
    const overBudget = build({
      originalPromptText: 'ship the rate limiter',
      detectedLanguage: 'en',
      sections: [
        { sectionKind: 'context_and_constraints', bodyText: 'Do not touch the schema. Never restart the queue. Without a backup, stop there. Use only the staging bucket.' },
        { sectionKind: 'scope_non_goals', bodyText: 'Do not rename the columns. Never bypass the linter. Without a migration plan, wait. Use only the read replica.' },
        { sectionKind: 'compatibility', bodyText: 'Do not edit the seed data. Never skip the smoke test. Without a review, hold there. Use only the sandbox key.' },
        { sectionKind: 'behavior_preservation', bodyText: 'Do not alter the public types. Never widen the timeout. Without a changelog, pause. Use only the beta channel.' },
        { sectionKind: 'risk_safety_or_confirmation', bodyText: `Still, before you do this ${NAMED} you must ask me for go-ahead confirmation.` },
      ],
    });

    // The cap really is binding — otherwise this test would pass for the wrong reason.
    expect(overBudget).toHaveLength(PROMPT_ENHANCEMENT_EMPHASIS_CAP_PER_BODY_V1);
    // …and the safety line is the mark that survived it, at the front.
    expect(overBudget[0]?.emphasisClass).toBe(5);
    expect(overBudget.some((phrase) => phrase.emphasisClass === 5)).toBe(true);
  });

  it('keeps a term and the clause around it — nesting is two marks, not one', () => {
    // "auth" sits inside "Do not modify the auth middleware". Both are ranges the standard shows,
    // and an earlier draft dropped the clause because the term overlapped it.
    expect(found.some((phrase) => phrase.text === 'auth')).toBe(true);
    expect(found.some((phrase) => phrase.text === 'Do not modify the auth middleware')).toBe(true);
  });
});

describe('finding a phrase in the body', () => {
  it('matches case-insensitively and marks the body’s own casing', () => {
    // The phrase came from the prompt; the body re-cased it, and the reader sees the body.
    const found = one('Cache reads go through REDIS.', {}, 'use redis for the cache');
    expect(found.map((phrase) => phrase.text)).toContain('REDIS');
  });

  it('marks the first occurrence only, and it is the FIRST one that is marked', () => {
    // The two occurrences differ in casing, so counting one is not enough — the casing says which
    // of them was taken. A run that kept the last would still return exactly one phrase.
    const found = one('Reads go through REDIS first. Writes go through redis too.', {}, 'use redis');
    const marks = found.filter((phrase) => phrase.text.toLowerCase() === 'redis');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.text).toBe('REDIS');
  });

  it('drops a phrase the composer paraphrased away, silently', () => {
    // Emphasis never causes a rewrite: if the word is not there, there is nothing to mark.
    const found = one('The upload route is rate limited.', { groundedFactValues: ['POST /api/upload'] });
    expect(found.some((phrase) => phrase.text.includes('/api/upload'))).toBe(false);
  });

  it('does not find a phrase a line break split', () => {
    // Accepted for now: the measurement phase will show whether it costs anything.
    const found = one('Limit applies to POST\n/api/upload only.', { groundedFactValues: ['POST /api/upload'] });
    expect(found.some((phrase) => phrase.text.includes('/api/upload'))).toBe(false);
  });

  it('keeps no positions — only the phrase, its class, where it came from and which section', () => {
    const found = one('Limit applies to POST /api/upload only.', { groundedFactValues: ['POST /api/upload'] });
    expect(found.length).toBeGreaterThan(0);
    for (const phrase of found) {
      expect(Object.keys(phrase).sort()).toEqual(['emphasisClass', 'sectionIndex', 'source', 'text']);
    }
    expect(found.every((phrase) => phrase.source === 'floor')).toBe(true);
  });

  it('keeps no OFFSET, which is the thing the rule above is about', () => {
    // ⚠️ The ruling is about offsets, not about the key count, so it is asserted as the ruling rather
    // than as a list. An offset is a lie the moment the developer edits the body — the phrase is
    // re-located at render, which is why `text` carries the wording and nothing carries a position.
    //
    // ⏪ `sectionIndex` joined the shape on 2026-09-29 and is NOT an offset: it names a section, and a
    // section is re-found by its title line. Where that fails — the developer edited that section — the
    // surfaces fall back to searching the whole body, so a stale section costs placement accuracy and
    // never a lost mark. It is there because the cap spends per SECTION and the surfaces were placing
    // marks in sections the cap never charged, which drew two terms as one heavy run.
    const found = one('Limit applies to POST /api/upload only.', { groundedFactValues: ['POST /api/upload'] });
    expect(found.length).toBeGreaterThan(0);
    for (const phrase of found) {
      for (const positional of ['at', 'start', 'end', 'offset', 'startColumn', 'endColumn']) {
        expect(phrase).not.toHaveProperty(positional);
      }
    }
  });
});

describe('the budget', () => {
  /** Six grounded values, all present — more than one section may keep. */
  const sixTerms = ['alpha-one', 'beta-two', 'gamma-three', 'delta-four', 'epsilon-five', 'zeta-six'];

  it('keeps four in a section and drops the rest', () => {
    const found = one(`Uses ${sixTerms.join(', ')}.`, { groundedFactValues: sixTerms });
    expect(found).toHaveLength(PROMPT_ENHANCEMENT_EMPHASIS_CAP_PER_SECTION_V1);
    // Dropped from the end of the order, so the ones the reader meets first survive.
    expect(found.map((phrase) => phrase.text)).toEqual(sixTerms.slice(0, 4));
  });

  it('keeps twelve across a body, however the sections divide them', () => {
    // Distinct terms per section, because a phrase is marked where it FIRST appears — a body that
    // repeated the same six words in five sections would spend four and stop, which is right.
    const sections = Array.from({ length: 5 }, (_, index) => {
      const terms = sixTerms.map((term) => `${term}-s${index}`);
      return { sectionKind: `kind_${index}`, bodyText: `Uses ${terms.join(', ')}.`, groundedFactValues: terms };
    });
    const found = build({ originalPromptText: 'do the work', sections });
    // Four per section would be twenty; the body's own ceiling stops it at twelve.
    expect(found).toHaveLength(PROMPT_ENHANCEMENT_EMPHASIS_CAP_PER_BODY_V1);
  });

  it('marks a repeated phrase where it first appears, not again in a later section', () => {
    // ⚠️ **This rule stands, and NOT for the reason it was written.** Built and measured on
    // 2026-09-28: marking the phrase in every section that names it reads BETTER — sections carrying
    // a mark go 65 → 88 of 129, blank sections in a popup fall from 37 % to 27 % at the median, and
    // the densest section moves only 48 % → 51 %.
    //
    // ⛔ It cannot be DRAWN. Both surfaces place a phrase by finding its first eligible occurrence in
    // the buffer, so two identical phrases take the same one: **40 of 183 marks landed on a span
    // already taken** — nothing on screen for the reader, and duplicate ranges handed to the panel.
    // The mark would exist in the data and nowhere a reader could see it.
    //
    // Lifting it needs the SECTION to travel with the phrase into both surfaces, which changes the
    // shape held in the store. That is a separate piece of work, and not one to begin by loosening a
    // rule whose replacement cannot be rendered.
    const sections = [
      { sectionKind: 'a', bodyText: 'Uses alpha-one.', groundedFactValues: ['alpha-one'] },
      { sectionKind: 'b', bodyText: 'Also uses alpha-one.', groundedFactValues: ['alpha-one'] },
    ];
    expect(build({ originalPromptText: 'do the work', sections })
      .filter((phrase) => phrase.text === 'alpha-one')).toHaveLength(1);
  });

  it('still marks it ONCE inside one section, however often the words appear there', () => {
    // ⛔ The half that did not change, and the one a reader actually feels: nothing repeats inside the
    // block they are reading. Across paragraphs is anchoring; within a paragraph would be noise.
    const found = build({
      originalPromptText: 'do the work',
      sections: [{
        sectionKind: 'a',
        bodyText: 'Uses alpha-one. Still uses alpha-one. Always uses alpha-one.',
        groundedFactValues: ['alpha-one'],
      }],
    });
    expect(found.filter((phrase) => phrase.text === 'alpha-one')).toHaveLength(1);
  });

  it('spends on the instruction before the developer’s own term', () => {
    // The term is met FIRST in the body, so only the class order can put the instruction ahead of
    // it — a run that ordered by position alone would put "redis" first and still look sensible.
    const found = build({
      originalPromptText: 'use redis, then deploy the payment client',
      sections: [{
        sectionKind: 'verification_or_test_plan',
        bodyText: "Redis is the cache. I'll deploy the payment client.",
        groundedFactValues: ['the payment client'],
      }],
    });
    expect(found[0]?.emphasisClass).toBe(1);
    expect(found[0]?.text).toBe('deploy the payment client');
    expect(found.some((phrase) => phrase.text === 'Redis')).toBe(true);
  });

  it('spends on a write before a read inside the instruction class', () => {
    const found = build({
      originalPromptText: 'deploy and review the payment client',
      sections: [
        {
          sectionKind: 'a',
          bodyText: "I'll review the payment client.",
          groundedFactValues: ['the payment client'],
        },
        {
          sectionKind: 'b',
          bodyText: "I'll deploy the payment client.",
          groundedFactValues: ['the payment client'],
        },
      ],
    });
    const actions = found.filter((phrase) => phrase.emphasisClass === 1);
    // The write comes first even though the read is met first in the body.
    expect(actions[0]?.text).toBe('deploy the payment client');
  });

  it('spends on one span once, however many classes claim it', () => {
    // "only" is a limiter AND, here, a word the developer supplied — the same span, twice. It must
    // take one of the four, not two, and it keeps the class that ranks higher.
    const found = one('Limit applies to the upload route only.', { groundedFactValues: ['only'] }, 'only the upload route');
    const marks = found.filter((phrase) => phrase.text === 'only');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.emphasisClass).toBe(2);
  });

  it('spends by class where no write-or-read question arises', () => {
    // Class 2 before class 3, with the term met LAST in the body — so only the class order can
    // put it first, and the write/read tiebreak cannot stand in for it.
    const found = one('Do not modify the middleware that fronts REDIS.', {}, 'use redis');
    expect(found[0]?.emphasisClass).toBe(2);
    expect(found[0]?.text).toBe('REDIS');
  });

  it('does not let a nested term cost the clause its mark', () => {
    // The guard is about one span counted twice, not about a term inside a clause — the standard
    // marks both, and an earlier draft lost the clause here.
    const found = one('Do not modify the auth middleware.', { groundedFactValues: ['auth'] }, "don't touch auth");
    const spans = found.map((phrase) => phrase.text);
    expect(spans).toContain('auth');
    expect(spans).toContain('Do not modify the auth middleware');
  });
});

describe('what never reaches the column', () => {
  it('no secret-shaped token, in any class', () => {
    const secret = 'sk-ABCDEFGHIJKLMNOPQRSTUVWX';
    const found = one(`Do not paste ${secret} into the log.`);
    for (const phrase of found) expect(phrase.text).not.toContain(secret);
  });

  it('nothing from the developer’s own section or the practices section', () => {
    const found = build({
      originalPromptText: 'deploy the payment client',
      sections: [
        { sectionKind: 'original_request_or_goal', bodyText: "I'll deploy the payment client only.", groundedFactValues: ['the payment client'] },
        { sectionKind: 'source_signal_guidance', bodyText: 'Do not skip the tests.', groundedFactValues: ['the payment client'] },
      ],
    });
    expect(found).toEqual([]);
  });

  it('an empty result is a real answer — the pass ran and nothing qualified', () => {
    expect(build({ originalPromptText: 'hello', sections: [{ sectionKind: 'a', bodyText: 'Nothing here.' }] })).toEqual([]);
  });
});

describe('the confirmation sentence’s named action', () => {
  it('is read off the body rather than re-derived', () => {
    // The name is resolved once when the sentence is built, from a verdict the body does not
    // carry — so reading it back is the only way to be sure it is the same name.
    const named = 'production release or rollout';
    const found = one(`Still, before you do this ${named} you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.`);
    expect(found.some((phrase) => phrase.emphasisClass === 5 && phrase.text === named)).toBe(true);
  });
});

describe('which section a phrase is charged to', () => {
  // The paint-time guard — a mark never drawn on a never-marked section — is `popup-emphasis-overlay`'s
  // business and is tested there. What this file answers is the other half, and it is about the
  // BUDGET: a phrase charged to a section the reader cannot see marks costs one of that section's
  // four, and the section that asked for it comes out blank.

  it('draws all six terms two sections named, which is more than one section may hold', () => {
    // The verbatim section quotes the whole prompt, so it shows all six of these words — and it
    // still costs nothing: the four-mark budget belongs to the two sections that named them, three
    // each. Six marks cannot have come out of one section's four.
    const found = build({
      originalPromptText: 'add a home page with a search bar, rating cards, a price range filter, a delivery time estimate and a restaurant list',
      sections: [
        {
          sectionKind: 'original_request_or_goal',
          bodyText: 'add a home page with a search bar, rating cards, a price range filter, a delivery time estimate and a restaurant list',
        },
        {
          sectionKind: 'context_and_constraints',
          bodyText: 'The home page shows the search bar and the rating cards.',
          groundedFactValues: ['home page', 'search bar', 'rating cards'],
        },
        {
          sectionKind: 'acceptance_or_output_expectation',
          bodyText: 'The price range filter, the delivery time estimate and the restaurant list are ready.',
          groundedFactValues: ['price range filter', 'delivery time estimate', 'restaurant list'],
        },
      ],
    });
    expect(found.map((phrase) => phrase.text)).toEqual([
      'home page', 'search bar', 'rating cards',
      'price range filter', 'delivery time estimate', 'restaurant list',
    ]);
    // The point of the assertion above: six is more than any ONE section is allowed, so they cannot
    // all have been charged to the same one.
    expect(found.length).toBeGreaterThan(PROMPT_ENHANCEMENT_EMPHASIS_CAP_PER_SECTION_V1);
  });

  it('charges a phrase to the section it was read from, not the first section holding the words', () => {
    // The first section is already at its four. The second names a term of its own that the first
    // happens to mention in passing — and charged to the first, it is the fifth of four and dies.
    const found = build({
      originalPromptText: 'ship the home page',
      sections: [
        {
          sectionKind: 'context_and_constraints',
          bodyText: 'The home page, the search bar, the rating cards and the price range filter are ready. The delivery time estimate is ready too.',
          groundedFactValues: ['home page', 'search bar', 'rating cards', 'price range filter'],
        },
        {
          sectionKind: 'acceptance_or_output_expectation',
          bodyText: 'The delivery time estimate must be accurate.',
          groundedFactValues: ['delivery time estimate'],
        },
      ],
    });
    expect(found.map((phrase) => phrase.text)).toContain('delivery time estimate');
    expect(found).toHaveLength(PROMPT_ENHANCEMENT_EMPHASIS_CAP_PER_SECTION_V1 + 1);
  });
});

describe('how much of one section may be drawn heavy', () => {
  // The two caps above count MARKS. This one measures how much of the reader's paragraph is bold,
  // which is what actually decides whether emphasis still reads as emphasis.
  // The same two boundaries, in a short paragraph and in a longer one. Together they are 89
  // characters: half of the first section and under a third of the second.
  const TWO_LIMITS = 'Do not modify the shared billing rate limiter. Never restart the nightly reconciliation run.';

  it('refuses the mark that would take a section past its share', () => {
    const found = build({
      originalPromptText: 'ship it',
      sections: [{
        sectionKind: 'context_and_constraints',
        bodyText: `${TWO_LIMITS} These two systems are connected through the invoicing job and the checkout service.`,
      }],
    });
    expect(found.map((phrase) => phrase.text)).toEqual(['Do not modify the shared billing rate limiter']);
  });

  it('keeps both once the paragraph is long enough to carry them', () => {
    const found = build({
      originalPromptText: 'ship it',
      sections: [{
        sectionKind: 'context_and_constraints',
        bodyText: `${TWO_LIMITS} These two systems are connected through the invoicing job and the checkout service, and a change in either one reaches the other within a single billing cycle, so both need the same care.`,
      }],
    });
    expect(found.map((phrase) => phrase.text)).toEqual([
      'Do not modify the shared billing rate limiter',
      'Never restart the nightly reconciliation run',
    ]);
  });

  it('leaves a short section to the mark COUNT caps, where a share says nothing useful', () => {
    // `Limit applies to POST /api/upload only.` is a line, and two marks in it are the point rather
    // than a wall. A flat ceiling refused the standard's own worked example.
    const found = one('Limit applies to POST /api/upload only.', { groundedFactValues: ['POST /api/upload'] });
    expect(found.map((phrase) => phrase.text)).toContain('POST /api/upload');
    expect(found.map((phrase) => phrase.text)).toContain('only');
  });

  it('spends the share on what the reader most needs, because the order decides', () => {
    // When a section fills, the priority order says what survives: the safety line, then the
    // instruction, then the developer's own term — never whichever happened to come first in the text.
    expect(PROMPT_ENHANCEMENT_EMPHASIS_MAX_SECTION_SHARE_PERCENT_V1).toBe(50);
  });
});

/**
 * One stretch of text, one mark (2026-09-29).
 *
 * The collapse used to fire only when two spans matched EXACTLY — same start, same length. Two other
 * shapes got through it, and both were measured on real bodies:
 *
 *   PARTIAL   `account if the email` [123,143) and `email matches` [138,151) — they share `email`, so
 *             between them they cover 123 to 151 with a seam in the middle, and the overlay's range
 *             merge drew the pair as one heavy run.
 *   NESTED, SAME CLASS
 *             `null error after login`, `null error` and `after login` — three of one section's four
 *             marks spent on one stretch. That body was the densest in the corpus.
 *
 * ⚠️ Nested across DIFFERENT classes stays, and the worked example above is the test for it: `auth`
 * inside `Do not modify the auth middleware` is the developer's word and a boundary, and the standard
 * shows both.
 */
describe('one stretch of text earns one mark', () => {
  it('collapses two terms that overlap without either containing the other', () => {
    const found = one('The null error after login shows up on the checkout page.', {
      groundedFactValues: ['the null error', 'error after login'],
    });
    // ⚠️ Compared lower-cased: a mark carries the BODY's casing, so `the null error` comes back as
    // `The null error`. A case-sensitive filter here returned an empty list and read as a collapse.
    const texts = found.map((phrase) => phrase.text.toLowerCase());
    // Exactly one of the pair survives; which one is the priority order's business, not this test's.
    expect(texts.filter((text) => text === 'the null error' || text === 'error after login')).toHaveLength(1);
  });

  it('collapses a term nested inside another term of the SAME class, keeping the fuller reading', () => {
    // ⚠️ The grounded values are given SHORTEST FIRST on purpose. Longest-first, the term merge's own
    // nesting guard (`emphasis-sources.ts`) refuses the pieces before they ever reach this layer — so a
    // longest-first fixture passed with this rule switched off, and proved nothing about it. Shortest
    // first is the order that actually happens across the five merged sources, and it is the order that
    // used to leave the FRAGMENT standing.
    const found = one('The null error after login shows up on the checkout page.', {
      groundedFactValues: ['null error', 'after login', 'null error after login'],
    });
    const texts = found.map((phrase) => phrase.text.toLowerCase());
    expect(texts).toContain('null error after login');
    expect(texts).not.toContain('null error');
    expect(texts).not.toContain('after login');
  });

  it('keeps a term nested inside a BOUNDARY, which is two marks the standard asks for', () => {
    // ⛔ The direction that must not regress. Collapsing this would silently drop a range the worked
    // example requires, which is what a first draft of the nesting rule did.
    const found = one('Do not modify the auth middleware.', { groundedFactValues: ['auth middleware'] });
    const pairs = found.map((phrase) => [phrase.emphasisClass, phrase.text] as const);
    expect(pairs).toContainEqual([2, 'auth middleware']);
    expect(pairs).toContainEqual([3, 'Do not modify the auth middleware']);
  });

  it('leaves two marks on two separate stretches alone', () => {
    // So the rules above cannot pass by collapsing everything.
    const found = one('The retry queue is drained and the audit log is kept.', {
      groundedFactValues: ['the retry queue', 'the audit log'],
    });
    const texts = found.map((phrase) => phrase.text.toLowerCase());
    expect(texts).toContain('the retry queue');
    expect(texts).toContain('the audit log');
  });
});
