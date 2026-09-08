import { describe, it, expect, vi } from 'vitest';
import { pasteKeystroke, raiseWindsurfWindow, raiseAppWindow, WINDOW_RAISE_SETTLE_MS, WINDOW_RAISE_CONFIRM_ATTEMPTS } from './windsurf-autopaste.js';

const deps = (over = {}) => {
  const calls: Array<[string, string[]]> = [];
  return {
    calls,
    run: (cmd: string, args: string[]) => { calls.push([cmd, args]); return true; },
    hasCommand: () => true,
    env: { DISPLAY: ':0' } as NodeJS.ProcessEnv,
    ...over,
  };
};

describe('pasteKeystroke', () => {
  it('Linux/X11 with xdotool → ctrl+v via xdotool', () => {
    const d = deps({ platform: 'linux' as NodeJS.Platform });
    expect(pasteKeystroke(d)).toBe(true);
    expect(d.calls[0]).toEqual(['xdotool', ['key', '--clearmodifiers', 'ctrl+v']]);
  });

  it('Linux without DISPLAY/WAYLAND → false (no blind paste)', () => {
    const d = deps({ platform: 'linux' as NodeJS.Platform, env: {} as NodeJS.ProcessEnv });
    expect(pasteKeystroke(d)).toBe(false);
    expect(d.calls).toHaveLength(0);
  });

  it('Linux with no keystroke tool → false', () => {
    const d = deps({ platform: 'linux' as NodeJS.Platform, hasCommand: () => false });
    expect(pasteKeystroke(d)).toBe(false);
  });

  it('macOS → osascript Cmd+V', () => {
    const d = deps({ platform: 'darwin' as NodeJS.Platform });
    expect(pasteKeystroke(d)).toBe(true);
    expect(d.calls[0][0]).toBe('osascript');
    expect(d.calls[0][1].join(' ')).toContain('keystroke "v" using command down');
  });

  it('Windows → powershell SendKeys ^v', () => {
    const d = deps({ platform: 'win32' as NodeJS.Platform });
    expect(pasteKeystroke(d)).toBe(true);
    expect(d.calls[0][0]).toBe('powershell');
    expect(d.calls[0][1].join(' ')).toContain('SendKeys("^v")');
  });

  it('prefers xdotool, then wtype, then ydotool', () => {
    const onlyWtype = deps({
      platform: 'linux' as NodeJS.Platform,
      hasCommand: (c: string) => c === 'wtype',
    });
    expect(pasteKeystroke(onlyWtype)).toBe(true);
    expect(onlyWtype.calls[0][0]).toBe('wtype');
  });
});

describe('raiseWindsurfWindow', () => {
  it('Linux with wmctrl → activates the windsurf window', () => {
    const d = deps({ platform: 'linux' as NodeJS.Platform });
    expect(raiseWindsurfWindow(d)).toBe(true);
    expect(d.calls[0]).toEqual(['wmctrl', ['-x', '-a', 'windsurf']]);
  });

  it('⭐ F-9: macOS activates the running editor process through System Events; win32 stays a no-op', () => {
    const mac = deps({ platform: 'darwin' as NodeJS.Platform });
    expect(raiseWindsurfWindow(mac)).toBe(true);
    expect(mac.calls[0][0]).toBe('osascript');
    expect(mac.calls[0][1].join(' ')).toContain('first application process whose name is');
    expect(mac.calls[0][1].join(' ')).toContain('{"windsurf"}');
    const win = deps({ platform: 'win32' as NodeJS.Platform });
    expect(raiseWindsurfWindow(win)).toBe(false);
    expect(win.calls).toHaveLength(0);
  });

  it('Linux without a display → false', () => {
    const d = deps({ platform: 'linux' as NodeJS.Platform, env: {} as NodeJS.ProcessEnv });
    expect(raiseWindsurfWindow(d)).toBe(false);
  });
});

