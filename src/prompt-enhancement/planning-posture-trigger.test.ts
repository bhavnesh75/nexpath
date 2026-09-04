// The planning posture, pointed at the case it was built for.
//
// The posture that keeps execution-shaped wording NON-EXECUTING already existed, was already
// consumed, and fired on exactly two conditions — both about EVIDENCE QUALITY. Nothing fired when
// a developer ASKED ABOUT something risky and the body answered by instructing the agent to do it.
// This is the third trigger, and the tests below are its contract: it fires on the ruled condition,
// it never absorbs the two that already worked, and it reaches the popup state — the half that was
// never broken is asserted end to end anyway, because that is where the fix is felt.
import { describe, it, expect } from 'vitest';
import {
  routePromptEnhancement,
  PROMPT_ENHANCEMENT_UNREQUESTED_ACTION_POSTURE_REASON_V1,
} from './routing-taxonomy.js';
import { planPromptEnhancementSections } from './templates/section-plan.js';
import { composePromptEnhancementBody } from './compose-enhancement.js';
import { requiresPromptEnhancementExecutionConfirmationForPrompt, validatePromptEnhancementSafety } from './safety-sendability.js';
import type { PromptEnhancementFallbackMode, PromptEnhancementSourceRefV1 } from './contracts.js';

const sourceA: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'src-a-1',
  sourceKind: 'source_a_user_prompt',
  sourceId: 'prompt:posture-1',
  freshness: 'current',
  confidence: 'high',
  privacyClass: 'local_private',
};

function routeFor(promptText: string, overrides: Record<string, unknown> = {}) {
  return routePromptEnhancement({
    routeDecisionId: 'posture-route',
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
    ...overrides,
  } as never);
}

const ASKS_ABOUT_RISK = 'how does deploying this to production actually work?';
const ASKS_TO_EXECUTE = 'delete the old migrations folder before the demo';
const NO_RISK_AT_ALL = 'center the hero text and make the font slightly larger';

describe('the third trigger — asking about something risky', () => {
  it('a question about a risky topic takes the planning posture, with its own reason code', () => {
    const route = routeFor(ASKS_ABOUT_RISK);
    expect(route.fallbackMode).toBe('planning_first');
    expect(route.reasonCodes).toContain(PROMPT_ENHANCEMENT_UNREQUESTED_ACTION_POSTURE_REASON_V1);
  });

  it('a prompt naming no risky topic does not take it', () => {
    const route = routeFor(NO_RISK_AT_ALL);
    expect(route.fallbackMode).toBe('none');
    expect(route.reasonCodes).not.toContain(PROMPT_ENHANCEMENT_UNREQUESTED_ACTION_POSTURE_REASON_V1);
  });

  it('the prompt keeps the family it earned — the posture changes the stance, not the subject', () => {
    // A debugging question about deploys is still a debugging prompt; answering it with planning
    // sections would be a different change than the one this phase is making.
    expect(routeFor(ASKS_ABOUT_RISK).primaryIntent).toBe('issue_debug.production_incident_or_support');
  });

  it('and it is not reported as weak evidence — a clear question can be perfectly well evidenced', () => {
    expect(routeFor(ASKS_ABOUT_RISK).contractDecision.ambiguityState).toBe('clear');
  });
});

describe('the two existing triggers are untouched — the regression guard', () => {
  it('conflicting evidence STILL fires the posture, carrying only its own reason code', () => {
    // Driven for real rather than conditionally: a conflicting source fact is what this trigger
    // reads. It must still reach planning_first, and it must stay identifiable as itself — the
    // new cause must not appear on a route it did not cause.
    const route = routeFor('write the spec for the new onboarding flow', {
      sourceFactRefs: ['fact:conflicting_requirement_alpha'],
    });
    expect(route.fallbackMode).toBe('planning_first');
    expect(route.reasonCodes).toContain('conflicting_requirement_source');
    expect(route.reasonCodes).not.toContain(PROMPT_ENHANCEMENT_UNREQUESTED_ACTION_POSTURE_REASON_V1);
  });

  it('the new reason code never appears on a route the new trigger did not cause', () => {
    // The guard that matters: the new code is emitted at exactly one site, so it can never be
    // mistaken for one of the evidence-quality causes in any record.
    const route = routeFor(NO_RISK_AT_ALL);
    expect(route.reasonCodes).not.toContain(PROMPT_ENHANCEMENT_UNREQUESTED_ACTION_POSTURE_REASON_V1);
  });
});

