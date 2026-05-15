#!/usr/bin/env node
/**
 * scripts/dump-cursor-state.ts — capture verified `state.vscdb` fixtures
 * from a real machine for extractor regression testing.
 *
 * Run this on any machine where Cursor is installed and chat has actually
 * happened. It:
 *   1. Locates ALL Cursor `state.vscdb` files under the OS's Cursor config
 *      tree (or accepts an explicit `--src` for a single file).
 *      Includes global storage AND per-workspace storage — chat messages
 *      live in the workspace DB, not the global one.
 *   2. Opens each DB with `better-sqlite3` (WAL-aware — the live `.vscdb`
 *      file is ~4 KB; all writes go to the sibling `.vscdb-wal`, which
 *      `sql.js` cannot read).
 *   3. Dumps every chat-related row from `ItemTable` AND every row from
 *      the `cursorDiskKV` table (separate KV store Cursor 3.x uses).
 *   4. Optionally redacts long string values via `--redact`.
 *   5. Writes one JSON snapshot per DB to
 *      `src/ext-vscode/test-fixtures/state-vscdb-samples/`.
 *
 * Discovered facts about Cursor 3.4.20 (2026-05-15 real-machine
 * inspection):
 *   - `ItemTable` schema is correct, but lives in workspace DB
 *     (`User/workspaceStorage/<id>/state.vscdb`), not the global one
 *     (`User/globalStorage/state.vscdb`).
 *   - WAL mode is enabled — sibling `state.vscdb-wal` holds live writes.
 *   - Chat-relevant keys observed: `aiService.prompts`, `aiService.generations`,
 *     `composer.composerData` (metadata only — selectedComposerIds, migration
 *     flags), `workbench.panel.composerChatViewPane.<id>` (UI state).
 *   - The actual Composer-mode message storage location was NOT in `ItemTable`
 *     on a fresh chat-less DB. Run this script AFTER having a real chat to
 *     find where the messages land.
 *
 * Usage:
 *   npx tsx scripts/dump-cursor-state.ts --name <fixture-name> [--redact] [--src <path>]
 *
 * If --src is omitted, every state.vscdb under ~/.config/Cursor (linux),
 * ~/Library/Application Support/Cursor (darwin), %APPDATA%/Cursor (win32)
 * is dumped — one output file per DB, suffixed with the source path.
 */

import { writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir, platform as osPlatform, tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Keep ItemTable rows whose key starts with any of these. */
const KEEP_ITEMTABLE_PREFIXES = [
  'aiService.',
  'composer.',
  'composerData.',
  'cursorAIService.',
  'cursorAIChatService.',
  'cascade.',
  // UI-state keys we want too, to confirm composerId associations
  'workbench.panel.composerChatViewPane.',
  'workbench.panel.aichat.',
  'workbench.backgroundComposer.',
];

interface CliArgs {
  name: string;
  src?: string;
  redact: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { redact: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--name') args.name = argv[++i];
    else if (a === '--src') args.src = argv[++i];
    else if (a === '--redact') args.redact = true;
    else if (a === '--help' || a === '-h') printUsageAndExit(0);
    else {
      console.error(`Unknown argument: ${a}`);
      printUsageAndExit(1);
    }
  }
  if (!args.name) {
    console.error('Missing required --name <fixture-name>');
    printUsageAndExit(1);
  }
  return args as CliArgs;
}

function printUsageAndExit(code: number): never {
  console.log(`Usage:
  npx tsx scripts/dump-cursor-state.ts --name <fixture-name> [--src <path>] [--redact]

Options:
  --name <s>     Fixture name prefix (no extension). REQUIRED.
                 One output file per discovered state.vscdb, suffixed with
                 the source kind (global / workspace-<id>).
  --src <path>   Path to a single state.vscdb. If omitted, all state.vscdb
                 files under the OS's Cursor config tree are dumped.
  --redact       Replace string values longer than 8 chars with same-length
                 placeholders. Use this if dumps may contain sensitive content.

Output:
  src/ext-vscode/test-fixtures/state-vscdb-samples/<name>-<suffix>.json
`);
  process.exit(code);
}

function cursorConfigRoot(): string {
  const home = homedir();
  switch (osPlatform()) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Cursor');
    case 'win32':
      return join(process.env.APPDATA ?? home, 'Cursor');
    default:
      return join(home, '.config', 'Cursor');
  }
}

interface DiscoveredDb {
  path: string;
  /** Short label for the output filename, e.g. 'global' or 'workspace-1778826246907'. */
  label: string;
}

function discoverAllStateVscdb(root: string): DiscoveredDb[] {
  const found: DiscoveredDb[] = [];
  const globalPath = join(root, 'User', 'globalStorage', 'state.vscdb');
  if (existsSync(globalPath)) {
    found.push({ path: globalPath, label: 'global' });
  }
  const wsDir = join(root, 'User', 'workspaceStorage');
  if (existsSync(wsDir)) {
    for (const entry of readdirSync(wsDir)) {
      const dbPath = join(wsDir, entry, 'state.vscdb');
      if (existsSync(dbPath)) {
        found.push({ path: dbPath, label: `workspace-${entry}` });
      }
    }
  }
  return found;
}

interface DumpedRow {
  table: 'ItemTable' | 'cursorDiskKV';
  key: string;
  value: string;
}

