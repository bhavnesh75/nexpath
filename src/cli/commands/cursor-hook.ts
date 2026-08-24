/**
 * `nexpath cursor-hook <event>` — the shim Cursor invokes (hook milestone H5).
 *
 * Mirrors `windsurf-hook.ts`'s structure: read the JSON payload on stdin, remap
 * it to the nexpath Layer-C CLI contract, and dispatch. Kept as a separate
 * command because the two platforms' payloads and exit contracts differ.
 *
 * ── EXIT CONTRACT — DIFFERENT FROM WINDSURF ──────────────────────────────────
 * Windsurf blocks a prompt via **exit code 2**. Cursor does **not** use the exit
 * code: it reads a **JSON response on stdout**, and blocks when that response
 * carries `continue: false` (measured — Cursor renders a *"Submission blocked by
 * hook"* card and produces no agent response).
 *
 * So this command **always exits 0** and communicates through stdout instead.
 * Writing the Windsurf convention here would simply fail to block, silently.
 *
 * ── FAIL-OPEN (`A3`) ─────────────────────────────────────────────────────────
 * Any failure emits nothing (or an explicit continue) and exits 0, releasing the
 * user's original prompt unmodified. A failure while holding the prompt is
 * strictly worse than no advisory at all.
 *
 * ── PII (§4.3) ───────────────────────────────────────────────────────────────
 * The payload carries `user_email`. It is never parsed (see `payload.ts`) and
 * never logged; only `describeCursorPayloadSafely` output is loggable.
 */
import type { Command } from 'commander';
import type { ChildProcess } from 'node:child_process';
import { parseCursorHookPayload, type CursorHookPayload } from '../../cursor-hook/payload.js';
import { defaultReadStdin, awaitChild, isReplacementEcho } from './windsurf-hook.js';
import { createHoldBudget, type HoldBudget } from './submit-hold-budget.js';
import { buildStopDrivenPromptSubmitDecider } from './submit-stop-decider.js';
import { spawnAuto } from '../../windsurf-hook/spawn.js';
import { isSubmitAdvisoryEnabledForHost } from './submit-flow-config.js';
import { runSequenceContinuationStop } from './submit-stop-decider.js';
import { checkAndRecordCursorInvocation } from '../../cursor-hook/invocation-guard.js';
import { bringPopupToFront } from '../../windsurf-hook/foreground.js';
import { log } from '../../logger.js';
import { killProcessTree } from '../../utils/kill-tree.js';
import { readFileSync } from 'node:fs';

/**
 * GUI env re-hydration (live root cause #3, 2026-08-12).
 *
 * Cursor's Hooks Service spawns hook processes with a **sanitized environment**
 * (measured: cwd is `~/.cursor`, and `DISPLAY`/`DBUS_SESSION_BUS_ADDRESS` are
 * absent). The decider's popup is a `gnome-terminal --wait` spawn — without a
 * display/bus connection it exits immediately, the selection never happens, and
 * the decider falls open to `allow` ~500 ms after printing its "select an
 * action" cue. Measured live: hook ran perfectly, popup died silently, no block.
 * Windsurf passes the session env through, which is why the SAME popup worked
 * there — this gap is Cursor-only.
 *
 * The session env still exists one level up: the Cursor processes we descend
 * from carry `DISPLAY` et al., and `/proc/<pid>/environ` is readable for
 * same-user processes on Linux. So walk the parent chain (bounded) and copy
 * ONLY the missing GUI variables. Never overwrites an existing value, silent
 * no-op off Linux or on any read failure — strictly additive, fail-open (A3).
 */
export const GUI_ENV_KEYS = [
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'XAUTHORITY',
  'DBUS_SESSION_BUS_ADDRESS',
  'XDG_RUNTIME_DIR',
] as const;

export interface RehydrateGuiEnvDeps {
  /** Target env, mutated in place. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
  /** Starting pid whose ancestors are probed. Defaults to process.ppid. */
  startPid?: number;
  /** Injected /proc reader for tests. Defaults to fs.readFileSync. */
  readProcFile?: (path: string) => string;
  /** Platform guard. Defaults to process.platform. */
  platform?: NodeJS.Platform;
  /** Max ancestors to probe — the hooks service sits a few forks up. */
  maxHops?: number;
}

