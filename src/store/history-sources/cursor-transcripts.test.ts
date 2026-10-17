import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CURSOR_AGENT_ID,
  cursorProjectFolderName,
  defaultCursorProjectsDir,
  findCursorProjectDir,
  cursorTranscriptFiles,
  parseCursorTimestamp,
  readCursorHistory,
} from './cursor-transcripts.js';

const PROJECT_ROOT = 'C:\\Users\\dev\\my_app (v2)';

function userRow(text: string): string {
  return JSON.stringify({ role: 'user', message: { content: [{ type: 'text', text }] } });
}
function assistantRow(text: string): string {
  return JSON.stringify({ role: 'assistant', message: { content: [{ type: 'text', text }] } });
}
function query(prompt: string, stamp?: string): string {
  return `${stamp ? `<timestamp>${stamp}</timestamp>\n` : ''}<user_query>\n${prompt}\n</user_query>`;
}
function writeTranscript(dir: string, id: string, lines: string[], nested = true): string {
  const folder = nested ? join(dir, id) : dir;
  mkdirSync(folder, { recursive: true });
  const file = join(folder, `${id}.jsonl`);
  writeFileSync(file, lines.join('\n') + '\n', 'utf8');
  return file;
}

describe('cursorProjectFolderName', () => {
  it('turns every run of non-alphanumerics into one dash and trims the ends', () => {
    expect(cursorProjectFolderName('C:\\Users\\dev\\my_app (v2)')).toBe('C-Users-dev-my-app-v2');
    expect(cursorProjectFolderName('/home/dev/site.io/')).toBe('home-dev-site-io');
  });
});

describe('parseCursorTimestamp', () => {
  it('reads the form Cursor writes, with its UTC offset', () => {
    expect(parseCursorTimestamp('Tuesday, Sep 8, 2026, 3:45 PM (UTC+5:30)')).toBe(Date.UTC(2026, 8, 8, 10, 15));
    expect(parseCursorTimestamp('Monday, Aug 31, 2026, 12:05 AM (UTC-4)')).toBe(Date.UTC(2026, 7, 31, 4, 5));
    expect(parseCursorTimestamp('Monday, Aug 31, 2026, 12:05 PM (UTC)')).toBe(Date.UTC(2026, 7, 31, 12, 5));
  });

  it('returns undefined for anything else', () => {
    expect(parseCursorTimestamp('2026-09-08T10:15:00Z')).toBeUndefined();
    expect(parseCursorTimestamp('Tuesday, Foo 8, 2026, 3:45 PM (UTC+5:30)')).toBeUndefined();
    expect(parseCursorTimestamp('Tuesday, Sep 8, 2026, 13:45 PM (UTC+5:30)')).toBeUndefined();
  });
});

