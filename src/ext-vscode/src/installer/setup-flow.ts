import { join } from 'node:path';
import { missingPrereqMessage, type PrereqStatus } from './prereq.js';
import { type StageResult } from './cli-stage.js';
import {
  buildSetupRunnerSource,
  SETUP_RUNNER_FILENAME,
  SETUP_SENTINEL_FILENAME,
} from './setup-runner-source.js';
import { type RunResult } from './terminal-runner.js';

/**
 * Orchestrates the one-time (and update-triggered) CLI setup, fully via injected
 * dependencies so the decision logic is unit-testable with no VS Code, no
 * terminal, and no real filesystem. `extension.ts` constructs the real deps.
 *
 * Order: prereqs → stage the bundled CLI → (point IPC at it) → if not already
 * done for this version, write the runner + drive it in a terminal → on success
 * persist state. Everything is additive: nothing here mutates Layer C or the
 * existing watcher/poller/inject paths. If anything is missing or fails, the
 * extension keeps working exactly as before (the user can retry via the command).
 */

export type SetupOutcome =
  | 'already-done'
  | 'done'
  | 'blocked'
  | 'no-bundle'
  | 'failed';

export interface SetupState {
  done: boolean;
  version: string | null;
}

export interface SetupFlowDeps {
  nexpathHome: string;
  /** Absolute path to the CLI bundled in the .vsix, or null for unbundled (dev) builds. */
  bundledCliDir: string | null;
  checkPrereqs: () => PrereqStatus;
  stageCli: (bundledCliDir: string | null, home: string) => StageResult;
  writeFile: (path: string, data: string) => void;
  buildCommand: (runnerPath: string, stagedDir: string, sentinelPath: string, cliEntry: string) => string;
  runInTerminal: (command: string) => Promise<RunResult>;
  showError: (msg: string) => void;
  showInfo: (msg: string) => void;
  /** Point the extension's IPC at the staged CLI (e.g. set process.env.NEXPATH_BIN). */
  applyNexpathBin: (shimPath: string) => void;
  /**
   * True only if the staged CLI actually RUNS (its deps are installed). Used to
   * refuse pointing IPC at, or trusting the `done` flag over, a dep-less copy.
   */
  verifyStagedCli: (cliEntry: string) => boolean;
  /**
   * True only if THIS editor's hook registration is actually present on disk
   * (hooks.json carries our entry; the submit-flow flag file exists).
   *
   * LIVE ROOT CAUSE, 2026-08-13 (owner's clean-install test): `state.done`
   * lives in VS Code globalState, which survives a wipe of `~/.nexpath` and
   * `~/.cursor/hooks.json` — so the flow declared "already complete", the
   * runner (which runs `install --for vscode` and rewrites both files) never
   * re-ran, the submit hook never fired, and the machine could NEVER
   * self-heal. "Already done" must mean "done AND still registered", not
   * "done once, sometime, on some state that may since have been deleted".
   *
   * Optional so non-editor callers/tests are unaffected; absent ⇒ treated as
   * registered (the pre-fix behaviour).
   */
  /** RC26: passed the staged CLI ENTRY so the check can verify the registered
   *  command was built from THIS binary, not just that something plausible
   *  exists — see the note at the vscode-glue.ts implementation. */
  verifyHookRegistration?: (cliEntry: string) => boolean;
  getState: () => SetupState;
  setState: (s: SetupState) => Promise<void>;
  log?: (line: string) => void;
}

export interface SetupFlowOptions {
  /** Re-run even when state says it's already done (the manual command path). */
  force?: boolean;
  /**
   * A working global `nexpath` already resolves on PATH. We still run the per-IDE
   * setup (register THIS editor), but we must NEVER override that working CLI:
   * skip `applyNexpathBin` (keep IPC on the user's global) and don't gate "done"
   * on the staged copy verifying. The additive guarantee, decoupled from the
   * per-IDE offer.
   */
  preferExistingCli?: boolean;
  /** F-8 seam: the platform the done-message is worded for (defaults to the real one). */
  platform?: NodeJS.Platform;
}

/**
 * F-8 (2026-09-05): the first-run done-message told every user to "Reload the
 * window" — but RC54 measured that Windows Cursor loads hooks ONLY at startup,
 * so on that platform+host a reload leaves this instance with zero hooks and
 * every submit silently gets no popup (the tester prompted for 5 minutes
 * against exactly that). The self-heal path already says so; the first-run
 * path now says the same thing, on the one platform+host where it is measured.
 */
export function setupDoneMessage(agent: string | undefined, platform: NodeJS.Platform): string {
  const agentLabel = agent === 'cursor' ? 'Cursor' : agent === 'windsurf' ? 'Windsurf' : 'this editor';
  const activate = platform === 'win32' && agent === 'cursor'
    ? 'Fully QUIT Cursor (all windows) and reopen it to activate guidance — Cursor loads hooks only at startup, so popups cannot appear until then.'
    : 'Reload the window or restart your agent to activate guidance.';
  return `Nexpath is set up for ${agentLabel}. ${activate}`;
}

