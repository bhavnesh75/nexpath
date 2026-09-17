/**
 * The bold-phrase column on the pending prompt-enhancement row.
 *
 * The column is additive and nullable, so three things have to hold and are checked here
 * rather than assumed: a database that never had the column gains it and keeps its row; a
 * value that is missing, empty or corrupt costs the bold and never the popup; and the
 * SELECT's column order still matches the positions the row is read at, because the read is
 * positional and a reordering would silently re-map every field.
 *
 * Nothing in this phase produces phrases, so the column is written NULL on every ordinary
 * prepare — that, too, is asserted.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { openStore, type Store } from './db.js';
import { applyIncrementalMigrations } from './schema.js';
import {
  getPendingPromptEnhancement,
  upsertPendingPromptEnhancement,
  type PromptEnhancementEmphasisPhraseV1,
} from './pending-prompt-enhancements.js';
import { preparePromptEnhancement } from '../prompt-enhancement/facade.js';
import { getPromptStartStopSourceSnapshot } from '../prompt-enhancement/source-reality.js';
import { buildPromptEnhancementCostVisibilityMetadataV1 } from '../prompt-enhancement/cost-observability.js';
import {
  PROMPT_ENHANCEMENT_CONTRACT_VERSION,
  type PromptEnhancementPrepareRequestV1,
  type PromptEnhancementPrepareResultV1,
  type PromptEnhancementSourceRefV1,
} from '../prompt-enhancement/contracts.js';

const PROMPT_TEXT = 'Add a retry with exponential backoff to the payment gateway client.';

/** Two well-formed phrases, one of each kind the popup will eventually draw differently. */
const samplePhrases: readonly PromptEnhancementEmphasisPhraseV1[] = [
  { text: 'add a retry with exponential backoff', emphasisClass: 1, source: 'floor' },
  { text: 'payment gateway client', emphasisClass: 2, source: 'floor' },
];

function request(projectRoot: string): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'emphasis-column-source-a',
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
    requestId: `emphasis-request-${projectRoot}`,
    projectRoot,
    hostSurface: 'cli_stop_bridge',
    sourcePrompt: { text: PROMPT_TEXT, origin: 'user', capturedAt: 1, promptIndex: 1, generatedOriginPolicy: 'ordinary_source_a' },
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

async function validPayload(projectRoot: string): Promise<{
  request: PromptEnhancementPrepareRequestV1;
  result: PromptEnhancementPrepareResultV1;
}> {
  const prepared = request(projectRoot);
  return { request: prepared, result: await preparePromptEnhancement(prepared) };
}

/** The raw stored cell, so NULL and '[]' can be told apart at the column itself. */
function rawColumn(store: Store, projectRoot: string): unknown {
  const rows = store.db.exec(
    'SELECT emphasis_phrases_json FROM pending_prompt_enhancements WHERE project_root = ?',
    [projectRoot],
  );
  return rows[0]?.values[0]?.[0];
}

