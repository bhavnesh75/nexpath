import type { Stage } from '../classifier/types.js';
import type { PromptEnhancementSourceEligibilityStateV1 } from './templates/section-plan.js';
import type {
  ContentTemplateSourceSnapshot,
  HistoricalBootstrapSourceSnapshot,
  LaunchBoundarySourceSnapshot,
  PromptStartStopSourceSnapshot,
  SourceAuthorization,
  StoreSourceSnapshot,
} from './source-reality.js';

export const PROMPT_ENHANCEMENT_CONTRACT_VERSION = 1 as const;

export type PromptEnhancementSchemaVersion = typeof PROMPT_ENHANCEMENT_CONTRACT_VERSION;

export type PromptEnhancementHostSurface =
  | 'cli_stop_bridge'
  | 'extension_bridge'
  | 'manual_fallback'
  | 'future_host_hold_proven';

export type PromptEnhancementReviewMoment =
  | 'UserPromptSubmit_preparation'
  | 'Stop_delivery'
  | 'extension_delivery'
  | 'manual_delivery';

export type PromptEnhancementDisposition =
  | 'show_current_body'
  | 'fallback_to_original'
  | 'no_popup_not_applicable'
  | 'blocked_no_send';

export type PromptEnhancementActionType =
  | 'use_current_body'
  | 'use_original'
  | 'shorter'
  | 'more_thorough'
  | 'more_project_grounded'
  | 'apply_details'
  | 'feedback'
  | 'close';

export type PromptEnhancementAvailabilityState =
  | 'available'
  | 'disabled_not_applicable'
  | 'disabled_loading'
  | 'disabled_fallback'
  | 'disabled_safety'
  | 'disabled_provider_unavailable';

export type PromptEnhancementSourceKind =
  | 'source_a_user_prompt'
  | 'stage_or_absence_signal'
  | 'content_template_record'
  | 'content_template_fact'
  | 'hard_fact_or_profile_signal'
  | 'prompt_enhancement_memory'
  | 'safety_rule'
  | 'generated_origin'
  | 'handoff_metadata';

export type PromptEnhancementEvidenceStatus =
  | 'present'
  | 'not_applicable'
  | 'unknown'
  | 'stale'
  | 'failed_fallback'
  | 'suppressed_for_safety'
  | 'suppressed_for_privacy';

export type PromptEnhancementValidationStatus =
  | 'valid'
  | 'valid_with_fallback'
  | 'invalid'
  | 'invalid_non_sendable'
  | 'no_popup'
  | 'original_only'
  | 'blocked_by_provider_or_runtime'
  | 'not_applicable'
  | 'unknown'
  | 'failed_fallback';

export type PromptEnhancementValidationStage =
  | 'request'
  | 'pre_plan'
  | 'section_plan'
  | 'composer_input'
  | 'composer_output'
  | 'final_body'
  | 'user_edit'
  | 'action'
  | 'delivery'
  | 'storage'
  | 'source_use'
  | 'privacy'
  | 'handoff'
  | 'sequence'
  | 'launch_check';

export type PromptEnhancementFallbackMode =
  | 'none'
  | 'deterministic_body'
  | 'previous_sendable_body'
  | 'original_prompt_only'
  | 'no_popup'
  | 'disabled_action'
  | 'delivery_unavailable'
  | 'direct_insert_unavailable'
  | 'approved_non_old_copy_delivery_fallback'
  | 'provider_api_unavailable'
  | 'timeout_no_send'
  | 'validation_failed_no_send';

export type PromptEnhancementComposerMode =
  | 'baseline_deterministic_render'
  | 'baseline_llm_structured_wording'
  | 'action_recomposition_deterministic'
  | 'action_recomposition_llm_structured_wording'
  | 'additional_details_recomposition_deterministic'
  | 'additional_details_recomposition_llm_structured_wording'
  | 'previous_body_preservation'
  | 'original_fallback';

export type PromptEnhancementLanguagePolicy =
  | 'preserve_user_language'
  | 'technical_english_default'
  | 'unknown_default';

export type PromptEnhancementLanguageValidationStatus =
  | 'valid'
  | 'not_applicable'
  | 'fallback_applied';

export type PromptEnhancementEffectiveLanguageState =
  | 'known'
  | 'unknown_default'
  | 'mixed_or_low_confidence';

export type PromptEnhancementLanguageSource =
  | 'detected_from_prompt'
  | 'configured_override'
  | 'technical_english_default';

export type PromptEnhancementLanguageConfidence =
  | 'high'
  | 'medium'
  | 'low'
  | 'unknown';

export type PromptEnhancementStrictSchemaFailureReasonCode =
  | 'invalid_json'
  | 'duplicate_key'
  | 'unknown_field'
  | 'invalid_enum'
  | 'bad_reference'
  | 'output_cap_exceeded'
  | 'unsafe_metadata_copy';

export type PromptEnhancementInstructionPrecedenceState =
  | 'generated_sections_qualify_original'
  | 'original_only_no_generated_sections'
  | 'fallback_previous_body'
  | 'unresolved_conflict';

export type PromptEnhancementOriginalAsSourceStatus =
  | 'local_verbatim_source_context'
  | 'original_only_sendable'
  | 'previous_body_preserved';

export type PromptEnhancementGeneratedOriginState =
  | 'ordinary_user_prompt'
  | 'pe_generated_body'
  | 'pe_user_edited_body'
  | 'user_original'
  | 'old_ds_injected_text'
  | 'unknown_or_untrusted';

export type PromptEnhancementSentPromptOrigin =
  | 'user_authored_original_only'
  | 'pe_baseline_generated_body'
  | 'pe_action_generated_body'
  | 'pe_deterministic_fallback_body'
  | 'previous_sendable_body'
  | 'sequence_handoff_owned_body';

export type PromptEnhancementLlmCallPolicy =
  | 'no_call'
  | 'optional_with_cost_visibility'
  | 'blocked_pending_cost_visibility';

export type PromptEnhancementSendPolicy =
  | 'send_current'
  | 'send_original'
  | 'no_send'
  | 'original_only'
  | 'no_popup';

export type PromptEnhancementCallVisibilityMode =
  | 'deterministic'
  | 'llm_wording'
  | 'fallback_no_llm'
  | 'provider_unavailable'
  | 'not_applicable';

export type PromptEnhancementRuntimeBlockReason =
  | 'provider_unavailable'
  | 'provider_refused'
  | 'timeout'
  | 'malformed_output'
  | 'validation_failed'
  | 'safety_failed'
  | 'privacy_or_source_cap'
  | 'unsupported_host'
  | 'not_applicable';

export type PromptEnhancementOwnerArea =
  | 'content_semantics'
  | 'ui_app'
  | 'host_transport'
  | 'release_check'
  | 'cross_layer_acceptance';

export type PromptEnhancementPublicTrustCueLabel =
  | 'original_prompt'
  | 'clarified_rewrite'
  | 'source_signal_guidance'
  | 'hard_fact_grounding'
  | 'safety_safeguard'
  | 'handoff_metadata'
  | 'fallback_or_no_popup'
  | 'privacy_state'
  | 'generated_source_state';

export type PromptEnhancementPublicDiagnosticCategory =
  | 'generated'
  | 'fallback_or_no_popup'
  | 'action_disabled'
  | 'provider_api_unavailable'
  | 'validation_failed'
  | 'source_coverage'
  | 'public_launch_recheck_pending';

export interface PromptEnhancementSourceRefV1 {
  sourceRefId: string;
  sourceKind: PromptEnhancementSourceKind;
  sourceId: string;
  sourceAuthorization: SourceAuthorization;
  evidenceStatus: PromptEnhancementEvidenceStatus;
  freshness: 'current' | 'historical' | 'unknown';
  confidence: 'high' | 'medium' | 'low' | 'none';
  privacyClass: 'public_safe' | 'local_private' | 'sensitive' | 'raw_text_excluded';
}

export interface PromptEnhancementTriggerProvenanceV1 {
  currentStage: Stage;
  prevStage?: Stage;
  triggerKind: 'stage_transition' | 'absence' | 'manual' | 'none';
  firedKey?: string;
  effectiveFiredSource?: string;
  selectedQualifyingAbsence?: string;
  absenceGateReason?: string;
  classifierState: 'fire_recommended' | 'no_fire' | 'degraded_no_fire' | 'not_applicable';
  degradedNoActionState: 'none' | 'degraded_no_fire' | 'no_action_not_applicable' | 'blocked_by_source_gate';
  /**
   * The stage classifier's intent PROPOSAL ('' when unsupported by the evidence
   * ladder or on the degraded path). Typed as string here (the intent union lives
   * in the routing module, which imports this file); the parser validated it
   * against the full menu and the router re-guards before preferring it.
   */
  classifierPrimaryIntent?: string;
  classifierIntentConfidence?: number;
  /**
   * The classifier's capability OBSERVATION from the same call: candidate
   * capability ids, and the debug-evidence forms present in the prompt. String
   * arrays here (the typed unions live in the routing module); the facade
   * re-guards every entry before the registry consumes them. Observations
   * only — the registry decides all attachment.
   */
  classifierCapabilityCandidates?: readonly string[];
  classifierProjectFactCandidates?: readonly string[];
  classifierSectionRelevanceOrder?: readonly string[];
  classifierDebugEvidencePresent?: readonly string[];
  /**
   * The classifier's sensitive-action precision observation from the same call: whether
   * the CURRENT prompt PROPOSES performing a risky action or merely MENTIONS one, plus the
   * stated benign reading. String-typed here like its siblings (the exact-value guard lives
   * in the clearance gate, which accepts only the literal 'not_proposed' with a non-empty
   * reason). ⚠️ Unlike the siblings, this field's absence is not merely "no observation" —
   * it is the FAIL-CLOSED state: absent, degraded, malformed and reasonless all mean the
   * confirmation line is emitted exactly as it is today. A degraded classifier call omits
   * the field entirely.
   */
  classifierSensitiveActionClearance?: { readonly verdict?: string; readonly reason?: string; readonly name?: string };
  promptStartBoundary: PromptStartStopSourceSnapshot['hookBoundary'];
  deliveryBoundary: PromptStartStopSourceSnapshot['deliveryBoundary'];
  promptStartCanReplaceSameTurn: PromptStartStopSourceSnapshot['runAutoCanHoldOrReplaceSubmittedPrompt'];
  promptId?: string;
  sessionId?: string;
  promptIndex?: number;
}

export interface PromptEnhancementSourceInputSnapshotV1 {
  sourceAOriginalPromptRef: PromptEnhancementSourceRefV1;
  sourceRefs: readonly PromptEnhancementSourceRefV1[];
  /**
   * F4 (L4971): the eligibility the TRIGGER signal carries, decided by the pipeline upstream
   * and carried through — PE reads it, never recomputes it (prohibition 19). Optional so an
   * older caller keeps working; the mix seam treats absence as NOT independently eligible,
   * which is the fail-closed direction.
   */
  triggerSignalEligibilityState?: PromptEnhancementSourceEligibilityStateV1;
  normalizedStageAbsenceSignalRefs: readonly string[];
  contentTemplateRecordFactRefs: readonly string[];
  popupQuestionSourceRefs: readonly string[];
  whyHelpSourceRefs: readonly string[];
  profileRoleModeRefs: readonly string[];
  rightGoodWorkStyleEnvRuntimeRefs: readonly string[];
  missingMemoryCandidateRefs: readonly string[];
  /**
   * Typed corroboration tier / polarity per crossing env or RIGHT&GOOD ref — carried
   * beside the ref strings, never inside them. The registry computes claim wording
   * FROM these; absent maps read as uncorroborated/unknown (the weakest claim).
   */
  groundingTierByRef?: Readonly<Record<string, 'promoted_practice_P' | 'capability' | 'uncorroborated'>>;
  groundingPolarityByRef?: Readonly<Record<string, 'present' | 'false_capability' | 'unknown'>>;
  /**
   * The caller-resolved CONTENT per crossing ref — a generic key/value pair plus
   * where the resolution happened. Values come from the store-backed reads the
   * boundary already performs; prompt-derived values arrive only through
   * call-visibility-visible runtime extraction, never an eager boundary call.
   */
  groundingEvidenceByRef?: Readonly<Record<string, {
    readonly key: string;
    readonly value: string;
    readonly runtimePath: 'local_store' | 'local_read_model' | 'local_probe';
    readonly anchorScope:
      | 'machine_environment'
      | 'project_root'
      | 'session_behavior'
      | 'longitudinal_user_behavior'
      | 'current_prompt_scope'
      | 'content_template_scope'
      | 'unknown_anchor';
  }>>;
  sourceLabels: readonly {
    sourceRefId: string;
    label:
      | 'original_prompt'
      | 'stage_absence_signal'
      | 'content_template_fact'
      | 'hard_fact'
      | 'profile_role_mode'
      | 'right_good_work_style_env_runtime'
      | 'missing_memory_candidate'
      | 'safety_rule';
    evidenceStatus: PromptEnhancementEvidenceStatus;
  }[];
  contentTemplate?: Pick<
    ContentTemplateSourceSnapshot,
    | 'recordSignalType'
    | 'contentSource'
    | 'resolvedRecordIdentity'
    | 'resolvedSource'
    | 'sourceCascade'
    | 'registerOverridePath'
    | 'safeguardRequired'
    | 'questionServing'
  >;
  promptStartStop: Pick<
    PromptStartStopSourceSnapshot,
    | 'hookBoundary'
    | 'deliveryBoundary'
    | 'runAutoCanHoldOrReplaceSubmittedPrompt'
    | 'sharedSignalCount'
    | 'classifierDegradedNoFireReasons'
  >;
  store: Pick<StoreSourceSnapshot, 'schemaVersion' | 'missingPromptEnhancementTables' | 'cleanupGaps'>;
  historicalBootstrap?: Pick<
    HistoricalBootstrapSourceSnapshot,
    'authorization' | 'sourceClass' | 'servedRowsAreMemoryAuthority' | 'transcriptCorroborationIsHistoricalImport'
  >;
  launchBoundary?: Pick<LaunchBoundarySourceSnapshot, 'authorization' | 'launchReady' | 'requiredRecheckAfterImplementation'>;
  permissionMode?: string;
  transcriptPathState: 'provided' | 'not_provided' | 'not_authority';
  streamBOutputs: readonly string[];
  paramEventChannels: readonly string[];
  servedVariantIdentityRefs: readonly string[];
  deliveryGateRefs: readonly string[];
  sourceOnlyHardFactRefs: readonly string[];
}

export interface PromptEnhancementTemplateRegistryRefV1 {
  schemaVersion: PromptEnhancementSchemaVersion;
  templateId: string;
  registryNamespace: 'prompt-enhancement-templates';
  templateType: string;
  familyId: string;
  displayLabel: string;
  primaryIntent: string;
  intentTags: readonly string[];
  capabilityIds: readonly string[];
  triggerHints: readonly string[];
  supportedLevels: readonly PromptEnhancementPrepareRequestV1['userPreferenceContext']['levelState'][];
  defaultLevel: PromptEnhancementPrepareRequestV1['userPreferenceContext']['levelState'];
  applicabilityAxes: readonly string[];
  applicabilityGuards: readonly string[];
  sourcePriorityState: 'source_a_first' | 'source_b_support_only' | 'fallback_when_source_weak';
  targetScopePolicy: 'source_a_scope_only' | 'source_a_plus_grounded_support';
  capabilityRequirements: readonly string[];
  requiredSectionKinds: readonly string[];
  optionalSectionKinds: readonly string[];
  sectionSlots: readonly string[];
  sectionOrderPolicy: 'fixed_required_before_optional' | 'source_driven_merge_allowed';
  sourceGuidanceFloorPolicy: 'required_when_popup_shown' | 'explicit_fallback_reason';
  originalPromptPreservationPolicy: 'visible_verbatim_required';
  allowedSourceKinds: readonly PromptEnhancementSourceKind[];
  requiredSourceACoverage: 'visible_original_prompt' | 'explicit_fallback_reason';
  allowedSourceBSupportKinds: readonly PromptEnhancementSourceKind[];
  baselineSourceSignalSlot: string | 'not_applicable' | 'unknown';
  sourceEvidenceStatusRules: readonly PromptEnhancementEvidenceStatus[];
  contentTemplateInputRefs: readonly string[];
  safetyHookIds: readonly string[];
  sensitivityPolicy: 'deterministic_flags_required' | 'not_applicable';
  voicePolicyRef: string;
  confirmationRequirementPolicy: 'preserve_when_required' | 'not_applicable';
  supportedDirectionalActions: readonly Exclude<
    PromptEnhancementActionType,
    'use_current_body' | 'use_original' | 'feedback' | 'close'
  >[];
  composerPolicy: 'deterministic_only' | 'optional_llm_with_visibility' | 'blocked_pending_cost_visibility';
  deterministicRendererId: string;
  llmCallPolicy: 'no_call' | 'optional_with_cost_visibility' | 'blocked_pending_cost_visibility';
  tokenTimeoutProfileRef: string;
  validationRequirementIds: readonly string[];
  fallbackReasonCodes: readonly PromptEnhancementRuntimeBlockReason[];
  publicSafeDiagnosticCodes: readonly PromptEnhancementPublicDiagnosticCategory[];
  fallbackPolicy: PromptEnhancementFallbackMode;
  testFixtureIds: readonly string[];
  invariantIds: readonly string[];
  ownerArea: 'content_semantics';
  launchVisibility: 'private_until_launch_recheck';
  publicSafeSourceNotes: readonly string[];
  routeFixtureIds: readonly string[];
  evaluationFixtureIds: readonly string[];
}

