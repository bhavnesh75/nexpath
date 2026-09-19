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
