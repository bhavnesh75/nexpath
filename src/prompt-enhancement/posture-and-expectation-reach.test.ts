// §6f (P12's planning posture) and §6g (P13's expectation facts), measured where they can be.
//
// 🔒 Guide rule, added 2026-08-26 after two sim-p01 runs answered neither bar: a measurement must
// never depend on a body appearing at a CHOSEN prompt position. Hiren: *"the DS advisory firing
// prompt number set are not accurate … so if you are struggling with that then ignore the number but
// focus on just wherever they fire."* Both bars below need a specific prompt SHAPE, which a live run
// cannot be made to produce on demand — so they are asked directly of the layers that decide them.
import { describe, it, expect } from 'vitest';
import { routePromptEnhancement } from './routing-taxonomy.js';
import { planPromptEnhancementSections } from './templates/section-plan.js';
import {
  promptEnhancementAuthorityModeForTextV1,
  promptEnhancementRiskKindsForTextV1,
} from './safety-sendability.js';
import { promptEnhancementFactValueLinesV1 } from './fact-value-render.js';
import {
  promptHistoryAcceptanceExpectationsV1,
  promptHistoryVerificationAsksV1,
  promptHistoryExpectationEvidenceValueV1,
} from './prompt-history-expectation-signals.js';
import type { PromptEnhancementGuidanceFact, PromptEnhancementSourceRefV1 } from './contracts.js';

const sourceA: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'src-a-1',
  sourceKind: 'source_a_user_prompt',
  sourceId: 'prompt:pe-1',
  freshness: 'current',
  confidence: 'high',
  privacyClass: 'local_private',
};

function postureFor(promptText: string): boolean {
  const route = routePromptEnhancement({
    routeDecisionId: 'pe-route',
    promptText,
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
  return planPromptEnhancementSections({ routeResult: route, sourceRefs: [sourceA], guidanceFacts: [] }).planningPosture;
}

/** Questions ABOUT a risky action. The developer is asking, not instructing. */
const RISKY_QUESTIONS: readonly string[] = [
  'is it safe to drop the old sessions table?',
  'should i delete the old migrations folder?',
  'is it a bad idea to force push over main?',
  'do you think i should deploy this tonight?',
  'would it be risky to truncate the events table?',
  'what happens if i drop the sessions table?',
  'how does deploying this to production actually work?',
];

/** Instructions to DO the risky thing. These belong to the confirmation lane, never the posture. */
const RISKY_INSTRUCTIONS: readonly string[] = [
  'delete the old migrations folder, we don\'t need any of it',
  'force push my branch over main, mine is the good one',
  'deploy this to production tonight before the demo',
];

/** Nothing risky at all. These must not move, or the posture has leaked. */
const UNRELATED: readonly string[] = [
  'add a notification bell icon that shows unread messages',
  'the calendar is showing the wrong time for sessions',
  'make the home page show a search bar to find groups by subject name',
  'style the whole app to look like Discord with a dark theme',
];

describe('§6f — the planning posture', () => {
  it('EVERY risky QUESTION takes the posture', () => {
    // 🔴 Was 1 of 7 when first measured (2026-08-26). The posture's condition is "not
    // execution-requested AND names a risky topic"; the risk half was right on every row, and the
    // authority half answered `execute_requested` for a question the moment it contained the risky
    // VERB — so "should i delete the old migrations folder?" was read as an order to delete it.
    // Fixed in `authorityModeFor`: a question FRAME plus an action is a question, and the planning
    // verb it also demanded is no longer required.
    const without = RISKY_QUESTIONS.filter((prompt) => !postureFor(prompt));
    expect(without).toEqual([]);
  });

  it('the authority read is what changed, and it now agrees with the risk read', () => {
    // Names the layer, so a regression points at its cause rather than the symptom.
    for (const question of RISKY_QUESTIONS) {
      expect(promptEnhancementRiskKindsForTextV1(question).length, question).toBeGreaterThan(0);
      expect(promptEnhancementAuthorityModeForTextV1(question), question).not.toBe('execute_requested');
    }
  });

  it('an INSTRUCTION to do the risky thing never takes the posture', () => {
    // The disjointness rule: asked-to-execute gets the confirmation, not-asked gets the posture,
    // and neither may claim the same prompt.
    for (const instruction of RISKY_INSTRUCTIONS) expect(postureFor(instruction), instruction).toBe(false);
  });

  it('🔑 no drift: an unrelated prompt never shifts', () => {
    for (const prompt of UNRELATED) expect(postureFor(prompt), prompt).toBe(false);
  });
});

const HISTORY = [
  'building an invoicing app for small studios',
  'it is done when a client can be marked paid and the list refreshes without me reloading the page',
  'now add the create invoice screen',
  'make sure the mark-paid button still works on mobile before we call it finished',
];

function factFor(sourceId: string, value: string, sectionKind: string): PromptEnhancementGuidanceFact {
  return {
    factId: `f-${sourceId}`,
    sourceType: 'prompt_derived_fact',
    sourceIds: [sourceId],
    sourceEligibilityState: 'support_only_not_triggering',
    guidanceKind: 'project_grounding',
    suggestedActionKind: 'ground_in_project_fact',
    targetFamily: 'family_agnostic',
    targetSectionKind: sectionKind,
    sourceEvidenceState: 'partial',
    sourceOriginScope: 'recent_prompt_history',
    claimVerbPolicy: 'must_phrase_as_possibility',
    factRole: 'project_grounding_support',
    priority: 'normal',
    renderPolicy: 'render_as_section',
    riskLevel: 'none',
    safetyHooks: [],
    privacyClass: 'public_safe',
    sanitizationState: 'not_applicable',
    evidence: { key: 'what done looks like', value, runtimePath: 'local_store', anchorScope: 'current_prompt_scope' },
    confidenceBand: 'low',
    recencyBand: 'current_session',
    publicCopySafe: true,
  } as unknown as PromptEnhancementGuidanceFact;
}

describe('§6g — the expectation facts reach a body section', () => {
  it('both producers return the developer\'s OWN words from history', () => {
    const acceptance = promptHistoryAcceptanceExpectationsV1(HISTORY);
    const verification = promptHistoryVerificationAsksV1(HISTORY);
    expect(acceptance.length).toBeGreaterThan(0);
    expect(verification.length).toBeGreaterThan(0);
    expect(promptHistoryExpectationEvidenceValueV1(acceptance[0]!))
      .toContain('a client can be marked paid and the list refreshes');
    expect(promptHistoryExpectationEvidenceValueV1(verification[0]!))
      .toContain('the mark-paid button still works on mobile');
  });

  it('and the LAST hop holds: the quoted words render as a section line', () => {
    // Session A rendered 18 acceptance/verification sections and none carried a quoted statement —
    // correctly, because `sim-s12` contains no marker phrase. This asks the hop that a live run
    // could not: given the fact, does the section state it?
    const value = promptHistoryExpectationEvidenceValueV1(promptHistoryAcceptanceExpectationsV1(HISTORY)[0]!);
    const lines = promptEnhancementFactValueLinesV1(
      'acceptance_or_output_expectation',
      [factFor('history_acceptance:1', value, 'acceptance_or_output_expectation')],
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('a client can be marked paid and the list refreshes');
  });

  it('a history that states nothing produces nothing — no filler', () => {
    const silent = ['add a notification bell', 'style the app like Discord', 'fix the header'];
    expect(promptHistoryAcceptanceExpectationsV1(silent)).toHaveLength(0);
    expect(promptHistoryVerificationAsksV1(silent)).toHaveLength(0);
  });
});