export interface PromptEnhancementRouteDecisionV1 {
  routeDecisionId: string;
  /**
   * The debug-evidence forms the classifier OBSERVED in the prompt, carried so
   * the reproduction section can name what the developer actually supplied
   * instead of asking them to supply it again. An observation only — the
   * registry still decides every attachment. Empty on keyless sessions, where
   * nothing is known to be supplied.
   */
  debugEvidenceObserved: readonly string[];
  promptReviewOrigin:
    | 'user_authored_current_prompt'
    | 'old_ds_advisory_injected'
    | 'pe_generated_initial_send'
    | 'pe_action_generated_send'
    | 'multi_prompt_sequence_generated'
    | 'unknown_origin';
  promptReviewProcessingPolicy:
    | 'eligible_for_initial_pe_route'
    | 'metadata_only_skip_pe_route'
    | 'sequence_owned_by_handoff_runtime_gate'
    | 'old_ds_guard_skip'
    | 'fallback_origin_unknown';
  familyId: string;
  primaryIntent: string;
  capabilityOverlays: readonly string[];
  // P3-G2: 'multi_intent_needs_handoff' removed — compoundPromptStateFor never emits
  // it and route-level handoff candidacy is sourced from the handoff-metadata producer
  // (transform-rule-8), not the router.
  compoundPromptState:
    | 'single_intent'
    | 'multi_point_same_intent'
    | 'multi_intent_one_prompt'
    | 'ambiguous_multi_intent';
  userPointCoverageRefs: readonly string[];
  nonPrimaryUserIntentHandling:
    | 'covered_by_primary'
    | 'covered_by_secondary_tag'
    | 'covered_by_capability_overlay'
    | 'parallel_section_in_same_prompt'
    | 'handoff_candidate'
    | 'requires_clarification'
    | 'out_of_scope_by_user_constraint';
  selectedTemplateRef: PromptEnhancementTemplateRegistryRefV1;
  secondaryIntentTags: readonly string[];
  routeCandidates: readonly {
    routeId: string;
    familyId: string;
    primaryIntent: string;
    capabilityIds: readonly string[];
    evidenceRefs: readonly string[];
    confidence: 'strong' | 'partial' | 'weak_low_risk' | 'weak_source_critical' | 'conflicting' | 'missing';
    state: 'selected' | 'rejected' | 'suppressed' | 'fallback_only' | 'deferred';
  }[];
  candidateRouteIds: readonly string[];
  rejectedRouteReasonCodes: readonly string[];
  rejectedRoutes: readonly {
    routeId: string;
    reasonCode: string;
    publicSafeReasonCategory: PromptEnhancementPublicDiagnosticCategory;
  }[];
  routeConfidence: 'strong' | 'partial' | 'weak_low_risk' | 'weak_source_critical' | 'conflicting' | 'missing';
  signalProvenance: readonly string[];
  sourceSignalRole:
    | 'effective_fired_advisory_source'
    | 'qualifying_unselected_absence'
    | 'supplementary_stage2_present'
    | 'absent_unselected_diagnostic'
    | 'counter_update_only'
    | 'rejected_unknown_model_key'
    | 'none';
  stage2SelectionState?:
    | 'selected'
    | 'qualifying_but_unselected'
    | 'supplementary_present'
    | 'absent_unselected_diagnostic'
    | 'counter_update_only'
    | 'rejected_unknown_key';
  sourceSignalPolicy:
    | 'render_baseline_guidance'
    | 'merge_into_existing_section'
    | 'metadata_only'
    | 'suppress_with_reason'
    | 'skip_no_popup';
  sectionPlanRefs: readonly string[];
  fallbackMode:
    | 'none'
    | 'skip_no_popup'
    | 'planning_first'
    | 'confirmation_first'
    | 'fallback_original_with_reason'
    | 'fallback_safe_floor_only'
    | 'disabled_with_reason';
  llmRoutePolicy: {
    // E6: 'llm_route_decision_call' marks a route decided by the bounded LLM route
    // call; 'no_call' remains the deterministic default + fallback.
    mode: 'no_call' | 'llm_route_decision_call';
    owner: 'content_semantics';
    costWorksheetRow: 'not_applicable_deterministic' | 'llm_route_decision_call';
    freeformRouteOutputAllowed: false;
  };
  ambiguityState:
    | 'clear'
    | 'ambiguous_surface_prompt'
    | 'missing_target'
    | 'conflicting_evidence'
    | 'weak_high_risk'
    | 'skip_no_useful_guidance';
  suppressionState:
    | 'not_suppressed'
    | 'suppressed_no_signal'
    | 'suppressed_safety'
    | 'suppressed_privacy'
    | 'suppressed_source_mismatch'
    | 'suppressed_scoped_feedback';
  routeInputEvidenceRefs: readonly string[];
  routeEvidence: readonly string[];
  registryLinkedFixtureIds: readonly string[];
  usesPeOnlyClassifier: false;
  usesOldStaticDecisionSessionMap: false;
}

export interface PromptEnhancementSectionPlanItemV1 {
  sectionPlanId: string;
  sectionId: string;
  sectionKind: string;
  templateId: string;
  familyId: string;
  primaryIntent: string;
  order: number;
  mergeGroupId?: string;
  sourceRefs: readonly PromptEnhancementSourceRefV1[];
  sourceKind: PromptEnhancementSourceKind;
  sourceIds: readonly string[];
  sourceEvidenceStatus: PromptEnhancementEvidenceStatus;
  slotEvidenceStatus: PromptEnhancementEvidenceStatus;
  /**
   * The typed slot obligations the attached capabilities place on THIS
   * section — a slot is a typed content obligation plus its metadata and
   * state, not a heading. Populated from the capability slot-effect map at
   * planning; empty when no attached capability targets this section kind.
   * String-typed here (the obligation union lives in the planner layer).
   */
  slotObligations: readonly string[];
  baselineSourceSignalSlot: string | 'not_applicable' | 'unknown';
  requirementSourceStatus: PromptEnhancementEvidenceStatus;
  isRequired: boolean;
  isEditable: boolean;
  removalFeedbackPolicy: 'typed_event_required' | 'not_applicable';
  safetyFlags: readonly string[];
  sensitivityFlags: readonly string[];
  validationStatus: PromptEnhancementValidationStatus;
  fallbackMode: PromptEnhancementFallbackMode;
  callVisibilityMode: PromptEnhancementCallVisibilityMode;
  deterministicTextBasisPolicy: 'structured_parts' | 'deterministic_text_draft' | 'not_applicable';
  textDraftRef?: string;
  structuredContentPartRefs: readonly string[];
  supportedActions: readonly PromptEnhancementActionType[];
  contentTemplateRuntimeSeamUse: PromptEnhancementSectionV1['contentTemplateRuntimeSeamUse'];
  handoffCapabilityFlags: readonly string[];
}

export interface PromptEnhancementBodyPlanV1 {
  bodyPlanId: string;
  bodyRevision: number;
  routeDecisionId: string;
  orderedSectionPlans: readonly PromptEnhancementSectionPlanItemV1[];
  originalPromptPreservation: 'visible_verbatim' | 'visible_summarized' | 'fallback_original_only';
  groundedSourceGuidancePolicy: 'required_when_popup_shown' | 'explicit_fallback_reason' | 'not_applicable';
  generatedOriginPolicy: 'attach_generated_origin_metadata';
  futurePromptTextPolicy: 'not_generated_not_stored_not_rendered';
  exposesPrecomputedVariants: false;
}

export interface PromptEnhancementComposerBoundaryV1 {
  composerBoundaryVersion: PromptEnhancementSchemaVersion;
  composerPolicy: 'deterministic_only' | 'optional_llm_with_visibility' | 'blocked_pending_cost_visibility';
  composerRunId: string;
  routeDecisionId: string;
  promptReviewOrigin: PromptEnhancementRouteDecisionV1['promptReviewOrigin'];
  promptReviewProcessingPolicy: PromptEnhancementRouteDecisionV1['promptReviewProcessingPolicy'];
  sentPromptOrigin: PromptEnhancementSentPromptOrigin;
  nexpathGeneratedPromptRef: string;
  renderedPromptBody: string;
  originalPromptSectionId: string | 'not_applicable_original_only';
  sourceAttribution: readonly PromptEnhancementSourceAttributionV1[];
  llmCallPolicy: PromptEnhancementLlmCallPolicy;
  rawComposerOutput: 'not_used_deterministic' | 'llm_output_pending_validation' | 'llm_output_validated_into_artifact' | 'rejected_or_unavailable';
  /**
   * When `rawComposerOutput` is `rejected_or_unavailable`, WHICH draft-validation rule refused the
   * reply. Six rules can reject, and reporting only "validation_failed" names the stage but not the
   * cause — the model's wording is discarded and nothing says why. Optional: absent when nothing was
   * rejected, and absent on older payloads.
   */
  draftRejectionReason?:
    | 'no_drafts_returned'
    | 'unknown_section'
    | 'original_section'
    | 'empty_or_disallowed_wording'
    | 'no_source_fact_ids'
    | 'source_fact_id_not_in_section'
    | 'claims_empty_or_unallowed';
  validatedCanonicalPromptArtifact: 'current_body_v1';
  composerMode: PromptEnhancementComposerMode;
  budgetState: {
    llmCallPolicy: PromptEnhancementLlmCallPolicy;
    callVisibilityMode: PromptEnhancementCallVisibilityMode;
    productValueDiscussionIsRuntimeLimiter: false;
  };
  languagePolicyApplied: PromptEnhancementLanguagePolicy;
  languageValidationStatus: PromptEnhancementLanguageValidationStatus;
  effectiveLanguageState: PromptEnhancementEffectiveLanguageState;
  languageSource: PromptEnhancementLanguageSource;
  languageConfidence: PromptEnhancementLanguageConfidence;
  languagePolicy: PromptEnhancementLanguagePolicy;
  instructionPrecedenceState: PromptEnhancementInstructionPrecedenceState;
  originalAsSourceStatus: PromptEnhancementOriginalAsSourceStatus;
  composerClaims: readonly string[];
  sourceFactIds: readonly string[];
  localRenderOriginalPrompt: true;
  composerVisiblePromptContext: {
    contextPolicy: 'structured_refs_only_no_raw_original';
    originalPromptVisibleLocallyOnly: true;
    boundedContextRefCount: number;
    rawPromptTextExcluded: true;
  };
  composerVisiblePromptContextRefs: readonly string[];
  composerInputPrivacyState: 'approved_refs_only' | 'violated';
  localOriginalPromptIncluded: boolean;
  strictSchemaFailureReasonCodes: readonly PromptEnhancementStrictSchemaFailureReasonCode[];
  fallbackReasonCodes: readonly PromptEnhancementRuntimeBlockReason[];
  inputContract: {
    originalPromptRef: PromptEnhancementSourceRefV1;
    bodyPlanId: string;
    sectionPlanIds: readonly string[];
    boundedSourceSummaryRefs: readonly string[];
    privacyApprovedFactsOnly: true;
    callVisibilityState: PromptEnhancementCostVisibilityMetadataV1;
    excludesRawStoreRows: true;
    excludesOldDecisionSessionOptionText: true;
    excludesUiInferredBusinessState: true;
  };
  outputContract: {
    structuredSectionsRequired: true;
    joinedCurrentBodyRequired: true;
    preservesSectionIds: true;
    preservesSourceRefs: true;
    preservesSafetyRequirements: true;
    textOnlyOutputAllowed: false;
  };
  deterministicFallback: {
    available: boolean;
    fallbackMode: PromptEnhancementFallbackMode;
    productValueDiscussionIsRuntimeLimiter: false;
  };
}

export interface PromptEnhancementSpanRefV1 {
  spanRefId: string;
  sectionId: string;
  startOffset: number;
  endOffset: number;
  sourceRefs: readonly string[];
  spanMappingStatus: 'exact' | 'approximate' | 'unknown_untrusted';
  textStoragePolicy: 'text_in_body_only' | 'do_not_store_raw_span' | 'bounded_local_with_reason';
}

export interface PromptEnhancementSourceAttributionV1 {
  sourceRefId: string;
  sourceId: string;
  sourceKind: PromptEnhancementSourceKind;
  evidenceStatus: PromptEnhancementEvidenceStatus;
  publicSafeLabel: string;
  privateIdPolicy: 'metadata_only_not_body';
}

/**
 * Why a ref could not be resolved. A ref that cannot resolve is REFUSED — kept with
 * its reason — rather than dropped, so a body that quotes nothing is distinguishable
 * from a body whose quotes could not be located.
 */
export type PromptEnhancementRefRefusalReason =
  | 'not_found_in_original'
  | 'ambiguous_multiple_matches'
  | 'below_minimum_length'
  | 'offsets_out_of_range'
  | 'offsets_do_not_match_quote'
  /**
   * The shared text is Nexpath's own, echoed back through a prompt that quotes a previous
   * enhanced body. A ref would say the section quotes the USER, which is false however
   * exactly the characters line up.
   */
  | 'self_ingested_generated_text';

/**
 * A ref from a composed section back to the characters of the user's own prompt.
 *
 * Offsets, not copies: an offset cannot drift from the text it indexes, while a copy
 * is a second thing that can disagree with the first. Offsets index `originalPromptText`
 * exactly, so `originalPromptText.slice(startOffset, endOffset)` IS the quoted text.
 *
 * `resolution: 'refused'` carries `startOffset === -1` and a reason. Callers must not
 * treat a refused ref as a quote.
 */
export interface PromptEnhancementOriginalTextRefV1 {
  refId: string;
  sectionId: string;
  /** Index into `originalPromptText`; -1 when refused. */
  startOffset: number;
  /** Exclusive end index into `originalPromptText`; -1 when refused. */
  endOffset: number;
  resolution: 'exact' | 'refused';
  refusalReason?: PromptEnhancementRefRefusalReason;
}

/** A ref from a composed section to a planned prompt point it carries. */
export interface PromptEnhancementPromptPointRefV1 {
  refId: string;
  sectionId: string;
  promptPointId: string;
  resolution: 'exact' | 'refused';
  refusalReason?: PromptEnhancementRefRefusalReason;
}

/**
 * What composition did to this section's text. Typed so a reader can tell a preserved
 * section from a rewritten one without re-reading the prose.
 *
 * Every value here is assigned somewhere. A code nothing can produce is a dead branch
 * that reads as coverage without being coverage, so none is declared "for completeness".
 *
 * `carried_from_previous_body` is APPENDED on the carry-forward path rather than
 * replacing the code that says how the text was originally made — a carried section is
 * both "model-composed" and "being served again", and substituting would lose the first.
 */
export type PromptEnhancementTransformReasonCodeV1 =
  | 'preserved_verbatim'
  | 'composed_by_model'
  | 'rendered_deterministically'
  | 'carried_from_previous_body'
  | 'quotes_original_text'
  | 'no_original_text_quoted';

export interface PromptEnhancementSectionV1 {
  sectionId: string;
  sectionKind: string;
  title: string;
  bodyText: string;
  templateType: string;
  familyId: string;
  primaryIntent: string;
  registryNamespace: 'prompt-enhancement-templates';
  sourceTemplateType: 'prompt_enhancement_template' | 'content_template_fact' | 'not_applicable';
  sourceKind: PromptEnhancementSourceKind;
  sourceIds: readonly string[];
  sourceFactIds: readonly string[];
  routeCandidateRefs: readonly string[];
  evidenceStatus: PromptEnhancementEvidenceStatus;
  sourceEvidenceStatus: PromptEnhancementEvidenceStatus;
  slotEvidenceStatus: PromptEnhancementEvidenceStatus;
  /**
   * The typed slot obligations the attached capabilities place on THIS
   * section — a slot is a typed content obligation plus its metadata and
   * state, not a heading. Populated from the capability slot-effect map at
   * planning; empty when no attached capability targets this section kind.
   * String-typed here (the obligation union lives in the planner layer).
   */
  slotObligations: readonly string[];
  /**
   * GR-1: the boundary-RESOLVED fact values this section states.
   *
   * The no-invention check asks whether a section names something NOBODY
   * supplied, and its allowed texts were the prompt plus source IDS. Once
   * GR-1 renders values, a legitimately resolved `PostgreSQL` or config path
   * looks fabricated — real grounding rejected as invention. A value the
   * boundary resolved WAS supplied; it just had no carrier until now.
   */
  groundedFactValues?: readonly string[];
  baselineSourceSignalSlot: string | 'not_applicable' | 'unknown';
  requirementSourceStatus: PromptEnhancementEvidenceStatus;
  requiredSurvivor: boolean;
  mandatoryFloor: boolean;
  depthState: 'required_survivor' | 'compact' | 'standard' | 'expanded' | 'conditional' | 'suppressed_with_reason' | 'handoff_only';
  axisContributions: readonly string[];
  canMergeInShorter: boolean;
  canExpandInMoreThorough: boolean;
  canGroundInMoreProjectGrounded: boolean;
  feedbackSensitivity: 'protected' | 'typed_feedback_allowed' | 'not_applicable';
  fallbackBehavior: PromptEnhancementFallbackMode;
  handoffFlags: readonly string[];
  privacyClass: 'public_safe' | 'local_private' | 'sensitive_ref_only' | 'do_not_render';
  publicCopySafe: boolean;
  authorityBoundary: 'no_authority_escalation';
  confirmationRequired: boolean;
  confirmationPresent: boolean;
  isEditable: boolean;
  removalFeedbackPolicy: 'typed_event_required' | 'not_applicable';
  fallbackReason?: PromptEnhancementRuntimeBlockReason;
  validationStatus: PromptEnhancementValidationStatus;
  safetyFlags: readonly string[];
  sensitivityFlags: readonly string[];
  spanRefs: readonly PromptEnhancementSpanRefV1[];
  originalTextRefs: readonly PromptEnhancementOriginalTextRefV1[];
  promptPointRefs: readonly PromptEnhancementPromptPointRefV1[];
  transformReasonCodes: readonly PromptEnhancementTransformReasonCodeV1[];
  publicExplanationCategory: PromptEnhancementPublicDiagnosticCategory;
  whyHelpReasonCodes: readonly string[];
  callVisibilityMode: PromptEnhancementCallVisibilityMode;
  contentTemplateRuntimeSeamUse: 'none' | 'approved_with_call_visibility' | 'not_applicable';
  handoffCapabilityFlags: readonly string[];
}

