import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import {
  readPendingPromptEnhancement,
  readLatestPromptEnhancementMeta,
  defaultReadLatestPromptEnhancementMetaRow,
  type ReadPendingPromptEnhancementRowFn,
} from './pe-store-reader.js';

describe('readPendingPromptEnhancement', () => {
  const baseRow = {
    id: 42,
    project_root: '/proj',
    session_id: 'sess-1',
    prompt_count: 3,
    status: 'pending',
    created_at: 1700000000000,
    request_json: '{"prompt":"do the thing"}',
    result_json: '{"body":"do the enhanced thing"}',
  };

  it('normalises a row into a PendingPromptEnhancementRow', async () => {
    const readRow: ReadPendingPromptEnhancementRowFn = vi.fn().mockResolvedValue(baseRow);
    const out = await readPendingPromptEnhancement('/proj', { readRow, dbPath: '/db' });
    expect(out).toEqual({
      id: 42,
      projectRoot: '/proj',
      sessionId: 'sess-1',
      promptCount: 3,
      status: 'pending',
      createdAt: 1700000000000,
      requestJson: '{"prompt":"do the thing"}',
      resultJson: '{"body":"do the enhanced thing"}',
      // Null, because the fixture row predates the column — which is the
      // ordinary state for every prompt written before it existed.
      emphasisPhrasesJson: null,
    });
    expect(readRow).toHaveBeenCalledWith('/db', '/proj');
  });

  it('returns null when no row exists', async () => {
    const readRow: ReadPendingPromptEnhancementRowFn = vi.fn().mockResolvedValue(null);
    expect(await readPendingPromptEnhancement('/proj', { readRow })).toBeNull();
  });

  it('returns null when request_json is missing or empty', async () => {
    for (const bad of [undefined, null, '', 42]) {
      const readRow: ReadPendingPromptEnhancementRowFn = vi.fn().mockResolvedValue({
        ...baseRow,
        request_json: bad,
      });
      expect(await readPendingPromptEnhancement('/proj', { readRow })).toBeNull();
    }
  });

  it('returns null when result_json is missing or empty', async () => {
    for (const bad of [undefined, null, '', 42]) {
      const readRow: ReadPendingPromptEnhancementRowFn = vi.fn().mockResolvedValue({
        ...baseRow,
        result_json: bad,
      });
      expect(await readPendingPromptEnhancement('/proj', { readRow })).toBeNull();
    }
  });

  it('coerces string id/promptCount/createdAt to numbers', async () => {
    const readRow: ReadPendingPromptEnhancementRowFn = vi.fn().mockResolvedValue({
      ...baseRow,
      id: '43',
      prompt_count: '7',
      created_at: '1700000000001',
    });
    const out = await readPendingPromptEnhancement('/proj', { readRow });
    expect(out?.id).toBe(43);
    expect(out?.promptCount).toBe(7);
    expect(out?.createdAt).toBe(1700000000001);
  });

  it('never throws when the reader rejects — returns null', async () => {
    const readRow: ReadPendingPromptEnhancementRowFn = vi.fn().mockRejectedValue(new Error('db locked'));
    await expect(readPendingPromptEnhancement('/proj', { readRow })).resolves.toBeNull();
  });

  it('tolerates missing/odd field types defensively', async () => {
    const readRow: ReadPendingPromptEnhancementRowFn = vi.fn().mockResolvedValue({
      request_json: '{"a":1}',
      result_json: '{"b":2}',
      // everything else missing
    });
    const out = await readPendingPromptEnhancement('/proj', { readRow });
    expect(out).toMatchObject({
      projectRoot: '/proj', // falls back to the requested project root
      sessionId: '',
      status: '',
      id: 0,
      promptCount: 0,
      createdAt: 0,
      requestJson: '{"a":1}',
      resultJson: '{"b":2}',
    });
  });

});

/**
 * Real-DB proofs. Mirrors the capability-probe pattern from
 * `chat-history-watcher.test.ts` (P2b): `src/ext-vscode` is its own npm
 * package, so `better-sqlite3` is only installed when running from inside it
 * (`cd src/ext-vscode && npx vitest run`) — not when the root suite collects
 * this file. Skips there rather than failing for a setup reason.
 */
function canResolveModule(moduleName: string): boolean {
  try {
    createRequire(import.meta.url).resolve(moduleName);
    return true;
  } catch {
    return false;
  }
}
const canLoadBetterSqlite3 = canResolveModule('better-sqlite3');

