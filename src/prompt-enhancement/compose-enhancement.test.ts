import { describe, expect, it } from 'vitest';
import type { PromptEnhancementSourceRefV1 } from './contracts.js';
import { composePromptEnhancementBody } from './compose-enhancement.js';
import { routePromptEnhancement, type PromptEnhancementRouteInput } from './routing-taxonomy.js';
import {
  planPromptEnhancementSections,
  type PromptEnhancementGuidanceFact,
  type PromptEnhancementSectionPlanningResult,
} from './templates/section-plan.js';

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
  sourceRefId: 'source-b-content-template-debug',
  sourceKind: 'content_template_fact',
  sourceId: 'ABSENCE_DEBUGGING_OBSERVATION',
  sourceAuthorization: 'source_fact_only',
  evidenceStatus: 'present',
  freshness: 'current',
  confidence: 'medium',
  privacyClass: 'raw_text_excluded',
};

const hardFactSourceB: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'source-b-project-tests',
  sourceKind: 'hard_fact_or_profile_signal',
  sourceId: 'project_fact:test-suite-present',
  sourceAuthorization: 'implementation_input',
  evidenceStatus: 'present',
  freshness: 'current',
  confidence: 'medium',
  privacyClass: 'local_private',
};

function routeInput(overrides: Partial<PromptEnhancementRouteInput> = {}): PromptEnhancementRouteInput {
  return {
    routeDecisionId: 'phase5-route-1',
    promptText: 'Ask the AI to fix importCsv and tell me what it says.',
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

function fact(overrides: Partial<PromptEnhancementGuidanceFact> = {}): PromptEnhancementGuidanceFact {
  return {
    factId: 'fact-debug-repro',
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

function planningResult(overrides: {
  route?: Partial<PromptEnhancementRouteInput>;
  sourceRefs?: readonly PromptEnhancementSourceRefV1[];
  guidanceFacts?: readonly PromptEnhancementGuidanceFact[];
} = {}): PromptEnhancementSectionPlanningResult {
  const route = routePromptEnhancement(routeInput(overrides.route));
  return planPromptEnhancementSections({
    routeResult: route,
    sourceRefs: overrides.sourceRefs ?? [sourceA, contentTemplateSourceB, hardFactSourceB],
    guidanceFacts: overrides.guidanceFacts ?? [
      fact(),
      fact({
        factId: 'fact-verification',
        sourceType: 'absence_signal',
        sourceIds: ['absence:verification_gap'],
        guidanceKind: 'missing_practice',
        suggestedActionKind: 'add_verification',
        targetSectionKind: 'verification_or_test_plan',
      }),
    ],
  });
}

describe('prompt-enhancement composer and deterministic fallback', () => {
  it('composes exactly one editable current body with visible original-verbatim preservation', () => {
    const originalPrompt = 'Ask the AI to fix importCsv and tell me what it says.';
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-1',
      originalPromptText: originalPrompt,
      sectionPlanningResult: planningResult(),
    });

    expect(result.currentBody.text).toContain('My original request (verbatim):\nAsk the AI to fix importCsv and tell me what it says.');
    expect(result.currentBody.originalPromptText).toBe(originalPrompt);
    expect(result.currentBody.originalPromptPreservation).toBe('visible_verbatim');
    expect(result.currentBody.generatedOriginState).toBe('pe_generated_body');
    expect(result.currentBody.userDirtyState).toBe('clean');
    expect(result.availableActions.map((action) => action.label)).toEqual([
      'Use this prompt',
      'Use original',
      'Shorter',
      'More thorough',
      'More project-grounded',
      'Apply details',
      'Feedback',
      'Close',
    ]);
    expect(result.bodySectionAgreement).toBe('exact');
  });

  it('emits canonical composer artifact metadata required by the Phase 5 contract', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-artifact-metadata',
      originalPromptText: 'Fix the importCsv parser and verify the regression.',
      // A resolved route: the metadata this test pins is the resolved-path
      // shape (the under-evidenced path adds the gate-reason why-help ref).
      sectionPlanningResult: planningResult({ route: { promptText: 'Fix this failing test: the importCsv parser regression.' } }),
    });

    expect(result.currentBody.composerRunId).toBe('enh-phase5-artifact-metadata:composer:default:1');
    expect(result.currentBody.routeDecisionId).toBe('phase5-route-1');
    expect(result.currentBody.promptReviewOrigin).toBe('user_authored_current_prompt');
    expect(result.currentBody.promptReviewProcessingPolicy).toBe('eligible_for_initial_pe_route');
    expect(result.currentBody.sentPromptOrigin).toBe('pe_baseline_generated_body');
    expect(result.currentBody.nexpathGeneratedPromptRef).toBe('enh-phase5-artifact-metadata:body:generated:1');
    expect(result.currentBody.renderedPromptBody).toBe(result.currentBody.text);
    expect(result.currentBody.originalPromptSectionId).toBe('phase5-route-1:section:1:original_request_or_goal');
    expect(result.currentBody.llmCallPolicy).toBe('no_call');
    expect(result.currentBody.sourceAttribution).toEqual(
      expect.arrayContaining([
        {
          sourceRefId: 'source-a-current-prompt',
          sourceId: 'prompt:current',
          sourceKind: 'source_a_user_prompt',
          evidenceStatus: 'present',
          publicSafeLabel: 'current original prompt',
          privateIdPolicy: 'metadata_only_not_body',
        },
      ]),
    );
    expect(result.currentBody.composerMode).toBe('baseline_deterministic_render');
    expect(result.currentBody.languagePolicyApplied).toBe('technical_english_default');
    expect(result.currentBody.languageValidationStatus).toBe('valid');
    expect(result.currentBody.effectiveLanguageState).toBe('unknown_default');
    expect(result.currentBody.languageSource).toBe('technical_english_default');
    expect(result.currentBody.languageConfidence).toBe('unknown');
    expect(result.currentBody.languagePolicy).toBe('technical_english_default');
    expect(result.currentBody.instructionPrecedenceState).toBe('generated_sections_qualify_original');
    expect(result.currentBody.originalAsSourceStatus).toBe('local_verbatim_source_context');
    expect(result.currentBody.localOriginalPromptIncluded).toBe(true);
    expect(result.currentBody.sourceFactIds).toEqual(
      expect.arrayContaining(['guidance_fact:fact-debug-repro', 'guidance_fact:fact-verification']),
    );
    expect(result.currentBody.composerClaims).toEqual(
      expect.arrayContaining(['claim:guidance_fact:fact-debug-repro', 'claim:guidance_fact:fact-verification']),
    );

    expect(result.composerBoundary.composerRunId).toBe(result.currentBody.composerRunId);
    expect(result.composerBoundary.routeDecisionId).toBe(result.currentBody.routeDecisionId);
    expect(result.composerBoundary.promptReviewOrigin).toBe(result.currentBody.promptReviewOrigin);
    expect(result.composerBoundary.promptReviewProcessingPolicy).toBe(result.currentBody.promptReviewProcessingPolicy);
    expect(result.composerBoundary.sentPromptOrigin).toBe(result.currentBody.sentPromptOrigin);
    expect(result.composerBoundary.nexpathGeneratedPromptRef).toBe(result.currentBody.nexpathGeneratedPromptRef);
    expect(result.composerBoundary.renderedPromptBody).toBe(result.currentBody.text);
    expect(result.composerBoundary.originalPromptSectionId).toBe(result.currentBody.originalPromptSectionId);
    expect(result.composerBoundary.sourceAttribution).toEqual(result.currentBody.sourceAttribution);
    expect(result.composerBoundary.llmCallPolicy).toBe('no_call');
    expect(result.composerBoundary.validatedCanonicalPromptArtifact).toBe('current_body_v1');
    expect(result.composerBoundary.rawComposerOutput).toBe('not_used_deterministic');
    expect(result.composerBoundary.budgetState).toEqual({
      llmCallPolicy: 'no_call',
      callVisibilityMode: 'deterministic',
      productValueDiscussionIsRuntimeLimiter: false,
    });
    expect(result.composerBoundary.composerInputPrivacyState).toBe('approved_refs_only');
    expect(result.composerBoundary.localRenderOriginalPrompt).toBe(true);
    expect(result.composerBoundary.composerVisiblePromptContext).toEqual({
      contextPolicy: 'structured_refs_only_no_raw_original',
      originalPromptVisibleLocallyOnly: true,
      boundedContextRefCount: result.composerBoundary.composerVisiblePromptContextRefs.length,
      rawPromptTextExcluded: true,
    });
    expect(result.composerBoundary.composerVisiblePromptContextRefs).toEqual(
      expect.arrayContaining(['source-a-current-prompt', 'source-b-content-template-debug', 'source-b-project-tests', 'guidance_fact:fact-debug-repro']),
    );
    expect(result.composerBoundary.strictSchemaFailureReasonCodes).toEqual([
      'invalid_json',
      'duplicate_key',
      'unknown_field',
      'invalid_enum',
      'bad_reference',
      'output_cap_exceeded',
      'unsafe_metadata_copy',
    ]);

    const generatedSection = result.currentBody.sections.find((section) => section.sectionKind === 'source_signal_guidance');
    expect(generatedSection).toMatchObject({
      title: 'Best practices and standards',
      sourceFactIds: ['section_kind:source_signal_guidance'],
      evidenceStatus: 'present',
      requiredSurvivor: true,
      mandatoryFloor: true,
      depthState: 'required_survivor',
      fallbackBehavior: 'none',
      authorityBoundary: 'no_authority_escalation',
      confirmationRequired: false,
      confirmationPresent: false,
    });
    expect(generatedSection?.bodyText).toContain('Treat what your recent practice shows as a working constraint');
    expect(generatedSection?.axisContributions).toEqual(expect.arrayContaining(['practiceDepth', 'sectionDensity', 'groundingDepth']));
    expect(generatedSection?.whyHelpReasonCodes).toContain('section_kind:source_signal_guidance');
  });

  it('transforms source facts into coding-agent instructions without copying DS advisory prose fields', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-2',
      originalPromptText: 'Fix this failing test and include verification',
      sectionPlanningResult: planningResult(),
    });

    expect(result.currentBody.text).toContain('Capture the failing behavior, reproduction path, observed evidence, and expected behavior before changing code.');
    // Body quality (2026-08-06): provenance sentences live ONLY in typed metadata, never in the body.
    expect(result.currentBody.text).not.toContain('Source basis:');
    expect(result.currentBody.text).not.toContain('Source ids stay in typed metadata');
    expect(result.currentBody.text).not.toContain('ABSENCE_DEBUGGING_OBSERVATION');
    expect(result.currentBody.text).not.toContain('whyDesc');
    expect(result.currentBody.text).not.toContain('descBase');
    expect(result.currentBody.text).not.toContain('pinchFallback');
    expect(result.currentBody.text).not.toContain('Show simpler options');
    const contentTemplateSection = result.currentBody.sections.find((section) => section.sourceTemplateType === 'content_template_fact');
    expect(contentTemplateSection?.sourceIds).toContain('ABSENCE_DEBUGGING_OBSERVATION');
  });

  it('uses accepted structured LLM wording only inside planned sections with visible call metadata', () => {
    const planned = planningResult();
    const sourceGuidanceSection = planned.sectionPlans.find((section) => section.sectionKind === 'source_signal_guidance');
    const llmSourceFactId = sourceGuidanceSection?.structuredContentPartRefs[0] ?? 'missing-source-fact';
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-llm-wording',
      originalPromptText: 'Fix importCsv and verify the regression.',
      sectionPlanningResult: planned,
      composerRuntimeState: 'accepted_structured_output',
      structuredComposerOutput: {
        outputId: 'llm-output-1',
        sectionDrafts: [
          {
            sectionId: sourceGuidanceSection?.sectionId ?? 'missing',
            bodyText: 'Use the current implementation-stage signal to keep the fix tied to reproduction, parser behavior, and verification evidence.',
            sourceFactIds: [llmSourceFactId],
          },
        ],
        composerClaims: [`claim:${llmSourceFactId}`],
      },
    });

    expect(result.currentBody.composerMode).toBe('baseline_llm_structured_wording');
    expect(result.currentBody.llmCallPolicy).toBe('optional_with_cost_visibility');
    expect(result.currentBody.text).toContain('Use the current implementation-stage signal');
    expect(result.currentBody.text).toContain('My original request (verbatim):\nFix importCsv and verify the regression.');
    expect(result.currentBody.text).not.toContain('ABSENCE_DEBUGGING_OBSERVATION');
    expect(result.currentBody.text).not.toContain('source-b-content-template-debug');
    expect(result.currentBody.composerClaims).toEqual([`claim:${llmSourceFactId}`]);
    expect(result.composerBoundary.composerClaims).toEqual([`claim:${llmSourceFactId}`]);
    expect(result.composerBoundary.rawComposerOutput).toBe('llm_output_validated_into_artifact');
    expect(result.composerBoundary.composerPolicy).toBe('optional_llm_with_visibility');
    expect(result.composerBoundary.budgetState.llmCallPolicy).toBe('optional_with_cost_visibility');
    expect(result.composerBoundary.inputContract.callVisibilityState).toMatchObject({
      callVisibilityMode: 'llm_wording',
      optionalCallAvailabilityState: 'allowed',
      plannedCallCount: 1,
      usedCallCount: 1,
      providerAvailabilityState: 'available',
      inputTokenCap: 8000,
      outputTokenCap: 2000,
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      timeoutMs: 45_000,
      productValueDiscussionIsRuntimeLimiter: false,
    });
  });

  it('E5/5.4: derives language provenance from the composer self-report on the LLM path', () => {
    const planned = planningResult();
    const sourceGuidanceSection = planned.sectionPlans.find((section) => section.sectionKind === 'source_signal_guidance');
    const llmSourceFactId = sourceGuidanceSection?.structuredContentPartRefs[0] ?? 'missing-source-fact';
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-language',
      originalPromptText: 'importCsv me bug fix karo aur regression verify karo.',
      sectionPlanningResult: planned,
      composerRuntimeState: 'accepted_structured_output',
      structuredComposerOutput: {
        outputId: 'llm-output-lang',
        detectedLanguageSelfReport: 'hi-Latn',
        sectionDrafts: [
          {
            sectionId: sourceGuidanceSection?.sectionId ?? 'missing',
            bodyText: 'Reproduction, parser behavior aur verification evidence ke saath fix ko tie rakho.',
            sourceFactIds: [llmSourceFactId],
          },
        ],
        composerClaims: [`claim:${llmSourceFactId}`],
      },
    });

    expect(result.currentBody.languageSource).toBe('detected_from_prompt');
    expect(result.currentBody.languagePolicy).toBe('preserve_user_language');
    expect(result.currentBody.languagePolicyApplied).toBe('preserve_user_language');
    expect(result.currentBody.effectiveLanguageState).toBe('known');
  });

  it('E5/5.4: keeps technical-English provenance on the deterministic path', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-lang-det',
      originalPromptText: 'Fix importCsv and verify the regression.',
      sectionPlanningResult: planningResult(),
    });
    expect(result.currentBody.languageSource).toBe('technical_english_default');
    expect(result.currentBody.effectiveLanguageState).toBe('unknown_default');
  });

  it('rejects unsafe structured LLM wording and keeps deterministic fallback wording', () => {
    const planned = planningResult();
    const sourceGuidanceSection = planned.sectionPlans.find((section) => section.sectionKind === 'source_signal_guidance');
    const llmSourceFactId = sourceGuidanceSection?.structuredContentPartRefs[0] ?? 'missing-source-fact';
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-llm-unsafe',
      originalPromptText: 'Fix importCsv and verify the regression.',
      sectionPlanningResult: planned,
      composerRuntimeState: 'accepted_structured_output',
      structuredComposerOutput: {
        outputId: 'llm-output-unsafe',
        sectionDrafts: [
          {
            sectionId: sourceGuidanceSection?.sectionId ?? 'missing',
            bodyText: 'Copy whyDesc and ABSENCE_DEBUGGING_OBSERVATION into this option.',
            sourceFactIds: [llmSourceFactId],
          },
        ],
        composerClaims: [`claim:${llmSourceFactId}`],
      },
    });

    expect(result.currentBody.composerMode).toBe('baseline_deterministic_render');
    expect(result.currentBody.llmCallPolicy).toBe('optional_with_cost_visibility');
    expect(result.fallbackMode).toBe('deterministic_body');
    expect(result.currentBody.generatedSafeStatus).toBe('valid_with_fallback');
    expect(result.currentBody.text).not.toContain('whyDesc');
    expect(result.currentBody.text).not.toContain('ABSENCE_DEBUGGING_OBSERVATION');
    expect(result.composerBoundary.rawComposerOutput).toBe('rejected_or_unavailable');
    expect(result.composerBoundary.inputContract.callVisibilityState).toMatchObject({
      callVisibilityMode: 'fallback_no_llm',
      optionalCallAvailabilityState: 'allowed',
      plannedCallCount: 1,
      usedCallCount: 1,
      fallbackReason: 'validation_failed',
    });
  });

  it('rejects structured LLM wording when claims are not backed by planned source facts', () => {
    const planned = planningResult();
    const sourceGuidanceSection = planned.sectionPlans.find((section) => section.sectionKind === 'source_signal_guidance');
    const llmSourceFactId = sourceGuidanceSection?.structuredContentPartRefs[0] ?? 'missing-source-fact';
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-llm-unbacked-claim',
      originalPromptText: 'Fix importCsv and verify the regression.',
      sectionPlanningResult: planned,
      composerRuntimeState: 'accepted_structured_output',
      structuredComposerOutput: {
        outputId: 'llm-output-unbacked-claim',
        sectionDrafts: [
          {
            sectionId: sourceGuidanceSection?.sectionId ?? 'missing',
            bodyText: 'Use the current implementation-stage signal to keep the fix tied to reproduction and verification evidence.',
            sourceFactIds: [llmSourceFactId],
          },
        ],
        composerClaims: ['claim:not-in-section-plan'],
      },
    });

    expect(result.currentBody.composerMode).toBe('baseline_deterministic_render');
    expect(result.fallbackMode).toBe('deterministic_body');
    expect(result.currentBody.text).not.toContain('Use the current implementation-stage signal to keep the fix tied to reproduction and verification evidence.');
    expect(result.composerBoundary.rawComposerOutput).toBe('rejected_or_unavailable');
    expect(result.composerBoundary.inputContract.callVisibilityState.usedCallCount).toBe(1);
  });

  it('rejects structured LLM wording with unresolved template tokens or banned generated voice', () => {
    const planned = planningResult();
    const sourceGuidanceSection = planned.sectionPlans.find((section) => section.sectionKind === 'source_signal_guidance');
    const llmSourceFactId = sourceGuidanceSection?.structuredContentPartRefs[0] ?? 'missing-source-fact';
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-llm-template-token',
      originalPromptText: 'Fix importCsv and verify the regression.',
      sectionPlanningResult: planned,
      composerRuntimeState: 'accepted_structured_output',
      structuredComposerOutput: {
        outputId: 'llm-output-template-token',
        sectionDrafts: [
          {
            sectionId: sourceGuidanceSection?.sectionId ?? 'missing',
            bodyText: 'The developer should copy {R4_OPEN} because it says this action below is ready.',
            sourceFactIds: [llmSourceFactId],
          },
        ],
        composerClaims: [`claim:${llmSourceFactId}`],
      },
    });

    expect(result.currentBody.composerMode).toBe('baseline_deterministic_render');
    expect(result.fallbackMode).toBe('deterministic_body');
    expect(result.currentBody.text).not.toContain('{R4_OPEN}');
    expect(result.currentBody.text).not.toContain('The developer should');
    expect(result.currentBody.text).not.toContain('this action below');
    expect(result.composerBoundary.rawComposerOutput).toBe('rejected_or_unavailable');
  });

  /**
   * Voice-policy matching is phrase-accurate, not substring-accurate.
   *
   * Every phrase used to be matched with `.includes()`, and several are short enough to sit inside
   * unrelated words. Because one bad draft discards the WHOLE reply, a single such match cost the user
   * every section. Measured live: a prompt reading "compare our AI assistant integration against the
   * AI gateway we already ship" produced 8 valid drafts and all 8 were thrown away, because the
   * composer is required to mirror the user's own vocabulary and therefore wrote "the AI gateway".
   */
  describe('voice policy matches phrases, not substrings', () => {
    const composeWith = (bodyText: string) => {
      const planned = planningResult();
      const section = planned.sectionPlans.find((s) => s.sectionKind === 'source_signal_guidance');
      const factId = section?.structuredContentPartRefs[0] ?? 'missing-source-fact';
      return composePromptEnhancementBody({
        enhancementId: 'enh-voice-substring',
        originalPromptText: 'Fix importCsv and verify the regression.',
        sectionPlanningResult: planned,
        composerRuntimeState: 'accepted_structured_output',
        structuredComposerOutput: {
          outputId: 'llm-output-voice-substring',
          sectionDrafts: [{ sectionId: section?.sectionId ?? 'missing', bodyText, sourceFactIds: [factId] }],
          composerClaims: [`claim:${factId}`],
        },
      });
    };
    const rejected = (bodyText: string) => composeWith(bodyText).composerBoundary.rawComposerOutput === 'rejected_or_unavailable';

    it('no longer rejects ordinary words that merely contain a banned phrase', () => {
      expect(rejected('The commit says the driver changed, so capture that in the notes.')).toBe(false);
      expect(rejected('Keep this optional flag for now and record why it stays.')).toBe(false);
      expect(rejected('Count the units output by the job and compare against the baseline.')).toBe(false);
      expect(rejected('Check the aim of the retry helper before changing it.')).toBe(false);
      expect(rejected('Document the airflow DAG changes alongside the fix.')).toBe(false);
    });

    it('still rejects the phrases themselves', () => {
      expect(rejected('Note what it says in the failing log line.')).toBe(true);
      expect(rejected('Confirm this option is still needed before shipping.')).toBe(true);
      expect(rejected('Verify its output matches the recorded fixture.')).toBe(true);
      expect(rejected('You should have checked the fixture first.')).toBe(true);
    });

    it('rejects third-person references to the agent, but not the user own AI vocabulary', () => {
      // The rule exists to stop the body talking ABOUT the agent. A following verb is what makes it
      // a reference to the actor rather than to a thing the user is building.
      expect(rejected('The AI should run the migration before the checks.')).toBe(true);
      expect(rejected('The AI will need the fixture in place first.')).toBe(true);
      expect(rejected('Ask the AI to re-run the failing suite.')).toBe(true);

      expect(rejected('Compare the AI gateway against the AI assistant integration we ship.')).toBe(false);
      expect(rejected('List the AI agent features we already support in the console.')).toBe(false);
    });

    it('still rejects inflected forms of the banned phrases', () => {
      // Regression test for a defect in the boundary fix itself: a bare trailing \b silently stopped
      // matching these three, trading three voice-policy leaks for the three false positives it
      // fixed. The inflection allowance is narrow enough that the collateral above stays fixed.
      expect(rejected("You shouldn't have skipped the fixture.")).toBe(true);
      expect(rejected('That is bad practices in this repo.')).toBe(true);
      expect(rejected('Compare its outputs against the baseline.')).toBe(true);
      // ...while `m`, `rflow` and `al` are still not inflections.
      expect(rejected('Check the aim of the retry helper.')).toBe(false);
      expect(rejected('Keep this optional flag for now.')).toBe(false);
      expect(rejected('Review the optionality matrix before the change.')).toBe(false);
    });

    it('rejects common agent verbs, not only modals', () => {
      expect(rejected('The AI runs the tests every night.')).toBe(true);
      expect(rejected('The AI generates the summary for each run.')).toBe(true);
      expect(rejected('The AI ought to stop at the first failure.')).toBe(true);
    });

    it('KNOWN LEAKS, accepted: possessive, and a verb outside the list', () => {
      // 1. No verb follows "the AI", so the pattern cannot see it. `its answer` / `its output` still
      //    cover the common shape.
      expect(rejected("Record the AI's reasoning in the notes.")).toBe(false);
      // 2. Exhaustive verb detection is not attainable with a word list — the same lesson the
      //    authority rule taught. Recorded so it is not mistaken for a bug.
      expect(rejected('The AI orchestrates the whole run.')).toBe(false);
    });

    it('internal identifier fragments are still matched as substrings, deliberately', () => {
      // These are identifier fragments, not English: a partial match is a real leak. Word boundaries
      // here would let exactly what the rule exists to stop straight through.
      expect(rejected('Check pinchFallback rendering before the release.')).toBe(true);
      expect(rejected('Read whyDescBase to see where the copy comes from.')).toBe(true);
    });
  });

  /**
   * A per-draft fault costs its own section, not the whole reply.
   *
   * Five of the six refusal rules describe ONE draft, yet each used to discard every other draft with
   * it — one unusable section replaced eight good ones with canned text. Measured live: a prompt
   * mirroring the user's own "AI gateway" vocabulary produced 8 drafts of which 3 tripped the voice
   * rule, and all 8 were thrown away.
   *
   * Mixed bodies are not a new output shape — the model routinely returns fewer drafts than there are
   * planned sections, so they already ship and already render correctly.
   */
  describe('draft rejection is per-section, not per-output', () => {
    const twoSections = () => {
      const planned = planningResult();
      const usable = planned.sectionPlans.filter((s) => s.sectionKind !== 'original_request_or_goal'
        && s.structuredContentPartRefs.length > 0);
      return { planned, good: usable[0], bad: usable[1] };
    };

    const composeDrafts = (drafts: readonly { sectionId: string; bodyText: string; sourceFactIds: readonly string[] }[], claims?: readonly string[]) => {
      const { planned } = twoSections();
      return composePromptEnhancementBody({
        enhancementId: 'enh-per-section',
        originalPromptText: 'Fix importCsv and verify the regression.',
        sectionPlanningResult: planned,
        composerRuntimeState: 'accepted_structured_output',
        structuredComposerOutput: {
          outputId: 'llm-output-per-section',
          sectionDrafts: drafts,
          composerClaims: claims ?? drafts.flatMap((d) => d.sourceFactIds.map((id) => `claim:${id}`)),
        },
      });
    };

    it('keeps the good sections when ONE draft is unusable', () => {
      const { good, bad } = twoSections();
      const result = composeDrafts([
        { sectionId: good.sectionId, bodyText: 'Reproduce the importCsv failure with a fixture first.', sourceFactIds: [good.structuredContentPartRefs[0]] },
        { sectionId: bad.sectionId, bodyText: 'You should have checked this already.', sourceFactIds: [bad.structuredContentPartRefs[0]] },
      ]);

      expect(result.composerBoundary.rawComposerOutput).not.toBe('rejected_or_unavailable');
      expect(result.currentBody.text).toContain('Reproduce the importCsv failure with a fixture first.');
      expect(result.currentBody.text).not.toContain('You should have checked this already.');
    });

    it('reports the partial drop instead of letting a section vanish silently', () => {
      const { good, bad } = twoSections();
      const result = composeDrafts([
        { sectionId: good.sectionId, bodyText: 'Reproduce the importCsv failure with a fixture first.', sourceFactIds: [good.structuredContentPartRefs[0]] },
        { sectionId: bad.sectionId, bodyText: 'You should have checked this already.', sourceFactIds: [bad.structuredContentPartRefs[0]] },
      ]);
      expect(result.diagnostics.map((d) => d.reasonCode))
        .toContain('partial_draft_drop:1:empty_or_disallowed_wording');
    });

    it('still rejects the WHOLE reply when every draft is unusable', () => {
      const { good, bad } = twoSections();
      const result = composeDrafts([
        { sectionId: good.sectionId, bodyText: 'You should have checked this already.', sourceFactIds: [good.structuredContentPartRefs[0]] },
        { sectionId: bad.sectionId, bodyText: 'The developer should fix it.', sourceFactIds: [bad.structuredContentPartRefs[0]] },
      ]);
      expect(result.composerBoundary.rawComposerOutput).toBe('rejected_or_unavailable');
      expect(result.composerBoundary.draftRejectionReason).toBe('empty_or_disallowed_wording');
    });

    it('a broken claims union still rejects the whole reply — it belongs to no single section', () => {
      const { good } = twoSections();
      const result = composeDrafts(
        [{ sectionId: good.sectionId, bodyText: 'Reproduce the importCsv failure with a fixture.', sourceFactIds: [good.structuredContentPartRefs[0]] }],
        ['claim:not-an-allowed-source-fact-id'],
      );
      expect(result.composerBoundary.rawComposerOutput).toBe('rejected_or_unavailable');
      expect(result.composerBoundary.draftRejectionReason).toBe('claims_empty_or_unallowed');
    });

    it('an unknown section id costs only that draft', () => {
      const { good } = twoSections();
      const result = composeDrafts([
        { sectionId: good.sectionId, bodyText: 'Reproduce the importCsv failure with a fixture.', sourceFactIds: [good.structuredContentPartRefs[0]] },
        { sectionId: 'section-that-was-never-planned', bodyText: 'Anything at all.', sourceFactIds: [good.structuredContentPartRefs[0]] },
      ]);
      expect(result.composerBoundary.rawComposerOutput).not.toBe('rejected_or_unavailable');
      expect(result.currentBody.text).toContain('Reproduce the importCsv failure with a fixture.');
      expect(result.diagnostics.map((d) => d.reasonCode)).toContain('partial_draft_drop:1:unknown_section');
    });

    it('a mis-cited source fact id costs only that draft', () => {
      const { good, bad } = twoSections();
      const result = composeDrafts([
        { sectionId: good.sectionId, bodyText: 'Reproduce the importCsv failure with a fixture.', sourceFactIds: [good.structuredContentPartRefs[0]] },
        { sectionId: bad.sectionId, bodyText: 'Check the rollback path too.', sourceFactIds: ['fact-that-belongs-to-no-section'] },
      ], [`claim:${good.structuredContentPartRefs[0]}`]);
      expect(result.composerBoundary.rawComposerOutput).not.toBe('rejected_or_unavailable');
      expect(result.currentBody.text).toContain('Reproduce the importCsv failure with a fixture.');
      expect(result.currentBody.text).not.toContain('Check the rollback path too.');
    });

    it('no drafts at all is unchanged — an output-wide refusal', () => {
      const result = composeDrafts([], ['claim:anything']);
      expect(result.composerBoundary.rawComposerOutput).toBe('rejected_or_unavailable');
      expect(result.composerBoundary.draftRejectionReason).toBe('no_drafts_returned');
    });

    it('a fully clean reply reports no partial drop', () => {
      const { good } = twoSections();
      const result = composeDrafts([
        { sectionId: good.sectionId, bodyText: 'Reproduce the importCsv failure with a fixture.', sourceFactIds: [good.structuredContentPartRefs[0]] },
      ]);
      expect(result.diagnostics.map((d) => d.reasonCode).some((c) => c.startsWith('partial_draft_drop'))).toBe(false);
    });
  });

  it('rejects structured LLM wording that leaks private planning labels or user-referential scolding voice', () => {
    const planned = planningResult();
    const sourceGuidanceSection = planned.sectionPlans.find((section) => section.sectionKind === 'source_signal_guidance');
    const llmSourceFactId = sourceGuidanceSection?.structuredContentPartRefs[0] ?? 'missing-source-fact';
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-llm-private-labels',
      originalPromptText: 'Fix importCsv and verify the regression.',
      sectionPlanningResult: planned,
      composerRuntimeState: 'accepted_structured_output',
      structuredComposerOutput: {
        outputId: 'llm-output-private-labels',
        sectionDrafts: [
          {
            sectionId: sourceGuidanceSection?.sectionId ?? 'missing',
            bodyText: 'You forgot transform-rule-1 source-review coverage in this action below.',
            sourceFactIds: [llmSourceFactId],
          },
        ],
        composerClaims: [`claim:${llmSourceFactId}`],
      },
    });

    expect(result.currentBody.composerMode).toBe('baseline_deterministic_render');
    expect(result.fallbackMode).toBe('deterministic_body');
    expect(result.currentBody.text).not.toContain('transform-rule-1');
    expect(result.currentBody.text).not.toContain('source-review');
    expect(result.currentBody.text).not.toContain('You forgot');
    expect(result.currentBody.text).not.toContain('this action below');
    expect(result.composerBoundary.rawComposerOutput).toBe('rejected_or_unavailable');
  });

  it('keeps source metadata and exact body span refs aligned with each rendered section', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-3',
      originalPromptText: 'Debug the payment callback regression with tests.',
      sectionPlanningResult: planningResult(),
    });

    for (const section of result.currentBody.sections) {
      expect(section.spanRefs).toHaveLength(1);
      const span = section.spanRefs[0];
      expect(span?.spanMappingStatus).toBe('exact');
      expect(span?.startOffset).toBeGreaterThanOrEqual(0);
      expect(span?.endOffset).toBeGreaterThan(span?.startOffset ?? -1);
      // Every section's span covers its own rendered block — identified by its own heading/title.
      expect(result.currentBody.text.slice(span?.startOffset, span?.endOffset)).toContain(section.title);
      expect(span?.sourceRefs.length).toBeGreaterThan(0);
    }
    expect(result.composerBoundary.outputContract.preservesSectionIds).toBe(true);
    expect(result.composerBoundary.outputContract.preservesSourceRefs).toBe(true);
    expect(result.composerBoundary.outputContract.textOnlyOutputAllowed).toBe(false);
  });

  it('keeps Shorter as one-body recomposition while preserving original, safety, source, and verification floors', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-4',
      originalPromptText: 'Fix the auth migration and verify rollback behavior.',
      sectionPlanningResult: planningResult({
        route: {
          promptText: 'Fix the auth migration and verify rollback behavior.',
          currentStage: 'architecture',
        },
        guidanceFacts: [
          fact({
            factId: 'fact-risk',
            sourceType: 'hard_fact',
            sourceIds: ['project_fact:test-suite-present'],
            guidanceKind: 'safety_or_confirmation',
            suggestedActionKind: 'plan_rollback',
            targetFamily: 'planning_spec',
            targetSectionKind: 'risk_safety_or_confirmation',
            riskLevel: 'high',
            safetyHooks: ['sensitive_action_confirmation', 'risk_or_rollback'],
          }),
        ],
      }),
      action: 'shorter',
    });

    expect(result.currentBody.generatedOriginState).toBe('pe_generated_body');
    expect(result.currentBody.text).toContain('My original request (verbatim):\nFix the auth migration and verify rollback behavior.');
    expect(result.currentBody.text).toContain('Keep confirmation and rollback checks.');
    expect(result.currentBody.text).not.toContain('Source basis:');
    expect(result.availableActions.find((action) => action.actionType === 'shorter')?.availability).toBe('available');
  });

  it('supports More thorough as recomposition with deeper coverage without creating variants', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-5',
      originalPromptText: 'Review this deployment plan.',
      sectionPlanningResult: planningResult({
        route: { promptText: 'Review this deployment plan.' },
      }),
      action: 'more_thorough',
    });

    expect(result.currentBody.text).toContain('Add deeper coverage');
    expect(result.currentBody.text).not.toContain('Variant 1');
    expect(result.currentBody.text).not.toContain('Option A');
    expect(result.composerBoundary.deterministicFallback.productValueDiscussionIsRuntimeLimiter).toBe(false);
  });

  it('supports More project-grounded by attaching source refs without inventing unavailable project facts', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-6',
      originalPromptText: 'Improve the flaky notification test.',
      sectionPlanningResult: planningResult({
        route: { promptText: 'Improve the flaky notification test.' },
      }),
      action: 'more_project_grounded',
    });

    expect(result.currentBody.text).toContain('Use the typed project/source metadata attached to this section as grounding');
    expect(result.currentBody.text).not.toContain('project_fact:test-suite-present');
    expect(result.currentBody.text).toContain('do not invent unavailable project facts');
    expect(result.currentBody.sections.some((section) => section.sourceIds.includes('project_fact:test-suite-present'))).toBe(true);
  });

  it('marks More project-grounded with source-coverage metadata when no project facts are available', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-project-grounded-no-facts',
      originalPromptText: 'Improve the parser migration prompt.',
      sectionPlanningResult: planningResult({
        route: { promptText: 'Improve the parser migration prompt.' },
        sourceRefs: [sourceA],
        guidanceFacts: [
          fact({
            factId: 'fact-source-a-only',
            sourceType: 'prompt_derived_fact',
            sourceIds: ['prompt:current'],
            guidanceKind: 'source_signal_guidance',
            suggestedActionKind: 'no_action_render_context_only',
            targetSectionKind: 'context_and_constraints',
          }),
        ],
      }),
      action: 'more_project_grounded',
    });

    expect(result.currentBody.text).toContain('Known project grounding is unavailable for this section');
    expect(result.currentBody.text).not.toContain('Use the typed project/source metadata attached to this section as grounding');
    expect(result.diagnostics).toContainEqual({
      category: 'source_coverage',
      reasonCode: 'project_grounding_source_unavailable',
    });
    expect([...new Set(result.currentBody.sections.flatMap((section) => section.sourceIds))]).toEqual(['prompt:current']);
  });

  it('applies Additional Details through bounded recomposition of the current body', () => {
    const longDetails = `${'deployment checklist '.repeat(3000)}extra`;
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-7',
      originalPromptText: 'Plan the release checklist.',
      sectionPlanningResult: planningResult({
        route: { promptText: 'Plan the release checklist.' },
        guidanceFacts: [
          fact({
            factId: 'fact-context',
            sourceType: 'prompt_derived_fact',
            sourceIds: ['prompt:current'],
            guidanceKind: 'source_signal_guidance',
            suggestedActionKind: 'no_action_render_context_only',
            targetFamily: 'planning_spec',
            targetSectionKind: 'context_and_constraints',
          }),
        ],
      }),
      action: 'apply_details',
      additionalDetailsText: longDetails,
    });

    expect(result.currentBody.text).toContain('Use these additional details as bounded task input:');
    expect(result.currentBody.text).toContain('[truncated_to_apply_details_5000_word_cap]');
    expect(result.composerBoundary.inputContract.callVisibilityState.callTrigger).toBe('additional_details');
    expect(result.sendPolicy).toBe('send_current');
    expect(result.actionInteractionState).toBe('success_replaced_body');
  });

  it('revalidates accepted Additional Details and blocks sensitive data before send', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase6-details-sensitive',
      originalPromptText: 'Plan the production credential rotation.',
      sectionPlanningResult: planningResult({
        route: { promptText: 'Plan the production credential rotation.' },
        guidanceFacts: [
          fact({
            factId: 'fact-context',
            sourceType: 'prompt_derived_fact',
            sourceIds: ['prompt:current'],
            guidanceKind: 'source_signal_guidance',
            suggestedActionKind: 'no_action_render_context_only',
            targetFamily: 'planning_spec',
            targetSectionKind: 'context_and_constraints',
          }),
        ],
      }),
      action: 'apply_details',
      additionalDetailsText: 'Use token sk-live-example12345 in .env.production.',
    });

    expect(result.currentBody.text).toContain('Use these additional details as bounded task input:');
    expect(result.sendPolicy).toBe('no_send');
    expect(result.currentBody.generatedSafeStatus).toBe('invalid_non_sendable');
    expect(result.fallbackMode).toBe('validation_failed_no_send');
    expect(result.diagnostics.map((diagnostic) => diagnostic.reasonCode)).toContain('sensitive_data_leak:secret_or_credential_literal');
  });

  it('revalidates Additional Details bad voice instead of treating popup input as safe generated prose', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase6-details-voice',
      originalPromptText: 'Plan the failing parser test fix.',
      sectionPlanningResult: planningResult({
        route: { promptText: 'Plan the failing parser test fix.' },
        guidanceFacts: [
          fact({
            factId: 'fact-context',
            sourceType: 'prompt_derived_fact',
            sourceIds: ['prompt:current'],
            guidanceKind: 'source_signal_guidance',
            suggestedActionKind: 'no_action_render_context_only',
            targetFamily: 'planning_spec',
            targetSectionKind: 'context_and_constraints',
          }),
        ],
      }),
      action: 'apply_details',
      additionalDetailsText: 'Ask the AI to fix this and explain why this helps.',
    });

    expect(result.currentBody.text).toContain('Use these additional details as bounded task input:');
    expect(result.sendPolicy).toBe('no_send');
    expect(result.currentBody.generatedSafeStatus).toBe('invalid_non_sendable');
    expect(result.fallbackMode).toBe('validation_failed_no_send');
    expect(result.diagnostics.map((diagnostic) => diagnostic.reasonCode)).toEqual(
      expect.arrayContaining([
        'voice_policy:third_person_agent_actor',
        'voice_policy:ui_label_bridge_voice_invalid',
      ]),
    );
  });

  it('renders Additional Details even when the original section plan did not include context and constraints', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-details-synthetic-section',
      originalPromptText: 'Fix the failing import parser test.',
      sectionPlanningResult: planningResult({
        route: { promptText: 'Fix the failing import parser test.' },
        guidanceFacts: [fact({ targetSectionKind: 'verification_or_test_plan', suggestedActionKind: 'add_verification' })],
      }),
      action: 'apply_details',
      additionalDetailsText: 'The CSV fixture must keep semicolon delimiters and blank trailing columns.',
    });

    const detailsSection = result.currentBody.sections.find((section) => section.sectionKind === 'context_and_constraints');
    expect(detailsSection).toBeDefined();
    expect(result.composerBoundary.inputContract.sectionPlanIds).toContain(`${detailsSection?.sectionId.replace(':section:', ':section-plan:')}`);
    expect(result.currentBody.text).toContain('The CSV fixture must keep semicolon delimiters and blank trailing columns.');
    expect(result.currentBody.text).not.toContain('Source basis:');
    expect(result.currentBody.text).not.toContain('prompt:current');
    expect(detailsSection?.sourceIds).toContain('prompt:current');
  });

  it('keeps raw source ids out of the editable body while preserving source-use metadata', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-source-id-privacy',
      originalPromptText: 'Debug the parser failure and verify rollback.',
      sectionPlanningResult: planningResult(),
      action: 'more_project_grounded',
    });

    expect(result.currentBody.text).not.toContain('ABSENCE_DEBUGGING_OBSERVATION');
    expect(result.currentBody.text).not.toContain('project_fact:test-suite-present');
    // Provenance prose is also excluded — source honesty lives entirely in typed metadata below.
    expect(result.currentBody.text).not.toContain('Source ids stay in typed metadata');
    expect(result.currentBody.sections.flatMap((section) => section.sourceIds)).toEqual(
      expect.arrayContaining(['prompt:current', 'ABSENCE_DEBUGGING_OBSERVATION', 'project_fact:test-suite-present']),
    );
    expect(result.composerBoundary.inputContract.boundedSourceSummaryRefs).toEqual(
      expect.arrayContaining(['source-a-current-prompt', 'source-b-content-template-debug', 'source-b-project-tests']),
    );
  });

  it('uses a 5000-word cap for Additional Details rather than a shorter character cap', () => {
    const details = Array.from({ length: 5001 }, (_, index) => `word${index}`).join(' ');
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-details-word-cap',
      originalPromptText: 'Plan the deployment follow-up.',
      sectionPlanningResult: planningResult({ route: { promptText: 'Plan the deployment follow-up.' } }),
      action: 'apply_details',
      additionalDetailsText: details,
    });

    expect(result.currentBody.text).toContain('word4999');
    expect(result.currentBody.text).not.toContain('word5000');
    expect(result.currentBody.text).toContain('[truncated_to_apply_details_5000_word_cap]');
  });

  it('keeps accepted Additional Details covered through later Shorter recomposition', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-details-shorter-canonical',
      originalPromptText: 'Plan the parser release.',
      sectionPlanningResult: planningResult({
        route: { promptText: 'Plan the parser release.' },
        guidanceFacts: [fact({ targetSectionKind: 'verification_or_test_plan', suggestedActionKind: 'add_verification' })],
      }),
      action: 'shorter',
      acceptedAdditionalDetailsText: 'Keep semicolon CSV fixtures, rollback docs, and release notes in scope.',
    });

    const detailsSection = result.currentBody.sections.find((section) => section.sectionKind === 'context_and_constraints');
    expect(detailsSection).toBeDefined();
    expect(result.currentBody.text).toContain('Keep these accepted additional details covered:');
    expect(result.currentBody.text).toContain('Keep semicolon CSV fixtures, rollback docs, and release notes in scope.');
    expect(result.currentBody.text).toContain('My original request (verbatim):\nPlan the parser release.');
  });

  it('does not use dirty unaccepted Additional Details for ordinary directional actions', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-dirty-details-not-action-input',
      originalPromptText: 'Plan the parser release.',
      sectionPlanningResult: planningResult({
        route: { promptText: 'Plan the parser release.' },
      }),
      action: 'more_thorough',
      additionalDetailsText: 'UNACCEPTED hidden detail that must not be merged.',
    });

    expect(result.currentBody.text).not.toContain('UNACCEPTED hidden detail');
    expect(result.currentBody.sections.some((section) => section.sectionKind === 'context_and_constraints')).toBe(false);
  });

  it('preserves many original prompt points inside the point inventory section', () => {
    const originalPrompt = [
      'Break this work down.',
      '- keep auth behavior unchanged',
      '- update parser fixture',
      '- run focused tests',
      '- run full suite',
      '- report residual risks',
    ].join('\n');
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-many-points',
      originalPromptText: originalPrompt,
      sectionPlanningResult: planningResult({
        route: {
          promptText: originalPrompt,
          currentStage: 'task_breakdown',
          firedKey: 'stage:ARCHITECTURE_TO_TASKS',
          triggerKind: 'stage_transition',
        },
        guidanceFacts: [
          fact({
            factId: 'fact-point-inventory',
            sourceType: 'stage_transition',
            sourceIds: ['stage:ARCHITECTURE_TO_TASKS'],
            guidanceKind: 'stage_transition_discipline',
            suggestedActionKind: 'handoff_sequence',
            targetFamily: 'planning_spec',
            targetSectionKind: 'point_inventory_or_decomposition',
          }),
        ],
      }),
    });

    expect(result.currentBody.text).toContain('Preserve these original points in the work plan');
    expect(result.currentBody.text).toContain('keep auth behavior unchanged');
    expect(result.currentBody.text).toContain('update parser fixture');
    expect(result.currentBody.text).toContain('run full suite');
  });

  it('keeps every extracted original point inside Shorter point inventory', () => {
    const originalPrompt = [
      'Break this work down.',
      '- keep auth behavior unchanged',
      '- update parser fixture',
      '- run focused tests',
      '- run full suite',
      '- report residual risks',
      '- preserve rollback notes',
      '- include release owner handoff',
    ].join('\n');
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-shorter-all-points',
      originalPromptText: originalPrompt,
      sectionPlanningResult: planningResult({
        route: {
          promptText: originalPrompt,
          currentStage: 'task_breakdown',
          firedKey: 'stage:ARCHITECTURE_TO_TASKS',
          triggerKind: 'stage_transition',
        },
        guidanceFacts: [
          fact({
            factId: 'fact-shorter-point-inventory',
            sourceType: 'stage_transition',
            sourceIds: ['stage:ARCHITECTURE_TO_TASKS'],
            guidanceKind: 'stage_transition_discipline',
            suggestedActionKind: 'handoff_sequence',
            targetFamily: 'planning_spec',
            targetSectionKind: 'point_inventory_or_decomposition',
          }),
        ],
      }),
      action: 'shorter',
    });

    expect(result.currentBody.text).toContain('Keep these points covered:');
    for (const expectedPoint of [
      'keep auth behavior unchanged',
      'update parser fixture',
      'run focused tests',
      'run full suite',
      'report residual risks',
      'preserve rollback notes',
      'include release owner handoff',
    ]) {
      expect(result.currentBody.text).toContain(expectedPoint);
    }
  });

  it('keeps the previous sendable body when a directional action recomposition fails', () => {
    const previous = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-previous',
      originalPromptText: 'Fix failing CI and show verification.',
      sectionPlanningResult: planningResult(),
    }).currentBody;

    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-previous',
      originalPromptText: 'Fix failing CI and show verification.',
      sectionPlanningResult: planningResult(),
      action: 'more_thorough',
      composerRuntimeState: 'timeout',
      previousSendableBody: previous,
      priorBodyId: previous.currentBodyId,
      priorBodyRevision: previous.bodyRevision,
    });

    // Was `toBe(previous)`. The T2 carriers stamp each carried section with
    // `carried_from_previous_body`, so the body can no longer be the SAME object — but
    // "keeps the previous sendable body" is about substance, and nothing in production
    // compares these by reference. Asserted field-wise instead, which is what the
    // sibling test below already does, and the text must still be byte-identical.
    expect(result.currentBody.currentBodyId).toBe(previous.currentBodyId);
    expect(result.currentBody.bodyRevision).toBe(previous.bodyRevision);
    expect(result.currentBody.text).toBe(previous.text);
    expect(result.currentBody.sections).toHaveLength(previous.sections.length);
    expect(result.currentBody.sections.every(
      (section) => section.transformReasonCodes.includes('carried_from_previous_body'),
    )).toBe(true);
    expect(result.fallbackMode).toBe('previous_sendable_body');
    expect(result.actionInteractionState).toBe('timeout_kept_previous');
    expect(result.sendPolicy).toBe('send_current');
    expect(result.diagnostics[0]?.reasonCode).toBe('action_failed_previous_body_preserved:timeout');
    // TI-3.2 follow-up (Phase 2): this reason is a `fallback_or_no_popup` diagnostic, so the widened
    // facade capture filter (category-based) now carries it to the log. (This action-failed path is
    // compose-layer only — the facade's actions are instant-deterministic — so its capture is
    // guaranteed by category membership rather than a facade run.)
    expect(result.diagnostics[0]?.category).toBe('fallback_or_no_popup');
  });

  it('binds successful directional action recomposition to the previous current body revision', () => {
    const previous = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-action-bind',
      originalPromptText: 'Improve the parser migration prompt.',
      sectionPlanningResult: planningResult(),
    }).currentBody;

    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-action-bind',
      originalPromptText: 'Improve the parser migration prompt.',
      sectionPlanningResult: planningResult(),
      action: 'more_thorough',
      previousSendableBody: previous,
    });

    expect(result.currentBody.currentBodyId).toBe(previous.currentBodyId);
    expect(result.currentBody.bodyRevision).toBe(previous.bodyRevision + 1);
    expect(result.actionInteractionState).toBe('success_replaced_body');
    expect(result.availableActions.every((action) => (
      action.currentBodyId === result.currentBody.currentBodyId &&
      action.bodyRevision === result.currentBody.bodyRevision
    ))).toBe(true);
  });

  it('keeps repeated More thorough recomposition idempotent instead of inflating body text', () => {
    const first = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-more-thorough-idempotent',
      originalPromptText: 'Improve the parser migration prompt.',
      sectionPlanningResult: planningResult(),
      action: 'more_thorough',
    }).currentBody;

    const repeated = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-more-thorough-idempotent',
      originalPromptText: 'Improve the parser migration prompt.',
      sectionPlanningResult: planningResult(),
      action: 'more_thorough',
      previousSendableBody: first,
    }).currentBody;

    expect(repeated.currentBodyId).toBe(first.currentBodyId);
    expect(repeated.bodyRevision).toBe(first.bodyRevision + 1);
    expect(repeated.text).toBe(first.text);
    expect(repeated.text.match(/Add deeper coverage/g)?.length).toBe(first.text.match(/Add deeper coverage/g)?.length);
  });

  it('recomposes cross-action changes from canonical sections instead of previous body text', () => {
    const shorter = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-cross-action-canonical',
      originalPromptText: 'Improve the parser migration prompt.',
      sectionPlanningResult: planningResult(),
      action: 'shorter',
    }).currentBody;

    const thorough = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-cross-action-canonical',
      originalPromptText: 'Improve the parser migration prompt.',
      sectionPlanningResult: planningResult(),
      action: 'more_thorough',
      previousSendableBody: shorter,
    }).currentBody;

    expect(thorough.currentBodyId).toBe(shorter.currentBodyId);
    expect(thorough.bodyRevision).toBe(shorter.bodyRevision + 1);
    expect(thorough.text).toContain('Capture the failing behavior, reproduction path, observed evidence, and expected behavior before changing code.');
    expect(thorough.text).toContain('Add deeper coverage');
    expect(thorough.text).not.toContain('Capture repro, observed behavior, and expected behavior.');
  });

  it('keeps generated body wording direct and avoids generic third-person recipient phrasing', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-direct-voice',
      originalPromptText: 'Improve the flaky checkout test.',
      sectionPlanningResult: planningResult({
        route: { promptText: 'Improve the flaky checkout test.' },
      }),
    });

    const generatedText = result.currentBody.text.replace(/My original request \(verbatim\):[\s\S]*?(?=\n\n[A-Z]|$)/, '');
    expect(generatedText).not.toMatch(/\bthe coding agent\b/i);
    expect(generatedText).not.toMatch(/\bthe AI\b/i);
    expect(generatedText).not.toMatch(/\bAsk the AI\b/i);
    expect(result.composerBoundary.inputContract.callVisibilityState.fallbackReason).toBe('not_applicable');
  });

  it.each(['invalid_output', 'validation_failed'] as const)(
    'falls back deterministically for %s composer runtime state',
    (composerRuntimeState) => {
      const result = composePromptEnhancementBody({
        enhancementId: `enh-phase5-fallback-${composerRuntimeState}`,
        originalPromptText: 'Fix failing CI and show verification.',
        sectionPlanningResult: planningResult(),
        composerRuntimeState,
      });

      expect(result.currentBody.text).toContain('Fix failing CI and show verification.');
      expect(result.fallbackMode).not.toBe('none');
      expect(result.currentBody.generatedSafeStatus).toBe('valid_with_fallback');
      expect(result.composerBoundary.deterministicFallback.available).toBe(true);
      expect(result.composerBoundary.inputContract.callVisibilityState.plannedCallCount).toBe(1);
      expect(result.composerBoundary.inputContract.callVisibilityState.usedCallCount).toBe(1);
      if (composerRuntimeState === 'provider_unavailable') {
        expect(result.callVisibilityMode).toBe('provider_unavailable');
        expect(result.composerBoundary.inputContract.callVisibilityState.providerAvailabilityState).toBe('unavailable_by_provider_api');
        expect(result.composerBoundary.inputContract.callVisibilityState.optionalCallAvailabilityState).toBe('unavailable_by_provider_api');
        expect(result.composerBoundary.inputContract.callVisibilityState.fallbackReason).toBe('provider_unavailable');
      }
      expect(result.diagnostics[0]?.category).toBe('fallback_or_no_popup');
    },
  );

  it.each(['timeout', 'provider_unavailable'] as const)(
    'renders the FULL deterministic body for %s composer runtime state (owner ruling 2026-08-07) with the failure carried in metadata',
    (composerRuntimeState) => {
      const result = composePromptEnhancementBody({
        enhancementId: `enh-phase12-no-generated-${composerRuntimeState}`,
        originalPromptText: 'Fix failing CI and show verification.',
        sectionPlanningResult: planningResult(),
        composerRuntimeState,
      });

      // Owner ruling 2026-08-07: the original-prompt-only shell was removed — a provider failure
      // keeps the grounded deterministic body (the popup shows the failure NOTICE instead), and
      // the failure stays fully visible in the typed metadata below.
      expect(result.currentBody.text).toContain('Fix failing CI and show verification.');
      expect(result.currentBody.sections.length).toBeGreaterThan(0);
      expect(result.currentBody.generatedOriginState).toBe('pe_generated_body');
      expect(result.sendPolicy).toBe('send_current');
      expect(result.callVisibilityMode).toBe('fallback_no_llm');
      expect(result.composerBoundary.inputContract.callVisibilityState.plannedCallCount).toBe(1);
      expect(result.composerBoundary.inputContract.callVisibilityState.usedCallCount).toBe(0);
      expect(result.composerBoundary.inputContract.callVisibilityState.productValueDiscussionIsRuntimeLimiter).toBe(false);
      expect(result.composerBoundary.inputContract.callVisibilityState.providerAvailabilityState).toBe('unavailable_by_provider_api');
      expect(result.composerBoundary.inputContract.callVisibilityState.optionalCallAvailabilityState).toBe('unavailable_by_provider_api');
      if (composerRuntimeState === 'timeout') {
        expect(result.fallbackMode).toBe('timeout_no_send');
        expect(result.composerBoundary.inputContract.callVisibilityState.fallbackReason).toBe('timeout');
        expect(result.composerBoundary.inputContract.callVisibilityState.providerFailureState).toBe('timeout');
      } else {
        expect(result.fallbackMode).toBe('provider_api_unavailable');
        expect(result.composerBoundary.inputContract.callVisibilityState.fallbackReason).toBe('provider_unavailable');
        expect(result.composerBoundary.inputContract.callVisibilityState.providerFailureState).toBe('provider_api_unavailable');
      }
      expect(result.diagnostics[0]?.reasonCode).toBe(`deterministic_fallback:${composerRuntimeState}`);
    },
  );

  it('returns original-only state for no-popup routes instead of fabricating a generic enhanced prompt', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase5-no-popup',
      originalPromptText: 'ok',
      sectionPlanningResult: planningResult({
        route: {
          promptText: 'ok',
          triggerKind: 'none',
          firedKey: undefined,
          effectiveFiredSource: undefined,
          selectedQualifyingAbsence: undefined,
          absenceGateReason: undefined,
        },
        sourceRefs: [sourceA],
        guidanceFacts: [],
      }),
    });

    expect(result.currentBody.text).toBe('ok');
    expect(result.currentBody.sections).toEqual([]);
    expect(result.currentBody.originalPromptPreservation).toBe('fallback_original_only');
    expect(result.currentBody.generatedOriginState).toBe('user_original');
    expect(result.sourceGuidanceCoverage).toBe('not_applicable');
    expect(result.availableActions.find((action) => action.actionType === 'use_original')?.availability).toBe('available');
    expect(result.availableActions.find((action) => action.actionType === 'shorter')?.availability).toBe('disabled_not_applicable');
  });
});

