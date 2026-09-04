// The obligation-layer census, pinned BEHAVIOURALLY — issue 5 ships NO runtime change by owner
// ruling (§6j.4), and this file is that ruling made permanent: the universe of slot obligations
// is enumerated from the real producer's maps, exactly ONE of them provably reaches a validator
// check, and the obligation/section-name collision set is pinned at its three known strings.
//
// The census is behavioural on purpose: a literal text search misread this layer twice — an
// obligation name appearing in requiredSections is a SECTION name, not an enforced obligation,
// and prose in the composer prompt is carriage, not enforcement. The only reader that decides
// anything is the validator, so the pin asks the validator.
//
// The ruling proof (§6j.4's two prohibitions) is honoured BY ABSENCE: no new validator for
// confirmation_clarification and no severity change exist to test — the census rows below prove
// the 23 stay inert, and the untouched `:288` fixtures in safety-sendability.test.ts prove the
// existing enforcement path did not move.
import { describe, it, expect } from 'vitest';
import { routePromptEnhancement, PROMPT_ENHANCEMENT_TAXONOMY_PRESETS } from './routing-taxonomy.js';
import {
  planPromptEnhancementSections,
  SLOT_EFFECTS_BY_CAPABILITY_V1,
  type PromptEnhancementSlotObligationV1,
} from './templates/section-plan.js';
import { composePromptEnhancementBody } from './compose-enhancement.js';
import { validatePromptEnhancementSafety } from './safety-sendability.js';
import type { PromptEnhancementSourceRefV1 } from './contracts.js';

/**
 * The universe, enumerated from the producer's own maps — never a hand-kept list beside them.
 * `slotObligationsFor` reads exactly SLOT_EFFECTS_BY_CAPABILITY_V1 plus the floor map, and the
 * floor's only member (`no_invention_state`) already rides the reproduction effect, so the union
 * below IS everything the producer can ever attach. The literal pin makes drift loud.
 */
const OBLIGATION_UNIVERSE: readonly PromptEnhancementSlotObligationV1[] = [
  ...new Set(Object.values(SLOT_EFFECTS_BY_CAPABILITY_V1).flatMap((effect) => effect.obligations)),
].sort();

const MEASURED_24: readonly string[] = [
  'baseline_current_output_proof',
  'baseline_source_signal',
  'before_after_verification',
  'behavior_lock',
  'compact_first_popup_summary_support',
  'confirmation_clarification',
  'decomposition_handoff_metadata',
  'dry_run_backup_pin_deployment',
  'family_specific_verification',
  'known_unknown_wording',
  'no_invention_state',
  'no_unrelated_change_boundary',
  'ordering_dependency',
  'project_source_fact_slots',
  'public_safe_why_help_support',
  'reproduction_or_evidence_request',
  'review_checklist_challenge',
  'risk_rollback_recovery',
  'safety_hook_linkage',
  'safety_policy_hooks',
  'send_policy_metadata',
  'severity_residual_risk',
  'source_ids_evidence_state',
  'source_kind_id_evidence_metadata',
];

const sourceA: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'src-a-1',
  sourceKind: 'source_a_user_prompt',
  sourceId: 'prompt:census-1',
  freshness: 'current',
  confidence: 'high',
  privacyClass: 'local_private',
};

// Benign prompt: no risk keywords, so the census rows are not entangled with the confirmation
// machinery — the only thing that may differ between a ± pair is the obligation under test.
const BENIGN_PROMPT = 'center the hero text and make the font slightly larger';
// Section text carrying one fabricated product name ("nothing discharging it": the item appears
// in neither the prompt nor any allowed source text).
const INVENTED_SECTION_TEXT = 'Confirm the flow against RabbitMQ before shipping.';

function routeFor() {
  return routePromptEnhancement({
    routeDecisionId: 'census-route',
    promptText: BENIGN_PROMPT,
    currentStage: 'implementation',
    prevStage: 'task_breakdown',
    triggerKind: 'absence',
    firedKey: 'absence:verification_gap@implementation',
    effectiveFiredSource: 'classifier_fire_recommendation',
    selectedQualifyingAbsence: 'verification_gap',
    absenceGateReason: 'selected_qualifying_absence',
    classifierState: 'fire_recommended',
    degradedNoActionState: 'none',
    generatedOriginState: 'ordinary_user_prompt',
  });
}

function composedBody() {
  const route = routeFor();
  const planning = planPromptEnhancementSections({ routeResult: route, sourceRefs: [sourceA], guidanceFacts: [] });
  return composePromptEnhancementBody({
    enhancementId: 'census-enh',
    originalPromptText: BENIGN_PROMPT,
    sectionPlanningResult: planning,
  }).currentBody;
}

