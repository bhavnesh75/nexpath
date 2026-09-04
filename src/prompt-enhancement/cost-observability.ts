import {
  type PromptEnhancementCallVisibilityMode,
  type PromptEnhancementCostCallIdV1,
  type PromptEnhancementCostMeasurementFieldV1,
  type PromptEnhancementCostVisibilityMetadataV1,
  type PromptEnhancementProviderFailureStateV1,
  type PromptEnhancementRuntimeBlockReason,
} from './contracts.js';

export const PROMPT_ENHANCEMENT_COST_PROVIDER_V1 = 'openai';
export const PROMPT_ENHANCEMENT_COST_MODEL_V1 = 'gpt-4o-mini';
// The sequence PLANNER (P1) alone runs a three-stage reasoning chain (inventory → group → slice) in one
// structured call — heavier than the single-purpose classifier calls the shared constant was chosen for
// (§6.2c). Owner-authorised to use a stronger-but-not-extremely-expensive model for THIS one call
// only; every other call stays on the shared cost model above.
export const PROMPT_ENHANCEMENT_SEQUENCE_PLANNER_MODEL_V1 = 'gpt-4o';
export const PROMPT_ENHANCEMENT_COST_PRICING_SOURCE_URL_V1 = 'https://developers.openai.com/api/docs/models/gpt-4o-mini';
export const PROMPT_ENHANCEMENT_COST_PRICING_ACCESS_DATE_V1 = '2026-07-27';
export const PROMPT_ENHANCEMENT_COST_PROCESSING_MODE_ASSUMPTION_V1 = 'standard_text_token_api';
export const PROMPT_ENHANCEMENT_COST_CONTEXT_TIER_ASSUMPTION_V1 = 'standard_context';
export const PROMPT_ENHANCEMENT_COST_ADD_ON_ASSUMPTION_V1 = 'no_tool_container_search_addons';
export const PROMPT_ENHANCEMENT_COST_REGIONAL_DATA_RESIDENCY_ASSUMPTION_V1 = 'no_regional_or_data_residency_uplift_selected';
export const PROMPT_ENHANCEMENT_COST_INPUT_TOKEN_CAP_V1 = 8_000;
export const PROMPT_ENHANCEMENT_COST_OUTPUT_TOKEN_CAP_V1 = 2_000;
/**
 * The sequence planner's own output budget. Deliberately NOT the composer cap above: the planner
 * emits a reason per item and per confirmation, and those reasons are the tokens — dropping them to
 * fit is what turns a plan into an unexplained list. Sized against the locked 30-item maximum.
 *
 * A truncated plan is invalid rather than degraded, so the hard cap exists to make a long plan
 * finish rather than to let a long one arrive half-written.
 */
export const PROMPT_ENHANCEMENT_SEQUENCE_PLANNER_OUTPUT_TOKEN_CAP_V1 = 1_500;
export const PROMPT_ENHANCEMENT_SEQUENCE_PLANNER_OUTPUT_TOKEN_HARD_CAP_V1 = 4_000;

/**
 * The batch composer's output budget: every remaining prompt's wording in ONE reply.
 *
 * Not the per-item figures — those price a call per item, and the batch is one call over the whole
 * list, so they do not transfer. Derived from the locked bounds rather than borrowed: a later item
 * is deliberately light (its slice, a rewrite, and one section or none), which lands around 300
 * tokens, and the maximum list is 30 items of which the batch writes 29. The hard cap covers that
 * worst case with room for the closing recap, which carries every task's slice verbatim; the normal
 * cap covers the ordinary sequence of a handful of items.
 *
 * PROVISIONAL. A truncated batch is invalid rather than degraded, so these decide when a long
 * sequence is possible at all — and they are derived, not measured. The measurement is owed.
 */
/**
 * The summary line's output budget. One sentence — a cap that would fit a paragraph is an
 * invitation to write one, and what this line must not become is a preview of the work.
 */
export const PROMPT_ENHANCEMENT_SEQUENCE_SUMMARY_OUTPUT_TOKEN_CAP_V1 = 200;

export const PROMPT_ENHANCEMENT_SEQUENCE_BATCH_OUTPUT_TOKEN_CAP_V1 = 4_000;
export const PROMPT_ENHANCEMENT_SEQUENCE_BATCH_OUTPUT_TOKEN_HARD_CAP_V1 = 12_000;
// Composer/route call budget. Raised from 10s (2026-08-07): the bounded composer asks for up to
// PROMPT_ENHANCEMENT_COST_OUTPUT_TOKEN_CAP_V1 tokens as one JSON object covering every planned
// section, which measures 9-14s for 6-8 sections — so a 10s cap cut the call off before it could
// finish and the body always fell back to the deterministic render. 45s keeps headroom for a slow
// provider while still fitting inside the host prompt-submit hook budget.
/**
 * The sentinel for a value this codebase has not measured yet.
 *
 * Named rather than left absent, because a refusal is findable and an absence is not: a reader
 * searching for what is unpinned finds the rows carrying this, where a missing field or a zero
 * would read as an answer.
 */
export const PROMPT_ENHANCEMENT_MEASUREMENT_PENDING_V1 = 'blocked_pending_source_value' as const;

export const PROMPT_ENHANCEMENT_COST_TIMEOUT_MS_V1 = 45_000;
export const PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1 = 3;

/**
 * The sequence calls' own timeouts — named, so they are not the composer's by accident.
 *
 * 🔴 The caps beside them were given their own names for exactly this reason: the composer's figures
 * were sized for the composer, and a borrowed timeout is the same mistake as a borrowed cap. These
 * three inherited the global value silently until it was measured, which meant retuning the
 * composer's number would have moved the planner's and the batch's with it, and nothing at either
 * call site would have said so.
 *
 * ⚠️ They all currently hold the SAME value as the global. That is the point rather than a
 * shortcut: the measurement says the value fits, so naming it is the whole change — and the three
 * can now move apart without anyone having to notice they were ever joined.
 */

/** Measured 2026-08-13: 20.3 s for one attempt at a worst case of 29 separable intents. */
export const PROMPT_ENHANCEMENT_SEQUENCE_PLANNER_TIMEOUT_MS_V1 = 45_000;

/**
 * Measured 2026-08-13: 35.2 s for ONE batch over 29 items.
 *
 * ⚠️ The thin one — 78 % of this value. Left where it is deliberately: a longer per-call timeout
 * makes the worst-case PATH longer, and the send path already measures 82.8 s against a 90 s
 * registered hook. Trading a rare timeout for a more common hook overrun is the worse trade, and
 * the hook is the tighter constraint.
 */
export const PROMPT_ENHANCEMENT_SEQUENCE_BATCH_TIMEOUT_MS_V1 = 45_000;

/**
 * ⏳ NOT measured. It takes the global's value EXPLICITLY rather than by inheritance, so the one
 * unmeasured member of the three is visible as unmeasured instead of looking like the other two.
 */
export const PROMPT_ENHANCEMENT_SEQUENCE_SUMMARY_TIMEOUT_MS_V1 = 45_000;

export const PROMPT_ENHANCEMENT_COST_MEASUREMENT_FIELDS_V1: readonly PromptEnhancementCostMeasurementFieldV1[] = [
  'call_id',
  'owner',
  'trigger',
  'provider',
  'model',
  'planned_call_count',
  'used_call_count',
  'input_token_estimate',
  'output_token_estimate',
  'timeout_ms',
  'retry_count',
  'latency_ms',
  'status',
  'fallback_reason',
  'provider_availability_state',
  'product_scope_state',
];

export type PromptEnhancementCostCallProductStateV1 =
  | 'accepted_v1_llm_backed'
  | 'included_in_baseline_no_separate_v1_call'
  | 'conditional_v1_later_popup_if_llm_reasoning'
  | 'future_runtime_gated_not_cost_gated'
  | 'future_product_scope_not_in_v1';

export type PromptEnhancementCostCallRequirementStateV1 =
  | 'required_when_contract_executes'
  | 'optional_product_selected_when_triggered'
  | 'included_in_baseline_no_separate_call'
  | 'conditional_if_later_popup_llm_reasoning'
  | 'future_only_not_v1';

export type PromptEnhancementCostCallTriggerV1 =
  | 'prepare'
  | 'directional_action'
  | 'additional_details'
  | 'feedback'
  | 'safety_review'
  | 'sequence_metadata'
  | 'future_action';

export type PromptEnhancementCostCallUserVisibleTriggerV1 =
  | 'enhancement_popup_shown'
  | 'shorter_action_clicked'
  | 'more_thorough_action_clicked'
  | 'more_project_grounded_action_clicked'
  | 'additional_details_apply_clicked'
  | 'feedback_submitted'
  | 'later_popup_feedback_decision'
  | 'safety_review_needed'
  | 'sequence_metadata_candidate'
  | 'future_explicit_action'
  | 'not_user_visible_included_in_baseline';

export type PromptEnhancementCostWorksheetCostStateV1 =
  | 'accepted_in_private_cost_visibility_packet_not_public_constant'
  | 'zero_no_separate_call'
  | 'future_scope_not_bounded';

