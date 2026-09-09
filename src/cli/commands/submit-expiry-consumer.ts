/**
 * RC71 — expiry / floor consumer for the gated submit path (hook milestone).
 *
 * ── WHY ───────────────────────────────────────────────────────────────────────
 * `nexpath auto` (spawned INSIDE the hold) persists THIS turn's rows —
 * `pending_prompt_enhancements` and `pending_advisories` — for `stop` to pop.
 * When the hold expires the hook kills `stop` (and, since RC68, the popup
 * host) and exits; the rows stay `pending`. The NEXT turn's `stop` then finds
 * them and replays a stale enhancement / advisory against a prompt they were
 * never built for (tester report 2026-09-03 §4b, confirmed line by line). The
 * decider already sweeps the rows on a BLOCK (RC10); nothing swept on expiry.
 *
 * ── WHY A DETACHED PROCESS ───────────────────────────────────────────────────
 * The hook's exit IS the decision (Windsurf: the exit code; Cursor: the JSON
 * line before exit). A killed popup host can leave `<db>.lock` behind, which
 * costs the next opener up to LOCK_WAIT_MS (8 s) — paying that inside the
 * hold would push a 75 s hold toward the 90 s cap. So the hook spawns this
 * command detached + unref'd and exits immediately; the consumer waits for
 * the lock on its own time. Consume-only store calls (the same two the
 * decider's sweep uses); every failure is non-fatal — the worst case is
 * today's replay.
 *
 * ── WHY `--before` ───────────────────────────────────────────────────────────
 * A user who re-submits within seconds races this consumer with the next
 * turn's `auto`. Rows are consumed only when `created_at <= before` (the
 * expiry instant), so a row the NEXT turn builds is never touched.
 *
 * ── THE 6.1 FLOOR ────────────────────────────────────────────────────────────
 * The popup waits on a HUMAN. The tester measured 44–52 s popups still dying
 * before the user could act; below {@link SUBMIT_POPUP_MIN_REMAINING_MS} a
 * popup is certain to be killed mid-read — strictly worse than no popup (A3).
 * Below the floor the hooks skip the decider entirely, consume the rows this
 * turn built (so they cannot replay) and release the prompt: the turn then
 * behaves exactly like today's "no advisory". Switch OFF never reaches any of
 * this — no hold exists.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';
import { isWindowsBatchShim } from '../../utils/batch-shim.js';
import { openStore, closeStore, DEFAULT_DB_PATH } from '../../store/db.js';
import { getPendingAdvisory, markAdvisoryShown } from '../../store/pending-advisories.js';
import {
  getPendingPromptEnhancement,
  markPromptEnhancementShown,
} from '../../store/pending-prompt-enhancements.js';
import { log } from '../../logger.js';

/**
 * Least hold that may still open the popup. Reading an enhanced prompt and
 * choosing takes tens of seconds; the tester's dying popups had 44–52 s.
 * Well under MIN_HOLD_BUDGET_MS (60 s) so a normal turn is never affected —
 * only one where `auto` ate most of the hold (F-14: LLM retries / timeouts).
 */
export const SUBMIT_POPUP_MIN_REMAINING_MS = 30_000;

export const SUBMIT_EXPIRY_CONSUME_COMMAND = 'submit-expiry-consume';

export type SubmitExpiryReason = 'auto_expired' | 'decider_expired' | 'below_floor';
export const SUBMIT_EXPIRY_REASONS: ReadonlySet<string> = new Set<string>([
  'auto_expired', 'decider_expired', 'below_floor',
]);

export interface ConsumeExpiredPorts {
  getPendingAdvisory?: typeof getPendingAdvisory;
  markAdvisoryShown?: typeof markAdvisoryShown;
  getPendingPromptEnhancement?: typeof getPendingPromptEnhancement;
  markPromptEnhancementShown?: typeof markPromptEnhancementShown;
}

/**
 * Mark the project's pending rows created at or before `before` as shown.
 * Consume-only; pure over its ports (defaults to the real store functions).
 */
export function consumeExpiredSubmitRows(
  store: unknown,
  input: { projectRoot: string; before: number },
  ports: ConsumeExpiredPorts = {},
): { advisories: number; promptEnhancements: number } {
  const getAdvisory = ports.getPendingAdvisory ?? getPendingAdvisory;
  const markAdvisory = ports.markAdvisoryShown ?? markAdvisoryShown;
  const getPe = ports.getPendingPromptEnhancement ?? getPendingPromptEnhancement;
  const markPe = ports.markPromptEnhancementShown ?? markPromptEnhancementShown;

  let advisories = 0;
  for (let i = 0; i < 8; i++) { // bounded — one turn parks at most a couple (mirrors the RC10 sweep)
    const row = getAdvisory(store as never, input.projectRoot);
    // Newest first; a row newer than `before` belongs to the NEXT turn — stop.
    if (!row || row.createdAt > input.before) break;
    markAdvisory(store as never, row.id);
    advisories += 1;
  }
  let promptEnhancements = 0;
  const pe = getPe(store as never, input.projectRoot);
  if (pe && pe.createdAt <= input.before) {
    markPe(store as never, pe.id);
    promptEnhancements = 1;
  }
  return { advisories, promptEnhancements };
}

export interface SubmitExpiryConsumeOptions {
  project: string;
  before:  string;
  reason?: string;
  db:      string;
}

export interface SubmitExpiryConsumeDeps {
  openStoreFn?: (db: string) => Promise<unknown>;
  closeStoreFn?: (store: unknown) => void | Promise<void>;
  consume?: typeof consumeExpiredSubmitRows;
  logEvent?: typeof log;
  now?: () => number;
}

