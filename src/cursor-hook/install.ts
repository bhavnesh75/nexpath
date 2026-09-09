/**
 * `.cursor/hooks.json` writer (hook milestone H5).
 *
 * Mirrors `windsurf-hook/install.ts`'s **proven** shape rather than inventing a
 * second one: idempotent, preserves other tools' hooks, identifies our own
 * entries by a command substring, and writes **no marker field**. That writer is
 * already shipping and has survived real installs; the failure modes it handles
 * (stale entries from an older install, a hand-edited file, an event left empty)
 * are the same ones here.
 *
 * ── ⚠ R4: `timeout` IS WRITTEN IN SECONDS ────────────────────────────────────
 * Cursor multiplies the value by 1000 internally — a measured finding, not a
 * guess: `"timeout": 180000` was logged as `180000000ms`. Writing milliseconds
 * here would produce a timeout ~1000x too long, so a hung hook would appear to
 * hang forever. The constant therefore carries the unit **in its name**, and a
 * test pins the emitted number.
 *
 * ── ⚠ R3: NEVER RELY ON CURSOR'S DEFAULT TIMEOUT ─────────────────────────────
 * The default is 60 s and is a **silent fail-open cliff** — a hook that exceeds
 * it is simply abandoned, with no error surfaced. H4's hold budget is 60–90 s, so
 * the default could fire *while we are legitimately holding the prompt*. We
 * therefore write an explicit timeout comfortably above H4's ceiling.
 *
 * ── `failClosed` STAYS AT ITS DEFAULT (`false`) ───────────────────────────────
 * Amendment `A3`, now evidence-backed: fail-open is the observed behaviour, and a
 * failure while holding the user's prompt is strictly worse than no advisory. We
 * do not write the field at all — writing `false` explicitly would imply we had
 * a reason to override something.
 *
 * ── CONFIG LOCATIONS ─────────────────────────────────────────────────────────
 * Cursor merges three paths (measured; its service logs each at startup):
 * `<project>/.cursor/hooks.json`, `~/.cursor/hooks.json`, and enterprise
 * `/etc/cursor/hooks.json`. We only ever write the first two — the enterprise
 * path is not ours to touch.
 *
 * ── ⚠ R5: TOP-LEVEL `version` IS **REQUIRED** ────────────────────────────────
 * Live root cause, 2026-08-12: Cursor's config validator (extracted from
 * `workbench.desktop.main.js` and reproduced verbatim) REJECTS the whole file
 * when the top-level `version` field is missing or not a positive integer —
 * `"Config version must be a number"` → the service logs *"Failed to parse user
 * hooks configuration"* and registers NOTHING. A syntactically valid hooks.json
 * without `version` is therefore silently dead: no error surfaces in the UI, the
 * hook simply never fires. This writer emitted exactly that for four days.
 * The 2026-08-08 spike worked because its hand-written harness config carried
 * `"version": 1`. A test pins the emitted field; preservation of a
 * user-customised valid version is also pinned.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setSubmitFlowFlag } from '../cli/commands/submit-flow-config.js';

/**
 * Hook timeout in SECONDS. **The unit is in the name deliberately (`R4`).**
 *
 * 120 s sits above H4's 60–90 s hold budget with headroom, so Cursor never reaps
 * us while we are legitimately holding a prompt (`R3`), and well under anything a
 * user would call hung.
 */
/**
 * RC77: 1900 s (Cursor multiplies by 1000 — the unit is SECONDS, spike-verified, and a value
 * of 180000 was accepted). The popup segment may now wait up to 30 minutes for the human
 * (DEFAULT_POPUP_WAIT_MS); this registration must sit ABOVE that so our own expiry, not
 * Cursor's fail-open-and-orphan, is what ends a forgotten popup. Was 120 s.
 */
export const CURSOR_HOOK_TIMEOUT_SECONDS = 1900;

/**
 * The REQUIRED top-level `version` of `.cursor/hooks.json` (`R5`).
 *
 * Cursor's validator demands a positive integer here and rejects the entire
 * config without it — measured live 2026-08-12 ("Failed to parse user hooks
 * configuration", zero hooks registered). `1` is the only version the current
 * validator gives meaning to.
 */
export const CURSOR_HOOKS_CONFIG_VERSION = 1;

/**
 * True when an existing top-level `version` value would pass Cursor's validator
 * (positive integer). Anything else must be replaced, or the whole file —
 * including other tools' hooks — stays rejected.
 */
export function isValidCursorHooksVersion(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1;
}

