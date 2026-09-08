/**
 * H5 — the `cursor-hook` CLI entry.
 *
 * The load-bearing difference from Windsurf: Cursor does NOT read the exit code.
 * It reads a JSON response on stdout and blocks on `continue:false`. Writing the
 * Windsurf exit-2 convention here would silently fail to block.
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
vi.mock('./submit-expiry-consumer.js', async (importOriginal) => {
  // RC71 hermetic: the real spawner would launch a detached `node <argv[1]> submit-expiry-consume`
  // from inside the test runner. The constant is kept real; only the spawn is stubbed.
  const mod = await importOriginal<typeof import('./submit-expiry-consumer.js')>();
  return { ...mod, spawnExpiryConsumer: vi.fn(() => ({ spawned: true, pid: 4242 })) };
});
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runCursorHookAction, CURSOR_CONTINUE, CURSOR_BLOCK_USER_MESSAGE,
  CURSOR_PROMPTSUBMIT_ADVISORY_ENV, isCursorPromptSubmitAdvisoryEnabled,
  rehydrateGuiEnvFromParent, GUI_ENV_KEYS,
} from './cursor-hook.js';
import { createHoldBudget } from './submit-hold-budget.js';
import { SUBMIT_POPUP_MIN_REMAINING_MS } from './submit-expiry-consumer.js';

const PAYLOAD = JSON.stringify({
  prompt: 'hello',
  workspace_roots: ['/proj'],
  user_email: 'someone@example.com',
  transcript_path: '/tmp/t.jsonl',
});

function harness(over: Record<string, unknown> = {}) {
  const writes: string[] = [];
  const exits: number[] = [];
  return {
    writes, exits,
    deps: {
      // H6: the decider is switch-gated. These tests are about the decision
      // path, so the switch is ON unless a test overrides it.
      env: { [CURSOR_PROMPTSUBMIT_ADVISORY_ENV]: '1' },
      // Hermetic: never touch the real ~/.nexpath/submit-flow.json in tests.
      // The env override above drives the gate; flag-file tests inject their own.
      readFlagFile: () => null,
      // Hermetic: the default logger appends to the real ~/.nexpath/nexpath.log.
      logEvent: () => {},
      // Hermetic: the default reads /proc and mutates the runner's process.env.
      rehydrateGuiEnv: () => [],
      // Hermetic: the echo-check default opens the real store.
      checkReplacementEcho: async () => false,
      readStdin: async () => PAYLOAD,
      write: (t: string) => { writes.push(t); },
      exit: (c: number) => { exits.push(c); },
      ...over,
    },
  };
}

describe('⭐ Cursor blocks via stdout JSON, never the exit code', () => {
  it('always exits 0, even when blocking', async () => {
    const h = harness({ decide: async () => 'block' as const });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(h.exits).toEqual([0]);
  });

  it('emits continue:false to block', async () => {
    const h = harness({ decide: async () => 'block' as const });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(JSON.parse(h.writes[0])).toMatchObject({ continue: false });
  });

  it('emits continue:true to allow', async () => {
    const h = harness({ decide: async () => 'allow' as const });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
  });

  it('always writes exactly one response', async () => {
    // Two responses would be malformed stdout; Cursor reads one JSON document.
    const h = harness({ decide: async () => 'block' as const });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(h.writes).toHaveLength(1);
  });
});

describe('behaviour-neutral by default (H5 alone changes nothing)', () => {
  it('continues when no decider is supplied', async () => {
    const h = harness();
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(JSON.parse(h.writes[0])).toEqual(CURSOR_CONTINUE);
  });

  it('continues for an unknown event rather than guessing its contract', async () => {
    const decide = vi.fn();
    const h = harness({ decide });
    await runCursorHookAction('someOtherEvent', h.deps as never);
    expect(JSON.parse(h.writes[0])).toEqual(CURSOR_CONTINUE);
    expect(decide).not.toHaveBeenCalled();
  });
});

describe('fail-open (A3) — never strand the prompt', () => {
  it('continues when the decider throws', async () => {
    const h = harness({ decide: async () => { throw new Error('boom'); } });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
    expect(h.exits).toEqual([0]);
  });

  it('continues on malformed stdin', async () => {
    const h = harness({ readStdin: async () => '{ not json' });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
  });

  it('⭐ bounded stdin read — a pipe that never closes must not hold the prompt', async () => {
    const h = harness({
      readStdin: () => new Promise<string>(() => {}),   // never resolves
      stdinTimeoutMs: 10,
      decide: async () => 'allow' as const,
    });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(h.exits).toEqual([0]);
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
  });
});

describe('the decider receives a parsed, PII-free payload', () => {
  it('gets the prompt and project root', async () => {
    let seen: { promptText?: string; projectRoot?: string } | null = null;
    const h = harness({ decide: async (p: never) => { seen = p; return 'allow' as const; } });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(seen!.promptText).toBe('hello');
    expect(seen!.projectRoot).toBe('/proj');
  });

  it('⚠ §4.3 — never receives user_email', async () => {
    let seen: unknown = null;
    const h = harness({ decide: async (p: never) => { seen = p; return 'allow' as const; } });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(JSON.stringify(seen)).not.toContain('someone@example.com');
  });
});

describe('⭐ R2 — self-enforced hold: Cursor orphans timed-out hooks, so it will never reap us', () => {
  // Measured: at 60.002s Cursor stopped waiting but the hook process kept
  // running past 90s. A host-enforced bound is therefore no bound at all - the
  // process must terminate itself or it survives as an orphan.
  function fakeBudget(totalMs = 60_000) {
    let t = 0;
    const timers: Array<{ at: number; fn: () => void }> = [];
    const budget = createHoldBudget({
      totalMs,
      now: () => t,
      setTimeoutFn: (fn, ms) => { const e = { at: t + ms, fn }; timers.push(e); return e; },
      clearTimeoutFn: (h) => { const i = timers.indexOf(h as never); if (i >= 0) timers.splice(i, 1); },
    });
    return {
      budget,
      advance(ms: number) {
        t += ms;
        for (const e of [...timers]) if (e.at <= t) { timers.splice(timers.indexOf(e), 1); e.fn(); }
      },
    };
  }

  it('a decider that never answers still exits 0 and continues', async () => {
    // Without the budget this hook would run forever, orphaned by Cursor, while
    // the user's prompt sits blocked.
    const f = fakeBudget();
    const h = harness({
      holdBudget: f.budget,
      decide: () => new Promise(() => { f.advance(60_000); }),   // never settles
    });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(h.exits).toEqual([0]);
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
  });

  it('an expired budget never blocks, even if the decider later says block', async () => {
    // MUTATION GUARD: treating a timed-out run as a real decision would emit
    // continue:false with no replacement, cancelling the turn for nothing.
    const f = fakeBudget();
    const h = harness({
      holdBudget: f.budget,
      decide: () => new Promise((r) => { f.advance(60_000); setTimeout(() => r('block'), 0); }),
    });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
  });

  it('the budget is SHARED — a slow stdin read leaves less for the decision', async () => {
    // Per-segment timeouts would sum and could exceed the cap.
    const f = fakeBudget(60_000);
    const h = harness({
      holdBudget: f.budget,
      readStdin: async () => { f.advance(60_000); return PAYLOAD; },
      decide: async () => 'block' as const,
    });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    // Budget exhausted by stdin ⇒ the decision segment never runs ⇒ continue.
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
    expect(h.exits).toEqual([0]);
  });
});

describe('⭐ H6 — the Cursor switch is independent and defaults OFF', () => {
  it('pins the env var name', () => {
    // Duplicated from the Windsurf constant on purpose: the two platforms must be
    // switchable INDEPENDENTLY, so one shared var could not serve both.
    expect(CURSOR_PROMPTSUBMIT_ADVISORY_ENV).toBe('NEXPATH_CURSOR_PROMPTSUBMIT_ADVISORY');
  });

  it('is exact-equality: only "1" enables it', () => {
    expect(isCursorPromptSubmitAdvisoryEnabled({})).toBe(false);
    for (const v of ['0', 'true', 'yes', '']) {
      expect(isCursorPromptSubmitAdvisoryEnabled({ [CURSOR_PROMPTSUBMIT_ADVISORY_ENV]: v })).toBe(false);
    }
    expect(isCursorPromptSubmitAdvisoryEnabled({ [CURSOR_PROMPTSUBMIT_ADVISORY_ENV]: '1' })).toBe(true);
  });

  it('does NOT enable on the Windsurf switch — the two are independent', () => {
    expect(isCursorPromptSubmitAdvisoryEnabled({
      NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1',
    })).toBe(false);
  });

  it('⭐ switch OFF: the decider is never consulted, even if supplied', async () => {
    // Backward compat: with the switch unset the path is unreachable.
    const decide = vi.fn().mockResolvedValue('block' as const);
    const h = harness({ env: {}, decide });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(decide).not.toHaveBeenCalled();
    expect(JSON.parse(h.writes[0])).toEqual(CURSOR_CONTINUE);
  });
});

describe('⭐ H6 — user_message is the Cursor-only text channel', () => {
  it('a block carries an explanation', async () => {
    // Measured: user_message is rendered inside Cursor's block card. Windsurf has
    // no equivalent - its wording is a fixed vendor string. Omitting it would
    // leave the user staring at a bare "blocked by hook".
    const h = harness({ decide: async () => 'block' as const });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    const res = JSON.parse(h.writes[0]);
    expect(res.continue).toBe(false);
    expect(res.user_message).toBe(CURSOR_BLOCK_USER_MESSAGE);
  });

  it('an ALLOW never carries user_message — nothing to explain', async () => {
    // MUTATION GUARD: attaching it unconditionally would render a "blocked" card
    // message on a turn that was not blocked.
    const h = harness({ decide: async () => 'allow' as const });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
  });

  it('the message never contains the user prompt', async () => {
    // It is rendered in the host UI; echoing prompt text there would surface
    // content the user may not expect to see repeated.
    expect(CURSOR_BLOCK_USER_MESSAGE).not.toContain('hello');
    const h = harness({ decide: async () => 'block' as const });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(h.writes[0]).not.toContain('hello');
  });

  it('a caller may override the message', async () => {
    const h = harness({ decide: async () => 'block' as const, blockMessage: 'custom text' });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(JSON.parse(h.writes[0]).user_message).toBe('custom text');
  });
});

describe('⭐ the DEFAULT decider (production path) — every other test injects one', () => {
  // The default is what actually runs in production: no test above exercises it,
  // which is precisely how submitKeystroke shipped as a no-op and writeCursorHooks
  // shipped unwired. This drives the REAL buildDefaultPromptSubmitDecider.
  const realRoot = mkdtempSync(join(tmpdir(), 'nexpath-h6-default-'));

  function bare(over: Record<string, unknown> = {}) {
    const writes: string[] = [];
    const exits: number[] = [];
    return {
      writes, exits,
      deps: {
        env: { [CURSOR_PROMPTSUBMIT_ADVISORY_ENV]: '1' },
        readStdin: async () => JSON.stringify({
          prompt: 'hello',
          workspace_roots: [realRoot],
        }),
        write: (t: string) => { writes.push(t); },
        exit: (c: number) => { exits.push(c); },
        ...over,
      },
    };
  }

  it('does not throw, hang, or block when no decider is injected', async () => {
    // With no classification present the decider must resolve 'allow', so the
    // user's prompt is released. A throw here would surface as a broken hook.
    const h = bare();
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(h.exits).toEqual([0]);
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
  });

  it('writes no decision file when it allows', async () => {
    // A decision file written on an allow would be picked up by the poller and
    // injected into a turn that was never blocked.
    const h = bare();
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(existsSync(join(realRoot, '.nexpath', 'submit-decision.json'))).toBe(false);
  });

  it('still allows when the payload carries no project root', async () => {
    // workspace_roots absent ⇒ projectRoot undefined ⇒ the decider must degrade
    // to allow rather than throw on an undefined path.
    const h = bare({ readStdin: async () => JSON.stringify({ prompt: 'hello' }) });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(h.exits).toEqual([0]);
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
  });

  it('switch OFF: the default decider is not even constructed', async () => {
    const h = bare({ env: {} });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(JSON.parse(h.writes[0])).toEqual(CURSOR_CONTINUE);
  });

  afterAll(() => rmSync(realRoot, { recursive: true, force: true }));
});

describe('⭐ the default decider is the REAL one, pinned structurally', () => {
  // The behavioural tests above cannot distinguish the real decider from a stub:
  // with no classification present BOTH return 'allow'. Mutation confirmed this -
  // replacing the default with `async () => 'allow'` kept all 26 green. So the
  // wiring is pinned against the source, the same technique used for the
  // no-OpenAI and switch-gate guards.
  const src = readFileSync(join(__dirname, 'cursor-hook.ts'), 'utf8');

  it('H9: the default is the stop-driven decider (ALL popups at submit time)', () => {
    // Owner ruling 2026-08-13: the full Layer-C popup surface — MPS sequence,
    // PE popup, advisory popup — fires at submit. `stop` IS that surface; the
    // default decide must run it, not the advisory-only H3 decider.
    expect(src).toMatch(/deps\.decide\s*\?\?[\s\S]{0,400}?buildStopDrivenPromptSubmitDecider/);
  });

  it('passes host: \'cursor\' so the record is tagged for the right editor', () => {
    // A windsurf-tagged record would be dropped by the Cursor reader and the
    // prompt would be cancelled with nothing ever injected.
    expect(src).toMatch(/buildStopDrivenPromptSubmitDecider\([\s\S]{0,200}?host:\s*'cursor'/);
  });

  it('does not hardcode an allow-only default', () => {
    // MUTATION GUARD: this is exactly the mutant that survived the behavioural
    // tests - a default that always allows, leaving the Cursor path inert.
    expect(src).not.toMatch(/deps\.decide\s*\?\?\s*\(async\s*\(\)\s*=>\s*'allow'/);
  });
});

/**
 * OPTION-A ORDERING (2026-08-12) — the Cursor hook must classify THIS prompt
 * (spawn `auto` + await) BEFORE deciding, because `beforeSubmitPrompt` fires
 * before the prompt reaches state.vscdb, so the extension's DB-watcher hasn't
 * classified it. Without this, the decider reads a stale/absent advisory and
 * never blocks the current turn (the gap found live 2026-08-12).
 */
