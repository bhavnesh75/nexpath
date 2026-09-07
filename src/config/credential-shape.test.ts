import { describe, it, expect } from 'vitest';
import {
  OPENAI_KEY_REGEX,
  NEXPATH_TOKEN_REGEX,
  TOKEN_PREFIX,
  TOKEN_MIN_LENGTH,
  isValidApiKey,
  isValidNexpathToken,
  isUsableLlmCredential,
} from './credential-shape.js';

const VALID_KEY   = 'sk-abcdefghij1234567890ABCDEFGHIJ';
const VALID_TOKEN = TOKEN_PREFIX + 'a'.repeat(TOKEN_MIN_LENGTH - TOKEN_PREFIX.length);

describe('credential-shape — the module must stay a leaf', () => {
  // The whole reason this module exists is that it can be bundled into a browser
  // build. One `import` of anything reaching node: or a native module puts the
  // duplicate-regex stub back.
  it('has no imports at all', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('./credential-shape.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\s*\(/);
  });
});

describe('OPENAI_KEY_REGEX', () => {
  // Pinned by value: the browser build ships a stub compared against this one
  // character-for-character, so a change here without a change there is a
  // silent divergence rather than a failure.
  it('is the exact pattern the browser stub is compared against', () => {
    expect(OPENAI_KEY_REGEX.source).toBe('^sk-[A-Za-z0-9_-]{20,}$');
    expect(OPENAI_KEY_REGEX.flags).toBe('');
  });
});

describe('NEXPATH_TOKEN_REGEX', () => {
  it('is derived from the constants, so the length can never drift from the pattern', () => {
    const body = TOKEN_MIN_LENGTH - TOKEN_PREFIX.length;
    expect(NEXPATH_TOKEN_REGEX.source).toBe(`^${TOKEN_PREFIX}[A-Za-z0-9_-]{${body},}$`);
  });

  // A `g` flag would make `.test()` stateful via lastIndex, so the same input
  // would alternate true/false across calls.
  it('carries no flags', () => {
    expect(NEXPATH_TOKEN_REGEX.flags).toBe('');
  });
});

describe('isValidApiKey', () => {
  it('accepts an OpenAI key', () => {
    expect(isValidApiKey(VALID_KEY)).toBe(true);
  });

  it('rejects a Nexpath token — the two formats are never interchangeable', () => {
    expect(isValidApiKey(VALID_TOKEN)).toBe(false);
  });

  it('rejects a short sk- value and an empty string', () => {
    expect(isValidApiKey('sk-short')).toBe(false);
    expect(isValidApiKey('')).toBe(false);
  });
});

describe('isValidNexpathToken', () => {
  it('accepts a token at exactly the minimum length', () => {
    expect(VALID_TOKEN.length).toBe(TOKEN_MIN_LENGTH);
    expect(isValidNexpathToken(VALID_TOKEN)).toBe(true);
  });

  it('rejects an OpenAI key — the other direction of the same rule', () => {
    expect(isValidNexpathToken(VALID_KEY)).toBe(false);
  });

  it('the length boundary is exactly TOKEN_MIN_LENGTH', () => {
    const oneUnder = TOKEN_PREFIX + 'a'.repeat(TOKEN_MIN_LENGTH - TOKEN_PREFIX.length - 1);
    expect(oneUnder.length).toBe(TOKEN_MIN_LENGTH - 1);
    expect(isValidNexpathToken(oneUnder)).toBe(false);
  });

  it('rejects an unprefixed value even when long enough', () => {
    expect(isValidNexpathToken('a'.repeat(TOKEN_MIN_LENGTH))).toBe(false);
  });

  it('rejects whitespace anywhere in the value', () => {
    const spaced = TOKEN_PREFIX + 'a'.repeat(20) + ' ' + 'a'.repeat(20);
    expect(spaced.length).toBeGreaterThan(TOKEN_MIN_LENGTH);
    expect(isValidNexpathToken(spaced)).toBe(false);
  });

  // The character class is what a prefix-and-length check alone did not give.
  it('rejects a character outside the url-safe alphabet the service issues', () => {
    const bad = TOKEN_PREFIX + 'a'.repeat(TOKEN_MIN_LENGTH - TOKEN_PREFIX.length - 1) + '!';
    expect(bad.length).toBe(TOKEN_MIN_LENGTH);
    expect(isValidNexpathToken(bad)).toBe(false);
  });

  it('accepts the full url-safe alphabet, including - and _', () => {
    const mixed = TOKEN_PREFIX + '-7zI1d-H_obJzkBkWgzA97lEWGUR_BUvMXFrz2AzgJk';
    expect(mixed.length).toBeGreaterThanOrEqual(TOKEN_MIN_LENGTH);
    expect(isValidNexpathToken(mixed)).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidNexpathToken('')).toBe(false);
  });
});