/**
 * The events we register.
 *
 * `beforeSubmitPrompt` is the submit interception (measured directly: default
 * timeout, fail-open at 60.002s, orphaned process, `continue:false` blocks).
 *
 * RC41 (2026-08-21): `afterAgentResponse` — Cursor's "response finished" hook
 * from its 2026-07 hook batch (`afterAgentResponse, afterAgentThought, …` per
 * the platform research) — is the honest analog of the Claude Stop that drives
 * the CLI's MPS continuation chain. Registered so the continuation popup can
 * fire after each item's response, exactly like the CLI. The original caution
 * here ("stays unregistered until a live sweep names it") is retired the same
 * way it was written: the registration is verified against THIS machine's live
 * Cursor at ship time (its own hooks log must list the step as loaded — an
 * unknown step name must not appear and must not break the file's parse).
 */
export const CURSOR_HOOK_EVENTS = ['beforeSubmitPrompt', 'afterAgentResponse'] as const;
export type CursorHookEvent = (typeof CURSOR_HOOK_EVENTS)[number];

export interface CursorHookEntry {
  command: string;
  timeout?: number;
}

/** `<home>/.cursor/hooks.json` — the user-level config. */
export function getCursorUserHooksPath(home: string): string {
  return join(home, '.cursor', 'hooks.json');
}

/** `<project>/.cursor/hooks.json` — the project-level config. */
export function getCursorProjectHooksPath(projectRoot: string): string {
  return join(projectRoot, '.cursor', 'hooks.json');
}

/**
 * The command string nexpath writes for a given event.
 *
 * ── RC25 (2026-08-19, found during a full old-flow-vs-new-flow Windows read) ──
 * Was a BARE `node`. `windsurf-hook/install.ts` documents — from a MEASURED,
 * live finding — that hosts spawn hook commands with a **sanitized PATH that
 * may not contain `node`**, so a bare `node` ENOENTs silently: the hook never
 * runs, capture is 0, and nothing in the product says why. That is the exact
 * failure class RC21 root-caused for Windsurf on Windows. Cursor's own writer
 * had never been checked against it and carried zero test/doc coverage either
 * way — an unverified assumption sitting in the one hook every Cursor prompt
 * on every OS depends on. `nodePath` defaults to `process.execPath` (the
 * absolute binary running `nexpath install`), matching Windsurf's proven,
 * already-shipping pattern exactly rather than inventing a second one.
 * Injectable for tests so the emitted string is pinned deterministically.
 */
export function buildCursorHookCommand(
  cliPath: string,
  event: CursorHookEvent,
  nodePath: string = process.execPath,
): string {
  // ── RC29 (Windows/Cursor tester, 2026-08-21) ────────────────────────────
  // This used to be `JSON.stringify(path)`, which is NOT a quoting function —
  // it is a JSON ENCODER, and it escapes backslashes. On POSIX a path has no
  // backslashes, so it behaved as a harmless quote-wrapper and Linux/macOS were
  // always correct. On Windows every separator was DOUBLED into the command
  // text:
  //     "C:\\Users\\janvi\\.nexpath\\cli\\0.1.4\\dist\\cli\\index.js"
  // and because the whole file is JSON-encoded again on write, that is exactly
  // what Cursor reads back and executes. It also made the RC26 registration
  // check compare a doubled-separator command against a real (single-separator)
  // path, so it could never match — which is why the tester's Cursor re-ran
  // setup on EVERY window reload.
  //
  // Quote plainly instead. A `"` cannot appear in a Windows path at all, and a
  // POSIX path containing one has no valid shell rendering here either, so it
  // is dropped rather than silently producing a broken command.
  const q = (s: string) => `"${s.replace(/"/g, '')}"`;
  return `${q(nodePath)} ${q(cliPath)} cursor-hook ${event}`;
}

/**
 * True if an entry is one nexpath wrote.
 *
 * Identified by the `cursor-hook` command substring — **no marker field**, same
 * as the Windsurf writer. A marker key would be a second source of truth that a
 * hand-edit could desynchronise from the command it is supposed to describe.
 */
export function isNexpathCursorHook(entry: CursorHookEntry): boolean {
  return typeof entry?.command === 'string' && entry.command.includes('cursor-hook');
}

/** Build one entry, with the explicit seconds timeout (`R3`/`R4`). */
/**
 * RC77: the `timeout` (seconds) currently registered for OUR beforeSubmitPrompt entry, or
 * null when the file, the event or our entry is absent/unreadable. The hook reads this at
 * run time so its popup wait never exceeds what THIS machine registered — an install that
 * still carries the old 120 s keeps a safe window until setup re-registers it.
 */
export function readRegisteredCursorHookTimeoutSec(filePath: string): number | null {
  try {
    const data = readJsonSafe(filePath);
    const hooks = data.hooks;
    if (!hooks || typeof hooks !== 'object') return null;
    const entries = (hooks as Record<string, unknown>).beforeSubmitPrompt;
    if (!Array.isArray(entries)) return null;
    const ours = entries.find((e) => isNexpathCursorHook(e as CursorHookEntry)) as CursorHookEntry | undefined;
    const t = ours?.timeout;
    return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : null;
  } catch {
    return null;
  }
}

