import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  type PromptEnhancementBodyPlanV1,
  type PromptEnhancementCallVisibilityMode,
  type PromptEnhancementEvidenceStatus,
  type PromptEnhancementFallbackMode,
  type PromptEnhancementSectionPlanItemV1,
  type PromptEnhancementSourceKind,
  type PromptEnhancementSourceRefV1,
  type PromptEnhancementValidationStatus,
} from '../contracts.js';
import type {
  PromptEnhancementCapabilityId,
  PromptEnhancementFamilyId,
  PromptEnhancementPrimaryIntent,
  PromptEnhancementRouteResult,
} from '../routing-taxonomy.js';
import { getPromptEnhancementTemplateByIntent } from './registry.js';

export type PromptEnhancementGuidanceSourceType =
  | 'stage_transition'
  | 'absence_signal'
  | 'content_template_record'
  | 'content_template_runtime_fact'
  | 'persistent_missing_signal_memory'
  | 'hard_fact'
  | 'right_good_pattern'
  | 'work_style_fact'
  | 'prompt_derived_fact';

/**
 * WHERE the fact's knowledge came from. Origin scope controls claim strength: a fact
 * known only from the current prompt must never pose as independent project knowledge,
 * and its claim policy is clamped accordingly at source mixing.
 */
export type PromptEnhancementSourceOriginScope =
  | 'current_prompt'
  | 'recent_prompt_history'
  | 'local_probe'
  // The local probe compared ACROSS sessions. Distinct from `local_probe` because the
  // knowledge is a movement, not a state: the probe says what is true now, this says what
  // moved — and a movement carries its own claim ceiling (see the claim policy below).
  | 'local_probe_trajectory'
  | 'longitudinal_param_events'
  | 'served_variant_identity'
  | 'transcript_corroboration'
  | 'stored_memory'
  | 'content_template_registry'
  | 'content_template_runtime'
  | 'original_point_inventory';

/**
 * The strongest wording the composer may use for this fact. Assigned deterministically
 * from corroboration tier + origin scope — no generated claim may exceed it.
 */
export type PromptEnhancementClaimVerbPolicy =
  | 'may_state_as_user_practice'
  | 'may_state_as_project_capability'
  | 'must_have_behaviour_verified_practice'
  | 'must_phrase_as_possibility'
  | 'must_phrase_as_source_signal'
  // ⚠️ The CHANGE-OVER-TIME rung. Every rung above states what IS true; this one states what
  // MOVED, and the two cannot share wording — "known project fact: ci pipeline is true" is a
  // different claim from "ci pipeline was acquired since the last session", and a movement
  // stated as a state is a claim about the present that the evidence does not support.
  // Deliberately BELOW the project-knowledge rungs: a movement is observed by one local probe
  // pair, never behaviour-corroborated, so it may never be promoted into practice wording.
  | 'must_phrase_as_recent_change'
  | 'source_label_only'
  | 'do_not_render';

/**
 * WHAT the fact's knowledge is anchored to. Anchor shapes wording: a machine fact
 * must never be worded as project architecture, a project fact never as user
 * behaviour, and an unknown anchor suppresses certainty.
 */
export type PromptEnhancementSourceAnchorScope =
  | 'machine_environment'
  | 'project_root'
  | 'session_behavior'
  | 'longitudinal_user_behavior'
  | 'current_prompt_scope'
  | 'content_template_scope'
  | 'unknown_anchor';

/**
 * The fact's role in the composed body. Polarity routes it: a FALSE capability is
 * safety material (`safety_confirmation_support`), never project grounding.
 */
export type PromptEnhancementFactRole =
  | 'required_source_signal_survivor'
  | 'supporting_missing_practice'
  | 'project_grounding_support'
  | 'positive_practice_preservation'
  | 'neutral_style_support'
  | 'safety_confirmation_support'
  | 'served_variant_provenance_only'
  | 'source_label_only'
  | 'suppressed'
  | 'deferred';

/**
 * F4 / L4971 — `sourceEligibilityState`, the LOCKED eleven.
 *
 * 🔒 *"Eligibility is metadata and routing/fallback authority; only public-safe skip/fallback
 * labels may render."* And the fixture gate it comes with: *"Eligibility fixtures fail if blocked,
 * dismissed, skipped, capped, cooldown, weak, or invalid facts independently show a v1 popup."*
 *
 * ⛔ PE does NOT decide these (prohibition 19). Frequency, dedup, cooldown and session-cap are
 * implemented upstream — `AbsenceDetector`, `SessionStateManager`, `Stage2Trigger` — and each value
 * is READ from the branch the pipeline already took at the boundary. §42.2's finding was never that
 * the gating is missing; it is that PE could not SEE it.
 */
/**
 * A6 / L4981 — `selectionState`, the LOCKED eight.
 *
 * 🔒 *"Selection state controls rendering, metadata-only, handoff, suppression, and fallback;
 * public copy uses safe labels only."*
 *
 * ⚠️ The mixer's own role union shipped FIVE of these. The three it never emitted —
 * `suppressed_by_relevance`, `suppressed_by_safety`, `invalid_source` — are part of the locked
 * contract, so the type carries all eight and the phase records which are reachable today rather
 * than trimming the lock to match the implementation.
 */
export type PromptEnhancementSelectionStateV1 =
  | 'selected_required'
  | 'selected_supporting'
  | 'selected_source_label_only'
  | 'suppressed_by_relevance'
  | 'suppressed_by_safety'
  | 'suppressed_by_payload_cap'
  | 'deferred_to_handoff'
  | 'invalid_source';

/**
 * A6 / L4970 — `sourceRuntimePath`, the LOCKED eight. A3 already stamps this value; A6 completes
 * it as a typed field with its gate: an unknown or hidden runtime path must never DRIVE rendered
 * guidance (it may still be recorded for diagnostics).
 */
export type PromptEnhancementSourceRuntimePathV1 =
  | 'local_static'
  | 'local_store'
  | 'local_probe'
  | 'local_read_model'
  | 'runtime_llm_param_extract'
  | 'runtime_llm_grounding'
  | 'runtime_autogen'
  | 'unknown';

/**
 * L4970's gate, as a predicate: which runtime paths may drive RENDERED guidance.
 * `unknown` is the hidden-path case the lock names; everything else is a declared local or runtime
 * seam that call-visibility can account for.
 */
export function isPromptEnhancementRenderableRuntimePathV1(
  path: PromptEnhancementSourceRuntimePathV1 | undefined,
): boolean {
  return path !== 'unknown';
}

export type PromptEnhancementSourceEligibilityStateV1 =
  | 'fresh_trigger_eligible'
  | 'active_signal_eligible'
  | 'memory_eligible'
  | 'support_only_not_triggering'
  | 'blocked_by_frequency'
  | 'blocked_by_dedup'
  | 'blocked_by_post_advisory_cooldown'
  | 'blocked_by_session_cap'
  | 'dismissed_or_user_skipped'
  | 'too_weak_no_popup'
  | 'invalid_source';

/**
 * The states that BLOCK a fact from opening a popup on its own — L4971's own list, verbatim:
 * *"blocked, dismissed, skipped, capped, cooldown, weak, or invalid"*, plus the support state whose
 * name says it does not trigger. Such a fact may still inform wording once a popup exists; it can
 * never be the reason one shows.
 */
