import { describe, expect, it } from 'vitest';
import type { PromptEnhancementSourceRefV1 } from '../contracts.js';
import { composePromptEnhancementBody } from '../compose-enhancement.js';
import {
  PROMPT_ENHANCEMENT_PRIMARY_INTENTS,
  PROMPT_ENHANCEMENT_TAXONOMY_PRESETS,
  routePromptEnhancement,
  type PromptEnhancementRouteInput,
} from '../routing-taxonomy.js';
import {
  findPromptEnhancementTemplateRegistryGaps,
  getPromptEnhancementTemplateByIntent,
  getPromptEnhancementTemplateRef,
  getPromptEnhancementTemplateRegistry,
} from './registry.js';
import {
  normalizeGuidanceFacts,
  capabilityScopedSafetyFlagsV1,
  planPromptEnhancementSections,
  type PromptEnhancementGuidanceFact,
} from './section-plan.js';

const sourceA: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'source-a-current-prompt',
  sourceKind: 'source_a_user_prompt',
  sourceId: 'prompt:current',
  sourceAuthorization: 'implementation_input',
  evidenceStatus: 'present',
  freshness: 'current',
  confidence: 'high',
  privacyClass: 'local_private',
};

const contentTemplateSourceB: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'source-b-content-template',
  sourceKind: 'content_template_fact',
  sourceId: 'ABSENCE_DEBUGGING_OBSERVATION',
  sourceAuthorization: 'source_fact_only',
  evidenceStatus: 'present',
  freshness: 'current',
  confidence: 'medium',
  privacyClass: 'raw_text_excluded',
};

const hardFactSourceB: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'source-b-hard-fact',
  sourceKind: 'hard_fact_or_profile_signal',
  sourceId: 'project_fact:test-suite-present',
  sourceAuthorization: 'implementation_input',
  evidenceStatus: 'present',
  freshness: 'current',
  confidence: 'medium',
  privacyClass: 'local_private',
};

function routeInput(overrides: Partial<PromptEnhancementRouteInput>): PromptEnhancementRouteInput {
  return {
    routeDecisionId: 'phase4-route-1',
    promptText: 'Fix this failing test and include verification',
    currentStage: 'implementation',
    prevStage: 'task_breakdown',
    triggerKind: 'absence',
    firedKey: 'absence:debugging_observation_gap@implementation',
    effectiveFiredSource: 'classifier_fire_recommendation',
    selectedQualifyingAbsence: 'debugging_observation_gap',
    absenceGateReason: 'selected_qualifying_absence',
    classifierState: 'fire_recommended',
    degradedNoActionState: 'none',
    generatedOriginState: 'ordinary_user_prompt',
    ...overrides,
  };
}

function fact(overrides: Partial<PromptEnhancementGuidanceFact>): PromptEnhancementGuidanceFact {
  return {
    factId: 'fact-1',
    sourceType: 'content_template_record',
    sourceIds: ['ABSENCE_DEBUGGING_OBSERVATION'],
    guidanceKind: 'debug_evidence',
    suggestedActionKind: 'capture_reproduction',
    targetFamily: 'issue_debug',
    targetSectionKind: 'reproduction_or_evidence',
    sourceEvidenceState: 'strong',
    priority: 'required_survivor',
    renderPolicy: 'render_as_section',
    riskLevel: 'none',
    safetyHooks: ['source_honesty'],
    privacyClass: 'local_private',
    sanitizationState: 'prompt_derived_sanitized',
    publicCopySafe: true,
    ...overrides,
  };
}

