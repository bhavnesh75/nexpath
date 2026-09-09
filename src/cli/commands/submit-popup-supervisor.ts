/**
 * RC78 — the popup SUPERVISOR: a hold that does not depend on how long the host waits.
 *
 * ── THE FAILURE (Windows / Devin, tester report 2026-09-08) ─────────────────
 * With RC77 the popup no longer dies at 75 s — but on Windows the ORIGINAL prompt
 * still ran while the popup was open. Our hook waits up to 30 minutes on every
 * platform (every timer and exit path in the hook, the decider, `stop` and the
 * popup host was read), so the release came from OUTSIDE the hook: the host
 * stopped waiting. How long Devin waits for a `pre_user_prompt` hook on Windows
 * has never been measured — the executed spike measured Windsurf 2.3.9 on
 * LINUX (205 s+, no kill); the Devin docs and the 3.8.20 hook config proto carry
 * no timeout field at all (checked 2026-09-08). A hold that relies on the host's
 * patience is therefore a hold only up to a number nobody controls.
 *
 * ── THE DESIGN ───────────────────────────────────────────────────────────────
 * The popup is run by a DETACHED supervisor process instead of inside the hook:
 *
 *   hook ──spawn──▶ supervisor ──spawn──▶ stop ──▶ popup (waits for the human)
 *     │ polls a status file every 100 ms
 *     ├─ supervisor reports `done` before the deadline → the hook exits 0/2 exactly
 *     │    as before (fast path — today's behaviour, byte-for-byte on the wire)
 *     └─ deadline reached, popup still open → the hook CLAIMS the turn and exits 2
 *          ("Nexpath held this prompt"): the original is cancelled BEFORE any host
 *          ceiling can release it. The supervisor keeps waiting; when the user
 *          finally picks, it delivers the chosen text through the SAME decision
 *          file the extension already polls — the enhanced body on "Use enhanced",
 *          or the ORIGINAL text on "Use original" / Escape / any failure — so the
 *          user's prompt is never lost and never runs before they chose.
 *
 * The claim is one atomic `mkdir`: whoever creates it first owns the outcome.
 * The supervisor writes `done` BEFORE claiming, the hook re-reads the status
 * BEFORE claiming, so a decision that lands in the same instant as the deadline
 * is honoured, never cancelled twice, never delivered twice.
 *
 * ── WHAT DOES NOT CHANGE ─────────────────────────────────────────────────────
 * Cursor keeps the in-process decider (its registered 1900 s timeout is honoured
 * by the host, spike-measured). With the switch OFF nothing here is reachable.
 * A quick answer on any platform takes the fast path: same exit code, same
 * decision record (the hook's own pids), same extension behaviour as RC77.
 *
 * ── THE DEADLINE ─────────────────────────────────────────────────────────────
 * Linux: 170 s — under the 205 s measured on the user's own Windsurf build.
 * Windows/macOS: 45 s — unmeasured hosts; a block issued at ~55 s was honoured by
 * Devin/Windows (08-25 log), and 60 s is the convention every other host uses.
 * `NEXPATH_SUBMIT_LATE_CANCEL_MS` overrides both once a host is measured.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import {
  mkdirSync, writeFileSync, readFileSync, renameSync, rmSync, readdirSync, statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import type { Command } from 'commander';
import { isWindowsBatchShim } from '../../utils/batch-shim.js';
import { buildStopDrivenPromptSubmitDecider } from './submit-stop-decider.js';
import { writeSubmitDecision, appendReplacementEcho } from './submit-decision-store.js';
import { openStore, closeStore } from '../../store/db.js';
// CONSUME-ONLY (owner: hi0001234d / harshil480) — the same call the H3 decider makes.
import { SessionStateManager } from '../../classifier/SessionStateManager.js';
import { log } from '../../logger.js';

export const SUBMIT_POPUP_SUPERVISE_COMMAND = 'submit-popup-supervise';
export const SUBMIT_POPUP_DIRNAME = 'submit-popup';
export const SUBMIT_POPUP_STATUS_SCHEMA_V1 = 1 as const;
/** Leftover turn directories (a crash on either side) older than this are pruned. */
export const SUBMIT_POPUP_STALE_TURN_MS = 60 * 60_000;
/** The hook polls the status file this often. */
export const SUBMIT_POPUP_POLL_MS = 100;
/** No `running` status this long after the spawn ⇒ the supervisor never started ⇒ allow. */
export const SUBMIT_POPUP_START_GRACE_MS = 15_000;
/** After a lost claim the hook waits at most this long for the supervisor's `done`. */
export const SUBMIT_POPUP_LOST_CLAIM_WAIT_MS = 5_000;