export interface PromptEnhancementAcceptedCostCallInventoryRowV1 {
  callId: PromptEnhancementCostCallIdV1;
  owner: 'content_semantics';
  ownerResearchItem: 'cost_visibility';
  implementationModule: 'src/prompt-enhancement/cost-observability.ts';
  trigger: PromptEnhancementCostCallTriggerV1;
  userVisibleTrigger: PromptEnhancementCostCallUserVisibleTriggerV1;
  hiddenRuntimeTrigger: string;
  currentVsNew: 'new_pe_call_surface';
  requirementState: PromptEnhancementCostCallRequirementStateV1;
  productState: PromptEnhancementCostCallProductStateV1;
  provider: typeof PROMPT_ENHANCEMENT_COST_PROVIDER_V1;
  model: typeof PROMPT_ENHANCEMENT_COST_MODEL_V1;
  pricingSourceUrl: typeof PROMPT_ENHANCEMENT_COST_PRICING_SOURCE_URL_V1;
  pricingAccessDate: typeof PROMPT_ENHANCEMENT_COST_PRICING_ACCESS_DATE_V1;
  processingModeAssumption: typeof PROMPT_ENHANCEMENT_COST_PROCESSING_MODE_ASSUMPTION_V1;
  contextTierAssumption: typeof PROMPT_ENHANCEMENT_COST_CONTEXT_TIER_ASSUMPTION_V1;
  addOnCostAssumption: typeof PROMPT_ENHANCEMENT_COST_ADD_ON_ASSUMPTION_V1;
  regionalDataResidencyAssumption: typeof PROMPT_ENHANCEMENT_COST_REGIONAL_DATA_RESIDENCY_ASSUMPTION_V1;
  inputTokenCap: typeof PROMPT_ENHANCEMENT_COST_INPUT_TOKEN_CAP_V1;
  /**
   * The call's own output budget, and NOT the composer's by construction.
   *
   * 🔴 Was typed as the composer constant, which meant a row could report only 2,000 tokens — and
   * two calls in this inventory are sized against a different thing entirely. A batch that writes a
   * whole sequence in one reply needs several times that, and a truncated batch is invalid rather
   * than shorter, so a row unable to state its real cap understates the one call where the cap
   * decides whether anything ships at all.
   */
  outputTokenCap: number | typeof PROMPT_ENHANCEMENT_MEASUREMENT_PENDING_V1;
  /**
   * The timeout this call actually runs under.
   *
   * 🔴 Same defect, and the sharper one. Typed as the single global constant, a row could report
   * only 45 s — which is the composer's measured value, sized for a different call shape — so the
   * record could not express a measured timeout for the calls this milestone exists to measure. A
   * borrowed timeout is the same mistake as a borrowed cap, and a type that can hold nothing else
   * makes the borrowing invisible.
   *
   * The sibling inventory in this file already solved it: a real number, or an explicit not-yet
   * sentinel. This follows that shape rather than inventing a third.
   */
  timeoutMs: number | typeof PROMPT_ENHANCEMENT_MEASUREMENT_PENDING_V1;
  retryCount: typeof PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1;
  cacheAssumption: 'no_cache_savings_no_addons';
  fallbackReasons: readonly PromptEnhancementRuntimeBlockReason[];
  deterministicLocalFallback: 'public_safe_no_generated_content_or_previous_valid_body';
  sendOriginalFallbackState: 'send_original_available_when_safety_allows' | 'not_applicable_future_scope';
  latencyImpact: 'wait_for_full_result_under_timeout';
  latencyStateLabel: 'wait_for_full_result_under_timeout';
  uiProviderApiLatencyStateLabel:
    | 'available_wait_for_full_result'
    | 'product_scope_not_in_v1';
  telemetrySafeMeasurementFields: readonly PromptEnhancementCostMeasurementFieldV1[];
  productValueSignoffRef: 'accepted_with_product_scope_notes';
  conservativeCallsPerMonth: number;
  expectedCallsPerMonth: number;
  heavyCallsPerMonth: number;
  worstCaseCallsPerMonth: number | 'not_bounded_for_future_v1';
  conservativeMonthlyCostState: PromptEnhancementCostWorksheetCostStateV1;
  expectedMonthlyCostState: PromptEnhancementCostWorksheetCostStateV1;
  heavyMonthlyCostState: PromptEnhancementCostWorksheetCostStateV1;
  separateLlmCallInV1: boolean;
  skipCondition: string;
  passFailStatus: 'accepted_with_product_scope_notes' | 'future_scope';
  openOwnerDecision:
    | 'none_for_accepted_product_scope'
    | 'later_written_yes_no_required_for_architecture_reopen'
    | 'future_product_scope_requires_new_decision';
  costVisibilityCanWeakenBehavior: false;
  costVisibilityCanDisableCall: false;
  reasonCodes: readonly string[];
}

export interface PromptEnhancementCostMeasurementInputV1 {
  callId: PromptEnhancementCostCallIdV1;
  plannedCallCount: number;
  usedCallCount: number;
  latencyMs?: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  status: 'planned' | 'used' | 'fallback' | 'provider_unavailable' | 'timeout' | 'product_scope_not_in_v1';
  fallbackReason?: PromptEnhancementRuntimeBlockReason;
  providerFailureState?: PromptEnhancementProviderFailureStateV1;
  productScopeState?: PromptEnhancementCostCallProductStateV1;
  rawPromptBody?: string;
  rawGeneratedBody?: string;
  rawSourceExcerpt?: string;
  rawFeedbackText?: string;
  rawAssistantResponse?: string;
  rawError?: string;
}

export interface PromptEnhancementCostMeasurementRecordV1 {
  callId: PromptEnhancementCostCallIdV1;
  owner: 'content_semantics';
  trigger: PromptEnhancementCostCallTriggerV1;
  provider: typeof PROMPT_ENHANCEMENT_COST_PROVIDER_V1;
  model: typeof PROMPT_ENHANCEMENT_COST_MODEL_V1;
  plannedCallCount: number;
  usedCallCount: number;
  latencyMs?: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  /** Carried from the inventory row, so a measured value reaches the record instead of the constant. */
  timeoutMs: number | typeof PROMPT_ENHANCEMENT_MEASUREMENT_PENDING_V1;
  retryCount: typeof PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1;
  status: PromptEnhancementCostMeasurementInputV1['status'];
  fallbackReason: PromptEnhancementRuntimeBlockReason;
  providerAvailabilityState: 'available' | 'unavailable_by_provider_api' | 'not_applicable';
  providerFailureState: PromptEnhancementProviderFailureStateV1;
  productScopeState: PromptEnhancementCostCallProductStateV1;
  telemetrySafeMeasurementFields: readonly PromptEnhancementCostMeasurementFieldV1[];
  rawPromptBodyExcluded: true;
  rawGeneratedBodyExcluded: true;
  rawSourceExcerptExcluded: true;
  rawFeedbackTextExcluded: true;
  rawAssistantResponseExcluded: true;
  rawErrorExcluded: true;
  costVisibilityCanWeakenBehavior: false;
}

export type PromptEnhancementCostRuntimeFlowSurfaceV1 =
  | 'prompt_start_prepare'
  | 'enhancement_popup'
  | 'popup_action'
  | 'stop_or_extension_delivery'
  | 'store_feedback_memory';

export interface PromptEnhancementCostRuntimeFlowEvidenceInputV1 {
  evidenceId: string;
  enhancementId: string;
  requestId: string;
  bodyId?: string;
  bodyRevision?: number;
  generatedOriginId?: string;
  deliveryAttemptId?: string;
  callVisibilityMetadata: PromptEnhancementCostVisibilityMetadataV1;
  measurementInputs: readonly PromptEnhancementCostMeasurementInputV1[];
  observedSurfaces: readonly PromptEnhancementCostRuntimeFlowSurfaceV1[];
  storeRecordRefs?: readonly string[];
  telemetrySyncState?: 'not_attempted' | 'off_buffered_locally' | 'sync_succeeded' | 'sync_failed_measurement_still_local';
  weakeningCheck?: PromptEnhancementCostWeakeningCheckInputV1;
  rawPromptBody?: string;
  rawGeneratedBody?: string;
  rawSourceExcerpt?: string;
  rawFeedbackText?: string;
  rawError?: string;
}

export interface PromptEnhancementCostRuntimeFlowEvidencePacketV1 {
  evidenceId: string;
  evidenceKind: 'prompt_start_popup_delivery_cost_latency_v1';
  enhancementId: string;
  requestId: string;
  bodyId?: string;
  bodyRevision?: number;
  generatedOriginId?: string;
  deliveryAttemptId?: string;
  observedSurfaces: readonly PromptEnhancementCostRuntimeFlowSurfaceV1[];
  callVisibilityMetadata: PromptEnhancementCostVisibilityMetadataV1;
  measurementRecords: readonly PromptEnhancementCostMeasurementRecordV1[];
  aggregate: {
    plannedCallCount: number;
    usedCallCount: number;
    latencyMsTotal: number;
    fallbackCount: number;
    providerUnavailableCount: number;
    timeoutCount: number;
  };
  storeRecordRefs: readonly string[];
  telemetrySyncState: 'not_attempted' | 'off_buffered_locally' | 'sync_succeeded' | 'sync_failed_measurement_still_local';
  privacyExclusions: {
    rawPromptBodyExcluded: true;
    rawGeneratedBodyExcluded: true;
    rawSourceExcerptExcluded: true;
    rawFeedbackTextExcluded: true;
    rawErrorExcluded: true;
    localWriteAlreadySafe: true;
  };
  costVisibilityCanWeakenBehavior: false;
  productValueDiscussionIsRuntimeLimiter: false;
  reasonCodes: readonly string[];
}

export interface PromptEnhancementCostWeakeningCheckInputV1 {
  disabledBecauseOfCost?: boolean;
  deferredBecauseOfCost?: boolean;
  frequencyGatedBecauseOfCost?: boolean;
  deterministicDowngradeBecauseOfCost?: boolean;
  promptShrunkBecauseOfCost?: boolean;
  explicitUserActionOnlyBecauseOfCost?: boolean;
  providerFailureState?: PromptEnhancementProviderFailureStateV1;
}

export type PromptEnhancementCurrentSourceCostWorksheetStateV1 =
  | 'blocked_pending_owner'
  | 'accepted_zero_unless_source_proven'
  | 'accepted_source_mean_assumption';

export interface PromptEnhancementCurrentSourceCostCallInventoryRowV1 {
  baselineCallId:
    | 'current_profile_classifier'
    | 'current_stream_b_presence_classifier'
    | 'current_stage_classifier'
    | 'current_sensitive_action_micro_clearance'
    | 'current_pinch_label_generator'
    | 'current_decision_session_option_generator'
    | 'current_content_template_grounding'
    | 'current_content_template_prompt_param_extraction'
    | 'current_content_template_simpler_derive'
    | 'current_content_template_autogen';
  sourceLayer: string;
  ownerResearchItem: 'cost_visibility';
  implementationModule: string;
  budgetBucket: 'current_always_on_nexpath_baseline_not_pe';
  currentVsNew: 'current_source_call_surface';
  requirementState: 'required_current_source_row' | 'current_source_row_if_reachable';
  userVisibleTrigger: 'prompt_submit' | 'stop_decision_session' | 'post_popup_best_effort' | 'not_user_visible';
  hiddenRuntimeTrigger: string;
  skipCondition: string;
  provider: typeof PROMPT_ENHANCEMENT_COST_PROVIDER_V1;
  model: typeof PROMPT_ENHANCEMENT_COST_MODEL_V1;
  pricingSourceUrl: typeof PROMPT_ENHANCEMENT_COST_PRICING_SOURCE_URL_V1;
  pricingAccessDate: typeof PROMPT_ENHANCEMENT_COST_PRICING_ACCESS_DATE_V1;
  processingModeAssumption: typeof PROMPT_ENHANCEMENT_COST_PROCESSING_MODE_ASSUMPTION_V1;
  contextTierAssumption: typeof PROMPT_ENHANCEMENT_COST_CONTEXT_TIER_ASSUMPTION_V1;
  addOnCostAssumption: typeof PROMPT_ENHANCEMENT_COST_ADD_ON_ASSUMPTION_V1;
  regionalDataResidencyAssumption: typeof PROMPT_ENHANCEMENT_COST_REGIONAL_DATA_RESIDENCY_ASSUMPTION_V1;
  assumedInputTokens: number | 'blocked_pending_source_value';
  maxOutputTokens: number;
  timeoutMs: number | 'source_undefined';
  retryPolicyState:
    | 'source_retry_not_declared_fail_safe'
    | 'source_one_retry_on_validation_failure'
    | 'source_best_effort_budget_gate_no_public_limit'
    | 'source_timeout_or_retry_undefined';
  fallbackState: 'deterministic_or_local_fallback' | 'null_or_no_action_fallback' | 'static_fallback';
  deterministicLocalFallback: 'deterministic_or_local_fallback' | 'null_or_no_action_fallback' | 'static_fallback';
  sendOriginalFallbackState: 'not_applicable_current_source_baseline';
  latencyImpact:
    | 'current_prompt_submit_pipeline_latency'
    | 'current_stop_decision_session_latency'
    | 'current_post_popup_best_effort_latency'
    | 'not_user_visible_current_source_latency';
  uiProviderApiLatencyStateLabel:
    | 'current_source_fail_safe_no_pe_content'
    | 'current_source_static_or_null_fallback'
    | 'current_source_best_effort_no_popup_block'
    | 'current_source_unknown_timeout_measurement';
  conservativeCallsPerMonth: number | PromptEnhancementCurrentSourceCostWorksheetStateV1;
  expectedCallsPerMonth: number | PromptEnhancementCurrentSourceCostWorksheetStateV1;
  heavyCallsPerMonth: number | PromptEnhancementCurrentSourceCostWorksheetStateV1;
  worstCaseCallsPerMonth: number | PromptEnhancementCurrentSourceCostWorksheetStateV1 | 'source_undefined';
  conservativeMonthlyCostState: 'accepted_in_private_cost_visibility_packet_not_public_constant' | 'zero_no_separate_call';
  expectedMonthlyCostState: 'accepted_in_private_cost_visibility_packet_not_public_constant' | 'zero_no_separate_call';
  heavyMonthlyCostState: 'accepted_in_private_cost_visibility_packet_not_public_constant' | 'zero_no_separate_call';
  worksheetStatus: PromptEnhancementCurrentSourceCostWorksheetStateV1;
  passFailStatus:
    | 'blocked_pending_owner'
    | 'blocked_pending_source_value'
    | 'accepted_zero_unless_source_proven'
    | 'accepted_source_mean_assumption';
  openOwnerDecision:
    | 'current_source_monthly_values_pending'
    | 'source_reachability_reopen_if_proven'
    | 'source_input_value_pending'
    | 'source_timeout_measurement_pending'
    | 'none_for_source_mean_assumption';
  rawPromptTextExcludedFromTelemetry: true;
  notPeComposerBudget: true;
  costVisibilityCanWeakenBehavior: false;
}