/** The same body with ONE generated section's obligations replaced — everything else identical. */
function bodyWithObligations(obligations: readonly PromptEnhancementSlotObligationV1[]) {
  const body = composedBody();
  const targetIndex = body.sections.findIndex((section) => section.sectionKind !== 'original_request_or_goal');
  expect(targetIndex).toBeGreaterThanOrEqual(0);
  const sections = body.sections.map((section, index) => index === targetIndex
    ? { ...section, slotObligations: obligations, bodyText: INVENTED_SECTION_TEXT }
    : section);
  return { ...body, sections };
}

/** Everything a validation decides, in comparable form. */
function decision(body: ReturnType<typeof bodyWithObligations>) {
  const result = validatePromptEnhancementSafety({ currentBody: body });
  return {
    failureCodes: result.failures.map((failure) => failure.failureCode).sort(),
    sendPolicy: result.sendPolicy,
    generatedSafeStatus: result.generatedSafeStatus,
    safetySummary: result.safetySummary,
  };
}

describe('the universe — enumerated from the producer, pinned so drift is loud', () => {
  it('is exactly the measured 24 names', () => {
    expect(OBLIGATION_UNIVERSE).toEqual(MEASURED_24);
  });
});

describe('the producer itself — behavioural enumeration through the real planner', () => {
  it('planning with every capability produces exactly the measured 24 — no third obligation source exists', () => {
    // The map pin above would miss a producer that grew a source beyond its two maps; this row
    // cannot: it runs the REAL planner per capability and unions what actually attached.
    const groundingFact = {
      factId: 'census-grounding-1',
      sourceType: 'content_template_record',
      sourceIds: ['ABSENCE_DEBUGGING_OBSERVATION'],
      guidanceKind: 'debug_evidence',
      suggestedActionKind: 'capture_reproduction',
      targetFamily: 'issue_debug',
      targetSectionKind: 'project_grounding_facts',
      sourceEvidenceState: 'strong',
      priority: 'required_survivor',
      renderPolicy: 'render_as_section',
      riskLevel: 'none',
      safetyHooks: ['source_honesty'],
      privacyClass: 'local_private',
      sanitizationState: 'prompt_derived_sanitized',
      publicCopySafe: true,
    } as const;
    const produced = new Set<string>();
    for (const capability of Object.keys(SLOT_EFFECTS_BY_CAPABILITY_V1)) {
      const route = routeFor();
      const planning = planPromptEnhancementSections({
        routeResult: { ...route, capabilityOverlays: [capability] } as typeof route,
        sourceRefs: [sourceA],
        guidanceFacts: capability === 'capability.project_grounding' ? [groundingFact] : [],
      });
      for (const plan of planning.sectionPlans) {
        for (const obligation of plan.slotObligations) produced.add(obligation);
      }
    }
    expect([...produced].sort()).toEqual(MEASURED_24);
  });
});

describe('the enforcement census — exactly ONE obligation reaches a validator check', () => {
  const baseline = () => decision(bodyWithObligations([]));

  it.each(OBLIGATION_UNIVERSE.filter((name) => name !== 'no_invention_state').map((name) => [name] as const))(
    '%s: a body carrying it with nothing discharging it validates IDENTICALLY to the bare body',
    (name) => {
      expect(decision(bodyWithObligations([name]))).toEqual(baseline());
    },
  );

  it('no_invention_state: the ± pair DIVERGES on a body containing an invention — the one enforced obligation', () => {
    const withObligation = decision(bodyWithObligations(['no_invention_state']));
    const without = baseline();
    expect(without.failureCodes.some((code) => code.startsWith('no_invention_state:'))).toBe(false);
    expect(withObligation.failureCodes).toContain('no_invention_state:fabricated_item:RabbitMQ');
    expect(withObligation).not.toEqual(without);
  });
});

describe('the name-collision guard — obligations and section names share EXACTLY three strings', () => {
  it('the collision set is pinned and cannot silently grow', () => {
    const sectionNameVocabulary = new Set(
      PROMPT_ENHANCEMENT_TAXONOMY_PRESETS.flatMap((preset) => [
        ...preset.requiredSections,
        ...preset.moreThoroughAdds,
      ]),
    );
    const collisions = OBLIGATION_UNIVERSE.filter((name) => sectionNameVocabulary.has(name)).sort();
    // The trio is NOT renamed — renaming touches routing presets (group-D territory). The pin
    // only guarantees a section name is never mistaken for an obligation consumer, and that a
    // fourth collision cannot arrive unnoticed from either vocabulary.
    expect(collisions).toEqual([
      'baseline_current_output_proof',
      'before_after_verification',
      'no_unrelated_change_boundary',
    ]);
  });
});
