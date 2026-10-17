import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from './db.js';
import type { Store } from './db.js';
import { getRecentPrompts, insertPrompt } from './prompts.js';
import { upsertProject } from './projects.js';
import { importHistoricalPrompts } from './historical-import.js';
import { readParamEvents } from '../telemetry/param-events.js';
import type { HistoryEntry, HistorySourceResult } from './history-sources/types.js';

// Editor history (Cursor, Devin Local) joining the Claude Code import. The readers themselves are
// tested beside their own files; here they are injected, so nothing on this machine is read.

const PROJECT_ROOT = '/test/hist-sources-project';
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 5, 1, 12, 0);

function claudeLine(content: string, iso: string, uuid?: string): string {
  return JSON.stringify({ type: 'user', message: { content }, timestamp: iso, ...(uuid ? { uuid } : {}) });
}
function writeClaudeFile(claudeDir: string, name: string, lines: string[], mtime?: Date): void {
  const dir = join(claudeDir, 'projects', PROJECT_ROOT.replace(/[^a-zA-Z0-9]/g, '-'));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  if (mtime) utimesSync(file, mtime, mtime);
}
function entry(text: string, agent: string, at: number, rowId?: string): HistoryEntry {
  return { text, agent, capturedAt: at, orderHint: at, ...(rowId ? { rowId } : {}) };
}
const result = (entries: HistoryEntry[]): HistorySourceResult => ({ entries });

function storedRows(store: Store): Array<{ text: string; agent: string; at: number }> {
  const res = store.db.exec('SELECT prompt_text, agent, captured_at FROM prompts WHERE project_root = ? ORDER BY id', [PROJECT_ROOT]);
  return (res[0]?.values ?? []).map((r) => ({ text: String(r[0]), agent: String(r[1]), at: Number(r[2]) }));
}

