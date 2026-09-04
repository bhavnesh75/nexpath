import { describe, expect, it } from 'vitest';
import { STAGE2_MAX_OUTPUT_TOKENS } from '../classifier/Stage2Trigger.js';
import {
  buildPromptEnhancementCostVisibilityMetadataV1,
  buildPromptEnhancementCostRuntimeFlowEvidenceV1,
  getPromptEnhancementAcceptedCostCallInventoryV1,
  getPromptEnhancementCurrentSourceCostBaselineInventoryV1,
  PROMPT_ENHANCEMENT_COST_INPUT_TOKEN_CAP_V1,
  PROMPT_ENHANCEMENT_COST_MEASUREMENT_FIELDS_V1,
  PROMPT_ENHANCEMENT_COST_MODEL_V1,
  PROMPT_ENHANCEMENT_COST_OUTPUT_TOKEN_CAP_V1,
  PROMPT_ENHANCEMENT_COST_ADD_ON_ASSUMPTION_V1,
  PROMPT_ENHANCEMENT_COST_CONTEXT_TIER_ASSUMPTION_V1,
  PROMPT_ENHANCEMENT_COST_PRICING_ACCESS_DATE_V1,
  PROMPT_ENHANCEMENT_COST_PRICING_SOURCE_URL_V1,
  PROMPT_ENHANCEMENT_COST_PROCESSING_MODE_ASSUMPTION_V1,
  PROMPT_ENHANCEMENT_COST_PROVIDER_V1,
  PROMPT_ENHANCEMENT_COST_REGIONAL_DATA_RESIDENCY_ASSUMPTION_V1,
  PROMPT_ENHANCEMENT_COST_TIMEOUT_MS_V1,
  PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1,
  promptEnhancementCostWeakeningReasonCodesV1,
  sanitizePromptEnhancementCostMeasurementV1,
  validatePromptEnhancementCurrentSourceCostInventoryV1,
  validatePromptEnhancementCostInventoryV1,
} from './cost-observability.js';
import type { PromptEnhancementCostCallIdV1 } from './contracts.js';

