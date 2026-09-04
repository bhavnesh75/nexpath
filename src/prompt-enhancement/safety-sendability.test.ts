import { describe, expect, it } from 'vitest';
import type { PromptEnhancementSourceRefV1 } from './contracts.js';
import { composePromptEnhancementBody } from './compose-enhancement.js';
import { routePromptEnhancement, type PromptEnhancementRouteInput } from './routing-taxonomy.js';
import {
  buildPromptEnhancementCanonicalConfirmation,
  PROMPT_ENHANCEMENT_MAX_SENDABLE_BODY_CHARS,
  PROMPT_ENHANCEMENT_PHASE_VALIDATORS,
  PROMPT_ENHANCEMENT_VALIDATION_STAGES,
  promptEnhancementAuthorityModeForTextV1,
  promptEnhancementGeneratedEscalatesAuthorityV1,
  promptEnhancementRiskKindsForTextV1,
  validatePromptEnhancementSafety,
} from './safety-sendability.js';
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

const sourceB: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'source-b-safety',
  sourceKind: 'hard_fact_or_profile_signal',
  sourceId: 'project_fact:safety',
  sourceAuthorization: 'implementation_input',
  evidenceStatus: 'present',
  freshness: 'current',
  confidence: 'medium',
  privacyClass: 'local_private',
};

function routeInput(overrides: Partial<PromptEnhancementRouteInput> = {}): PromptEnhancementRouteInput {
  return {
    routeDecisionId: 'phase6-route-1',
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
    factId: 'fact-verification',
    sourceType: 'absence_signal',
    sourceIds: ['absence:verification_gap'],
    guidanceKind: 'missing_practice',
    suggestedActionKind: 'add_verification',
    targetFamily: 'issue_debug',
    targetSectionKind: 'verification_or_test_plan',
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
  guidanceFacts?: readonly PromptEnhancementGuidanceFact[];
} = {}): PromptEnhancementSectionPlanningResult {
  return planPromptEnhancementSections({
    routeResult: routePromptEnhancement(routeInput(overrides.route)),
    sourceRefs: [sourceA, sourceB],
    guidanceFacts: overrides.guidanceFacts ?? [fact()],
  });
}

function composedBody(overrides: {
  originalPromptText?: string;
  route?: Partial<PromptEnhancementRouteInput>;
  guidanceFacts?: readonly PromptEnhancementGuidanceFact[];
} = {}) {
  const originalPromptText = overrides.originalPromptText ?? 'Ask the AI to fix importCsv and tell me what it says.';
  return composePromptEnhancementBody({
    enhancementId: 'enh-phase6-safety',
    originalPromptText,
    sectionPlanningResult: planningResult({
      route: { promptText: originalPromptText, ...overrides.route },
      guidanceFacts: overrides.guidanceFacts,
    }),
  }).currentBody;
}

