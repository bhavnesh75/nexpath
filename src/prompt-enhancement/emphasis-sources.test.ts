/**
 * Where a user term may come from, and what a consumer must not read.
 *
 * The corpus is the invention gate's own allowed texts minus the identifiers, and the filter over
 * a floor's extract is one function both consumers call — so the two questions this file asks are
 * "is the corpus the same set the gate uses" and "does the filter still drop what it was measured
 * to drop".
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { filterFloorExtractForConsumersV1 } from './preservation-floors.js';
import { promptEnhancementDeveloperTermsV1 } from './emphasis-sources.js';

import {
  buildPromptEnhancementEmphasisCorpusV1,
  collectPromptEnhancementEmphasisUserTermsV1,
  extractPromptEnhancementExpectationValuesV1,
} from './emphasis-sources.js';

/**
 * The matcher table as it stood when this consumer was written. Bold reads these extracts and must
 * never be the reason one of them changed — a floor answers a safety question, and a display
 * feature has no business moving it.
 */
const FLOOR_MATCHERS_DIGEST = '282fcb3d4e3d81918c2c76665d2b94df1e69680b55efc2ea4261476887e76f07';

/**
 * The table's text, from its declaration to the close that follows its LAST entry.
 *
 * ⚠️ Not a lazy `[\s\S]*?\n\];` — an entry's own array literal ends with `];` too, and that regex
 * stopped at the first one and hashed 17 of the 18 floors. A pin that silently covers part of what
 * it claims to cover is worse than no pin.
 */
function floorMatcherTable(): string {
  const source = readFileSync(fileURLToPath(new URL('./preservation-floors.ts', import.meta.url)), 'utf8');
  const start = source.indexOf('const FLOOR_MATCHERS');
  const lastEntry = source.lastIndexOf("floorId: '");
  const end = source.indexOf('\n];', lastEntry);
  expect(start, 'the matcher table').toBeGreaterThanOrEqual(0);
  expect(end, 'the table’s close').toBeGreaterThan(start);
  return source.slice(start, end + 3);
}

