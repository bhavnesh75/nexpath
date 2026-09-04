import { promptEnhancementAuthorityModeForTextV1, promptEnhancementRiskKindsForTextV1 } from './safety-sendability.js';
import type { Stage } from '../classifier/types.js';

// The taxonomy ids live in a LEAF module (see taxonomy-ids.ts) so the stage
// classifier can build its intent menu without a load-order cycle; re-exported
// here so every existing importer keeps working unchanged.
export * from './taxonomy-ids.js';
import {
  PROMPT_ENHANCEMENT_FAMILIES,
  PROMPT_ENHANCEMENT_CAPABILITIES,
  DEBUG_PRIMARY_INTENTS,
  MAINTENANCE_PRIMARY_INTENTS,
  REVIEW_PRIMARY_INTENTS,
  FEATURE_PRIMARY_INTENTS,
  PLANNING_PRIMARY_INTENTS,
  QUICK_IMPROVEMENT_PRIMARY_INTENTS,
  PROMPT_ENHANCEMENT_PRIMARY_INTENTS,
  PROMPT_ENHANCEMENT_INTENT_ALIASES,
  type PromptEnhancementFamilyId,
  type PromptEnhancementPrimaryIntent,
  type PromptEnhancementCapabilityId,
  DEBUG_EVIDENCE_FORMS,
  type DebugEvidenceForm,
  type PromptEnhancementLadderResolutionV1,
} from './taxonomy-ids.js';
import { STAGES } from '../classifier/types.js';
import type {
  PromptEnhancementCallVisibilityMode,
  PromptEnhancementFallbackMode,
  PromptEnhancementRouteDecisionV1,
  PromptEnhancementSourceInputSnapshotV1,
  PromptEnhancementTemplateRegistryRefV1,
} from './contracts.js';
import { PROMPT_ENHANCEMENT_CONTRACT_VERSION } from './contracts.js';
// Type-only import (erased at runtime) so the enum runtime dep stays one-directional
// (llm-route-decision -> routing-taxonomy); no runtime import cycle.
import type { PromptEnhancementLlmRouteDecisionV1 } from './llm-route-decision.js';
import { getContentTemplateSourceSnapshot, getPromptStartStopSourceSnapshot } from './source-reality.js';



export type PromptEnhancementRouteConfidence =
  | 'strong'
  | 'partial'
  | 'weak_low_risk'
  | 'weak_source_critical'
  | 'conflicting'
  | 'missing';

export type PromptEnhancementRouteFallbackMode =
  | 'none'
  | 'skip_no_popup'
  | 'planning_first'
  | 'confirmation_first'
  | 'fallback_original_with_reason'
  | 'fallback_safe_floor_only'
  | 'disabled_with_reason';

export interface PromptEnhancementRouteInput {
  routeDecisionId: string;
  promptText: string;
  currentStage: Stage;
  prevStage?: Stage;
  triggerKind: 'stage_transition' | 'absence' | 'manual' | 'none';
  firedKey?: string;
  effectiveFiredSource?: string;
  selectedQualifyingAbsence?: string;
  absenceGateReason?: string;
  classifierState: 'fire_recommended' | 'no_fire' | 'degraded_no_fire' | 'not_applicable';
  degradedNoActionState: 'none' | 'degraded_no_fire' | 'no_action_not_applicable' | 'blocked_by_source_gate';
  firstTriggerGateState?: {
    frequencyGate: 'pass' | 'blocked' | 'not_applicable';
    minPromptGate: 'pass' | 'blocked' | 'not_applicable';
    cooldownState: 'pass' | 'blocked' | 'not_applicable';
    dedupeState: 'pass' | 'blocked' | 'not_applicable';
    sessionCapState: 'pass' | 'blocked' | 'not_applicable';
    classifierRecommendationState: 'fire_recommended' | 'no_fire' | 'not_applicable';
  };
  sourceSnapshot?: PromptEnhancementSourceInputSnapshotV1;
  sourceFactRefs?: readonly string[];
  contentTemplateFactRefs?: readonly string[];
  recentPromptEvidenceRefs?: readonly string[];
  memoryFeedbackRefs?: readonly string[];
  profileTieBreakerRefs?: readonly string[];
  permissionMode?: string;
  transcriptPathState?: 'provided' | 'not_provided' | 'not_authority';
  streamBOutputRefs?: readonly string[];
  paramEventChannels?: readonly string[];
  runtimeEnvFactRefs?: readonly string[];
  rightGoodWorkStyleRefs?: readonly string[];
  stage2SelectionState?: 'selected' | 'qualifying_but_unselected' | 'supplementary_present' | 'absent_unselected_diagnostic' | 'counter_update_only' | 'rejected_unknown_key';
  /**
   * The stage classifier's intent proposal from the one parked call. When present
   * and non-empty, routing PREFERS it over the deterministic cascade; when empty
   * (thin evidence, degraded path, no key) the cascade answers, unchanged.
   */
  classifierPrimaryIntent?: PromptEnhancementPrimaryIntent | '';
  classifierIntentConfidence?: number;
  /**
   * The classifier's capability OBSERVATION from the same parked call:
   * candidates whose prompt-observable attach conditions the model reported
   * met, and the debug-evidence forms the prompt already contains. These are
   * observations only — the registry decides every attachment and can veto any
   * candidate. `undefined` means no observation channel exists (no-key
   * session); an empty array means the classifier observed and found nothing.
   */
  classifierCapabilityCandidates?: readonly PromptEnhancementCapabilityId[];
  classifierDebugEvidencePresent?: readonly DebugEvidenceForm[];
  generatedOriginState?: 'ordinary_user_prompt' | 'old_ds_advisory_injected' | 'pe_generated' | 'pe_action_generated' | 'sequence_generated' | 'unknown';
  oldDecisionSessionPayloadPresent?: boolean;
}

export interface PromptEnhancementTaxonomyPreset {
  id: string;
  schemaVersion: typeof PROMPT_ENHANCEMENT_CONTRACT_VERSION;
  templateType: 'prompt-enhancement-template';
  family: PromptEnhancementFamilyId;
  primaryIntent: PromptEnhancementPrimaryIntent;
  coveredIntentTags: readonly PromptEnhancementPrimaryIntent[];
  baseSkeletonId: string;
  capabilityOverlays: readonly PromptEnhancementCapabilityId[];
  capabilityCompatibility: readonly {
    capabilityId: PromptEnhancementCapabilityId;
    status: 'compatible' | 'rejected';
    reasonCode: string;
  }[];
  requiredSections: readonly string[];
  optionalSections: readonly string[];
  conditionalSections: readonly string[];
  shorterMinimum: readonly string[];
  moreThoroughAdds: readonly string[];
  moreProjectGroundedAdds: readonly string[];
  baselineSourceSignalSlot: string | 'not_applicable';
  applicabilityAxes: readonly string[];
  contentTemplateInputRefs: readonly string[];
  contentTemplateRuntimeSeamUse: 'none';
  safetyHooks: readonly string[];
  sectionMetadata: {
    requiresSourceIds: true;
    supportsFeedbackTargeting: true;
    supportsPublicSafeReasons: true;
  };
  slotEvidenceStatus: 'prompt_provided_or_explicit_missing';
  requirementSourceStatus: 'prompt_provided_context_derived_missing_or_not_applicable';
  handoffFlags: readonly string[];
  routeFixtureIds: readonly string[];
  evaluationFixtureIds: readonly string[];
  metadataContract: readonly string[];
  callVisibilityMode: PromptEnhancementCallVisibilityMode;
  llmCallPolicy: 'no_call';
  fallbackMode: PromptEnhancementRouteFallbackMode;
  fallbackContract: {
    reasonCodes: readonly string[];
    sendOriginalPreserved: true;
  };
  noPopupContract: {
    skipNoPopupFixtureId: string;
    sendOriginalPreserved: true;
  };
}

export interface PromptEnhancementRouteResult {
  contractDecision: PromptEnhancementRouteDecisionV1;
  selectedPreset: PromptEnhancementTaxonomyPreset;
  familyId: PromptEnhancementFamilyId;
  primaryIntent: PromptEnhancementPrimaryIntent;
  secondaryIntentTags: readonly PromptEnhancementPrimaryIntent[];
  capabilityOverlays: readonly PromptEnhancementCapabilityId[];
  routeConfidence: PromptEnhancementRouteConfidence;
  fallbackMode: PromptEnhancementRouteFallbackMode;
  routeEvidenceRefs: readonly string[];
  reasonCodes: readonly string[];
  noPopup: boolean;
  /**
   * The evidence-ladder outcome for this route — present on EVERY routing
   * path, so "the ladder did not resolve" is a typed state downstream layers
   * can read instead of a silently guessed family.
   */
  ladderResolution: PromptEnhancementLadderResolutionV1;
  // P3-G3 (narrowed claim): the deterministic route consumes shared-signal evidence
  // (firedKey / stage / absence) for gating, skip, and evidence decisions and uses NO
  // PE-only classifier or old DS map. It does NOT, however, fuse those signals into
  // primary-intent selection — `selectPrimaryIntent` is prompt-text keyword matching.
  // Shared-signal + NL intent fusion is E6's bounded LLM route decision, not this path.
  usesSharedSignalEvidenceOnly: true;
  usesPeOnlyClassifier: false;
  usesOldStaticDecisionSessionMap: false;
}



export const PROMPT_ENHANCEMENT_STAGE_TRANSITION_SIGNAL_IDS = [
  'IDEA_TO_PRD',
  'PRD_TO_ARCHITECTURE',
  'ARCHITECTURE_TO_TASKS',
  'IMPLEMENTATION_TO_REVIEW',
  'REVIEW_TO_RELEASE',
  'RELEASE_TO_FEEDBACK',
  'TASK_REVIEW',
] as const;

const BASE_METADATA_CONTRACT = [
  'route_input_evidence',
  'candidate_rejection_reasons',
  'route_confidence',
  'ambiguity_state',
  'fallback_state',
  'source_ids',
  'baseline_source_signal_slot',
  'call_visibility_mode',
  'generated_origin_skip',
] as const;

const BASE_APPLICABILITY_AXES = [
  'evidence_strength',
  'prompt_maturity',
  'workflow_difference',
  'developer_workstyle',
  'experience_depth',
  'module_layer',
  'risk_safety_rollback',
  'project_grounding',
  'multi_prompt_suitability',
] as const;

/**
 * The registry's side of the capability contract: the family scope each
 * capability may attach to, encoded from the locked attach/reject columns.
 * Three clauses are deliberately FAIL-CLOSED where their "unless" halves name
 * conditions this layer cannot verify deterministically: decomposition on
 * quick_improvement (needs evidence of multiple bounded subtasks),
 * risk_or_rollback on quick_improvement (needs a high-risk source-critical
 * route), and deeper-review attachment outside review_verification (awaits its
 * safety policy). Each vetoes rather than guesses.
 */
const CAPABILITY_COMPATIBLE_FAMILIES: Record<PromptEnhancementCapabilityId, readonly PromptEnhancementFamilyId[]> = {
  'capability.decomposition_candidate': ['feature_delivery', 'planning_spec', 'issue_debug', 'maintenance_refactor', 'review_verification'],
  'capability.confirmation_needed': PROMPT_ENHANCEMENT_FAMILIES,
  'capability.adversarial_review': ['review_verification'],
  'capability.project_grounding': PROMPT_ENHANCEMENT_FAMILIES,
  'capability.verification_required': PROMPT_ENHANCEMENT_FAMILIES,
  'capability.risk_or_rollback': ['feature_delivery', 'planning_spec', 'issue_debug', 'maintenance_refactor', 'review_verification'],
  'capability.reproduction_or_evidence_needed': ['issue_debug'],
  'capability.behavior_preservation': ['maintenance_refactor', 'review_verification'],
  'capability.source_signal_guidance': PROMPT_ENHANCEMENT_FAMILIES,
};

/** Intent-level exceptions the locked scope columns name beyond whole families. */
const CAPABILITY_COMPATIBLE_INTENTS: Partial<Record<PromptEnhancementCapabilityId, readonly PromptEnhancementPrimaryIntent[]>> = {
  'capability.reproduction_or_evidence_needed': ['planning.debugging_plan'],
  'capability.behavior_preservation': ['feature.upgrade_extension'],
};

export function isCapabilityCompatibleWithRoute(
  capabilityId: PromptEnhancementCapabilityId,
  family: PromptEnhancementFamilyId,
  intent: PromptEnhancementPrimaryIntent,
): boolean {
  return CAPABILITY_COMPATIBLE_FAMILIES[capabilityId].includes(family)
    || (CAPABILITY_COMPATIBLE_INTENTS[capabilityId] ?? []).includes(intent);
}

function preset(input: {
  intent: PromptEnhancementPrimaryIntent;
  family: PromptEnhancementFamilyId;
  baseSkeletonId: string;
  requiredSections: readonly string[];
  capabilityOverlays: readonly PromptEnhancementCapabilityId[];
  routeFixtureSuffix: string;
  evaluationFixtureSuffix: string;
  optionalSections?: readonly string[];
  conditionalSections?: readonly string[];
  moreThoroughAdds?: readonly string[];
  moreProjectGroundedAdds?: readonly string[];
  baselineSourceSignalSlot?: string | 'not_applicable';
  contentTemplateInputRefs?: readonly string[];
  handoffFlags?: readonly string[];
}): PromptEnhancementTaxonomyPreset {
  const requiredSections = withFamilyRequiredFloors(input.family, input.requiredSections);
  const compatibleCapabilityIds = new Set(input.capabilityOverlays);

  return {
    id: `pe-route-${input.intent.replaceAll('.', '-')}`,
    schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
    templateType: 'prompt-enhancement-template',
    family: input.family,
    primaryIntent: input.intent,
    coveredIntentTags: [input.intent],
    baseSkeletonId: input.baseSkeletonId,
    capabilityOverlays: input.capabilityOverlays,
    // The declaration mirrors the registry's attachment authority: statically
    // attached, attachable from a classifier observation within the locked
    // family/intent scope, or rejected outright.
    capabilityCompatibility: PROMPT_ENHANCEMENT_CAPABILITIES.map((capabilityId) => ({
      capabilityId,
      status: compatibleCapabilityIds.has(capabilityId) || isCapabilityCompatibleWithRoute(capabilityId, input.family, input.intent)
        ? 'compatible'
        : 'rejected',
      reasonCode: compatibleCapabilityIds.has(capabilityId)
        ? 'declared_by_capability_contract'
        : isCapabilityCompatibleWithRoute(capabilityId, input.family, input.intent)
          ? 'observation_attachable_within_locked_scope'
          : 'not_attached_to_selected_family_intent_or_current_scope',
    })),
    requiredSections,
    optionalSections: input.optionalSections ?? ['uncertainty_or_clarification', 'source_signal_guidance'],
    conditionalSections: input.conditionalSections ?? ['risk_safety_or_confirmation'],
    shorterMinimum: requiredSections.filter((section) =>
      [
        'original_request_or_goal',
        'reproduction_or_evidence',
        'behavior_preservation',
        'verification_or_test_plan',
        'risk_safety_or_confirmation',
        'requirement_source_state',
      ].includes(section),
    ),
    moreThoroughAdds: input.moreThoroughAdds ?? ['deeper_checks', 'risk_review', 'regression_notes'],
    moreProjectGroundedAdds: input.moreProjectGroundedAdds ?? ['project_facts', 'source_signal_guidance', 'module_layer_refs'],
    baselineSourceSignalSlot: input.baselineSourceSignalSlot ?? 'source_signal_guidance',
    applicabilityAxes: BASE_APPLICABILITY_AXES,
    contentTemplateInputRefs: input.contentTemplateInputRefs ?? [],
    contentTemplateRuntimeSeamUse: 'none',
    safetyHooks: ['source_honesty', 'no_authority_escalation', 'sensitive_action_confirmation'],
    sectionMetadata: {
      requiresSourceIds: true,
      supportsFeedbackTargeting: true,
      supportsPublicSafeReasons: true,
    },
    slotEvidenceStatus: 'prompt_provided_or_explicit_missing',
    requirementSourceStatus: 'prompt_provided_context_derived_missing_or_not_applicable',
    handoffFlags: input.handoffFlags ?? ['metadata_only_no_sequence_runtime'],
    routeFixtureIds: [`route-${input.routeFixtureSuffix}`],
    evaluationFixtureIds: [`eval-${input.evaluationFixtureSuffix}`],
    metadataContract: BASE_METADATA_CONTRACT,
    callVisibilityMode: 'deterministic',
    llmCallPolicy: 'no_call',
    fallbackMode: 'none',
    fallbackContract: {
      reasonCodes: ['insufficient_evidence', 'provider_api_unavailable', 'validation_failed'],
      sendOriginalPreserved: true,
    },
    noPopupContract: {
      skipNoPopupFixtureId: `no-popup-${input.routeFixtureSuffix}`,
      sendOriginalPreserved: true,
    },
  };
}

