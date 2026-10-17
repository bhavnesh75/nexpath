import { describe, it, expect } from 'vitest';
import type { HistoryEntry } from './types.js';
import {
  historyTime,
  dropRepeatedRows,
  mergeHistoryEntries,
  dropLivePromptEcho,
  LIVE_PROMPT_ECHO_WINDOW_MS,
} from './merge.js';

function entry(text: string, agent: string, capturedAt?: number, extra: Partial<HistoryEntry> = {}): HistoryEntry {
  return { text, agent, capturedAt, orderHint: extra.orderHint ?? 0, ...extra };
}

describe('historyTime', () => {
  it('uses the entry time, and the ordering fallback only when there is none', () => {
    expect(historyTime(entry('a', 'cursor', 500, { orderHint: 9 }))).toBe(500);
    expect(historyTime(entry('a', 'cursor', undefined, { orderHint: 9 }))).toBe(9);
  });
});

describe('dropRepeatedRows', () => {
  it('keeps the first of several rows with the same source id', () => {
    const rows = [
      entry('first', 'claude-code', 1, { rowId: 'u1' }),
      entry('copy', 'claude-code', 1, { rowId: 'u1' }),
      entry('other', 'claude-code', 2, { rowId: 'u2' }),
    ];
    expect(dropRepeatedRows(rows).map((e) => e.text)).toEqual(['first', 'other']);
  });

  it('never drops rows without an id, even when their text repeats', () => {
    const rows = [entry('same', 'cursor', 1), entry('same', 'cursor', 2)];
    expect(dropRepeatedRows(rows)).toHaveLength(2);
  });

  it('treats the same id from two different agents as two rows', () => {
    const rows = [entry('a', 'claude-code', 1, { rowId: 'x' }), entry('b', 'devin', 1, { rowId: 'x' })];
    expect(dropRepeatedRows(rows)).toHaveLength(2);
  });
});

describe('mergeHistoryEntries', () => {
  it('orders all sources together, oldest first', () => {
    const claude = [entry('c1', 'claude-code', 10), entry('c3', 'claude-code', 30)];
    const cursor = [entry('k2', 'cursor', 20), entry('k4', 'cursor', 40)];
    const devin = [entry('d0', 'devin', 5)];
    expect(mergeHistoryEntries([claude, cursor, devin], 500).map((e) => e.text)).toEqual(['d0', 'c1', 'k2', 'c3', 'k4']);
  });

  it('keeps only the newest entries when the total exceeds the cap', () => {
    const rows = [entry('a', 'cursor', 1), entry('b', 'cursor', 2), entry('c', 'cursor', 3), entry('d', 'cursor', 4)];
    expect(mergeHistoryEntries([rows], 2).map((e) => e.text)).toEqual(['c', 'd']);
  });

  it('keeps written order for rows that share a time — within a list and across lists', () => {
    const first = [entry('x1', 'cursor', 7), entry('x2', 'cursor', 7)];
    const second = [entry('y1', 'devin', 7)];
    expect(mergeHistoryEntries([first, second], 0).map((e) => e.text)).toEqual(['x1', 'x2', 'y1']);
  });

  it('does not cap when the cap is not positive, and does not change its inputs', () => {
    const rows = [entry('b', 'cursor', 2), entry('a', 'cursor', 1)];
    const merged = mergeHistoryEntries([rows], 0);
    expect(merged.map((e) => e.text)).toEqual(['a', 'b']);
    expect(rows.map((e) => e.text)).toEqual(['b', 'a']);
  });

  it('a Claude-only list comes back exactly as the Claude importer orders it (time, then file time)', () => {
    const rows = [
      entry('timed-late', 'claude-code', 300),
      entry('untimed', 'claude-code', undefined, { orderHint: 200 }),
      entry('timed-early', 'claude-code', 100),
    ];
    expect(mergeHistoryEntries([rows], 500).map((e) => e.text)).toEqual(['timed-early', 'untimed', 'timed-late']);
  });
});

describe('dropLivePromptEcho', () => {
  const now = 1_000_000_000_000;
  const agents = new Set(['cursor', 'devin']);

  it('drops the newest entry of a listed agent when it is the live prompt, written moments ago', () => {
    const rows = [entry('older', 'cursor', now - 50_000), entry('fix the header', 'cursor', now - 2_000)];
    expect(dropLivePromptEcho(rows, '  fix the header ', now, agents).map((e) => e.text)).toEqual(['older']);
  });

  it('keeps it when it is older than the window', () => {
    const rows = [entry('fix the header', 'devin', now - LIVE_PROMPT_ECHO_WINDOW_MS - 1)];
    expect(dropLivePromptEcho(rows, 'fix the header', now, agents)).toHaveLength(1);
  });

  it('never touches an older identical prompt — only the newest per agent is considered', () => {
    const rows = [entry('same', 'cursor', now - 5_000), entry('different', 'cursor', now - 1_000)];
    expect(dropLivePromptEcho(rows, 'same', now, agents)).toHaveLength(2);
  });

  it('never touches agents that are not listed (the Claude history stays exactly as collected)', () => {
    const rows = [entry('same', 'claude-code', now - 1_000)];
    expect(dropLivePromptEcho(rows, 'same', now, agents)).toHaveLength(1);
  });

  it('does nothing without a live prompt', () => {
    const rows = [entry('x', 'cursor', now)];
    expect(dropLivePromptEcho(rows, undefined, now, agents)).toHaveLength(1);
    expect(dropLivePromptEcho(rows, '   ', now, agents)).toHaveLength(1);
  });

  it('checks each listed agent separately', () => {
    const rows = [entry('same', 'cursor', now - 1_000), entry('same', 'devin', now - 1_500)];
    expect(dropLivePromptEcho(rows, 'same', now, agents)).toHaveLength(0);
  });
});
