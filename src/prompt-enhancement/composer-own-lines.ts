/**
 * The lines the composer writes about a SECTION rather than about the request.
 *
 * Every section whose kind has an entry in the composer's content map renders one fixed line, and
 * every section whose kind has no entry renders the fall-through — `Cover <heading> for this request
 * with concrete, source-backed specifics…`. Neither says anything about what the developer asked
 * for: they are nexpath telling itself what belongs in the section it just opened.
 *
 * 🔑 **Why a consumer needs to know them.** Emphasis exists to show a reader what the body is asking
 * the agent to DO, and the owner's rule is that nexpath's own added content is never the thing drawn
 * heavy. Read as language, these lines are perfect instructions — imperative verb, concrete object —
 * so no grammar rule can tell them from the real thing. The only honest way to leave them plain is to
 * know them by name.
 *
 * ⛔ **Not one character of this is authored here.** Every string is the composer's own, copied
 * verbatim out of `compose-enhancement.ts` — most of them from `instructionLinesForSection`, the rest
 * from the thoroughness, grounding and point-inventory branches beside it. `composer-own-lines.test.ts`
 * reads that WHOLE FILE, not one function, and fails if any body-shaped literal in it is unaccounted
 * for. A rewording there cannot leave this stale and silent — which is the risk the same pattern in
 * `body-assertion-checks.ts` was built to close, for the same reason.
 *
 * ⛔ **The composer is not imported and not modified.** This module is a consumer: it may not change
 * what the pipeline generates, so it carries a copy under a staleness proof rather than reaching into
 * the generator for a function that is deliberately private to it.
 */
import {
  PROMPT_ENHANCEMENT_FALLTHROUGH_LONG_V1,
  PROMPT_ENHANCEMENT_FALLTHROUGH_SHORT_PREFIX_V1,
  PROMPT_ENHANCEMENT_FALLTHROUGH_SHORT_SUFFIX_V1,
} from './body-assertion-checks.js';

/**
 * The composer's per-kind lines, long form and short form, exactly as it renders them.
 *
 * Ordered as the map is written, so a reader can hold the two side by side. The `shorter` action
 * renders the second of each pair, and both have to be here — a body composed short is still a body.
 */
export const PROMPT_ENHANCEMENT_COMPOSER_OWN_LINES_V1: readonly string[] = [
  'Treat what your recent practice shows as a working constraint, and turn it into direct implementation guidance.',
  'Treat what your recent practice shows as a direct constraint on this task.',
  'State the expected output and acceptance criteria clearly enough that the implementation can be checked.',
  'State the expected output and acceptance checks.',
  'Include the verification command, focused scenario, or regression check that should prove the change.',
  'Include the verification check.',
  'Capture the failing behavior, reproduction path, observed evidence, and expected behavior before changing code.',
  'Capture repro, evidence, and expected behavior.',
  'Preserve existing behavior outside the requested scope and call out compatibility risks before editing shared paths.',
  'Preserve out-of-scope behavior.',
  'Name risky or irreversible actions, ask for required confirmation, and include rollback or recovery checks.',
  'Keep confirmation and rollback checks.',
  'Ground the request in current project facts and source references without inventing missing implementation details.',
  'Ground the request in current source facts.',
  'Order the work by dependency and call out the next blocked decision instead of skipping ahead.',
  'Order work by dependency.',
  'Use a concrete finding format with severity, source reference, impact, and verification expectation.',
  'Use severity, evidence, impact, and verification.',
  'Carry forward relevant constraints, limits, environment facts, and user instructions that affect the work.',
  'Carry forward relevant constraints.',
  'Ask only for missing decisions that block a correct implementation; otherwise proceed from source-backed facts.',
  'Ask only for blocking missing decisions.',
  // The thoroughness addition, and the grounding lines. Same job as the map's entries — the composer
  // saying what the section should hold — reached by a different branch.
  'Add edge cases, failure behavior, and verification evidence where relevant.',
  'Add deeper coverage for ',
  'Known project grounding is unavailable for this section; keep the prompt scoped to the provided request and ask only for blocking missing project facts.',
  'Use the typed project/source metadata attached to this section as grounding; do not invent unavailable project facts.',
  // The point-inventory section's two FIXED lines. Its other two re-emit the developer's own points
  // and are named below as request-derived, which is why they are not here.
  'Preserve the original request, dependencies, and completion checks inside this one prompt body.',
  'Keep the list of separate points short and complete.',
  // The stance sentence. Its second half already has a fixed class-5 mark of its own and is blanked
  // before the line scan; this covers the first half, which is not.
  'This request touches something risky the developer has not asked to have done: cover what to check and what to confirm with them first, rather than carrying it out.',
];

/**
 * The two map entries that are NOT fixed text, and are therefore out of scope here.
 *
 * `point_inventory_or_decomposition` re-emits the developer's own harvested points, and
 * `reproduction_or_evidence` names the evidence they actually supplied when they supplied some. Both
 * are built from the request, so both are exactly the thing emphasis is FOR — refusing them would be
 * the opposite of this module's purpose.
 *
 * Exported so the staleness test can say which kinds it deliberately does not cover, rather than
 * leaving a reader to wonder whether they were forgotten.
 */
export const PROMPT_ENHANCEMENT_COMPOSER_REQUEST_DERIVED_KINDS_V1: readonly string[] = [
  'point_inventory_or_decomposition',
  'reproduction_or_evidence',
];

/**
 * The composer literals this module deliberately does NOT cover, and each one's reason.
 *
 * The staleness test reads every body-shaped literal out of the composer's source and demands that
 * each is either covered above or named here. That is what makes the list finishable rather than
 * sampled: a new line added to the composer fails the test until somebody decides which side it is on.
 *
 * Every entry here interpolates the developer's own words, so a mark on one is a mark on the request
 * — which is what emphasis is for.
 */
export const PROMPT_ENHANCEMENT_COMPOSER_REQUEST_DERIVED_LINES_V1: readonly string[] = [
  'Preserve these original points in the work plan: ',
  'Keep these points covered: ',
  ' provided in the request above.',
  ' provided above.',
];

/**
 * Is this line the composer talking about the section rather than about the request?
 *
 * The list marker and surrounding space are ignored, and the comparison is on the line's OPENING: a
 * body may append to one of these lines, and a mark built from its first words is still a mark on
 * nexpath's own sentence.
 *
 * The fall-through is recognised by shape rather than by text, because the heading sits in the middle
 * of it. Its two arms are named by the constants `body-assertion-checks.ts` already exports for the
 * assertion that watches the same sentence, so there is one place the wording lives and one place a
 * rewording is caught.
 */
export function isPromptEnhancementComposerOwnLineV1(line: string): boolean {
  const text = line.replace(/^\s*[-•*]\s+/, '').trim();
  if (text.length === 0) return false;
  for (const own of PROMPT_ENHANCEMENT_COMPOSER_OWN_LINES_V1) {
    if (text.startsWith(own)) return true;
  }
  if (!text.startsWith(PROMPT_ENHANCEMENT_FALLTHROUGH_SHORT_PREFIX_V1)) return false;
  return (
    text.includes(PROMPT_ENHANCEMENT_FALLTHROUGH_LONG_V1) ||
    text.endsWith(PROMPT_ENHANCEMENT_FALLTHROUGH_SHORT_SUFFIX_V1)
  );
}
