import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../store/db.js';
import { upsertProject, setProjectEnvFacts } from '../store/index.js';
import { insertPrompt } from '../store/prompts.js';
import { probeProject } from '../env/env-probe.js';
import { SessionStateManager } from '../classifier/SessionStateManager.js';
import { buildPromptEnhancementRequestForAuto } from '../cli/commands/auto.js';
import { preparePromptEnhancement } from './facade.js';

/**
 * The recent-history sensitive-action lane is WIRED.
 *
 * ⛔ This file exists because the unit tests cannot prove it. `prompt-history-signals.test.ts` was
 * fully green while nothing imported the module at all — exactly the failure that let a whole
 * analysis layer sit unreachable inside a switched-off engine for months. Only a run through the
 * real boundary shows the signal becoming a section a developer would actually see.
 *
 * 🔑 The pair is the point: identical set-up, and the ONLY difference is whether the recent prompts
 * mention a sensitive action. A single positive case would pass for any reason that adds a safety
 * section, including reasons that have nothing to do with this lane.
 */
async function prepareWithHistory(recentPrompts: readonly string[], label: string): Promise<readonly string[]> {
  const dir = mkdtempSync(join(tmpdir(), `history-signals-${label}-`));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', devDependencies: { vitest: '1.0.0' } }));
  const store = await openStore(join(dir, 'store.db'));
  upsertProject(store, {
    projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now(),
  });
  setProjectEnvFacts(store, dir, probeProject(dir, Date.now()).facts, Date.now());
  for (const promptText of recentPrompts) insertPrompt(store, { projectRoot: dir, promptText });

  const request = buildPromptEnhancementRequestForAuto({
    auto: { promptText: 'add retry to the payment flow and make sure it is covered', projectRoot: dir, currentAgentMode: 'default' },
    store, session: SessionStateManager.load(store, dir), project: null,
    effectiveLanguage: 'en', configuredRole: null, effectiveFlagType: 'stage_transition',
    firedKey: 'stage_transition:idea', previousStage: 'idea', trigger: { kind: 'stage_transition' },
    stageResult: {
      classification: { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} },
      signalsPresent: [], signalsAbsent: [], fireRecommendation: true, selectedSignalKey: '',
      reason: 'history-signals-e2e', degraded: false,
      projectFactCandidates: ['test_runner', 'version_control', 'framework'],
      sectionRelevanceOrder: [],
    },
    streamBOutputs: [],
  } as never);

  const result = await preparePromptEnhancement(request) as never as {
    currentBody: { sections: readonly { sectionKind: string }[]; text: string };
  };
  return result.currentBody.sections.map((section) => section.sectionKind);
}

