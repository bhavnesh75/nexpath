// The invention gate's REACH — the working gate pointed at every composed-prose section, with
// the consumer-side guard that makes the widening safe to ship.
//
// Order matters and is the whole design: the guard lands with the widening in one change
// because the corpus measured exactly four false positives (all one commands-matcher class) that
// would each have DESTROYED a real popup on day one of an unguarded widening. The shared matcher
// is byte-untouched — a command the USER wrote keeps its preservation floor.
//
// Deliberate omission, recorded: the old "Redis is not flagged" recall-hole pin is NOT written —
// the curated-list phase is its deliberate closure, and that phase's fixture table (invented ⇒
// detected / prompt-named ⇒ allowed) is the pin's successor.
import { describe, it, expect } from 'vitest';
import { routePromptEnhancement } from './routing-taxonomy.js';
import { planPromptEnhancementSections } from './templates/section-plan.js';
import { composePromptEnhancementBody } from './compose-enhancement.js';
import { validatePromptEnhancementSafety } from './safety-sendability.js';
import {
  findPromptEnhancementInventionViolationsV1,
  checkPromptEnhancementPreservationFloorsV1,
} from './preservation-floors.js';
import type { PromptEnhancementSourceRefV1 } from './contracts.js';

const sourceA: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'src-a-1',
  sourceKind: 'source_a_user_prompt',
  sourceId: 'prompt:reach-1',
  freshness: 'current',
  confidence: 'high',
  privacyClass: 'local_private',
};

const BENIGN_PROMPT = 'center the hero text and make the font slightly larger';
// An invented CamelCase product name — the shape the detector always caught; what was broken
// was WHERE the gate looked, so the fixtures assert on composed bodies through the validator.
const INVENTED_NAME_SENTENCE = 'Wire the flow through FlowMatic before shipping.';

