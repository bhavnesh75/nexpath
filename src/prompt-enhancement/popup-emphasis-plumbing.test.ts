/**
 * Carrying the popup's bold phrases, and drawing nothing with them.
 *
 * The list travels from the pending row to the popup by two roads — in process, and across
 * the spawn into a window host — and this phase adds both without adding a single visible
 * pixel. So there are two things to prove. The popup behaves identically whether the list is
 * absent, empty, or full: same frames, same commands, same result. And the list survives the
 * spawn, in a payload that is still valid when it is written without one, because a parent
 * that predates the field must keep working against a child that has it.
 */
import { describe, expect, it, vi } from 'vitest';
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
import { runPromptEnhancementCliPopupHostLaunchV1 } from '../cli/prompt-enhancement-host.js';
import { runPromptEnhancementPopupHostCommandV1 } from '../cli/commands/prompt-enhancement-popup-host.js';
import { openStore } from '../store/db.js';
import type { PromptEnhancementEmphasisPhraseV1 } from '../store/pending-prompt-enhancements.js';

const SINGLE_INTENT = 'Add a retry with exponential backoff to the payment gateway client.';

/** A filled list, so "full" is genuinely different input from "empty" and "absent". */
const PHRASES: readonly PromptEnhancementEmphasisPhraseV1[] = [
  { text: 'add a retry with exponential backoff', emphasisClass: 1, source: 'floor' },
  { text: 'payment gateway client', emphasisClass: 2, source: 'floor' },
];

function request(text: string, id: string): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'emphasis-plumbing-source-a',
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
    requestId: id,
    projectRoot: '/tmp/emphasis-plumbing-project',
    hostSurface: 'cli_stop_bridge',
    sourcePrompt: { text, origin: 'user', capturedAt: 1, promptIndex: 1, generatedOriginPolicy: 'ordinary_source_a' },
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
    configSnapshot: { sequenceEnabledState: 'not_enabled_v1', validatedEffectiveConfigState: 'valid', arbitraryConfigRowsAreAuthority: false },
    callVisibilityState: buildPromptEnhancementCostVisibilityMetadataV1('baseline_pe_composer', { callVisibilityMode: 'deterministic', plannedCallCount: 0, usedCallCount: 0 }),
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

/** A spawned child that never exits on its own, exactly as the host's own tests build one. */
function fakeChild() {
  const value = {
    unref: vi.fn(),
    kill: vi.fn(() => true),
    once: vi.fn(() => value),
  };
  return value;
}

describe('the popup with phrases it does not draw', () => {
  const COMMANDS: readonly PromptEnhancementCliPopupCommandV1[] = [
    { type: 'edit_body', text: 'A body the user typed over the draft.' },
    { type: 'use_current' },
  ];

  it('behaves identically whether the list is absent, empty, or full', async () => {
    const baseRequest = request(SINGLE_INTENT, 'emphasis-inert-request');
    const prepared = await preparePromptEnhancement(baseRequest);

    const run = async (emphasisPhrases?: readonly PromptEnhancementEmphasisPhraseV1[]) => {
      const ui = interaction(COMMANDS);
      const result = await runPromptEnhancementCliSubmitPopupV1({
        request: baseRequest,
        result: prepared,
        interaction: ui,
        ...(emphasisPhrases ? { emphasisPhrases } : {}),
      });
      return { result, views: ui.views };
    };

    const absent = await run();
    const empty = await run([]);
    const full = await run(PHRASES);

    // Every frame the popup offered, and the outcome it reached, byte for byte the same.
    expect(empty.views).toEqual(absent.views);
    expect(full.views).toEqual(absent.views);
    expect(empty.result).toEqual(absent.result);
    expect(full.result).toEqual(absent.result);
    // The run is a real one, not an empty no-show that would pass this vacuously.
    expect(absent.result.state).toBe('selected_current');
    expect(absent.views.length).toBeGreaterThan(0);
  });
});

