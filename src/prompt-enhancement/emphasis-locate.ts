/**
 * Finding the phrases in the body, and deciding how many survive.
 *
 * The classifier says which phrases have earned a mark. This says which of them are actually in
 * the text that will be shown, and then spends a budget: **four marks per section, twelve per
 * body**. A budget is the whole point — a body where most of the text is bold has emphasised
 * nothing, and the numbers are a constant here rather than a judgement, so the measurement phase
 * can move them with evidence instead of argument.
 *
 * ⛔ **Positions are not kept.** The user edits the body, so an offset goes stale on the first
 * keystroke; the popup re-finds each phrase on the live buffer at render. What survives here is
 * the phrase, its class, and where it came from.
 *
 * Pure: every input is passed in, and nothing here reads the body it is given except to search it.
 */
import {
  classifyPromptEnhancementEmphasisCandidatesV1,
  type PromptEnhancementEmphasisCandidateV1,
} from './emphasis-classes.js';
import type { PromptEnhancementEmphasisPhraseV1 } from '../store/pending-prompt-enhancements.js';

/** Four marks in one section; a fifth would be decoration rather than emphasis. */
export const PROMPT_ENHANCEMENT_EMPHASIS_CAP_PER_SECTION_V1 = 4 as const;
/** Twelve across the whole body, however the sections divide them. */
export const PROMPT_ENHANCEMENT_EMPHASIS_CAP_PER_BODY_V1 = 12 as const;

/** One composed section, as the body carries it at submit. */
export interface PromptEnhancementEmphasisBodySectionV1 {
  sectionKind: string;
  bodyText: string;
  groundedFactValues?: readonly string[];
  sourceFactIds?: readonly string[];
  sourceIds?: readonly string[];
  clearanceVerdict?: string;
}

export interface PromptEnhancementEmphasisBodyInputV1 {
  originalPromptText: string;
  sections: readonly PromptEnhancementEmphasisBodySectionV1[];
  /**
   * The language the body was written in, when it is known. Class 1's grammar is English, so a
   * body known to be in another language marks classes 2–5 only.
   */
  detectedLanguage?: string;
}

/** A located phrase, before the cap has spent anything. */
interface LocatedPhrase {
  candidate: PromptEnhancementEmphasisCandidateV1;
  /** Which section it was found in — the cap is per section. */
  sectionIndex: number;
  /** Where in that section, so ties break by what the reader meets first. */
  at: number;
  /** The body's own casing, which is what the reader will see. */
  text: string;
}

/**
 * The action named inside the confirmation sentence, read off the body that carries it.
 *
 * ⚠️ Read rather than re-derived on purpose. The name is resolved once when the sentence is built,
 * from a typed verdict the result does not carry — so a second derivation here would differ the
 * moment a verdict resolved a label the keyword rule would not, silently and per call. The body
 * already holds the answer.
 */
function namedActionIn(sections: readonly PromptEnhancementEmphasisBodySectionV1[]): string | undefined {
  for (const section of sections) {
    const match = /before you do this ([\s\S]+?) you must ask me for go-ahead confirmation/.exec(section.bodyText);
    const named = match?.[1]?.trim();
    if (named !== undefined && named.length > 0) return named;
  }
  return undefined;
}

/**
 * Where a phrase first appears in a text, matched the way the floors match: case-insensitively,
 * as a plain substring. Returns the body's own casing, not the phrase's — the phrase came from the
 * prompt, and the body may have re-cased it.
 */
function firstOccurrence(text: string, phrase: string): { at: number; text: string } | undefined {
  const at = text.toLowerCase().indexOf(phrase.toLowerCase());
  if (at < 0) return undefined;
  return { at, text: text.slice(at, at + phrase.length) };
}

/** The order the cap spends in: class first, then writes before reads, then what comes first. */
function byPriority(left: LocatedPhrase, right: LocatedPhrase): number {
  if (left.candidate.emphasisClass !== right.candidate.emphasisClass) {
    return left.candidate.emphasisClass - right.candidate.emphasisClass;
  }
  if (left.candidate.emphasisClass === 1) {
    const write = (phrase: LocatedPhrase): number => (phrase.candidate.isWriteVerb === true ? 0 : 1);
    if (write(left) !== write(right)) return write(left) - write(right);
  }
  if (left.sectionIndex !== right.sectionIndex) return left.sectionIndex - right.sectionIndex;
  return left.at - right.at;
}

