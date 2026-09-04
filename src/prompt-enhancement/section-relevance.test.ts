import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../store/db.js';
import { upsertProject } from '../store/index.js';
import { SessionStateManager } from '../classifier/SessionStateManager.js';
import { buildPromptEnhancementRequestForAuto } from '../cli/commands/auto.js';
import {
  promptEnhancementRelevanceSectionKindsV1,
  promptEnhancementRelevanceMenuLinesV1,
  normalizePromptEnhancementRelevanceOrderV1,
} from './section-relevance.js';
import { PROMPT_ENHANCEMENT_PLANNABLE_SECTION_KINDS_V1 } from './templates/section-plan.js';
import {
  parseStageClassifierReply,
  classifyStage,
  STAGE_CLASSIFIER_SYSTEM_PROMPT,
} from '../classifier/stage-classifier.js';

/**
 * I1 (§15.2) — the relevance observation rides the C1 section.
 *
 * ⛔ What this phase is NOT: a pruner. §15.2 step 3 is *"model observes, registry decides"*, and the
 * deciding happens in I2 under the locked drop-criteria — where EVIDENCE is tested before relevance
 * is consulted at all. These fixtures therefore pin the observation's shape and its refusal to
 * decide, and nothing about what survives.
 */

describe('the vocabulary offered to the model', () => {
  it('is DERIVED from the planner, not a second list beside it', () => {
    // A hand-kept copy would drift the first time a section kind is added, and the model would be
    // ranking a menu the planner no longer produces — prohibition 15, one map one meaning.
    expect(promptEnhancementRelevanceSectionKindsV1())
      .toEqual(PROMPT_ENHANCEMENT_PLANNABLE_SECTION_KINDS_V1);
  });

  it('every kind reaches the prompt with a purpose a model can rank on', () => {
    const lines = promptEnhancementRelevanceMenuLinesV1();
    expect(lines).toHaveLength(promptEnhancementRelevanceSectionKindsV1().length);
    // An id with no purpose text still ships (the id alone is honest), but none should be missing
    // today — a new kind arriving without one is worth noticing here rather than in a body.
    const withoutPurpose = lines.filter((line) => !line.includes(' — '));
    expect(withoutPurpose, 'a section kind is offered with no explanation of what it is for').toEqual([]);
  });
});

describe('normalising what comes back', () => {
  it('keeps the ORDER, which is the entire content of the observation', () => {
    expect(normalizePromptEnhancementRelevanceOrderV1([
      'verification_or_test_plan', 'project_grounding_facts', 'context_and_constraints',
    ])).toEqual(['verification_or_test_plan', 'project_grounding_facts', 'context_and_constraints']);
  });

  it('drops an invented kind instead of trusting it', () => {
    expect(normalizePromptEnhancementRelevanceOrderV1(['made_up_kind', 'verification_or_test_plan']))
      .toEqual(['verification_or_test_plan']);
  });

  it('drops a repeat but keeps the ranking — a formatting slip is not a reason to lose the reply', () => {
    expect(normalizePromptEnhancementRelevanceOrderV1([
      'context_and_constraints', 'verification_or_test_plan', 'context_and_constraints',
    ])).toEqual(['context_and_constraints', 'verification_or_test_plan']);
  });

  it('a missing or malformed field is an EMPTY ordering, never a thrown reply', () => {
    // Soft parsing, like every other observation on this call: an old or partial reply must still
    // classify. I2 treats an empty ordering as "no relevance signal", not as "rank everything last".
    for (const raw of [undefined, null, 'not-an-array', 42, {}]) {
      expect(normalizePromptEnhancementRelevanceOrderV1(raw)).toEqual([]);
    }
  });
});

describe('the observation rides the C1 section and decides nothing', () => {
  const classifierSource = (): string => readFileSync('src/classifier/stage-classifier.ts', 'utf8');

  it('the block is IN the assembled system prompt, not merely defined beside it', () => {
    // ⚠️ Asserted on the ASSEMBLED prompt, because the first version read the source file and a
    // mutation proved it worthless: removing the block from the prompt array left every assertion
    // green — the text still existed in the file, just no longer in anything sent to a model.
    // Declared-but-inert is the exact failure this milestone keeps finding.
    expect(STAGE_CLASSIFIER_SYSTEM_PROMPT).toContain('SECTION RELEVANCE OBSERVATION');
    expect(
      STAGE_CLASSIFIER_SYSTEM_PROMPT.includes('This is an ORDERING, not a selection'),
      'the model is not told to rank rather than choose',
    ).toBe(true);
    expect(
      STAGE_CLASSIFIER_SYSTEM_PROMPT.includes('that decision is not yours'),
      'nothing tells the model it is not the one choosing — prohibition 4 lives in this sentence',
    ).toBe(true);
  });

  it('and every kind in the vocabulary is actually offered in that prompt', () => {
    for (const kind of promptEnhancementRelevanceSectionKindsV1()) {
      expect(STAGE_CLASSIFIER_SYSTEM_PROMPT, `${kind} is rankable but never shown to the model`)
        .toContain(kind);
    }
  });

  it('no new call was added — it rides the parked one', () => {
    // §47.1: the decider rides the SAME parked classifier call. One create() call in this module,
    // and that is the whole of prohibition 3 at this seam.
    const calls = classifierSource().split('chat.completions.create(').length - 1;
    expect(calls, 'a second model call appeared in the classifier').toBe(1);
  });

  it('the reply parses the ordering, and an absent one degrades quietly', () => {
    const withOrder = parseStageClassifierReply(JSON.stringify({
      stage: 'Implementation', stage_confidence: 0.9, signals_present: [], signals_absent: [],
      fire_decision_session: false, selected_signal_key: '', reason: 'x',
      section_relevance_order: ['verification_or_test_plan', 'nope', 'context_and_constraints'],
    }));
    expect(withOrder.sectionRelevanceOrder).toEqual(['verification_or_test_plan', 'context_and_constraints']);

    const without = parseStageClassifierReply(JSON.stringify({
      stage: 'Implementation', stage_confidence: 0.9, signals_present: [], signals_absent: [],
      fire_decision_session: false, selected_signal_key: '', reason: 'x',
    }));
    expect(without.sectionRelevanceOrder, 'an old reply stopped classifying').toEqual([]);
  });
});