export const PROMPT_ENHANCEMENT_NON_TRIGGERING_ELIGIBILITY_V1: ReadonlySet<PromptEnhancementSourceEligibilityStateV1> =
  new Set([
    'support_only_not_triggering',
    'blocked_by_frequency',
    'blocked_by_dedup',
    'blocked_by_post_advisory_cooldown',
    'blocked_by_session_cap',
    'dismissed_or_user_skipped',
    'too_weak_no_popup',
    'invalid_source',
  ]);

export function isPromptEnhancementPopupEligibleFactV1(
  state: PromptEnhancementSourceEligibilityStateV1 | undefined,
): boolean {
  // ⚠️ An ABSENT state is NOT a block. A first draft of F4 read it as one, and the measured effect
  // was 43 failing fixtures: every fact no producer stamps — content-template records, hard facts,
  // RIGHT/GOOD, work-style — lost survivor status and whole profiles collapsed to
  // `source_b_only_no_popup`. L4971 makes the NAMED states authoritative, not the absence of one,
  // so an unstamped fact keeps the behaviour it had before this phase and only the eight
  // non-triggering values below actually gate.
  return state === undefined || !PROMPT_ENHANCEMENT_NON_TRIGGERING_ELIGIBILITY_V1.has(state);
}

export type PromptEnhancementGuidanceKind =
  | 'missing_practice'
  | 'stage_transition_discipline'
  | 'source_signal_guidance'
  | 'project_grounding'
  | 'positive_practice_preservation'
  | 'safety_or_confirmation'
  | 'requirement_source_state'
  | 'debug_evidence'
  | 'maintenance_preservation'
  | 'review_verification';

export type PromptEnhancementSuggestedActionKind =
  | 'clarify_requirement'
  | 'add_acceptance_criteria'
  | 'add_verification'
  | 'capture_reproduction'
  | 'preserve_behavior'
  | 'confirm_risk'
  | 'plan_rollback'
  | 'ground_in_project_fact'
  | 'ask_for_source'
  | 'handoff_sequence'
  | 'no_action_render_context_only';

export type PromptEnhancementGuidancePriority =
  | 'required_survivor'
  | 'high'
  | 'normal'
  | 'low'
  | 'suppressed'
  | 'handoff_only'
  | 'deferred_to_ds';

export type PromptEnhancementGuidanceRenderPolicy =
  | 'render_as_section'
  | 'render_as_inline_clause'
  | 'metadata_only'
  | 'why_help_only'
  | 'fallback_only'
  | 'suppress_with_reason'
  | 'defer_to_normal_ds';

/**
 * A5 (L4966) — the `sourceType` ≡ `sourceKind` EQUIVALENCE that A2 deferred here.
 *
 * A2 kept the shipped field name `sourceType`, which L4958-4960 permits only
 * with a per-field equivalence fixture; that fixture could not be written while
 * the locked set was admittedly incomplete, so it was recorded as owed to this
 * phase. This is the mapping, stated once and pinned by a fixture.
 *
 * Nine of the twelve locked values are the shipped values under a shipped name.
 * THREE have no producer at all, and each is recorded with WHY rather than
 * quietly omitted — an equivalence that hides its own gaps proves nothing:
 *   · `current_advisory_signal` — PE consumes the current advisory as the
 *     stage/absence signal pair above; no separate advisory fact is produced.
 *   · `promoted_env_practice` — promotion is a corroboration TIER on an env
 *     fact (A1's tier-promotion wire), not a distinct kind of source.
 *   · `original_prompt_point` — the user's own points are a SECTION and a
 *     source ref, never a guidance fact; nothing generates guidance "from" them.
 */
export const PROMPT_ENHANCEMENT_LOCKED_SOURCE_KIND_EQUIVALENCE_V1: Readonly<
  Record<string, PromptEnhancementGuidanceSourceType | 'not_produced'>
> = {
  persistent_missing_signal_memory: 'persistent_missing_signal_memory',
  current_absence_signal: 'absence_signal',
  stage_transition_signal: 'stage_transition',
  content_template_record: 'content_template_record',
  content_template_fact: 'content_template_runtime_fact',
  current_advisory_signal: 'not_produced',
  env_fact: 'hard_fact',
  promoted_env_practice: 'not_produced',
  right_good_pattern: 'right_good_pattern',
  work_style_trait: 'work_style_fact',
  prompt_derived_fact: 'prompt_derived_fact',
  original_prompt_point: 'not_produced',
};

/**
 * The shipped source kinds as a RUNTIME set, derived from the equivalence map
 * above so the two halves of A5 cannot drift: whatever the map claims is shipped
 * is exactly what the mixer will accept.
 *
 * 🔒 L4966's fixture line requires that an UNKNOWN source kind FAILS. TypeScript
 * stops one at compile time, but facts cross a runtime boundary — and an
 * unrecognised kind was being accepted and rendered as grounding, which is the
 * "old DS row as PE source truth" shape the same lock names.
 */
export const PROMPT_ENHANCEMENT_KNOWN_SOURCE_TYPES_V1: ReadonlySet<string> = new Set(
  Object.values(PROMPT_ENHANCEMENT_LOCKED_SOURCE_KIND_EQUIVALENCE_V1).filter((value) => value !== 'not_produced'),
);

/**
 * A5 tier-2 (L4965). The three locked lanes, ON THE FACT rather than recomputed
 * as a mixer local. 🔒 The gate is that they are NOT COLLAPSIBLE: before this,
 * the mixer's local knew only `source_a | source_b`, so the NEUTRAL lane — the
 * user's own prompt — was indistinguishable from independent project grounding.
 */
export type PromptEnhancementSourceLaneV1 =
  | 'source_a_missing_practice'
  | 'source_b_grounding'
  | 'source_neutral_original';

/** A5 tier-3 (L4976). Locked set; low/unknown must never outrank strong current Source A. */
export type PromptEnhancementConfidenceBandV1 = 'high' | 'medium' | 'low' | 'unknown';

/**
 * A5 tier-3 (L4977). Locked set. 🔴 *"stale/historical cannot be hidden"* —
 * without it a fact recalled from months-old memory renders identically to one
 * observed in the current prompt.
 */
export type PromptEnhancementRecencyBandV1 =
  | 'current_prompt'
  | 'current_session'
  | 'recent_project'
  | 'historical'
  | 'unknown';