/**
 * Collapse one span claimed by two classes down to the louder of them.
 *
 * ⚠️ **The same span, not a nested one.** A term inside a clause is two marks the standard asks
 * for — *auth* inside *Do not modify the auth middleware* is both the developer's word and a
 * boundary, and the worked example shows both. What must not happen is one span counted twice,
 * spending two of the four on a single piece of text. Dropping nested spans instead would silently
 * lose a range the standard requires, which is what a first draft of this did.
 *
 * The list arrives in priority order, so the class that survives is the one that earned it.
 */
function withoutDuplicateSpans(phrases: readonly LocatedPhrase[]): LocatedPhrase[] {
  const kept: LocatedPhrase[] = [];
  for (const phrase of phrases) {
    const duplicate = kept.some((other) => other.sectionIndex === phrase.sectionIndex
      && other.at === phrase.at && other.text.length === phrase.text.length);
    if (!duplicate) kept.push(phrase);
  }
  return kept;
}

/**
 * Spend the budget: four marks in one section, twelve across the body, in the order given.
 *
 * Exported because the optional model pass is capped by **this** rule and not by a copy of it —
 * its phrases are appended after the floor's and run through the same loop, so the floor can never
 * be displaced by the model and the two can never drift apart. The caller orders the list; this
 * only counts.
 */
export function applyPromptEnhancementEmphasisCapV1<T extends { sectionIndex: number }>(
  ordered: readonly T[],
): T[] {
  const perSection = new Map<number, number>();
  const kept: T[] = [];
  for (const phrase of ordered) {
    if (kept.length >= PROMPT_ENHANCEMENT_EMPHASIS_CAP_PER_BODY_V1) break;
    const used = perSection.get(phrase.sectionIndex) ?? 0;
    if (used >= PROMPT_ENHANCEMENT_EMPHASIS_CAP_PER_SECTION_V1) continue;
    perSection.set(phrase.sectionIndex, used + 1);
    kept.push(phrase);
  }
  return kept;
}

/**
 * The phrases this body will carry: classified, found in the text, and capped.
 *
 * An empty result is a real answer — it says the pass ran and nothing qualified, which is not the
 * same as the pass never running, and the column keeps those apart.
 */
export function buildPromptEnhancementEmphasisPhrasesV1(
  input: PromptEnhancementEmphasisBodyInputV1,
): readonly PromptEnhancementEmphasisPhraseV1[] {
  const named = namedActionIn(input.sections);
  const candidates = classifyPromptEnhancementEmphasisCandidatesV1({
    originalPromptText: input.originalPromptText,
    sections: input.sections.map((section) => ({
      sectionKind: section.sectionKind,
      sectionText: section.bodyText,
      ...(section.groundedFactValues ? { groundedFactValues: section.groundedFactValues } : {}),
      ...(section.sourceFactIds ? { sourceFactIds: section.sourceFactIds } : {}),
      ...(section.sourceIds ? { sourceIds: section.sourceIds } : {}),
      ...(section.clearanceVerdict ? { clearanceVerdict: section.clearanceVerdict } : {}),
    })),
    ...(input.detectedLanguage ? { detectedLanguageSelfReport: input.detectedLanguage } : {}),
    ...(named ? { sensitiveActionName: named } : {}),
  });

  // Locate: the first occurrence in the first section that holds it. A phrase the composer
  // paraphrased away is simply dropped — emphasis never causes a rewrite.
  const located: LocatedPhrase[] = [];
  for (const candidate of candidates) {
    for (const [sectionIndex, section] of input.sections.entries()) {
      const found = firstOccurrence(section.bodyText, candidate.text);
      if (found === undefined) continue;
      located.push({ candidate, sectionIndex, at: found.at, text: found.text });
      break;
    }
  }

  // Cap: priority order, overlaps collapsed, then four per section and twelve in all.
  const ordered = withoutDuplicateSpans([...located].sort(byPriority));
  const kept = applyPromptEnhancementEmphasisCapV1(ordered);

  return kept.map((phrase) => ({
    text: phrase.text,
    emphasisClass: phrase.candidate.emphasisClass,
    // Everything this pass produces is local, with no call behind it.
    source: 'floor' as const,
  }));
}