describe('the recent-history sensitive-action lane is WIRED', () => {
  /**
   * 🔴 **These two FAILED when first written, and that failure found the real defect.**
   *
   * The producer was correct all along — the ref crossed, the fact was built with `confirm_risk`,
   * evidence and a safety hook — and the source mix then deleted it before the planner ever saw it.
   * Two rules caught it at once (`safety_confirmation_support`, and `recent_prompt_history` not
   * being independent grounding), both assigning `selected_source_label_only`, a role that rendered
   * NOWHERE. So prompt-derived material could not reach a body no matter which producer emitted it.
   *
   * 🔒 Fixed in `source-mix.ts` on the owner's ruling: the label-only lane renders, still never
   * counting as grounding. These tests are what proves it, and they are the reason the defect was
   * found at all rather than shipped as a green unit suite.
   */
  it('a sensitive action in recent prompts puts a risk/confirmation section in the body', async () => {
    const kinds = await prepareWithHistory([
      'the login form is not centered on mobile',
      'lets deploy this to production tonight',
      'and deploy the worker service too',
    ], 'sensitive');
    expect(
      kinds,
      `the body rendered ${kinds.join(', ')} — the lane is not reaching the section planner`,
    ).toContain('risk_safety_or_confirmation');
  });

  it('an ordinary history does NOT — the lane is silent by default', async () => {
    // The discriminating half. Same set-up, same current prompt, no sensitive mention: this is what
    // proves the section came from the HISTORY rather than from anything else on the path.
    const kinds = await prepareWithHistory([
      'the login form is not centered on mobile',
      'can you add a loading spinner to the header',
      'the button label should say Continue',
    ], 'ordinary');
    expect(kinds).not.toContain('risk_safety_or_confirmation');
  });

  it('the section carries the safeguard, and never the words the developer typed', async () => {
    // 🔒 The leakage bound, asserted on the RENDERED BODY rather than on the signal module — that is
    // where a leak would actually reach a person, and where an intermediate layer re-introducing the
    // matched text would show up.
    const dir = mkdtempSync(join(tmpdir(), 'history-signals-leak-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', devDependencies: { vitest: '1.0.0' } }));
    const store = await openStore(join(dir, 'store.db'));
    upsertProject(store, {
      projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now(),
    });
    setProjectEnvFacts(store, dir, probeProject(dir, Date.now()).facts, Date.now());
    insertPrompt(store, { projectRoot: dir, promptText: 'just delete the whole abandoned_experiments folder' });

    const request = buildPromptEnhancementRequestForAuto({
      auto: { promptText: 'add retry to the payment flow and make sure it is covered', projectRoot: dir, currentAgentMode: 'default' },
      store, session: SessionStateManager.load(store, dir), project: null,
      effectiveLanguage: 'en', configuredRole: null, effectiveFlagType: 'stage_transition',
      firedKey: 'stage_transition:idea', previousStage: 'idea', trigger: { kind: 'stage_transition' },
      stageResult: {
        classification: { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} },
        signalsPresent: [], signalsAbsent: [], fireRecommendation: true, selectedSignalKey: '',
        reason: 'history-signals-leak', degraded: false,
        projectFactCandidates: ['test_runner', 'version_control', 'framework'],
        sectionRelevanceOrder: [],
      },
      streamBOutputs: [],
    } as never);

    const result = await preparePromptEnhancement(request) as never as { currentBody: { text: string } };
    expect(result.currentBody.text).toContain('ask me for go-ahead confirmation');
    expect(result.currentBody.text).not.toContain('abandoned_experiments');
  });

  it('a SECRET in a recent prompt does not reach the body (defence in depth, NOT the mix guard)', async () => {
    // ⚠️ **Scope corrected after checking, rather than claimed.** This was first written as "the
    // assertion the mix change lives or dies on". It is not: `insertPrompt` runs `redactSecrets` at
    // STORAGE, so the literal never reaches the enhancement engine at all and this test passes with
    // or without the privacy gate downstream. It is a real end-to-end guard on a real path, and it
    // is worth keeping — it is simply guarding the store, not the mix.
    //
    // 🔑 The guard the mix change actually depends on is asserted in
    // `source-mix.test.ts` at the producer invariant: no fact leaves the producer carrying both a
    // sensitive privacy class and renderable evidence.
    const dir = mkdtempSync(join(tmpdir(), 'history-signals-secret-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', devDependencies: { vitest: '1.0.0' } }));
    const store = await openStore(join(dir, 'store.db'));
    upsertProject(store, {
      projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now(),
    });
    setProjectEnvFacts(store, dir, probeProject(dir, Date.now()).facts, Date.now());
    // A secret-shaped literal in a prompt that ALSO trips the sensitive-action detector, so the
    // safeguard lane is definitely active on this run — the leak, if there were one, would ride it.
    const SECRET = 'sk-live-ZZ9QQ7hhh4444ttt8888vvv2222bbb6666nnn0';
    insertPrompt(store, { projectRoot: dir, promptText: `deploy to prod using the key ${SECRET} from my env file` });

    const request = buildPromptEnhancementRequestForAuto({
      auto: { promptText: 'add retry to the payment flow and make sure it is covered', projectRoot: dir, currentAgentMode: 'default' },
      store, session: SessionStateManager.load(store, dir), project: null,
      effectiveLanguage: 'en', configuredRole: null, effectiveFlagType: 'stage_transition',
      firedKey: 'stage_transition:idea', previousStage: 'idea', trigger: { kind: 'stage_transition' },
      stageResult: {
        classification: { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} },
        signalsPresent: [], signalsAbsent: [], fireRecommendation: true, selectedSignalKey: '',
        reason: 'history-signals-secret', degraded: false,
        projectFactCandidates: ['test_runner', 'version_control', 'framework'],
        sectionRelevanceOrder: [],
      },
      streamBOutputs: [],
    } as never);

    const result = await preparePromptEnhancement(request) as never as { currentBody: { text: string } };
    expect(result.currentBody.text).not.toContain(SECRET);
    // Not just the whole literal: no recognisable fragment of it either.
    expect(result.currentBody.text).not.toContain('sk-live-');
    expect(result.currentBody.text).not.toContain('ZZ9QQ7hhh4444');
  });
});