function withFamilyRequiredFloors(
  family: PromptEnhancementFamilyId,
  sections: readonly string[],
): readonly string[] {
  const floorsByFamily: Partial<Record<PromptEnhancementFamilyId, readonly string[]>> = {
    feature_delivery: ['verification_or_test_plan'],
    planning_spec: ['acceptance_or_output_expectation'],
    issue_debug: ['reproduction_or_evidence', 'verification_or_test_plan'],
    maintenance_refactor: ['behavior_preservation', 'verification_or_test_plan'],
    review_verification: ['finding_format', 'verification_or_test_plan'],
  };
  return [...new Set([...sections, ...(floorsByFamily[family] ?? [])])];
}

const PLANNING_INTENT_SECTIONS: Record<Extract<PromptEnhancementPrimaryIntent, `planning.${string}`>, {
  requiredSections: readonly string[];
  conditionalSections: readonly string[];
  moreThoroughAdds: readonly string[];
}> = {
  'planning.spec_or_prd': {
    requiredSections: ['original_request_or_goal', 'scope_non_goals', 'assumptions_open_questions', 'acceptance_or_output_expectation'],
    conditionalSections: ['requirement_source_state', 'risk_safety_or_confirmation', 'project_grounding'],
    moreThoroughAdds: ['definition_of_done', 'edge_cases', 'stakeholder_context'],
  },
  'planning.architecture_or_design': {
    requiredSections: ['original_request_or_goal', 'system_boundaries', 'interfaces_modules', 'tradeoffs', 'verification_or_test_plan'],
    conditionalSections: ['data_api_contracts', 'risk_safety_or_confirmation', 'dependency_notes'],
    moreThoroughAdds: ['alternatives', 'decision_criteria', 'compatibility_matrix'],
  },
  'planning.task_breakdown': {
    requiredSections: ['original_request_or_goal', 'point_inventory_or_decomposition', 'task_order_dependencies', 'acceptance_or_output_expectation', 'verification_or_test_plan'],
    conditionalSections: ['handoff_or_sequence_candidate', 'ownership_notes', 'risk_safety_or_confirmation'],
    moreThoroughAdds: ['vertical_slice_boundaries', 'milestone_size', 'blocked_decisions'],
  },
  'planning.rollout_release_plan': {
    requiredSections: ['original_request_or_goal', 'rollout_steps', 'verification_or_test_plan', 'rollback_recovery', 'risk_safety_or_confirmation'],
    conditionalSections: ['environment_scope', 'monitoring_observability', 'communication_handoff'],
    moreThoroughAdds: ['release_readiness_checks', 'feature_flag_plan', 'incident_response_notes'],
  },
  'planning.migration_plan': {
    requiredSections: ['original_request_or_goal', 'data_schema_source_of_truth', 'migration_order', 'backup_dry_run', 'rollback_recovery', 'verification_or_test_plan'],
    conditionalSections: ['compatibility', 'risk_safety_or_confirmation', 'project_grounding'],
    moreThoroughAdds: ['expand_migrate_contract', 'data_integrity_checks', 'cutover_validation'],
  },
  'planning.debugging_plan': {
    requiredSections: ['original_request_or_goal', 'problem_statement', 'reproduction_or_evidence', 'hypothesis_isolation', 'verification_or_test_plan'],
    conditionalSections: ['environment', 'recent_change', 'stop_conditions'],
    moreThoroughAdds: ['hypothesis_order', 'targeted_checks', 'regression_notes'],
  },
  'planning.refactor_plan': {
    requiredSections: ['original_request_or_goal', 'behavior_preservation', 'affected_surface', 'incremental_steps', 'verification_or_test_plan'],
    conditionalSections: ['module_layer_order', 'rollback_recovery', 'risk_safety_or_confirmation'],
    moreThoroughAdds: ['baseline_tests', 'dependency_order', 'no_unrelated_change_boundary'],
  },
};

const DEBUG_INTENT_SECTIONS: Record<Extract<PromptEnhancementPrimaryIntent, `issue_debug.${string}`>, {
  requiredSections: readonly string[];
  conditionalSections: readonly string[];
  moreThoroughAdds: readonly string[];
}> = {
  'issue_debug.new_bug_report': {
    requiredSections: ['original_request_or_goal', 'problem_statement', 'expected_actual_state', 'reproduction_or_evidence', 'verification_or_test_plan'],
    conditionalSections: ['environment', 'recent_change', 'impact_severity'],
    moreThoroughAdds: ['hypothesis_isolation', 'fix_boundary', 'regression_notes'],
  },
  'issue_debug.regression_after_recent_change': {
    requiredSections: ['original_request_or_goal', 'last_known_good_current_behavior', 'recent_change', 'reproduction_or_evidence', 'intended_work_preservation', 'verification_or_test_plan'],
    conditionalSections: ['rollback_recovery', 'affected_surface', 'risk_safety_or_confirmation'],
    moreThoroughAdds: ['change_isolation', 'targeted_regression_tests', 'nearby_behavior_checks'],
  },
  'issue_debug.failing_test': {
    requiredSections: ['original_request_or_goal', 'test_command_output', 'fixture_mock_context', 'reproduction_or_evidence', 'narrow_fix_boundary', 'verification_or_test_plan'],
    conditionalSections: ['ci_environment', 'flaky_check', 'regression'],
    moreThoroughAdds: ['targeted_rerun', 'relevant_suite_rerun', 'assertion_quality_check'],
  },
  'issue_debug.runtime_error_exception': {
    requiredSections: ['original_request_or_goal', 'stack_trace_or_error_state', 'triggering_input_state', 'call_path_boundary', 'verification_or_test_plan'],
    conditionalSections: ['environment', 'recent_change', 'error_handling_expectation'],
    moreThoroughAdds: ['exception_path_verification', 'isolation_hypothesis', 'regression_notes'],
  },
  'issue_debug.ui_behavior_mismatch': {
    requiredSections: ['original_request_or_goal', 'user_journey_screen_state', 'expected_actual_state', 'reproduction_or_evidence', 'verification_or_test_plan'],
    conditionalSections: ['browser_device_context', 'screenshot_dom_state', 'accessibility_regression'],
    moreThoroughAdds: ['interaction_state_matrix', 'layout_regression_checks', 'manual_browser_checks'],
  },
  'issue_debug.integration_api_failure': {
    requiredSections: ['original_request_or_goal', 'request_response_sample', 'status_schema_contract', 'auth_config_boundary', 'verification_or_test_plan'],
    conditionalSections: ['upstream_downstream_boundary', 'compatibility', 'secrets_safety'],
    moreThoroughAdds: ['contract_test_plan', 'retry_rate_limit_notes', 'integration_regression_checks'],
  },
  'issue_debug.performance_problem': {
    requiredSections: ['original_request_or_goal', 'baseline_current_metric', 'workload_or_input_size', 'profiling_measurement_path', 'verification_or_test_plan'],
    conditionalSections: ['affected_surface', 'target_metric', 'observability'],
    moreThoroughAdds: ['before_after_measurement', 'hot_path_isolation', 'performance_regression_guard'],
  },
  'issue_debug.flaky_behavior': {
    requiredSections: ['original_request_or_goal', 'pass_fail_comparison', 'repeatability_attempts', 'isolation_hypothesis', 'verification_or_test_plan'],
    conditionalSections: ['timing_concurrency_env_suspects', 'ci_environment', 'network_dependency_state'],
    moreThoroughAdds: ['repeated_verification_matrix', 'race_isolation_plan', 'stabilization_boundary'],
  },
  'issue_debug.environment_config_issue': {
    requiredSections: ['original_request_or_goal', 'non_secret_config_names', 'version_environment_contrast', 'config_diff_or_evidence', 'verification_or_test_plan'],
    conditionalSections: ['local_ci_prod_difference', 'secrets_safety', 'deployment_context'],
    moreThoroughAdds: ['environment_reproduction_matrix', 'non_secret_validation_steps', 'configuration_contract_check'],
  },
  'issue_debug.reproduction_discovery': {
    requiredSections: ['original_request_or_goal', 'smallest_repro_request', 'exact_steps_request', 'expected_actual_state', 'evidence_request'],
    conditionalSections: ['environment', 'recent_change', 'impact_severity'],
    moreThoroughAdds: ['repro_reduction_plan', 'evidence_capture_list', 'stop_before_fix_instruction'],
  },
  'issue_debug.production_incident_or_support': {
    requiredSections: ['original_request_or_goal', 'impact_severity', 'mitigation_boundary', 'evidence_preservation', 'rollback_recovery', 'verification_or_test_plan'],
    conditionalSections: ['environment', 'communication_handoff', 'risk_safety_or_confirmation'],
    moreThoroughAdds: ['restore_service_plan', 'postmortem_followup', 'incident_regression_checks'],
  },
};

const MAINTENANCE_INTENT_SECTIONS: Record<Extract<PromptEnhancementPrimaryIntent, `maintenance.${string}`>, {
  requiredSections: readonly string[];
  conditionalSections: readonly string[];
  moreThoroughAdds: readonly string[];
}> = {
  'maintenance.refactor_no_behavior_change': {
    requiredSections: ['original_request_or_goal', 'behavior_preservation', 'affected_surface', 'baseline_current_output_proof', 'verification_or_test_plan'],
    conditionalSections: ['small_transformation_steps', 'project_grounding', 'risk_safety_or_confirmation'],
    moreThoroughAdds: ['before_after_verification', 'no_feature_change_boundary', 'nearby_regression_checks'],
  },
  'maintenance.dependency_upgrade': {
    requiredSections: ['original_request_or_goal', 'current_new_versions', 'changelog_breaking_change_state', 'compatibility', 'rollback_recovery', 'verification_or_test_plan'],
    conditionalSections: ['lockfile_package_surface', 'security_notes', 'ci_environment'],
    moreThoroughAdds: ['pin_path', 'contract_matrix_tests', 'dependency_risk_review'],
  },
  'maintenance.migration_schema_change': {
    requiredSections: ['original_request_or_goal', 'data_shape_change', 'migration_order', 'backup_dry_run', 'rollback_recovery', 'data_integrity_verification'],
    conditionalSections: ['expand_migrate_contract', 'compatibility', 'risk_safety_or_confirmation'],
    moreThoroughAdds: ['cutover_validation', 'migration_rehearsal', 'rollback_test_plan'],
  },
  'maintenance.cleanup_dead_code': {
    requiredSections: ['original_request_or_goal', 'unused_code_proof', 'reference_search', 'affected_behavior_tests', 'verification_or_test_plan'],
    conditionalSections: ['live_behavior_protection', 'documentation_handoff', 'project_grounding'],
    moreThoroughAdds: ['callsite_matrix', 'removal_boundary', 'post_cleanup_regression'],
  },
  'maintenance.performance_maintenance': {
    requiredSections: ['original_request_or_goal', 'baseline_current_metric', 'profiling_measurement_path', 'smallest_hot_path_change', 'verification_or_test_plan'],
    conditionalSections: ['target_metric', 'affected_surface', 'observability'],
    moreThoroughAdds: ['before_after_measurement', 'regression_guard', 'load_profile_notes'],
  },
  'maintenance.test_hardening': {
    requiredSections: ['original_request_or_goal', 'current_test_weakness', 'behavioral_assertion', 'stable_fixtures', 'verification_or_test_plan'],
    conditionalSections: ['flaky_check', 'ci_environment', 'no_masking_real_failure'],
    moreThoroughAdds: ['local_ci_repeat_matrix', 'fixture_coupling_review', 'assertion_gap_check'],
  },
  'maintenance.documentation_config_upkeep': {
    requiredSections: ['original_request_or_goal', 'source_of_truth_state', 'docs_config_alignment', 'no_secret_leakage', 'verification_or_test_plan'],
    conditionalSections: ['examples', 'implementation_reference', 'documentation_handoff'],
    moreThoroughAdds: ['config_matrix', 'docs_drift_check', 'reader_handoff_notes'],
  },
  'maintenance.compatibility_update': {
    requiredSections: ['original_request_or_goal', 'supported_clients_versions_platforms', 'backward_compatibility_boundary', 'contract_matrix_testing', 'verification_or_test_plan'],
    conditionalSections: ['deprecation_note', 'api_contract_state', 'risk_safety_or_confirmation'],
    moreThoroughAdds: ['compatibility_matrix', 'client_impact_review', 'migration_notes'],
  },
  'maintenance.risk_rollback_heavy': {
    requiredSections: ['original_request_or_goal', 'behavior_preservation', 'risk_statement', 'pre_change_snapshot_baseline', 'rollback_recovery', 'confirmation_need', 'verification_or_test_plan'],
    conditionalSections: ['production_facing_notes', 'incident_recovery', 'risk_safety_or_confirmation'],
    moreThoroughAdds: ['rollback_drill', 'approval_checkpoint', 'post_change_monitoring'],
  },
  'maintenance.incremental_module_layer_cleanup': {
    requiredSections: ['original_request_or_goal', 'boundary_map', 'one_module_layer_at_a_time', 'dependency_order', 'verification_or_test_plan'],
    conditionalSections: ['affected_surface', 'handoff_or_sequence_candidate', 'no_broad_rewrite_boundary'],
    moreThoroughAdds: ['module_sequence_plan', 'per_path_test_plan', 'integration_checkpoint'],
  },
};

