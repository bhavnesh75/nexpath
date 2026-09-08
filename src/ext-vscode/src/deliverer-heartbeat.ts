/**
 * RC70 (F-4, whole-repo read 2026-09-05) — the deliverer heartbeat.
 *
 * The submit-time hook cancels the user's prompt on `block` and relies on THIS
 * extension's poller to inject the refined version. Until now nothing checked
 * that a deliverer existed: the only gate was the persistent
 * `~/.nexpath/submit-flow.json` flag, written by hook install and never
 * cleared. Two real shapes lose the prompt: (1) a user who declines the
 * chat-watch consent but completes setup — setup runs regardless of consent,
 * while the consent gate returns BEFORE the submit poller arms; (2) the
 * extension disabled, crashed, or not yet armed while hooks are registered.
 * In both, "Use enhanced" cancels the prompt, the decision file is written,
 * nobody delivers, and the block card promises a refined version that never
 * comes.
 *
 * The heartbeat is the liveness signal the CLI decider reads before it blocks:
 * one small JSON per (host, pid) under `~/.nexpath/`, rewritten every
 * `DELIVERER_HEARTBEAT_INTERVAL_MS` with `armed` = "the submit poller for this
 * host is running here" and a `reason` when it is not. Per-pid files make two
 * windows honest (any FRESH armed beat wins); files older than a day are pruned
 * on each write; `stop()` writes a final not-armed beat so a clean shutdown is
 * indistinguishable from "no deliverer" — which is what it is.
 *
 * Runs on cursor/windsurf hosts REGARDLESS of consent (that is the point), never
 * throws (every fs call is swallowed), and its timer is unref'd. The CLI side
 * (`cli/commands/deliverer-state.ts`) treats an ABSENT file as "unknown extension
 * version" and proceeds as today — so an older extension with a newer CLI is not
 * silently muted — while a fresh not-armed or a stale beat means "no deliverer".
 */
import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DELIVERER_HEARTBEAT_SCHEMA_V1 = 1 as const;
export const DELIVERER_HEARTBEAT_INTERVAL_MS = 10_000;
export const DELIVERER_HEARTBEAT_PRUNE_MS = 24 * 60 * 60 * 1000;
export const DELIVERER_HEARTBEAT_PREFIX = 'deliverer-';

export interface DelivererHeartbeatRecordV1 {
  schemaVersion: typeof DELIVERER_HEARTBEAT_SCHEMA_V1;
  host: 'cursor' | 'windsurf';
  pid: number;
  at: number;
  armed: boolean;
  reason: string;
}

export function delivererHeartbeatDir(home: string = homedir()): string {
  return join(home, '.nexpath');
}

export function delivererHeartbeatFilename(host: 'cursor' | 'windsurf', pid: number): string {
  return `${DELIVERER_HEARTBEAT_PREFIX}${host}-${pid}.json`;
}

export interface DelivererHeartbeatDeps {
  host: 'cursor' | 'windsurf';
  /** Live: is the submit poller for this host running right now? */
  isArmed: () => boolean;
  /** Live: why not (consent, gate reason, …); recorded beside `armed:false`. */
  reason: () => string;
  pid?: number;
  dir?: string;
  intervalMs?: number;
  now?: () => number;
  writeFileFn?: (path: string, data: string) => void;
  mkdirFn?: (dir: string) => void;
  readdirFn?: (dir: string) => string[];
  mtimeMsFn?: (path: string) => number;
  unlinkFn?: (path: string) => void;
  setIntervalFn?: (fn: () => void, ms: number) => unknown;
  clearIntervalFn?: (handle: unknown) => void;
}

export interface DelivererHeartbeat {
  /** Write one beat now (also called on every interval tick). */
  beat(): void;
  /** Stop the ticker and write a final not-armed beat carrying `finalReason`. */
  stop(finalReason?: string): void;
}

export function startDelivererHeartbeat(deps: DelivererHeartbeatDeps): DelivererHeartbeat {
  const dir = deps.dir ?? delivererHeartbeatDir();
  const pid = deps.pid ?? process.pid;
  const now = deps.now ?? (() => Date.now());
  const path = join(dir, delivererHeartbeatFilename(deps.host, pid));
  const writeFile = deps.writeFileFn ?? ((p: string, d: string) => writeFileSync(p, d, 'utf8'));
  const mkdir = deps.mkdirFn ?? ((d: string) => { mkdirSync(d, { recursive: true }); });
  const readdir = deps.readdirFn ?? readdirSync;
  const mtimeMs = deps.mtimeMsFn ?? ((p: string) => statSync(p).mtimeMs);
  const unlink = deps.unlinkFn ?? ((p: string) => { unlinkSync(p); });
  const setT = deps.setIntervalFn ?? ((fn, ms) => setInterval(fn, ms));
  const clearT = deps.clearIntervalFn ?? ((h) => clearInterval(h as NodeJS.Timeout));

  const write = (armed: boolean, reason: string): void => {
    try {
      const record: DelivererHeartbeatRecordV1 = {
        schemaVersion: DELIVERER_HEARTBEAT_SCHEMA_V1, host: deps.host, pid, at: now(), armed, reason,
      };
      try { mkdir(dir); } catch { /* exists / unwritable — the write below decides */ }
      writeFile(path, JSON.stringify(record));
    } catch { /* a heartbeat must never break the extension */ }
  };
  const prune = (): void => {
    try {
      const t = now();
      for (const name of readdir(dir)) {
        if (!name.startsWith(`${DELIVERER_HEARTBEAT_PREFIX}${deps.host}-`) || !name.endsWith('.json')) continue;
        const p = join(dir, name);
        if (p === path) continue;
        try { if (t - mtimeMs(p) > DELIVERER_HEARTBEAT_PRUNE_MS) unlink(p); } catch { /* best-effort */ }
      }
    } catch { /* pruning is optional */ }
  };
  const beat = (): void => {
    let armed = false; let reason = 'unknown';
    try { armed = deps.isArmed() === true; } catch { armed = false; }
    try { reason = armed ? 'armed' : String(deps.reason()); } catch { reason = 'unknown'; }
    write(armed, reason);
    prune();
  };

  beat();
  let handle: unknown = setT(beat, deps.intervalMs ?? DELIVERER_HEARTBEAT_INTERVAL_MS);
  const h = handle as { unref?: () => void };
  if (typeof h?.unref === 'function') h.unref();

  return {
    beat,
    stop(finalReason = 'stopped'): void {
      if (handle !== undefined) { try { clearT(handle); } catch { /* ignore */ } handle = undefined; }
      write(false, finalReason);
    },
  };
}