describe('isUsableLlmCredential — the "can we call at all" question', () => {
  it('accepts an OpenAI key', () => {
    expect(isUsableLlmCredential(VALID_KEY)).toBe(true);
  });

  // The point of the predicate: a gate asking "do we have something to call
  // with" must not answer no for a perfectly good Nexpath token.
  it('accepts a Nexpath token', () => {
    expect(isUsableLlmCredential(VALID_TOKEN)).toBe(true);
  });

  it('rejects anything that is neither format', () => {
    expect(isUsableLlmCredential('')).toBe(false);
    expect(isUsableLlmCredential('sk-short')).toBe(false);
    expect(isUsableLlmCredential('npk_short')).toBe(false);
    expect(isUsableLlmCredential('not-a-credential-at-all-0000000000000000')).toBe(false);
  });

  it('is exactly the OR of the two specific validators, for every case above', () => {
    for (const value of ['', VALID_KEY, VALID_TOKEN, 'sk-short', 'npk_short', 'x'.repeat(50)]) {
      expect(isUsableLlmCredential(value)).toBe(isValidApiKey(value) || isValidNexpathToken(value));
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The CLI and the browser extension answer to the SAME issuer, so they must
// accept the same set of strings. This used to be untrue: the CLI required a
// longer token than the extension, which meant a token the extension accepted
// and the service had issued could be refused at `nexpath install` as
// "malformed" — the credential working on one surface and failing on another,
// with the stricter surface calling the issuer wrong.
//
// ⚠️ The browser file is the reference and is NOT edited to satisfy this: it is
// imported and read as the source of truth, so the CLI is what moves if the two
// ever part company again.
// ─────────────────────────────────────────────────────────────────────────────
describe('the token rule is identical to the browser extension`s (no drift)', () => {
  it('accepts and rejects exactly what the extension does', async () => {
    const { isValidNexpathTokenShape } = await import('../ext-browser/adapters/llm-credentials.js');

    const cases = [
      '',
      'npk_',
      'npk_short',
      'npk_0123456789abcdefghij',                        // the extension's own minimum
      'npk_0123456789abcdefghi',                         // one under it
      'npk_-7zI1d-H_obJzkBkWgzA97lEWGUR_BUvMXFrz2AzgJk', // a full-length issued shape
      TOKEN_PREFIX + 'a'.repeat(100),
      TOKEN_PREFIX + 'a'.repeat(20) + '!',               // outside the url-safe class
      TOKEN_PREFIX + 'a'.repeat(10) + ' ' + 'a'.repeat(20),
      'sk-abcdefghij1234567890ABCDEFGHIJ',
      'NPK_0123456789abcdefghij',                        // wrong case in the prefix
    ];

    for (const value of cases) {
      expect(isValidNexpathToken(value), `disagreement on ${JSON.stringify(value)}`)
        .toBe(isValidNexpathTokenShape(value));
    }
  });

  it('the minimum body length is the extension`s 20, not a stricter number', () => {
    expect(TOKEN_MIN_LENGTH - TOKEN_PREFIX.length).toBe(20);
  });

  it('the check above can actually fail — a stricter rule is caught', () => {
    // Guards the guard: if the loop only ever compared values both rules agree
    // on, it would pass no matter what the CLI's cutoff became.
    const stricter = new RegExp(`^${TOKEN_PREFIX}[A-Za-z0-9_-]{36,}$`);
    const atExtensionMinimum = 'npk_0123456789abcdefghij';
    expect(isValidNexpathToken(atExtensionMinimum)).toBe(true);
    expect(stricter.test(atExtensionMinimum)).toBe(false);
  });
});