describe('readCursorHistory', () => {
  let projectsDir: string;
  let transcriptsDir: string;

  beforeEach(() => {
    projectsDir = mkdtempSync(join(tmpdir(), 'nexpath-cursor-history-'));
    transcriptsDir = join(projectsDir, 'c-Users-dev-my-app-v2', 'agent-transcripts'); // drive letter case differs
    mkdirSync(transcriptsDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(projectsDir, { recursive: true, force: true });
  });

  it('reads the typed prompt from inside <user_query> and ignores assistant rows', () => {
    writeTranscript(transcriptsDir, 'conv-a', [
      userRow(query('add a login page', 'Tuesday, Sep 8, 2026, 3:45 PM (UTC+5:30)')),
      assistantRow('Sure — here is a plan'),
      JSON.stringify({ type: 'turn_ended', status: 'completed' }),
    ]);
    const result = readCursorHistory(PROJECT_ROOT, { projectsDir });
    expect(result.skipped).toBeUndefined();
    expect(result.entries).toEqual([
      { text: 'add a login page', capturedAt: Date.UTC(2026, 8, 8, 10, 15), orderHint: expect.any(Number), agent: CURSOR_AGENT_ID },
    ]);
  });

  it('reads every conversation of the workspace, nested and flat', () => {
    writeTranscript(transcriptsDir, 'conv-a', [userRow(query('one'))]);
    writeTranscript(transcriptsDir, 'conv-b', [userRow(query('two'))], false);
    const texts = readCursorHistory(PROJECT_ROOT, { projectsDir }).entries.map((e) => e.text).sort();
    expect(texts).toEqual(['one', 'two']);
  });

  it('never reads helper transcripts under a subagents folder', () => {
    writeTranscript(transcriptsDir, 'conv-a', [userRow(query('mine'))]);
    writeTranscript(join(transcriptsDir, 'conv-a', 'subagents'), 'child', [userRow(query('agent-written task'))], false);
    writeTranscript(join(transcriptsDir, 'subagents'), 'child2', [userRow(query('agent-written task 2'))], false);
    expect(readCursorHistory(PROJECT_ROOT, { projectsDir }).entries.map((e) => e.text)).toEqual(['mine']);
    expect(cursorTranscriptFiles(transcriptsDir)).toHaveLength(1);
  });

  it('skips and counts a user row without a <user_query> block', () => {
    writeTranscript(transcriptsDir, 'conv-a', [userRow('no wrapper here'), userRow(query('kept'))]);
    const result = readCursorHistory(PROJECT_ROOT, { projectsDir });
    expect(result.entries.map((e) => e.text)).toEqual(['kept']);
    expect(result.unusableRows).toBe(1);
  });

  it('gives untimed rows the nearest earlier time, else the nearest later, keeping written order', () => {
    writeTranscript(transcriptsDir, 'conv-a', [
      userRow(query('before any stamp')),
      userRow(query('stamped', 'Tuesday, Sep 8, 2026, 3:45 PM (UTC+5:30)')),
      userRow(query('after the stamp')),
    ]);
    const stamped = Date.UTC(2026, 8, 8, 10, 15);
    expect(readCursorHistory(PROJECT_ROOT, { projectsDir }).entries.map((e) => [e.text, e.capturedAt])).toEqual([
      ['before any stamp', stamped],
      ['stamped', stamped],
      ['after the stamp', stamped],
    ]);
  });

  it('uses the file time when a conversation states no time at all', () => {
    const file = writeTranscript(transcriptsDir, 'conv-a', [userRow(query('untimed'))]);
    const when = new Date(Date.UTC(2026, 5, 1, 12, 0));
    utimesSync(file, when, when);
    expect(readCursorHistory(PROJECT_ROOT, { projectsDir }).entries[0]!.capturedAt).toBe(when.getTime());
  });

  it("never reads another workspace's folder", () => {
    const other = join(projectsDir, 'C-Users-dev-other-app', 'agent-transcripts');
    writeTranscript(other, 'conv-x', [userRow(query('not this project'))]);
    writeTranscript(transcriptsDir, 'conv-a', [userRow(query('this project'))]);
    expect(readCursorHistory(PROJECT_ROOT, { projectsDir }).entries.map((e) => e.text)).toEqual(['this project']);
  });

  it('control: a workspace with no Cursor folder returns nothing, marked not_found', () => {
    expect(readCursorHistory('C:\\Users\\dev\\never-opened', { projectsDir })).toEqual({ entries: [], skipped: 'not_found' });
    expect(findCursorProjectDir('C:\\Users\\dev\\never-opened', projectsDir)).toBeNull();
  });

  it('tolerates broken JSON lines', () => {
    writeTranscript(transcriptsDir, 'conv-a', ['{not json', userRow(query('fine'))]);
    expect(readCursorHistory(PROJECT_ROOT, { projectsDir }).entries.map((e) => e.text)).toEqual(['fine']);
  });

  it('defaults to ~/.cursor/projects unless NEXPATH_CURSOR_PROJECTS_DIR is set', () => {
    expect(defaultCursorProjectsDir({ NEXPATH_CURSOR_PROJECTS_DIR: projectsDir })).toBe(projectsDir);
    expect(defaultCursorProjectsDir({})).toMatch(/\.cursor[\\/]projects$/);
  });
});