const FALLBACK_REASONS: readonly PromptEnhancementRuntimeBlockReason[] = [
  'provider_unavailable',
  'provider_refused',
  'timeout',
  'validation_failed',
  'safety_failed',
  'not_applicable',
];

const CALL_ROWS: readonly PromptEnhancementAcceptedCostCallInventoryRowV1[] = [
  row({
    // ⚠️ **WHAT THIS CALL IS SENT CHANGED AT I2 (phase 36), MEASURED 2026-08-20.** The section
    // pruner used to run BETWEEN planning and composition, so the composer only ever saw survivors.
    // On the owner's ruling it now runs AFTER composition, because stage (a)'s question became "no
    // fact AND no draft" and a draft cannot be consulted before the composer produces it.
    //
    // 🔑 The call COUNT is unchanged — still exactly one per shown popup, asserted by a fixture
    // (prohibition 3: no new call). What changed is the size of that one call:
    //   · INPUT — measured on a real plan for an ordinary debug prompt: 7 planned sections reach the
    //     composer where 3 survivors used to, ≈ +800 chars ≈ +200 tokens of section descriptors;
    //   · OUTPUT — up to 4 more section drafts, ≈ 48 words ≈ 65 tokens each, so ≈ +260 tokens.
    // Both sit well inside the 2,000-token output cap this call runs under.
    //
    // ⛔ This RESTORES the load carried before the pruner landed on 2026-08-19 rather than adding a
    // new one, and the owner accepted the trade with the cost stated. Some wording is now paid for
    // and then dropped by the cap — that is intrinsic to judging a draft rather than predicting it.
    //
    // 🔒 The numbers below are LEFT AT THEIR RECORDED VALUES rather than re-set: moving a cost
    // number is the owner's call, and the honest thing is that the measurement is written down where
    // the row can be judged against it. Same treatment as the stage-classifier row's input note.
    callId: 'baseline_pe_composer',
    trigger: 'prepare',
    userVisibleTrigger: 'enhancement_popup_shown',
    hiddenRuntimeTrigger: 'enhancement popup route accepted and provider/source/safety state permits baseline composition',
    requirementState: 'required_when_contract_executes',
    productState: 'accepted_v1_llm_backed',
    calls: [1_575, 2_025, 2_250, 9_000],
    separateLlmCallInV1: true,
    skipCondition: 'skip only for no-popup, provider failure, timeout, invalid/safety/source failure, or generated-origin correctness gates',
    reasonCodes: ['baseline_composer_llm_backed'],
  }),
  row({
    // E6: bounded LLM route decision for NL-heavy prompts the deterministic keyword
    // router soft-skipped. Separate v1 call (route precedes planning, so combining with
    // the composer is a future optimization). Exact cost numbers get gate-rule-4 sign-off at
    // R-track; small output (a route-decision JSON), never a runtime gate.
    callId: 'llm_route_decision_call',
    trigger: 'prepare',
    userVisibleTrigger: 'enhancement_popup_shown',
    hiddenRuntimeTrigger: 'baseline prepare soft-skipped an NL-heavy prompt (source_b_only / weak-ambiguous) and provider/key/source/safety state permits the bounded route decision',
    requirementState: 'required_when_contract_executes',
    productState: 'accepted_v1_llm_backed',
    calls: [90, 180, 300, 300],
    separateLlmCallInV1: true,
    skipCondition: 'skip unless a baseline prepare soft-skipped an NL-heavy prompt and a valid key/provider is available; the deterministic route is always the fallback (never blocks send)',
    reasonCodes: ['llm_route_decision_llm_backed'],
  }),
  row({
    callId: 'source_signal_guidance_in_baseline',
    trigger: 'prepare',
    userVisibleTrigger: 'not_user_visible_included_in_baseline',
    hiddenRuntimeTrigger: 'source and signal guidance normalized into baseline composer or deterministic renderer without a separate LLM call',
    requirementState: 'included_in_baseline_no_separate_call',
    productState: 'included_in_baseline_no_separate_v1_call',
    calls: [0, 0, 0, 0],
    separateLlmCallInV1: false,
    skipCondition: 'included in baseline composer or deterministic renderer; no separate call unless content-owner reopens architecture',
    reasonCodes: ['source_signal_guidance_included_in_baseline_composer'],
  }),
  row({
    callId: 'action_shorter',
    trigger: 'directional_action',
    userVisibleTrigger: 'shorter_action_clicked',
    hiddenRuntimeTrigger: 'Shorter action invoked for the current body revision and provider/source/safety state permits recomposition',
    requirementState: 'required_when_contract_executes',
    productState: 'accepted_v1_llm_backed',
    calls: [78.75, 162, 270, 270],
    separateLlmCallInV1: true,
    skipCondition: 'call only when Shorter action is invoked and provider/source/safety state permits',
    reasonCodes: ['shorter_llm_backed'],
  }),
  row({
    callId: 'action_more_thorough',
    trigger: 'directional_action',
    userVisibleTrigger: 'more_thorough_action_clicked',
    hiddenRuntimeTrigger: 'More thorough action invoked for the current body revision and provider/source/safety state permits recomposition',
    requirementState: 'required_when_contract_executes',
    productState: 'accepted_v1_llm_backed',
    calls: [78.75, 202.5, 337.5, 337.5],
    separateLlmCallInV1: true,
    skipCondition: 'call only when More thorough action is invoked and provider/source/safety state permits',
    reasonCodes: ['more_thorough_llm_backed'],
  }),
  row({
    callId: 'action_more_project_grounded',
    trigger: 'directional_action',
    userVisibleTrigger: 'more_project_grounded_action_clicked',
    hiddenRuntimeTrigger: 'More project-grounded action invoked with capped provenance-bearing facts and provider/source/safety state permits recomposition',
    requirementState: 'required_when_contract_executes',
    productState: 'accepted_v1_llm_backed',
    calls: [126, 303.75, 562.5, 562.5],
    separateLlmCallInV1: true,
    skipCondition: 'call only when More project-grounded action is invoked and provider/source/safety state permits',
    reasonCodes: ['more_project_grounded_llm_backed'],
  }),
  row({
    callId: 'additional_details_recomposition',
    trigger: 'additional_details',
    userVisibleTrigger: 'additional_details_apply_clicked',
    hiddenRuntimeTrigger: 'accepted Additional Details Apply text within the 5K-word cap is recomposed with current body/source state',
    requirementState: 'required_when_contract_executes',
    productState: 'accepted_v1_llm_backed',
    calls: [63, 162, 270, 270],
    separateLlmCallInV1: true,
    skipCondition: 'call only when Additional Details Apply is used within the 5K-word cap and provider/source/safety state permits',
    reasonCodes: ['additional_details_recomposes_whole_prompt'],
  }),
  row({
    callId: 'feedback_reason_rewrite',
    trigger: 'feedback',
    userVisibleTrigger: 'feedback_submitted',
    hiddenRuntimeTrigger: 'product-selected feedback reason rewriting is requested with typed privacy state',
    requirementState: 'optional_product_selected_when_triggered',
    productState: 'accepted_v1_llm_backed',
    calls: [31.5, 101.25, 180, 180],
    separateLlmCallInV1: true,
    skipCondition: 'call only for product-selected feedback reason rewriting with typed privacy state',
    reasonCodes: ['feedback_reason_rewrite_llm_backed'],
  }),
  row({
    callId: 'custom_feedback_classification',
    trigger: 'feedback',
    userVisibleTrigger: 'feedback_submitted',
    hiddenRuntimeTrigger: 'custom feedback text is submitted and product-selected classification is enabled with typed privacy state',
    requirementState: 'optional_product_selected_when_triggered',
    productState: 'accepted_v1_llm_backed',
    calls: [7.875, 35.4375, 90, 90],
    separateLlmCallInV1: true,
    skipCondition: 'call only for custom feedback classification with typed privacy state',
    reasonCodes: ['custom_feedback_classification_llm_backed'],
  }),
  row({
    callId: 'later_popup_feedback_decision',
    trigger: 'feedback',
    userVisibleTrigger: 'later_popup_feedback_decision',
    hiddenRuntimeTrigger: 'later-popup suppression or strong-pivot behavior uses LLM reasoning after feedback state is available',
    requirementState: 'conditional_if_later_popup_llm_reasoning',
    productState: 'conditional_v1_later_popup_if_llm_reasoning',
    calls: [47.25, 121.5, 225, 225],
    separateLlmCallInV1: true,
    skipCondition: 'call only if later popup suppression or strong-pivot behavior uses LLM reasoning',
    reasonCodes: ['later_popup_feedback_decision_visible_if_llm_reasoning'],
  }),
  row({
    callId: 'optional_safety_review',
    trigger: 'safety_review',
    userVisibleTrigger: 'safety_review_needed',
    hiddenRuntimeTrigger: 'optional LLM safety review is triggered beyond deterministic decision-rule-5 validation',
    requirementState: 'optional_product_selected_when_triggered',
    productState: 'accepted_v1_llm_backed',
    calls: [47.25, 101.25, 180, 180],
    separateLlmCallInV1: true,
    skipCondition: 'call only when optional LLM safety review is triggered beyond deterministic validation',
    reasonCodes: ['optional_safety_review_llm_backed_when_triggered'],
  }),
  row({
    // The planner call, registered so its measurement has somewhere to go. The two rows below cover
    // the wording calls and neither covers this one, so the reading with the most to say — a repair
    // loop that spends several starts and delivers no plan — had no row to be counted in.
    //
    // 🔴 Classified exactly as its siblings are. The gate is shut, and a row claiming otherwise
    // would have the source say v1-live while the runtime is still fail-closed.
    callId: 'sequence_planning',
    timeoutMs: PROMPT_ENHANCEMENT_SEQUENCE_PLANNER_TIMEOUT_MS_V1,
    outputTokenCap: PROMPT_ENHANCEMENT_SEQUENCE_PLANNER_OUTPUT_TOKEN_CAP_V1,
    trigger: 'sequence_metadata',
    userVisibleTrigger: 'sequence_metadata_candidate',
    hiddenRuntimeTrigger: 'future metadata-only sequence planning candidate after sequence gates close',
    requirementState: 'future_only_not_v1',
    productState: 'future_runtime_gated_not_cost_gated',
    calls: [54, 243, 972, 972],
    separateLlmCallInV1: true,
    skipCondition: 'future sequence runtime gated; one planning call per offered sequence',
    reasonCodes: ['sequence_planning_cost_visible_future_runtime_gated'],
  }),
  row({
    callId: 'sequence_summary_wording',
    timeoutMs: PROMPT_ENHANCEMENT_SEQUENCE_SUMMARY_TIMEOUT_MS_V1,
    outputTokenCap: PROMPT_ENHANCEMENT_SEQUENCE_SUMMARY_OUTPUT_TOKEN_CAP_V1,
    trigger: 'sequence_metadata',
    userVisibleTrigger: 'sequence_metadata_candidate',
    hiddenRuntimeTrigger: 'future metadata-only sequence summary wording candidate after sequence gates close',
    requirementState: 'future_only_not_v1',
    productState: 'future_runtime_gated_not_cost_gated',
    calls: [54, 243, 972, 972],
    separateLlmCallInV1: true,
    skipCondition: 'future sequence runtime gated; no current v1 runtime activation',
    reasonCodes: ['sequence_summary_wording_cost_visible_future_runtime_gated'],
  }),
  row({
    callId: 'sequence_item_wording',
    timeoutMs: PROMPT_ENHANCEMENT_SEQUENCE_BATCH_TIMEOUT_MS_V1,
    outputTokenCap: PROMPT_ENHANCEMENT_SEQUENCE_BATCH_OUTPUT_TOKEN_CAP_V1,
    trigger: 'sequence_metadata',
    userVisibleTrigger: 'sequence_metadata_candidate',
    hiddenRuntimeTrigger: 'future metadata-only per-item sequence wording candidate after runtime gates close',
    requirementState: 'future_only_not_v1',
    productState: 'future_runtime_gated_not_cost_gated',
    calls: [270, 2_430, 17_496, 29_160],
    separateLlmCallInV1: true,
    skipCondition: 'future sequence runtime gated; max sequence count remains 30 when later accepted',
    reasonCodes: ['sequence_item_wording_cost_visible_future_runtime_gated'],
  }),
  row({
    callId: 'future_regenerate_flow',
    trigger: 'future_action',
    userVisibleTrigger: 'future_explicit_action',
    hiddenRuntimeTrigger: 'future explicit regenerate action after a later written product decision and eval-rule-1 row',
    requirementState: 'future_only_not_v1',
    productState: 'future_product_scope_not_in_v1',
    calls: [0, 0, 0, 'not_bounded_for_future_v1'],
    separateLlmCallInV1: false,
    skipCondition: 'future-only product scope; no v1 runtime call row signed off',
    reasonCodes: ['future_regenerate_flow_not_v1'],
  }),
  row({
    callId: 'future_modification_instruction_flow',
    trigger: 'future_action',
    userVisibleTrigger: 'future_explicit_action',
    hiddenRuntimeTrigger: 'future heavier modification-instruction action after a later written product decision and eval-rule-1 row',
    requirementState: 'future_only_not_v1',
    productState: 'future_product_scope_not_in_v1',
    calls: [0, 0, 0, 'not_bounded_for_future_v1'],
    separateLlmCallInV1: false,
    skipCondition: 'future-only product scope; no v1 runtime call row signed off',
    reasonCodes: ['future_modification_instruction_flow_not_v1'],
  }),
];

