import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, type Store } from '../store/db.js';
import { upsertProject, setProjectEnvFacts } from '../store/index.js';
import { SessionStateManager } from '../classifier/SessionStateManager.js';
import { buildPromptEnhancementRequestForAuto } from '../cli/commands/auto.js';
import { buildPromptEnhancementGuidanceFactsV1 } from './guidance-facts.js';
import { promptEnhancementFactValueLinesV1, promptEnhancementSectionModelFactsV1 } from './fact-value-render.js';
import { probeProject } from '../env/env-probe.js';
import { resolveFramework } from '../env/framework-fingerprints.js';
import { promoteEnvFactsToTierP, corroborationTierForEnvFact } from '../env/env-tier-promotion.js';
import { recordEnvTrajectory } from '../env/env-trajectory.js';
import { loadRightGoodProfile } from '../classifier/right-good-aggregator.js';
import { appendParamEvents, readParamEvents } from '../telemetry/param-events.js';
import type { PromptEnhancementGuidanceFact } from './templates/section-plan.js';

/**
 * HV-2 (dev-plan §14.3) — the five-check protocol run on ALL ELEVEN §46.3c modules, one exercise
 * fixture each, per step 3: "each drives its module's output through the boundary into a body and
 * pins the whole chain".
 *
 * The five checks (§46.3b): 1 executes on the live path · 2 crosses the boundary and HOW · 3
 * becomes a fact with content · 4 the content reaches a body · 5 a test pins each of the above.
 *
 * ⛔ §14.3's frame: "a failure here is a bug against the owning group — H patches nothing." Where a
 * module does NOT reach PE, the fixture pins that measured absence rather than fixing it. An
 * absence pinned in both directions is the point: it fails if the gap silently closes, so HV-3
 * judges the state that actually shipped.
 *
 * ⚠️ Check-1 is measured by CALLER, never by import — HV-1 round 2 found a listed consumer that is
 * imported and never runs. The per-export liveness numbers quoted in the rows come from that
 * caller-check, re-run for this phase against all eleven.
 */

function tempProject(withRunner = true): string {
  const dir = mkdtempSync(join(tmpdir(), 'hv2-'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'x', devDependencies: withRunner ? { vitest: '1.0.0' } : {} }),
  );
  return dir;
}

/** The live chain: module output already seeded → real request builder → facts → rendered lines. */
function driveChain(store: Store, dir: string): {
  refs: ReturnType<typeof buildPromptEnhancementRequestForAuto>['sourceSignals'];
  request: ReturnType<typeof buildPromptEnhancementRequestForAuto>;
  facts: readonly PromptEnhancementGuidanceFact[];
  requestJson: string;
  linesFor: (sectionKind: string) => readonly string[];
} {
  const session = SessionStateManager.load(store, dir);
  const request = buildPromptEnhancementRequestForAuto({
    auto: { promptText: 'add the token refresh path and check it', projectRoot: dir, currentAgentMode: 'default' },
    store,
    session,
    project: null,
    effectiveLanguage: 'en',
    configuredRole: null,
    effectiveFlagType: 'stage_transition',
    firedKey: 'stage_transition:idea→implementation',
    previousStage: 'idea',
    trigger: { kind: 'stage_transition' },
    stageResult: {
      classification: { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} },
      signalsPresent: [],
      signalsAbsent: [],
      fireRecommendation: true,
      selectedSignalKey: '',
      reason: 'hv2',
      degraded: false,
      // The applicability observation the live classifier supplies. These rows exercise the
      // grounding CHAIN, so the prompt is one the facts genuinely serve ("add the token refresh
      // path and check it" — implementation plus verification). The GATE has its own fixtures;
      // supplying everything here would test neither.
      projectFactCandidates: ['framework', 'test_runner', 'version_control', 'ci_pipeline'],
    },
    streamBOutputs: [],
  });
  const facts = buildPromptEnhancementGuidanceFactsV1(request);
  return {
    refs: request.sourceSignals,
    request,
    facts,
    requestJson: JSON.stringify(request),
    linesFor: (kind) => promptEnhancementFactValueLinesV1(kind, facts),
  };
}

/**
 * Rows 7 and 9 CANNOT be exercised on an in-memory store: `paramEventsPathFor` returns null for
 * `:memory:` (`param-events.ts:84`), so nothing can be written and `readParamEvents` yields
 * nothing. That is a real property of those lanes — they are disk-backed — and it means any
 * harness using `:memory:` would measure "no signals" and call it a clean pass.
 */
async function openDiskStore(): Promise<{ store: Store; dir: string }> {
  const dir = tempProject();
  const store = await openStore(join(dir, 'store.db'));
  upsertProject(store, { projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now() });
  setProjectEnvFacts(store, dir, probeProject(dir, Date.now()).facts, Date.now());
  return { store, dir };
}

/**
 * Every line the fact set renders WHEN ASKED THE WAY PRODUCTION ASKS.
 *
 * ⚠️ Round 3 correction. The first version derived the section kinds from the facts themselves,
 * which meant it asked the renderer for `''` — the value every content-carrying fact happens to
 * carry. No production caller ever asks that: `compose-enhancement.ts:839` passes
 * `sectionPlan.sectionKind`, always a named kind. Asking with `''` produced lines and made check-4
 * look satisfied for six rows; asking the way the body asks produces none.
 */
const PRODUCTION_SECTION_KINDS = [
  'context_and_constraints', 'approach_or_steps', 'acceptance_or_output_expectation',
  'verification_or_test_plan', 'project_grounding_facts', 'source_signal_guidance',
  'reproduction_or_evidence', 'risk_safety_or_confirmation', 'uncertainty_or_clarification',
  'requirement_source_state', 'behavior_preservation', 'finding_format',
] as const;

