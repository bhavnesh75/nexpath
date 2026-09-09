/** ⭐ Uninstall-UX layer 2 — activation consumes the tombstone: mementos cleared, tombstone gone, first-run flow returns. */
import { describe, it, expect, vi } from 'vitest';
import { consumeUninstallTombstone } from './fresh-install.js';
import { tombstonePath, FRESH_INSTALL_MEMENTO_KEYS } from './uninstall-cleanup.js';

const NH = '/home/u/.nexpath';
const deps = (present: string[], over: Partial<Parameters<typeof consumeUninstallTombstone>[0]> = {}) => {
  const files = new Set(present); const cleared: string[] = []; const logs: string[] = [];
  return { files, cleared, logs, d: { extensionPath: '/home/u/.cursor/extensions/x', nexpathHome: NH,
    exists: (p: string) => files.has(p), remove: (p: string) => { files.delete(p); }, clearKey: (k: string) => { cleared.push(k); }, log: (l: string) => { logs.push(l); }, ...over } };
};

describe('consumeUninstallTombstone', () => {
  it('⭐ this editor\'s tombstone ⇒ every memento cleared, tombstone removed, logged', async () => {
    const p = deps([tombstonePath(NH, 'cursor')]);
    expect(await consumeUninstallTombstone(p.d)).toMatchObject({ reset: true, editor: 'cursor', tombstone: tombstonePath(NH, 'cursor') });
    expect(p.cleared).toEqual([...FRESH_INSTALL_MEMENTO_KEYS]);
    expect(p.files.size).toBe(0);
    expect(p.logs.join('\n')).toContain('fresh install after an uninstall (cursor)');
  });
  it('no tombstone ⇒ nothing cleared; another editor\'s tombstone is NOT ours', async () => {
    const none = deps([]); expect(await consumeUninstallTombstone(none.d)).toEqual({ reset: false, editor: 'cursor' }); expect(none.cleared).toEqual([]);
    const other = deps([tombstonePath(NH, 'windsurf')]); expect((await consumeUninstallTombstone(other.d)).reset).toBe(false); expect(other.files.size).toBe(1);
  });
  it('an "unknown"-editor tombstone is honoured by whichever editor sees it first', async () => {
    const p = deps([tombstonePath(NH, 'unknown')]);
    expect((await consumeUninstallTombstone(p.d)).reset).toBe(true); expect(p.files.size).toBe(0);
  });
  it('⭐ the detected host wins over the install path (custom extensions dir), and its tombstone is the one consumed', async () => {
    const p = deps([tombstonePath(NH, 'windsurf')], { extensionPath: '/tmp/profile/ext/nexpath.nexpath-vscode-0.1.36', host: 'windsurf' });
    expect(await consumeUninstallTombstone(p.d)).toMatchObject({ reset: true, editor: 'windsurf' });
    expect(p.files.size).toBe(0);
    const generic = deps([tombstonePath(NH, 'vscode')], { extensionPath: '/opt/x', host: 'vscode-generic' });
    expect((await consumeUninstallTombstone(generic.d)).reset).toBe(true);
  });
  it('never throws: a failing clearKey or remove is logged and the reset still reports', async () => {
    const p = deps([tombstonePath(NH, 'cursor')], { clearKey: vi.fn(() => { throw new Error('memento locked'); }), remove: () => { throw new Error('EPERM'); } });
    expect((await consumeUninstallTombstone(p.d)).reset).toBe(true);
    expect(p.logs.filter((l) => l.includes('could not')).length).toBeGreaterThanOrEqual(2);
  });
});