describe('option-A ordering — auto is spawned+awaited before the decision', () => {
  it('⭐ spawns auto with THIS prompt, awaits it, THEN decides (correct order)', async () => {
    const order: string[] = [];
    const fakeChild = { kill: vi.fn() } as unknown as import('node:child_process').ChildProcess;
    const spawnAutoFn = vi.fn((prompt: string) => { order.push(`spawnAuto:${prompt}`); return fakeChild; });
    const waitForChild = vi.fn(async () => { order.push('await'); });
    const decide = vi.fn(async () => { order.push('decide'); return 'block' as const; });
    const h = harness({ spawnAutoFn, waitForChild, decide });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(spawnAutoFn).toHaveBeenCalledWith('hello', expect.objectContaining({ cwd: '/proj' }));
    expect(order).toEqual(['spawnAuto:hello', 'await', 'decide']);
    expect(h.writes[0]).toContain('"continue":false');
  });

  it('switch OFF: auto is NOT spawned and nothing decides (byte-identical old path)', async () => {
    const spawnAutoFn = vi.fn();
    const decide = vi.fn(async () => 'block' as const);
    const h = harness({ env: {}, spawnAutoFn, decide });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(spawnAutoFn).not.toHaveBeenCalled();
    expect(decide).not.toHaveBeenCalled();
    expect(h.writes[0]).toBe(JSON.stringify(CURSOR_CONTINUE));
  });

  it('empty prompt: auto is not spawned, still decides (fail-open, no crash)', async () => {
    const spawnAutoFn = vi.fn();
    const h = harness({
      readStdin: async () => JSON.stringify({ prompt: '   ', workspace_roots: ['/proj'] }),
      spawnAutoFn,
      decide: async () => 'allow' as const,
    });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(spawnAutoFn).not.toHaveBeenCalled();
    expect(h.exits).toContain(0);
  });

  it('⭐ hold times out during the auto await: child is KILLED (no orphan, R2) and prompt released', async () => {
    const killed = vi.fn();
    const fakeChild = { kill: killed } as unknown as import('node:child_process').ChildProcess;
    // Fake budget: the stdin read succeeds; the auto-await times out; the
    // decision therefore also times out (exhausted budget refuses to start).
    let call = 0;
    const fakeHold = {
      remaining: () => 0,
      expired: () => call > 1,
      run: async <T>(work: () => Promise<T>) => {
        call += 1;
        if (call === 1) return { timedOut: false as const, value: await work() }; // stdin read
        if (call === 2) return { timedOut: true as const };                        // auto await → timeout
        return { timedOut: true as const };                                        // decision refused
      },
    };
    const h = harness({
      spawnAutoFn: () => fakeChild,
      waitForChild: async () => { /* would block */ },
      holdBudget: fakeHold as never,
      decide: async () => 'block' as const,
    });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(killed).toHaveBeenCalled();               // no orphan (R2)
    expect(h.writes[0]).toContain('"continue":true'); // fail-open — prompt released
  });
})