export function buildCursorHookEntry(
  cliPath: string,
  event: CursorHookEvent,
  nodePath: string = process.execPath,
): CursorHookEntry {
  return {
    command: buildCursorHookCommand(cliPath, event, nodePath),
    // SECONDS. See CURSOR_HOOK_TIMEOUT_SECONDS.
    timeout: CURSOR_HOOK_TIMEOUT_SECONDS,
    // `failClosed` deliberately omitted — see the file header.
  };
}

export function buildCursorHooksConfig(cliPath: string): Record<CursorHookEvent, CursorHookEntry[]> {
  return {
    beforeSubmitPrompt: [buildCursorHookEntry(cliPath, 'beforeSubmitPrompt')],
    // RC41: the continuation trigger. Its popup waits on a HUMAN decision, so
    // it carries a longer timeout (SECONDS — Cursor multiplies by 1000); the
    // measured default (60s) would cut a thinking user off, and Cursor fails
    // open + orphans on timeout (R2), so the popup would linger headless.
    afterAgentResponse: [{ ...buildCursorHookEntry(cliPath, 'afterAgentResponse'), timeout: 600 }],
  };
}

function readJsonSafe(filePath: string): Record<string, unknown> {
  try {
    if (!existsSync(filePath)) return {};
    const txt = readFileSync(filePath, 'utf8').trim();
    if (!txt) return {};
    const v: unknown = JSON.parse(txt);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    // A malformed file must not crash `nexpath install`; we rewrite it rather
    // than abort, exactly as the Windsurf writer does.
    return {};
  }
}

function writeJson(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * Write nexpath's hooks into `.cursor/hooks.json`, preserving other tools' hooks
 * and replacing any prior nexpath entries (idempotent).
 */
export function writeCursorHooks(filePath: string, cliPath: string): void {
  const data = readJsonSafe(filePath);
  // R5: without a valid top-level `version` Cursor rejects the WHOLE file and
  // registers nothing — the hook would be silently dead. Preserve a
  // user-customised valid value; write ours otherwise.
  if (!isValidCursorHooksVersion(data.version)) data.version = CURSOR_HOOKS_CONFIG_VERSION;
  const hooks = (data.hooks && typeof data.hooks === 'object' ? data.hooks : {}) as Record<string, CursorHookEntry[]>;
  const cfg = buildCursorHooksConfig(cliPath) as Record<string, CursorHookEntry[]>;
  // Iterate ALL events so a stale entry from an older install is dropped even if
  // we no longer write that event today.
  for (const event of CURSOR_HOOK_EVENTS) {
    const kept = Array.isArray(hooks[event]) ? hooks[event].filter((h) => !isNexpathCursorHook(h)) : [];
    const merged = [...kept, ...(cfg[event] ?? [])];
    if (merged.length === 0) delete hooks[event];
    else hooks[event] = merged;
  }
  data.hooks = hooks;
  writeJson(filePath, data);
  // Owner ruling 2026-08-12: ship the new submit-flow ON via the config-backed
  // flag (`~/.nexpath/submit-flow.json`), read by both the hook and the
  // extension. Registering the Cursor hook enables Cursor's new flow; flip the
  // flag (or set the env var to '0') to revert. Best-effort; never breaks install.
  try { setSubmitFlowFlag('cursor', true); } catch { /* best-effort */ }
}

/**
 * Remove nexpath's hooks; preserve everything else. Returns true if anything of
 * ours was removed.
 */
export function removeCursorHooks(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  const data = readJsonSafe(filePath);
  // R5, removal half: this function rewrites the file, and other tools' hooks
  // may remain in it — leaving them behind an invalid (version-less) config
  // would keep THEIR hooks dead too. Same preserve-or-write rule as the writer.
  if (!isValidCursorHooksVersion(data.version)) data.version = CURSOR_HOOKS_CONFIG_VERSION;
  const hooks = data.hooks && typeof data.hooks === 'object' ? (data.hooks as Record<string, CursorHookEntry[]>) : null;
  if (!hooks) return false;
  let removed = false;
  for (const event of CURSOR_HOOK_EVENTS) {
    if (Array.isArray(hooks[event])) {
      const before = hooks[event].length;
      const kept = hooks[event].filter((h) => !isNexpathCursorHook(h));
      if (kept.length !== before) removed = true;
      if (kept.length === 0) delete hooks[event];
      else hooks[event] = kept;
    }
  }
  data.hooks = hooks;
  writeJson(filePath, data);
  return removed;
}
