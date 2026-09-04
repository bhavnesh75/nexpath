/**
 * Recent-prompt-history signals for the enhanced prompt.
 *
 * 🔑 **What this exists to fix.** Of the eleven section kinds the planner can produce, only two ever
 * received a fact — the rest had no producer at all, so they were structurally incapable of being
 * grounded. The natural source for the others is the developer's own recent prompts, and that
 * history WAS already processed properly: the masking, dedup, vocabulary and sensitive-action
 * layers all exist and are tested. They were built for the option-generation engine, and every one
 * of their consumers lives in that engine, which is switched off. So the analysis runs nowhere.
 *
 * 🔒 **Owner ruling (2026-08-20): deterministic ONLY where it is certain to deliver.** *"grounding
 * the important facts from recent history is critically important and I dont want to take
 * unnecessary and unreliable chances, with the deterministic layers. so deterministic layers only
 * where you are 100% sure it will work and for the rest the LLM api call pass."*
 *
 * ⚠️ **So this module carries the sensitive-action lane and nothing else.** Two other deterministic
 * layers were available and were deliberately NOT ported:
 *   - `extractVocab` returns the top tokens of the recent prompts. A bag of words is not a fact —
 *     `cutoff, messages, chrome` grounds nothing, and rendering it would be noise wearing the shape
 *     of evidence.
 *   - `computeRepetitionCounts` reports that a token appeared in two or more prompts. That a word
 *     repeated is not what the word MEANT, and no section is honestly served by the count.
 * Both would have produced sections that looked grounded and said nothing. The remaining sections
 * are fed by the LLM pass instead, hosted on a call that already happens.
 *
 * 🔑 Why the sensitive-action lane IS certain: it is a CURATED list of trigger patterns, which is
 * the one shape a regex answers exactly. It is also the mechanism already shipped for this same
 * question elsewhere, so this is a reuse rather than a second detector.
 */

import { detectL2TriggersInText } from '../decision-session/r5-injection.js';

/**
 * One sensitive-action category observed across the recent prompts.
 *
 * ⛔ **There is deliberately no field for the matched text.** The detector returns the literal words
 * from the developer's prompt that satisfied the trigger, and the owner reversed an
 * include-the-literal-word preference once already, on leakage grounds. The category is what the
 * body needs in order to ask for confirmation; the literal wording adds nothing and carries the
 * whole risk, so it stops here and is never returned.
 */
export interface PromptHistorySensitiveSignalV1 {
  /** The trigger category, e.g. `destructive-fs`, `deployment`. Never user text. */
  readonly category: string;
  /** How many of the recent prompts carried this category. */
  readonly promptCount: number;
}

/**
 * How many recent prompts are read. Matches the window the miner already uses, so both lanes
 * describe the SAME stretch of history and cannot disagree about what "recent" means.
 */
export const PROMPT_HISTORY_SIGNAL_WINDOW_V1 = 5;

/**
 * The sensitive-action categories present in the recent prompts, most-repeated first.
 *
 * ⚠️ Counts DISTINCT PROMPTS, not matches: a single prompt saying "force push" three times is one
 * prompt that mentioned it, and letting the repetition inflate the count would make an emphatic
 * developer look like a persistent pattern.
 */
export function promptHistorySensitiveActionSignalsV1(
  recentPrompts: readonly string[],
): readonly PromptHistorySensitiveSignalV1[] {
  const window = recentPrompts.slice(-PROMPT_HISTORY_SIGNAL_WINDOW_V1).filter((text) => text.trim() !== '');
  const promptCountByCategory = new Map<string, number>();
  for (const text of window) {
    // One count per category per prompt — the detector can return several matches from one prompt.
    const categories = new Set(detectL2TriggersInText(text).map((match) => match.name));
    for (const category of categories) {
      promptCountByCategory.set(category, (promptCountByCategory.get(category) ?? 0) + 1);
    }
  }
  return [...promptCountByCategory.entries()]
    .map(([category, promptCount]) => ({ category, promptCount }))
    // Stable: count first, then category name, so the same history always yields the same order.
    .sort((a, b) => (b.promptCount - a.promptCount) || a.category.localeCompare(b.category));
}

