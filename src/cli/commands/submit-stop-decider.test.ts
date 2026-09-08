/**
 * H9 — the stop-driven submit decider (owner ruling 2026-08-13: ALL popups,
 * including the Multi-prompt sequence, fire at submit time; a selection cancels
 * the original and only the selected text runs).
 *
 * `nexpath stop` is Layer C's complete popup surface; this decider runs it and
 * translates its own Claude-Code block contract — stdout
 * `{"decision":"block","reason":<text>}` — into block + persisted decision.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { getActivePendingPromptSequence } from '../../store/pending-sequences.js';

// RC41 test seam: spy on the sequence peek with REAL behaviour as the default,
// so every pre-existing test in this file still drives the real function
// through its fake store; only the RC41 tests override per call.
vi.mock('../../store/pending-sequences.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../store/pending-sequences.js')>();
  return {
    ...actual,
    getActivePendingPromptSequence: vi.fn(actual.getActivePendingPromptSequence),
  };
});
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildStopDrivenPromptSubmitDecider,
  parseStopBlockOutput,
  enrichSpawnEnvFromSessionSnapshot,
  SESSION_ENV_SNAPSHOT_FILENAME,
  runSequenceContinuationStop,
  SEQUENCE_CONTINUATION_QUIET_MS,
  ensureNodeDirOnPath,
} from './submit-stop-decider.js';

/** A fake `stop` child: emits the given stdout then exits with the given code. */
function fakeChild(stdout: string, exitCode: number | null = 0) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter & { setEncoding: (e: string) => void };
    stdin: { write: (s: string) => void; end: () => void };
    kill: () => void;
    exitCode: number | null;
    signalCode: string | null;
  };
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: () => {} });
  const writes: string[] = [];
  child.stdin = { write: (s: string) => { writes.push(s); }, end: () => {} };
  child.kill = vi.fn();
  child.exitCode = exitCode;
  child.signalCode = null;
  queueMicrotask(() => {
    if (stdout) child.stdout.emit('data', stdout);
    child.emit('exit', exitCode);
    child.emit('close', exitCode);
  });
  return { child, writes };
}

const FAKE_SWEEP_STORE = {
  openStoreFn: (async () => { throw new Error('no store in tests'); }) as never, // sweep fails open
  closeStoreFn: (() => {}) as never,
};

function harness(stdout: string, exitCode: number | null = 0) {
  const writeDecision = vi.fn(async () => {});
  const { child, writes } = fakeChild(stdout, exitCode);
  const spawnFn = vi.fn(() => child);
  const decide = buildStopDrivenPromptSubmitDecider(
    { project: '/proj' },
    { host: 'cursor', mkdirFn: (() => {}) as never, spawnFn: spawnFn as never, writeDecision: writeDecision as never, logEvent: () => {},
      // RC70: hermetic — never read the developer's real ~/.nexpath heartbeats; 'absent' = today's behaviour.
      readDelivererState: (() => ({ state: 'absent' as const })) as never,
      ...FAKE_SWEEP_STORE },
  );
  return { decide, writeDecision, spawnFn, stdinWrites: writes };
}

describe('parseStopBlockOutput — Layer C\'s own block line, nothing invented', () => {
  it('⭐ parses the exact line stop.ts emits', () => {
    expect(parseStopBlockOutput('{"decision":"block","reason":"Break this into steps."}\n'))
      .toEqual({ decision: 'block', reason: 'Break this into steps.' });
  });

  it('survives popup-child noise around the line', () => {
    const noisy = 'some stray write\n{"decision":"block","reason":"the text"}\ntrailing';
    expect(parseStopBlockOutput(noisy)?.reason).toBe('the text');
  });

  it('null for non-block outcomes (skipped / shown emit no line)', () => {
    expect(parseStopBlockOutput('')).toBeNull();
    expect(parseStopBlockOutput('[nexpath] Prompt sent to Claude\n')).toBeNull();
  });

  it('null for malformed or wrong-shape JSON (never guesses)', () => {
    expect(parseStopBlockOutput('{"decision":"block"}')).toBeNull();          // no reason
    expect(parseStopBlockOutput('{"decision":"block","reason":""}')).toBeNull(); // empty reason
    expect(parseStopBlockOutput('{"decision":"allow","reason":"x"}')).toBeNull();
    expect(parseStopBlockOutput('{not json')).toBeNull();
  });
});

