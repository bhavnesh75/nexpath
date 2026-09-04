import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  type PromptEnhancementPrepareRequestV1,
  type PromptEnhancementSourceRefV1,
} from './contracts.js';
import { isPromptEnhancementNlpHeavyCaseV1 } from './composer-gate.js';
import { buildPromptEnhancementCostVisibilityMetadataV1 } from './cost-observability.js';
import { routePromptEnhancement } from './routing-taxonomy.js';
import { getPromptStartStopSourceSnapshot } from './source-reality.js';

// No composer-gate mock: the baseline compose no longer consults the route's
// ambiguity, so every shown popup with a valid key reaches the composer on its own.
// `isPromptEnhancementNlpHeavyCaseV1` keeps its own unit tests in composer-gate.test.ts.

// A "smart" mock composer: it reads the planning the facade passes and returns a
// VALID structured output (real section id + an allowed source fact id) so the
// downstream validator accepts it — proving the LLM wording path, not the fallback.
vi.mock('./llm-composer.js', () => ({
  composeStructuredComposerOutputV1: vi.fn(async (input: { planning: { sectionPlans: readonly { sectionId: string; sectionKind: string; structuredContentPartRefs: readonly string[] }[] } }) => {
    const section = input.planning.sectionPlans.find(
      (plan) => plan.sectionKind !== 'original_request_or_goal' && plan.structuredContentPartRefs.length > 0,
    );
    if (!section) return { ok: false, reason: 'no_eligible_sections' };
    const factId = section.structuredContentPartRefs[0];
    return { ok: true, output: {
      outputId: 'test-llm-output',
      sectionDrafts: [{ sectionId: section.sectionId, bodyText: 'Tailored model wording for this section.', sourceFactIds: [factId] }],
      composerClaims: [`claim:${factId}`],
    } };
  }),
}));

const { preparePromptEnhancement, applyPromptEnhancementAction } = await import('./facade.js');
const { composeStructuredComposerOutputV1 } = await import('./llm-composer.js');

function request(): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'src-a-1', sourceKind: 'source_a_user_prompt', sourceId: 'prompt:1',
    sourceAuthorization: 'source_fact_only', evidenceStatus: 'present', freshness: 'current', confidence: 'high', privacyClass: 'public_safe',
  };
  const promptStartStop = getPromptStartStopSourceSnapshot();
  return {
    schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION, requestId: 'facade-llm-1', projectRoot: '/tmp/project', hostSurface: 'cli_stop_bridge',
    sourcePrompt: { text: 'Fix the failing payment test, the test failure blocks ci, and explain the verification.', origin: 'user', capturedAt: 1, promptIndex: 1, generatedOriginPolicy: 'ordinary_source_a' },
    reviewMomentContext: {
      reviewMoment: 'UserPromptSubmit_preparation', currentAgentMode: 'workspace-write', projectId: 'project-1', sessionId: 'session-1',
      detectedLanguage: 'en', stageCandidate: 'implementation', promptCount: 1, recentPromptMetadataRefs: [],
      triggerProvenance: {
        currentStage: 'implementation', prevStage: 'task_breakdown', triggerKind: 'stage_transition', classifierState: 'fire_recommended',
        degradedNoActionState: 'none', promptStartBoundary: promptStartStop.hookBoundary, deliveryBoundary: promptStartStop.deliveryBoundary, promptStartCanReplaceSameTurn: false,
      },
    },
    sourceSignals: {
      sourceAOriginalPromptRef: sourceRef, sourceRefs: [sourceRef], normalizedStageAbsenceSignalRefs: [], contentTemplateRecordFactRefs: [],
      popupQuestionSourceRefs: [], whyHelpSourceRefs: [], profileRoleModeRefs: [], rightGoodWorkStyleEnvRuntimeRefs: [], missingMemoryCandidateRefs: [],
      sourceLabels: [{ sourceRefId: sourceRef.sourceRefId, label: 'original_prompt', evidenceStatus: 'present' }],
      promptStartStop: { hookBoundary: promptStartStop.hookBoundary, deliveryBoundary: promptStartStop.deliveryBoundary, runAutoCanHoldOrReplaceSubmittedPrompt: false, sharedSignalCount: promptStartStop.sharedSignalCount, classifierDegradedNoFireReasons: promptStartStop.classifierDegradedNoFireReasons },
      store: { schemaVersion: 1, missingPromptEnhancementTables: [], cleanupGaps: [] }, transcriptPathState: 'not_authority', streamBOutputs: [], paramEventChannels: [],
      servedVariantIdentityRefs: [], deliveryGateRefs: [], sourceOnlyHardFactRefs: [],
    },
    userPreferenceContext: { levelState: 'default', scopedFeedbackEvidenceRefs: [] },
    configSnapshot: { sequenceEnabledState: 'not_enabled_v1', validatedEffectiveConfigState: 'valid', arbitraryConfigRowsAreAuthority: false },
    callVisibilityState: buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', { callVisibilityMode: 'deterministic', plannedCallCount: 0, usedCallCount: 0 }),
    privacyAndStoragePolicy: { sensitivityClass: 'normal', localStorageEligibility: 'ids_and_categories_only', telemetryEligibility: 'allowlisted_counts_only', llmSharingEligibility: 'allowed_minimal', generatedBodyStoragePolicy: 'do_not_store_raw_by_default' },
  };
}