/** Parse `/proc/<pid>/environ` (NUL-separated KEY=VALUE records). */
function parseEnviron(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rec of raw.split('\0')) {
    const eq = rec.indexOf('=');
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
  }
  return out;
}

/** `/proc/<pid>/stat` field 4 is the ppid — fields 1..2 need the comm-paren skip. */
function readPpid(pid: number, readProcFile: (p: string) => string): number | null {
  try {
    const stat = readProcFile(`/proc/${pid}/stat`);
    const afterComm = stat.slice(stat.lastIndexOf(')') + 2); // "state ppid ..."
    const ppid = Number(afterComm.split(' ')[1]);
    return Number.isInteger(ppid) && ppid > 0 ? ppid : null;
  } catch {
    return null;
  }
}

/**
 * Copy missing GUI env vars from the nearest ancestor that has them.
 * Returns the keys that were filled (for the log line).
 */
export function rehydrateGuiEnvFromParent(deps: RehydrateGuiEnvDeps = {}): string[] {
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? process.platform;
  if (platform !== 'linux') return [];
  const readProcFile = deps.readProcFile ?? ((p: string) => readFileSync(p, 'utf8'));
  const missing = () => GUI_ENV_KEYS.filter((k) => !env[k]);
  if (missing().length === 0) return [];

  const filled: string[] = [];
  let pid: number | null = deps.startPid ?? process.ppid;
  const maxHops = deps.maxHops ?? 6;
  for (let hop = 0; hop < maxHops && pid !== null && pid > 1 && missing().length > 0; hop++) {
    let parentEnv: Record<string, string> | null = null;
    try {
      parentEnv = parseEnviron(readProcFile(`/proc/${pid}/environ`));
    } catch {
      parentEnv = null; // unreadable ancestor — keep walking
    }
    if (parentEnv) {
      for (const k of missing()) {
        const v = parentEnv[k];
        if (v) { env[k] = v; filled.push(k); }
      }
    }
    pid = readPpid(pid, readProcFile);
  }
  return filled;
}

/**
 * Backward-compatibility switch for the Cursor submit-time advisory (H6).
 *
 * Mirrors `NEXPATH_WINDSURF_PROMPTSUBMIT_ADVISORY` exactly, including the
 * exact-equality `=== '1'` read: internal, never persisted, never surfaced by
 * `nexpath status` or `nexpath config`. Unset / `'0'` / `'true'` all fall through
 * to today's behaviour.
 *
 * Duplicated rather than shared with the Windsurf constant on purpose: the two
 * platforms must be switchable INDEPENDENTLY, so one env var could not serve
 * both. A test pins the exact name.
 */
export const CURSOR_PROMPTSUBMIT_ADVISORY_ENV = 'NEXPATH_CURSOR_PROMPTSUBMIT_ADVISORY';

/** True only when the switch is explicitly `'1'`. Default OFF — never `!== '0'`. */
export function isCursorPromptSubmitAdvisoryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[CURSOR_PROMPTSUBMIT_ADVISORY_ENV] === '1';
}

/**
 * What we write to stdout. `continue:false` is what actually blocks Cursor.
 *
 * `user_message` is a **Cursor-only capability**: it is rendered inside the
 * "Submission blocked by hook" card (measured — analysis §4.1). Windsurf has no
 * equivalent; its block wording is a fixed vendor string we cannot influence.
 * So on Cursor we can explain WHY the prompt was held, and we should.
 */
export interface CursorHookResponse {
  continue: boolean;
  user_message?: string;
}

/** Shown in Cursor's block card when we hold a prompt for refinement. */
export const CURSOR_BLOCK_USER_MESSAGE =
  'nexpath: this prompt was held so you could refine it. Your refined version is being sent instead.';

/** The response that lets the prompt through unchanged — the fail-open default. */
export const CURSOR_CONTINUE: CursorHookResponse = { continue: true };