function composedBody(prompt: string) {
  const route = routePromptEnhancement({
    routeDecisionId: 'reach-route',
    promptText: prompt,
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
  const planning = planPromptEnhancementSections({ routeResult: route, sourceRefs: [sourceA], guidanceFacts: [] });
  return composePromptEnhancementBody({
    enhancementId: 'reach-enh',
    originalPromptText: prompt,
    sectionPlanningResult: planning,
  }).currentBody;
}

function validateWithSectionText(sectionIndex: number, bodyText: string) {
  const body = composedBody(BENIGN_PROMPT);
  const sections = body.sections.map((section, index) => index === sectionIndex ? { ...section, bodyText } : section);
  return { body: { ...body, sections }, result: validatePromptEnhancementSafety({ currentBody: { ...body, sections } }) };
}

describe('per newly-covered kind — the gate now inspects every planned prose section', () => {
  const body = composedBody(BENIGN_PROMPT);
  const proseSections = body.sections
    .map((section, index) => ({ index, kind: section.sectionKind }))
    .filter(({ kind }) => kind !== 'original_request_or_goal');

  it('the plan produces multiple prose kinds to cover (the fixture is not vacuous)', () => {
    expect(proseSections.length).toBeGreaterThan(2);
  });

  it.each(proseSections.map(({ index, kind }) => [kind, index] as const))(
    '%s: an invented CamelCase name in the composed body is a blocking violation',
    (_kind, index) => {
      const { result } = validateWithSectionText(index, INVENTED_NAME_SENTENCE);
      expect(result.failures.some((failure) => failure.failureCode === 'no_invention_state:fabricated_item:FlowMatic')).toBe(true);
      expect(result.sendPolicy).toBe('no_send');
    },
  );

  it('the user-verbatim section stays excluded — the user cannot invent their own prompt', () => {
    const body = composedBody('rename StripeCheckout to PaymentFlow across the app');
    const original = body.sections.find((section) => section.sectionKind === 'original_request_or_goal');
    expect(original).toBeDefined();
    expect(original!.slotObligations).not.toContain('no_invention_state');
  });
});

describe('the four real leaks, verbatim from shipped bodies — each produces ZERO violations', () => {
  const leaks = [
    'Documenting decisions helps make necessary changes without losing track of the goal.',
    'Gather the key facts first so you can make informed decisions about the layout.',
    'Review the theme values to make settings consistent across every screen.',
    'Before wrapping up, make actually sure the flow still works end to end.',
  ] as const;

  it.each(leaks.map((sentence) => [sentence] as const))(
    '%s',
    (sentence) => {
      // Detector level: the guard skips the prose-shaped commands item.
      expect(findPromptEnhancementInventionViolationsV1({ sectionText: sentence, allowedTexts: [BENIGN_PROMPT] }))
        .toEqual([]);
      // And through the live validator on a widened section: the popup is not destroyed.
      const { result } = validateWithSectionText(1, sentence);
      expect(result.failures.some((failure) => failure.failureCode.startsWith('no_invention_state:'))).toBe(false);
    },
  );

  it('a real invented command still reports — the guard skips prose, not invocations', () => {
    expect(
      findPromptEnhancementInventionViolationsV1({ sectionText: 'Then run npm install to pull the package.', allowedTexts: [BENIGN_PROMPT] })
        .map((violation) => violation.item.trim()),
    ).toContain('npm install');
  });
});

describe('the floor is untouched — the shared matcher still guards what the USER wrote', () => {
  it("a user's `npm run build` dropped from the body is still a preservation violation", () => {
    const violations = checkPromptEnhancementPreservationFloorsV1({
      originalPromptText: 'run npm run build and fix whatever breaks',
      generatedBodyText: 'Fix whatever breaks in the build step.',
    });
    expect(violations.some((violation) => violation.floorId === 'commands')).toBe(true);
  });

  it("a user's command carried into the body passes, exactly as before", () => {
    const violations = checkPromptEnhancementPreservationFloorsV1({
      originalPromptText: 'run npm run build and fix whatever breaks',
      generatedBodyText: 'Run npm run build, then fix whatever breaks.',
    });
    expect(violations.some((violation) => violation.floorId === 'commands')).toBe(false);
  });
});

describe('the acceptance bar — welcome directions survive the widened gate through the validator', () => {
  // The K rows, verbatim from the owner's rulings: substantial, directive content on the
  // user's own ask. Suppressing any of these fails the sub-milestone whatever else is won.
  const keepRows: readonly [string, string, string][] = [
    ['K1 sequencing his own ask',
      'Create a React app with a home page that shows study groups as cards',
      '1. Set up the React environment. 2. Create the components needed for the home page layout. 3. Design the card component. 4. Fetch study group data.'],
    ['K2 diagnostic direction from her prompt',
      "she said when she types a long message it cuts off and the send button is overlapping, she's on chrome same as me",
      "First, I'll compare both screens to identify layout differences between my laptop and hers. Then I'll check the Chrome settings on her device."],
    ['K3 the checklist she asked for',
      'is there anything obvious i should check before showing it to my professor?',
      '1. Check the layout on a phone. 2. Confirm the demo data loads. 3. Reread what the professor asked for.'],
    ['K4 her own question, sharpened',
      'i hardcoded my key sk-live-abc123 in the app, should i move it to env',
      'I need to figure out if hardcoding my key into the app is a bad idea and why I should switch this to an environment variable instead.'],
    ['K5 the safety lane on a real secret',
      'i hardcoded my key sk-live-abc123 in the app, should i move it to env',
      'Before switching to environment variables, I gotta ask for go-ahead confirmation.'],
  ];

  it.each(keepRows)('%s is not blocked by the widened gate', (_label, prompt, draft) => {
    const body = composedBody(prompt);
    const sections = body.sections.map((section, index) => index === 1 ? { ...section, bodyText: draft } : section);
    const result = validatePromptEnhancementSafety({ currentBody: { ...body, sections } });
    expect(result.failures.some((failure) => failure.failureCode.startsWith('no_invention_state:'))).toBe(false);
  });

  it('the rejected class IS caught where a name is curated — the real corpus rows, as fixtures', () => {
    // The two true catches the corpus replay surfaced, verbatim: named tools the user never
    // asked for. (The remaining rejected rows name no tool at all — that judgement is the
    // declare-then-judge layer’s, not a keyword’s, and its fixtures land with that work.)
    const study = 'I need to build a study group app for my university project. Where do I start?';
    const firebase = findPromptEnhancementInventionViolationsV1({
      sectionText: "I'll use React for the front-end and Firebase for the backend.",
      allowedTexts: [study],
    });
    expect(firebase.map((violation) => violation.item)).toContain('Firebase');
    const tailwind = findPromptEnhancementInventionViolationsV1({
      sectionText: 'Style the components using a CSS framework like Tailwind CSS.',
      allowedTexts: ['Create a React app with a home page that shows study groups as cards.'],
    });
    expect(tailwind.map((violation) => violation.item)).toContain('Tailwind');
  });
});
