// The composer is handed WORDS, never identifiers — the two build-time completeness gates, and
// the carrier itself asserted on its real output.
//
// One obligation of twenty-four used to be explained in prose; the rest were handed to the
// model as JSON identifiers, and identifiers a model cannot act on are identifiers it echoes into
// the developer's prompt. These gates make "every obligation has words" and "every section kind
// has words" build-time facts, derived from the real producers, so a new obligation or a new
// preset section kind cannot arrive wordless.
import { describe, it, expect } from 'vitest';
import type { PromptEnhancementGuidanceFact } from './templates/section-plan.js';
import {
  planPromptEnhancementSections,
  SLOT_EFFECTS_BY_CAPABILITY_V1,
} from './templates/section-plan.js';
import { routePromptEnhancement } from './routing-taxonomy.js';
import { SLOT_OBLIGATION_DIRECTIVES_V1 } from './section-obligation-directives.js';
import {
  promptEnhancementSectionPurposeV1,
  promptEnhancementRelevanceSectionKindsV1,
} from './section-relevance.js';
import { derivePromptEnhancementSectionKindInventoryV1 } from './section-kind-inventory.js';
import { PROMPT_ENHANCEMENT_PLANNABLE_SECTION_KINDS_V1 } from './templates/section-plan.js';
import { FACT_LINE_WORDING_VOCABULARIES_V1 } from './fact-line-wording.js';
import { composeStructuredComposerOutputV1, type PromptEnhancementComposerClientV1 } from './llm-composer.js';
import type { PromptEnhancementSourceRefV1 } from './contracts.js';

const IDENTIFIER_SHAPE = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;

describe('gate A — the obligation union is closed, and every member has a directive', () => {
  it('every obligation the producer can attach has a directive', () => {
    const universe = new Set<string>(Object.values(SLOT_EFFECTS_BY_CAPABILITY_V1).flatMap((effect) => effect.obligations));
    universe.add('no_invention_state');
    for (const obligation of universe) {
      expect(SLOT_OBLIGATION_DIRECTIVES_V1[obligation as keyof typeof SLOT_OBLIGATION_DIRECTIVES_V1], obligation).toBeTruthy();
    }
    expect(Object.keys(SLOT_OBLIGATION_DIRECTIVES_V1).sort()).toEqual([...universe].sort());
  });

  it('no directive names an obligation or reads as an identifier', () => {
    for (const [obligation, directive] of Object.entries(SLOT_OBLIGATION_DIRECTIVES_V1)) {
      expect(directive, obligation).not.toContain(obligation);
      expect(directive, obligation).not.toMatch(/\b[a-z]+_[a-z_]+\b/);
    }
  });
});

describe('gate B — every derived section kind has purpose words, and none is an identifier', () => {
  const inventory = derivePromptEnhancementSectionKindInventoryV1();

  it('the derived inventory is large (planner kinds plus every preset kind) — the gate is not vacuous', () => {
    expect(inventory.length).toBeGreaterThan(100);
    for (const kind of PROMPT_ENHANCEMENT_PLANNABLE_SECTION_KINDS_V1) expect(inventory).toContain(kind);
  });

  it.each(inventory.map((kind) => [kind] as const))('%s has purpose words', (kind) => {
    const purpose = promptEnhancementSectionPurposeV1(kind);
    expect(purpose, kind).toBeTruthy();
    expect(IDENTIFIER_SHAPE.test(purpose!), kind).toBe(false);
    expect(purpose, kind).not.toContain('_');
  });

  it('the classifier relevance vocabulary is unchanged — the planner\'s kinds, in the planner\'s order', () => {
    // The purpose map grew append-only for the composer; the classifier menu must NOT grow with
    // it (a 14-line menu becoming ~200 would swell that prompt for no ranking benefit).
    expect(promptEnhancementRelevanceSectionKindsV1()).toEqual(PROMPT_ENHANCEMENT_PLANNABLE_SECTION_KINDS_V1);
  });
});

describe('channel C — every fact-line label vocabulary matches the fact type', () => {
  it('claim, origin, confidence and kind vocabularies cover the values the fact record can carry', () => {
    expect(FACT_LINE_WORDING_VOCABULARIES_V1.claim).toEqual(expect.arrayContaining([
      'may_state_as_user_practice', 'may_state_as_project_capability', 'must_have_behaviour_verified_practice',
      'must_phrase_as_possibility', 'must_phrase_as_source_signal', 'must_phrase_as_recent_change',
      'source_label_only', 'do_not_render',
    ]));
    expect(FACT_LINE_WORDING_VOCABULARIES_V1.origin).toEqual(expect.arrayContaining([
      'current_prompt', 'recent_prompt_history', 'local_probe', 'local_probe_trajectory',
      'longitudinal_param_events', 'served_variant_identity', 'transcript_corroboration', 'stored_memory',
      'content_template_registry', 'content_template_runtime', 'original_point_inventory', 'unknown',
    ]));
    expect(FACT_LINE_WORDING_VOCABULARIES_V1.confidence).toEqual(['high', 'medium', 'low']);
    expect(FACT_LINE_WORDING_VOCABULARIES_V1.guidanceKind).toHaveLength(10);
  });
});

// ── The carrier itself, asserted on its real output ──────────────────────────────────────────

