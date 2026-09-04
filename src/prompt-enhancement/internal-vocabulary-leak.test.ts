// The renderer half of the wording work, and the defense behind both halves.
//
// The measured leak: bodies telling a developer to "provide the safety hook linkage" or to
// "create a compact summary for the first popup" — nexpath's own field names, rendered as work
// no user could act on. The prompt side was closed by handing the composer words; this file
// covers the DETERMINISTIC surfaces (headings and template lines, which shipped jargon with no
// model involved) and the detector that guarantees no identifier reaches a sent body again.
import { describe, it, expect } from 'vitest';
import { routePromptEnhancement } from './routing-taxonomy.js';
import { planPromptEnhancementSections } from './templates/section-plan.js';
import { composePromptEnhancementBody } from './compose-enhancement.js';
import { validatePromptEnhancementSafety } from './safety-sendability.js';
import { derivePromptEnhancementSectionKindInventoryV1 } from './section-kind-inventory.js';
import {
  SECTION_DISPLAY_NAMES_V1,
  promptEnhancementSectionDisplayNameV1,
} from './section-display-names.js';
import {
  findPromptEnhancementInternalVocabularyLeaksV1,
  promptEnhancementInternalVocabularyV1,
} from './internal-vocabulary-leak.js';
import { promptEnhancementAuthorityModeForTextV1, promptEnhancementRiskKindsForTextV1 } from './safety-sendability.js';
import type { PromptEnhancementSourceRefV1 } from './contracts.js';

const BENIGN_PROMPT = 'center the hero text and make the font slightly larger';

const sourceA: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'src-a-1',
  sourceKind: 'source_a_user_prompt',
  sourceId: 'prompt:vocab-1',
  freshness: 'current',
  confidence: 'high',
  privacyClass: 'local_private',
};

function composedBody(prompt: string) {
  const route = routePromptEnhancement({
    routeDecisionId: 'vocab-route',
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
    enhancementId: 'vocab-enh',
    originalPromptText: prompt,
    sectionPlanningResult: planning,
  }).currentBody;
}

/** Validate a body whose first generated section carries the given text. */
function validateWithSectionText(bodyText: string, prompt = BENIGN_PROMPT) {
  const body = composedBody(prompt);
  const index = body.sections.findIndex((section) => section.sectionKind !== 'original_request_or_goal');
  const sections = body.sections.map((section, position) => position === index ? { ...section, bodyText } : section);
  return validatePromptEnhancementSafety({ currentBody: { ...body, sections } });
}

describe('completeness D — every derived section kind has a display name', () => {
  const inventory = derivePromptEnhancementSectionKindInventoryV1();

  it('the inventory is the shared one and is not vacuous', () => {
    expect(inventory.length).toBeGreaterThan(100);
  });

  it.each(inventory.map((kind) => [kind] as const))('%s has a curated display name', (kind) => {
    expect(SECTION_DISPLAY_NAMES_V1[kind], kind).toBeTruthy();
  });

  it('the fallback still title-cases an unmapped kind rather than crashing — the vocabulary is open', () => {
    expect(promptEnhancementSectionDisplayNameV1('some_future_kind')).toBe('Some Future Kind');
  });
});

describe('display names never disturb the safety machinery', () => {
  // A heading is scanned as body text. A title introducing a risk or execution word its kind's
  // own id does not carry could change when the confirmation line fires — checked, not assumed.
  it.each(Object.entries(SECTION_DISPLAY_NAMES_V1).map(([kind, title]) => [kind, title] as const))(
    '%s: "%s" adds no risk or execution word the id does not already carry',
    (kind, title) => {
      const idWords = kind.replace(/_/g, ' ');
      const titleRisks = promptEnhancementRiskKindsForTextV1(title);
      const idRisks = promptEnhancementRiskKindsForTextV1(idWords);
      for (const risk of titleRisks) expect(idRisks, `${kind} -> ${title}`).toContain(risk);
      if (promptEnhancementAuthorityModeForTextV1(title) === 'execute_requested') {
        expect(promptEnhancementAuthorityModeForTextV1(idWords), `${kind} -> ${title}`).toBe('execute_requested');
      }
    },
  );
});