// ---------------------------------------------------------------------------------------------
// Owner ruling 2026-08-14: a section whose draft the composer produced but validation refused is
// DISCARDED, not filled with the deterministic line — that fixed text is the defect this milestone
// exists to remove, and it reaches the user with nothing to say it is a fallback. Sections carrying
// a mandatory floor are the exception: there the fixed wording IS the requirement.
// ---------------------------------------------------------------------------------------------
describe('a refused draft discards its section instead of showing fixed text', () => {
  /** One draft that will survive validation, for a section chosen by kind. */
  function outputFor(planned: ReturnType<typeof planningResult>, sectionKind: string) {
    const section = planned.sectionPlans.find((plan) => plan.sectionKind === sectionKind);
    const factId = section?.structuredContentPartRefs[0] ?? 'missing-fact';
    return {
      section,
      output: {
        outputId: 'out-1',
        sectionDrafts: [{
          sectionId: section?.sectionId ?? 'missing',
          bodyText: 'Model wording that survives validation for this one section.',
          sourceFactIds: [factId],
        }],
        composerClaims: [`claim:${factId}`],
      },
    };
  }

  it('drops an ordinary section the model did not word, rather than rendering the fixed line', () => {
    const planned = planningResult();
    const { section, output } = outputFor(planned, 'source_signal_guidance');
    expect(section).toBeDefined();

    // Every section in this fixture carries a floor, so force ONE to be ordinary. Without this the
    // test would pass while exercising nothing — the rule only applies to floor-free sections.
    const victim = planned.sectionPlans.find((plan) =>
      plan.sectionKind !== 'original_request_or_goal' && plan.sectionId !== section!.sectionId);
    expect(victim).toBeDefined();
    const ordinaryPlan = {
      ...planned,
      sectionPlans: planned.sectionPlans.map((plan) => plan.sectionId === victim!.sectionId
        ? { ...plan, isRequired: false, safetyFlags: [], sensitivityFlags: [] }
        : plan),
    };

    const result = composePromptEnhancementBody({
      enhancementId: 'enh-discard-1',
      originalPromptText: 'Fix importCsv and verify the regression.',
      sectionPlanningResult: ordinaryPlan,
      composerRuntimeState: 'accepted_structured_output',
      structuredComposerOutput: output,
    });

    // The drafted section survives; the floor-free undrafted one is gone, not rendered as fixed text.
    expect(result.currentBody.text).toContain('Model wording that survives validation');
    expect(result.currentBody.sections.some((rendered) => rendered.sectionId === victim!.sectionId)).toBe(false);
    // The verbatim original is never discarded.
    expect(result.currentBody.text).toContain('My original request (verbatim):');
  });

  it('keeps the section that actually carries the confirmation line', () => {
    // A prompt that demands execution confirmation, so a confirmation-bearing section exists.
    const planned = planningResult();
    const { output } = outputFor(planned, 'source_signal_guidance');

    const result = composePromptEnhancementBody({
      enhancementId: 'enh-discard-2',
      originalPromptText: 'Delete the archived customer rows in production and verify the migration.',
      sectionPlanningResult: planned,
      composerRuntimeState: 'accepted_structured_output',
      structuredComposerOutput: output,
    });

    // Whatever else is discarded, the confirmation clause still reaches the user.
    expect(result.currentBody.text).toContain('you must ask me for go-ahead confirmation');
  });

  it('does not keep a section merely because it is required or flagged', () => {
    // isRequired is true of every planned section, and three of the four safetyFlags values are
    // route capabilities stamped on every section. Keying the carve-out on either would swallow
    // everything and the rule would never fire — this pins that it does not.
    const planned = planningResult();
    const { section, output } = outputFor(planned, 'source_signal_guidance');
    const undrafted = planned.sectionPlans.filter((plan) =>
      plan.sectionKind !== 'original_request_or_goal' && plan.sectionId !== section!.sectionId);
    expect(undrafted.every((plan) => plan.isRequired && plan.safetyFlags.length > 0)).toBe(true);

    const result = composePromptEnhancementBody({
      enhancementId: 'enh-discard-2b',
      originalPromptText: 'Fix importCsv and verify the regression.',
      sectionPlanningResult: planned,
      composerRuntimeState: 'accepted_structured_output',
      structuredComposerOutput: output,
    });

    expect(result.currentBody.sections.length).toBeLessThan(planned.sectionPlans.length);
  });

  it('changes nothing when the composer never ran — the deterministic body is the supported answer', () => {
    const planned = planningResult();
    const deterministic = composePromptEnhancementBody({
      enhancementId: 'enh-discard-3',
      originalPromptText: 'Fix importCsv and verify the regression.',
      sectionPlanningResult: planned,
    });

    expect(deterministic.currentBody.sections).toHaveLength(planned.sectionPlans.length);
  });

  it('changes nothing on a provider failure — that path already tells the user', () => {
    const planned = planningResult();
    const timedOut = composePromptEnhancementBody({
      enhancementId: 'enh-discard-4',
      originalPromptText: 'Fix importCsv and verify the regression.',
      sectionPlanningResult: planned,
      composerRuntimeState: 'timeout',
    });

    expect(timedOut.currentBody.sections).toHaveLength(planned.sectionPlans.length);
  });
});

