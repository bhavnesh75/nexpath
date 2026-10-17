import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Store } from './db.js';
import { insertPromptsBatch, getRecentPrompts } from './prompts.js';
import { setDetectedLanguage } from './projects.js';
import { detectLanguage, LANG_WINDOW } from '../classifier/LanguageDetector.js';
import { SessionStateManager, MAX_HISTORY } from '../classifier/SessionStateManager.js';
import { detectSignalsByChannel } from '../classifier/signals.js';
import { appendParamEvents } from '../telemetry/param-events.js';
import type { PromptRecord } from '../classifier/types.js';
import { logger } from '../logger.js';
import type { HistoryEntry, HistorySourceResult } from './history-sources/types.js';
import { CURSOR_AGENT_ID, readCursorHistory } from './history-sources/cursor-transcripts.js';
import { DEVIN_AGENT_ID, readDevinLocalHistory } from './history-sources/devin-local-store.js';
import { dropLivePromptEcho, dropRepeatedRows, mergeHistoryEntries } from './history-sources/merge.js';

// Equal to the store's per-project FIFO cap (500) BY DESIGN: collection keeps the
// NEWEST `IMPORT_CAP` prompts and insertion is chronological (oldest first), so the
// first live prompt evicts the genuinely oldest imported row — full capacity is used
// and no newer history is destroyed ahead of older history.
const IMPORT_CAP = 500;

/** Session marker for param-events derived from the historical-import backfill. */
const HISTORICAL_IMPORT_SESSION_ID = 'historical-import';

/**
 * Non-prompt rows that Claude Code writes as `type: 'user'` string content: slash-command
 * wrappers, caveat banners, hook feedback, and command stdout. They are a small share of
 * rows but they would seed the longitudinal detectors with text the user never typed,
 * so they are excluded at import. The markers are stable transcript shapes.
 */
function isNoiseShape(text: string): boolean {
  return (
    text.startsWith('<command-name>') ||
    text.startsWith('Caveat:') ||
    text.includes('<local-command-caveat>') ||
    text.startsWith('<local-command-stdout>') ||
    text.startsWith('Stop hook') ||
    // Background-task completion notices. The agent injects these as user rows
    // when a backgrounded command or subagent finishes; they arrived after the
    // original marker list was measured, and a re-audit of live transcripts
    // found them surviving the filter at ~1.5% of imported rows.
    text.startsWith('<task-notification>')
  );
}

/** Agent tag of rows imported from Claude Code's own transcripts. */
const CLAUDE_AGENT_ID = 'claude-code';

/** One prompt about to be imported, from any source. */
type CollectedEntry = { text: string; capturedAt?: number; fileMtime: number; agent: string };

/** The user's answer, per editor, to "may NexPath read your AI chat history?". */
export type OtherAgentConsent = { cursor?: boolean; devin?: boolean };

export interface HistoryImportOptions {
  /** The prompt being processed right now. It is stored live, so it is never also imported. */
  livePrompt?: string;
  /**
   * Whether the user allowed NexPath to read each editor's AI chat history. Absent or false
   * means not allowed: that editor's history is not read. Claude Code history is unaffected.
   * Given as a function, it is called only when an import actually runs (a project's first
   * prompt), never on the prompts that follow; if it throws, no editor history is read.
   */
  otherAgentConsent?: OtherAgentConsent | (() => OtherAgentConsent);
  /** Injectable readers and clock, for tests. */
  readCursor?: (projectRoot: string) => HistorySourceResult;
  readDevin?: (projectRoot: string) => Promise<HistorySourceResult>;
  now?: number;
}

export interface HistoryImportSummary {
  /** Rows handed to the store by this import (0 when the guard skipped it or nothing was found). */
  imported: number;
  /** Of those, rows from editors other than Claude Code (Cursor, Devin Local). */
  fromOtherAgents: number;
  /**
   * True when this import created the project's session, and from Cursor or Devin Local history
   * alone. Without that history no import would have run, so the session would have started
   * empty on this prompt; `runAuto` uses this to keep what an empty session's first prompt does.
   */
  seededFromOtherAgentsOnly: boolean;
}

const NOTHING_IMPORTED: HistoryImportSummary = Object.freeze({ imported: 0, fromOtherAgents: 0, seededFromOtherAgentsOnly: false });

/**
 * Whether a session is already persisted for the project: the same test
 * `SessionStateManager.bootstrapFromHistory` makes before it seeds one.
 */
