/**
 * Where the user's own load-bearing wording comes from.
 *
 * The popup marks the words a body borrowed from the developer — a path they typed, a tool they
 * named, a fact the project supplied. This module answers only "which words are those", from the
 * sources that already exist: nothing here scans for new kinds of thing, and nothing here decides
 * where a word sits or whether it survives the cap.
 *
 * ⛔ The corpus is the invention gate's own allowed texts **minus the two id lists** — the prompt
 * and the section's grounded values. Identifiers are how the pipeline refers to evidence, not words
 * the developer wrote, and marking one would put a mark on plumbing.
 *
 * Pure: every input is passed in, nothing is read from the store or the environment.
 */
import { filterFloorExtractForConsumersV1 } from './preservation-floors.js';
import { findKnownToolNamesInTextV1 } from './known-tool-names.js';

/** What one section offers the user-term sources. */
export interface PromptEnhancementEmphasisSourceInputV1 {
  /** The developer's own prompt, verbatim — the first half of the corpus. */
  originalPromptText: string;
  /** The section's rendered text, which is where a phrase has to appear to be worth marking. */
  sectionText: string;
  /** Values a boundary resolved for this section — the second half of the corpus. */
  groundedFactValues?: readonly string[];
  /** Evidence identifiers. Never marked; carried only so a phrase that equals one can be dropped. */
  sourceFactIds?: readonly string[];
  /** The same, for the section's source ids. */
  sourceIds?: readonly string[];
}

/**
 * The corpus a user term may come from: the gate's allowed texts, minus the identifiers.
 *
 * Kept as its own function because the *definition* is what must not drift from the gate's — a
 * phrase is the developer's only if it is in one of these two places.
 */
export function buildPromptEnhancementEmphasisCorpusV1(
  input: Pick<PromptEnhancementEmphasisSourceInputV1, 'originalPromptText' | 'groundedFactValues'>,
): readonly string[] {
  return [input.originalPromptText, ...(input.groundedFactValues ?? [])].filter((text) => text.trim().length > 0);
}

/**
 * The value half of an expectation line, without the framing that surrounds it.
 *
 * The line reads `<key> appears to be <value> (recency) — confirm before relying on it.` Only the
 * value is the developer's; the rest is the pipeline hedging about it, and marking the hedge would
 * emphasise nexpath's own caution rather than their words. A value rendered in quotes is taken
 * without them: the quotation marks are punctuation the renderer added, not part of what was said.
 */
export function extractPromptEnhancementExpectationValuesV1(sectionText: string): readonly string[] {
  const values: string[] = [];
  const pattern = /appears to be ([\s\S]+?)(?: \([^)]*\))* — confirm before relying on it\./g;
  for (const match of sectionText.matchAll(pattern)) {
    const raw = (match[1] ?? '').trim();
    const unquoted = /^"([\s\S]+)"$/.exec(raw);
    const value = (unquoted?.[1] ?? raw).trim();
    if (value.length > 0) values.push(value);
  }
  return values;
}

/** Case-insensitive membership, so a phrase is not marked twice for differing in casing alone. */
const has = (haystack: readonly string[], needle: string): boolean =>
  haystack.some((entry) => entry.toLowerCase() === needle.toLowerCase());

/**
 * Every phrase in this section that is the developer's own wording.
 *
 * Four sources, each already shipped and each answering a different question: the item floors say
 * what the developer named, the curated list says which of those are known tools, the expectation
 * line says what they told us earlier, and the grounded values say what the project supplied. A
 * phrase has to appear in the section to be returned — a term the developer used and the body
 * dropped has nothing to mark.
 */
export function collectPromptEnhancementEmphasisUserTermsV1(
  input: PromptEnhancementEmphasisSourceInputV1,
): readonly string[] {
  const identifiers = [...(input.sourceFactIds ?? []), ...(input.sourceIds ?? [])];
  const sectionLower = input.sectionText.toLowerCase();
  const found: string[] = [];

  const offer = (phrase: string): void => {
    const value = phrase.trim();
    if (value.length === 0) return;
    // Never an identifier: those name evidence, they are not words anyone wrote (A14).
    if (has(identifiers, value)) return;
    // It has to be on screen to be worth marking.
    if (!sectionLower.includes(value.toLowerCase())) return;
    if (has(found, value)) return;
    found.push(value);
  };

  // 1. The item-shaped floors, read off the developer's own prompt — through the shared consumer
  //    filter, which is the same one the invention gate uses, so the two cannot drift.
  for (const item of filterFloorExtractForConsumersV1(input.originalPromptText)) offer(item);

  // 2. The curated tool names the prompt mentions — coverage the shape patterns cannot give.
  for (const name of findKnownToolNamesInTextV1(input.originalPromptText)) offer(name);

  // 3. What the developer told us earlier, as the expectation line renders it.
  for (const value of extractPromptEnhancementExpectationValuesV1(input.sectionText)) offer(value);

  // 4. What the project supplied for this section.
  for (const value of input.groundedFactValues ?? []) offer(value);

  return found;
}