export const LATE_CANCEL_ENV = 'NEXPATH_SUBMIT_LATE_CANCEL_MS';
export const LATE_CANCEL_DEADLINE_LINUX_MS = 170_000;
export const LATE_CANCEL_DEADLINE_DEFAULT_MS = 45_000;

/**
 * When the hook stops holding transparently and cancels the original itself,
 * measured from the hook's own start. Env override wins when it is a positive
 * integer; otherwise the platform default above.
 */
export function computeLateCancelDeadlineMs(input: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv } = {}): number {
  const env = input.env ?? process.env;
  const raw = env[LATE_CANCEL_ENV];
  const parsed = raw !== undefined ? Number.parseInt(String(raw), 10) : Number.NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return (input.platform ?? process.platform) === 'linux' ? LATE_CANCEL_DEADLINE_LINUX_MS : LATE_CANCEL_DEADLINE_DEFAULT_MS;
}

export interface PopupSupervisionPaths {
  dir: string;
  statusFile: string;
  promptFile: string;
  claimDir: string;
}

export function popupSupervisionRoot(projectRoot: string): string {
  return join(projectRoot, '.nexpath', SUBMIT_POPUP_DIRNAME);
}

export function popupSupervisionPaths(projectRoot: string, turnId: string): PopupSupervisionPaths {
  const safe = turnId.replace(/[^A-Za-z0-9._-]/g, '_');
  const dir = join(popupSupervisionRoot(projectRoot), safe);
  return { dir, statusFile: join(dir, 'status.json'), promptFile: join(dir, 'prompt.txt'), claimDir: join(dir, 'claim') };
}

export type PopupSupervisionStatus =
  | { schemaVersion: typeof SUBMIT_POPUP_STATUS_SCHEMA_V1; state: 'running'; startedAt: number; pid: number }
  | {
      schemaVersion: typeof SUBMIT_POPUP_STATUS_SCHEMA_V1;
      state: 'done';
      startedAt: number;
      pid: number;
      finishedAt: number;
      decision: 'allow' | 'block';
      /** `original` when the supervisor re-sent the user's own prompt after a late cancel. */
      selfDelivered: 'none' | 'original';
      /** True when the hook had already cancelled the original when the outcome landed. */
      afterCancel: boolean;
    };

/** Atomic (tmp + rename) so the hook never reads a half-written file. */
export function writePopupSupervisionStatus(statusFile: string, status: PopupSupervisionStatus): void {
  const tmp = `${statusFile}.tmp`;
  writeFileSync(tmp, JSON.stringify(status), 'utf8');
  renameSync(tmp, statusFile);
}

export function readPopupSupervisionStatus(statusFile: string): PopupSupervisionStatus | null {
  try {
    const v = JSON.parse(readFileSync(statusFile, 'utf8')) as Partial<PopupSupervisionStatus>;
    if (!v || v.schemaVersion !== SUBMIT_POPUP_STATUS_SCHEMA_V1) return null;
    if (v.state === 'running' && typeof v.startedAt === 'number' && typeof v.pid === 'number') return v as PopupSupervisionStatus;
    if (v.state === 'done' && (v.decision === 'allow' || v.decision === 'block')) return v as PopupSupervisionStatus;
    return null;
  } catch {
    return null;
  }
}

