import { describe, it, expect, vi } from 'vitest';
import { SUBMIT_POPUP_MIN_REMAINING_MS } from './submit-expiry-consumer.js';
vi.mock('./submit-expiry-consumer.js', async (importOriginal) => {
  // RC71 hermetic: the real spawner would launch a detached `node <argv[1]> submit-expiry-consume`
  // from inside the test runner. The constant is kept real; only the spawn is stubbed.
  const mod = await importOriginal<typeof import('./submit-expiry-consumer.js')>();
  return { ...mod, spawnExpiryConsumer: vi.fn(() => ({ spawned: true, pid: 4242 })) };
});
import { EventEmitter } from 'node:events';
import { Command } from 'commander';
import {
  awaitChild,
  handleWindsurfHookCli,
  registerWindsurfHookCommand,
  runWindsurfHookAction,
  isReplacementEcho,
  isDuplicateWindsurfInvocation,
  WINDSURF_BLOCK_CARD_MESSAGE, readInjectedPromptSnapshot } from './windsurf-hook.js';
import {
  WINDSURF_INVOCATION_DIRNAME,
  WINDSURF_FALLBACK_WINDOW_MS,
} from '../../cursor-hook/invocation-guard.js';

describe('handleWindsurfHookCli', () => {
  it('reads stdin and dispatches (event, raw, {cwd}) to the handler', async () => {
    const run = vi.fn().mockReturnValue({ action: 'auto' });
    const readStdin = vi.fn().mockResolvedValue('{"tool_info":{"user_prompt":"hi"}}');

    const r = await handleWindsurfHookCli(
      'pre_user_prompt',
      { project: '/explicit' },
      { run, readStdin },
    );

    expect(readStdin).toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith('pre_user_prompt', '{"tool_info":{"user_prompt":"hi"}}', { cwd: '/explicit' });
    expect(r).toEqual({ action: 'auto' });
  });

  it('falls back to deps.cwd when --project is absent', async () => {
    const run = vi.fn().mockReturnValue({ action: 'stop' });
    await handleWindsurfHookCli('post_cascade_response', {}, {
      run,
      readStdin: () => Promise.resolve(''),
      cwd: '/fallback',
    });
    expect(run).toHaveBeenCalledWith('post_cascade_response', '', { cwd: '/fallback' });
  });
});

describe('awaitChild', () => {
  it('resolves immediately when there is no child', async () => {
    await expect(awaitChild(null)).resolves.toBeUndefined();
    await expect(awaitChild(undefined)).resolves.toBeUndefined();
  });

  it('resolves when the child exits', async () => {
    const child = new EventEmitter() as unknown as import('node:child_process').ChildProcess;
    const p = awaitChild(child, 5000);
    (child as unknown as EventEmitter).emit('exit', 0);
    await expect(p).resolves.toBeUndefined();
  });

  it('resolves when the child errors (never rejects)', async () => {
    const child = new EventEmitter() as unknown as import('node:child_process').ChildProcess;
    const p = awaitChild(child, 5000);
    (child as unknown as EventEmitter).emit('error', new Error('spawn fail'));
    await expect(p).resolves.toBeUndefined();
  });

  it('resolves via the timeout fallback if the child never exits', async () => {
    const child = new EventEmitter() as unknown as import('node:child_process').ChildProcess;
    await expect(awaitChild(child, 1)).resolves.toBeUndefined();
  });
});

describe('runWindsurfHookAction — popup-raise gate', () => {
  // This gate is the whole of the Windsurf half of the foreground fix: the
  // extension's own raiser never runs here, because Windsurf spawns `stop`
  // through this hook rather than through ipc. Every raiser unit test proves
  // the title list in isolation; only these prove the raiser is invoked, on
  // the right event, and not on the wrong one.

  function harness(overrides: Partial<Parameters<typeof runWindsurfHookAction>[2]> = {}) {
    const raisePopup = vi.fn();
    const waitForChild = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    const env: NodeJS.ProcessEnv = {};
    return {
      raisePopup, waitForChild, exit, env,
      // Hermetic: the echo-check default opens the real store.
      deps: { raisePopup, waitForChild, exit, env, checkReplacementEcho: async () => false, ...overrides },
    };
  }

  const withChild = (child: unknown) =>
    vi.fn().mockResolvedValue({ action: 'stop', child } as never);

  it('raises the popup on post_cascade_response when a child was spawned', async () => {
    const h = harness();
    await runWindsurfHookAction('post_cascade_response', {}, {
      ...h.deps,
      handle: withChild(new EventEmitter()),
    });
    expect(h.raisePopup).toHaveBeenCalledOnce();
  });

  it('does NOT raise the popup on pre_user_prompt (no popup is opened there)', async () => {
    const h = harness();
    await runWindsurfHookAction('pre_user_prompt', {}, {
      ...h.deps,
      handle: withChild(new EventEmitter()),
    });
    expect(h.raisePopup).not.toHaveBeenCalled();
  });

  it('does NOT raise the popup when no child was spawned', async () => {
    const h = harness();
    await runWindsurfHookAction('post_cascade_response', {}, {
      ...h.deps,
      handle: withChild(null),
    });
    expect(h.raisePopup).not.toHaveBeenCalled();
  });

  it('names the surface so Layer C labels the popup "Windsurf"', async () => {
    const h = harness();
    await runWindsurfHookAction('pre_user_prompt', {}, {
      ...h.deps,
      handle: withChild(null),
    });
    expect(h.env.NEXPATH_AGENT).toBe('windsurf');
  });

  it('awaits the Layer-C child before exiting', async () => {
    const h = harness();
    const child = new EventEmitter();
    await runWindsurfHookAction('post_cascade_response', {}, {
      ...h.deps,
      handle: withChild(child),
    });
    expect(h.waitForChild).toHaveBeenCalledWith(child);
    expect(h.waitForChild.mock.invocationCallOrder[0]).toBeLessThan(
      h.exit.mock.invocationCallOrder[0]!,
    );
  });

  it('never breaks Cascade — swallows a handler failure and still exits 0', async () => {
    const h = harness();
    await expect(
      runWindsurfHookAction('post_cascade_response', {}, {
        ...h.deps,
        handle: vi.fn().mockRejectedValue(new Error('handler blew up')),
      }),
    ).resolves.toBeUndefined();
    expect(h.raisePopup).not.toHaveBeenCalled();
    expect(h.exit).toHaveBeenCalledWith(0);
  });

  it('still exits 0 when raising the popup itself throws', async () => {
    const h = harness({ raisePopup: vi.fn(() => { throw new Error('no wmctrl'); }) });
    await expect(
      runWindsurfHookAction('post_cascade_response', {}, {
        ...h.deps,
        handle: withChild(new EventEmitter()),
      }),
    ).resolves.toBeUndefined();
    expect(h.exit).toHaveBeenCalledWith(0);
  });

  it('passes the project option through to the handler', async () => {
    const h = harness();
    const handle = withChild(null);
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, { ...h.deps, handle });
    expect(handle).toHaveBeenCalledWith('pre_user_prompt', { project: '/proj' });
  });
});

