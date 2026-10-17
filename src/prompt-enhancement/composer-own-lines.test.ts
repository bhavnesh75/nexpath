/**
 * The proof that `composer-own-lines.ts` is COMPLETE, not sampled.
 *
 * Emphasis refuses to mark the composer's own section lines, and it does that by knowing them. A list
 * of strings copied out of another module is worth nothing on its own: the moment somebody rewords a
 * line in `compose-enhancement.ts`, the copy goes stale and the guard silently stops guarding while
 * every test still passes. That is the exact failure `body-assertion-checks.ts` documents for the same
 * kind of copy, and this file closes it the same way — by reading the generator's source.
 *
 * ⛔ The test reads source text. It does not run the composer, does not need a model, and does not
 * assert anything about what the composer SHOULD say — only that whatever it says is accounted for.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  PROMPT_ENHANCEMENT_COMPOSER_OWN_LINES_V1,
  PROMPT_ENHANCEMENT_COMPOSER_REQUEST_DERIVED_LINES_V1,
  PROMPT_ENHANCEMENT_COMPOSER_REQUEST_DERIVED_KINDS_V1,
  isPromptEnhancementComposerOwnLineV1,
} from './composer-own-lines.js';
import {
  PROMPT_ENHANCEMENT_FALLTHROUGH_LONG_V1,
  PROMPT_ENHANCEMENT_FALLTHROUGH_SHORT_SUFFIX_V1,
} from './body-assertion-checks.js';

const here = dirname(fileURLToPath(import.meta.url));
const composerSource = readFileSync(join(here, 'compose-enhancement.ts'), 'utf8');

/**
 * Every body-shaped sentence the composer holds as a literal.
 *
 * ⚠️ Scanned line by line, with comment lines skipped. A file-wide quote scan pairs an apostrophe in a
 * prose comment (`composer's`) with the next quote and shifts every string boundary after it — the
 * first version of this scan reported ZERO literals in a file that plainly has twenty-nine.
 */
function bodyShapedLiteralsInComposer(): readonly string[] {
  const found = new Set<string>();
  for (const raw of composerSource.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
    for (const match of line.matchAll(/'([^']{40,})'|"([^"]{40,})"|`([^`]{40,})`/g)) {
      const text = match[1] ?? match[2] ?? match[3] ?? '';
      // A rendered body line opens on a capital — or on an interpolation, which is a line whose first
      // words are the developer's — and ends on a stop.
      if (!/^[A-Z$]/.test(text)) continue;
      if (!/[.!?]$/.test(text)) continue;
      found.add(text);
    }
  }
  return [...found];
}

/** Is this literal accounted for, either as the composer's own or as derived from the request? */
function accountedFor(literal: string): boolean {
  // The fall-through interpolates the heading, so it is recognised by its two arms rather than whole.
  if (
    literal.includes(PROMPT_ENHANCEMENT_FALLTHROUGH_LONG_V1) ||
    literal.endsWith(PROMPT_ENHANCEMENT_FALLTHROUGH_SHORT_SUFFIX_V1)
  ) {
    return true;
  }
  if (PROMPT_ENHANCEMENT_COMPOSER_OWN_LINES_V1.some((own) => literal.startsWith(own))) return true;
  return PROMPT_ENHANCEMENT_COMPOSER_REQUEST_DERIVED_LINES_V1.some((derived) => literal.includes(derived));
}

describe('the composer-own line list is complete', () => {
  it('finds the composer literals at all — a scan that finds none proves nothing', () => {
    // The guard on the guard. If the scan breaks, every assertion below passes over an empty list.
    expect(bodyShapedLiteralsInComposer().length).toBeGreaterThan(20);
  });

  it('accounts for every body-shaped literal the composer holds', () => {
    const unaccounted = bodyShapedLiteralsInComposer().filter((literal) => !accountedFor(literal));
    // A failure here is not a bug in this test. It means a line was added to or reworded in
    // `compose-enhancement.ts`, and somebody has to decide whether emphasis may mark it: add it to
    // PROMPT_ENHANCEMENT_COMPOSER_OWN_LINES_V1 to leave it plain, or to the request-derived list to
    // let a reader see it.
    expect(unaccounted).toEqual([]);
  });

  it('names the request-derived kinds it deliberately does not cover', () => {
    // Pinned so the exception cannot quietly widen into "and anything else we did not get to".
    expect([...PROMPT_ENHANCEMENT_COMPOSER_REQUEST_DERIVED_KINDS_V1]).toEqual([
      'point_inventory_or_decomposition',
      'reproduction_or_evidence',
    ]);
  });
});

describe('recognising a composer-own line', () => {
  it('recognises a per-kind line behind its list marker', () => {
    expect(isPromptEnhancementComposerOwnLineV1(
      '- Name risky or irreversible actions, ask for required confirmation, and include rollback or recovery checks.',
    )).toBe(true);
  });

  it('recognises the fall-through whatever heading it carries', () => {
    expect(isPromptEnhancementComposerOwnLineV1(
      `- Cover Scope and non-goals ${PROMPT_ENHANCEMENT_FALLTHROUGH_LONG_V1} — state what is required.`,
    )).toBe(true);
    expect(isPromptEnhancementComposerOwnLineV1('- Cover Rollback and recovery concretely.')).toBe(true);
  });

  it('recognises a line the body has appended to', () => {
    expect(isPromptEnhancementComposerOwnLineV1(
      '- Include the verification check. Then run it on the staging branch.',
    )).toBe(true);
  });

  it('leaves the developer’s own instruction alone', () => {
    // The direction that matters. A guard that answers true too often silences the whole feature.
    expect(isPromptEnhancementComposerOwnLineV1('- Capture the current output of the login page.')).toBe(false);
    expect(isPromptEnhancementComposerOwnLineV1('- Integrate the Stripe API for card payments.')).toBe(false);
    expect(isPromptEnhancementComposerOwnLineV1('- Cover the checkout page with a regression test.')).toBe(false);
    expect(isPromptEnhancementComposerOwnLineV1('')).toBe(false);
  });
});