describe('the filter both consumers share', () => {
  it('drops a command head followed by one plain word, and keeps a real target', () => {
    // The measured false-positive class: prose that reads as an invocation.
    const prose = filterFloorExtractForConsumersV1('Please make necessary changes to the config.');
    expect(prose.some((item) => item.toLowerCase().startsWith('make necessary'))).toBe(false);

    // A real target keeps a shape word and survives.
    const real = filterFloorExtractForConsumersV1('Then run make build-all and node server.js.');
    expect(real.some((item) => item.includes('build-all'))).toBe(true);
    expect(real.some((item) => item.includes('server.js'))).toBe(true);
  });

  it('reads only the item-shaped floors — a clause-shaped one is not item evidence', () => {
    // "Do not" lines are what the boundary class marks; they are not items a consumer may quote.
    const items = filterFloorExtractForConsumersV1('Do not touch the auth middleware.');
    expect(items.every((item) => !item.toLowerCase().startsWith('do not'))).toBe(true);
  });

  it('leaves the shared matchers byte for byte as they were (P18)', () => {
    // The behavioural pin below can only catch a change that shows on ONE fixed text. This reads
    // the matcher table itself, so an edit to any of the eighteen fails here whether or not that
    // text happens to notice — which is what "byte-untouched" has to mean to be worth saying.
    const table = floorMatcherTable();
    // Counted first: a failure then says the table was cut short rather than only that a hash moved.
    expect((table.match(/floorId: '/g) ?? []).length).toBe(18);
    expect(createHash('sha256').update(table).digest('hex')).toBe(FLOOR_MATCHERS_DIGEST);
  });

  it('is stable on a fixed text — the behavioural half of the same pin', () => {
    const items = filterFloorExtractForConsumersV1(
      'Fix the failing test in src/api/upload.ts, see issue #412, then run npm test.',
    );
    // Pinned as a set: the matchers own the order, this file owns only that the set did not change.
    // The matcher takes the command with the punctuation that ended it; that is its shape, not a defect.
    expect([...items].sort()).toEqual(['#412', 'npm test.', 'src/api/upload.ts']);
  });
});

describe('the corpus a user term may come from', () => {
  it('is the prompt plus the section’s grounded values, and nothing else', () => {
    expect(buildPromptEnhancementEmphasisCorpusV1({
      originalPromptText: 'add rate limiting to the upload endpoint',
      groundedFactValues: ['POST /api/upload'],
    })).toEqual(['add rate limiting to the upload endpoint', 'POST /api/upload']);
  });

  it('drops an empty half rather than carrying a blank entry', () => {
    expect(buildPromptEnhancementEmphasisCorpusV1({ originalPromptText: 'do the thing' })).toEqual(['do the thing']);
    expect(buildPromptEnhancementEmphasisCorpusV1({ originalPromptText: '   ', groundedFactValues: ['x'] })).toEqual(['x']);
  });
});

describe('the value half of an expectation line', () => {
  const line = 'what you said done means appears to be "uploads over the limit get a 429" (seen earlier this session) — confirm before relying on it.';

  it('takes the value and leaves the framing plain', () => {
    expect(extractPromptEnhancementExpectationValuesV1(line)).toEqual(['uploads over the limit get a 429']);
  });

  it('takes an unquoted value too, without the recency phrase', () => {
    expect(extractPromptEnhancementExpectationValuesV1(
      'node version appears to be 22 (from a recent project check) — confirm before relying on it.',
    )).toEqual(['22']);
  });

  it('finds nothing in a line that is not an expectation', () => {
    expect(extractPromptEnhancementExpectationValuesV1('Known project fact: the runner is vitest.')).toEqual([]);
  });
});

describe('the user terms of a section', () => {
  const base = {
    originalPromptText: "add rate limiting to the upload endpoint, don't touch auth",
    sectionText: 'Limit applies to POST /api/upload only.',
    groundedFactValues: ['POST /api/upload'],
  };

  it('returns a grounded value the section actually shows', () => {
    expect(collectPromptEnhancementEmphasisUserTermsV1(base)).toEqual(['POST /api/upload']);
  });

  it('never returns an identifier, even when the section names it', () => {
    const terms = collectPromptEnhancementEmphasisUserTermsV1({
      ...base,
      sectionText: 'Limit applies to POST /api/upload only. See fact-77.',
      groundedFactValues: ['POST /api/upload', 'fact-77'],
      sourceFactIds: ['fact-77'],
    });
    expect(terms).toEqual(['POST /api/upload']);
    expect(terms).not.toContain('fact-77');
  });

  it('never returns a term the section does not show', () => {
    expect(collectPromptEnhancementEmphasisUserTermsV1({
      ...base,
      groundedFactValues: ['POST /api/upload', 'GET /api/health'],
    })).toEqual(['POST /api/upload']);
  });

  it('returns each term once, in the casing its source uses', () => {
    expect(collectPromptEnhancementEmphasisUserTermsV1({
      originalPromptText: 'use redis for the cache',
      sectionText: 'Cache reads go through Redis. Redis is already a dependency.',
      groundedFactValues: ['redis', 'Redis'],
      // The curated list answers first and answers in ITS casing, so the mark reads as the tool
      // is written rather than as the developer happened to type it that time.
    })).toEqual(['Redis']);
  });
});

/**
 * The developer's own terms — the fifth source.
 *
 * It is the one source that reads nothing but the prompt, so its rules are the whole of it. Each is
 * asserted here because each was a decision: a term is two words at least (single words were
 * measured to spend the cap on fragments of the phrases a reader would have picked), four at most,
 * offered longest first so the fuller reading survives the cap, and never begun or ended by a word
 * that carries no subject of its own.
 *
 * ⚠️ These are CANDIDATES. Whether one becomes a mark is the collector's question — it must appear
 * in the section — and then the classifier's and the cap's.
 */
describe("the developer's own terms", () => {
  const terms = (prompt: string) => promptEnhancementDeveloperTermsV1(prompt);

  it('takes the multi-word things the developer named', () => {
    const found = terms('build the cart drawer that shows the delivery fee');
    expect(found).toContain('cart drawer');
    expect(found).toContain('delivery fee');
  });

  it('offers nothing one word long — a fragment is not a name', () => {
    for (const term of terms('build the cart drawer and show the subtotal')) {
      expect(term.split(' ').length).toBeGreaterThanOrEqual(2);
    }
  });

  it('offers the longest reading first, so the cap keeps the fuller one', () => {
    const found = terms('rebuild the payment gateway client today');
    const long = found.indexOf('payment gateway client');
    const short = found.indexOf('payment gateway');
    expect(long).toBeGreaterThanOrEqual(0);
    expect(short).toBeGreaterThanOrEqual(0);
    expect(long).toBeLessThan(short);
  });

  it('never begins or ends on a word that carries no subject', () => {
    for (const term of terms('lets me change the quantities or remove the items from it')) {
      const words = term.toLowerCase().split(' ');
      expect(['the', 'a', 'an', 'or', 'and', 'of', 'to', 'it', 'me', 'from']).not.toContain(words[0]);
      expect(['the', 'a', 'an', 'or', 'and', 'of', 'to', 'it', 'me', 'from']).not.toContain(words[words.length - 1]);
    }
  });

  it('does not run a phrase across punctuation — two listed things are not one named thing', () => {
    // ⏪ This first asserted that no term CONTAINS a comma, and a mutation run showed it could not
    // fail: a version that STRIPS punctuation rather than splitting on it yields `subtotal delivery`,
    // which has no comma in it. The assertion was checking the character instead of the rule.
    //
    // What must not exist is the pair either side of the comma, joined — the developer listed two
    // things there and named neither of them that.
    const found = terms('show the subtotal, delivery fee, and total');
    expect(found).not.toContain('subtotal delivery');
    expect(found).not.toContain('fee and');
    // …while the things they DID name, each inside its own clause, are still offered.
    expect(found).toContain('delivery fee');
  });

  it('returns nothing from a prompt with nothing to name', () => {
    expect(promptEnhancementDeveloperTermsV1('')).toEqual([]);
    expect(promptEnhancementDeveloperTermsV1('do it')).toEqual([]);
  });

  it('offers each term once, however often it was typed', () => {
    const found = terms('the cart drawer and the cart drawer again');
    expect(found.filter((t) => t.toLowerCase() === 'cart drawer')).toHaveLength(1);
  });
});

describe('a term already inside a term this section offered', () => {
  it('offers the fuller reading only', () => {
    // `food delivery app`, `food delivery` and `delivery app` are three marks on seventeen
    // characters, and between them they take three of the section's four.
    expect(collectPromptEnhancementEmphasisUserTermsV1({
      originalPromptText: 'build a food delivery app',
      sectionText: 'The food delivery app needs a home page.',
      groundedFactValues: ['food delivery app', 'food delivery', 'delivery app'],
    })).toEqual(['food delivery app']);
  });

  it('still offers a term that merely shares a word', () => {
    // Overlapping is not containing. `delivery time` is its own thing and has to survive the rule
    // above, or the rule is just "keep the first one".
    expect(collectPromptEnhancementEmphasisUserTermsV1({
      originalPromptText: 'build a food delivery app',
      sectionText: 'The food delivery app shows a delivery time.',
      groundedFactValues: ['food delivery app', 'delivery time'],
    })).toEqual(['food delivery app', 'delivery time']);
  });
});

/**
 * What a term may not be (2026-09-29).
 *
 * The n-gram walk splits the prompt on punctuation only, so a window slides straight across a
 * subordinator and straight into the middle of a noun phrase. Both were drawing marks on real popups.
 */
describe('a term is a name, not a piece of a sentence', () => {
  const terms = (prompt: string) => promptEnhancementDeveloperTermsV1(prompt);

  it('refuses a window that spans a subordinator', () => {
    // `link it to the existing account if the email matches` drew `account if the email` — two clauses,
    // naming neither, and overlapping the `email matches` mark beside it.
    const found = terms('link it to the existing account if the email matches');
    expect(found).not.toContain('account if the email');
    // …and the clean halves are still offered, so this is not just "refuse everything".
    expect(found).toContain('existing account');
    expect(found).toContain('email matches');
  });

  it('refuses a window that carries a finite verb', () => {
    // `the order is saved in the database` drew `order is saved`, which is a sentence about the order.
    const found = terms('make sure the order is saved in the database');
    expect(found).not.toContain('order is saved');
  });

  it('still offers a phrase joined by and/or — the developer named one thing', () => {
    // ⛔ `and`, `or`, `so` and `then` are deliberately NOT refused: these are the sort keys, one thing.
    expect(terms('sort them by rating or delivery time')).toContain('rating or delivery time');
  });

  it('offers the whole five-word phrase, so no four-word piece of it has to stand in', () => {
    // ⏪ The window was four until 2026-09-29, and a five-word phrase could only be offered as a piece
    // of itself: `a fully functional category bar at the top` gave `bar at the top`, which begins in the
    // middle of `category bar`.
    const found = terms('add a category bar at the top of the listing page');
    expect(found).toContain('category bar at the top');
    // The piece is still generated — it is the MERGE that refuses it, tested below — so what this pins
    // is that the fuller reading is offered FIRST, which is what makes that refusal pick the right one.
    expect(found.indexOf('category bar at the top')).toBeLessThan(found.indexOf('bar at the top'));
  });

  it('keeps the fuller reading when the merge sees both', () => {
    expect(collectPromptEnhancementEmphasisUserTermsV1({
      originalPromptText: 'add a category bar at the top of the listing page',
      sectionText: '- Build a fully functional category bar at the top of the listing page.',
    })).toContain('category bar at the top');
  });

  it('does not offer a five-word window that is a sentence', () => {
    // The ceiling going up must not let a whole clause through: the guards above still apply at five.
    for (const term of terms('make sure the order is saved in the database before the retry')) {
      expect(term.split(' ').length).toBeLessThanOrEqual(5);
      expect(term.toLowerCase().split(' ')).not.toContain('is');
    }
  });
});

/**
 * A grounded fact written in the pipeline's notation (2026-09-29).
 *
 * The pipeline supplies a section's fact as `task_breakdown → implementation` and the composer then
 * writes about it in prose, so the value only matches once its underscores are read as spaces.
 */
describe('a grounded fact in the pipeline’s notation', () => {
  const found = (value: string, sectionText: string) =>
    collectPromptEnhancementEmphasisUserTermsV1({ originalPromptText: 'ship it', sectionText });

  it('offers the fact in the pieces a sentence writes', () => {
    expect(collectPromptEnhancementEmphasisUserTermsV1({
      originalPromptText: 'ship it',
      sectionText: '- Recent practice shows a solid task breakdown before implementation.',
      groundedFactValues: ['task_breakdown → implementation'],
    })).toContain('task breakdown');
  });

  it('does not offer the notation itself', () => {
    // ⛔ A mark on `task_breakdown → implementation` is a mark on plumbing.
    expect(collectPromptEnhancementEmphasisUserTermsV1({
      originalPromptText: 'ship it',
      sectionText: '- The signal task_breakdown → implementation shows a solid task breakdown.',
      groundedFactValues: ['task_breakdown → implementation'],
    })).not.toContain('task_breakdown → implementation');
  });

  it('leaves a HYPHEN alone — a hyphen is how a real name is spelled', () => {
    // ⛔ The first version replaced `[_-]`, which turned the plain value `alpha-one` into `alpha one`
    // and cost four budget tests their marks. Inside notation it matters too: reading the hyphen in
    // `feature-flag rollout` as a space looks for `feature flag rollout`, which no body writes.
    expect(collectPromptEnhancementEmphasisUserTermsV1({
      originalPromptText: 'ship it',
      sectionText: '- Recent practice shows the feature-flag rollout is well handled.',
      groundedFactValues: ['feature-flag rollout → verification'],
    })).toContain('feature-flag rollout');
  });

  it('⛔ offers NOTHING for a fact whose pieces are each one word — a known limit', () => {
    // `implementation` is one word and generic: marked, it took 29 of the 33 recorded practices sections
    // and pushed seven conditions out of their bodies' budgets, which is the shape §5H measured and
    // withdrew. So single-word pieces are refused — and the cost is that a fact whose name happens to BE
    // one word (`feature-flag → rollout`) is not marked either. The corpus holds no such fact; this pins
    // the behaviour so the trade is visible rather than discovered.
    expect(collectPromptEnhancementEmphasisUserTermsV1({
      originalPromptText: 'ship it',
      sectionText: '- Recent practice shows the feature-flag rollout is well handled.',
      groundedFactValues: ['feature-flag → rollout'],
    })).toEqual([]);
  });

  it('offers a plain value exactly as it always did', () => {
    // Nothing without a notation separator changes: it is offered whole, hyphen and all.
    expect(collectPromptEnhancementEmphasisUserTermsV1({
      originalPromptText: 'ship it',
      sectionText: '- Uses alpha-one for the retry path.',
      groundedFactValues: ['alpha-one'],
    })).toContain('alpha-one');
  });

  void found;
});