/**
 * The one atomic claim of a turn's outcome. `mkdir` without `recursive` is
 * exclusive on every OS: exactly one caller creates it.
 */
export function claimPopupTurn(claimDir: string): 'won' | 'lost' | 'error' {
  try {
    mkdirSync(claimDir);
    return 'won';
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === 'EEXIST' ? 'lost' : 'error';
  }
}

/** Best-effort removal of turn directories nobody will read again. Returns the count removed. */
export function prunePopupSupervision(projectRoot: string, now: number = Date.now()): number {
  let removed = 0;
  try {
    const root = popupSupervisionRoot(projectRoot);
    for (const name of readdirSync(root)) {
      const p = join(root, name);
      try {
        if (now - statSync(p).mtimeMs > SUBMIT_POPUP_STALE_TURN_MS) { rmSync(p, { recursive: true, force: true }); removed++; }
      } catch { /* next */ }
    }
  } catch { /* no directory yet */ }
  return removed;
}

// ── The hook-side spawner ─────────────────────────────────────────────────────

/** Mirrors `windsurf-hook/spawn.ts`: NEXPATH_BIN (never a .cmd shim raw), else this node + this cli. */
function nexpathCmd(binaryPath?: string): { cmd: string; prefix: string[] } {
  if (binaryPath) return { cmd: binaryPath, prefix: [] };
  if (process.env.NEXPATH_BIN && !isWindowsBatchShim(process.env.NEXPATH_BIN)) {
    return { cmd: process.env.NEXPATH_BIN, prefix: [] };
  }
  return { cmd: process.execPath, prefix: [resolve(process.argv[1])] };
}

export interface SpawnPopupSupervisorDeps {
  projectRoot: string;
  host: 'windsurf' | 'cursor';
  turnId: string;
  turnStartedAt: number;
  promptText: string;
  /** The HOOK's pids — the decision record must name the process the host waits on. */
  hookPid: number;
  hookShellPid?: number;
  spawnFn?: typeof spawn;
  binaryPath?: string;
}

export interface SpawnPopupSupervisorResult {
  spawned: boolean;
  pid?: number;
  error?: string;
  paths: PopupSupervisionPaths;
}

/**
 * Write the turn directory (prompt text for the child, no argv exposure) and
 * spawn the supervisor DETACHED: no pipe ties it to the hook, no console on
 * Windows, `unref` so the hook's exit never waits for it. This is the RC71
 * expiry-consumer spawn shape, already shipped on every platform.
 */
export function spawnPopupSupervisor(deps: SpawnPopupSupervisorDeps): SpawnPopupSupervisorResult {
  const paths = popupSupervisionPaths(deps.projectRoot, deps.turnId);
  try {
    mkdirSync(paths.dir, { recursive: true });
    writeFileSync(paths.promptFile, deps.promptText, { encoding: 'utf8', mode: 0o600 });
  } catch (e) {
    return { spawned: false, error: `prepare: ${String(e)}`, paths };
  }
  const spawnFn = deps.spawnFn ?? spawn;
  const { cmd, prefix } = nexpathCmd(deps.binaryPath);
  const args = [
    ...prefix, SUBMIT_POPUP_SUPERVISE_COMMAND,
    '--project', deps.projectRoot,
    '--host', deps.host,
    '--turn', deps.turnId,
    '--turn-started-at', String(Math.round(deps.turnStartedAt)),
    '--hook-pid', String(deps.hookPid),
    ...(typeof deps.hookShellPid === 'number' && deps.hookShellPid > 0 ? ['--hook-shell-pid', String(deps.hookShellPid)] : []),
  ];
  try {
    const child: ChildProcess = spawnFn(cmd, args, {
      detached: true, stdio: 'ignore', windowsHide: true, env: process.env,
    });
    child.on?.('error', () => { /* fire-and-forget: the status poll decides */ });
    child.unref?.();
    return { spawned: true, ...(typeof child.pid === 'number' ? { pid: child.pid } : {}), paths };
  } catch (e) {
    return { spawned: false, error: String(e), paths };
  }
}