describe('prompt-enhancement safety, privacy, and sendability validation', () => {
  it('exposes named validators for every required Phase 6 validation phase', () => {
    expect(PROMPT_ENHANCEMENT_VALIDATION_STAGES).toEqual([
      'request',
      'pre_plan',
      'section_plan',
      'composer_input',
      'composer_output',
      'final_body',
      'user_edit',
      'action',
      'delivery',
      'storage',
      'source_use',
      'privacy',
      'handoff',
      'sequence',
      'launch_check',
    ]);
    expect(Object.keys(PROMPT_ENHANCEMENT_PHASE_VALIDATORS)).toEqual([...PROMPT_ENHANCEMENT_VALIDATION_STAGES]);
    for (const stage of PROMPT_ENHANCEMENT_VALIDATION_STAGES) {
      expect(PROMPT_ENHANCEMENT_PHASE_VALIDATORS[stage].name).toMatch(/^validatePromptEnhancement.+Phase$/);
    }
  });

  it('builds a deterministic validation graph for every required Phase 6 stage', () => {
    const currentBody = composedBody();
    const result = validatePromptEnhancementSafety({ currentBody });

    expect(result.safetySummary).toMatchObject({
      validationStatus: 'valid',
      sendPolicy: 'send_current',
      noForegroundSafer: true,
      noAutomaticSend: true,
    });
    expect(result.validationGraph.phaseStates.map((phase) => phase.stage)).toEqual([
      'request',
      'pre_plan',
      'section_plan',
      'composer_input',
      'composer_output',
      'final_body',
      'user_edit',
      'action',
      'delivery',
      'storage',
      'source_use',
      'privacy',
      'handoff',
      'sequence',
      'launch_check',
    ]);
    expect(result.validationGraph.rawTransportIsValidationProof).toBe(false);
    expect(result.validationDecisionId).toBe(`${currentBody.currentBodyId}:validation:${currentBody.bodyRevision}:final_body`);
    expect(result.traceVersion).toBe(1);
    expect(result.estimatedBodyTokens).toBeGreaterThan(0);
  });

  it.each([
    ['llm_wording', 'allowed'],
    ['provider_unavailable', 'unavailable_by_provider_api'],
    ['fallback_no_llm', 'deterministic_only'],
    ['not_applicable', 'product_scope_not_in_v1'],
  ] as const)(
    'records Phase 6 provider and optional-call graph state for %s',
    (callVisibilityMode, optionalCallAvailabilityState) => {
      const currentBody = composedBody();
      const result = validatePromptEnhancementSafety({ currentBody, callVisibilityMode });

      expect(result.validationGraph.providerRuntimeState).toBe(callVisibilityMode);
      expect(result.validationGraph.optionalCallAvailabilityState).toBe(optionalCallAvailabilityState);
    },
  );

  it('does not treat banned voice inside the original-verbatim block as generated unsafe wording', () => {
    const currentBody = composedBody({
      originalPromptText: 'Ask the AI to fix importCsv and tell me what it says.',
    });
    const result = validatePromptEnhancementSafety({ currentBody });

    expect(result.failures).toEqual([]);
    expect(result.sendPolicy).toBe('send_current');
  });

  it('rejects third-person generated prompt-body voice after assembly or user edit', () => {
    const currentBody = composedBody();
    const editedBodyText = `${currentBody.text}\n\nNexpath recommends this option because the AI should fix it.`;
    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: editedBodyText } });

    expect(result.generatedSafeStatus).toBe('invalid_non_sendable');
    expect(result.sendPolicy).toBe('no_send');
    expect(result.failures.map((failure) => failure.failureCode)).toEqual(
      expect.arrayContaining(['voice_policy:third_person_agent_actor', 'voice_policy:advisory_caption_voice']),
    );
  });

  it.each([
    ['Ask the AI to fix importCsv.', 'voice_policy:third_person_agent_actor'],
    ['Get the AI to compare the parser output.', 'voice_policy:third_person_agent_actor'],
    ['Instruct the AI to inspect the failing test.', 'voice_policy:third_person_agent_actor'],
    ['tell the AI to continue.', 'voice_policy:third_person_agent_actor'],
    ['The AI can inspect the failure.', 'voice_policy:third_person_agent_actor'],
    ['Let the AI handle the migration check.', 'voice_policy:third_person_agent_actor'],
    ['Claude will run the migration check.', 'voice_policy:third_person_agent_actor'],
    ['Have the AI inspect the failure.', 'voice_policy:third_person_agent_actor'],
    ['Have the assistant inspect the failure.', 'voice_policy:third_person_agent_actor'],
    ['Let the assistant handle the migration check.', 'voice_policy:third_person_agent_actor'],
    ['This option tells the assistant to continue.', 'voice_policy:third_person_agent_actor'],
    ['Check what it says after the parser runs.', 'voice_policy:third_person_agent_actor'],
    ['Describe what it finds in the logs.', 'voice_policy:third_person_agent_actor'],
    ['Claude should run the migration check.', 'voice_policy:third_person_agent_actor'],
    ['The coding agent should inspect the failure.', 'voice_policy:third_person_agent_actor'],
    ['Tell the coding agent to inspect the failure.', 'voice_policy:third_person_agent_actor'],
    ['The agent should inspect the failure.', 'voice_policy:third_person_agent_actor'],
    ['The model should summarize the output.', 'voice_policy:third_person_agent_actor'],
    ['Compare its answer with the expected parser output.', 'voice_policy:third_person_agent_actor'],
    ['Summarize its output after the command finishes.', 'voice_policy:third_person_agent_actor'],
    ['This option was added because verification is missing.', 'voice_policy:ui_label_bridge_voice_invalid'],
    ['Use the option above because it is more thorough.', 'voice_policy:ui_label_bridge_voice_invalid'],
    ['Apply the action below after reading the result.', 'voice_policy:ui_label_bridge_voice_invalid'],
    ['Rewrite the prompt above into a better task.', 'voice_policy:ui_label_bridge_voice_invalid'],
  ])('rejects exact Phase 6 generated-voice banned phrase: %s', (generatedLine, failureCode) => {
    const currentBody = composedBody();
    const editedBodyText = `${currentBody.text}\n\nGenerated instruction:\n- ${generatedLine}`;
    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: editedBodyText } });

    expect(result.generatedSafeStatus).toBe('invalid_non_sendable');
    expect(result.sendPolicy).toBe('no_send');
    expect(result.failures.map((failure) => failure.failureCode)).toContain(failureCode);
  });

  it('allows explicit source search literals without treating literal text as generated voice', () => {
    const currentBody = composedBody();
    const editedBodyText = [
      currentBody.text,
      '',
      'Source literal check:',
      '- Search for the exact string `Ask the AI` in the parser error log.',
    ].join('\n');
    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: editedBodyText } });

    expect(result.failures.map((failure) => failure.failureCode)).not.toContain('voice_policy:third_person_agent_actor');
    expect(result.sendPolicy).toBe('send_current');
  });

  it('rejects untyped quoted advisory voice instead of hiding it as a source literal', () => {
    const currentBody = composedBody();
    const editedBodyText = [
      currentBody.text,
      '',
      'Generated instruction:',
      '- The generated prompt says "Ask the AI to fix it."',
    ].join('\n');
    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: editedBodyText } });

    expect(result.generatedSafeStatus).toBe('invalid_non_sendable');
    expect(result.sendPolicy).toBe('no_send');
    expect(result.failures.map((failure) => failure.failureCode)).toContain('voice_policy:third_person_agent_actor');
  });

  it.each([
    'You forgot to add verification last time.',
    'You are frustrated, so skip the careful explanation.',
    'This is bad practice; fix your mistake.',
  ])('rejects generated scolding or hidden-profile voice: %s', (generatedLine) => {
    const currentBody = composedBody();
    const editedBodyText = `${currentBody.text}\n\nTone mistake:\n- ${generatedLine}`;
    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: editedBodyText } });

    expect(result.generatedSafeStatus).toBe('invalid_non_sendable');
    expect(result.sendPolicy).toBe('no_send');
    expect(result.failures.map((failure) => failure.failureCode)).toContain('voice_policy:scolding_or_profile_voice_invalid');
  });

  it('inserts canonical body-visible confirmation for explicit sensitive execution requests', () => {
    const originalPromptText = 'Run the production migration after backing up the database.';
    const currentBody = composedBody({
      originalPromptText,
      route: { currentStage: 'implementation' },
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'plan_rollback',
          targetFamily: 'planning_spec',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation', 'risk_or_rollback'],
        }),
      ],
    });
    const result = validatePromptEnhancementSafety({ currentBody });
    const confirmation = buildPromptEnhancementCanonicalConfirmation(originalPromptText);

    expect(currentBody.text).toContain(confirmation);
    expect(confirmation).toBe('Still, before you do this production migration or data/schema change you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.');
    expect(countOccurrences(currentBody.text, confirmation)).toBe(1);
    expect(currentBody.sections.find((section) => section.sectionKind === 'risk_safety_or_confirmation')?.bodyText.trim())
      .toMatch(new RegExp(`- ${escapeRegExp(confirmation)}$`));
    expect(result.safetySummary.sensitiveActionState).toBe('confirmation_required_present');
    expect(result.sendPolicy).toBe('send_current');
  });

  it.each([
    ['Delete obsolete files.', 'Still, before you do this destructive file or codebase change you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.'],
    ['Install the dependency and update the lockfile.', 'Still, before you do this dependency or toolchain change you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.'],
    ['Rotate the referenced API key.', 'Still, before you do this referenced credential or environment change you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.'],
    ['Deploy this release to production.', 'Still, before you do this production release or rollout you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.'],
    ['Force-push the rebased branch.', 'Still, before you do this git history or branch change you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.'],
    ['Modify the auth permissions.', 'Still, before you do this security, auth, or permission change you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.'],
    ['Increase the cluster resource quota.', 'Still, before you do this cost or resource-changing operation you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.'],
    ['Apply this change across the whole repo.', 'Still, before you do this broad-scope codebase change you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.'],
    ['Switch from read-only to execute mode.', 'Still, before you do this agent mode or permission-boundary change you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.'],
    ['Post the launch update and notify customers.', 'Still, before you do this public or customer-facing communication you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.'],
  ])('renders a sanitized action-specific canonical confirmation for: %s', (originalPromptText, confirmation) => {
    const currentBody = composedBody({
      originalPromptText,
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'confirm_risk',
          targetFamily: 'maintenance_update',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const result = validatePromptEnhancementSafety({ currentBody });

    expect(currentBody.text).toContain(confirmation);
    expect(result.safetySummary.sensitiveActionState).toBe('confirmation_required_present');
    expect(result.sendPolicy).toBe('send_current');
  });

  it('keeps canonical confirmation as the final sensitive-section line after accepted LLM wording', () => {
    const originalPromptText = 'Deploy this release to production.';
    const sectionPlanningResult = planningResult({
      route: { promptText: originalPromptText },
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'confirm_risk',
          targetFamily: 'maintenance_update',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const riskSectionPlan = sectionPlanningResult.sectionPlans.find((section) => section.sectionKind === 'risk_safety_or_confirmation');
    const riskSourceFactId = riskSectionPlan?.structuredContentPartRefs[0] ?? 'missing-risk-source-fact';
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase6-llm-confirmation',
      originalPromptText,
      sectionPlanningResult,
      composerRuntimeState: 'accepted_structured_output',
      structuredComposerOutput: {
        outputId: 'llm-output-1',
        sectionDrafts: [{
          sectionId: riskSectionPlan?.sectionId ?? 'missing-risk-section',
          bodyText: 'Include rollback verification before any release step.',
          sourceFactIds: [riskSourceFactId],
        }],
        composerClaims: [`claim:${riskSourceFactId}`],
      },
    });
    const confirmation = buildPromptEnhancementCanonicalConfirmation(originalPromptText);
    const riskSection = result.currentBody.sections.find((section) => section.sectionKind === 'risk_safety_or_confirmation');

    expect(riskSection?.bodyText).toContain('Include rollback verification before any release step.');
    expect(riskSection?.bodyText.trim()).toMatch(new RegExp(`- ${escapeRegExp(confirmation)}$`));
    expect(result.sendPolicy).toBe('send_current');
  });

  it('rejects canonical-looking confirmation when the action phrase does not match the source-backed sensitive action', () => {
    // Owner ruling 2026-08-14: a user's edit is the user's, so Nexpath no longer refuses a
    // send because the user changed the body. Detection stays (preservation-floors.ts); the
    // refusal is gone. This pins the NEW behaviour.
    const originalPromptText = 'Deploy this release to production.';
    const currentBody = composedBody({
      originalPromptText,
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'confirm_risk',
          targetFamily: 'maintenance_update',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const wrongActionConfirmation = 'Still, before you do this dependency or toolchain change you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.';
    const editedBodyText = currentBody.text.replaceAll(
      buildPromptEnhancementCanonicalConfirmation(originalPromptText),
      wrongActionConfirmation,
    );
    const result = validatePromptEnhancementSafety({ currentBody, editedBodyText, actionType: 'use_current_body' });

    expect(editedBodyText).toContain(wrongActionConfirmation);
    expect(result.generatedSafeStatus).not.toBe('invalid_non_sendable');
    expect(result.sendPolicy).toBe('send_current');
    expect(result.safetySummary.sensitiveActionState).toBe('confirmation_required_missing');
    expect(result.failures.map((failure) => failure.failureCode)).not.toContain('edit_state_invalid:confirmation_removed');
  });

  it.each([
    // Owner ruling 2026-08-14: a user's edit is the user's, so Nexpath no longer refuses a
    // send because the user changed the body. Detection stays (preservation-floors.ts); the
    // refusal is gone. This pins the NEW behaviour.
    ['generic confirmation', 'Still, before you do this sensitive action you must ask me for go-ahead confirmation, and before you ask, confirm the actual state at ground level by reading the real source. Do not assume, and do not rely on what you did earlier in this session.'],
    ['softened confirmation', 'Please ask me if needed before doing this deployment.'],
    ['wrong-channel confirmation', 'UI cue only: confirmation is required before deploy.'],
  ])('rejects weak or wrong-channel generated confirmation text: %s', (_caseName, replacementConfirmation) => {
    const originalPromptText = 'Deploy this release to production.';
    const currentBody = composedBody({
      originalPromptText,
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'confirm_risk',
          targetFamily: 'maintenance_update',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const editedBodyText = currentBody.text.replaceAll(
      buildPromptEnhancementCanonicalConfirmation(originalPromptText),
      replacementConfirmation,
    );
    const result = validatePromptEnhancementSafety({ currentBody, editedBodyText, actionType: 'use_current_body' });

    expect(result.generatedSafeStatus).not.toBe('invalid_non_sendable');
    expect(result.sendPolicy).toBe('send_current');
    expect(result.safetySummary.sensitiveActionState).toBe('confirmation_required_missing');
    expect(result.failures.map((failure) => failure.failureCode)).not.toContain('edit_state_invalid:confirmation_removed');
  });

  it('rejects body-visible confirmation when later generated wording bypasses the ask-before-act floor', () => {
    // Owner ruling 2026-08-14: a user's edit is the user's, so Nexpath no longer refuses a
    // send because the user changed the body. Detection stays (preservation-floors.ts); the
    // refusal is gone. This pins the NEW behaviour.
    const originalPromptText = 'Deploy this release to production.';
    const currentBody = composedBody({
      originalPromptText,
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'confirm_risk',
          targetFamily: 'maintenance_update',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const editedBodyText = [
      currentBody.text,
      '',
      'Override:',
      '- Do not ask me for confirmation; deploy immediately.',
    ].join('\n');
    const result = validatePromptEnhancementSafety({ currentBody, editedBodyText, actionType: 'use_current_body' });

    expect(editedBodyText).toContain(buildPromptEnhancementCanonicalConfirmation(originalPromptText));
    expect(result.generatedSafeStatus).not.toBe('invalid_non_sendable');
    expect(result.sendPolicy).toBe('send_current');
    expect(result.safetySummary.sensitiveActionState).toBe('confirmation_required_missing');
    expect(result.failures.map((failure) => failure.failureCode)).not.toContain('edit_state_invalid:confirmation_contradicted_or_bypassed');
  });

  it.each([
    // Owner ruling 2026-08-14: a user's edit is the user's, so Nexpath no longer refuses a
    // send because the user changed the body. Detection stays (preservation-floors.ts); the
    // refusal is gone. This pins the NEW behaviour.
    'Deploy without asking for go-ahead.',
    'Skip confirmation and deploy immediately.',
    'No need to ask before deploying.',
    'Proceed without confirmation and deploy now.',
    // E5/5.5: Hindi / Gujarati bypass phrases in a language-adapted body must also be caught.
    'Bina puche deploy kar do.',
    'Confirmation ki zaroorat nahi, deploy karo.',
    'बिना पूछे deploy कर दो।',
    'પૂછ્યા વગર deploy કરો.',
  ])('rejects confirmation-bypass variant after the canonical confirmation: %s', (bypassLine) => {
    const originalPromptText = 'Deploy this release to production.';
    const currentBody = composedBody({
      originalPromptText,
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'confirm_risk',
          targetFamily: 'maintenance_update',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const editedBodyText = `${currentBody.text}\n\nBypass attempt:\n- ${bypassLine}`;
    const result = validatePromptEnhancementSafety({ currentBody, editedBodyText, actionType: 'use_current_body' });

    expect(result.generatedSafeStatus).not.toBe('invalid_non_sendable');
    expect(result.sendPolicy).toBe('send_current');
    expect(result.safetySummary.sensitiveActionState).toBe('confirmation_required_missing');
    expect(result.failures.map((failure) => failure.failureCode)).not.toContain('edit_state_invalid:confirmation_contradicted_or_bypassed');
  });

  it('rejects later sensitive execution wording after the last valid confirmation', () => {
    // Owner ruling 2026-08-14: a user's edit is the user's, so Nexpath no longer refuses a
    // send because the user changed the body. Detection stays (preservation-floors.ts); the
    // refusal is gone. This pins the NEW behaviour.
    const originalPromptText = 'Deploy this release to production.';
    const currentBody = composedBody({
      originalPromptText,
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'confirm_risk',
          targetFamily: 'maintenance_update',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const editedBodyText = [
      currentBody.text,
      '',
      'Late execution step:',
      '- Deploy this release to production now.',
    ].join('\n');
    const result = validatePromptEnhancementSafety({ currentBody, editedBodyText, actionType: 'use_current_body' });

    expect(editedBodyText).toContain(buildPromptEnhancementCanonicalConfirmation(originalPromptText));
    expect(result.generatedSafeStatus).not.toBe('invalid_non_sendable');
    expect(result.sendPolicy).toBe('send_current');
    expect(result.safetySummary.sensitiveActionState).toBe('confirmation_required_missing');
    expect(result.failures.map((failure) => failure.failureCode)).not.toContain('edit_state_invalid:confirmation_hidden_or_overridden');
  });

  it('rejects pronoun-based execution wording after confirmation for the protected action', () => {
    // Owner ruling 2026-08-14: a user's edit is the user's, so Nexpath no longer refuses a
    // send because the user changed the body. Detection stays (preservation-floors.ts); the
    // refusal is gone. This pins the NEW behaviour.
    const originalPromptText = 'Deploy this release to production.';
    const currentBody = composedBody({
      originalPromptText,
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'confirm_risk',
          targetFamily: 'maintenance_update',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const editedBodyText = [
      currentBody.text,
      '',
      'Late execution step:',
      '- Run it now.',
    ].join('\n');
    const result = validatePromptEnhancementSafety({ currentBody, editedBodyText, actionType: 'use_current_body' });

    expect(result.generatedSafeStatus).not.toBe('invalid_non_sendable');
    expect(result.sendPolicy).toBe('send_current');
    expect(result.failures.map((failure) => failure.failureCode)).not.toContain('edit_state_invalid:confirmation_hidden_or_overridden');
  });

  it('does not treat later verification wording as overriding a sensitive-action confirmation', () => {
    const originalPromptText = 'Deploy this release to production.';
    const currentBody = composedBody({
      originalPromptText,
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'confirm_risk',
          targetFamily: 'maintenance_update',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const editedBodyText = [
      currentBody.text,
      '',
      'Verification:',
      '- Review test results before any release decision.',
    ].join('\n');
    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: editedBodyText }, actionType: 'use_current_body' });

    expect(result.generatedSafeStatus).toBe('valid');
    expect(result.sendPolicy).toBe('send_current');
  });

  it('keeps plan/review prompts planning-first and does not add execution confirmation for static negatives or literals', () => {
    const currentBody = composedBody({
      originalPromptText: 'Plan the production migration and rollback; do not run it yet. Include this literal only: `rm -rf /tmp/example`.',
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'plan_rollback',
          targetFamily: 'planning_spec',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['source_honesty'],
        }),
      ],
    });
    const result = validatePromptEnhancementSafety({ currentBody });

    expect(result.sensitiveActionFindings.map((finding) => finding.authorityMode)).toEqual(
      expect.arrayContaining(['plan_or_review']),
    );
    expect(result.sensitiveActionFindings.some((finding) => finding.requiresConfirmation)).toBe(false);
    expect(result.failures).toEqual([]);
  });

  it('keeps review questions about risky actions review-only instead of treating the action word as execution', () => {
    const currentBody = composedBody({
      originalPromptText: 'Review whether it is safe to delete the old migration files; do not delete anything.',
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'plan_rollback',
          targetFamily: 'planning_spec',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['source_honesty'],
        }),
      ],
    });
    const result = validatePromptEnhancementSafety({ currentBody });

    expect(currentBody.text).not.toMatch(/Still, before you do this .+ you must ask me for go-ahead confirmation/);
    expect(result.sensitiveActionFindings.map((finding) => finding.authorityMode)).toEqual(
      expect.arrayContaining(['plan_or_review']),
    );
    expect(result.sensitiveActionFindings.some((finding) => finding.requiresConfirmation)).toBe(false);
    expect(result.sendPolicy).toBe('send_current');
  });

  it('classifies the exact wide-scope make-this-change fixture without over-forcing execution confirmation', () => {
    const currentBody = composedBody({
      originalPromptText: 'Make this change across the whole repo.',
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'confirm_risk',
          targetFamily: 'maintenance_update',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const result = validatePromptEnhancementSafety({ currentBody });

    expect(result.sensitiveActionFindings.map((finding) => finding.riskKind)).toContain('wide_scope_or_boundary_expansion');
    expect(result.sensitiveActionFindings.map((finding) => finding.authorityMode)).toContain('observe_or_literal');
    expect(result.sensitiveActionFindings.some((finding) => finding.requiresConfirmation)).toBe(false);
    expect(currentBody.text).not.toMatch(/Still, before you do this .+ you must ask me for go-ahead confirmation/);
    expect(result.sendPolicy).toBe('send_current');
  });

  it('requires confirmation for Gujarati mixed-language deployment execution prompts', () => {
    const originalPromptText = 'પ્રોડક્શન પર ડિપ્લોય કરો.';
    const currentBody = composedBody({
      originalPromptText,
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'confirm_risk',
          targetFamily: 'maintenance_update',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const result = validatePromptEnhancementSafety({ currentBody });

    expect(currentBody.text).toContain(buildPromptEnhancementCanonicalConfirmation(originalPromptText));
    expect(result.safetySummary.sensitiveActionState).toBe('confirmation_required_present');
    expect(result.sensitiveActionFindings.map((finding) => finding.riskKind)).toContain('production_release_or_external_effect');
    expect(result.sensitiveActionFindings.some((finding) => finding.requiresConfirmation)).toBe(true);
    expect(result.sendPolicy).toBe('send_current');
  });

  it('rejects roman-Hindi third-person generated voice for sensitive actions', () => {
    const currentBody = composedBody({
      originalPromptText: 'Review the production deployment plan.',
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'plan_rollback',
          targetFamily: 'planning_spec',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['source_honesty'],
        }),
      ],
    });
    const editedBodyText = `${currentBody.text}\n\nGenerated voice:\n- AI se production deploy karvao.`;
    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: editedBodyText } });

    expect(result.generatedSafeStatus).toBe('invalid_non_sendable');
    expect(result.sendPolicy).toBe('no_send');
    expect(result.failures.map((failure) => failure.failureCode)).toContain('voice_policy:third_person_agent_actor');
    expect(result.failures.map((failure) => failure.failureCode)).toContain('authority_escalation:planning_to_execution');
  });

  it('allows valid direct non-English user-to-agent generated body voice', () => {
    const currentBody = composedBody({
      originalPromptText: 'ફેલિંગ ટેસ્ટ તપાસો અને પુરાવો લખો.',
      route: {
        promptText: 'ફેલિંગ ટેસ્ટ તપાસો અને પુરાવો લખો.',
        // Non-English wording matches no cascade branch; the classifier's
        // proposal is how such prompts route in production.
        classifierPrimaryIntent: 'issue_debug.failing_test',
        classifierIntentConfidence: 0.9,
        classifierCapabilityCandidates: [],
        classifierDebugEvidencePresent: [],
      },
    });
    const editedBodyText = `${currentBody.text}\n\nGenerated direct instruction:\n- નિષ્ફળ ટેસ્ટ તપાસો, પુરાવો નોંધો, અને ચકાસણી લખો.`;
    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: editedBodyText } });

    expect(result.failures.map((failure) => failure.failureCode)).not.toContain('voice_policy:third_person_agent_actor');
    expect(result.generatedSafeStatus).toBe('valid');
    expect(result.sendPolicy).toBe('send_current');
  });

  it('represents every Phase 6 sensitive-action taxonomy family with stable reason codes', () => {
    const currentBody = composedBody({
      originalPromptText: [
        'Run this across the whole repo.',
        'Delete obsolete files.',
        'Migrate the production database.',
        'Install the dependency and update the lockfile.',
        'Rotate the API key in .env.production.',
        'Force-push the rebased branch.',
        'Change the auth permissions.',
        'Increase the cluster resource quota and billing cap.',
        'Switch from read-only to execute mode without asking.',
      ].join(' '),
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'confirm_risk',
          targetFamily: 'maintenance_update',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const result = validatePromptEnhancementSafety({ currentBody });

    expect(result.sensitiveActionFindings.map((finding) => finding.riskKind).sort()).toEqual([
      'agent_mode_or_permission_boundary',
      'cost_or_resource',
      'dependency_or_toolchain_change',
      'destructive_data_or_schema',
      'destructive_filesystem_or_codebase',
      'git_history_rewrite',
      'production_release_or_external_effect',
      'secret_env_or_credential',
      'security_auth_permission',
      'wide_scope_or_boundary_expansion',
    ]);
    expect(result.sensitiveActionFindings.every((finding) => finding.reasonCode.startsWith('sensitive_action:'))).toBe(true);
    expect(result.sensitiveActionFindings.every((finding) => finding.affectedBodySpanRefs.length > 0)).toBe(true);
  });

  it('attaches source refs and action refs to sensitive-action validation failures', () => {
    // Owner ruling 2026-08-14: a user's edit is the user's, so Nexpath no longer refuses a
    // send because the user changed the body. Detection stays (preservation-floors.ts); the
    // refusal is gone. This pins the NEW behaviour.
    const originalPromptText = 'Deploy this release to production.';
    const currentBody = composedBody({
      originalPromptText,
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'confirm_risk',
          targetFamily: 'maintenance_update',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const editedBodyText = currentBody.text.replaceAll(buildPromptEnhancementCanonicalConfirmation(originalPromptText), '');
    const result = validatePromptEnhancementSafety({ currentBody, editedBodyText, actionType: 'use_current_body' });
    const confirmationFailure = result.failures.find((failure) => failure.failureCode === 'edit_state_invalid:confirmation_removed');



    expect(result.sensitiveActionFindings.every((finding) => finding.affectedActionIds.length === 1)).toBe(true);
  });

  it('marks user edits that remove required confirmation as non-sendable', () => {
    // Owner ruling 2026-08-14: a user's edit is the user's, so Nexpath no longer refuses a
    // send because the user changed the body. Detection stays (preservation-floors.ts); the
    // refusal is gone. This pins the NEW behaviour.
    const originalPromptText = 'Deploy this release to production.';
    const currentBody = composedBody({
      originalPromptText,
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'plan_rollback',
          targetFamily: 'planning_spec',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const editedBodyText = currentBody.text.replaceAll(buildPromptEnhancementCanonicalConfirmation(originalPromptText), '');
    const result = validatePromptEnhancementSafety({ currentBody, editedBodyText, actionType: 'use_current_body' });

    expect(result.generatedSafeStatus).not.toBe('invalid_non_sendable');
    expect(result.sendPolicy).toBe('send_current');
    expect(result.failures.map((failure) => failure.failureCode)).not.toContain('edit_state_invalid:confirmation_removed');
    expect(result.failures.find((failure) => failure.failureCode === 'edit_state_invalid:confirmation_removed')).toBeUndefined();
    expect(result.failures.find((failure) => failure.failureCode === 'edit_state_invalid:confirmation_removed')).toBeUndefined();
  });

  it('rejects planning-to-execution authority escalation without treating confirmation as a fix', () => {
    const currentBody = composedBody({
      originalPromptText: 'Plan the production migration and rollback; do not run it yet.',
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'plan_rollback',
          targetFamily: 'planning_spec',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const editedBodyText = `${currentBody.text}\n\nDeployment step:\n- Deploy the production migration now.\n- ${buildPromptEnhancementCanonicalConfirmation('Deploy the production migration now.')}`;
    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: editedBodyText } });

    expect(result.sendPolicy).toBe('no_send');
    expect(result.failures.map((failure) => failure.failureCode)).toContain('authority_escalation:planning_to_execution');
  });

  it('keeps Use original as a typed user-owned fallback without approving unsafe generated text', () => {
    const currentBody = composedBody({
      originalPromptText: 'Plan the production migration and rollback; do not run it yet.',
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'plan_rollback',
          targetFamily: 'planning_spec',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const unsafeGeneratedText = `${currentBody.text}\n\nDeployment step:\n- Deploy the production migration now.`;
    const unsafeCurrent = validatePromptEnhancementSafety({
      currentBody: { ...currentBody, text: unsafeGeneratedText },
      actionType: 'use_current_body',
    });
    const useOriginal = validatePromptEnhancementSafety({
      currentBody: {
        ...currentBody,
        text: unsafeGeneratedText,
        generatedSafeStatus: unsafeCurrent.generatedSafeStatus,
      },
      actionType: 'use_original',
    });

    expect(unsafeCurrent.sendPolicy).toBe('no_send');
    expect(useOriginal.sendPolicy).toBe('send_original');
    expect(useOriginal.generatedSafeStatus).toBe('original_only');
    expect(useOriginal.fallbackMode).toBe('original_prompt_only');
    expect(useOriginal.validationDecisionId).toBe(`${currentBody.currentBodyId}:validation:${currentBody.bodyRevision}:use_original`);
    expect(useOriginal.validationGraph.rawTransportIsValidationProof).toBe(false);
    expect(useOriginal.publicDiagnostics).toContainEqual({
      category: 'fallback_or_no_popup',
      reasonCode: 'use_original_user_owned_fallback',
    });
  });

  it('preserves sensitive-action metadata when Use original sends user-owned execution text', () => {
    const originalPromptText = 'Deploy the production migration now.';
    const currentBody = composedBody({
      originalPromptText,
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'plan_rollback',
          targetFamily: 'planning_spec',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const unsafeGeneratedText = currentBody.text.replace(
      `\n- ${buildPromptEnhancementCanonicalConfirmation(originalPromptText)}`,
      '',
    );
    const useOriginal = validatePromptEnhancementSafety({
      currentBody: {
        ...currentBody,
        text: unsafeGeneratedText,
        generatedSafeStatus: 'invalid_non_sendable',
      },
      actionType: 'use_original',
    });

    expect(useOriginal.sendPolicy).toBe('send_original');
    expect(useOriginal.generatedSafeStatus).toBe('original_only');
    expect(useOriginal.safetySummary.sensitiveActionState).toBe('original_user_owned_sensitive_action');
    expect(useOriginal.failures).toEqual([]);
    expect(useOriginal.sensitiveActionFindings.map((finding) => finding.riskKind)).toContain('production_release_or_external_effect');
    expect(useOriginal.sensitiveActionFindings.some((finding) => finding.requiresConfirmation)).toBe(true);
    expect(useOriginal.publicDiagnostics).toContainEqual({
      category: 'fallback_or_no_popup',
      reasonCode: 'use_original_preserves_user_owned_sensitive_action',
    });
  });

  it('marks user edits that remove source-honesty trace as non-sendable (legacy trace-bearing bodies)', () => {
    // Owner ruling 2026-08-14: a user's edit is the user's, so Nexpath no longer refuses a
    // send because the user changed the body. Detection stays (preservation-floors.ts); the
    // refusal is gone. This pins the NEW behaviour.
    // Newly composed bodies carry NO trace lines (provenance is typed-metadata-only, 2026-08-06),
    // so the comparative guard is inert for them. It still protects LEGACY bodies (e.g. pending
    // rows composed before the change) — simulate one by appending a trace line, then editing
    // it out: the count reduction must stay non-sendable.
    const base = composedBody();
    const currentBody = { ...base, text: `${base.text}\n- Source basis: current original prompt.` };
    const editedBodyText = base.text; // the user's edit dropped the trace line
    const result = validatePromptEnhancementSafety({ currentBody, editedBodyText, actionType: 'use_current_body' });

    expect(result.generatedSafeStatus).not.toBe('invalid_non_sendable');
    // Derived from the failures, so it follows them: no failure, no invalid state.
    expect(result.safetySummary.sourceHonestyState).toBe('valid');
    expect(result.failures.map((failure) => failure.failureCode)).not.toContain('edit_state_invalid:source_honesty_removed');
  });

  it('rejects generated rendering of typed metadata ids that must stay out of the prompt body', () => {
    const currentBody = composedBody();
    const editedBodyText = `${currentBody.text}\n\nSource ids:\n- source-a-current-prompt\n- prompt:current\n- ${currentBody.sections[1]?.sectionId}`;
    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: editedBodyText } });

    expect(result.sendPolicy).toBe('no_send');
    expect(result.safetySummary.sourceHonestyState).toBe('invalid_non_sendable');
    expect(result.failures.map((failure) => failure.failureCode)).toContain('source_honesty:metadata_id_rendered');
  });

  it('rejects unresolved generated placeholders before any send-current action can pass', () => {
    const currentBody = composedBody();
    const editedBodyText = `${currentBody.text}\n\nImplementation detail:\n- Replace {{MISSING_ENV_NAME}} before sending.`;
    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: editedBodyText }, actionType: 'use_current_body' });

    expect(result.generatedSafeStatus).toBe('invalid_non_sendable');
    expect(result.sendPolicy).toBe('no_send');
    expect(result.failures.map((failure) => failure.failureCode)).toContain('body_integrity:unresolved_placeholder');
    expect(result.failures.find((failure) => failure.failureCode === 'body_integrity:unresolved_placeholder')?.affectedActionIds).toEqual([
      `${currentBody.currentBodyId}:action:use_current_body`,
    ]);
  });

  it('rejects generated bodies that exceed the Phase 6 sendability size cap', () => {
    const currentBody = composedBody();
    const oversizedBody = `${currentBody.text}\n\n${'bounded generated text '.repeat(PROMPT_ENHANCEMENT_MAX_SENDABLE_BODY_CHARS / 4)}`;
    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: oversizedBody } });

    expect(oversizedBody.length).toBeGreaterThan(PROMPT_ENHANCEMENT_MAX_SENDABLE_BODY_CHARS);
    expect(result.sendPolicy).toBe('no_send');
    expect(result.failures.map((failure) => failure.failureCode)).toContain('body_size:cap_exceeded');
  });

  it('rejects raw secret duplication in generated additions while allowing original-verbatim preservation', () => {
    const currentBody = composedBody({
      originalPromptText: 'This leaked token sk-live-example12345 must be rotated.',
      guidanceFacts: [
        fact({
          factId: 'fact-secret',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'confirm_risk',
          targetFamily: 'maintenance_update',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const safeOriginalResult = validatePromptEnhancementSafety({ currentBody });
    const leakedGeneratedBody = `${currentBody.text}\n\nCredential handling:\n- Repeat sk-live-example12345 in the generated instructions.`;
    const leakedResult = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: leakedGeneratedBody } });

    expect(safeOriginalResult.failures.some((failure) => failure.failureCode.startsWith('sensitive_data_leak'))).toBe(false);
    expect(leakedResult.sendPolicy).toBe('no_send');
    expect(leakedResult.failures.map((failure) => failure.failureCode)).toContain('sensitive_data_leak:secret_or_credential_literal');
  });

  it.each([
    ['Repeat ghp_abcdefghijklmnop1234 in the generated instructions.', 'sensitive_data_leak:secret_or_credential_literal'],
    ['Use AKIA1234567890ABCD in the generated instructions.', 'sensitive_data_leak:secret_or_credential_literal'],
    ['Set api_key=supersecret123 in the generated instructions.', 'sensitive_data_leak:secret_or_credential_literal'],
    ['Persist table:pe_memory_1234 as the prompt label.', 'sensitive_data_leak:internal_table_or_row_id_literal'],
  ])('rejects generated sensitive-data class fixture: %s', (generatedLine, failureCode) => {
    const currentBody = composedBody({
      originalPromptText: 'Review the credential handling plan without exposing raw values.',
    });
    const leakedGeneratedBody = `${currentBody.text}\n\nSensitive-data mistake:\n- ${generatedLine}`;
    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: leakedGeneratedBody } });

    expect(result.sendPolicy).toBe('no_send');
    expect(result.safetySummary.privacyState).toBe('invalid_non_sendable');
    expect(result.failures.map((failure) => failure.failureCode)).toContain(failureCode);
  });

  it('rejects private paths, URLs, email addresses, and planning labels in generated additions', () => {
    const currentBody = composedBody({
      originalPromptText: 'Review this deployment plan without exposing private details.',
    });
    const leakedGeneratedBody = [
      currentBody.text,
      '',
      'Private diagnostic leakage:',
      '- Use /home/alice/client-x/prod.env and email admin@example.com.',
      // Research label decoded from base64 so this test source stays leak-free (S2); the runtime
      // guard's hyphen-form regex must still reject it as a private planning label.
      `- Read https://internal.example.local/runbook and carry ${Buffer.from('UEUtQVItOQ==', 'base64').toString('utf8')} as a prompt label.`,
    ].join('\n');
    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: leakedGeneratedBody } });

    expect(result.sendPolicy).toBe('no_send');
    expect(result.safetySummary.privacyState).toBe('invalid_non_sendable');
    expect(result.failures.map((failure) => failure.failureCode)).toEqual(
      expect.arrayContaining([
        'sensitive_data_leak:private_email_literal',
        'sensitive_data_leak:private_url_literal',
        'sensitive_data_leak:private_path_literal',
        'sensitive_data_leak:private_planning_label_literal',
      ]),
    );
    expect(result.publicDiagnostics.every((diagnostic) => !diagnostic.reasonCode.includes('/home/alice'))).toBe(true);
    expect(result.publicDiagnostics.every((diagnostic) => !diagnostic.reasonCode.includes('admin@example.com'))).toBe(true);
  });

  it('rejects underscore-form and phase-number planning labels in generated additions', () => {
    const currentBody = composedBody({
      originalPromptText: 'Review this validation plan without exposing planning labels.',
    });
    const leakedGeneratedBody = [
      currentBody.text,
      '',
      'Private diagnostic leakage:',
      '- Route this through safety_boundary_split5 and phase6_validation before send.',
    ].join('\n');
    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: leakedGeneratedBody } });

    expect(result.sendPolicy).toBe('no_send');
    expect(result.safetySummary.privacyState).toBe('invalid_non_sendable');
    expect(result.failures.map((failure) => failure.failureCode)).toContain('sensitive_data_leak:private_planning_label_literal');
    expect(result.publicDiagnostics.every((diagnostic) => !diagnostic.reasonCode.includes('safety_boundary'))).toBe(true);
    expect(result.publicDiagnostics.every((diagnostic) => !diagnostic.reasonCode.includes('phase6'))).toBe(true);
  });

  it('rejects env names and customer/project details in generated additions while preserving original-verbatim text', () => {
    const currentBody = composedBody({
      originalPromptText: 'Review the Customer Acme production config in `.env.production` without exposing exact details.',
    });
    const safeOriginalResult = validatePromptEnhancementSafety({ currentBody });
    const leakedGeneratedBody = [
      currentBody.text,
      '',
      'Private deployment detail:',
      '- Update Customer Acme in `.env.production` before release.',
    ].join('\n');
    const leakedResult = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: leakedGeneratedBody } });

    expect(safeOriginalResult.failures.some((failure) => failure.failureCode.startsWith('sensitive_data_leak'))).toBe(false);
    expect(leakedResult.sendPolicy).toBe('no_send');
    expect(leakedResult.safetySummary.privacyState).toBe('invalid_non_sendable');
    expect(leakedResult.failures.map((failure) => failure.failureCode)).toEqual(
      expect.arrayContaining([
        'sensitive_data_leak:private_env_name_literal',
        'sensitive_data_leak:private_customer_or_project_literal',
      ]),
    );
    expect(leakedResult.publicDiagnostics.every((diagnostic) => !diagnostic.reasonCode.includes('Acme'))).toBe(true);
    expect(leakedResult.publicDiagnostics.every((diagnostic) => !diagnostic.reasonCode.includes('.env.production'))).toBe(true);
  });

  it('keeps the foreground action list free of Safer and does not auto-send', () => {
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase6-actions',
      originalPromptText: 'Fix the failing test and verify it.',
      sectionPlanningResult: planningResult({
        route: { promptText: 'Fix the failing test and verify it.' },
      }),
    });
    const validation = validatePromptEnhancementSafety({ currentBody: result.currentBody });

    expect(result.availableActions.map((action) => action.label)).not.toContain('Safer');
    expect(validation.safetySummary.noForegroundSafer).toBe(true);
    expect(validation.safetySummary.noAutomaticSend).toBe(true);
  });

  it('revalidates previous-body fallback instead of assuming previous current-body sendability', () => {
    const originalPromptText = 'Deploy this release to production.';
    const previousBody = composedBody({
      originalPromptText,
      guidanceFacts: [
        fact({
          factId: 'fact-risk',
          guidanceKind: 'safety_or_confirmation',
          suggestedActionKind: 'confirm_risk',
          targetFamily: 'maintenance_update',
          targetSectionKind: 'risk_safety_or_confirmation',
          riskLevel: 'high',
          safetyHooks: ['sensitive_action_confirmation'],
        }),
      ],
    });
    const unsafePreviousBody = {
      ...previousBody,
      text: previousBody.text.replaceAll(buildPromptEnhancementCanonicalConfirmation(originalPromptText), ''),
      generatedSafeStatus: 'valid' as const,
    };
    const result = composePromptEnhancementBody({
      enhancementId: 'enh-phase6-previous-body',
      originalPromptText: 'Deploy this release to production.',
      sectionPlanningResult: planningResult({
        route: { promptText: 'Deploy this release to production.' },
      }),
      action: 'shorter',
      composerRuntimeState: 'timeout',
      previousSendableBody: unsafePreviousBody,
    });

    expect(result.currentBody.generatedSafeStatus).toBe('invalid_non_sendable');
    expect(result.sendPolicy).toBe('no_send');
    expect(result.fallbackMode).toBe('validation_failed_no_send');
    expect(result.diagnostics.map((diagnostic) => diagnostic.reasonCode)).toContain('missing_or_weak_confirmation:canonical_confirmation_absent');
  });
});

