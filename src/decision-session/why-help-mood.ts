// Mood-conditional sentence appended to the why-help block when the
// session mood signals friction. Only two moods trigger a mood sentence:
// `frustrated` (acknowledging friction) and `rushed` (time-pressure
// pragmatism). The other four moods skip — adding a sentence in a
// neutral / positive state would read as patronising.
//
// The sentence is the FINAL sentence of the why-help block, placed after
// the base register-aware body and before the closing bookend. Render
// integration handles the placement; this module only owns the content
// table + the small lookup function.

import type { UserMood } from '../classifier/types.js';

/** Registers used by the mood-sentence table. Mirrors the why-help register set. */
export type WhyHelpMoodRegister = 'formal' | 'casual' | 'beginner';

/** Moods that produce a mood sentence. The other four moods skip. */
export type WhyHelpMoodKey = 'frustrated' | 'rushed';

/**
 * Mood-sentence table — per-mood × per-register. Only `frustrated` and
 * `rushed` have entries; the four neutral / positive moods are absent by
 * design (no mood sentence in those cases).
 */
export const WHY_HELP_MOOD: Record<WhyHelpMoodKey, Record<WhyHelpMoodRegister, string>> = {
  frustrated: {
    formal:   'Acknowledging the friction in recent prompts — the options below are calibrated for that.',
    casual:   'Things sound tight right now — the options below are short and direct.',
    beginner: "Looks like things are getting frustrating — let's pick the simplest next step.",
  },
  rushed: {
    formal:   'Recent prompts indicate time pressure — the options below prioritize speed over thoroughness.',
    casual:   "Looks like you're in a hurry — the options below are quick wins.",
    beginner: "Things are moving fast — let's pick something quick.",
  },
};

/**
 * Resolve the mood sentence for a given mood + register pair, or `null`
 * when no sentence applies (mood is undefined / neutral / positive).
 *
 * Routing matches the W1 / W2 / W3 failure-mode handlers:
 *   W1 — profile null      → caller uses register default; this fn returns null when mood is undefined.
 *   W2 — neutral / positive mood (`focused` / `methodical` / `casual` / `excited`) → returns null.
 *   W3 — mood undefined    → returns null.
 */
export function getMoodSentence(
  mood:     UserMood | undefined,
  register: WhyHelpMoodRegister,
): string | null {
  if (mood !== 'frustrated' && mood !== 'rushed') return null;
  return WHY_HELP_MOOD[mood][register];
}