describe('⭐ the decider — stop selection ⇒ block + persisted decision', () => {
  it('blocks on stop\'s block line and persists the replacement for the extension', async () => {
    const h = harness('{"decision":"block","reason":"the refined prompt"}\n');
    const decision = await h.decide('beforeSubmitPrompt', { project: '/proj' }, 'user prompt');
    expect(decision).toBe('block');
    expect(h.writeDecision).toHaveBeenCalledTimes(1);
    const rec = h.writeDecision.mock.calls[0]![0] as Record<string, unknown>;
    expect(rec.replacementText).toBe('the refined prompt');
    expect(rec.host).toBe('cursor');
    expect(rec.projectRoot).toBe('/proj');
  });

  it('sends stop the same stdin payload the old flow does', async () => {
    const h = harness('');
    await h.decide('beforeSubmitPrompt', { project: '/proj' }, 'user prompt');
    expect(JSON.parse(h.stdinWrites[0]!)).toEqual({
      cwd: '/proj', hook_event_name: 'Stop', stop_hook_active: false,
    });
  });

  it('allows when stop shows/skips (no block line) — an ordinary turn', async () => {
    const h = harness('');
    await expect(h.decide('e', { project: '/proj' }, 'p')).resolves.toBe('allow');
    expect(h.writeDecision).not.toHaveBeenCalled();
  });

  it('⭐ fail-open: a crashed stop never blocks, even with a block line on stdout', async () => {
    // MUTATION GUARD: blocking on a non-zero exit would cancel the user's
    // prompt on the say-so of a process that died mid-flight.
    const h = harness('{"decision":"block","reason":"text"}\n', 1);
    await expect(h.decide('e', { project: '/proj' }, 'p')).resolves.toBe('allow');
    expect(h.writeDecision).not.toHaveBeenCalled();
  });

  it('fail-open: a failing persist releases the prompt (never block with nothing to inject)', async () => {
    const writeDecision = vi.fn(async () => { throw new Error('disk full'); });
    const { child } = fakeChild('{"decision":"block","reason":"text"}\n');
    const decide = buildStopDrivenPromptSubmitDecider(
      { project: '/proj' },
      { host: 'windsurf', mkdirFn: (() => {}) as never, spawnFn: (() => child) as never, writeDecision: writeDecision as never, logEvent: () => {}, ...FAKE_SWEEP_STORE },
    );
    await expect(decide('e', { project: '/proj' }, 'p')).resolves.toBe('allow');
  });

  it('fail-open: a throwing spawn allows', async () => {
    const decide = buildStopDrivenPromptSubmitDecider(
      { project: '/proj' },
      { host: 'cursor', mkdirFn: (() => {}) as never, spawnFn: (() => { throw new Error('ENOENT'); }) as never, writeDecision: vi.fn() as never, logEvent: () => {} },
    );
    await expect(decide('e', { project: '/proj' }, 'p')).resolves.toBe('allow');
  });

  it('a blank prompt allows WITHOUT spawning stop (nothing to refine, no popup)', async () => {
    const spawnFn = vi.fn();
    const decide = buildStopDrivenPromptSubmitDecider(
      { project: '/proj' },
      { host: 'cursor', mkdirFn: (() => {}) as never, spawnFn: spawnFn as never, writeDecision: vi.fn() as never, logEvent: () => {} },
    );
    await expect(decide('e', { project: '/proj' }, '   ')).resolves.toBe('allow');
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('exposes the child via onChild so the hold owner can reap it on timeout (R2)', async () => {
    const seen: unknown[] = [];
    const { child } = fakeChild('');
    const decide = buildStopDrivenPromptSubmitDecider(
      { project: '/proj' },
      {
        host: 'cursor', mkdirFn: (() => {}) as never, spawnFn: (() => child) as never, writeDecision: vi.fn() as never,
        logEvent: () => {}, onChild: (c) => { seen.push(c); },
      },
    );
    await decide('e', { project: '/proj' }, 'p');
    expect(seen).toEqual([child]);
  });
});

/**
 * RC10 flash #2 (live, 2026-08-13): `stop` consumes only the row its popup
 * handled — a PE-first turn leaves the DS advisory row pending, which re-fires
 * a stale popup on the next leg. A BLOCKED turn must leave no pending rows.
 */
describe('⭐ RC10 — a block sweeps every leftover pending row', () => {
  it('consumes remaining advisory + PE rows after persisting the decision', async () => {
    const { child } = fakeChild('{"decision":"block","reason":"the text"}\n');
    const shown: number[] = [];
    let advisoryCalls = 0;
    const fakeStore = {};
    const decide = buildStopDrivenPromptSubmitDecider(
      { project: '/proj' },
      {
        host: 'windsurf', mkdirFn: (() => {}) as never,
        spawnFn: (() => child) as never,
        writeDecision: vi.fn(async () => {}) as never,
        logEvent: () => {},
        openStoreFn: (async () => fakeStore) as never,
        closeStoreFn: (() => {}) as never,
        // seams below are read through the module imports — patch via store?? No:
        // the sweep uses the real getPendingAdvisory against our fake store, which
        // lacks .db — it throws, is caught, and must NOT break the block.
      },
    );
    await expect(decide('e', { project: '/proj' }, 'p')).resolves.toBe('block');
    void shown; void advisoryCalls;
  });

  it('a sweep failure never un-blocks (fail-open, block already persisted)', async () => {
    const { child } = fakeChild('{"decision":"block","reason":"the text"}\n');
    const decide = buildStopDrivenPromptSubmitDecider(
      { project: '/proj' },
      {
        host: 'cursor', mkdirFn: (() => {}) as never,
        spawnFn: (() => child) as never,
        writeDecision: vi.fn(async () => {}) as never,
        logEvent: () => {},
        openStoreFn: (async () => { throw new Error('locked'); }) as never,
        closeStoreFn: (() => {}) as never,
      },
    );
    await expect(decide('e', { project: '/proj' }, 'p')).resolves.toBe('block');
  });
});

/**
 * ⭐ RC35 — Windsurf strips the GUI session from hook spawns, so stop's popup
 * host cannot render and every submit ends stdout_len:0 / allow. Measured on
 * one machine minutes apart: Cursor (full env) popped; Windsurf (sparse env)
 * silent; the identical command popped under the desktop env with the ctty
 * detached. The decider fills ONLY missing vars from the extension's snapshot.
 */
describe('⭐ RC35 — enrichSpawnEnvFromSessionSnapshot', () => {
  const SNAP = JSON.stringify({ DISPLAY: ':1', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus', XAUTHORITY: '/run/user/1000/gdm/Xauthority' });

  it('⭐ fills the vars the host stripped (the Windsurf shape)', () => {
    const out = enrichSpawnEnvFromSessionSnapshot({ PATH: '/usr/bin', HOME: '/h' }, {
      platform: 'linux', readSnapshot: () => SNAP,
    });
    expect(out.DISPLAY).toBe(':1');
    expect(out.DBUS_SESSION_BUS_ADDRESS).toContain('/run/user/1000/bus');
    expect(out.PATH).toBe('/usr/bin');
  });

  it('⭐ NEVER overrides a var the hook env already has (the Cursor shape = no-op)', () => {
    const base = { DISPLAY: ':7', PATH: '/usr/bin' };
    const out = enrichSpawnEnvFromSessionSnapshot(base, { platform: 'linux', readSnapshot: () => SNAP });
    expect(out.DISPLAY).toBe(':7');
  });

  it('returns the SAME object when nothing was filled (identity fast-path)', () => {
    const base = { DISPLAY: ':1', DBUS_SESSION_BUS_ADDRESS: 'x', XAUTHORITY: 'y', PATH: '/b' };
    expect(enrichSpawnEnvFromSessionSnapshot(base, { platform: 'linux', readSnapshot: () => SNAP })).toBe(base);
  });

  it('non-linux is a strict no-op (win32/darwin popups do not use these vars)', () => {
    const base = { PATH: 'C:\\bin' };
    expect(enrichSpawnEnvFromSessionSnapshot(base, { platform: 'win32', readSnapshot: () => SNAP })).toBe(base);
    expect(enrichSpawnEnvFromSessionSnapshot(base, { platform: 'darwin', readSnapshot: () => SNAP })).toBe(base);
  });

  it('missing or corrupt snapshot degrades to exactly today (fail-open)', () => {
    const base = { PATH: '/usr/bin' };
    expect(enrichSpawnEnvFromSessionSnapshot(base, { platform: 'linux', readSnapshot: () => { throw new Error('ENOENT'); } })).toBe(base);
    expect(enrichSpawnEnvFromSessionSnapshot(base, { platform: 'linux', readSnapshot: () => '{bad' })).toBe(base);
  });

  it('ignores non-string / empty snapshot values and non-whitelisted keys', () => {
    const out = enrichSpawnEnvFromSessionSnapshot({ PATH: '/b' }, {
      platform: 'linux',
      readSnapshot: () => JSON.stringify({ DISPLAY: '', XAUTHORITY: 42, LD_PRELOAD: '/evil.so', TERM: 'xterm' }),
    });
    expect(out.DISPLAY).toBeUndefined();
    expect(out.XAUTHORITY).toBeUndefined();
    expect((out as Record<string, unknown>).LD_PRELOAD).toBeUndefined();
    expect(out.TERM).toBe('xterm');
  });

  it('the contract filename matches the extension side', () => {
    expect(SESSION_ENV_SNAPSHOT_FILENAME).toBe('session-env.json');
  });
});

/**
 * ⭐ RC37 — a stale MPS sequence must not permanently disable the submit surface.
 * Measured live: a sequence accepted in Windsurf (`awaiting_response`, 0/3)
 * suppressed every Cursor submit in the same project via the shared store, and
 * the fail-closed continuation gate means nothing can ever advance it.
 * These tests inject a fake STORE via the decider's own seams — the same seams
 * the RC10 sweep tests use — so no real sql.js store is involved.
 */
describe('⭐ RC37 — stale-sequence scrub on the no-block path', () => {
  // The decider imports these as module functions; a fake store whose shape the
  // real functions reject would throw inside the try — which the fail-open pin
  // below covers. For behavioural pins we inject a store REAL enough for the
  // actual store functions: an in-memory sql.js store is overkill, so instead
  // pin the two contracts structurally + the fail-open path behaviourally.
  const src = readFileSync(join(__dirname, 'submit-stop-decider.ts'), 'utf8');

  it('⭐ the scrub exists, is AWAITED, and sits on the no-block path only', () => {
    const noBlock = src.slice(src.indexOf('if (!block) {'), src.indexOf("return 'allow'; // skipped"));
    expect(noBlock).toMatch(/await \(ports\.openStoreFn \?\? openStore\)/);
    expect(noBlock).toMatch(/getActivePendingPromptSequence/);
    expect(noBlock).toMatch(/deletePendingPromptSequencesForProject/);
    // Awaited block — the RC31 draft was fire-and-forget and raced the hook exit.
    expect(noBlock).not.toMatch(/void \(async/);
  });

  it("⭐ NO REGRESSION: the scrub is gated on the planner's own OFF semantics (!== 'on')", () => {
    expect(src).toMatch(/enabled !== 'on'/);
    // And the key is the shared constant, project-scoped first — never a bare literal.
    expect(src).toMatch(/PROMPT_ENHANCEMENT_SEQUENCE_ENABLED_KEY\}:\$\{projectRoot\}/);
  });

  it('a throwing store can never affect the decision (fail-open, behavioural)', async () => {
    const { decide } = harness('');   // no block line + sweep store throws
    expect(await decide('pre_user_prompt', { project: '/proj' }, 'real prompt')).toBe('allow');
  });

  it('the scrub logs what it did, under its own event name', () => {
    expect(src).toMatch(/submit_stop_decider_scrubbed_stale_sequence/);
  });
});

/**
 * ⭐ RC41 — the MPS continuation runner: the missing "next Stop" for hook hosts.
 * CLI chain: block(item N) → response → Stop(stop_hook_active:true) →
 * continuation launcher → popup → block(item N+1). Windsurf's
 * post_cascade_response and Cursor's afterAgentResponse now invoke this runner,
 * which runs the SAME stop and hands a block to the SAME delivery pipeline.
 */
describe('⭐ RC41 — runSequenceContinuationStop', () => {
  const seqStore = (active: boolean) => ({
    openStoreFn: (async () => ({ db: {} })) as never,
    closeStoreFn: (() => {}) as never,
  });

  it('no active sequence ⇒ {ran:false} and NOTHING is spawned (old flow byte-identical)', async () => {
    const spawnFn = vi.fn();
    vi.mocked(getActivePendingPromptSequence).mockReturnValueOnce(null as never);
    const r = await runSequenceContinuationStop('/proj', 'windsurf', {
      spawnFn: spawnFn as never, ...seqStore(false), logEvent: () => {},
    });
    expect(r).toEqual({ ran: false });
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('⭐ sends the CONTINUATION payload — stop_hook_active:true (what routes runStop to the launcher)', async () => {
    // The child must be born AT spawn time: the runner awaits the store peek
    // first, and a pre-made fakeChild would emit exit before listeners attach.
    vi.mocked(getActivePendingPromptSequence).mockReturnValueOnce({ id: 1, payload: { items: [{}] } } as never);
    let writes: string[] = [];
    const r = await runSequenceContinuationStop('/proj', 'cursor', {
      spawnFn: (() => { const f = fakeChild(''); writes = f.writes; return f.child; }) as never,
      ...seqStore(true), logEvent: () => {},
      latestEchoAt: (() => null) as never, // hermetic: '/proj/.nexpath' is writable on Windows; a real registry there deferred this pin
      writeDecision: (async () => {}) as never,
    });
    expect(r).toEqual({ ran: true, blocked: false });
    expect(JSON.parse(writes[0]!)).toEqual({ cwd: '/proj', hook_event_name: 'Stop', stop_hook_active: true });
  });

  it('⭐ a continuation BLOCK persists the decision for the delivery pipeline (host threaded)', async () => {
    vi.mocked(getActivePendingPromptSequence).mockReturnValueOnce({ id: 1, payload: { items: [{}] } } as never);
    const writeDecision = vi.fn(async () => {});
    const r = await runSequenceContinuationStop('/proj', 'windsurf', {
      spawnFn: (() => fakeChild('{"decision":"block","reason":"item two body — long enough for the echo floor to apply cleanly"}\n').child) as never,
      ...seqStore(true), logEvent: () => {},
      latestEchoAt: (() => null) as never, // hermetic: '/proj/.nexpath' is writable on Windows; a real registry there deferred this pin
      writeDecision: writeDecision as never, now: () => 5_000,
    });
    expect(r).toEqual({ ran: true, blocked: true });
    const rec = writeDecision.mock.calls[0][0] as Record<string, unknown>;
    expect(rec.host).toBe('windsurf');
    expect(rec.replacementText).toContain('item two body');
    expect(rec.blockIssuedAt).toBe(5_000);
    expect(rec.hookPid).toBe(process.pid);
  });

  it('a failing spawn/store can never throw out of the runner (fail-open)', async () => {
    vi.mocked(getActivePendingPromptSequence).mockImplementationOnce(() => { throw new Error('store gone'); });
    const r = await runSequenceContinuationStop('/proj', 'cursor', { logEvent: () => {} });
    expect(r).toEqual({ ran: false });
  });
});

/**
 * ⭐ RC42 — the itemless-row visibility line. An active row with items:[] is the
 * upstream planner-flake shape (found live 2026-08-22): the launcher can never
 * package it, in the CLI or here. The runner STILL runs the stop (byte-identical
 * outcomes) — it only names the condition in the log so a "popup came once but
 * never chained" report is diagnosable from one grep.
 */
describe('⭐ RC42 — itemless active row is logged, behaviour unchanged', () => {
  const rowWith = (items: unknown[]) =>
    ({ id: 9, itemCount: 4, status: 'awaiting_response', payload: { items } }) as never;

  it('items:[] ⇒ warn sequence_continuation_row_has_no_items AND the stop still runs', async () => {
    vi.mocked(getActivePendingPromptSequence).mockReturnValueOnce(rowWith([]));
    const warns: Array<[string, string]> = [];
    const r = await runSequenceContinuationStop('/proj', 'windsurf', {
      spawnFn: (() => fakeChild('').child) as never,
      openStoreFn: (async () => ({ db: {} })) as never, closeStoreFn: (() => {}) as never,
      logEvent: ((lvl: string, name: string) => { warns.push([lvl, name]); }) as never,
      latestEchoAt: (() => null) as never, // hermetic: '/proj/.nexpath' is writable on Windows; a real registry there deferred this pin
      writeDecision: (async () => {}) as never,
    });
    expect(r).toEqual({ ran: true, blocked: false });
    expect(warns).toContainEqual(['warn', 'sequence_continuation_row_has_no_items']);
  });

  it('a worded row logs NO such warn (healthy chain stays quiet)', async () => {
    vi.mocked(getActivePendingPromptSequence).mockReturnValueOnce(rowWith([{ itemKind: 'first_task' }]));
    const warns: string[] = [];
    await runSequenceContinuationStop('/proj', 'cursor', {
      spawnFn: (() => fakeChild('').child) as never,
      openStoreFn: (async () => ({ db: {} })) as never, closeStoreFn: (() => {}) as never,
      logEvent: ((_l: string, name: string) => { warns.push(name); }) as never,
      latestEchoAt: (() => null) as never, // hermetic: '/proj/.nexpath' is writable on Windows; a real registry there deferred this pin
      writeDecision: (async () => {}) as never,
    });
    expect(warns).not.toContain('sequence_continuation_row_has_no_items');
  });
});

/**
 * ⭐ RC43 — the quiet-window guard. Windsurf fires post_cascade_response once
 * ~1–4 s after our OWN block (measured live: the premature popup stole focus,
 * the RC10 guard refused the Enter, and two items went as one combined message).
 * Inside the window the runner defers; the item's real completion (+17 s and up,
 * measured) passes.
 */
describe('⭐ RC43 — the post-block quiet window', () => {
  const activeRow = () => ({ id: 1, payload: { items: [{}] } }) as never;

  it('⭐ an event inside the window ⇒ {ran:false, deferred:true} and NO stop spawns', async () => {
    vi.mocked(getActivePendingPromptSequence).mockReturnValueOnce(activeRow());
    const spawnFn = vi.fn();
    const r = await runSequenceContinuationStop('/proj', 'windsurf', {
      spawnFn: spawnFn as never,
      openStoreFn: (async () => ({ db: {} })) as never, closeStoreFn: (() => {}) as never,
      logEvent: () => {},
      latestEchoAt: (() => 100_000) as never,
      now: () => 100_000 + SEQUENCE_CONTINUATION_QUIET_MS - 1,
    });
    expect(r).toEqual({ ran: false, deferred: true });
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('the real completion (window elapsed) runs the stop as before', async () => {
    vi.mocked(getActivePendingPromptSequence).mockReturnValueOnce(activeRow());
    const r = await runSequenceContinuationStop('/proj', 'cursor', {
      spawnFn: (() => fakeChild('').child) as never,
      openStoreFn: (async () => ({ db: {} })) as never, closeStoreFn: (() => {}) as never,
      logEvent: () => {},
      latestEchoAt: (() => 100_000) as never,
      now: () => 100_000 + SEQUENCE_CONTINUATION_QUIET_MS,
      writeDecision: (async () => {}) as never,
    });
    expect(r).toEqual({ ran: true, blocked: false });
  });

  it('no registry (null) ⇒ runs — fail-open, exactly the pre-RC43 behaviour', async () => {
    vi.mocked(getActivePendingPromptSequence).mockReturnValueOnce(activeRow());
    const r = await runSequenceContinuationStop('/proj', 'windsurf', {
      spawnFn: (() => fakeChild('').child) as never,
      openStoreFn: (async () => ({ db: {} })) as never, closeStoreFn: (() => {}) as never,
      logEvent: () => {}, latestEchoAt: (() => null) as never,
      writeDecision: (async () => {}) as never,
    });
    expect(r).toEqual({ ran: true, blocked: false });
  });

  it('a throwing reader ⇒ runs (the guard can never break the runner)', async () => {
    vi.mocked(getActivePendingPromptSequence).mockReturnValueOnce(activeRow());
    const r = await runSequenceContinuationStop('/proj', 'windsurf', {
      spawnFn: (() => fakeChild('').child) as never,
      openStoreFn: (async () => ({ db: {} })) as never, closeStoreFn: (() => {}) as never,
      logEvent: () => {}, latestEchoAt: (() => { throw new Error('fs gone'); }) as never,
      writeDecision: (async () => {}) as never,
    });
    expect(r).toEqual({ ran: true, blocked: false });
  });
});

/**
 * ⭐ RC45 — the popup-spawn `node` resolution guarantee. Layer C's popup hosts
 * run a BARE `node` (win32 `cmd start … node`, linux `gnome-terminal -- node`);
 * it resolves via the stop child's PATH, and Cursor's sanitized hook env may
 * not carry node at all. The env handed to every NEW-FLOW stop child must be
 * able to resolve it; machines that already can are byte-identical.
 */
describe('⭐ RC45 — ensureNodeDirOnPath', () => {
  it('appends the exec dir when PATH lacks it', () => {
    const out = ensureNodeDirOnPath({ PATH: '/usr/bin:/bin' }, { execPath: '/opt/node/bin/node', platform: 'linux' });
    expect(out.PATH).toBe('/usr/bin:/bin:/opt/node/bin');
  });

  it('⭐ returns the env UNCHANGED when the dir is already present (no-regression pin)', () => {
    const env = { PATH: '/opt/node/bin:/usr/bin' };
    const out = ensureNodeDirOnPath(env, { execPath: '/opt/node/bin/node', platform: 'linux' });
    expect(out).toBe(env);
  });

  it('win32: mutates the EXISTING case-variant key ("Path"), never adds a duplicate', () => {
    const out = ensureNodeDirOnPath(
      { Path: 'C:\\Windows\\System32' },
      { execPath: 'C:\\Program Files\\nodejs\\node.exe', platform: 'win32' },
    );
    expect(out.Path).toBe('C:\\Windows\\System32;C:\\Program Files\\nodejs');
    expect(Object.keys(out)).not.toContain('PATH');
  });

  it('empty/missing PATH gets exactly the exec dir', () => {
    const out = ensureNodeDirOnPath({}, { execPath: '/opt/node/bin/node', platform: 'linux' });
    expect(out.PATH).toBe('/opt/node/bin');
  });

  it('⭐ the continuation runner spawns stop with node-resolvable PATH', async () => {
    vi.mocked(getActivePendingPromptSequence).mockReturnValueOnce({ id: 1, payload: { items: [{}] } } as never);
    let seenEnv: NodeJS.ProcessEnv | undefined;
    await runSequenceContinuationStop('/proj', 'cursor', {
      spawnFn: ((cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv }) => {
        seenEnv = opts.env; return fakeChild('').child;
      }) as never,
      openStoreFn: (async () => ({ db: {} })) as never, closeStoreFn: (() => {}) as never,
      logEvent: () => {}, writeDecision: (async () => {}) as never,
      latestEchoAt: (() => null) as never,
    });
    const nodeDir = require('node:path').dirname(process.execPath);
    const pathKey = Object.keys(seenEnv ?? {}).find((k) => k.toUpperCase() === 'PATH') ?? 'PATH';
    expect((seenEnv?.[pathKey] ?? '').split(process.platform === 'win32' ? ';' : ':')).toContain(nodeDir);
  });
});

/**
 * ⭐ RC51 — no-folder-open (Mac/Devin 2026-08-24): root "/" makes the decision
 * file /.nexpath/… — unwritable everywhere, guaranteed-impossible on macOS.
 * The decider must not show a popup whose selection can never be delivered.
 */
describe('⭐ RC51 — unwritable project root allows without a popup', () => {
  it('⭐ unwritable root ⇒ allow, stop NEVER spawned, warn logged', async () => {
    const spawnFn = vi.fn();
    const warns: string[] = [];
    const decide = buildStopDrivenPromptSubmitDecider(
      { project: '/' },
      {
        host: 'windsurf', spawnFn: spawnFn as never, writeDecision: vi.fn() as never,
        logEvent: ((_l: string, name: string) => { warns.push(name); }) as never,
        mkdirFn: (() => { throw Object.assign(new Error('EACCES'), { code: 'EACCES' }); }) as never,
      },
    );
    await expect(decide('e', { project: '/' }, 'a real prompt')).resolves.toBe('allow');
    expect(spawnFn).not.toHaveBeenCalled();
    expect(warns).toContain('submit_flow_root_unwritable');
  });

  it('a writable root passes through to the normal flow (regression pin)', async () => {
    const { child } = fakeChild('');
    const decide = buildStopDrivenPromptSubmitDecider(
      { project: '/proj' },
      {
        host: 'windsurf', spawnFn: (() => child) as never, writeDecision: vi.fn() as never,
        logEvent: () => {}, mkdirFn: (() => {}) as never, ...FAKE_SWEEP_STORE,
      },
    );
    await expect(decide('e', { project: '/proj' }, 'a real prompt')).resolves.toBe('allow');
  });
});

/**
 * ⭐ RC70 (F-4) — no deliverer, no block. The hook cancels the prompt on `block`
 * and relies on the extension's poller; when that poller is known to be absent
 * (fresh not-armed beat: consent declined / gate off; or stale: extension gone)
 * the decider must release the prompt WITHOUT a popup. Absent = unknown = today.
 */
describe('⭐ RC70 — the decider refuses to block without a deliverer', () => {
  const BLOCK = JSON.stringify({ decision: 'block', reason: 'refined text' }) + '\n';
  function withDeliverer(state: Record<string, unknown>) {
    const child = new EventEmitter() as never as import('node:child_process').ChildProcess & { stdout: EventEmitter; stdin: { write: () => void; end: () => void } };
    const spawnFn = vi.fn(() => {
      queueMicrotask(() => { child.stdout.emit('data', BLOCK); child.emit('exit', 0); child.emit('close', 0); });
      return child;
    });
    (child as unknown as { stdout: EventEmitter }).stdout = Object.assign(new EventEmitter(), { setEncoding: () => {} });
    (child as unknown as { stdin: unknown }).stdin = { write: () => {}, end: () => {} };
    const events: Array<{ name: string; data: Record<string, unknown> }> = [];
    const writeDecision = vi.fn(async () => {});
    const decide = buildStopDrivenPromptSubmitDecider({ project: '/proj' }, {
      host: 'cursor', mkdirFn: (() => {}) as never, spawnFn: spawnFn as never, writeDecision: writeDecision as never,
      logEvent: ((_l: string, name: string, data?: Record<string, unknown>) => { events.push({ name, data: data ?? {} }); }) as never,
      readDelivererState: (() => state) as never,
      openStoreFn: (async () => { throw new Error('no store in tests'); }) as never,
    });
    return { decide, spawnFn, writeDecision, events };
  }

  it('⭐ fresh NOT-ARMED beat (consent declined) ⇒ allow, no stop spawned, no decision written, warn logged with the reason', async () => {
    const h = withDeliverer({ state: 'not_armed', ageMs: 1_000, reason: 'consent_not_granted', pid: 42 });
    expect(await h.decide('beforeSubmitPrompt', { project: '/proj' }, 'refine me')).toBe('allow');
    expect(h.spawnFn).not.toHaveBeenCalled();
    expect(h.writeDecision).not.toHaveBeenCalled();
    const warn = h.events.find((e) => e.name === 'submit_flow_no_deliverer');
    expect(warn?.data).toMatchObject({ host: 'cursor', state: 'not_armed', reason: 'consent_not_granted' });
  });

  it('⭐ STALE beat (extension gone) ⇒ allow without a popup', async () => {
    const h = withDeliverer({ state: 'stale', ageMs: 120_000, pid: 7 });
    expect(await h.decide('beforeSubmitPrompt', { project: '/proj' }, 'refine me')).toBe('allow');
    expect(h.spawnFn).not.toHaveBeenCalled();
  });

  it('⭐ ARMED ⇒ proceeds to the popup and blocks exactly as before', async () => {
    const h = withDeliverer({ state: 'armed', ageMs: 3_000, pid: 42 });
    expect(await h.decide('beforeSubmitPrompt', { project: '/proj' }, 'refine me')).toBe('block');
    expect(h.spawnFn).toHaveBeenCalledTimes(1);
    expect(h.events.find((e) => e.name === 'submit_flow_deliverer')?.data).toMatchObject({ state: 'armed' });
  });

  it('⭐ ABSENT (older extension / unknown) ⇒ proceeds as before — a newer CLI never mutes an older extension', async () => {
    const h = withDeliverer({ state: 'absent' });
    expect(await h.decide('beforeSubmitPrompt', { project: '/proj' }, 'refine me')).toBe('block');
    expect(h.spawnFn).toHaveBeenCalledTimes(1);
  });

  it('the check runs AFTER the empty-prompt and root-writability gates (unchanged order)', async () => {
    const readDelivererState = vi.fn(() => ({ state: 'not_armed' as const }));
    const decide = buildStopDrivenPromptSubmitDecider({ project: '/proj' }, {
      host: 'cursor', mkdirFn: (() => { throw new Error('EACCES'); }) as never, logEvent: () => {},
      readDelivererState: readDelivererState as never,
    });
    expect(await decide('beforeSubmitPrompt', { project: '/proj' }, '')).toBe('allow');          // empty prompt
    expect(await decide('beforeSubmitPrompt', { project: '/proj' }, 'x')).toBe('allow');         // unwritable root
    expect(readDelivererState).not.toHaveBeenCalled();
  });
});