// ── The hook-side decider (polls the supervisor, cancels at the deadline) ─────

export interface SupervisedDeciderPorts {
  host: 'windsurf';
  /** The hook's own start instant — the deadline counts from here, like the host's clock. */
  hookStartedAt: number;
  /** Late-cancel deadline from `hookStartedAt`; defaults to computeLateCancelDeadlineMs(). */
  deadlineMs?: number;
  hookPid?: number;
  hookShellPid?: number;
  spawnSupervisor?: typeof spawnPopupSupervisor;
  readStatus?: typeof readPopupSupervisionStatus;
  claim?: typeof claimPopupTurn;
  prune?: typeof prunePopupSupervision;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  logEvent?: typeof log;
  /** Called once when the hook cancels the original at the deadline (the twin-mirror marker). */
  onLateCancel?: () => void;
}

export function buildSupervisedPromptSubmitDecider(
  opts: { project?: string },
  ports: SupervisedDeciderPorts,
): (event: string, o: { project?: string; turnStartedAt?: number }, promptText?: string) => Promise<'allow' | 'block'> {
  const now = ports.now ?? (() => Date.now());
  // REF'd on purpose (live finding, 2026-09-08): the supervisor is detached and
  // unref'd, so while this loop waits NOTHING else holds the hook's event loop.
  // An unref'd sleep let Node drain the loop and exit 13 ("unsettled top-level
  // await") at +6.5 s — an exit code the host reads as "not 2" and releases on.
  const sleep = ports.sleep ?? ((ms: number) => new Promise<void>((r) => { setTimeout(r, ms); }));
  const readStatus = ports.readStatus ?? readPopupSupervisionStatus;
  const claim = ports.claim ?? claimPopupTurn;
  const spawnSupervisor = ports.spawnSupervisor ?? spawnPopupSupervisor;
  const prune = ports.prune ?? prunePopupSupervision;
  const deadlineMs = ports.deadlineMs ?? computeLateCancelDeadlineMs();
  const logEvent: typeof log = (level, name, data) => {
    try { (ports.logEvent ?? log)(level, name, data); } catch { /* never break the hook */ }
  };
  const cleanup = (dir: string): void => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ } };

  return async (_event, o, promptText) => {
    const projectRoot = o.project ?? opts.project ?? process.cwd();
    if ((promptText ?? '').trim() === '') return 'allow';
    const turnStartedAt = typeof o.turnStartedAt === 'number' && o.turnStartedAt > 0 ? o.turnStartedAt : now();
    const turnId = `${turnStartedAt}-${ports.hookPid ?? process.pid}`;
    try { prune(projectRoot, now()); } catch { /* best-effort */ }
    const spawned = spawnSupervisor({
      projectRoot, host: ports.host, turnId, turnStartedAt, promptText: promptText as string,
      hookPid: ports.hookPid ?? process.pid,
      ...(typeof ports.hookShellPid === 'number' ? { hookShellPid: ports.hookShellPid } : {}),
    });
    logEvent(spawned.spawned ? 'info' : 'warn', 'windsurf_hook_popup_supervisor_spawned', {
      spawned: spawned.spawned, pid: spawned.pid ?? null, error: spawned.error ?? null, deadline_ms: deadlineMs,
    });
    if (!spawned.spawned) { cleanup(spawned.paths.dir); return 'allow'; } // fail-open (A3)
    const { paths } = spawned;
    const spawnedAt = now();
    const deadlineAt = ports.hookStartedAt + deadlineMs;
    const finish = (s: Extract<PopupSupervisionStatus, { state: 'done' }>): 'allow' | 'block' => {
      logEvent('info', 'windsurf_hook_popup_supervisor_done', {
        decision: s.decision, self_delivered: s.selfDelivered, after_cancel: s.afterCancel, waited_ms: now() - spawnedAt,
      });
      cleanup(paths.dir);
      return s.decision;
    };
    for (;;) {
      const status = readStatus(paths.statusFile);
      if (status?.state === 'done') return finish(status);
      const t = now();
      if (!status) {
        if (t - spawnedAt > SUBMIT_POPUP_START_GRACE_MS) {
          logEvent('warn', 'windsurf_hook_popup_supervisor_not_started', { waited_ms: t - spawnedAt });
          cleanup(paths.dir);
          return 'allow'; // fail-open: nothing is on screen, nothing to hold for
        }
      } else if (t >= deadlineAt) {
        // The popup is still open at the deadline: cancel the original NOW, before
        // any host ceiling can release it. Re-read first — a `done` written in
        // the same instant must win over the cancel.
        const again = readStatus(paths.statusFile);
        if (again?.state === 'done') return finish(again);
        const won = claim(paths.claimDir);
        if (won === 'won') {
          logEvent('warn', 'windsurf_hook_late_cancel', {
            elapsed_ms: t - ports.hookStartedAt, deadline_ms: deadlineMs, supervisor_pid: status.pid,
          });
          try { ports.onLateCancel?.(); } catch { /* marker is best-effort */ }
          return 'block';
        }
        if (won === 'lost') {
          // The supervisor wrote `done` and claimed between our two reads — take its answer.
          const until = now() + SUBMIT_POPUP_LOST_CLAIM_WAIT_MS;
          while (now() < until) {
            await sleep(SUBMIT_POPUP_POLL_MS);
            const s = readStatus(paths.statusFile);
            if (s?.state === 'done') return finish(s);
          }
          logEvent('warn', 'windsurf_hook_popup_supervisor_claim_lost_no_status', {});
          return 'allow';
        }
        // A filesystem error is never a reason to cancel a user's prompt.
        logEvent('warn', 'windsurf_hook_late_cancel_claim_error', {});
        return 'allow';
      }
      await sleep(SUBMIT_POPUP_POLL_MS);
    }
  };
}