export interface CursorHookActionDeps {
  readStdin?: () => Promise<string>;
  /** RC41 seam: injected in tests; defaults to the real continuation runner. */
  runSequenceContinuation?: (projectRoot: string, host: 'windsurf' | 'cursor') => Promise<{ ran: boolean; blocked?: boolean; deferred?: boolean }>;
  /** RC50 seam: duplicate-invocation check (true ⇒ answer continue immediately). */
  checkDuplicateInvocation?: typeof checkAndRecordCursorInvocation;
  /** Decides whether to block. Defaults to "never" so H5 alone is inert. */
  decide?: (payload: CursorHookPayload) => Promise<'allow' | 'block'>;
  /** Overrides the block card text; defaults to CURSOR_BLOCK_USER_MESSAGE. */
  blockMessage?: string;
  /** Env for the switch read. Injected for tests. */
  env?: NodeJS.ProcessEnv;
  write?: (text: string) => void;
  exit?: (code: number) => void;
  /** Bound on the stdin read; a hang here would hold the user's prompt. */
  stdinTimeoutMs?: number;
  /**
   * H4's shared hold budget, applied to the Cursor path (inherited acceptance).
   *
   * `R2`: Cursor **orphans** timed-out hooks — it stops waiting but does NOT kill
   * the process, measured still running past 90 s. So the host will never reap
   * us and the bound must be **self-enforced**, exactly as on Windsurf. Every
   * segment draws from ONE budget; per-segment timeouts would sum.
   */
  holdBudget?: HoldBudget;
  /**
   * OPTION-A ORDERING (2026-08-12): spawn `nexpath auto` to classify THIS
   * prompt before deciding. Injected for tests; defaults to the shared
   * `spawnAuto`. See the block below for why Cursor needs this and Windsurf's
   * own hook already had it.
   */
  spawnAutoFn?: typeof spawnAuto;
  /** Await the spawned `auto` child (bounded by the hold). Injected for tests. */
  waitForChild?: (child: ChildProcess | null | undefined) => Promise<void>;
  /**
   * Raise the submit popup to the foreground (fire-and-forget). Injected for
   * tests; defaults to `bringPopupToFront`. CRITICAL, not cosmetic: the popup
   * (TtySelectFn's spawned terminal) opens BEHIND Cursor under GNOME
   * focus-stealing prevention, so the user never sees it, never selects, and the
   * hold times out → fail-open → the prompt is NOT blocked. Live root cause,
   * 2026-08-12. Windsurf raised its post-response popup this way; the submit
   * popup on BOTH hosts needs it too.
   */
  raisePopup?: () => void;
  /**
   * Read the submit-flow flag file (the config-backed switch). Injected for
   * tests so they never touch the real `~/.nexpath/submit-flow.json`; defaults
   * to the real reader in production. Tests default this to `() => null`
   * (flag absent) so only the env var drives the gate unless a test opts in.
   */
  readFlagFile?: (path: string) => string | null;
  /**
   * GUI env recovery (see `rehydrateGuiEnvFromParent`). Injected for tests;
   * the default reads `/proc` on Linux and no-ops elsewhere.
   */
  rehydrateGuiEnv?: (deps?: RehydrateGuiEnvDeps) => string[];
  /**
   * VED-PE-10 echo detector (see `isReplacementEcho` in windsurf-hook.ts).
   * Injected for tests so they never open the real store.
   */
  checkReplacementEcho?: (projectRoot: string | undefined, promptText: string) => Promise<boolean>;
  /**
   * File logger (defaults to the shared `~/.nexpath/nexpath.log` logger the
   * rest of the CLI uses). Added 2026-08-12 after the hooks.json `version` bug
   * hid for four days precisely because this command logged NOTHING: with a
   * dead registration and a silent hook, "Cursor never invoked us" and
   * "we ran and silently allowed" were indistinguishable. Every stage now
   * leaves a line. **PII (§4.3): prompt text and user_email are never logged —
   * lengths and booleans only.** Logging failures are swallowed; the hook's
   * fail-open contract outranks observability.
   */
  logEvent?: typeof log;
}

