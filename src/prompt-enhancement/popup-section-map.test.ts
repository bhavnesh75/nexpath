/**
 * The section map of the submit popup's body.
 *
 * The real bodies come from prepared results, so a changed composer or pruner fails
 * here rather than silently reshaping what the map is asked to find. The synthetic
 * bodies cover the edges the map is defined by: a title edited away, prose that ends
 * in a colon, a heading-shaped line inside the user's own prompt or inside a draft,
 * an edited body, duplicated titles, and ten sections.
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
  PROMPT_ENHANCEMENT_APPLIED_DETAILS_TITLE_V1,
  buildPromptEnhancementSectionMapV1,
  type PromptEnhancementSectionMapInputV1,
} from './popup-section-map.js';

/**
 * The mocked composer drafts a sentence that is itself heading-shaped, so the
 * heading-in-draft case runs on a real wording-path body rather than a synthetic one.
 */
const DRAFT_WITH_HEADING_LINE = vi.hoisted(() => 'Keep the retry helper as it is.\nBest practices and standards:');

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
          outputId: 'llm-out-section-map',
          sectionDrafts: plans.map((plan) => ({
            sectionId: plan.sectionId,
            bodyText: DRAFT_WITH_HEADING_LINE,
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
/** A prompt that carries a later section's heading as one of its own lines. */
const PROMPT_WITH_HEADING_LINE = `${SMALL_PROMPT}\nBest practices and standards:\nKeep it small.`;

function request(text: string): PromptEnhancementPrepareRequestV1 {
  const sourceRef: PromptEnhancementSourceRefV1 = {
    sourceRefId: 'section-map-source-a',
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
    requestId: 'section-map-request',
    projectRoot: '/tmp/section-map-project',
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

function sectionsOf(result: PromptEnhancementPrepareResultV1): PromptEnhancementSectionMapInputV1[] {
  return result.currentBody.sections.map((section) => ({ title: section.title, bodyText: section.bodyText }));
}

/** A synthetic body: each section as `Title:` then its body, joined by one blank line. */
function compose(sections: readonly PromptEnhancementSectionMapInputV1[]): string {
  return sections.map((section) => `${section.title}:\n${section.bodyText}`).join('\n\n');
}

const SYNTHETIC: PromptEnhancementSectionMapInputV1[] = [
  { title: 'My original request (verbatim)', bodyText: 'Add a retry to the client.' },
  { title: 'Context and constraints', bodyText: '- Keep the timeout unchanged.' },
  { title: 'Best practices and standards', bodyText: '- Cover it with a test.' },
];

/** Asserts the ranges cover every line once, in order, from the first title to the end. */
function expectRangesTile(text: string, sections: readonly PromptEnhancementSectionMapInputV1[]): void {
  const map = buildPromptEnhancementSectionMapV1(text, sections);
  expect(map.entries.map((entry) => entry.number)).toEqual(map.entries.map((_, index) => index + 1));
  for (let index = 0; index < map.entries.length; index++) {
    const entry = map.entries[index]!;
    const next = map.entries[index + 1];
    expect(entry.endLine).toBe(next ? next.titleLine : map.lineCount);
    expect(entry.titleLine).toBeLessThan(entry.endLine);
  }
}

describe('the section map on real bodies', () => {
  const savedKey = process.env['OPENAI_API_KEY'];
  afterEach(() => {
    if (savedKey === undefined) delete process.env['OPENAI_API_KEY'];
    else process.env['OPENAI_API_KEY'] = savedKey;
  });

  describe('without a key', () => {
    let small: PromptEnhancementPrepareResultV1;
    let confirmation: PromptEnhancementPrepareResultV1;
    beforeEach(async () => {
      delete process.env['OPENAI_API_KEY'];
      small = await preparePromptEnhancement(request(SMALL_PROMPT));
      confirmation = await preparePromptEnhancement(request(CONFIRMATION_PROMPT));
    });

    it('finds every title, numbers them 1 … M, and its ranges tile the body', () => {
      for (const result of [small, confirmation]) {
        const sections = sectionsOf(result);
        const map = buildPromptEnhancementSectionMapV1(result.currentBody.text, sections);
        expect(map.entries).toHaveLength(sections.length);
        expect(map.entries.map((entry) => entry.title)).toEqual(sections.map((section) => section.title));
        expect(map.entries.map((entry) => entry.source)).toEqual(sections.map((_, index) => index));
        expectRangesTile(result.currentBody.text, sections);
      }
    });

    it('numbers the applied-details block last, and one apply after another keeps one number', () => {
      const sections = sectionsOf(small);
      const once = `${small.currentBody.text}\n\n${PROMPT_ENHANCEMENT_APPLIED_DETAILS_TITLE_V1}:\nKeep the retry count at five.`;
      const twice = `${once}\nAnd log each attempt.`;
      for (const text of [once, twice]) {
        const map = buildPromptEnhancementSectionMapV1(text, sections);
        expect(map.entries).toHaveLength(sections.length + 1);
        const last = map.entries[map.entries.length - 1]!;
        expect(last.source).toBe('details');
        expect(last.number).toBe(sections.length + 1);
        expect(last.endLine).toBe(map.lineCount);
        expect(map.entries.filter((entry) => entry.source === 'details')).toHaveLength(1);
      }
    });

    it('skips a heading-shaped line inside the user prompt while the verbatim block is unchanged', async () => {
      const result = await preparePromptEnhancement(request(PROMPT_WITH_HEADING_LINE));
      const sections = sectionsOf(result);
      // Premise: the prompt's own line really is a later section's title, and it comes first.
      const verbatim = sections[0]!;
      expect(verbatim.bodyText).toContain('Best practices and standards:');
      const laterIndex = sections.findIndex((section) => section.title === 'Best practices and standards');
      expect(laterIndex).toBeGreaterThan(0);

      const map = buildPromptEnhancementSectionMapV1(result.currentBody.text, sections);
      const later = map.entries.find((entry) => entry.source === laterIndex)!;
      const verbatimEntry = map.entries.find((entry) => entry.source === 0)!;
      // The later title is found AFTER the verbatim block, not on the prompt's own line.
      expect(later.titleLine).toBeGreaterThan(verbatimEntry.endLine - 1);
      expect(result.currentBody.text.split('\n')[later.titleLine]).toBe('Best practices and standards:');
      expect(map.entries).toHaveLength(sections.length);
    });
  });

  describe('with a key, drafts that carry a heading-shaped line', () => {
    let medium: PromptEnhancementPrepareResultV1;
    beforeEach(async () => {
      process.env['OPENAI_API_KEY'] = `sk-${'a'.repeat(24)}`;
      medium = await preparePromptEnhancement(request(SMALL_PROMPT));
    });

    it('premise: a draft cannot carry a heading as its own line — the composer keeps every draft to one line', () => {
      const drafted = medium.currentBody.sections.filter((section) => section.sectionKind !== 'original_request_or_goal');
      expect(drafted.length).toBeGreaterThan(1);
      // The mock wrote the heading on a line of its own, and the composer normalised the
      // draft's whitespace before rendering it — so the text survives only as a substring
      // of a single line, never as a line that could match a title. This is what makes the
      // heading-in-draft edge unreachable on a real body; the synthetic case below is its test.
      const body = drafted[0]!.bodyText;
      expect(body).toContain('Best practices and standards:');
      expect(body.split('\n')).toHaveLength(1);
    });

    it('skips the heading inside a draft while that body is unchanged, so every section keeps its own number', () => {
      const sections = sectionsOf(medium);
      const map = buildPromptEnhancementSectionMapV1(medium.currentBody.text, sections);
      expect(map.entries).toHaveLength(sections.length);
      expect(map.entries.map((entry) => entry.source)).toEqual(sections.map((_, index) => index));
      expectRangesTile(medium.currentBody.text, sections);
    });

    it('once a body is edited the plain search runs there — the documented edge', () => {
      // On the real body every draft carries the heading, and the map searches titles in
      // order — so the sections between are found first and carry the search past the
      // decoy. The edge needs the decoy in the section immediately before the later title.
      const sections: PromptEnhancementSectionMapInputV1[] = [
        { title: 'My original request (verbatim)', bodyText: 'Add a retry to the client.' },
        { title: 'Context and constraints', bodyText: 'Keep it small.\nBest practices and standards:' },
        { title: 'Best practices and standards', bodyText: '- Cover it with a test.' },
      ];
      const text = compose(sections);
      const unchanged = buildPromptEnhancementSectionMapV1(text, sections);
      const realTitle = text.split('\n').lastIndexOf('Best practices and standards:');
      expect(unchanged.entries[2]!.titleLine).toBe(realTitle);

      // Edit inside the second body: its skip no longer applies, so the decoy line — the
      // first match after that title — takes the third section's number.
      const lines = text.split('\n');
      lines[unchanged.entries[1]!.titleLine + 1] += ' (edited)';
      const edited = buildPromptEnhancementSectionMapV1(lines.join('\n'), sections);
      const decoy = unchanged.entries[1]!.titleLine + 2;
      expect(edited.entries[2]!.titleLine).toBe(decoy);
      expect(edited.entries[2]!.titleLine).toBeLessThan(realTitle);
    });
  });
});

describe('the section map on synthetic bodies', () => {
  it('a title edited away gets no number; the rest stay contiguous and its lines join the previous range', () => {
    const lines = compose(SYNTHETIC).split('\n');
    const gone = lines.indexOf('Context and constraints:');
    lines[gone] = 'Context and constraints';
    const map = buildPromptEnhancementSectionMapV1(lines.join('\n'), SYNTHETIC);
    expect(map.entries.map((entry) => entry.source)).toEqual([0, 2]);
    expect(map.entries.map((entry) => entry.number)).toEqual([1, 2]);
    const first = map.entries[0]!;
    const third = map.entries[1]!;
    expect(first.endLine).toBe(third.titleLine);
    expect(gone).toBeGreaterThan(first.titleLine);
    expect(gone).toBeLessThan(first.endLine);
  });

  it('prose ending in a colon is never a title', () => {
    const text = `${compose(SYNTHETIC)}\nNotes:\n- none`;
    const map = buildPromptEnhancementSectionMapV1(text, SYNTHETIC);
    expect(map.entries).toHaveLength(3);
    expect(map.entries.some((entry) => entry.title === 'Notes')).toBe(false);
  });

  it('a title with trailing spaces typed after it is still found', () => {
    const text = compose(SYNTHETIC).replace('Context and constraints:', 'Context and constraints:   ');
    const map = buildPromptEnhancementSectionMapV1(text, SYNTHETIC);
    expect(map.entries.map((entry) => entry.source)).toEqual([0, 1, 2]);
  });

  it('duplicated titles are matched in order', () => {
    const sections: PromptEnhancementSectionMapInputV1[] = [
      { title: 'Context and constraints', bodyText: 'first' },
      { title: 'Context and constraints', bodyText: 'second' },
    ];
    const map = buildPromptEnhancementSectionMapV1(compose(sections), sections);
    expect(map.entries.map((entry) => entry.source)).toEqual([0, 1]);
    expect(map.entries[0]!.titleLine).toBeLessThan(map.entries[1]!.titleLine);
  });

  it('ten sections are numbered 1 … 10', () => {
    const sections = Array.from({ length: 10 }, (_, index) => ({ title: `Section ${index + 1}`, bodyText: `body ${index + 1}` }));
    const map = buildPromptEnhancementSectionMapV1(compose(sections), sections);
    expect(map.entries.map((entry) => entry.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('no sections means no numbers, and an empty text has one line', () => {
    expect(buildPromptEnhancementSectionMapV1(compose(SYNTHETIC), []).entries).toEqual([]);
    const empty = buildPromptEnhancementSectionMapV1('', SYNTHETIC);
    expect(empty.entries).toEqual([]);
    expect(empty.lineCount).toBe(1);
  });
});