export interface PromptEnhancementGuidanceFact {
  factId: string;
  sourceType: PromptEnhancementGuidanceSourceType;
  sourceIds: readonly string[];
  guidanceKind: PromptEnhancementGuidanceKind;
  suggestedActionKind: PromptEnhancementSuggestedActionKind;
  targetFamily: PromptEnhancementFamilyId | 'family_agnostic';
  targetSectionKind: string;
  sourceEvidenceState: 'strong' | 'partial' | 'weak_low_risk' | 'weak_source_critical' | 'conflicting' | 'missing' | 'stale_or_unknown';
  priority: PromptEnhancementGuidancePriority;
  renderPolicy: PromptEnhancementGuidanceRenderPolicy;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'sensitive_authority_risky';
  safetyHooks: readonly string[];
  privacyClass:
    | 'public_safe'
    | 'local_private'
    | 'sensitive_ref_only'
    | 'do_not_render'
    // The locked sensitivity treatments: generalize the wording, suppress the
    // content, or route through confirmation — content gates honour all three.
    | 'sensitive_generalize'
    | 'sensitive_suppress'
    | 'requires_confirmation';
  sanitizationState: 'not_applicable' | 'redacted_prompt_store' | 'prompt_derived_sanitized' | 'identity_only_event' | 'sensitive_ref_only' | 'unsafe_to_render';
  /**
   * Tier-1 evidence fields. Optional on the raw producer layer for compatibility;
   * REQUIRED at source mixing — the mixer normalizes every entering fact so none is
   * selected without them, and the registry (never a model) assigns the claim policy.
   */
  sourceOriginScope?: PromptEnhancementSourceOriginScope;
  claimVerbPolicy?: PromptEnhancementClaimVerbPolicy;
  factRole?: PromptEnhancementFactRole;
  /**
   * A5 tier-2/3 fields. Optional on the raw producer layer for the same reason
   * the tier-1 trio is (A2's shape), and normalized deterministically at source
   * mixing so nothing selected is missing them. `sourceLane` in particular is
   * the lock's replacement for the mixer-local lane variable.
   */
  sourceLane?: PromptEnhancementSourceLaneV1;
  /**
   * F4 (L4971): the upstream eligibility this fact inherits — carried THROUGH from the boundary,
   * never recomputed here. Optional at the producer; the mix seam treats an absent value as
   * not-independently-eligible rather than defaulting it to eligible.
   */
  /**
   * A6 / L4979: estimated relative token/input/source payload weight, for call-visibility call/token
   * visibility and fact caps. ⛔ Local planning/cap metadata ONLY — never user-facing, and never
   * product-cost control (the lock's own gate, plus prohibition 9).
   */
  payloadWeight?: number;
  /**
   * A6 / L4964: stable per popup-session identity for this fact. ⛔ NEVER rendered — local
   * contract, validation, source-use and feedback identity only.
   */
  sourceMixFactId?: string;
  /**
   * A6 / L4981-4982: the mixer's decision, PROMOTED onto the fact. The done-when is that nothing
   * lives only as a mixer local, so a consumer reading a fact can see why it was selected,
   * suppressed, deferred or invalidated without re-deriving it from the result envelope.
   */
  selectionState?: PromptEnhancementSelectionStateV1;
  selectionReasonCodes?: readonly string[];
  sourceEligibilityState?: PromptEnhancementSourceEligibilityStateV1;
  confidenceBand?: PromptEnhancementConfidenceBandV1;
  recencyBand?: PromptEnhancementRecencyBandV1;
  /**
   * F3 (L4980): the stable, project-scoped key by which REPEATED guidance is
   * recognised across sessions — never raw prompt text, and a redacted
   * fingerprint when the fact is sensitive (A4 / L4995). Absent when no project
   * scope is available: a keyless fact simply cannot be matched, which is the
   * safe direction — a GLOBAL key would fade guidance across projects.
   */
  fatigueKey?: string;
  /**
   * The fact's resolved CONTENT — a generic key/value pair, resolved by the CALLER
   * at the source boundary (never by PE reaching back out) and carried WITH the
   * fact so its gates travel with it. Absent when the fact is reference-only
   * (`sensitive_ref_only`) or unrenderable — those never cross with content.
   */
  evidence?: { readonly key: string; readonly value: string };
  sourceAnchorScope?: PromptEnhancementSourceAnchorScope;
  /** Monorepo/nested-root truth — must SURVIVE source mixing when present. */
  anchoredRoot?: string;
  projectShape?: string;
  /**
   * Where the resolution actually happened — stamped at the boundary (A3), typed here (A6).
   * ⚠️ Was an INLINE union duplicating the locked eight; pointing it at the named type keeps
   * one map with one meaning (prohibition 15), so the L4970 gate and the field cannot drift.
   */
  sourceRuntimePath?: PromptEnhancementSourceRuntimePathV1;
  requiredBecause?: string;
  signalAliasResolution?: string;
  servedVariantRef?: string;
  pinchQuestionSourceState?: 'signal-pinch-fields' | 'content-template-record' | 'why-help-by-signal-type' | 'future_contract_registry';
  registerRoleSource?: 'none' | 'profile_register' | 'configured_role' | 'content_template_register_override' | 'content_template_role_override' | 'runtime_selection_register';
  wordingHintPolicy?: 'none' | 'use_signal_description_as_intent' | 'use_template_topic_anchor' | 'use_template_register_precedent' | 'use_role_precedent' | 'use_user_language_lightly' | 'llm_rewrite_allowed' | 'do_not_use_wording_hint';
  wordingHintSourceIds?: readonly string[];
  profileContextRefs?: readonly string[];
  mergePolicy?: 'standalone' | 'merge_with_same_practice' | 'merge_into_section' | 'merge_as_supporting_clause' | 'do_not_merge';
  mergeGroupId?: string;
  mergedIntoFactId?: string;
  shortenPolicy?: 'may_shorten_wording' | 'may_collapse_to_clause' | 'may_move_to_why_help' | 'must_preserve_full_meaning' | 'do_not_shorten';
  shortenFloor?: 'source_ref_only' | 'one_clause' | 'one_bullet' | 'section_summary' | 'full_section';
  publicCopySafe: boolean;
  llmCallPolicy?: 'not_applicable_deterministic' | 'requires_cost_visible_row';
}

export interface PromptEnhancementSectionPlanningInput {
  routeResult: PromptEnhancementRouteResult;
  sourceRefs: readonly PromptEnhancementSourceRefV1[];
  guidanceFacts?: readonly PromptEnhancementGuidanceFact[];
  /**
   * The prompt needs the go-ahead clause, so the confirmation gets a section of its OWN.
   *
   * 🔒 Owner-ruled (2026-08-26). `source_signal_guidance` is guaranteed to appear by a different
   * sub-milestone — if it cannot be injected the popup is cancelled outright — and its content is a
   * later sub-milestone's subject. It is NOT a home for the confirmation clause, and in most
   * scenarios it is the wrong home entirely.
   *
   * 🔴 MEASURED (§6d A/B, row 7: "rotate the stripe api key and update .env on the server"). The
   * `issue_debug.environment_config_issue` preset attaches no `capability.confirmation_needed` and
   * lists `risk_safety_or_confirmation` in no section list, so nothing carried the confirmation
   * flag. The composer's host ladder then fell to its last rung — "the last non-original section" —
   * and that section was `source_signal_guidance`. Two things went wrong at once: the clause landed
   * somewhere it does not belong, and clearing the clause took the whole guidance section with it,
   * because the section had no content-carrying fact of its own once the confirmation fact went.
   *
   * ⚠️ A boolean rather than the prompt text on purpose: the caller already resolves this, and
   * importing the safety module here would close an import cycle this layer has been kept out of.
   * Absent means today's behaviour, so no existing caller changes.
   */
  requiresExecutionConfirmation?: boolean;
}

