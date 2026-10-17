import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DEVIN_AGENT_ID,
  defaultDevinStorePaths,
  devinTimeToMillis,
  loadNodeSqlite,
  readDevinLocalHistory,
} from './devin-local-store.js';

const PROJECT_ROOT = join(tmpdir(), 'devin-project');
const OTHER_ROOT = join(tmpdir(), 'devin-other-project');

// Loaded once, up front: the store-backed suite below needs it to build its fixtures, and is
// reported as skipped — not silently passed — on a Node without node:sqlite.
const sqlite = await loadNodeSqlite();

interface WritableDb {
  exec(sql: string): void;
  prepare(sql: string): { run(...params: unknown[]): void };
  close(): void;
}
function openWritable(path: string): WritableDb {
  return new (sqlite as unknown as { DatabaseSync: new (p: string) => WritableDb }).DatabaseSync(path);
}

interface FixtureNode {
  session: string;
  role: string;
  id?: string;
  text: string;
  at: number;
  metadata?: Record<string, unknown>;
}

/** A store laid out like Devin Local's (WAL mode). Returns the open writer when `keepOpen`. */
function createStore(
  path: string,
  sessions: Array<{ id: string; dir: string; hidden?: number }>,
  nodes: FixtureNode[],
  keepOpen = false,
): WritableDb | null {
  const db = openWritable(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('CREATE TABLE sessions (id TEXT, working_directory TEXT, hidden INTEGER, title TEXT)');
  db.exec(
    'CREATE TABLE message_nodes (row_id INTEGER PRIMARY KEY, session_id TEXT, node_id TEXT, parent_node_id TEXT, chat_message TEXT, created_at INTEGER, metadata TEXT)',
  );
  const addSession = db.prepare('INSERT INTO sessions (id, working_directory, hidden, title) VALUES (?, ?, ?, ?)');
  for (const s of sessions) addSession.run(s.id, s.dir, s.hidden ?? 0, 't');
  const addNode = db.prepare(
    'INSERT INTO message_nodes (session_id, node_id, parent_node_id, chat_message, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?)',
  );
  nodes.forEach((n, i) => {
    const message = { message_id: n.id, role: n.role, content: n.text, metadata: {} };
    addNode.run(n.session, `n${i}`, null, JSON.stringify(message), n.at, JSON.stringify(n.metadata ?? {}));
  });
  if (keepOpen) return db;
  db.close();
  return null;
}

function sha(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('devinTimeToMillis', () => {
  it('reads seconds, milliseconds and ISO strings', () => {
    expect(devinTimeToMillis(1790666931)).toBe(1790666931000);
    expect(devinTimeToMillis(1790666931000)).toBe(1790666931000);
    expect(devinTimeToMillis('1790666931')).toBe(1790666931000);
    expect(devinTimeToMillis('2026-09-29T07:28:51Z')).toBe(Date.UTC(2026, 8, 29, 7, 28, 51));
  });
  it('rejects empty, non-positive and non-time values', () => {
    expect(devinTimeToMillis(null)).toBeUndefined();
    expect(devinTimeToMillis('')).toBeUndefined();
    expect(devinTimeToMillis(-5)).toBeUndefined();
    expect(devinTimeToMillis('not a time')).toBeUndefined();
  });
});

describe('defaultDevinStorePaths', () => {
  it('uses both Windows channels under APPDATA', () => {
    expect(defaultDevinStorePaths({ APPDATA: 'X' }, 'win32')).toEqual([
      join('X', 'devin', 'cli', 'sessions.db'),
      join('X', 'devin', 'cli-next', 'sessions.db'),
    ]);
  });
  it('has no default elsewhere, and NEXPATH_DEVIN_STORE overrides everything', () => {
    expect(defaultDevinStorePaths({}, 'darwin')).toEqual([]);
    expect(defaultDevinStorePaths({ NEXPATH_DEVIN_STORE: '/a/sessions.db', APPDATA: 'X' }, 'win32')).toEqual(['/a/sessions.db']);
  });
});

describe('readDevinLocalHistory — before any store is opened', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexpath-devin-early-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reports runtime_unsupported when node:sqlite cannot be loaded', async () => {
    const store = join(dir, 'sessions.db');
    writeFileSync(store, 'any file');
    const result = await readDevinLocalHistory(PROJECT_ROOT, { storePaths: [store], loadSqlite: async () => null });
    expect(result).toEqual({ entries: [], skipped: 'runtime_unsupported' });
  });

  it('reports not_found when no store exists — and never asks for node:sqlite', async () => {
    let asked = false;
    const result = await readDevinLocalHistory(PROJECT_ROOT, {
      storePaths: [join(dir, 'missing.db')],
      loadSqlite: async () => {
        asked = true;
        return null;
      },
    });
    expect(result).toEqual({ entries: [], skipped: 'not_found' });
    expect(asked).toBe(false);
  });
});

