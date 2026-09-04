/**
 * What the developer already told us about "done" and "proven" — read out of recent prompts.
 *
 * The measured defect: the two highest-volume sections in shipped bodies — what finished looks
 * like, and how the change will be verified — had never once received a fact. Eighty sections
 * across the corpus, nearly a third of everything shipped, written from plausibility because
 * plausibility was all the composer had. A section written that way LOOKS grounded, which is worse
 * than an empty one.
 *
 * These two detectors close the supply side for exactly those two sections, and they are
 * deliberately narrow: they return the developer's OWN words, quoted from their recent prompts, or
 * they return nothing. That is what makes the material worth putting in a body — it is traceable by
 * construction, and it comes from history the current-prompt composer cannot see. Nothing here
 * infers, summarises, or generalises: where certainty is not available, no fact is produced, and a
 * body with no fact keeps saying exactly what it says today.
 *
 * ⛔ FREE: string matching over prompts already in hand. No provider call, no miner change.
 */

/** The same window both existing history lanes read, so they cannot disagree about "recent". */
export const PROMPT_HISTORY_EXPECTATION_WINDOW_V1 = 5;

/** A phrase the developer wrote, with the prompt distance it came from (0 = most recent). */
export interface PromptHistoryExpectationV1 {
  /** The developer's own sentence, trimmed. Never a paraphrase. */
  readonly statedText: string;
  /** How many prompts back it was written; 0 is the latest prompt in the window. */
  readonly promptsAgo: number;
}

/** Bounds a quoted sentence so one runaway prompt cannot dominate a section. */
const MAX_STATED_CHARS = 180;
const MIN_STATED_CHARS = 12;

/**
 * The shapes a developer uses to say what DONE means. Each captures the developer's clause after
 * the marker — their words, not ours.
 */
const ACCEPTANCE_MARKERS: readonly RegExp[] = [
  /\b(?:it(?:'s| is) done when|done when|finished when|complete when)\b\s*(?<stated>[^.!?\n]{12,180})/i,
  /\b(?:should (?:be able to|end up|result in)|needs? to (?:end up|result in))\b\s*(?<stated>[^.!?\n]{12,180})/i,
  /\b(?:acceptance criteria|definition of done)\b\s*(?:is|are|:)?\s*(?<stated>[^.!?\n]{12,180})/i,
  /\b(?:the goal is|success (?:is|means)|i want it to)\b\s*(?<stated>[^.!?\n]{12,180})/i,
];

/**
 * The shapes a developer uses to say how a change will be PROVEN. Deliberately distinct from the
 * acceptance shapes: "it should show the total" is an expectation, "run the checkout test" is a
 * verification ask, and conflating them would let one section speak for the other.
 */
const VERIFICATION_MARKERS: readonly RegExp[] = [
  /\b(?:make sure|check that|verify that|confirm that|test that)\b\s*(?<stated>[^.!?\n]{12,180})/i,
  // The verb rides INSIDE the quote: "run the test suite" is what the developer asked for, and
  // dropping it left a noun fragment that read oddly under the fact's own framing. Measured inert
  // either way against the authority and risk scanners, so the clearer form is the one used.
  /\b(?<stated>(?:run|rerun|re-run)\s+(?:the\s+)?[\w.\-/]+\s+(?:test|tests|suite|check|checks|build)[^.!?\n]{0,120})/i,
  /\b(?:i (?:usually |always )?test(?: it)? by|to test this)\b\s*(?<stated>[^.!?\n]{12,180})/i,
];

function extractStated(
  recentPrompts: readonly string[],
  markers: readonly RegExp[],
): readonly PromptHistoryExpectationV1[] {
  const window = recentPrompts.slice(-PROMPT_HISTORY_EXPECTATION_WINDOW_V1).filter((text) => text.trim() !== '');
  const found: PromptHistoryExpectationV1[] = [];
  const seen = new Set<string>();
  // Newest first: the freshest statement of what the developer wants is the one worth carrying.
  for (let index = window.length - 1; index >= 0; index--) {
    const text = window[index]!;
    for (const marker of markers) {
      const match = marker.exec(text);
      const stated = match?.groups?.['stated']?.trim().replace(/[,;:]+$/, '');
      if (!stated || stated.length < MIN_STATED_CHARS || stated.length > MAX_STATED_CHARS) continue;
      const key = stated.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ statedText: stated, promptsAgo: window.length - 1 - index });
    }
  }
  return found;
}

/**
 * What the developer said "done" looks like, in their own words, from recent prompts.
 * An empty result is the correct answer whenever they never said — and it produces no fact.
 */
export function promptHistoryAcceptanceExpectationsV1(
  recentPrompts: readonly string[],
): readonly PromptHistoryExpectationV1[] {
  return extractStated(recentPrompts, ACCEPTANCE_MARKERS);
}

/**
 * How the developer said the work would be checked, in their own words, from recent prompts.
 * An empty result is the correct answer whenever they never said — and it produces no fact.
 */
export function promptHistoryVerificationAsksV1(
  recentPrompts: readonly string[],
): readonly PromptHistoryExpectationV1[] {
  return extractStated(recentPrompts, VERIFICATION_MARKERS);
}

/**
 * The value the fact carries: the developer's own words, quoted, and nothing else.
 *
 * The renderer already frames a possibility-clamped fact ("<key> appears to be <value> … — confirm
 * before relying on it"), so any narration added here would be narrated twice. Measured on a real
 * body before this was fixed: "what you said done looks like appears to be you said in a recent
 * prompt: ..." — a sentence that says the same thing three ways and reads as filler, which is
 * exactly the failure this phase must not cause.
 */
export function promptHistoryExpectationEvidenceValueV1(expectation: PromptHistoryExpectationV1): string {
  return `"${expectation.statedText}"`;
}