export interface PromptEnhancementSectionPlanningResult {
  bodyPlan: PromptEnhancementBodyPlanV1;
  sectionPlans: readonly PromptEnhancementSectionPlanItemV1[];
  routeDecisionId: string;
  promptReviewOrigin: PromptEnhancementRouteResult['contractDecision']['promptReviewOrigin'];
  promptReviewProcessingPolicy: PromptEnhancementRouteResult['contractDecision']['promptReviewProcessingPolicy'];
  /** Observed evidence forms, carried so the repro section can name what was supplied. */
  debugEvidenceObserved: readonly string[];
  /**
   * The planning posture, carried from the route to the writers.
   *
   * The developer asked ABOUT something risky rather than asking for it to be done, so the body
   * must propose and check rather than instruct. The route decides it; the composer prompt and the
   * deterministic renderer are the two places that can act on it, and both read it from here so
   * they cannot disagree about the same body.
   */
  planningPosture: boolean;
  renderedFactIds: readonly string[];
  /**
   * GR-1: the renderable facts THEMSELVES, not only their ids.
   *
   * ⚠️ The Phase-4 revert lesson: widening the projection without the
   * resolved payload collapsed to one constant line. The composer cannot
   * STATE a fact it can only name — ids let it reference, values let it
   * render. Group A resolved the content at the boundary; this carries it
   * the last hop.
   */
  renderedFacts: readonly PromptEnhancementGuidanceFact[];
  metadataOnlyFactIds: readonly string[];
  suppressedFactIds: readonly string[];
  deferredFactIds: readonly string[];
  registryNamespace: 'prompt-enhancement-templates';
  sourcePriorityState: 'source_a_first';
  contentTemplateFactsAreSourceBOnly: true;
  exposesPrecomputedVariants: false;
  usesOldDecisionSessionTemplateRecord: false;
  usesPeOnlyClassifier: false;
  /**
   * I2 criterion (c): obligations that OUTLIVED their pruned section, carried to the body.
   *
   * 🔴 Declared at the phase-36 verification pass. The facade had been attaching this (and the field
   * below) to the planning object UNTYPED — which is precisely why nothing consumed them and the
   * criterion never reached a body: an untyped field is invisible to every reader that goes looking
   * through the type. Declaring them is what makes the hop checkable rather than incidental.
   *
   * ⚠️ Optional: the planner itself never sets these. They appear only after the pruner has run, so
   * a planning result that was never pruned is still a valid one.
   */
  inheritedSlotObligations?: readonly string[];
  /** I2: the sections the pruner dropped. Feeds the boundary log's count and phase 37's measurement. */
  prunedSectionIds?: readonly string[];
  /** I2/I3: how many surviving sections were floor — the other half of phase 37 step 4's question. */
  floorSectionCount?: number;
}

const SECTION_KIND_BY_ACTION: Record<PromptEnhancementSuggestedActionKind, string> = {
  clarify_requirement: 'uncertainty_or_clarification',
  add_acceptance_criteria: 'acceptance_or_output_expectation',
  add_verification: 'verification_or_test_plan',
  capture_reproduction: 'reproduction_or_evidence',
  preserve_behavior: 'behavior_preservation',
  confirm_risk: 'risk_safety_or_confirmation',
  plan_rollback: 'risk_safety_or_confirmation',
  ground_in_project_fact: 'project_grounding_facts',
  ask_for_source: 'requirement_source_state',
  handoff_sequence: 'handoff_or_sequence_candidate',
  no_action_render_context_only: 'context_and_constraints',
};

const SOURCE_KIND_BY_GUIDANCE_SOURCE: Record<PromptEnhancementGuidanceSourceType, PromptEnhancementSourceKind> = {
  stage_transition: 'stage_or_absence_signal',
  absence_signal: 'stage_or_absence_signal',
  content_template_record: 'content_template_fact',
  content_template_runtime_fact: 'content_template_fact',
  persistent_missing_signal_memory: 'prompt_enhancement_memory',
  hard_fact: 'hard_fact_or_profile_signal',
  right_good_pattern: 'hard_fact_or_profile_signal',
  work_style_fact: 'hard_fact_or_profile_signal',
  prompt_derived_fact: 'source_a_user_prompt',
};

/**
 * The slot-effect vocabulary, typed from each capability's locked "adds"
 * column. An obligation is what the attached capability requires its target
 * section to CONTAIN or GUARANTEE — the composer, the post-compose checks and
 * the fixtures all read the same typed value instead of prose.
 */
export type PromptEnhancementSlotObligationV1 =
  | 'reproduction_or_evidence_request'
  | 'no_invention_state'
  | 'behavior_lock'
  | 'baseline_current_output_proof'
  | 'no_unrelated_change_boundary'
  | 'before_after_verification'
  | 'review_checklist_challenge'
  | 'severity_residual_risk'
  | 'project_source_fact_slots'
  | 'known_unknown_wording'
  | 'source_ids_evidence_state'
  | 'confirmation_clarification'
  | 'send_policy_metadata'
  | 'safety_hook_linkage'
  | 'family_specific_verification'
  | 'risk_rollback_recovery'
  | 'dry_run_backup_pin_deployment'
  | 'safety_policy_hooks'
  | 'decomposition_handoff_metadata'
  | 'compact_first_popup_summary_support'
  | 'ordering_dependency'
  | 'baseline_source_signal'
  | 'source_kind_id_evidence_metadata'
  | 'public_safe_why_help_support';

/**
 * The slot-adds map — layer 3 of the capability design, NEW and named for one
 * meaning only (the flag-scoping map above it stays a flag-scoping map; one
 * map, one meaning). Each attached capability places its locked obligations on
 * its target section kind; the shape follows the one shipped slot precedent
 * (the baseline source-signal slot). The reproduction/evidence slot is FIRST —
 * its no-invention state is the typed answer to the fabrication defect, and
 * its slot is the one this design opened on.
 */
export const SLOT_EFFECTS_BY_CAPABILITY_V1: Partial<Record<PromptEnhancementCapabilityId, {
  targetSectionKind: string;
  obligations: readonly PromptEnhancementSlotObligationV1[];
}>> = {
  'capability.reproduction_or_evidence_needed': {
    targetSectionKind: 'reproduction_or_evidence',
    obligations: ['reproduction_or_evidence_request', 'no_invention_state'],
  },
  'capability.behavior_preservation': {
    targetSectionKind: 'behavior_preservation',
    obligations: ['behavior_lock', 'baseline_current_output_proof', 'no_unrelated_change_boundary', 'before_after_verification'],
  },
  'capability.adversarial_review': {
    targetSectionKind: 'finding_format',
    obligations: ['review_checklist_challenge', 'severity_residual_risk'],
  },
  'capability.project_grounding': {
    targetSectionKind: 'project_grounding_facts',
    obligations: ['project_source_fact_slots', 'known_unknown_wording', 'source_ids_evidence_state'],
  },
  'capability.confirmation_needed': {
    targetSectionKind: 'risk_safety_or_confirmation',
    obligations: ['confirmation_clarification', 'send_policy_metadata', 'safety_hook_linkage'],
  },
  'capability.verification_required': {
    targetSectionKind: 'verification_or_test_plan',
    obligations: ['family_specific_verification'],
  },
  'capability.risk_or_rollback': {
    targetSectionKind: 'risk_safety_or_confirmation',
    obligations: ['risk_rollback_recovery', 'dry_run_backup_pin_deployment', 'safety_policy_hooks'],
  },
  'capability.decomposition_candidate': {
    targetSectionKind: 'point_inventory_or_decomposition',
    obligations: ['decomposition_handoff_metadata', 'compact_first_popup_summary_support', 'ordering_dependency'],
  },
  'capability.source_signal_guidance': {
    targetSectionKind: 'source_signal_guidance',
    obligations: ['baseline_source_signal', 'source_kind_id_evidence_metadata', 'public_safe_why_help_support'],
  },
};