describe('the observation reaches the request, which is the whole point of collecting it', () => {
  // ⛔ Verification round 1 found this unpinned. The ordering was carried on the request and a
  // throwaway probe confirmed it — but NO fixture asserted it, so deleting the line from the
  // boundary would have left every test green while I2's pruner silently received nothing and fell
  // back to evidence-only pruning. An observation that never arrives is indistinguishable from a
  // model that returned none.
  it('survives the WHOLE classifier path — parse, then result', async () => {
    // ⛔ A second mutation found the hop between them unpinned: the parser test proves the reply is
    // read, the carry test starts from a hand-built result — so the wrapper that turns one into the
    // other could drop the field and both stayed green. This drives the public entry point end to
    // end, which is the only assertion that covers that hop.
    const reply = JSON.stringify({
      stage: 'Implementation', stage_confidence: 0.9, signals_present: [], signals_absent: [],
      fire_decision_session: false, selected_signal_key: '', reason: 'r',
      section_relevance_order: ['project_grounding_facts', 'verification_or_test_plan'],
    });
    const client = {
      chat: { completions: { create: async () => ({ choices: [{ message: { content: reply } }] }) } },
    } as never;
    const out = await classifyStage(
      { promptText: 'add the retry flow', window: [{ text: 'add the retry flow' }],
        sessionStage: 'implementation', sessionConfidence: 0.5, profile: null } as never,
      client,
    );
    expect(
      out.sectionRelevanceOrder,
      'the ordering was parsed but never made it onto the classifier result',
    ).toEqual(['project_grounding_facts', 'verification_or_test_plan']);
  });

  it('a classified ordering lands on the request the engine reads', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'i1-carry-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
    const store = await openStore(join(dir, 'store.db'));
    upsertProject(store, {
      projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now(),
    });

    const request = buildPromptEnhancementRequestForAuto({
      auto: { promptText: 'add the retry flow', projectRoot: dir, currentAgentMode: 'default' },
      store, session: SessionStateManager.load(store, dir), project: null,
      effectiveLanguage: 'en', configuredRole: null, effectiveFlagType: 'stage_transition',
      firedKey: 'stage_transition:idea', previousStage: 'idea', trigger: { kind: 'stage_transition' },
      stageResult: {
        classification: { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} },
        signalsPresent: [], signalsAbsent: [], fireRecommendation: true, selectedSignalKey: '',
        reason: 'i1-carry', degraded: false, projectFactCandidates: [],
        sectionRelevanceOrder: ['verification_or_test_plan', 'context_and_constraints'],
      },
      streamBOutputs: [],
    } as never) as never as { reviewMomentContext: { triggerProvenance: Record<string, unknown> } };

    expect(
      request.reviewMomentContext.triggerProvenance['classifierSectionRelevanceOrder'],
      'the ordering never reached the request — I2 would prune with no relevance signal and say nothing',
    ).toEqual(['verification_or_test_plan', 'context_and_constraints']);
  });
});

describe('PE-EM-1 stays honest as the prompt grows', () => {
  // ⛔ NOT a budget and NOT a cap — it changes no spend and gates no call. It is a DRIFT ALARM on a
  // documented number: §11.2 banner (c) and prohibition 10 make every field addition PE-EM-1-visible,
  // and the way that obligation actually gets missed is a prompt growing block by block while the
  // recorded figure stays where someone left it. The threshold sits well above today's measurement
  // so ordinary edits pass; crossing it means the row needs re-reading, not that anything is wrong.
  it('the system prompt is still the size PE-EM-1 was measured against', () => {
    const chars = STAGE_CLASSIFIER_SYSTEM_PROMPT.length;
    expect(
      chars,
      `the classifier system prompt is now ${chars} chars (~${Math.round(chars / 4)} tokens). It was `
      + 'measured at 14,405 (~3,600) when the PE-EM-1 row was last checked — re-measure the row in '
      + 'cost-observability.ts and update its recorded numbers before raising this bound.',
    ).toBeLessThan(20_000);
  });
});
