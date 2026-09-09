/** ⭐ Uninstall-UX layer 2 — the pure cleanup: per-editor hook strip, shared artefacts only when unreferenced, tombstone. */
import { describe, it, expect } from 'vitest';
import {
  editorFromExtensionPath, editorFromExecPath, resolveEditor, stripNexpathHooks, stagedCliReferenced, runUninstallCleanup, tombstonePath, hooksFileFor, FRESH_INSTALL_MEMENTO_KEYS,
} from './uninstall-cleanup.js';

const H = '/home/u'; const NH = '/home/u/.nexpath';
const cursorHooks = () => ({ version: 1, hooks: {
  beforeSubmitPrompt: [{ command: '"/usr/bin/node" "/home/u/.nexpath/cli/0.1.4/dist/cli/index.js" cursor-hook beforeSubmitPrompt', timeout: 120 }, { command: 'other-tool --pre' }],
  afterAgentResponse: [{ command: '"/usr/bin/node" "/home/u/.nexpath/cli/0.1.4/dist/cli/index.js" cursor-hook afterAgentResponse' }],
  someOtherEvent: [{ command: 'keep-me' }],
} });
const windsurfHooks = () => ({ hooks: {
  pre_user_prompt: [{ command: '"/usr/bin/node" "/home/u/.nexpath/cli/0.1.4/dist/cli/index.js" windsurf-hook pre_user_prompt', powershell: '& "C:/node.exe" "C:/x/index.js" windsurf-hook pre_user_prompt; exit $LASTEXITCODE' }],
  post_cascade_response: [{ command: 'other --post' }, { powershell: '& node x windsurf-hook post_cascade_response' }],
} });
function memFs(files: Record<string, string>, dirs: string[] = []) {
  const f = new Map(Object.entries(files)); const d = new Set(dirs); const removed: string[] = [];
  return { removed, files: f,
    fs: { exists: (p: string) => f.has(p) || d.has(p), readText: (p: string) => { const v = f.get(p); if (v === undefined) throw new Error('ENOENT ' + p); return v; },
      writeText: (p: string, t: string) => { f.set(p, t); }, readdir: (p: string) => [...f.keys()].filter((k) => k.startsWith(p + '/')).map((k) => k.slice(p.length + 1)).filter((k) => !k.includes('/')),
      remove: (p: string) => { removed.push(p); f.delete(p); d.delete(p); for (const k of [...f.keys()]) if (k.startsWith(p + '/')) f.delete(k); } } };
}

describe('editorFromExtensionPath', () => {
  it('reads the editor from the install location on both separators', () => {
    expect(editorFromExtensionPath('/home/u/.cursor/extensions/nexpath.nexpath-vscode-0.1.36-linux-x64')).toBe('cursor');
    expect(editorFromExtensionPath('C:\\Users\\u\\.windsurf\\extensions\\nexpath.nexpath-vscode-0.1.36-win32-x64')).toBe('windsurf');
    expect(editorFromExtensionPath('/home/u/.vscode/extensions/x')).toBe('vscode');
    expect(editorFromExtensionPath('/opt/somewhere/x')).toBe('unknown');
    expect(editorFromExtensionPath(undefined)).toBe('unknown');
  });
});

describe('editorFromExecPath / resolveEditor', () => {
  it('⭐ names the editor from its binary on every platform layout; a custom extensions dir falls back to it', () => {
    expect(editorFromExecPath('/usr/share/windsurf/windsurf')).toBe('windsurf');
    expect(editorFromExecPath('/tmp/x/squashfs-root/usr/share/cursor/cursor')).toBe('cursor');
    expect(editorFromExecPath('C:\\Users\\u\\AppData\\Local\\Programs\\Windsurf\\Windsurf.exe')).toBe('windsurf');
    expect(editorFromExecPath('C:\\Users\\u\\AppData\\Local\\Programs\\cursor\\Cursor.exe')).toBe('cursor');
    expect(editorFromExecPath('/Applications/Windsurf.app/Contents/MacOS/Electron')).toBe('windsurf');
    expect(editorFromExecPath('/Applications/Cursor.app/Contents/MacOS/Cursor')).toBe('cursor');
    expect(editorFromExecPath('/usr/share/code/code')).toBe('vscode');
    expect(editorFromExecPath('/Applications/Visual Studio Code.app/Contents/MacOS/Electron')).toBe('vscode');
    expect(editorFromExecPath('/home/cursor/tools/node/bin/node')).toBe('unknown'); // a home dir is not an app dir
    expect(editorFromExecPath(undefined)).toBe('unknown');
    expect(resolveEditor({ extensionPath: '/home/u/.cursor/extensions/x', execPath: '/usr/share/windsurf/windsurf' })).toBe('cursor');
    expect(resolveEditor({ extensionPath: '/tmp/profile/ext/nexpath.nexpath-vscode-0.1.36', execPath: '/usr/share/windsurf/windsurf' })).toBe('windsurf');
  });
});