function hasPersistedSession(store: Store, projectRoot: string): boolean {
  const row = store.db.exec('SELECT state_json FROM session_states WHERE project_root = ?', [projectRoot])[0]?.values[0];
  if (!row) return false;
  try {
    return Boolean(JSON.parse(row[0] as string));
  } catch {
    return false;
  }
}

/**
 * Claude Code's transcripts for the project: up to IMPORT_CAP user prompts, newest session
 * files first (so the cap keeps the most recent history). Each entry carries the transcript
 * row's own `timestamp` when present; the file's mtime is the ordering fallback for rows
 * without one. A resumed session starts its new file with copies of the earlier session's
 * rows — same `uuid` — so a row whose `uuid` was already collected is skipped.
 */
function collectClaudeHistory(projectRoot: string): CollectedEntry[] {
  // Path resolution
  const base     = process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude');
  const safeName = projectRoot.replace(/[^a-zA-Z0-9]/g, '-');
  const projDir  = join(base, 'projects', safeName);
  if (!existsSync(projDir)) return [];

  // File discovery — .jsonl files sorted newest-first
  const entries = readdirSync(projDir, { withFileTypes: true });
  const jsonlFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.jsonl'))
    .map((e) => {
      const p = join(projDir, e.name);
      return { path: p, mtime: statSync(p).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const collected: CollectedEntry[] = [];
  const seenRowIds = new Set<string>();

  outer: for (const { path, mtime } of jsonlFiles) {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split('\n')) {
      if (collected.length >= IMPORT_CAP) break outer;
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed) as {
          type?: unknown;
          message?: { content?: unknown };
          timestamp?: unknown;
          uuid?: unknown;
        };
        if (
          obj.type === 'user' &&
          typeof obj.message?.content === 'string' &&
          obj.message.content.trim().length > 0 &&
          !isNoiseShape(obj.message.content.trim())
        ) {
          if (typeof obj.uuid === 'string' && obj.uuid) {
            if (seenRowIds.has(obj.uuid)) continue;
            seenRowIds.add(obj.uuid);
          }
          const ts = typeof obj.timestamp === 'string' ? Date.parse(obj.timestamp) : NaN;
          collected.push({
            text: obj.message.content.trim(),
            capturedAt: Number.isFinite(ts) ? ts : undefined,
            fileMtime: mtime,
            agent: CLAUDE_AGENT_ID,
          });
        }
      } catch { /* skip invalid JSON lines */ }
    }
  }
  return collected;
}