function allRenderedLines(facts: readonly PromptEnhancementGuidanceFact[]): readonly string[] {
  return PRODUCTION_SECTION_KINDS.flatMap((k) => promptEnhancementFactValueLinesV1(k, facts));
}

function seedEnvFacts(store: Store, dir: string): void {
  upsertProject(store, { projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now() });
  setProjectEnvFacts(store, dir, probeProject(dir, Date.now()).facts, Date.now());
}

// ─────────────────────────────────────────────────────────────────────────────
// ROW 1 — env/env-probe.ts — "cargo lost at the boundary", fixed by A3
// ─────────────────────────────────────────────────────────────────────────────
describe('HV-2 row 1 — env-probe: executes, crosses WITH VALUES, becomes content, renders', () => {
  it('drives probe output through the boundary into rendered body lines', async () => {
    const store = await openStore(':memory:');
    const dir = tempProject();
    seedEnvFacts(store, dir);

    const { refs, facts, linesFor } = driveChain(store, dir);

    // check-2: crosses, and HOW — typed {key,value}, not the bare `hard_fact:<key>` of §46.3c
    expect(refs.sourceOnlyHardFactRefs.length).toBeGreaterThan(0);
    const ref = refs.sourceOnlyHardFactRefs[0]!;
    const evidence = refs.groundingEvidenceByRef?.[ref];
    expect(evidence?.key, 'check-2 regressed to keys-only — that is A3 unwinding').toBeTruthy();
    expect(evidence?.value).toBeDefined();

    // check-3: becomes a fact carrying its value
    const envFacts = facts.filter((f) => f.sourceIds.some((id) => id.startsWith('env:') || id.startsWith('hard_fact:')));
    expect(envFacts.length, 'no env-backed fact was built from the crossing refs').toBeGreaterThan(0);
    expect(envFacts.some((f) => f.evidence?.value !== undefined)).toBe(true);

    // check-4 — MEASURED AS A FAILURE, filed at §17.7. The fact resolves and would render, but
    // only when the renderer is asked with the raw `''` these facts carry. Production asks with a
    // NAMED section kind, and then nothing comes back.
    expect(
      allRenderedLines(envFacts).length,
      'the fact stopped resolving at all — a worse defect than the §17.7 this replaced',
    ).toBeGreaterThan(0);
    // §17.7 FIXED: the resolved value reaches a PRODUCTION section. Asserted on the real section
    // kind the planner places these facts in, not on the raw field they carry.
    const grounded = promptEnhancementFactValueLinesV1('project_grounding_facts', facts);
    expect(
      grounded.length,
      'the grounded values stopped reaching a production body — §17.7 has regressed',
    ).toBeGreaterThan(0);
    expect(grounded.join('\n')).toMatch(/test runner|version control|framework/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROW 2 — env/framework-fingerprints.ts — "rides #1"
// ─────────────────────────────────────────────────────────────────────────────
describe('HV-2 row 2 — framework-fingerprints: rides row 1, and the ride is real', () => {
  it('the probe\'s framework fact IS this module\'s output, for a real dependency', () => {
    // The first version called resolveFramework(dir). That signature takes DEPENDENCY NAMES
    // (`framework-fingerprints.ts:63`), so it returned null for a path, the probe returned null for
    // a dependency-free project, and the fixture passed by comparing two nulls — exercising
    // nothing. Seeding a real fingerprint dependency is what makes "rides #1" checkable.
    const dir = mkdtempSync(join(tmpdir(), 'hv2-fw-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', dependencies: { next: '14.0.0' } }));

    const expected = resolveFramework(['next']);
    expect(expected, 'the fingerprint table stopped recognising a known dependency').toBe('nextjs');

    const probed = probeProject(dir, Date.now()).facts;
    expect(
      probed.project_framework?.value,
      'the probe no longer carries this module\'s output — row 2 does not ride row 1 any more',
    ).toBe(expected);
  });

  it('and it crosses inside row 1 cargo, not on a channel of its own', async () => {
    const store = await openStore(':memory:');
    const dir = mkdtempSync(join(tmpdir(), 'hv2-fw2-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', dependencies: { next: '14.0.0' } }));
    upsertProject(store, { projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now() });
    setProjectEnvFacts(store, dir, probeProject(dir, Date.now()).facts, Date.now());

    const { refs } = driveChain(store, dir);
    const entry = Object.entries(refs.groundingEvidenceByRef ?? {}).find(([, e]) => e.key === 'project_framework');
    expect(entry, 'the framework fact stopped crossing at all').toBeDefined();
    // The ride: it travels as row 1 cargo (a hard_fact ref with an evidence payload), never on a
    // lane of its own — so there is no separate framework channel to look for.
    expect(entry![0].startsWith('hard_fact:')).toBe(true);
    expect(entry![1].value).toBe('nextjs');

    // check-4 — the ride reaches the RESOLVED value but not a production body (§17.7).
    const { facts } = driveChain(store, dir);
    expect(allRenderedLines(facts).join('\n')).toContain('nextjs');
    expect(
      allRenderedLines(facts).join('\n'),
      'the framework value stopped reaching a production body — §17.7 has regressed',
    ).toContain('nextjs');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROW 3 — env/env-tier-promotion.ts — the standout; A1 wired it
// ─────────────────────────────────────────────────────────────────────────────
describe('HV-2 row 3 — env-tier-promotion: A1 landed, the tier now crosses typed', () => {
  it('the boundary stamps a corroboration tier per crossing ref', async () => {
    const store = await openStore(':memory:');
    const dir = tempProject();
    seedEnvFacts(store, dir);
    const { refs } = driveChain(store, dir);

    // §46.3c had this module "NOT WIRED to PE — must be". A1 is the wire; this is its proof.
    expect(refs.groundingTierByRef, 'A1 unwound — the corroboration input PE cannot decide without').toBeDefined();
    const tiers = Object.values(refs.groundingTierByRef ?? {});
    expect(tiers.length).toBeGreaterThan(0);
    for (const tier of tiers) {
      expect(['promoted_practice_P', 'capability', 'uncorroborated']).toContain(tier);
    }
  });

  it('and a promoted tier changes the WORDING that reaches the body', async () => {
    // Row 3's check-4 is not a line of its own: the tier decides `claimVerbPolicy`, which decides
    // how the fact is allowed to speak. A tier-P fact earns practice wording — that IS the tier
    // arriving in the body, and it is the locked L4993 behaviour ("only corroborated tier P may use
    // practice wording"). Six verified events promote has_test_runner, so the line must say so.
    const { store, dir } = await openDiskStore();
    appendParamEvents(store, Array.from({ length: 6 }, (_, i) => ({
      projectRoot: dir, sessionId: 'p' + String(i), promptIndex: i, signalKey: 'test_creation',
      channel: 'transcript' as const, stage: 'implementation' as const, stageConfidence: 0.9,
      source: 'live' as const,
    })));
    const { facts } = driveChain(store, dir);
    // The tier DOES reach the claim wording — that is A1 working. It is the last hop, into a
    // production section, that drops it (§17.7).
    expect(
      allRenderedLines(facts).join('\n'),
      'the promoted tier stopped producing practice wording — that is L4993 unwinding',
    ).toContain('established practice');
    expect(
      allRenderedLines(facts).join('\n'),
      'the promoted tier stopped reaching a production body as practice wording — L4993 or §17.7 regressed',
    ).toContain('established practice');
  });

  it('and the promotion rule itself is the one the DS engine uses', () => {
    // Same function, both consumers — §46.3c's row 3 is about the lock's input being shared.
    const promoted = promoteEnvFactsToTierP({ has_test_runner: { value: true } } as never, {
      test_creation: { state: 'right_good', behaviourVerified: true },
    } as never);
    expect(promoted.has_test_runner?.tier).toBe('P');
    expect(corroborationTierForEnvFact(promoted.has_test_runner as never)).toBe('promoted_practice_P');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROW 4 — env/env-trajectory.ts — measured absence, pinned both ways
// ─────────────────────────────────────────────────────────────────────────────
describe('HV-2 row 4 — env-trajectory: a confirmed movement crosses, and states itself in a body', () => {
  // -- WHY THIS FIXTURE WAS REWRITTEN (round 6) ------------------------------------------------
  // It previously asserted the module "crosses NOTHING" and claimed to be "pinned BOTH ways --
  // fails if the gap closes". The gap closed (§17.11 was ruled WIRE IT and shipped) and it stayed
  // GREEN. It could not have failed, for THREE independent reasons, and each is worth naming
  // because each is a way a fixture can look like a guard without being one:
  //
  //   1. it opened `:memory:` -- `paramEventsPathFor` returns null there, so the module's change
  //      events were never written and nothing downstream could ever see them;
  //   2. it matched refs containing 'trajectory', and the crossing ref is `env_change:<key>` --
  //      a substring guess about a name that had not been chosen yet;
  //   3. it called `recordEnvTrajectory` ONCE, and a first probe is initialization by design --
  //      no first observation is ever a movement, so no event existed to cross.
  //
  // So the row is now exercised the way §14.3 step 3 asks: "drives its module's output through the
  // boundary into a body and pins the whole chain" -- on a disk store, through the flap damping,
  // to a rendered line.
  it('drives a flap-damped acquisition through the boundary into a rendered body line', async () => {
    const dir = tempProject(false); // starts WITHOUT a test runner
    const store = await openStore(join(dir, 'store.db'));
    upsertProject(store, { projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now() });
    const session = { sessionId: 's', promptIndex: 0, stage: 'implementation' as const, stageConfidence: 0.9 };

    // Probe 1 seeds the baseline -- initialization, never a movement.
    recordEnvTrajectory(store, dir, session);
    expect(driveChain(store, dir).refs.rightGoodWorkStyleEnvRuntimeRefs.filter((r) => r.startsWith('env_change:')))
      .toEqual([]);

    // The project acquires a test runner.
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', devDependencies: { vitest: '1.0.0' } }));

    // Probe 2 sees it but does not trust it yet (S4 flap damping: stable across TWO probes).
    recordEnvTrajectory(store, dir, session);
    expect(
      driveChain(store, dir).refs.rightGoodWorkStyleEnvRuntimeRefs.filter((r) => r.startsWith('env_change:')),
      'an unconfirmed movement reached PE -- flap damping is what keeps a host/devcontainer flip out of the prompt',
    ).toEqual([]);

    // Probe 3 confirms it.
    const confirmed = recordEnvTrajectory(store, dir, session);
    expect(confirmed.map((c) => `${c.key}:${c.direction}`)).toContain('has_test_runner:acquired');

    // check-2 -- it crosses, and it crosses TYPED: the movement phrase, not a bare key.
    const { refs, facts } = driveChain(store, dir);
    expect(refs.rightGoodWorkStyleEnvRuntimeRefs).toContain('env_change:has_test_runner');
    expect(refs.groundingEvidenceByRef?.['env_change:has_test_runner']?.value).toBe('was acquired');

    // check-3 -- it becomes a fact carrying that content.
    const fact = facts.find((f) => f.sourceIds[0] === 'env_change:has_test_runner');
    expect(fact?.evidence?.value, 'the movement crossed but arrived contentless -- defect G9 on a new lane').toBe('was acquired');

    // check-4 -- followed to the end, into a body a user reads.
    const body = allRenderedLines(facts).join('\n');
    expect(body, 'the movement never reached a body').toContain('was acquired');
    expect(body).toContain('since the last session');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROW 5 — env/agent-capabilities.ts — absent by ruling, not by accident
// ─────────────────────────────────────────────────────────────────────────────
describe('HV-2 row 5 — agent-capabilities: absent from grounding, deferred by owner ruling', () => {
  it('no capability fact crosses, while the mode still reaches PE as review-moment context', async () => {
    const store = await openStore(':memory:');
    const dir = tempProject();
    seedEnvFacts(store, dir);
    const { refs, facts, requestJson } = driveChain(store, dir);

    expect(
      facts.some((f) => f.sourceIds.some((id) => id.includes('agent_capability') || id.includes('mode_band'))),
      'capability facts started crossing — that is the deferred wire (notes §30) landing early',
    ).toBe(false);
    // check-4 at the far end: no mode band reaches a body either.
    const body = allRenderedLines(facts).join('\n');
    expect(body).not.toContain('acceptEdits');
    expect(body).not.toContain('bypassPermissions');
    // The distinction the row rests on: the mode IS present to PE as review-moment context while
    // capability FACTS are not. Asserted on the request, not on the refs — that is where mode
    // travels — so the row's "absent from grounding, present as context" claim is pinned whole.
    // Matched as a JSON KEY, not a substring: `currentAgentModeRENAMED` contains
    // `currentAgentMode`, so a substring check survives the very rename it should catch.
    expect(
      requestJson.includes('"currentAgentMode":'),
      'the agent mode stopped reaching PE entirely — row 5 rests on it being present as context',
    ).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROW 6 — decision-session/content-template-grounding.ts — channels only
// ─────────────────────────────────────────────────────────────────────────────
describe('HV-2 row 6 — content-template-grounding: DS-side live, PE gets channel NAMES only', () => {
  it('param channels cross without their extracted values', async () => {
    // Channels come from the param-event lane, which is disk-backed — an in-memory store yields
    // none at all, which is how the first version of this fixture passed while exercising nothing.
    const { store, dir } = await openDiskStore();
    appendParamEvents(store, Array.from({ length: 4 }, (_, i) => ({
      projectRoot: dir,
      sessionId: 'session-' + String(i),
      promptIndex: i,
      signalKey: 'repro_steps',
      channel: 'transcript' as const,
      stage: 'implementation' as const,
      stageConfidence: 0.7,
      source: 'live' as const,
    })));
    const { refs } = driveChain(store, dir);

    const channels = refs.paramEventChannels ?? [];
    // Non-vacuity first: a loop over an empty list would pass while proving nothing.
    expect(channels.length, 'no channel crossed — row 6 is not being exercised, not passing').toBeGreaterThan(0);
    // §46.3c: "values never cross — only param CHANNEL names". Pinned as measured: a channel entry
    // is a bare name, never a key=value pair.
    for (const channel of channels) {
      expect(channel.includes('='), 'channel "' + channel + '" now carries a value — row 6 changed').toBe(false);
    }
    // check-4 followed to the end: a channel NAME never becomes body content.
    const { facts } = driveChain(store, dir);
    const body = allRenderedLines(facts).join('\n');
    for (const channel of channels) {
      expect(body.includes('channel ' + channel), 'a param channel reached the body').toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROW 7 — classifier/right-good-aggregator.ts — state strings + tier
// ─────────────────────────────────────────────────────────────────────────────
describe('HV-2 row 7 — right-good-aggregator: live, and its state reaches the boundary', () => {
  it('real param events produce a real profile, and the module is on the live path', async () => {
    const { store, dir } = await openDiskStore();
    const events = Array.from({ length: 6 }, (_, i) => ({
      projectRoot: dir, sessionId: `s${i}`, promptIndex: i, signalKey: 'test_creation',
      channel: 'transcript' as const, stage: 'implementation' as const, stageConfidence: 0.9,
      source: 'live' as const,
    }));
    appendParamEvents(store, events);

    // check-1, exercised rather than asserted: the live entry point reads what was written.
    const profile = loadRightGoodProfile(store, dir);
    expect(Object.keys(profile).length, 'the aggregator returned nothing from six real events').toBeGreaterThan(0);
    expect(profile.test_creation).toBeDefined();

    // check-2: the RIGHT/GOOD lane exists at the boundary and is a typed ref list.
    const { refs, facts } = driveChain(store, dir);
    expect(refs.rightGoodWorkStyleEnvRuntimeRefs, 'the RIGHT/GOOD lane disappeared from the boundary').toBeDefined();
    for (const ref of refs.rightGoodWorkStyleEnvRuntimeRefs ?? []) {
      expect(typeof ref).toBe('string');
    }

    // check-3/4 — the verified signal becomes a fact and reaches the body. It does so by
    // corroborating the env capability, which is the whole point of the RIGHT/GOOD lane: without a
    // behaviour-verified signal the same capability could only be stated as a capability.
    expect(facts.some((f) => f.sourceIds.some((id) => id.startsWith('right_good:')))).toBe(true);
    expect(allRenderedLines(facts).join('\n')).toContain('established practice');
    expect(
      allRenderedLines(facts).join('\n'),
      'the corroborated capability stopped reaching a production body — §17.7 has regressed',
    ).toContain('established practice');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROW 8 — store/historical-import.ts — cross-referenced from group B (§14.3 step 4)
// ─────────────────────────────────────────────────────────────────────────────
describe('HV-2 row 8 — historical-import: written FROM group B\'s evidence (§14.3 step 4)', () => {
  // Step 4 says this row is "written from group B's fixture evidence — cross-referenced, not
  // re-run". The first version cross-referenced only that B's file EXISTS, which is not the same
  // thing as writing the row from what B proved.
  //
  // What B's 27 fixtures establish: the import writes retro rows with real jsonl timestamps, null
  // stage, the four noise shapes excluded, capped at 500. What matters for THIS table is where
  // those rows then go — and they are not inert. `historical-import.ts:135` emits param events
  // tagged `source: 'historical_import'`, and the aggregator folds them into the RIGHT/GOOD score
  // at HIST_WEIGHT: score = (presence_live + HIST_WEIGHT·presence_hist) / max(opportunities, FLOOR).
  //
  // 🔑 So row 8 feeds row 7, which feeds row 3's tier, which decides `claimVerbPolicy`, which is
  // the practice wording. "Indirect" is right; "inert" would not be.

  it('the wire group B verified is still present on the auto path', () => {
    const auto = readFileSync('src/cli/commands/auto.ts', 'utf8');
    // A CALL, not a substring — a renamed symbol still contains the old name.
    expect(
      /\bimportHistoricalPrompts\s*\(/.test(auto),
      'the group-B import wire left the auto path — row 8 is written from that wire existing',
    ).toBe(true);
  });

  it('imported history enters the SAME lane row 7 aggregates, tagged as historical', () => {
    const imp = readFileSync('src/store/historical-import.ts', 'utf8');
    expect(imp).toContain('appendParamEvents');
    expect(imp).toContain("source:          'historical_import'");
    const agg = readFileSync('src/classifier/right-good-aggregator.ts', 'utf8');
    expect(
      agg,
      'the historical fold-in weight vanished — imported history would count as live evidence',
    ).toContain('HIST_WEIGHT');
  });

  it('and historical-only evidence really does move row 7\'s profile', async () => {
    // The cross-reference, exercised rather than asserted: feed ONLY historical-import events and
    // the aggregator still produces a profile entry for the signal. That is the indirect path
    // arriving — row 8's contribution to rows 7 → 3 → the claim wording.
    const { store, dir } = await openDiskStore();
    appendParamEvents(store, Array.from({ length: 8 }, (_, i) => ({
      projectRoot: dir, sessionId: 'hist-' + String(i), promptIndex: i, signalKey: 'test_creation',
      channel: 'transcript' as const, stage: null, stageConfidence: null,
      source: 'historical_import' as const,
    })));
    const profile = loadRightGoodProfile(store, dir);
    expect(
      profile.test_creation,
      'historical-import evidence no longer reaches the aggregator — row 8 would be inert, not indirect',
    ).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROW 9 — telemetry/param-events.ts — work-style values, now typed (A3)
// ─────────────────────────────────────────────────────────────────────────────
describe('HV-2 row 9 — param-events: live, and work-style values cross TYPED not smuggled', () => {
  it('a work-style value crosses in the evidence payload, not inside a ref string', async () => {
    const { store, dir } = await openDiskStore();
    appendParamEvents(store, Array.from({ length: 6 }, (_, i) => ({
      projectRoot: dir, sessionId: `s${i}`, promptIndex: i, signalKey: 'regression_check',
      channel: 'transcript' as const, stage: 'implementation' as const, stageConfidence: 0.8,
      source: 'live' as const,
    })));
    // check-1 exercised: readParamEvents is what work-style computes from.
    expect(readParamEvents(store, dir).length, 'the param-event lane read nothing back').toBeGreaterThan(0);

    const { refs } = driveChain(store, dir);

    // §46.3c: "work-style values smuggled in untyped strings". A3 moved them into {key,value}.
    for (const ref of refs.rightGoodWorkStyleEnvRuntimeRefs ?? []) {
      expect(ref.split(':').length, `ref "${ref}" looks like a smuggled value payload`).toBeLessThanOrEqual(3);
    }

    // check-3 ✅ / check-4 ⛔, MEASURED rather than assumed. The work-style trait DOES become a
    // fact carrying its value — A3's correction — but that fact does not render into a body: the
    // rendered set contains no work-style line. Recorded as the measured state, not patched here
    // (§14.3: H patches nothing); it is evidence for HV-3 against the owning group.
    const { facts } = driveChain(store, dir);
    const workStyle = facts.filter((f) => f.sourceIds.some((id) => id.startsWith('work_style:')));
    expect(workStyle.length, 'the work-style fact stopped being built at all').toBeGreaterThan(0);
    expect(workStyle[0]!.evidence?.value, 'the work-style value stopped crossing typed').toBeTruthy();

    const body = allRenderedLines(facts).join('\n');
    for (const f of workStyle) {
      expect(
        body.includes(String(f.evidence?.value)),
        'a work-style value now REACHES the body — row 9 check-4 must be re-measured, not relaxed',
      ).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROW 10 — prompt-enhancement/guidance-facts.ts — healthy pipe, cargo added by A2
// ─────────────────────────────────────────────────────────────────────────────
describe('HV-2 row 10 — guidance-facts: live, and the facts now CARRY content (defect G9)', () => {
  it('facts built from the live request carry evidence and the tier-1 policy trio', async () => {
    const store = await openStore(':memory:');
    const dir = tempProject();
    seedEnvFacts(store, dir);
    const { facts } = driveChain(store, dir);

    expect(facts.length, 'the pipe stopped producing facts entirely').toBeGreaterThan(0);
    const withEvidence = facts.filter((f) => f.evidence?.value !== undefined);
    expect(withEvidence.length, 'G9 is back — facts carrying no content').toBeGreaterThan(0);
    for (const f of withEvidence) {
      expect(f.claimVerbPolicy, 'the claim-policy trio lost a member').toBeTruthy();
      expect(f.sourceOriginScope).toBeTruthy();
      expect(f.sourceAnchorScope).toBeTruthy();
    }

    // check-4 — the content resolves but reaches no production body (§17.7). G9 was "facts carry no
    // content"; this is the next hop failing instead, which is why it survived G9's fix.
    expect(allRenderedLines(facts).length).toBeGreaterThan(0);
    expect(
      allRenderedLines(facts).length,
      'content-carrying facts stopped reaching a production body — §17.7 has regressed',
    ).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ROW 11 — prompt-enhancement/source-mix.ts — mixes, and now mixes CONTENT
// ─────────────────────────────────────────────────────────────────────────────
describe('HV-2 row 11 — source-mix: live, and content survives the mix into a body', () => {
  it('a fact with content survives mixing and renders its value', async () => {
    const store = await openStore(':memory:');
    const dir = tempProject();
    seedEnvFacts(store, dir);
    const { facts, linesFor } = driveChain(store, dir);

    const carriers = facts.filter((f) => f.evidence?.value !== undefined);
    expect(carriers.length).toBeGreaterThan(0);

    const modelFacts = PRODUCTION_SECTION_KINDS.flatMap((k) => promptEnhancementSectionModelFactsV1(k, facts));
    expect(modelFacts.length, 'nothing survived the mix into the section model').toBeGreaterThan(0);
    expect(allRenderedLines(facts).join('\n')).not.toBe('');
    // …and the same content, asked for the way a body asks, is absent (§17.7).
    const productionModel = PRODUCTION_SECTION_KINDS.flatMap((k) => promptEnhancementSectionModelFactsV1(k, facts));
    // The model DOES receive entries under a production kind — but only the CONTENT-FREE ones
    // (the stage/template facts, which carry a named section kind and no evidence). Every
    // content-carrying fact has `targetSectionKind: ''` and matches nothing. So what arrives at a
    // real section is exactly the G9 symptom again, one hop later: ids without values.
    expect(productionModel.length, 'the section model went empty').toBeGreaterThan(0);
    expect(
      productionModel.filter((e) => e.evidence !== undefined).length,
      'no content-carrying fact reaches a production section model — §17.7 has regressed',
    ).toBeGreaterThan(0);
  });
});

describe('HV-2 row 6 — A3 STEP 7 DID NOT LAND: extracted param values never enter PE', () => {
  // §14.3 step 2 lists what checks 3-4 must verify from A3: "env values, work-style, RIGHT/GOOD
  // with tier, PARAM EXTRACTS". The first three landed (rows 1, 9, 7). The fourth did not.
  //
  // A3 step 7 is explicit and marked 🔴: the engine's own `ExtractedParam` output must "cross as
  // typed {key, value} too", and it names this as "the exact id-only hop §33.2 MEASURED as broken
  // — the values the engine extracted never enter PE at all". They still do not.
  //
  // ⛔ FILED, NOT FIXED — §14.3: "a failure here is a bug against the owning group; H patches
  // nothing." Bug record: dev-plan §17.6. Pinned in BOTH directions so the row is re-judged when
  // group A lands the wire, rather than this line being relaxed.

  it('the PE boundary has no path to the extractor at all', () => {
    for (const file of ['src/cli/commands/auto.ts', 'src/prompt-enhancement/facade.ts']) {
      const text = readFileSync(file, 'utf8');
      expect(
        text.includes('content-template-grounding'),
        `${file} now reaches the extractor — A3 step 7 has landed; re-judge row 6 rather than relax this`,
      ).toBe(false);
      expect(text.includes('ExtractedParam')).toBe(false);
    }
  });

  it('every extractor consumer is DS-side, so no value can reach the PE lane', () => {
    // The measurement behind the bug record: the extractor's four live exports are consumed only by
    // the decision-session engine. PE's single param reference builds `param_event:<channel>` from
    // channel NAMES — the id-only hop, still id-only.
    const taxonomy = readFileSync('src/prompt-enhancement/routing-taxonomy.ts', 'utf8');
    expect(taxonomy).toContain('`param_event:${ref}`');
    const engine = readFileSync('src/decision-session/content-template-engine.ts', 'utf8');
    expect(engine).toContain('extractParamsFromPrompts');
  });

  it('and no fact crosses carrying a prompt-mined extracted value', async () => {
    const { store, dir } = await openDiskStore();
    appendParamEvents(store, Array.from({ length: 4 }, (_, i) => ({
      projectRoot: dir, sessionId: 'x' + String(i), promptIndex: i, signalKey: 'repro_steps',
      channel: 'transcript' as const, stage: 'implementation' as const, stageConfidence: 0.7,
      source: 'live' as const,
    })));
    const { facts } = driveChain(store, dir);
    // A3 step 7 required these to arrive with `sourceOriginScope: current_prompt` or
    // `recent_prompt_history`. No fact carries either with a value — which is the failure, stated
    // as a measurement rather than an inference from the missing import.
    // ⚠️ NARROWED at §17.13. This filtered on ORIGIN SCOPE as a proxy for "prompt-mined", and the
    // proxy stopped holding the moment another producer with `current_prompt` origin gained a
    // value: a STAGE TRANSITION is observed from the current prompt and is not a mined param. The
    // row is about the A3 step-7 lane, so it now asks for that lane by name.
    const promptMined = facts.filter(
      (f) => f.sourceIds.some((id) => id.startsWith('prompt_fact:')) && f.evidence?.value !== undefined,
    );
    expect(
      promptMined.map((f) => f.factId),
      'a prompt-mined value now crosses — A3 step 7 landed; re-judge row 6 and close §17.6',
    ).toEqual([]);
  });
});

describe('HV-2 check-5 for check-1 — the liveness column must guard itself', () => {
  // §46.3b's fifth check is "does a TEST pin each of the above?", and check-1 is one of the above.
  // §17.5's liveness column came from a one-time caller-check instrument. A one-time measurement is
  // exactly what §46.3c's consumer cells were — and three of those were wrong by the time HV-1 read
  // them. So the column guards itself here: if a live export loses its last production caller, or a
  // test-only one gains its first, this fails and the row is re-measured.
  //
  // Files are READ, not grepped, and the declaring module is excluded — an export used only inside
  // its own file is not a live CONSUMER relationship.

  // ⛔ B-10 in the pre-existing bug register. This walked EVERY directory under `src`, including
  // build output that git ignores, and treated whatever it found as production source.
  //
  // Two failures came out of that on any machine that had packaged the VS Code extension — which is
  // every developer machine, and no CI one, so it looked like a phantom:
  //
  //  1. `src/ext-vscode/nexpath-cli/dist/` is a full compiled copy of the CLI. Its `.d.ts` files
  //     declare `getRightGoodState` and `appendVariantServedEvent`, so the "still test-only" check
  //     below read them as production callers and failed.
  //  2. `src/ext-vscode/node_modules/` holds 3 764 `.ts` files. The walk went from ~1 000 files to
  //     5 140, and the sweep re-reads every one of them per symbol, so it passed its 5 s timeout.
  //
  // Measured 2026-09-18: with both present, 2 failed / 21 passed in 19.8 s; with both moved aside,
  // 23 passed in 2.5 s. Nothing tracked by git lives under a directory with one of these names — the
  // three are checked rather than the two paths, so a future build output cannot reintroduce it.
  const NOT_SOURCE = new Set(['node_modules', 'dist', 'out']);

  // ⚠️ Walked + READ once, then cached (2026-09-24). The B-10 note above already measured how close
  // this sweep runs to its 5 s timeout: it re-walked `src` and re-read every production file for
  // EVERY symbol below — roughly 1 000 files × ~30 symbols of disk I/O per run. Adding two ordinary
  // source files to src/prompt-enhancement/ was enough to tip it over under the full suite's
  // parallel load, and it then failed on a DIFFERENT test each run, which reads as a phantom rather
  // than as "this sweep is too slow". The tree cannot change mid-run, so one read of each file is
  // all this ever needed.
  let walkedFiles: string[] | undefined;
  const sourceText = new Map<string, string>();

  function allTs(): string[] {
    if (walkedFiles) return walkedFiles;
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        if (NOT_SOURCE.has(entry)) continue;
        const full = `${dir}/${entry}`;
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.ts')) out.push(full);
      }
    };
    walk('src');
    walkedFiles = out;
    return out;
  }

  function productionConsumers(exportName: string, declaredIn: string): string[] {
    const pattern = new RegExp(`\\b${exportName}\\b`);
    const hits: string[] = [];
    for (const file of allTs()) {
      if (file.endsWith('.test.ts') || file.endsWith(declaredIn)) continue;
      let text = sourceText.get(file);
      if (text === undefined) {
        text = readFileSync(file, 'utf8');
        sourceText.set(file, text);
      }
      if (pattern.test(text)) hits.push(file);
    }
    return hits;
  }

  // row → the export whose liveness the row's check-1 cell rests on
  const LIVE: readonly (readonly [number, string, string])[] = [
    [1, 'env-probe.ts', 'probeProject'],
    [2, 'framework-fingerprints.ts', 'resolveFramework'],
    [3, 'env-tier-promotion.ts', 'promoteEnvFactsToTierP'],
    [4, 'env-trajectory.ts', 'recordEnvTrajectory'],
    [5, 'agent-capabilities.ts', 'resolveModeBand'],
    [6, 'content-template-grounding.ts', 'extractParamsFromPrompts'],
    [7, 'right-good-aggregator.ts', 'loadRightGoodProfile'],
    [8, 'historical-import.ts', 'importHistoricalPrompts'],
    [9, 'param-events.ts', 'readParamEvents'],
    [10, 'guidance-facts.ts', 'buildPromptEnhancementGuidanceFactsV1'],
    [11, 'source-mix.ts', 'applyPromptEnhancementSourceMixV1'],
  ];

  it('⛔ B-10: the walk collects SOURCE only, never build output', () => {
    // The guard for the fix above. Without it the sweep read a compiled copy of the CLI as production
    // source — `getRightGoodState` and `appendVariantServedEvent` appeared to have callers because
    // their own `.d.ts` files were sitting in `src/ext-vscode/nexpath-cli/dist/` — and it walked
    // `src/ext-vscode/node_modules/` as well, taking the file count from ~1 000 to 5 140 and the test
    // past its 5 s timeout. Both directories are gitignored, so this was red on every developer
    // machine that had packaged the extension and green everywhere else.
    const files = allTs();
    const buildOutput = files.filter((f) => /(^|\/)(node_modules|dist|out)\//.test(f));
    expect(
      buildOutput.slice(0, 5),
      `${buildOutput.length} of ${files.length} collected files come from build output — they are not `
      + 'production source, and reading them makes this sweep answer questions about compiled copies',
    ).toEqual([]);

    // …and it must still be collecting the real thing.
    expect(files.length, 'the walk collected almost nothing — the exclusion is too wide').toBeGreaterThan(500);
    expect(files.some((f) => f.endsWith('hv2-five-check-sweep.test.ts'))).toBe(true);
  });

  it('every row\'s check-1 export still has a production consumer', () => {
    const dead = LIVE
      .filter(([, file, name]) => productionConsumers(name, file).length === 0)
      .map(([row, , name]) => `row ${row}: ${name}`);
    expect(
      dead,
      'a module went dead — §17.5\'s check-1 column is now wrong; re-measure the row, do not relax this',
    ).toEqual([]);
  });

  it('and the two TEST-ONLY exports this sweep found are still test-only', () => {
    // §17.5b finding 1, filed to the classifier/telemetry areas rather than fixed. If either gains
    // a production caller the finding is resolved and the record should say so.
    const revived = ([
      ['right-good-aggregator.ts', 'getRightGoodState'],
      ['param-events.ts', 'appendVariantServedEvent'],
    ] as const)
      .filter(([file, name]) => productionConsumers(name, file).length > 0)
      .map(([, name]) => name);
    expect(
      revived,
      'a test-only export gained a production caller — close that finding in §17.5b rather than relaxing this',
    ).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// §17.7 CARRIED INTO THE HV-3 VERDICT (§14.4 step 1)
// -----------------------------------------------------------------------------
describe('§17.7 carried - the render path asks the section-key question exactly ONE way', () => {
  // §14.4 step 1 names TWO HV-2 records the verdict table must carry, and §17.7's own record ends
  // "HV-3's verdict table assigns it". Owner assigned there: G (render), at its seam with A (payload).
  //
  // §17.7 is what every green check-4 in the verdict table rests on. Before it, a resolved value was
  // planned into a section and then dropped by the renderer FOR THAT SAME SECTION. The behaviour is
  // already pinned in the rows above (grounded values reach `project_grounding_facts`). What is
  // pinned HERE is the STRUCTURE that behaviour rests on - prohibition 15, one map one meaning -
  // because the defect was never a wrong value. It was one question answered two ways, and a
  // behavioural pin on one section kind cannot see a second answer reappearing.
  const RAW_READS = ['fact.targetSectionKind ' + '===', 'fact.targetSectionKind ' + '!=='];

  // ⛔ B-10 again, in the SECOND walker (2026-09-24). The fix recorded further down was applied to
  // that describe's walk only; this one still descended into `node_modules`, `dist` and `out`. On a
  // machine that has packaged the VS Code extension — `src/ext-vscode/node_modules` (3 764 .ts) plus
  // the compiled CLI under `nexpath-cli/dist` — this read ~5 000 files instead of ~1 000 and spent
  // the whole 5 s timeout doing it, failing as a phantom on developer machines and passing in CI.
  // Same exclusion, same reason; the walk is cached because the tree cannot change mid-run.
  const NOT_SOURCE_PROD = new Set(['node_modules', 'dist', 'out']);
  let productionFiles: string[] | undefined;

  function productionTs(): string[] {
    if (productionFiles) return productionFiles;
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        if (NOT_SOURCE_PROD.has(entry)) continue;
        const full = dir + '/' + entry;
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
      }
    };
    walk('src');
    productionFiles = out;
    return out;
  }

  it('all THREE readers in fact-value-render.ts go through the shared resolver, none reads the field raw', () => {
    const src = readFileSync('src/prompt-enhancement/fact-value-render.ts', 'utf8');
    const code = src.split('\n').filter((line) => {
      const t = line.trimStart();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    });
    expect(
      code.filter((line) => RAW_READS.some((raw) => line.includes(raw))),
      'a renderer reads the raw section key again - that IS §17.7, and the value it drops is silent',
    ).toEqual([]);
    // §17.7 measured THREE, not two: value lines, section model, and the grounded-values allow-list.
    // Fixing two of three desyncs the allow-list from the body, which permits a value no body carried.
    expect(
      src.split('promptEnhancementSectionKindForFactV1(').length - 1,
      'a reader stopped calling the shared resolver - one of the three is answering on its own again',
    ).toBe(3);
  });

  it('and the one raw reader left in production is INERT - its only producer names the kind explicitly', async () => {
    // Honest inventory rather than a claim of zero: the prose-copy lock in compose-enhancement still
    // compares the raw field. It is inert TODAY because of a fact about its producers, not because of
    // its own code - so the fact is asserted, not assumed.
    const rawReaders = productionTs().filter((f) => {
      const body = readFileSync(f, 'utf8');
      return RAW_READS.some((raw) => body.includes(raw));
    });
    expect(
      rawReaders,
      'a new production reader compares the raw section key - §17.7 has a second site now',
    ).toEqual(['src/prompt-enhancement/compose-enhancement.ts']);

    // The lock filters two source types. Only `content_template_record` has a production producer,
    // and it ships an explicit kind - so raw and resolved agree and nothing is skipped. The day that
    // producer ships '' instead, the lock silently stops checking the prose it exists to check.
    const store = await openStore(':memory:');
    const dir = tempProject();
    upsertProject(store, { projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now() });
    const { request } = driveChain(store, dir);
    const withTemplate = buildPromptEnhancementGuidanceFactsV1({
      ...request,
      sourceSignals: { ...request.sourceSignals, contentTemplateRecordFactRefs: ['content_template:debug_repro'] },
    });
    const templateFacts = withTemplate.filter((f) => f.sourceType === 'content_template_record');
    expect(templateFacts.length, 'no content-template fact was built - the lock has nothing to guard').toBe(1);
    expect(
      templateFacts[0].targetSectionKind,
      'the content-template producer stopped naming its section kind - the prose-copy lock now skips it',
    ).toBe('source_signal_guidance');
  });
});