/**
 * The command body. Returns the process exit code: 0 after a consume attempt
 * (even one that found nothing), 1 on rejected input or a store failure.
 * Never throws; logs one line either way (no prompt content — counts only).
 */
export async function submitExpiryConsumeAction(
  opts: SubmitExpiryConsumeOptions,
  deps: SubmitExpiryConsumeDeps = {},
): Promise<number> {
  const logEvent: typeof log = (level, name, data) => {
    try { (deps.logEvent ?? log)(level, name, data); } catch { /* never the reason this fails */ }
  };
  const now = deps.now ?? (() => Date.now());
  const before = Number(opts.before);
  if (!Number.isFinite(before) || before <= 0) {
    process.stderr.write(`${SUBMIT_EXPIRY_CONSUME_COMMAND}: invalid --before '${opts.before}'\n`);
    return 1;
  }
  const reason = SUBMIT_EXPIRY_REASONS.has(opts.reason ?? '') ? (opts.reason as SubmitExpiryReason) : 'unknown';
  const startedAt = now();

  let store: unknown;
  try {
    store = await (deps.openStoreFn ?? openStore)(opts.db);
  } catch (err) {
    logEvent('warn', 'submit_expiry_consume_failed', {
      reason, stage: 'open', message: (err as Error)?.message ?? 'unknown',
    });
    return 1;
  }
  try {
    const counts = (deps.consume ?? consumeExpiredSubmitRows)(store, { projectRoot: opts.project, before });
    logEvent('info', 'submit_expiry_consumed', {
      reason,
      before,
      advisories: counts.advisories,
      prompt_enhancements: counts.promptEnhancements,
      ms: now() - startedAt,
    });
    return 0;
  } catch (err) {
    logEvent('warn', 'submit_expiry_consume_failed', {
      reason, stage: 'consume', message: (err as Error)?.message ?? 'unknown',
    });
    return 1;
  } finally {
    try { await (deps.closeStoreFn ?? closeStore)(store as never); } catch { /* fail-open */ }
  }
}

export function registerSubmitExpiryConsumeCommand(program: import('commander').Command): void {
  program
    .command(SUBMIT_EXPIRY_CONSUME_COMMAND)
    .description('Consume the pending submit-time rows a hold expiry left behind (hook-internal)')
    .option('-p, --project <path>', 'Project root path', process.cwd())
    .requiredOption('--before <epochMs>', 'Consume only rows created at or before this instant (epoch ms)')
    .option('--reason <reason>', 'Why the hook asked: auto_expired | decider_expired | below_floor')
    .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
    .action(async (opts: SubmitExpiryConsumeOptions) => {
      process.exitCode = await submitExpiryConsumeAction(opts);
    });
}

// ── The hook-side spawner ─────────────────────────────────────────────────────

/**
 * How to invoke the nexpath CLI — mirrors `windsurf-hook/spawn.ts` exactly:
 * NEXPATH_BIN override, else re-invoke THIS node + cli script (robust under a
 * sanitized hook PATH; RC57: a .cmd/.bat shim is never spawned raw).
 */
function nexpathCmd(binaryPath?: string): { cmd: string; prefix: string[] } {
  if (binaryPath) return { cmd: binaryPath, prefix: [] };
  if (process.env.NEXPATH_BIN && !isWindowsBatchShim(process.env.NEXPATH_BIN)) {
    return { cmd: process.env.NEXPATH_BIN, prefix: [] };
  }
  return { cmd: process.execPath, prefix: [resolve(process.argv[1])] };
}

export interface SpawnExpiryConsumerDeps {
  projectRoot: string;
  /** The expiry instant (epoch ms): rows created after it are left alone. */
  before: number;
  reason: SubmitExpiryReason;
  /** Injected for tests; defaults to node:child_process spawn. */
  spawnFn?: typeof spawn;
  /** Override the resolved nexpath binary (test/dev). */
  binaryPath?: string;
}

export interface SpawnExpiryConsumerResult {
  spawned: boolean;
  pid?: number;
  error?: string;
}

/**
 * Fire-and-forget: spawn `nexpath submit-expiry-consume` detached and unref'd
 * so the hook can exit NOW. Never throws — the hook is on its fail-open exit
 * path and a consumer failure must not change it.
 */
export function spawnExpiryConsumer(deps: SpawnExpiryConsumerDeps): SpawnExpiryConsumerResult {
  const spawnFn = deps.spawnFn ?? spawn;
  const { cmd, prefix } = nexpathCmd(deps.binaryPath);
  const args = [
    ...prefix, SUBMIT_EXPIRY_CONSUME_COMMAND,
    '--project', deps.projectRoot,
    '--before', String(Math.round(deps.before)),
    '--reason', deps.reason,
  ];
  try {
    // detached + stdio ignore: no pipe ties it to us (F-5's lesson) and no
    // console on Windows (windowsHide). No shell ⇒ spaced paths need no quoting (RC66).
    const child: ChildProcess = spawnFn(cmd, args, {
      detached: true, stdio: 'ignore', windowsHide: true, env: process.env,
    });
    child.on?.('error', () => { /* fire-and-forget: a late ENOENT must not throw in the hook */ });
    child.unref?.();
    return { spawned: true, ...(typeof child.pid === 'number' ? { pid: child.pid } : {}) };
  } catch (e) {
    return { spawned: false, error: String(e) };
  }
}