export interface PromptEnhancementCurrentBodyV1 {
  currentBodyId: string;
  bodyRevision: number;
  composerRunId: string;
  routeDecisionId: string;
  promptReviewOrigin: PromptEnhancementRouteDecisionV1['promptReviewOrigin'];
  promptReviewProcessingPolicy: PromptEnhancementRouteDecisionV1['promptReviewProcessingPolicy'];
  sentPromptOrigin: PromptEnhancementSentPromptOrigin;
  nexpathGeneratedPromptRef: string;
  renderedPromptBody: string;
  originalPromptSectionId: string | 'not_applicable_original_only';
  sourceAttribution: readonly PromptEnhancementSourceAttributionV1[];
  llmCallPolicy: PromptEnhancementLlmCallPolicy;
  composerMode: PromptEnhancementComposerMode;
  languagePolicyApplied: PromptEnhancementLanguagePolicy;
  languageValidationStatus: PromptEnhancementLanguageValidationStatus;
  effectiveLanguageState: PromptEnhancementEffectiveLanguageState;
  languageSource: PromptEnhancementLanguageSource;
  languageConfidence: PromptEnhancementLanguageConfidence;
  languagePolicy: PromptEnhancementLanguagePolicy;
  instructionPrecedenceState: PromptEnhancementInstructionPrecedenceState;
  originalAsSourceStatus: PromptEnhancementOriginalAsSourceStatus;
  composerClaims: readonly string[];
  sourceFactIds: readonly string[];
  localOriginalPromptIncluded: boolean;
  text: string;
  originalPromptText: string;
  originalPromptPreservation: 'visible_verbatim' | 'visible_summarized' | 'fallback_original_only';
  generatedOriginState: PromptEnhancementGeneratedOriginState;
  generatedSafeStatus: PromptEnhancementValidationStatus;
  userDirtyState: 'clean' | 'dirty_user_edited' | 'unknown';
  sections: readonly PromptEnhancementSectionV1[];
  /**
   * I2 criterion (c): the obligations that OUTLIVED their pruned section.
   *
   * 🔒 *"a dropped section takes its visible slots, but no-invention state, send-policy and
   * confirmation linkage stay on the body invisibly for the checks"* (§15.1 criterion (c)), and the
   * phase's done-when: *"safety metadata is present on the body even when its section dropped"*.
   *
   * 🔴 Added at the phase-36 verification pass. The pruner had computed this list since it was
   * built, and the facade had carried it on the planning object — where NOTHING read it. Obligations
   * are otherwise per-section (`safety-sendability.ts` iterates `currentBody.sections` and reads
   * each section's own `slotObligations`), so a pruned section took its obligations out of the body
   * with it, which is exactly what the criterion forbids.
   *
   * ⚠️ Optional so every existing caller and fixture stays valid; absent means nothing was pruned.
   */
  inheritedSlotObligations?: readonly string[];
}

export interface PromptEnhancementPublicTrustCueV1 {
  cueId: string;
  label: PromptEnhancementPublicTrustCueLabel;
  publicSafeText: string;
  sourceRefIds: readonly string[];
  rawPrivateDataExcluded: true;
}

export interface PromptEnhancementPublicDiagnosticV1 {
  diagnosticId: string;
  category: PromptEnhancementPublicDiagnosticCategory;
  publicSafeText: string;
  rawPromptExcluded: true;
  rawGeneratedBodyExcluded: true;
  rawSourceExcerptExcluded: true;
  rawFeedbackExcluded: true;
  privateIdsExcluded: true;
  researchLabelsExcluded: true;
  rawReasonValuesExcluded: true;
}

export interface PromptEnhancementSectionFeedbackViewV1 {
  sectionId: string;
  sectionKind: string;
  label: string;
  templateType: string;
  familyId: string;
  primaryIntent: string;
  sourceKinds: readonly PromptEnhancementSourceKind[];
  sourceIds: readonly string[];
  baselineSourceSignalSlot: string | 'not_applicable' | 'unknown';
  sourceEvidenceStatus: PromptEnhancementEvidenceStatus;
  slotEvidenceStatus: PromptEnhancementEvidenceStatus;
  requirementSourceStatus: PromptEnhancementEvidenceStatus;
  validationStatus: PromptEnhancementValidationStatus;
  safetyFlags: readonly string[];
  sensitivityFlags: readonly string[];
  publicSafeExplanationCategory: PromptEnhancementPublicDiagnosticCategory;
  fallbackMode: PromptEnhancementFallbackMode;
  callVisibilityMode: PromptEnhancementCallVisibilityMode;
  spanRefs: readonly PromptEnhancementSpanRefV1[];
  preciseFeedbackAllowed: boolean;
}

export interface PromptEnhancementSafetySummaryV1 {
  validationStatus: PromptEnhancementValidationStatus;
  sendPolicy: PromptEnhancementSendPolicy;
  sensitiveActionState:
    | 'none'
    | 'confirmation_required_present'
    | 'confirmation_required_missing'
    | 'original_user_owned_sensitive_action'
    | 'blocked_sensitive';
  sourceHonestyState: PromptEnhancementValidationStatus;
  privacyState: PromptEnhancementValidationStatus;
  authorityEscalationState: PromptEnhancementValidationStatus;
  noForegroundSafer: true;
  noAutomaticSend: true;
}

export interface PromptEnhancementValidationFailureV1 {
  failureCode: string;
  stage: PromptEnhancementValidationStage;
  severity: 'info' | 'warning' | 'blocking';
  blocking: boolean;
  affectedSectionIds: readonly string[];
  affectedBodySpanRefs: readonly string[];
  affectedSourceRefIds: readonly string[];
  affectedActionIds: readonly string[];
  publicSafeReasonCategory: PromptEnhancementPublicDiagnosticCategory;
  privateDebugDetailPolicy: 'none' | 'bounded_local_only';
}

export interface PromptEnhancementValidationPhaseStateV1 {
  stage: PromptEnhancementValidationStage;
  status: PromptEnhancementValidationStatus;
  fallbackMode: PromptEnhancementFallbackMode;
  failureCodes: readonly string[];
  publicSafeReasonCategory: PromptEnhancementPublicDiagnosticCategory;
}

export interface PromptEnhancementValidationGraphV1 {
  graphVersion: PromptEnhancementSchemaVersion;
  graphOwner: 'content_semantics';
  phaseStates: readonly PromptEnhancementValidationPhaseStateV1[];
  failures: readonly PromptEnhancementValidationFailureV1[];
  safetyState: PromptEnhancementSafetySummaryV1;
  providerRuntimeState: PromptEnhancementCallVisibilityMode;
  optionalCallAvailabilityState:
    | 'allowed'
    | 'unavailable_by_provider_api'
    | 'product_scope_not_in_v1'
    | 'deterministic_only'
    | 'visibility_required';
  rawTransportIsValidationProof: false;
  evaluatesAgentResponseQuality: false;
  canAutoAdvanceSequencePointer: false;
}

export interface PromptEnhancementActionEntryV1 {
  actionId: string;
  actionType: PromptEnhancementActionType;
  label:
    | 'Use this prompt'
    | 'Use original'
    | 'Shorter'
    | 'More thorough'
    | 'More project-grounded'
    | 'Apply details'
    | 'Feedback'
    | 'Close';
  currentBodyId: string;
  bodyRevision: number;
  availability: PromptEnhancementAvailabilityState;
  fallbackReason?: PromptEnhancementRuntimeBlockReason;
  callVisibilityMode: PromptEnhancementCallVisibilityMode;
}

export interface PromptEnhancementUiActionInputContractV1 {
  actionInputVersion: PromptEnhancementSchemaVersion;
  enhancementId: string;
  currentBodyId: string;
  bodyRevision: number;
  actionId: string;
  hostSurface: PromptEnhancementHostSurface;
  deliveryChannel: PromptEnhancementHostSurface;
  rendererState: 'shown' | 'not_shown' | 'timeout' | 'crash' | 'no_renderer';
  exposureAcknowledgementState: PromptEnhancementDeliveryMetadataV1['exposureAcknowledgementState'];
  timestampMs: number;
  realUserInitiated: boolean;
  editedBodyTextPolicy: 'required_when_body_may_be_dirty' | 'not_applicable';
  sectionSpanEditEventsPolicy: 'only_when_span_map_exact' | 'unknown_needs_classification';
  additionalDetailsPolicy: 'bounded_recomposition_input_only' | 'not_applicable';
}

/**
 * UI-9 / transform-rule-10 — deterministic header copy. Both are payload-supplied and
 * public-safe; the UI never invents them. Pinch is a short funny/light label
 * (§8.6, owner decision); why-help is present ONLY when a safety/risk/override
 * reason exists and names that source-backed reason.
 */
export interface PromptEnhancementPinchLabelV1 {
  text: string;
  derivedFrom: 'family' | 'overlay' | 'fallback';
}
export interface PromptEnhancementWhyHelpV1 {
  text: string;
  reasonKind: 'confirmation_needed' | 'risk_or_rollback' | 'sensitive_action';
}

export interface PromptEnhancementUiViewPayloadV1 {
  viewPayloadVersion: PromptEnhancementSchemaVersion;
  enhancementId: string;
  /** Deterministic header copy (UI-9). pinchLabel is optional; whyHelp only when a reason exists. */
  pinchLabel?: PromptEnhancementPinchLabelV1;
  whyHelp?: PromptEnhancementWhyHelpV1;
  body: {
    text: string;
    currentBodyId: string;
    bodyRevision: number;
    generatedOriginState: PromptEnhancementGeneratedOriginState;
    dirtyState: PromptEnhancementCurrentBodyV1['userDirtyState'];
    originalPromptPreservation: PromptEnhancementCurrentBodyV1['originalPromptPreservation'];
    levelState: PromptEnhancementPrepareRequestV1['userPreferenceContext']['levelState'];
    actionLoadingState: 'idle' | 'loading_action' | 'blocked';
    sendPolicy: PromptEnhancementSendPolicy;
    fallbackMode: PromptEnhancementFallbackMode;
  };
  sectionsForFeedback: readonly PromptEnhancementSectionFeedbackViewV1[];
  publicTrustCues: readonly PromptEnhancementPublicTrustCueV1[];
  actions: readonly PromptEnhancementActionEntryV1[];
  actionInputContract: PromptEnhancementUiActionInputContractV1;
  handoffAndSequenceSummary?: PromptEnhancementHandoffMetadataV1;
  diagnostics: readonly PromptEnhancementPublicDiagnosticV1[];
  hidesVisibleSectionControls: true;
  exposesPromptVariants: false;
  exposesForegroundSafer: false;
  textOnlyDeliveryIsAuthority: false;
}

export interface PromptEnhancementFeedbackEventV1 {
  feedbackEventId: string;
  stableEventIdentity: string;
  enhancementId: string;
  bodyId: string;
  bodyRevision: number;
  actionId?: string;
  deliveryAttemptId?: string;
  eventType:
    | 'exposure'
    | 'accept_send'
    | 'use_original'
    | 'close'
    | 'edit_before_send'
    | 'directional_action'
    | 'additional_details_apply'
    | 'explicit_feedback'
    | 'fallback_or_block';
  category?: string;
  optionalTextPolicy: 'discard' | 'local_bounded_only' | 'not_provided';
  learningEligibility: 'eligible_scoped' | 'not_eligible' | 'pending_policy';
  productFeedbackSeparated: true;
  canMutateSafetyOrAuthorityFloors: false;
}

export interface PromptEnhancementStorePortContractV1 {
  memoryFunctions: readonly [
    'queryRelevantPromptEnhancementMemory',
    'recordPromptEnhancementMemoryEvidence',
    'markPromptEnhancementMemoryUsed',
    'recordPromptEnhancementMemoryFeedback',
    'decayPromptEnhancementMemory',
    'prunePromptEnhancementMemory',
    'deletePromptEnhancementMemoryForProject',
    'deleteAllPromptEnhancementMemory',
    'getPromptEnhancementMemoryStats',
  ];
  feedbackSourceUseGeneratedOriginFunctions: readonly [
    'recordPromptEnhancementPreparedBody',
    'recordPromptEnhancementExposure',
    'recordPromptEnhancementAction',
    'recordPromptEnhancementSourceUse',
    'resolvePromptEnhancementGeneratedOrigin',
    'getPromptEnhancementFeedbackSummary',
    'getPromptEnhancementSourceUseSummary',
    'prunePromptEnhancementFeedbackAndSourceUse',
    'deletePromptEnhancementFeedbackForProject',
    'deletePromptEnhancementSourceUseForProject',
    'deleteAllPromptEnhancementFeedback',
    'deleteAllPromptEnhancementSourceUse',
  ];
  statusDebugFunctions: readonly [
    'getPromptEnhancementStoreStatus',
    'getPromptEnhancementDebugSummary',
    'getPromptEnhancementSchemaVersionState',
  ];
  fallbackStates: readonly [
    'absent_tables_no_data',
    'newer_schema_no_trust',
    'corrupt_rows_ignored',
    'disabled_by_policy',
  ];
  requiresSaveStoreAfterMutations: true;
  supportsMemoryAndDiskStores: true;
  uiMayIssueDirectSql: false;
  oldStoreSurfacesAreNotPeMemory: readonly [
    'content_templates',
    'feedback_signals',
    'user_depth_level',
    'pending_advisories',
    'skipped_sessions',
    'prompts',
    'config',
    'param-events.jsonl',
    'lastInjectedPrompt',
  ];
}

export const PROMPT_ENHANCEMENT_STORE_PORT_CONTRACT_V1 = {
  memoryFunctions: [
    'queryRelevantPromptEnhancementMemory',
    'recordPromptEnhancementMemoryEvidence',
    'markPromptEnhancementMemoryUsed',
    'recordPromptEnhancementMemoryFeedback',
    'decayPromptEnhancementMemory',
    'prunePromptEnhancementMemory',
    'deletePromptEnhancementMemoryForProject',
    'deleteAllPromptEnhancementMemory',
    'getPromptEnhancementMemoryStats',
  ],
  feedbackSourceUseGeneratedOriginFunctions: [
    'recordPromptEnhancementPreparedBody',
    'recordPromptEnhancementExposure',
    'recordPromptEnhancementAction',
    'recordPromptEnhancementSourceUse',
    'resolvePromptEnhancementGeneratedOrigin',
    'getPromptEnhancementFeedbackSummary',
    'getPromptEnhancementSourceUseSummary',
    'prunePromptEnhancementFeedbackAndSourceUse',
    'deletePromptEnhancementFeedbackForProject',
    'deletePromptEnhancementSourceUseForProject',
    'deleteAllPromptEnhancementFeedback',
    'deleteAllPromptEnhancementSourceUse',
  ],
  statusDebugFunctions: [
    'getPromptEnhancementStoreStatus',
    'getPromptEnhancementDebugSummary',
    'getPromptEnhancementSchemaVersionState',
  ],
  fallbackStates: [
    'absent_tables_no_data',
    'newer_schema_no_trust',
    'corrupt_rows_ignored',
    'disabled_by_policy',
  ],
  requiresSaveStoreAfterMutations: true,
  supportsMemoryAndDiskStores: true,
  uiMayIssueDirectSql: false,
  oldStoreSurfacesAreNotPeMemory: [
    'content_templates',
    'feedback_signals',
    'user_depth_level',
    'pending_advisories',
    'skipped_sessions',
    'prompts',
    'config',
    'param-events.jsonl',
    'lastInjectedPrompt',
  ],
} as const satisfies PromptEnhancementStorePortContractV1;

export interface PromptEnhancementGeneratedOriginMetadataV1 {
  generatedOriginId: string;
  generatedOriginState: PromptEnhancementGeneratedOriginState;
  enhancementId: string;
  bodyId: string;
  bodyRevision: number;
  actionId?: string;
  deliveryAttemptId?: string;
  deliveryChannel: PromptEnhancementHostSurface;
  sourceUseIds: readonly string[];
  echoRecursionGuard: {
    bodyFingerprintRef?: string;
    sourcePromptEchoState: 'not_echo' | 'pe_generated_echo' | 'unknown';
    lastInjectedPromptIsAuthority: false;
  };
  learningEligibility: {
    promptHistory: false;
    profile: false;
    stage: false;
    language: false;
    memory: false;
    telemetry: false;
    sourceUseTracking: boolean;
  };
}

export interface PromptEnhancementDeliveryMetadataV1 {
  deliveryChannel: PromptEnhancementHostSurface;
  sendPolicy: PromptEnhancementSendPolicy;
  stopReasonCarriesTextOnly: boolean;
  rawTransportIsSemanticAuthority: false;
  hostCapabilityState: 'stop_bridge_only' | 'unsupported' | 'future_hold_proven';
  extensionPayloadState: 'not_applicable' | 'typed_payload_required' | 'fallback_without_authority';
  hostCapabilityEvidenceRefs: readonly string[];
  exposureAcknowledgementState: 'not_shown' | 'shown' | 'sent' | 'fallback';
}

export interface PromptEnhancementHandoffPointInventoryV1 {
  pointRefId: string;
  sourcePointRef: string;
  order: number;
  explicitness: 'explicit_user_request' | 'inferred_from_source_signal' | 'unknown_fallback';
  dependencyPointRefs: readonly string[];
  riskConfirmationRequired: boolean;
  sourceSupportState: PromptEnhancementEvidenceStatus;
  currentBodyCoverageState: 'covered_in_current_body' | 'not_covered' | 'not_applicable';
  privacyClass: 'public_safe' | 'local_private_ref_only' | 'sensitive_ref_only';
  reasonCodes: readonly string[];
}

export interface PromptEnhancementHandoffDecompositionGroupV1 {
  decompositionGroupId: string;
  pointRefs: readonly string[];
  bodySectionRefs: readonly string[];
  groupingReason: 'source_backed_task_cluster' | 'single_current_body_group' | 'not_applicable';
  splitRequirementState: 'not_required_v1' | 'candidate_metadata_only' | 'blocked_pending_runtime';
  sourceRefs: readonly string[];
  riskConfirmationRefs: readonly string[];
  publicSafeSummaryVisible: boolean;
  invalidLineageBehavior: 'suppress_handoff' | 'current_body_only_fallback';
}

export interface PromptEnhancementHandoffTaskSliceV1 {
  taskSliceId: string;
  sourcePointRefs: readonly string[];
  decompositionGroupId: string | 'not_applicable';
  bodySectionRefs: readonly string[];
  dependencySliceRefs: readonly string[];
  sequenceRole: 'current_body_only' | 'future_candidate_metadata_only' | 'not_sequence';
  futurePromptCandidateState: 'not_generated' | 'candidate_metadata_only' | 'blocked_pending_runtime';
  editInvalidationState: 'valid_until_body_revision_changes' | 'invalid_due_user_edit_or_safety_removal';
  handoffEligibilityState: 'eligible_metadata_only' | 'not_eligible' | 'blocked_pending_runtime';
  reasonCodes: readonly string[];
}

export interface PromptEnhancementHandoffScopeV1 {
  requestId: string;
  projectRoot: string;
  projectScopeState: 'current_project_only';
  sourceScopeRefs: readonly string[];
  crossProjectApplicationPolicy: 'reject';
  staleResponsePolicy: 'ignore_no_overwrite';
}