/**
 * FOREGROUNDING (2026-08-12 live root cause) — the submit popup opens BEHIND
 * Cursor under GNOME focus-stealing prevention; without raising it the user
 * never sees it, never selects, the hold times out → fail-open → NO BLOCK.
 * So the raiser must fire on the gated path, before the (blocking) decision.
 */
describe('foreground raise — submit popup must be brought to front', () => {
  it('⭐ switch ON: raisePopup fires BEFORE the decision (so the user sees the popup)', async () => {
    const order: string[] = [];
    const raisePopup = vi.fn(() => { order.push('raise'); });
    const decide = vi.fn(async () => { order.push('decide'); return 'block' as const; });
    const h = harness({ raisePopup, decide });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(raisePopup).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['raise', 'decide']); // raise strictly before the blocking decision
  });

  it('switch OFF: raisePopup is NOT called (no popup on the old path)', async () => {
    const raisePopup = vi.fn();
    const h = harness({ env: {}, raisePopup, decide: vi.fn(async () => 'block' as const) });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(raisePopup).not.toHaveBeenCalled();
  });
})

/**
 * FILE LOGGING (2026-08-12) — added after the hooks.json `version` bug hid for
 * four days: the hook logged NOTHING, so a dead registration and a silent
 * allow were indistinguishable. Every stage must leave a line, and none of
 * those lines may carry prompt text or user_email (§4.3).
 */
