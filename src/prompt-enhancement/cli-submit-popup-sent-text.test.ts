/**
 * What the submit popup actually sends.
 *
 * Runs the popup's own loop with a scripted interaction and records the text it
 * hands back, for four ways a user can leave it: untouched, after a hand edit,
 * after deleting a whole section by hand, and after deleting the section that
 * carries the confirmation sentence.
 *
 * The recorded text is the reference any later change to the popup is measured
 * against — a change that alters what is sent, rather than only how it looks,
 * shows up here as a snapshot diff.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  type PromptEnhancementPrepareRequestV1,
  type PromptEnhancementPrepareResultV1,
  type PromptEnhancementSourceRefV1,
} from './contracts.js';
import { buildPromptEnhancementCostVisibilityMetadataV1 } from './cost-observability.js';
import { preparePromptEnhancement } from './facade.js';
import { getPromptStartStopSourceSnapshot } from './source-reality.js';
import {
  runPromptEnhancementCliSubmitPopupV1,
  type PromptEnhancementCliPopupCommandV1,
  type PromptEnhancementCliPopupInteractionV1,
  type PromptEnhancementCliPopupViewV1,
} from './cli-submit-popup.js';

// Same reason as the frame recording: the wording path is exercised without a
// network call, and the route-rescue path cannot reach a real client either.
vi.mock('./llm-composer.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./llm-composer.js')>();
  return {
    ...original,
    composeStructuredComposerOutputV1: vi.fn(async (input: {
      planning: {
        sectionPlans: readonly {
          sectionId: string;
          sectionKind: string;
          structuredContentPartRefs: readonly string[];
        }[];
      };
    }) => {
      const plans = input.planning.sectionPlans.filter(
        (plan) => plan.sectionKind !== 'original_request_or_goal' && plan.structuredContentPartRefs.length > 0,
      );
      if (plans.length === 0) return { ok: false, reason: 'no_eligible_sections' };
      return {
        ok: true,
        output: {
          outputId: 'llm-out-sent-text',
          sectionDrafts: plans.map((plan) => ({
            sectionId: plan.sectionId,
            bodyText: 'Keep the existing behaviour of the payment gateway client and cover it with a test.',
            sourceFactIds: [plan.structuredContentPartRefs[0]!],
          })),
          composerClaims: plans.map((plan) => `claim:${plan.structuredContentPartRefs[0]!}`),
          detectedLanguageSelfReport: 'en',
        },
      };
    }),
  };
});
vi.mock('./llm-route-decision.js', () => ({
  decidePromptEnhancementRouteViaLlmV1: vi.fn(async () => undefined),
}));

const SMALL_PROMPT = 'Add a retry with exponential backoff to the payment gateway client.';
const CONFIRMATION_PROMPT =
  'Fix the failing payment test, the test failure blocks ci, and explain the verification. also drop a shadow under the submit button.';
const APPENDED_LINE = 'Also keep the existing timeout unchanged.';
const DETAILS_HEADING = 'Additional details to incorporate:';
const DETAILS_TEXT = 'Keep the retry count at five.';
/** The fixed part of the code-inserted confirmation sentence. */
const CONFIRMATION_FRAGMENT = 'go-ahead confirmation';

