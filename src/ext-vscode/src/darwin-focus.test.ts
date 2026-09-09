/** ⭐ F-9 — darwin foreground targeting (pure; a Mac was not available, so the script + matching are pinned). */
import { describe, it, expect, vi } from 'vitest';
import {
  darwinAppCandidates, buildDarwinActivateScript, DARWIN_FRONTMOST_SCRIPT,
  activateDarwinApp, frontmostDarwinApp, darwinEditorIsFrontmost,
  buildDarwinActivateWindowScript, activateDarwinAppWindow,
} from './darwin-focus.js';

describe('⭐ F-9 — candidates', () => {
  it('live appName first, then the product names; deduped case-insensitively; blanks dropped', () => {
    expect(darwinAppCandidates('Devin Next', 'windsurf')).toEqual(['Devin Next', 'Devin', 'Windsurf']);
    expect(darwinAppCandidates('cursor', 'cursor')).toEqual(['cursor']);
    expect(darwinAppCandidates('  ', 'cursor')).toEqual(['Cursor']);
    expect(darwinAppCandidates(undefined, 'windsurf')).toEqual(['Devin', 'Windsurf']);
  });
});

describe('⭐ F-9 — activation script', () => {
  it('targets RUNNING processes via System Events (never `tell application "<name>"`, which can open the "Where is…?" chooser), in candidate order, and errors when none runs', () => {
    const s = buildDarwinActivateScript(['Devin', 'Windsurf']);
    expect(s).toContain('tell application "System Events"');
    expect(s).toContain('repeat with n in {"Devin", "Windsurf"}');
    expect(s).toContain('if exists (first application process whose name is (n as text)) then');
    expect(s).toContain('set frontmost of (first application process whose name is (n as text)) to true');
    expect(s).toContain('error "nexpath: editor process not running"');
    expect(s).not.toMatch(/tell application "(Devin|Windsurf)"/);
  });
  it('strips quotes/backslashes from names so a rebrand can never break out of the string literal', () => {
    expect(buildDarwinActivateScript(['Dev"in\\'])).toContain('{"Devin"}');
  });
  it('activateDarwinApp runs osascript with the script; empty candidates ⇒ false without spawning', () => {
    const run = vi.fn(() => true);
    expect(activateDarwinApp(['Cursor'], { run })).toBe(true);
    expect(run).toHaveBeenCalledWith('osascript', ['-e', buildDarwinActivateScript(['Cursor'])]);
    const none = vi.fn(() => true);
    expect(activateDarwinApp([], { run: none })).toBe(false);
    expect(none).not.toHaveBeenCalled();
  });
});

describe('⭐ F-9 — frontmost check', () => {
  it('reads the frontmost process name through System Events', () => {
    const runCapture = vi.fn(() => ' Cursor \n');
    expect(frontmostDarwinApp({ runCapture })).toBe('Cursor');
    expect(runCapture).toHaveBeenCalledWith('osascript', ['-e', DARWIN_FRONTMOST_SCRIPT]);
  });
  it('matches exact and prefix-with-separator (rebrand suffixes), case-insensitively; never a bare substring', () => {
    const at = (name: string) => ({ runCapture: () => name });
    expect(darwinEditorIsFrontmost(['Cursor'], at('Cursor'))).toBe(true);
    expect(darwinEditorIsFrontmost(['Devin'], at('Devin Next'))).toBe(true);
    expect(darwinEditorIsFrontmost(['windsurf'], at('Windsurf'))).toBe(true);
    expect(darwinEditorIsFrontmost(['Cursor'], at('Precursor'))).toBe(false);
    expect(darwinEditorIsFrontmost(['Cursor'], at('Terminal'))).toBe(false);
  });
  it('⭐ unreadable frontmost (no Accessibility / no osascript) ⇒ false — a keystroke we cannot target must not fire', () => {
    expect(darwinEditorIsFrontmost(['Cursor'], { runCapture: () => null })).toBe(false);
    expect(darwinEditorIsFrontmost(['Cursor'], { runCapture: () => '' })).toBe(false);
  });
});

/**
 * ⭐ RC74 (macOS) — raise one WINDOW of the editor, not just the application.
 * ⚠ Script shape only: no Mac was available, so every failure path falls back to the
 * shipped app-fronting behaviour.
 */
describe('⭐ RC74 — activateDarwinAppWindow', () => {
  it('⭐ raises the window carrying this workspace, then fronts the process', () => {
    const ps = buildDarwinActivateWindowScript(['Cursor'], 'nexpath');
    expect(ps).toContain('first application process whose name is (n as text)');
    expect(ps).toContain('if exists (first window of p whose name contains "nexpath")');
    expect(ps).toContain('perform action "AXRaise" of (first window of p whose name contains "nexpath")');
    expect(ps.indexOf('AXRaise')).toBeLessThan(ps.indexOf('set frontmost of p to true'));
    expect(ps).toContain('error "nexpath: no editor window matching this workspace"');
  });
  it('quoting matches the shipped activate script (quotes stripped, never escaped out of the literal)', () => {
    const ps = buildDarwinActivateWindowScript(['Devin "Next"'], 'my "repo"');
    expect(ps).toContain(buildDarwinActivateScript(['Devin "Next"']).match(/\{(.*?)\}/)![1]!);
    expect(ps).toContain('name contains "my repo"');
    expect(ps).not.toContain('\\');
  });
  it('⭐ a workspace name is tried first; without one, or on failure, the app is fronted exactly as before', () => {
    const one: string[] = [];
    expect(activateDarwinAppWindow(['Cursor'], 'nexpath', { run: (_c, a) => { one.push(a[1]!); return true; } })).toBe(true);
    expect(one).toHaveLength(1);
    expect(one[0]).toContain('AXRaise');

    const both: string[] = [];
    expect(activateDarwinAppWindow(['Cursor'], 'nexpath', {
      run: (_c, a) => { both.push(a[1]!); return !a[1]!.includes('AXRaise'); },
    })).toBe(true);
    expect(both[1]).toBe(buildDarwinActivateScript(['Cursor']));   // the shipped fallback, byte-identical

    const plain: string[] = [];
    activateDarwinAppWindow(['Cursor'], undefined, { run: (_c, a) => { plain.push(a[1]!); return true; } });
    expect(plain).toEqual([buildDarwinActivateScript(['Cursor'])]);
    expect(activateDarwinAppWindow([], 'nexpath', { run: () => true })).toBe(false);
  });
});
