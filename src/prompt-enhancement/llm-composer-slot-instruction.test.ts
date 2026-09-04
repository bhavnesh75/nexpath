import { describe, expect, it } from 'vitest';
import {
  composeStructuredComposerOutputV1,
  type PromptEnhancementComposerClientV1,
} from './llm-composer.js';
import { planPromptEnhancementSections } from './templates/section-plan.js';
import { routePromptEnhancement, type PromptEnhancementRouteInput } from './routing-taxonomy.js';
import type { PromptEnhancementSourceRefV1 } from './contracts.js';

// Reader 1 of the no-invention state: the COMPOSER must carry the constraint
// into the section's own instruction. The other two readers (the post-compose
// check and the hard-fail fixtures) are asserted in the safety suite; this
// captures the prompt actually sent, because an instruction that never reaches
// the model is the same prose-only state the typed field replaced.

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

function capturingClient(): { client: PromptEnhancementComposerClientV1; userPrompts: string[] } {
  const userPrompts: string[] = [];
  const client: PromptEnhancementComposerClientV1 = {
    chat: {
      completions: {
        create: async (body) => {
          for (const message of body.messages) {
            if (message.role === 'user') userPrompts.push(message.content);
          }
          // An empty reply is enough: the call is made, the prompt is captured,
          // and the composer falls back deterministically.
          return { choices: [{ message: { content: '' } }] };
        },
      },
    },
  };
  return { client, userPrompts };
}

async function promptFor(intent: string, promptText: string): Promise<string> {
  const route = routePromptEnhancement({
    routeDecisionId: `composer-slot-${intent}`,
    promptText,
    currentStage: 'implementation',
    prevStage: 'task_breakdown',
    triggerKind: 'absence',
    firedKey: 'absence:debugging_observation_gap@implementation',
    classifierState: 'fire_recommended',
    degradedNoActionState: 'none',
    generatedOriginState: 'ordinary_user_prompt',
    classifierPrimaryIntent: intent,
    classifierIntentConfidence: 0.9,
    classifierCapabilityCandidates: [],
    classifierDebugEvidencePresent: [],
  } as unknown as PromptEnhancementRouteInput);
  const planning = planPromptEnhancementSections({
    routeResult: route,
    sourceRefs: [sourceA],
    guidanceFacts: [],
  });
  const { client, userPrompts } = capturingClient();
  await composeStructuredComposerOutputV1(
    { enhancementId: `composer-slot-${intent}`, originalPromptText: promptText, planning },
    client,
  );
  expect(userPrompts.length, 'the composer must have made its call').toBeGreaterThan(0);
  // The FIRST call's prompt: an empty reply makes the composer retry, and each
  // retry sends the same prompt again — joining them would count one line per
  // attempt and say nothing about per-section scoping.
  return userPrompts[0] ?? '';
}

describe('composer instruction: the typed slot obligations reach the model', () => {
  it('a repro section carrying the no-invention state gets the hard rule in its instruction — as words', async () => {
    const prompt = await promptFor('issue_debug.reproduction_discovery', 'the checkout job stops halfway and I cannot tell why');
    // The obligation reaches the model as a directive, never as its identifier.
    expect(prompt).toContain('Hard rule: name only tools, libraries, services, files, APIs or project facts');
    expect(prompt).not.toContain('slotObligations');
    expect(prompt).not.toContain('no_invention_state');
    // The locked behaviour when evidence is missing: ask, never illustrate.
    expect(prompt).toContain('ask for it — never supply an example name');
  });

  it('the rule is scoped per section — one directive line per section that carries it', async () => {
    // The no-invention state is UNIVERSAL over composed prose, so the directive appears once per
    // carrying section — still section-scoped, never one prompt-wide banner — and every section
    // block that lists directives carries it.
    const prompt = await promptFor('issue_debug.reproduction_discovery', 'the checkout job stops halfway and I cannot tell why');
    const hardRuleLines = prompt.split('\n').filter((line) => line.includes('Hard rule: name only'));
    const directiveBlocks = prompt.split('\n').filter((line) => line.includes('this section must:'));
    expect(hardRuleLines.length).toBeGreaterThan(1);
    expect(hardRuleLines).toHaveLength(directiveBlocks.length);
  });

  it('every composed-prose route carries the rule — planning routes included', async () => {
    const prompt = await promptFor('planning.spec_or_prd', 'write a spec for the new onboarding flow');
    expect(prompt).toContain('Hard rule: name only');
    expect(prompt).not.toContain('no_invention_state');
  });
});