export const PROMPT_ENHANCEMENT_ACCEPTED_COST_CALL_INVENTORY_V1 = CALL_ROWS;

const CURRENT_SOURCE_BASELINE_ROWS: readonly PromptEnhancementCurrentSourceCostCallInventoryRowV1[] = [
  currentSourceRow({
    baselineCallId: 'current_profile_classifier',
    sourceLayer: 'src/classifier/LLMProfileClassifier.ts',
    assumedInputTokens: 2_000,
    maxOutputTokens: 80,
    timeoutMs: 3_000,
    fallbackState: 'deterministic_or_local_fallback',
    requirementState: 'required_current_source_row',
    userVisibleTrigger: 'prompt_submit',
    hiddenRuntimeTrigger: 'profile missing or stale and enough actual prompt history exists',
    skipCondition: 'generated-origin prompts do not increment actual-user prompt cadence; normal user prompts remain eligible',
    calls: ['blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner'],
    costStates: [
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
    ],
    worksheetStatus: 'blocked_pending_owner',
  }),
  currentSourceRow({
    baselineCallId: 'current_stream_b_presence_classifier',
    sourceLayer: 'src/classifier/StreamBPresenceClassifier.ts',
    assumedInputTokens: 1_500,
    maxOutputTokens: 60,
    timeoutMs: 5_000,
    fallbackState: 'null_or_no_action_fallback',
    requirementState: 'required_current_source_row',
    userVisibleTrigger: 'prompt_submit',
    hiddenRuntimeTrigger: 'implementation-stage prompt with promptsInCurrentStage >= 3',
    skipCondition: 'skip outside implementation-stage source condition or when source classifier cannot run',
    calls: ['blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner'],
    costStates: [
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
    ],
    worksheetStatus: 'blocked_pending_owner',
  }),
  currentSourceRow({
    baselineCallId: 'current_stage_classifier',
    sourceLayer: 'src/classifier/stage-classifier.ts',
    // The reply carries the intent proposal + evidence/capability observations
    // (parked on this SAME call — no new call exists): the system prompt grew by
    // the intent menu, the evidence ladder, and the capability conditions
    // (prefix-cached), and the output by four fields.
    //
    // ⚠️ TWO MORE OBSERVATIONS RIDE THIS CALL SINCE (still no new call — the PE-EM-1 obligation is
    // that every field addition is visible here, so both are recorded rather than one):
    //   · project-fact applicability (§17.12) — ten category ids, at most a short list back;
    //   · I1 section relevance (§15.2) — an ORDERING over 14 section-kind ids, so the largest
    //     honest reply now carries 14 ids plus the four original fields.
    // Output: raised 512 → 1024, ruled by the owner and sized against real runs rather than
    // arithmetic — across 2,371 measured prompts, 181 (7.6%) would overrun 512 (the observed
    // maximum names 46 signals at ~847 real tokens), and a truncated reply degrades SILENTLY
    // to an empty intent (the C1 failure mode), paid for and then thrown away. Output bills
    // as produced, not as capped, so the raise adds nothing to the cost figures here. The
    // reply also carries the sensitive-action verdict + reason observation (~25 tokens),
    // parked on this same call.
    //
    // ⚠️ INPUT — measured 2026-08-20, and the number below is NOT what the call costs:
    //   · system prompt, assembled: 14,405 chars ≈ 3,600 tokens (the two blocks added since C1
    //     account for roughly 650 of that, and it is prefix-cached across calls);
    //   · user message, a FULL 10-prompt window of ordinary-length prompts: ≈ 5,600 tokens,
    //     which is dynamic and is what actually dominates.
    // So a busy window totals ≈ 9,200 against the 5,000 recorded here. 🔑 The gap is mostly the
    // WINDOW, not the prompt sections, and it predates both additions — so this row is left at its
    // recorded value rather than re-set silently: moving a cost number is the owner's call, and the
    // honest thing is that the measurement is written down where the row can be judged against it.
    assumedInputTokens: 5_000,
    maxOutputTokens: 1_024,
    timeoutMs: 12_000,
    fallbackState: 'deterministic_or_local_fallback',
    requirementState: 'required_current_source_row',
    userVisibleTrigger: 'prompt_submit',
    hiddenRuntimeTrigger: 'real prompt-submit classification pipeline after profile and Stream-B checks',
    skipCondition: 'generated-origin prompts are excluded from normal submit volume before current-source lifecycle accounting',
    calls: ['blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner'],
    costStates: [
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
    ],
    worksheetStatus: 'blocked_pending_owner',
  }),
  currentSourceRow({
    baselineCallId: 'current_sensitive_action_micro_clearance',
    sourceLayer: 'src/classifier/sensitive-action-micro-clearance.ts',
    // The sensitive-action clearance's own dedicated call — the precision half of the
    // confirmation-line design, moved OFF the stage classifier after two failed recall
    // measurements there (attention dilution) and a 45/45 pass in this focused form.
    // Owner-approved 2026-08-25 with the measured figures. Deterministically gated: it
    // fires only when the prompt matches a risk keyword (~17% of prompts in the measured
    // corpus), runs in PARALLEL inside the stage classifier's own wait (never awaited;
    // aborted at the join if pending), and every failure mode reads as "no clearance" —
    // the confirmation line then emits exactly as today. ~250 input + <=120 output tokens
    // per gated call ≈ $0.02-0.03/month at 2,000 prompts/month.
    assumedInputTokens: 250,
    maxOutputTokens: 120,
    timeoutMs: 8_000,
    fallbackState: 'null_or_no_action_fallback',
    requirementState: 'required_current_source_row',
    userVisibleTrigger: 'prompt_submit',
    hiddenRuntimeTrigger: 'prompt matches a sensitive-action risk keyword (the deterministic gate)',
    skipCondition: 'no risk-keyword match, no client/key, or the verdict has not settled by the classifier join (aborted; fail-closed)',
    calls: ['blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner'],
    costStates: [
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
    ],
    worksheetStatus: 'blocked_pending_owner',
  }),
  currentSourceRow({
    baselineCallId: 'current_pinch_label_generator',
    sourceLayer: 'src/decision-session/PinchGenerator.ts',
    assumedInputTokens: 1_000,
    maxOutputTokens: 24,
    timeoutMs: 10_000,
    fallbackState: 'static_fallback',
    requirementState: 'required_current_source_row',
    userVisibleTrigger: 'stop_decision_session',
    hiddenRuntimeTrigger: 'Stop decision-session advisory with source-supported pinch label need',
    skipCondition: 'skip when no decision-session advisory is fired or source provides deterministic/static fallback',
    calls: ['blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner'],
    costStates: [
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
    ],
    worksheetStatus: 'blocked_pending_owner',
  }),
  currentSourceRow({
    baselineCallId: 'current_decision_session_option_generator',
    sourceLayer: 'src/decision-session/OptionGenerator.ts',
    assumedInputTokens: 4_000,
    maxOutputTokens: 900,
    timeoutMs: 12_000,
    fallbackState: 'null_or_no_action_fallback',
    requirementState: 'current_source_row_if_reachable',
    userVisibleTrigger: 'stop_decision_session',
    hiddenRuntimeTrigger: 'legacy or dynamic decision-session option generation path if reachable in source',
    skipCondition: 'zero unless source proves the legacy/dynamic option-generator path is reachable in current runtime',
    calls: [0, 0, 0, 0],
    costStates: ['zero_no_separate_call', 'zero_no_separate_call', 'zero_no_separate_call'],
    worksheetStatus: 'accepted_zero_unless_source_proven',
  }),
  currentSourceRow({
    baselineCallId: 'current_content_template_grounding',
    sourceLayer: 'src/decision-session/content-template-grounding.ts',
    assumedInputTokens: 4_000,
    maxOutputTokens: 400,
    timeoutMs: 12_000,
    fallbackState: 'deterministic_or_local_fallback',
    requirementState: 'required_current_source_row',
    userVisibleTrigger: 'stop_decision_session',
    hiddenRuntimeTrigger: 'after Claude response for pending decision-session grounding or weave',
    skipCondition: 'skip when no pending decision session requires content-template grounding',
    calls: ['blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner'],
    costStates: [
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
    ],
    worksheetStatus: 'blocked_pending_owner',
  }),
  currentSourceRow({
    baselineCallId: 'current_content_template_prompt_param_extraction',
    sourceLayer: 'src/decision-session/content-template-grounding.ts',
    assumedInputTokens: 'blocked_pending_source_value',
    maxOutputTokens: 400,
    timeoutMs: 12_000,
    fallbackState: 'deterministic_or_local_fallback',
    requirementState: 'required_current_source_row',
    userVisibleTrigger: 'stop_decision_session',
    hiddenRuntimeTrigger: 'recent-prompt prompt-derived param extraction before content-template grounding facts are built',
    skipCondition: 'skip when there are no recent prompts to mine or content-template grounding does not request prompt-derived param facts',
    calls: ['blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner'],
    costStates: [
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
    ],
    worksheetStatus: 'blocked_pending_owner',
  }),
  currentSourceRow({
    baselineCallId: 'current_content_template_simpler_derive',
    sourceLayer: 'src/decision-session/content-template-engine.ts',
    assumedInputTokens: 3_000,
    maxOutputTokens: 400,
    timeoutMs: 4_000,
    fallbackState: 'deterministic_or_local_fallback',
    requirementState: 'required_current_source_row',
    userVisibleTrigger: 'stop_decision_session',
    hiddenRuntimeTrigger: 'content-template simpler-variant derivation when source template runtime asks for it',
    skipCondition: 'skip when selected content template already has an authored simpler variant or no derivation is requested',
    calls: ['blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner', 'blocked_pending_owner'],
    costStates: [
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
    ],
    worksheetStatus: 'blocked_pending_owner',
  }),
  currentSourceRow({
    baselineCallId: 'current_content_template_autogen',
    sourceLayer: 'src/decision-session/auto-template-generator.ts',
    assumedInputTokens: 6_000,
    maxOutputTokens: 1_000,
    timeoutMs: 'source_undefined',
    fallbackState: 'deterministic_or_local_fallback',
    requirementState: 'required_current_source_row',
    userVisibleTrigger: 'post_popup_best_effort',
    hiddenRuntimeTrigger: 'per-user content-template autogen after popup and outside Stop critical path',
    skipCondition: 'best-effort source autogen only; no PE composer budget and no runtime weakening based on its cost',
    calls: [1, 2, 4, 'source_undefined'],
    costStates: [
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
      'accepted_in_private_cost_visibility_packet_not_public_constant',
    ],
    worksheetStatus: 'accepted_source_mean_assumption',
  }),
];

