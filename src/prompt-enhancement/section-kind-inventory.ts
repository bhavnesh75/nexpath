import { PROMPT_ENHANCEMENT_TAXONOMY_PRESETS } from './routing-taxonomy.js';
import { PROMPT_ENHANCEMENT_PLANNABLE_SECTION_KINDS_V1 } from './templates/section-plan.js';

/**
 * Every section kind the pipeline can plan — DERIVED, because the kind is an open string.
 *
 * The planner produces sections from three sources: its own action/capability maps (the
 * plannable list) and the routing presets' section lists (required at every level, plus the
 * thorough-level additions). No union type closes that set, so a completeness gate cannot be
 * written against a type; it is written against this derivation instead. One derivation, shared
 * by every gate that must cover "every kind" — the composer's purpose wording and the heading
 * display names alike — so the two can never disagree about what the inventory is.
 */
export function derivePromptEnhancementSectionKindInventoryV1(): readonly string[] {
  const kinds = new Set<string>(PROMPT_ENHANCEMENT_PLANNABLE_SECTION_KINDS_V1);
  for (const preset of PROMPT_ENHANCEMENT_TAXONOMY_PRESETS) {
    for (const kind of preset.requiredSections) kinds.add(kind);
    for (const kind of preset.moreThoroughAdds) kinds.add(kind);
  }
  return [...kinds].sort();
}
