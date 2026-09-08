/**
 * ⭐ RC73 — naming the editor window a synthetic keystroke must reach.
 *
 * The fixture is the VERBATIM `wmctrl -lx` capture from the machine that produced the
 * report (two Cursor windows, one Windsurf): the class raise took `"nexpath - Cursor"`
 * every time, so a prompt submitted from the folder-less `"Cursor"` window had its paste
 * and Enter delivered into the other window's chat.
 */
import { describe, it, expect } from 'vitest';
import {
  parseWmctrlList, scoreEditorWindow, windowClassMatches, rankEditorWindows,
} from './editor-window-target.js';

/** Verbatim `wmctrl -lx`, 2026-09-07, Ubuntu/GNOME. */
const LIVE = [
  '0x03800004  0 cursor.Cursor         emptyops nexpath - Cursor',
  '0x05c00004  0 windsurf.Windsurf     emptyops nexpath - Windsurf',
  '0x0380002f  0 cursor.Cursor         emptyops Cursor',
].join('\n');

describe('parseWmctrlList', () => {
  it('⭐ parses the live capture: id, class, and a title that keeps its spaces and dashes', () => {
    expect(parseWmctrlList(LIVE)).toEqual([
      { id: '0x03800004', wmClass: 'cursor.Cursor', title: 'nexpath - Cursor' },
      { id: '0x05c00004', wmClass: 'windsurf.Windsurf', title: 'nexpath - Windsurf' },
      { id: '0x0380002f', wmClass: 'cursor.Cursor', title: 'Cursor' },
    ]);
  });
  it('tolerates a sticky window (desktop -1), an empty title, blank lines and junk', () => {
    const rows = parseWmctrlList('0x1 -1 a.B host \n\n0x2  0 c.D host  \nnot a window row\n');
    expect(rows).toEqual([
      { id: '0x1', wmClass: 'a.B', title: '' },
      { id: '0x2', wmClass: 'c.D', title: '' },
    ]);
    expect(parseWmctrlList(null)).toEqual([]);
    expect(parseWmctrlList(undefined)).toEqual([]);
    expect(parseWmctrlList('')).toEqual([]);
  });
});

describe('scoreEditorWindow', () => {
  it('⭐ a folder-less host prefers the bare app name — the window the report was typed in', () => {
    expect(scoreEditorWindow('Cursor', { appName: 'Cursor' })).toBe(100);
    expect(scoreEditorWindow('nexpath - Cursor', { appName: 'Cursor' })).toBeLessThan(100);
    expect(scoreEditorWindow('index.ts - Cursor', { appName: 'Cursor' })).toBe(60);
  });
  it('⭐ a host with a folder prefers its own folder, whatever tab is open', () => {
    const t = { appName: 'Cursor', workspaceName: 'nexpath' };
    expect(scoreEditorWindow('nexpath - Cursor', t)).toBe(100);
    expect(scoreEditorWindow('extension.ts - nexpath - Cursor', t)).toBe(90);
    expect(scoreEditorWindow('Cursor', t)).toBe(10);
    expect(scoreEditorWindow('other - Cursor', t)).toBe(10);
  });
  it('rebrands are carried by the live appName, not by product names', () => {
    expect(scoreEditorWindow('billing - Devin', { appName: 'Devin', workspaceName: 'billing' })).toBe(100);
    expect(scoreEditorWindow('nexpath - Windsurf', { appName: 'Windsurf', workspaceName: 'nexpath' })).toBe(100);
  });
  it('never claims a window of another application, and needs an appName to judge anything', () => {
    expect(scoreEditorWindow('nexpath - Chrome', { appName: 'Cursor', workspaceName: 'nexpath' })).toBe(0);
    expect(scoreEditorWindow('nexpath ⋮ myeditor', { appName: 'Cursor', workspaceName: 'nexpath' })).toBe(0); // custom window.title ⇒ class raise
    expect(scoreEditorWindow('Slack', { appName: 'Cursor' })).toBe(0);
    expect(scoreEditorWindow('Cursor', {})).toBe(0);
    expect(scoreEditorWindow('', { appName: 'Cursor' })).toBe(0);
  });
});

describe('windowClassMatches', () => {
  it('matches WM_CLASS case-insensitively against the raise candidates; empty needles never match', () => {
    expect(windowClassMatches('cursor.Cursor', ['cursor'])).toBe(true);
    expect(windowClassMatches('windsurf.Windsurf', ['devin', 'windsurf'])).toBe(true);
    expect(windowClassMatches('google-chrome.Google-chrome', ['cursor'])).toBe(false);
    expect(windowClassMatches('cursor.Cursor', ['', '  '])).toBe(false);
    expect(windowClassMatches('', ['cursor'])).toBe(false);
  });
});

describe('⭐ rankEditorWindows — the exact live regression', () => {
  const windows = parseWmctrlList(LIVE);
  it('⭐ the folder-less Cursor host gets its OWN window first (the class raise took the other one)', () => {
    const ranked = rankEditorWindows(windows, { classNeedles: ['cursor'], appName: 'Cursor' });
    expect(ranked.map((w) => w.id)).toEqual(['0x0380002f', '0x03800004']);
    expect(ranked[0]!.title).toBe('Cursor');
    // What the shipped raise did before RC73: first window of the class, i.e. the wrong one.
    expect(windows.filter((w) => w.wmClass.toLowerCase().includes('cursor'))[0]!.id).toBe('0x03800004');
  });
  it('⭐ the project Cursor host gets the project window first', () => {
    const ranked = rankEditorWindows(windows, { classNeedles: ['cursor'], appName: 'Cursor', workspaceName: 'nexpath' });
    expect(ranked[0]!.id).toBe('0x03800004');
  });
  it('⭐ Windsurf is never a candidate for Cursor and vice versa', () => {
    expect(rankEditorWindows(windows, { classNeedles: ['cursor'], appName: 'Cursor' }).map((w) => w.wmClass))
      .toEqual(['cursor.Cursor', 'cursor.Cursor']);
    const ws = rankEditorWindows(windows, { classNeedles: ['devin', 'windsurf'], appName: 'Windsurf', workspaceName: 'nexpath' });
    expect(ws.map((w) => w.id)).toEqual(['0x05c00004']);
  });
  it('windows of other applications, and unidentifiable ones, are dropped rather than raised', () => {
    const noisy = parseWmctrlList([LIVE, '0x9  0 google-chrome.Google-chrome host Cursor docs - Chrome'].join('\n'));
    expect(rankEditorWindows(noisy, { classNeedles: ['cursor'], appName: 'Cursor' }).every((w) => w.wmClass === 'cursor.Cursor')).toBe(true);
    expect(rankEditorWindows(windows, { classNeedles: ['cursor'], appName: 'Zed' })).toEqual([]);
    expect(rankEditorWindows([], { classNeedles: ['cursor'], appName: 'Cursor' })).toEqual([]);
  });
  it('ties keep the window manager\'s own order (stable, so the raise is deterministic)', () => {
    const two = parseWmctrlList('0xa  0 cursor.Cursor h a.ts - Cursor\n0xb  0 cursor.Cursor h b.ts - Cursor');
    expect(rankEditorWindows(two, { classNeedles: ['cursor'], appName: 'Cursor' }).map((w) => w.id)).toEqual(['0xa', '0xb']);
  });
});