const REVIEW_INTENT_SECTIONS: Record<Extract<PromptEnhancementPrimaryIntent, `review.${string}`>, {
  requiredSections: readonly string[];
  conditionalSections: readonly string[];
  moreThoroughAdds: readonly string[];
}> = {
  'review.verification_request': {
    requiredSections: ['original_request_or_goal', 'review_target_scope', 'requirement_source_state', 'verification_or_test_plan', 'residual_risk'],
    conditionalSections: ['evidence_to_inspect', 'pass_fail_criteria', 'project_grounding'],
    moreThoroughAdds: ['checklist_focus', 'observable_outcome', 'risk_summary'],
  },
  'review.code_or_diff_review': {
    requiredSections: ['original_request_or_goal', 'code_diff_target', 'review_scope', 'finding_format', 'verification_or_test_plan'],
    conditionalSections: ['severity', 'file_line_references', 'residual_risk'],
    moreThoroughAdds: ['suggested_fixes', 'regression_risk', 'test_gap_review'],
  },
  'review.requirements_fit_review': {
    requiredSections: ['original_request_or_goal', 'requirement_source_state', 'target_artifact', 'fit_gap_checklist', 'verification_or_test_plan'],
    conditionalSections: ['acceptance_alignment', 'traceability', 'missing_source_note'],
    moreThoroughAdds: ['requirement_mapping', 'edge_case_fit', 'risk_summary'],
  },
  'review.security_review': {
    requiredSections: ['original_request_or_goal', 'security_surface', 'threat_input_auth_secret_data_checks', 'finding_format', 'verification_or_test_plan'],
    conditionalSections: ['severity', 'privacy', 'risk_safety_or_confirmation'],
    moreThoroughAdds: ['remediation_options', 'dependency_security_check', 'residual_risk'],
  },
  'review.architecture_review': {
    requiredSections: ['original_request_or_goal', 'system_boundaries', 'contracts_data_flow', 'tradeoffs', 'finding_format'],
    conditionalSections: ['scalability_maintainability_risk', 'compatibility', 'project_grounding'],
    moreThoroughAdds: ['coupling_interface_review', 'alternatives', 'suggested_changes'],
  },
  'review.performance_review': {
    requiredSections: ['original_request_or_goal', 'baseline_metric_state', 'workload_or_bottleneck_evidence', 'verification_or_test_plan', 'regression_risk'],
    conditionalSections: ['observability', 'target_metric', 'project_grounding'],
    moreThoroughAdds: ['measurement_plan_review', 'before_after_expectation', 'risk_summary'],
  },
  'review.api_contract_review': {
    requiredSections: ['original_request_or_goal', 'request_response_schema', 'backward_compatibility_boundary', 'contract_test_expectation', 'finding_format'],
    conditionalSections: ['auth_error_shape', 'client_server_boundary', 'integration_evidence'],
    moreThoroughAdds: ['versioning_risk', 'schema_diff_review', 'compatibility_matrix'],
  },
  'review.test_review': {
    requiredSections: ['original_request_or_goal', 'test_target', 'behavioral_coverage', 'fixture_mock_quality', 'verification_or_test_plan'],
    conditionalSections: ['flake_risk', 'missing_assertions', 'ci_local_verification'],
    moreThoroughAdds: ['assertion_quality_review', 'fixture_stability_review', 'regression_value'],
  },
};

export const PROMPT_ENHANCEMENT_TAXONOMY_PRESETS: readonly PromptEnhancementTaxonomyPreset[] = [
  preset({
    intent: 'feature.idea_discussion',
    family: 'feature_delivery',
    baseSkeletonId: 'skeleton-feature-idea',
    requiredSections: ['original_request_or_goal', 'context_and_constraints', 'acceptance_or_output_expectation'],
    capabilityOverlays: ['capability.verification_required', 'capability.project_grounding'],
    routeFixtureSuffix: 'feature-idea',
    evaluationFixtureSuffix: 'feature-idea',
  }),
  preset({
    intent: 'feature.fresh_implementation',
    family: 'feature_delivery',
    baseSkeletonId: 'skeleton-feature-fresh-implementation',
    requiredSections: ['original_request_or_goal', 'context_and_constraints', 'approach_or_steps', 'acceptance_or_output_expectation', 'verification_or_test_plan'],
    capabilityOverlays: ['capability.verification_required', 'capability.project_grounding', 'capability.source_signal_guidance'],
    routeFixtureSuffix: 'feature-fresh-implementation',
    evaluationFixtureSuffix: 'feature-fresh-implementation',
  }),
  preset({
    intent: 'feature.upgrade_extension',
    family: 'feature_delivery',
    baseSkeletonId: 'skeleton-feature-upgrade-extension',
    requiredSections: ['original_request_or_goal', 'current_behavior', 'desired_extension', 'compatibility', 'verification_or_test_plan'],
    capabilityOverlays: ['capability.behavior_preservation', 'capability.risk_or_rollback', 'capability.verification_required'],
    routeFixtureSuffix: 'feature-upgrade-extension',
    evaluationFixtureSuffix: 'feature-upgrade-extension',
  }),
  ...([
    ['planning.spec_or_prd', 'skeleton-planning-spec', 'planning-spec-prd'],
    ['planning.architecture_or_design', 'skeleton-planning-architecture', 'planning-architecture'],
    ['planning.task_breakdown', 'skeleton-planning-task-breakdown', 'planning-task-breakdown'],
    ['planning.rollout_release_plan', 'skeleton-planning-rollout', 'planning-rollout-release'],
    ['planning.migration_plan', 'skeleton-planning-migration', 'planning-migration'],
    ['planning.debugging_plan', 'skeleton-planning-debugging', 'planning-debugging'],
    ['planning.refactor_plan', 'skeleton-planning-refactor', 'planning-refactor'],
  ] as const).map(([intent, skeleton, fixture]) =>
    preset({
      intent,
      family: 'planning_spec',
      baseSkeletonId: skeleton,
      requiredSections: PLANNING_INTENT_SECTIONS[intent].requiredSections,
      capabilityOverlays: ['capability.decomposition_candidate', 'capability.confirmation_needed', 'capability.verification_required'],
      routeFixtureSuffix: fixture,
      evaluationFixtureSuffix: fixture,
      conditionalSections: PLANNING_INTENT_SECTIONS[intent].conditionalSections,
      moreThoroughAdds: PLANNING_INTENT_SECTIONS[intent].moreThoroughAdds,
    }),
  ),
  ...DEBUG_PRIMARY_INTENTS.map((intent) =>
    preset({
      intent,
      family: 'issue_debug',
      baseSkeletonId: intent === 'issue_debug.reproduction_discovery' ? 'skeleton-debug-reproduction-discovery' : 'skeleton-debug-base',
      requiredSections: DEBUG_INTENT_SECTIONS[intent].requiredSections,
      // ASK stays static, CARRY goes dynamic: reproduction_discovery's whole
      // purpose is asking for evidence, so the reproduction/evidence request
      // attaches unconditionally there. Every other debug intent treats
      // evidence as content the prompt supplies, and receives the request only
      // from the registry's evidence-lacking rule — a user who pasted the
      // trace, steps and failing test is not asked to capture them again.
      capabilityOverlays: [
        ...(intent === 'issue_debug.reproduction_discovery'
          ? (['capability.reproduction_or_evidence_needed'] as const)
          : []),
        'capability.verification_required',
        'capability.project_grounding',
        'capability.source_signal_guidance',
      ],
      routeFixtureSuffix: intent.replace('issue_debug.', 'issue-debug-').replaceAll('_', '-'),
      evaluationFixtureSuffix: intent.replace('issue_debug.', 'issue-debug-').replaceAll('_', '-'),
      conditionalSections: DEBUG_INTENT_SECTIONS[intent].conditionalSections,
      moreThoroughAdds: DEBUG_INTENT_SECTIONS[intent].moreThoroughAdds,
    }),
  ),
  ...MAINTENANCE_PRIMARY_INTENTS.map((intent) =>
    preset({
      intent,
      family: 'maintenance_refactor',
      baseSkeletonId: 'skeleton-maintenance-base',
      requiredSections: MAINTENANCE_INTENT_SECTIONS[intent].requiredSections,
      capabilityOverlays: [
        'capability.behavior_preservation',
        'capability.verification_required',
        'capability.risk_or_rollback',
        'capability.source_signal_guidance',
      ],
      routeFixtureSuffix: intent.replace('maintenance.', 'maintenance-').replaceAll('_', '-'),
      evaluationFixtureSuffix: intent.replace('maintenance.', 'maintenance-').replaceAll('_', '-'),
      conditionalSections: MAINTENANCE_INTENT_SECTIONS[intent].conditionalSections,
      moreThoroughAdds: MAINTENANCE_INTENT_SECTIONS[intent].moreThoroughAdds,
    }),
  ),
  ...REVIEW_PRIMARY_INTENTS.map((intent) =>
    preset({
      intent,
      family: 'review_verification',
      baseSkeletonId: 'skeleton-review-base',
      requiredSections: REVIEW_INTENT_SECTIONS[intent].requiredSections,
      capabilityOverlays: [
        'capability.verification_required',
        'capability.adversarial_review',
        'capability.project_grounding',
        'capability.source_signal_guidance',
      ],
      routeFixtureSuffix: intent.replace('review.', 'review-').replaceAll('_', '-'),
      evaluationFixtureSuffix: intent.replace('review.', 'review-').replaceAll('_', '-'),
      conditionalSections: REVIEW_INTENT_SECTIONS[intent].conditionalSections,
      moreThoroughAdds: REVIEW_INTENT_SECTIONS[intent].moreThoroughAdds,
    }),
  ),
  preset({
    intent: 'quick_improvement.local_polish_or_small_improvement',
    family: 'quick_improvement',
    baseSkeletonId: 'skeleton-quick-improvement',
    requiredSections: ['original_request_or_goal', 'acceptance_or_output_expectation'],
    capabilityOverlays: ['capability.verification_required'],
    routeFixtureSuffix: 'quick-local-polish',
    evaluationFixtureSuffix: 'quick-local-polish',
    conditionalSections: ['verification_or_test_plan'],
    baselineSourceSignalSlot: 'not_applicable',
  }),
] as const;

export function getPromptEnhancementRoutingSourceGateSnapshot() {
  const promptStartStop = getPromptStartStopSourceSnapshot();
  const contentTemplate = getContentTemplateSourceSnapshot({
    flagType: 'absence:debugging_observation_gap',
    stage: 'implementation',
  });

  return {
    stageIds: STAGES,
    promptStartBoundary: promptStartStop.hookBoundary,
    promptStartCanReplaceSameTurn: promptStartStop.runAutoCanHoldOrReplaceSubmittedPrompt,
    deliveryBoundary: promptStartStop.deliveryBoundary,
    sharedSignalCount: promptStartStop.sharedSignalCount,
    allStageChecklistLineCount: promptStartStop.allStageChecklistLineCount,
    shippedDecisionSessionContentTemplateRecords: contentTemplate.shippedRecordCount,
    stageTransitionSignalIds: PROMPT_ENHANCEMENT_STAGE_TRANSITION_SIGNAL_IDS,
    firstTriggerGates: promptStartStop.firstTriggerGates,
    classifierDegradedNoFireReasons: promptStartStop.classifierDegradedNoFireReasons,
    releaseGuard: promptStartStop.releaseGuard,
    promptStartInputs: promptStartStop.promptStartInputs,
    contentTemplateQuestionServing: contentTemplate.questionServing,
    contentTemplateSourceCascade: contentTemplate.sourceCascade,
    liveContentTemplateSourceUse: 'source_b_input_only',
    routeAuthority: 'shared_signal_and_source_a_taxonomy',
    normalDecisionSessionAdvisoryCompatibility: 'read_only_no_mutation',
    promptEnhancementClassifier: 'not_authorized',
    oldStaticDecisionSessionRouting: 'not_authorized',
    sameTurnPromptReplacement: 'not_authorized',
    registryNamespace: 'prompt-enhancement-templates',
    contentTemplateRuntimeSeamUse: 'none_without_cost_visibility',
  } as const;
}

export function getPromptEnhancementG1AApprovalInventory() {
  return {
    gateId: 'routing_taxonomy_approval_inventory',
    status: 'pending_owner_review',
    families: PROMPT_ENHANCEMENT_FAMILIES,
    primaryIntents: PROMPT_ENHANCEMENT_TAXONOMY_PRESETS.map((presetRecord) => presetRecord.primaryIntent),
    capabilityOverlays: PROMPT_ENHANCEMENT_CAPABILITIES,
    routeFixtureIds: PROMPT_ENHANCEMENT_TAXONOMY_PRESETS.flatMap((presetRecord) => presetRecord.routeFixtureIds),
    evaluationFixtureIds: PROMPT_ENHANCEMENT_TAXONOMY_PRESETS.flatMap((presetRecord) => presetRecord.evaluationFixtureIds),
    intentAliases: PROMPT_ENHANCEMENT_INTENT_ALIASES,
    presetRecords: PROMPT_ENHANCEMENT_TAXONOMY_PRESETS.map((presetRecord) => ({
      id: presetRecord.id,
      family: presetRecord.family,
      primaryIntent: presetRecord.primaryIntent,
      baseSkeletonId: presetRecord.baseSkeletonId,
      capabilityOverlays: presetRecord.capabilityOverlays,
      capabilityCompatibility: presetRecord.capabilityCompatibility,
      requiredSections: presetRecord.requiredSections,
      optionalSections: presetRecord.optionalSections,
      conditionalSections: presetRecord.conditionalSections,
      routeFixtureIds: presetRecord.routeFixtureIds,
      evaluationFixtureIds: presetRecord.evaluationFixtureIds,
      fallbackMode: presetRecord.fallbackMode,
      noPopupFixtureId: presetRecord.noPopupContract.skipNoPopupFixtureId,
    })),
    unsupportedOrDeferredScenarios: [
      'pe_only_classifier',
      'old_static_decision_session_routing',
      'source_b_only_popup_authority',
      'same_turn_prompt_replacement',
      'active_sequence_runtime',
      'cost_based_quality_downgrade',
    ],
    unsupportedOrDeferredScenarioRecords: [
      {
        id: 'pe_only_classifier',
        reasonCode: 'must_consume_shared_signal_adapter_not_new_detector',
      },
      {
        id: 'old_static_decision_session_routing',
        reasonCode: 'decision_session_content_templates_are_source_b_only',
      },
      {
        id: 'source_b_only_popup_authority',
        reasonCode: 'source_a_or_source_critical_exception_required_to_show_popup',
      },
      {
        id: 'same_turn_prompt_replacement',
        reasonCode: 'host_hold_replacement_not_source_proven',
      },
      {
        id: 'active_sequence_runtime',
        reasonCode: 'future_sequence_runtime_owned_by_handoff_gates',
      },
      {
        id: 'cost_based_quality_downgrade',
        reasonCode: 'cost_acceptance_forbids_route_weakening',
      },
    ],
  } as const;
}

