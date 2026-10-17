/**
 * Cursor's agent transcripts as a history source.
 *
 * Cursor keeps one plain JSONL transcript per agent conversation, under a folder per workspace:
 * `~/.cursor/projects/<workspace>/agent-transcripts/<conversation>/<conversation>.jsonl`. Each
 * user row carries the typed prompt inside `<user_query>…</user_query>`; some rows also carry a
 * `<timestamp>…</timestamp>` block before it, in the form `Tuesday, Sep 8, 2026, 3:45 PM (UTC+5:30)`.
 *
 * The reader never looks outside the one workspace folder, never reads helper transcripts
 * (anything under a `subagents` folder — those rows are the agent's own instructions, not the
 * user's prompts), and never reads Cursor's database. It is read-only and fail-soft: a file it
 * cannot read is skipped and counted.
 *
 * Time: a row's own timestamp when it has one; otherwise the nearest earlier timestamp in the
 * same conversation, else the nearest later one, else the transcript file's modification time.
 * Those estimated times keep the conversation in its written order; they are approximate.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HistoryEntry, HistorySourceResult } from './types.js';

export const CURSOR_AGENT_ID = 'cursor';

/**
 * The folder name Cursor gives a workspace under its `projects` folder: every run of characters
 * that are not letters or digits becomes one `-`, with leading and trailing dashes removed.
 */
export function cursorProjectFolderName(projectRoot: string): string {
  return projectRoot.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Cursor's per-workspace folder root; `NEXPATH_CURSOR_PROJECTS_DIR` overrides it. */
export function defaultCursorProjectsDir(env: NodeJS.ProcessEnv = process.env): string {
  return env['NEXPATH_CURSOR_PROJECTS_DIR'] || join(homedir(), '.cursor', 'projects');
}

/**
 * The workspace folder for `projectRoot`, or null. Compared case-insensitively, because the
 * drive letter's case in the folder name varies between Cursor installs.
 */
export function findCursorProjectDir(projectRoot: string, projectsDir: string): string | null {
  const wanted = cursorProjectFolderName(projectRoot).toLowerCase();
  if (!wanted || !existsSync(projectsDir)) return null;
  for (const name of readdirSync(projectsDir)) {
    if (name.toLowerCase() === wanted) return join(projectsDir, name);
  }
  return null;
}

/**
 * The conversation transcripts in an `agent-transcripts` folder: `<id>/<id>.jsonl`, or a flat
 * `<id>.jsonl`. Nothing else inside a conversation folder is read, so helper transcripts
 * (`<id>/subagents/<child>.jsonl`) are excluded by construction.
 */
export function cursorTranscriptFiles(transcriptsDir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(transcriptsDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(join(transcriptsDir, entry.name));
    } else if (entry.isDirectory()) {
      const inner = join(transcriptsDir, entry.name, `${entry.name}.jsonl`);
      if (existsSync(inner)) files.push(inner);
    }
  }
  return files.sort();
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const CURSOR_TIME =
  /^\s*[A-Za-z]+,\s*([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])\s*\(\s*(?:UTC|GMT)\s*(?:([+-])(\d{1,2})(?::?(\d{2}))?)?\s*\)\s*$/;

/** Parses Cursor's `Tuesday, Sep 8, 2026, 3:45 PM (UTC+5:30)` into Unix ms, or undefined. */
export function parseCursorTimestamp(raw: string): number | undefined {
  const m = CURSOR_TIME.exec(raw);
  if (!m) return undefined;
  const month = MONTHS.indexOf(m[1]!.toLowerCase());
  const day = Number(m[2]);
  const year = Number(m[3]);
  const hour12 = Number(m[4]);
  const minute = Number(m[5]);
  if (month < 0 || day < 1 || day > 31 || hour12 < 1 || hour12 > 12 || minute > 59) return undefined;
  const hour = (hour12 % 12) + (m[6]!.toLowerCase() === 'pm' ? 12 : 0);
  const sign = m[7] === '-' ? -1 : 1;
  const offsetMinutes = m[8] !== undefined ? sign * (Number(m[8]) * 60 + Number(m[9] ?? 0)) : 0;
  const utc = Date.UTC(year, month, day, hour, minute) - offsetMinutes * 60_000;
  return Number.isFinite(utc) ? utc : undefined;
}

const USER_QUERY = /<user_query>([\s\S]*?)<\/user_query>/;
const TIMESTAMP = /<timestamp>([\s\S]*?)<\/timestamp>/;

/** The text of a user row (text parts joined), or null for any other row. */
function userRowText(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as { role?: unknown; message?: { content?: unknown } };
  if (r.role !== 'user') return null;
  const content = r.message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return null;
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const p = part as { type?: unknown; text?: unknown };
      return p.type === 'text' && typeof p.text === 'string' ? p.text : '';
    })
    .join('\n');
}

interface TranscriptRow {
  text: string;
  time?: number;
}

/** The prompts of one transcript, in written order, with the times each row states. */
function readTranscript(path: string): { rows: TranscriptRow[]; unusable: number } {
  const rows: TranscriptRow[] = [];
  let unusable = 0;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const text = userRowText(parsed);
    if (text === null) continue;
    const query = USER_QUERY.exec(text)?.[1]?.trim();
    if (!query) {
      unusable++;
      continue;
    }
    const stamp = TIMESTAMP.exec(text)?.[1];
    rows.push({ text: query, time: stamp !== undefined ? parseCursorTimestamp(stamp) : undefined });
  }
  return { rows, unusable };
}

/** Gives every row a time: its own, else the nearest earlier, else the nearest later, else `fallback`. */
function fillTimes(rows: readonly TranscriptRow[], fallback: number): number[] {
  const firstKnown = rows.find((row) => row.time !== undefined)?.time;
  let last: number | undefined;
  return rows.map((row) => {
    if (row.time !== undefined) last = row.time;
    return row.time ?? last ?? firstKnown ?? fallback;
  });
}

export interface CursorHistoryOptions {
  /** Cursor's per-workspace folder root; defaults to `defaultCursorProjectsDir()`. */
  projectsDir?: string;
}

/** Every prompt in the workspace's Cursor agent transcripts. Read-only; never throws. */
export function readCursorHistory(projectRoot: string, options: CursorHistoryOptions = {}): HistorySourceResult {
  try {
    const projectDir = findCursorProjectDir(projectRoot, options.projectsDir ?? defaultCursorProjectsDir());
    const transcriptsDir = projectDir ? join(projectDir, 'agent-transcripts') : null;
    if (!transcriptsDir || !existsSync(transcriptsDir)) return { entries: [], skipped: 'not_found' };

    const entries: HistoryEntry[] = [];
    let unusableRows = 0;
    let unreadableFiles = 0;
    for (const file of cursorTranscriptFiles(transcriptsDir)) {
      try {
        const modified = statSync(file).mtimeMs;
        const { rows, unusable } = readTranscript(file);
        unusableRows += unusable;
        const times = fillTimes(rows, modified);
        rows.forEach((row, index) => {
          entries.push({ text: row.text, capturedAt: times[index], orderHint: modified, agent: CURSOR_AGENT_ID });
        });
      } catch {
        unreadableFiles++;
      }
    }
    if (entries.length === 0 && unreadableFiles > 0) return { entries, skipped: 'unreadable', unusableRows };
    return { entries, unusableRows };
  } catch {
    return { entries: [], skipped: 'unreadable' };
  }
}