describe('the rendered body shows display names, never internal ids', () => {
  it('a composed body heads its sections with curated titles', () => {
    const text = composedBody(BENIGN_PROMPT).text;
    expect(text).toContain('Scope and non-goals:');
    expect(text).toContain('How to verify:');
    expect(text).toContain('Best practices and standards:');
    expect(text).not.toContain('Verification Or Test Plan:');
    expect(text).not.toContain('Source Signal Guidance:');
    expect(text).not.toContain('Scope Non Goals:');
  });

  it('the three deterministic template lines carry the approved wording', () => {
    const risky = composedBody('plan the rollout and list the separate points').text;
    expect(risky).not.toContain('Keep a compact point inventory.');
    expect(risky).not.toContain('Use the current source signal as a task constraint');
    expect(risky).not.toContain('Use the source signal as a direct task constraint.');
  });
});

describe('the specimen regressions — every measured leak phrase, pinned non-reproducible', () => {
  // Every phrase from the measured specimen table, plus the two identifier-shaped specimens.
  const specimenPhrases = [
    'safety hook linkage',
    'decomposition handoff metadata',
    'family-specific verifications',
    'compact summary for the first popup',
    'compact summary of first pop-up supports',
    'policy metadata',
  ] as const;

  it.each(specimenPhrases.map((phrase) => [phrase] as const))(
    'a composed body never contains "%s"',
    (phrase) => {
      for (const prompt of [BENIGN_PROMPT, 'plan the rollout and split the work into separate points', 'the checkout job fails and I cannot tell why']) {
        expect(composedBody(prompt).text.toLowerCase()).not.toContain(phrase.toLowerCase());
      }
    },
  );

  it('no composed body renders a raw section-kind identifier in prose', () => {
    for (const prompt of [BENIGN_PROMPT, 'plan the rollout and split the work into separate points']) {
      expect(composedBody(prompt).text).not.toContain('problem_statement');
      expect(composedBody(prompt).text).not.toContain('point_inventory_or_decomposition');
    }
  });

  it('no composed body renders a fact-line enum specimen', () => {
    expect(composedBody(BENIGN_PROMPT).text).not.toContain('must_phrase_as_possibility');
    expect(composedBody(BENIGN_PROMPT).text).not.toContain('must phrase as possibility');
  });
});

describe('the detector — raw identifiers only, and never a de-underscored phrase', () => {
  it('the derived vocabulary covers obligations, section kinds and fact-line enums', () => {
    expect(promptEnhancementInternalVocabularyV1()).toContain('safety_hook_linkage');
    expect(promptEnhancementInternalVocabularyV1()).toContain('problem_statement');
    expect(promptEnhancementInternalVocabularyV1()).toContain('must_phrase_as_possibility');
    // Single words are English, never identifiers.
    expect(promptEnhancementInternalVocabularyV1()).not.toContain('alternatives');
    expect(promptEnhancementInternalVocabularyV1()).not.toContain('compatibility');
  });

  it('a body carrying a raw union identifier is CAUGHT, blocking', () => {
    const result = validateWithSectionText('- Provide the safety_hook_linkage before shipping.');
    expect(result.failures.map((failure) => failure.failureCode))
      .toContain('source_honesty:internal_vocabulary_rendered:safety_hook_linkage');
    expect(result.sendPolicy).toBe('no_send');
  });

  it('a body saying "context and constraints" in prose is NOT caught — the phrase rule', () => {
    const result = validateWithSectionText('- Keep the context and constraints of this change in view.');
    expect(result.failures.some((failure) => failure.failureCode.startsWith('source_honesty:internal_vocabulary_rendered'))).toBe(false);
  });

  it('a longer identifier is matched whole-word, not as part of another word', () => {
    expect(findPromptEnhancementInternalVocabularyLeaksV1({
      text: 'the problem_statements table is fine',
      allowedTexts: [],
    })).toEqual([]);
  });
});