export function findPromptEnhancementTaxonomyGaps(): string[] {
  const gaps: string[] = [];
  const families = new Set(PROMPT_ENHANCEMENT_TAXONOMY_PRESETS.map((presetRecord) => presetRecord.family));
  for (const family of PROMPT_ENHANCEMENT_FAMILIES) {
    if (!families.has(family)) gaps.push(`missing_family:${family}`);
  }
  for (const intent of PROMPT_ENHANCEMENT_PRIMARY_INTENTS) {
    if (!PROMPT_ENHANCEMENT_TAXONOMY_PRESETS.some((presetRecord) => presetRecord.primaryIntent === intent)) {
      gaps.push(`missing_primary_intent:${intent}`);
    }
  }
  for (const capability of PROMPT_ENHANCEMENT_CAPABILITIES) {
    if (!PROMPT_ENHANCEMENT_TAXONOMY_PRESETS.some((presetRecord) => presetRecord.capabilityOverlays.includes(capability))) {
      gaps.push(`missing_capability:${capability}`);
    }
  }
  for (const presetRecord of PROMPT_ENHANCEMENT_TAXONOMY_PRESETS) {
    if (presetRecord.templateType !== 'prompt-enhancement-template') gaps.push(`wrong_template_type:${presetRecord.id}`);
    if (presetRecord.contentTemplateRuntimeSeamUse !== 'none') gaps.push(`hidden_content_template_runtime_seam:${presetRecord.id}`);
    if (presetRecord.llmCallPolicy !== 'no_call') gaps.push(`hidden_route_llm_call:${presetRecord.id}`);
    if (presetRecord.routeFixtureIds.length === 0) gaps.push(`missing_route_fixture:${presetRecord.id}`);
    if (presetRecord.evaluationFixtureIds.length === 0) gaps.push(`missing_evaluation_fixture:${presetRecord.id}`);
    if (presetRecord.shorterMinimum.length === 0) gaps.push(`missing_shorter_survivor_floor:${presetRecord.id}`);
  }
  return gaps;
}

/** Type guard: is this string one of the forty typed primary intents? */
export function isKnownPrimaryIntent(value: string | undefined): value is PromptEnhancementPrimaryIntent {
  return value !== undefined && (PROMPT_ENHANCEMENT_PRIMARY_INTENTS as readonly string[]).includes(value);
}

/** Type guard: is this string one of the nine typed capability ids? */
export function isKnownCapabilityId(value: string): value is PromptEnhancementCapabilityId {
  return (PROMPT_ENHANCEMENT_CAPABILITIES as readonly string[]).includes(value);
}

/** Type guard: is this string one of the eight debug-evidence forms? */
export function isKnownDebugEvidenceForm(value: string): value is DebugEvidenceForm {
  return (DEBUG_EVIDENCE_FORMS as readonly string[]).includes(value);
}

/**
 * Walk the locked evidence ladder IN ORDER before declaring under-evidenced.
 * Rung 1 — explicit current-prompt evidence: on the keyed path the
 * classifier's proposal (its decision is ladder-ordered by construction); on
 * the no-key path a matched cascade branch. The bare explicit-word list is
 * deliberately NOT rung-1 evidence — "make it better" contains explicit words
 * and is the canonical ambiguous start. Rungs 2-5 are the deterministic
 * evidence sources that exist without a model: project/source facts, current
 * stage/absence signals, recent prompt history, persistent memory/feedback.
 * Rung 6 (profile tie-breakers) is walked but can never resolve alone; rung 7
 * is locked deferred — never walked, never solicited.
 */
function walkEvidenceLadderV1(
  input: PromptEnhancementRouteInput,
  normalized: string,
): PromptEnhancementLadderResolutionV1 {
  const rungsWalked: number[] = [1];
  // Keyed path: the classifier IS the ladder-walker — it consumed every rung.
  // A non-empty proposal resolves the top route on rung 1; an EMPTY proposal
  // WITH the observation channel present is an authoritative decline ("walked
  // the ladder, nothing resolved"), so the route is under-evidenced even when
  // a keyword branch would match — the model saw the same prompt and more
  // evidence, and said no. The observation channel is the keyed marker: the
  // boundary maps an ABSENT proposal to '' too, so '' alone must not read as
  // a decline.
  if (input.classifierPrimaryIntent) return { state: 'resolved', resolvedByRung: 1 };
  if (input.classifierCapabilityCandidates !== undefined) {
    return { state: 'under_evidenced', rungsWalked: [1, 2, 3, 4, 5, 6] };
  }
  // No-key path: only rung 1 (a matched branch) can NAME a top route —
  // deterministic evidence on later rungs exists but cannot be fused into a
  // family without a model, so those rungs are walked and recorded, never
  // resolving. "The top route remains under-evidenced after the ladder" is
  // about the ROUTE, not about evidence existing somewhere.
  if (selectPrimaryIntent(normalized) !== null) {
    return { state: 'resolved', resolvedByRung: 1 };
  }
  rungsWalked.push(2, 3, 4, 5, 6);
  return { state: 'under_evidenced', rungsWalked };
}

/**
 * Apply the planning posture to a finished route, at the ONE point every route passes through.
 *
 * Routing has several exits — the deterministic cascade, the classifier-intent builder, the
 * no-family return, the LLM route rescue — and a trigger placed on one of them is a trigger the
 * other exits never run. That is not hypothetical: the first build of this phase sat on the
 * cascade's exit alone and was inert for every prompt the classifier named an intent for, which is
 * the ordinary case. Deciding once, here, is what makes "every risky question gets the posture"
 * true rather than true-on-the-path-that-was-tested.
 *
 * Three things it must not disturb, and does not:
 *   - a route with no popup keeps its skip (there is no posture to take when nothing is shown);
 *   - the two evidence-quality triggers already carry `planning_first` under their OWN reason
 *     codes, and a route that already has the posture is left exactly as it is;
 *   - everything else keeps its reason codes, its family, and its evidence state.
 */
function withUnrequestedActionPostureV1(
  result: PromptEnhancementRouteResult,
  promptText: string,
): PromptEnhancementRouteResult {
  if (result.noPopup || result.fallbackMode !== 'none') return result;
  if (!needsUnrequestedActionPosture(promptText)) return result;
  const reasonCodes = [...result.reasonCodes, PROMPT_ENHANCEMENT_UNREQUESTED_ACTION_POSTURE_REASON_V1];
  return {
    ...result,
    fallbackMode: 'planning_first',
    reasonCodes,
    // The contract decision carries the mode; its own reason-code surface is a different,
    // rejected-route field and is deliberately not touched here.
    contractDecision: {
      ...result.contractDecision,
      fallbackMode: 'planning_first',
    },
  };
}

export function routePromptEnhancement(
  input: PromptEnhancementRouteInput,
  llmRouteDecision?: PromptEnhancementLlmRouteDecisionV1,
): PromptEnhancementRouteResult {
  return withUnrequestedActionPostureV1(routeWithoutPostureV1(input, llmRouteDecision), input.promptText);
}

function routeWithoutPostureV1(
  input: PromptEnhancementRouteInput,
  llmRouteDecision?: PromptEnhancementLlmRouteDecisionV1,
): PromptEnhancementRouteResult {
  const normalized = input.promptText.toLowerCase();
  const evidenceRefs = buildRouteEvidenceRefs(input);
  const ladderResolution = walkEvidenceLadderV1(input, normalized);
  const origin = input.generatedOriginState ?? 'ordinary_user_prompt';

  if (origin !== 'ordinary_user_prompt' || input.oldDecisionSessionPayloadPresent === true) {
    return noPopupResult(input, 'old_or_generated_origin_skip', evidenceRefs, ladderResolution);
  }

  if (input.degradedNoActionState !== 'none' || input.classifierState === 'degraded_no_fire') {
    return noPopupResult(input, 'degraded_classifier_no_fire', evidenceRefs, ladderResolution);
  }
  if (isFirstTriggerBlocked(input.firstTriggerGateState)) {
    return noPopupResult(input, 'first_trigger_gate_blocked_no_popup', evidenceRefs, ladderResolution);
  }

  // E6: an accepted bounded LLM route decision overrides the deterministic keyword
  // routing for the NL-heavy prompts the facade routed to the LLM. The hard skips
  // above (old/generated origin, degraded classifier, first-trigger gate) are NOT
  // overridable. Everything below stays the deterministic path + fallback.
  if (llmRouteDecision) {
    return buildRouteResultFromLlmDecision(input, llmRouteDecision, normalized, evidenceRefs);
  }

  // The classifier's intent proposal routes the keyed path: it chose from the FULL
  // forty-intent menu under the locked evidence ladder, so it reaches intents the
  // keyword cascade never could. An explicit accepted LLM route decision (above)
  // still wins as the stronger authority; the hard skips higher up are never
  // overridable. An empty proposal falls through to the deterministic cascade,
  // byte-untouched — low-confidence disposition belongs to the routing fallback
  // layer, which consumes the threaded confidence.
  if (input.classifierPrimaryIntent) {
    return buildRouteResultFromClassifierIntent(input, input.classifierPrimaryIntent, normalized, evidenceRefs, ladderResolution);
  }

  const hasSourceAIntent = hasExplicitRouteWords(normalized);
  if (isHighRiskAmbiguousException(normalized, input)) {
    const selectedPreset = presetForIntent('planning.spec_or_prd');
    const capabilityOverlays = mergeCapabilities(
      [...selectedPreset.capabilityOverlays, 'capability.risk_or_rollback', 'capability.confirmation_needed'],
      normalized,
      input,
    );
    const reasonCodes = [
      'ambiguous_surface_high_risk_source_critical_exception',
      'risk_or_rollback_overlay_attached',
    ];
    return {
      contractDecision: toContractDecision(
        input,
        selectedPreset,
        capabilityOverlays,
        evidenceRefs,
        reasonCodes,
        false,
        'weak_source_critical',
        'planning_first',
      ),
      selectedPreset,
      familyId: selectedPreset.family,
      primaryIntent: selectedPreset.primaryIntent,
      secondaryIntentTags: secondaryIntentTagsFor(normalized, selectedPreset.primaryIntent),
      capabilityOverlays,
      routeConfidence: 'weak_source_critical',
      fallbackMode: 'planning_first',
      routeEvidenceRefs: evidenceRefs,
    ladderResolution,
      reasonCodes,
      noPopup: false,
      usesSharedSignalEvidenceOnly: true,
      usesPeOnlyClassifier: false,
      usesOldStaticDecisionSessionMap: false,
    };
  }

  const hasSourceBOnlyEvidence =
    !hasSourceAIntent &&
    (
      (input.contentTemplateFactRefs?.length ?? 0) > 0 ||
      (input.sourceSnapshot?.contentTemplateRecordFactRefs.length ?? 0) > 0 ||
      (input.sourceSnapshot?.popupQuestionSourceRefs.length ?? 0) > 0 ||
      (input.sourceSnapshot?.whyHelpSourceRefs.length ?? 0) > 0 ||
      (input.sourceSnapshot?.sourceOnlyHardFactRefs.length ?? 0) > 0 ||
      (input.sourceFactRefs?.length ?? 0) > 0
    );
  if (hasSourceBOnlyEvidence) {
    return noPopupResult(input, 'source_b_only_cannot_open_popup', evidenceRefs, ladderResolution);
  }

  if (hasConflictingEvidence(input)) {
    const selectedPreset = presetForIntent('planning.spec_or_prd');
    const capabilityOverlays = mergeCapabilities(
      ['capability.confirmation_needed', 'capability.verification_required', 'capability.source_signal_guidance'],
      normalized,
      input,
    );
    const reasonCodes = ['conflicting_requirement_source'];
    return {
      contractDecision: toContractDecision(input, selectedPreset, capabilityOverlays, evidenceRefs, reasonCodes, false, 'conflicting', 'planning_first'),
      selectedPreset,
      familyId: selectedPreset.family,
      primaryIntent: selectedPreset.primaryIntent,
      secondaryIntentTags: secondaryIntentTagsFor(normalized, selectedPreset.primaryIntent),
      capabilityOverlays,
      routeConfidence: 'conflicting',
      fallbackMode: 'planning_first',
      routeEvidenceRefs: evidenceRefs,
    ladderResolution,
      reasonCodes,
      noPopup: false,
      usesSharedSignalEvidenceOnly: true,
      usesPeOnlyClassifier: false,
      usesOldStaticDecisionSessionMap: false,
    };
  }

  if (isWeakAmbiguousPrompt(normalized, input) || isUnsupportedShortSurfacePrompt(normalized, input) || isLowInformationPrompt(normalized, input)) {
    return noPopupResult(input, 'ambiguous_weak_evidence_skip_no_popup', evidenceRefs, ladderResolution);
  }

  const intent = selectPrimaryIntent(normalized);
  if (intent === null) {
    // No branch matched — the route asserts NO family. It carries the
    // planning/confirmation-first structural shape so the gate's narrow
    // high-risk exception has a body to render; the gate's default for the
    // under-evidenced state is the skip.
    const selectedPreset = presetForIntent('planning.spec_or_prd');
    const capabilityOverlays = withDebugEvidenceAskRule(
      mergeCapabilities(selectedPreset.capabilityOverlays, normalized, input),
      selectedPreset,
      input,
    );
    const reasonCodes = ['no_family_evidence_no_catch_all'];
    return {
      contractDecision: toContractDecision(input, selectedPreset, capabilityOverlays, evidenceRefs, reasonCodes, false, 'missing', 'none'),
      selectedPreset,
      familyId: selectedPreset.family,
      primaryIntent: selectedPreset.primaryIntent,
      secondaryIntentTags: [],
      capabilityOverlays,
      routeConfidence: 'missing',
      fallbackMode: 'none',
      routeEvidenceRefs: evidenceRefs,
      ladderResolution,
      reasonCodes,
      noPopup: false,
      usesSharedSignalEvidenceOnly: true,
      usesPeOnlyClassifier: false,
      usesOldStaticDecisionSessionMap: false,
    };
  }
  const selectedPreset = presetForIntent(intent);
  // The ask rule also governs the cascade's debug routes: a keyless session
  // keeps the evidence request (nothing is known to be supplied), and a keyed
  // session whose proposal fell through still benefits from its observation.
  const capabilityOverlays = withDebugEvidenceAskRule(
    mergeCapabilities(selectedPreset.capabilityOverlays, normalized, input),
    selectedPreset,
    input,
  );
  const confidence = confidenceFor(normalized, input, intent);
  // The third planning_first trigger. It rides the route the prompt already earned — the family,
  // intent and preset are untouched — because the defect is the body's POSTURE, not its subject:
  // a debugging question about deploys is still a debugging prompt, it just must not be answered
  // with instructions to deploy. The two evidence-quality triggers return earlier and are
  // unreachable from here, so they cannot be absorbed or masked by this one.
  const reasonCodes = reasonCodesFor(normalized, input, intent, capabilityOverlays);

  return {
    contractDecision: toContractDecision(input, selectedPreset, capabilityOverlays, evidenceRefs, reasonCodes, false, confidence, 'none'),
    selectedPreset,
    familyId: selectedPreset.family,
    primaryIntent: selectedPreset.primaryIntent,
    secondaryIntentTags: secondaryIntentTagsFor(normalized, selectedPreset.primaryIntent),
    capabilityOverlays,
    routeConfidence: confidence,
    fallbackMode: 'none',
    routeEvidenceRefs: evidenceRefs,
    ladderResolution,
    reasonCodes,
    noPopup: false,
    usesSharedSignalEvidenceOnly: true,
    usesPeOnlyClassifier: false,
    usesOldStaticDecisionSessionMap: false,
  };
}