/** Runs one history source; a failure or an empty result never stops the others. */
async function readSource(
  name: string,
  read: () => HistorySourceResult | Promise<HistorySourceResult>,
): Promise<HistoryEntry[]> {
  try {
    const result = await read();
    if (result.skipped && result.skipped !== 'not_found') {
      logger.info('history_source_skipped', { source: name, reason: result.skipped });
    }
    return dropRepeatedRows(result.entries);
  } catch (err) {
    logger.warn('history_source_failed', {
      source: name,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/** The consent answer, read now; an answer that cannot be read means not allowed. */
function resolveConsent(given: HistoryImportOptions['otherAgentConsent']): OtherAgentConsent {
  if (typeof given !== 'function') return given ?? {};
  try {
    return given();
  } catch {
    return {};
  }
}

/** Cursor's and Devin Local's history for the project — only for the editors the user allowed. */
async function collectOtherAgentHistory(projectRoot: string, options: HistoryImportOptions): Promise<HistoryEntry[]> {
  const consent = resolveConsent(options.otherAgentConsent);
  const found: HistoryEntry[] = [];
  if (consent.cursor === true) {
    found.push(...(await readSource(CURSOR_AGENT_ID, () => (options.readCursor ?? readCursorHistory)(projectRoot))));
  }
  if (consent.devin === true) {
    found.push(...(await readSource(DEVIN_AGENT_ID, () => (options.readDevin ?? readDevinLocalHistory)(projectRoot))));
  }
  return dropLivePromptEcho(found, options.livePrompt, options.now ?? Date.now(), new Set([CURSOR_AGENT_ID, DEVIN_AGENT_ID]));
}

export async function importHistoricalPrompts(
  store: Store,
  projectRoot: string,
  options: HistoryImportOptions = {},
): Promise<HistoryImportSummary> {
  // Guard: skip if prompts already exist for this project
  if (getRecentPrompts(store, projectRoot, 1).length > 0) return NOTHING_IMPORTED;

  const claude = collectClaudeHistory(projectRoot);
  const others = await collectOtherAgentHistory(projectRoot, options);
  if (claude.length === 0 && others.length === 0) return NOTHING_IMPORTED;

  // Import into the store OLDEST FIRST, with real capture times. Store rowids must
  // ascend with true chronology: recency reads (`ORDER BY id DESC`) and the FIFO cap's
  // eviction both follow rowid, so inserting newest-first would make "most recent"
  // mean the oldest session and would evict the newest history first. `collected`
  // itself stays newest-first for the LANGUAGE window below, which wants the most
  // recent prompts; the session bootstrap uses the chronological order instead.
  //
  // With Claude Code history only, both lists are built exactly as they always were. When
  // other editors' history is present, every source is merged by time in this one pass —
  // the only moment rowids can still follow time — and the newest IMPORT_CAP are kept.
  let collected: CollectedEntry[];
  let chronological: CollectedEntry[];
  if (others.length === 0) {
    collected = claude;
    chronological = [...collected].sort(
      (a, b) => (a.capturedAt ?? a.fileMtime) - (b.capturedAt ?? b.fileMtime),
    );
  } else {
    const claudeEntries: HistoryEntry[] = claude.map((e) => ({
      text: e.text, capturedAt: e.capturedAt, orderHint: e.fileMtime, agent: e.agent,
    }));
    chronological = mergeHistoryEntries([claudeEntries, others], IMPORT_CAP).map((e) => ({
      text: e.text, capturedAt: e.capturedAt, fileMtime: e.orderHint, agent: e.agent,
    }));
    collected = [...chronological].reverse();
  }

  insertPromptsBatch(
    store,
    projectRoot,
    chronological.map((entry) => ({ promptText: entry.text, agent: entry.agent, capturedAt: entry.capturedAt })),
  );

  // retro-population — record param-detection events for the imported
  // history so the longitudinal detectors see the user's full pre-install
  // behaviour, not just post-install prompts. Stage-agnostic (no real stage for
  // historical prompts → stage: null, never a fake stamp); pure-CPU keyword scan,
  // no LLM / no network. Idempotent: this whole function returns early (the
  // prompts-exist guard above) once prompts exist, so the retro runs only on the
  // first import per project. No-op for in-memory stores.
  const retroEvents = collected.flatMap(({ text }, i) =>
    detectSignalsByChannel(text).map((d) => ({
      projectRoot,
      sessionId:       HISTORICAL_IMPORT_SESSION_ID,
      promptIndex:     i,
      signalKey:       d.key,
      channel:         d.channel,
      stage:           null,
      stageConfidence: null,
      source:          'historical_import' as const,
    })),
  );
  appendParamEvents(store, retroEvents);

  // Bootstrap: language detection on most recent LANG_WINDOW prompts
  const langTexts = collected.slice(0, LANG_WINDOW).map((entry) => entry.text);
  const detected  = detectLanguage(langTexts, undefined);
  if (detected) {
    setDetectedLanguage(store, projectRoot, detected);
  }

  // Bootstrap: pre-seed session state so first advisory is not cold-started.
  // capturedAt carries the transcript row's real time when it has one, and the
  // stage stamp is null — the same no-fake-stamp principle the param events above
  // follow: these prompts were never classified, and a uniform fabricated stage
  // would bias stage reads. The classifier fills real stages as live prompts arrive.
  // OLDEST-FIRST, like the live path. `SessionStateManager` maintains this array
  // by `push` + `shift`, so index 0 is the oldest and the tail is the newest —
  // and every consumer reads it that way: the mistake detectors take "recent" as
  // `slice(-n)`, and the classifier window appends the current prompt at the end.
  // Seeding it newest-first would hand imported projects their OLDEST prompts
  // wherever the code asks for the newest, and would drain the newest history
  // first as `shift` makes room — the same recency inversion the store ordering
  // above exists to kill. Take the newest MAX_HISTORY, then keep them ascending.
  const promptRecords: PromptRecord[] = chronological.slice(-MAX_HISTORY).map((entry, i) => ({
    index:           i,
    text:            entry.text,
    capturedAt:      entry.capturedAt ?? Date.now(),
    classifiedStage: null,
    confidence:      null,
  }));
  const seedsSession = !hasPersistedSession(store, projectRoot);
  SessionStateManager.bootstrapFromHistory(store, projectRoot, promptRecords, collected.length);

  const fromOtherAgents = chronological.filter((entry) => entry.agent !== CLAUDE_AGENT_ID).length;
  return {
    imported: chronological.length,
    fromOtherAgents,
    seededFromOtherAgentsOnly: seedsSession && fromOtherAgents > 0 && fromOtherAgents === chronological.length,
  };
}
