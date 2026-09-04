/**
 * The words the composer is given for each resolved source fact's metadata — in place of the
 * enum labels the fact record carries internally.
 *
 * The fact line hands the model a fact's id and evidence value (which stay byte-identical: the
 * no-invention allow-list keys on them) together with four labels that tell it how the fact may
 * be used. Those labels were internal enum values (`must_phrase_as_possibility`); a model cannot
 * act on an identifier, and an identifier it cannot act on is one it may echo into the user's
 * prompt. Each label now translates to a phrase the model can follow. A value that serves only
 * the registry has no phrase and is dropped from the line.
 *
 * Wording is owner-approved (2026-08-25) and lands byte for byte.
 */

const GUIDANCE_KIND_WORDING_V1: Readonly<Record<string, string>> = {
  missing_practice: 'a practice this developer\'s work is missing',
  stage_transition_discipline: 'discipline for moving between work stages',
  source_signal_guidance: 'guidance from the developer\'s own signals',
  project_grounding: 'a fact about this specific project',
  positive_practice_preservation: 'a good practice already in place, to keep',
  safety_or_confirmation: 'a safety point that needs confirmation',
  requirement_source_state: 'where the requirement comes from and how firm it is',
  debug_evidence: 'evidence about the problem',
  maintenance_preservation: 'behaviour to preserve during maintenance',
  review_verification: 'how the review will be verified',
};

const CONFIDENCE_BAND_WORDING_V1: Readonly<Record<string, string>> = {
  high: 'well supported',
  medium: 'partly supported',
  low: 'weakly supported',
};

/** Origins that serve only the registry carry no phrase and are dropped from the line. */
const ORIGIN_SCOPE_WORDING_V1: Readonly<Record<string, string | null>> = {
  current_prompt: 'from this request',
  recent_prompt_history: 'from recent requests',
  local_probe: 'observed in the local project',
  local_probe_trajectory: 'a recent change observed in the local project',
  longitudinal_param_events: 'from the developer\'s history over time',
  transcript_corroboration: 'corroborated by the session transcript',
  stored_memory: 'from stored memory',
  original_point_inventory: 'from the points in the original request',
  unknown: 'origin unknown',
  served_variant_identity: null,
  content_template_registry: null,
  content_template_runtime: null,
};

const CLAIM_POLICY_WORDING_V1: Readonly<Record<string, string>> = {
  may_state_as_user_practice: 'you may state this as the developer\'s practice',
  may_state_as_project_capability: 'you may state this as something the project has',
  must_have_behaviour_verified_practice: 'state this as an established practice only because behaviour verified it',
  must_phrase_as_possibility: 'treat this as a possibility, not a fact',
  must_phrase_as_source_signal: 'phrase this as what a signal suggests, not as a fact',
  must_phrase_as_recent_change: 'phrase this as a recent change, not a current state',
  source_label_only: 'cite the source only, never its content',
  do_not_render: 'do not state this',
};

/** A label with no translation is never echoed raw: it is dropped, and the line stays words-only. */
function wordingFor(map: Readonly<Record<string, string | null>>, value: string): string | undefined {
  const wording = map[value];
  return typeof wording === 'string' ? wording : undefined;
}

export function promptEnhancementGuidanceKindWordingV1(value: string): string | undefined {
  return wordingFor(GUIDANCE_KIND_WORDING_V1, value);
}

export function promptEnhancementConfidenceWordingV1(value: string): string | undefined {
  return wordingFor(CONFIDENCE_BAND_WORDING_V1, value);
}

export function promptEnhancementOriginWordingV1(value: string): string | undefined {
  return wordingFor(ORIGIN_SCOPE_WORDING_V1, value);
}

export function promptEnhancementClaimWordingV1(value: string): string | undefined {
  return wordingFor(CLAIM_POLICY_WORDING_V1, value);
}

/** The vocabularies, exposed for the completeness tests only. */
export const FACT_LINE_WORDING_VOCABULARIES_V1 = {
  guidanceKind: Object.keys(GUIDANCE_KIND_WORDING_V1),
  confidence: Object.keys(CONFIDENCE_BAND_WORDING_V1),
  origin: Object.keys(ORIGIN_SCOPE_WORDING_V1),
  claim: Object.keys(CLAIM_POLICY_WORDING_V1),
} as const;