function noPopupResult(input: PromptEnhancementRouteInput, reasonCode: string, evidenceRefs: readonly string[], ladderResolution: PromptEnhancementLadderResolutionV1): PromptEnhancementRouteResult {
  const selectedPreset = presetForIntent('quick_improvement.local_polish_or_small_improvement');
  const routeConfidence = reasonCode.includes('high_risk') ? 'weak_source_critical' : 'weak_low_risk';
  return {
    contractDecision: toContractDecision(input, selectedPreset, [], evidenceRefs, [reasonCode], true, routeConfidence, 'skip_no_popup'),
    selectedPreset,
    familyId: selectedPreset.family,
    primaryIntent: selectedPreset.primaryIntent,
    secondaryIntentTags: [],
    capabilityOverlays: [],
    routeConfidence,
    fallbackMode: 'skip_no_popup',
    routeEvidenceRefs: evidenceRefs,
    ladderResolution,
    reasonCodes: [reasonCode],
    noPopup: true,
    usesSharedSignalEvidenceOnly: true,
    usesPeOnlyClassifier: false,
    usesOldStaticDecisionSessionMap: false,
  };
}

/**
 * E6: build a consistent route result from an accepted bounded LLM route decision.
 * The intent drives the preset (family + required sections); the LLM's capabilities
 * merge with the preset + forced safety overlays; the LLM's ambiguityState is honored;
 * `skip_no_useful_guidance` still legitimately skips (weak evidence ≠ forced popup).
 * The route stays typed + validated — no freeform route output.
 */
/** Route from the stage classifier's intent proposal — same visible shape as every route. */
function buildRouteResultFromClassifierIntent(
  input: PromptEnhancementRouteInput,
  intent: PromptEnhancementPrimaryIntent,
  normalized: string,
  evidenceRefs: readonly string[],
  // With a non-empty proposal the walk resolved on rung 1 by construction;
  // passed through so every path carries the same computed state.
  ladderResolution: PromptEnhancementLadderResolutionV1,
): PromptEnhancementRouteResult {
  const selectedPreset = presetForIntent(intent);
  const capabilityOverlays = decideCapabilityOverlaysFromObservation(selectedPreset, input);
  // The posture applies here too, and this is the path production actually takes: whenever the
  // classifier names an intent, routing returns from this builder. Deciding it in one place per
  // exit rather than once at the end is what keeps the deterministic cascade and the classifier
  // path from disagreeing about the same prompt.
  const reasonCodes = ['classifier_intent_preferred'];
  const routeConfidence: PromptEnhancementRouteConfidence = 'partial';
  return {
    contractDecision: toContractDecision(input, selectedPreset, capabilityOverlays, evidenceRefs, reasonCodes, false, routeConfidence, 'none'),
    selectedPreset,
    familyId: selectedPreset.family,
    primaryIntent: selectedPreset.primaryIntent,
    secondaryIntentTags: secondaryIntentTagsFor(normalized, selectedPreset.primaryIntent),
    capabilityOverlays,
    routeConfidence,
    fallbackMode: 'none',
    routeEvidenceRefs: evidenceRefs,
    ladderResolution,
    reasonCodes,
    noPopup: false,
    usesSharedSignalEvidenceOnly: true,
    usesPeOnlyClassifier: false,
    usesOldStaticDecisionSessionMap: false,
  };
}

function buildRouteResultFromLlmDecision(
  input: PromptEnhancementRouteInput,
  decision: PromptEnhancementLlmRouteDecisionV1,
  normalized: string,
  evidenceRefs: readonly string[],
): PromptEnhancementRouteResult {
  const selectedPreset = presetForIntent(decision.primaryIntent);
  // A keyed session decides capabilities from the classifier's observation
  // under the registry's locked scope; the accepted decision's own capability
  // list passes through unchanged — it is E6's accepted contract. The keyword
  // merge remains only where no observation channel exists.
  const capabilityOverlays = input.classifierCapabilityCandidates !== undefined
    ? [...new Set([...decideCapabilityOverlaysFromObservation(selectedPreset, input), ...decision.capabilities])]
    : withDebugEvidenceAskRule(
        mergeCapabilities([...selectedPreset.capabilityOverlays, ...decision.capabilities], normalized, input),
        selectedPreset,
        input,
      );
  const noPopup = decision.ambiguityState === 'skip_no_useful_guidance';
  const fallbackMode: PromptEnhancementRouteFallbackMode = noPopup ? 'skip_no_popup' : 'none';
  const reasonCodes = ['llm_route_decision_accepted'];
  const routeConfidence: PromptEnhancementRouteConfidence = 'partial';
  // An accepted route decision IS explicit rung-1 evidence resolved — the
  // decision was made from the prompt's own natural language under its
  // acceptance rules, so the walk's no-key reading is superseded here.
  const ladderResolution: PromptEnhancementLadderResolutionV1 = { state: 'resolved', resolvedByRung: 1 };
  return {
    contractDecision: toContractDecision(input, selectedPreset, capabilityOverlays, evidenceRefs, reasonCodes, noPopup, routeConfidence, fallbackMode, true, decision.ambiguityState),
    selectedPreset,
    familyId: selectedPreset.family,
    primaryIntent: selectedPreset.primaryIntent,
    secondaryIntentTags: secondaryIntentTagsFor(normalized, selectedPreset.primaryIntent),
    capabilityOverlays,
    routeConfidence,
    fallbackMode,
    routeEvidenceRefs: evidenceRefs,
    ladderResolution,
    reasonCodes,
    noPopup,
    usesSharedSignalEvidenceOnly: true,
    usesPeOnlyClassifier: false,
    usesOldStaticDecisionSessionMap: false,
  };
}

function toContractDecision(
  input: PromptEnhancementRouteInput,
  selectedPreset: PromptEnhancementTaxonomyPreset,
  capabilityOverlays: readonly PromptEnhancementCapabilityId[],
  evidenceRefs: readonly string[],
  reasonCodes: readonly string[],
  noPopup: boolean,
  routeConfidence: PromptEnhancementRouteConfidence,
  fallbackMode: PromptEnhancementRouteFallbackMode,
  // E6: set when the bounded LLM route decision produced this route.
  llmRouteUsed: boolean = false,
  ambiguityStateOverride?: PromptEnhancementRouteDecisionV1['ambiguityState'],
): PromptEnhancementRouteDecisionV1 {
  const rejectedRoutes = noPopup
    ? [{
        routeId: selectedPreset.id,
        reasonCode: reasonCodes[0] ?? 'insufficient_evidence',
        publicSafeReasonCategory: 'fallback_or_no_popup' as const,
      }]
    : [...suppressedSourceRejectedRoutesFor(reasonCodes), ...rejectedAlternativesFor(selectedPreset)];
  const compoundPromptState = compoundPromptStateFor(input.promptText);
  return {
    routeDecisionId: input.routeDecisionId,
    debugEvidenceObserved: [...(input.classifierDebugEvidencePresent ?? [])],
    promptReviewOrigin: promptReviewOriginFor(input),
    promptReviewProcessingPolicy: promptReviewProcessingPolicyFor(input),
    familyId: selectedPreset.family,
    primaryIntent: selectedPreset.primaryIntent,
    capabilityOverlays,
    compoundPromptState,
    userPointCoverageRefs: userPointCoverageRefsFor(input.promptText),
    nonPrimaryUserIntentHandling: nonPrimaryUserIntentHandlingFor(compoundPromptState),
    selectedTemplateRef: toTemplateRegistryRef(selectedPreset),
    secondaryIntentTags: secondaryIntentTagsFor(input.promptText.toLowerCase(), selectedPreset.primaryIntent),
    routeCandidates: routeCandidatesFor(selectedPreset, capabilityOverlays, evidenceRefs, noPopup, routeConfidence, reasonCodes),
    candidateRouteIds: candidateRouteIdsFor(selectedPreset, noPopup),
    rejectedRouteReasonCodes: rejectedRoutes.map((route) => route.reasonCode),
    rejectedRoutes,
    routeConfidence,
    signalProvenance: signalProvenanceFor(input, evidenceRefs),
    sourceSignalRole: sourceSignalRoleFor(input),
    stage2SelectionState: input.stage2SelectionState,
    sourceSignalPolicy: sourceSignalPolicyFor(noPopup, selectedPreset, reasonCodes),
    sectionPlanRefs: noPopup
      ? []
      : selectedPreset.requiredSections.map((sectionKind, index) => `${input.routeDecisionId}:section:${index + 1}:${sectionKind}`),
    fallbackMode,
    llmRoutePolicy: {
      mode: llmRouteUsed ? 'llm_route_decision_call' : 'no_call',
      owner: 'content_semantics',
      costWorksheetRow: llmRouteUsed ? 'llm_route_decision_call' : 'not_applicable_deterministic',
      freeformRouteOutputAllowed: false,
    },
    ambiguityState: ambiguityStateOverride ?? ambiguityStateFor(reasonCodes, noPopup, fallbackMode),
    suppressionState: suppressionStateFor(noPopup, reasonCodes),
    routeInputEvidenceRefs: evidenceRefs,
    routeEvidence: evidenceRefs,
    registryLinkedFixtureIds: [...selectedPreset.routeFixtureIds, ...selectedPreset.evaluationFixtureIds],
    usesPeOnlyClassifier: false,
    usesOldStaticDecisionSessionMap: false,
  };
}

function nonPrimaryUserIntentHandlingFor(
  compoundPromptState: PromptEnhancementRouteDecisionV1['compoundPromptState'],
): PromptEnhancementRouteDecisionV1['nonPrimaryUserIntentHandling'] {
  switch (compoundPromptState) {
    case 'single_intent':
      return 'covered_by_primary';
    case 'multi_point_same_intent':
    case 'multi_intent_one_prompt':
      return 'covered_by_secondary_tag';
    case 'ambiguous_multi_intent':
      return 'requires_clarification';
  }
}

/**
 * The reason code for the third `planning_first` trigger — named for what it observes, so the two
 * evidence-quality triggers stay tellable apart from this one in any log or record.
 */
export const PROMPT_ENHANCEMENT_UNREQUESTED_ACTION_POSTURE_REASON_V1 = 'risky_topic_not_asked_to_execute';

/**
 * Should this prompt get the planning posture?
 *
 * The case the posture was built for and never reached: the developer ASKS ABOUT something risky
 * rather than asking for it to be done — "how does deploying this to production actually work?" —
 * and the body answers by instructing the agent to do it. Firing the posture makes the body propose
 * instead of instruct, and puts the popup in its clarify state.
 *
 * The condition (owner ruling): not execution-requested AND names a risky topic. The first half is
 * what keeps this disjoint from the confirmation line, which requires execution-requested — so a
 * risky prompt gets exactly one treatment: asked-to-execute gets the confirmation, not-asked gets
 * the posture. Neither can claim the same prompt.
 *
 * The risk read is the RAW keyword read, never the cleared one: routing decides by prompt SHAPE,
 * and the clearance belongs to the confirmation line alone.
 */
function needsUnrequestedActionPosture(promptText: string): boolean {
  return promptEnhancementAuthorityModeForTextV1(promptText) !== 'execute_requested'
    && promptEnhancementRiskKindsForTextV1(promptText).length > 0;
}

function ambiguityStateFor(
  reasonCodes: readonly string[],
  noPopup: boolean,
  fallbackMode: PromptEnhancementRouteFallbackMode,
): PromptEnhancementRouteDecisionV1['ambiguityState'] {
  if (reasonCodes.includes('conflicting_requirement_source')) {
    return 'conflicting_evidence';
  }
  // The posture trigger is about the prompt's SHAPE, not its evidence: a question about a risky
  // topic can be perfectly well evidenced. Reporting it as weak evidence would put a second lie in
  // the record beside the one the degradation enum was kept out of.
  const postureOnly = reasonCodes.includes(PROMPT_ENHANCEMENT_UNREQUESTED_ACTION_POSTURE_REASON_V1);
  if (!postureOnly
    && (reasonCodes.includes('ambiguous_surface_high_risk_source_critical_exception') || fallbackMode === 'planning_first')) {
    return 'weak_high_risk';
  }
  if (reasonCodes.includes('source_b_only_cannot_open_popup')) {
    return 'missing_target';
  }
  if (reasonCodes.includes('ambiguous_weak_evidence_skip_no_popup')) {
    return 'skip_no_useful_guidance';
  }
  if (noPopup) {
    return 'skip_no_useful_guidance';
  }
  return 'clear';
}

function promptReviewOriginFor(input: PromptEnhancementRouteInput): PromptEnhancementRouteDecisionV1['promptReviewOrigin'] {
  switch (input.generatedOriginState) {
    case 'old_ds_advisory_injected':
      return 'old_ds_advisory_injected';
    case 'pe_generated':
      return 'pe_generated_initial_send';
    case 'pe_action_generated':
      return 'pe_action_generated_send';
    case 'sequence_generated':
      return 'multi_prompt_sequence_generated';
    case 'unknown':
      return 'unknown_origin';
    case 'ordinary_user_prompt':
    case undefined:
      return input.oldDecisionSessionPayloadPresent === true ? 'old_ds_advisory_injected' : 'user_authored_current_prompt';
  }
}

function promptReviewProcessingPolicyFor(input: PromptEnhancementRouteInput): PromptEnhancementRouteDecisionV1['promptReviewProcessingPolicy'] {
  switch (promptReviewOriginFor(input)) {
    case 'user_authored_current_prompt':
      return 'eligible_for_initial_pe_route';
    case 'old_ds_advisory_injected':
      return 'old_ds_guard_skip';
    case 'multi_prompt_sequence_generated':
      return 'sequence_owned_by_handoff_runtime_gate';
    case 'unknown_origin':
      return 'fallback_origin_unknown';
    case 'pe_generated_initial_send':
    case 'pe_action_generated_send':
      return 'metadata_only_skip_pe_route';
  }
}

function compoundPromptStateFor(promptText: string): PromptEnhancementRouteDecisionV1['compoundPromptState'] {
  const normalized = promptText.toLowerCase();
  const hasListShape = /\b(and|then|also)\b|[,;]|^\s*[-*]\s/m.test(promptText);
  const hasMultipleFamilies = [
    hasAny(normalized, ['fix', 'bug', 'error', 'failing']),
    hasAny(normalized, ['review', 'verify', 'audit']),
    hasAny(normalized, ['refactor', 'clean up', 'upgrade', 'migrate']),
    hasAny(normalized, ['plan', 'break down', 'prd', 'spec']),
    hasAny(normalized, ['build', 'implement', 'add', 'extend']),
  ].filter(Boolean).length > 1;
  if (hasListShape && hasMultipleFamilies) return 'multi_intent_one_prompt';
  if (hasListShape) return 'multi_point_same_intent';
  if (['fix this', 'continue', 'make it better', 'plan this', 'upgrade this', 'refactor this'].includes(normalized.trim())) {
    return 'ambiguous_multi_intent';
  }
  return 'single_intent';
}

