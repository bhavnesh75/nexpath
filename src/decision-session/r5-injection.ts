// R5 runtime injection — replaces the `{R5_INJECT: ...}` placeholder in
// an OptionEntry's desc-base with a 1–2-line summary grounded in the
// user's recent prompts.
//
// Primary mechanism (Strategy C): deterministic vocab extraction →
// step-4.5 voice-rule filter → Haiku-tier LLM rewrite.
//
// Fallback (Strategy D): pre-authored per-(signal_type, register)
// summary from r5-fallbacks.ts. Triggered by any of the F1–F7 failure
// modes.
//
// Called from `generateOptionList` AFTER Pass 2 returns the final
// `GeneratedOptions` (O-A locked substitution order). Substitution into
// the desc-base happens via simple placeholder replacement; the desc-
// base wrapper (R4 bookend) is substituted afterwards by
// `substituteCAFacingBookend`.

import type { PromptRecord } from '../classifier/types.js';
import { getR5DFallback } from './r5-fallbacks.js';

/** Register key used to look up D-fallback variants. */
export type R5Register = 'formal' | 'casual' | 'beginner';

/**
 * R5_INJECT placeholder pattern. The placeholder allows free-form
 * content between the colon and the closing brace (registers, length
 * hints, quoted example text); the runtime treats the entire matched
 * span as a single substitution slot.
 */
const R5_INJECT_RE = /\{R5_INJECT:[\s\S]*?\}/g;

/** Returns true when a desc-base template carries at least one `{R5_INJECT: ...}` placeholder. */
export function hasR5Injection(descBase: string): boolean {
  // Reset regex lastIndex by creating a fresh test each call.
  return /\{R5_INJECT:[\s\S]*?\}/.test(descBase);
}

/**
 * Replace every `{R5_INJECT: ...}` placeholder in `descBase` with the
 * given substitution text. Idempotent on inputs that carry no
 * placeholder.
 */
export function substituteR5Placeholder(descBase: string, substitution: string): string {
  return descBase.replace(R5_INJECT_RE, substitution);
}

/**
 * R5 runtime substitution — the public entry point.
 *
 * Strategy C primary (deterministic vocab + voice-rule filter + Haiku
 * LLM rewrite) is wired up in subsequent sub-batches. The current
 * implementation falls back to Strategy D (the static D-fallback per
 * signal_type × register) whenever Strategy C is not yet wired or
 * any of the F1-F7 failure modes fires.
 *
 * Contract:
 *   - Never throws — all failures resolve to a Strategy D substitution
 *     OR (if no fallback exists for the (signal_type, register) pair)
 *     return the original desc-base unchanged.
 *   - Idempotent on inputs without `{R5_INJECT: ...}` — returns the
 *     desc-base verbatim.
 */
export async function injectR5(
  descBase:   string,
  history:    readonly PromptRecord[],
  signalType: string,
  register:   R5Register,
): Promise<string> {
  if (!hasR5Injection(descBase)) return descBase;

  // Strategy C primary will be wired in subsequent sub-batches.
  // Until then, every call falls through to Strategy D so the runtime
  // is functional end-to-end from the moment this module lands.
  return strategyDFallback(descBase, signalType, register);
}

/**
 * Strategy D fallback path — substitutes the placeholder with the
 * pre-authored static summary for the (signal_type, register) pair.
 *
 * If no D-fallback exists for the pair, returns the desc-base
 * unchanged (the placeholder stays — the caller sees the locked
 * substitution-absent marker rather than a misleading empty body).
 */
export function strategyDFallback(
  descBase:   string,
  signalType: string,
  register:   R5Register,
): string {
  // r5-fallbacks.ts exposes a typed `Register = 'formal' | 'casual' | 'beginner'`
  // matching R5Register; the cast is a structural identity.
  const fallback = getR5DFallback(signalType, register);
  if (fallback === undefined) return descBase;
  return substituteR5Placeholder(descBase, fallback);
}

// Used as the suppress-unused signal for the placeholder skeleton; the
// later sub-batches consume the history argument when Strategy C wires up.
void ((_h: readonly PromptRecord[]) => _h);