/**
 * How the safeguard names the action it is asking about.
 *
 * 🔒 **Owner ruling (2026-08-20): the GENERIC naming, option (c).** Two alternatives were put to
 * him and both were declined for now — the literal matched text (the leakage he had already
 * reversed once) and a written label per category (option-text content, which is his lane and would
 * need eight authored phrases). If the sim reads too vague, he writes those eight and this becomes
 * the only line that changes.
 *
 * ⚠️ Only the NAMING is decided here; the sentence around it is the enhanced-prompt lane's own
 * (see `promptHistorySafeguardSentenceV1` below for why this lane no longer shares the
 * decision-session template).
 */
const GENERIC_SENSITIVE_ACTION_NAMING_V1 = 'sensitive action';

/**
 * The confirmation-seek line for a detected sensitive action, addressed to the coding agent.
 *
 * ⚠️ OWNED HERE, deliberately no longer built through the decision-session template: the two
 * lanes carry different wording rules. This enhanced-prompt lane carries the full ground-level
 * clause (ask first, and verify the real state before asking), while every decision-session
 * surface keeps its own sentence byte-identical — rewording the shared builder would have
 * changed decision-session option desc-bases outside this lane's scope. The two sentences being
 * different strings is a checked property, not an accident.
 *
 * ⛔ NOT the fact VALUE — see `promptHistorySensitiveActionObservationV1` below. It was, and a
 * measured body showed why that could not stand.
 */
export function promptHistorySafeguardSentenceV1(): string {
  return `Still, before you do this ${GENERIC_SENSITIVE_ACTION_NAMING_V1} you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.`;
}

/**
 * What the `history_sensitive_action:` fact STATES — an observation, never an instruction.
 *
 * 🔴 Measured on a real body (sim-s12, P38): the safeguard SENTENCE was this fact's value, and the
 * renderer's possibility clamp wrapped it into
 *   "deployment appears to be Still, before you do this sensitive action you must ask me for
 *    go-ahead confirmation … (from a recent project check) — confirm before relying on it."
 * Two separate failures in one line. It is ungrammatical, because the value slot is a STATE
 * ("22", "postgres") and an imperative sentence cannot stand where a state belongs. And it is
 * semantically inverted: a mandatory "you must ask me" arrives wrapped in "confirm before relying
 * on it", which demotes the one instruction this sub-milestone exists to deliver. The body also
 * carried the correct code-inserted clause three lines below — NAMING the real category rather
 * than the generic one — so the mangled copy was pure duplication of something already said
 * better.
 *
 * The instruction has its own channel and keeps it. What belongs here is only what the detector
 * actually knows, which this module already states plainly above: a category was MENTIONED in
 * recent prompts, never that the developer does it as a practice. Under the possibility clamp that
 * reads "<category> appears to be something you raised in recent prompts … — confirm before
 * relying on it", where the clamp is now doing its real job: the detector is uncorroborated, so
 * "do not rely on my having spotted this" is exactly the right hedge to attach.
 *
 * ⚠️ The fact keeps a value rather than dropping to none deliberately: its `safety_sensitive_source`
 * hook is what makes `risk_safety_or_confirmation` floor material, and a stated observation keeps
 * the section saying something of its own beside the standing instruction.
 */
export function promptHistorySensitiveActionObservationV1(): string {
  return 'something you raised in recent prompts';
}

/** The ref namespace this lane's facts are filed under; the one place it is spelled. */
export const PROMPT_HISTORY_SENSITIVE_ACTION_REF_PREFIX_V1 = 'history_sensitive_action:';

/**
 * Did the recent-history lane fire? — the question the CONFIRMATION path has to ask.
 *
 * 🔒 Hiren's 2026-08-20 ruling is what this preserves: *"a developer could say 'deploy to
 * production' three prompts running and the enhanced prompt would never ask the agent to check
 * first."* The current prompt can be entirely benign and the clause must still appear, so the
 * prompt-text predicate alone cannot decide it — history is the whole point of the lane.
 *
 * 🔴 Caught by `prompt-history-signals.integration.test.ts` when the safeguard sentence stopped
 * being this lane's fact VALUE. That value was the only way the lane reached a body, so removing
 * it from the value silently removed the capability with it. The instruction now travels the same
 * code-inserted channel every other confirmation uses — where it is stated once, in full, and
 * names its category — and this predicate is how that channel learns the lane fired.
 */
export function promptHistorySensitiveActionFactPresentV1(
  facts: readonly { readonly sourceIds: readonly string[] }[],
): boolean {
  return facts.some((fact) =>
    fact.sourceIds.some((sourceId) => sourceId.startsWith(PROMPT_HISTORY_SENSITIVE_ACTION_REF_PREFIX_V1)));
}