/**
 * The command body, free of `process.exit` so it is unit-testable.
 *
 * **Behaviour-neutral by default:** with no `decide` supplied this always
 * continues, so registering the command changes nothing observable. H6 supplies
 * the real decision, exactly as H2 did for Windsurf.
 */
export async function runCursorHookAction(
  event: string,
  deps: CursorHookActionDeps = {},
): Promise<void> {
  const readStdin = deps.readStdin ?? defaultReadStdin;
  const write = deps.write ?? ((t: string) => process.stdout.write(t));
  const exit = deps.exit ?? ((c: number) => process.exit(c));
  const stdinTimeoutMs = deps.stdinTimeoutMs ?? 2_000;
  // Never let observability break fail-open: a throwing logger is swallowed.
  const logEvent: typeof log = (level, name, data) => {
    try { (deps.logEvent ?? log)(level, name, data); } catch { /* logging must never break the hook */ }
  };

  try {
    logEvent('info', 'cursor_hook_invoked', { event });
    // ── RC41: the MPS continuation trigger (Cursor half) ─────────────────────
    // `afterAgentResponse` is Cursor's "response finished" event — the honest
    // analog of the Claude Stop that drives the CLI's continuation chain (see
    // runSequenceContinuationStop). With the switch ON and an active sequence,
    // run the SAME continuation Stop (`stop_hook_active:true`) and hand its
    // block to the proven delivery pipeline (decision file → poller → settle →
    // inject → auto-submit → echo registry). This event must NEVER block the
    // host: it always answers `{continue:true}`, whatever happened. No
    // sequence / switch off ⇒ the runner reports {ran:false} — a no-op.
    if (event === 'afterAgentResponse') {
      try {
        if (isSubmitAdvisoryEnabledForHost('cursor', { env: deps.env, readFlagFile: deps.readFlagFile })) {
          const rawPost = await Promise.race([
            readStdin(),
            new Promise<string>((r) => {
              const t = setTimeout(() => r(''), stdinTimeoutMs);
              if (typeof t.unref === 'function') t.unref();
            }),
          ]);
          const pl = parseCursorHookPayload(rawPost ?? '');
          const root = pl?.projectRoot ?? process.cwd();
          const cont = await (deps.runSequenceContinuation ?? runSequenceContinuationStop)(root, 'cursor');
          // RC43: `deferred` (quiet-window echo of our own block) needs no extra
          // handling here — this event always answers continue and never runs a
          // second stop; the log line just makes the deferral visible.
          if (cont.ran || cont.deferred === true) {
            logEvent('info', 'cursor_hook_sequence_continuation', { blocked: cont.blocked === true, deferred: cont.deferred === true });
          }
        }
      } catch (err) {
        logEvent('warn', 'cursor_hook_sequence_continuation_failed', { message: (err as Error)?.message ?? 'unknown' });
      }
      write(JSON.stringify(CURSOR_CONTINUE));
      exit(0);
      return;
    }

    if (event !== 'beforeSubmitPrompt') {
      // Unknown event: continue rather than guess at its contract.
      write(JSON.stringify(CURSOR_CONTINUE));
      exit(0);
      return;
    }

    // ── Self-enforced hold (R2): Cursor will never reap us ────────────────
    const hold = deps.holdBudget ?? createHoldBudget();

    // BOUNDED: `defaultReadStdin` resolves only on stdin 'end'. An unbounded
    // await would hang the hook while holding the user's prompt (A3).
    const stdinRes = await hold.run(() => Promise.race([
      readStdin(),
      new Promise<string>((r) => {
        const t = setTimeout(() => r(''), stdinTimeoutMs);
        if (typeof t.unref === 'function') t.unref();
      }),
    ]));
    const raw = stdinRes.value ?? '';

    const payload = parseCursorHookPayload(raw);
    // §4.3: lengths and booleans only — never the prompt text or user_email.
    logEvent('info', 'cursor_hook_payload', {
      raw_len: raw.length,
      stdin_timed_out: stdinRes.timedOut === true,
      prompt_len: payload?.promptText?.length ?? 0,
      has_project_root: typeof payload?.projectRoot === 'string' && payload.projectRoot.length > 0,
    });

    // RC50: duplicate registrations (project + identical user + a stale
    // claude-settings entry — three on the tester's machine) each invoke this
    // command for the SAME submit. Only the FIRST runs auto + the decider;
    // later ones answer continue immediately, so a working delivery can never
    // open one popup per registration. Keyed on Cursor's own generation_id;
    // absent id ⇒ no guard (fail-open).
    if ((deps.checkDuplicateInvocation ?? checkAndRecordCursorInvocation)(
      payload?.projectRoot ?? process.cwd(), event, payload?.generationId,
    )) {
      logEvent('info', 'cursor_hook_duplicate_invocation', { event });
      write(JSON.stringify(CURSOR_CONTINUE));
      exit(0);
      return;
    }

    let decision: 'allow' | 'block' = 'allow';
    // Gated exactly like Windsurf's: with the switch off the decider is never
    // consulted, so the path is unreachable and behaviour is unchanged.
    //
    // H9 (owner ruling 2026-08-13): the DEFAULT decider now runs Layer C's
    // `nexpath stop` inside the hold — the COMPLETE popup surface of the old
    // flow (MPS sequence popup → PE popup → advisory popup), relocated to
    // submit time. A stop selection blocks the original and the extension
    // injects the selected text; anything else releases the prompt unchanged.
    // The H3 advisory-only decider remains exported for injected wirings.
    // The stop child a running default decide spawned — killed on hold
    // exhaustion so no popup process outlives the hook (R2).
    const stopChildRef: { current: ChildProcess | null } = { current: null };
    const decide = deps.decide ?? (async (pl: CursorHookPayload) => {
      const d = buildStopDrivenPromptSubmitDecider(
        { project: pl.projectRoot },
        { host: 'cursor', onChild: (c) => { stopChildRef.current = c; } },
      );
      return d('beforeSubmitPrompt', { project: pl.projectRoot }, pl.promptText ?? '');
    });
    // Config-backed switch (owner ruling 2026-08-12): env var override, else the
    // shipped `~/.nexpath/submit-flow.json` flag. The env-only helper is kept for
    // its exact-equality pin; the GATE resolves through the flag-aware resolver.
    const gateEnabled = isSubmitAdvisoryEnabledForHost('cursor', { env: deps.env, readFlagFile: deps.readFlagFile });
    logEvent('info', 'cursor_hook_gate', {
      enabled: gateEnabled,
      // Permanent probes for the sanitized-env trap: without DISPLAY/DBUS the
      // popup dies instantly and the flow silently allows (measured 2026-08-12).
      has_display: Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY),
      has_dbus: Boolean(process.env.DBUS_SESSION_BUS_ADDRESS),
    });
    if (gateEnabled) {
      // Cursor spawns hooks WITHOUT the GUI session env (measured) — the popup
      // cannot open in that state. Recover the missing vars from the ancestor
      // Cursor processes before anything downstream needs them. Additive-only;
      // injectable for tests; silent no-op off Linux or on failure.
      const rehydrate = deps.rehydrateGuiEnv ?? rehydrateGuiEnvFromParent;
      try {
        const filled = rehydrate({});
        if (filled.length > 0) logEvent('info', 'cursor_hook_env_rehydrated', { filled });
      } catch { /* fail-open — the decider will simply fall back to allow */ }
      // ── OPTION-A ORDERING (2026-08-12) — classify THIS prompt FIRST ────────
      // Cursor's `beforeSubmitPrompt` fires BEFORE the prompt reaches
      // `state.vscdb`, so the extension's DB-watcher has not classified it yet.
      // Without this, the decider's option source reads a STALE advisory (the
      // previous turn's) or none, and never blocks the current prompt — the
      // exact gap found live 2026-08-12. So the hook drives `auto` itself and
      // awaits it, EXACTLY as `windsurf-hook.ts` does (its handler spawns auto
      // before the deferred decision). The `auto` runtime — including its LLM
      // classification — sits inside the self-enforced hold; `R2`/A3 hold
      // discipline bounds it and fail-open releases the prompt on exhaustion.
      const spawnAutoFn = deps.spawnAutoFn ?? spawnAuto;
      const waitForChild = deps.waitForChild ?? awaitChild;
      const promptText = payload?.promptText ?? '';
      // ── VED-PE-10: our own replacement re-entering must not re-advise ──────
      // The extension injects + auto-submits the replacement after a block, and
      // that submit fires THIS hook again. Without this check the hook's own
      // `auto` consumed the `lastInjectedPrompt` guard, the extension's
      // duplicate watcher-auto then classified the replacement fresh, and the
      // replacement's run popped a SECOND popup and stalled ~57 s behind the
      // hold (measured live 2026-08-13). On an echo: skip auto, popup and
      // decision entirely — instant release. The guard field is left for the
      // watcher's auto to consume (Layer C semantics unchanged).
      let isEcho = false;
      if (promptText.trim() !== '') {
        const echoRes = await hold.run(() =>
          (deps.checkReplacementEcho ?? isReplacementEcho)(payload?.projectRoot, promptText));
        isEcho = !echoRes.timedOut && echoRes.value === true;
      }
      if (isEcho) {
        logEvent('info', 'cursor_hook_echo_skip', { prompt_len: promptText.length });
      } else {
      if (promptText.trim() !== '') {
        const child = spawnAutoFn(promptText, { cwd: payload?.projectRoot ?? process.cwd() });
        const waited = await hold.run(() => waitForChild(child));
        if (waited.timedOut) {
          // Hold exhausted before auto finished: do NOT decide (the signal never
          // landed) and never leave an orphan (R2 — Cursor won't reap it).
          killProcessTree(child); // RC62: take the popup terminal too
        }
        logEvent('info', 'cursor_hook_auto', { spawned: child != null, timed_out: waited.timedOut === true });
      } else {
        logEvent('info', 'cursor_hook_auto', { spawned: false, reason: 'empty_prompt' });
      }
      // Raise the popup to the foreground BEFORE the blocking decision. The
      // popup spawn inside `decide` is synchronous (spawnSync); this fire-and-
      // forget poller raises 'Nexpath — Action Required' the moment it appears,
      // so the user actually sees it and can select — without which the hold
      // times out and the prompt is never blocked (live root cause 2026-08-12).
      (deps.raisePopup ?? bringPopupToFront)();
      // Draws from what the stdin read + auto classification left. A timeout is
      // never a decision: it continues, so the original prompt is released (A3).
      const decided = await hold.run(() => decide(payload));
      if (decided.timedOut) {
        // Hold exhausted while the popup waited: fail open AND reap the stop
        // child — Cursor never reaps timed-out hooks (R2), and stop's popups
        // wait on the user with no bound of their own.
        killProcessTree(stopChildRef.current); // RC62: take the popup terminal too
      }
      if (!decided.timedOut && decided.value === 'block') decision = 'block';
      logEvent('info', 'cursor_hook_decision', {
        decision,
        decider_timed_out: decided.timedOut === true,
      });
      } // end non-echo path
    }

    // `continue:false` is the ONLY thing that blocks Cursor — not the exit code.
    // On a block we also send `user_message`, the text channel Cursor renders in
    // its card. Omitting it would leave the user staring at a bare "blocked by
    // hook" with no explanation of what happened to their prompt.
    write(JSON.stringify(
      decision === 'block'
        ? { continue: false, user_message: deps.blockMessage ?? CURSOR_BLOCK_USER_MESSAGE }
        : CURSOR_CONTINUE,
    ));
    logEvent('info', 'cursor_hook_response', { continue: decision !== 'block' });
  } catch (err) {
    // Never break the host: emit a continue and fall through to exit 0.
    logEvent('error', 'cursor_hook_fail_open', { message: (err as Error)?.message ?? 'unknown' });
    try { write(JSON.stringify(CURSOR_CONTINUE)); } catch { /* stdout gone */ }
  }
  exit(0);
}

export function registerCursorHookCommand(program: Command): void {
  program
    .command('cursor-hook <event>')
    .description('Internal: bridge a Cursor hook to nexpath (configured by `nexpath install`).')
    .action(async (event: string) => {
      await runCursorHookAction(event);
    });
}