describe('stripNexpathHooks', () => {
  it('⭐ removes only our entries for the editor\'s events; other tools, other events and top-level keys survive', () => {
    const r = stripNexpathHooks(cursorHooks(), 'cursor');
    expect(r.changed).toBe(true);
    const d = r.data as { version: number; hooks: Record<string, unknown[]> };
    expect(d.version).toBe(1);
    expect(d.hooks.beforeSubmitPrompt).toEqual([{ command: 'other-tool --pre' }]);
    expect(d.hooks.afterAgentResponse).toBeUndefined(); // emptied ⇒ deleted, as the CLI does
    expect(d.hooks.someOtherEvent).toEqual([{ command: 'keep-me' }]);
  });
  it('windsurf: the powershell shape counts too; nothing changes when nothing is ours', () => {
    const r = stripNexpathHooks(windsurfHooks(), 'windsurf');
    const d = r.data as { hooks: Record<string, unknown[]> };
    expect(d.hooks.pre_user_prompt).toBeUndefined();
    expect(d.hooks.post_cascade_response).toEqual([{ command: 'other --post' }]);
    expect(stripNexpathHooks({ hooks: { pre_user_prompt: [{ command: 'x' }] } }, 'windsurf').changed).toBe(false);
    expect(stripNexpathHooks(null, 'cursor').changed).toBe(false);
  });
});

describe('stagedCliReferenced', () => {
  it('sees bash, escaped-JSON and PowerShell shapes; ignores unrelated paths', () => {
    expect(stagedCliReferenced(['"/usr/bin/node" "/home/u/.nexpath/cli/0.1.4/dist/cli/index.js"'], NH)).toBe(true);
    expect(stagedCliReferenced([JSON.stringify({ command: '"C:\\Users\\u\\.nexpath\\cli\\0.1.5\\dist\\cli\\index.js"' })], 'C:\\Users\\u\\.nexpath')).toBe(true);
    expect(stagedCliReferenced(['node /usr/lib/nexpath/dist/cli/index.js'], NH)).toBe(false);
  });
});