describe('importHistoricalPrompts — Cursor and Devin Local history', () => {
  let store: Store;
  let dbDir: string;
  let claudeDir: string;
  let origEnv: string | undefined;

  beforeEach(async () => {
    dbDir = mkdtempSync(join(tmpdir(), 'nexpath-hist-src-db-'));
    store = await openStore(join(dbDir, 'prompt-store.db')); // disk store → param-events are written
    claudeDir = mkdtempSync(join(tmpdir(), 'nexpath-hist-src-claude-'));
    origEnv = process.env['CLAUDE_CONFIG_DIR'];
    process.env['CLAUDE_CONFIG_DIR'] = claudeDir;
    upsertProject(store, { projectRoot: PROJECT_ROOT, name: 'hist-sources' });
  });

  afterEach(() => {
    store.db.close();
    rmSync(dbDir, { recursive: true, force: true });
    rmSync(claudeDir, { recursive: true, force: true });
    if (origEnv === undefined) delete process.env['CLAUDE_CONFIG_DIR'];
    else process.env['CLAUDE_CONFIG_DIR'] = origEnv;
  });

  it('without consent the editor readers are never called, and Claude history imports exactly as before', async () => {
    writeClaudeFile(claudeDir, 's1.jsonl', [claudeLine('claude one', '2026-06-01T10:00:00Z'), claudeLine('claude two', '2026-06-01T11:00:00Z')]);
    const readCursor = vi.fn(() => result([entry('cursor one', 'cursor', T0)]));
    const readDevin = vi.fn(async () => result([entry('devin one', 'devin', T0)]));

    const summary = await importHistoricalPrompts(store, PROJECT_ROOT, { readCursor, readDevin });

    expect(readCursor).not.toHaveBeenCalled();
    expect(readDevin).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ imported: 2, fromOtherAgents: 0 });
    expect(storedRows(store).map((r) => [r.text, r.agent])).toEqual([['claude one', 'claude-code'], ['claude two', 'claude-code']]);
  });

  it('consent for one editor reads only that editor', async () => {
    const readCursor = vi.fn(() => result([entry('cursor one', 'cursor', T0)]));
    const readDevin = vi.fn(async () => result([entry('devin one', 'devin', T0)]));
    await importHistoricalPrompts(store, PROJECT_ROOT, { otherAgentConsent: { devin: true }, readCursor, readDevin });
    expect(readCursor).not.toHaveBeenCalled();
    expect(readDevin).toHaveBeenCalledTimes(1);
  });

  it('imports a project that has editor history but no Claude Code history', async () => {
    const summary = await importHistoricalPrompts(store, PROJECT_ROOT, {
      otherAgentConsent: { cursor: true },
      readCursor: () => result([entry('cursor first', 'cursor', T0), entry('cursor second', 'cursor', T0 + 1000)]),
    });
    expect(summary).toMatchObject({ imported: 2, fromOtherAgents: 2 });
    expect(storedRows(store).map((r) => [r.text, r.agent, r.at])).toEqual([
      ['cursor first', 'cursor', T0],
      ['cursor second', 'cursor', T0 + 1000],
    ]);
  });

  it('merges every source by time in one pass: row ids follow time across agents', async () => {
    writeClaudeFile(claudeDir, 's1.jsonl', [claudeLine('claude early', new Date(T0 + 1 * DAY).toISOString()), claudeLine('claude late', new Date(T0 + 4 * DAY).toISOString())]);
    await importHistoricalPrompts(store, PROJECT_ROOT, {
      otherAgentConsent: { cursor: true, devin: true },
      readCursor: () => result([entry('cursor mid', 'cursor', T0 + 2 * DAY)]),
      readDevin: async () => result([entry('devin first', 'devin', T0), entry('devin after', 'devin', T0 + 3 * DAY)]),
    });
    const rows = storedRows(store);
    expect(rows.map((r) => r.text)).toEqual(['devin first', 'claude early', 'cursor mid', 'devin after', 'claude late']);
    expect(rows.map((r) => r.at)).toEqual([...rows.map((r) => r.at)].sort((a, b) => a - b));
    // the store's recency read sees the genuinely newest prompt first
    expect(getRecentPrompts(store, PROJECT_ROOT, 1)[0]!.text).toBe('claude late');
  });

  it('writes retro events with one historical session and a unique prompt key per imported prompt', async () => {
    writeClaudeFile(claudeDir, 's1.jsonl', [claudeLine('add unit tests for the parser', new Date(T0 + DAY).toISOString())]);
    await importHistoricalPrompts(store, PROJECT_ROOT, {
      otherAgentConsent: { cursor: true },
      readCursor: () => result([entry('write tests for the login flow', 'cursor', T0)]),
    });
    const events = readParamEvents(store, PROJECT_ROOT);
    expect(events.length).toBeGreaterThan(0);
    expect(new Set(events.map((e) => e.sessionId))).toEqual(new Set(['historical-import']));
    expect(events.every((e) => e.source === 'historical_import' && e.stage === null)).toBe(true);
    const promptsWithEvents = new Set(events.map((e) => e.promptIndex));
    expect(promptsWithEvents.size).toBe(2); // two different prompts → two different keys, never collapsed
  });

  it('keeps only the newest 500 across all sources', async () => {
    const cursor = Array.from({ length: 300 }, (_, i) => entry(`cursor ${i}`, 'cursor', T0 + i * 1000));
    const devin = Array.from({ length: 300 }, (_, i) => entry(`devin ${i}`, 'devin', T0 + i * 1000 + 500));
    const summary = await importHistoricalPrompts(store, PROJECT_ROOT, {
      otherAgentConsent: { cursor: true, devin: true },
      readCursor: () => result(cursor),
      readDevin: async () => result(devin),
    });
    expect(summary.imported).toBe(500);
    const rows = storedRows(store);
    expect(rows).toHaveLength(500);
    expect(rows[0]!.text).toBe('cursor 50'); // the 100 oldest of 600 are the ones left out
    expect(rows[rows.length - 1]!.text).toBe('devin 299');
  });

  it('does not import the live prompt when an editor already wrote it into its history', async () => {
    const now = T0 + 10 * DAY;
    await importHistoricalPrompts(store, PROJECT_ROOT, {
      otherAgentConsent: { devin: true },
      livePrompt: 'what is memory',
      now,
      readDevin: async () => result([entry('what is ai', 'devin', now - 60_000), entry('what is memory', 'devin', now - 2_000)]),
    });
    expect(storedRows(store).map((r) => r.text)).toEqual(['what is ai']);
  });

  it('a failing source costs only its own rows', async () => {
    const summary = await importHistoricalPrompts(store, PROJECT_ROOT, {
      otherAgentConsent: { cursor: true, devin: true },
      readCursor: () => { throw new Error('transcript folder vanished'); },
      readDevin: async () => result([entry('devin kept', 'devin', T0)]),
    });
    expect(summary).toMatchObject({ imported: 1, fromOtherAgents: 1 });
    expect(storedRows(store).map((r) => r.text)).toEqual(['devin kept']);
  });

  it('runs once per project: a second call imports nothing', async () => {
    const options = { otherAgentConsent: { cursor: true }, readCursor: () => result([entry('cursor one', 'cursor', T0)]) };
    await importHistoricalPrompts(store, PROJECT_ROOT, options);
    const second = await importHistoricalPrompts(store, PROJECT_ROOT, options);
    expect(second).toMatchObject({ imported: 0, fromOtherAgents: 0 });
    expect(storedRows(store)).toHaveLength(1);
  });

  it('pinned edge, same as Claude: one earlier prompt means editor history is never imported', async () => {
    insertPrompt(store, { projectRoot: PROJECT_ROOT, promptText: 'early live prompt', agent: 'claude-code' });
    const readCursor = vi.fn(() => result([entry('cursor one', 'cursor', T0)]));
    const summary = await importHistoricalPrompts(store, PROJECT_ROOT, { otherAgentConsent: { cursor: true }, readCursor });
    expect(summary.imported).toBe(0);
    expect(readCursor).not.toHaveBeenCalled();
    expect(storedRows(store).map((r) => r.text)).toEqual(['early live prompt']);
  });

  it('never reads the consent answer once the project has prompts, so later prompts do nothing extra', async () => {
    insertPrompt(store, { projectRoot: PROJECT_ROOT, promptText: 'early live prompt', agent: 'claude-code' });
    const consent = vi.fn(() => ({ cursor: true, devin: true }));
    const readCursor = vi.fn(() => result([entry('cursor one', 'cursor', T0)]));
    await importHistoricalPrompts(store, PROJECT_ROOT, { otherAgentConsent: consent, readCursor });
    expect(consent).not.toHaveBeenCalled();
    expect(readCursor).not.toHaveBeenCalled();
  });

  it('reads a consent answer given as a function once, when the import runs', async () => {
    const consent = vi.fn(() => ({ cursor: true }));
    const summary = await importHistoricalPrompts(store, PROJECT_ROOT, {
      otherAgentConsent: consent,
      readCursor: () => result([entry('cursor one', 'cursor', T0)]),
    });
    expect(consent).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ imported: 1, fromOtherAgents: 1 });
  });

  it('a consent answer that cannot be read means no editor history, and Claude history still imports', async () => {
    writeClaudeFile(claudeDir, 's1.jsonl', [claudeLine('claude one', '2026-06-01T10:00:00Z')]);
    const readCursor = vi.fn(() => result([entry('cursor one', 'cursor', T0)]));
    const summary = await importHistoricalPrompts(store, PROJECT_ROOT, {
      otherAgentConsent: () => { throw new Error('heartbeat unreadable'); },
      readCursor,
    });
    expect(readCursor).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ imported: 1, fromOtherAgents: 0 });
    expect(storedRows(store).map((r) => r.text)).toEqual(['claude one']);
  });

  it('bootstraps the session from the merged history, oldest first, with the full count', async () => {
    const { SessionStateManager } = await import('../classifier/SessionStateManager.js');
    await importHistoricalPrompts(store, PROJECT_ROOT, {
      otherAgentConsent: { cursor: true, devin: true },
      readCursor: () => result([entry('cursor b', 'cursor', T0 + 2000)]),
      readDevin: async () => result([entry('devin a', 'devin', T0 + 1000)]),
    });
    const state = SessionStateManager.load(store, PROJECT_ROOT).current;
    expect(state.promptCount).toBe(2);
    expect(state.promptHistory.map((p) => p.text)).toEqual(['devin a', 'cursor b']);
  });
});