describe('registerWindsurfHookCommand', () => {
  it('registers a `windsurf-hook` command taking an <event> arg and --project', () => {
    const program = new Command();
    registerWindsurfHookCommand(program);
    const cmd = program.commands.find((c) => c.name() === 'windsurf-hook');
    expect(cmd).toBeDefined();
    // <event> positional is required
    expect(cmd!.registeredArguments.map((a) => a.name())).toContain('event');
    // --project option present
    expect(cmd!.options.some((o) => o.long === '--project')).toBe(true);
  });
});

/**
 * VED-PE-10 echo skip — Windsurf half (see cursor-hook.test.ts for the live
 * failure narrative). On an echo the deferred submit decision is never armed:
 * auto still runs (Layer C's guard consumes the synthetic prompt), but no
 * popup opens and the hook exits 0 exactly like the old flow.
 */
describe('VED-PE-10 — replacement echo never re-opens the submit popup', () => {
  const GATE_ENV = { NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1' };
  const PROMPT_PAYLOAD = JSON.stringify({ tool_info: { user_prompt: 'echo me' } });

  it('echo: exits 0 even when the decider would block', async () => {
    const exits: number[] = [];
    const decide = vi.fn(async () => 'block' as const);
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, {
      env: GATE_ENV,
      checkReplacementEcho: async () => true,
      readStdin: async () => PROMPT_PAYLOAD,
      decidePromptSubmit: decide,
      handle: async () => ({ child: null } as never),
      waitForChild: async () => {},
      exit: (c: number) => { exits.push(c); },
    } as never);
    expect(decide).not.toHaveBeenCalled();   // decision never armed
    expect(exits).toEqual([0]);              // old-flow exit, no block
  });

  it('non-echo: the deferred decision still runs', async () => {
    const exits: number[] = [];
    const decide = vi.fn(async () => 'allow' as const);
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, {
      env: GATE_ENV,
      checkReplacementEcho: async () => false,
      readStdin: async () => PROMPT_PAYLOAD,
      decidePromptSubmit: decide,
      handle: async () => ({ child: null } as never),
      waitForChild: async () => {},
      exit: (c: number) => { exits.push(c); },
    } as never);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(exits).toEqual([0]);
  });
});

describe('isReplacementEcho — store-backed echo detection', () => {
  const state = (last: string | null) => ({ current: { lastInjectedPrompt: last } });

  it('true when the prompt equals lastInjectedPrompt', async () => {
    await expect(isReplacementEcho('/proj', 'the replacement', {
      openStore: async () => ({}),
      closeStore: () => {},
      loadState: () => state('the replacement'),
    })).resolves.toBe(true);
  });

  it('false on a different prompt', async () => {
    await expect(isReplacementEcho('/proj', 'a fresh user prompt', {
      openStore: async () => ({}),
      closeStore: () => {},
      loadState: () => state('the replacement'),
    })).resolves.toBe(false);
  });

  it('false (short-circuit, no store open) for an empty prompt or missing project', async () => {
    const openStore = vi.fn();
    await expect(isReplacementEcho('/proj', '   ', { openStore } as never)).resolves.toBe(false);
    await expect(isReplacementEcho(undefined, 'text', { openStore } as never)).resolves.toBe(false);
    expect(openStore).not.toHaveBeenCalled();
  });

  it('fails open (false) when the store cannot be opened', async () => {
    await expect(isReplacementEcho('/proj', 'text', {
      openStore: async () => { throw new Error('locked'); },
    })).resolves.toBe(false);
  });
});

/**
 * RC12 (live block LOOP, 2026-08-13): the DS bridge re-injects the replacement
 * DECORATED (an @[nexpath:advisory] prefix + concatenation), so exact equality
 * missed the echo and the hook blocked its own replacement repeatedly. The
 * echo check now matches on normalised containment with a length floor.
 */
describe('⭐ RC12 — decorated replacements still register as echoes', () => {
  const BODY = 'My original request (verbatim): make me a booking website where customers can schedule appointments and pay online. Context And Constraints: carry forward environment facts.';
  const ports = (last: string | null) => ({
    openStore: async () => ({}),
    closeStore: () => {},
    loadState: () => ({ current: { lastInjectedPrompt: last } }),
  });

  it('exact match still echoes (fast path)', async () => {
    await expect(isReplacementEcho('/proj', BODY, ports(BODY))).resolves.toBe(true);
  });

  it('⭐ bridge-decorated resubmit (prefix + suffix) echoes via containment', async () => {
    const decorated = `guidance.@[nexpath:advisory] ${BODY} — attached context`;
    await expect(isReplacementEcho('/proj', decorated, ports(BODY))).resolves.toBe(true);
  });

  it('whitespace-normalised variants echo', async () => {
    const reflowed = BODY.replace(/ /g, '  ').replace('Context', '\nContext');
    await expect(isReplacementEcho('/proj', reflowed, ports(BODY))).resolves.toBe(true);
  });

  it('short prompts NEVER fuzzily skip (length floor)', async () => {
    await expect(isReplacementEcho('/proj', 'fix it', ports('fix'))).resolves.toBe(false);
    await expect(isReplacementEcho('/proj', 'a genuinely new user prompt', ports('new user'))).resolves.toBe(false);
  });

  it('a genuinely different long prompt is not an echo', async () => {
    const other = 'Completely different request about building an inventory tracker with barcode scanning and stock reports for warehouse staff members.';
    await expect(isReplacementEcho('/proj', other, ports(BODY))).resolves.toBe(false);
  });
});