/**
 * Obligations a section carries whenever it RENDERS, independent of any
 * capability. The capability-keyed map below cannot express this: it attaches
 * the no-invention state only when the reproduction REQUEST attaches, so a
 * section that still renders generated text on the carry route — where the
 * developer supplied real evidence a model could embroider into invented
 * specifics — was left unprotected, i.e. protected precisely when there was
 * nothing to invent from. Owner ruling 2026-08-17: protect it always.
 */
const SECTION_KIND_FLOOR_OBLIGATIONS_V1: Readonly<Record<string, readonly PromptEnhancementSlotObligationV1[]>> = {
  reproduction_or_evidence: ['no_invention_state'],
};

/**
 * Is this fact source-critical? The canonical definition, exported so there is
 * ONE of it. It previously existed as two byte-identical private copies (the
 * guidance gate's and the source mixer's); F3 needs the same test for its
 * never-faded guard, and a third copy is how one map ends up with two meanings.
 * Both originals now call this.
 */
export function isPromptEnhancementSourceCriticalFactV1(fact: PromptEnhancementGuidanceFact): boolean {
  return (
    fact.riskLevel === 'high' ||
    fact.riskLevel === 'sensitive_authority_risky' ||
    fact.guidanceKind === 'safety_or_confirmation'
  );
}

function slotObligationsFor(
  sectionKind: string,
  capabilityOverlays: readonly PromptEnhancementCapabilityId[],
): readonly PromptEnhancementSlotObligationV1[] {
  const obligations = new Set<PromptEnhancementSlotObligationV1>();
  for (const capability of capabilityOverlays) {
    const effect = SLOT_EFFECTS_BY_CAPABILITY_V1[capability];
    if (effect && effect.targetSectionKind === sectionKind) {
      for (const obligation of effect.obligations) obligations.add(obligation);
    }
  }
  // Floors are added LAST so a route that already carried an obligation keeps
  // its existing order: obligations ride into the composer prompt, and the only
  // prompt that should change here is the carry route's, which gains the
  // protection it was missing.
  for (const obligation of SECTION_KIND_FLOOR_OBLIGATIONS_V1[sectionKind] ?? []) obligations.add(obligation);
  // The no-invention state is UNIVERSAL over composed prose: every planned section except the
  // user's own verbatim text carries it, so the working gate inspects every kind — including
  // any section kind a future preset introduces, which a per-kind list would silently miss
  // (the vocabulary is ~200 kinds and growing with presets). `original_request_or_goal` is
  // excluded because it IS the user's text: an invention check over the user's own words would
  // flag the user for inventing their own prompt.
  if (sectionKind !== 'original_request_or_goal') obligations.add('no_invention_state');
  return [...obligations];
}

const SECTION_REQUIRED_BY_CAPABILITY: Partial<Record<PromptEnhancementCapabilityId, string>> = {
  'capability.decomposition_candidate': 'point_inventory_or_decomposition',
  'capability.confirmation_needed': 'risk_safety_or_confirmation',
  'capability.adversarial_review': 'finding_format',
  'capability.project_grounding': 'project_grounding_facts',
  'capability.verification_required': 'verification_or_test_plan',
  'capability.risk_or_rollback': 'risk_safety_or_confirmation',
  'capability.reproduction_or_evidence_needed': 'reproduction_or_evidence',
  'capability.behavior_preservation': 'behavior_preservation',
  'capability.source_signal_guidance': 'source_signal_guidance',
};

/**
 * Every section kind the planner can produce — DERIVED from the two maps that produce them, never
 * a hand-kept list beside them (prohibition 15: one map, one meaning).
 *
 * Added for I1's relevance observation, which has to offer the model a vocabulary. A kind added to
 * either map appears there automatically; a kind removed stops being offered. `original_request_or_goal`
 * is included explicitly because it is planned unconditionally rather than through either map.
 */
export const PROMPT_ENHANCEMENT_PLANNABLE_SECTION_KINDS_V1: readonly string[] = [
  ...new Set<string>([
    'original_request_or_goal',
    ...Object.values(SECTION_KIND_BY_ACTION),
    ...Object.values(SECTION_REQUIRED_BY_CAPABILITY).filter((kind): kind is string => typeof kind === 'string'),
  ]),
];

/**
 * The id a section may CITE for a guidance fact. One builder, because it is used
 * in two places that must agree exactly: the planner's `structuredContentPartRefs`
 * (what a draft is allowed to cite) and the composer prompt's `resolvedSourceFacts`
 * (what the model is shown beside the evidence). They disagreed once — the payload
 * printed the bare `factId` — and a model citing the id it had been shown had its
 * whole reply refused as `source_fact_id_not_in_section`, collapsing the key path
 * to the deterministic body this phase exists to replace.
 */
export function promptEnhancementGuidanceFactRefIdV1(factId: string): string {
  return `guidance_fact:${factId}`;
}