export interface PromptEnhancementHandoffApplicabilityV1 {
  applicabilityDecisionId: string;
  taskSliceRefs: readonly string[];
  decompositionGroupRefs: readonly string[];
  sourcePointRefs: readonly string[];
  state: PromptEnhancementHandoffMetadataV1['applicabilityState'];
  intentFamily: string | 'unknown';
  intentCategory: string | 'unknown';
  levelDepthState: 'default' | 'shorter' | 'more_thorough' | 'more_project_grounded' | 'unknown';
  riskSafetyState: PromptEnhancementSafetySummaryV1['validationStatus'];
  dependencyOrderState: 'no_dependencies' | 'source_backed_dependencies' | 'pending_policy';
  currentBodyCoverageState: 'covered_in_current_body' | 'current_body_plus_metadata' | 'not_covered';
  promptSizeApiAvailabilityState: 'not_measured_v1_metadata_only' | 'available' | 'provider_unavailable' | 'over_cap';
  hostCapabilityState: PromptEnhancementDeliveryMetadataV1['hostCapabilityState'];
  explicitUserRuntimeState: 'not_started_v1' | 'not_applicable';
  granularityActionabilityState: 'metadata_only_candidate' | 'manual_planning_only' | 'blocked_or_unknown';
  splitMergeDisposition: 'single_current_body' | 'metadata_only_split_candidate' | 'merge_or_suppress';
  granularityFailureDisposition: 'current_or_original_fallback_no_runtime';
  sourcePriorityRefs: readonly string[];
  sourcePriorityState: 'source_backed_metadata_only' | 'no_priority_claim_v1';
  targetScopeRefs: readonly string[];
  targetSurfaceState: 'source_backed' | 'unknown_no_runtime';
  workspaceBindingState: 'current_workspace_only' | 'unknown_no_runtime';
  scopeBindingDisposition: 'bound_to_current_project' | 'unknown_no_runtime';
  expectedDeliverableState: 'current_body_guidance_only' | 'metadata_only_candidate';
  deliverableContractRefs: readonly string[];
  outputFormatPolicy: 'current_body_guidance_only' | 'metadata_only_no_runtime';
  completionEvidenceRequirementState: 'not_runtime_proof_v1';
  acceptanceCriteriaRefs: readonly string[];
  successConditionState: 'not_runtime_evaluated_v1';
  definitionOfDoneState: 'not_runtime_evaluated_v1';
  acceptanceVerificationPolicy: 'user_owned_not_runtime_v1';
  acceptanceFailureDisposition: 'current_or_original_fallback_no_runtime';
  atomicGroupId: string | 'none';
  atomicGroupRefs: readonly string[];
  coDeliveryRequirementState: 'none' | 'metadata_only_no_runtime';
  partialCompletionPolicy: 'no_runtime_partial_completion_v1';
  rollbackCouplingState: 'not_runtime_v1';
  atomicGroupFailureDisposition: 'current_or_original_fallback_no_runtime';
  sourceConflictState: 'none' | 'unresolved_no_runtime';
  conflictingSourcePointRefs: readonly string[];
  conflictResolutionPolicy: 'current_body_or_no_runtime';
  unresolvedConflictDisposition: 'current_or_original_fallback_no_runtime';
  conflictVisibilityPolicy: 'public_safe_reason_codes_only';
  userNoSequenceConstraintState: 'none' | 'present_suppresses_runtime';
  onePromptOnlyConstraintState: 'none' | 'present_suppresses_runtime';
  sequenceSuppressionSourceState: 'none' | 'source_a_suppresses_runtime';
  noSplitOverrideDisposition: 'not_allowed_v1';
  partialItemConsentState: 'deferred_out_of_v1';
  clarificationApplicabilityState: 'not_required' | 'required_no_runtime';
  userInputRequirementState: 'not_required' | 'required_no_runtime';
  missingInformationRefs: readonly string[];
  clarificationQuestionKindState: 'none' | 'metadata_only_no_runtime';
  answerDependencyState: 'none' | 'pending_user_answer_no_runtime';
  agentPermissionModeSnapshot: string | 'unknown';
  itemExecutionCapabilityRequirementState: 'not_evaluated_v1_metadata_only' | 'source_backed';
  toolAccessRequirementRefs: readonly string[];
  capabilityMismatchDisposition: 'current_or_original_fallback_no_runtime';
  manualExecutionRequiredState: 'not_evaluated_v1_metadata_only' | 'manual_required_no_runtime';
  conditionalInstructionState: 'represented_in_current_body' | 'not_applicable';
  itemOrderingMode: 'no_runtime_order' | 'source_backed_metadata_order_only';
  independentItemState: 'not_parallelized_v1' | 'metadata_only_independent';
  unorderedGroupId: string | 'none';
  serializationDisposition: 'metadata_only_no_runtime_order';
  userOrderPreferenceState: 'not_specified' | 'source_backed_metadata_only';
  parallelExecutionPolicy: 'not_supported_v1';
  confidence: 'high' | 'medium' | 'low' | 'none';
  receiverCanActivateRuntime: false;
  reasonCodes: readonly string[];
}

export interface PromptEnhancementHandoffConfirmationTargetV1 {
  confirmationTargetId: string;
  mode: 'none' | 'double_check' | 'affirmative_answer_required' | 'body_visible_confirmation';
  targetRefs: readonly string[];
  riskRefs: readonly string[];
  bodyVisibilityState: 'visible_in_current_body' | 'not_required' | 'missing_invalid';
  satisfiedByMetadata: false;
}

export interface PromptEnhancementHandoffSourceImpactMetadataV1 {
  sourceImpactMetadataId: string;
  contentTemplateSourceRefs: readonly string[];
  contentTemplateVariantIdentityRefs: readonly string[];
  servedVariantEventRefs: readonly string[];
  recordSignalTypes: readonly string[];
  recordSourceTiers: readonly string[];
  recordSchemaVersions: readonly string[];
  recordQuestionRefs: readonly string[];
  recordPinchFallbackRefs: readonly string[];
  recordRegisterSnapshotRefs: readonly string[];
  recordRoleSnapshotRefs: readonly string[];
  recordMaturityLevelSnapshotRefs: readonly string[];
  recordSnapshotRefs: readonly string[];
  recordComposePathRefs: readonly string[];
  recordSafeguardStateRefs: readonly string[];
  sourceCascadeOutcomeRefs: readonly string[];
  whyDescDeliveryDisposition: 'not_source_truth_not_future_prompt_text';
  feedbackPreemptionDisposition: 'not_pe_exposure_or_handoff_acceptance';
  transportEvidenceDisposition: 'delivery_attempt_only_not_semantic_authority';
  stageClassifierDegradedDisposition: 'cannot_create_handoff_candidate';
  generatedOriginPolicyState: 'typed_origin_lineage_required';
}

export interface PromptEnhancementCompactFirstPopupSequenceSummaryV1 {
  summaryId: string;
  currentBodyId: string;
  bodyRevision: number;
  publicSafeText: string;
  remainingTaskCount: number;
  taskRoleLabels: readonly string[];
  /**
   * One short display line per follow-up task, cut from the REDACTED original prompt at each item's
   * own slice (the user's own words, not a generated body). Empty on the describe fallback / when no
   * items are available. Body-bound and redaction-safe, so the flags below stay honest.
   */
  taskSummaryLines: readonly string[];
  sourceRefs: readonly string[];
  containsFuturePromptText: false;
  rawPromptTextExcluded: true;
  rawGeneratedBodyExcluded: true;
  bodyBoundMetadataOnly: true;
}

export interface PromptEnhancementHandoffRuntimeGuardsV1 {
  createsRuntimeQueue: false;
  permitsContinuation: false;
  activeRuntimeState: 'not_created_v1';
  autoSendPolicy: 'prohibited';
  futurePromptBodiesRuntimePolicy: 'not_generated_not_stored_not_rendered';
  pointerAdvancementPolicy: 'prohibited';
  completionProofPolicy: 'not_claimed';
  responseWatcherPolicy: 'not_created_v1';
  durableResumePolicy: 'not_created_v1';
}

export interface PromptEnhancementHandoffPrivacyStoragePolicyV1 {
  rawPromptBodiesExcluded: true;
  rawGeneratedBodiesExcluded: true;
  rawSourceExcerptsExcluded: true;
  rawFeedbackExcluded: true;
  futurePromptBodiesStored: false;
  oldDecisionSessionStoresAreAuthority: false;
  productFeedbackIsPeHandoffSignal: false;
  telemetryPolicy: 'ids_counts_status_only';
}

export interface PromptEnhancementHandoffMetadataV1 {
  handoffMetadataVersion: PromptEnhancementSchemaVersion;
  handoffDecisionId: string;
  currentBodyId: string;
  bodyRevision: number;
  handoffKind:
    | 'none'
    | 'metadata_only'
    | 'decomposition_guidance_only'
    | 'compact_sequence_summary_candidate'
    | 'first_prompt_handoff_candidate'
    | 'blocked_or_deferred_sequence';
  sequenceActivationPolicy: 'blocked_pending_sequence_runtime_and_cost_gates';
  futurePromptTextPolicy: 'not_generated_not_stored_not_rendered';
  suggestedNextPromptPolicy: 'not_applicable' | 'not_generated' | 'metadata_refs_only';
  suggestedNextPromptRefs: readonly [];
  currentBodyValidityState:
    | 'valid_for_current_body_revision'
    | 'invalid_due_body_revision'
    | 'invalid_due_validation_decision'
    | 'invalid_due_source_refs'
    | 'invalid_due_user_edit_or_safety_removal';
  itemLineageRefs: readonly string[];
  sourceLineageRefs: readonly string[];
  scope: PromptEnhancementHandoffScopeV1;
  applicabilityState: 'not_applicable' | 'metadata_only_candidate' | 'blocked_pending_runtime';
  riskConfirmationState: PromptEnhancementSafetySummaryV1['sensitiveActionState'];
  fallbackMode: PromptEnhancementFallbackMode;
  receiverValidationRequirements: readonly PromptEnhancementValidationStage[];
  activationState: 'no_activation_v1' | 'blocked_pending_gates';
  userHandoffConsentState: 'not_accepted' | 'explicitly_accepted_approved_runtime' | 'not_applicable';
  compactFirstPopupSequenceSummary?: PromptEnhancementCompactFirstPopupSequenceSummaryV1;
  pointInventory: readonly PromptEnhancementHandoffPointInventoryV1[];
  decompositionGroups: readonly PromptEnhancementHandoffDecompositionGroupV1[];
  taskSlices: readonly PromptEnhancementHandoffTaskSliceV1[];
  applicability: PromptEnhancementHandoffApplicabilityV1;
  confirmationTargets: readonly PromptEnhancementHandoffConfirmationTargetV1[];
  sourceImpact: PromptEnhancementHandoffSourceImpactMetadataV1;
  runtimeGuards: PromptEnhancementHandoffRuntimeGuardsV1;
  privacyStoragePolicy: PromptEnhancementHandoffPrivacyStoragePolicyV1;
  ownerBoundary: {
    semanticOwner: 'content_semantics';
    uiConsumer: 'ui_app';
    hostOwner: 'host_transport';
    runtimeOwnerState: 'future_future_sequence_only_after_gates';
  };
  reasonCodes: readonly string[];
}

export type PromptEnhancementFutureSequenceRuntimeOperationV1 =
  | 'create_sequence_state'
  | 'accept_handoff_start_order'
  | 'continue_current_item'
  | 'custom_prompt_path'
  | 'cancel_active_sequence'
  | 'abandon_active_sequence'
  | 'resume_active_sequence'
  | 'response_finished_stop_completion'
  | 'runtime_acceptance';

export type PromptEnhancementFutureSequenceRuntimeMissingGateCodeV1 =
  | 'lifecycle_policy_pending'
  | 'engine_receiver_contract_pending'
  | 'future_sequence_runtime_source_pending'
  | 'cost_numeric_acceptance_pending'
  | 'cross_layer_snapshot_pending'
  | 'signed_owner_by_deliverable_register_pending'
  | 'pending_named_owner_register_rows_pending'
  | 'host_hold_commit_contract_pending'
  | 'provider_api_availability_pending'
  | 'privacy_storage_policy_pending'
  | 'focused_runtime_fixtures_pending'
  | 'current_v1_runtime_implementation_no_go';

export interface PromptEnhancementFutureSequenceRuntimeGateEvidenceV1 {
  lifecyclePolicyApproved?: boolean;
  engineReceiverContractApproved?: boolean;
  futureSequenceRuntimeSourceAvailable?: boolean;
  costNumericAcceptanceApproved?: boolean;
  crossLayerOwnerSnapshotApproved?: boolean;
  signedOwnerByDeliverableRegisterApproved?: boolean;
  pendingNamedOwnerRegisterRowsClosed?: boolean;
  hostHoldCommitContractProven?: boolean;
  providerApiAvailabilityProven?: boolean;
  privacyStoragePolicyApproved?: boolean;
  focusedRuntimeFixturesPassed?: boolean;
}

export interface PromptEnhancementFutureSequenceRuntimeEventV1 {
  eventId?: string;
  requestId?: string;
  sequenceId?: string;
  sequenceItemId?: string;
  projectScope?: string;
  bodyRevision?: number;
  createdAtMs?: number;
  idempotencyKey?: string;
  currentItemRevision?: number;
  sequenceRuntimeStateId?: string;
  continuationDispositionId?: string;
  currentItemIndex?: number;
  contractVersion?: PromptEnhancementSchemaVersion | number;
  explicitUserActionState?: 'absent' | 'present_future_only';
  continuationActionState?:
    | 'continue_current_item'
    | 'custom_prompt_path'
    | 'cancel_active_sequence'
    | 'abandon_pending_owner_policy'
    | 'resume_pending_owner_policy'
    | 'invalid_noop';
  terminalTransitionState?:
    | 'none'
    | 'cancelled_terminal'
    | 'abandoned_terminal'
    | 'completed_terminal'
    | 'terminal_replay_noop'
    | 'terminal_reopen_rejected';
  hostCapabilityState?: PromptEnhancementDeliveryMetadataV1['hostCapabilityState'];
  stopEventState?: 'not_applicable' | 'stop_fired_non_proof' | 'response_finished_candidate_unproven';
  stateFreshness?: 'current' | 'stale' | 'duplicate' | 'unknown' | 'corrupt' | 'terminal';
}

export interface PromptEnhancementLegacySequenceAuthoritySignalRefsV1 {
  pendingAdvisoryId?: string;
  skippedSessionId?: string;
  decisionSessionId?: string;
  promptHistoryId?: string;
  promptCount?: number;
  sessionId?: string;
  stopReason?: string;
  shownState?: string;
  selectedPromptRef?: string;
  lastInjectedPromptRef?: string;
  productFeedbackEventId?: string;
  telemetryEventLabel?: string;
  configRowKey?: string;
  uiLabel?: string;
  transportPayloadRef?: string;
}

export interface PromptEnhancementFutureSequenceRuntimeGateInputV1 {
  schemaVersion: PromptEnhancementSchemaVersion;
  operation: PromptEnhancementFutureSequenceRuntimeOperationV1;
  requestId: string;
  projectRoot: string;
  handoffMetadata?: PromptEnhancementHandoffMetadataV1;
  evidence?: PromptEnhancementFutureSequenceRuntimeGateEvidenceV1;
  event?: PromptEnhancementFutureSequenceRuntimeEventV1;
  legacyAuthoritySignals?: PromptEnhancementLegacySequenceAuthoritySignalRefsV1;
  configSnapshot?: {
    observedConfigKey?: 'prompt_enhancement.sequence.enabled' | string;
    sequenceEnabled?: 'on' | 'off' | 'missing' | 'invalid';
    arbitraryConfigRowsAreAuthority: false;
    userFacingItemCountConfigPresent?: boolean;
    oldDecisionSessionConfigPresent?: boolean;
  };
  rawContentPresence?: {
    rawPromptBody?: boolean;
    rawEnhancedBody?: boolean;
    rawFuturePromptBody?: boolean;
    rawSourceSnippet?: boolean;
    rawFeedback?: boolean;
    rawAssistantResponse?: boolean;
  };
}

export interface PromptEnhancementFutureSequenceRuntimeGateResultV1 {
  schemaVersion: PromptEnhancementSchemaVersion;
  operation: PromptEnhancementFutureSequenceRuntimeOperationV1;
  // D3 (2026-08-08): the gate can now return `allowed: true` when ALL evidence is present. This type
  // is MPS-only (consumed by the Stop-hook launcher + tests; the PE facade never uses it), so
  // widening these decision fields does not touch PE/PEF. In production the gate still returns
  // `allowed: false` because no caller supplies full evidence yet (that wiring is a later phase).
  allowed: boolean;
  status: 'blocked_future_sequence_runtime_v1' | 'allowed_future_sequence_runtime_v1';
  fallbackMode: 'current_or_original_fallback_no_runtime';
  sequenceIdentityState: 'not_created_v1';
  acceptedStartOrderState: 'not_created_v1';
  continuationState: 'not_created_v1';
  customPromptPathState: 'not_created_v1';
  cancelAbandonResumeState: 'not_created_v1';
  stopCompletionState: 'not_proof_v1';
  runtimeAcceptanceState: 'no_go_v1' | 'go_v1';
  queueState: 'not_created_v1';
  autoSendState: 'prohibited_v1';
  pointerAdvancementState: 'prohibited_v1';
  terminalReopenState: 'rejected_v1';
  futurePromptBodyState: 'not_generated_not_stored_not_rendered';
  persistencePolicyState: 'ids_counts_status_only_no_raw_content';
  configState: 'validated_on_no_runtime' | 'validated_off_no_runtime' | 'invalid_no_runtime';
  handoffRuntimeAuthorityState:
    | 'metadata_only_no_runtime'
    | 'missing_typed_handoff_no_runtime'
    | 'unsafe_handoff_rejected_no_runtime';
  legacyAuthoritySignalsRejected: true;
  stopOrResponseEventAuthorityState: 'non_proof_no_runtime';
  missingGateCodes: readonly PromptEnhancementFutureSequenceRuntimeMissingGateCodeV1[];
  reasonCodes: readonly string[];
}

