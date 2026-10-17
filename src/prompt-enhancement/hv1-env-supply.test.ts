import { describe, expect, it } from 'vitest';
import { openStore } from '../store/db.js';
import { upsertProject, getProjectEnvFacts, setProjectEnvFacts } from '../store/index.js';
import { probeProject } from '../env/env-probe.js';
import { resolveModeBand, ACTIVE_AGENT_ID, AGENT_CAPABILITIES } from '../env/agent-capabilities.js';
import { corroborationTierForEnvFact, ENV_FACT_CORROBORATOR } from '../env/env-tier-promotion.js';
import { recordEnvTrajectory } from '../env/env-trajectory.js';
import { appendParamEvent } from '../telemetry/param-events.js';
import { buildPromptEnhancementGroundingRefsV1 } from '../cli/commands/auto.js';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * HV-1 (dev-plan §14.2) — the check-1/check-2 measurements for rows 1 and 4, pinned.
 *
 * These are MEASUREMENTS, not fixes: §14.3's frame says a failure here is a bug against the owning
 * group and "H patches nothing". They exist so HV-3's verdict table judges the state that actually
 * shipped, and so the gap cannot quietly change — in either direction — before it is judged.
 *
 * The finding: the auto path PROBES the project every session (`recordEnvTrajectory`), and PE still
 * receives zero env facts, because the probe result is written to the trajectory store while PE
 * reads the env-facts store that only `nexpath env` writes.
 */

function sourceFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (statSync(full).isDirectory()) out.push(...sourceFilesUnder(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) out.push(full);
  }
  return out;
}

function allTsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = dir + '/' + entry;
    if (statSync(full).isDirectory()) out.push(...allTsFilesUnder(full));
    else if (entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

function projectWithATestRunner(): string {
  const dir = mkdtempSync(join(tmpdir(), 'hv1-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x', devDependencies: { vitest: '1.0.0' } }));
  return dir;
}

describe('HV-1 row 1 — env-probe crosses the boundary WITH values, when supplied', () => {
  it('stored env facts reach PE as refs carrying resolved values', async () => {
    // Check-2's prior state in §46.3c was "values dropped — keys only". A3 changed that, and this
    // pins the correction rather than leaving the table describing a boundary that no longer exists.
    const store = await openStore(':memory:');
    const dir = projectWithATestRunner();
    upsertProject(store, { projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now() });
    setProjectEnvFacts(store, dir, probeProject(dir, Date.now()).facts, Date.now());

    const refs = buildPromptEnhancementGroundingRefsV1(store, dir, []);
    expect(refs.sourceOnlyHardFactRefs.length).toBeGreaterThan(0);

    const firstRef = refs.sourceOnlyHardFactRefs[0]!;
    const evidence = refs.groundingEvidenceByRef[firstRef];
    expect(evidence, 'the ref crossed without its resolved payload').toBeDefined();
    expect(evidence?.key).toBeTruthy();
    expect(evidence?.runtimePath).toBeTruthy();
    expect(evidence?.anchorScope).toBeTruthy();
  });
});

describe('HV-1 rows 1+4 — the supply gap, pinned as measured', () => {
  it('the auto-path probe does NOT populate the store PE reads', async () => {
    // recordEnvTrajectory probes the project (env-trajectory.ts:82) — the same probe row 1 needs —
    // and writes setEnvTrajectory, a different store key from the setProjectEnvFacts PE reads.
    const store = await openStore(':memory:');
    const dir = projectWithATestRunner();
    upsertProject(store, { projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now() });

    recordEnvTrajectory(store, dir, {
      sessionId: 's', promptIndex: 0, stage: 'implementation', stageConfidence: 0.9,
    });

    expect(
      getProjectEnvFacts(store, dir),
      'if this is non-null the supply gap has been closed — update HV-1 and HV-3 rather than this line',
    ).toBeNull();
    expect(buildPromptEnhancementGroundingRefsV1(store, dir, []).sourceOnlyHardFactRefs).toEqual([]);
  });

  it('the same project WOULD supply ten facts if the probe were stored', async () => {
    // The contrast is the point: nothing is broken in the probe or the boundary. One store write
    // is missing, and this pins that the capability is otherwise whole.
    const dir = projectWithATestRunner();
    expect(Object.keys(probeProject(dir, Date.now()).facts).length).toBeGreaterThanOrEqual(10);
  });
});

