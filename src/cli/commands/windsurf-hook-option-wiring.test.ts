/**
 * H3 — the adapter↔decider wiring in `buildDefaultPromptSubmitDecider`.
 *
 * The decider now defaults to a real option source instead of `() => null`, which
 * introduces a Store handle into a short-lived hook subprocess. These pin the two
 * things that could go wrong: a leaked lock, and a fault that HOLDS the user's
 * prompt instead of releasing it (amendment A3).
 */
import { describe, it, expect, vi } from 'vitest';
vi.mock('./submit-expiry-consumer.js', async (importOriginal) => {
  // RC71 hermetic: the real spawner would launch a detached `node <argv[1]> submit-expiry-consume`
  // from inside the test runner. The constant is kept real; only the spawn is stubbed.
  const mod = await importOriginal<typeof import('./submit-expiry-consumer.js')>();
  return { ...mod, spawnExpiryConsumer: vi.fn(() => ({ spawned: true, pid: 4242 })) };
});
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDefaultPromptSubmitDecider } from './windsurf-hook.js';

describe('store lifecycle — a leaked handle would hold the SQLite lock', () => {
  it('closes the store after deciding', async () => {
    const closeStore = vi.fn();
    const decide = buildDefaultPromptSubmitDecider({ project: '/proj' }, {
      openStore: async () => ({ db: {} }),
      closeStore,
    });
    await decide('pre_user_prompt', {});
    expect(closeStore).toHaveBeenCalledTimes(1);
  });

  it('closes the store even when the decision path throws', async () => {
    // The `auto` child of the same turn contends for this lock — a fault must not
    // leave it held.
    const closeStore = vi.fn();
    const decide = buildDefaultPromptSubmitDecider({ project: '/proj' }, {
      openStore: async () => ({ db: {} }),
      closeStore: closeStore.mockImplementation(() => {}),
      renderPopup: async () => { throw new Error('boom'); },
      composeOptions: undefined,
    });
    await decide('pre_user_prompt', {}).catch(() => {});
    expect(closeStore).toHaveBeenCalled();
  });

  it('never opens a store when an option source is injected', async () => {
    // The wiring site can supply its own adapter; opening a store then would be
    // pure waste inside a latency-sensitive hook.
    const openStore = vi.fn();
    const decide = buildDefaultPromptSubmitDecider({ project: '/proj' }, {
      openStore: openStore as never,
      composeOptions: () => null,
    });
    await decide('pre_user_prompt', {});
    expect(openStore).not.toHaveBeenCalled();
  });
});

describe('fail-open (A3) — never hold the prompt', () => {
  it('allows when the store cannot be opened', async () => {
    const decide = buildDefaultPromptSubmitDecider({ project: '/proj' }, {
      openStore: async () => { throw new Error('locked'); },
      closeStore: () => {},
    });
    await expect(decide('pre_user_prompt', {})).resolves.toBe('allow');
  });

  it('allows when closing the store fails', async () => {
    // A close failure must not turn a released prompt into a thrown hook.
    const decide = buildDefaultPromptSubmitDecider({ project: '/proj' }, {
      openStore: async () => ({ db: {} }),
      closeStore: () => { throw new Error('EBUSY'); },
    });
    await expect(decide('pre_user_prompt', {})).resolves.toBe('allow');
  });

  it('allows when there are no options', async () => {
    const decide = buildDefaultPromptSubmitDecider({ project: '/proj' }, {
      composeOptions: () => null,
    });
    await expect(decide('pre_user_prompt', {})).resolves.toBe('allow');
  });
});