describe('raiseAppWindow (generalised — used for Cursor inject)', () => {
  it('Linux with wmctrl → activates the given app class (cursor)', () => {
    const d = deps({ platform: 'linux' as NodeJS.Platform });
    expect(raiseAppWindow('cursor', d)).toBe(true);
    expect(d.calls[0]).toEqual(['wmctrl', ['-x', '-a', 'cursor']]);
  });

  it('falls back to xdotool --class when wmctrl is absent', () => {
    const d = deps({
      platform: 'linux' as NodeJS.Platform,
      hasCommand: (c: string) => c === 'xdotool',
    });
    expect(raiseAppWindow('cursor', d)).toBe(true);
    expect(d.calls[0]).toEqual(['xdotool', ['search', '--class', 'cursor', 'windowactivate', '--sync']]);
  });

  it('⭐ F-9: macOS tries every candidate in order (live appName first) via one activation script; win32 no-op', () => {
    const mac = deps({ platform: 'darwin' as NodeJS.Platform });
    expect(raiseAppWindow(['cursor rebrand', 'cursor'], mac)).toBe(true);
    expect(mac.calls[0][0]).toBe('osascript');
    expect(mac.calls[0][1].join(' ')).toContain('{"cursor rebrand", "cursor"}');
    expect(raiseAppWindow('cursor', deps({ platform: 'win32' as NodeJS.Platform }))).toBe(false);
  });
});

/** ⭐ RC49 — paste gets the same win32 targeting submit has (closing a platform asymmetry). */
describe('⭐ RC49 — pasteKeystroke win32 targeting', () => {
  it('⭐ with win32Titles: uses the foreground-first targeted script', () => {
    const calls: string[][] = [];
    pasteKeystroke({ platform: 'win32', win32Titles: ['Devin Next', 'Devin'], run: (_c, a) => { calls.push(a); return true; } });
    const ps = calls[0]!.join(' ');
    expect(ps).toContain('GetForegroundWindow');
    expect(ps).toContain("'Devin Next'");
    expect(ps).toContain('SendKeys("^v")');
  });
  it('without win32Titles: the OLD bare ^v, byte-identical (regression pin)', () => {
    const calls: string[][] = [];
    pasteKeystroke({ platform: 'win32', run: (_c, a) => { calls.push(a); return true; } });
    expect(calls[0]!.join(' ')).toContain('$w=New-Object -ComObject WScript.Shell;$w.SendKeys("^v")');
    expect(calls[0]!.join(' ')).not.toContain('GetForegroundWindow');
  });
});

/** ⭐ RC59 — raiseAppWindow candidate list: rebranded hosts carry their own WM_CLASS. */
describe('⭐ RC59 — raiseAppWindow candidates', () => {
  it('tries each candidate until one raises', () => {
    const tried: string[] = [];
    const ok = raiseAppWindow(['devin', 'windsurf'], {
      platform: 'linux', env: { DISPLAY: ':0' },
      hasCommand: (c) => c === 'wmctrl',
      run: (_c, args) => { tried.push(args[2]!); return args[2] === 'windsurf'; },
    });
    expect(ok).toBe(true);
    expect(tried).toEqual(['devin', 'windsurf']);
  });

  it('a single string keeps the old behaviour byte-identical', () => {
    const tried: string[] = [];
    raiseAppWindow('windsurf', {
      platform: 'linux', env: { DISPLAY: ':0' },
      hasCommand: (c) => c === 'wmctrl',
      run: (_c, args) => { tried.push(args[2]!); return true; },
    });
    expect(tried).toEqual(['windsurf']);
  });
});

