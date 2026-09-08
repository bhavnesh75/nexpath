/**
 * RC70 (F-4) — CLI side of the deliverer heartbeat (writer: the VS Code
 * extension's `deliverer-heartbeat.ts`). Read by the submit decider BEFORE it
 * shows a popup / cancels the prompt: a `block` is only worth issuing when a
 * poller exists to inject the replacement.
 *
 *   armed      — a FRESH beat for this host says the submit poller is running.
 *   not_armed  — a fresh beat says it is not (consent declined, gate off,
 *                deactivated) — `reason` carries why.
 *   stale      — beats exist but none is fresh: the extension is gone (crashed,
 *                disabled, editor closed).
 *   absent     — no beat was ever written for this host: an extension without
 *                this feature, or none at all. Treated as UNKNOWN by the caller
 *                (proceeds exactly as before this check existed), so a newer CLI
 *                never silently mutes an older extension.
 *
 * Any fresh armed beat wins (two windows, one armed). Corrupt files are ignored.
 * Never throws.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const DELIVERER_HEARTBEAT_PREFIX = 'deliverer-';
/** 3 missed 10 s beats + margin. */
export const DELIVERER_HEARTBEAT_STALE_MS = 35_000;

export type DelivererStateKind = 'armed' | 'not_armed' | 'stale' | 'absent';

export interface DelivererState {
  state: DelivererStateKind;
  ageMs?: number;
  reason?: string;
  pid?: number;
}

export interface DelivererStateDeps {
  dir?: string;
  now?: () => number;
  staleMs?: number;
  readdirFn?: (dir: string) => string[];
  readFileFn?: (path: string) => string;
}

interface Beat { pid: number; at: number; armed: boolean; reason?: string }

function parseBeat(raw: string, host: string): Beat | null {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || v.schemaVersion !== 1 || v.host !== host) return null;
    if (typeof v.pid !== 'number' || typeof v.at !== 'number' || !Number.isFinite(v.at)) return null;
    if (typeof v.armed !== 'boolean') return null;
    return { pid: v.pid, at: v.at, armed: v.armed, ...(typeof v.reason === 'string' ? { reason: v.reason } : {}) };
  } catch {
    return null;
  }
}

export function readDelivererState(
  host: 'cursor' | 'windsurf',
  deps: DelivererStateDeps = {},
): DelivererState {
  try {
    const dir = deps.dir ?? join(homedir(), '.nexpath');
    const now = deps.now ?? (() => Date.now());
    const staleMs = deps.staleMs ?? DELIVERER_HEARTBEAT_STALE_MS;
    const readdir = deps.readdirFn ?? readdirSync;
    const readFile = deps.readFileFn ?? ((p: string) => readFileSync(p, 'utf8'));
    const prefix = `${DELIVERER_HEARTBEAT_PREFIX}${host}-`;
    let names: string[] = [];
    try { names = readdir(dir); } catch { return { state: 'absent' }; }
    const beats: Beat[] = [];
    for (const name of names) {
      if (!name.startsWith(prefix) || !name.endsWith('.json')) continue;
      try {
        const b = parseBeat(readFile(join(dir, name)), host);
        if (b) beats.push(b);
      } catch { /* unreadable — ignore */ }
    }
    if (beats.length === 0) return { state: 'absent' };
    const t = now();
    const fresh = beats.filter((b) => t - b.at <= staleMs);
    const armed = fresh.find((b) => b.armed);
    if (armed) return { state: 'armed', ageMs: t - armed.at, pid: armed.pid };
    if (fresh.length > 0) {
      const newest = fresh.reduce((a, b) => (b.at > a.at ? b : a));
      return { state: 'not_armed', ageMs: t - newest.at, pid: newest.pid, ...(newest.reason ? { reason: newest.reason } : {}) };
    }
    const newest = beats.reduce((a, b) => (b.at > a.at ? b : a));
    return { state: 'stale', ageMs: t - newest.at, pid: newest.pid, ...(newest.reason ? { reason: newest.reason } : {}) };
  } catch {
    return { state: 'absent' }; // fail-open: unknown ⇒ proceed as before
  }
}