describe('file logging — a silent hook can never hide again', () => {
  it('⭐ logs invocation, payload meta, gate, auto, decision and response on a full run', async () => {
    const events: string[] = [];
    const logEvent = vi.fn((_l: string, name: string) => { events.push(name); });
    const h = harness({ logEvent, decide: async () => 'block' as const });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(events).toEqual([
      'cursor_hook_invoked',
      'cursor_hook_payload',
      'cursor_hook_gate',
      'cursor_hook_auto',
      'cursor_hook_decision',
      'cursor_hook_hold_split', // RC67: the budget split rides every gated run
      'cursor_hook_response',
    ]);
  });

  it('⚠ §4.3 — no log line ever carries the prompt text or user_email', async () => {
    const calls: unknown[] = [];
    const logEvent = vi.fn((...args: unknown[]) => { calls.push(args); });
    const h = harness({ logEvent, decide: async () => 'block' as const });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    const flat = JSON.stringify(calls);
    expect(flat).not.toContain('hello');                  // the payload prompt
    expect(flat).not.toContain('someone@example.com');    // the payload email
    expect(flat).toContain('prompt_len');                 // meta is logged instead
  });

  it('a throwing logger never breaks fail-open (exit 0, one response)', async () => {
    const h = harness({
      logEvent: () => { throw new Error('disk full'); },
      decide: async () => 'allow' as const,
    });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(h.exits).toEqual([0]);
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
  });

  // NB: a throwing readStdin/decide does NOT reach the outer catch — the hold
  // budget absorbs a rejecting segment into a clean fail-open by design (see
  // submit-hold-budget.ts run()). The outer catch guards genuinely unmanaged
  // failures, e.g. stdout dying mid-response.
  it('fail-open paths log cursor_hook_fail_open (response write throws)', async () => {
    const events: string[] = [];
    const logEvent = vi.fn((_l: string, name: string) => { events.push(name); });
    const writes: string[] = [];
    let first = true;
    const h = harness({
      logEvent,
      write: (t: string) => {
        if (first) { first = false; throw new Error('EPIPE'); }
        writes.push(t);
      },
      decide: async () => 'allow' as const,
    });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(events).toContain('cursor_hook_fail_open');
    expect(JSON.parse(writes[0])).toEqual({ continue: true }); // the recovery write
    expect(h.exits).toEqual([0]);
  });
});

/**
 * GUI env re-hydration (live root cause #3, 2026-08-12): Cursor spawns hooks
 * with a sanitized env — no DISPLAY/DBUS — so the popup terminal exits
 * instantly and the decider silently allows. The hook recovers the missing
 * vars from the ancestor Cursor processes via /proc. Additive-only.
 */