// ── The detached child ────────────────────────────────────────────────────────

export interface PopupSupervisorOptions {
  project: string;
  host: 'windsurf' | 'cursor';
  turn: string;
  turnStartedAt: number;
  hookPid: number;
  hookShellPid?: number;
}

export interface PopupSupervisorPorts {
  /** Defaults to the stop-driven decider with the hook's pids stamped on the record. */
  decide?: (event: string, o: { project?: string; turnStartedAt?: number }, promptText: string) => Promise<'allow' | 'block'>;
  writeDecision?: typeof writeSubmitDecision;
  appendEcho?: typeof appendReplacementEcho;
  openStoreFn?: (db?: string) => Promise<unknown>;
  closeStoreFn?: (store: unknown) => Promise<void> | void;
  claim?: typeof claimPopupTurn;
  now?: () => number;
  logEvent?: typeof log;
  readPrompt?: (p: string) => string;
  writeStatus?: typeof writePopupSupervisionStatus;
  /** Skip the final directory removal (tests inspect it). */
  keepDir?: boolean;
}

/**
 * After a late cancel the user's OWN prompt must still run when they keep it
 * (or dismiss the popup, or anything fails): persist it as the decision the
 * extension delivers, register it as an echo so the re-submit is not advised
 * again, and mark it injected so `auto` does not re-classify it.
 */