describe('a leaking model draft costs the DRAFT, never the popup', () => {
  const RISKY_PROMPT = 'delete the old migrations folder before the demo';

  function composeWithDraft(prompt: string, draftText: string) {
    const route = routePromptEnhancement({
      routeDecisionId: 'draft-route',
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
    const host = planning.sectionPlans.find((section) => section.sectionKind !== 'original_request_or_goal')!;
    const factId = host.structuredContentPartRefs[0] ?? 'draft-fact-missing';
    const composed = composePromptEnhancementBody({
      enhancementId: 'draft-enh',
      originalPromptText: prompt,
      sectionPlanningResult: planning,
      composerRuntimeState: 'accepted_structured_output',
      structuredComposerOutput: {
        outputId: 'draft-1',
        sectionDrafts: [{ sectionId: host.sectionId, bodyText: draftText, sourceFactIds: [factId] }],
        composerClaims: [`claim:${factId}`],
      },
    });
    return { composed, validation: validatePromptEnhancementSafety({ currentBody: composed.currentBody }) };
  }

  it('a clean draft lands and the body sends', () => {
    const { composed, validation } = composeWithDraft(RISKY_PROMPT, 'Handle the folder cleanup as requested.');
    expect(composed.currentBody.text).toContain('Handle the folder cleanup as requested.');
    expect(validation.sendPolicy).not.toBe('no_send');
  });

  it('a draft echoing an identifier is DROPPED — the section renders deterministically and the popup survives', () => {
    // Without this the model slip would reach the finished body and the validator would block
    // the whole enhancement: the developer loses their popup for a mistake the engine made.
    const { composed, validation } = composeWithDraft(RISKY_PROMPT, 'Provide the safety_hook_linkage before shipping.');
    expect(composed.currentBody.text).not.toContain('safety_hook_linkage');
    expect(validation.failures.some((failure) => failure.failureCode.startsWith('source_honesty:internal_vocabulary_rendered'))).toBe(false);
    expect(validation.sendPolicy).not.toBe('no_send');
  });

  it('an identifier the DEVELOPER wrote is allowed through the draft gate too — one allowance rule', () => {
    const { composed, validation } = composeWithDraft(
      'rename my safety_hook_linkage variable and delete the old migrations folder',
      'Rename the safety_hook_linkage variable as asked.',
    );
    expect(composed.currentBody.text).toContain('Rename the safety_hook_linkage variable as asked.');
    expect(validation.sendPolicy).not.toBe('no_send');
  });
});

describe('live blast radius — the detector blocks nothing the pipeline actually produces', () => {
  it('every preset x prompt shape composes a body the detector passes', async () => {
    // The corpus replay proves the detector is safe on HISTORICAL bodies; this proves it on the
    // bodies the CURRENT renderer makes. A wording change that started emitting an identifier
    // would destroy real popups, so the zero is pinned rather than measured once.
    const { PROMPT_ENHANCEMENT_TAXONOMY_PRESETS } = await import('./routing-taxonomy.js');
    const prompts = [
      'center the hero text and make the font slightly larger',
      'plan the rollout and split the work into separate points',
      'the checkout job fails and I cannot tell why',
      'review my auth module for security problems',
      'write a spec for the new onboarding flow',
      'upgrade every dependency and check nothing breaks',
      'delete the old migrations folder before the demo',
      'why is my dashboard so slow',
    ];
    const offenders: string[] = [];
    let bodies = 0;
    for (const preset of PROMPT_ENHANCEMENT_TAXONOMY_PRESETS) {
      for (const prompt of prompts) {
        const route = routePromptEnhancement({
          routeDecisionId: 'blast-route',
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
          classifierPrimaryIntent: preset.primaryIntent,
          classifierIntentConfidence: 0.9,
        } as never);
        const planning = planPromptEnhancementSections({ routeResult: route, sourceRefs: [sourceA], guidanceFacts: [] });
        const body = composePromptEnhancementBody({
          enhancementId: 'blast-enh',
          originalPromptText: prompt,
          sectionPlanningResult: planning,
        }).currentBody;
        const result = validatePromptEnhancementSafety({ currentBody: body });
        bodies += 1;
        for (const failure of result.failures) {
          if (failure.failureCode.startsWith('source_honesty:internal_vocabulary_rendered')) {
            offenders.push(`${preset.primaryIntent} | ${prompt} -> ${failure.failureCode}`);
          }
        }
      }
    }
    expect(bodies).toBeGreaterThan(300);
    expect(offenders).toEqual([]);
  });
});

describe('the prompt-allowance discriminator — a developer may name their own code', () => {
  const echoText = '- Rename the problem_statement variable as requested.';

  it('the identifier IS in the prompt: the echoing body is NOT detected', () => {
    const result = validateWithSectionText(echoText, 'rename my problem_statement variable and tidy the file');
    expect(result.failures.some((failure) => failure.failureCode.startsWith('source_honesty:internal_vocabulary_rendered'))).toBe(false);
  });

  it('the same body WITHOUT the prompt mention: detected', () => {
    const result = validateWithSectionText(echoText, BENIGN_PROMPT);
    expect(result.failures.map((failure) => failure.failureCode))
      .toContain('source_honesty:internal_vocabulary_rendered:problem_statement');
  });

  it('a section source fact carrying the identifier also allows it — one allowance rule, reused', () => {
    expect(findPromptEnhancementInternalVocabularyLeaksV1({
      text: echoText,
      allowedTexts: ['the project defines problem_statement in its schema'],
    })).toEqual([]);
  });
});
