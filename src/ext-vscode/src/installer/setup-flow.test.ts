import { describe, it, expect, vi } from 'vitest';
import { join } from 'node:path';
import { runSetupFlow, buildSetupCommand, type SetupFlowDeps, type SetupState, setupDoneMessage } from './setup-flow.js';
import { type StageResult } from './cli-stage.js';
import { type PrereqStatus } from './prereq.js';
import { type RunResult } from './terminal-runner.js';

const HOME = '/home/u/.nexpath';

const READY: PrereqStatus = {
  node: { present: true, version: 'v20' },
  npm: { present: true, version: '10' },
  ready: true,
};
const NOT_READY: PrereqStatus = {
  node: { present: false, version: null },
  npm: { present: true, version: '10' },
  ready: false,
};

const STAGED: StageResult = {
  status: 'staged',
  stagedDir: join(HOME, 'cli', '0.1.3'),
  cliEntry: join(HOME, 'cli', '0.1.3', 'dist', 'cli', 'index.js'),
  shimPath: join(HOME, 'bin', 'nexpath'),
  version: '0.1.3',
};
const CURRENT: StageResult = { ...STAGED, status: 'already-current' };

function makeDeps(over: Partial<SetupFlowDeps> = {}): {
  deps: SetupFlowDeps;
  state: { value: SetupState };
  calls: {
    runInTerminal: ReturnType<typeof vi.fn>;
    showError: ReturnType<typeof vi.fn>;
    showInfo: ReturnType<typeof vi.fn>;
    applyNexpathBin: ReturnType<typeof vi.fn>;
    verifyStagedCli: ReturnType<typeof vi.fn>;
    writeFile: ReturnType<typeof vi.fn>;
    setState: ReturnType<typeof vi.fn>;
  };
} {
  const state = { value: { done: false, version: null } as SetupState };
  const calls = {
    runInTerminal: vi.fn(async (): Promise<RunResult> => ({ ok: true, detail: 'OK', timedOut: false })),
    showError: vi.fn(),
    showInfo: vi.fn(),
    applyNexpathBin: vi.fn(),
    verifyStagedCli: vi.fn(() => true), // default: staged CLI runs (deps installed)
    writeFile: vi.fn(),
    setState: vi.fn(async (s: SetupState) => { state.value = s; }),
  };
  const deps: SetupFlowDeps = {
    nexpathHome: HOME,
    bundledCliDir: '/ext/nexpath-cli',
    checkPrereqs: () => READY,
    stageCli: () => STAGED,
    writeFile: calls.writeFile,
    buildCommand: buildSetupCommand,
    runInTerminal: calls.runInTerminal,
    showError: calls.showError,
    showInfo: calls.showInfo,
    applyNexpathBin: calls.applyNexpathBin,
    verifyStagedCli: calls.verifyStagedCli,
    getState: () => state.value,
    setState: calls.setState,
    ...over,
  };
  return { deps, state, calls };
}