export function getPromptEnhancementAcceptedCostCallInventoryV1(): readonly PromptEnhancementAcceptedCostCallInventoryRowV1[] {
  return CALL_ROWS;
}

export function getPromptEnhancementCurrentSourceCostBaselineInventoryV1(): readonly PromptEnhancementCurrentSourceCostCallInventoryRowV1[] {
  return CURRENT_SOURCE_BASELINE_ROWS;
}

export function getPromptEnhancementAcceptedCostCallRowV1(
  callId: PromptEnhancementCostCallIdV1,
): PromptEnhancementAcceptedCostCallInventoryRowV1 {
  const rowMatch = CALL_ROWS.find((candidate) => candidate.callId === callId);
  if (!rowMatch) throw new Error(`Unknown prompt-enhancement cost call id: ${callId}`);
  return rowMatch;
}

/**
 * A measured value for the visibility metadata, or nothing at all.
 *
 * ⛔ Deliberately NOT a fallback to the global constant. The metadata's completeness check requires
 * a number on any provider-using call, so an unmeasured timeout leaves that call reporting
 * INCOMPLETE — which is the truthful outcome and the whole point of the sentinel. Substituting 45 s
 * here would make an unmeasured call look fully specified, which is the failure the widening was
 * done to prevent.
 */
function measuredOrAbsent(value: number | typeof PROMPT_ENHANCEMENT_MEASUREMENT_PENDING_V1): number | undefined {
  return value === PROMPT_ENHANCEMENT_MEASUREMENT_PENDING_V1 ? undefined : value;
}

/**
 * A per-call budget that has been decided: a positive number, or the explicit not-yet sentinel.
 *
 * ⛔ Zero, a negative, or a non-integer is not a budget — those are the states worth refusing. What
 * is NOT refused is a value that differs from the composer's, which is the whole reason these two
 * fields were widened: the planner and the batch are sized against the locked item count, not
 * against the composer's section count.
 */
function statedCallBudget(value: number | typeof PROMPT_ENHANCEMENT_MEASUREMENT_PENDING_V1): boolean {
  if (value === PROMPT_ENHANCEMENT_MEASUREMENT_PENDING_V1) return true;
  return Number.isInteger(value) && value > 0;
}

export function buildPromptEnhancementCostVisibilityMetadataV1(
  callId: PromptEnhancementCostCallIdV1,
  input: {
    callVisibilityMode: PromptEnhancementCallVisibilityMode;
    plannedCallCount: number;
    usedCallCount: number;
    fallbackReason?: PromptEnhancementRuntimeBlockReason;
    estimatedInputTokens?: number;
    estimatedOutputTokens?: number;
    providerFailureState?: PromptEnhancementProviderFailureStateV1;
    priorCallAccountingRefs?: readonly string[];
  },
): PromptEnhancementCostVisibilityMetadataV1 {
  const inventoryRow = getPromptEnhancementAcceptedCostCallRowV1(callId);
  const providerUnavailable = input.callVisibilityMode === 'provider_unavailable' ||
    input.providerFailureState === 'missing_api_key' ||
    input.providerFailureState === 'provider_api_unavailable' ||
    input.providerFailureState === 'provider_refused' ||
    input.providerFailureState === 'timeout' ||
    input.providerFailureState === 'quota_or_billing_refused' ||
    input.providerFailureState === 'rate_limited';
  return {
    callId,
    callOwner: inventoryRow.owner,
    callVisibilityMode: input.callVisibilityMode,
    callTrigger: toContractTrigger(inventoryRow.trigger),
    optionalCallAvailabilityState: providerUnavailable
      ? 'unavailable_by_provider_api'
      : inventoryRow.productState === 'future_runtime_gated_not_cost_gated'
        ? 'product_scope_not_in_v1'
        : 'allowed',
    provider: inventoryRow.provider,
    model: inventoryRow.model,
    pricingSourceUrl: inventoryRow.pricingSourceUrl,
    pricingAccessDate: inventoryRow.pricingAccessDate,
    processingModeAssumption: inventoryRow.processingModeAssumption,
    contextTierAssumption: inventoryRow.contextTierAssumption,
    addOnCostAssumption: inventoryRow.addOnCostAssumption,
    regionalDataResidencyAssumption: inventoryRow.regionalDataResidencyAssumption,
    inputTokenCap: inventoryRow.inputTokenCap,
    outputTokenCap: measuredOrAbsent(inventoryRow.outputTokenCap),
    estimatedInputTokens: input.estimatedInputTokens ?? 0,
    estimatedOutputTokens: input.estimatedOutputTokens ?? 0,
    plannedCallCount: input.plannedCallCount,
    usedCallCount: providerUnavailable ? 0 : input.usedCallCount,
    providerAvailabilityState: providerUnavailable ? 'unavailable_by_provider_api' : 'available',
    timeoutMs: measuredOrAbsent(inventoryRow.timeoutMs),
    retryCount: inventoryRow.retryCount,
    latencyTargetMs: measuredOrAbsent(inventoryRow.timeoutMs),
    cacheAssumption: inventoryRow.cacheAssumption,
    latencyImpact: inventoryRow.latencyImpact,
    uiProviderApiLatencyStateLabel: providerUnavailable
      ? input.providerFailureState === 'timeout'
        ? 'timeout_no_generated_content'
        : 'provider_api_unavailable_no_generated_content'
      : inventoryRow.uiProviderApiLatencyStateLabel,
    telemetrySafeMeasurementFields: inventoryRow.telemetrySafeMeasurementFields,
    providerFailureState: input.providerFailureState ?? 'none',
    fallbackReason: input.fallbackReason ?? (providerUnavailable ? 'provider_unavailable' : 'not_applicable'),
    priorCallAccountingRefs: input.priorCallAccountingRefs ?? [],
    localLoggingHookState: 'counts_only',
    productValueSignoffRef: inventoryRow.productValueSignoffRef,
    productValueDiscussionIsRuntimeLimiter: false,
    costVisibilityCanWeakenBehavior: false,
  };
}

export function sanitizePromptEnhancementCostMeasurementV1(
  input: PromptEnhancementCostMeasurementInputV1,
): PromptEnhancementCostMeasurementRecordV1 {
  const inventoryRow = getPromptEnhancementAcceptedCostCallRowV1(input.callId);
  const providerAvailabilityState = providerAvailabilityStateFor(input.providerFailureState);
  return {
    callId: input.callId,
    owner: inventoryRow.owner,
    trigger: inventoryRow.trigger,
    provider: inventoryRow.provider,
    model: inventoryRow.model,
    plannedCallCount: input.plannedCallCount,
    usedCallCount: providerAvailabilityState === 'unavailable_by_provider_api' ? 0 : input.usedCallCount,
    latencyMs: input.latencyMs,
    estimatedInputTokens: input.estimatedInputTokens,
    estimatedOutputTokens: input.estimatedOutputTokens,
    timeoutMs: inventoryRow.timeoutMs,
    retryCount: inventoryRow.retryCount,
    status: input.status,
    fallbackReason: input.fallbackReason ?? 'not_applicable',
    providerAvailabilityState,
    providerFailureState: input.providerFailureState ?? 'none',
    productScopeState: input.productScopeState ?? inventoryRow.productState,
    telemetrySafeMeasurementFields: inventoryRow.telemetrySafeMeasurementFields,
    rawPromptBodyExcluded: true,
    rawGeneratedBodyExcluded: true,
    rawSourceExcerptExcluded: true,
    rawFeedbackTextExcluded: true,
    rawAssistantResponseExcluded: true,
    rawErrorExcluded: true,
    costVisibilityCanWeakenBehavior: false,
  };
}