/**
 * PROVISIONAL SUBSTITUTE for semantic decomposition, and it should be read as one.
 *
 * The real question is which parts of a request are separate pieces of work, by meaning. What this
 * does is split on punctuation and count the fragments, so its refs are POSITIONAL — a ref means
 * "the Nth fragment", not "the Nth thing the user asked for".
 *
 * Concretely: "fix the login bug, check the session timeout, check the cookie flags" is ONE piece of
 * work — one investigation with three things to look at — and this reports THREE. It is wrong in the
 * other direction too, when one clause carries two unrelated tasks, and nothing in the output says
 * which case you have.
 *
 * DO NOT IMPROVE THE REGEX. A better regex is still a regex, and the distinction it would need to
 * make is not reachable by matching text at all — a longer pattern would move which prompts are
 * wrong without reducing how many.
 */
function userPointCoverageRefsFor(promptText: string): readonly string[] {
  const points = promptText
    .split(/\n|(?:\bthen\b)|(?:\balso\b)|[,;]/i)
    .map((point) => point.trim())
    .filter(Boolean);
  return (points.length > 0 ? points : [promptText]).map((_, index) => `user_point:${index + 1}`);
}

/**
 * Sequence-shaped prompt text: multiple intent families in one prompt, or a genuine multi-step
 * list of one family (>= 3 user points). The SAME shape rule the facade uses to emit the MPS
 * handoff/sequence summary — shared so the UserPromptSubmit pipeline can prepare a sequence-shaped
 * prompt even on a non-trigger turn (otherwise the MPS popup only ever appears by trigger
 * coincidence). Pure text predicate; creates no route or runtime state.
 */
export function isPromptEnhancementSequenceShapedTextV1(promptText: string): boolean {
  const compoundState = compoundPromptStateFor(promptText);
  return compoundState === 'multi_intent_one_prompt'
    || (compoundState === 'multi_point_same_intent' && userPointCoverageRefsFor(promptText).length >= 3);
}

/**
 * The fixed approved role vocabulary for multi-prompt sequences — the single definition.
 *
 * The closure is structural today: the producer below can only emit a label from the families
 * table, so user text cannot reach it. When a model produces these labels instead, the closure
 * becomes instructed and this list is what a validator checks against — so a stored item's label
 * and a rendered summary's label must be checked against THIS list, never a copy of it. An
 * invented label would put raw prompt text into a payload that declares it excluded.
 */
export const PROMPT_ENHANCEMENT_SEQUENCE_ROLE_LABELS_V1 = [
  'fix',
  'review',
  'refactor',
  'plan',
  'build',
] as const;
export type PromptEnhancementSequenceRoleLabelV1 =
  typeof PROMPT_ENHANCEMENT_SEQUENCE_ROLE_LABELS_V1[number];

/** The SAME five keyword families `compoundPromptStateFor` detects — never raw prompt text. The
 * label type ties each family to the vocabulary above, so a family cannot introduce a sixth. */
const PROMPT_ENHANCEMENT_SEQUENCE_ROLE_FAMILIES_V1:
  readonly { label: PromptEnhancementSequenceRoleLabelV1; keywords: readonly string[] }[] = [
  { label: 'fix', keywords: ['fix', 'bug', 'error', 'failing'] },
  { label: 'review', keywords: ['review', 'verify', 'audit'] },
  { label: 'refactor', keywords: ['refactor', 'clean up', 'upgrade', 'migrate'] },
  { label: 'plan', keywords: ['plan', 'break down', 'prd', 'spec'] },
  { label: 'build', keywords: ['build', 'implement', 'add', 'extend'] },
];

/**
 * The labels the producer can actually emit, derived from the families table. Exported so the
 * vocabulary a validator enforces can be proven equal to the one the producer uses — the type tie
 * above catches a sixth label being added, and this catches a family being dropped.
 */
export const PROMPT_ENHANCEMENT_SEQUENCE_ROLE_FAMILY_LABELS_V1: readonly PromptEnhancementSequenceRoleLabelV1[] =
  PROMPT_ENHANCEMENT_SEQUENCE_ROLE_FAMILIES_V1.map((family) => family.label);

/**
 * The role-family label for one piece of task text, or null when nothing matches. This is the same
 * families-table lookup the per-point splitter below runs, factored out and exported so the
 * deterministic sequence repair can label its rebuilt items off the SAME table — one matcher, one
 * vocabulary, so a family added or dropped moves both surfaces together.
 */
export function promptEnhancementSequenceRoleLabelForTextV1(
  text: string,
): PromptEnhancementSequenceRoleLabelV1 | null {
  const normalized = text.toLowerCase();
  const family = PROMPT_ENHANCEMENT_SEQUENCE_ROLE_FAMILIES_V1.find((candidate) => hasAny(normalized, candidate.keywords));
  return family ? family.label : null;
}

/**
 * PROVISIONAL SUBSTITUTE for semantic decomposition. It counts CLAUSES, not units of work.
 *
 * What the number should mean is how many separate pieces of work a request contains, decided by
 * meaning. What it actually is: the prompt split on punctuation and conjunctions, and the fragments
 * counted. The two agree often enough that the number looks authoritative, which is the danger.
 *
 * Concretely: "fix the login bug, check the session timeout, check the cookie flags" is ONE piece of
 * work and this reports THREE. A single clause carrying two unrelated tasks reports ONE. Treat the
 * result as a shape hint about the text, never as how much work was asked for.
 *
 * DO NOT IMPROVE THE REGEX. A better regex is still a regex, and no amount of pattern work reaches
 * a judgement about meaning — it only moves which prompts are counted wrongly.
 *
 * Display and count only. It splits on "and" where the eligibility predicate above does not, so the
 * two disagree by design: this feeds the compact summary, that decides which prompts are treated as
 * sequence-shaped, and changing one does not change the other. Labels come exclusively from the
 * fixed approved vocabulary — a point matching no family contributes to the count and no label, so
 * raw prompt text can never leave here.
 */
export function describePromptEnhancementSequencePlanV1(
  promptText: string,
): { pointCount: number; roleLabels: readonly string[] } {
  const points = promptText
    .split(/\n|(?:\bthen\b)|(?:\balso\b)|(?:\band\b)|[,;]/i)
    .map((point) => point.trim())
    .filter(Boolean);
  const roleLabels: string[] = [];
  for (const point of points) {
    const label = promptEnhancementSequenceRoleLabelForTextV1(point);
    if (label && !roleLabels.includes(label)) roleLabels.push(label);
  }
  return { pointCount: Math.max(1, points.length), roleLabels };
}

/**
 * DECIDED (route-preference phase): `routeCandidates` remains NON-PROMOTING
 * diagnostics. Its original promote-a-near-miss purpose is superseded by the
 * classifier choosing from the full intent menu; it stays as advisory metadata
 * because it is a contract field with downstream consumers, and it never routes.
 */
function routeCandidatesFor(
  selectedPreset: PromptEnhancementTaxonomyPreset,
  selectedCapabilityOverlays: readonly PromptEnhancementCapabilityId[],
  evidenceRefs: readonly string[],
  noPopup: boolean,
  routeConfidence: PromptEnhancementRouteConfidence,
  reasonCodes: readonly string[],
): PromptEnhancementRouteDecisionV1['routeCandidates'] {
  if (noPopup) {
    return [{
      routeId: selectedPreset.id,
      familyId: selectedPreset.family,
      primaryIntent: selectedPreset.primaryIntent,
      capabilityIds: selectedCapabilityOverlays,
      evidenceRefs,
      confidence: routeConfidence,
      state: 'fallback_only',
    }];
  }
  const candidates: PromptEnhancementRouteDecisionV1['routeCandidates'][number][] = candidateRouteIdsFor(selectedPreset, false).map((routeId, index) => {
    const presetRecord = PROMPT_ENHANCEMENT_TAXONOMY_PRESETS.find((presetRecord) => presetRecord.id === routeId) ?? selectedPreset;
    return {
      routeId,
      familyId: presetRecord.family,
      primaryIntent: presetRecord.primaryIntent,
      capabilityIds: index === 0 ? selectedCapabilityOverlays : presetRecord.capabilityOverlays,
      evidenceRefs,
      confidence: index === 0 ? routeConfidence : 'partial',
      state: index === 0 ? 'selected' as const : 'rejected' as const,
    };
  });
  if (hasSuppressedSourceReason(reasonCodes)) {
    candidates.push({
      routeId: 'source:suppressed_low_value_or_feedback',
      familyId: selectedPreset.family,
      primaryIntent: selectedPreset.primaryIntent,
      capabilityIds: ['capability.source_signal_guidance'],
      evidenceRefs,
      confidence: 'weak_low_risk',
      state: 'suppressed',
    });
  }
  return candidates;
}

function secondaryIntentTagsFor(normalized: string, primaryIntent: PromptEnhancementPrimaryIntent): readonly PromptEnhancementPrimaryIntent[] {
  const candidates: PromptEnhancementPrimaryIntent[] = [];
  const add = (intent: PromptEnhancementPrimaryIntent) => {
    if (intent !== primaryIntent && !candidates.includes(intent)) candidates.push(intent);
  };
  if (hasAny(normalized, ['test review', 'review test', 'review tests', 'review spec', 'review suite'])) add('review.test_review');
  if (hasAny(normalized, ['api contract', 'contract changed', 'schema changed'])) add('review.api_contract_review');
  if (hasAny(normalized, ['docs', 'documentation', 'config'])) add('maintenance.documentation_config_upkeep');
  if (hasAny(normalized, ['rollback', 'risky', 'deploy', 'production'])) add('maintenance.risk_rollback_heavy');
  if (hasAny(normalized, ['break down', 'decompose', 'plan'])) add('planning.task_breakdown');
  if (hasAny(normalized, ['refactor', 'cleanup', 'clean up'])) add('maintenance.refactor_no_behavior_change');
  return candidates;
}

function signalProvenanceFor(input: PromptEnhancementRouteInput, evidenceRefs: readonly string[]): readonly string[] {
  const provenance = new Set<string>();
  const sourceRefs = input.sourceFactRefs ?? [];
  if (hasExplicitRouteWords(input.promptText.toLowerCase())) provenance.add('keyword');
  if (sourceRefs.some((ref) => ref.startsWith('vibe:') || ref.includes(':vibe'))) provenance.add('vibe');
  if (sourceRefs.some((ref) => ref.startsWith('probe:') || ref.includes(':probe'))) provenance.add('probe');
  if (input.firedKey) provenance.add('stage_or_absence_signal');
  if ((input.contentTemplateFactRefs?.length ?? 0) > 0 || (input.sourceSnapshot?.contentTemplateRecordFactRefs.length ?? 0) > 0) {
    provenance.add('content_template_fact');
  }
  if (sourceRefs.length > 0) provenance.add('hard_fact_or_profile_signal');
  if (sourceRefs.some((ref) => ref.startsWith('live:') || ref.includes(':live'))) provenance.add('live_source');
  if (sourceRefs.some((ref) => ref.startsWith('historical_import:') || ref.includes(':historical_import'))) provenance.add('historical_import');
  if (sourceRefs.some((ref) => ref.includes('project-type') || ref.includes('relevantProjectTypes'))) provenance.add('project_type_applicability');
  if (sourceRefs.some((ref) => ref.includes('role:') || ref.includes('role-gate'))) provenance.add('role_gate');
  if (sourceRefs.some((ref) => ref.includes('nature:') || ref.includes('nature-gate'))) provenance.add('nature_gate');
  if (sourceRefs.some((ref) => ref.includes('mistake-category') && ref.includes('live'))) provenance.add('mistake_category_live');
  if (sourceRefs.some((ref) => ref.includes('mistake-category') && ref.includes('governance'))) provenance.add('mistake_category_governance');
  if (sourceRefs.some((ref) => ref.includes('mistake-category') && ref.includes('meta'))) provenance.add('mistake_category_meta');
  if (sourceRefs.some((ref) => ref.includes('mistake-category') && ref.includes('dark'))) provenance.add('mistake_category_dark');
  if ((input.sourceSnapshot?.servedVariantIdentityRefs.length ?? 0) > 0) provenance.add('served_identity_only');
  if ((input.streamBOutputRefs?.length ?? 0) > 0 || (input.sourceSnapshot?.streamBOutputs.length ?? 0) > 0) provenance.add('stream_b');
  if (input.stage2SelectionState) provenance.add(`stage2:${input.stage2SelectionState}`);
  if (input.transcriptPathState) {
    provenance.add('transcript');
    provenance.add(`transcript_path:${input.transcriptPathState}`);
  }
  if (input.permissionMode) provenance.add('permission_mode');
  if ((input.paramEventChannels?.length ?? 0) > 0 || (input.sourceSnapshot?.paramEventChannels.length ?? 0) > 0) provenance.add('param_event');
  if ((input.profileTieBreakerRefs?.length ?? 0) > 0) provenance.add('profile_role_mode');
  if (provenance.size === 0 && evidenceRefs.includes('source_a:current_prompt')) provenance.add('source_a_user_prompt');
  return [...provenance];
}

function sourceSignalRoleFor(input: PromptEnhancementRouteInput): PromptEnhancementRouteDecisionV1['sourceSignalRole'] {
  if (input.effectiveFiredSource) {
    return 'effective_fired_advisory_source';
  }
  switch (input.stage2SelectionState) {
    case 'qualifying_but_unselected':
      return 'qualifying_unselected_absence';
    case 'supplementary_present':
      return 'supplementary_stage2_present';
    case 'absent_unselected_diagnostic':
      return 'absent_unselected_diagnostic';
    case 'counter_update_only':
      return 'counter_update_only';
    case 'rejected_unknown_key':
      return 'rejected_unknown_model_key';
    case 'selected':
      return 'effective_fired_advisory_source';
    case undefined:
      return input.effectiveFiredSource ? 'effective_fired_advisory_source' : 'none';
  }
}

function sourceSignalPolicyFor(
  noPopup: boolean,
  selectedPreset: PromptEnhancementTaxonomyPreset,
  reasonCodes: readonly string[],
): PromptEnhancementRouteDecisionV1['sourceSignalPolicy'] {
  if (noPopup) return 'skip_no_popup';
  if (hasSuppressedSourceReason(reasonCodes)) return 'suppress_with_reason';
  return selectedPreset.baselineSourceSignalSlot === 'not_applicable' ? 'metadata_only' : 'render_baseline_guidance';
}

function suppressionStateFor(
  noPopup: boolean,
  reasonCodes: readonly string[],
): PromptEnhancementRouteDecisionV1['suppressionState'] {
  if (reasonCodes.includes('suppressed_by_scoped_feedback')) return 'suppressed_scoped_feedback';
  if (reasonCodes.includes('low_risk_unrelated_signal')) return 'suppressed_source_mismatch';
  return noPopup ? 'suppressed_no_signal' : 'not_suppressed';
}

