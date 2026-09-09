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
  parseWmctrlList, scoreEditorWindow, windowClassMatches, rankEditorWindows, isOurWindowTitle,
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

/**
 * ⭐ RC74a — the Windows tester's exact failure. The Devin build titles its window
 * "<folder> - Devin - <session title>": the app name sits MID-title, so a suffix-only guard
 * scored it 0 (`window=0` in the log) and the targeting never engaged. Same four shapes as
 * the shipped RC60 foreground check, now on both platforms.
 */
describe('⭐ RC74a — Devin mid-title app name', () => {
  const t = { appName: 'Devin', workspaceName: 'profile_testing' };
  it('⭐ the exact title shape from the Windows log scores as our window', () => {
    expect(scoreEditorWindow('profile_testing - Devin - set up my food delivery app', t)).toBe(95);
    expect(scoreEditorWindow('main.ts - profile_testing - Devin - session title', t)).toBe(85);
    expect(scoreEditorWindow('profile_testing - Devin', t)).toBe(100);
  });
  it('a folder-less Devin window ("Devin - <session>") is still identifiable', () => {
    expect(scoreEditorWindow('Devin - some session', { appName: 'Devin' })).toBe(70);
  });
  it('other applications, and the other product name, stay at 0', () => {
    expect(scoreEditorWindow('WhatsApp', t)).toBe(0);
    expect(scoreEditorWindow('profile_testing - Windsurf', t)).toBe(0);
    expect(scoreEditorWindow('Devin docs - Chrome', t)).toBe(0);
  });
  it('⭐ ranking picks the Devin window over the browser that was foreground on the tester box', () => {
    const rows = parseWmctrlList([
      '0x1  0 whatsapp.WhatsApp     h WhatsApp',
      '0x2  0 windsurf.Windsurf     h profile_testing - Devin - set up my food delivery app',
      '0x3  0 google-chrome.Google-chrome h Devin docs - Chrome',
    ].join('\n'));
    expect(rankEditorWindows(rows, { ...t, classNeedles: ['devin', 'windsurf'] }).map((w) => w.id)).toEqual(['0x2']);
  });
});

/** ⭐ RC75 — the instant-before-typing gate: is the window in front THIS host's window? */
describe('⭐ RC75 — isOurWindowTitle', () => {
  const ws = { appName: 'Cursor', workspaceName: 'nexpath' };
  it('⭐ with a workspace: only the identifying tiers pass; a second window of the same editor is refused', () => {
    expect(isOurWindowTitle('nexpath - Cursor', ws)).toBe(true);
    expect(isOurWindowTitle('extension.ts - nexpath - Cursor', ws)).toBe(true);
    expect(isOurWindowTitle('nexpath - Devin - session', { appName: 'Devin', workspaceName: 'nexpath' })).toBe(true);
    expect(isOurWindowTitle('Cursor', ws)).toBe(false);            // the folder-less window
    expect(isOurWindowTitle('other - Cursor', ws)).toBe(false);    // another project's window
    expect(isOurWindowTitle('nexpath docs - Cursor', ws)).toBe(false); // weak "contains" tier
    expect(isOurWindowTitle('WhatsApp', ws)).toBe(false);
    expect(isOurWindowTitle(null, ws)).toBe(false);
    expect(isOurWindowTitle('', ws)).toBe(false);
  });
  it('without a workspace: the folder-less shapes pass, another application never does', () => {
    expect(isOurWindowTitle('Cursor', { appName: 'Cursor' })).toBe(true);
    expect(isOurWindowTitle('index.ts - Cursor', { appName: 'Cursor' })).toBe(true);
    expect(isOurWindowTitle('Devin - session', { appName: 'Devin' })).toBe(true);
    expect(isOurWindowTitle('Slack', { appName: 'Cursor' })).toBe(false);
    expect(isOurWindowTitle('Cursor', {})).toBe(false);
  });
});
