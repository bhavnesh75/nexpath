/**
 * The standard, class by class.
 *
 * The first test is the whole phase in one assertion: the worked example from the analysis, with
 * its four sections, reproducing its nine ranges and nothing else. Everything after it takes one
 * rule at a time and shows both halves — what earns a mark, and what deliberately does not. A
 * detector that only ever says yes would pass half of this file.
 */
import { describe, expect, it } from 'vitest';
import { EXECUTION_VERB, ALWAYS_ESCALATE_PATTERN } from './safety-sendability.js';
import {
  classifyPromptEnhancementEmphasisCandidatesV1,
  type PromptEnhancementEmphasisCandidateV1,
  type PromptEnhancementEmphasisInputV1,
} from './emphasis-classes.js';

const NAMED_ACTION = 'production release or rollout';
const CONFIRMATION = `Still, before you do this ${NAMED_ACTION} you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.`;
const STANCE = 'This request touches something risky the developer has not asked to have done: cover what to check and what to confirm with them first, rather than carrying it out.';

/** Just the pairs, so an assertion reads as the standard rather than as an object dump. */
const pairs = (found: readonly PromptEnhancementEmphasisCandidateV1[]): [number, string][] =>
  found.map((candidate) => [candidate.emphasisClass, candidate.text]);

const classify = (input: PromptEnhancementEmphasisInputV1) => classifyPromptEnhancementEmphasisCandidatesV1(input);

/** One section, the shape most of these tests need. */
const one = (
  sectionText: string,
  extra: Partial<PromptEnhancementEmphasisInputV1['sections'][number]> = {},
  input: Partial<PromptEnhancementEmphasisInputV1> = {},
) => classify({
  originalPromptText: input.originalPromptText ?? 'do the work',
  sections: [{ sectionKind: 'context_and_constraints', sectionText, ...extra }],
  ...input,
});

describe('the worked example', () => {
  // The prompt the analysis walks through: execute-shaped, one risk kind, and an earlier session
  // turn that renders an expectation line.
  const PROMPT = "add rate limiting to the upload endpoint, don't touch auth, then roll it out to production";

  const found = classify({
    originalPromptText: PROMPT,
    sensitiveActionName: NAMED_ACTION,
    sections: [
      {
        sectionKind: 'context_and_constraints',
        sectionText: 'Limit applies to POST /api/upload only.\nDo not modify the auth middleware.',
        groundedFactValues: ['POST /api/upload', 'auth'],
      },
      {
        sectionKind: 'acceptance_or_output_expectation',
        sectionText:
          'what you said done means appears to be "uploads over the limit get a 429" (seen earlier this session) — confirm before relying on it.',
      },
      {
        sectionKind: 'verification_or_test_plan',
        sectionText: "I'll run the project's test suite before reporting done.",
        groundedFactValues: ["the project's test suite"],
      },
      { sectionKind: 'risk_safety_or_confirmation', sectionText: CONFIRMATION },
    ],
  });

  it('reproduces its nine ranges, and marks nothing else', () => {
    expect(pairs(found)).toEqual([
      [2, 'POST /api/upload'],
      [2, 'auth'],
      [3, 'only'],
      [3, 'Do not modify the auth middleware'],
      [2, 'uploads over the limit get a 429'],
      [1, "run the project's test suite"],
      [4, 'before reporting done'],
      [5, NAMED_ACTION],
      [3, 'Do not assume'],
    ]);
  });

  it('marks no heading — not one, including the risky section’s', () => {
    // The headings are not in what this module is handed, and that is the point: it is given the
    // body of a section, never its title, so a heading cannot be marked by construction.
    for (const heading of ['Context and constraints', 'What done looks like', 'How to verify', 'Risk, safety and confirmation']) {
      expect(found.some((candidate) => candidate.text.includes(heading))).toBe(false);
    }
  });

  it('ranks the instruction it found as a write', () => {
    expect(found.find((candidate) => candidate.emphasisClass === 1)?.isWriteVerb).toBe(true);
  });
});