function request(text: string): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'sent-text-source-a',
    sourceKind: 'source_a_user_prompt',
    sourceId: 'prompt:1',
    sourceAuthorization: 'source_fact_only',
    evidenceStatus: 'present',
    freshness: 'current',
    confidence: 'high',
    privacyClass: 'local_private',
  };
  const promptStartStop = getPromptStartStopSourceSnapshot();
  return {
    schemaVersion: PROMPT_ENHANCEMENT_CONTRACT_VERSION,
    requestId: 'sent-text-request',
    projectRoot: '/tmp/sent-text-project',
    hostSurface: 'cli_stop_bridge',
    sourcePrompt: {
      text,
      origin: 'user',
      capturedAt: 1,
      promptIndex: 1,
      generatedOriginPolicy: 'ordinary_source_a',
    },
    reviewMomentContext: {
      reviewMoment: 'UserPromptSubmit_preparation',
      currentAgentMode: 'workspace-write',
      projectId: 'project-1',
      sessionId: 'session-1',
      detectedLanguage: 'en',
      stageCandidate: 'implementation',
      promptCount: 1,
      recentPromptMetadataRefs: [],
      triggerProvenance: {
        currentStage: 'implementation',
        prevStage: 'task_breakdown',
        triggerKind: 'stage_transition',
        classifierState: 'fire_recommended',
        degradedNoActionState: 'none',
        promptStartBoundary: promptStartStop.hookBoundary,
        deliveryBoundary: promptStartStop.deliveryBoundary,
        promptStartCanReplaceSameTurn: false,
      },
    },
    sourceSignals: {
      sourceAOriginalPromptRef: sourceRef,
      sourceRefs: [sourceRef],
      normalizedStageAbsenceSignalRefs: [],
      contentTemplateRecordFactRefs: [],
      popupQuestionSourceRefs: [],
      whyHelpSourceRefs: [],
      profileRoleModeRefs: [],
      rightGoodWorkStyleEnvRuntimeRefs: [],
      missingMemoryCandidateRefs: [],
      sourceLabels: [{ sourceRefId: sourceRef.sourceRefId, label: 'original_prompt', evidenceStatus: 'present' }],
      promptStartStop: {
        hookBoundary: promptStartStop.hookBoundary,
        deliveryBoundary: promptStartStop.deliveryBoundary,
        runAutoCanHoldOrReplaceSubmittedPrompt: false,
        sharedSignalCount: promptStartStop.sharedSignalCount,
        classifierDegradedNoFireReasons: promptStartStop.classifierDegradedNoFireReasons,
      },
      store: { schemaVersion: 1, missingPromptEnhancementTables: [], cleanupGaps: [] },
      transcriptPathState: 'not_authority',
      streamBOutputs: [],
      paramEventChannels: [],
      servedVariantIdentityRefs: [],
      deliveryGateRefs: [],
      sourceOnlyHardFactRefs: [],
    },
    userPreferenceContext: { levelState: 'default', scopedFeedbackEvidenceRefs: [] },
    configSnapshot: {
      sequenceEnabledState: 'not_enabled_v1',
      validatedEffectiveConfigState: 'valid',
      arbitraryConfigRowsAreAuthority: false,
    },
    callVisibilityState: buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', {
      callVisibilityMode: 'deterministic',
      plannedCallCount: 0,
      usedCallCount: 0,
    }),
    privacyAndStoragePolicy: {
      sensitivityClass: 'normal',
      localStorageEligibility: 'ids_and_categories_only',
      telemetryEligibility: 'allowlisted_counts_only',
      llmSharingEligibility: 'allowed_minimal',
      generatedBodyStoragePolicy: 'do_not_store_raw_by_default',
    },
  };
}

function interaction(
  commands: readonly PromptEnhancementCliPopupCommandV1[],
): PromptEnhancementCliPopupInteractionV1 & { views: PromptEnhancementCliPopupViewV1[] } {
  const queue = [...commands];
  return {
    views: [],
    async next(view) {
      this.views.push(view);
      const command = queue.shift();
      if (!command) throw new Error('missing scripted command');
      return command;
    },
    close() {},
  };
}

interface Outcome {
  state: string;
  bodyText: string;
  diagnostics: readonly { actionType: string; state: string; reasonCodes: readonly string[] }[];
}

async function leaveWith(
  baseRequest: PromptEnhancementPrepareRequestV1,
  result: PromptEnhancementPrepareResultV1,
  commands: readonly PromptEnhancementCliPopupCommandV1[],
): Promise<Outcome> {
  const diagnostics: { actionType: string; state: string; reasonCodes: readonly string[] }[] = [];
  const popupResult = await runPromptEnhancementCliSubmitPopupV1({
    request: baseRequest,
    result,
    interaction: interaction(commands),
    actionDiagnosticsSink: (event) => diagnostics.push(event),
  });
  return {
    state: popupResult.state,
    bodyText: popupResult.state === 'selected_current' ? popupResult.bodyText : '',
    diagnostics,
  };
}