export function planPromptEnhancementSections(
  input: PromptEnhancementSectionPlanningInput,
): PromptEnhancementSectionPlanningResult {
  const route = input.routeResult;
  const template = getPromptEnhancementTemplateByIntent(route.primaryIntent);
  const sourceA = sourceARef(input.sourceRefs);
  const facts = normalizeGuidanceFacts(input.guidanceFacts ?? []);
  // 🔒 The grounding section FOLLOWS ITS FACTS (Hiren's ruling on the sim finding). The capability
  // used to make this section structurally required, so it appeared on every popup and stated the
  // test runner and the lockfile to a prompt about renaming a variable. A section whose every fact
  // was judged inapplicable has nothing to say, and saying it anyway is what made the section noise.
  // ⚠️ Scoped to THIS section kind on purpose: the other capability-required sections carry their
  // own floors and obligations, and generalising this would silently re-decide all of them.
  const groundedFacts = facts.filter(isRenderableFact);
  const hasGroundingFact = groundedFacts.some((fact) => sectionKindForFact(fact) === 'project_grounding_facts');
  const candidateSectionKinds = orderedUnique([
    'original_request_or_goal',
    ...template.requiredSections,
    ...route.capabilityOverlays
      .map((capability) => SECTION_REQUIRED_BY_CAPABILITY[capability])
      .filter(isString)
      .filter((kind) => kind !== 'project_grounding_facts' || hasGroundingFact),
    ...groundedFacts.map(sectionKindForFact),
    // The confirmation's own section, when the prompt needs one and the preset lists it nowhere.
    // LAST on purpose, and it matters twice over. `orderedUnique` keeps the first occurrence, so a
    // preset that already places this kind keeps its own position and nothing is reordered — this
    // only ever ADDS a home that was missing. And where it is added, a risk section belongs near
    // the end of a body, which is where every preset that plans one puts it.
    ...(input.requiresExecutionConfirmation === true ? ['risk_safety_or_confirmation'] : []),
  ]);

  if (route.noPopup) {
    return {
      bodyPlan: {
        bodyPlanId: `${route.contractDecision.routeDecisionId}:body-plan`,
        bodyRevision: 1,
        routeDecisionId: route.contractDecision.routeDecisionId,
        orderedSectionPlans: [],
        originalPromptPreservation: 'fallback_original_only',
        groundedSourceGuidancePolicy: 'explicit_fallback_reason',
        generatedOriginPolicy: 'attach_generated_origin_metadata',
        futurePromptTextPolicy: 'not_generated_not_stored_not_rendered',
        exposesPrecomputedVariants: false,
      },
      sectionPlans: [],
      routeDecisionId: route.contractDecision.routeDecisionId,
      promptReviewOrigin: route.contractDecision.promptReviewOrigin,
      promptReviewProcessingPolicy: route.contractDecision.promptReviewProcessingPolicy,
      planningPosture: false,
      debugEvidenceObserved: route.contractDecision.debugEvidenceObserved,
      renderedFactIds: [],
      renderedFacts: [],
      metadataOnlyFactIds: facts.filter(isMetadataOnlyFact).map((fact) => fact.factId),
      suppressedFactIds: facts.filter(isSuppressedFact).map((fact) => fact.factId),
      deferredFactIds: facts.filter(isDeferredFact).map((fact) => fact.factId),
      registryNamespace: 'prompt-enhancement-templates',
      sourcePriorityState: 'source_a_first',
      contentTemplateFactsAreSourceBOnly: true,
      exposesPrecomputedVariants: false,
      usesOldDecisionSessionTemplateRecord: false,
      usesPeOnlyClassifier: false,
    };
  }

  const sectionPlans = candidateSectionKinds.map((sectionKind, index) =>
    buildSectionPlan({
      route,
      templateId: template.id,
      sectionKind,
      order: index + 1,
      sourceRefs: input.sourceRefs,
      sourceA,
      facts,
      required: template.requiredSections.includes(sectionKind) || sectionKind === 'original_request_or_goal',
    }),
  );
  const bodyPlan: PromptEnhancementBodyPlanV1 = {
    bodyPlanId: `${route.contractDecision.routeDecisionId}:body-plan`,
    bodyRevision: 1,
    routeDecisionId: route.contractDecision.routeDecisionId,
    orderedSectionPlans: sectionPlans,
    originalPromptPreservation: 'visible_verbatim',
    groundedSourceGuidancePolicy: template.baselineSourceSignalSlot === 'not_applicable'
      ? 'explicit_fallback_reason'
      : 'required_when_popup_shown',
    generatedOriginPolicy: 'attach_generated_origin_metadata',
    futurePromptTextPolicy: 'not_generated_not_stored_not_rendered',
    exposesPrecomputedVariants: false,
  };

  return {
    bodyPlan,
    sectionPlans,
    routeDecisionId: route.contractDecision.routeDecisionId,
    promptReviewOrigin: route.contractDecision.promptReviewOrigin,
    promptReviewProcessingPolicy: route.contractDecision.promptReviewProcessingPolicy,
    planningPosture: route.fallbackMode === 'planning_first',
    debugEvidenceObserved: route.contractDecision.debugEvidenceObserved,
    renderedFactIds: facts.filter(isRenderableFact).map((fact) => fact.factId),
    renderedFacts: facts.filter(isRenderableFact),
    metadataOnlyFactIds: facts.filter(isMetadataOnlyFact).map((fact) => fact.factId),
    suppressedFactIds: facts.filter(isSuppressedFact).map((fact) => fact.factId),
    deferredFactIds: facts.filter(isDeferredFact).map((fact) => fact.factId),
    registryNamespace: 'prompt-enhancement-templates',
    sourcePriorityState: 'source_a_first',
    contentTemplateFactsAreSourceBOnly: true,
    exposesPrecomputedVariants: false,
    usesOldDecisionSessionTemplateRecord: false,
    usesPeOnlyClassifier: false,
  };
}

function buildSectionPlan(input: {
  route: PromptEnhancementRouteResult;
  templateId: string;
  sectionKind: string;
  order: number;
  sourceRefs: readonly PromptEnhancementSourceRefV1[];
  sourceA: PromptEnhancementSourceRefV1;
  facts: readonly PromptEnhancementGuidanceFact[];
  required: boolean;
}): PromptEnhancementSectionPlanItemV1 {
  const matchingFacts = input.facts.filter((fact) => isRenderableFact(fact) && sectionKindForFact(fact) === input.sectionKind);
  const sourceRefs = selectSourceRefs(input.sectionKind, input.sourceRefs, input.sourceA, matchingFacts);
  const sourceKind = sourceKindForSection(input.sectionKind, matchingFacts, sourceRefs);
  const sourceEvidenceStatus = evidenceStatusFor(input.route.routeConfidence, matchingFacts);
  const fallbackMode = fallbackModeFor(input.route.fallbackMode);

  return {
    sectionPlanId: `${input.route.contractDecision.routeDecisionId}:section-plan:${input.order}:${input.sectionKind}`,
    sectionId: `${input.route.contractDecision.routeDecisionId}:section:${input.order}:${input.sectionKind}`,
    sectionKind: input.sectionKind,
    templateId: input.templateId,
    familyId: input.route.familyId,
    primaryIntent: input.route.primaryIntent,
    order: input.order,
    sourceRefs,
    sourceKind,
    sourceIds: sourceRefs.map((ref) => ref.sourceId),
    sourceEvidenceStatus,
    slotEvidenceStatus: slotEvidenceStatusFor(input.sectionKind, sourceEvidenceStatus, matchingFacts),
    slotObligations: slotObligationsFor(input.sectionKind, input.route.capabilityOverlays),
    baselineSourceSignalSlot: input.route.selectedPreset.baselineSourceSignalSlot,
    requirementSourceStatus: requirementSourceStatusFor(input.route.familyId, input.sectionKind, matchingFacts),
    isRequired: input.required || isMandatorySurvivorSection(input.sectionKind, input.route.capabilityOverlays, matchingFacts),
    isEditable: true,
    removalFeedbackPolicy: 'typed_event_required',
    safetyFlags: safetyFlagsFor(input.sectionKind, input.route.capabilityOverlays, matchingFacts),
    sensitivityFlags: sensitivityFlagsFor(matchingFacts),
    validationStatus: validationStatusFor(input.route.noPopup),
    fallbackMode,
    callVisibilityMode: callVisibilityModeFor(input.route.selectedPreset.callVisibilityMode),
    deterministicTextBasisPolicy: 'structured_parts',
    textDraftRef: `composer_pending:${input.sectionKind}`,
    // The section's why-help refs (they surface as whyHelpReasonCodes on the
    // composed section). An under-evidenced route that still shows did so ONLY
    // through the gate's locked high-risk exception — the public-safe reason
    // code rides this EXISTING surface so the popup can explain itself; the
    // label wording for it is content, owned elsewhere. Codes only, no text.
    structuredContentPartRefs: [
      ...(matchingFacts.length > 0
        ? matchingFacts.map((fact) => promptEnhancementGuidanceFactRefIdV1(fact.factId))
        : [`section_kind:${input.sectionKind}`]),
      ...(input.route.ladderResolution.state === 'under_evidenced'
        ? ['gate_reason:under_evidenced_high_risk_exception']
        : []),
    ],
    supportedActions: ['use_current_body', 'use_original', 'shorter', 'more_thorough', 'more_project_grounded', 'apply_details'],
    contentTemplateRuntimeSeamUse: 'none',
    handoffCapabilityFlags: input.route.capabilityOverlays.includes('capability.decomposition_candidate')
      ? ['metadata_only_no_sequence_runtime']
      : ['no_runtime_sequence_v1'],
  };
}