/** ⭐ RC72 — the paste script also uses the cached helper when the Windows env names a cache dir. */
describe('⭐ RC72 — pasteKeystroke uses the cached win32 helper', () => {
  it('with LOCALAPPDATA: the cache-aware prelude leads; without: the RC49 script byte-identical', () => {
    const calls: string[][] = [];
    pasteKeystroke({ platform: 'win32', env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' }, win32Titles: ['Devin'], run: (_c, a) => { calls.push(a); return true; } });
    expect(calls[0]!.join(' ')).toContain("$nxDll='C:\\Users\\u\\AppData\\Local\\nexpath\\user32-fg-");
    expect(calls[0]!.join(' ')).toContain('Add-Type -LiteralPath $nxDll');
    expect(calls[0]!.join(' ')).toContain('SendKeys("^v")');
    pasteKeystroke({ platform: 'win32', env: {}, win32Titles: ['Devin'], run: (_c, a) => { calls.push(a); return true; } });
    expect(calls[1]!.join(' ').startsWith('-NoProfile -Command Add-Type ')).toBe(true);
    expect(calls[1]!.join(' ')).not.toContain('$nxDll');
  });
});

/**
 * ⭐ RC73 — the raise names ONE window instead of a WM_CLASS.
 *
 * Live root cause (Ubuntu/Cursor, 2026-09-07): with `"nexpath - Cursor"` and `"Cursor"`
 * both open, `wmctrl -x -a cursor` always took the first, so the delivery pasted into a
 * chat the user was not looking at. With a windowTarget the raise resolves the id itself.
 */
describe('⭐ RC73 — targeted window raise', () => {
  const LIVE = [
      '0x03800004  0 cursor.Cursor         emptyops nexpath - Cursor',
      '0x05c00004  0 windsurf.Windsurf     emptyops nexpath - Windsurf',
      '0x0380002f  0 cursor.Cursor         emptyops Cursor',
    ].join('\n');
  function harness(over: Record<string, unknown> = {}) {
    const calls: string[][] = [];
    return {
      calls,
      deps: {
        platform: 'linux' as NodeJS.Platform,
        env: { DISPLAY: ':0' },
        hasCommand: () => true,
        run: (c: string, a: string[]) => { calls.push([c, ...a]); return true; },
        runCapture: (c: string, a: string[]) =>
          c === 'wmctrl' && a[0] === '-lx' ? LIVE
          : c === 'xdotool' ? 'Cursor'
          : null,
        settle: () => {},
        ...over,
      },
    };
  }

  it('⭐ a folder-less Cursor host raises ITS OWN window id, not the first of the class', () => {
    const h = harness();
    expect(raiseAppWindow(['cursor'], { ...h.deps, windowTarget: { appName: 'Cursor' } })).toBe(true);
    expect(h.calls).toEqual([['wmctrl', '-lx'].slice(0, 0).concat(['wmctrl', '-i', '-a', '0x0380002f'])]);
    expect(h.calls.some((c) => c.includes('-x'))).toBe(false); // the class raise never ran
  });

  it('⭐ a project host raises the project window', () => {
    const h = harness({ runCapture: (c: string, a: string[]) => (c === 'wmctrl' && a[0] === '-lx' ? LIVE : 'nexpath - Cursor') });
    expect(raiseAppWindow(['cursor'], { ...h.deps, windowTarget: { appName: 'Cursor', workspaceName: 'nexpath' } })).toBe(true);
    expect(h.calls[0]).toEqual(['wmctrl', '-i', '-a', '0x03800004']);
  });

  it('⭐ Windsurf/Devin hosts resolve their own window by the same rule', () => {
    const h = harness({ runCapture: (c: string, a: string[]) => (c === 'wmctrl' && a[0] === '-lx' ? LIVE : 'nexpath - Windsurf') });
    expect(raiseAppWindow(['devin', 'windsurf'], { ...h.deps, windowTarget: { appName: 'Windsurf', workspaceName: 'nexpath' } })).toBe(true);
    expect(h.calls[0]).toEqual(['wmctrl', '-i', '-a', '0x05c00004']);
  });

  it('⭐ ONE editor window ⇒ one raise and no waiting — the ordinary case costs what it always did', () => {
    const calls: string[][] = []; let settles = 0;
    const ok = raiseAppWindow(['cursor'], {
      platform: 'linux', env: { DISPLAY: ':0' }, hasCommand: () => true,
      run: (c, a) => { calls.push([c, ...a]); return true; },
      runCapture: (c, a) => (c === 'wmctrl' && a[0] === '-lx'
        ? '0x03800004  0 cursor.Cursor         emptyops nexpath - Cursor'
        : 'nexpath - Cursor'),
      settle: () => { settles += 1; },
      windowTarget: { appName: 'Cursor', workspaceName: 'nexpath' },
    });
    expect(ok).toBe(true);
    expect(calls).toEqual([['wmctrl', '-i', '-a', '0x03800004']]); // one call, like the class raise
    expect(settles).toBe(0);                                       // and no confirmation wait
  });

  it('⭐ NO windowTarget ⇒ the pre-RC73 class raise, byte-identical (regression pin)', () => {
    const h = harness();
    expect(raiseAppWindow(['cursor'], h.deps)).toBe(true);
    expect(h.calls).toEqual([['wmctrl', '-x', '-a', 'cursor']]);
  });

  it('falls back to the class raise when the listing is unusable or names no window of ours', () => {
    for (const listing of [null, '', 'garbage']) {
      const h = harness({ runCapture: (c: string, a: string[]) => (c === 'wmctrl' && a[0] === '-lx' ? listing : 'x') });
      expect(raiseAppWindow(['cursor'], { ...h.deps, windowTarget: { appName: 'Cursor' } })).toBe(true);
      expect(h.calls).toEqual([['wmctrl', '-x', '-a', 'cursor']]);
    }
    const other = harness();
    expect(raiseAppWindow(['cursor'], { ...other.deps, windowTarget: { appName: 'Zed' } })).toBe(true);
    expect(other.calls).toEqual([['wmctrl', '-x', '-a', 'cursor']]);
  });

  it('a window id that will not activate moves on to the next candidate', () => {
    const tried: string[] = [];
    const h = harness({
      run: (c: string, a: string[]) => { tried.push(a.join(' ')); return !a.includes('0x0380002f'); },
      runCapture: (c: string, a: string[]) =>
        c === 'wmctrl' && a[0] === '-lx'
          ? ['0x03800004  0 cursor.Cursor         emptyops nexpath - Cursor',
             '0x05c00004  0 windsurf.Windsurf     emptyops nexpath - Windsurf',
             '0x0380002f  0 cursor.Cursor         emptyops Cursor'].join('\n')
          : 'nexpath - Cursor',
    });
    expect(raiseAppWindow(['cursor'], { ...h.deps, windowTarget: { appName: 'Cursor' } })).toBe(true);
    expect(tried).toEqual(['-i -a 0x0380002f', '-i -a 0x03800004']);
  });

  it('settles before verifying (wmctrl returns before the WM switches — measured live)', () => {
    const order: string[] = [];
    const h = harness({
      settle: (ms: number) => order.push(`settle:${ms}`),
      runCapture: (c: string, a: string[]) => { order.push(`capture:${c}`); return c === 'wmctrl' && a[0] === '-lx' ? LIVE : 'Cursor'; },
      run: (c: string, a: string[]) => { order.push(`run:${a.join(' ')}`); return true; },
    });
    raiseAppWindow(['cursor'], { ...h.deps, windowTarget: { appName: 'Cursor' } });
    expect(order).toEqual(['capture:wmctrl', 'run:-i -a 0x0380002f', `settle:${WINDOW_RAISE_SETTLE_MS}`, 'capture:xdotool']);
    expect(WINDOW_RAISE_SETTLE_MS * WINDOW_RAISE_CONFIRM_ATTEMPTS).toBeGreaterThanOrEqual(500);
  });

  it('non-linux is untouched: macOS still activates the app, win32 still refuses', () => {
    const macCalls: string[][] = [];
    expect(raiseAppWindow(['cursor'], {
      platform: 'darwin', env: {}, hasCommand: () => true,
      run: (c, a) => { macCalls.push([c, ...a]); return true; },
      windowTarget: { appName: 'Cursor', workspaceName: 'nexpath' },
    })).toBe(true);
    expect(macCalls[0]![0]).toBe('osascript');
    expect(raiseAppWindow(['cursor'], { platform: 'win32', windowTarget: { appName: 'Cursor' } })).toBe(false);
  });
});

/** ⭐ RC73 — the live-caught defect: a slow window manager must never redirect the raise. */
describe('⭐ RC73 — a slow window manager never causes a DIFFERENT window to be raised', () => {
  const LIVE = [
    '0x03800004  0 cursor.Cursor         emptyops nexpath - Cursor',
    '0x0380002f  0 cursor.Cursor         emptyops Cursor',
  ].join('\n');
  it('⭐ xdotool keeps reporting the previously-active window: we retry the SAME id, never the other one', () => {
    const raised: string[] = [];
    let settles = 0;
    const ok = raiseAppWindow(['cursor'], {
      platform: 'linux', env: { DISPLAY: ':0' }, hasCommand: () => true,
      run: (_c, a) => { if (a[0] === '-i') raised.push(a[2]!); return true; },
      // Never switches — the window manager is busy, as measured on the live box.
      runCapture: (c, a) => (c === 'wmctrl' && a[0] === '-lx' ? LIVE : 'nexpath - Cursor'),
      settle: () => { settles += 1; },
      windowTarget: { appName: 'Cursor' },
    });
    expect(ok).toBe(true);
    expect(raised).toEqual(['0x0380002f']);                 // only the intended window
    expect(raised).not.toContain('0x03800004');
    expect(settles).toBe(WINDOW_RAISE_CONFIRM_ATTEMPTS);    // waited, then gave up waiting — not switching targets
  });
  it('confirmation stops as soon as the intended window is reported active', () => {
    let settles = 0; let reads = 0;
    raiseAppWindow(['cursor'], {
      platform: 'linux', env: { DISPLAY: ':0' }, hasCommand: () => true, run: () => true,
      runCapture: (c, a) => { if (c === 'wmctrl' && a[0] === '-lx') return LIVE; reads += 1; return reads >= 2 ? 'Cursor' : 'some terminal'; },
      settle: () => { settles += 1; },
      windowTarget: { appName: 'Cursor' },
    });
    expect(settles).toBe(2);
  });
});
