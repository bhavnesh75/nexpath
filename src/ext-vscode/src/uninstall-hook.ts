/**
 * `vscode:uninstall` entry (bundled to out/uninstall.cjs). Runs as a plain node
 * script the next time the editor starts after the extension was uninstalled —
 * no vscode API, no imports from the bundle. All logic lives in
 * uninstall-cleanup.ts (pure, tested); this file only supplies the real fs and
 * appends one line to ~/.nexpath/ext-uninstall.log. Exit 0 whatever happens.
 */
import { existsSync, readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { runUninstallCleanup, UNINSTALL_LOG_FILENAME } from './uninstall-cleanup.js';

export function runUninstallHook(): void {
  const home = homedir();
  const nexpathHome = join(home, '.nexpath');
  // VS Code forks the hook WITHOUT setting cwd (it inherits the editor's own, spike-verified on
  // Windsurf and Cursor), so the script's location — <extension>/out/uninstall.cjs — is the only
  // reliable pointer to the extension dir; cwd is a last resort.
  const cwd = process.cwd();
  const fromScript = dirname(__dirname);
  const extensionPath = existsSync(join(fromScript, 'package.json')) ? fromScript : cwd;
  let version = 'unknown';
  try { version = String((JSON.parse(readFileSync(join(extensionPath, 'package.json'), 'utf8')) as { version?: unknown }).version ?? 'unknown'); } catch { /* keep unknown */ }
  const report = runUninstallCleanup({
    extensionPath, execPath: process.execPath, home, nexpathHome, version, now: Date.now(),
    fs: {
      exists: (p) => existsSync(p),
      readText: (p) => readFileSync(p, 'utf8'),
      writeText: (p, t) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, t, 'utf8'); },
      readdir: (p) => readdirSync(p),
      remove: (p) => rmSync(p, { recursive: true, force: true }),
    },
  });
  try {
    appendFileSync(join(nexpathHome, UNINSTALL_LOG_FILENAME),
      `${new Date().toISOString()} uninstall-hook ${JSON.stringify({ editor: report.editor, version, extensionPath, execPath: process.execPath, cwd, hooksStripped: report.hooksStripped, sharedRemoved: report.sharedRemoved, removed: report.removed.length, errors: report.errors })}\n`);
  } catch { /* nothing left to report to */ }
}

runUninstallHook();