describe('the phrases across the spawn', () => {
  /** Run the parent launcher and hand back the payload it actually wrote for the child. */
  async function payloadWrittenByParent(
    emphasisPhrases?: readonly PromptEnhancementEmphasisPhraseV1[],
  ): Promise<string> {
    const baseRequest = request(SINGLE_INTENT, 'emphasis-payload-request');
    const prepared = await preparePromptEnhancement(baseRequest);
    let written = '';
    const launch = await runPromptEnhancementCliPopupHostLaunchV1(
      {
        capability: { state: 'available', method: 'linux_terminal', terminalCommand: 'gnome-terminal' },
        request: baseRequest,
        result: prepared,
        cliEntryPath: '/opt/nexpath/dist/cli/index.js',
        dbPath: '/tmp/emphasis-plumbing.db',
        nodePath: '/usr/bin/node',
        ...(emphasisPhrases ? { emphasisPhrases } : {}),
      },
      {
        writeInputFile: (_path, input) => { written = JSON.stringify(input); },
        spawnTerminal: async () => fakeChild(),
        readResultFile: () => ({ protocolVersion: 1, result: { state: 'closed_no_send' } }),
        readReadyFile: () => true,
        detectPopupGeometry: async () => undefined,
      },
    );
    expect(launch.state).toBe('completed');
    return written;
  }

  /** Feed a payload to the real child command and report what reached the popup runner. */
  async function phrasesSeenByChild(payload: string): Promise<{
    ran: boolean;
    emphasisPhrases?: readonly PromptEnhancementEmphasisPhraseV1[];
  }> {
    let ran = false;
    let seen: readonly PromptEnhancementEmphasisPhraseV1[] | undefined;
    await runPromptEnhancementPopupHostCommandV1(
      { inputFile: '/tmp/unused-input.json', resultFile: '/tmp/unused-result.json' },
      {
        readInputFile: () => payload,
        writeResultAtomically: () => {},
        openStore: async () => openStore(':memory:'),
        closeStore: () => {},
        runPopup: async (input) => {
          ran = true;
          seen = input.emphasisPhrases;
          return { state: 'closed_no_send' };
        },
      },
    );
    return { ran, ...(seen ? { emphasisPhrases: seen } : {}) };
  }

  it('round-trips the list: what the parent writes is what the child hands to the popup', async () => {
    const payload = await payloadWrittenByParent(PHRASES);
    expect(JSON.parse(payload)).toMatchObject({ protocolVersion: 1, emphasisPhrases: PHRASES });

    const child = await phrasesSeenByChild(payload);
    expect(child.ran).toBe(true);
    expect(child.emphasisPhrases).toEqual(PHRASES);
  });

  it('writes no field at all when the caller has no phrases', async () => {
    const payload = await payloadWrittenByParent();
    expect(Object.keys(JSON.parse(payload))).toEqual(['protocolVersion', 'request', 'result']);

    const child = await phrasesSeenByChild(payload);
    expect(child.ran).toBe(true);
    expect(child.emphasisPhrases).toBeUndefined();
  });

  it('accepts a payload written without the field — an older parent, a newer child', async () => {
    // Exactly the three keys a parent that predates this phase would write.
    const parsed = JSON.parse(await payloadWrittenByParent(PHRASES)) as Record<string, unknown>;
    const older = JSON.stringify({
      protocolVersion: parsed.protocolVersion,
      request: parsed.request,
      result: parsed.result,
    });

    const child = await phrasesSeenByChild(older);
    // Still valid, still shown — the protocol version did not have to move for this.
    expect(child.ran).toBe(true);
    expect(child.emphasisPhrases).toBeUndefined();
  });

  it('holds the payload to the same shape the store does, and drops what fails it', async () => {
    // The parent only ever sends what the store already parsed, so these cannot arise in the live
    // flow — the point is that the two roads agree on what a phrase list is, rather than one road
    // forwarding something the other would have refused.
    const parsed = JSON.parse(await payloadWrittenByParent()) as Record<string, unknown>;
    const refused: readonly unknown[] = [
      'not an array',
      {},
      [{}],
      [{ text: 1 }],
      [1, 2, 3],
      [null],
    ];

    for (const value of refused) {
      const child = await phrasesSeenByChild(JSON.stringify({ ...parsed, emphasisPhrases: value }));
      // Dropped, never refused: the popup still opens, exactly as it does for a corrupt column.
      expect(child.ran, JSON.stringify(value)).toBe(true);
      expect(child.emphasisPhrases, JSON.stringify(value)).toBeUndefined();
    }

    // And a well-formed list still arrives whole.
    const good = await phrasesSeenByChild(JSON.stringify({ ...parsed, emphasisPhrases: PHRASES }));
    expect(good.emphasisPhrases).toEqual(PHRASES);
  });
});