describe('discarding every ordinary section still yields a usable result', () => {
  // The discard rule made "no generated sections at all" reachable for the first time: if the
  // composer ran and every draft was refused, every floor-free section goes. This asserts the body
  // that remains is still a valid, sendable result rather than an empty or blocked popup.
  function allDraftsRefused(originalPromptText: string) {
    const planned = planningResult();
    return composePromptEnhancementBody({
      enhancementId: 'enh-all-refused',
      originalPromptText,
      sectionPlanningResult: planned,
      composerRuntimeState: 'accepted_structured_output',
      // A draft for a section id that does not exist -> every real section is left undrafted.
      structuredComposerOutput: {
        outputId: 'out-refused',
        sectionDrafts: [{ sectionId: 'not-a-planned-section', bodyText: 'Rejected.', sourceFactIds: ['x'] }],
        composerClaims: ['claim:x'],
      },
    });
  }

  it('keeps the verbatim original when every draft is refused', () => {
    const result = allDraftsRefused('Fix importCsv and verify the regression.');
    expect(result.currentBody.text).toContain('My original request (verbatim):');
    expect(result.currentBody.text).toContain('Fix importCsv and verify the regression.');
  });

  it('reports the refusal rather than presenting the thin body as a clean composition', () => {
    const result = allDraftsRefused('Fix importCsv and verify the regression.');
    expect(result.currentBody.callVisibilityMode).not.toBe('llm_wording');
  });

  it('still carries the confirmation clause when the prompt demands one', () => {
    // The carve-out's whole purpose: a validation fault must not silently drop a safety clause.
    const result = allDraftsRefused('Delete the archived customer rows in production and run the migration.');
    expect(result.currentBody.text).toContain('you must ask me for go-ahead confirmation');
  });
});