export function normalizeGuidanceFacts(
  facts: readonly PromptEnhancementGuidanceFact[],
): readonly PromptEnhancementGuidanceFact[] {
  return facts.map((fact) => ({
    ...fact,
    targetSectionKind: fact.targetSectionKind || SECTION_KIND_BY_ACTION[fact.suggestedActionKind],
    mergePolicy: fact.mergePolicy ?? 'standalone',
    shortenPolicy: fact.shortenPolicy ?? (fact.priority === 'required_survivor' ? 'must_preserve_full_meaning' : 'may_shorten_wording'),
    shortenFloor: fact.shortenFloor ?? (fact.priority === 'required_survivor' ? 'section_summary' : 'one_clause'),
    registerRoleSource: fact.registerRoleSource ?? 'none',
    wordingHintPolicy: fact.wordingHintPolicy ?? 'do_not_use_wording_hint',
    wordingHintSourceIds: fact.wordingHintSourceIds ?? [],
    profileContextRefs: fact.profileContextRefs ?? [],
    llmCallPolicy: fact.llmCallPolicy ?? 'not_applicable_deterministic',
  }));
}

/**
 * WHICH SECTION DOES THIS FACT BELONG TO — the single answer (prohibition 15: one map, one meaning).
 *
 * 🔴 Exported at HV-2's finding (§17.7). This resolution was correct and private, so the RENDERER
 * answered the same question a second way — by reading `targetSectionKind` raw. Every content-
 * carrying fact ships that field EMPTY (`guidance-facts.ts:270`) and relies on the action fallback,
 * so a fact was planned into `project_grounding_facts` here and then dropped by the renderer asked
 * for that same section. Measured: zero fact-value lines under all twelve production section kinds.
 * The fix is not a second fallback in the renderer — it is this function being the only one.
 */
export function promptEnhancementSectionKindForFactV1(fact: PromptEnhancementGuidanceFact): string {
  return fact.targetSectionKind || SECTION_KIND_BY_ACTION[fact.suggestedActionKind];
}

function sectionKindForFact(fact: PromptEnhancementGuidanceFact): string {
  return promptEnhancementSectionKindForFactV1(fact);
}

function sourceARef(sourceRefs: readonly PromptEnhancementSourceRefV1[]): PromptEnhancementSourceRefV1 {
  const sourceA = sourceRefs.find((ref) => ref.sourceKind === 'source_a_user_prompt');
  if (!sourceA) {
    throw new Error('Phase 4 section planning requires a Source A original prompt ref');
  }
  return sourceA;
}

function selectSourceRefs(
  sectionKind: string,
  sourceRefs: readonly PromptEnhancementSourceRefV1[],
  sourceA: PromptEnhancementSourceRefV1,
  facts: readonly PromptEnhancementGuidanceFact[],
): readonly PromptEnhancementSourceRefV1[] {
  if (sectionKind === 'original_request_or_goal') return [sourceA];
  const factSourceIds = new Set(facts.flatMap((fact) => fact.sourceIds));
  const matched = sourceRefs.filter((ref) => factSourceIds.has(ref.sourceId) || factSourceIds.has(ref.sourceRefId));
  if (matched.length > 0) return matched;
  if (sectionKind === 'source_signal_guidance') {
    const sourceB = sourceRefs.filter((ref) => ref.sourceKind !== 'source_a_user_prompt');
    return sourceB.length > 0 ? sourceB : [sourceA];
  }
  return [sourceA];
}

function sourceKindForSection(
  sectionKind: string,
  facts: readonly PromptEnhancementGuidanceFact[],
  sourceRefs: readonly PromptEnhancementSourceRefV1[],
): PromptEnhancementSourceKind {
  if (sectionKind === 'original_request_or_goal') return 'source_a_user_prompt';
  const factSourceKind = facts.find((fact) => isRenderableFact(fact))?.sourceType;
  if (factSourceKind) return SOURCE_KIND_BY_GUIDANCE_SOURCE[factSourceKind];
  return sourceRefs.find((ref) => ref.sourceKind !== 'source_a_user_prompt')?.sourceKind ?? 'source_a_user_prompt';
}

function evidenceStatusFor(
  routeConfidence: PromptEnhancementRouteResult['routeConfidence'],
  facts: readonly PromptEnhancementGuidanceFact[],
): PromptEnhancementEvidenceStatus {
  if (facts.some((fact) => fact.sourceEvidenceState === 'missing')) return 'unknown';
  if (facts.some((fact) => fact.sourceEvidenceState === 'stale_or_unknown')) return 'stale';
  if (routeConfidence === 'missing') return 'unknown';
  if (facts.some((fact) => fact.sourceEvidenceState === 'conflicting')) return 'unknown';
  return 'present';
}

function slotEvidenceStatusFor(
  sectionKind: string,
  sourceEvidenceStatus: PromptEnhancementEvidenceStatus,
  facts: readonly PromptEnhancementGuidanceFact[],
): PromptEnhancementEvidenceStatus {
  if (sectionKind === 'original_request_or_goal') return 'present';
  if (facts.some((fact) => fact.renderPolicy === 'fallback_only')) return 'failed_fallback';
  return sourceEvidenceStatus;
}

function requirementSourceStatusFor(
  familyId: PromptEnhancementFamilyId,
  sectionKind: string,
  facts: readonly PromptEnhancementGuidanceFact[],
): PromptEnhancementEvidenceStatus {
  if (sectionKind === 'requirement_source_state' || familyId === 'review_verification' || familyId === 'planning_spec') {
    return facts.some((fact) => fact.guidanceKind === 'requirement_source_state' && fact.sourceEvidenceState !== 'missing')
      ? 'present'
      : 'unknown';
  }
  return 'not_applicable';
}

function isMandatorySurvivorSection(
  sectionKind: string,
  capabilities: readonly PromptEnhancementCapabilityId[],
  facts: readonly PromptEnhancementGuidanceFact[],
): boolean {
  // Grounding is required only when it HAS a fact — the same rule as its candidacy above; a
  // factless required section is exactly what the locked drop-criteria call stage (a).
  if (sectionKind === 'project_grounding_facts' && !facts.some(isRenderableFact)) return false;
  return capabilities.some((capability) => SECTION_REQUIRED_BY_CAPABILITY[capability] === sectionKind) ||
    facts.some((fact) => fact.priority === 'required_survivor');
}