describe('⭐ runUninstallCleanup', () => {
  const base = () => memFs({
    [`${H}/.cursor/hooks.json`]: JSON.stringify(cursorHooks()),
    [`${H}/.codeium/windsurf/hooks.json`]: JSON.stringify(windsurfHooks()),
    [`${NH}/nexpath-setup-runner.cjs`]: 'x', [`${NH}/.setup-sentinel`]: 'x', [`${NH}/session-env.json`]: '{}',
    [`${NH}/submit-flow.json`]: JSON.stringify({ cursor: true, windsurf: true }),
    [`${NH}/deliverer-cursor-1.json`]: '{}', [`${NH}/deliverer-windsurf-2.json`]: '{}',
    [`${NH}/prompt-store.db`]: 'DB', [`${NH}/config.json`]: '{}', [`${NH}/nexpath.log`]: 'log',
  }, [NH, `${NH}/cli`, `${NH}/bin`]);

  it('uninstalled from Cursor while Windsurf still points at the staged CLI ⇒ cursor hooks stripped, shared artefacts KEPT, cursor key + beats gone, tombstone written', () => {
    const m = base();
    const r = runUninstallCleanup({ extensionPath: `${H}/.cursor/extensions/nexpath.nexpath-vscode-0.1.36-linux-x64`, home: H, nexpathHome: NH, version: '0.1.36', now: 5, fs: m.fs });
    expect(r.editor).toBe('cursor'); expect(r.hooksStripped).toBe(true); expect(r.sharedRemoved).toBe(false); expect(r.errors).toEqual([]);
    const cursor = JSON.parse(m.files.get(`${H}/.cursor/hooks.json`)!) as { hooks: Record<string, unknown[]> };
    expect(cursor.hooks.beforeSubmitPrompt).toEqual([{ command: 'other-tool --pre' }]);
    expect(JSON.parse(m.files.get(`${H}/.codeium/windsurf/hooks.json`)!)).toEqual(windsurfHooks()); // untouched
    expect(m.fs.exists(`${NH}/cli`)).toBe(true); expect(m.fs.exists(`${NH}/bin`)).toBe(true); expect(m.fs.exists(`${NH}/.setup-sentinel`)).toBe(true);
    expect(JSON.parse(m.files.get(`${NH}/submit-flow.json`)!)).toEqual({ windsurf: true });
    expect(m.fs.exists(`${NH}/deliverer-cursor-1.json`)).toBe(false); expect(m.fs.exists(`${NH}/deliverer-windsurf-2.json`)).toBe(true);
    expect(JSON.parse(m.files.get(tombstonePath(NH, 'cursor'))!)).toMatchObject({ schemaVersion: 1, editor: 'cursor', version: '0.1.36', at: 5 });
    for (const keep of ['prompt-store.db', 'config.json', 'nexpath.log']) expect(m.fs.exists(`${NH}/${keep}`)).toBe(true);
  });

  it('⭐ the LAST editor uninstalling ⇒ shared artefacts removed too; user data never', () => {
    const m = base();
    runUninstallCleanup({ extensionPath: `${H}/.cursor/extensions/x`, home: H, nexpathHome: NH, version: '0.1.36', now: 1, fs: m.fs });
    const r = runUninstallCleanup({ extensionPath: `${H}/.windsurf/extensions/x`, home: H, nexpathHome: NH, version: '0.1.36', now: 2, fs: m.fs });
    expect(r.editor).toBe('windsurf'); expect(r.sharedRemoved).toBe(true);
    for (const gone of ['cli', 'bin', 'nexpath-setup-runner.cjs', '.setup-sentinel', 'session-env.json', 'submit-flow.json']) expect(m.fs.exists(`${NH}/${gone}`)).toBe(false);
    for (const keep of ['prompt-store.db', 'config.json', 'nexpath.log']) expect(m.fs.exists(`${NH}/${keep}`)).toBe(true);
    expect(m.fs.exists(tombstonePath(NH, 'cursor'))).toBe(true); expect(m.fs.exists(tombstonePath(NH, 'windsurf'))).toBe(true);
  });

  it('⭐ a custom extensions dir (as VS Code forks the hook) still cleans the right editor via execPath', () => {
    const m = base();
    const r = runUninstallCleanup({ extensionPath: '/tmp/profile/ext/nexpath.nexpath-vscode-0.1.36', execPath: '/usr/share/windsurf/windsurf', home: H, nexpathHome: NH, version: '0.1.36', now: 1, fs: m.fs });
    expect(r.editor).toBe('windsurf'); expect(r.hooksStripped).toBe(true);
    expect(m.fs.exists(tombstonePath(NH, 'windsurf'))).toBe(true);
  });

  it('an unidentified install location touches nothing but still leaves a tombstone; a corrupt hooks file is reported, not thrown', () => {
    const m = base();
    const r = runUninstallCleanup({ extensionPath: '/opt/x', home: H, nexpathHome: NH, version: '0.1.36', now: 1, fs: m.fs });
    expect(r.editor).toBe('unknown'); expect(r.hooksStripped).toBe(false); expect(r.sharedRemoved).toBe(false); expect(r.removed).toEqual([]);
    expect(m.fs.exists(tombstonePath(NH, 'unknown'))).toBe(true);
    const bad = memFs({ [`${H}/.cursor/hooks.json`]: '{not json' }, [NH]);
    const r2 = runUninstallCleanup({ extensionPath: `${H}/.cursor/extensions/x`, home: H, nexpathHome: NH, version: 'v', now: 1, fs: bad.fs });
    expect(r2.errors.some((e) => e.startsWith('hooks:'))).toBe(true);
    expect(bad.fs.exists(tombstonePath(NH, 'cursor'))).toBe(true);
  });

  it('hooks file locations + memento list are the shipped ones', () => {
    expect(hooksFileFor('cursor', H)).toBe(`${H}/.cursor/hooks.json`);
    expect(hooksFileFor('windsurf', H)).toBe(`${H}/.codeium/windsurf/hooks.json`);
    expect(hooksFileFor('vscode', H)).toBeNull();
    expect([...FRESH_INSTALL_MEMENTO_KEYS]).toEqual(['nexpath.cliSetup', 'nexpath.consentGranted', 'nexpath.fdaNoticeShown', 'nexpath.fallbackHintShown', 'nexpath.credentialNoticeAt']);
  });
});
