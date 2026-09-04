import { SLOT_OBLIGATION_DIRECTIVES_V1 } from './section-obligation-directives.js';
import { derivePromptEnhancementSectionKindInventoryV1 } from './section-kind-inventory.js';
import { FACT_LINE_WORDING_VOCABULARIES_V1 } from './fact-line-wording.js';

/**
 * The internal-vocabulary leak detector — the defense behind the wording work.
 *
 * The composer prompt and the deterministic renderer used to hand the engine's own identifiers
 * to the user ("provide the safety hook linkage", "purpose: problem_statement"). The wording
 * changes closed those channels at the source; this detector is the guarantee that a raw
 * identifier can never reach a sent body again, whatever produces it.
 *
 * Two rules bind it, and both were measured rather than assumed:
 *
 *   1. RAW IDENTIFIERS ONLY. A de-underscored phrase is never a violation — "context and
 *      constraints" is ordinary English (ten hits across the real corpus), and this validator
 *      blocks the whole popup. Matching phrases would have destroyed legitimate bodies;
 *      matching raw identifiers blocks none of the 78 corpus bodies.
 *   2. THE PROMPT ALLOWANCE. A developer may legitimately write an identifier — "rename my
 *      problem_statement variable" — and the body then rightly echoes it. An identifier present
 *      in the user's own prompt (or in a section's allowed source facts) is never a violation.
 *      This reuses the allowed-texts discipline the invention gate already applies: one notion
 *      of "allowed", never a second.
 *
 * The vocabulary is DERIVED from the same producers the engine emits from — the obligation
 * directive map's keys, the shared section-kind inventory, and the fact-line label vocabularies
 * — so it can never drift from what the engine can actually leak.
 */

/** Only multi-word snake_case counts: a bare word is English, not an identifier. */
function isSnakeCaseIdentifier(value: string): boolean {
  return /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(value);
}

function deriveVocabulary(): readonly string[] {
  const values = new Set<string>();
  for (const obligation of Object.keys(SLOT_OBLIGATION_DIRECTIVES_V1)) values.add(obligation);
  for (const kind of derivePromptEnhancementSectionKindInventoryV1()) values.add(kind);
  for (const vocabulary of Object.values(FACT_LINE_WORDING_VOCABULARIES_V1)) {
    for (const value of vocabulary) values.add(value);
  }
  return [...values].filter(isSnakeCaseIdentifier).sort();
}

const escapeForRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The vocabulary and its matchers are built ON FIRST USE, never at module load.
 *
 * The derivation reads the routing presets, and the routing layer imports the validator, so a
 * load-time computation is at the mercy of module initialisation order — a cycle anywhere in that
 * graph makes the presets read as uninitialised and the whole build fail. Deriving lazily removes
 * the ordering question rather than depending on it staying favourable.
 */
let cachedVocabulary: readonly string[] | undefined;
let cachedMatchers: readonly { value: string; pattern: RegExp }[] | undefined;

function vocabulary(): readonly string[] {
  cachedVocabulary ??= deriveVocabulary();
  return cachedVocabulary;
}

function matchers(): readonly { value: string; pattern: RegExp }[] {
  cachedMatchers ??= vocabulary().map((value) => ({
    value,
    pattern: new RegExp(`(?<![a-z0-9_])${escapeForRegex(value)}(?![a-z0-9_])`, 'i'),
  }));
  return cachedMatchers;
}

/** The derived vocabulary, exposed for tests and the corpus replay. */
export function promptEnhancementInternalVocabularyV1(): readonly string[] {
  return vocabulary();
}

/**
 * Every internal identifier the text renders that nothing allowed — the detector's answer.
 *
 * `allowedTexts` carries the user's original prompt and the section's allowed source facts, the
 * same inputs the invention gate treats as allowed.
 */
export function findPromptEnhancementInternalVocabularyLeaksV1(input: {
  readonly text: string;
  readonly allowedTexts: readonly string[];
}): readonly string[] {
  if (input.text.length === 0) return [];
  const allowedLower = input.allowedTexts.join('\n').toLowerCase();
  return matchers()
    .filter(({ value, pattern }) => pattern.test(input.text) && !allowedLower.includes(value))
    .map(({ value }) => value);
}