describe.skipIf(!sqlite)('readDevinLocalHistory — against a store laid out like Devin Local', () => {
  let dir: string;
  let store: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexpath-devin-history-'));
    store = join(dir, 'sessions.db');
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads the project's sessions only, each prompt once, with its time in milliseconds", async () => {
    createStore(
      store,
      [
        { id: 's1', dir: PROJECT_ROOT },
        { id: 's2', dir: PROJECT_ROOT + (process.platform === 'win32' ? '\\' : '/') },
        { id: 's3', dir: OTHER_ROOT },
      ],
      [
        { session: 's1', role: 'system', text: 'system prompt', at: 1790666900 },
        { session: 's1', role: 'user', id: 'm1', text: 'what is ai', at: 1790666931 },
        { session: 's1', role: 'assistant', id: 'a1', text: 'an answer', at: 1790666932 },
        { session: 's1', role: 'user', id: 'm1', text: 'what is ai', at: 1790666990, metadata: { summarized_from: 'n1' } },
        { session: 's1', role: 'user', id: 'm2', text: 'what is memory', at: 1790666960 },
        { session: 's2', role: 'user', id: 'm3', text: 'third', at: 1790666965 },
        { session: 's3', role: 'user', id: 'm9', text: 'other project', at: 1790666970 },
      ],
    );
    const result = await readDevinLocalHistory(PROJECT_ROOT, { storePaths: [store] });
    const got = result.entries
      .map((e) => [e.text, e.capturedAt, e.agent, e.rowId] as const)
      .sort((a, b) => Number(a[1]) - Number(b[1]));
    expect(got).toEqual([
      ['what is ai', 1790666931000, DEVIN_AGENT_ID, 'm1'],
      ['what is memory', 1790666960000, DEVIN_AGENT_ID, 'm2'],
      ['third', 1790666965000, DEVIN_AGENT_ID, 'm3'],
    ]);
  });

  it('skips hidden sessions and rows marked as a system prefix', async () => {
    createStore(
      store,
      [
        { id: 's1', dir: PROJECT_ROOT },
        { id: 's2', dir: PROJECT_ROOT, hidden: 1 },
      ],
      [
        { session: 's1', role: 'user', id: 'm1', text: 'kept', at: 1790666931 },
        { session: 's1', role: 'user', id: 'm2', text: 'injected', at: 1790666932, metadata: { is_system_prefix: true } },
        { session: 's2', role: 'user', id: 'm3', text: 'hidden session', at: 1790666933 },
      ],
    );
    const result = await readDevinLocalHistory(PROJECT_ROOT, { storePaths: [store] });
    expect(result.entries.map((e) => e.text)).toEqual(['kept']);
    expect(result.unusableRows).toBe(1);
  });

  it('merges the stable and the next channel stores', async () => {
    const next = join(dir, 'next.db');
    createStore(store, [{ id: 's1', dir: PROJECT_ROOT }], [{ session: 's1', role: 'user', id: 'm1', text: 'stable', at: 1790666931 }]);
    createStore(next, [{ id: 't1', dir: PROJECT_ROOT }], [{ session: 't1', role: 'user', id: 'n1', text: 'next', at: 1790666932 }]);
    const result = await readDevinLocalHistory(PROJECT_ROOT, { storePaths: [store, next] });
    expect(result.entries.map((e) => e.text).sort()).toEqual(['next', 'stable']);
  });

  it('reads rows still in the write-ahead log while another connection holds the store open, and never writes to it', async () => {
    const writer = createStore(store, [{ id: 's1', dir: PROJECT_ROOT }], [{ session: 's1', role: 'user', id: 'm1', text: 'live row', at: 1790666931 }], true);
    try {
      expect(existsSync(store + '-wal')).toBe(true);
      const before = sha(store);
      const result = await readDevinLocalHistory(PROJECT_ROOT, { storePaths: [store] });
      expect(result.entries.map((e) => e.text)).toEqual(['live row']);
      expect(sha(store)).toBe(before);
    } finally {
      writer?.close();
    }
  });

  it('reports unexpected_shape for a store without the expected tables and columns', async () => {
    const db = openWritable(store);
    db.exec('CREATE TABLE sessions (id TEXT)');
    db.exec('CREATE TABLE message_nodes (id TEXT)');
    db.close();
    expect(await readDevinLocalHistory(PROJECT_ROOT, { storePaths: [store] })).toEqual({
      entries: [],
      skipped: 'unexpected_shape',
      unusableRows: 0,
    });
  });

  it('reports unreadable for a file that is not a database, without throwing', async () => {
    writeFileSync(store, 'not a database');
    const result = await readDevinLocalHistory(PROJECT_ROOT, { storePaths: [store] });
    expect(result.entries).toEqual([]);
    expect(result.skipped).toBe('unreadable');
  });

  it('control: a store whose sessions are all elsewhere returns nothing, marked not_found', async () => {
    createStore(store, [{ id: 's1', dir: OTHER_ROOT }], [{ session: 's1', role: 'user', id: 'm1', text: 'elsewhere', at: 1790666931 }]);
    expect(await readDevinLocalHistory(PROJECT_ROOT, { storePaths: [store] })).toEqual({
      entries: [],
      skipped: 'not_found',
      unusableRows: 0,
    });
  });
});