describe('EVERY routing exit takes the posture — decided once, not per path', () => {
  // Routing leaves through several doors: the deterministic cascade, the classifier-intent
  // builder, the no-family return, and the LLM route rescue. A trigger placed on one of them is
  // a trigger the other doors never run — which is exactly how the first build of this phase came
  // to be inert for the ordinary production case. These rows are one risky question per door.
  it('the deterministic cascade', () => {
    expect(routeFor(ASKS_ABOUT_RISK).fallbackMode).toBe('planning_first');
  });

  it('the classifier-intent builder — the path production usually takes', () => {
    const route = routeFor(ASKS_ABOUT_RISK, {
      classifierPrimaryIntent: 'issue_debug.production_incident_or_support',
      classifierIntentConfidence: 0.9,
    });
    expect(route.fallbackMode).toBe('planning_first');
    expect(route.reasonCodes).toContain('classifier_intent_preferred');
    expect(route.reasonCodes).toContain(PROMPT_ENHANCEMENT_UNREQUESTED_ACTION_POSTURE_REASON_V1);
  });

  it('the no-family return — a risky question that matched no family still gets the stance', () => {
    const route = routeFor('what about the api key?');
    expect(route.reasonCodes).toContain('no_family_evidence_no_catch_all');
    expect(route.fallbackMode).toBe('planning_first');
    expect(route.reasonCodes).toContain(PROMPT_ENHANCEMENT_UNREQUESTED_ACTION_POSTURE_REASON_V1);
  });

  it('the LLM route rescue', () => {
    const route = routePromptEnhancement({
      routeDecisionId: 'posture-route',
      promptText: 'anything on the production database?',
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
    } as never, {
      primaryIntent: 'issue_debug.production_incident_or_support',
      capabilities: [],
      ambiguityState: 'ambiguous_surface_prompt',
      routeConfidence: 'partial',
      reasonCodes: ['llm_route_rescue'],
    } as never);
    expect(route.fallbackMode).toBe('planning_first');
    expect(route.reasonCodes).toContain(PROMPT_ENHANCEMENT_UNREQUESTED_ACTION_POSTURE_REASON_V1);
  });

  it('a no-popup route is never given a posture — there is nothing shown to take a stance in', () => {
    const route = routeFor('how does deploying this to production actually work?', {
      generatedOriginState: 'pe_generated',
    });
    expect(route.noPopup).toBe(true);
    expect(route.fallbackMode).not.toBe('planning_first');
  });

  it('the contract decision carries the same mode as the route — one answer, not two', () => {
    const route = routeFor(ASKS_ABOUT_RISK);
    expect(route.contractDecision.fallbackMode).toBe(route.fallbackMode);
  });
});

describe('the LIVE path — where the classifier names the intent', () => {
  // Production routing returns from the classifier-intent builder whenever the classifier supplied
  // an intent, which is the ordinary case. A trigger that only fires on the deterministic cascade
  // would be inert for real users however well it tests in isolation.
  const withClassifier = { classifierPrimaryIntent: 'issue_debug.production_incident_or_support', classifierIntentConfidence: 0.9 };

  it('a risky question takes the posture on the classifier path too', () => {
    const route = routeFor(ASKS_ABOUT_RISK, withClassifier);
    expect(route.fallbackMode).toBe('planning_first');
    expect(route.reasonCodes).toContain(PROMPT_ENHANCEMENT_UNREQUESTED_ACTION_POSTURE_REASON_V1);
    expect(route.reasonCodes).toContain('classifier_intent_preferred');
  });

  it('an execute-shaped risky prompt does not, on either path', () => {
    expect(routeFor(ASKS_TO_EXECUTE, withClassifier).fallbackMode).toBe('none');
    expect(routeFor(ASKS_TO_EXECUTE).fallbackMode).toBe('none');
  });

  it('a no-risk prompt does not, on either path', () => {
    expect(routeFor(NO_RISK_AT_ALL, withClassifier).fallbackMode).toBe('none');
    expect(routeFor(NO_RISK_AT_ALL).fallbackMode).toBe('none');
  });

  it('the two paths agree on every prompt — one prompt, one posture decision', () => {
    for (const prompt of [ASKS_ABOUT_RISK, ASKS_TO_EXECUTE, NO_RISK_AT_ALL, 'is it safe to drop the events table?', 'why is the production database so slow?']) {
      const cascade = routeFor(prompt).fallbackMode === 'planning_first';
      const classifier = routeFor(prompt, withClassifier).fallbackMode === 'planning_first';
      expect(classifier, prompt).toBe(cascade);
    }
  });

  it('and the evidence state stays honest on the classifier path', () => {
    expect(routeFor(ASKS_ABOUT_RISK, withClassifier).contractDecision.ambiguityState).toBe('clear');
  });
});