/**
 * Which sections each capability overlay applies to.
 *
 * Transcribed from the milestone's capability-overlay table (analysis L3325-3335, mirrored in the
 * dev plan at L6008). Every row of that table names the sections its capability affects — the
 * overlays were never meant to be global. Applying them to every section instead made the flags a
 * constant: every section reported the same set, so nothing downstream could tell one from another,
 * and `risk_or_rollback` sat on `behavior_preservation` where it means nothing.
 *
 * The dev plan states the bound directly: "Scope must remain bounded and must not add noisy
 * rollback text to unrelated low-risk prompts."
 *
 * ⚠️ Only two of these entries are consulted today — `confirmation_needed` and `risk_or_rollback`,
 * the only capabilities that have ever contributed a safety flag. The rest are here because this is
 * the transcription of the design table and splitting it would leave the record in two places; they
 * become live the moment another capability contributes a flag. Do not read a nine-entry map as
 * proof that nine capabilities are scoped — `capabilityScopedSafetyFlagsV1` names the two that are,
 * and a test pins that list so a third cannot be added silently.
 */
const SECTIONS_BY_CAPABILITY: Partial<Record<PromptEnhancementCapabilityId, readonly string[]>> = {
  'capability.risk_or_rollback': [
    'risk_safety_or_confirmation', 'verification_or_test_plan', 'behavior_preservation', 'handoff_or_sequence_candidate',
  ],
  'capability.confirmation_needed': [
    'risk_safety_or_confirmation', 'verification_or_test_plan', 'behavior_preservation', 'handoff_or_sequence_candidate',
  ],
  'capability.verification_required': ['verification_or_test_plan', 'acceptance_or_output_expectation'],
  'capability.reproduction_or_evidence_needed': [
    'reproduction_or_evidence', 'verification_or_test_plan', 'uncertainty_or_clarification',
  ],
  'capability.behavior_preservation': ['behavior_preservation', 'context_and_constraints', 'verification_or_test_plan'],
  'capability.project_grounding': ['project_grounding_facts'],
  'capability.source_signal_guidance': [
    'source_signal_guidance', 'approach_or_steps', 'verification_or_test_plan', 'risk_safety_or_confirmation',
  ],
  'capability.adversarial_review': [
    'requirement_source_state', 'verification_or_test_plan', 'acceptance_or_output_expectation', 'uncertainty_or_clarification',
  ],
  'capability.decomposition_candidate': ['handoff_or_sequence_candidate'],
};

/**
 * The capabilities whose overlay actually reaches `safetyFlags`, and are therefore scoped.
 *
 * Exported so a test can pin it: the map above lists every capability in the design table, but only
 * these contribute a flag, and a reader who assumes otherwise will believe scoping covers more than
 * it does. Adding a third capability to `safetyFlagsFor` must fail that test until this list agrees.
 */
export const capabilityScopedSafetyFlagsV1: readonly PromptEnhancementCapabilityId[] = [
  'capability.confirmation_needed',
  'capability.risk_or_rollback',
];

function capabilityAppliesToSection(
  capability: PromptEnhancementCapabilityId,
  sectionKind: string,
): boolean {
  return SECTIONS_BY_CAPABILITY[capability]?.includes(sectionKind) ?? false;
}

/**
 * The safety flags EVERY generated section carries, whatever the route asked for.
 *
 * Unconditional, and deliberately so: these are not capability overlays. Every generated section
 * must be honest about its sources and must not escalate authority, and the design does not scope
 * them to a subset.
 *
 * ⚠️ EXPORTED because their unconditional-ness is load-bearing elsewhere: I2's pruner must decide
 * whether a section is *safety material*, and `safetyFlags.length > 0` cannot answer that when two
 * flags are on every section. Measured during I2: with that test, the floor swallowed 7 of 7
 * sections on a real body and the pruner was inert. A consumer needs to know which flags MEAN
 * something, so the list lives here rather than being re-typed by whoever asks.
 */
export const PROMPT_ENHANCEMENT_UNCONDITIONAL_SAFETY_FLAGS_V1: readonly string[] = [
  'source_honesty',
  'no_authority_escalation',
];

function safetyFlagsFor(
  sectionKind: string,
  capabilities: readonly PromptEnhancementCapabilityId[],
  facts: readonly PromptEnhancementGuidanceFact[],
): readonly string[] {
  const flags = new Set(PROMPT_ENHANCEMENT_UNCONDITIONAL_SAFETY_FLAGS_V1);
  if (
    sectionKind === 'risk_safety_or_confirmation'
    || (capabilities.includes('capability.confirmation_needed')
      && capabilityAppliesToSection('capability.confirmation_needed', sectionKind))
  ) {
    flags.add('sensitive_action_confirmation');
  }
  if (
    capabilities.includes('capability.risk_or_rollback')
    && capabilityAppliesToSection('capability.risk_or_rollback', sectionKind)
  ) {
    flags.add('risk_or_rollback');
  }
  // Fact-supplied hooks are untouched: they arrive per fact, and facts are already matched to their
  // own section, so these were never the blanket half.
  for (const fact of facts) {
    for (const hook of fact.safetyHooks) flags.add(hook);
  }
  return [...flags];
}

function sensitivityFlagsFor(facts: readonly PromptEnhancementGuidanceFact[]): readonly string[] {
  return facts
    .filter((fact) => fact.riskLevel === 'high' || fact.riskLevel === 'sensitive_authority_risky')
    .map((fact) => `risk:${fact.riskLevel}`);
}

function validationStatusFor(noPopup: boolean): PromptEnhancementValidationStatus {
  return noPopup ? 'no_popup' : 'valid';
}

function fallbackModeFor(routeFallbackMode: PromptEnhancementRouteResult['fallbackMode']): PromptEnhancementFallbackMode {
  return routeFallbackMode === 'skip_no_popup' ? 'no_popup' : 'none';
}

function callVisibilityModeFor(mode: PromptEnhancementCallVisibilityMode): PromptEnhancementCallVisibilityMode {
  return mode;
}

function isRenderableFact(fact: PromptEnhancementGuidanceFact): boolean {
  return fact.renderPolicy === 'render_as_section' || fact.renderPolicy === 'render_as_inline_clause';
}

function isMetadataOnlyFact(fact: PromptEnhancementGuidanceFact): boolean {
  return fact.renderPolicy === 'metadata_only' || fact.renderPolicy === 'why_help_only';
}

function isSuppressedFact(fact: PromptEnhancementGuidanceFact): boolean {
  return fact.priority === 'suppressed' || fact.renderPolicy === 'suppress_with_reason';
}

function isDeferredFact(fact: PromptEnhancementGuidanceFact): boolean {
  return fact.priority === 'deferred_to_ds' || fact.priority === 'handoff_only' || fact.renderPolicy === 'defer_to_normal_ds';
}

function orderedUnique(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter(Boolean))];
}

function isString(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}