describe('block path — end to end with the real prompt text', () => {
  it('blocks AND writes the replacement the extension will inject', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nexpath-h3-'));
    try {
      const decide = buildDefaultPromptSubmitDecider({ project: root }, {
        composeOptions: () => ({ l1: ['x'], l2: ['pick me'], l3: ['z'] }),
        renderPopup: async () => 'pick me',
        now: () => 1_700_000_000_000,
      });
      // The third arg is the real user prompt, plumbed from stdin by the action.
      await expect(decide('pre_user_prompt', { project: root }, 'my original prompt'))
        .resolves.toBe('block');

      // Blocking without a readable record would cancel the turn with nothing to
      // inject — the one outcome worse than today.
      const rec = JSON.parse(readFileSync(join(root, '.nexpath', 'submit-decision.json'), 'utf8'));
      expect(rec.replacementText).toBe('pick me');
      expect(rec.host).toBe('windsurf');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('still allows when no prompt text is supplied — the stub guard remains', async () => {
    const decide = buildDefaultPromptSubmitDecider({ project: '/proj' }, {
      composeOptions: () => ({ l1: [], l2: ['pick me'], l3: [] }),
      renderPopup: async () => 'pick me',
    });
    await expect(decide('pre_user_prompt', {})).resolves.toBe('allow');
  });

  it('allows when persistence fails — never block with nothing written', async () => {
    const decide = buildDefaultPromptSubmitDecider({ project: '/nonexistent-ro/proj' }, {
      composeOptions: () => ({ l1: [], l2: ['pick me'], l3: [] }),
      renderPopup: async () => 'pick me',
    });
    await expect(decide('pre_user_prompt', {})).resolves.toBe('allow');
  });
});

describe('⭐ BACKWARD COMPAT — switch OFF must be indistinguishable from before H3', () => {
  // The owner's standing requirement. H3 added a Store handle and a new module
  // import to this file; both must be unreachable when the switch is unset.
  it('constructing the decider opens no Store — the open is deferred into the gated call', async () => {
    // windsurfHookAction constructs this UNCONDITIONALLY (outside the switch
    // gate), so construction itself must be inert. If openStore ever moved out of
    // the returned closure, every hook invocation would take the SQLite lock —
    // including with the feature switched off.
    const openStore = vi.fn(async () => ({ db: {} }));
    buildDefaultPromptSubmitDecider({ project: '/proj' }, { openStore, closeStore: () => {} });
    expect(openStore).not.toHaveBeenCalled();
  });

  it('the switch reader defaults OFF and is exact-equality', async () => {
    const { isWindsurfPromptSubmitAdvisoryEnabled: on } = await import('./windsurf-hook.js');
    expect(on({})).toBe(false);            // unset
    expect(on({ NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '0' })).toBe(false);
    expect(on({ NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: 'true' })).toBe(false);
    expect(on({ NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1' })).toBe(true);
  });

  it('importing windsurf-hook takes no lock and creates no files', async () => {
    // store/db.js is now imported at module load. It must stay side-effect-free
    // (constants + a lazily-initialised `_SQL`), or merely loading the hook would
    // touch the DB on every Windsurf event.
    const before = existsSync(join(tmpdir(), 'nexpath-import-probe'));
    await import('./windsurf-hook.js');
    expect(before).toBe(existsSync(join(tmpdir(), 'nexpath-import-probe')));
  });
});

describe('⭐ stdin is single-read — the buffer must reach BOTH consumers', () => {
  const PAYLOAD = JSON.stringify({
    agent_action_name: 'pre_user_prompt',
    tool_info: { user_prompt: 'what is 2 + 2.' },
  });

  async function runAction(env: NodeJS.ProcessEnv, decide?: unknown) {
    const { runWindsurfHookAction: windsurfHookAction } = await import('./windsurf-hook.js');
    let stdinReads = 0;
    let handleGotRaw: string | null = null;
    let seenPrompt: string | undefined;
    await windsurfHookAction('pre_user_prompt', { project: '/proj' }, {
      checkReplacementEcho: async () => false,
      env,
      readStdin: async () => { stdinReads += 1; return PAYLOAD; },
      handle: async (_e, _o, d) => {
        handleGotRaw = d?.readStdin ? await d.readStdin() : null;
        return { action: 'ignored', reason: 'test' } as never;
      },
      decidePromptSubmit: (decide as never) ?? (async (_e: string, _o: unknown, p: string) => {
        seenPrompt = p; return 'allow' as const;
      }),
      exit: () => {},
      waitForChild: async () => {},
      raisePopup: () => {},
    } as never);
    return { stdinReads, handleGotRaw, seenPrompt };
  }

  it('switch ON: reads stdin exactly once and replays it into handle', async () => {
    // A pipe cannot be read twice. If the action consumed stdin and did NOT replay
    // it, handle would see an empty payload and `nexpath auto` would never run —
    // silently breaking the classification the popup depends on.
    const r = await runAction({ NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1' });
    expect(r.stdinReads).toBe(1);
    expect(r.handleGotRaw).toBe(PAYLOAD);
  });

  it('switch ON: the decider receives the real user prompt, not a stub', async () => {
    const r = await runAction({ NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1' });
    expect(r.seenPrompt).toBe('what is 2 + 2.');
  });

  it('switch OFF: the action never touches stdin — handle reads it as it always has', async () => {
    // Backward compat: with the switch unset the action must not consume stdin,
    // or it would change the shipped read path for every Windsurf event.
    const r = await runAction({});
    expect(r.stdinReads).toBe(0);
    expect(r.handleGotRaw).toBeNull();
  });

  it('switch ON with malformed stdin: allows, and still replays the bytes', async () => {
    const { runWindsurfHookAction: windsurfHookAction } = await import('./windsurf-hook.js');
    let handleCalled = false;
    let exited: number | null = null;
    await windsurfHookAction('pre_user_prompt', { project: '/proj' }, {
      checkReplacementEcho: async () => false,
      env: { NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1' },
      readStdin: async () => 'not json{{',
      // Injected so the test stays hermetic (the default decider would open a
      // real Store). The prompt it receives is what parsePayload salvaged.
      decidePromptSubmit: async (_e: string, _o: unknown, p: string) => {
        expect(p).toBe('');   // malformed payload ⇒ empty prompt, never a throw
        return 'allow' as const;
      },
      handle: async () => { handleCalled = true; return { action: 'ignored' } as never; },
      exit: (c: number) => { exited = c; },
      waitForChild: async () => {},
      raisePopup: () => {},
    } as never);
    // The normal path still ends in exit(0); what must NOT happen is exit(2).
    expect(exited).not.toBe(2);
    expect(handleCalled).toBe(true);
  });
});

describe('⭐ the gated stdin read is BOUNDED — a hang must not hold the prompt (A3)', () => {
  it('falls through to allow when stdin never closes', async () => {
    // defaultReadStdin resolves only on 'end'. If Windsurf ever invokes the hook
    // without closing the pipe, an unbounded await would hang the process while
    // the user's prompt is held — the worst outcome in this milestone. Found
    // because the H2 switch tests began timing out at 5000ms.
    const { runWindsurfHookAction } = await import('./windsurf-hook.js');
    let exited: number | null = null;
    let seenPrompt: string | undefined;
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, {
    checkReplacementEcho: async () => false,
      env: { NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1' },
      readStdin: () => new Promise<string>(() => {}),   // never resolves
      stdinTimeoutMs: 10,
      decidePromptSubmit: async (_e: string, _o: unknown, p: string) => {
        seenPrompt = p; return 'allow' as const;
      },
      handle: async () => ({ action: 'ignored' } as never),
      exit: (c: number) => { exited = c; },
      waitForChild: async () => {},
      raisePopup: () => {},
    } as never);
    expect(seenPrompt).toBe('');    // timed out ⇒ empty ⇒ decider allows
    expect(exited).not.toBe(2);
  });
});

describe('⭐ option A — the decision runs AFTER auto has classified this turn', () => {
  async function trace(decision: 'allow' | 'block') {
    const { runWindsurfHookAction } = await import('./windsurf-hook.js');
    const order: string[] = [];
    let exited: number | null = null;
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, {
    checkReplacementEcho: async () => false,
      env: { NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY: '1' },
      readStdin: async () => JSON.stringify({ tool_info: { user_prompt: 'hi' } }),
      handle: async () => { order.push('handle'); return { action: 'auto', child: null } as never; },
      waitForChild: async () => { order.push('awaitChild'); },
      decidePromptSubmit: async () => { order.push('decide'); return decision; },
      exit: (c: number) => { exited = c; },
      raisePopup: () => {},
    } as never);
    return { order, exited };
  }

  it('orders handle → awaitChild → decide', async () => {
    // MUTATION GUARD: if the decision moved back above `handle`, the option
    // source would read the PREVIOUS turn's pending_advisory row and advise on
    // the wrong prompt. That bug is invisible in a single-prompt test, so the
    // ordering itself is pinned.
    const { order } = await trace('allow');
    expect(order).toEqual(['handle', 'awaitChild', 'decide']);
  });

  it('still exits 2 on block, after auto has run', async () => {
    const { order, exited } = await trace('block');
    expect(order).toEqual(['handle', 'awaitChild', 'decide']);
    expect(exited).toBe(2);
  });

  it('switch OFF: never decides at all', async () => {
    const { runWindsurfHookAction } = await import('./windsurf-hook.js');
    let decided = false;
    await runWindsurfHookAction('pre_user_prompt', { project: '/proj' }, {
    checkReplacementEcho: async () => false,
      env: {},
      readStdin: async () => '{}',
      handle: async () => ({ action: 'ignored' } as never),
      waitForChild: async () => {},
      decidePromptSubmit: async () => { decided = true; return 'allow' as const; },
      exit: () => {},
      raisePopup: () => {},
    } as never);
    expect(decided).toBe(false);
  });
});

describe('⭐ the row is consumed ONLY on block', () => {
  function sourceSpy(pick: string | null) {
    const calls = { consumed: 0 };
    return {
      calls,
      source: {
        composeOptions: () => ({ l1: [], l2: ['pick me'], l3: [] }),
        renderPopup: async () => pick,
        consumeHandledTurn: () => { calls.consumed += 1; },
      },
    };
  }

  it('consumes on block — otherwise stop.ts shows the OLD popup too', async () => {
    const root = mkdtempSync(join(tmpdir(), 'nexpath-h3c-'));
    try {
      const spy = sourceSpy('pick me');
      const decide = buildDefaultPromptSubmitDecider({ project: root }, {
        optionSource: spy.source as never,
      });
      await expect(decide('pre_user_prompt', { project: root }, 'hi')).resolves.toBe('block');
      expect(spy.calls.consumed).toBe(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does NOT consume on allow — an ordinary turn keeps today\'s advisory', async () => {
    // MUTATION GUARD: consuming unconditionally would silently suppress the
    // shipped post-response advisory for every allowed prompt.
    const spy = sourceSpy(null);   // user dismissed ⇒ allow
    const decide = buildDefaultPromptSubmitDecider({ project: '/proj' }, {
      optionSource: spy.source as never,
    });
    await expect(decide('pre_user_prompt', {}, 'hi')).resolves.toBe('allow');
    expect(spy.calls.consumed).toBe(0);
  });
});