const sourceA: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'src-a-1',
  sourceKind: 'source_a_user_prompt',
  sourceId: 'prompt:wording-carrier-1',
  freshness: 'current',
  confidence: 'high',
  privacyClass: 'local_private',
};

function groundingFact(): PromptEnhancementGuidanceFact {
  return {
    factId: 'f-runner',
    sourceType: 'content_template_record',
    sourceIds: ['ABSENCE_DEBUGGING_OBSERVATION'],
    guidanceKind: 'project_grounding',
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
    sourceOriginScope: 'local_probe',
    claimVerbPolicy: 'may_state_as_project_capability',
    evidence: { key: 'test_runner', value: 'vitest', runtimePath: 'local_probe', anchorScope: 'project_root' },
  } as unknown as PromptEnhancementGuidanceFact;
}

/** Capture the user prompt the model would receive on a leak route, without any network. */
async function capturedPrompt(promptText: string): Promise<string> {
  return capturedPromptWithFact(groundingFact(), promptText);
}

async function capturedPromptWithFact(fact: PromptEnhancementGuidanceFact, promptText = 'the checkout job stops halfway and I cannot tell why'): Promise<string> {
  const route = routePromptEnhancement({
    routeDecisionId: 'wording-carrier-route',
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
    classifierPrimaryIntent: 'issue_debug.reproduction_discovery',
    classifierIntentConfidence: 0.9,
    classifierCapabilityCandidates: ['capability.reproduction_or_evidence_needed'],
  } as never);
  const planning = planPromptEnhancementSections({ routeResult: route, sourceRefs: [sourceA], guidanceFacts: [fact] });
  let captured = '';
  const client: PromptEnhancementComposerClientV1 = {
    chat: {
      completions: {
        create: async (body) => {
          const user = body.messages.find((message) => message.role === 'user');
          captured = typeof user?.content === 'string' ? user.content : '';
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  detectedLanguageSelfReport: 'en',
                  requestModeSelfReport: 'implementation',
                  sectionDrafts: [],
                  composerClaims: [],
                  authorityEvidence: 'x',
                  authorityModeSelfReport: 'implementation',
                }),
              },
            }],
          };
        },
      },
    },
  };
  await composeStructuredComposerOutputV1({
    enhancementId: 'wording-carrier',
    originalPromptText: promptText,
    planning,
  }, client);
  return captured;
}

describe('channel C DROP — a registry-only label leaves the line without a phrase and without its id', () => {
  it('a fact whose origin serves only the registry prints no origin phrase and never the raw value', async () => {
    const prompt = await capturedPromptWithFact({
      ...groundingFact(),
      sourceOriginScope: 'content_template_registry',
    } as unknown as PromptEnhancementGuidanceFact);
    const entry = prompt.split('\n').find((line) => line.trimStart().startsWith('- guidance_fact:f-runner')) ?? '';
    expect(entry).toContain('- guidance_fact:f-runner |');
    expect(entry).not.toContain('content_template_registry');
    expect(entry).not.toContain('origin');
    // The other three labels still ride as words, and the evidence value is untouched.
    expect(entry).toContain('a fact about this specific project');
    expect(entry).toContain('you may state this as something the project has');
    expect(entry).toContain('evidence: test_runner = "vitest"');
  });
});

describe('the carrier — the built composer prompt hands the model words, never identifiers', () => {
  it('a leak-route section carries directive PROSE and neither the obligation name nor the raw kind', async () => {
    const prompt = await capturedPrompt('the checkout job stops halfway and I cannot tell why');
    expect(prompt).toContain('this section must:');
    expect(prompt).toContain('Ask for the exact steps, logs, or samples that show the problem');
    expect(prompt).toContain('purpose: the steps, logs or samples that show the problem');
    expect(prompt).not.toContain('slotObligations');
    expect(prompt).not.toContain('reproduction_or_evidence_request');
    expect(prompt).not.toContain('purpose: reproduction_or_evidence');
    // No snake_case identifier survives on any purpose line or directive line. (Section ids and
    // fact ids are the model's citation contract and are deliberately left as they are.)
    for (const line of prompt.split('\n')) {
      const isPurposeLine = line.includes('purpose:');
      const isDirectiveLine = line.startsWith('  - ') && !line.includes('guidance_fact:');
      if (isPurposeLine || isDirectiveLine) {
        expect(line).not.toMatch(/[a-z]+_[a-z_]+/);
      }
    }
  });

  it('the allow-list feed is intact — the fact id and evidence VALUE are byte-identical after channel C', async () => {
    const prompt = await capturedPrompt('the checkout job stops halfway and I cannot tell why');
    const entry = prompt.split('\n').find((line) => line.trimStart().startsWith('- guidance_fact:f-runner')) ?? '';
    expect(entry).toContain('- guidance_fact:f-runner |');
    expect(entry).toContain('evidence: test_runner = "vitest"');
    // The labels are words now — and the old enum labels are gone from the line.
    expect(entry).toContain('a fact about this specific project');
    expect(entry).toContain('well supported');
    expect(entry).toContain('observed in the local project');
    expect(entry).toContain('you may state this as something the project has');
    expect(entry).not.toContain('kind: project_grounding');
    expect(entry).not.toContain('claim: may_state_as_project_capability');
  });
});