/** The body the popup builds when typed details are applied, as the reducer composes it. */
function withAppliedDetails(bodyText: string): string {
  return `${bodyText}\n\n${DETAILS_HEADING}\n${DETAILS_TEXT}`;
}

/**
 * Removes one whole section from a composed body: its title line through the blank
 * line before the next title — exactly what a user selecting those lines would cut.
 */
function cutSection(
  result: PromptEnhancementPrepareResultV1,
  title: string,
  bodyOverride?: string,
): string {
  const body = bodyOverride ?? result.currentBody.text;
  const titles = result.currentBody.sections.map((section) => `${section.title}:`);
  const start = body.indexOf(`${title}:`);
  if (start < 0) throw new Error(`section not found in body: ${title}`);
  const laterStarts = titles
    .map((candidate) => body.indexOf(candidate))
    .filter((index) => index > start);
  const end = laterStarts.length > 0 ? Math.min(...laterStarts) : body.length;
  return (body.slice(0, start) + body.slice(end)).replace(/\n{3,}/g, '\n\n');
}

/** The first generated section a user would reach that does not carry the confirmation. */
function firstOrdinarySection(result: PromptEnhancementPrepareResultV1): string {
  const candidate = result.currentBody.sections.find(
    (section) =>
      section.sectionKind !== 'original_request_or_goal'
      && !(section.confirmationRequired && section.confirmationPresent),
  );
  if (!candidate) throw new Error('no ordinary generated section in this body');
  return candidate.title;
}

function confirmationSection(result: PromptEnhancementPrepareResultV1): string {
  const candidate = result.currentBody.sections.find(
    (section) => section.confirmationRequired && section.confirmationPresent,
  );
  if (!candidate) throw new Error('no confirmation-carrying section in this body');
  return candidate.title;
}