export interface PromptEnhancementCostVisibilityMetadataV1 {
  /**
   * A6 (prohibition 10 · L4979): the runtime seams the rendered facts came through and the
   * relative payload weight they carried — the call-visibility VISIBLE half of *"every runtime path
   * typed + call-visibility visible"*. ⛔ Typed path names and counts only, never fact content, and
   * read by nothing in the pipeline (prohibition 9: cost never gates behaviour).
   */
  runtimeSeamSummary?: {
    readonly runtimePaths: readonly string[];
    readonly unknownRuntimePathCount: number;
    readonly totalPayloadWeight: number;
  };
  callId?: PromptEnhancementCostCallIdV1;
  callOwner: PromptEnhancementOwnerArea;
  callVisibilityMode: PromptEnhancementCallVisibilityMode;
  callTrigger: 'prepare' | 'directional_action' | 'additional_details' | 'safety_review' | 'none';
  optionalCallAvailabilityState:
    | 'allowed'
    | 'unavailable_by_provider_api'
    | 'product_scope_not_in_v1'
    | 'deterministic_only'
    | 'visibility_required';
  provider?: string;
  model?: string;
  pricingSourceUrl?: string;
  pricingAccessDate?: string;
  processingModeAssumption?: string;
  contextTierAssumption?: string;
  addOnCostAssumption?: string;
  regionalDataResidencyAssumption?: string;
  inputTokenCap?: number;
  outputTokenCap?: number;
  estimatedInputTokens?: number;
  estimatedOutputTokens?: number;
  plannedCallCount: number;
  usedCallCount: number;
  providerAvailabilityState: 'available' | 'unavailable_by_provider_api' | 'not_applicable';
  timeoutMs?: number;
  retryCount?: number;
  latencyTargetMs?: number;
  cacheAssumption?: 'no_cache_savings_no_addons' | 'not_applicable';
  latencyImpact?: 'wait_for_full_result_under_timeout' | 'not_applicable';
  uiProviderApiLatencyStateLabel?:
    | 'available_wait_for_full_result'
    | 'provider_api_unavailable_no_generated_content'
    | 'timeout_no_generated_content'
    | 'product_scope_not_in_v1'
    | 'deterministic_only';
  telemetrySafeMeasurementFields?: readonly PromptEnhancementCostMeasurementFieldV1[];
  providerFailureState?: PromptEnhancementProviderFailureStateV1;
  fallbackReason?: PromptEnhancementRuntimeBlockReason;
  priorCallAccountingRefs: readonly string[];
  localLoggingHookState: 'counts_only' | 'not_applicable';
  productValueSignoffRef?: 'accepted_with_product_scope_notes';
  productValueDiscussionIsRuntimeLimiter: false;
  costVisibilityCanWeakenBehavior?: false;
}

export type PromptEnhancementCostCallIdV1 =
  | 'baseline_pe_composer'
  | 'llm_route_decision_call'
  | 'source_signal_guidance_in_baseline'
  | 'action_shorter'
  | 'action_more_thorough'
  | 'action_more_project_grounded'
  | 'additional_details_recomposition'
  | 'feedback_reason_rewrite'
  | 'custom_feedback_classification'
  | 'later_popup_feedback_decision'
  | 'optional_safety_review'
  | 'sequence_planning'
  | 'sequence_summary_wording'
  | 'sequence_item_wording'
  | 'future_regenerate_flow'
  | 'future_modification_instruction_flow';

export type PromptEnhancementCostMeasurementFieldV1 =
  | 'call_id'
  | 'owner'
  | 'trigger'
  | 'provider'
  | 'model'
  | 'planned_call_count'
  | 'used_call_count'
  | 'input_token_estimate'
  | 'output_token_estimate'
  | 'timeout_ms'
  | 'retry_count'
  | 'latency_ms'
  | 'status'
  | 'fallback_reason'
  | 'provider_availability_state'
  | 'product_scope_state';

export type PromptEnhancementProviderFailureStateV1 =
  | 'none'
  | 'missing_api_key'
  | 'provider_api_unavailable'
  | 'provider_refused'
  | 'timeout'
  | 'quota_or_billing_refused'
  | 'rate_limited';

export interface PromptEnhancementOwnershipMetadataV1 {
  owners: readonly PromptEnhancementOwnerArea[];
  sourceSnapshotVersion: PromptEnhancementSchemaVersion;
  fixtureIds: readonly string[];
  launchBoundaryRecheckRef: 'launch_boundary_recheck_pending';
  excludesPrivatePlanningLeakage: true;
}

export interface PromptEnhancementPrepareRequestV1 {
  schemaVersion: PromptEnhancementSchemaVersion;
  requestId: string;
  projectRoot: string;
  hostSurface: PromptEnhancementHostSurface;
  /**
   * When the hook carrying this request has to be finished, as epoch milliseconds.
   *
   * Passed through to the composer, which declines to START a call that cannot complete before it.
   * The value belongs to the caller because the caller is what knows which hook it is running on —
   * the budget differs per surface, and there is deliberately no constant for it here.
   *
   * Absent means no ceiling, which is the behaviour without it. A caller that omits it is
   * unaffected; a caller that supplies it gets a typed refusal between attempts instead of being
   * killed mid-loop with no disposition, no popup, and nothing left to answer with.
   */
  deadlineAtMs?: number;
  sourcePrompt: {
    text: string;
    origin: 'user' | 'pe_generated_echo' | 'unknown';
    capturedAt?: number;
    promptIndex?: number;
    generatedOriginPolicy: 'ordinary_source_a' | 'exclude_from_ordinary_learning';
  };
  reviewMomentContext: {
    reviewMoment: PromptEnhancementReviewMoment;
    currentAgentMode?: string;
    projectId?: string;
    sessionId?: string;
    detectedLanguage?: string;
    stageCandidate?: Stage;
    promptCount?: number;
    recentPromptMetadataRefs: readonly string[];
    currentBodyActionContext?: {
      currentBodyId: string;
      bodyRevision: number;
      actionId?: string;
    };
    triggerProvenance: PromptEnhancementTriggerProvenanceV1;
  };
  sourceSignals: PromptEnhancementSourceInputSnapshotV1;
  userPreferenceContext: {
    levelState: 'default' | 'shorter' | 'more_thorough' | 'more_project_grounded';
    actionRequest?: Exclude<PromptEnhancementActionType, 'use_current_body' | 'use_original' | 'feedback' | 'close'>;
    additionalDetails?: { text: string; targetBodyId: string; targetBodyRevision: number };
    scopedFeedbackEvidenceRefs: readonly string[];
  };
  configSnapshot: {
    sequenceEnabledState: 'not_enabled_v1' | 'blocked_pending_gates';
    validatedEffectiveConfigState: 'valid' | 'missing' | 'invalid';
    arbitraryConfigRowsAreAuthority: false;
  };
  callVisibilityState: PromptEnhancementCostVisibilityMetadataV1;
  privacyAndStoragePolicy: {
    sensitivityClass: 'normal' | 'sensitive' | 'high_risk';
    localStorageEligibility: 'ids_and_categories_only' | 'local_bounded_text_allowed' | 'not_allowed';
    telemetryEligibility: 'allowlisted_counts_only' | 'not_allowed';
    llmSharingEligibility: 'allowed_minimal' | 'not_allowed';
    generatedBodyStoragePolicy: 'do_not_store_raw_by_default' | 'store_local_bounded_with_reason';
  };
}

export interface PromptEnhancementActionRequestV1
  extends Omit<PromptEnhancementPrepareRequestV1, 'sourcePrompt'> {
  action: PromptEnhancementActionEntryV1;
  /**
   * F1b (send-block fix 2026-08-07): the route decision the popup's result was PREPARED with
   * (from result.routeDecision). An action re-prepare re-runs the deterministic router, which
   * soft-skips prompts that originally routed only via the prepare-only E6 LLM rescue; carrying
   * the prepared route lets the action re-route EXACTLY as its popup did — deterministic, no
   * LLM call in-popup. Optional: callers without it keep the previous routing behaviour.
   */
  routeCarryover?: { familyId: string; primaryIntent: string };
  currentBodyBinding: {
    currentBodyId: string;
    bodyRevision: number;
    validationDecisionId: string;
    editedBodyText: string;
    actionSubmittedAtMs: number;
    realUserInitiated: boolean;
    sectionSpanEditEvents: readonly {
      sectionId: string;
      spanRefId?: string;
      editType: 'changed' | 'removed' | 'unknown';
      mappingStatus: PromptEnhancementSpanRefV1['spanMappingStatus'] | 'unknown_needs_classification';
    }[];
  };
  sourcePrompt: PromptEnhancementPrepareRequestV1['sourcePrompt'];
}

export interface PromptEnhancementPrepareResultV1 {
  schemaVersion: PromptEnhancementSchemaVersion;
  enhancementId: string;
  requestId: string;
  projectRoot: string;
  modelVersion: string;
  disposition: PromptEnhancementDisposition;
  // content-owner-owned safety decision identity for this exact body revision.
  validationDecisionId: string;
  currentBody: PromptEnhancementCurrentBodyV1;
  availableActions: readonly PromptEnhancementActionEntryV1[];
  handoffMetadata?: PromptEnhancementHandoffMetadataV1;
  sourceGuidanceCoverage: 'covered' | 'fallback_no_generated_body' | 'not_applicable';
  routingAndFeedbackDecision: {
    state: 'show' | 'suppress' | 'clarify' | 'fallback';
    confidence: 'high' | 'medium' | 'low' | 'none';
    reasonCodes: readonly string[];
    scopedPromptKindKey?: string;
    priorFeedbackEvidenceRefs: readonly string[];
    resetExpiryState: 'not_applicable' | 'active' | 'expired' | 'reset_requested';
    selectedFamilyId?: string;
    selectedTagIds: readonly string[];
    selectedLevelState: PromptEnhancementPrepareRequestV1['userPreferenceContext']['levelState'];
    selectedSectionPivotIds: readonly string[];
    overrideReason?: string;
  };
  routeDecision: PromptEnhancementRouteDecisionV1;
  bodyPlan: PromptEnhancementBodyPlanV1;
  composerBoundary: PromptEnhancementComposerBoundaryV1;
  validationSummary: PromptEnhancementSafetySummaryV1;
  safetySummary: PromptEnhancementSafetySummaryV1;
  validationGraph: PromptEnhancementValidationGraphV1;
  callAndVisibilityMetadata: PromptEnhancementCostVisibilityMetadataV1;
  uiView: PromptEnhancementUiViewPayloadV1;
  generatedOrigin: PromptEnhancementGeneratedOriginMetadataV1;
  delivery: PromptEnhancementDeliveryMetadataV1;
  ownership: PromptEnhancementOwnershipMetadataV1;
  diagnostics: readonly PromptEnhancementPublicDiagnosticV1[];
  // TI-3.3 (2026-08-08) — observability-only. Set ONLY when the blocked-body deterministic
  // substitution fired (facade recompose-drop): the emitted `safetySummary`/`currentBody` then
  // describe the POST-substitution deterministic body, so without this a blocked-then-silently-
  // replaced run is indistinguishable from a clean one. `preSubstitutionAuthorityEscalationState`
  // is the safety verdict the LLM-worded body carried BEFORE it was replaced. Additive + optional
  // → PE/PEF behaviour, disposition, and the emitted safetySummary stay byte-identical; a reader
  // may ignore these fields entirely. They NEVER carry body text.
  deterministicFallbackApplied?: boolean;
  preSubstitutionAuthorityEscalationState?: PromptEnhancementValidationStatus;
  // TI-3.2 (2026-08-08, completed through the 2026-08-09 follow-up) — observability-only. ALL
  // compose-layer reduction reason CODES that the public `diagnostics` array genericizes away
  // (`diagnosticsFor` drops `reasonCode`, `rawReasonValuesExcluded`): every `fallback_or_no_popup`
  // code — the draft-rejection / deterministic-fallback cause
  // `deterministic_fallback:<runtimeState>:<draftRejectionReason>`, the blocked-body substitution
  // marker `llm_final_body_blocked_deterministic_fallback`, `partial_draft_drop:<count>:<reason>`,
  // `action_failed_previous_body_preserved:<state>`, `no_popup_or_no_sections_original_only` — plus the
  // `source_coverage` code `project_grounding_source_unavailable`. Typed reason CODES only (composer
  // runtime state + rejection enum) — NEVER body text or raw user content, the same class as
  // `callAndVisibilityMetadata.fallbackReason` already on this result. Present only when a compose-layer
  // reduction occurred; additive + optional → PE/PEF behaviour and the emitted contract stay byte-identical.
  compositionFallbackReasonCodes?: readonly string[];
  // TI-3 audit follow-up (2026-08-09) — observability-only. True when the user's additional-details
  // input exceeded the 5,000-word cap and was truncated before recomposition (the engine already
  // emits a dedicated user notice for this; the `reasonCode` is genericized away from the machine-
  // readable log). This is a `generated` input-cap event, NOT a fallback/reduction — kept as its own
  // flag rather than folded into `compositionFallbackReasonCodes`. Present only when truncation
  // occurred; additive + optional → PE/PEF behaviour and the emitted contract stay byte-identical.
  additionalDetailsTruncated?: boolean;
  /**
   * I2 observability — how many sections the pruner dropped from this body.
   *
   * 🔴 Added at the phase-36 verification pass. The pruner already produced its dropped-section
   * list and the facade already carried it, but nothing read it: the ONE thing the pruner exists to
   * do was unobservable from an ordinary run, which is the seam prohibition 10 forbids.
   *
   * 🔑 It is also what phase 37 (I3) is required to measure — *"the AFTER number: the same
   * distribution with the pruner on"* — so the measurement rides an ordinary boundary log rather
   * than needing a bespoke probe built for it.
   *
   * ⚠️ A COUNT, deliberately, not the ids. Section ids embed the route decision id and the section
   * kind; the count answers "did the pruner do anything, and how much" without putting per-body
   * identifiers into the log. Present only when something was actually pruned, so absent and zero
   * stay distinguishable.
   */
  prunedSectionCount?: number;
  /**
   * I2/I3 observability — how many of this body's sections were FLOOR (exempt from the cap).
   *
   * 🔴 Added at phase 37 because §15.4 step 4 judges whether a body exceeded floor + 3, and without
   * this the split is not reconstructable from a run: a legitimate floor of 5 with 3 extras and a
   * genuine breach of 4 floor + 4 extras produce the same section count. Emitted alongside
   * `prunedSectionCount` so the two read together.
   */
  floorSectionCount?: number;
}

export type PromptEnhancementPrepareFacadeV1 = (
  request: PromptEnhancementPrepareRequestV1,
) => Promise<PromptEnhancementPrepareResultV1>;

export type PromptEnhancementActionFacadeV1 = (
  request: PromptEnhancementActionRequestV1,
) => Promise<PromptEnhancementPrepareResultV1>;

export interface PromptEnhancementContractValidation {
  ok: boolean;
  reasonCodes: readonly string[];
}

const LEGACY_DECISION_SESSION_KEYS = [
  'L1',
  'L2',
  'L3',
  'generated_l1',
  'generated_l2',
  'generated_l3',
  'SHOW_SIMPLER',
  'SKIP_NOW',
  'selectedPrompt',
  'selected_prompt',
  'DecisionContent',
  'GeneratedOptions',
  '__FREQ__',
  '__ROLE__',
  'OPT_OUT_SENTINEL',
  'CLIPBOARD_ONLY',
] as const;

const MULTI_VARIANT_PAYLOAD_KEYS = [
  'variants',
  'promptVariants',
  'enhancedPrompts',
  'options',
  'optionList',
  'candidatePrompts',
] as const;

const RAW_SOURCE_PAYLOAD_KEYS = [
  'rawSourceObject',
  'rawSourceObjects',
  'rawSource',
  'rawSourceRows',
  'sourceRows',
  'rawModelPrompt',
  'rawPromptText',
  'rawGeneratedBody',
  'sourceExcerpt',
  'sourceExcerpts',
] as const;

export function validatePromptEnhancementPrepareRequestV1(
  value: unknown,
): PromptEnhancementContractValidation {
  const obj = asRecord(value);
  const legacy = findLegacyDecisionSessionKeys(obj);
  const rawSourceKeys = findDisallowedRawContractKeys(obj);
  const reasonCodes: string[] = [];
  if (!obj) reasonCodes.push('request_not_object');
  if (legacy.length > 0) reasonCodes.push('legacy_decision_session_payload');
  if (rawSourceKeys.length > 0) reasonCodes.push('raw_source_object_payload');
  if (typeof obj?.['requestId'] !== 'string') reasonCodes.push('missing_request_id');
  if (typeof obj?.['projectRoot'] !== 'string') reasonCodes.push('missing_project_root');
  if (obj?.['schemaVersion'] !== PROMPT_ENHANCEMENT_CONTRACT_VERSION) reasonCodes.push('unsupported_schema_version');
  const sourcePrompt = asRecord(obj?.['sourcePrompt']);
  if (!sourcePrompt || typeof sourcePrompt['text'] !== 'string') {
    reasonCodes.push('missing_source_prompt');
  } else if (sourcePrompt['text'].trim().length === 0) {
    reasonCodes.push('empty_source_prompt');
  }
  if (!asRecord(obj?.['reviewMomentContext'])) reasonCodes.push('missing_review_moment_context');
  if (!isCompleteReviewMomentContext(obj?.['reviewMomentContext'])) reasonCodes.push('missing_review_moment_context_detail');
  if (!isCompleteSourceSignals(obj?.['sourceSignals'])) reasonCodes.push('missing_source_signals');
  if (!isCompleteCallVisibility(obj?.['callVisibilityState'])) reasonCodes.push('missing_call_visibility_state');
  if (!asRecord(obj?.['privacyAndStoragePolicy'])) reasonCodes.push('missing_privacy_storage_policy');
  // Optional, but not unchecked. Downstream this is compared against the clock, and every
  // comparison against a non-finite value is false — so a malformed deadline would silently
  // decline every composer attempt rather than raising anything. The composer treats a bad value
  // as no ceiling so that cannot happen; this is what names it.
  const deadlineAtMs = obj?.['deadlineAtMs'];
  if (deadlineAtMs !== undefined && (typeof deadlineAtMs !== 'number' || !Number.isFinite(deadlineAtMs))) {
    reasonCodes.push('invalid_deadline_at_ms');
  }
  return { ok: reasonCodes.length === 0, reasonCodes };
}

export function validatePromptEnhancementActionRequestV1(
  value: unknown,
): PromptEnhancementContractValidation {
  const obj = asRecord(value);
  const prepareValidation = validatePromptEnhancementPrepareRequestV1(value);
  const reasonCodes = [...prepareValidation.reasonCodes];
  const action = asRecord(obj?.['action']);
  const binding = asRecord(obj?.['currentBodyBinding']);

  if (!isTypedAction(action)) reasonCodes.push('missing_typed_action');
  if (!isCompleteActionRequestBinding(binding)) reasonCodes.push('missing_current_body_binding');
  if (action && binding) {
    if (action['currentBodyId'] !== binding['currentBodyId'] || action['bodyRevision'] !== binding['bodyRevision']) {
      reasonCodes.push('stale_or_mismatched_action_body_binding');
    }
    if (action['actionType'] === 'use_current_body' && typeof binding['editedBodyText'] === 'string' && binding['editedBodyText'].trim().length === 0) {
      reasonCodes.push('missing_edited_body_text');
    }
  }
  if (binding && binding['realUserInitiated'] !== true) reasonCodes.push('missing_real_user_initiation');

  return { ok: reasonCodes.length === 0, reasonCodes: [...new Set(reasonCodes)] };
}