/**
 * RC12 primary root cause: the registered hook command has no `--project`, so
 * the echo check received `undefined` and bailed before reading the store —
 * the skip NEVER fired in production. Pin that the action resolves the echo
 * projectRoot with the same `opts.project ?? process.cwd()` chain the stop
 * decider uses when writing `lastInjectedPrompt`.
 */
describe('⭐ RC12 — echo check projectRoot resolution', () => {
  it('no --project ⇒ echo check gets process.cwd(), NOT undefined', async () => {
    const seen: Array<string | undefined> = [];
    const payload = JSON.stringify({ tool_info: { user_prompt: 'a genuinely long prompt body for the echo resolution pin' } });
    await runWindsurfHookAction('pre_user_prompt', {}, {
      readStdin: async () => payload,
      readFlagFile: () => JSON.stringify({ windsurf: true }),
      checkReplacementEcho: async (root, _text) => { seen.push(root); return true; }, // echo ⇒ nothing else spawns
      handle: async () => ({ exitCode: 0 }),
      logEvent: () => {},
      exit: () => {},
    });
    expect(seen).toEqual([process.cwd()]);
  });

  it('--project wins over cwd when supplied', async () => {
    const seen: Array<string | undefined> = [];
    const payload = JSON.stringify({ tool_info: { user_prompt: 'a genuinely long prompt body for the echo resolution pin' } });
    await runWindsurfHookAction('pre_user_prompt', { project: '/explicit/root' }, {
      readStdin: async () => payload,
      readFlagFile: () => JSON.stringify({ windsurf: true }),
      checkReplacementEcho: async (root, _text) => { seen.push(root); return true; },
      handle: async () => ({ exitCode: 0 }),
      logEvent: () => {},
      exit: () => {},
    });
    expect(seen).toEqual(['/explicit/root']);
  });
});

/**
 * RC14: on a submit-flow block the hook writes WINDSURF_BLOCK_CARD_MESSAGE to
 * STDERR before exit(2) — Cascade renders that text in its block card
 * ("%d hook(s) blocked this action: %s"); empty stderr falls back to the
 * vendor default "Action blocked by hook". Allow paths must leave stderr
 * untouched so nothing leaks into a card that never renders.
 */
describe('⭐ RC14 — professional block-card text via stderr', () => {
  const payload = JSON.stringify({ tool_info: { user_prompt: 'a fresh genuine prompt long enough to pass every guard' } });
  const baseDeps = {
    readStdin: async () => payload,
    readFlagFile: () => JSON.stringify({ windsurf: true }),
    checkReplacementEcho: async () => false,
    handle: async () => ({ exitCode: 0 }),
    logEvent: () => {},
  };

  it('block ⇒ stderr carries the card message, then exit 2', async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk)); return true;
    }) as never);
    const exits: number[] = [];
    try {
      await runWindsurfHookAction('pre_user_prompt', {}, {
        ...baseDeps,
        decidePromptSubmit: async () => 'block',
        exit: (code: number) => { exits.push(code); },
      });
    } finally { spy.mockRestore(); }
    expect(exits[0]).toBe(2);
    expect(writes.join('')).toContain(WINDSURF_BLOCK_CARD_MESSAGE);
  });

  it('allow ⇒ stderr untouched', async () => {
    const writes: string[] = [];
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: unknown) => {
      writes.push(String(chunk)); return true;
    }) as never);
    const exits: number[] = [];
    try {
      await runWindsurfHookAction('pre_user_prompt', {}, {
        ...baseDeps,
        decidePromptSubmit: async () => 'allow',
        exit: (code: number) => { exits.push(code); },
      });
    } finally { spy.mockRestore(); }
    expect(exits[0]).toBe(0);
    expect(writes.join('')).toBe('');
  });

  it('the message leads with the truncation-safe key phrase', () => {
    expect(WINDSURF_BLOCK_CARD_MESSAGE.startsWith('Nexpath held this prompt')).toBe(true);
  });
});

/**
 * ⭐ RC38 — the queued-replacement echo (real files, no mocks). Devin queues a
 * replacement injected while Cascade is busy; by dequeue time a newer block has
 * overwritten the single lastInjectedPrompt slot — the registry catches it.
 */