describe('what the submit popup sends', () => {
  const savedKey = process.env['OPENAI_API_KEY'];
  afterEach(() => {
    if (savedKey === undefined) delete process.env['OPENAI_API_KEY'];
    else process.env['OPENAI_API_KEY'] = savedKey;
  });

  describe('bodies composed without a key', () => {
    let small: PromptEnhancementPrepareResultV1;
    let confirmation: PromptEnhancementPrepareResultV1;
    let smallRequest: PromptEnhancementPrepareRequestV1;
    let confirmationRequest: PromptEnhancementPrepareRequestV1;

    beforeEach(async () => {
      delete process.env['OPENAI_API_KEY'];
      smallRequest = request(SMALL_PROMPT);
      confirmationRequest = request(CONFIRMATION_PROMPT);
      small = await preparePromptEnhancement(smallRequest);
      confirmation = await preparePromptEnhancement(confirmationRequest);
    });

    it('sends the body unchanged when nothing is edited', async () => {
      const outcome = await leaveWith(smallRequest, small, [{ type: 'use_current' }]);
      expect(outcome.state).toBe('selected_current');
      expect(outcome.bodyText).toBe(small.currentBody.text);
      expect(outcome).toMatchSnapshot();
    });

    it('sends the edited body when a line is added by hand', async () => {
      const edited = `${small.currentBody.text}\n${APPENDED_LINE}`;
      const outcome = await leaveWith(smallRequest, small, [
        { type: 'edit_body', text: edited },
        { type: 'use_current' },
      ]);
      expect(outcome.state).toBe('selected_current');
      expect(outcome.bodyText).toContain(APPENDED_LINE);
      expect(outcome).toMatchSnapshot();
    });

    it('sends the body without a section the user deleted by hand', async () => {
      const removed = firstOrdinarySection(small);
      const outcome = await leaveWith(smallRequest, small, [
        { type: 'edit_body', text: cutSection(small, removed) },
        { type: 'use_current' },
      ]);
      expect(outcome.state).toBe('selected_current');
      expect(outcome.bodyText).not.toContain(`${removed}:`);
      expect(outcome).toMatchSnapshot();
    });

    it('sends the body with applied details merged in', async () => {
      const merged = withAppliedDetails(small.currentBody.text);
      const outcome = await leaveWith(smallRequest, small, [
        { type: 'edit_body', text: merged },
        { type: 'use_current' },
      ]);
      expect(outcome.state).toBe('selected_current');
      expect(outcome.bodyText).toContain(DETAILS_HEADING);
      expect(outcome.bodyText).toContain(DETAILS_TEXT);
      expect(outcome).toMatchSnapshot();
    });

    it('still sends the body when the confirmation-carrying section is deleted by hand', async () => {
      expect(confirmation.currentBody.text).toContain(CONFIRMATION_FRAGMENT);
      const removed = confirmationSection(confirmation);
      const outcome = await leaveWith(confirmationRequest, confirmation, [
        { type: 'edit_body', text: cutSection(confirmation, removed) },
        { type: 'use_current' },
      ]);

      expect(outcome.state).toBe('selected_current');
      expect(outcome.bodyText).not.toContain(`${removed}:`);
      expect(outcome.bodyText).not.toContain(CONFIRMATION_FRAGMENT);
      expect(outcome.diagnostics).toEqual([]);
      expect(outcome).toMatchSnapshot();
    });

    it('sends the confirmation-carrying body unchanged when nothing is edited', async () => {
      const outcome = await leaveWith(confirmationRequest, confirmation, [{ type: 'use_current' }]);
      expect(outcome.state).toBe('selected_current');
      expect(outcome.bodyText).toBe(confirmation.currentBody.text);
      expect(outcome.bodyText).toContain(CONFIRMATION_FRAGMENT);
      expect(outcome).toMatchSnapshot();
    });

    it('sends the confirmation-carrying body with a line added by hand', async () => {
      const outcome = await leaveWith(confirmationRequest, confirmation, [
        { type: 'edit_body', text: `${confirmation.currentBody.text}\n${APPENDED_LINE}` },
        { type: 'use_current' },
      ]);
      expect(outcome.bodyText).toContain(APPENDED_LINE);
      expect(outcome.bodyText).toContain(CONFIRMATION_FRAGMENT);
      expect(outcome).toMatchSnapshot();
    });

    it('sends the confirmation-carrying body without an ordinary section deleted by hand', async () => {
      const removed = firstOrdinarySection(confirmation);
      const outcome = await leaveWith(confirmationRequest, confirmation, [
        { type: 'edit_body', text: cutSection(confirmation, removed) },
        { type: 'use_current' },
      ]);
      expect(outcome.bodyText).not.toContain(`${removed}:`);
      // Cutting an ordinary section leaves the confirmation where it was.
      expect(outcome.bodyText).toContain(CONFIRMATION_FRAGMENT);
      expect(outcome).toMatchSnapshot();
    });

    it('sends the merged body with a line added by hand after the details were applied', async () => {
      const merged = withAppliedDetails(small.currentBody.text);
      const outcome = await leaveWith(smallRequest, small, [
        { type: 'edit_body', text: `${merged}\n${APPENDED_LINE}` },
        { type: 'use_current' },
      ]);
      expect(outcome.bodyText).toContain(DETAILS_HEADING);
      expect(outcome.bodyText).toContain(APPENDED_LINE);
      expect(outcome).toMatchSnapshot();
    });

    it('sends the merged body without a section deleted by hand after the details were applied', async () => {
      const merged = withAppliedDetails(small.currentBody.text);
      const removed = firstOrdinarySection(small);
      const outcome = await leaveWith(smallRequest, small, [
        { type: 'edit_body', text: cutSection(small, removed, merged) },
        { type: 'use_current' },
      ]);
      expect(outcome.bodyText).not.toContain(`${removed}:`);
      // The applied details sit after the last section, so a cut above leaves them intact.
      expect(outcome.bodyText).toContain(DETAILS_HEADING);
      expect(outcome.bodyText).toContain(DETAILS_TEXT);
      expect(outcome).toMatchSnapshot();
    });
  });

  describe('bodies composed with a key', () => {
    let medium: PromptEnhancementPrepareResultV1;
    let largest: PromptEnhancementPrepareResultV1;
    let mediumRequest: PromptEnhancementPrepareRequestV1;
    let largestRequest: PromptEnhancementPrepareRequestV1;

    beforeEach(async () => {
      process.env['OPENAI_API_KEY'] = `sk-${'a'.repeat(24)}`;
      mediumRequest = request(SMALL_PROMPT);
      largestRequest = request(CONFIRMATION_PROMPT);
      medium = await preparePromptEnhancement(mediumRequest);
      largest = await preparePromptEnhancement(largestRequest);
    });

    it('sends the body unchanged when nothing is edited', async () => {
      const outcome = await leaveWith(mediumRequest, medium, [{ type: 'use_current' }]);
      expect(outcome.bodyText).toBe(medium.currentBody.text);
      expect(outcome).toMatchSnapshot();
    });

    it('sends the edited body when a line is added by hand', async () => {
      const outcome = await leaveWith(mediumRequest, medium, [
        { type: 'edit_body', text: `${medium.currentBody.text}\n${APPENDED_LINE}` },
        { type: 'use_current' },
      ]);
      expect(outcome.bodyText).toContain(APPENDED_LINE);
      expect(outcome).toMatchSnapshot();
    });

    it('sends the body without a section the user deleted by hand', async () => {
      const removed = firstOrdinarySection(medium);
      const outcome = await leaveWith(mediumRequest, medium, [
        { type: 'edit_body', text: cutSection(medium, removed) },
        { type: 'use_current' },
      ]);
      expect(outcome.bodyText).not.toContain(`${removed}:`);
      expect(outcome).toMatchSnapshot();
    });

    it('still sends the body when the confirmation-carrying section is deleted by hand', async () => {
      expect(largest.currentBody.text).toContain(CONFIRMATION_FRAGMENT);
      const removed = confirmationSection(largest);
      const outcome = await leaveWith(largestRequest, largest, [
        { type: 'edit_body', text: cutSection(largest, removed) },
        { type: 'use_current' },
      ]);

      expect(outcome.state).toBe('selected_current');
      expect(outcome.bodyText).not.toContain(CONFIRMATION_FRAGMENT);
      expect(outcome.diagnostics).toEqual([]);
      expect(outcome).toMatchSnapshot();
    });

    it('sends the largest body unchanged when nothing is edited', async () => {
      const outcome = await leaveWith(largestRequest, largest, [{ type: 'use_current' }]);
      expect(outcome.state).toBe('selected_current');
      expect(outcome.bodyText).toBe(largest.currentBody.text);
      expect(outcome).toMatchSnapshot();
    });

    it('sends the largest body with a line added by hand', async () => {
      const outcome = await leaveWith(largestRequest, largest, [
        { type: 'edit_body', text: `${largest.currentBody.text}\n${APPENDED_LINE}` },
        { type: 'use_current' },
      ]);
      expect(outcome.bodyText).toContain(APPENDED_LINE);
      expect(outcome.bodyText).toContain(CONFIRMATION_FRAGMENT);
      expect(outcome).toMatchSnapshot();
    });

    it('sends the largest body without an ordinary section deleted by hand', async () => {
      const removed = firstOrdinarySection(largest);
      const outcome = await leaveWith(largestRequest, largest, [
        { type: 'edit_body', text: cutSection(largest, removed) },
        { type: 'use_current' },
      ]);
      expect(outcome.bodyText).not.toContain(`${removed}:`);
      expect(outcome.bodyText).toContain(CONFIRMATION_FRAGMENT);
      expect(outcome).toMatchSnapshot();
    });
  });
});
