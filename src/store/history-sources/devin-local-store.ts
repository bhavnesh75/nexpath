/**
 * Devin Local's session store as a history source.
 *
 * Devin Desktop's local agent keeps its sessions in a SQLite file (write-ahead-log mode): a
 * `sessions` table with each session's `working_directory`, and a `message_nodes` table whose
 * `chat_message` JSON carries `{message_id, role, content}`. A conversation is stored as a tree,
 * so one prompt can appear in several nodes; they share a `message_id` and are taken once, with
 * the earliest time. `created_at` is in seconds.
 *
 * The store is opened read-only with Node's built-in `node:sqlite`, which reads rows still held
 * in the write-ahead log while Devin has the file open. On a Node without that module the source
 * reports `runtime_unsupported` and returns nothing. Nothing is ever written to the store.
 *
 * Only sessions whose working directory is exactly the project are read; hidden sessions are
 * skipped. Rows the store marks as a system prefix are not prompts and are skipped.
 */
import { existsSync, statSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import type { HistoryEntry, HistorySourceResult } from './types.js';

export const DEVIN_AGENT_ID = 'devin';

/** The part of `node:sqlite` this reader uses — typed here because the project's Node typings predate it. */
interface SqliteStatement {
  all(...params: unknown[]): unknown[];
}
interface SqliteDatabase {
  prepare(sql: string): SqliteStatement;
  exec(sql: string): void;
  close(): void;
}
export interface SqliteModule {
  DatabaseSync: new (path: string, options?: { readOnly?: boolean }) => SqliteDatabase;
}

const EXPERIMENTAL_SQLITE_WARNING = /SQLite is an experimental feature/;

/**
 * Loads `node:sqlite`, or returns null when this Node has no such module. While loading, only
 * the module's own "experimental feature" warning is kept off stderr — a hook's output is seen
 * by the user's agent, and that warning says nothing useful there. Every other warning passes.
 */
export async function loadNodeSqlite(): Promise<SqliteModule | null> {
  const specifier = 'node:sqlite';
  const original = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
    const text = typeof warning === 'string' ? warning : warning?.message;
    if (text && EXPERIMENTAL_SQLITE_WARNING.test(text)) return;
    return (original as (...args: unknown[]) => void).call(process, warning, ...rest);
  }) as typeof process.emitWarning;
  try {
    return (await import(specifier)) as SqliteModule;
  } catch {
    return null;
  } finally {
    process.emitWarning = original;
  }
}

/**
 * Where Devin Local keeps its sessions. `NEXPATH_DEVIN_STORE` (one or more paths, separated by the
 * platform's path delimiter) overrides it. On Windows: the stable and the next channel's store
 * under `%APPDATA%\devin`. Other platforms have no default until their location is confirmed.
 */
export function defaultDevinStorePaths(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  const override = env['NEXPATH_DEVIN_STORE'];
  if (override) return override.split(delimiter).map((p) => p.trim()).filter(Boolean);
  const appData = env['APPDATA'];
  if (platform === 'win32' && appData) {
    return ['cli', 'cli-next'].map((channel) => join(appData, 'devin', channel, 'sessions.db'));
  }
  return [];
}

function sameFolder(a: string, b: string, platform: NodeJS.Platform): boolean {
  const normalise = (p: string): string => {
    const resolved = resolve(p).replace(/[\\/]+$/, '');
    return platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return normalise(a) === normalise(b);
}

/** Store times are seconds; numbers already in milliseconds and ISO date strings are accepted too. */
export function devinTimeToMillis(value: unknown): number | undefined {
  let numeric: number;
  if (typeof value === 'number') {
    numeric = value;
  } else if (typeof value === 'string' && value.trim() !== '') {
    numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }
  } else {
    return undefined;
  }
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return numeric > 1e12 ? numeric : numeric * 1000;
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

/** A user message's text and id, or null for any other row. */
function parseUserMessage(raw: unknown): { text: string; messageId?: string } | null {
  if (typeof raw !== 'string') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const message = parsed as { role?: unknown; message_id?: unknown; content?: unknown };
  if (message.role !== 'user') return null;
  const messageId = typeof message.message_id === 'string' && message.message_id ? message.message_id : undefined;
  return { text: contentText(message.content).trim(), messageId };
}

function isSystemPrefix(metadata: unknown): boolean {
  if (typeof metadata !== 'string' || !metadata.trim().startsWith('{')) return false;
  try {
    return (JSON.parse(metadata) as { is_system_prefix?: unknown }).is_system_prefix === true;
  } catch {
    return false;
  }
}

function columnNames(db: SqliteDatabase, table: 'sessions' | 'message_nodes'): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: unknown }>;
  return new Set(rows.map((row) => String(row.name)));
}