describe('importHistoricalPrompts — Claude rows copied between session files (resumed sessions)', () => {
  let store: Store;
  let claudeDir: string;
  let origEnv: string | undefined;

  beforeEach(async () => {
    store = await openStore(':memory:');
    claudeDir = mkdtempSync(join(tmpdir(), 'nexpath-hist-copies-'));
    origEnv = process.env['CLAUDE_CONFIG_DIR'];
    process.env['CLAUDE_CONFIG_DIR'] = claudeDir;
    upsertProject(store, { projectRoot: PROJECT_ROOT, name: 'hist-copies' });
  });

  afterEach(() => {
    store.db.close();
    rmSync(claudeDir, { recursive: true, force: true });
    if (origEnv === undefined) delete process.env['CLAUDE_CONFIG_DIR'];
    else process.env['CLAUDE_CONFIG_DIR'] = origEnv;
  });

  it('imports a copied row once, keeps rows without an id, and keeps a genuine repeat with its own id', async () => {
    writeClaudeFile(claudeDir, 'older.jsonl', [
      claudeLine('first prompt', '2026-06-01T10:00:00Z', 'u-1'),
      claudeLine('second prompt', '2026-06-01T10:05:00Z', 'u-2'),
    ], new Date(Date.UTC(2026, 5, 1, 11)));
    writeClaudeFile(claudeDir, 'resumed.jsonl', [
      claudeLine('first prompt', '2026-06-01T10:00:00Z', 'u-1'), // copy carried into the resumed session
      claudeLine('second prompt', '2026-06-01T10:05:00Z', 'u-2'), // copy
      claudeLine('second prompt', '2026-06-02T09:00:00Z', 'u-3'), // the user typed it again — a real prompt
      JSON.stringify({ type: 'user', message: { content: 'no id row' }, timestamp: '2026-06-02T09:30:00Z' }),
    ], new Date(Date.UTC(2026, 5, 2, 10)));

    const summary = await importHistoricalPrompts(store, PROJECT_ROOT);

    expect(summary).toEqual({ imported: 4, fromOtherAgents: 0, seededFromOtherAgentsOnly: false });
    const texts = getRecentPrompts(store, PROJECT_ROOT, 10).map((r) => r.text).reverse();
    expect(texts).toEqual(['first prompt', 'second prompt', 'second prompt', 'no id row']);
  });
});