export async function runSetupFlow(
  deps: SetupFlowDeps,
  opts: SetupFlowOptions = {},
): Promise<SetupOutcome> {
  const prereq = deps.checkPrereqs();
  if (!prereq.ready) {
    deps.showError(missingPrereqMessage(prereq) ?? 'Nexpath setup prerequisites are missing.');
    return 'blocked';
  }

  const staged = deps.stageCli(deps.bundledCliDir, deps.nexpathHome);
  if (staged.status === 'no-bundle') {
    deps.showError(
      'Nexpath: the CLI was not bundled in this build, so automatic setup is unavailable. ' +
        'Install the nexpath CLI manually (see the extension README).',
    );
    return 'no-bundle';
  }
  if (staged.status === 'error' || !staged.stagedDir || !staged.cliEntry) {
    deps.showError(`Nexpath: could not prepare the CLI (${staged.error ?? 'unknown error'}).`);
    return 'failed';
  }

  // Direction 2/3: only point IPC at the staged CLI once it actually RUNS (its
  // npm install has completed). A freshly-copied, dep-less copy must never
  // become the active binary — that is what hijacked the working global CLI.
  // When a working global CLI exists (preferExistingCli) we never override it.
  if (!opts.preferExistingCli && staged.shimPath && deps.verifyStagedCli(staged.cliEntry)) {
    deps.applyNexpathBin(staged.shimPath);
  }

  const state = deps.getState();
  // Direction 4: don't trust the `done` flag over a broken copy — "already set
  // up" also requires the staged CLI to verify (deps installed). With a working
  // global CLI, "ready" is satisfied by the global, not the staged copy.
  const stagedRuns = deps.verifyStagedCli(staged.cliEntry);
  const cliReady = opts.preferExistingCli || stagedRuns;
  // 2026-08-13: "done" must also mean STILL REGISTERED. globalState survives a
  // wipe of ~/.nexpath + hooks.json; without this check a wiped machine skips
  // the runner forever and the submit hook silently never fires again.
  const hookRegistered = deps.verifyHookRegistration?.(staged.cliEntry) ?? true;
  // ── RC32 (2026-08-21) ────────────────────────────────────────────────────
  // A registered hook ALWAYS invokes the STAGED entry (both hook writers embed
  // `resolve(process.argv[1])`, which during setup IS the staged CLI). So a
  // working GLOBAL nexpath on PATH — the whole point of `preferExistingCli` —
  // cannot make the hook work: only the staged copy's own dependencies can.
  //
  // Caught live while regression-testing: with a global CLI present and the
  // staged copy's `node_modules` absent, this reported "setup already complete
  // + verified", yet running the registered command by hand died
  // `ERR_MODULE_NOT_FOUND: Cannot find package 'commander'` — the exact silent
  // class RC17 hit from the other direction. The hook simply never fires and
  // nothing anywhere says why.
  //
  // Deliberately gated on `hookRegistered`: only when a hook actually points at
  // the staged entry does its runnability matter. On a healthy install
  // `stagedRuns` is already true, so this is INERT — the only machines it
  // changes are ones whose hook is broken right now, where re-running setup
  // (which is what installs those dependencies) is unambiguously correct.
  const upToDate =
    state.done &&
    state.version === staged.version &&
    staged.status === 'already-current' &&
    cliReady &&
    hookRegistered &&
    stagedRuns; // implied by hookRegistered above — see the RC32 note
  if (hookRegistered && !stagedRuns) {
    deps.log?.(
      '[nexpath] the registered hook points at the staged CLI but that copy does not run ' +
        '(dependencies missing/incomplete) — re-running setup to repair it',
    );
  }
  if (upToDate && !opts.force) {
    deps.log?.(`[nexpath] setup already complete + verified for CLI ${staged.version}`);
    return 'already-done';
  }
  if (!hookRegistered) {
    deps.log?.(
      '[nexpath] setup state says done but the hook registration is missing on disk — re-running setup',
    );
  }

  const runnerPath = join(deps.nexpathHome, SETUP_RUNNER_FILENAME);
  const sentinelPath = join(deps.nexpathHome, SETUP_SENTINEL_FILENAME);
  try {
    deps.writeFile(runnerPath, buildSetupRunnerSource());
  } catch (err) {
    deps.showError(`Nexpath: could not write the setup runner (${(err as Error).message}).`);
    return 'failed';
  }

  const command = deps.buildCommand(runnerPath, staged.stagedDir, sentinelPath, staged.cliEntry);
  const result = await deps.runInTerminal(command);

  // Mark done + point IPC at the staged CLI ONLY when the runner finished AND
  // the CLI verifies (deps actually installed). This closes the gap where the
  // runner could report OK but leave a CLI that can't start.
  if (result.ok && (opts.preferExistingCli || deps.verifyStagedCli(staged.cliEntry))) {
    await deps.setState({ done: true, version: staged.version });
    if (!opts.preferExistingCli && staged.shimPath) deps.applyNexpathBin(staged.shimPath);
    deps.showInfo(setupDoneMessage(process.env.NEXPATH_AGENT, opts.platform ?? process.platform));
    return 'done';
  }
  if (result.ok) {
    deps.showError(
      'Nexpath: setup ran but the CLI could not start (dependencies incomplete). ' +
        'Retry from the Command Palette: "Nexpath: Set up CLI".',
    );
    return 'failed';
  }

  const why = result.timedOut ? 'setup did not finish in time' : `setup failed (${result.detail})`;
  deps.showError(
    `Nexpath: ${why}. Retry from the Command Palette: "Nexpath: Set up CLI".`,
  );
  return 'failed';
}

/** Default terminal command: `node "<runner>" "<staged>" "<sentinel>" "<cliEntry>"`. */
export function buildSetupCommand(
  runnerPath: string,
  stagedDir: string,
  sentinelPath: string,
  cliEntry: string,
): string {
  const q = (s: string) => `"${s}"`;
  return ['node', q(runnerPath), q(stagedDir), q(sentinelPath), q(cliEntry)].join(' ');
}