describe('⭐ RC38 — isReplacementEcho consults the registry when the slot was overwritten', () => {
  it('a queued replacement whose slot was OVERWRITTEN is still recognised', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { appendReplacementEcho } = await import('./submit-decision-store.js');
    const root = mkdtempSync(join(tmpdir(), 'rc38-'));
    try {
      const queued = 'My original request (verbatim):\nadd stripe so clients can pay the invoice online\n\nContext And Constraints:\n- long enough to clear the forty character containment floor for the fuzzy match';
      appendReplacementEcho(root, queued);
      // The slot now holds a DIFFERENT, newer replacement (the overwrite).
      const echo = await isReplacementEcho(root, queued, {
        openStore: async () => ({}),
        closeStore: () => {},
        loadState: () => ({ current: { lastInjectedPrompt: 'a completely different newer replacement text that is also well over forty characters long' } }),
      });
      expect(echo).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('⭐ NO REGRESSION: a genuine user prompt matches neither slot nor registry', async () => {
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = mkdtempSync(join(tmpdir(), 'rc38-'));
    try {
      const echo = await isReplacementEcho(root, 'make me a website where users can create and manage their own online stores', {
        openStore: async () => ({}),
        closeStore: () => {},
        loadState: () => ({ current: { lastInjectedPrompt: null } }),
      });
      expect(echo).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

/**
 * ⭐ RC41 — the MPS continuation trigger (Windsurf half).
 * `post_cascade_response` is this host's "response finished" — the analog of
 * the Claude Stop that drives the CLI's continuation chain. When the switch is
 * ON and the runner reports it ran, the hook must NOT also run `handle`
 * (that would spawn a second stop for the same event); when it did not run,
 * the old flow must be byte-identical.
 */
describe('⭐ RC41 — post_cascade_response runs the sequence continuation', () => {
  const GATE_ENV = { NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1' };
  const base = (over: Record<string, unknown>) => ({
    env: { ...GATE_ENV },
    readStdin: async () => JSON.stringify({ trajectory_id: 'traj-1' }),
    suppressOldAdvisorySurface: async () => {},
    checkReplacementEcho: async () => false,
    waitForChild: async () => {},
    raisePopup: () => {},
    ...over,
  });

  it('⭐ runner ran ⇒ handle is NOT called (no second stop) and the hook exits 0', async () => {
    const exits: number[] = [];
    const handle = vi.fn(async () => ({ child: null } as never));
    const runSequenceContinuation = vi.fn(async () => ({ ran: true, blocked: true }));
    await runWindsurfHookAction('post_cascade_response', { project: '/proj' }, base({
      handle, runSequenceContinuation, exit: (c: number) => { exits.push(c); },
    }) as never);
    expect(runSequenceContinuation).toHaveBeenCalledWith('/proj', 'windsurf');
    expect(handle).not.toHaveBeenCalled();
    expect(exits).toEqual([0]);
  });

  it('runner {ran:false} ⇒ the event still ENDS under the switch (RC58 — no old-flow stop)', async () => {
    // FLIPPED 2026-08-24 (RC58): this pin previously asserted the fall-through
    // to `handle` — the carve-out that let the old-flow stop render popups at
    // post-response timing whose selections are UNDELIVERABLE under the armed
    // submit surface (suppressDsAdvisory). H9's ruling closes it: pending rows
    // wait for the next submit, where the decider delivers them.
    const exits: number[] = [];
    const handle = vi.fn(async () => ({ child: null } as never));
    await runWindsurfHookAction('post_cascade_response', { project: '/proj' }, base({
      handle, runSequenceContinuation: vi.fn(async () => ({ ran: false })), exit: (c: number) => { exits.push(c); },
    }) as never);
    expect(handle).not.toHaveBeenCalled();
    expect(exits).toEqual([0]);
  });

  it('⭐ switch OFF ⇒ the runner is never consulted (regression pin for the old flow)', async () => {
    const handle = vi.fn(async () => ({ child: null } as never));
    const runSequenceContinuation = vi.fn(async () => ({ ran: true }));
    await runWindsurfHookAction('post_cascade_response', { project: '/proj' }, {
      env: {}, handle, runSequenceContinuation,
      checkReplacementEcho: async () => false, waitForChild: async () => {},
      raisePopup: () => {}, exit: () => {},
    } as never);
    expect(runSequenceContinuation).not.toHaveBeenCalled();
    expect(handle).toHaveBeenCalledTimes(1);
  });
});

/**
 * ⭐ RC43 — a DEFERRED continuation (quiet-window echo of our own block) must
 * end the event: the old-flow `handle` reaches runStop's no-block path, which
 * routes to the SAME continuation launcher and would reopen the premature popup.
 */
describe('⭐ RC43 — deferred continuation ends the event (no old-flow fallthrough)', () => {
  it('deferred ⇒ handle NOT called, exit 0', async () => {
    const exits: number[] = [];
    const handle = vi.fn(async () => ({ child: null } as never));
    await runWindsurfHookAction('post_cascade_response', { project: '/proj' }, {
      env: { NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1' },
      readStdin: async () => JSON.stringify({ trajectory_id: 'traj-1' }),
      suppressOldAdvisorySurface: async () => {},
      checkReplacementEcho: async () => false,
      waitForChild: async () => {}, raisePopup: () => {},
      handle,
      runSequenceContinuation: vi.fn(async () => ({ ran: false, deferred: true })),
      exit: (c: number) => { exits.push(c); },
    } as never);
    expect(handle).not.toHaveBeenCalled();
    expect(exits).toEqual([0]);
  });
});

/**
 * ⭐ RC46 — the post-leg quiet window for NO-SEQUENCE turns. The RC43 window
 * lived inside the runner, which returns {ran:false} before consulting it when
 * no MPS row exists — so a plain PE turn's post-block echo fell through to the
 * old-flow stop and opened a second popup (whose console stole the win32
 * foreground at the exact moment auto-submit's Enter fired).
 */
describe('⭐ RC58 — switch ON closes the post leg entirely; switch OFF untouched', () => {
  it('⭐ switch OFF ⇒ post leg still reaches handle (old flow byte-identical)', async () => {
    const handle = vi.fn(async () => ({ child: null } as never));
    await runWindsurfHookAction('post_cascade_response', { project: '/proj' }, {
      env: {}, handle, checkReplacementEcho: async () => false,
      waitForChild: async () => {}, raisePopup: () => {}, exit: () => {},
    } as never);
    expect(handle).toHaveBeenCalledTimes(1);
  });
});

describe('⭐ RC46 — post_cascade_response quiet window without a sequence', () => {
  const GATE_ENV = { NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1' };
  const base = (over: Record<string, unknown>) => ({
    env: { ...GATE_ENV },
    readStdin: async () => JSON.stringify({ trajectory_id: 'traj-1' }),
    suppressOldAdvisorySurface: async () => {},
    checkReplacementEcho: async () => false,
    waitForChild: async () => {}, raisePopup: () => {},
    runSequenceContinuation: vi.fn(async () => ({ ran: false })),
    ...over,
  });

  it('⭐ fresh echo (inside window) ⇒ event ENDS: no handle, exit 0', async () => {
    const exits: number[] = [];
    const handle = vi.fn(async () => ({ child: null } as never));
    const realAppend = await import('./submit-decision-store.js');
    const tmp = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const proj = await tmp.mkdtemp(path.join(os.tmpdir(), 'rc46-'));
    realAppend.appendReplacementEcho(proj, 'a fresh block body long enough to be registered cleanly');
    await runWindsurfHookAction('post_cascade_response', { project: proj }, base({
      handle, exit: (c: number) => { exits.push(c); },
    }) as never);
    expect(handle).not.toHaveBeenCalled();
    expect(exits).toEqual([0]);
    await tmp.rm(proj, { recursive: true, force: true });
  });

  it('no echo registry ⇒ the event ENDS under the switch too (RC58 flip of the RC46 fall-through pin)', async () => {
    const handle = vi.fn(async () => ({ child: null } as never));
    const exits: number[] = [];
    const tmp = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    const proj = await tmp.mkdtemp(path.join(os.tmpdir(), 'rc46b-'));
    await runWindsurfHookAction('post_cascade_response', { project: proj }, base({
      handle, exit: (c: number) => { exits.push(c); },
    }) as never);
    expect(handle).not.toHaveBeenCalled();
    expect(exits).toEqual([0]);
    await tmp.rm(proj, { recursive: true, force: true });
  });
});

/**
 * ⭐ RC64 — Windows Devin executes BOTH the global and the workspace
 * hooks.json (RC21-era builds ran only the workspace file). One submit then
 * spawned two full pipelines: two autos prepared two DIFFERENT enhancements,
 * two popups, two blocks, two injected replacements (2026-08-25 tester
 * screenshot: both queued). The twin must exit 0 having spawned NOTHING;
 * the primary's exit 2 still blocks (Windsurf blocks on ANY hook's 2).
 */
describe('⭐ RC64 — duplicate windsurf invocations (global + workspace both execute)', () => {
  const GATE_ENV = { NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1' };

  async function tmpRoot(prefix: string) {
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    return fs.mkdtemp(path.join(os.tmpdir(), prefix));
  }

  it('key selection: execution_id → 10-min window; fallback trajectory+hash → SHORT window; neither → fail-open', () => {
    const calls: Array<{ key: string; deps: { dirName?: string; maxAgeMs?: number } }> = [];
    const spy = ((_r: string, _e: string, key: string, deps: never) => {
      calls.push({ key, deps }); return false;
    }) as never;
    isDuplicateWindsurfInvocation('/r', 'pre_user_prompt',
      { execution_id: 'e1', trajectory_id: 't', tool_info: { user_prompt: 'p' } }, spy);
    isDuplicateWindsurfInvocation('/r', 'pre_user_prompt',
      { trajectory_id: 't', tool_info: { user_prompt: 'p' } }, spy);
    const none = isDuplicateWindsurfInvocation('/r', 'pre_user_prompt', {}, spy);
    expect(calls[0]!.key).toBe('e1');
    expect(calls[0]!.deps.dirName).toBe(WINDSURF_INVOCATION_DIRNAME);
    expect(calls[0]!.deps.maxAgeMs).toBeUndefined(); // execution_id is unique per action — cursor default window
    expect(calls[1]!.key.startsWith('t-')).toBe(true);
    expect(calls[1]!.deps.maxAgeMs).toBe(WINDSURF_FALLBACK_WINDOW_MS);
    expect(none).toEqual({ duplicate: false, key_kind: 'none' });
    expect(calls).toHaveLength(2); // the keyless payload never reached the guard
  });

  it('⭐ pre leg: the twin exits 0 having spawned NOTHING (no auto, no decider)', async () => {
    const root = await tmpRoot('rc64-pre-');
    const PAYLOAD = JSON.stringify({
      trajectory_id: 't-1', execution_id: 'exec-A',
      tool_info: { user_prompt: 'hello world' },
    });
    const run = async () => {
      const exits: number[] = [];
      const handle = vi.fn(async () => ({ child: null } as never));
      const decide = vi.fn(async () => 'allow' as const);
      await runWindsurfHookAction('pre_user_prompt', { project: root }, {
        env: { ...GATE_ENV },
        readStdin: async () => PAYLOAD,
        checkReplacementEcho: async () => false,
        decidePromptSubmit: decide,
        handle, waitForChild: async () => {}, raisePopup: () => {},
        exit: (c: number) => { exits.push(c); },
      } as never);
      return { exits, handle, decide };
    };
    const first = await run();
    expect(first.handle).toHaveBeenCalledTimes(1); // primary runs the full flow
    expect(first.decide).toHaveBeenCalledTimes(1);
    const twin = await run();
    expect(twin.handle).not.toHaveBeenCalled();
    expect(twin.decide).not.toHaveBeenCalled();
    expect(twin.exits).toEqual([0]);
    const fs = await import('node:fs/promises');
    await fs.rm(root, { recursive: true, force: true });
  });

  it('⭐ post leg: the twin never re-runs the continuation (no second MPS popup) nor the sweep', async () => {
    const root = await tmpRoot('rc64-post-');
    const PAYLOAD = JSON.stringify({
      trajectory_id: 't-1', execution_id: 'exec-B',
      tool_info: { response: 'done.' },
    });
    const run = async () => {
      const exits: number[] = [];
      const handle = vi.fn(async () => ({ child: null } as never));
      const cont = vi.fn(async () => ({ ran: false }));
      const suppress = vi.fn(async () => 0);
      await runWindsurfHookAction('post_cascade_response', { project: root }, {
        env: { ...GATE_ENV },
        readStdin: async () => PAYLOAD,
        checkReplacementEcho: async () => false,
        suppressOldAdvisorySurface: suppress,
        runSequenceContinuation: cont,
        handle, waitForChild: async () => {}, raisePopup: () => {},
        exit: (c: number) => { exits.push(c); },
      } as never);
      return { exits, cont, suppress };
    };
    const first = await run();
    expect(first.suppress).toHaveBeenCalledTimes(1);
    expect(first.cont).toHaveBeenCalledTimes(1);
    const twin = await run();
    expect(twin.cont).not.toHaveBeenCalled();
    expect(twin.suppress).not.toHaveBeenCalled();
    expect(twin.exits).toEqual([0]);
    const fs = await import('node:fs/promises');
    await fs.rm(root, { recursive: true, force: true });
  });

  it('distinct execution_ids are never deduped (two REAL submits back-to-back)', async () => {
    const root = await tmpRoot('rc64-distinct-');
    const run = async (execId: string) => {
      const handle = vi.fn(async () => ({ child: null } as never));
      await runWindsurfHookAction('pre_user_prompt', { project: root }, {
        env: { ...GATE_ENV },
        readStdin: async () => JSON.stringify({
          trajectory_id: 't-1', execution_id: execId, tool_info: { user_prompt: 'same text' },
        }),
        checkReplacementEcho: async () => false,
        decidePromptSubmit: async () => 'allow' as const,
        handle, waitForChild: async () => {}, raisePopup: () => {}, exit: () => {},
      } as never);
      return handle;
    };
    expect(await run('exec-1')).toHaveBeenCalledTimes(1);
    expect(await run('exec-2')).toHaveBeenCalledTimes(1);
    const fs = await import('node:fs/promises');
    await fs.rm(root, { recursive: true, force: true });
  });

  it('⭐ switch OFF ⇒ the guard is never consulted (old flow byte-identical)', async () => {
    const check = vi.fn(() => ({ duplicate: true, key_kind: 'execution_id' as const }));
    const handle = vi.fn(async () => ({ child: null } as never));
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, {
      env: {},
      checkDuplicateInvocation: check,
      handle, checkReplacementEcho: async () => false,
      waitForChild: async () => {}, raisePopup: () => {}, exit: () => {},
    } as never);
    expect(check).not.toHaveBeenCalled();
    expect(handle).toHaveBeenCalledTimes(1);
  });
});

/**
 * ⭐ RC67 — Windsurf hold expiry is LOGGED with the budget split. Before this the
 * Windsurf hook wrote NOTHING when the hold expired (Cursor at least logged
 * decider_timed_out) — the tester diagnosed the 76 s expiries from a MISSING line.
 * Logging only; the decision and the exit code are unchanged (pinned below).
 */
describe('⭐ RC67 — windsurf hold expiry logged with the budget split', () => {
  const GATE_ENV = { NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1' };
  const PAYLOAD = JSON.stringify({ trajectory_id: 't-rc67', tool_info: { user_prompt: 'hello world' } });
  const noDup = () => ({ duplicate: false, key_kind: 'none' as const });
  const collect = () => {
    const events: Array<{ name: string; data: Record<string, unknown> }> = [];
    const logEvent = vi.fn((_l: string, name: string, data?: Record<string, unknown>) => { events.push({ name, data: data ?? {} }); });
    return { events, logEvent, find: (n: string) => events.filter((e) => e.name === n) };
  };
  // Gated pre_user_prompt segments, in order: stdin → echo check → auto wait → decider.
  const holdThatExpiresAt = (expireOnCall: number) => {
    let call = 0;
    return {
      // RC71: `remaining` models the hold — plenty until the expiring segment,
      // 0 after it. (A flat 0 would trip the 6.1 floor before the decider ran.)
      remaining: () => (call >= expireOnCall ? 0 : 60_000), expired: () => call >= expireOnCall,
      run: async <T>(work: () => Promise<T>) => {
        call += 1;
        if (call >= expireOnCall) return { timedOut: true as const };
        return { timedOut: false as const, value: await work() };
      },
    };
  };
  const base = (over: Record<string, unknown>) => ({
    env: { ...GATE_ENV }, readStdin: async () => PAYLOAD, checkDuplicateInvocation: noDup,
    checkReplacementEcho: async () => false, handle: async () => ({ child: null } as never),
    waitForChild: async () => {}, raisePopup: () => {}, ...over,
  });

  it('⭐ decider timeout ⇒ windsurf_hook_hold_expired{segment:decider} + hold_split{decider_timed_out} and exit 0 (fail-open)', async () => {
    const c = collect(); const exits: number[] = [];
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, base({
      logEvent: c.logEvent, holdBudget: holdThatExpiresAt(4),
      decidePromptSubmit: async () => 'block' as const, exit: (code: number) => { exits.push(code); },
    }) as never);
    const exp = c.find('windsurf_hook_hold_expired');
    expect(exp).toHaveLength(1);
    expect(exp[0]!.data.segment).toBe('decider');
    expect(typeof exp[0]!.data.auto_ms).toBe('number');
    expect(typeof exp[0]!.data.decider_ms).toBe('number');
    const split = c.find('windsurf_hook_hold_split');
    expect(split).toHaveLength(1);
    expect(split[0]!.data).toMatchObject({ decision: 'allow', decider_timed_out: true });
    expect(exits).toEqual([0]);
  });

  it('⭐ auto-wait timeout ⇒ windsurf_hook_hold_expired{segment:auto}, no split (no decision ran), exit 0', async () => {
    const c = collect(); const exits: number[] = []; const decide = vi.fn(async () => 'block' as const);
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, base({
      logEvent: c.logEvent, holdBudget: holdThatExpiresAt(3), decidePromptSubmit: decide,
      exit: (code: number) => { exits.push(code); },
    }) as never);
    const exp = c.find('windsurf_hook_hold_expired');
    expect(exp).toHaveLength(1);
    expect(exp[0]!.data.segment).toBe('auto');
    expect(exp[0]!.data.decider_ms).toBeNull();
    expect(c.find('windsurf_hook_hold_split')).toHaveLength(0);
    expect(decide).not.toHaveBeenCalled();
    expect(exits).toEqual([0]);
  });

  it('a normal block run ⇒ hold_split{decision:block} with numeric fields, NO hold_expired, exit 2', async () => {
    const c = collect(); const exits: number[] = [];
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, base({
      logEvent: c.logEvent, decidePromptSubmit: async () => 'block' as const,
      exit: (code: number) => { exits.push(code); },
    }) as never);
    expect(c.find('windsurf_hook_hold_expired')).toHaveLength(0);
    const split = c.find('windsurf_hook_hold_split');
    expect(split).toHaveLength(1);
    expect(split[0]!.data.decision).toBe('block');
    expect(typeof split[0]!.data.auto_ms).toBe('number');
    expect(typeof split[0]!.data.decider_ms).toBe('number');
    expect(typeof split[0]!.data.remaining_after_auto_ms).toBe('number');
    expect(exits).toEqual([2]);
  });

  it('⭐ switch OFF ⇒ the sink is never called (old flow byte-identical)', async () => {
    const c = collect();
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, base({
      env: {}, logEvent: c.logEvent, exit: () => {},
    }) as never);
    expect(c.logEvent).not.toHaveBeenCalled();
  });
});

/**
 * ⭐ RC71 — expiry consume (tester §4b fix 1) + the 6.1 floor, Windsurf side.
 * On every expiry — and below the floor — a DETACHED consumer is spawned for
 * this turn's rows, so nothing replays next turn; the hook still exits 0 at once.
 */
describe('⭐ RC71 — windsurf expiry consume + 6.1 floor', () => {
  const GATE_ENV = { NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1' };
  const PAYLOAD = JSON.stringify({ trajectory_id: 't-rc71', tool_info: { user_prompt: 'hello world' } });
  const noDup = () => ({ duplicate: false, key_kind: 'none' as const });
  const collect = () => {
    const events: Array<{ level: string; name: string; data: Record<string, unknown> }> = [];
    const logEvent = vi.fn((level: string, name: string, data?: Record<string, unknown>) => { events.push({ level, name, data: data ?? {} }); });
    return { events, logEvent, find: (n: string) => events.filter((e) => e.name === n) };
  };
  // Segments in order: stdin → echo check → auto wait → decider.
  const holdWith = (remainingAfterAuto: number, expireOnCall = Infinity) => {
    let call = 0;
    return {
      remaining: () => (call >= expireOnCall ? 0 : remainingAfterAuto), expired: () => call >= expireOnCall,
      run: async <T>(work: () => Promise<T>) => {
        call += 1;
        if (call >= expireOnCall) return { timedOut: true as const };
        return { timedOut: false as const, value: await work() };
      },
    };
  };
  const base = (over: Record<string, unknown>) => ({
    env: { ...GATE_ENV }, readStdin: async () => PAYLOAD, checkDuplicateInvocation: noDup,
    checkReplacementEcho: async () => false, handle: async () => ({ child: null } as never),
    waitForChild: async () => {}, raisePopup: () => {}, ...over,
  });

  it('⭐ decider expiry ⇒ consumer spawned once {reason:decider_expired, project, before≈now}, logged, exit 0', async () => {
    const c = collect(); const exits: number[] = [];
    const consumer = vi.fn(() => ({ spawned: true, pid: 77 }));
    const t0 = Date.now();
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, base({
      logEvent: c.logEvent, holdBudget: holdWith(60_000, 4), spawnExpiryConsumer: consumer,
      decidePromptSubmit: async () => 'block' as const, exit: (code: number) => { exits.push(code); },
    }) as never);
    expect(consumer).toHaveBeenCalledTimes(1);
    const arg = consumer.mock.calls[0]![0] as unknown as { projectRoot: string; before: number; reason: string };
    expect(arg.reason).toBe('decider_expired');
    expect(arg.projectRoot).toBe('/proj');
    expect(arg.before).toBeGreaterThanOrEqual(t0);
    expect(arg.before).toBeLessThanOrEqual(Date.now());
    expect(c.find('windsurf_hook_expiry_consume')).toEqual([{ level: 'info', name: 'windsurf_hook_expiry_consume',
      data: { reason: 'decider_expired', spawned: true, pid: 77, error: null } }]);
    expect(exits).toEqual([0]);
  });

  it('⭐ auto expiry ⇒ consumer {reason:auto_expired}; decider never consulted', async () => {
    const consumer = vi.fn(() => ({ spawned: true, pid: 1 })); const decide = vi.fn(async () => 'block' as const);
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, base({
      logEvent: () => {}, holdBudget: holdWith(60_000, 3), spawnExpiryConsumer: consumer,
      decidePromptSubmit: decide, exit: () => {},
    }) as never);
    expect(consumer).toHaveBeenCalledTimes(1);
    expect((consumer.mock.calls[0]![0] as unknown as { reason: string }).reason).toBe('auto_expired');
    expect(decide).not.toHaveBeenCalled();
  });

  it('⭐ below the floor after auto ⇒ hold_floor logged, decider SKIPPED, consumer {reason:below_floor}, no split, exit 0', async () => {
    const c = collect(); const exits: number[] = [];
    const consumer = vi.fn(() => ({ spawned: true, pid: 2 })); const decide = vi.fn(async () => 'block' as const);
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, base({
      logEvent: c.logEvent, holdBudget: holdWith(SUBMIT_POPUP_MIN_REMAINING_MS - 1), spawnExpiryConsumer: consumer,
      decidePromptSubmit: decide, exit: (code: number) => { exits.push(code); },
    }) as never);
    const floor = c.find('windsurf_hook_hold_floor');
    expect(floor).toHaveLength(1);
    expect(floor[0]!.data).toMatchObject({ remaining_after_auto_ms: SUBMIT_POPUP_MIN_REMAINING_MS - 1, floor_ms: SUBMIT_POPUP_MIN_REMAINING_MS });
    expect(typeof floor[0]!.data.auto_ms).toBe('number');
    expect(decide).not.toHaveBeenCalled();
    expect(consumer).toHaveBeenCalledTimes(1);
    expect((consumer.mock.calls[0]![0] as unknown as { reason: string }).reason).toBe('below_floor');
    expect(c.find('windsurf_hook_hold_expired')).toHaveLength(0);
    expect(c.find('windsurf_hook_hold_split')).toHaveLength(0); // no decision ran (same as the auto-expiry precedent)
    expect(exits).toEqual([0]);
  });

  it('exactly AT the floor the decider still runs and nothing is consumed', async () => {
    const consumer = vi.fn(() => ({ spawned: true, pid: 3 })); const decide = vi.fn(async () => 'allow' as const);
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, base({
      logEvent: () => {}, holdBudget: holdWith(SUBMIT_POPUP_MIN_REMAINING_MS), spawnExpiryConsumer: consumer,
      decidePromptSubmit: decide, exit: () => {},
    }) as never);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(consumer).not.toHaveBeenCalled();
  });

  it('a normal block run (real budget) ⇒ consumer never spawned, exit 2 unchanged', async () => {
    const consumer = vi.fn(() => ({ spawned: true, pid: 4 })); const exits: number[] = [];
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, base({
      logEvent: () => {}, spawnExpiryConsumer: consumer,
      decidePromptSubmit: async () => 'block' as const, exit: (code: number) => { exits.push(code); },
    }) as never);
    expect(consumer).not.toHaveBeenCalled();
    expect(exits).toEqual([2]);
  });

  it('a failed consumer spawn is logged as warn and never changes the fail-open exit', async () => {
    const c = collect(); const exits: number[] = [];
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, base({
      logEvent: c.logEvent, holdBudget: holdWith(60_000, 4),
      spawnExpiryConsumer: () => ({ spawned: false, error: 'EACCES' }),
      decidePromptSubmit: async () => 'block' as const, exit: (code: number) => { exits.push(code); },
    }) as never);
    expect(c.find('windsurf_hook_expiry_consume')[0]).toMatchObject({ level: 'warn', data: { spawned: false, error: 'EACCES' } });
    expect(exits).toEqual([0]);
  });

  it('⭐ gated ⇒ NEXPATH_HOLD_REMAINING_MS is set (numeric) before `handle` spawns auto; switch OFF ⇒ never set, consumer never spawned', async () => {
    const seen: Array<string | undefined> = [];
    const env: Record<string, string> = { ...GATE_ENV };
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, base({
      env, logEvent: () => {}, handle: async () => { seen.push(env.NEXPATH_HOLD_REMAINING_MS); return { child: null } as never; },
      decidePromptSubmit: async () => 'allow' as const, exit: () => {},
    }) as never);
    expect(seen).toHaveLength(1);
    expect(Number(seen[0])).toBeGreaterThan(0);
    const offEnv: Record<string, string> = {};
    const consumer = vi.fn(() => ({ spawned: true, pid: 5 }));
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, base({
      env: offEnv, logEvent: () => {}, spawnExpiryConsumer: consumer, exit: () => {},
    }) as never);
    expect(offEnv.NEXPATH_HOLD_REMAINING_MS).toBeUndefined();
    expect(offEnv.NEXPATH_AGENT).toBe('windsurf'); // the pre-existing line still runs on the old flow
    expect(consumer).not.toHaveBeenCalled();
  });
});