describe('HV-1 row 1 — check-1 is about RUNNING, not existing', () => {
  // §46.3b: "the capability slots taught us 'exists' != 'runs'". §46.3c lists three consumers for
  // env-probe, and one of them — the DS `auto-template-generator` — holds its probe inside
  // `runAutogenForFire`, which has NO caller in source. The module IS imported by
  // SessionStateManager, for two unrelated functions, so an import-level check would have called
  // this consumer live. Only a CALLER check finds it.
  //
  // Pinned because a caller reappearing would change row 1's measured content, and the row should
  // be re-judged rather than left describing a state that moved.
  it('runAutogenForFire has no production caller — the DS probe consumer is dead', () => {
    const callers = sourceFilesUnder('src')
      .filter((file) => !file.endsWith('auto-template-generator.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes('runAutogenForFire'));
    expect(
      callers,
      'a production caller appeared — row 1 of §17.4 must be re-measured, not this line relaxed',
    ).toEqual([]);
  });

  it('but the module IS imported elsewhere — which is why an import check would have missed it', () => {
    const importers = sourceFilesUnder('src')
      .filter((file) => !file.endsWith('auto-template-generator.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes('auto-template-generator.js'));
    expect(importers.length).toBeGreaterThan(0);
  });
});

describe('HV-1 row 4 — the trajectory STATE is write-only; the MODULE never was', () => {
  // ⛔ CORRECTED (round 8). This block used to be titled "...and its listed consumer is wrong",
  // asserting that §46.3c was mistaken to name `trajectory-credit`. §46.3c was RIGHT. The check
  // below reads the IMPORT graph, and `trajectory-credit` consumes this module by matching the
  // `env_fact_changed:` signalKey PREFIX on the param-event lane — a coupling no import check can
  // see. Measured at round 5: a movement raises `test_creation` from 0.667 to 1.0.
  //
  // 🔑 The assertion itself is kept, because it is TRUE and it is the distinction the whole finding
  // turned on: the module has TWO outputs, and only ONE of them is unread. The stored baseline is
  // flap-damping bookkeeping — internal by design, and nobody outside should read it. Reading that
  // narrow fact as "the module feeds nothing" is what nearly got a live feature deleted.
  it('no production module reads the env-trajectory state', () => {
    const readers = sourceFilesUnder('src')
      // Exclude the two modules that DEFINE the state: env-trajectory writes it, and
      // store/env-facts.ts declares the accessor and the type. A consumer is a third party
      // that READS it — my first version counted the definition and failed on itself.
      .filter((file) => !file.endsWith('env-trajectory.ts') && !file.endsWith('store/env-facts.ts'))
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return text.includes('getEnvTrajectory') || text.includes('EnvTrajectoryState');
      });
    expect(
      readers,
      'a reader appeared — row 4 of §17.4 must be re-measured, not this line relaxed',
    ).toEqual([]);
  });

  it('trajectory-credit does not consume env-trajectory — the listed consumer is wrong', () => {
    const text = readFileSync('src/classifier/trajectory-credit.ts', 'utf8');
    expect(text).not.toContain("from './env-trajectory.js'");
    expect(text).not.toContain('../env/env-trajectory.js');
  });
});

describe('HV-1 row 1 — the consumer list is wrong in BOTH directions', () => {
  // Round 2 applied the caller-check downward and found a LISTED consumer that is dead
  // (`runAutogenForFire`). Round 4 applies it upward: is the list COMPLETE? It is not.
  // §46.3c names three consumers for env-probe (runtime-context · cli/env · DS autogen).
  // `engine-option-generator` is a fourth, it is live, and it is the one that matters most:
  // it feeds `promoteEnvFactsToTierP` — row 3's tier-promotion machinery, the plan's own
  // "🔴 standout". HV-2 writes row 3's row, and it should start from the true consumer set
  // rather than from a list that was never complete.
  it('engine-option-generator consumes env-probe and feeds the row-3 promotion', () => {
    const text = readFileSync('src/decision-session/engine-option-generator.ts', 'utf8');
    expect(text).toContain("from '../env/env-probe.js'");
    expect(text, 'the probe no longer feeds tier promotion — re-measure rows 1 and 3').toContain(
      'promoteEnvFactsToTierP(probeProject(',
    );
  });

  it('and it is reachable — composeDeterministicOptions has a production caller', () => {
    const callers = sourceFilesUnder('src')
      .filter((file) => !file.endsWith('engine-option-generator.ts'))
      .filter((file) => /composeDeterministicOptions\s*\(/.test(readFileSync(file, 'utf8')));
    expect(callers, 'this consumer went dead — row 1 must be re-measured').not.toEqual([]);
  });
});

describe('HV-1 row 5 — the two agent-self fields are ONE upstream signal', () => {
  // My round-1 row-5 cell cited `currentAgentMode` (auto.ts:440) and `permissionMode`
  // (auto.ts:513) as the evidence that PE already receives agent-about-itself context. Both are
  // assigned from the same expression, and that expression is itself the hook's `permission_mode`
  // (auto.ts:629). So PE receives one signal under two names, not two signals.
  //
  // The surfaced decision is unaffected — if anything the "new category" reading is stronger,
  // because capability facts (bands, registry, versions) would be the FIRST genuinely distinct
  // agent-self input. Pinned so the row's evidence line cannot silently become true or falser.
  it('both PE-facing fields are fed from the same auto input', () => {
    const text = readFileSync('src/cli/commands/auto.ts', 'utf8');
    expect(text).toContain("currentAgentMode: input.auto.currentAgentMode ?? 'unknown'");
    expect(text).toContain("permissionMode: input.auto.currentAgentMode ?? 'unknown'");
  });

  it('and that input is the hook permission_mode, so resolveModeBand is correctly fed', () => {
    const text = readFileSync('src/cli/commands/auto.ts', 'utf8');
    expect(text).toContain('typeof payload.permission_mode === \'string\' ? payload.permission_mode');
    // The registry keys ARE Claude Code's permission_mode values, which is why the naming
    // mismatch is not a behavioural defect: the band lookup resolves.
    expect(resolveModeBand(ACTIVE_AGENT_ID, 'plan')).toBe('plan');
    expect(resolveModeBand(ACTIVE_AGENT_ID, 'bypassPermissions')).toBe('execute');
    expect(resolveModeBand(ACTIVE_AGENT_ID, 'not_a_real_mode')).toBeUndefined();
  });
});

describe('HV-1 row 4 — step 2 asked WHICH auto path, and the answer is the PE one', () => {
  // §14.2 step 2: "measure WHICH `auto.ts` path consumes it". A line number is not a path, and
  // auto.ts has fifteen top-level exports. The consuming path is `runAuto` — and `runAuto` is the
  // SAME function that builds the PE request. So it is not two unrelated paths that happen to
  // miss each other: ONE function probes the project TWICE (buildRuntimeContext for row 1,
  // recordEnvTrajectory for row 4) and PE still receives zero env facts, because neither probe
  // lands in the store PE reads.
  function bodyOfRunAuto(): string {
    const text = readFileSync('src/cli/commands/auto.ts', 'utf8');
    const start = text.indexOf('export async function runAuto(');
    expect(start, 'runAuto was renamed — row 4 names it as the consuming path').toBeGreaterThan(-1);
    const next = text.indexOf('\nexport ', start + 1);
    return text.slice(start, next === -1 ? undefined : next);
  }

  it('runAuto is the auto path that consumes env-trajectory', () => {
    expect(bodyOfRunAuto()).toContain('recordEnvTrajectory(store, input.projectRoot,');
  });

  it('and the same path probes again for PE and builds the PE request', () => {
    const body = bodyOfRunAuto();
    expect(body, 'row 1 probe left runAuto — re-measure which path probes').toContain('buildRuntimeContext(');
    expect(body, 'the PE request left runAuto — the double-probe finding must be re-measured').toContain(
      'buildPromptEnhancementRequestForAuto({',
    );
  });
});

describe('HV-1 row 5 — task-mode-fit consumes the TYPE, not the runtime', () => {
  // My row-5 cell said resolveModeBand runs "in agent-mode-mismatch / task-mode-fit". It does not
  // run in task-mode-fit: that module imports only the ModeBand TYPE (erased at runtime) and
  // resolves its own band from a static per-stage table. agent-capabilities has exactly ONE
  // runtime consumer. The two meet inside agent-mode-mismatch, which calls both.
  it('task-mode-fit never calls resolveModeBand and imports the type only', () => {
    const text = readFileSync('src/classifier/task-mode-fit.ts', 'utf8');
    expect(text).not.toContain('resolveModeBand');
    expect(text).toContain("import type { ModeBand } from '../env/agent-capabilities.js'");
  });

  it('resolveModeBand has exactly one production caller', () => {
    const callers = sourceFilesUnder('src')
      .filter((file) => !file.endsWith('agent-capabilities.ts'))
      .filter((file) => /resolveModeBand\s*\(/.test(readFileSync(file, 'utf8')));
    expect(callers).toEqual(['src/classifier/agent-mode-mismatch.ts']);
  });

  it('and that caller is where the runtime band and the static band meet', () => {
    const text = readFileSync('src/classifier/agent-mode-mismatch.ts', 'utf8');
    expect(text).toContain('resolveModeBand(ACTIVE_AGENT_ID');
    expect(text).toContain('recommendedModeBandForStage(stage)');
  });
});

describe('HV-1 row 1 — the recorded COUNT and the word "each", pinned exactly', () => {
  // Row 1's cell says the boundary emits "10 refs each carrying {key,value,runtimePath,anchorScope}".
  // The round-1 fixture only asserted `length > 0` and inspected refs[0] — it could not have caught
  // a wrong count, nor a payload that most refs lack. Rounds 4 and 5 found two of my own recorded
  // claims wrong by checking them literally; this checks the quantitative one the same way.
  it('every ref carries a complete payload, and the count is the recorded one', async () => {
    const store = await openStore(':memory:');
    const dir = projectWithATestRunner();
    upsertProject(store, { projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now() });
    setProjectEnvFacts(store, dir, probeProject(dir, Date.now()).facts, Date.now());

    const refs = buildPromptEnhancementGroundingRefsV1(store, dir, []);
    const withoutPayload = refs.sourceOnlyHardFactRefs.filter((ref) => {
      const e = refs.groundingEvidenceByRef[ref];
      return !e || !e.key || !e.runtimePath || !e.anchorScope;
    });
    expect(withoutPayload, 'a ref crossed without its resolved payload — "each carrying" is false').toEqual([]);
    expect(
      refs.sourceOnlyHardFactRefs.length,
      'the ref count moved off the recorded 10 — update row 1 rather than this number',
    ).toBe(10);
  });
});

describe('HV-1 row 5 — what "partially live" means, measured per export', () => {
  // §14.2 step 3 says to measure the partially-live claim. Per export: ACTIVE_AGENT_ID is live in
  // two places, resolveModeBand in one, and AGENT_CAPABILITIES is read ONLY from inside
  // resolveModeBand — no external production consumer, and its `version` field is read nowhere.
  // So the capability DATA the wire decision is about is reachable today through exactly one band
  // lookup. That is the precise sense in which the module is partially live, and it is why wiring
  // capability facts would expose something PE has no access to at all today.
  it('AGENT_CAPABILITIES has no production consumer outside its own module', () => {
    const consumers = sourceFilesUnder('src')
      .filter((file) => !file.endsWith('agent-capabilities.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes('AGENT_CAPABILITIES'));
    expect(consumers).toEqual([]);
  });

  it('the registry version field is read nowhere in production', () => {
    const readers = sourceFilesUnder('src').filter((file) => {
      const text = readFileSync(file, 'utf8');
      return /AGENT_CAPABILITIES\[[^\]]*\]\??\.version|capabilities\.version/.test(text);
    });
    expect(readers, 'a version reader appeared — row 5 must be re-measured').toEqual([]);
  });

  it('ACTIVE_AGENT_ID is live in exactly the two measured places', () => {
    const consumers = sourceFilesUnder('src')
      .filter((file) => !file.endsWith('agent-capabilities.ts'))
      .filter((file) => readFileSync(file, 'utf8').includes('ACTIVE_AGENT_ID'));
    expect(consumers.sort()).toEqual([
      'src/classifier/agent-mode-mismatch.ts',
      'src/cli/commands/auto.ts',
    ]);
  });
});

describe('HV-1 round 7/8/9 — no source file, test or production, is invisible to text grep', () => {
  // Round 7 found two files that `grep` classified as BINARY and skipped: they embedded a RAW NUL
  // byte as a composite-key separator instead of the `\u0000` escape. This phase's method is
  // consumer sweeps, so every shell sweep in rounds 2-6 had a silent two-file blind spot, and
  // `right-good-aggregator` is ROW 7 of the eleven modules HV-2 must sweep.
  //
  // Round 8 fixed it on the owner's explicit go-ahead (it is another group's source, which §14.3
  // otherwise bars H from patching). The escape emits the identical character — verified on the
  // BUILT output, not assumed: dist carries `\u0000`, which evaluates to charCode 0. Worth noting
  // that the two modules' own 42 tests do NOT cover the separator (replacing it with a printable
  // string leaves them green), so the proof had to come from the emitted string.
  it('no source file carries a raw NUL byte — TESTS INCLUDED', () => {
    // Round 9: the round-8 guard walked sourceFilesUnder(), which SKIPS .test.ts — yet the sweeps it
    // protects routinely read test files. Round 2's entire finding was that `runAutogenForFire`
    // appears ONLY in its own test file; had that file been grep-invisible, the module would have
    // looked live and the dead-code finding would have been missed. The guard must cover tests too.
    const everyTsFile = allTsFilesUnder('src');
    expect(
      everyTsFile.length,
      'the widened walk found no more files than the production-only walk — it is not covering tests',
    ).toBeGreaterThan(sourceFilesUnder('src').length);
    const invisible = everyTsFile.filter((file) => readFileSync(file, 'utf8').includes('\u0000'));
    expect(
      invisible,
      'a file became grep-invisible again — every consumer sweep, including HV-2 row 7, silently under-reports',
    ).toEqual([]);
  });

  it('the two former offenders still separate their composite keys with the NUL escape', () => {
    // The escape must SURVIVE, not just the raw byte be gone: dropping the separator entirely
    // would collapse distinct keys, which is a behaviour change the 42 tests would not catch.
    const agg = readFileSync('src/classifier/right-good-aggregator.ts', 'utf8');
    expect(agg).toContain('`${sessionId}\\u0000${promptIndex}`');
    const eff = readFileSync('src/telemetry/variant-effect.ts', 'utf8');
    expect(eff).toContain('`${projectRoot}\\u0000${signalKey}`');
  });

  it('and the escape is the NUL character, so the runtime string is unchanged', () => {
    expect('\u0000'.charCodeAt(0)).toBe(0);
  });
});

describe('HV-1 row 4 — trajectory-credit has FOUR exports, not one', () => {
  // Round 3 recorded "its only export takes ParamEvent[]" as the reason it cannot consume
  // env-trajectory. The conclusion holds, but the stated fact does not: there are four exports.
  // The argument that survives is the one this pins — none of them touches env-trajectory.
  it('all four exports are present and none references env-trajectory', () => {
    const text = readFileSync('src/classifier/trajectory-credit.ts', 'utf8');
    for (const name of ['MOVEMENT_CREDIT', 'MOVEMENT_CREDIT_MAP', 'MovementExtraction', 'extractMovementCredits']) {
      expect(text, `export ${name} disappeared — re-measure row 4`).toContain(name);
    }
    expect(text).not.toContain('EnvTrajectory');
    expect(text).not.toContain('recordEnvTrajectory');
  });

  it('extractMovementCredits is called from right-good-aggregator, read NUL-safely', () => {
    // The caller lives in one of the grep-invisible files, so this must be read, not grepped.
    const text = readFileSync('src/classifier/right-good-aggregator.ts', 'utf8');
    expect(text).toContain('extractMovementCredits(applyWindow(events, opts))');
  });
});

describe('deferred-task notes §30 — the claims that document makes about source', () => {
  // §30 is the write-up of the deferred agent-capability wire. It is read COLD by whoever builds
  // that wire, so its statements about today's code have to be true when they read it, not just
  // when I wrote them. Round 12 found three of them wrong or unsupported and corrected the file;
  // these assertions are what stops the corrected versions from drifting.

  it('grounding today is NOT project-only — user-scoped anchors are in use', () => {
    // The first draft said every grounding fact answers "what is true about the user's PROJECT".
    // Work-style traits cross anchored to the USER's longitudinal behaviour, so the subject of
    // today's grounding is the user AND their project. The agent is still a new subject, which is
    // what §30's category argument actually rests on.
    const auto = readFileSync('src/cli/commands/auto.ts', 'utf8');
    expect(auto).toContain("anchorScope: 'longitudinal_user_behavior'");
  });

  it('a `capability` tier already exists, and is defined for a true-valued env fact', () => {
    // The first draft said the tier machinery "was built for observed/promoted evidence", which
    // would tell a cold reader no suitable tier exists. One does — the open question is whether an
    // agent-capability fact belongs in it, not whether the concept is missing.
    expect(corroborationTierForEnvFact({ key: 'has_test_runner', value: true } as never)).toBe('capability');
    expect(corroborationTierForEnvFact({ key: 'has_test_runner', value: false } as never)).toBe('uncorroborated');
    expect(corroborationTierForEnvFact({ key: 'has_test_runner', value: true, tier: 'P' } as never))
      .toBe('promoted_practice_P');
  });

  it('but no corroborator maps an AGENT fact — every entry is an env capability', () => {
    // `capability` is reachable only for env facts, and promotion to practice-grade runs through
    // this table. An agent-capability fact has no behavioural corroborator, which is the real
    // obstacle §30 should hand to whoever builds the wire.
    const keys = Object.keys(ENV_FACT_CORROBORATOR);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(key.startsWith('has_')).toBe(true);
    expect(keys.some((k) => k.includes('agent') || k.includes('mode'))).toBe(false);
  });

  it('the authority gate judges WORDING MODE, so it does not model an agent-self statement', () => {
    // The first draft asserted the safety layers "were not designed against agent-self claims"
    // without checking. They do carry authority machinery — it classifies the produced wording as
    // plan/review vs execute vs observe, against the request's own mode. A sentence describing the
    // agent's permission state is none of those three, which is the precise gap, and precise is
    // what a cold reader needs.
    const auth = readFileSync('src/prompt-enhancement/authority-consistency.ts', 'utf8');
    expect(auth).toContain("| 'plan_or_review'");
    expect(auth).toContain("| 'execute_requested'");
    expect(auth).toContain("| 'observe_or_literal'");
    expect(auth, 'an agent-self authority value appeared — §30 point 3 must be re-measured')
      .not.toContain('agent_self');
  });
});

describe('row 5 — what the mode registry can and cannot be said to prove', () => {
  // Rounds 6 and 11 both recorded that the registry's keys "ARE Claude Code's permission_mode
  // values". ⛔ That is not verifiable from this repo: the registry is the ONLY source for the list
  // here — the test files that mention `acceptEdits`/`bypassPermissions` were written FROM it, not
  // against any published schema. §46.3b's warning is "measure, never assume", and that claim was
  // an assumption about an external system dressed as a measurement.
  //
  // What IS verifiable is pinned here, and it is the part the wire-builder actually needs.

  it('the registry recognises exactly these six modes', () => {
    expect(Object.keys(AGENT_CAPABILITIES[ACTIVE_AGENT_ID]!.modes).sort()).toEqual([
      'acceptEdits', 'auto', 'bypassPermissions', 'default', 'dontAsk', 'plan',
    ]);
  });

  it('an unrecognised mode resolves to undefined SILENTLY — no throw, no signal', () => {
    // This is the consequence that matters and the reason the unverified claim was worth
    // correcting: if the agent ever reports a mode outside the six, the band is simply absent.
    // Nothing errors and nothing is logged, so a registry that has drifted from the agent looks
    // exactly like a session with no mode at all.
    expect(() => resolveModeBand(ACTIVE_AGENT_ID, 'a_mode_added_next_release')).not.toThrow();
    expect(resolveModeBand(ACTIVE_AGENT_ID, 'a_mode_added_next_release')).toBeUndefined();
    expect(resolveModeBand('some-other-agent', 'plan')).toBeUndefined();
    expect(resolveModeBand(ACTIVE_AGENT_ID, undefined)).toBeUndefined();
  });

  it('and the value fed to it IS the hook permission_mode — that part IS source-verified', () => {
    // The naming mismatch (a permission mode carried in a field called currentAgentMode) is not a
    // behavioural defect, and this is why: the value's KIND is right. That conclusion never
    // depended on the registry being exhaustive, so it survives the correction above.
    const auto = readFileSync('src/cli/commands/auto.ts', 'utf8');
    expect(auto).toContain('typeof payload.permission_mode === \'string\' ? payload.permission_mode');
  });
});

describe('§46.3c — the analysis table HV-2 will read must carry HV-1\'s corrections', () => {
  // Round 15: §46.3c lives in the ANALYSIS file, is headed "consumers MEASURED", and its preamble
  // says "grep-measured, not assumed". Three of its eleven consumer cells were wrong — and HV-2
  // (the next phase) writes all eleven rows FROM that table. The corrections were recorded in
  // dev-plan §17.4, i.e. not where HV-2 would look.
  //
  // Root cause worth keeping: "grep-measured" meant IMPORTERS, not CALLERS. A module can be
  // imported and never run, and it can be listed as a consumer while importing nothing from its
  // supposed source. This pins that the annotations survive in the file HV-2 reads.
  const ANALYSIS =
    'lib/shared/sub-module/nexpath-prompt-enhancement-submodule/docs/dev/' +
    'user-experience-improvements-sub-11-prompt-enhancement-intent-family-routing-misses-debug-intents-analysis.md';

  it('the analysis file is present', () => {
    expect(existsSync(ANALYSIS), `not found at ${ANALYSIS}`).toBe(true);
  });

  it('§46.3c carries the HV-1 correction banner and the caller-check instruction', () => {
    const text = readFileSync(ANALYSIS, 'utf8');
    expect(text).toContain('CORRECTED BY HV-1');
    expect(
      text,
      'the caller-check instruction vanished — HV-2 would inherit the wrong consumer lists again',
    ).toContain('caller-check every entry, do not inherit any of them');
  });

  it('each of the consumer cells HV-1 corrected is annotated — and the one it got WRONG is annotated back', () => {
    const text = readFileSync(ANALYSIS, 'utf8');
    // row 1: a dead listed consumer, and a live one that was missing
    expect(text).toContain('runAutogenForFire');
    expect(text).toContain('engine-option-generator.ts:132');
    // row 5: a type-only import counted as a runtime consumer
    expect(text).toContain('TYPE-ONLY');

    // ⛔ Row 4 was the third "correction" and it was itself WRONG. HV-1 struck `trajectory-credit`
    // out of the consumer list on the grounds that it imports nothing from `env-trajectory` — but
    // the coupling is a signalKey PREFIX, which no import graph can see. §46.3c was right.
    //
    // This assertion is inverted rather than deleted on purpose: the strikeout is the exact mistake
    // the caller-check instruction above exists to prevent, and a deleted assertion teaches nobody.
    expect(
      text.includes('NONE of its four exports touches env-trajectory'),
      'the row-4 strikeout is back — it measured the IMPORT graph, and the coupling is a string prefix',
    ).toBe(false);
    expect(
      text,
      'row 4 lost the correction of its correction — HV-2 would inherit "feeds nothing" again',
    ).toContain('DOES consume this module');
  });
});

describe('§46.3c — the PRE-FIX BASELINE must survive every annotation', () => {
  // Round 16: §14.1 calls §46.3c the pre-fix state, and §14.4 step 1 has HV-3 filing each red row
  // "with the §46.3c row as its baseline". Round 15's annotations OVERWROTE those baseline cells
  // for rows 1, 4 and 5 — which would have left HV-3 with nothing to file against for three of the
  // eleven modules. Round 14 had already established the right treatment on the workings file
  // (mark superseded, never erase) and round 15 failed to carry it here.
  //
  // These are the exact strings the table carried before HV-1 measured anything. They are the
  // baseline, so they are pinned as literals rather than described.
  const ANALYSIS =
    'lib/shared/sub-module/nexpath-prompt-enhancement-submodule/docs/dev/' +
    'user-experience-improvements-sub-11-prompt-enhancement-intent-family-routing-misses-debug-intents-analysis.md';

  const BASELINE_CELLS = [
    'run on PE path? verify',
    'values dropped — keys only',
    'verify which auto path',
    'unknown — measure',
    'partially live (mode fields)',
    'not in grounding refs — decide if it should be',
  ];

  it('every pre-fix baseline cell for rows 1, 4 and 5 is still present verbatim', () => {
    const text = readFileSync(ANALYSIS, 'utf8');
    const lost = BASELINE_CELLS.filter((cell) => !text.includes(cell));
    expect(
      lost,
      'a baseline cell was overwritten — HV-3 files its red rows against these, so they cannot be replaced by the answer',
    ).toEqual([]);
  });

  it('and the mark-do-not-erase convention is stated in the table itself', () => {
    const text = readFileSync(ANALYSIS, 'utf8');
    expect(text).toContain('THE BASELINE IS PRESERVED, NEVER OVERWRITTEN');
  });
});

describe('§17.10 — a GREEN pipe over an EMPTY supply (HV-3 row 1)', () => {
  // HV-2 marked row 1's checks 2/3/4 green unconditionally. They are conditional: they hold when
  // the env-facts store is supplied, and nothing on the auto path supplies it — the only
  // production caller of `setProjectEnvFacts` is the manual `nexpath env` command.
  //
  // A reader of three green checks concludes env grounding works. On a default project it produces
  // nothing, which is exactly how this survived: the pipe is sound and the supply is absent, and
  // the five-check protocol only asks about the pipe.
  //
  // This pins the DEFAULT state — no seeding, no manual command — so the row's condition cannot
  // quietly become unconditional in either direction.
  it('an unseeded project crosses, carries and renders NOTHING from env facts', async () => {
    const store = await openStore(':memory:');
    const dir = projectWithATestRunner();
    upsertProject(store, { projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now() });
    // ⛔ Deliberately NOT calling setProjectEnvFacts — that is the whole point.

    const refs = buildPromptEnhancementGroundingRefsV1(store, dir, []);
    expect(refs.sourceOnlyHardFactRefs, 'an unseeded project produced env refs').toEqual([]);
    expect(Object.keys(refs.groundingEvidenceByRef ?? {}).filter((k) => k.startsWith('hard_fact:'))).toEqual([]);
  });

  it('and the auto path still has NO writer — the invariant §17.10 actually rests on', () => {
    // ⚠️ The assertion above pins the BOUNDARY (empty store ⇒ no refs) and cannot see the auto path
    // at all: it calls the refs builder directly. A mutation that made `runAuto` write env facts
    // left it green — the fixture claimed to notice §17.10 closing and could not.
    //
    // The invariant that actually carries the record is a CALLER fact, so it is asserted as one:
    // `setProjectEnvFacts` has exactly ONE production caller, the manual `nexpath env` command. The
    // day the auto path gains one, §17.10 is closed and row 1 must be re-judged.
    const callers = allTsFilesUnder('src')
      .filter((f) => !f.endsWith('.test.ts'))
      .filter((f) => !f.endsWith('store/env-facts.ts') && !f.endsWith('store/index.ts'))
      .filter((f) => /setProjectEnvFacts\s*\(/.test(readFileSync(f, 'utf8')));
    expect(
      callers,
      'a second writer appeared — §17.10 may be closed; re-judge row 1 rather than relaxing this',
    ).toEqual(['src/cli/commands/env.ts']);
  });

  it('and the same project WOULD cross ten refs the moment the manual command supplies it', async () => {
    // The contrast is the finding: one store write separates "renders nothing" from "renders ten
    // grounded values". Nothing about the pipe needs fixing.
    const store = await openStore(':memory:');
    const dir = projectWithATestRunner();
    upsertProject(store, { projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now() });
    setProjectEnvFacts(store, dir, probeProject(dir, Date.now()).facts, Date.now());

    expect(buildPromptEnhancementGroundingRefsV1(store, dir, []).sourceOnlyHardFactRefs.length).toBe(10);
  });
});

describe('§17.11 — row 4 was RULED (wire it), and the ruling rests on a corrected measurement', () => {
  // ⛔ These two fixtures replace the pair written in round 3, which pinned "the module runs and
  // NOTHING reads what it writes" as the basis of a pending decision. The second half was wrong,
  // and it was wrong in a way worth keeping visible: it asked who IMPORTS `getEnvTrajectory`,
  // while the module's other output — an `env_fact_changed` param event — was already consumed by
  // `trajectory-credit` through a signalKey PREFIX. No import graph can see a string prefix.
  //
  // So the pins below follow the DATA both ways, because that is the check that was missing.
  it('the probe still runs on the live path — the cost side of the ruling', () => {
    const auto = readFileSync('src/cli/commands/auto.ts', 'utf8');
    expect(
      /\brecordEnvTrajectory\s*\(/.test(auto),
      'the per-session probe is gone, but §17.11 was ruled WIRE IT — the movement lane has no source now',
    ).toBe(true);
  });

  it('and its movements still reach BOTH consumers — the score credit AND the grounding line', () => {
    // Consumer 1 (pre-existing, and the one the "write-only" measurement missed): the credit path.
    const credit = readFileSync('src/classifier/trajectory-credit.ts', 'utf8');
    expect(
      credit.includes('env_fact_changed:'),
      'the credit path stopped matching the event key — trajectory silently stops crediting practices',
    ).toBe(true);
    const aggregator = readFileSync('src/classifier/right-good-aggregator.ts', 'utf8');
    expect(
      aggregator.includes('extractMovementCredits'),
      'the aggregator dropped movement credit — that is a live feature, not dead weight',
    ).toBe(true);

    // Consumer 2 (the §17.11 ruling): the same events reach the grounding section as a sentence.
    const auto = readFileSync('src/cli/commands/auto.ts', 'utf8');
    expect(
      auto.includes('recentEnvChangesV1'),
      'the movement grounding lane is gone — §17.11 was ruled WIRE IT; re-open the record, do not relax this',
    ).toBe(true);
  });
});

describe('§17.10 — what is still missing is the VALUES, not the section (corrected round 8)', () => {
  // §17.10 said an unseeded project has grounding that is "live, correct, and permanently empty".
  // The §17.11 ruling made the second half false: the auto path probes every session, and since
  // round 5 a confirmed movement crosses on its own lane and renders. The bug did not close --
  // it NARROWED, and the difference matters to whoever picks it up. Filing "the section is
  // always empty" against group A points at the wrong thing now.
  //
  // The two halves are pinned apart here so neither can be read as the other.
  it('an unseeded project still yields NO probe VALUES, yet CAN yield a movement line', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'hv1-split-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
    const store = await openStore(join(dir, 'store.db'));
    upsertProject(store, { projectRoot: dir, name: 'x', projectType: 'app', language: 'ts', description: '', createdAt: Date.now() });

    // No `nexpath env` was ever run -- `setProjectEnvFacts` is untouched.
    appendParamEvent(store, {
      projectRoot: dir, sessionId: 's1', promptIndex: 0,
      signalKey: 'env_fact_changed:has_ci_pipeline:acquired', channel: 'probe',
      stage: 'implementation', stageConfidence: 0.9, source: 'live', ts: Date.now(),
    });

    const refs = buildPromptEnhancementGroundingRefsV1(store, dir, []);

    // Half one -- STILL THE BUG. The probe's current values never reach PE without the manual command.
    expect(
      refs.sourceOnlyHardFactRefs,
      'the auto path started supplying probe VALUES -- §17.10 is closed; re-judge row 1 rather than relaxing this',
    ).toEqual([]);

    // Half two -- NO LONGER TRUE of the section. A movement supplies grounding with no `nexpath env`.
    expect(
      refs.rightGoodWorkStyleEnvRuntimeRefs.filter((r) => r.startsWith('env_change:')),
      'the movement lane stopped supplying an unseeded project -- §17.10 would be back to "permanently empty"',
    ).toEqual(['env_change:has_ci_pipeline']);
  });
});