export function validatePromptEnhancementPrepareResultV1(
  value: unknown,
  // A CONTINUATION result is a packaged sequence-item body, not a fresh-prompt result: its verdict
  // graph carries the single `sequence` phase, not the full pipeline's fifteen. Callers that validate
  // one pass `{ sequenceItemGraph: true }` so the graph check asks the right question. Omitted (the
  // default) preserves the full-pipeline check exactly — every existing caller is unchanged.
  options?: { sequenceItemGraph?: boolean },
): PromptEnhancementContractValidation {
  const obj = asRecord(value);
  const legacy = findLegacyDecisionSessionKeys(obj);
  const currentBody = asRecord(obj?.['currentBody']);
  const sections = Array.isArray(currentBody?.['sections']) ? currentBody['sections'] : undefined;
  const actions = Array.isArray(obj?.['availableActions']) ? obj?.['availableActions'] : undefined;
  const variantKeys = findDisallowedVariantKeys(obj);
  const rawSourceKeys = findDisallowedRawContractKeys(obj);
  const reasonCodes: string[] = [];
  if (!obj) reasonCodes.push('result_not_object');
  if (legacy.length > 0) reasonCodes.push('legacy_decision_session_payload');
  if (variantKeys.length > 0) reasonCodes.push('multiple_visible_variants');
  if (rawSourceKeys.length > 0) reasonCodes.push('raw_source_object_payload');
  if (obj?.['schemaVersion'] !== PROMPT_ENHANCEMENT_CONTRACT_VERSION) reasonCodes.push('unsupported_schema_version');
  if (typeof obj?.['enhancementId'] !== 'string') reasonCodes.push('missing_enhancement_id');
  if (typeof obj?.['requestId'] !== 'string') reasonCodes.push('missing_request_id');
  if (!isDisposition(obj?.['disposition'])) reasonCodes.push('invalid_disposition');
  if (typeof obj?.['validationDecisionId'] !== 'string' || obj['validationDecisionId'].trim().length === 0) reasonCodes.push('missing_validation_decision_id');
  if (!isCompleteCurrentBody(currentBody)) reasonCodes.push('missing_current_body');
  if (!currentBody || !Array.isArray(sections)) reasonCodes.push('missing_sections');
  if (sections && sections.some((section) => !isCompleteSection(section))) {
    reasonCodes.push('incomplete_section_contract');
  }
  if (!actions || actions.length === 0) reasonCodes.push('missing_typed_actions');
  if (actions && actions.some((action) => !isTypedAction(action))) reasonCodes.push('invalid_typed_action');
  if (!asRecord(obj?.['generatedOrigin'])) reasonCodes.push('missing_generated_origin');
  if (!asRecord(obj?.['delivery'])) reasonCodes.push('missing_delivery_metadata');
  if (!asRecord(obj?.['validationSummary'])) reasonCodes.push('missing_validation_summary');
  if (!isCompleteRouteDecision(obj?.['routeDecision'])) reasonCodes.push('missing_route_decision');
  if (!isCompleteBodyPlan(obj?.['bodyPlan'], obj?.['disposition'] === 'no_popup_not_applicable')) reasonCodes.push('missing_body_plan');
  if (!isCompleteComposerBoundary(obj?.['composerBoundary'])) reasonCodes.push('missing_composer_boundary');
  if (!isCompleteValidationGraph(
    obj?.['validationGraph'],
    options?.sequenceItemGraph ? SEQUENCE_ITEM_VALIDATION_STAGES_V1 : FULL_PIPELINE_VALIDATION_STAGES_V1,
  )) reasonCodes.push('missing_validation_graph');
  if (!isCompleteUiViewPayload(obj?.['uiView'])) reasonCodes.push('missing_ui_view_payload');
  if (!isCompleteCallVisibility(obj?.['callAndVisibilityMetadata'])) reasonCodes.push('missing_call_visibility_metadata');
  if (obj?.['handoffMetadata'] !== undefined && !isCompleteHandoffMetadata(obj?.['handoffMetadata'], currentBody, obj)) {
    reasonCodes.push('unsafe_handoff_metadata');
  }
  if (!asRecord(obj?.['ownership'])) reasonCodes.push('missing_ownership_metadata');
  if (!isCompletePublicDiagnostics(obj?.['diagnostics'])) reasonCodes.push('unsafe_public_diagnostics');
  if (isUnsafeSendPolicyMismatch(obj)) reasonCodes.push('unsafe_send_policy_mismatch');
  if (isUnsafeGeneratedOriginLearning(obj)) reasonCodes.push('unsafe_generated_origin_learning');
  if (isRawTransportAuthority(obj)) reasonCodes.push('raw_transport_semantic_authority');
  if (isUnsafeSafetyPolicy(obj)) reasonCodes.push('unsafe_safety_policy');
  if (isMismatchedSafetySummary(obj)) reasonCodes.push('mismatched_safety_summary');
  // A CONTINUATION result's graph is the served ITEM's batch-time verdict (e.g. `llm_wording`), while its
  // callVisibility describes the continuation presentation itself (no new provider call). These two
  // legitimately describe DIFFERENT moments, so the fresh-prompt "graph and callVisibility must agree"
  // check is a category error here — skip it in sequence-item mode. (For a fresh prompt, both describe the
  // one composer call and the check still applies.)
  if (!options?.sequenceItemGraph && isMismatchedCallVisibilityState(obj)) reasonCodes.push('mismatched_call_visibility_state');
  if (isMismatchedCurrentBodySafetyState(obj)) reasonCodes.push('mismatched_current_body_safety_state');
  return { ok: reasonCodes.length === 0, reasonCodes };
}

export function findLegacyDecisionSessionKeys(value: unknown): string[] {
  const found = new Set<string>();
  visitRecords(value, (record) => {
    for (const key of LEGACY_DECISION_SESSION_KEYS) {
      if (Object.prototype.hasOwnProperty.call(record, key)) found.add(key);
    }
  });
  return [...found].sort();
}

export function findDisallowedVariantKeys(value: unknown): string[] {
  return findOwnedKeys(value, MULTI_VARIANT_PAYLOAD_KEYS);
}

export function findDisallowedRawContractKeys(value: unknown): string[] {
  return findOwnedKeys(value, RAW_SOURCE_PAYLOAD_KEYS);
}

function isDisposition(value: unknown): value is PromptEnhancementDisposition {
  return value === 'show_current_body'
    || value === 'fallback_to_original'
    || value === 'no_popup_not_applicable'
    || value === 'blocked_no_send';
}

function isCompleteSection(value: unknown): boolean {
  const section = asRecord(value);
  return !!section
    && typeof section['sectionId'] === 'string'
    && typeof section['sectionKind'] === 'string'
    && typeof section['title'] === 'string'
    && typeof section['bodyText'] === 'string'
    && section['registryNamespace'] === 'prompt-enhancement-templates'
    && typeof section['sourceKind'] === 'string'
    && Array.isArray(section['sourceIds'])
    && Array.isArray(section['sourceFactIds'])
    && Array.isArray(section['routeCandidateRefs'])
    && typeof section['evidenceStatus'] === 'string'
    && typeof section['sourceEvidenceStatus'] === 'string'
    && typeof section['slotEvidenceStatus'] === 'string'
    && typeof section['requiredSurvivor'] === 'boolean'
    && typeof section['mandatoryFloor'] === 'boolean'
    && typeof section['depthState'] === 'string'
    && Array.isArray(section['axisContributions'])
    && typeof section['canMergeInShorter'] === 'boolean'
    && typeof section['canExpandInMoreThorough'] === 'boolean'
    && typeof section['canGroundInMoreProjectGrounded'] === 'boolean'
    && typeof section['feedbackSensitivity'] === 'string'
    && typeof section['fallbackBehavior'] === 'string'
    && Array.isArray(section['handoffFlags'])
    && typeof section['privacyClass'] === 'string'
    && typeof section['publicCopySafe'] === 'boolean'
    && section['authorityBoundary'] === 'no_authority_escalation'
    && typeof section['confirmationRequired'] === 'boolean'
    && typeof section['confirmationPresent'] === 'boolean'
    && typeof section['validationStatus'] === 'string'
    && Array.isArray(section['safetyFlags'])
    && Array.isArray(section['sensitivityFlags'])
    && Array.isArray(section['whyHelpReasonCodes'])
    && typeof section['callVisibilityMode'] === 'string';
}

function isCompleteCurrentBody(value: unknown): boolean {
  const body = asRecord(value);
  const text = typeof body?.['text'] === 'string' ? body['text'] : '';
  const renderedPromptBody = typeof body?.['renderedPromptBody'] === 'string' ? body['renderedPromptBody'] : '';
  const originalPromptText = typeof body?.['originalPromptText'] === 'string' ? body['originalPromptText'] : '';
  return !!body
    && typeof body['currentBodyId'] === 'string'
    && typeof body['bodyRevision'] === 'number'
    && typeof body['composerRunId'] === 'string'
    && typeof body['routeDecisionId'] === 'string'
    && typeof body['promptReviewOrigin'] === 'string'
    && typeof body['promptReviewProcessingPolicy'] === 'string'
    && typeof body['sentPromptOrigin'] === 'string'
    && typeof body['nexpathGeneratedPromptRef'] === 'string'
    && typeof body['renderedPromptBody'] === 'string'
    && renderedPromptBody.trim().length > 0
    && body['renderedPromptBody'] === body['text']
    && typeof body['originalPromptSectionId'] === 'string'
    && Array.isArray(body['sourceAttribution'])
    && body['sourceAttribution'].every(isCompleteSourceAttribution)
    && typeof body['llmCallPolicy'] === 'string'
    && typeof body['composerMode'] === 'string'
    && typeof body['languagePolicyApplied'] === 'string'
    && typeof body['languageValidationStatus'] === 'string'
    && typeof body['effectiveLanguageState'] === 'string'
    && typeof body['languageSource'] === 'string'
    && typeof body['languageConfidence'] === 'string'
    && typeof body['languagePolicy'] === 'string'
    && typeof body['instructionPrecedenceState'] === 'string'
    && typeof body['originalAsSourceStatus'] === 'string'
    && Array.isArray(body['composerClaims'])
    && Array.isArray(body['sourceFactIds'])
    && typeof body['localOriginalPromptIncluded'] === 'boolean'
    && typeof body['text'] === 'string'
    && text.trim().length > 0
    && typeof body['originalPromptText'] === 'string'
    && originalPromptText.trim().length > 0
    && typeof body['originalPromptPreservation'] === 'string'
    && typeof body['generatedOriginState'] === 'string'
    && typeof body['generatedSafeStatus'] === 'string'
    && typeof body['userDirtyState'] === 'string'
    && Array.isArray(body['sections']);
}

function isCompleteSourceAttribution(value: unknown): boolean {
  const source = asRecord(value);
  return !!source
    && typeof source['sourceRefId'] === 'string'
    && typeof source['sourceId'] === 'string'
    && typeof source['sourceKind'] === 'string'
    && typeof source['evidenceStatus'] === 'string'
    && typeof source['publicSafeLabel'] === 'string'
    && source['privateIdPolicy'] === 'metadata_only_not_body';
}

function isTypedAction(value: unknown): boolean {
  const action = asRecord(value);
  return !!action
    && typeof action['actionId'] === 'string'
    && typeof action['actionType'] === 'string'
    && typeof action['label'] === 'string'
    && typeof action['currentBodyId'] === 'string'
    && typeof action['bodyRevision'] === 'number'
    && typeof action['availability'] === 'string'
    && typeof action['callVisibilityMode'] === 'string';
}

function isCompleteActionRequestBinding(value: unknown): boolean {
  const binding = asRecord(value);
  return !!binding
    && typeof binding['currentBodyId'] === 'string'
    && typeof binding['bodyRevision'] === 'number'
    && typeof binding['validationDecisionId'] === 'string'
    && typeof binding['editedBodyText'] === 'string'
    && typeof binding['actionSubmittedAtMs'] === 'number'
    && typeof binding['realUserInitiated'] === 'boolean'
    && Array.isArray(binding['sectionSpanEditEvents']);
}

function isCompleteReviewMomentContext(value: unknown): boolean {
  const context = asRecord(value);
  return !!context
    && typeof context['reviewMoment'] === 'string'
    && typeof context['currentAgentMode'] === 'string'
    && typeof context['projectId'] === 'string'
    && typeof context['sessionId'] === 'string'
    && typeof context['detectedLanguage'] === 'string'
    && typeof context['stageCandidate'] === 'string'
    && typeof context['promptCount'] === 'number'
    && Array.isArray(context['recentPromptMetadataRefs'])
    && isCompleteTriggerProvenance(context['triggerProvenance']);
}

function isCompleteTriggerProvenance(value: unknown): boolean {
  const trigger = asRecord(value);
  return !!trigger
    && typeof trigger['currentStage'] === 'string'
    && typeof trigger['triggerKind'] === 'string'
    && typeof trigger['classifierState'] === 'string'
    && typeof trigger['degradedNoActionState'] === 'string'
    && typeof trigger['promptStartBoundary'] === 'string'
    && typeof trigger['deliveryBoundary'] === 'string'
    && trigger['promptStartCanReplaceSameTurn'] === false;
}

function isCompleteSourceSignals(value: unknown): boolean {
  const signals = asRecord(value);
  return !!signals
    && asRecord(signals['sourceAOriginalPromptRef'])?.['sourceKind'] === 'source_a_user_prompt'
    && Array.isArray(signals['sourceRefs'])
    && Array.isArray(signals['normalizedStageAbsenceSignalRefs'])
    && Array.isArray(signals['contentTemplateRecordFactRefs'])
    && Array.isArray(signals['popupQuestionSourceRefs'])
    && Array.isArray(signals['whyHelpSourceRefs'])
    && Array.isArray(signals['profileRoleModeRefs'])
    && Array.isArray(signals['rightGoodWorkStyleEnvRuntimeRefs'])
    && Array.isArray(signals['missingMemoryCandidateRefs'])
    && Array.isArray(signals['sourceLabels'])
    && asRecord(signals['promptStartStop']) !== null
    && asRecord(signals['store']) !== null;
}

function isCompleteCallVisibility(value: unknown): boolean {
  const call = asRecord(value);
  if (!call) return false;
  const usesProvider =
    call['callVisibilityMode'] === 'llm_wording' ||
    call['optionalCallAvailabilityState'] === 'allowed' ||
    call['plannedCallCount'] !== 0 ||
    call['usedCallCount'] !== 0;
  return typeof call['callOwner'] === 'string'
    && typeof call['callVisibilityMode'] === 'string'
    && typeof call['callTrigger'] === 'string'
    && typeof call['optionalCallAvailabilityState'] === 'string'
    && typeof call['plannedCallCount'] === 'number'
    && typeof call['usedCallCount'] === 'number'
    && typeof call['providerAvailabilityState'] === 'string'
    && typeof call['fallbackReason'] === 'string'
    && (!usesProvider || (
      typeof call['provider'] === 'string'
      && typeof call['model'] === 'string'
      && typeof call['inputTokenCap'] === 'number'
      && typeof call['outputTokenCap'] === 'number'
      && typeof call['estimatedInputTokens'] === 'number'
      && typeof call['estimatedOutputTokens'] === 'number'
      && typeof call['timeoutMs'] === 'number'
    ))
    && Array.isArray(call['priorCallAccountingRefs'])
    && typeof call['localLoggingHookState'] === 'string'
    && call['productValueDiscussionIsRuntimeLimiter'] === false;
}

function isCompleteRouteDecision(value: unknown): boolean {
  const route = asRecord(value);
  if (!route) return false;
  return typeof route['routeDecisionId'] === 'string'
    && typeof route['familyId'] === 'string'
    && typeof route['primaryIntent'] === 'string'
    && Array.isArray(route['capabilityOverlays'])
    && asRecord(route['selectedTemplateRef'])?.['registryNamespace'] === 'prompt-enhancement-templates'
    && Array.isArray(route['candidateRouteIds'])
    && Array.isArray(route['rejectedRoutes'])
    && typeof route['ambiguityState'] === 'string'
    && typeof route['suppressionState'] === 'string'
    && Array.isArray(route['routeInputEvidenceRefs'])
    && Array.isArray(route['routeEvidence'])
    && Array.isArray(route['registryLinkedFixtureIds'])
    && route['usesPeOnlyClassifier'] === false
    && route['usesOldStaticDecisionSessionMap'] === false;
}

function isCompleteBodyPlan(value: unknown, allowEmptySections = false): boolean {
  const plan = asRecord(value);
  const sectionPlans = Array.isArray(plan?.['orderedSectionPlans']) ? plan?.['orderedSectionPlans'] : [];
  return !!plan
    && typeof plan['bodyPlanId'] === 'string'
    && typeof plan['bodyRevision'] === 'number'
    && typeof plan['routeDecisionId'] === 'string'
    && (allowEmptySections || sectionPlans.length > 0)
    && sectionPlans.every((section) => {
      const item = asRecord(section);
      return !!item
        && typeof item['sectionPlanId'] === 'string'
        && typeof item['sectionId'] === 'string'
        && typeof item['templateId'] === 'string'
        && typeof item['order'] === 'number'
        && Array.isArray(item['sourceRefs'])
        && typeof item['validationStatus'] === 'string'
        && typeof item['fallbackMode'] === 'string'
        && typeof item['callVisibilityMode'] === 'string';
    })
    && plan['generatedOriginPolicy'] === 'attach_generated_origin_metadata'
    && plan['futurePromptTextPolicy'] === 'not_generated_not_stored_not_rendered'
    && plan['exposesPrecomputedVariants'] === false;
}