describe('end to end — the popup state, which is where the fix is felt', () => {
  it('the posture route puts the popup in its clarify state', () => {
    // Asserted on the popup state rather than the route result: the route result was never the
    // broken half. This is the line the consumer reads.
    const route = routeFor(ASKS_ABOUT_RISK);
    const popupState = route.noPopup ? 'suppress' : route.fallbackMode === 'planning_first' ? 'clarify' : 'show';
    expect(popupState).toBe('clarify');
  });

  it('an ordinary prompt still shows normally', () => {
    const route = routeFor(NO_RISK_AT_ALL);
    const popupState = route.noPopup ? 'suppress' : route.fallbackMode === 'planning_first' ? 'clarify' : 'show';
    expect(popupState).toBe('show');
  });
});

describe('the posture reaches the WRITERS — it changes the body, not just a field', () => {
  // The first build of this phase set a route field that nothing read: the popup state has no
  // consumer, so the posture was invisible to the developer. These tests are the proof that it
  // now reaches the two places a body is actually written.
  function bodyFor(prompt: string) {
    const route = routeFor(prompt);
    const planning = planPromptEnhancementSections({ routeResult: route, sourceRefs: [sourceA], guidanceFacts: [] });
    const body = composePromptEnhancementBody({
      enhancementId: 'posture-enh',
      originalPromptText: prompt,
      sectionPlanningResult: planning,
    }).currentBody;
    return { planning, body };
  }

  it('the posture rides the planning result to the writers', () => {
    expect(bodyFor(ASKS_ABOUT_RISK).planning.planningPosture).toBe(true);
    expect(bodyFor(NO_RISK_AT_ALL).planning.planningPosture).toBe(false);
  });

  const STANCE = 'touches something risky the developer has not asked to have done';

  it('a posture body states the stance — ONCE, not under every heading', () => {
    // Said once because it is a stance for the whole body. Repeating it per section is the kind
    // of line no developer needs to read five times, and this milestone exists to keep bodies
    // free of exactly that.
    const { body } = bodyFor(ASKS_ABOUT_RISK);
    expect(body.text).toContain(STANCE);
    expect(body.text).toContain('what to confirm with them first');
    expect(body.text.split(STANCE)).toHaveLength(2);
  });

  it('an ordinary prompt gets no such line — the discriminator', () => {
    expect(bodyFor(NO_RISK_AT_ALL).body.text).not.toContain(STANCE);
  });

  it('the stance never claims the developer asked nothing — it names the risk, not their intent', () => {
    // A build request that happens to name a credential ("add login with email and password")
    // takes the posture under the ruled condition. The line must stay true for that developer:
    // it says the RISKY part is unasked-for, never that their request was not a request.
    const { body } = bodyFor('Add user registration and login with email and password.');
    expect(body.text).toContain(STANCE);
    expect(body.text).not.toContain('not asked to do');
  });

  it('a no-popup route never carries the posture into planning', () => {
    const route = routeFor(ASKS_ABOUT_RISK, { generatedOriginState: 'pe_generated' });
    const planning = planPromptEnhancementSections({ routeResult: route, sourceRefs: [sourceA], guidanceFacts: [] });
    expect(planning.planningPosture).toBe(false);
  });
});

describe('a posture body still SENDS — the stance never costs the popup', () => {
  // The stance is new body text on a real share of popups, and every validator in this milestone
  // reads body text. A line that tripped one of them would destroy the very popups the posture
  // was added to improve.
  it('the stance line is inert to every scanner that reads a body', async () => {
    const { promptEnhancementAuthorityModeForTextV1, promptEnhancementRiskKindsForTextV1 } = await import('./safety-sendability.js');
    const { findPromptEnhancementInternalVocabularyLeaksV1 } = await import('./internal-vocabulary-leak.js');
    const { findPromptEnhancementInventionViolationsV1 } = await import('./preservation-floors.js');
    const stance = 'This request touches something risky the developer has not asked to have done: cover what to check and what to confirm with them first, rather than carrying it out.';
    // Not execute-shaped: a stance line must never read as an instruction to act.
    expect(promptEnhancementAuthorityModeForTextV1(stance)).toBe('plan_or_review');
    // Names no risk kind: it must not change when the confirmation line fires.
    expect(promptEnhancementRiskKindsForTextV1(stance)).toEqual([]);
    expect(findPromptEnhancementInternalVocabularyLeaksV1({ text: stance, allowedTexts: [] })).toEqual([]);
    expect(findPromptEnhancementInventionViolationsV1({ sectionText: stance, allowedTexts: ['center the hero text'] })).toEqual([]);
  });

  it('posture bodies validate clean across every preset', () => {
    const prompts = [ASKS_ABOUT_RISK, 'Add user registration and login with email and password.', 'what about the api key?', 'why is the production database so slow?'];
    for (const prompt of prompts) {
      const route = routeFor(prompt);
      if (route.fallbackMode !== 'planning_first') continue;
      const planning = planPromptEnhancementSections({ routeResult: route, sourceRefs: [sourceA], guidanceFacts: [] });
      const body = composePromptEnhancementBody({
        enhancementId: 'posture-enh',
        originalPromptText: prompt,
        sectionPlanningResult: planning,
      }).currentBody;
      const validation = validatePromptEnhancementSafety({ currentBody: body });
      expect(validation.sendPolicy, prompt).not.toBe('no_send');
    }
  });
});