interface DumpedDb {
  capturedAt: string;
  sourcePath: string;
  platform: string;
  redacted: boolean;
  /** Names of all tables present (useful for schema-fingerprint diagnostics). */
  tables: string[];
  /** Rows kept after filtering. */
  rows: DumpedRow[];
}

function shouldKeepItemTable(key: string): boolean {
  return KEEP_ITEMTABLE_PREFIXES.some((p) => key.startsWith(p));
}

function redactValue(value: string): string {
  try {
    const parsed = JSON.parse(value);
    const redacted = JSON.parse(JSON.stringify(parsed), (_k, v) => {
      if (typeof v === 'string' && v.length > 8) return '*'.repeat(v.length);
      return v;
    });
    return JSON.stringify(redacted);
  } catch {
    return '*'.repeat(value.length);
  }
}

/**
 * better-sqlite3 is WAL-aware: it opens the main DB and the sibling -wal/-shm
 * automatically. We copy all three siblings to a tmp dir to avoid any chance
 * of interfering with Cursor's live write path.
 */
async function readDbAsSnapshot(path: string): Promise<DumpedDb> {
  // Copy main + wal + shm so the live DB is never touched.
  const stagingDir = join(
    tmpdir(),
    `nexpath-dump-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  await mkdir(stagingDir, { recursive: true });
  const stagedMain = join(stagingDir, basename(path));
  await copyFile(path, stagedMain);
  for (const suffix of ['-wal', '-shm'] as const) {
    const sibling = path + suffix;
    if (existsSync(sibling)) {
      await copyFile(sibling, stagedMain + suffix);
    }
  }

  const mod = (await import('better-sqlite3')) as unknown as {
    default: new (path: string, options?: { readonly?: boolean }) => {
      prepare(sql: string): {
        all(...params: unknown[]): Array<Record<string, unknown>>;
      };
      pragma(pragma: string): unknown;
      close(): void;
    };
  };
  const Database = mod.default;
  const db = new Database(stagedMain, { readonly: true });
  // Checkpoint the WAL into the staged copy so all data is in the main file
  // before we run our SELECTs. (Belt-and-braces — better-sqlite3 reads WAL
  // transparently anyway, but checkpoint guarantees consistency.)
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // some DBs aren't in WAL mode — that's fine
  }

  const dump: DumpedDb = {
    capturedAt: new Date().toISOString(),
    sourcePath: path,
    platform: osPlatform(),
    redacted: false,
    tables: [],
    rows: [],
  };

  const tables = (
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as Array<{ name: string }>
  ).map((r) => r.name);
  dump.tables = tables;

  if (tables.includes('ItemTable')) {
    const rows = db
      .prepare('SELECT key, value FROM ItemTable')
      .all() as Array<{ key: string; value: string }>;
    for (const r of rows) {
      if (!shouldKeepItemTable(r.key)) continue;
      dump.rows.push({ table: 'ItemTable', key: r.key, value: r.value });
    }
  }
  if (tables.includes('cursorDiskKV')) {
    const rows = db
      .prepare('SELECT key, value FROM cursorDiskKV')
      .all() as Array<{ key: string; value: string }>;
    for (const r of rows) {
      // Keep ALL cursorDiskKV rows — this table is sparse and likely
      // chat-relevant when populated.
      dump.rows.push({ table: 'cursorDiskKV', key: r.key, value: r.value });
    }
  }

  db.close();
  return dump;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const targets: DiscoveredDb[] = args.src
    ? [{ path: args.src, label: 'src' }]
    : discoverAllStateVscdb(cursorConfigRoot());

  if (targets.length === 0) {
    console.error(`No state.vscdb files found under: ${cursorConfigRoot()}`);
    console.error('Pass --src <path> for a single file.');
    process.exit(2);
  }

  console.log(`Discovered ${targets.length} state.vscdb file(s):`);
  for (const t of targets) console.log(`  - [${t.label}] ${t.path}`);
  console.log('');

  // __dirname = <nexpath-repo>/src/ext-vscode/scripts → go up 1 to reach
  // the sub-package root, then write to test-fixtures/ alongside src/.
  const subPackageRoot = resolve(__dirname, '..');
  const outDir = join(subPackageRoot, 'test-fixtures', 'state-vscdb-samples');
  await mkdir(outDir, { recursive: true });

  for (const t of targets) {
    try {
      const dump = await readDbAsSnapshot(t.path);
      if (args.redact) {
        dump.redacted = true;
        for (const row of dump.rows) {
          row.value = redactValue(row.value);
        }
      }
      const outPath = join(outDir, `${args.name}-${t.label}.json`);
      await writeFile(outPath, JSON.stringify(dump, null, 2) + '\n', 'utf8');
      console.log(
        `[${t.label}] ${dump.rows.length} rows kept (${dump.tables.join(
          ', ',
        )}) → ${outPath}`,
      );
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error(`[${t.label}] ERROR: ${e.message}`);
    }
  }

  console.log('');
  console.log('Next steps:');
  console.log('  1. Review the JSON files for sensitive content before committing.');
  console.log('  2. Re-run with --redact if needed.');
  console.log('  3. Reference these fixtures from extractor regression tests.');
}

main().catch((err: unknown) => {
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
