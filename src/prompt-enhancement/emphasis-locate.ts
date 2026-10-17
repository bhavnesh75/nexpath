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
  NEVER_MARKED_SECTION_KINDS,
  type PromptEnhancementEmphasisCandidateV1,
  type PromptEnhancementEmphasisClassV1,
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
export function namedActionIn(sections: readonly { bodyText: string }[]): string | undefined {
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

/**
 * How the cap ranks the classes.
 *
 * The class numbers are the standard's priority order and that order is kept — with ONE exception,
 * added 2026-09-27 and measured before it was written: **the safety line is spent first.**
 *
 * ⚠️ The exception exists because the cap began to bind. Class 5 is the sentence the PIPELINE
 * inserted because it judged this prompt needed one, there is at most one per body, and under the
 * plain class order it was the first mark dropped — measured, a body at the 12-mark cap lost its
 * safety line to a noun. Everything else keeps its relative order exactly: 1 ▸ 2 ▸ 3 ▸ 4.
 *
 * Measured on the held-out capture, the whole cost of this is **one condition**: total marks are
 * unchanged at 103, class 4 goes 29 → 28, and class 5 goes 0 → 1.
 */
const CAP_RANK_BY_CLASS_V1: Readonly<Record<PromptEnhancementEmphasisClassV1, number>> = {
  5: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
};

/** The order the cap spends in: class first, then writes before reads, then what comes first. */
function byPriority(left: LocatedPhrase, right: LocatedPhrase): number {
  if (left.candidate.emphasisClass !== right.candidate.emphasisClass) {
    return CAP_RANK_BY_CLASS_V1[left.candidate.emphasisClass] - CAP_RANK_BY_CLASS_V1[right.candidate.emphasisClass];
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
    const start = phrase.at;
    const end = phrase.at + phrase.text.length;
    /**
     * A same-class span already kept that this one CONTAINS.
     *
     * ⚠️ The fuller reading has to win regardless of arrival order, and it cannot be left to that
     * order. The term sources are five, merged in a fixed sequence, and only the last of them
     * generates longest-first — so a short term from an earlier source arrives before the long one
     * that contains it, and "keep the first" would then keep the fragment. Measured: `null error`
     * standing while `null error after login` was dropped.
     */
    const shorterSameClass = kept.findIndex((other) => other.sectionIndex === phrase.sectionIndex
      && other.candidate.emphasisClass === phrase.candidate.emphasisClass
      && start <= other.at && end >= other.at + other.text.length
      && !(start === other.at && end === other.at + other.text.length));
    if (shorterSameClass >= 0) {
      kept.splice(shorterSameClass, 1, phrase);
      continue;
    }
    const clash = kept.some((other) => {
      if (other.sectionIndex !== phrase.sectionIndex) return false;
      const otherStart = other.at;
      const otherEnd = other.at + other.text.length;
      // Disjoint: two marks on two pieces of text, which is the ordinary case.
      if (otherEnd <= start || end <= otherStart) return false;
      // ⚠️ **Identical first.** This is the case the function was written for, and the nested test
      // below swallows it — an identical span contains itself both ways round — so checking nested
      // first let `only` be marked twice, once as a boundary and once as the developer's term. A test
      // that had passed since the first version of this file caught it.
      if (otherStart === start && otherEnd === end) return true;
      // Nested, either way round.
      const nested = (otherStart <= start && otherEnd >= end) || (start <= otherStart && end >= otherEnd);
      if (nested) {
        // ⚠️ **The reason above is about two DIFFERENT classes.** `auth` inside `Do not modify the auth
        // middleware` is the developer's word AND a boundary, and the worked example shows both. Two
        // marks of the SAME class, one inside the other, are not that: they are one stretch of text
        // charged to the budget twice.
        //
        // Measured across the recorded bodies and the reported popups: 4 such pairs, every one class 2,
        // against 1 cross-class pair. H1 was spending THREE of its four marks on one stretch —
        // `null error after login`, `null error`, `after login` — which is why it was the densest body
        // in the corpus.
        //
        // Reached only when the span already kept is the LONGER one — the other direction is handled
        // above, by replacing the shorter with the fuller reading. So the answer here is simply: a
        // second mark of the same class inside one already drawn earns nothing.
        return other.candidate.emphasisClass === phrase.candidate.emphasisClass;
      }
      // ⛔ **Partial**: they intersect and neither contains the other, so between them they cover one
      // stretch of text with a seam in the middle. Measured on a reported popup, `account if the email`
      // [123,143) and `email matches` [138,151) drew the words `email` twice and read as a single
      // ragged blob from 123 to 151 — which is the one thing a mark must never be.
      //
      // The list arrives in priority order, so the one already kept is the one that earned it. Nothing
      // is lost that the standard asks for: no rule anywhere produces a pair like this deliberately,
      // and the same span was already being collapsed when the two happened to match exactly.
      return true;
    });
    if (!clash) kept.push(phrase);
  }
  return kept;
}

/**
 * Spend the budget: four marks in one section, twelve across the body, in the order given.
 *
 * ⏪ Spending it in ROUNDS — every section offered its next-best before any section's next — was
 * tried on 2026-09-27 and withdrawn the same day. It fails the guard above: the safety line is
 * spent first BECAUSE the order is the caller's, and rounds put a later section's condition ahead of
 * it. Measured on the recorded bodies the two were identical anyway; it only differed where the
 * budget binds, and there it traded a guard for a fuller last section.
 *
 * Exported because the optional model pass is capped by **this** rule and not by a copy of it —
 * its phrases are appended after the floor's and run through the same loop, so the floor can never
 * be displaced by the model and the two can never drift apart. The caller orders the list; this
 * only counts.
 */
/**
 * The most of one section that may be drawn heavy, as a percentage of that section's own characters.
 *
 * The two caps above count MARKS; this one measures how much of the reader's paragraph is bold, which
 * is the thing that actually decides whether emphasis still reads as emphasis. A section with four
 * short marks is fine; a section with two marks that between them cover half of it is not.
 *
 * ⛔ **A word ceiling is not this rule and was measured to be the wrong instrument.** At eight words
 * it moved no density at all; at six it dropped `design the layout of the cart drawer`, an
 * instruction a real popup was missing. Length is not the complaint — share is.
 *
 * Set to 50 by the owner, 2026-09-28. At that value it refuses 2 marks across the 35 recorded bodies
 * and leaves 3 sections of 73 in the 41–50 % band: a guard against the pathological body rather than
 * a shaper of ordinary ones.
 */
export const PROMPT_ENHANCEMENT_EMPHASIS_MAX_SECTION_SHARE_PERCENT_V1 = 50 as const;

/**
 * The shortest section the share ceiling applies to, in characters.
 *
 * ⚠️ **A share is the right instrument for a paragraph and the wrong one for a line.**
 * `Limit applies to POST /api/upload only.` is 74 characters; marking `POST /api/upload` and `only`
 * inside it is 27 % of the section and is precisely what the standard asks for. Applied flat, the
 * ceiling refused the standard's own worked example — nine tests failed at once and were right to.
 *
 * Below this, a section is a line and the mark COUNT caps already govern it: four per section, and a
 * short line cannot hold four marks unless they are tiny. Above it, share is what decides whether a
 * paragraph still reads as prose with marks in it rather than as a wall.
 *
 * 160 is about two popup lines. Measured: at 160 the worked example is untouched and the recorded
 * bodies are identical to a flat ceiling; at 200 paragraphs start getting through again.
 */
export const PROMPT_ENHANCEMENT_EMPHASIS_SHARE_APPLIES_OVER_CHARS_V1 = 160 as const;

export function applyPromptEnhancementEmphasisCapV1<T extends { sectionIndex: number }>(
  ordered: readonly T[],
  /**
   * How much of each section is already text, and how long a given mark is — supplied only by callers
   * that can answer both. Omitted, the share ceiling simply does not apply, which is what the model
   * tier's caller needs: it ranks phrase handles that carry no text of their own.
   */
  share?: {
    readonly sectionLengths: readonly number[];
    readonly markLength: (phrase: T) => number;
  },
): T[] {
  const perSection = new Map<number, number>();
  const perSectionChars = new Map<number, number>();
  const kept: T[] = [];
  for (const phrase of ordered) {
    if (kept.length >= PROMPT_ENHANCEMENT_EMPHASIS_CAP_PER_BODY_V1) break;
    const used = perSection.get(phrase.sectionIndex) ?? 0;
    if (used >= PROMPT_ENHANCEMENT_EMPHASIS_CAP_PER_SECTION_V1) continue;

    // …and the section may not go over its share. Tested in the SAME walk as the count, so a mark
    // refused here does not spend a count the next mark could have used, and the priority order
    // decides what survives: the safety line first, then the instruction, then the developer's own
    // term. When a section fills up, what it keeps is what the reader most needs to see.
    if (share !== undefined) {
      const sectionLength = share.sectionLengths[phrase.sectionIndex] ?? 0;
      if (sectionLength > PROMPT_ENHANCEMENT_EMPHASIS_SHARE_APPLIES_OVER_CHARS_V1) {
        const drawn = perSectionChars.get(phrase.sectionIndex) ?? 0;
        const after = drawn + share.markLength(phrase);
        if ((after / sectionLength) * 100 > PROMPT_ENHANCEMENT_EMPHASIS_MAX_SECTION_SHARE_PERCENT_V1) continue;
        perSectionChars.set(phrase.sectionIndex, after);
      }
    }

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

  // Locate: the first occurrence in the first section that holds it AND can draw it. A phrase the
  // composer paraphrased away is simply dropped — emphasis never causes a rewrite.
  //
  // ⚠️ A phrase charged to a section that cannot show a mark is a mark the reader never gets, paid
  // for out of a budget whose effect they CAN see. The verbatim section holds the developer's whole
  // prompt, so it holds nearly every term taken from it — and measured on a real popup, 6 of 9
  // candidates landed there, spent its four-mark budget, and left every later section with none.
  //
  // What fixes that is the section each candidate carries, a few lines below. The
  // `NEVER_MARKED_SECTION_KINDS` skip beside it is a SECOND guard and nothing more: the classifier
  // never reads those sections either (`emphasis-classes.ts`), so every candidate already carries a
  // section that can draw it. Removing the skip and re-running all 35 recorded bodies gives output
  // identical mark for mark — so no input reaches it, and no test here can. It stays because
  // neither this file nor the reader's budget should depend on that other skip remaining in place.
  const located: LocatedPhrase[] = [];
  for (const candidate of candidates) {
    // The section the candidate was READ from comes first: a term read in section 5 belongs to
    // section 5, even where section 2 happens to contain the same words. Without this, every
    // candidate naming the same thing is placed in the earliest section that holds it, the
    // duplicate-span collapse keeps one, and the section that asked for it is left blank.
    const own = candidate.sectionIndex;
    const order = own === undefined
      ? [...input.sections.keys()]
      : [own, ...[...input.sections.keys()].filter((index) => index !== own)];
    for (const sectionIndex of order) {
      const section = input.sections[sectionIndex];
      if (section === undefined) continue;
      if (NEVER_MARKED_SECTION_KINDS.has(section.sectionKind)) continue;
      const found = firstOccurrence(section.bodyText, candidate.text);
      if (found === undefined) continue;
      located.push({ candidate, sectionIndex, at: found.at, text: found.text });
      break;
    }
  }

  // Cap: priority order, overlaps collapsed, then four per section and twelve in all.
  const ordered = withoutDuplicateSpans([...located].sort(byPriority));
  const kept = applyPromptEnhancementEmphasisCapV1(ordered, {
    sectionLengths: input.sections.map((section) => section.bodyText.length),
    markLength: (phrase) => phrase.text.length,
  });

  return kept.map((phrase) => ({
    text: phrase.text,
    emphasisClass: phrase.candidate.emphasisClass,
    // Everything this pass produces is local, with no call behind it.
    source: 'floor' as const,
    // 🔑 The section this phrase was CHARGED to, carried so the surfaces place it where the cap
    // counted it. Without it they search the whole body and can land the mark in another section
    // entirely — see {@link PromptEnhancementEmphasisPhraseV1.sectionIndex}.
    sectionIndex: phrase.sectionIndex,
  }));
}