export function buildPromptEnhancementCostRuntimeFlowEvidenceV1(
  input: PromptEnhancementCostRuntimeFlowEvidenceInputV1,
): PromptEnhancementCostRuntimeFlowEvidencePacketV1 {
  const measurementRecords = input.measurementInputs.map(sanitizePromptEnhancementCostMeasurementV1);
  const aggregate = measurementRecords.reduce(
    (acc, record) => ({
      plannedCallCount: acc.plannedCallCount + record.plannedCallCount,
      usedCallCount: acc.usedCallCount + record.usedCallCount,
      latencyMsTotal: acc.latencyMsTotal + (record.latencyMs ?? 0),
      fallbackCount: acc.fallbackCount + (record.fallbackReason === 'not_applicable' ? 0 : 1),
      providerUnavailableCount: acc.providerUnavailableCount + (record.providerAvailabilityState === 'unavailable_by_provider_api' ? 1 : 0),
      timeoutCount: acc.timeoutCount + (record.providerFailureState === 'timeout' || record.status === 'timeout' ? 1 : 0),
    }),
    {
      plannedCallCount: 0,
      usedCallCount: 0,
      latencyMsTotal: 0,
      fallbackCount: 0,
      providerUnavailableCount: 0,
      timeoutCount: 0,
    },
  );
  const reasonCodes = [
    ...promptEnhancementCostWeakeningReasonCodesV1(input.weakeningCheck ?? {}),
    ...runtimeFlowCompletenessReasonCodes(input.observedSurfaces),
  ];

  return {
    evidenceId: input.evidenceId,
    evidenceKind: 'prompt_start_popup_delivery_cost_latency_v1',
    enhancementId: input.enhancementId,
    requestId: input.requestId,
    bodyId: input.bodyId,
    bodyRevision: input.bodyRevision,
    generatedOriginId: input.generatedOriginId,
    deliveryAttemptId: input.deliveryAttemptId,
    observedSurfaces: input.observedSurfaces,
    callVisibilityMetadata: input.callVisibilityMetadata,
    measurementRecords,
    aggregate,
    storeRecordRefs: input.storeRecordRefs ?? [],
    telemetrySyncState: input.telemetrySyncState ?? 'not_attempted',
    privacyExclusions: {
      rawPromptBodyExcluded: true,
      rawGeneratedBodyExcluded: true,
      rawSourceExcerptExcluded: true,
      rawFeedbackTextExcluded: true,
      rawErrorExcluded: true,
      localWriteAlreadySafe: true,
    },
    costVisibilityCanWeakenBehavior: false,
    productValueDiscussionIsRuntimeLimiter: false,
    reasonCodes,
  };
}

export function promptEnhancementCostWeakeningReasonCodesV1(
  input: PromptEnhancementCostWeakeningCheckInputV1,
): readonly string[] {
  const reasons: string[] = [];
  if (input.disabledBecauseOfCost) reasons.push('cost_cannot_disable_accepted_call');
  if (input.deferredBecauseOfCost) reasons.push('cost_cannot_defer_accepted_call');
  if (input.frequencyGatedBecauseOfCost) reasons.push('cost_cannot_frequency_gate_accepted_call');
  if (input.deterministicDowngradeBecauseOfCost) reasons.push('cost_cannot_downgrade_to_deterministic');
  if (input.promptShrunkBecauseOfCost) reasons.push('cost_cannot_shrink_prompt_sections');
  if (input.explicitUserActionOnlyBecauseOfCost) reasons.push('cost_cannot_make_path_explicit_user_action_only');
  if (input.providerFailureState && input.providerFailureState !== 'none') {
    reasons.push(`provider_failure_allows_public_safe_fallback:${input.providerFailureState}`);
  }
  return reasons.length > 0 ? reasons : ['cost_visibility_is_not_runtime_limiter'];
}

function runtimeFlowCompletenessReasonCodes(
  surfaces: readonly PromptEnhancementCostRuntimeFlowSurfaceV1[],
): readonly string[] {
  const required: readonly PromptEnhancementCostRuntimeFlowSurfaceV1[] = [
    'prompt_start_prepare',
    'enhancement_popup',
    'stop_or_extension_delivery',
  ];
  return required
    .filter((surface) => !surfaces.includes(surface))
    .map((surface) => `runtime_surface_missing:${surface}`);
}

export function validatePromptEnhancementCostInventoryV1(
  rows: readonly PromptEnhancementAcceptedCostCallInventoryRowV1[] = CALL_ROWS,
): { ok: boolean; reasonCodes: readonly string[] } {
  const reasonCodes: string[] = [];
  const ids = new Set<PromptEnhancementCostCallIdV1>();
  for (const inventoryRow of rows) {
    if (ids.has(inventoryRow.callId)) reasonCodes.push(`duplicate_call_id:${inventoryRow.callId}`);
    ids.add(inventoryRow.callId);
    if (inventoryRow.provider !== PROMPT_ENHANCEMENT_COST_PROVIDER_V1) reasonCodes.push(`provider_mismatch:${inventoryRow.callId}`);
    if (inventoryRow.model !== PROMPT_ENHANCEMENT_COST_MODEL_V1) reasonCodes.push(`model_mismatch:${inventoryRow.callId}`);
    if (inventoryRow.ownerResearchItem !== 'cost_visibility') reasonCodes.push(`owner_research_item_missing:${inventoryRow.callId}`);
    if (inventoryRow.implementationModule !== 'src/prompt-enhancement/cost-observability.ts') {
      reasonCodes.push(`implementation_module_missing:${inventoryRow.callId}`);
    }
    if (!inventoryRow.userVisibleTrigger) reasonCodes.push(`user_visible_trigger_missing:${inventoryRow.callId}`);
    if (!inventoryRow.hiddenRuntimeTrigger) reasonCodes.push(`hidden_runtime_trigger_missing:${inventoryRow.callId}`);
    if (inventoryRow.pricingSourceUrl !== PROMPT_ENHANCEMENT_COST_PRICING_SOURCE_URL_V1) reasonCodes.push(`pricing_source_missing:${inventoryRow.callId}`);
    if (inventoryRow.pricingAccessDate !== PROMPT_ENHANCEMENT_COST_PRICING_ACCESS_DATE_V1) reasonCodes.push(`pricing_access_date_missing:${inventoryRow.callId}`);
    if (inventoryRow.processingModeAssumption !== PROMPT_ENHANCEMENT_COST_PROCESSING_MODE_ASSUMPTION_V1) reasonCodes.push(`processing_mode_missing:${inventoryRow.callId}`);
    if (inventoryRow.contextTierAssumption !== PROMPT_ENHANCEMENT_COST_CONTEXT_TIER_ASSUMPTION_V1) reasonCodes.push(`context_tier_missing:${inventoryRow.callId}`);
    if (inventoryRow.addOnCostAssumption !== PROMPT_ENHANCEMENT_COST_ADD_ON_ASSUMPTION_V1) reasonCodes.push(`addon_assumption_missing:${inventoryRow.callId}`);
    if (inventoryRow.regionalDataResidencyAssumption !== PROMPT_ENHANCEMENT_COST_REGIONAL_DATA_RESIDENCY_ASSUMPTION_V1) {
      reasonCodes.push(`regional_data_residency_assumption_missing:${inventoryRow.callId}`);
    }
    if (inventoryRow.inputTokenCap !== PROMPT_ENHANCEMENT_COST_INPUT_TOKEN_CAP_V1) reasonCodes.push(`input_cap_mismatch:${inventoryRow.callId}`);
    // Stated and sane, NOT equal to the composer's. Requiring equality made the widened type
    // unusable — a row carrying the not-yet-measured sentinel was rejected — and it compelled every
    // row to claim the composer's 2k cap, including the batch, whose own cap is several times that
    // and for which a truncated reply is invalid rather than shorter. A row that genuinely inherits
    // still passes, because it holds the global's value.
    if (!statedCallBudget(inventoryRow.outputTokenCap)) reasonCodes.push(`output_cap_missing_or_invalid:${inventoryRow.callId}`);
    if (!statedCallBudget(inventoryRow.timeoutMs)) reasonCodes.push(`timeout_missing_or_invalid:${inventoryRow.callId}`);
    if (inventoryRow.retryCount !== PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1) reasonCodes.push(`retry_mismatch:${inventoryRow.callId}`);
    if (inventoryRow.cacheAssumption !== 'no_cache_savings_no_addons') reasonCodes.push(`cache_assumption_missing:${inventoryRow.callId}`);
    if (inventoryRow.latencyImpact !== 'wait_for_full_result_under_timeout') reasonCodes.push(`latency_impact_missing:${inventoryRow.callId}`);
    if (!inventoryRow.uiProviderApiLatencyStateLabel) reasonCodes.push(`ui_provider_latency_label_missing:${inventoryRow.callId}`);
    if (inventoryRow.currentVsNew !== 'new_pe_call_surface') reasonCodes.push(`current_vs_new_missing:${inventoryRow.callId}`);
    if (!inventoryRow.requirementState) reasonCodes.push(`requirement_state_missing:${inventoryRow.callId}`);
    if (!inventoryRow.skipCondition) reasonCodes.push(`skip_condition_missing:${inventoryRow.callId}`);
    if (inventoryRow.conservativeCallsPerMonth < 0) reasonCodes.push(`conservative_calls_invalid:${inventoryRow.callId}`);
    if (inventoryRow.expectedCallsPerMonth < 0) reasonCodes.push(`expected_calls_invalid:${inventoryRow.callId}`);
    if (inventoryRow.heavyCallsPerMonth < 0) reasonCodes.push(`heavy_calls_invalid:${inventoryRow.callId}`);
    if (inventoryRow.worstCaseCallsPerMonth !== 'not_bounded_for_future_v1' && inventoryRow.worstCaseCallsPerMonth < 0) {
      reasonCodes.push(`worst_case_calls_invalid:${inventoryRow.callId}`);
    }
    if (!inventoryRow.conservativeMonthlyCostState) reasonCodes.push(`conservative_cost_state_missing:${inventoryRow.callId}`);
    if (!inventoryRow.expectedMonthlyCostState) reasonCodes.push(`expected_cost_state_missing:${inventoryRow.callId}`);
    if (!inventoryRow.heavyMonthlyCostState) reasonCodes.push(`heavy_cost_state_missing:${inventoryRow.callId}`);
    if (!inventoryRow.deterministicLocalFallback) reasonCodes.push(`deterministic_fallback_missing:${inventoryRow.callId}`);
    if (!inventoryRow.sendOriginalFallbackState) reasonCodes.push(`send_original_fallback_missing:${inventoryRow.callId}`);
    if (!inventoryRow.passFailStatus) reasonCodes.push(`pass_fail_status_missing:${inventoryRow.callId}`);
    if (!inventoryRow.openOwnerDecision) reasonCodes.push(`open_owner_decision_missing:${inventoryRow.callId}`);
    if (inventoryRow.costVisibilityCanWeakenBehavior) reasonCodes.push(`cost_limiter_enabled:${inventoryRow.callId}`);
    if (inventoryRow.costVisibilityCanDisableCall) reasonCodes.push(`cost_disable_enabled:${inventoryRow.callId}`);
    if (inventoryRow.telemetrySafeMeasurementFields.length !== PROMPT_ENHANCEMENT_COST_MEASUREMENT_FIELDS_V1.length) {
      reasonCodes.push(`measurement_field_count_mismatch:${inventoryRow.callId}`);
    }
  }
  for (const requiredId of REQUIRED_CALL_IDS) {
    if (!ids.has(requiredId)) reasonCodes.push(`missing_call_id:${requiredId}`);
  }
  return { ok: reasonCodes.length === 0, reasonCodes };
}