describe.skipIf(!canLoadBetterSqlite3)('readPendingPromptEnhancement — real store file', () => {
  let tmpDirPath: string;

  beforeEach(() => {
    tmpDirPath = mkdtempSync(join(tmpdir(), 'pe-store-reader-real-'));
  });
  afterEach(() => {
    rmSync(tmpDirPath, { recursive: true, force: true });
  });

  async function createTestStore(
    fileName: string,
    opts: {
      pendingPe?: Record<string, unknown>;
      advisory?: Record<string, unknown>;
    },
  ): Promise<string> {
    const mod = (await import('better-sqlite3')) as unknown as {
      default: new (path: string) => {
        exec(sql: string): unknown;
        prepare(sql: string): { run(...args: unknown[]): unknown };
        close(): void;
      };
    };
    const Database = mod.default;
    const path = join(tmpDirPath, fileName);
    const db = new Database(path);
    db.exec(`
      CREATE TABLE pending_prompt_enhancements (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        project_root TEXT    NOT NULL,
        session_id   TEXT    NOT NULL,
        prompt_count INTEGER NOT NULL,
        status       TEXT    NOT NULL DEFAULT 'pending',
        created_at   INTEGER NOT NULL,
        request_json TEXT    NOT NULL,
        result_json  TEXT    NOT NULL
      );
      CREATE TABLE pending_advisories (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        project_root TEXT NOT NULL,
        stage        TEXT NOT NULL,
        flag_type    TEXT NOT NULL,
        pinch_label  TEXT NOT NULL,
        generated_l1 TEXT,
        generated_l2 TEXT,
        generated_l3 TEXT,
        created_at   INTEGER NOT NULL,
        status       TEXT NOT NULL DEFAULT 'pending'
      );
    `);
    if (opts.pendingPe) {
      const r = opts.pendingPe;
      db.prepare(
        `INSERT INTO pending_prompt_enhancements
           (project_root, session_id, prompt_count, status, created_at, request_json, result_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        r.project_root, r.session_id, r.prompt_count, r.status, r.created_at, r.request_json, r.result_json,
      );
    }
    if (opts.advisory) {
      const a = opts.advisory;
      db.prepare(
        `INSERT INTO pending_advisories
           (project_root, stage, flag_type, pinch_label, generated_l1, generated_l2, generated_l3, created_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        a.project_root, a.stage, a.flag_type, a.pinch_label,
        a.generated_l1 ?? null, a.generated_l2 ?? null, a.generated_l3 ?? null,
        a.created_at, a.status,
      );
    }
    db.close();
    return path;
  }

  it('reads the real pending_prompt_enhancements row end to end', async () => {
    const dbPath = await createTestStore('happy.db', {
      pendingPe: {
        project_root: '/proj', session_id: 'sess-1', prompt_count: 2, status: 'pending',
        created_at: 1700000000000, request_json: '{"prompt":"x"}', result_json: '{"body":"y"}',
      },
    });
    const out = await readPendingPromptEnhancement('/proj', { dbPath });
    expect(out).toMatchObject({
      projectRoot: '/proj',
      sessionId: 'sess-1',
      promptCount: 2,
      status: 'pending',
      requestJson: '{"prompt":"x"}',
      resultJson: '{"body":"y"}',
    });
  });

  it('never returns a DS advisory row even when one exists for the same project', async () => {
    const dbPath = await createTestStore('mixed.db', {
      pendingPe: {
        project_root: '/proj', session_id: 'sess-1', prompt_count: 1, status: 'pending',
        created_at: 1700000000000, request_json: '{"prompt":"pe"}', result_json: '{"body":"pe-body"}',
      },
      advisory: {
        project_root: '/proj', stage: 'implementation', flag_type: 'stage_transition',
        pinch_label: 'Quick check.', generated_l1: '["ds option"]',
        created_at: 1700000000500, status: 'pending',
      },
    });
    const out = await readPendingPromptEnhancement('/proj', { dbPath });
    // Only PE-shaped fields ever come back — no DS field name (stage/flagType/
    // pinchLabel/l1/l2/l3) exists on the returned object at all.
    expect(out).not.toBeNull();
    expect(out).not.toHaveProperty('stage');
    expect(out).not.toHaveProperty('flagType');
    expect(out).not.toHaveProperty('pinchLabel');
    expect(out).not.toHaveProperty('l1');
    expect(out?.requestJson).toBe('{"prompt":"pe"}');
  });

  it('ignores a pending_prompt_enhancements row whose status is already shown', async () => {
    const dbPath = await createTestStore('shown.db', {
      pendingPe: {
        project_root: '/proj', session_id: 'sess-1', prompt_count: 1, status: 'shown',
        created_at: 1700000000000, request_json: '{"prompt":"x"}', result_json: '{"body":"y"}',
      },
    });
    expect(await readPendingPromptEnhancement('/proj', { dbPath })).toBeNull();
  });

  it('returns null for a different project_root', async () => {
    const dbPath = await createTestStore('other-project.db', {
      pendingPe: {
        project_root: '/other-proj', session_id: 'sess-1', prompt_count: 1, status: 'pending',
        created_at: 1700000000000, request_json: '{"prompt":"x"}', result_json: '{"body":"y"}',
      },
    });
    expect(await readPendingPromptEnhancement('/proj', { dbPath })).toBeNull();
  });

  it('does not modify the source store file (operates on a tmp staging copy)', async () => {
    const dbPath = await createTestStore('source-untouched.db', {
      pendingPe: {
        project_root: '/proj', session_id: 'sess-1', prompt_count: 1, status: 'pending',
        created_at: 1700000000000, request_json: '{"prompt":"x"}', result_json: '{"body":"y"}',
      },
    });
    const sizeBefore = statSync(dbPath).size;
    await readPendingPromptEnhancement('/proj', { dbPath });
    await readPendingPromptEnhancement('/proj', { dbPath });
    await readPendingPromptEnhancement('/proj', { dbPath });
    const sizeAfter = statSync(dbPath).size;
    expect(sizeAfter).toBe(sizeBefore);
  });

  it('returns null when the store file does not exist', async () => {
    const missingPath = join(tmpDirPath, 'never-existed.db');
    expect(await readPendingPromptEnhancement('/proj', { dbPath: missingPath })).toBeNull();
  });
});

describe('readLatestPromptEnhancementMeta (any-status bridge signal)', () => {
  const metaRow = { project_root: '/proj', status: 'shown', created_at: 1700000000000 };

  it('normalises a SHOWN row — the whole point: the bridge needs post-popup rows', async () => {
    const readRow: ReadPendingPromptEnhancementRowFn = vi.fn().mockResolvedValue(metaRow);
    const out = await readLatestPromptEnhancementMeta('/proj', { readRow, dbPath: '/db' });
    expect(out).toEqual({ projectRoot: '/proj', createdAt: 1700000000000, status: 'shown' });
  });

  it('normalises a pending row too', async () => {
    const readRow: ReadPendingPromptEnhancementRowFn = vi
      .fn()
      .mockResolvedValue({ ...metaRow, status: 'pending' });
    const out = await readLatestPromptEnhancementMeta('/proj', { readRow, dbPath: '/db' });
    expect(out?.status).toBe('pending');
  });

  it('coerces a string created_at; garbage becomes 0 (stale, never fresh)', async () => {
    const asString: ReadPendingPromptEnhancementRowFn = vi
      .fn()
      .mockResolvedValue({ ...metaRow, created_at: '1700000000001' });
    expect((await readLatestPromptEnhancementMeta('/proj', { readRow: asString, dbPath: '/db' }))?.createdAt)
      .toBe(1700000000001);
    const garbage: ReadPendingPromptEnhancementRowFn = vi
      .fn()
      .mockResolvedValue({ ...metaRow, created_at: 'not-a-number' });
    expect((await readLatestPromptEnhancementMeta('/proj', { readRow: garbage, dbPath: '/db' }))?.createdAt)
      .toBe(0);
  });

  it('returns null on no row and on a throwing reader', async () => {
    const noRow: ReadPendingPromptEnhancementRowFn = vi.fn().mockResolvedValue(null);
    expect(await readLatestPromptEnhancementMeta('/proj', { readRow: noRow, dbPath: '/db' })).toBeNull();
    const boom: ReadPendingPromptEnhancementRowFn = vi.fn().mockRejectedValue(new Error('boom'));
    expect(await readLatestPromptEnhancementMeta('/proj', { readRow: boom, dbPath: '/db' })).toBeNull();
  });

  it('⭐ default SQL reads ANY status — no pending filter (a filtered read goes blind at selection time)', () => {
    const sql = defaultReadLatestPromptEnhancementMetaRow.toString();
    expect(sql).toContain('pending_prompt_enhancements');
    expect(sql).not.toContain("status = 'pending'");
  });

  it('default SQL still scopes by project_root and orders newest-first', () => {
    const sql = defaultReadLatestPromptEnhancementMetaRow.toString();
    expect(sql).toContain('project_root = ?');
    expect(sql).toContain('ORDER BY created_at DESC');
  });
});