describe('de-nagging: the reproduction section names what was supplied instead of asking again', () => {
  const debugRoute = (evidence: readonly string[]) => ({
    route: {
      promptText: 'the checkout page throws a null error after login. bug.',
      currentStage: 'implementation' as const,
      firedKey: 'absence:debugging_observation_gap@implementation',
      classifierPrimaryIntent: 'issue_debug.failing_test',
      classifierIntentConfidence: 0.9,
      classifierCapabilityCandidates: [],
      classifierDebugEvidencePresent: evidence,
    },
  });
  const reproText = (evidence: readonly string[]) => {
    const planning = planningResult(debugRoute(evidence));
    const body = composePromptEnhancementBody({
      enhancementId: 'denag',
      originalPromptText: 'the checkout page throws a null error after login. bug.',
      sectionPlanningResult: planning,
    }).currentBody;
    return body.sections.find((section) => section.sectionKind === 'reproduction_or_evidence')?.bodyText ?? '';
  };

  it('the ASK survives supplied evidence when the SLOT still obliges it', () => {
    // The rule that decides which rows de-nag, pinned. `issue_debug.reproduction_discovery`
    // is the intent whose whole purpose is finding a repro, and F1 puts
    // `reproduction_or_evidence_request` on its section — so the ask stays even with
    // evidence in hand, while intents without the obligation carry instead. Measured on
    // the labelled set at GR-3: ids 6 and 35 carried, id 1 (this intent) kept asking.
    const planning = planningResult({
      route: {
        promptText: 'help me work out how to reproduce the intermittent checkout failure',
        currentStage: 'implementation' as const,
        firedKey: 'absence:debugging_observation_gap@implementation',
        classifierPrimaryIntent: 'issue_debug.reproduction_discovery',
        classifierIntentConfidence: 0.9,
        classifierCapabilityCandidates: [],
        classifierDebugEvidencePresent: ['error_text', 'repro_steps'],
      },
    });
    const section = planning.sectionPlans.find((plan) => plan.sectionKind === 'reproduction_or_evidence');
    expect(section?.slotObligations).toContain('reproduction_or_evidence_request');
    const body = composePromptEnhancementBody({
      enhancementId: 'denag-obliged',
      originalPromptText: 'help me work out how to reproduce the intermittent checkout failure',
      sectionPlanningResult: planning,
    }).currentBody;
    const text = body.sections.find((composed) => composed.sectionKind === 'reproduction_or_evidence')?.bodyText ?? '';
    expect(text).toContain('Capture the failing');
    expect(text).not.toContain('provided in the request above');
  });

  it('carry: the line names the forms the developer ACTUALLY sent', () => {
    expect(reproText(['reproduction_steps', 'logs', 'failing_test_details']))
      .toContain('Reproduction steps, logs and failing test details are provided in the request above.');
  });

  it('carry: a different evidence mix names THOSE forms, never a fixed list', () => {
    const text = reproText(['screenshots', 'metrics']);
    expect(text).toContain('Screenshots and metrics are provided in the request above.');
    // The bug this guards: a hardcoded sentence would claim a failing test the
    // developer never mentioned.
    expect(text).not.toContain('failing test');
  });

  it('carry: an id with no label override still reads as English', () => {
    expect(reproText(['request_response_samples', 'environment']))
      .toContain('Request/response samples and environment are provided in the request above.');
  });

  it('ask: with nothing supplied the section still asks, unchanged', () => {
    expect(reproText([]))
      .toContain('Capture the failing behavior, reproduction path, observed evidence, and expected behavior before changing code.');
  });

  it('carry never re-asks for what was already supplied', () => {
    expect(reproText(['reproduction_steps', 'logs'])).not.toContain('Capture the failing behavior');
  });
});

