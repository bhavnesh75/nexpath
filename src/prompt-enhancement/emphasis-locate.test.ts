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
    expect(found.map((phrase) => [phrase.emphasisClass, phrase.text])).toEqual([
      [1, "run the project's test suite"],
      [2, 'POST /api/upload'],
      [2, 'auth'],
      [2, 'uploads over the limit get a 429'],
      [3, 'only'],
      [3, 'Do not modify the auth middleware'],
      [3, 'Do not assume'],
      [4, 'before reporting done'],
      [5, NAMED],
    ]);
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

  it('keeps no positions — only the phrase, its class and where it came from', () => {
    const found = one('Limit applies to POST /api/upload only.', { groundedFactValues: ['POST /api/upload'] });
    expect(found.length).toBeGreaterThan(0);
    for (const phrase of found) expect(Object.keys(phrase).sort()).toEqual(['emphasisClass', 'source', 'text']);
    expect(found.every((phrase) => phrase.source === 'floor')).toBe(true);
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
    const sections = [
      { sectionKind: 'a', bodyText: 'Uses alpha-one.', groundedFactValues: ['alpha-one'] },
      { sectionKind: 'b', bodyText: 'Also uses alpha-one.', groundedFactValues: ['alpha-one'] },
    ];
    expect(build({ originalPromptText: 'do the work', sections })
      .filter((phrase) => phrase.text === 'alpha-one')).toHaveLength(1);
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