/**
 * ⭐ Double-close (Bhavnesh finding 2026-09-06): the echo check must READ the
 * session, never close it. SessionStateManager.load() folds maturity at the
 * 30-minute boundary even for a read-only caller; auto then folds it again.
 */
describe('⭐ double-close — isReplacementEcho reads the session without closing it', () => {
  const BODY = 'a genuinely long injected replacement prompt body used by the double-close pins for containment';
  const storeWith = (stateJson: string | null) => {
    const run = vi.fn();
    const exec = vi.fn((_sql: string, _params: unknown[]) => (stateJson === null ? [] : [{ values: [[stateJson]] }]));
    return { store: { db: { exec, run } } as never, run, exec };
  };
  const state = (over: Record<string, unknown>) => JSON.stringify({ sessionId: 's1', promptCount: 3, lastPromptAt: Date.now(), lastInjectedPrompt: BODY, ...over });

  it('⭐ default reader: the persisted lastInjectedPrompt is read and NOTHING is written (no fold, no save)', async () => {
    const { store, run, exec } = storeWith(state({}));
    await expect(isReplacementEcho('/proj', BODY, { openStore: async () => store, closeStore: () => {} })).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith('SELECT state_json FROM session_states WHERE project_root = ?', ['/proj']);
    expect(run).not.toHaveBeenCalled();
  });
  it('past the 30-minute gap the session counts as over — same answer load() gave (fresh session, no injected prompt)', () => {
    const { store } = storeWith(state({ lastPromptAt: Date.now() - 30 * 60 * 1000 }));
    expect(readInjectedPromptSnapshot(store, '/proj').current.lastInjectedPrompt).toBeNull();
    const live = storeWith(state({ lastPromptAt: Date.now() - 30 * 60 * 1000 + 5_000 }));
    expect(readInjectedPromptSnapshot(live.store, '/proj').current.lastInjectedPrompt).toBe(BODY);
  });
  it('no row / corrupt JSON / non-string field ⇒ null, never a throw', () => {
    expect(readInjectedPromptSnapshot(storeWith(null).store, '/proj').current.lastInjectedPrompt).toBeNull();
    expect(readInjectedPromptSnapshot(storeWith('{not json').store, '/proj').current.lastInjectedPrompt).toBeNull();
    expect(readInjectedPromptSnapshot(storeWith(state({ lastInjectedPrompt: 42 })).store, '/proj').current.lastInjectedPrompt).toBeNull();
  });
});