export function validatePromptEnhancementCurrentSourceCostInventoryV1(
  rows: readonly PromptEnhancementCurrentSourceCostCallInventoryRowV1[] = CURRENT_SOURCE_BASELINE_ROWS,
): { ok: boolean; reasonCodes: readonly string[] } {
  const reasonCodes: string[] = [];
  const ids = new Set<PromptEnhancementCurrentSourceCostCallInventoryRowV1['baselineCallId']>();
  for (const inventoryRow of rows) {
    if (ids.has(inventoryRow.baselineCallId)) reasonCodes.push(`duplicate_current_source_call_id:${inventoryRow.baselineCallId}`);
    ids.add(inventoryRow.baselineCallId);
    if (inventoryRow.ownerResearchItem !== 'cost_visibility') reasonCodes.push(`owner_research_item_missing:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.implementationModule) reasonCodes.push(`implementation_module_missing:${inventoryRow.baselineCallId}`);
    if (inventoryRow.budgetBucket !== 'current_always_on_nexpath_baseline_not_pe') {
      reasonCodes.push(`budget_bucket_mismatch:${inventoryRow.baselineCallId}`);
    }
    if (inventoryRow.currentVsNew !== 'current_source_call_surface') {
      reasonCodes.push(`current_vs_new_missing:${inventoryRow.baselineCallId}`);
    }
    if (!inventoryRow.requirementState) reasonCodes.push(`requirement_state_missing:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.userVisibleTrigger) reasonCodes.push(`user_visible_trigger_missing:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.hiddenRuntimeTrigger) reasonCodes.push(`hidden_runtime_trigger_missing:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.skipCondition) reasonCodes.push(`skip_condition_missing:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.worksheetStatus) reasonCodes.push(`worksheet_status_missing:${inventoryRow.baselineCallId}`);
    if (inventoryRow.provider !== PROMPT_ENHANCEMENT_COST_PROVIDER_V1) reasonCodes.push(`provider_mismatch:${inventoryRow.baselineCallId}`);
    if (inventoryRow.model !== PROMPT_ENHANCEMENT_COST_MODEL_V1) reasonCodes.push(`model_mismatch:${inventoryRow.baselineCallId}`);
    if (inventoryRow.pricingSourceUrl !== PROMPT_ENHANCEMENT_COST_PRICING_SOURCE_URL_V1) {
      reasonCodes.push(`pricing_source_missing:${inventoryRow.baselineCallId}`);
    }
    if (inventoryRow.pricingAccessDate !== PROMPT_ENHANCEMENT_COST_PRICING_ACCESS_DATE_V1) {
      reasonCodes.push(`pricing_access_date_missing:${inventoryRow.baselineCallId}`);
    }
    if (inventoryRow.processingModeAssumption !== PROMPT_ENHANCEMENT_COST_PROCESSING_MODE_ASSUMPTION_V1) {
      reasonCodes.push(`processing_mode_missing:${inventoryRow.baselineCallId}`);
    }
    if (inventoryRow.contextTierAssumption !== PROMPT_ENHANCEMENT_COST_CONTEXT_TIER_ASSUMPTION_V1) {
      reasonCodes.push(`context_tier_missing:${inventoryRow.baselineCallId}`);
    }
    if (inventoryRow.addOnCostAssumption !== PROMPT_ENHANCEMENT_COST_ADD_ON_ASSUMPTION_V1) {
      reasonCodes.push(`addon_assumption_missing:${inventoryRow.baselineCallId}`);
    }
    if (inventoryRow.regionalDataResidencyAssumption !== PROMPT_ENHANCEMENT_COST_REGIONAL_DATA_RESIDENCY_ASSUMPTION_V1) {
      reasonCodes.push(`regional_data_residency_assumption_missing:${inventoryRow.baselineCallId}`);
    }
    if (typeof inventoryRow.assumedInputTokens === 'number' && inventoryRow.assumedInputTokens < 0) {
      reasonCodes.push(`input_tokens_invalid:${inventoryRow.baselineCallId}`);
    }
    if (inventoryRow.maxOutputTokens < 0) reasonCodes.push(`output_tokens_invalid:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.retryPolicyState) reasonCodes.push(`retry_policy_missing:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.deterministicLocalFallback) reasonCodes.push(`deterministic_fallback_missing:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.sendOriginalFallbackState) reasonCodes.push(`send_original_fallback_state_missing:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.latencyImpact) reasonCodes.push(`latency_impact_missing:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.uiProviderApiLatencyStateLabel) reasonCodes.push(`ui_latency_state_missing:${inventoryRow.baselineCallId}`);
    for (const count of [
      inventoryRow.conservativeCallsPerMonth,
      inventoryRow.expectedCallsPerMonth,
      inventoryRow.heavyCallsPerMonth,
      inventoryRow.worstCaseCallsPerMonth,
    ]) {
      if (typeof count === 'number' && count < 0) reasonCodes.push(`scenario_calls_invalid:${inventoryRow.baselineCallId}`);
    }
    if (!inventoryRow.conservativeMonthlyCostState) reasonCodes.push(`conservative_cost_state_missing:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.expectedMonthlyCostState) reasonCodes.push(`expected_cost_state_missing:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.heavyMonthlyCostState) reasonCodes.push(`heavy_cost_state_missing:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.passFailStatus) reasonCodes.push(`pass_fail_status_missing:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.openOwnerDecision) reasonCodes.push(`open_owner_decision_missing:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.rawPromptTextExcludedFromTelemetry) reasonCodes.push(`raw_prompt_telemetry_not_excluded:${inventoryRow.baselineCallId}`);
    if (!inventoryRow.notPeComposerBudget) reasonCodes.push(`pe_budget_leak:${inventoryRow.baselineCallId}`);
    if (inventoryRow.costVisibilityCanWeakenBehavior) reasonCodes.push(`cost_limiter_enabled:${inventoryRow.baselineCallId}`);
  }
  for (const requiredId of REQUIRED_CURRENT_SOURCE_CALL_IDS) {
    if (!ids.has(requiredId)) reasonCodes.push(`missing_current_source_call_id:${requiredId}`);
  }
  return { ok: reasonCodes.length === 0, reasonCodes };
}

function row(input: {
  callId: PromptEnhancementCostCallIdV1;
  trigger: PromptEnhancementCostCallTriggerV1;
  userVisibleTrigger: PromptEnhancementCostCallUserVisibleTriggerV1;
  hiddenRuntimeTrigger: string;
  requirementState: PromptEnhancementCostCallRequirementStateV1;
  productState: PromptEnhancementCostCallProductStateV1;
  calls: readonly [number, number, number, number | 'not_bounded_for_future_v1'];
  separateLlmCallInV1: boolean;
  skipCondition: string;
  reasonCodes: readonly string[];
  /**
   * This call's own timeout, when it has one.
   *
   * Absent means the row genuinely runs under the global value — which is true of most of them.
   * The three sequence calls name theirs, so a reader of the inventory can see which figure each
   * one is actually measured against rather than assuming they all share one.
   */
  timeoutMs?: number;
  /**
   * This call's own output budget, when it is not the composer's.
   *
   * 🔴 The batch's is several times the composer's, because it writes every remaining prompt in one
   * reply — and a row claiming 2k for it understates the one call where the cap decides whether a
   * long sequence is possible at all.
   */
  outputTokenCap?: number;
}): PromptEnhancementAcceptedCostCallInventoryRowV1 {
  return {
    callId: input.callId,
    owner: 'content_semantics',
    ownerResearchItem: 'cost_visibility',
    implementationModule: 'src/prompt-enhancement/cost-observability.ts',
    trigger: input.trigger,
    userVisibleTrigger: input.userVisibleTrigger,
    hiddenRuntimeTrigger: input.hiddenRuntimeTrigger,
    currentVsNew: 'new_pe_call_surface',
    requirementState: input.requirementState,
    productState: input.productState,
    provider: PROMPT_ENHANCEMENT_COST_PROVIDER_V1,
    model: PROMPT_ENHANCEMENT_COST_MODEL_V1,
    pricingSourceUrl: PROMPT_ENHANCEMENT_COST_PRICING_SOURCE_URL_V1,
    pricingAccessDate: PROMPT_ENHANCEMENT_COST_PRICING_ACCESS_DATE_V1,
    processingModeAssumption: PROMPT_ENHANCEMENT_COST_PROCESSING_MODE_ASSUMPTION_V1,
    contextTierAssumption: PROMPT_ENHANCEMENT_COST_CONTEXT_TIER_ASSUMPTION_V1,
    addOnCostAssumption: PROMPT_ENHANCEMENT_COST_ADD_ON_ASSUMPTION_V1,
    regionalDataResidencyAssumption: PROMPT_ENHANCEMENT_COST_REGIONAL_DATA_RESIDENCY_ASSUMPTION_V1,
    inputTokenCap: PROMPT_ENHANCEMENT_COST_INPUT_TOKEN_CAP_V1,
    outputTokenCap: input.outputTokenCap ?? PROMPT_ENHANCEMENT_COST_OUTPUT_TOKEN_CAP_V1,
    timeoutMs: input.timeoutMs ?? PROMPT_ENHANCEMENT_COST_TIMEOUT_MS_V1,
    retryCount: PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1,
    cacheAssumption: 'no_cache_savings_no_addons',
    fallbackReasons: FALLBACK_REASONS,
    deterministicLocalFallback: 'public_safe_no_generated_content_or_previous_valid_body',
    sendOriginalFallbackState: input.productState === 'future_product_scope_not_in_v1'
      ? 'not_applicable_future_scope'
      : 'send_original_available_when_safety_allows',
    latencyImpact: 'wait_for_full_result_under_timeout',
    latencyStateLabel: 'wait_for_full_result_under_timeout',
    uiProviderApiLatencyStateLabel: input.productState === 'future_runtime_gated_not_cost_gated' ||
      input.productState === 'future_product_scope_not_in_v1' ||
      input.productState === 'included_in_baseline_no_separate_v1_call'
      ? 'product_scope_not_in_v1'
      : 'available_wait_for_full_result',
    telemetrySafeMeasurementFields: PROMPT_ENHANCEMENT_COST_MEASUREMENT_FIELDS_V1,
    productValueSignoffRef: 'accepted_with_product_scope_notes',
    conservativeCallsPerMonth: input.calls[0],
    expectedCallsPerMonth: input.calls[1],
    heavyCallsPerMonth: input.calls[2],
    worstCaseCallsPerMonth: input.calls[3],
    conservativeMonthlyCostState: monthlyCostStateFor(input.calls[0], input.productState),
    expectedMonthlyCostState: monthlyCostStateFor(input.calls[1], input.productState),
    heavyMonthlyCostState: monthlyCostStateFor(input.calls[2], input.productState),
    separateLlmCallInV1: input.separateLlmCallInV1,
    skipCondition: input.skipCondition,
    passFailStatus: input.productState === 'future_product_scope_not_in_v1'
      ? 'future_scope'
      : 'accepted_with_product_scope_notes',
    openOwnerDecision: openDecisionFor(input.callId, input.productState),
    costVisibilityCanWeakenBehavior: false,
    costVisibilityCanDisableCall: false,
    reasonCodes: input.reasonCodes,
  };
}

function currentSourceRow(input: {
  baselineCallId: PromptEnhancementCurrentSourceCostCallInventoryRowV1['baselineCallId'];
  sourceLayer: string;
  assumedInputTokens: PromptEnhancementCurrentSourceCostCallInventoryRowV1['assumedInputTokens'];
  maxOutputTokens: number;
  timeoutMs: PromptEnhancementCurrentSourceCostCallInventoryRowV1['timeoutMs'];
  retryPolicyState?: PromptEnhancementCurrentSourceCostCallInventoryRowV1['retryPolicyState'];
  fallbackState: PromptEnhancementCurrentSourceCostCallInventoryRowV1['fallbackState'];
  requirementState: PromptEnhancementCurrentSourceCostCallInventoryRowV1['requirementState'];
  userVisibleTrigger: PromptEnhancementCurrentSourceCostCallInventoryRowV1['userVisibleTrigger'];
  hiddenRuntimeTrigger: string;
  skipCondition: string;
  calls: readonly [
    PromptEnhancementCurrentSourceCostCallInventoryRowV1['conservativeCallsPerMonth'],
    PromptEnhancementCurrentSourceCostCallInventoryRowV1['expectedCallsPerMonth'],
    PromptEnhancementCurrentSourceCostCallInventoryRowV1['heavyCallsPerMonth'],
    PromptEnhancementCurrentSourceCostCallInventoryRowV1['worstCaseCallsPerMonth'],
  ];
  costStates: readonly [
    PromptEnhancementCurrentSourceCostCallInventoryRowV1['conservativeMonthlyCostState'],
    PromptEnhancementCurrentSourceCostCallInventoryRowV1['expectedMonthlyCostState'],
    PromptEnhancementCurrentSourceCostCallInventoryRowV1['heavyMonthlyCostState'],
  ];
  worksheetStatus: PromptEnhancementCurrentSourceCostWorksheetStateV1;
  passFailStatus?: PromptEnhancementCurrentSourceCostCallInventoryRowV1['passFailStatus'];
  openOwnerDecision?: PromptEnhancementCurrentSourceCostCallInventoryRowV1['openOwnerDecision'];
}): PromptEnhancementCurrentSourceCostCallInventoryRowV1 {
  return {
    baselineCallId: input.baselineCallId,
    sourceLayer: input.sourceLayer,
    ownerResearchItem: 'cost_visibility',
    implementationModule: input.sourceLayer,
    budgetBucket: 'current_always_on_nexpath_baseline_not_pe',
    currentVsNew: 'current_source_call_surface',
    requirementState: input.requirementState,
    userVisibleTrigger: input.userVisibleTrigger,
    hiddenRuntimeTrigger: input.hiddenRuntimeTrigger,
    skipCondition: input.skipCondition,
    provider: PROMPT_ENHANCEMENT_COST_PROVIDER_V1,
    model: PROMPT_ENHANCEMENT_COST_MODEL_V1,
    pricingSourceUrl: PROMPT_ENHANCEMENT_COST_PRICING_SOURCE_URL_V1,
    pricingAccessDate: PROMPT_ENHANCEMENT_COST_PRICING_ACCESS_DATE_V1,
    processingModeAssumption: PROMPT_ENHANCEMENT_COST_PROCESSING_MODE_ASSUMPTION_V1,
    contextTierAssumption: PROMPT_ENHANCEMENT_COST_CONTEXT_TIER_ASSUMPTION_V1,
    addOnCostAssumption: PROMPT_ENHANCEMENT_COST_ADD_ON_ASSUMPTION_V1,
    regionalDataResidencyAssumption: PROMPT_ENHANCEMENT_COST_REGIONAL_DATA_RESIDENCY_ASSUMPTION_V1,
    assumedInputTokens: input.assumedInputTokens,
    maxOutputTokens: input.maxOutputTokens,
    timeoutMs: input.timeoutMs,
    retryPolicyState: input.retryPolicyState ?? currentSourceRetryPolicyFor(input.baselineCallId, input.timeoutMs),
    fallbackState: input.fallbackState,
    deterministicLocalFallback: input.fallbackState,
    sendOriginalFallbackState: 'not_applicable_current_source_baseline',
    latencyImpact: currentSourceLatencyImpactFor(input.userVisibleTrigger),
    uiProviderApiLatencyStateLabel: currentSourceUiLatencyLabelFor(input.userVisibleTrigger, input.timeoutMs, input.fallbackState),
    conservativeCallsPerMonth: input.calls[0],
    expectedCallsPerMonth: input.calls[1],
    heavyCallsPerMonth: input.calls[2],
    worstCaseCallsPerMonth: input.calls[3],
    conservativeMonthlyCostState: input.costStates[0],
    expectedMonthlyCostState: input.costStates[1],
    heavyMonthlyCostState: input.costStates[2],
    worksheetStatus: input.worksheetStatus,
    passFailStatus: input.passFailStatus ?? currentSourcePassFailStatusFor(input.assumedInputTokens, input.worksheetStatus),
    openOwnerDecision: input.openOwnerDecision ?? currentSourceOpenDecisionFor(input.baselineCallId, input.assumedInputTokens, input.timeoutMs, input.worksheetStatus),
    rawPromptTextExcludedFromTelemetry: true,
    notPeComposerBudget: true,
    costVisibilityCanWeakenBehavior: false,
  };
}

function currentSourceRetryPolicyFor(
  baselineCallId: PromptEnhancementCurrentSourceCostCallInventoryRowV1['baselineCallId'],
  timeoutMs: PromptEnhancementCurrentSourceCostCallInventoryRowV1['timeoutMs'],
): PromptEnhancementCurrentSourceCostCallInventoryRowV1['retryPolicyState'] {
  if (baselineCallId === 'current_decision_session_option_generator') return 'source_one_retry_on_validation_failure';
  if (baselineCallId === 'current_content_template_autogen') return 'source_best_effort_budget_gate_no_public_limit';
  if (timeoutMs === 'source_undefined') return 'source_timeout_or_retry_undefined';
  return 'source_retry_not_declared_fail_safe';
}

function currentSourceLatencyImpactFor(
  trigger: PromptEnhancementCurrentSourceCostCallInventoryRowV1['userVisibleTrigger'],
): PromptEnhancementCurrentSourceCostCallInventoryRowV1['latencyImpact'] {
  if (trigger === 'prompt_submit') return 'current_prompt_submit_pipeline_latency';
  if (trigger === 'stop_decision_session') return 'current_stop_decision_session_latency';
  if (trigger === 'post_popup_best_effort') return 'current_post_popup_best_effort_latency';
  return 'not_user_visible_current_source_latency';
}

function currentSourceUiLatencyLabelFor(
  trigger: PromptEnhancementCurrentSourceCostCallInventoryRowV1['userVisibleTrigger'],
  timeoutMs: PromptEnhancementCurrentSourceCostCallInventoryRowV1['timeoutMs'],
  fallbackState: PromptEnhancementCurrentSourceCostCallInventoryRowV1['fallbackState'],
): PromptEnhancementCurrentSourceCostCallInventoryRowV1['uiProviderApiLatencyStateLabel'] {
  if (timeoutMs === 'source_undefined') return 'current_source_unknown_timeout_measurement';
  if (trigger === 'post_popup_best_effort') return 'current_source_best_effort_no_popup_block';
  if (fallbackState === 'static_fallback' || fallbackState === 'null_or_no_action_fallback') return 'current_source_static_or_null_fallback';
  return 'current_source_fail_safe_no_pe_content';
}

function currentSourcePassFailStatusFor(
  assumedInputTokens: PromptEnhancementCurrentSourceCostCallInventoryRowV1['assumedInputTokens'],
  worksheetStatus: PromptEnhancementCurrentSourceCostWorksheetStateV1,
): PromptEnhancementCurrentSourceCostCallInventoryRowV1['passFailStatus'] {
  if (assumedInputTokens === 'blocked_pending_source_value') return 'blocked_pending_source_value';
  return worksheetStatus;
}

function currentSourceOpenDecisionFor(
  baselineCallId: PromptEnhancementCurrentSourceCostCallInventoryRowV1['baselineCallId'],
  assumedInputTokens: PromptEnhancementCurrentSourceCostCallInventoryRowV1['assumedInputTokens'],
  timeoutMs: PromptEnhancementCurrentSourceCostCallInventoryRowV1['timeoutMs'],
  worksheetStatus: PromptEnhancementCurrentSourceCostWorksheetStateV1,
): PromptEnhancementCurrentSourceCostCallInventoryRowV1['openOwnerDecision'] {
  if (baselineCallId === 'current_decision_session_option_generator') return 'source_reachability_reopen_if_proven';
  if (assumedInputTokens === 'blocked_pending_source_value') return 'source_input_value_pending';
  if (timeoutMs === 'source_undefined') return 'source_timeout_measurement_pending';
  if (worksheetStatus === 'accepted_source_mean_assumption') return 'none_for_source_mean_assumption';
  return 'current_source_monthly_values_pending';
}

function toContractTrigger(trigger: PromptEnhancementCostCallTriggerV1): PromptEnhancementCostVisibilityMetadataV1['callTrigger'] {
  if (trigger === 'additional_details') return 'additional_details';
  if (trigger === 'safety_review') return 'safety_review';
  if (trigger === 'prepare') return 'prepare';
  if (trigger === 'directional_action') return 'directional_action';
  return 'none';
}

function providerAvailabilityStateFor(
  providerFailureState: PromptEnhancementProviderFailureStateV1 | undefined,
): PromptEnhancementCostMeasurementRecordV1['providerAvailabilityState'] {
  if (!providerFailureState || providerFailureState === 'none' || providerFailureState === 'timeout') return 'available';
  return 'unavailable_by_provider_api';
}

function monthlyCostStateFor(
  callsPerMonth: number,
  productState: PromptEnhancementCostCallProductStateV1,
): PromptEnhancementCostWorksheetCostStateV1 {
  if (productState === 'future_product_scope_not_in_v1') return 'future_scope_not_bounded';
  if (callsPerMonth === 0) return 'zero_no_separate_call';
  return 'accepted_in_private_cost_visibility_packet_not_public_constant';
}

function openDecisionFor(
  callId: PromptEnhancementCostCallIdV1,
  productState: PromptEnhancementCostCallProductStateV1,
): PromptEnhancementAcceptedCostCallInventoryRowV1['openOwnerDecision'] {
  if (callId === 'source_signal_guidance_in_baseline') return 'later_written_yes_no_required_for_architecture_reopen';
  if (productState === 'future_product_scope_not_in_v1') return 'future_product_scope_requires_new_decision';
  return 'none_for_accepted_product_scope';
}

const REQUIRED_CALL_IDS: readonly PromptEnhancementCostCallIdV1[] = [
  'baseline_pe_composer',
  'source_signal_guidance_in_baseline',
  'action_shorter',
  'action_more_thorough',
  'action_more_project_grounded',
  'additional_details_recomposition',
  'feedback_reason_rewrite',
  'custom_feedback_classification',
  'later_popup_feedback_decision',
  'optional_safety_review',
  'sequence_planning',
  'sequence_summary_wording',
  'sequence_item_wording',
  'future_regenerate_flow',
  'future_modification_instruction_flow',
];

const REQUIRED_CURRENT_SOURCE_CALL_IDS: readonly PromptEnhancementCurrentSourceCostCallInventoryRowV1['baselineCallId'][] = [
  'current_profile_classifier',
  'current_stream_b_presence_classifier',
  'current_stage_classifier',
  'current_sensitive_action_micro_clearance',
  'current_pinch_label_generator',
  'current_decision_session_option_generator',
  'current_content_template_grounding',
  'current_content_template_prompt_param_extraction',
  'current_content_template_simpler_derive',
  'current_content_template_autogen',
];