function toTemplateRegistryRef(presetRecord: PromptEnhancementTaxonomyPreset): PromptEnhancementTemplateRegistryRefV1 {
  const fallbackPolicy: PromptEnhancementFallbackMode =
    presetRecord.fallbackMode === 'skip_no_popup' ? 'no_popup' : 'deterministic_body';
  return {
    schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
    templateId: presetRecord.id,
    registryNamespace: 'prompt-enhancement-templates',
    templateType: presetRecord.templateType,
    familyId: presetRecord.family,
    displayLabel: presetRecord.primaryIntent,
    primaryIntent: presetRecord.primaryIntent,
    intentTags: presetRecord.coveredIntentTags,
    capabilityIds: presetRecord.capabilityOverlays,
    triggerHints: presetRecord.routeFixtureIds,
    supportedLevels: ['default', 'shorter', 'more_thorough', 'more_project_grounded'],
    defaultLevel: 'default',
    applicabilityAxes: presetRecord.applicabilityAxes,
    applicabilityGuards: ['source_a_or_explicit_no_popup_reason_required', 'source_b_support_only'],
    sourcePriorityState: 'source_a_first',
    targetScopePolicy: 'source_a_plus_grounded_support',
    capabilityRequirements: presetRecord.capabilityOverlays,
    requiredSectionKinds: presetRecord.requiredSections,
    optionalSectionKinds: presetRecord.optionalSections,
    sectionSlots: [...presetRecord.requiredSections, ...presetRecord.conditionalSections],
    sectionOrderPolicy: 'fixed_required_before_optional',
    sourceGuidanceFloorPolicy: presetRecord.baselineSourceSignalSlot === 'not_applicable' ? 'explicit_fallback_reason' : 'required_when_popup_shown',
    originalPromptPreservationPolicy: 'visible_verbatim_required',
    allowedSourceKinds: ['source_a_user_prompt', 'stage_or_absence_signal', 'content_template_fact', 'hard_fact_or_profile_signal'],
    requiredSourceACoverage: 'visible_original_prompt',
    allowedSourceBSupportKinds: ['stage_or_absence_signal', 'content_template_fact', 'hard_fact_or_profile_signal', 'prompt_enhancement_memory'],
    baselineSourceSignalSlot: presetRecord.baselineSourceSignalSlot,
    sourceEvidenceStatusRules: ['present', 'not_applicable', 'unknown', 'failed_fallback', 'suppressed_for_privacy', 'suppressed_for_safety'],
    contentTemplateInputRefs: presetRecord.contentTemplateInputRefs,
    safetyHookIds: presetRecord.safetyHooks,
    sensitivityPolicy: 'deterministic_flags_required',
    voicePolicyRef: 'source-honest-user-to-agent-voice',
    confirmationRequirementPolicy: 'preserve_when_required',
    supportedDirectionalActions: ['shorter', 'more_thorough', 'more_project_grounded', 'apply_details'],
    composerPolicy: 'deterministic_only',
    deterministicRendererId: 'section_planner_pending',
    llmCallPolicy: 'no_call',
    tokenTimeoutProfileRef: 'cost_visible_call_policy_not_used_by_routing',
    validationRequirementIds: ['source_a_scope', 'source_b_support_only', 'route_fixture_linked', 'safety_hooks_present'],
    fallbackReasonCodes: ['provider_unavailable', 'timeout', 'malformed_output', 'validation_failed', 'not_applicable'],
    publicSafeDiagnosticCodes: ['fallback_or_no_popup', 'source_coverage', 'validation_failed'],
    fallbackPolicy,
    testFixtureIds: [...presetRecord.routeFixtureIds, ...presetRecord.evaluationFixtureIds],
    invariantIds: [
      'no_pe_only_classifier',
      'no_old_static_decision_session_map',
      'no_source_b_only_popup',
      'no_precomputed_directional_variants',
    ],
    ownerArea: 'content_semantics',
    launchVisibility: 'private_until_launch_recheck',
    publicSafeSourceNotes: [
      'DS content-template refs are Source B only.',
      'Routing uses deterministic shared evidence and Source A words only in Phase 3.',
    ],
    routeFixtureIds: presetRecord.routeFixtureIds,
    evaluationFixtureIds: presetRecord.evaluationFixtureIds,
  };
}

function presetForIntent(intent: PromptEnhancementPrimaryIntent): PromptEnhancementTaxonomyPreset {
  const found = PROMPT_ENHANCEMENT_TAXONOMY_PRESETS.find((presetRecord) => presetRecord.primaryIntent === intent);
  if (!found) {
    throw new Error(`Missing prompt-enhancement taxonomy preset for ${intent}`);
  }
  return found;
}

function hasExplicitRouteWords(normalized: string): boolean {
  return [
    'bug',
    'broken',
    'continue',
    'error',
    'failing',
    'crash',
    'not working',
    'regression',
    'refactor',
    'clean up',
    'upgrade',
    'migrate',
    'remove dead code',
    'make faster',
    'make it better',
    'harden tests',
    'update docs',
    'review',
    'verify',
    'security',
    'architecture',
    'performance',
    'api',
    'contract',
    'test',
    'implement',
    'build',
    'add',
    'extend',
    'plan',
    'prd',
    'spec',
  ].some((word) => matchesTerm(normalized, word));
}

function isWeakAmbiguousPrompt(normalized: string, input: PromptEnhancementRouteInput): boolean {
  const compact = normalized.trim();
  const ambiguous =
    compact === 'fix this' ||
    compact === 'continue' ||
    compact === 'make it better' ||
    compact === 'plan this';
  const hasEvidence =
    (input.sourceFactRefs?.length ?? 0) > 0 ||
    (input.contentTemplateFactRefs?.length ?? 0) > 0 ||
    (input.recentPromptEvidenceRefs?.length ?? 0) > 0 ||
    typeof input.firedKey === 'string' ||
    typeof input.selectedQualifyingAbsence === 'string';
  return ambiguous && !hasEvidence;
}

function isUnsupportedShortSurfacePrompt(normalized: string, input: PromptEnhancementRouteInput): boolean {
  const compact = normalized.trim();
  const ambiguous = compact === 'upgrade this' || compact === 'refactor this';
  const hasEvidence =
    (input.sourceFactRefs?.length ?? 0) > 0 ||
    (input.contentTemplateFactRefs?.length ?? 0) > 0 ||
    (input.recentPromptEvidenceRefs?.length ?? 0) > 0 ||
    typeof input.firedKey === 'string' ||
    typeof input.selectedQualifyingAbsence === 'string';
  return ambiguous && !hasEvidence;
}

function isLowInformationPrompt(normalized: string, input: PromptEnhancementRouteInput): boolean {
  const compact = normalized.trim();
  const hasOnlyProvenance =
    (input.sourceSnapshot?.servedVariantIdentityRefs.length ?? 0) > 0 ||
    (input.sourceSnapshot?.deliveryGateRefs.length ?? 0) > 0;
  const hasRoutingEvidence =
    (input.sourceFactRefs?.length ?? 0) > 0 ||
    (input.contentTemplateFactRefs?.length ?? 0) > 0 ||
    (input.sourceSnapshot?.contentTemplateRecordFactRefs.length ?? 0) > 0 ||
    (input.sourceSnapshot?.popupQuestionSourceRefs.length ?? 0) > 0 ||
    (input.sourceSnapshot?.whyHelpSourceRefs.length ?? 0) > 0 ||
    (input.sourceSnapshot?.sourceOnlyHardFactRefs.length ?? 0) > 0 ||
    (input.recentPromptEvidenceRefs?.length ?? 0) > 0 ||
    typeof input.firedKey === 'string' ||
    typeof input.selectedQualifyingAbsence === 'string';
  return !hasExplicitRouteWords(compact) && !hasRoutingEvidence && (compact.length <= 4 || hasOnlyProvenance);
}

function hasConflictingEvidence(input: PromptEnhancementRouteInput): boolean {
  return [
    ...(input.sourceFactRefs ?? []),
    ...(input.contentTemplateFactRefs ?? []),
    ...(input.recentPromptEvidenceRefs ?? []),
    ...(input.memoryFeedbackRefs ?? []),
  ].some((ref) => {
    const normalized = ref.toLowerCase();
    return normalized.includes('conflict') || normalized.includes('contradict');
  });
}

function selectPrimaryIntent(normalized: string): PromptEnhancementPrimaryIntent | null {
  // P3-G1: a clear build/implement intent must not be captured by an incidental broad
  // verb that merely NAMES the thing being built (e.g. "implement a code review tool",
  // "add audit logging", "here's the plan: build X"). Gate the broad review/audit/plan
  // catch-alls behind "no build intent"; the specific multi-word review/planning
  // keywords below stay first.
  // 'build' is ambiguous — a NOUN in "the build process" / "a build system" but a VERB
  // in "build a payment module". Count it as a build intent only when it is NOT an
  // article-led noun phrase, so "review the build process" stays a review while
  // "here's the plan: build X" is a feature. implement/create/develop/add are verbs.
  const buildIsNounPhrase = /\b(?:the|a|this|our|nightly|ci|prod|staging|last|next)\s+build\b/.test(normalized);
  const hasBuildAsVerb = normalized.includes('build') && !buildIsNounPhrase;
  const hasBuildVerb = hasBuildAsVerb || hasAny(normalized, ['implement', 'add', 'create', 'develop']);
  const hasStrongBuildVerb = hasBuildAsVerb || hasAny(normalized, ['implement', 'create', 'develop']);
  const buildsANamedArtifact = hasStrongBuildVerb && hasAny(normalized, ['tool', 'system', 'feature', 'app', 'service', 'dashboard', 'ui', 'module', 'component']);

  if (hasAny(normalized, ['security review', 'threat'])) return 'review.security_review';
  if (hasAny(normalized, ['architecture review'])) return 'review.architecture_review';
  if (hasAny(normalized, ['performance review'])) return 'review.performance_review';
  if (hasAny(normalized, ['api review', 'contract review'])) return 'review.api_contract_review';
  if (hasAny(normalized, ['test review'])) return 'review.test_review';
  if (hasAny(normalized, ['diff review', 'code review', 'review this code']) && !buildsANamedArtifact) return 'review.code_or_diff_review';
  if (hasAny(normalized, ['requirements fit', 'acceptance fit'])) return 'review.requirements_fit_review';
  if (hasAny(normalized, ['review', 'verify', 'audit']) && !hasBuildVerb) return 'review.verification_request';

  if (hasAny(normalized, ['rollout', 'release plan'])) return 'planning.rollout_release_plan';
  if (hasAny(normalized, ['migration plan']) || (normalized.includes('plan') && normalized.includes('migration'))) return 'planning.migration_plan';
  if (hasAny(normalized, ['debugging plan'])) return 'planning.debugging_plan';
  if (hasAny(normalized, ['refactor plan'])) return 'planning.refactor_plan';
  if (hasAny(normalized, ['architecture', 'design']) && normalized.includes('plan')) return 'planning.architecture_or_design';
  if (hasAny(normalized, ['break down', 'task breakdown', 'decompose'])) return 'planning.task_breakdown';
  if (hasAny(normalized, ['prd', 'write a spec', 'create a spec'])) return 'planning.spec_or_prd';
  if (normalized.includes('plan') && !hasStrongBuildVerb) return 'planning.spec_or_prd';
  if (normalized.trim() === 'continue') return 'planning.task_breakdown';

  if (hasAny(normalized, ['production', 'incident', 'support ticket', 'outage'])) return 'issue_debug.production_incident_or_support';
  if (hasAny(normalized, ['api failure', 'integration failure', 'request response', 'status code', 'upstream failure', 'downstream failure'])) {
    return 'issue_debug.integration_api_failure';
  }

  if (hasAny(normalized, ['dependency', 'package', 'lockfile', 'version', 'security update'])) return 'maintenance.dependency_upgrade';
  if (hasAny(normalized, ['schema', 'database migration', 'data migration'])) return 'maintenance.migration_schema_change';
  if (hasAny(normalized, ['dead code', 'unused code'])) return 'maintenance.cleanup_dead_code';
  if (hasAny(normalized, ['make faster', 'optimize', 'performance']) && hasAny(normalized, ['refactor', 'maintenance', 'cleanup'])) return 'maintenance.performance_maintenance';
  if (hasAny(normalized, ['harden tests', 'test hardening', 'stabilize tests'])) return 'maintenance.test_hardening';
  if (hasAny(normalized, ['update docs', 'documentation', 'config upkeep', 'docs/config'])) return 'maintenance.documentation_config_upkeep';
  if (hasAny(normalized, ['compatibility', 'backward compatible', 'platform support'])) return 'maintenance.compatibility_update';
  if (hasAny(normalized, ['rollback', 'risky', 'migration', 'deploy', 'production'])) return 'maintenance.risk_rollback_heavy';
  if (hasAny(normalized, ['module cleanup', 'layer cleanup', 'incremental cleanup'])) return 'maintenance.incremental_module_layer_cleanup';
  if (hasAny(normalized, ['refactor', 'clean up', 'cleanup'])) return 'maintenance.refactor_no_behavior_change';

  if (hasAny(normalized, ['worked before', 'regression', 'recent change', 'broke after'])) return 'issue_debug.regression_after_recent_change';
  if (hasAny(normalized, ['failing test', 'test failure', 'vitest', 'jest', 'pytest', 'ci failure'])) return 'issue_debug.failing_test';
  if (hasAny(normalized, ['stack trace', 'exception', 'runtime error', 'crash'])) return 'issue_debug.runtime_error_exception';
  if (hasAny(normalized, ['ui', 'layout', 'screen', 'browser', 'visual mismatch', 'button', 'interaction'])) return 'issue_debug.ui_behavior_mismatch';
  if (hasAny(normalized, ['api failure', 'integration', 'request', 'response', 'status code', 'auth', 'upstream', 'downstream'])) return 'issue_debug.integration_api_failure';
  if (hasAny(normalized, ['flaky', 'race', 'intermittent'])) return 'issue_debug.flaky_behavior';
  if (hasAny(normalized, ['env', 'environment', 'config', 'configuration', 'local vs ci'])) return 'issue_debug.environment_config_issue';
  if (hasAny(normalized, ['slow', 'latency', 'throughput', 'memory leak']) && hasAny(normalized, ['bug', 'issue', 'not working', 'problem'])) return 'issue_debug.performance_problem';
  if (hasAny(normalized, ['expected']) && hasAny(normalized, ['actual'])) return 'issue_debug.new_bug_report';
  if (hasAny(normalized, ['bug', 'broken', 'error', 'not working', 'fix this'])) return 'issue_debug.reproduction_discovery';

  if (hasAny(normalized, ['upgrade', 'extend', 'extension'])) return 'feature.upgrade_extension';
  if (hasAny(normalized, ['idea', 'explore', 'options'])) return 'feature.idea_discussion';
  if (hasAny(normalized, ['implement', 'build', 'add', 'create'])) return 'feature.fresh_implementation';

  // The old terminal asserted quick_improvement for everything unmatched —
  // treating "could not tell" as "this is small". A cascade that matched no
  // branch asserts NOTHING; the route carries the typed under-evidenced state
  // instead, and the popup decision applies the locked dispositions. The
  // keyword gates above are untouched.
  return null;
}