export async function persistOriginalResend(
  input: { projectRoot: string; host: 'windsurf' | 'cursor'; promptText: string; hookPid: number; hookShellPid?: number },
  ports: Pick<PopupSupervisorPorts, 'writeDecision' | 'appendEcho' | 'openStoreFn' | 'closeStoreFn' | 'now'> = {},
): Promise<void> {
  const now = ports.now ?? (() => Date.now());
  const t = now();
  await (ports.writeDecision ?? writeSubmitDecision)({
    projectRoot: input.projectRoot,
    decisionId: `so-${t}-${Math.floor(t % 100000)}`,
    replacementText: input.promptText,
    createdAt: t,
    blockIssuedAt: t,
    hookPid: input.hookPid,
    ...(typeof input.hookShellPid === 'number' && input.hookShellPid > 0 ? { hookShellPid: input.hookShellPid } : {}),
    host: input.host,
  });
  (ports.appendEcho ?? appendReplacementEcho)(input.projectRoot, input.promptText);
  // Best-effort: the same injected-prompt guard the H3 decider sets, so the
  // re-submitted original is not classified or counted as a new prompt.
  let store: unknown = null;
  try {
    store = await (ports.openStoreFn ?? openStore)(undefined as never);
    SessionStateManager.load(store as never, input.projectRoot).setInjectedPrompt(store as never, input.promptText);
  } catch { /* worst case: the echo is re-classified, today's behaviour */ } finally {
    if (store) { try { await (ports.closeStoreFn ?? closeStore)(store as never); } catch { /* fail-open */ } }
  }
}

/** The supervisor's body. Returns the process exit code (always 0 — nothing waits on it). */
export async function runPopupSupervisor(opts: PopupSupervisorOptions, ports: PopupSupervisorPorts = {}): Promise<number> {
  const now = ports.now ?? (() => Date.now());
  const logEvent: typeof log = (level, name, data) => {
    try { (ports.logEvent ?? log)(level, name, data); } catch { /* never throw from logging */ }
  };
  const writeStatus = ports.writeStatus ?? writePopupSupervisionStatus;
  const claim = ports.claim ?? claimPopupTurn;
  const paths = popupSupervisionPaths(opts.project, opts.turn);
  const startedAt = now();
  const base = { schemaVersion: SUBMIT_POPUP_STATUS_SCHEMA_V1, startedAt, pid: process.pid } as const;
  try {
    writeStatus(paths.statusFile, { ...base, state: 'running' });
  } catch (err) {
    logEvent('warn', 'submit_popup_supervisor_status_write_failed', { message: (err as Error)?.message ?? 'unknown' });
    return 0; // the hook sees no status and fails open
  }
  let promptText = '';
  try {
    promptText = (ports.readPrompt ?? ((p: string) => readFileSync(p, 'utf8')))(paths.promptFile);
    try { rmSync(paths.promptFile, { force: true }); } catch { /* best-effort */ }
  } catch (err) {
    logEvent('warn', 'submit_popup_supervisor_prompt_unreadable', { message: (err as Error)?.message ?? 'unknown' });
  }
  logEvent('info', 'submit_popup_supervisor_started', { host: opts.host, turn: opts.turn, prompt_len: promptText.length });

  const decide = ports.decide ?? buildStopDrivenPromptSubmitDecider({ project: opts.project }, {
    host: opts.host,
    hookPid: opts.hookPid,
    ...(typeof opts.hookShellPid === 'number' && opts.hookShellPid > 0 ? { hookShellPid: opts.hookShellPid } : {}),
    ...(ports.openStoreFn ? { openStoreFn: ports.openStoreFn } : {}),
    ...(ports.closeStoreFn ? { closeStoreFn: ports.closeStoreFn } : {}),
    ...(ports.writeDecision ? { writeDecision: ports.writeDecision } : {}),
    logEvent,
  });
  let decision: 'allow' | 'block' = 'allow';
  try {
    decision = await decide('pre_user_prompt', { project: opts.project, turnStartedAt: opts.turnStartedAt }, promptText);
    if (decision !== 'block') decision = 'allow';
  } catch (err) {
    logEvent('warn', 'submit_popup_supervisor_decider_failed', { message: (err as Error)?.message ?? 'unknown' });
    decision = 'allow';
  }

  // `done` FIRST, then the claim — a hook polling at the deadline takes this
  // answer instead of cancelling (it re-reads before it claims).
  const done = { ...base, state: 'done' as const, finishedAt: now(), decision, selfDelivered: 'none' as const, afterCancel: false };
  try { writeStatus(paths.statusFile, done); } catch (err) {
    logEvent('warn', 'submit_popup_supervisor_status_write_failed', { message: (err as Error)?.message ?? 'unknown' });
  }
  const won = claim(paths.claimDir);
  if (won !== 'lost') {
    // The hook is alive (or the directory is already gone because it read us):
    // it exits 0/2 on this status. A block's record was already written by the
    // decider with the hook's own pids — exactly the RC77 fast path.
    logEvent('info', 'submit_popup_supervisor_done', { decision, after_cancel: false, self_delivered: 'none', claim: won });
    return 0;
  }
  // Lost ⇒ the hook cancelled the original at its deadline and is gone. Deliver.
  let selfDelivered: 'none' | 'original' = 'none';
  if (decision === 'allow') {
    if (promptText.trim() === '') {
      logEvent('warn', 'submit_popup_supervisor_no_prompt_to_resend', {});
    } else {
      try {
        await persistOriginalResend(
          { projectRoot: opts.project, host: opts.host, promptText, hookPid: opts.hookPid, ...(typeof opts.hookShellPid === 'number' ? { hookShellPid: opts.hookShellPid } : {}) },
          ports,
        );
        selfDelivered = 'original';
      } catch (err) {
        logEvent('warn', 'submit_popup_supervisor_resend_failed', { message: (err as Error)?.message ?? 'unknown' });
      }
    }
  }
  try { writeStatus(paths.statusFile, { ...done, finishedAt: now(), selfDelivered, afterCancel: true }); } catch { /* best-effort */ }
  logEvent('info', 'submit_popup_supervisor_done', { decision, after_cancel: true, self_delivered: selfDelivered, claim: won });
  if (!ports.keepDir) { try { rmSync(paths.dir, { recursive: true, force: true }); } catch { /* best-effort */ } }
  return 0;
}