describe('prompt-enhancement template registry and section planner', () => {
  it('exposes a distinct prompt-enhancement-template registry with no orphan family or primary intent', () => {
    const registry = getPromptEnhancementTemplateRegistry();

    expect(registry.registryNamespace).toBe('prompt-enhancement-templates');
    expect(registry.templateType).toBe('prompt-enhancement-template');
    expect(registry.noContentTemplateRecordEmbedding).toBe(true);
    expect(registry.noPrecomputedDirectionalVariants).toBe(true);
    expect(registry.noOldDecisionSessionRouting).toBe(true);
    expect(registry.noPeOnlyClassifier).toBe(true);
    expect(registry.records).toHaveLength(PROMPT_ENHANCEMENT_PRIMARY_INTENTS.length);
    expect(new Set(registry.records.map((record) => record.primaryIntent))).toEqual(new Set(PROMPT_ENHANCEMENT_PRIMARY_INTENTS));
    expect(findPromptEnhancementTemplateRegistryGaps()).toEqual([]);
  });

  it.each(PROMPT_ENHANCEMENT_PRIMARY_INTENTS)('maps primary intent %s to one family, skeleton, and fixture pair', (primaryIntent) => {
    const template = getPromptEnhancementTemplateByIntent(primaryIntent);
    const templateRef = getPromptEnhancementTemplateRef(primaryIntent);

    expect(template.primaryIntent).toBe(primaryIntent);
    expect(template.templateType).toBe('prompt-enhancement-template');
    expect(template.baseSkeletonId).toMatch(/^skeleton-/);
    expect(template.requiredSections.length).toBeGreaterThan(0);
    expect(template.routeFixtureIds).toHaveLength(1);
    expect(template.evaluationFixtureIds).toHaveLength(1);
    expect(template.shorterMinimum.length).toBeGreaterThan(0);
    expect(template.safetyHooks).toContain('source_honesty');
    expect(template.contentTemplateRuntimeSeamUse).toBe('none');
    expect(template.llmCallPolicy).toBe('no_call');
    expect(templateRef.registryNamespace).toBe('prompt-enhancement-templates');
    expect(templateRef.requiredSectionKinds).toEqual(template.requiredSections);
    expect(templateRef.testFixtureIds).toEqual([...template.routeFixtureIds, ...template.evaluationFixtureIds]);
  });

  it.each([
    ['issue_debug.failing_test', ['test_command_output', 'fixture_mock_context', 'narrow_fix_boundary', 'verification_or_test_plan']],
    ['maintenance.migration_schema_change', ['data_shape_change', 'migration_order', 'backup_dry_run', 'rollback_recovery', 'data_integrity_verification']],
    ['review.security_review', ['security_surface', 'threat_input_auth_secret_data_checks', 'finding_format', 'verification_or_test_plan']],
    ['feature.upgrade_extension', ['current_behavior', 'desired_extension', 'compatibility', 'verification_or_test_plan']],
    ['planning.task_breakdown', ['point_inventory_or_decomposition', 'task_order_dependencies', 'acceptance_or_output_expectation']],
  ] as const)('keeps %s section obligations as typed registry data', (primaryIntent, requiredSections) => {
    const template = getPromptEnhancementTemplateByIntent(primaryIntent);

    for (const section of requiredSections) {
      expect(template.requiredSections).toContain(section);
    }
    expect(template.metadataContract).toContain('route_input_evidence');
    expect(template.metadataContract).toContain('source_ids');
    expect(template.metadataContract).toContain('fallback_state');
  });

  it('plans required sections from the selected route before any composer body exists', () => {
    const route = routePromptEnhancement(routeInput({}));
    const result = planPromptEnhancementSections({
      routeResult: route,
      sourceRefs: [sourceA, contentTemplateSourceB],
      guidanceFacts: [fact({ factId: 'fact-debug-repro' })],
    });

    expect(result.registryNamespace).toBe('prompt-enhancement-templates');
    expect(result.exposesPrecomputedVariants).toBe(false);
    expect(result.usesOldDecisionSessionTemplateRecord).toBe(false);
    expect(result.usesPeOnlyClassifier).toBe(false);
    expect(result.bodyPlan.routeDecisionId).toBe(route.contractDecision.routeDecisionId);
    expect(result.bodyPlan.originalPromptPreservation).toBe('visible_verbatim');
    expect(result.bodyPlan.exposesPrecomputedVariants).toBe(false);
    expect(result.bodyPlan.orderedSectionPlans).toEqual(result.sectionPlans);
    expect(result.sectionPlans.map((section) => section.sectionKind)).toEqual(expect.arrayContaining([
      'original_request_or_goal',
      'test_command_output',
      'fixture_mock_context',
      'reproduction_or_evidence',
      'narrow_fix_boundary',
      'verification_or_test_plan',
      'source_signal_guidance',
    ]));
  });

  it('keeps Source A as the original section and content-template facts as Source B metadata only', () => {
    const route = routePromptEnhancement(routeInput({}));
    const result = planPromptEnhancementSections({
      routeResult: route,
      sourceRefs: [sourceA, contentTemplateSourceB],
      guidanceFacts: [fact({
        factId: 'fact-content-template-source-b',
        sourceType: 'content_template_record',
        sourceIds: ['ABSENCE_DEBUGGING_OBSERVATION'],
        targetSectionKind: 'source_signal_guidance',
        guidanceKind: 'source_signal_guidance',
        suggestedActionKind: 'add_verification',
      })],
    });

    const original = result.sectionPlans.find((section) => section.sectionKind === 'original_request_or_goal');
    const sourceGuidance = result.sectionPlans.find((section) => section.sectionKind === 'source_signal_guidance');

    expect(original?.sourceKind).toBe('source_a_user_prompt');
    expect(original?.sourceIds).toEqual(['prompt:current']);
    expect(sourceGuidance?.sourceKind).toBe('content_template_fact');
    expect(sourceGuidance?.sourceIds).toEqual(['ABSENCE_DEBUGGING_OBSERVATION']);
    expect(sourceGuidance?.contentTemplateRuntimeSeamUse).toBe('none');
    expect(sourceGuidance?.structuredContentPartRefs).toContain('guidance_fact:fact-content-template-source-b');
  });

  it('maps guidance kinds and suggested actions to deterministic section kinds without raw DS prose', () => {
    const normalized = normalizeGuidanceFacts([
      fact({
        factId: 'fact-verification',
        sourceType: 'absence_signal',
        sourceIds: ['absence:verification_gap'],
        guidanceKind: 'missing_practice',
        suggestedActionKind: 'add_verification',
        targetSectionKind: '',
      }),
      fact({
        factId: 'fact-risk',
        sourceType: 'hard_fact',
        sourceIds: ['risk:migration'],
        guidanceKind: 'safety_or_confirmation',
        suggestedActionKind: 'plan_rollback',
        targetSectionKind: '',
        riskLevel: 'high',
        safetyHooks: ['sensitive_action_confirmation'],
      }),
    ]);

    expect(normalized[0]?.targetSectionKind).toBe('verification_or_test_plan');
    expect(normalized[1]?.targetSectionKind).toBe('risk_safety_or_confirmation');
    expect(normalized[0]?.wordingHintPolicy).toBe('do_not_use_wording_hint');
    expect(normalized[0]?.llmCallPolicy).toBe('not_applicable_deterministic');
  });

  it('preserves required survivor, safety, source, and confirmation floors in section metadata', () => {
    const route = routePromptEnhancement(routeInput({
      promptText: 'Plan the database migration with backup rollback and verification',
      currentStage: 'architecture',
      firedKey: 'absence:architecture_decision_gap@architecture',
    }));
    const result = planPromptEnhancementSections({
      routeResult: route,
      sourceRefs: [sourceA, hardFactSourceB],
      guidanceFacts: [
        fact({
          factId: 'fact-rollback',
          sourceType: 'hard_fact',
          sourceIds: ['project_fact:test-suite-present'],
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'plan_rollback',
          targetFamily: 'planning_spec',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation', 'risk_or_rollback'],
          requiredBecause: 'migration_or_data_shape_change',
        }),
      ],
    });

    const risk = result.sectionPlans.find((section) => section.sectionKind === 'risk_safety_or_confirmation');

    expect(risk?.isRequired).toBe(true);
    expect(risk?.safetyFlags).toContain('source_honesty');
    expect(risk?.safetyFlags).toContain('no_authority_escalation');
    expect(risk?.safetyFlags).toContain('sensitive_action_confirmation');
    expect(risk?.safetyFlags).toContain('risk_or_rollback');
    expect(risk?.sensitivityFlags).toContain('risk:high');
    expect(risk?.supportedActions).toEqual(['use_current_body', 'use_original', 'shorter', 'more_thorough', 'more_project_grounded', 'apply_details']);
  });

  it('records suppressed, deferred, and metadata-only facts instead of silently dropping them', () => {
    const route = routePromptEnhancement(routeInput({ promptText: 'Security review this auth diff' }));
    const result = planPromptEnhancementSections({
      routeResult: route,
      sourceRefs: [sourceA, hardFactSourceB],
      guidanceFacts: [
        fact({
          factId: 'fact-metadata',
          sourceType: 'work_style_fact',
          sourceIds: ['work-style:concise'],
          guidanceKind: 'positive_practice_preservation',
          suggestedActionKind: 'no_action_render_context_only',
          targetFamily: 'family_agnostic',
          targetSectionKind: 'context_and_constraints',
          priority: 'low',
          renderPolicy: 'metadata_only',
        }),
        fact({
          factId: 'fact-suppressed',
          priority: 'suppressed',
          renderPolicy: 'suppress_with_reason',
          sourceIds: ['session_quality_low_value'],
        }),
        fact({
          factId: 'fact-deferred',
          priority: 'deferred_to_ds',
          renderPolicy: 'defer_to_normal_ds',
          sourceIds: ['old-ds:pending-advisory'],
        }),
      ],
    });

    expect(result.renderedFactIds).toEqual([]);
    expect(result.metadataOnlyFactIds).toEqual(['fact-metadata']);
    expect(result.suppressedFactIds).toEqual(['fact-suppressed']);
    expect(result.deferredFactIds).toEqual(['fact-deferred']);
  });

  it('does not create section plans or future prompt bodies for no-popup routes', () => {
    const route = routePromptEnhancement(routeInput({
      promptText: 'ok',
      triggerKind: 'none',
      firedKey: undefined,
      effectiveFiredSource: undefined,
      selectedQualifyingAbsence: undefined,
      absenceGateReason: undefined,
    }));
    const result = planPromptEnhancementSections({
      routeResult: route,
      sourceRefs: [sourceA],
      guidanceFacts: [fact({ factId: 'fact-low-info', priority: 'low', renderPolicy: 'metadata_only' })],
    });

    expect(route.noPopup).toBe(true);
    expect(result.sectionPlans).toEqual([]);
    expect(result.bodyPlan.orderedSectionPlans).toEqual([]);
    expect(result.bodyPlan.originalPromptPreservation).toBe('fallback_original_only');
    expect(result.bodyPlan.futurePromptTextPolicy).toBe('not_generated_not_stored_not_rendered');
    expect(result.bodyPlan.exposesPrecomputedVariants).toBe(false);
  });

  it('fails fast when H2 section planning lacks Source A original prompt authority', () => {
    const route = routePromptEnhancement(routeInput({}));

    expect(() => planPromptEnhancementSections({
      routeResult: route,
      sourceRefs: [contentTemplateSourceB],
    })).toThrow('Phase 4 section planning requires a Source A original prompt ref');
  });

  it('keeps every registry record free of DS template identity and hidden runtime seams', () => {
    for (const template of PROMPT_ENHANCEMENT_TAXONOMY_PRESETS) {
      expect(template.templateType).toBe('prompt-enhancement-template');
      expect(template.contentTemplateRuntimeSeamUse).toBe('none');
      expect(template.contentTemplateInputRefs).toEqual([]);
      expect(template.callVisibilityMode).toBe('deterministic');
      expect(template.llmCallPolicy).toBe('no_call');
      expect(template.fallbackContract.sendOriginalPreserved).toBe(true);
      expect(template.noPopupContract.sendOriginalPreserved).toBe(true);
    }
  });

  it('declares rejected capability compatibility instead of hiding unattached overlays', () => {
    const template = getPromptEnhancementTemplateByIntent(
      'quick_improvement.local_polish_or_small_improvement',
    );

    expect(template.capabilityCompatibility).toHaveLength(9);
    expect(template.capabilityCompatibility.find((compatibility) => (
      compatibility.capabilityId === 'capability.verification_required'
    ))).toMatchObject({
      status: 'compatible',
      reasonCode: 'declared_by_capability_contract',
    });
    expect(template.capabilityCompatibility.find((compatibility) => (
      compatibility.capabilityId === 'capability.adversarial_review'
    ))).toMatchObject({
      status: 'rejected',
      reasonCode: 'not_attached_to_selected_family_intent_or_current_scope',
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Phase S2: a capability overlay applies to the sections its design names, not to every section.
//
// Before this, three of the four safetyFlags values came from route capabilities with no section
// filter, so every section reported the identical set and the field carried no per-section
// information at all — risk_or_rollback sat on behavior_preservation, sensitive_action_confirmation
// on project_grounding_facts. Mapping from analysis L3325-3335 / dev plan L6008.
// ---------------------------------------------------------------------------------------------
describe('capability overlays are scoped to the sections their design names', () => {
  function plan(promptText: string) {
    return planPromptEnhancementSections({
      routeResult: routePromptEnhancement(routeInput({ promptText })),
      sourceRefs: [sourceA, contentTemplateSourceB],
      guidanceFacts: [],
    });
  }

  /** Sections that carry a flag, by kind, ignoring the two unconditional ones. */
  function kindsCarrying(result: ReturnType<typeof plan>, flag: string): readonly string[] {
    return result.sectionPlans.filter((s) => s.safetyFlags.includes(flag)).map((s) => s.sectionKind);
  }

  it('every section keeps the two unconditional flags — they are not capability overlays', () => {
    const result = plan('Rename the helper in utils.ts.');
    for (const section of result.sectionPlans) {
      expect(section.safetyFlags).toContain('source_honesty');
      expect(section.safetyFlags).toContain('no_authority_escalation');
    }
  });

  it('risk_or_rollback reaches only the sections the table names', () => {
    // A migration/production prompt, which is what attaches capability.risk_or_rollback.
    const result = plan('Run the production migration and delete the archived rows.');
    const carrying = kindsCarrying(result, 'risk_or_rollback');
    const allowed = new Set([
      'risk_safety_or_confirmation', 'verification_or_test_plan', 'behavior_preservation', 'handoff_or_sequence_candidate',
    ]);

    for (const kind of carrying) expect(allowed.has(kind)).toBe(true);
    // The regression this pins: it used to land on everything, including sections with no risk role.
    const grounding = result.sectionPlans.find((s) => s.sectionKind === 'project_grounding_facts');
    if (grounding) expect(grounding.safetyFlags).not.toContain('risk_or_rollback');
  });

  it('sensitive_action_confirmation reaches only its named sections, and always its own section kind', () => {
    const result = plan('Run the production migration and delete the archived rows.');
    const carrying = kindsCarrying(result, 'sensitive_action_confirmation');
    const allowed = new Set([
      'risk_safety_or_confirmation', 'verification_or_test_plan', 'behavior_preservation', 'handoff_or_sequence_candidate',
    ]);

    for (const kind of carrying) expect(allowed.has(kind)).toBe(true);
    // risk_safety_or_confirmation carries it by section kind regardless of the capability, so the
    // confirmation clause always has a home.
    const riskSection = result.sectionPlans.find((s) => s.sectionKind === 'risk_safety_or_confirmation');
    if (riskSection) expect(riskSection.safetyFlags).toContain('sensitive_action_confirmation');
  });

  it('the flags now differentiate — sections no longer all report the same set', () => {
    // The property that was false before this phase and is the whole point of it.
    const result = plan('Run the production migration and delete the archived rows.');
    const distinct = new Set(result.sectionPlans
      .filter((s) => s.sectionKind !== 'original_request_or_goal')
      .map((s) => [...s.safetyFlags].sort().join('|')));
    expect(distinct.size).toBeGreaterThan(1);
  });
});

describe('which capabilities actually reach safetyFlags', () => {
  it('pins the scoped list, so a third cannot be added silently', () => {
    // The SECTIONS_BY_CAPABILITY map transcribes the whole design table, but only the capabilities
    // that contribute a safety flag are scoped by it. A reader seeing nine entries would conclude
    // scoping is complete; it covers these two. If a future capability starts contributing a flag,
    // this fails until the list agrees — which is the point.
    expect([...capabilityScopedSafetyFlagsV1].sort()).toEqual([
      'capability.confirmation_needed',
      'capability.risk_or_rollback',
    ]);
  });

  it('a capability outside that list changes no section flags', () => {
    // capability.project_grounding appears in the map, so it looks scoped. It contributes nothing,
    // and this proves the map entry is inert rather than quietly doing something.
    const withGrounding = planPromptEnhancementSections({
      routeResult: routePromptEnhancement(routeInput({ promptText: 'Ground this in the project facts and explain the module layout.' })),
      sourceRefs: [sourceA, contentTemplateSourceB],
      guidanceFacts: [],
    });

    for (const section of withGrounding.sectionPlans) {
      // Only the two unconditional flags, plus whatever the two scoped capabilities added.
      for (const flag of section.safetyFlags) {
        expect(['source_honesty', 'no_authority_escalation', 'sensitive_action_confirmation', 'risk_or_rollback'])
          .toContain(flag);
      }
    }
  });
});

describe('S2 done-when: no capabilities means no overlay', () => {
  it('a route carrying no scoped capability leaves every section on the two unconditional flags ONLY', () => {
    // The half of the S2 plan the other tests do not cover: they assert the two unconditional flags
    // are PRESENT, which says nothing about whether an overlay leaked in. This asserts the set is
    // exactly those two — the state that was impossible before scoping, when every section carried
    // all four.
    const result = planPromptEnhancementSections({
      routeResult: routePromptEnhancement(routeInput({
        promptText: 'Rename the helper in utils.ts and keep the tests passing.',
        // Selected on its merits through the decider — the unmatched-keyword
        // terminal no longer asserts this family.
        classifierPrimaryIntent: 'quick_improvement.local_polish_or_small_improvement',
        classifierIntentConfidence: 0.9,
        classifierCapabilityCandidates: [],
        classifierDebugEvidencePresent: [],
      })),
      sourceRefs: [sourceA, contentTemplateSourceB],
      guidanceFacts: [],
    });

    const scoped = ['sensitive_action_confirmation', 'risk_or_rollback'];
    for (const section of result.sectionPlans) {
      // risk_safety_or_confirmation earns the confirmation flag by its own kind, capability or not.
      if (section.sectionKind === 'risk_safety_or_confirmation') continue;
      for (const flag of scoped) {
        expect(section.safetyFlags).not.toContain(flag);
      }
      expect([...section.safetyFlags].sort()).toEqual(['no_authority_escalation', 'source_honesty']);
    }
  });
});

// ── The why-help surface carries the under-evidenced exception reason code ──

describe('under-evidenced routes and the existing why-help surface', () => {
  const bare = {
    promptText: 'make it better please',
    firedKey: undefined,
    effectiveFiredSource: undefined,
    selectedQualifyingAbsence: undefined,
    absenceGateReason: undefined,
    triggerKind: 'manual',
  } as const;

  it('an under-evidenced route stamps the public-safe gate reason code on every planned section (codes only, no wording)', () => {
    const route = routePromptEnhancement(routeInput(bare));
    expect(route.ladderResolution.state).toBe('under_evidenced');
    const result = planPromptEnhancementSections({ routeResult: route, sourceRefs: [sourceA], guidanceFacts: [] });
    expect(result.sectionPlans.length).toBeGreaterThan(0);
    for (const section of result.sectionPlans) {
      expect(section.structuredContentPartRefs).toContain('gate_reason:under_evidenced_high_risk_exception');
    }
  });

  it('a resolved route carries no under-evidenced gate reason ref', () => {
    const route = routePromptEnhancement(routeInput({}));
    expect(route.ladderResolution.state).toBe('resolved');
    const result = planPromptEnhancementSections({ routeResult: route, sourceRefs: [sourceA], guidanceFacts: [] });
    for (const section of result.sectionPlans) {
      expect(section.structuredContentPartRefs).not.toContain('gate_reason:under_evidenced_high_risk_exception');
    }
  });
});

// ── The slot-effect layer: an attached capability CONTRIBUTES its locked effect ──

describe('slot obligations: layer 3 is no longer declared-but-inert', () => {
  // ⚠️ A grounding fact is supplied because `project_grounding_facts` now FOLLOWS ITS FACTS
  // (Hiren's ruling on the sim finding): with none, the section is not planned and there is no
  // section to carry obligations. That is the intended behaviour, and it is pinned in
  // `fact-value-render.test.ts`. What THIS block guards is different — that a section which DOES
  // exist carries its locked layer-3 obligations — so the fact is the input that lets it be asked.
  const groundingFact = {
    factId: 'f-ground', sourceType: 'hard_fact', sourceIds: ['hard_fact:has_test_runner'],
    guidanceKind: 'project_grounding', suggestedActionKind: 'ground_in_project_fact',
    targetFamily: 'family_agnostic', targetSectionKind: '', sourceEvidenceState: 'strong',
    sourceOriginScope: 'local_probe', claimVerbPolicy: 'may_state_as_project_capability',
    priority: 'normal', renderPolicy: 'render_as_section', riskLevel: 'none',
    privacyClass: 'local_private', sanitizationState: 'not_applicable',
    evidence: { key: 'has_test_runner', value: 'true' }, sourceRuntimePath: 'local_store',
    sourceAnchorScope: 'project_root', safetyHooks: [], publicCopySafe: true,
  };
  const planFor = (intent: string, candidates: readonly string[] = []) => {
    const route = routePromptEnhancement(routeInput({
      promptText: 'exercise the slot-effect layer',
      classifierPrimaryIntent: intent as never,
      classifierIntentConfidence: 0.9,
      classifierCapabilityCandidates: candidates as never,
      classifierDebugEvidencePresent: ['reproduction_steps', 'logs'] as never,
    }));
    return planPromptEnhancementSections({
      routeResult: route, sourceRefs: [sourceA], guidanceFacts: [groundingFact] as never,
    });
  };
  const obligationsOf = (result: ReturnType<typeof planPromptEnhancementSections>, kind: string) =>
    result.sectionPlans.find((section) => section.sectionKind === kind)?.slotObligations ?? [];

  it('CARRY route: the repro section keeps no-invention protection even with the request OFF', () => {
    // The inversion this guards (owner ruling 2026-08-17): protection used to
    // ride the capability, so a section was protected when the developer
    // supplied NOTHING and unprotected once they supplied real evidence a model
    // could embroider into invented specifics. The section renders generated
    // text either way, so the protection is a floor, not a capability effect.
    const carry = planFor('issue_debug.failing_test');
    expect(carry.capabilityOverlays ?? []).not.toContain('capability.reproduction_or_evidence_needed');
    expect(obligationsOf(carry, 'reproduction_or_evidence')).toContain('no_invention_state');
    expect(obligationsOf(carry, 'reproduction_or_evidence')).not.toContain('reproduction_or_evidence_request');
  });

  it('the floor covers every composed-prose section — and never the user-verbatim section', () => {
    // Pre-widening this pinned the floor to reproduction_or_evidence alone; the reach widening
    // is the deliberate change: every planned prose section now carries the no-invention state,
    // and the one exclusion is the section that IS the user's verbatim prompt.
    const carry = planFor('issue_debug.failing_test');
    for (const section of carry.sectionPlans) {
      if (section.sectionKind === 'original_request_or_goal') {
        expect(section.slotObligations).not.toContain('no_invention_state');
      } else {
        expect(section.slotObligations).toContain('no_invention_state');
      }
    }
  });

  it('the floor is universal across EVERY preset intent — no route plans an unprotected prose section', () => {
    // The vocabulary is ~200 section kinds fed by the presets, so a per-kind pin cannot cover
    // it; this walks every preset through the real planner and demands the floor on each
    // planned prose section, with the user-verbatim section as the only exclusion.
    for (const preset of PROMPT_ENHANCEMENT_TAXONOMY_PRESETS) {
      const result = planFor(preset.primaryIntent);
      expect(result.sectionPlans.length).toBeGreaterThan(1);
      for (const section of result.sectionPlans) {
        if (section.sectionKind === 'original_request_or_goal') {
          expect(section.slotObligations).not.toContain('no_invention_state');
        } else {
          expect(section.slotObligations, `${preset.primaryIntent} / ${section.sectionKind}`).toContain('no_invention_state');
        }
      }
    }
  });

  it('reproduction_or_evidence_needed FIRST: its section carries the request obligation AND the typed no-invention state', () => {
    const result = planFor('issue_debug.reproduction_discovery');
    const obligations = obligationsOf(result, 'reproduction_or_evidence');
    expect(obligations).toContain('reproduction_or_evidence_request');
    expect(obligations).toContain('no_invention_state');
  });

  it.each([
    ['maintenance.refactor_no_behavior_change', 'behavior_preservation', ['behavior_lock', 'baseline_current_output_proof', 'no_unrelated_change_boundary', 'before_after_verification']],
    ['review.security_review', 'finding_format', ['review_checklist_challenge', 'severity_residual_risk']],
    ['issue_debug.failing_test', 'project_grounding_facts', ['project_source_fact_slots', 'known_unknown_wording', 'source_ids_evidence_state']],
    ['planning.spec_or_prd', 'risk_safety_or_confirmation', ['confirmation_clarification', 'send_policy_metadata', 'safety_hook_linkage']],
    ['feature.fresh_implementation', 'verification_or_test_plan', ['family_specific_verification']],
    ['maintenance.risk_rollback_heavy', 'risk_safety_or_confirmation', ['risk_rollback_recovery', 'dry_run_backup_pin_deployment', 'safety_policy_hooks']],
    ['planning.task_breakdown', 'point_inventory_or_decomposition', ['decomposition_handoff_metadata', 'compact_first_popup_summary_support', 'ordering_dependency']],
    ['issue_debug.failing_test', 'source_signal_guidance', ['baseline_source_signal', 'source_kind_id_evidence_metadata', 'public_safe_why_help_support']],
  ])('%s: the %s section carries its locked obligations', (intent, kind, expected) => {
    const obligations = obligationsOf(planFor(intent), kind);
    for (const obligation of expected) expect(obligations).toContain(obligation);
  });

  it('an unattached capability contributes nothing: the quick merit route gains no capability obligations', () => {
    const result = planFor('quick_improvement.local_polish_or_small_improvement');
    // The universal prose floor rides every kind now; what this pins is that CAPABILITY
    // obligations still arrive only with their capability — behavior_lock never leaks in, and
    // the verification section carries exactly its own obligation plus the floor.
    expect(obligationsOf(result, 'verification_or_test_plan')).toEqual(['family_specific_verification', 'no_invention_state']);
    for (const section of result.sectionPlans) {
      expect(section.slotObligations).not.toContain('behavior_lock');
    }
  });

  it('two capabilities sharing a target section UNION their obligations', () => {
    const result = planFor('maintenance.risk_rollback_heavy', ['capability.confirmation_needed']);
    const obligations = obligationsOf(result, 'risk_safety_or_confirmation');
    expect(obligations).toContain('risk_rollback_recovery');
    expect(obligations).toContain('confirmation_clarification');
  });

  it('the obligations travel onto the COMPOSED section unchanged', () => {
    const result = planFor('issue_debug.reproduction_discovery');
    const compose = composePromptEnhancementBody({
      enhancementId: 'slot-effect-compose',
      originalPromptText: 'exercise the slot-effect layer',
      sectionPlanningResult: result,
    });
    const section = (compose.currentBody?.sections ?? []).find((entry) => entry.sectionKind === 'reproduction_or_evidence');
    expect(section?.slotObligations).toContain('no_invention_state');
  });
});