/**
 * The evidence floor for the LACKS rule: a debug-shaped prompt carrying fewer
 * than this many of the eight evidence forms still lacks reproduction
 * evidence, so the request slot attaches. Two independent forms (for example a
 * pasted trace plus the failing test name) count as supplied.
 */
const DEBUG_EVIDENCE_SUPPLIED_FLOOR = 2;

/**
 * Capabilities the REGISTRY decides alone, never accepted as a classifier
 * candidate. The reproduction/evidence request is decided by the LACKS rule
 * below — a negative test about what the prompt is MISSING. That rule can only
 * ADD, so an observed candidate naming the same capability would attach it on
 * a prompt that already supplied its evidence, silently overriding the
 * negative test and re-nagging exactly the user C4 exists to stop nagging. Its
 * scope map (issue_debug + planning.debugging_plan) is the same route set the
 * rule governs, so refusing it as a candidate costs no reachable attachment:
 * inside that set the rule decides, and outside it the scope check vetoed it
 * anyway. The model observes; the registry decides.
 */
const REGISTRY_OWNED_CAPABILITIES: ReadonlySet<PromptEnhancementCapabilityId> = new Set([
  'capability.reproduction_or_evidence_needed',
]);

/**
 * The registry's capability decision on the keyed path — the keyword decider's
 * replacement. The classifier only OBSERVED candidates; every attachment is
 * decided here: a candidate outside its locked family/intent scope is VETOED,
 * and the reproduction/evidence slot additionally attaches by the registry's
 * own rule — debug-shaped route AND the observed evidence list is short. That
 * is a negative test about what the prompt is MISSING, which a keyword list
 * structurally cannot evaluate: a keyword can spot a present word, not an
 * absence.
 */
function decideCapabilityOverlaysFromObservation(
  selectedPreset: PromptEnhancementTaxonomyPreset,
  input: PromptEnhancementRouteInput,
): readonly PromptEnhancementCapabilityId[] {
  const capabilities = new Set(selectedPreset.capabilityOverlays);
  for (const candidate of input.classifierCapabilityCandidates ?? []) {
    if (REGISTRY_OWNED_CAPABILITIES.has(candidate)) continue;
    if (isCapabilityCompatibleWithRoute(candidate, selectedPreset.family, selectedPreset.primaryIntent)) {
      capabilities.add(candidate);
    }
  }
  return withDebugEvidenceAskRule(capabilities, selectedPreset, input);
}

/**
 * The registry's evidence-lacking rule for the reproduction/evidence request:
 * on a debug-shaped route, attach it unless the classifier OBSERVED the prompt
 * already supplying enough evidence forms. An absent observation channel
 * (no-key session) reads as "not known to be supplied", so those routes keep
 * asking — only an observed-supplied prompt clears the request. This consults
 * the evidence observation, never prompt keywords, so it lives outside the
 * demoted keyword decider on every path.
 */
function withDebugEvidenceAskRule(
  capabilities: ReadonlySet<PromptEnhancementCapabilityId> | readonly PromptEnhancementCapabilityId[],
  selectedPreset: PromptEnhancementTaxonomyPreset,
  input: PromptEnhancementRouteInput,
): readonly PromptEnhancementCapabilityId[] {
  const merged = new Set(capabilities);
  const debugShaped = selectedPreset.family === 'issue_debug' || selectedPreset.primaryIntent === 'planning.debugging_plan';
  if (debugShaped && (input.classifierDebugEvidencePresent ?? []).length < DEBUG_EVIDENCE_SUPPLIED_FLOOR) {
    merged.add('capability.reproduction_or_evidence_needed');
  }
  return [...merged];
}

/**
 * The keyword capability decider — DEMOTED to the no-key path, where no
 * classifier observation exists, exactly like the keyword cascade: not
 * deleted, not widened. Keyed routes decide capabilities from the classifier's
 * observation via decideCapabilityOverlaysFromObservation instead.
 */
function mergeCapabilities(
  baseCapabilities: readonly PromptEnhancementCapabilityId[],
  normalized: string,
  input: PromptEnhancementRouteInput,
): readonly PromptEnhancementCapabilityId[] {
  const capabilities = new Set(baseCapabilities);
  if (hasAny(normalized, ['risk', 'rollback', 'migration', 'deploy', 'production', 'security', 'destructive', 'data'])) {
    capabilities.add('capability.risk_or_rollback');
    capabilities.add('capability.confirmation_needed');
  }
  if (hasAny(normalized, ['many', 'multiple', 'break down', 'decompose', 'plan'])) {
    capabilities.add('capability.decomposition_candidate');
  }
  if ((input.sourceFactRefs?.length ?? 0) > 0 || (input.contentTemplateFactRefs?.length ?? 0) > 0 || typeof input.firedKey === 'string') {
    capabilities.add('capability.source_signal_guidance');
    // ⛔ `capability.project_grounding` NO LONGER attaches here. `firedKey` is always a string on
    // this path — a popup exists because something fired — so this condition was "always", and
    // grounding was structurally guaranteed rather than decided. This is the keyless path, where
    // no applicability observation exists at all, and the ruling is FAIL-CLOSED: no observation,
    // no grounding section. The source-signal half is untouched (its own fix, deliberately later).
  }
  return [...capabilities];
}

function confidenceFor(
  normalized: string,
  input: PromptEnhancementRouteInput,
  intent: PromptEnhancementPrimaryIntent,
): PromptEnhancementRouteConfidence {
  if (isWeakAmbiguousPrompt(normalized, input)) return 'weak_low_risk';
  if (intent.includes('reproduction_discovery')) return 'partial';
  if (typeof input.firedKey === 'string' || hasExplicitRouteWords(normalized)) return 'strong';
  return 'partial';
}

function reasonCodesFor(
  normalized: string,
  input: PromptEnhancementRouteInput,
  intent: PromptEnhancementPrimaryIntent,
  capabilities: readonly PromptEnhancementCapabilityId[],
): readonly string[] {
  const reasons = [`selected_intent:${intent}`];
  if (typeof input.firedKey === 'string') reasons.push('shared_signal_evidence_present');
  if ((input.contentTemplateFactRefs?.length ?? 0) > 0) reasons.push('content_template_source_b_support_only');
  if (hasScopedFeedbackSuppression(input)) reasons.push('suppressed_by_scoped_feedback');
  if (hasLowRiskUnrelatedSource(input)) reasons.push('low_risk_unrelated_signal');
  if (capabilities.includes('capability.risk_or_rollback')) reasons.push('risk_or_rollback_overlay_attached');
  if (normalized.includes('fix this') && intent.startsWith('issue_debug.')) reasons.push('ambiguous_surface_resolved_by_debug_evidence');
  return reasons;
}

function hasSuppressedSourceReason(reasonCodes: readonly string[]): boolean {
  return reasonCodes.includes('low_risk_unrelated_signal') || reasonCodes.includes('suppressed_by_scoped_feedback');
}

function hasScopedFeedbackSuppression(input: PromptEnhancementRouteInput): boolean {
  return [...(input.sourceFactRefs ?? []), ...(input.memoryFeedbackRefs ?? [])].some((ref) => {
    const normalized = ref.toLowerCase();
    return normalized.includes('suppressed_by_scoped_feedback') || normalized.includes('scoped_feedback_suppression');
  });
}

function hasLowRiskUnrelatedSource(input: PromptEnhancementRouteInput): boolean {
  return (input.sourceFactRefs ?? []).some((ref) => {
    const normalized = ref.toLowerCase();
    return normalized.includes('low_risk_unrelated_signal') || normalized.includes('session_quality_low_value');
  });
}

function buildRouteEvidenceRefs(input: PromptEnhancementRouteInput): readonly string[] {
  const refs = new Set<string>();
  refs.add('source_a:current_prompt');
  refs.add(`stage:${input.prevStage ?? 'unknown'}->${input.currentStage}`);
  refs.add(`trigger_kind:${input.triggerKind}`);
  if (input.firedKey) refs.add(`signal:${input.firedKey}`);
  if (input.effectiveFiredSource) refs.add(`effective_source:${input.effectiveFiredSource}`);
  if (input.selectedQualifyingAbsence) refs.add(`absence:${input.selectedQualifyingAbsence}`);
  if (input.absenceGateReason) refs.add(`absence_gate:${input.absenceGateReason}`);
  if (input.firstTriggerGateState) {
    refs.add(`gate:frequency:${input.firstTriggerGateState.frequencyGate}`);
    refs.add(`gate:min_prompt:${input.firstTriggerGateState.minPromptGate}`);
    refs.add(`gate:cooldown:${input.firstTriggerGateState.cooldownState}`);
    refs.add(`gate:dedupe:${input.firstTriggerGateState.dedupeState}`);
    refs.add(`gate:session_cap:${input.firstTriggerGateState.sessionCapState}`);
    refs.add(`gate:classifier_recommendation:${input.firstTriggerGateState.classifierRecommendationState}`);
  }
  for (const ref of input.sourceFactRefs ?? []) refs.add(`source_fact:${ref}`);
  for (const ref of input.contentTemplateFactRefs ?? []) refs.add(`content_template:${ref}`);
  for (const ref of input.sourceSnapshot?.contentTemplateRecordFactRefs ?? []) refs.add(`content_template:${ref}`);
  if (input.sourceSnapshot?.contentTemplate) {
    const template = input.sourceSnapshot.contentTemplate;
    if (template.resolvedSource) refs.add(`content_template_source_tier:${template.resolvedSource}`);
    for (const tier of template.sourceCascade) refs.add(`content_template_source_cascade:${tier}`);
    if (template.recordSignalType) refs.add(`signal_alias_resolution:${template.recordSignalType}`);
    refs.add(`pinch_question_source_state:${template.questionServing}`);
    refs.add(`sanitization_state:${template.safeguardRequired ? 'safeguard_required' : 'not_required'}`);
  }
  for (const ref of input.sourceSnapshot?.popupQuestionSourceRefs ?? []) refs.add(`popup_question_source:${ref}`);
  for (const ref of input.sourceSnapshot?.whyHelpSourceRefs ?? []) refs.add(`why_help_source:${ref}`);
  for (const ref of input.sourceSnapshot?.servedVariantIdentityRefs ?? []) refs.add(`served_variant:${ref}`);
  for (const ref of input.sourceSnapshot?.deliveryGateRefs ?? []) refs.add(`ds_delivery_gate:${ref}`);
  for (const ref of input.sourceSnapshot?.sourceOnlyHardFactRefs ?? []) refs.add(`source_only_hard_fact:${ref}`);
  for (const ref of input.recentPromptEvidenceRefs ?? []) refs.add(`recent_prompt:${ref}`);
  for (const ref of input.memoryFeedbackRefs ?? []) refs.add(`memory_feedback:${ref}`);
  for (const ref of input.profileTieBreakerRefs ?? []) refs.add(`profile_tiebreaker:${ref}`);
  if (input.permissionMode) refs.add(`permission_mode:${input.permissionMode}`);
  if (input.transcriptPathState) refs.add(`transcript_path:${input.transcriptPathState}`);
  for (const ref of input.streamBOutputRefs ?? input.sourceSnapshot?.streamBOutputs ?? []) refs.add(`stream_b:${ref}`);
  for (const ref of input.paramEventChannels ?? input.sourceSnapshot?.paramEventChannels ?? []) refs.add(`param_event:${ref}`);
  for (const ref of input.runtimeEnvFactRefs ?? []) refs.add(`runtime_env:${ref}`);
  for (const ref of input.rightGoodWorkStyleRefs ?? input.sourceSnapshot?.rightGoodWorkStyleEnvRuntimeRefs ?? []) refs.add(`right_good_work_style:${ref}`);
  if (input.stage2SelectionState) refs.add(`stage2_selection:${input.stage2SelectionState}`);
  return [...refs];
}

function isFirstTriggerBlocked(gates: PromptEnhancementRouteInput['firstTriggerGateState']): boolean {
  if (!gates) return false;
  return gates.frequencyGate === 'blocked' ||
    gates.minPromptGate === 'blocked' ||
    gates.cooldownState === 'blocked' ||
    gates.dedupeState === 'blocked' ||
    gates.sessionCapState === 'blocked' ||
    gates.classifierRecommendationState === 'no_fire';
}

function isHighRiskAmbiguousException(normalized: string, input: PromptEnhancementRouteInput): boolean {
  const compact = normalized.trim();
  const ambiguous = compact === 'fix this' || compact === 'continue' || compact === 'make it better' || compact === 'plan this';
  if (!ambiguous) return false;
  const refs = [
    ...(input.sourceFactRefs ?? []),
    ...(input.contentTemplateFactRefs ?? []),
    input.firedKey,
    input.selectedQualifyingAbsence,
  ].filter((ref): ref is string => typeof ref === 'string').join(' ').toLowerCase();
  return refs.includes('migration') ||
    refs.includes('rollback') ||
    refs.includes('production') ||
    refs.includes('security') ||
    refs.includes('destructive') ||
    refs.includes('source-critical') ||
    refs.includes('source_critical');
}

function candidateRouteIdsFor(selectedPreset: PromptEnhancementTaxonomyPreset, noPopup: boolean): readonly string[] {
  if (noPopup) return ['route.skip_no_popup', selectedPreset.id];
  const sameFamily = PROMPT_ENHANCEMENT_TAXONOMY_PRESETS
    .filter((presetRecord) => presetRecord.family === selectedPreset.family)
    .slice(0, 3)
    .map((presetRecord) => presetRecord.id);
  return [...new Set([selectedPreset.id, ...sameFamily])];
}

function rejectedAlternativesFor(selectedPreset: PromptEnhancementTaxonomyPreset): PromptEnhancementRouteDecisionV1['rejectedRoutes'] {
  return PROMPT_ENHANCEMENT_FAMILIES
    .filter((family) => family !== selectedPreset.family)
    .slice(0, 2)
    .map((family) => ({
      routeId: `family:${family}`,
      reasonCode: 'weaker_than_current_intent',
      publicSafeReasonCategory: 'source_coverage',
    }));
}

function suppressedSourceRejectedRoutesFor(reasonCodes: readonly string[]): PromptEnhancementRouteDecisionV1['rejectedRoutes'] {
  return reasonCodes
    .filter((reasonCode) => reasonCode === 'low_risk_unrelated_signal' || reasonCode === 'suppressed_by_scoped_feedback')
    .map((reasonCode) => ({
      routeId: `source:${reasonCode}`,
      reasonCode,
      publicSafeReasonCategory: 'source_coverage',
    }));
}

function hasAny(input: string, terms: readonly string[]): boolean {
  return terms.some((term) => matchesTerm(input, term));
}

function matchesTerm(input: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (/\W/.test(term)) {
    return new RegExp(`(?:^|\\W)${escaped}(?:$|\\W)`, 'i').test(input);
  }
  return new RegExp(`\\b${escaped}\\b`, 'i').test(input);
}