const requiredCallIds: readonly PromptEnhancementCostCallIdV1[] = [
  'baseline_pe_composer',
  'llm_route_decision_call',
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

describe('Phase 12 cost, provider, latency, and observability contracts', () => {
  it('lists every accepted or future-gated PE LLM/API call with owner, provider, caps, timeout, retry, and fallback', () => {
    const inventory = getPromptEnhancementAcceptedCostCallInventoryV1();

    expect(validatePromptEnhancementCostInventoryV1(inventory)).toEqual({ ok: true, reasonCodes: [] });
    expect(inventory.map((row) => row.callId)).toEqual(requiredCallIds);
    for (const row of inventory) {
      expect(row.owner).toBe('content_semantics');
      expect(row.ownerResearchItem).toBe('cost_visibility');
      expect(row.implementationModule).toBe('src/prompt-enhancement/cost-observability.ts');
      expect(row.userVisibleTrigger).not.toBe('');
      expect(row.hiddenRuntimeTrigger).not.toBe('');
      expect(row.provider).toBe(PROMPT_ENHANCEMENT_COST_PROVIDER_V1);
      expect(row.model).toBe(PROMPT_ENHANCEMENT_COST_MODEL_V1);
      expect(row.pricingSourceUrl).toBe(PROMPT_ENHANCEMENT_COST_PRICING_SOURCE_URL_V1);
      expect(row.pricingAccessDate).toBe(PROMPT_ENHANCEMENT_COST_PRICING_ACCESS_DATE_V1);
      expect(row.processingModeAssumption).toBe(PROMPT_ENHANCEMENT_COST_PROCESSING_MODE_ASSUMPTION_V1);
      expect(row.contextTierAssumption).toBe(PROMPT_ENHANCEMENT_COST_CONTEXT_TIER_ASSUMPTION_V1);
      expect(row.addOnCostAssumption).toBe(PROMPT_ENHANCEMENT_COST_ADD_ON_ASSUMPTION_V1);
      expect(row.regionalDataResidencyAssumption).toBe(PROMPT_ENHANCEMENT_COST_REGIONAL_DATA_RESIDENCY_ASSUMPTION_V1);
      expect(row.inputTokenCap).toBe(PROMPT_ENHANCEMENT_COST_INPUT_TOKEN_CAP_V1);
      // Stated and sane, NOT the composer's by fiat. Requiring equality here is what compelled the
      // batch's row to claim a 2k cap while the batch asks for 4k — the figure the plan calls
      // structurally incompatible with the locked item count.
      expect(typeof row.outputTokenCap === 'number' ? row.outputTokenCap : 1).toBeGreaterThan(0);
      // Same shape as the cap above, and it passes today only because the three sequence rows happen
      // to hold the same value. It would fail the moment one differed — which is the entire reason
      // those calls were given timeouts of their own.
      expect(typeof row.timeoutMs === 'number' ? row.timeoutMs : 1).toBeGreaterThan(0);
      expect(row.retryCount).toBe(PROMPT_ENHANCEMENT_COST_VALIDATION_RETRY_COUNT_V1);
      expect(row.cacheAssumption).toBe('no_cache_savings_no_addons');
      expect(row.currentVsNew).toBe('new_pe_call_surface');
      expect(row.requirementState).toMatch(/required_when_contract_executes|optional_product_selected_when_triggered|included_in_baseline_no_separate_call|conditional_if_later_popup_llm_reasoning|future_only_not_v1/);
      expect(row.fallbackReasons).toEqual(expect.arrayContaining(['provider_unavailable', 'timeout', 'validation_failed']));
      expect(row.latencyImpact).toBe('wait_for_full_result_under_timeout');
      expect(row.latencyStateLabel).toBe('wait_for_full_result_under_timeout');
      expect(row.uiProviderApiLatencyStateLabel).toMatch(/available_wait_for_full_result|product_scope_not_in_v1/);
      expect(row.skipCondition).not.toBe('');
      expect(row.conservativeCallsPerMonth).toBeGreaterThanOrEqual(0);
      expect(row.expectedCallsPerMonth).toBeGreaterThanOrEqual(0);
      expect(row.heavyCallsPerMonth).toBeGreaterThanOrEqual(0);
      expect(row.conservativeMonthlyCostState).toMatch(/accepted_in_private_cost_visibility_packet_not_public_constant|zero_no_separate_call|future_scope_not_bounded/);
      expect(row.expectedMonthlyCostState).toMatch(/accepted_in_private_cost_visibility_packet_not_public_constant|zero_no_separate_call|future_scope_not_bounded/);
      expect(row.heavyMonthlyCostState).toMatch(/accepted_in_private_cost_visibility_packet_not_public_constant|zero_no_separate_call|future_scope_not_bounded/);
      expect(row.deterministicLocalFallback).toBe('public_safe_no_generated_content_or_previous_valid_body');
      expect(row.sendOriginalFallbackState).toMatch(/send_original_available_when_safety_allows|not_applicable_future_scope/);
      expect(row.passFailStatus).toMatch(/accepted_with_product_scope_notes|future_scope/);
      expect(row.openOwnerDecision).toMatch(/none_for_accepted_product_scope|later_written_yes_no_required_for_architecture_reopen|future_product_scope_requires_new_decision/);
      expect(row.telemetrySafeMeasurementFields).toEqual(PROMPT_ENHANCEMENT_COST_MEASUREMENT_FIELDS_V1);
      expect(row.productValueSignoffRef).toBe('accepted_with_product_scope_notes');
      expect(row.costVisibilityCanWeakenBehavior).toBe(false);
      expect(row.costVisibilityCanDisableCall).toBe(false);
    }
  });

  it('marks sequence rows as future-runtime gated without treating cost as the gate', () => {
    const inventory = getPromptEnhancementAcceptedCostCallInventoryV1();
    const sequenceRows = inventory.filter((row) => row.callId.startsWith('sequence_'));

    // Three: the planner, the summary wording and the per-item wording. The planner joined so its
    // measurement had a row to be counted in, and it carries the same gated classification — a row
    // saying otherwise would have the source claim v1-live while the runtime is fail-closed.
    expect(sequenceRows).toHaveLength(3);
    expect(sequenceRows.map((row) => row.callId)).toContain('sequence_planning');
    expect(sequenceRows.every((row) => row.requirementState === 'future_only_not_v1')).toBe(true);
    expect(sequenceRows.every((row) => row.productState === 'future_runtime_gated_not_cost_gated')).toBe(true);
    expect(sequenceRows.every((row) => row.costVisibilityCanDisableCall === false)).toBe(true);
  });

  it('keeps baseline-included, conditional, and future-only worksheet rows explicit without hidden v1 calls', () => {
    const inventory = getPromptEnhancementAcceptedCostCallInventoryV1();
    const byId = new Map(inventory.map((row) => [row.callId, row]));

    expect(byId.get('source_signal_guidance_in_baseline')).toMatchObject({
      productState: 'included_in_baseline_no_separate_v1_call',
      requirementState: 'included_in_baseline_no_separate_call',
      userVisibleTrigger: 'not_user_visible_included_in_baseline',
      conservativeCallsPerMonth: 0,
      expectedCallsPerMonth: 0,
      heavyCallsPerMonth: 0,
      conservativeMonthlyCostState: 'zero_no_separate_call',
      separateLlmCallInV1: false,
      openOwnerDecision: 'later_written_yes_no_required_for_architecture_reopen',
    });
    expect(byId.get('later_popup_feedback_decision')).toMatchObject({
      productState: 'conditional_v1_later_popup_if_llm_reasoning',
      requirementState: 'conditional_if_later_popup_llm_reasoning',
      heavyCallsPerMonth: 225,
      separateLlmCallInV1: true,
    });
    for (const callId of ['future_regenerate_flow', 'future_modification_instruction_flow'] as const) {
      expect(byId.get(callId)).toMatchObject({
        productState: 'future_product_scope_not_in_v1',
        requirementState: 'future_only_not_v1',
        conservativeCallsPerMonth: 0,
        expectedCallsPerMonth: 0,
        heavyCallsPerMonth: 0,
        worstCaseCallsPerMonth: 'not_bounded_for_future_v1',
        conservativeMonthlyCostState: 'future_scope_not_bounded',
        expectedMonthlyCostState: 'future_scope_not_bounded',
        heavyMonthlyCostState: 'future_scope_not_bounded',
        separateLlmCallInV1: false,
        passFailStatus: 'future_scope',
        openOwnerDecision: 'future_product_scope_requires_new_decision',
      });
    }
  });

  it('keeps current always-on Nexpath baseline calls separate from new PE call inventory', () => {
    const baseline = getPromptEnhancementCurrentSourceCostBaselineInventoryV1();
    const peCallIds = new Set(getPromptEnhancementAcceptedCostCallInventoryV1().map((row) => row.callId));

    expect(validatePromptEnhancementCurrentSourceCostInventoryV1(baseline)).toEqual({ ok: true, reasonCodes: [] });
    expect(baseline.map((row) => row.baselineCallId)).toEqual([
      'current_profile_classifier',
      'current_stream_b_presence_classifier',
      'current_stage_classifier',
      // The sensitive-action clearance micro-call — owner-approved 2026-08-25, measured
      // 45/45 on the frozen set in this focused form; gated, parallel, fail-closed.
      'current_sensitive_action_micro_clearance',
      'current_pinch_label_generator',
      'current_decision_session_option_generator',
      'current_content_template_grounding',
      'current_content_template_prompt_param_extraction',
      'current_content_template_simpler_derive',
      'current_content_template_autogen',
    ]);
    for (const row of baseline) {
      expect(peCallIds.has(row.baselineCallId as PromptEnhancementCostCallIdV1)).toBe(false);
      expect(row.ownerResearchItem).toBe('cost_visibility');
      expect(row.implementationModule).toBe(row.sourceLayer);
      expect(row.budgetBucket).toBe('current_always_on_nexpath_baseline_not_pe');
      expect(row.pricingSourceUrl).toBe(PROMPT_ENHANCEMENT_COST_PRICING_SOURCE_URL_V1);
      expect(row.pricingAccessDate).toBe(PROMPT_ENHANCEMENT_COST_PRICING_ACCESS_DATE_V1);
      expect(row.processingModeAssumption).toBe(PROMPT_ENHANCEMENT_COST_PROCESSING_MODE_ASSUMPTION_V1);
      expect(row.contextTierAssumption).toBe(PROMPT_ENHANCEMENT_COST_CONTEXT_TIER_ASSUMPTION_V1);
      expect(row.addOnCostAssumption).toBe(PROMPT_ENHANCEMENT_COST_ADD_ON_ASSUMPTION_V1);
      expect(row.regionalDataResidencyAssumption).toBe(PROMPT_ENHANCEMENT_COST_REGIONAL_DATA_RESIDENCY_ASSUMPTION_V1);
      expect(row.notPeComposerBudget).toBe(true);
      expect(row.rawPromptTextExcludedFromTelemetry).toBe(true);
      expect(row.costVisibilityCanWeakenBehavior).toBe(false);
      expect(row.retryPolicyState).toMatch(/source_retry_not_declared_fail_safe|source_one_retry_on_validation_failure|source_best_effort_budget_gate_no_public_limit|source_timeout_or_retry_undefined/);
      expect(row.deterministicLocalFallback).toBe(row.fallbackState);
      expect(row.sendOriginalFallbackState).toBe('not_applicable_current_source_baseline');
      expect(row.latencyImpact).toMatch(/current_prompt_submit_pipeline_latency|current_stop_decision_session_latency|current_post_popup_best_effort_latency|not_user_visible_current_source_latency/);
      expect(row.uiProviderApiLatencyStateLabel).toMatch(/current_source_fail_safe_no_pe_content|current_source_static_or_null_fallback|current_source_best_effort_no_popup_block|current_source_unknown_timeout_measurement/);
      expect(row.passFailStatus).toMatch(/blocked_pending_owner|blocked_pending_source_value|accepted_zero_unless_source_proven|accepted_source_mean_assumption/);
      expect(row.openOwnerDecision).toMatch(/current_source_monthly_values_pending|source_reachability_reopen_if_proven|source_input_value_pending|source_timeout_measurement_pending|none_for_source_mean_assumption/);
    }
  });

  it('keeps current source lifecycle rows worksheet-complete without inventing unmeasured monthly counts', () => {
    const baseline = getPromptEnhancementCurrentSourceCostBaselineInventoryV1();
    const byId = new Map(baseline.map((row) => [row.baselineCallId, row]));

    for (const row of baseline) {
      expect(row.currentVsNew).toBe('current_source_call_surface');
      expect(row.userVisibleTrigger).toMatch(/prompt_submit|stop_decision_session|post_popup_best_effort|not_user_visible/);
      expect(row.hiddenRuntimeTrigger).not.toBe('');
      expect(row.skipCondition).not.toBe('');
      expect(row.worksheetStatus).toMatch(/blocked_pending_owner|accepted_zero_unless_source_proven|accepted_source_mean_assumption/);
      expect(row.conservativeMonthlyCostState).toMatch(/accepted_in_private_cost_visibility_packet_not_public_constant|zero_no_separate_call/);
      expect(row.expectedMonthlyCostState).toMatch(/accepted_in_private_cost_visibility_packet_not_public_constant|zero_no_separate_call/);
      expect(row.heavyMonthlyCostState).toMatch(/accepted_in_private_cost_visibility_packet_not_public_constant|zero_no_separate_call/);
    }
    expect(byId.get('current_profile_classifier')).toMatchObject({
      conservativeCallsPerMonth: 'blocked_pending_owner',
      expectedCallsPerMonth: 'blocked_pending_owner',
      heavyCallsPerMonth: 'blocked_pending_owner',
      worksheetStatus: 'blocked_pending_owner',
    });
    expect(byId.get('current_decision_session_option_generator')).toMatchObject({
      requirementState: 'current_source_row_if_reachable',
      retryPolicyState: 'source_one_retry_on_validation_failure',
      conservativeCallsPerMonth: 0,
      expectedCallsPerMonth: 0,
      heavyCallsPerMonth: 0,
      worstCaseCallsPerMonth: 0,
      conservativeMonthlyCostState: 'zero_no_separate_call',
      expectedMonthlyCostState: 'zero_no_separate_call',
      heavyMonthlyCostState: 'zero_no_separate_call',
      worksheetStatus: 'accepted_zero_unless_source_proven',
      passFailStatus: 'accepted_zero_unless_source_proven',
      openOwnerDecision: 'source_reachability_reopen_if_proven',
    });
    expect(byId.get('current_content_template_prompt_param_extraction')).toMatchObject({
      sourceLayer: 'src/decision-session/content-template-grounding.ts',
      assumedInputTokens: 'blocked_pending_source_value',
      maxOutputTokens: 400,
      timeoutMs: 12_000,
      hiddenRuntimeTrigger: 'recent-prompt prompt-derived param extraction before content-template grounding facts are built',
      worksheetStatus: 'blocked_pending_owner',
      passFailStatus: 'blocked_pending_source_value',
      openOwnerDecision: 'source_input_value_pending',
    });
    expect(byId.get('current_content_template_autogen')).toMatchObject({
      userVisibleTrigger: 'post_popup_best_effort',
      retryPolicyState: 'source_best_effort_budget_gate_no_public_limit',
      conservativeCallsPerMonth: 1,
      expectedCallsPerMonth: 2,
      heavyCallsPerMonth: 4,
      worstCaseCallsPerMonth: 'source_undefined',
      worksheetStatus: 'accepted_source_mean_assumption',
      passFailStatus: 'accepted_source_mean_assumption',
      openOwnerDecision: 'source_timeout_measurement_pending',
      uiProviderApiLatencyStateLabel: 'current_source_unknown_timeout_measurement',
    });
  });

  it('requires the prompt-param extraction current-source row in inventory validation', () => {
    const baselineWithoutPromptParam = getPromptEnhancementCurrentSourceCostBaselineInventoryV1().filter(
      (row) => row.baselineCallId !== 'current_content_template_prompt_param_extraction',
    );

    expect(validatePromptEnhancementCurrentSourceCostInventoryV1(baselineWithoutPromptParam)).toEqual({
      ok: false,
      reasonCodes: ['missing_current_source_call_id:current_content_template_prompt_param_extraction'],
    });
  });

  it('exposes official pricing and processing assumptions on every worksheet row without private cost-threshold values', () => {
    const allRows = [
      ...getPromptEnhancementAcceptedCostCallInventoryV1(),
      ...getPromptEnhancementCurrentSourceCostBaselineInventoryV1(),
    ];

    for (const row of allRows) {
      expect(row.pricingSourceUrl).toBe(PROMPT_ENHANCEMENT_COST_PRICING_SOURCE_URL_V1);
      expect(row.pricingAccessDate).toBe(PROMPT_ENHANCEMENT_COST_PRICING_ACCESS_DATE_V1);
      expect(row.processingModeAssumption).toBe(PROMPT_ENHANCEMENT_COST_PROCESSING_MODE_ASSUMPTION_V1);
      expect(row.contextTierAssumption).toBe(PROMPT_ENHANCEMENT_COST_CONTEXT_TIER_ASSUMPTION_V1);
      expect(row.addOnCostAssumption).toBe(PROMPT_ENHANCEMENT_COST_ADD_ON_ASSUMPTION_V1);
      expect(row.regionalDataResidencyAssumption).toBe(PROMPT_ENHANCEMENT_COST_REGIONAL_DATA_RESIDENCY_ASSUMPTION_V1);
      // Forbidden cost/gate labels built from base64 so this test source stays leak-free (S2/S3).
      const forbidden = new RegExp(['Mi41MA==', 'My4wMA==', 'QUctMTE=', 'R2F0ZS1HMQ=='].map((b) => Buffer.from(b, 'base64').toString('utf8').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
      expect(JSON.stringify(row)).not.toMatch(forbidden);
    }
  });

  it('keeps PE worksheet rows explicit about visible trigger, hidden trigger, fallback, status, and open decision', () => {
    const byId = new Map(getPromptEnhancementAcceptedCostCallInventoryV1().map((row) => [row.callId, row]));

    expect(byId.get('baseline_pe_composer')).toMatchObject({
      ownerResearchItem: 'cost_visibility',
      userVisibleTrigger: 'enhancement_popup_shown',
      passFailStatus: 'accepted_with_product_scope_notes',
      openOwnerDecision: 'none_for_accepted_product_scope',
      sendOriginalFallbackState: 'send_original_available_when_safety_allows',
    });
    expect(byId.get('additional_details_recomposition')).toMatchObject({
      userVisibleTrigger: 'additional_details_apply_clicked',
      hiddenRuntimeTrigger: 'accepted Additional Details Apply text within the 5K-word cap is recomposed with current body/source state',
      passFailStatus: 'accepted_with_product_scope_notes',
    });
    expect(byId.get('future_regenerate_flow')).toMatchObject({
      userVisibleTrigger: 'future_explicit_action',
      passFailStatus: 'future_scope',
      sendOriginalFallbackState: 'not_applicable_future_scope',
      openOwnerDecision: 'future_product_scope_requires_new_decision',
    });
  });

  it('builds call visibility metadata using accepted provider/model constants and counts-only telemetry fields', () => {
    const metadata = buildPromptEnhancementCostVisibilityMetadataV1('action_more_thorough', {
      callVisibilityMode: 'llm_wording',
      plannedCallCount: 1,
      usedCallCount: 1,
      estimatedInputTokens: 512,
      estimatedOutputTokens: 256,
    });

    expect(metadata).toMatchObject({
      callId: 'action_more_thorough',
      callOwner: 'content_semantics',
      callVisibilityMode: 'llm_wording',
      optionalCallAvailabilityState: 'allowed',
      provider: 'openai',
      model: 'gpt-4o-mini',
      pricingSourceUrl: PROMPT_ENHANCEMENT_COST_PRICING_SOURCE_URL_V1,
      pricingAccessDate: PROMPT_ENHANCEMENT_COST_PRICING_ACCESS_DATE_V1,
      processingModeAssumption: PROMPT_ENHANCEMENT_COST_PROCESSING_MODE_ASSUMPTION_V1,
      contextTierAssumption: PROMPT_ENHANCEMENT_COST_CONTEXT_TIER_ASSUMPTION_V1,
      addOnCostAssumption: PROMPT_ENHANCEMENT_COST_ADD_ON_ASSUMPTION_V1,
      regionalDataResidencyAssumption: PROMPT_ENHANCEMENT_COST_REGIONAL_DATA_RESIDENCY_ASSUMPTION_V1,
      inputTokenCap: 8000,
      outputTokenCap: 2000,
      timeoutMs: 45_000,
      retryCount: 3,
      cacheAssumption: 'no_cache_savings_no_addons',
      latencyImpact: 'wait_for_full_result_under_timeout',
      uiProviderApiLatencyStateLabel: 'available_wait_for_full_result',
      plannedCallCount: 1,
      usedCallCount: 1,
      providerAvailabilityState: 'available',
      productValueDiscussionIsRuntimeLimiter: false,
      costVisibilityCanWeakenBehavior: false,
    });
    expect(metadata.telemetrySafeMeasurementFields).toEqual(PROMPT_ENHANCEMENT_COST_MEASUREMENT_FIELDS_V1);
  });

  it('treats actual provider/API execution failure as fallback state, not a cost-budget limiter', () => {
    const metadata = buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', {
      callVisibilityMode: 'provider_unavailable',
      plannedCallCount: 1,
      usedCallCount: 1,
      providerFailureState: 'missing_api_key',
    });

    expect(metadata.optionalCallAvailabilityState).toBe('unavailable_by_provider_api');
    expect(metadata.providerAvailabilityState).toBe('unavailable_by_provider_api');
    expect(metadata.usedCallCount).toBe(0);
    expect(metadata.fallbackReason).toBe('provider_unavailable');
    expect(metadata.productValueDiscussionIsRuntimeLimiter).toBe(false);
  });

  it('labels timeout as no-generated-content fallback without making cost the limiter', () => {
    const metadata = buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', {
      callVisibilityMode: 'fallback_no_llm',
      plannedCallCount: 1,
      usedCallCount: 1,
      providerFailureState: 'timeout',
      fallbackReason: 'timeout',
    });

    expect(metadata.usedCallCount).toBe(0);
    expect(metadata.fallbackReason).toBe('timeout');
    expect(metadata.providerFailureState).toBe('timeout');
    expect(metadata.uiProviderApiLatencyStateLabel).toBe('timeout_no_generated_content');
    expect(metadata.productValueDiscussionIsRuntimeLimiter).toBe(false);
    expect(metadata.costVisibilityCanWeakenBehavior).toBe(false);
  });

  it('sanitizes cost measurement records to telemetry-safe ids, counts, status, timing, and estimates only', () => {
    const record = sanitizePromptEnhancementCostMeasurementV1({
      callId: 'feedback_reason_rewrite',
      plannedCallCount: 1,
      usedCallCount: 1,
      latencyMs: 842,
      estimatedInputTokens: 120,
      estimatedOutputTokens: 80,
      status: 'used',
      rawPromptBody: 'Fix the leaked token sk-live-example',
      rawGeneratedBody: 'Generated private body',
      rawSourceExcerpt: 'private source excerpt',
      rawFeedbackText: 'custom private feedback',
      rawAssistantResponse: 'assistant response',
      rawError: 'provider stack trace',
    });

    expect(record).toMatchObject({
      callId: 'feedback_reason_rewrite',
      owner: 'content_semantics',
      plannedCallCount: 1,
      usedCallCount: 1,
      latencyMs: 842,
      estimatedInputTokens: 120,
      estimatedOutputTokens: 80,
      rawPromptBodyExcluded: true,
      rawGeneratedBodyExcluded: true,
      rawSourceExcerptExcluded: true,
      rawFeedbackTextExcluded: true,
      rawAssistantResponseExcluded: true,
      rawErrorExcluded: true,
      costVisibilityCanWeakenBehavior: false,
    });
    expect(JSON.stringify(record)).not.toContain('sk-live-example');
    expect(JSON.stringify(record)).not.toContain('private source excerpt');
    expect(record.telemetrySafeMeasurementFields).toEqual(PROMPT_ENHANCEMENT_COST_MEASUREMENT_FIELDS_V1);
  });

  it('reports every cost-based disablement or downgrade attempt as prohibited', () => {
    const reasons = promptEnhancementCostWeakeningReasonCodesV1({
      disabledBecauseOfCost: true,
      deferredBecauseOfCost: true,
      frequencyGatedBecauseOfCost: true,
      deterministicDowngradeBecauseOfCost: true,
      promptShrunkBecauseOfCost: true,
      explicitUserActionOnlyBecauseOfCost: true,
      providerFailureState: 'provider_refused',
    });

    expect(reasons).toEqual(expect.arrayContaining([
      'cost_cannot_disable_accepted_call',
      'cost_cannot_defer_accepted_call',
      'cost_cannot_frequency_gate_accepted_call',
      'cost_cannot_downgrade_to_deterministic',
      'cost_cannot_shrink_prompt_sections',
      'cost_cannot_make_path_explicit_user_action_only',
      'provider_failure_allows_public_safe_fallback:provider_refused',
    ]));
  });

  it('builds live prompt-start to popup to delivery evidence from safe ids, counts, status, and timing only', () => {
    const callVisibilityMetadata = buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', {
      callVisibilityMode: 'llm_wording',
      plannedCallCount: 1,
      usedCallCount: 1,
      estimatedInputTokens: 640,
      estimatedOutputTokens: 420,
    });
    const packet = buildPromptEnhancementCostRuntimeFlowEvidenceV1({
      evidenceId: 'cost-evidence-1',
      enhancementId: 'enh-runtime-cost-1',
      requestId: 'req-runtime-cost-1',
      bodyId: 'body-runtime-cost-1',
      bodyRevision: 1,
      generatedOriginId: 'origin-runtime-cost-1',
      deliveryAttemptId: 'delivery-runtime-cost-1',
      callVisibilityMetadata,
      observedSurfaces: ['prompt_start_prepare', 'enhancement_popup', 'stop_or_extension_delivery'],
      storeRecordRefs: ['source-use-1', 'generated-origin-1'],
      telemetrySyncState: 'sync_failed_measurement_still_local',
      measurementInputs: [{
        callId: 'baseline_pe_composer',
        plannedCallCount: 1,
        usedCallCount: 1,
        latencyMs: 734,
        estimatedInputTokens: 640,
        estimatedOutputTokens: 420,
        status: 'used',
        rawPromptBody: 'private prompt with sk-live-example',
        rawGeneratedBody: 'private generated prompt body',
        rawSourceExcerpt: 'private source excerpt',
        rawFeedbackText: 'private feedback text',
        rawError: 'provider stack with private values',
      }],
    });

    expect(packet.aggregate).toMatchObject({
      plannedCallCount: 1,
      usedCallCount: 1,
      latencyMsTotal: 734,
      fallbackCount: 0,
      providerUnavailableCount: 0,
      timeoutCount: 0,
    });
    expect(packet.telemetrySyncState).toBe('sync_failed_measurement_still_local');
    expect(packet.privacyExclusions).toMatchObject({
      rawPromptBodyExcluded: true,
      rawGeneratedBodyExcluded: true,
      rawSourceExcerptExcluded: true,
      rawFeedbackTextExcluded: true,
      rawErrorExcluded: true,
      localWriteAlreadySafe: true,
    });
    expect(JSON.stringify(packet)).not.toContain('sk-live-example');
    expect(JSON.stringify(packet)).not.toContain('private generated prompt body');
    expect(JSON.stringify(packet)).not.toContain('private source excerpt');
    expect(JSON.stringify(packet)).not.toContain('private feedback text');
    expect(JSON.stringify(packet)).not.toContain('provider stack');
    expect(packet.costVisibilityCanWeakenBehavior).toBe(false);
    expect(packet.productValueDiscussionIsRuntimeLimiter).toBe(false);
    expect(packet.reasonCodes).toEqual(['cost_visibility_is_not_runtime_limiter']);
  });

  it('keeps provider failure and timeout evidence as fallback proof instead of cost enforcement', () => {
    const callVisibilityMetadata = buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', {
      callVisibilityMode: 'fallback_no_llm',
      plannedCallCount: 1,
      usedCallCount: 1,
      providerFailureState: 'timeout',
      fallbackReason: 'timeout',
    });
    const packet = buildPromptEnhancementCostRuntimeFlowEvidenceV1({
      evidenceId: 'cost-evidence-timeout',
      enhancementId: 'enh-timeout',
      requestId: 'req-timeout',
      callVisibilityMetadata,
      observedSurfaces: ['prompt_start_prepare', 'enhancement_popup', 'stop_or_extension_delivery'],
      measurementInputs: [{
        callId: 'baseline_pe_composer',
        plannedCallCount: 1,
        usedCallCount: 1,
        latencyMs: 10_000,
        status: 'timeout',
        fallbackReason: 'timeout',
        providerFailureState: 'timeout',
      }],
      weakeningCheck: {
        providerFailureState: 'timeout',
      },
    });

    expect(packet.aggregate).toMatchObject({
      plannedCallCount: 1,
      usedCallCount: 1,
      latencyMsTotal: 10_000,
      fallbackCount: 1,
      providerUnavailableCount: 0,
      timeoutCount: 1,
    });
    expect(packet.callVisibilityMetadata.fallbackReason).toBe('timeout');
    expect(packet.callVisibilityMetadata.productValueDiscussionIsRuntimeLimiter).toBe(false);
    expect(packet.reasonCodes).toEqual(['provider_failure_allows_public_safe_fallback:timeout']);
  });

  it('records incomplete live product surfaces as non-blocking evidence instead of a runtime failure', () => {
    const callVisibilityMetadata = buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', {
      callVisibilityMode: 'llm_wording',
      plannedCallCount: 1,
      usedCallCount: 1,
    });
    const packet = buildPromptEnhancementCostRuntimeFlowEvidenceV1({
      evidenceId: 'cost-evidence-incomplete',
      enhancementId: 'enh-incomplete',
      requestId: 'req-incomplete',
      callVisibilityMetadata,
      observedSurfaces: ['prompt_start_prepare'],
      measurementInputs: [{
        callId: 'action_more_thorough',
        plannedCallCount: 1,
        usedCallCount: 1,
        status: 'used',
      }],
      weakeningCheck: {
        disabledBecauseOfCost: true,
      },
    });

    expect(packet.aggregate).toMatchObject({ plannedCallCount: 1, usedCallCount: 1 });
    expect(packet.costVisibilityCanWeakenBehavior).toBe(false);
    expect(packet.productValueDiscussionIsRuntimeLimiter).toBe(false);
    expect(packet.reasonCodes).toEqual(expect.arrayContaining([
      'cost_cannot_disable_accepted_call',
      'runtime_surface_missing:enhancement_popup',
      'runtime_surface_missing:stop_or_extension_delivery',
    ]));
  });
});

describe('call-visibility stage-classifier row tracks the real call budget', () => {
  // The row records the classifier call's cost profile, and its output cap is a
  // SECOND literal for a value that already exists as a constant. That constant
  // is not static: it was raised to 512 in this milestone precisely because the
  // reply gained primary_intent / intent_confidence / capability_candidates /
  // debug_evidence_present. Adding a reply field is an ordinary move here, so
  // without this assertion the next one leaves the cost row quietly reporting a
  // cap the call no longer uses — wrong input to an owner-gated cost worksheet,
  // with every suite green.
  it('the recorded maxOutputTokens IS the cap the call actually sends', () => {
    const row = getPromptEnhancementCurrentSourceCostBaselineInventoryV1()
      .find((r) => r.baselineCallId === 'current_stage_classifier');
    expect(row).toBeDefined();
    expect(row!.maxOutputTokens).toBe(STAGE2_MAX_OUTPUT_TOKENS);
    expect(row!.sourceLayer).toBe('src/classifier/stage-classifier.ts');
    expect(row!.fallbackState).toBe('deterministic_or_local_fallback');
  });
});