describe('runSetupFlow', () => {
  it('blocks when node/npm are missing (no staging, no terminal)', async () => {
    const stageCli = vi.fn(() => STAGED);
    const { deps, calls } = makeDeps({ checkPrereqs: () => NOT_READY, stageCli });
    const outcome = await runSetupFlow(deps);
    expect(outcome).toBe('blocked');
    expect(stageCli).not.toHaveBeenCalled();
    expect(calls.runInTerminal).not.toHaveBeenCalled();
    expect(calls.showError).toHaveBeenCalledWith(expect.stringContaining('Node.js'));
  });

  it('reports no-bundle (dev build) without running the terminal', async () => {
    const { deps, calls } = makeDeps({
      stageCli: () => ({ status: 'no-bundle', stagedDir: null, cliEntry: null, shimPath: null, version: null }),
    });
    expect(await runSetupFlow(deps)).toBe('no-bundle');
    expect(calls.runInTerminal).not.toHaveBeenCalled();
    expect(calls.showError).toHaveBeenCalled();
  });

  it('runs the full flow on a fresh install and persists state', async () => {
    const { deps, state, calls } = makeDeps();
    const outcome = await runSetupFlow(deps);
    expect(outcome).toBe('done');
    expect(calls.applyNexpathBin).toHaveBeenCalledWith(STAGED.shimPath);
    expect(calls.writeFile).toHaveBeenCalledWith(
      join(HOME, 'nexpath-setup-runner.cjs'),
      expect.stringContaining('install'),
    );
    expect(calls.runInTerminal).toHaveBeenCalledOnce();
    expect(state.value).toEqual({ done: true, version: '0.1.3' });
    expect(calls.showInfo).toHaveBeenCalled();
  });

  it('skips re-running when already done for the current version (but still points IPC at the CLI)', async () => {
    const { deps, calls } = makeDeps({
      stageCli: () => CURRENT,
      getState: () => ({ done: true, version: '0.1.3' }),
    });
    const outcome = await runSetupFlow(deps);
    expect(outcome).toBe('already-done');
    expect(calls.runInTerminal).not.toHaveBeenCalled();
    expect(calls.applyNexpathBin).toHaveBeenCalledWith(STAGED.shimPath); // still wired up
  });

  it('force re-runs even when already done', async () => {
    const { deps, calls } = makeDeps({
      stageCli: () => CURRENT,
      getState: () => ({ done: true, version: '0.1.3' }),
    });
    expect(await runSetupFlow(deps, { force: true })).toBe('done');
    expect(calls.runInTerminal).toHaveBeenCalledOnce();
  });

  it('re-runs automatically when the bundled version changed', async () => {
    const { deps, calls, state } = makeDeps({
      getState: () => ({ done: true, version: '0.1.2' }), // older recorded version
    });
    expect(await runSetupFlow(deps)).toBe('done');
    expect(calls.runInTerminal).toHaveBeenCalledOnce();
    expect(state.value.version).toBe('0.1.3');
  });

  it('reports failure when the terminal run fails and does NOT mark done', async () => {
    const { deps, state, calls } = makeDeps({
      runInTerminal: vi.fn(async () => ({ ok: false, detail: 'FAIL:npm install', timedOut: false })),
    });
    expect(await runSetupFlow(deps)).toBe('failed');
    expect(state.value.done).toBe(false);
    expect(calls.showError).toHaveBeenCalledWith(expect.stringContaining('Set up CLI'));
  });

  // ── Directions 2/3/4: never trust/activate a staged CLI that doesn't run ────
  it('does NOT point IPC at a staged CLI that fails to verify (dep-less copy)', async () => {
    const { deps, calls } = makeDeps({
      stageCli: () => CURRENT,
      getState: () => ({ done: true, version: '0.1.3' }), // flag says done…
      verifyStagedCli: vi.fn(() => false),                // …but the copy can't run
    });
    const outcome = await runSetupFlow(deps);
    // Must NOT short-circuit to already-done, and must NOT set NEXPATH_BIN to the
    // broken copy before the runner re-installs deps.
    expect(outcome).not.toBe('already-done');
    expect(calls.applyNexpathBin).not.toHaveBeenCalled();
    expect(calls.runInTerminal).toHaveBeenCalledOnce();
  });

  it("treats a done+current copy as already-done ONLY when it verifies", async () => {
    const verified = makeDeps({ stageCli: () => CURRENT, getState: () => ({ done: true, version: '0.1.3' }) });
    expect(await runSetupFlow(verified.deps)).toBe('already-done');

    const broken = makeDeps({
      stageCli: () => CURRENT,
      getState: () => ({ done: true, version: '0.1.3' }),
      verifyStagedCli: vi.fn(() => false),
    });
    expect(await runSetupFlow(broken.deps)).not.toBe('already-done');
  });

  it("runner reports OK but the CLI still doesn't run → 'failed', not done", async () => {
    const { deps, state, calls } = makeDeps({
      runInTerminal: vi.fn(async () => ({ ok: true, detail: 'OK', timedOut: false })),
      verifyStagedCli: vi.fn(() => false), // npm install "ran" but deps still missing
    });
    expect(await runSetupFlow(deps)).toBe('failed');
    expect(state.value.done).toBe(false);
    expect(calls.applyNexpathBin).not.toHaveBeenCalled();
    expect(calls.showError).toHaveBeenCalledWith(expect.stringContaining('could not start'));
  });

  // ── preferExistingCli: a working GLOBAL nexpath exists → register this editor
  //    but NEVER override the global (no applyNexpathBin), and don't gate "done"
  //    on the staged copy verifying (the global is what runs). ──────────────────
  it('preferExistingCli: marks done WITHOUT overriding the global, even if the staged copy does not verify', async () => {
    const { deps, state, calls } = makeDeps({
      verifyStagedCli: vi.fn(() => false), // staged copy can't run — but the global can
    });
    const outcome = await runSetupFlow(deps, { preferExistingCli: true });
    expect(outcome).toBe('done');
    expect(state.value).toEqual({ done: true, version: '0.1.3' });
    expect(calls.runInTerminal).toHaveBeenCalledOnce();
    expect(calls.applyNexpathBin).not.toHaveBeenCalled(); // the global is never overridden
    expect(calls.showInfo).toHaveBeenCalled();
  });

  it('preferExistingCli: never points IPC at the staged shim even when it WOULD verify', async () => {
    const { deps, calls } = makeDeps(); // verifyStagedCli defaults to true
    expect(await runSetupFlow(deps, { preferExistingCli: true })).toBe('done');
    expect(calls.applyNexpathBin).not.toHaveBeenCalled();
  });
});