export interface SubmitPopupSuperviseCliOptions {
  project: string;
  host: string;
  turn: string;
  turnStartedAt: string;
  hookPid: string;
  hookShellPid?: string;
}

export async function submitPopupSuperviseAction(o: SubmitPopupSuperviseCliOptions): Promise<number> {
  const host = o.host === 'cursor' ? 'cursor' : 'windsurf';
  const hookPid = Number.parseInt(o.hookPid, 10);
  const hookShellPid = o.hookShellPid !== undefined ? Number.parseInt(o.hookShellPid, 10) : Number.NaN;
  const turnStartedAt = Number.parseInt(o.turnStartedAt, 10);
  if (!o.project || !o.turn || !Number.isInteger(hookPid) || hookPid <= 0) return 0; // nothing waits on us
  return runPopupSupervisor({
    project: o.project,
    host,
    turn: o.turn,
    turnStartedAt: Number.isFinite(turnStartedAt) ? turnStartedAt : 0,
    hookPid,
    ...(Number.isInteger(hookShellPid) && hookShellPid > 0 ? { hookShellPid } : {}),
  });
}

export function registerSubmitPopupSuperviseCommand(program: Command): void {
  program
    .command(SUBMIT_POPUP_SUPERVISE_COMMAND)
    .description('Run the submit-time popup on behalf of a hook and deliver its outcome (hook-internal)')
    .requiredOption('-p, --project <path>', 'Project root path')
    .requiredOption('--host <host>', 'windsurf | cursor')
    .requiredOption('--turn <id>', 'Turn identifier (names the status directory)')
    .requiredOption('--turn-started-at <epochMs>', 'When this turn\'s auto started (RC76 boundary)')
    .requiredOption('--hook-pid <pid>', 'The hook process the host waits on')
    .option('--hook-shell-pid <pid>', 'The hook\'s shell wrapper (win32)')
    .action(async (opts: SubmitPopupSuperviseCliOptions) => {
      process.exitCode = await submitPopupSuperviseAction(opts);
    });
}