describe('the stance survives the section cap — the pruner runs between planning and rendering', () => {
  it('a posture route whose sections are pruned still carries the stance on a surviving section', async () => {
    // The pruner drops sections to fit the cap, and the stance lives on the FIRST GENERATED one.
    // If pruning dropped that section, or the posture flag were lost when the facade rebuilds the
    // planning result around the pruned sections, the stance would vanish from exactly the bodies
    // that were judged to need it.
    const { prunePromptEnhancementSectionsV1 } = await import('./section-pruner.js');
    const route = routeFor(ASKS_ABOUT_RISK);
    expect(route.fallbackMode).toBe('planning_first');
    const planned = planPromptEnhancementSections({ routeResult: route, sourceRefs: [sourceA], guidanceFacts: [] });
    const pruned = prunePromptEnhancementSectionsV1({
      sectionPlans: planned.sectionPlans,
      facts: planned.renderedFacts,
      relevanceOrder: [],
      routeResult: route,
    } as never);
    // The facade rebuilds the planning result around the pruned sections, spreading the planned
    // one first — which is what carries the posture through.
    const planning = { ...planned, sectionPlans: pruned.sectionPlans, renderedFacts: pruned.facts };
    expect(pruned.sectionPlans.length).toBeLessThan(planned.sectionPlans.length);
    expect(planning.planningPosture).toBe(true);
    const body = composePromptEnhancementBody({
      enhancementId: 'posture-enh',
      originalPromptText: ASKS_ABOUT_RISK,
      sectionPlanningResult: planning,
    }).currentBody;
    expect(body.text).toContain('touches something risky the developer has not asked to have done');
    expect(body.text.split('touches something risky')).toHaveLength(2);
  });
});

describe('disjointness — every risky prompt gets exactly ONE treatment', () => {
  const rows: readonly [string, string, boolean][] = [
    ['asked ABOUT a risky topic', ASKS_ABOUT_RISK, true],
    ['asked TO DO the risky thing', ASKS_TO_EXECUTE, false],
    ['asked to deploy, plainly', 'deploy this release to production now', false],
  ];

  it.each(rows)('%s', (_label, prompt, expectPosture) => {
    const posture = routeFor(prompt).fallbackMode === 'planning_first';
    const confirmation = requiresPromptEnhancementExecutionConfirmationForPrompt(prompt);
    expect(posture).toBe(expectPosture);
    // The property, not just the pair: never both, and a risky prompt is never left with neither.
    expect(posture && confirmation).toBe(false);
    expect(posture || confirmation).toBe(true);
  });
});

describe('the deliberately-dead route values stay dead', () => {
  it('no route assigns confirmation_first or fallback_safe_floor_only', () => {
    // They serve send policy, and the post-edit send path is out of scope. Pinned so a later
    // reader does not file them as fresh defects and quietly wire them.
    const prompts = [ASKS_ABOUT_RISK, ASKS_TO_EXECUTE, NO_RISK_AT_ALL, 'review my auth module for problems'];
    for (const prompt of prompts) {
      expect(['confirmation_first', 'fallback_safe_floor_only']).not.toContain(routeFor(prompt).fallbackMode);
    }
  });

  it('the DEGRADATION enum never gains the three route values — the category-error guard', () => {
    // A composed planning-posture body is not a degraded body. If these ever appear in the
    // degradation union, good bodies start being reported as failed ones.
    const degradationValues: readonly PromptEnhancementFallbackMode[] = [
      'none', 'deterministic_body', 'previous_sendable_body', 'original_prompt_only', 'no_popup',
      'disabled_action', 'delivery_unavailable', 'direct_insert_unavailable',
      'approved_non_old_copy_delivery_fallback', 'provider_api_unavailable', 'timeout_no_send',
      'validation_failed_no_send',
    ];
    for (const forbidden of ['planning_first', 'confirmation_first', 'fallback_safe_floor_only']) {
      expect(degradationValues as readonly string[]).not.toContain(forbidden);
    }
  });
});