const priorKey = process.env['OPENAI_API_KEY'];
afterEach(() => {
  if (priorKey === undefined) delete process.env['OPENAI_API_KEY'];
  else process.env['OPENAI_API_KEY'] = priorKey;
  vi.clearAllMocks();
});

describe('E4 — facade LLM composer wiring', () => {
  it('LLM path: valid key + shown popup + accepted structured output -> llm_wording + non-deterministic modelVersion', async () => {
    process.env['OPENAI_API_KEY'] = `sk-${'x'.repeat(40)}`;
    const result = await preparePromptEnhancement(request());
    expect(result.disposition).toBe('show_current_body');
    expect(composeStructuredComposerOutputV1).toHaveBeenCalledTimes(1);
    expect(result.callAndVisibilityMetadata.callVisibilityMode).toBe('llm_wording');
    expect(result.modelVersion).toBe('llm-wording-v1');
    expect(result.currentBody.text).toContain('Tailored model wording');
  });

  it('Layer 2 reaches the POPUP decision — a declared transposition blocks through the facade', async () => {
    // The judge can be perfect in isolation and still be inert: the facade re-validates the
    // composed body, and THAT result decides the popup. This proves the declaration travels.
    process.env['OPENAI_API_KEY'] = `sk-${'x'.repeat(40)}`;
    const mocked = vi.mocked(composeStructuredComposerOutputV1);
    const original = mocked.getMockImplementation()!;
    mocked.mockImplementationOnce(async (input: never) => {
      const base = await original(input);
      if (!base.ok) return base;
      return { ok: true, output: {
        ...base.output,
        nounPurposes: [{ noun: 'payment test', purposeInPrompt: 'the failing payment test', purposeInBody: 'for tracking user analytics' }],
      } };
    });
    const result = await preparePromptEnhancement(request());
    // The model's wording is refused and the deterministic body takes its place: the layer
    // reached the decision AND the developer keeps a popup. Both halves matter.
    expect(result.currentBody.text).not.toContain('Tailored model wording');
    expect(result.disposition).toBe('show_current_body');
    expect(result.callAndVisibilityMetadata.callVisibilityMode).not.toBe('llm_wording');
  });

  it('a clean declaration changes nothing — the same request composes and sends', async () => {
    process.env['OPENAI_API_KEY'] = `sk-${'x'.repeat(40)}`;
    const mocked = vi.mocked(composeStructuredComposerOutputV1);
    const original = mocked.getMockImplementation()!;
    mocked.mockImplementationOnce(async (input: never) => {
      const base = await original(input);
      if (!base.ok) return base;
      return { ok: true, output: {
        ...base.output,
        nounPurposes: [{ noun: 'payment test', purposeInPrompt: 'the failing payment test', purposeInBody: 'fixing the failing payment test' }],
      } };
    });
    const result = await preparePromptEnhancement(request());
    expect(result.disposition).toBe('show_current_body');
    expect(result.currentBody.text).toContain('Tailored model wording');
    expect(result.callAndVisibilityMetadata.callVisibilityMode).toBe('llm_wording');
  });

  it('a plainly unambiguous prompt still composes — the route no longer decides', async () => {
    // This is the case that used to fail. An obvious, single-intent, unambiguous prompt
    // routes "clear", which used to close the composer gate and hand the user a body whose
    // every guidance section was a fixed string. It must now reach the composer like any
    // other shown popup.
    const PLAIN_TEXT = 'Add a nullable phone_number column to the users table.';

    // Premise guard. The test is only the regression case while this prompt reads as NOT
    // NLP-heavy — that is what used to shut the gate. If the routing heuristics ever change
    // enough that this text reads ambiguous, this fails loudly and a new prompt is needed,
    // rather than the test quietly passing while testing nothing.
    const snapshot = getPromptStartStopSourceSnapshot();
    const plainRoute = routePromptEnhancement({
      promptText: PLAIN_TEXT, promptOrigin: 'user', reviewMoment: 'UserPromptSubmit_preparation',
      sourceSnapshot: undefined, sourceFactRefs: ['src-a-1'],
      classifierState: 'fire_recommended', degradedNoActionState: 'none',
      generatedOriginState: 'ordinary_user_prompt', oldDecisionSessionPayloadPresent: false,
      promptStartBoundary: snapshot.hookBoundary, deliveryBoundary: snapshot.deliveryBoundary,
    } as never);
    expect(isPromptEnhancementNlpHeavyCaseV1(plainRoute)).toBe(false);

    process.env['OPENAI_API_KEY'] = `sk-${'x'.repeat(40)}`;
    const plain = {
      ...request(),
      sourcePrompt: { ...request().sourcePrompt, text: PLAIN_TEXT },
    } as PromptEnhancementPrepareRequestV1;

    const result = await preparePromptEnhancement(plain);
    expect(result.disposition).toBe('show_current_body');
    expect(composeStructuredComposerOutputV1).toHaveBeenCalledTimes(1);
    expect(result.callAndVisibilityMetadata.callVisibilityMode).toBe('llm_wording');
    expect(result.currentBody.text).toContain('Tailored model wording');
  });

  it('no popup -> composer not called, even with a valid key', async () => {
    // Opening the composer must not mean composing for a popup that is never shown.
    // A degraded classifier routes to no-popup before any wording question arises.
    process.env['OPENAI_API_KEY'] = `sk-${'x'.repeat(40)}`;
    const base = request();
    const noPopupRequest = {
      ...base,
      reviewMomentContext: {
        ...base.reviewMomentContext,
        triggerProvenance: {
          ...base.reviewMomentContext.triggerProvenance,
          classifierState: 'degraded_no_fire' as const,
        },
      },
    } as PromptEnhancementPrepareRequestV1;

    const result = await preparePromptEnhancement(noPopupRequest);
    // Assert the popup really was suppressed, not merely that no call happened — otherwise
    // this passes for any reason that skips the composer and stops being a no-popup test.
    expect(result.disposition).toBe('no_popup_not_applicable');
    expect(composeStructuredComposerOutputV1).not.toHaveBeenCalled();
    expect(result.callAndVisibilityMetadata.callVisibilityMode).not.toBe('llm_wording');
  });

  it('fallback: no API key -> composer not called -> deterministic modelVersion (identical to today)', async () => {
    delete process.env['OPENAI_API_KEY'];
    const result = await preparePromptEnhancement(request());
    expect(result.disposition).toBe('show_current_body');
    expect(composeStructuredComposerOutputV1).not.toHaveBeenCalled();
    expect(result.callAndVisibilityMetadata.callVisibilityMode).not.toBe('llm_wording');
    expect(result.modelVersion).toBe('deterministic-v1');
  });

  it('popup actions are INSTANT deterministic (owner decision 2026-08-06): a directional action never calls the LLM', async () => {
    process.env['OPENAI_API_KEY'] = `sk-${'x'.repeat(40)}`;
    const base = await preparePromptEnhancement(request());
    const shorter = base.availableActions.find((entry) => entry.actionType === 'shorter');
    expect(shorter).toBeDefined();
    vi.clearAllMocks(); // ignore the composer call from the base prepare

    const actionRequest = {
      ...request(),
      action: shorter!,
      currentBodyBinding: {
        currentBodyId: base.currentBody.currentBodyId,
        bodyRevision: base.currentBody.bodyRevision,
        validationDecisionId: base.validationDecisionId,
        editedBodyText: base.currentBody.text,
        actionSubmittedAtMs: 2,
        realUserInitiated: true,
        sectionSpanEditEvents: [],
      },
    } as unknown as Parameters<typeof applyPromptEnhancementAction>[0];

    const result = await applyPromptEnhancementAction(actionRequest);
    // Even WITH a valid key, the in-popup recompose must not wait on the LLM — instant
    // deterministic, exactly like before (an in-popup LLM wait reads as a frozen popup).
    expect(composeStructuredComposerOutputV1).not.toHaveBeenCalled();
    expect(result.callAndVisibilityMetadata.callVisibilityMode).not.toBe('llm_wording');
    expect(result.disposition).toBe('show_current_body');
  });

  it('TI-3.3: a blocked LLM body silently replaced by the deterministic body reports the pre-substitution verdict', async () => {
    process.env['OPENAI_API_KEY'] = `sk-${'x'.repeat(40)}`;
    // Accepted draft (valid section + real source fact) whose FINAL wording hard-blocks on
    // authority escalation ('rm -rf' against a non-execute prompt) — a family the draft filter lets
    // through. The facade drops the drafts and recomposes the deterministic body (which passes),
    // silently swapping the blocked body. Without the reporting fields this logs like a clean run.
    vi.mocked(composeStructuredComposerOutputV1).mockImplementationOnce(async (input: { planning: { sectionPlans: readonly { sectionId: string; sectionKind: string; structuredContentPartRefs: readonly string[] }[] } }) => {
      const section = input.planning.sectionPlans.find(
        (plan) => plan.sectionKind !== 'original_request_or_goal' && plan.structuredContentPartRefs.length > 0,
      );
      if (!section) return { ok: false, reason: 'no_eligible_sections' };
      const factId = section.structuredContentPartRefs[0];
      return { ok: true, output: {
        outputId: 'test-llm-blocked-output',
        sectionDrafts: [{ sectionId: section.sectionId, bodyText: 'Run rm -rf on the build directory to reset it.', sourceFactIds: [factId] }],
        composerClaims: [`claim:${factId}`],
      } };
    });

    const result = await preparePromptEnhancement(request());
    // The substitution fired and is now traceable.
    expect(result.deterministicFallbackApplied).toBe(true);
    expect(result.preSubstitutionAuthorityEscalationState).toBe('invalid_non_sendable');
    // The blocked LLM wording never reaches the user; the disposition stays the normal happy path
    // (byte-identical outcome — the reporting field is the ONLY difference from a clean run).
    expect(result.currentBody.text).not.toContain('rm -rf');
    expect(result.disposition).toBe('show_current_body');
    // TI-3.2: the compose-layer reason codes the public diagnostics array genericizes away are
    // captured for the log — the substitution marker + the deterministic-fallback cause.
    expect(result.compositionFallbackReasonCodes).toContain('llm_final_body_blocked_deterministic_fallback');
    expect(result.compositionFallbackReasonCodes?.some((code) => code.startsWith('deterministic_fallback:'))).toBe(true);

    // A clean LLM run (default mock, no block) leaves the reporting fields unset — visibly distinct.
    const clean = await preparePromptEnhancement(request());
    expect(clean.deterministicFallbackApplied).toBeUndefined();
    expect(clean.preSubstitutionAuthorityEscalationState).toBeUndefined();
    expect(clean.compositionFallbackReasonCodes).toBeUndefined();
  });

  it('TI-3.2 follow-up (Phase 1): a partial section drop is no longer silent — partial_draft_drop reaches the log', async () => {
    process.env['OPENAI_API_KEY'] = `sk-${'x'.repeat(40)}`;
    // The composer returns TWO drafts: one valid (survives) and one targeting a section that does not
    // exist (dropped as `unknown_section`). The reply survives, so the body composes with LLM wording
    // and callVisibilityMode stays `llm_wording` / valid — byte-identical to a perfect run EXCEPT that
    // a section was silently dropped. The only trace is the partial_draft_drop reason code.
    vi.mocked(composeStructuredComposerOutputV1).mockImplementationOnce(async (input: { planning: { sectionPlans: readonly { sectionId: string; sectionKind: string; structuredContentPartRefs: readonly string[] }[] } }) => {
      const section = input.planning.sectionPlans.find(
        (plan) => plan.sectionKind !== 'original_request_or_goal' && plan.structuredContentPartRefs.length > 0,
      );
      if (!section) return { ok: false, reason: 'no_eligible_sections' };
      const factId = section.structuredContentPartRefs[0];
      return { ok: true, output: {
        outputId: 'test-llm-partial-drop-output',
        sectionDrafts: [
          { sectionId: section.sectionId, bodyText: 'Valid tailored wording for this section.', sourceFactIds: [factId] },
          { sectionId: 'nexpath-nonexistent-section', bodyText: 'This draft targets a section that is not in the plan.', sourceFactIds: [factId] },
        ],
        composerClaims: [`claim:${factId}`],
      } };
    });

    const result = await preparePromptEnhancement(request());
    // The surviving draft rendered (partial, not full, drop) and the run LOOKS like a clean success...
    expect(result.currentBody.text).toContain('Valid tailored wording');
    expect(result.callAndVisibilityMetadata.callVisibilityMode).toBe('llm_wording');
    expect(result.disposition).toBe('show_current_body');
    // ...but the dropped section is now traceable in the log-bound reason codes.
    expect(result.compositionFallbackReasonCodes?.some((code) => code.startsWith('partial_draft_drop:'))).toBe(true);
    // This is a compose-layer drop, NOT a facade substitution — the TI-3.3 flag stays unset.
    expect(result.deterministicFallbackApplied).toBeUndefined();

    // A clean LLM run (default mock, all drafts valid) drops nothing and stays empty — visibly distinct.
    const clean = await preparePromptEnhancement(request());
    expect(clean.compositionFallbackReasonCodes).toBeUndefined();
  });

  it('TI-3.2 follow-up (Phase 3): a more_project_grounded action with no grounding source captures project_grounding_source_unavailable', async () => {
    process.env['OPENAI_API_KEY'] = `sk-${'x'.repeat(40)}`;
    const base = await preparePromptEnhancement(request());
    const grounded = base.availableActions.find((entry) => entry.actionType === 'more_project_grounded');
    expect(grounded).toBeDefined();

    const actionRequest = {
      ...request(),
      action: grounded!,
      currentBodyBinding: {
        currentBodyId: base.currentBody.currentBodyId,
        bodyRevision: base.currentBody.bodyRevision,
        validationDecisionId: base.validationDecisionId,
        editedBodyText: base.currentBody.text,
        actionSubmittedAtMs: 2,
        realUserInitiated: true,
        sectionSpanEditEvents: [],
      },
    } as unknown as Parameters<typeof applyPromptEnhancementAction>[0];

    const result = await applyPromptEnhancementAction(actionRequest);
    // The fixture's only source is source_a_user_prompt (no hard-fact / template / memory), so the
    // grounding request cannot be honored — a silent degrade whose source_coverage diagnostic
    // diagnosticsFor genericizes away. Phase 3 captures it so it reaches the log.
    expect(result.compositionFallbackReasonCodes).toContain('project_grounding_source_unavailable');
  });

  it('TI-3 audit follow-up: an apply_details action over the 5,000-word cap sets additionalDetailsTruncated', async () => {
    process.env['OPENAI_API_KEY'] = `sk-${'x'.repeat(40)}`;
    const base = await preparePromptEnhancement(request());
    const applyDetails = base.availableActions.find((entry) => entry.actionType === 'apply_details');
    expect(applyDetails).toBeDefined();

    // > 5,000 words of additional details: the engine truncates and emits the input-cap notice; the
    // reporting flag makes "was the input truncated?" answerable from the result + log.
    const longDetails = Array.from({ length: 5001 }, () => 'detail').join(' ');
    const actionRequest = {
      ...request(),
      action: applyDetails!,
      currentBodyBinding: {
        currentBodyId: base.currentBody.currentBodyId,
        bodyRevision: base.currentBody.bodyRevision,
        validationDecisionId: base.validationDecisionId,
        editedBodyText: base.currentBody.text,
        actionSubmittedAtMs: 2,
        realUserInitiated: true,
        sectionSpanEditEvents: [],
      },
      userPreferenceContext: {
        ...request().userPreferenceContext,
        additionalDetails: {
          text: longDetails,
          targetBodyId: base.currentBody.currentBodyId,
          targetBodyRevision: base.currentBody.bodyRevision,
        },
      },
    } as unknown as Parameters<typeof applyPromptEnhancementAction>[0];

    const result = await applyPromptEnhancementAction(actionRequest);
    expect(result.additionalDetailsTruncated).toBe(true);

    // A normal run (no over-cap details) leaves the flag unset — visibly distinct.
    const clean = await preparePromptEnhancement(request());
    expect(clean.additionalDetailsTruncated).toBeUndefined();
  });

  it('owner ruling 2026-08-20: the composer sees the UNPRUNED plan, and a factless section it wrote reaches the body', async () => {
    // 🔴 The end-to-end half of the I2 placement fix, and the half no unit test can reach: the
    // pruner's stage (a) is correct in isolation either way — what broke was WHEN it ran. Measured
    // on the sim, a six-section body lost Approach, Acceptance and Verification, all three written
    // from the developer's own prompt, because the pruner deleted them before the composer was
    // asked. Only a run through the facade can prove the two now happen in the right order.
    // 🔴 **The first version of this test was not discriminating, and a mutation probe proved it.**
    // It drafted the FIRST factless section, which on this fixture is `test_command_output` — the
    // first required guidance section, and therefore FLOOR. Floor is exempt from stage (a) either
    // way, so the test passed with the fix reverted. It now drafts EVERY factless section and counts
    // how many reach the body, which is a number the old rule cannot produce: at most ONE factless
    // section survived it (the floor's), and the fix lets the cap's worth through.
    process.env['OPENAI_API_KEY'] = `sk-${'x'.repeat(40)}`;
    const wordingFor = (kind: string): string => `Model wording for ${kind}, a section with no facts at all.`;
    let factlessKinds: readonly string[] = [];

    vi.mocked(composeStructuredComposerOutputV1).mockImplementationOnce(async (input: { planning: { sectionPlans: readonly { sectionId: string; sectionKind: string; structuredContentPartRefs: readonly string[] }[] } }) => {
      // A section with NO guidance-fact refs — the planner cites `section_kind:<kind>` when it has
      // none, which is the state nine of the eleven kinds are permanently in.
      const factless = input.planning.sectionPlans.filter(
        (plan) => plan.sectionKind !== 'original_request_or_goal'
          && plan.structuredContentPartRefs.every((ref) => ref.startsWith('section_kind:')),
      );
      if (factless.length === 0) return { ok: false, reason: 'no_eligible_sections' };
      factlessKinds = factless.map((plan) => plan.sectionKind);
      return { ok: true, output: {
        outputId: 'test-llm-factless-output',
        sectionDrafts: factless.map((plan) => ({
          sectionId: plan.sectionId,
          bodyText: wordingFor(plan.sectionKind),
          sourceFactIds: [plan.structuredContentPartRefs[0]!],
        })),
        composerClaims: factless.map((plan) => `claim:${plan.structuredContentPartRefs[0]!}`),
      } };
    });

    const result = await preparePromptEnhancement(request());

    // Premise guard, asserted rather than assumed: the plan handed to the composer really did carry
    // several factless sections. If planning ever stops producing them this fails loudly instead of
    // passing while testing nothing.
    expect(factlessKinds.length).toBeGreaterThan(1);
    expect(result.disposition).toBe('show_current_body');
    // 🔒 Prohibition 3, tied to the same run that proves the composer sees the UNPRUNED plan. The
    // `baseline_pe_composer` cost row records that I2's placement change grew what this ONE call is
    // sent without adding a second one; both halves of that claim are asserted here together, so a
    // change that split the work across two calls could not pass while looking like a size change.
    expect(composeStructuredComposerOutputV1).toHaveBeenCalledTimes(1);
    expect(result.callAndVisibilityMetadata.callVisibilityMode).toBe('llm_wording');

    // The point: sections with zero facts, kept because the model actually wrote them. More than
    // one is what makes this a real assertion — a single survivor is what the OLD rule produced.
    const survivingFactless = factlessKinds.filter((kind) => result.currentBody.text.includes(wordingFor(kind)));
    expect(survivingFactless.length).toBeGreaterThan(1);
  });

  it('L1875: a directional action never loses sections the composer had filled', async () => {
    // 🔒 §47.1 bound: *"`Shorter` obligations survive pruning — no unsafe truncation, no removal of
    // mandatory guidance/safety"*. Written as a REGRESSION guard for the I2 placement change: the
    // pruner now runs after the composer, and the composer does not run on the action path, so the
    // drafted-section set is empty there. Measured: the action body does not shrink (it gains the
    // mandatory section). Without this, a future change to stage (a) could silently strip an action
    // body back to its floor and no other test would notice.
    process.env['OPENAI_API_KEY'] = `sk-${'x'.repeat(40)}`;
    const base = await preparePromptEnhancement(request());
    const baseKinds = base.currentBody.sections.map((s) => s.sectionKind);
    const thorough = base.availableActions.find((entry) => entry.actionType === 'more_thorough');
    const actionRequest = {
      ...request(),
      action: thorough!,
      currentBodyBinding: {
        currentBodyId: base.currentBody.currentBodyId,
        bodyRevision: base.currentBody.bodyRevision,
        validationDecisionId: base.validationDecisionId,
        editedBodyText: base.currentBody.text,
        actionSubmittedAtMs: 2,
        realUserInitiated: true,
        sectionSpanEditEvents: [],
      },
    } as unknown as Parameters<typeof applyPromptEnhancementAction>[0];
    const after = await applyPromptEnhancementAction(actionRequest);
    const afterKinds = after.currentBody.sections.map((s) => s.sectionKind);
    expect(afterKinds.length).toBeGreaterThanOrEqual(baseKinds.length);
    // The mandatory section is present after the action, not merely a count that happened to hold.
    expect(afterKinds).toContain('source_signal_guidance');
  });

  it('safety still runs on the composed body regardless of the LLM path (validation summary present)', async () => {
    process.env['OPENAI_API_KEY'] = `sk-${'x'.repeat(40)}`;
    const result = await preparePromptEnhancement(request());
    expect(result.validationSummary).toBeDefined();
    expect(result.delivery.rawTransportIsSemanticAuthority).toBe(false);
  });
});