function isCompleteComposerBoundary(value: unknown): boolean {
  const boundary = asRecord(value);
  const input = asRecord(boundary?.['inputContract']);
  const output = asRecord(boundary?.['outputContract']);
  const fallback = asRecord(boundary?.['deterministicFallback']);
  const visibleContext = asRecord(boundary?.['composerVisiblePromptContext']);
  return !!boundary
    && boundary['composerBoundaryVersion'] === PROMPT_ENHANCEMENT_CONTRACT_VERSION
    && typeof boundary['composerPolicy'] === 'string'
    && typeof boundary['composerRunId'] === 'string'
    && typeof boundary['routeDecisionId'] === 'string'
    && typeof boundary['promptReviewOrigin'] === 'string'
    && typeof boundary['promptReviewProcessingPolicy'] === 'string'
    && typeof boundary['sentPromptOrigin'] === 'string'
    && typeof boundary['nexpathGeneratedPromptRef'] === 'string'
    && typeof boundary['renderedPromptBody'] === 'string'
    && typeof boundary['originalPromptSectionId'] === 'string'
    && Array.isArray(boundary['sourceAttribution'])
    && boundary['sourceAttribution'].every(isCompleteSourceAttribution)
    && typeof boundary['llmCallPolicy'] === 'string'
    && typeof boundary['rawComposerOutput'] === 'string'
    && boundary['validatedCanonicalPromptArtifact'] === 'current_body_v1'
    && typeof boundary['composerMode'] === 'string'
    && typeof asRecord(boundary['budgetState'])?.['llmCallPolicy'] === 'string'
    && asRecord(boundary['budgetState'])?.['llmCallPolicy'] === boundary['llmCallPolicy']
    && asRecord(boundary['budgetState'])?.['productValueDiscussionIsRuntimeLimiter'] === false
    && typeof boundary['languagePolicyApplied'] === 'string'
    && typeof boundary['languageValidationStatus'] === 'string'
    && typeof boundary['effectiveLanguageState'] === 'string'
    && typeof boundary['languageSource'] === 'string'
    && typeof boundary['languageConfidence'] === 'string'
    && typeof boundary['languagePolicy'] === 'string'
    && typeof boundary['instructionPrecedenceState'] === 'string'
    && typeof boundary['originalAsSourceStatus'] === 'string'
    && Array.isArray(boundary['composerClaims'])
    && Array.isArray(boundary['sourceFactIds'])
    && boundary['localRenderOriginalPrompt'] === true
    && visibleContext?.['contextPolicy'] === 'structured_refs_only_no_raw_original'
    && visibleContext?.['originalPromptVisibleLocallyOnly'] === true
    && typeof visibleContext?.['boundedContextRefCount'] === 'number'
    && visibleContext?.['rawPromptTextExcluded'] === true
    && Array.isArray(boundary['composerVisiblePromptContextRefs'])
    && boundary['composerInputPrivacyState'] === 'approved_refs_only'
    && typeof boundary['localOriginalPromptIncluded'] === 'boolean'
    && Array.isArray(boundary['strictSchemaFailureReasonCodes'])
    && Array.isArray(boundary['fallbackReasonCodes'])
    && !!input
    && asRecord(input['originalPromptRef'])?.['sourceKind'] === 'source_a_user_prompt'
    && typeof input['bodyPlanId'] === 'string'
    && Array.isArray(input['sectionPlanIds'])
    && input['privacyApprovedFactsOnly'] === true
    && isCompleteCallVisibility(input['callVisibilityState'])
    && input['excludesRawStoreRows'] === true
    && input['excludesOldDecisionSessionOptionText'] === true
    && input['excludesUiInferredBusinessState'] === true
    && !!output
    && output['structuredSectionsRequired'] === true
    && output['joinedCurrentBodyRequired'] === true
    && output['preservesSectionIds'] === true
    && output['preservesSourceRefs'] === true
    && output['preservesSafetyRequirements'] === true
    && output['textOnlyOutputAllowed'] === false
    && !!fallback
    && typeof fallback['available'] === 'boolean'
    && typeof fallback['fallbackMode'] === 'string'
    && fallback['productValueDiscussionIsRuntimeLimiter'] === false;
}

// The phase stages a FRESH-prompt (full-pipeline) result graph must carry — one per pipeline stage.
const FULL_PIPELINE_VALIDATION_STAGES_V1 = [
  'request',
  'pre_plan',
  'section_plan',
  'composer_input',
  'composer_output',
  'final_body',
  'user_edit',
  'action',
  'delivery',
  'storage',
  'source_use',
  'privacy',
  'handoff',
  'sequence',
  'launch_check',
] as const;

// The stages a SEQUENCE-ITEM (continuation) result graph carries. A continuation item's body is
// generated and validated at the SEQUENCE stage only — it never runs the fresh-prompt pipeline — so
// its verdict graph legitimately holds the one `sequence` phase, not all fifteen. This is a category
// distinction, not an incomplete graph: requiring the full fifteen of it is the wrong question.
const SEQUENCE_ITEM_VALIDATION_STAGES_V1 = ['sequence'] as const;

function isCompleteValidationGraph(
  value: unknown,
  requiredStages: readonly string[] = FULL_PIPELINE_VALIDATION_STAGES_V1,
): boolean {
  const graph = asRecord(value);
  if (!graph) return false;
  if (graph['graphVersion'] !== PROMPT_ENHANCEMENT_CONTRACT_VERSION) return false;
  if (graph['graphOwner'] !== 'content_semantics') return false;
  if (graph['rawTransportIsValidationProof'] !== false) return false;
  if (graph['evaluatesAgentResponseQuality'] !== false) return false;
  if (graph['canAutoAdvanceSequencePointer'] !== false) return false;
  if (!asRecord(graph['safetyState'])) return false;
  if (typeof graph['providerRuntimeState'] !== 'string') return false;
  if (typeof graph['optionalCallAvailabilityState'] !== 'string') return false;
  const phaseStates = Array.isArray(graph['phaseStates']) ? graph['phaseStates'] : [];
  const failures = Array.isArray(graph['failures']) ? graph['failures'] : [];
  const stages = new Set(phaseStates.map((phase) => asRecord(phase)?.['stage']));
  if (!requiredStages.every((stage) => stages.has(stage))) return false;
  if (!phaseStates.every(isCompleteValidationPhaseState)) return false;
  if (!failures.every(isCompleteValidationFailure)) return false;
  return phaseStates.every((phase) => phaseStateFailureCodesMatch(asRecord(phase), failures));
}

function isCompleteValidationPhaseState(value: unknown): boolean {
  const phase = asRecord(value);
  return !!phase
    && typeof phase['stage'] === 'string'
    && typeof phase['status'] === 'string'
    && typeof phase['fallbackMode'] === 'string'
    && Array.isArray(phase['failureCodes'])
    && phase['failureCodes'].every((code) => typeof code === 'string' && code.length > 0)
    && typeof phase['publicSafeReasonCategory'] === 'string';
}

function isCompleteValidationFailure(value: unknown): boolean {
  const failure = asRecord(value);
  return !!failure
    && typeof failure['failureCode'] === 'string'
    && failure['failureCode'].length > 0
    && typeof failure['stage'] === 'string'
    && typeof failure['severity'] === 'string'
    && typeof failure['blocking'] === 'boolean'
    && Array.isArray(failure['affectedSectionIds'])
    && Array.isArray(failure['affectedBodySpanRefs'])
    && Array.isArray(failure['affectedSourceRefIds'])
    && Array.isArray(failure['affectedActionIds'])
    && [...failure['affectedSectionIds'], ...failure['affectedBodySpanRefs'], ...failure['affectedSourceRefIds'], ...failure['affectedActionIds']]
      .every((ref) => typeof ref === 'string')
    && typeof failure['publicSafeReasonCategory'] === 'string'
    && (failure['privateDebugDetailPolicy'] === 'none' || failure['privateDebugDetailPolicy'] === 'bounded_local_only');
}

function phaseStateFailureCodesMatch(
  phase: Record<string, unknown> | null,
  failures: readonly unknown[],
): boolean {
  if (!phase) return false;
  const stage = phase['stage'];
  const phaseFailureCodes = Array.isArray(phase['failureCodes']) ? phase['failureCodes'] : [];
  const matchingFailureCodes = failures
    .map(asRecord)
    .filter((failure): failure is Record<string, unknown> => failure?.['stage'] === stage)
    .map((failure) => failure['failureCode']);
  return phaseFailureCodes.length === matchingFailureCodes.length &&
    phaseFailureCodes.every((code) => matchingFailureCodes.includes(code));
}

function isValidPinchLabel(value: unknown): boolean {
  const label = asRecord(value);
  return !!label
    && typeof label['text'] === 'string'
    && (label['derivedFrom'] === 'family' || label['derivedFrom'] === 'overlay' || label['derivedFrom'] === 'fallback');
}

function isValidWhyHelp(value: unknown): boolean {
  const why = asRecord(value);
  return !!why
    && typeof why['text'] === 'string'
    && (why['reasonKind'] === 'confirmation_needed' || why['reasonKind'] === 'risk_or_rollback' || why['reasonKind'] === 'sensitive_action');
}

function isCompleteUiViewPayload(value: unknown): boolean {
  const view = asRecord(value);
  if (!view) return false;
  if (view['viewPayloadVersion'] !== PROMPT_ENHANCEMENT_CONTRACT_VERSION) return false;
  if (!asRecord(view['body'])) return false;
  if (!Array.isArray(view['sectionsForFeedback'])) return false;
  if (!Array.isArray(view['publicTrustCues'])) return false;
  if (!Array.isArray(view['actions'])) return false;
  if (!isCompleteUiActionInputContract(view['actionInputContract'])) return false;
  if (!isCompletePublicDiagnostics(view['diagnostics'])) return false;
  // UI-9: these are optional, but when present their shape must be valid so the
  // renderer can trust `text` is a string and the reason/derivation is in range.
  if (view['pinchLabel'] !== undefined && !isValidPinchLabel(view['pinchLabel'])) return false;
  if (view['whyHelp'] !== undefined && !isValidWhyHelp(view['whyHelp'])) return false;
  return view['hidesVisibleSectionControls'] === true
    && view['exposesPromptVariants'] === false
    && view['exposesForegroundSafer'] === false
    && view['textOnlyDeliveryIsAuthority'] === false;
}

function isCompleteHandoffMetadata(
  value: unknown,
  currentBody: Record<string, unknown> | null,
  result: Record<string, unknown> | null,
): boolean {
  const handoff = asRecord(value);
  if (!handoff) return false;
  const validationSummary = asRecord(result?.['validationSummary']);
  const receiverValidationRequirements = Array.isArray(handoff['receiverValidationRequirements'])
    ? handoff['receiverValidationRequirements']
    : [];
  const handoffKind = handoff['handoffKind'];
  const currentBodyId = typeof currentBody?.['currentBodyId'] === 'string' ? currentBody['currentBodyId'] : undefined;
  const bodyRevision = typeof currentBody?.['bodyRevision'] === 'number' ? currentBody['bodyRevision'] : undefined;
  return handoff['handoffMetadataVersion'] === PROMPT_ENHANCEMENT_CONTRACT_VERSION
    && typeof handoff['handoffDecisionId'] === 'string'
    && handoff['currentBodyId'] === currentBodyId
    && handoff['bodyRevision'] === bodyRevision
    && typeof handoffKind === 'string'
    && handoff['sequenceActivationPolicy'] === 'blocked_pending_sequence_runtime_and_cost_gates'
    && handoff['futurePromptTextPolicy'] === 'not_generated_not_stored_not_rendered'
    && typeof handoff['suggestedNextPromptPolicy'] === 'string'
    && Array.isArray(handoff['suggestedNextPromptRefs'])
    && handoff['suggestedNextPromptRefs'].length === 0
    && typeof handoff['currentBodyValidityState'] === 'string'
    && Array.isArray(handoff['itemLineageRefs'])
    && (handoffKind === 'none' || handoff['itemLineageRefs'].length > 0)
    && Array.isArray(handoff['sourceLineageRefs'])
    && (handoffKind === 'none' || handoff['sourceLineageRefs'].length > 0)
    && isCompleteHandoffScope(handoff['scope'], result)
    && typeof handoff['applicabilityState'] === 'string'
    && typeof handoff['riskConfirmationState'] === 'string'
    && handoff['riskConfirmationState'] === validationSummary?.['sensitiveActionState']
    && typeof handoff['fallbackMode'] === 'string'
    && receiverValidationRequirements.includes('handoff')
    && receiverValidationRequirements.includes('launch_check')
    && handoff['activationState'] === 'no_activation_v1'
    && handoff['userHandoffConsentState'] !== 'explicitly_accepted_approved_runtime'
    && isCompleteCompactFirstPopupSummary(handoff, currentBodyId, bodyRevision)
    && isCompleteHandoffPointInventory(handoff['pointInventory'], handoffKind)
    && isCompleteHandoffDecompositionGroups(handoff['decompositionGroups'], handoffKind)
    && isCompleteHandoffTaskSlices(handoff['taskSlices'], handoffKind)
    && isCompleteHandoffApplicability(handoff['applicability'], handoff['applicabilityState'])
    && isCompleteHandoffConfirmationTargets(handoff['confirmationTargets'])
    && isCompleteHandoffSourceImpact(handoff['sourceImpact'])
    && isCompleteHandoffRuntimeGuards(handoff['runtimeGuards'])
    && isCompleteHandoffPrivacyStoragePolicy(handoff['privacyStoragePolicy'])
    && isCompleteHandoffOwnerBoundary(handoff['ownerBoundary'])
    && Array.isArray(handoff['reasonCodes'])
    && handoff['reasonCodes'].length > 0;
}

function isCompleteHandoffScope(value: unknown, result: Record<string, unknown> | null): boolean {
  const scope = asRecord(value);
  return !!scope
    && scope['requestId'] === result?.['requestId']
    && scope['projectRoot'] === result?.['projectRoot']
    && scope['projectScopeState'] === 'current_project_only'
    && Array.isArray(scope['sourceScopeRefs'])
    && scope['sourceScopeRefs'].length > 0
    && scope['crossProjectApplicationPolicy'] === 'reject'
    && scope['staleResponsePolicy'] === 'ignore_no_overwrite';
}

function isCompleteCompactFirstPopupSummary(
  handoff: Record<string, unknown>,
  currentBodyId: string | undefined,
  bodyRevision: number | undefined,
): boolean {
  const handoffKind = handoff['handoffKind'];
  const summary = asRecord(handoff['compactFirstPopupSequenceSummary']);
  if (
    handoffKind !== 'compact_sequence_summary_candidate'
    && handoffKind !== 'first_prompt_handoff_candidate'
  ) {
    return summary === null;
  }
  return !!summary
    && typeof summary['summaryId'] === 'string'
    && summary['currentBodyId'] === currentBodyId
    && summary['bodyRevision'] === bodyRevision
    && typeof summary['publicSafeText'] === 'string'
    && typeof summary['remainingTaskCount'] === 'number'
    && summary['remainingTaskCount'] >= 0
    && Array.isArray(summary['taskRoleLabels'])
    && Array.isArray(summary['sourceRefs'])
    && summary['containsFuturePromptText'] === false
    && summary['rawPromptTextExcluded'] === true
    && summary['rawGeneratedBodyExcluded'] === true
    && summary['bodyBoundMetadataOnly'] === true;
}

function isCompleteHandoffPointInventory(value: unknown, handoffKind: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (handoffKind !== 'none' && value.length === 0) return false;
  return value.every((entry) => {
    const point = asRecord(entry);
    return !!point
      && typeof point['pointRefId'] === 'string'
      && typeof point['sourcePointRef'] === 'string'
      && typeof point['order'] === 'number'
      && typeof point['explicitness'] === 'string'
      && Array.isArray(point['dependencyPointRefs'])
      && typeof point['riskConfirmationRequired'] === 'boolean'
      && typeof point['sourceSupportState'] === 'string'
      && typeof point['currentBodyCoverageState'] === 'string'
      && typeof point['privacyClass'] === 'string'
      && Array.isArray(point['reasonCodes']);
  });
}

function isCompleteHandoffDecompositionGroups(value: unknown, handoffKind: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (handoffKind !== 'none' && value.length === 0) return false;
  return value.every((entry) => {
    const group = asRecord(entry);
    return !!group
      && typeof group['decompositionGroupId'] === 'string'
      && Array.isArray(group['pointRefs'])
      && Array.isArray(group['bodySectionRefs'])
      && typeof group['groupingReason'] === 'string'
      && typeof group['splitRequirementState'] === 'string'
      && Array.isArray(group['sourceRefs'])
      && Array.isArray(group['riskConfirmationRefs'])
      && typeof group['publicSafeSummaryVisible'] === 'boolean'
      && typeof group['invalidLineageBehavior'] === 'string';
  });
}

function isCompleteHandoffTaskSlices(value: unknown, handoffKind: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (handoffKind !== 'none' && value.length === 0) return false;
  return value.every((entry) => {
    const slice = asRecord(entry);
    return !!slice
      && typeof slice['taskSliceId'] === 'string'
      && Array.isArray(slice['sourcePointRefs'])
      && typeof slice['decompositionGroupId'] === 'string'
      && Array.isArray(slice['bodySectionRefs'])
      && Array.isArray(slice['dependencySliceRefs'])
      && typeof slice['sequenceRole'] === 'string'
      && slice['sequenceRole'] !== 'runtime_queue_item'
      && typeof slice['futurePromptCandidateState'] === 'string'
      && slice['futurePromptCandidateState'] !== 'generated'
      && typeof slice['editInvalidationState'] === 'string'
      && typeof slice['handoffEligibilityState'] === 'string'
      && Array.isArray(slice['reasonCodes']);
  });
}