describe('buildSetupCommand', () => {
  it('quotes every path argument', () => {
    const cmd = buildSetupCommand('/r/runner.cjs', '/s/staged', '/s/.sentinel', '/s/staged/dist/cli/index.js');
    expect(cmd).toBe('node "/r/runner.cjs" "/s/staged" "/s/.sentinel" "/s/staged/dist/cli/index.js"');
  });
});

/**
 * 2026-08-13 (owner's clean-install test, live root cause): `state.done` lives
 * in globalState and SURVIVES a wipe of `~/.nexpath` + hooks.json — the flow
 * declared "already complete", the runner (which rewrites the hook registration
 * and the switch flag) never re-ran, and the submit hook silently never fired
 * again. "Already done" must also mean "still registered on disk".
 */
describe('⭐ verifyHookRegistration — a wiped machine must self-heal', () => {
  const doneState = { done: true, version: '0.1.3' };

  it('done + current + CLI verified BUT registration missing ⇒ the runner re-runs', async () => {
    const { deps, calls, state } = makeDeps({
      stageCli: () => CURRENT,
      verifyHookRegistration: () => false,   // hooks.json / flag wiped
    });
    state.value = { ...doneState };
    const outcome = await runSetupFlow(deps);
    expect(calls.runInTerminal).toHaveBeenCalledTimes(1);  // self-heal, not skip
    expect(outcome).toBe('done');
  });

  it('done + current + registered ⇒ still skips (no setup churn)', async () => {
    const { deps, calls, state } = makeDeps({
      stageCli: () => CURRENT,
      verifyHookRegistration: () => true,
    });
    state.value = { ...doneState };
    const outcome = await runSetupFlow(deps);
    expect(outcome).toBe('already-done');
    expect(calls.runInTerminal).not.toHaveBeenCalled();
  });

  it('dep absent ⇒ pre-fix behaviour (treated as registered)', async () => {
    const { deps, calls, state } = makeDeps({ stageCli: () => CURRENT });
    state.value = { ...doneState };
    const outcome = await runSetupFlow(deps);
    expect(outcome).toBe('already-done');
    expect(calls.runInTerminal).not.toHaveBeenCalled();
  });
});

/**
 * RC32 — a working GLOBAL nexpath must not mask a STAGED copy that cannot run.
 * The registered hook always invokes the staged entry, so only the staged copy's
 * own dependencies make the hook work. Caught live: "setup already complete +
 * verified" while the registered command died ERR_MODULE_NOT_FOUND.
 */