export interface DevinHistoryOptions {
  /** Store files to read; defaults to `defaultDevinStorePaths()`. */
  storePaths?: string[];
  /** Loads `node:sqlite`; injectable for tests. */
  loadSqlite?: () => Promise<SqliteModule | null>;
  /** Platform rules for comparing folders; defaults to this machine's. */
  platform?: NodeJS.Platform;
}

/** Every prompt of the project's Devin Local sessions. Read-only; never throws. */
export async function readDevinLocalHistory(
  projectRoot: string,
  options: DevinHistoryOptions = {},
): Promise<HistorySourceResult> {
  const platform = options.platform ?? process.platform;
  const stores = (options.storePaths ?? defaultDevinStorePaths(process.env, platform)).filter((p) => existsSync(p));
  if (stores.length === 0) return { entries: [], skipped: 'not_found' };

  const sqlite = await (options.loadSqlite ?? loadNodeSqlite)().catch(() => null);
  if (!sqlite) return { entries: [], skipped: 'runtime_unsupported' };

  const byMessage = new Map<string, HistoryEntry>();
  let unusableRows = 0;
  let unreadableStores = 0;
  let unexpectedStores = 0;

  for (const store of stores) {
    let db: SqliteDatabase | undefined;
    try {
      const storeModified = statSync(store).mtimeMs;
      db = new sqlite.DatabaseSync(store, { readOnly: true });
      db.exec('PRAGMA busy_timeout = 2000');
      const sessionColumns = columnNames(db, 'sessions');
      const nodeColumns = columnNames(db, 'message_nodes');
      const understood =
        ['id', 'working_directory'].every((c) => sessionColumns.has(c)) &&
        ['session_id', 'chat_message', 'created_at'].every((c) => nodeColumns.has(c));
      if (!understood) {
        unexpectedStores++;
        continue;
      }
      const hasHidden = sessionColumns.has('hidden');
      const hasMetadata = nodeColumns.has('metadata');
      const sessions = db
        .prepare(`SELECT id, working_directory${hasHidden ? ', hidden' : ''} FROM sessions`)
        .all() as Array<{ id: unknown; working_directory: unknown; hidden?: unknown }>;
      const projectSessions = sessions.filter(
        (s) =>
          typeof s.working_directory === 'string' &&
          sameFolder(s.working_directory, projectRoot, platform) &&
          !(hasHidden && Number(s.hidden ?? 0) !== 0),
      );
      const nodes = db.prepare(
        `SELECT chat_message, created_at${hasMetadata ? ', metadata' : ''} FROM message_nodes WHERE session_id = ?`,
      );
      for (const session of projectSessions) {
        const sessionId = String(session.id);
        for (const row of nodes.all(sessionId) as Array<{ chat_message: unknown; created_at: unknown; metadata?: unknown }>) {
          const message = parseUserMessage(row.chat_message);
          if (!message) continue;
          if (!message.text || isSystemPrefix(row.metadata)) {
            unusableRows++;
            continue;
          }
          const at = devinTimeToMillis(row.created_at);
          const key = message.messageId ?? `${sessionId}\u0000${message.text}`;
          const previous = byMessage.get(key);
          const earlier = at !== undefined && (previous?.capturedAt === undefined || at < previous.capturedAt);
          if (!previous || earlier) {
            byMessage.set(key, {
              text: message.text,
              capturedAt: at,
              orderHint: at ?? storeModified,
              agent: DEVIN_AGENT_ID,
              rowId: message.messageId,
            });
          }
        }
      }
    } catch {
      unreadableStores++;
    } finally {
      try {
        db?.close();
      } catch {
        /* closing a read-only handle cannot lose data */
      }
    }
  }

  const entries = [...byMessage.values()];
  if (entries.length > 0) return { entries, unusableRows };
  if (unreadableStores > 0) return { entries, skipped: 'unreadable', unusableRows };
  if (unexpectedStores > 0) return { entries, skipped: 'unexpected_shape', unusableRows };
  return { entries, skipped: 'not_found', unusableRows };
}