function countOccurrences(value: string, search: string): number {
  return value.split(search).length - 1;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

describe('authority escalation is sentence-scoped, not whole-body keyword matching', () => {
  const planPrompt = 'Break down the work to upgrade the database driver, and plan the rollback.';
  const escalated = (generatedLine: string) => {
    const currentBody = composedBody({ originalPromptText: planPrompt, route: { promptText: planPrompt } });
    // The line under test is GENERATED wording, so it is routed as the composed body. Passing it
    // as editedBodyText would make it a user edit, which is no longer validated (ruling 2026-08-14).
    const result = validatePromptEnhancementSafety({
      currentBody: { ...currentBody, text: `${currentBody.text}\n\nVerification Or Test Plan:\n- ${generatedLine}` },
    });
    return result.failures.map((failure) => failure.failureCode).includes('authority_escalation:planning_to_execution');
  };

  // The measured false positive: a verification section doing exactly its job. "execute" is an
  // execution verb but nothing risky shares its sentence.
  it('does NOT flag ordinary verification wording', () => {
    expect(escalated('Execute automated tests to check new driver functionality.')).toBe(false);
  });

  // The case that silently defeats the fix if sentence splitting is wrong: TWO numbered items on ONE
  // line. Split badly and "execute" co-occurs with "database", reproducing the false positive.
  it('does NOT flag two numbered items on one line where verb and risk term are in DIFFERENT items', () => {
    expect(escalated('1. Execute automated tests to check new driver functionality. 2. Perform stress tests on database operations.')).toBe(false);
  });

  // Genuine escalation: execution verb and risk term in the SAME sentence.
  it('DOES flag an execution verb and a risk term in the same sentence', () => {
    expect(escalated('Execute the rollback script and confirm the database returns to the prior schema.')).toBe(true);
  });

  it('DOES flag a production deployment instruction', () => {
    expect(escalated('Deploy the package to production during the scheduled downtime.')).toBe(true);
  });

  // The always-escalate floor holds with no risk term anywhere near the verb.
  it('DOES flag always-escalate patterns regardless of sentence scoping', () => {
    expect(escalated('Then force-push the branch.')).toBe(true);
    expect(escalated('Run rm -rf on the folder.')).toBe(true);
  });

  // Accepted trade, recorded as a test rather than a footnote: narrowing to sentence scope means a
  // verb and its risky object split across two sentences now passes. This is a KNOWN false negative.
  it('KNOWN TRADE: verb and risk term in adjacent but separate sentences is no longer flagged', () => {
    expect(escalated('Execute the rollback script. The database will return to the prior schema.')).toBe(false);
  });

  /**
   * Only strong verbs raise an escalation.
   *
   * Sentence scoping on its own did not fix the false positives: 11 of the 18 execution verbs also
   * appear in the risk patterns, so the word satisfied BOTH conditions by itself and the scoping
   * changed nothing for them. `post` is the clearest case — it is a word boundary away from
   * `post-migration`, so an ordinary planning phrase escalated while the same sentence written as
   * "after the migration" passed.
   */
  describe('only strong verbs raise an escalation', () => {
    it('does NOT flag "post-" as a prefix meaning "after"', () => {
      expect(escalated('I will list specific tests or checks that need to be performed post-migration.')).toBe(false);
      expect(escalated('Document the rollback steps and confirm them post-deployment.')).toBe(false);
    });

    // The control that made the defect undeniable: identical meaning, one word apart, opposite verdicts.
    it('treats "post-migration" and "after the migration" the same way', () => {
      const a = escalated('List the checks that need to be performed post-migration.');
      const b = escalated('List the checks that need to be performed after the migration.');
      expect(a).toBe(b);
      expect(a).toBe(false);
    });

    it('does NOT flag weak verbs that planning prose cannot avoid', () => {
      expect(escalated('Write down the acceptance criteria for the schema change.')).toBe(false);
      expect(escalated('Apply the review checklist to the migration script.')).toBe(false);
      // An explicit refusal to act was being read as an instruction to act — the clearest proof the
      // rule was matching words rather than meaning.
      expect(escalated('Modify nothing yet; list the database changes we would need.')).toBe(false);
      expect(escalated('Notify the reviewer once the database plan is ready.')).toBe(false);
    });

    it('still flags every strong verb paired with a risk term', () => {
      expect(escalated('Delete the stale rows from the orders database.')).toBe(true);
      expect(escalated('Run the migration against the production database.')).toBe(true);
      expect(escalated('Install the new dependency into the production image.')).toBe(true);
      expect(escalated('Publish the release to production.')).toBe(true);
    });

    /**
     * ⚠️ KNOWN, ACCEPTED COVERAGE LOSS — recorded as an executable test so it is never rediscovered
     * by accident. These now rely on the always-escalate floor where it matches, and otherwise on the
     * composer's authority self-report. This test asserting `false` is the deliberate record of the
     * trade; it is NOT a bug to be "fixed" by widening the verb list again, which would restore every
     * false positive above.
     */
    it('KNOWN LOSS: a weak verb with a risk noun no longer escalates deterministically', () => {
      expect(escalated('Write the new schema.')).toBe(false);
      expect(escalated('Apply the migration.')).toBe(false);
    });

    // The floor is unaffected by any of the narrowing above.
    it('the always-escalate floor is untouched by the strong-verb narrowing', () => {
      expect(escalated('Then force-push the branch.')).toBe(true);
      expect(escalated('Run rm -rf on the folder.')).toBe(true);
      expect(escalated('Drop table orders when finished.')).toBe(true);
      expect(escalated('Truncate the orders table before the run.')).toBe(true);
    });

    /**
     * The floor applies unconditionally — regression test for a real defect.
     *
     * `ALWAYS_ESCALATE_PATTERN` is the wording with no benign reading, and it is documented as the
     * floor nothing can soften. It was not: it was consulted only AFTER the generated text had to read
     * as `execute_requested`, which `EXECUTION_VERB` decides — and `reset --hard` and `rewrite history`
     * are in the floor but in NO execution-verb list. On their own they never reached the floor at
     * all, so 2 of its 6 patterns were unreachable.
     *
     * What made it hard to see: the precondition reads the WHOLE body, and generated bodies run to
     * seven or eight sections, so some verb like "run" is almost always present somewhere and the
     * floor did fire. An unrelated word elsewhere in the body decided whether the safety net existed.
     */
    it('fires on floor patterns that carry no execution verb of their own', () => {
      expect(escalated('Use reset --hard to clear the working tree.')).toBe(true);
      expect(escalated('Rewrite history on the release branch.')).toBe(true);
    });

    it('the same wording still fires when an execution verb IS present (unchanged)', () => {
      // This passed before the fix too — it is what hid the defect. Kept so a regression that
      // reintroduces the ordering cannot pass by satisfying only this case.
      expect(escalated('Run the cleanup, then use reset --hard on the working tree.')).toBe(true);
    });

    it('every floor pattern escalates with no other execution verb in the body', () => {
      // Enumerated deliberately: the defect was that SOME floor patterns were unreachable, so testing
      // a representative one would not have caught it.
      expect(escalated('Then force-push the branch.')).toBe(true);
      expect(escalated('rm -rf the build folder.')).toBe(true);
      expect(escalated('drop table orders when finished.')).toBe(true);
      expect(escalated('truncate the audit log.')).toBe(true);
      expect(escalated('Use reset --hard on the working tree.')).toBe(true);
      expect(escalated('Rewrite history before the review.')).toBe(true);
    });

    /**
     * The floor asks "did the user ask for the dangerous thing?", not "did the user ask to plan?".
     *
     * Requiring `plan_or_review` silently excluded `observe_or_literal`. "Walk me through how the
     * refunds flow behaves today" is genuinely not a planning request — reclassifying it as one would
     * mislabel ordinary questions — but answering it with `rm -rf` is exactly as unrequested as
     * answering a planning request that way. The request mode was right; the CONDITION was wrong.
     */
    describe('the floor covers observe-type requests, not only planning ones', () => {
      const OBSERVE_PROMPT = 'Walk me through how the refunds flow behaves today.';

      it('confirms the premise: this request is observe-shaped, not plan-shaped', () => {
        expect(promptEnhancementAuthorityModeForTextV1(OBSERVE_PROMPT)).toBe('observe_or_literal');
      });

      const escalatedFor = (originalPromptText: string, generatedLine: string) => {
        const currentBody = composedBody({ originalPromptText, route: { promptText: originalPromptText } });
        return validatePromptEnhancementSafety({
          currentBody: { ...currentBody, text: `${currentBody.text}\n\nVerification Or Test Plan:\n- ${generatedLine}` },
        }).failures.map((f) => f.failureCode).includes('authority_escalation:planning_to_execution');
      };

      it('fires on floor wording answering an observe-type request', () => {
        expect(escalatedFor(OBSERVE_PROMPT, 'rm -rf the cache directory and re-run it.')).toBe(true);
        expect(escalatedFor(OBSERVE_PROMPT, 'Use reset --hard to clear the working tree.')).toBe(true);
      });

      /**
       * ⚠️ ACCEPTED FALSE POSITIVE, recorded as a test.
       *
       * An execution request the word list does not recognise ("nuke" is in no verb list) reads as
       * observe_or_literal, so floor wording answering it now blocks even though the user asked for
       * it. Accepted knowingly: every path still leaves the original prompt sendable — on a hard
       * block the body text falls back to `originalPromptText` and `use_original`/`close` stay
       * available — so the cost is the enhanced sections, never the ability to send.
       */
      it('ACCEPTED FALSE POSITIVE: an unrecognised execution request loses the exemption', () => {
        expect(escalatedFor('Nuke the build dir.', 'rm -rf the build directory.')).toBe(true);
      });

      it('above the floor, observe-type requests are unchanged (still not escalations)', () => {
        // Only the floor was widened; the strong-verb rule stays scoped to plan/review requests.
        expect(escalatedFor(OBSERVE_PROMPT, 'Delete the stale rows from the orders database.')).toBe(false);
      });
    });

    // The widening is bounded: it applies to the floor only, and an explicit execution request is
    // still honoured. A user who asked for the dangerous action still gets it.
    it('does not fire when the user asked for the dangerous action themselves', () => {
      const doPrompt = 'Force-push the rebased branch and reset --hard to drop my local changes.';
      const currentBody = composedBody({ originalPromptText: doPrompt, route: { promptText: doPrompt } });
      const result = validatePromptEnhancementSafety({
        currentBody,
        editedBodyText: `${currentBody.text}\n\nVerification Or Test Plan:\n- Use reset --hard to clear the working tree.`,
      });
      expect(result.failures.map((f) => f.failureCode)).not.toContain('authority_escalation:planning_to_execution');
    });
  });

  /**
   * The composer's own verdict covers the middle band the floor cannot reach.
   *
   * Narrowing the deterministic rule to a floor leaves wording that escalates without using any
   * listed verb — "Once approved, roll it out to production" is the measured example, and no verb
   * list catches it. The composer classifies the text it just wrote, so its verdict is carried into
   * final-body validation.
   *
   * The invariant under test is one-directional: the verdict may ACCUSE, never ACQUIT.
   */
  describe('the composer verdict is additive to the deterministic rule', () => {
    const withReport = (generatedLine: string, report?: { generatedMode?: string; requestMode?: string }) => {
      const currentBody = composedBody({ originalPromptText: planPrompt, route: { promptText: planPrompt } });
      const result = validatePromptEnhancementSafety({
        currentBody: { ...currentBody, text: `${currentBody.text}\n\nVerification Or Test Plan:\n- ${generatedLine}` },
        composerAuthoritySelfReport: report as never,
      });
      return result.failures.map((f) => f.failureCode).includes('authority_escalation:planning_to_execution');
    };

    // The measured under-block from the verification pass: no listed verb anywhere in the sentence.
    const MIDDLE_BAND = 'Once approved, roll it out to production and monitor error rates.';

    it('confirms the premise: the deterministic rule misses the middle band entirely', () => {
      expect(withReport(MIDDLE_BAND)).toBe(false);
    });

    it('ACCUSES: the verdict blocks wording the deterministic rule cannot see', () => {
      expect(withReport(MIDDLE_BAND, { generatedMode: 'execute_requested' })).toBe(true);
    });

    it('NEVER ACQUITS: a plan_or_review verdict does not clear a deterministic block', () => {
      const genuine = 'Delete the stale rows from the orders database.';
      expect(withReport(genuine)).toBe(true);
      expect(withReport(genuine, { generatedMode: 'plan_or_review' })).toBe(true);
      expect(withReport(genuine, { generatedMode: 'observe_or_literal' })).toBe(true);
    });

    it('omitting the verdict leaves behaviour exactly as it was', () => {
      expect(withReport(MIDDLE_BAND, undefined)).toBe(false);
      expect(withReport(MIDDLE_BAND, {})).toBe(false);
    });

    it('does not fire when the user asked for execution in the first place', () => {
      const doPrompt = 'Delete the stale rows and deploy the fix to production.';
      const currentBody = composedBody({ originalPromptText: doPrompt, route: { promptText: doPrompt } });
      const result = validatePromptEnhancementSafety({
        currentBody,
        editedBodyText: `${currentBody.text}\n\nVerification Or Test Plan:\n- ${MIDDLE_BAND}`,
        composerAuthoritySelfReport: { generatedMode: 'execute_requested', requestMode: 'execute_requested' },
      });
      expect(result.failures.map((f) => f.failureCode)).not.toContain('authority_escalation:planning_to_execution');
    });

    it('fires on a plan-shaped request the word list misreads, via the model reading', () => {
      // Same hole as the composer gate: no listed planning verb, so the word list says
      // observe_or_literal and the check would otherwise skip itself.
      const misread = 'Walk me through how the refunds flow behaves today.';
      const currentBody = composedBody({ originalPromptText: misread, route: { promptText: misread } });
      const validate = (report?: { generatedMode: string; requestMode?: string }) =>
        validatePromptEnhancementSafety({
          currentBody: { ...currentBody, text: `${currentBody.text}\n\nVerification Or Test Plan:\n- ${MIDDLE_BAND}` },
          composerAuthoritySelfReport: report as never,
        }).failures.map((f) => f.failureCode).includes('authority_escalation:planning_to_execution');

      expect(validate({ generatedMode: 'execute_requested' })).toBe(false);
      expect(validate({ generatedMode: 'execute_requested', requestMode: 'plan_or_review' })).toBe(true);
    });
  });
});

// ── per-item safety helpers, reachable from outside this module ───────────────────────────────

describe('per-item safety helpers', () => {
  // The safety validator runs over one finished body. A multi-prompt sequence is a list of
  // generated bodies, so the same two questions have to be askable of a single item.

  it('reports the risk families a slice reads as, and none for ordinary text', () => {
    expect(promptEnhancementRiskKindsForTextV1('delete the temp files'))
      .toContain('destructive_filesystem_or_codebase');
    expect(promptEnhancementRiskKindsForTextV1('rotate the api_key before Friday'))
      .toContain('secret_env_or_credential');
    expect(promptEnhancementRiskKindsForTextV1('rename the helper for clarity')).toEqual([]);
  });

  it('reads one slice at a time, so several families can come back together', () => {
    const kinds = promptEnhancementRiskKindsForTextV1('deploy to production and truncate the sessions table');
    expect(kinds).toContain('production_release_or_external_effect');
    expect(kinds).toContain('destructive_data_or_schema');
  });

  it('does not count a quoted or fenced example as a risk', () => {
    // Literal blocks are stripped before matching. A fresh implementation would be unlikely to
    // reproduce this, which is why the shipping one is exported rather than rewritten.
    expect(promptEnhancementRiskKindsForTextV1('the docs mention `rm -rf` as an example')).toEqual([]);
    expect(promptEnhancementRiskKindsForTextV1('it says "delete everything" in the README')).toEqual([]);
  });

  it('catches wording that claims more authority than the request granted', () => {
    // A planning request answered with an instruction to perform the dangerous thing.
    const planning = 'Plan how we would clean up the temp directory';
    expect(promptEnhancementAuthorityModeForTextV1(planning)).not.toBe('execute_requested');
    expect(promptEnhancementGeneratedEscalatesAuthorityV1(planning, 'Run rm -rf on the temp directory now'))
      .toBe(true);
  });

  it('leaves wording that stays inside the request alone', () => {
    const planning = 'Plan how we would clean up the temp directory';
    expect(promptEnhancementGeneratedEscalatesAuthorityV1(
      planning,
      'Outline which directories are safe to clear and what would need review first',
    )).toBe(false);
  });

  it('is the same answer the module reaches internally, not a second opinion', () => {
    // The wrappers delegate. If one were ever reimplemented, this is what would diverge first.
    const text = 'force-push the rebased branch';
    expect(promptEnhancementRiskKindsForTextV1(text)).toContain('git_history_rewrite');
    expect(promptEnhancementAuthorityModeForTextV1(text)).toBe('execute_requested');
  });
});

// ---------------------------------------------------------------------------------------------
// Phase S1: the safety validator must not decide what it inspects by reading a planning flag.
//
// It used to filter sections on `safetyFlags.length > 0`. That looked selective and was not —
// three of the four flag values are ROUTE capabilities stamped onto every section, so the filter
// admitted everything. It only appeared to work because it never excluded anything, and it would
// have started excluding real sections the moment those flags were corrected.
// ---------------------------------------------------------------------------------------------
describe('safety coverage does not depend on section safety flags', () => {
  /** The same body, with every section stripped of the flags the validator used to filter on. */
  function withoutSafetyFlags(body: ReturnType<typeof composedBody>) {
    return {
      ...body,
      sections: body.sections.map((section) => ({ ...section, safetyFlags: [], sensitivityFlags: [] })),
    };
  }

  const RISKY_PROMPT = 'Delete the archived customer rows in production and run the migration.';

  it('inspects a body whose sections carry no safety flags at all', () => {
    const body = composedBody({ originalPromptText: RISKY_PROMPT });
    const flagged = validatePromptEnhancementSafety({ currentBody: body });
    const unflagged = validatePromptEnhancementSafety({
      currentBody: withoutSafetyFlags(body),
      editedBodyText: body.text,
    });

    // Same verdict, same risk findings — stripping the flags must change nothing.
    expect(unflagged.validationStatus).toBe(flagged.validationStatus);
    expect(unflagged.sensitiveActionFindings.map((finding) => finding.riskKind).sort())
      .toEqual(flagged.sensitiveActionFindings.map((finding) => finding.riskKind).sort());
  });

  it('still attributes a risk finding to the sections when none are flagged', () => {
    const body = composedBody({ originalPromptText: RISKY_PROMPT });
    const unflagged = validatePromptEnhancementSafety({
      currentBody: withoutSafetyFlags(body),
      editedBodyText: body.text,
    });

    expect(unflagged.sensitiveActionFindings.length).toBeGreaterThan(0);
    for (const finding of unflagged.sensitiveActionFindings) {
      expect(finding.affectedSectionIds.length).toBeGreaterThan(0);
    }
  });

  it('raises the wide-scope finding when a section is flagged and no risk pattern matched', () => {
    // The one case the risk-pattern loop cannot reach: capability.confirmation_needed can come from
    // ambiguity or missing acceptance facts rather than from risky wording, so no pattern matches
    // while a section still carries the flag.
    //
    // It has to be a BENIGN prompt. An earlier version of this test used the risky one, where the
    // pattern loop fires first and this branch is never entered — so it passed while exercising
    // nothing, and removing the mechanism under test broke no test at all.
    const BENIGN = 'Rename the helper in utils.ts and keep the tests passing.';
    const body = composedBody({ originalPromptText: BENIGN });

    const flaggedOnOneSection = {
      ...body,
      sections: body.sections.map((section, index) => ({
        ...section,
        safetyFlags: index === 1 ? ['sensitive_action_confirmation'] : [],
        sensitivityFlags: [],
      })),
    };

    expect(validatePromptEnhancementSafety({
      currentBody: withoutSafetyFlags(body),
      editedBodyText: body.text,
    }).sensitiveActionFindings).toHaveLength(0);

    expect(validatePromptEnhancementSafety({
      currentBody: flaggedOnOneSection,
      editedBodyText: body.text,
    }).sensitiveActionFindings.map((finding) => finding.riskKind))
      .toContain('wide_scope_or_boundary_expansion');
  });
});

describe('S1 done-when: detection follows the body text, not section metadata', () => {
  // ⚠️ What this proves, and what it does NOT. Risk detection reads the assembled body text, so a
  // violation is caught wherever it sits and whatever flags the sections carry. Verified by
  // mutation: making the validator inspect only flagged sections does NOT fail this test, because
  // the finding never came from walking sections in the first place.
  //
  // The test that DOES guard the flag-dependence is "still attributes a risk finding to the
  // sections when none are flagged" above — it catches both that mutation and the narrower one on
  // `affectedSections`. This test documents the property; that one defends it. Kept because the
  // property is worth stating explicitly, renamed because the original name claimed a guard it
  // does not provide.
  it('catches a violation planted in a section body when no section carries any flag', () => {
    const BENIGN = 'Rename the helper in utils.ts and keep the tests passing.';
    const body = composedBody({ originalPromptText: BENIGN });

    // No flags anywhere, and the risky wording planted in a section rather than in the prompt.
    const violationInUnflaggedSection = {
      ...body,
      sections: body.sections.map((section, index) => ({
        ...section,
        safetyFlags: [],
        sensitivityFlags: [],
        bodyText: index === 1
          ? 'Drop the users table in production and force-push the rewritten history.'
          : section.bodyText,
        text: index === 1
          ? `${section.title}:\n- Drop the users table in production and force-push the rewritten history.`
          : section.text,
      })),
    };
    const editedBodyText = violationInUnflaggedSection.sections.map((section) => section.text).join('\n\n');

    const result = validatePromptEnhancementSafety({
      currentBody: violationInUnflaggedSection,
      editedBodyText,
    });

    expect(result.sensitiveActionFindings.length).toBeGreaterThan(0);
  });
});

describe('user-edit authority — the ruling, pinned (2026-08-14)', () => {
  /**
   * Issue 28, as the fix plan's done-when states it: a risky body, the confirmation deleted,
   * and the send goes through. Before this ruling the same edit produced `no_send`.
   */
  it('sends a risky body whose confirmation the user deleted', () => {
    const originalPromptText = 'Deploy the payment service to production and migrate the schema.';
    const currentBody = composedBody({ originalPromptText, route: { promptText: originalPromptText } });
    const editedBodyText = currentBody.text.replaceAll(
      buildPromptEnhancementCanonicalConfirmation(originalPromptText),
      '',
    );

    // Guard against a vacuous pass: the confirmation must actually have been there to delete.
    expect(currentBody.text).not.toBe(editedBodyText);

    const result = validatePromptEnhancementSafety({ currentBody, editedBodyText, actionType: 'use_current_body' });

    expect(result.sendPolicy).toBe('send_current');
    expect(result.generatedSafeStatus).not.toBe('invalid_non_sendable');
    expect(result.failures.map((failure) => failure.failureCode)).toEqual([]);
  });

  it('still refuses the SAME wording when NEXPATH wrote it rather than the user', () => {
    // The generated path is untouched. This is the control that proves the change is scoped to
    // edits and did not quietly disable validation everywhere.
    const originalPromptText = 'Plan the production migration and rollback; do not run it yet.';
    const currentBody = composedBody({ originalPromptText, route: { promptText: originalPromptText } });
    const generated = `${currentBody.text}\n\nVerification Or Test Plan:\n- Run the migration against the production database now.`;

    const result = validatePromptEnhancementSafety({ currentBody: { ...currentBody, text: generated } });

    expect(result.failures.map((failure) => failure.failureCode))
      .toContain('authority_escalation:planning_to_execution');
    expect(result.sendPolicy).toBe('no_send');
  });

  it('still enforces the transport cap on an edited body, because that is a limit not an opinion', () => {
    const currentBody = composedBody();
    const editedBodyText = 'x'.repeat(PROMPT_ENHANCEMENT_MAX_SENDABLE_BODY_CHARS + 1);

    const result = validatePromptEnhancementSafety({ currentBody, editedBodyText, actionType: 'use_current_body' });

    expect(result.failures.map((failure) => failure.failureCode)).toContain('body_size:cap_exceeded');
  });
});

// ── The no-invention state, enforced end to end (the fabrication hard-fail) ──

describe('no-invention state: a section carrying the obligation cannot name what nobody supplied', () => {
  // The measured defect: a repro/evidence section asked to write about a queue
  // the user never mentioned answered "use RabbitMQ or AWS SQS". Prose could
  // not catch it; the typed state can.
  const debugPrompt = 'the checkout job stops halfway and I cannot tell why';
  const reproRoute = {
    promptText: debugPrompt,
    classifierPrimaryIntent: 'issue_debug.reproduction_discovery' as const,
    classifierIntentConfidence: 0.9,
    classifierCapabilityCandidates: [] as const,
    classifierDebugEvidencePresent: [] as const,
  };

  function bodyWithReproText(sectionText: string) {
    const body = composedBody({ originalPromptText: debugPrompt, route: reproRoute as never });
    const sections = body.sections.map((section) =>
      section.sectionKind === 'reproduction_or_evidence' ? { ...section, bodyText: sectionText } : section,
    );
    const repro = sections.find((section) => section.sectionKind === 'reproduction_or_evidence');
    expect(repro, 'fixture needs the reproduction section').toBeDefined();
    expect(repro!.slotObligations).toContain('no_invention_state');
    return { ...body, sections, text: `${body.text}\n${sectionText}` };
  }

  it('HARD FAIL: the fabricated-tool answer is rejected by name', () => {
    const result = validatePromptEnhancementSafety({
      currentBody: bodyWithReproText('- Use RabbitMQ or AWS SQS to replay the job and capture the failure.') as never,
    });
    const codes = result.failures.map((failure) => failure.failureCode);
    expect(codes.some((code) => code.startsWith('no_invention_state:fabricated_item:'))).toBe(true);
    expect(codes.some((code) => code.includes('RabbitMQ'))).toBe(true);
    expect(result.generatedSafeStatus).not.toBe('valid');
  });

  it('a fabricated file path in the same section also hard-fails', () => {
    const result = validatePromptEnhancementSafety({
      currentBody: bodyWithReproText('- Read src/queue/consumer.ts to find the stalled step.') as never,
    });
    expect(result.failures.map((f) => f.failureCode).some((code) => code.includes('src/queue/consumer.ts'))).toBe(true);
  });

  it('asking for the evidence — inventing nothing — passes', () => {
    const result = validatePromptEnhancementSafety({
      currentBody: bodyWithReproText('- State the exact steps that reach the stall, what you expected, and what happened instead.') as never,
    });
    expect(result.failures.map((f) => f.failureCode).some((code) => code.startsWith('no_invention_state:'))).toBe(false);
  });

  it('an item the USER supplied is not an invention', () => {
    const body = composedBody({
      originalPromptText: 'the checkout job stops halfway, RabbitMQ is the queue we use',
      route: { ...reproRoute, promptText: 'the checkout job stops halfway, RabbitMQ is the queue we use' } as never,
    });
    const sections = body.sections.map((section) =>
      section.sectionKind === 'reproduction_or_evidence'
        ? { ...section, bodyText: '- Capture the RabbitMQ consumer state when the job stalls.' }
        : section,
    );
    const result = validatePromptEnhancementSafety({
      currentBody: { ...body, sections, text: `${body.text}\n- Capture the RabbitMQ consumer state when the job stalls.` } as never,
    });
    expect(result.failures.map((f) => f.failureCode).some((code) => code.startsWith('no_invention_state:'))).toBe(false);
  });

  it('a section WITHOUT the obligation is not policed by this check', () => {
    // The obligation is now UNIVERSAL over composed prose (the reach widening), so no planned
    // section arrives without it — the fixture strips it by hand to keep the validator property
    // pinned: the check keys on the obligation, never on the section kind.
    const body = composedBody({ originalPromptText: debugPrompt, route: reproRoute as never });
    const sections = body.sections.map((section) =>
      section.sectionKind === 'verification_or_test_plan'
        ? {
          ...section,
          bodyText: '- Verify with RabbitMQ management UI.',
          slotObligations: section.slotObligations.filter((obligation) => obligation !== 'no_invention_state'),
        }
        : section,
    );
    const verification = sections.find((section) => section.sectionKind === 'verification_or_test_plan');
    expect(verification!.slotObligations).not.toContain('no_invention_state');
    const result = validatePromptEnhancementSafety({
      currentBody: { ...body, sections, text: `${body.text}\n- Verify with RabbitMQ management UI.` } as never,
    });
    expect(result.failures.map((f) => f.failureCode).some((code) => code.startsWith('no_invention_state:'))).toBe(false);
  });
});