describe('class 1 — the instruction the body gives', () => {
  const grounded = { groundedFactValues: ['the payment client'] };

  it('marks a write verb with its object', () => {
    expect(pairs(one("I'll deploy the payment client.", grounded)))
      .toContainEqual([1, 'deploy the payment client']);
  });

  it('marks a read verb too, and ranks it below a write', () => {
    const found = one("I'll review the payment client.", grounded);
    const action = found.find((candidate) => candidate.emphasisClass === 1);
    expect(action?.text).toBe('review the payment client');
    expect(action?.isWriteVerb).toBe(false);
  });

  it('does NOT mark a verb whose object traces to nothing', () => {
    // Nobody named a staging cluster. A mark here would be the body inventing work.
    expect(one("I'll deploy the staging cluster.", grounded)
      .some((candidate) => candidate.emphasisClass === 1)).toBe(false);
  });

  it('does NOT mark a verb that is not at the head of its clause', () => {
    // The body describing something, rather than instructing.
    expect(one('The release notes mention deploy steps for the payment client.', grounded)
      .some((candidate) => candidate.emphasisClass === 1)).toBe(false);
  });

  it('does NOT mark anything inside the developer’s own restated prompt', () => {
    const found = classify({
      originalPromptText: 'deploy the payment client',
      sections: [{
        sectionKind: 'original_request_or_goal',
        sectionText: "I'll deploy the payment client.",
        groundedFactValues: ['the payment client'],
      }],
    });
    expect(found).toEqual([]);
  });

  it('is off in a section the body was not cleared to propose the action in', () => {
    const found = one("I'll deploy the payment client.", { ...grounded, clearanceVerdict: 'not_proposed' });
    expect(found.some((candidate) => candidate.emphasisClass === 1)).toBe(false);
  });

  it('is off THERE only — a section with no verdict still marks its instruction', () => {
    // The rule is scoped to the risky kinds, so a verdict on one section must not silence another.
    const found = classify({
      originalPromptText: 'deploy the payment client',
      sections: [
        {
          sectionKind: 'risk_safety_or_confirmation',
          sectionText: "I'll deploy the payment client.",
          groundedFactValues: ['the payment client'],
          clearanceVerdict: 'not_proposed',
        },
        {
          sectionKind: 'verification_or_test_plan',
          sectionText: "I'll review the payment client.",
          groundedFactValues: ['the payment client'],
        },
      ],
    });
    expect(pairs(found.filter((candidate) => candidate.emphasisClass === 1)))
      .toEqual([[1, 'review the payment client']]);
  });

  it('is off when the body is not English, and the other classes stay on', () => {
    const found = classify({
      originalPromptText: 'deploy karo payment client',
      detectedLanguageSelfReport: 'hi-Latn',
      sections: [{
        sectionKind: 'context_and_constraints',
        sectionText: "I'll deploy the payment client. Do not touch auth.",
        groundedFactValues: ['the payment client'],
      }],
    });
    expect(found.some((candidate) => candidate.emphasisClass === 1)).toBe(false);
    expect(found.some((candidate) => candidate.emphasisClass === 3)).toBe(true);
  });
});

describe('class 2 — the developer’s own words', () => {
  it('comes from a floor item the developer wrote', () => {
    expect(pairs(one('Fix the failing test in src/api/upload.ts.', {}, {
      originalPromptText: 'fix the failing test in src/api/upload.ts',
    }))).toContainEqual([2, 'src/api/upload.ts']);
  });

  it('comes from a curated tool name', () => {
    expect(pairs(one('Cache reads go through Redis.', {}, { originalPromptText: 'use redis for the cache' })))
      .toContainEqual([2, 'Redis']);
  });

  it('comes from an expectation line’s value, and never its framing', () => {
    const found = one('node version appears to be 22 (from a recent project check) — confirm before relying on it.');
    expect(pairs(found)).toContainEqual([2, '22']);
    expect(found.every((candidate) => !candidate.text.includes('confirm before relying'))).toBe(true);
  });

  it('comes from a grounded value', () => {
    expect(pairs(one('Limit applies to POST /api/upload.', { groundedFactValues: ['POST /api/upload'] })))
      .toContainEqual([2, 'POST /api/upload']);
  });

  it('is NEVER an identifier', () => {
    const found = one('The rule comes from fact-77.', {
      groundedFactValues: ['fact-77'],
      sourceFactIds: ['fact-77'],
    });
    expect(found.some((candidate) => candidate.text === 'fact-77')).toBe(false);
  });
});

