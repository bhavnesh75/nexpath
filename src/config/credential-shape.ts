/**
 * Credential SHAPES — the two formats nexpath accepts, and the three questions
 * worth asking about a credential string.
 *
 * ── WHY THIS IS A LEAF MODULE (no imports, and it must stay that way) ────────
 * `ApiKeyResolver.ts` reaches `cross-keychain` + `node:fs`, and
 * `NexpathTokenStore.ts` reaches the same. Neither can exist in a browser
 * bundle, so the extension build had to remap the whole resolver to a stub that
 * carried a hand-copied duplicate of the OpenAI-key regex, kept honest only by a
 * differential test. A module with zero imports bundles anywhere, so the shape
 * rules can be shared instead of copied.
 *
 * ── THE THREE QUESTIONS ARE NOT THE SAME QUESTION ────────────────────────────
 *   isValidApiKey        — "is this an OpenAI API key?"
 *   isValidNexpathToken  — "is this a Nexpath token?"
 *   isUsableLlmCredential— "can we make an LLM call with this at all?"
 *
 * ⛔ The first two must never accept each other's format, in either direction:
 * the two credentials are stored, resolved and rotated separately, and a
 * validator that confused them would let one be written into the other's slot.
 *
 * ⚠️ The third is a DIFFERENT question and deliberately answers yes to both. A
 * gate asking "do we have something to call with?" must use it — asking
 * `isValidApiKey` there silently answers "no" for a perfectly good Nexpath
 * token, which reads as "no credential configured" to every caller downstream.
 */

/**
 * OpenAI API key shape. ⚠️ The literal is load-bearing: the browser build's stub
 * is compared against this one character-for-character by a differential test,
 * so `.source` must not change without that test being considered.
 */
export const OPENAI_KEY_REGEX = /^sk-[A-Za-z0-9_-]{20,}$/;

/** Nexpath token prefix. */
export const TOKEN_PREFIX = 'npk_';

/**
 * Minimum total length of a Nexpath token: the prefix plus the service's body.
 *
 * ⚠️ 24 = `npk_` + 20, which is **deliberately the browser extension's rule**
 * (`ext-browser/adapters/llm-credentials.ts`'s `/^npk_[A-Za-z0-9_-]{20,}$/`),
 * not a stricter one of this surface's own. A CLI that demanded more would
 * reject a token the browser extension accepts and the service issued — the
 * same credential working on one surface and failing on another, with the CLI
 * calling the service's own token malformed. The two surfaces answer to the
 * issuer, so they must answer identically.
 */
export const TOKEN_MIN_LENGTH = 24;

/**
 * Nexpath token shape, BUILT from the two constants above rather than written
 * out, so the length in the pattern can never drift from `TOKEN_MIN_LENGTH`.
 *
 * The character class also rejects whitespace and anything outside the url-safe
 * alphabet the service issues, which a prefix-and-length check alone did not.
 */
export const NEXPATH_TOKEN_REGEX = new RegExp(
  `^${TOKEN_PREFIX}[A-Za-z0-9_-]{${TOKEN_MIN_LENGTH - TOKEN_PREFIX.length},}$`,
);

/** True only for an OpenAI API key. Never true for a Nexpath token. */
export function isValidApiKey(key: string): boolean {
  return OPENAI_KEY_REGEX.test(key);
}

/** True only for a Nexpath token. Never true for an OpenAI API key. */
export function isValidNexpathToken(value: string): boolean {
  return typeof value === 'string' && NEXPATH_TOKEN_REGEX.test(value);
}

/**
 * True when the string is a credential an LLM call can actually be made with —
 * either format. This is the predicate for "is a call possible", never for
 * "which credential is this"; use the two specific validators for that.
 */
export function isUsableLlmCredential(value: string): boolean {
  return isValidApiKey(value) || isValidNexpathToken(value);
}