describe('⭐ RC32 — a registered hook needs the STAGED cli to actually run', () => {
  const STAGED = {
    status: 'already-current' as const, stagedDir: '/h/cli/0.1.4',
    cliEntry: '/h/cli/0.1.4/dist/cli/index.js', shimPath: '/h/bin/nexpath', version: '0.1.4',
  };
  const build = (over: Partial<SetupFlowDeps> = {}) => makeDeps({
    getState: () => ({ done: true, version: '0.1.4' }),
    stageCli: () => STAGED,
    verifyHookRegistration: () => true,
    ...over,
  });

  it('⭐ THE GAP: global CLI present + staged copy broken ⇒ setup RE-RUNS (was "already-done")', async () => {
    const { deps } = build({ verifyStagedCli: () => false });
    expect(await runSetupFlow(deps, { preferExistingCli: true })).not.toBe('already-done');
  });

  it('says WHY, so a broken hook is never silent', async () => {
    const lines: string[] = [];
    const { deps } = build({ verifyStagedCli: () => false, log: (l: string) => lines.push(l) });
    await runSetupFlow(deps, { preferExistingCli: true });
    expect(lines.join('\n')).toMatch(/staged CLI but that copy does not run/i);
  });

  it('⭐ INERT on a healthy install — still "already-done", no setup terminal', async () => {
    const { deps, calls } = build({ verifyStagedCli: () => true });
    expect(await runSetupFlow(deps, { preferExistingCli: true })).toBe('already-done');
    expect(calls.runInTerminal).not.toHaveBeenCalled();
  });

  it('inert without a global CLI too (the pre-RC32 path is unchanged)', async () => {
    const { deps } = build({ verifyStagedCli: () => true });
    expect(await runSetupFlow(deps, {})).toBe('already-done');
  });

  it('a broken staged cli with NO hook registered still re-runs (path unchanged)', async () => {
    const { deps } = build({ verifyHookRegistration: () => false, verifyStagedCli: () => false });
    expect(await runSetupFlow(deps, { preferExistingCli: true })).not.toBe('already-done');
  });
});

/** ⭐ F-8 (2026-09-05) — first-run done-message: Windows Cursor must FULLY QUIT (RC54), everyone else reloads. */
describe('⭐ F-8 — setup done-message wording', () => {
  it('win32 + cursor ⇒ the RC54 "Fully QUIT Cursor" wording, never "Reload"', () => {
    const m = setupDoneMessage('cursor', 'win32');
    expect(m).toContain('Nexpath is set up for Cursor.');
    expect(m).toContain('Fully QUIT Cursor (all windows) and reopen it');
    expect(m).not.toContain('Reload');
  });
  it('every other platform+host keeps the shipped "Reload the window" wording', () => {
    expect(setupDoneMessage('cursor', 'linux')).toContain('Reload the window or restart your agent');
    expect(setupDoneMessage('cursor', 'darwin')).toContain('Reload the window or restart your agent');
    expect(setupDoneMessage('windsurf', 'win32')).toBe('Nexpath is set up for Windsurf. Reload the window or restart your agent to activate guidance.');
    expect(setupDoneMessage(undefined, 'win32')).toBe('Nexpath is set up for this editor. Reload the window or restart your agent to activate guidance.');
  });
  it('the flow passes the platform seam through (win32 + NEXPATH_AGENT=cursor ⇒ quit wording in showInfo)', async () => {
    const prev = process.env.NEXPATH_AGENT; process.env.NEXPATH_AGENT = 'cursor';
    try {
      const { deps, calls } = makeDeps();
      expect(await runSetupFlow(deps, { platform: 'win32' })).toBe('done');
      expect(calls.showInfo.mock.calls[0]![0]).toContain('Fully QUIT Cursor');
      const linux = makeDeps();
      expect(await runSetupFlow(linux.deps, { platform: 'linux' })).toBe('done');
      expect(linux.calls.showInfo.mock.calls[0]![0]).toContain('Reload the window');
    } finally { if (prev === undefined) delete process.env.NEXPATH_AGENT; else process.env.NEXPATH_AGENT = prev; }
  });
});