describe('classes 3 and 4 — boundaries and conditions', () => {
  it('binds a boundary to the clause it governs, not the bare word', () => {
    expect(pairs(one('Do not modify the auth middleware.'))).toContainEqual([3, 'Do not modify the auth middleware']);
  });

  it('takes the longer boundary rather than the bare word inside it', () => {
    const found = one('Do not modify the auth middleware.');
    expect(found.filter((candidate) => candidate.emphasisClass === 3)).toHaveLength(1);
  });

  it('marks a trailing limiter on its own, because nothing follows it', () => {
    expect(pairs(one('Limit applies to the upload endpoint only.'))).toContainEqual([3, 'only']);
  });

  it('binds a condition to its clause', () => {
    expect(pairs(one('Run the migration once the backup finishes.'))).toContainEqual([4, 'once the backup finishes']);
  });
});

describe('class 5 — the sentences the pipeline inserts', () => {
  it('marks the confirmation’s named action, and the rest of that sentence stays plain', () => {
    const found = one(CONFIRMATION, {}, { sensitiveActionName: NAMED_ACTION });
    expect(pairs(found)).toContainEqual([5, NAMED_ACTION]);
    expect(found.some((candidate) => candidate.text.includes('go-ahead confirmation'))).toBe(false);
    expect(found.some((candidate) => candidate.text.includes('ground level'))).toBe(false);
  });

  it('marks its second scope unit as a boundary, not a safety line', () => {
    const found = one(CONFIRMATION, {}, { sensitiveActionName: NAMED_ACTION });
    expect(pairs(found)).toContainEqual([3, 'Do not assume']);
    expect(found.some((candidate) => candidate.emphasisClass === 5 && candidate.text === 'Do not assume')).toBe(false);
  });

  it('marks the history-lane safeguard’s generic naming', () => {
    const safeguard = 'Still, before you do this sensitive action you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.';
    expect(pairs(one(safeguard))).toContainEqual([5, 'sensitive action']);
  });

  it('marks only the stance’s second half', () => {
    const found = one(STANCE);
    expect(pairs(found)).toContainEqual([5, 'rather than carrying it out']);
    expect(found.some((candidate) => candidate.text.includes('touches something risky'))).toBe(false);
  });
});

describe('what is never marked', () => {
  it('marks nothing at all inside the developer’s own section', () => {
    expect(classify({
      originalPromptText: 'deploy the payment client',
      sections: [{
        sectionKind: 'original_request_or_goal',
        sectionText: "Do not touch auth. I'll deploy the payment client only.",
        groundedFactValues: ['the payment client', 'auth'],
      }],
    })).toEqual([]);
  });

  it('marks nothing at all inside the practices section', () => {
    expect(classify({
      originalPromptText: 'deploy the payment client',
      sections: [{
        sectionKind: 'source_signal_guidance',
        sectionText: "Do not skip the tests. I'll review the payment client only.",
        groundedFactValues: ['the payment client'],
      }],
    })).toEqual([]);
  });

  it('cuts a candidate before a secret-shaped token, in every class', () => {
    const secret = 'sk-ABCDEFGHIJKLMNOPQRSTUVWX';
    const found = one(`Do not paste ${secret} into the log.`);
    for (const candidate of found) expect(candidate.text).not.toContain(secret);
    // And the surviving half is still a real phrase, not an empty mark.
    expect(found.every((candidate) => candidate.text.trim().length > 0)).toBe(true);
  });
});

describe('the patterns this phase only made visible', () => {
  it('leaves the write-verb pattern byte for byte as it was', () => {
    expect(EXECUTION_VERB.source).toBe(
      '\\b(?:run|execute|deploy|delete|remove|migrate|install|force[-\\s]?push|publish|post|notify|write|modify|apply|rotate|increase|truncate|drop|karo|kar\\s+do|chalao|hatao|mitao|lagao)\\b|(?:करो|कर\\s*दो|चलाओ|हटाओ|मिटाओ|लिखो|बदलो|કરો|કરી\\s*દો|ચલાવો|કાઢી\\s*નાખો|મિટાવો|લખો|બદલો)',
    );
    expect(EXECUTION_VERB.flags).toBe('i');
  });

  it('leaves the escalation pattern byte for byte as it was', () => {
    expect(ALWAYS_ESCALATE_PATTERN.source).toBe(
      '\\b(?:force[-\\s]?push|rm\\s+-rf|drop\\s+table|truncate|reset\\s+--hard|rewrite\\s+history)\\b',
    );
    expect(ALWAYS_ESCALATE_PATTERN.flags).toBe('i');
  });
});