describe('the pending row and its bold-phrase column', () => {
  let store: Store;
  beforeEach(async () => { store = await openStore(':memory:'); });

  it('exists on a fresh database, straight out of openStore', () => {
    const columns = (store.db.exec('PRAGMA table_info(pending_prompt_enhancements)')[0]?.values ?? [])
      .map((row) => row[1] as string);
    expect(columns).toContain('emphasis_phrases_json');
  });

  it('round-trips a phrase list through upsert → get, unchanged', async () => {
    const root = '/test/emphasis-roundtrip';
    const { request, result } = await validPayload(root);
    upsertPendingPromptEnhancement(store, {
      projectRoot: root, sessionId: 's', promptCount: 1, request, result,
      emphasisPhrases: samplePhrases,
    });

    const loaded = getPendingPromptEnhancement(store, root);
    expect(loaded).not.toBeNull();
    expect(loaded!.emphasisPhrases).toEqual(samplePhrases);
    // The rest of the row is untouched by the new field.
    expect(loaded!.request).toEqual(request);
    expect(loaded!.result).toEqual(result);
  });

  it('writes NULL when no phrases are given — which is not the same as an empty list', async () => {
    const absent = '/test/emphasis-absent';
    const empty = '/test/emphasis-empty';
    const absentPayload = await validPayload(absent);
    const emptyPayload = await validPayload(empty);

    upsertPendingPromptEnhancement(store, { projectRoot: absent, sessionId: 's', promptCount: 1, ...absentPayload });
    upsertPendingPromptEnhancement(store, { projectRoot: empty, sessionId: 's', promptCount: 1, ...emptyPayload, emphasisPhrases: [] });

    // Nothing computed: the column is NULL and the field is absent.
    expect(rawColumn(store, absent)).toBeNull();
    expect(getPendingPromptEnhancement(store, absent)!.emphasisPhrases).toBeUndefined();
    // Computed and empty: the column holds '[]' and the field is present, and empty.
    expect(rawColumn(store, empty)).toBe('[]');
    expect(getPendingPromptEnhancement(store, empty)!.emphasisPhrases).toEqual([]);
  });

  it('stores NULL on an ordinary prepare — nothing produces phrases yet', async () => {
    const root = '/test/emphasis-no-producer';
    const { request, result } = await validPayload(root);
    upsertPendingPromptEnhancement(store, { projectRoot: root, sessionId: 's', promptCount: 1, request, result });
    expect(rawColumn(store, root)).toBeNull();
  });

  it('adds the column to a database written without it, keeping the row and reading it back', async () => {
    const root = '/test/emphasis-migration';
    const { request, result } = await validPayload(root);
    upsertPendingPromptEnhancement(store, { projectRoot: root, sessionId: 's', promptCount: 4, request, result });

    // Simulate a database written by a build that predates the column: rebuild the table from the
    // columns that existed then, which drops the new one and keeps every row.
    store.db.run(`
      CREATE TABLE pending_prompt_enhancements_old AS
        SELECT id, project_root, session_id, prompt_count, status, created_at,
               request_json, result_json, planner_items_json, planner_prompt_directives_json
        FROM pending_prompt_enhancements;
      DROP TABLE pending_prompt_enhancements;
      ALTER TABLE pending_prompt_enhancements_old RENAME TO pending_prompt_enhancements;
    `);
    const before = (store.db.exec('PRAGMA table_info(pending_prompt_enhancements)')[0]?.values ?? [])
      .map((row) => row[1] as string);
    expect(before).not.toContain('emphasis_phrases_json');

    applyIncrementalMigrations(store.db);

    const after = (store.db.exec('PRAGMA table_info(pending_prompt_enhancements)')[0]?.values ?? [])
      .map((row) => row[1] as string);
    expect(after).toContain('emphasis_phrases_json');
    // The pre-migration row survives whole, and reads back with no phrases.
    const loaded = getPendingPromptEnhancement(store, root);
    expect(loaded).not.toBeNull();
    expect(loaded!.promptCount).toBe(4);
    expect(loaded!.request).toEqual(request);
    expect(loaded!.result).toEqual(result);
    expect(loaded!.emphasisPhrases).toBeUndefined();
    expect(rawColumn(store, root)).toBeNull();
  });

  it('fails OPEN on every corrupt shape — the phrases drop, the popup never does', async () => {
    const shapes: readonly { label: string; sql: string }[] = [
      { label: 'NULL', sql: 'NULL' },
      { label: 'not JSON at all', sql: "'not json'" },
      { label: 'a JSON object, not an array', sql: "'{}'" },
      { label: 'an array of entries with no text', sql: "'[{}]'" },
      { label: 'an array whose text is not a string', sql: '\'[{"text":1}]\'' },
      { label: 'an array of bare numbers', sql: "'[1,2,3]'" },
    ];

    for (const shape of shapes) {
      const root = `/test/emphasis-corrupt-${shapes.indexOf(shape)}`;
      const { request, result } = await validPayload(root);
      upsertPendingPromptEnhancement(store, {
        projectRoot: root, sessionId: 's', promptCount: 1, request, result,
        emphasisPhrases: samplePhrases,
      });
      store.db.run(
        `UPDATE pending_prompt_enhancements SET emphasis_phrases_json = ${shape.sql} WHERE project_root = ?`,
        [root],
      );

      const loaded = getPendingPromptEnhancement(store, root);
      // The whole point: unlike a corrupt request/result, this never returns null.
      expect(loaded, shape.label).not.toBeNull();
      expect(loaded!.request, shape.label).toEqual(request);
      expect(loaded!.result, shape.label).toEqual(result);
      expect(loaded!.emphasisPhrases, shape.label).toBeUndefined();
    }
  });

  it('keeps the SELECT column order in step with the positions the row is read at', () => {
    // The row is read positionally, so the SELECT list and the row[N] reads are one contract.
    // Pin both: a column inserted anywhere but the end fails here instead of re-mapping fields.
    const source = readFileSync(fileURLToPath(new URL('./pending-prompt-enhancements.ts', import.meta.url)), 'utf8');
    const select = /SELECT ([^\r\n]+)\r?\n\s*FROM pending_prompt_enhancements/.exec(source);
    expect(select).not.toBeNull();
    expect(select![1]!.split(',').map((column) => column.trim())).toEqual([
      'id',                             // row[0]
      'project_root',                   // row[1]
      'session_id',                     // row[2]
      'prompt_count',                   // row[3]
      'status',                         // row[4]
      'created_at',                     // row[5]
      'request_json',                   // row[6]
      'result_json',                    // row[7]
      'planner_items_json',             // row[8]
      'planner_prompt_directives_json', // row[9]
      'emphasis_phrases_json',          // row[10]
    ]);
    expect(source).toContain('parseEmphasisPhrases(row[10])');
  });

  it('carries the phrases in both additive migration lists, so the CLI migration adds it too', () => {
    const schema = readFileSync(fileURLToPath(new URL('./schema.ts', import.meta.url)), 'utf8');
    const occurrences = schema.split("addIfMissing('pending_prompt_enhancements', 'emphasis_phrases_json', 'TEXT');").length - 1;
    // One in the silent startup pass, one in the console-output twin the CLI runs.
    expect(occurrences).toBe(2);
  });
});