function isCompleteHandoffApplicability(value: unknown, metadataState: unknown): boolean {
  const applicability = asRecord(value);
  return !!applicability
    && typeof applicability['applicabilityDecisionId'] === 'string'
    && Array.isArray(applicability['taskSliceRefs'])
    && Array.isArray(applicability['decompositionGroupRefs'])
    && Array.isArray(applicability['sourcePointRefs'])
    && applicability['state'] === metadataState
    && typeof applicability['intentFamily'] === 'string'
    && typeof applicability['intentCategory'] === 'string'
    && typeof applicability['levelDepthState'] === 'string'
    && typeof applicability['riskSafetyState'] === 'string'
    && typeof applicability['dependencyOrderState'] === 'string'
    && typeof applicability['currentBodyCoverageState'] === 'string'
    && typeof applicability['promptSizeApiAvailabilityState'] === 'string'
    && typeof applicability['hostCapabilityState'] === 'string'
    && typeof applicability['explicitUserRuntimeState'] === 'string'
    && typeof applicability['granularityActionabilityState'] === 'string'
    && typeof applicability['splitMergeDisposition'] === 'string'
    && applicability['granularityFailureDisposition'] === 'current_or_original_fallback_no_runtime'
    && Array.isArray(applicability['sourcePriorityRefs'])
    && typeof applicability['sourcePriorityState'] === 'string'
    && Array.isArray(applicability['targetScopeRefs'])
    && applicability['targetScopeRefs'].length > 0
    && typeof applicability['targetSurfaceState'] === 'string'
    && typeof applicability['workspaceBindingState'] === 'string'
    && typeof applicability['scopeBindingDisposition'] === 'string'
    && typeof applicability['expectedDeliverableState'] === 'string'
    && Array.isArray(applicability['deliverableContractRefs'])
    && typeof applicability['outputFormatPolicy'] === 'string'
    && applicability['completionEvidenceRequirementState'] === 'not_runtime_proof_v1'
    && Array.isArray(applicability['acceptanceCriteriaRefs'])
    && applicability['successConditionState'] === 'not_runtime_evaluated_v1'
    && applicability['definitionOfDoneState'] === 'not_runtime_evaluated_v1'
    && applicability['acceptanceVerificationPolicy'] === 'user_owned_not_runtime_v1'
    && applicability['acceptanceFailureDisposition'] === 'current_or_original_fallback_no_runtime'
    && typeof applicability['atomicGroupId'] === 'string'
    && Array.isArray(applicability['atomicGroupRefs'])
    && typeof applicability['coDeliveryRequirementState'] === 'string'
    && applicability['partialCompletionPolicy'] === 'no_runtime_partial_completion_v1'
    && applicability['rollbackCouplingState'] === 'not_runtime_v1'
    && applicability['atomicGroupFailureDisposition'] === 'current_or_original_fallback_no_runtime'
    && typeof applicability['sourceConflictState'] === 'string'
    && Array.isArray(applicability['conflictingSourcePointRefs'])
    && applicability['conflictResolutionPolicy'] === 'current_body_or_no_runtime'
    && applicability['unresolvedConflictDisposition'] === 'current_or_original_fallback_no_runtime'
    && applicability['conflictVisibilityPolicy'] === 'public_safe_reason_codes_only'
    && typeof applicability['userNoSequenceConstraintState'] === 'string'
    && typeof applicability['onePromptOnlyConstraintState'] === 'string'
    && typeof applicability['sequenceSuppressionSourceState'] === 'string'
    && applicability['noSplitOverrideDisposition'] === 'not_allowed_v1'
    && applicability['partialItemConsentState'] === 'deferred_out_of_v1'
    && typeof applicability['clarificationApplicabilityState'] === 'string'
    && typeof applicability['userInputRequirementState'] === 'string'
    && Array.isArray(applicability['missingInformationRefs'])
    && typeof applicability['clarificationQuestionKindState'] === 'string'
    && typeof applicability['answerDependencyState'] === 'string'
    && typeof applicability['agentPermissionModeSnapshot'] === 'string'
    && typeof applicability['itemExecutionCapabilityRequirementState'] === 'string'
    && Array.isArray(applicability['toolAccessRequirementRefs'])
    && applicability['capabilityMismatchDisposition'] === 'current_or_original_fallback_no_runtime'
    && typeof applicability['manualExecutionRequiredState'] === 'string'
    && typeof applicability['conditionalInstructionState'] === 'string'
    && typeof applicability['itemOrderingMode'] === 'string'
    && typeof applicability['independentItemState'] === 'string'
    && typeof applicability['unorderedGroupId'] === 'string'
    && applicability['serializationDisposition'] === 'metadata_only_no_runtime_order'
    && typeof applicability['userOrderPreferenceState'] === 'string'
    && applicability['parallelExecutionPolicy'] === 'not_supported_v1'
    && typeof applicability['confidence'] === 'string'
    && applicability['receiverCanActivateRuntime'] === false
    && Array.isArray(applicability['reasonCodes']);
}

function isCompleteHandoffConfirmationTargets(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every((entry) => {
    const target = asRecord(entry);
    return !!target
      && typeof target['confirmationTargetId'] === 'string'
      && typeof target['mode'] === 'string'
      && Array.isArray(target['targetRefs'])
      && Array.isArray(target['riskRefs'])
      && typeof target['bodyVisibilityState'] === 'string'
      && target['satisfiedByMetadata'] === false;
  });
}

function isCompleteHandoffSourceImpact(value: unknown): boolean {
  const sourceImpact = asRecord(value);
  return !!sourceImpact
    && typeof sourceImpact['sourceImpactMetadataId'] === 'string'
    && Array.isArray(sourceImpact['contentTemplateSourceRefs'])
    && Array.isArray(sourceImpact['contentTemplateVariantIdentityRefs'])
    && Array.isArray(sourceImpact['servedVariantEventRefs'])
    && Array.isArray(sourceImpact['recordSignalTypes'])
    && Array.isArray(sourceImpact['recordSourceTiers'])
    && Array.isArray(sourceImpact['recordSchemaVersions'])
    && Array.isArray(sourceImpact['recordQuestionRefs'])
    && Array.isArray(sourceImpact['recordPinchFallbackRefs'])
    && Array.isArray(sourceImpact['recordRegisterSnapshotRefs'])
    && Array.isArray(sourceImpact['recordRoleSnapshotRefs'])
    && Array.isArray(sourceImpact['recordMaturityLevelSnapshotRefs'])
    && Array.isArray(sourceImpact['recordSnapshotRefs'])
    && Array.isArray(sourceImpact['recordComposePathRefs'])
    && Array.isArray(sourceImpact['recordSafeguardStateRefs'])
    && Array.isArray(sourceImpact['sourceCascadeOutcomeRefs'])
    && sourceImpact['whyDescDeliveryDisposition'] === 'not_source_truth_not_future_prompt_text'
    && sourceImpact['feedbackPreemptionDisposition'] === 'not_pe_exposure_or_handoff_acceptance'
    && sourceImpact['transportEvidenceDisposition'] === 'delivery_attempt_only_not_semantic_authority'
    && sourceImpact['stageClassifierDegradedDisposition'] === 'cannot_create_handoff_candidate'
    && sourceImpact['generatedOriginPolicyState'] === 'typed_origin_lineage_required';
}

function isCompleteHandoffRuntimeGuards(value: unknown): boolean {
  const guards = asRecord(value);
  return !!guards
    && guards['createsRuntimeQueue'] === false
    && guards['permitsContinuation'] === false
    && guards['activeRuntimeState'] === 'not_created_v1'
    && guards['autoSendPolicy'] === 'prohibited'
    && guards['futurePromptBodiesRuntimePolicy'] === 'not_generated_not_stored_not_rendered'
    && guards['pointerAdvancementPolicy'] === 'prohibited'
    && guards['completionProofPolicy'] === 'not_claimed'
    && guards['responseWatcherPolicy'] === 'not_created_v1'
    && guards['durableResumePolicy'] === 'not_created_v1';
}

function isCompleteHandoffPrivacyStoragePolicy(value: unknown): boolean {
  const policy = asRecord(value);
  return !!policy
    && policy['rawPromptBodiesExcluded'] === true
    && policy['rawGeneratedBodiesExcluded'] === true
    && policy['rawSourceExcerptsExcluded'] === true
    && policy['rawFeedbackExcluded'] === true
    && policy['futurePromptBodiesStored'] === false
    && policy['oldDecisionSessionStoresAreAuthority'] === false
    && policy['productFeedbackIsPeHandoffSignal'] === false
    && policy['telemetryPolicy'] === 'ids_counts_status_only';
}

function isCompleteHandoffOwnerBoundary(value: unknown): boolean {
  const owner = asRecord(value);
  return !!owner
    && owner['semanticOwner'] === 'content_semantics'
    && owner['uiConsumer'] === 'ui_app'
    && owner['hostOwner'] === 'host_transport'
    && owner['runtimeOwnerState'] === 'future_future_sequence_only_after_gates';
}

function isCompleteUiActionInputContract(value: unknown): boolean {
  const actionInput = asRecord(value);
  return !!actionInput
    && actionInput['actionInputVersion'] === PROMPT_ENHANCEMENT_CONTRACT_VERSION
    && typeof actionInput['enhancementId'] === 'string'
    && typeof actionInput['currentBodyId'] === 'string'
    && typeof actionInput['bodyRevision'] === 'number'
    && typeof actionInput['actionId'] === 'string'
    && typeof actionInput['hostSurface'] === 'string'
    && typeof actionInput['deliveryChannel'] === 'string'
    && typeof actionInput['rendererState'] === 'string'
    && typeof actionInput['exposureAcknowledgementState'] === 'string'
    && typeof actionInput['timestampMs'] === 'number'
    && typeof actionInput['realUserInitiated'] === 'boolean'
    && typeof actionInput['editedBodyTextPolicy'] === 'string'
    && typeof actionInput['sectionSpanEditEventsPolicy'] === 'string'
    && typeof actionInput['additionalDetailsPolicy'] === 'string';
}

function isCompletePublicDiagnostics(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  return value.every((diagnostic) => {
    const item = asRecord(diagnostic);
    return !!item
      && typeof item['diagnosticId'] === 'string'
      && typeof item['category'] === 'string'
      && typeof item['publicSafeText'] === 'string'
      && item['rawPromptExcluded'] === true
      && item['rawGeneratedBodyExcluded'] === true
      && item['rawSourceExcerptExcluded'] === true
      && item['rawFeedbackExcluded'] === true
      && item['privateIdsExcluded'] === true
      && item['researchLabelsExcluded'] === true
      && item['rawReasonValuesExcluded'] === true
      && !containsUnsafeDiagnosticPayload(item)
      && !containsUnsafeDiagnosticText(item);
  });
}

const UNSAFE_PUBLIC_DIAGNOSTIC_KEYS = new Set([
  'additionalDetailsText',
  'additional_details_text',
  'autoSelectedText',
  'auto_selected_text',
  'body',
  'body_preview',
  'bodyText',
  'body_text',
  'cause',
  'editText',
  'edit_text',
  'error',
  'errorMessage',
  'error_message',
  'fallbackCopy',
  'fallback_copy',
  'generatedBody',
  'generated_body',
  'generatedBodyText',
  'generated_body_text',
  'hookJson',
  'hook_json',
  'message',
  'original_prompt_preview',
  'optionLabel',
  'option_label',
  'privatePath',
  'private_path',
  'promptText',
  'prompt_text',
  'prompt_preview',
  'rawError',
  'raw_error',
  'rawPrompt',
  'raw_prompt',
  'rawPromptText',
  'raw_prompt_text',
  'rawReason',
  'raw_reason',
  'rawStderr',
  'raw_stderr',
  'rawStdout',
  'raw_stdout',
  'reason',
  'selectedBody',
  'selected_body',
  'selectedPrompt',
  'selected_prompt',
  'selectedText',
  'selected_text',
  'sourceExcerpt',
  'source_excerpt',
  'stack',
  'stderr',
  'stdout',
  'userFeedbackText',
  'user_feedback_text',
]);

const UNSAFE_PUBLIC_DIAGNOSTIC_TEXT_PATTERNS: readonly RegExp[] = [
  /\bsk-[a-z0-9_-]{8,}\b/i,
  /\bgh[pousr]_[a-z0-9_]{12,}\b/i,
  /\bAKIA[0-9A-Z]{12,}\b/,
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*['"]?[^\s'"]{6,}/i,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\bhttps?:\/\/[^\s)]+/i,
  /(?:^|[\s`"'(])(?:\/home\/|\/Users\/|[A-Za-z]:\\)[^\s]+/i,
  /\b(?:\.env(?:\.[a-z0-9_.-]+)?|env\.(?:production|prod|staging|local)|prod\.env|production\.env)\b/i,
  /\b(?:client|customer|tenant|account|organization)\s+["'`]?[A-Z][A-Za-z0-9_-]{2,}\b/,
  /\bpe-(?:ar|cr|dr|em|wr|g)-?\d*(?:\.\d+)*\b/i,
  /pe_(?:ar|cr|dr|em|wr|g)_?\d*(?:_\d+)*/i,
  /\bphase\d+(?:[_-][a-z0-9]+)*\b/i,
  /\b(?:table|row|sqlite|sql)\s*[:#=]\s*[a-z0-9_-]{4,}/i,
  /\b(?:raw prompt|raw generated|source excerpt|selected prompt|generated body|additional details)\b/i,
];

function containsUnsafeDiagnosticPayload(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value !== 'object' || value === null) return false;
  if (seen.has(value)) return true;
  seen.add(value);

  if (value instanceof Error) return true;

  if (Array.isArray(value)) {
    return value.some((item) => containsUnsafeDiagnosticPayload(item, seen));
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (UNSAFE_PUBLIC_DIAGNOSTIC_KEYS.has(key)) return true;
    if (containsUnsafeDiagnosticPayload(child, seen)) return true;
  }

  return false;
}

function containsUnsafeDiagnosticText(value: unknown, seen = new WeakSet<object>()): boolean {
  if (typeof value === 'string') {
    return UNSAFE_PUBLIC_DIAGNOSTIC_TEXT_PATTERNS.some((pattern) => pattern.test(value));
  }
  if (typeof value !== 'object' || value === null) return false;
  if (seen.has(value)) return true;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => containsUnsafeDiagnosticText(item, seen));
  }

  return Object.values(value as Record<string, unknown>)
    .some((child) => containsUnsafeDiagnosticText(child, seen));
}

function isUnsafeSendPolicyMismatch(value: unknown): boolean {
  const obj = asRecord(value);
  const validationSummary = asRecord(obj?.['validationSummary']);
  return obj?.['disposition'] === 'show_current_body'
    && (
      validationSummary?.['sendPolicy'] === 'no_send'
      || validationSummary?.['sendPolicy'] === 'original_only'
      || validationSummary?.['sendPolicy'] === 'no_popup'
    );
}

function isUnsafeGeneratedOriginLearning(value: unknown): boolean {
  const generatedOrigin = asRecord(asRecord(value)?.['generatedOrigin']);
  const learningEligibility = asRecord(generatedOrigin?.['learningEligibility']);
  if (!learningEligibility) return false;
  return ['promptHistory', 'profile', 'stage', 'language', 'memory', 'telemetry'].some(
    (key) => learningEligibility[key] !== false,
  );
}

function isRawTransportAuthority(value: unknown): boolean {
  const obj = asRecord(value);
  const delivery = asRecord(obj?.['delivery']);
  const uiView = asRecord(obj?.['uiView']);
  const validationGraph = asRecord(obj?.['validationGraph']);
  return delivery?.['rawTransportIsSemanticAuthority'] !== false
    || uiView?.['textOnlyDeliveryIsAuthority'] !== false
    || validationGraph?.['rawTransportIsValidationProof'] !== false;
}

function isUnsafeSafetyPolicy(value: unknown): boolean {
  const validationSummary = asRecord(asRecord(value)?.['validationSummary']);
  const safetySummary = asRecord(asRecord(value)?.['safetySummary']);
  return validationSummary?.['noForegroundSafer'] !== true
    || validationSummary?.['noAutomaticSend'] !== true
    || safetySummary?.['noForegroundSafer'] !== true
    || safetySummary?.['noAutomaticSend'] !== true;
}

function isMismatchedSafetySummary(value: unknown): boolean {
  const obj = asRecord(value);
  const validationSummary = asRecord(obj?.['validationSummary']);
  const safetySummary = asRecord(obj?.['safetySummary']);
  const graphSafetyState = asRecord(asRecord(obj?.['validationGraph'])?.['safetyState']);
  const fields = [
    'validationStatus',
    'sendPolicy',
    'sensitiveActionState',
    'sourceHonestyState',
    'privacyState',
    'authorityEscalationState',
    'noForegroundSafer',
    'noAutomaticSend',
  ];
  if (!validationSummary || !safetySummary || !graphSafetyState) return false;
  return fields.some((field) => (
    validationSummary[field] !== safetySummary[field] ||
    validationSummary[field] !== graphSafetyState[field]
  ));
}

function isMismatchedCallVisibilityState(value: unknown): boolean {
  const obj = asRecord(value);
  const graph = asRecord(obj?.['validationGraph']);
  const callVisibility = asRecord(obj?.['callAndVisibilityMetadata']);
  const composerBoundary = asRecord(obj?.['composerBoundary']);
  const inputContract = asRecord(composerBoundary?.['inputContract']);
  const composerCallVisibility = asRecord(inputContract?.['callVisibilityState']);
  if (!graph || !callVisibility || !composerCallVisibility) return false;
  return graph['providerRuntimeState'] !== callVisibility['callVisibilityMode'] ||
    graph['optionalCallAvailabilityState'] !== callVisibility['optionalCallAvailabilityState'] ||
    graph['providerRuntimeState'] !== composerCallVisibility['callVisibilityMode'] ||
    graph['optionalCallAvailabilityState'] !== composerCallVisibility['optionalCallAvailabilityState'];
}

function isMismatchedCurrentBodySafetyState(value: unknown): boolean {
  const obj = asRecord(value);
  const currentBody = asRecord(obj?.['currentBody']);
  const validationSummary = asRecord(obj?.['validationSummary']);
  if (!currentBody || !validationSummary) return false;
  const generatedSafeStatus = currentBody['generatedSafeStatus'];
  const validationStatus = validationSummary['validationStatus'];
  const sendPolicy = validationSummary['sendPolicy'];

  if (sendPolicy === 'send_current') {
    return generatedSafeStatus !== 'valid' && generatedSafeStatus !== 'valid_with_fallback';
  }
  if (sendPolicy === 'no_send') {
    return generatedSafeStatus !== 'invalid_non_sendable';
  }
  if (sendPolicy === 'send_original' || sendPolicy === 'original_only' || sendPolicy === 'no_popup') {
    return generatedSafeStatus === 'valid' || generatedSafeStatus === 'valid_with_fallback';
  }
  if (validationStatus === 'invalid_non_sendable') {
    return generatedSafeStatus !== 'invalid_non_sendable';
  }
  if (validationStatus === 'original_only' || validationStatus === 'no_popup') {
    return generatedSafeStatus === 'valid' || generatedSafeStatus === 'valid_with_fallback';
  }
  return false;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function findOwnedKeys<const T extends readonly string[]>(value: unknown, keys: T): string[] {
  const found = new Set<string>();
  visitRecords(value, (record) => {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(record, key)) found.add(key);
    }
  });
  return [...found].sort();
}

function visitRecords(value: unknown, visit: (record: Record<string, unknown>) => void): void {
  const stack = [value];
  const seen = new Set<unknown>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (seen.has(current)) continue;
    seen.add(current);
    if (Array.isArray(current)) {
      stack.push(...current);
      continue;
    }
    const record = asRecord(current);
    if (!record) continue;
    visit(record);
    stack.push(...Object.values(record));
  }
}