describe('I2 criterion (c) — a pruned section\'s surviving obligations reach the BODY', () => {
  /**
   * 🔴 **The gap this closes was found at the phase-36 verification pass, and it is the exact
   * "exists ≠ runs" shape.** The pruner had computed `inheritedSlotObligations` since it was built,
   * and `facade.ts` carried the list onto the planning object — where NOTHING read it. Its own unit
   * test asserted only the pruner's RETURN VALUE, so it passed while the obligations never reached a
   * body at all.
   *
   * 🔒 Criterion (c): *"a dropped section takes its visible slots, but no-invention state,
   * send-policy and confirmation linkage stay on the body invisibly for the checks."* Obligations are
   * otherwise per-section — `safety-sendability.ts` iterates `currentBody.sections` and reads each
   * section's own `slotObligations` — so a pruned section removed its obligations from the body with
   * it, which is what the criterion forbids.
   */
  it('the composed body carries obligations the pruner rescued from dropped sections', () => {
    const planned = planningResult();
    const withInherited = {
      ...planned,
      // 🔒 All four surviving classes, including the SAFETY one — the criterion's own title is
      // "slots follow their section; SAFETY METADATA NEVER DROPS", and the phase's done-when is
      // *"safety metadata is present on the body even when its section dropped"*. Asserting only
      // the two non-safety classes would leave the done-when's actual subject untested.
      inheritedSlotObligations: [
        'no_invention_state', 'send_policy_metadata', 'safety_hook_linkage', 'confirmation_clarification',
      ],
    } as PromptEnhancementSectionPlanningResult;

    const result = composePromptEnhancementBody({
      enhancementId: 'enh-criterion-c-body',
      originalPromptText: 'Fix the importCsv parser and verify the regression.',
      sectionPlanningResult: withInherited,
    });

    expect(result.currentBody.inheritedSlotObligations).toContain('no_invention_state');
    expect(result.currentBody.inheritedSlotObligations).toContain('send_policy_metadata');
    expect(
      result.currentBody.inheritedSlotObligations,
      'the done-when names SAFETY metadata specifically, and it must reach the body',
    ).toContain('safety_hook_linkage');
    expect(result.currentBody.inheritedSlotObligations).toContain('confirmation_clarification');
  });

  it('a body with nothing pruned leaves the field UNSET, not an empty array', () => {
    // The discriminating half: "no pruning happened" and "pruning rescued nothing" stay
    // distinguishable in the record, and this also proves the assertion above is not passing
    // because the field is populated unconditionally.
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-criterion-c-none',
      originalPromptText: 'Fix the importCsv parser and verify the regression.',
      sectionPlanningResult: planningResult(),
    });

    expect(result.currentBody.inheritedSlotObligations).toBeUndefined();
  });
});