describe('importHistoricalPrompts — did this import create the session from editor history alone?', () => {
  let store: Store;
  let claudeDir: string;
  let origEnv: string | undefined;

  beforeEach(async () => {
    store = await openStore(':memory:');
    claudeDir = mkdtempSync(join(tmpdir(), 'nexpath-hist-seeded-'));
    origEnv = process.env['CLAUDE_CONFIG_DIR'];
    process.env['CLAUDE_CONFIG_DIR'] = claudeDir;
    upsertProject(store, { projectRoot: PROJECT_ROOT, name: 'hist-seeded' });
  });

  afterEach(() => {
    store.db.close();
    rmSync(claudeDir, { recursive: true, force: true });
    if (origEnv === undefined) delete process.env['CLAUDE_CONFIG_DIR'];
    else process.env['CLAUDE_CONFIG_DIR'] = origEnv;
  });

  it('yes: Cursor or Devin Local history alone, into a project with no session yet', async () => {
    const summary = await importHistoricalPrompts(store, PROJECT_ROOT, {
      otherAgentConsent: { cursor: true, devin: true },
      readCursor: () => result([entry('cursor one', 'cursor', T0)]),
      readDevin: async () => result([entry('devin one', 'devin', T0 + 1000)]),
    });
    expect(summary).toEqual({ imported: 2, fromOtherAgents: 2, seededFromOtherAgentsOnly: true });
  });

  it('no: the import also held Claude Code history (that session was seeded before the editor sources existed)', async () => {
    writeClaudeFile(claudeDir, 's1.jsonl', [claudeLine('claude one', '2026-06-01T10:00:00Z')]);
    const summary = await importHistoricalPrompts(store, PROJECT_ROOT, {
      otherAgentConsent: { cursor: true },
      readCursor: () => result([entry('cursor one', 'cursor', T0)]),
    });
    expect(summary).toEqual({ imported: 2, fromOtherAgents: 1, seededFromOtherAgentsOnly: false });
  });

  it('no: Claude Code history only', async () => {
    writeClaudeFile(claudeDir, 's1.jsonl', [claudeLine('claude one', '2026-06-01T10:00:00Z')]);
    const summary = await importHistoricalPrompts(store, PROJECT_ROOT);
    expect(summary).toEqual({ imported: 1, fromOtherAgents: 0, seededFromOtherAgentsOnly: false });
  });

  it('no: a session was already persisted (prompts deleted, session kept), so the import seeds nothing', async () => {
    const { SessionStateManager } = await import('../classifier/SessionStateManager.js');
    SessionStateManager.bootstrapFromHistory(store, PROJECT_ROOT, [], 3);
    const before = store.db.exec('SELECT state_json FROM session_states WHERE project_root = ?', [PROJECT_ROOT])[0]?.values[0]?.[0];
    const summary = await importHistoricalPrompts(store, PROJECT_ROOT, {
      otherAgentConsent: { cursor: true },
      readCursor: () => result([entry('cursor one', 'cursor', T0)]),
    });
    expect(summary).toEqual({ imported: 1, fromOtherAgents: 1, seededFromOtherAgentsOnly: false });
    const after = store.db.exec('SELECT state_json FROM session_states WHERE project_root = ?', [PROJECT_ROOT])[0]?.values[0]?.[0];
    expect(after).toBe(before);
  });

  it('no: nothing was imported', async () => {
    const summary = await importHistoricalPrompts(store, PROJECT_ROOT, { otherAgentConsent: { cursor: true }, readCursor: () => result([]) });
    expect(summary).toEqual({ imported: 0, fromOtherAgents: 0, seededFromOtherAgentsOnly: false });
  });
});