describe('rehydrateGuiEnvFromParent — recover the GUI session env Cursor strips', () => {
  const environ = (vars: Record<string, string>) =>
    Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\0');
  // /proc/<pid>/stat: "pid (comm) state ppid ..."
  const stat = (pid: number, ppid: number) => `${pid} (cursor) S ${ppid} 1 1 0`;

  it('⭐ fills DISPLAY and DBUS from the immediate parent', () => {
    const env: Record<string, string> = {};
    const filled = rehydrateGuiEnvFromParent({
      env, startPid: 100, platform: 'linux',
      readProcFile: (p) => {
        if (p === '/proc/100/environ') return environ({ DISPLAY: ':1', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus' });
        if (p === '/proc/100/stat') return stat(100, 1);
        throw new Error('ENOENT');
      },
    });
    expect(env.DISPLAY).toBe(':1');
    expect(env.DBUS_SESSION_BUS_ADDRESS).toBe('unix:path=/run/user/1000/bus');
    expect(filled).toContain('DISPLAY');
  });

  it('⭐ never overwrites an existing value (additive-only)', () => {
    const env: Record<string, string> = { DISPLAY: ':7' };
    rehydrateGuiEnvFromParent({
      env, startPid: 100, platform: 'linux',
      readProcFile: (p) => {
        if (p === '/proc/100/environ') return environ({ DISPLAY: ':1', XAUTHORITY: '/home/u/.Xauthority' });
        if (p === '/proc/100/stat') return stat(100, 1);
        throw new Error('ENOENT');
      },
    });
    expect(env.DISPLAY).toBe(':7');          // untouched
    expect(env.XAUTHORITY).toBe('/home/u/.Xauthority'); // still filled
  });

  it('walks UP the chain when the immediate parent lacks the vars', () => {
    const env: Record<string, string> = {};
    rehydrateGuiEnvFromParent({
      env, startPid: 200, platform: 'linux',
      readProcFile: (p) => {
        if (p === '/proc/200/environ') return environ({ PATH: '/usr/bin' }); // sanitized service
        if (p === '/proc/200/stat') return stat(200, 150);
        if (p === '/proc/150/environ') return environ({ DISPLAY: ':1' });    // Cursor main
        if (p === '/proc/150/stat') return stat(150, 1);
        throw new Error('ENOENT');
      },
    });
    expect(env.DISPLAY).toBe(':1');
  });

  it('is a silent no-op off Linux', () => {
    const env: Record<string, string> = {};
    const filled = rehydrateGuiEnvFromParent({
      env, startPid: 100, platform: 'darwin',
      readProcFile: () => { throw new Error('must not be called'); },
    });
    expect(filled).toEqual([]);
    expect(env).toEqual({});
  });

  it('never throws on unreadable /proc (fail-open)', () => {
    const env: Record<string, string> = {};
    const filled = rehydrateGuiEnvFromParent({
      env, startPid: 100, platform: 'linux',
      readProcFile: () => { throw new Error('EACCES'); },
    });
    expect(filled).toEqual([]);
  });

  it('stops at the hop bound (no infinite ancestor walk)', () => {
    const env: Record<string, string> = {};
    let reads = 0;
    rehydrateGuiEnvFromParent({
      env, startPid: 100, platform: 'linux', maxHops: 3,
      readProcFile: (p) => {
        reads++;
        if (p.endsWith('/environ')) return environ({ PATH: '/usr/bin' });
        const pid = Number(p.split('/')[2]);
        return stat(pid, pid + 1); // endless synthetic chain
      },
    });
    expect(reads).toBeLessThanOrEqual(6); // 3 hops × (environ + stat)
  });

  it('covers every GUI key we depend on', () => {
    expect([...GUI_ENV_KEYS]).toEqual(
      ['DISPLAY', 'WAYLAND_DISPLAY', 'XAUTHORITY', 'DBUS_SESSION_BUS_ADDRESS', 'XDG_RUNTIME_DIR'],
    );
  });
});

/**
 * VED-PE-10 echo skip (live root cause, 2026-08-13): after a block, the
 * extension injects + auto-submits the replacement, which fires this hook
 * AGAIN. Without recognising the echo, the hook re-classified its own
 * replacement, popped a second popup nobody was watching, and stalled the
 * replacement ~57 s behind the hold. An echo must release instantly, spawning
 * NOTHING — and must leave the store guard for the watcher's auto to consume.
 */
describe('⭐ VED-PE-10 — the injected replacement releases instantly, no re-advise', () => {
  it('echo: no auto spawn, no decision, immediate continue:true, logged', async () => {
    const events: string[] = [];
    const spawnAutoFn = vi.fn();
    const decide = vi.fn(async () => 'block' as const);
    const h = harness({
      checkReplacementEcho: async () => true,
      spawnAutoFn,
      decide,
      logEvent: (_l: string, name: string) => { events.push(name); },
    });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(spawnAutoFn).not.toHaveBeenCalled();          // no re-classification
    expect(decide).not.toHaveBeenCalled();               // no popup, no decision
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
    expect(events).toContain('cursor_hook_echo_skip');
  });

  it('non-echo: the normal path is untouched (auto spawns, decider consulted)', async () => {
    const spawnAutoFn = vi.fn(() => null);
    const decide = vi.fn(async () => 'allow' as const);
    const h = harness({ checkReplacementEcho: async () => false, spawnAutoFn, decide });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(spawnAutoFn).toHaveBeenCalledTimes(1);
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it('a throwing echo-check fails open into the normal path', async () => {
    // hold.run absorbs the rejection → isEcho false → ordinary flow.
    const decide = vi.fn(async () => 'allow' as const);
    const h = harness({
      checkReplacementEcho: async () => { throw new Error('store gone'); },
      spawnAutoFn: vi.fn(() => null),
      decide,
    });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
  });
});

/**
 * ⭐ RC41 — the MPS continuation trigger (Cursor half).
 * `afterAgentResponse` is Cursor's "response finished" — it runs the same
 * continuation Stop as the CLI chain, and must NEVER block the host: the
 * answer is `{continue:true}` no matter what the runner did.
 */
describe('⭐ RC41 — afterAgentResponse runs the sequence continuation', () => {
  it('⭐ switch ON ⇒ runner invoked with the payload projectRoot; always continue + exit 0', async () => {
    const runSequenceContinuation = vi.fn(async () => ({ ran: true, blocked: true }));
    const h = harness({ runSequenceContinuation });
    await runCursorHookAction('afterAgentResponse', h.deps as never);
    expect(runSequenceContinuation).toHaveBeenCalledWith('/proj', 'cursor');
    expect(JSON.parse(h.writes[0])).toEqual(CURSOR_CONTINUE);
    expect(h.exits).toEqual([0]);
  });

  it('switch OFF ⇒ runner never consulted, output byte-identical to the old unknown-event answer', async () => {
    const runSequenceContinuation = vi.fn(async () => ({ ran: true }));
    const h = harness({ env: {}, runSequenceContinuation });
    await runCursorHookAction('afterAgentResponse', h.deps as never);
    expect(runSequenceContinuation).not.toHaveBeenCalled();
    expect(JSON.parse(h.writes[0])).toEqual(CURSOR_CONTINUE);
    expect(h.exits).toEqual([0]);
  });

  it('⭐ a throwing runner still answers continue (this event must never wedge Cursor)', async () => {
    const h = harness({ runSequenceContinuation: vi.fn(async () => { throw new Error('boom'); }) });
    await runCursorHookAction('afterAgentResponse', h.deps as never);
    expect(JSON.parse(h.writes[0])).toEqual(CURSOR_CONTINUE);
    expect(h.exits).toEqual([0]);
  });

  it('an empty/late payload falls back to cwd for the project root (never skips)', async () => {
    const runSequenceContinuation = vi.fn(async () => ({ ran: false }));
    const h = harness({ runSequenceContinuation, readStdin: async () => '' });
    await runCursorHookAction('afterAgentResponse', h.deps as never);
    expect(runSequenceContinuation).toHaveBeenCalledWith(process.cwd(), 'cursor');
  });
});

/** ⭐ RC50 — a duplicate registration's invocation answers continue and runs NOTHING else. */
describe('⭐ RC50 — duplicate invocation short-circuits', () => {
  it('duplicate ⇒ continue:true, decider never consulted', async () => {
    const decide = vi.fn(async () => 'block' as const);
    const h = harness({ decide, checkDuplicateInvocation: () => true });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(decide).not.toHaveBeenCalled();
    expect(JSON.parse(h.writes[0])).toEqual(CURSOR_CONTINUE);
    expect(h.exits).toEqual([0]);
  });
  it('first invocation (not duplicate) proceeds to the decider', async () => {
    const decide = vi.fn(async () => 'allow' as const);
    const h = harness({ decide, checkDuplicateInvocation: () => false });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(decide).toHaveBeenCalledTimes(1);
  });
});

/**
 * ⭐ RC67 — hold expiry is LOGGED with the budget split (tester report
 * 2026-09-03: the popup's death could only be inferred from a MISSING
 * `submit_stop_decider_done`). New event names only; nothing decides differently.
 */
describe('⭐ RC67 — hold expiry logged with the budget split (cursor)', () => {
  function fakeBudget(totalMs = 60_000) {
    let t = 0;
    const timers: Array<{ at: number; fn: () => void }> = [];
    const budget = createHoldBudget({
      totalMs, now: () => t,
      setTimeoutFn: (fn, ms) => { const e = { at: t + ms, fn }; timers.push(e); return e; },
      clearTimeoutFn: (h) => { const i = timers.indexOf(h as never); if (i >= 0) timers.splice(i, 1); },
    });
    return { budget, advance(ms: number) { t += ms; for (const e of [...timers]) if (e.at <= t) { timers.splice(timers.indexOf(e), 1); e.fn(); } } };
  }
  const collect = () => {
    const events: Array<{ name: string; data: Record<string, unknown> }> = [];
    const logEvent = vi.fn((_l: string, name: string, data?: Record<string, unknown>) => { events.push({ name, data: data ?? {} }); });
    return { events, logEvent, find: (n: string) => events.filter((e) => e.name === n) };
  };

  it('⭐ decider timeout ⇒ cursor_hook_hold_expired{segment:decider} with numeric auto_ms/decider_ms, then hold_split(decider_timed_out)', async () => {
    const f = fakeBudget();
    const c = collect();
    const h = harness({ logEvent: c.logEvent, holdBudget: f.budget,
      decide: () => new Promise((r) => { f.advance(60_000); setTimeout(() => r('block'), 0); }) });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    const exp = c.find('cursor_hook_hold_expired');
    expect(exp).toHaveLength(1);
    expect(exp[0]!.data.segment).toBe('decider');
    expect(typeof exp[0]!.data.auto_ms).toBe('number');
    expect(typeof exp[0]!.data.decider_ms).toBe('number');
    expect(exp[0]!.data.remaining_ms).toBe(0);
    const split = c.find('cursor_hook_hold_split');
    expect(split).toHaveLength(1);
    expect(split[0]!.data).toMatchObject({ decision: 'allow', decider_timed_out: true });
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true }); // still fail-open
  });

  it('⭐ auto-await timeout ⇒ cursor_hook_hold_expired{segment:auto}, no decision, no split', async () => {
    const c = collect();
    let call = 0;
    const fakeHold = {
      remaining: () => 0, expired: () => call > 1,
      run: async <T>(work: () => Promise<T>) => {
        call += 1;
        if (call === 1) return { timedOut: false as const, value: await work() }; // stdin
        if (call === 2) return { timedOut: false as const, value: await work() }; // echo check
        return { timedOut: true as const };                                        // auto await → expired
      },
    };
    const h = harness({ logEvent: c.logEvent, holdBudget: fakeHold as never,
      spawnAutoFn: () => ({ kill: () => {} }) as never, waitForChild: async () => {}, decide: async () => 'block' as const });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    const exp = c.find('cursor_hook_hold_expired');
    expect(exp.map((e) => e.data.segment)).toEqual(['auto', 'decider']); // auto expired; the refused decider segment is reported too
    expect(exp[0]!.data.decider_ms).toBeNull();
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
  });

  it('a normal block run ⇒ hold_split{decision:block} with numeric auto_ms & decider_ms and NO hold_expired', async () => {
    const c = collect();
    const h = harness({ logEvent: c.logEvent, decide: async () => 'block' as const });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(c.find('cursor_hook_hold_expired')).toHaveLength(0);
    const split = c.find('cursor_hook_hold_split');
    expect(split).toHaveLength(1);
    expect(split[0]!.data.decision).toBe('block');
    expect(split[0]!.data.decider_timed_out).toBe(false);
    expect(typeof split[0]!.data.auto_ms).toBe('number');
    expect(typeof split[0]!.data.decider_ms).toBe('number');
    expect(typeof split[0]!.data.remaining_after_auto_ms).toBe('number');
  });

  it('⭐ switch OFF ⇒ no hold_* events (old flow byte-identical)', async () => {
    const c = collect();
    const h = harness({ logEvent: c.logEvent, env: { [CURSOR_PROMPTSUBMIT_ADVISORY_ENV]: '0' } });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(c.events.filter((e) => e.name.startsWith('cursor_hook_hold_')).length).toBe(0);
  });
});

/**
 * ⭐ RC71 — expiry consume (tester §4b fix 1) + the 6.1 floor, Cursor side.
 * Mirrors the Windsurf pins; Cursor answers `continue:true` on every one of these.
 */
describe('⭐ RC71 — cursor expiry consume + 6.1 floor', () => {
  function fakeBudget(totalMs = 60_000) {
    let t = 0;
    const timers: Array<{ at: number; fn: () => void }> = [];
    const budget = createHoldBudget({
      totalMs, now: () => t,
      setTimeoutFn: (fn, ms) => { const e = { at: t + ms, fn }; timers.push(e); return e; },
      clearTimeoutFn: (h) => { const i = timers.indexOf(h as never); if (i >= 0) timers.splice(i, 1); },
    });
    return { budget, advance(ms: number) { t += ms; for (const e of [...timers]) if (e.at <= t) { timers.splice(timers.indexOf(e), 1); e.fn(); } } };
  }
  const collect = () => {
    const events: Array<{ level: string; name: string; data: Record<string, unknown> }> = [];
    const logEvent = vi.fn((level: string, name: string, data?: Record<string, unknown>) => { events.push({ level, name, data: data ?? {} }); });
    return { events, logEvent, find: (n: string) => events.filter((e) => e.name === n) };
  };
  // Segments in order: stdin → echo check → auto wait → decider.
  const holdWith = (remainingAfterAuto: number) => ({
    remaining: () => remainingAfterAuto, expired: () => false,
    run: async <T>(work: () => Promise<T>) => ({ timedOut: false as const, value: await work() }),
  });
  const fakeChild = () => ({ kill: () => {} }) as never;

  it('⭐ decider expiry ⇒ consumer spawned once {reason:decider_expired, project=/proj}, continue:true', async () => {
    const f = fakeBudget(); const c = collect();
    const consumer = vi.fn(() => ({ spawned: true, pid: 77 }));
    const t0 = Date.now();
    const h = harness({ logEvent: c.logEvent, holdBudget: f.budget, spawnExpiryConsumer: consumer,
      spawnAutoFn: fakeChild, waitForChild: async () => {},
      decide: () => new Promise((r) => { f.advance(60_000); setTimeout(() => r('block'), 0); }) });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(consumer).toHaveBeenCalledTimes(1);
    const arg = consumer.mock.calls[0]![0] as unknown as { projectRoot: string; before: number; reason: string };
    expect(arg).toMatchObject({ reason: 'decider_expired', projectRoot: '/proj' });
    expect(arg.before).toBeGreaterThanOrEqual(t0);
    expect(c.find('cursor_hook_expiry_consume')).toEqual([{ level: 'info', name: 'cursor_hook_expiry_consume',
      data: { reason: 'decider_expired', spawned: true, pid: 77, error: null } }]);
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
  });

  it('⭐ auto expiry ⇒ consumer ONCE {reason:auto_expired} — the refused decider segment does not consume again', async () => {
    const consumer = vi.fn(() => ({ spawned: true, pid: 1 })); const decide = vi.fn(async () => 'block' as const);
    let call = 0;
    const fakeHold = {
      remaining: () => 0, expired: () => call > 1,
      run: async <T>(work: () => Promise<T>) => {
        call += 1;
        if (call <= 2) return { timedOut: false as const, value: await work() }; // stdin, echo check
        return { timedOut: true as const };                                       // auto → expired; decider refused
      },
    };
    const h = harness({ logEvent: () => {}, holdBudget: fakeHold as never, spawnExpiryConsumer: consumer,
      spawnAutoFn: fakeChild, waitForChild: async () => {}, decide });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(consumer).toHaveBeenCalledTimes(1);
    expect((consumer.mock.calls[0]![0] as unknown as { reason: string }).reason).toBe('auto_expired');
    expect(decide).not.toHaveBeenCalled();
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
  });

  it('⭐ below the floor after auto ⇒ hold_floor logged, decider SKIPPED, consumer {below_floor}, decision allow, split decider_ms null', async () => {
    const c = collect(); const consumer = vi.fn(() => ({ spawned: true, pid: 2 })); const decide = vi.fn(async () => 'block' as const);
    const raisePopup = vi.fn();
    const h = harness({ logEvent: c.logEvent, holdBudget: holdWith(SUBMIT_POPUP_MIN_REMAINING_MS - 1) as never,
      spawnExpiryConsumer: consumer, spawnAutoFn: fakeChild, waitForChild: async () => {}, decide, raisePopup });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    const floor = c.find('cursor_hook_hold_floor');
    expect(floor).toHaveLength(1);
    expect(floor[0]!.data).toMatchObject({ remaining_after_auto_ms: SUBMIT_POPUP_MIN_REMAINING_MS - 1, floor_ms: SUBMIT_POPUP_MIN_REMAINING_MS });
    expect(decide).not.toHaveBeenCalled();
    expect(raisePopup).not.toHaveBeenCalled(); // no popup to raise
    expect(consumer).toHaveBeenCalledTimes(1);
    expect((consumer.mock.calls[0]![0] as unknown as { reason: string }).reason).toBe('below_floor');
    expect(c.find('cursor_hook_hold_expired')).toHaveLength(0);
    expect(c.find('cursor_hook_decision')[0]!.data).toMatchObject({ decision: 'allow', decider_timed_out: false });
    expect(c.find('cursor_hook_hold_split')[0]!.data).toMatchObject({ decision: 'allow', decider_ms: null });
    expect(JSON.parse(h.writes[0])).toEqual({ continue: true });
  });

  it('exactly AT the floor the decider still runs and nothing is consumed', async () => {
    const consumer = vi.fn(() => ({ spawned: true, pid: 3 })); const decide = vi.fn(async () => 'allow' as const);
    const h = harness({ logEvent: () => {}, holdBudget: holdWith(SUBMIT_POPUP_MIN_REMAINING_MS) as never,
      spawnExpiryConsumer: consumer, spawnAutoFn: fakeChild, waitForChild: async () => {}, decide });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(consumer).not.toHaveBeenCalled();
  });

  it('a normal block run (real budget) ⇒ consumer never spawned, continue:false unchanged', async () => {
    const consumer = vi.fn(() => ({ spawned: true, pid: 4 }));
    const h = harness({ logEvent: () => {}, spawnExpiryConsumer: consumer, spawnAutoFn: fakeChild,
      waitForChild: async () => {}, decide: async () => 'block' as const });
    await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
    expect(consumer).not.toHaveBeenCalled();
    expect(JSON.parse(h.writes[0]).continue).toBe(false);
  });

  it('⭐ NEXPATH_HOLD_REMAINING_MS is set (numeric) for the auto spawn only and restored after; switch OFF ⇒ nothing spawned, nothing set', async () => {
    const prev = process.env.NEXPATH_HOLD_REMAINING_MS; delete process.env.NEXPATH_HOLD_REMAINING_MS;
    try {
      const seen: Array<string | undefined> = [];
      const h = harness({ logEvent: () => {}, spawnAutoFn: () => { seen.push(process.env.NEXPATH_HOLD_REMAINING_MS); return fakeChild(); },
        waitForChild: async () => {}, decide: async () => 'allow' as const });
      await runCursorHookAction('beforeSubmitPrompt', h.deps as never);
      expect(seen).toHaveLength(1);
      expect(Number(seen[0])).toBeGreaterThan(0);
      expect(process.env.NEXPATH_HOLD_REMAINING_MS).toBeUndefined(); // restored
      const spawnAuto = vi.fn(); const consumer = vi.fn(() => ({ spawned: true, pid: 5 }));
      const off = harness({ logEvent: () => {}, env: { [CURSOR_PROMPTSUBMIT_ADVISORY_ENV]: '0' }, spawnAutoFn: spawnAuto, spawnExpiryConsumer: consumer });
      await runCursorHookAction('beforeSubmitPrompt', off.deps as never);
      expect(spawnAuto).not.toHaveBeenCalled();
      expect(consumer).not.toHaveBeenCalled();
      expect(process.env.NEXPATH_HOLD_REMAINING_MS).toBeUndefined();
    } finally { if (prev !== undefined) process.env.NEXPATH_HOLD_REMAINING_MS = prev; }
  });
});
