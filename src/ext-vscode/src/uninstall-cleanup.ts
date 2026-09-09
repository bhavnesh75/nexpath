/**
 * Uninstall-UX layer 2 (locked 2026-08-11, built 2026-09-07) — the pure core of
 * the extension's `vscode:uninstall` hook and of the activation-time reset.
 *
 * ── THE PROBLEM ──────────────────────────────────────────────────────────────
 * Uninstalling the extension from an editor left the pipeline RUNNING: the
 * editor's hooks.json still pointed at the staged CLI under ~/.nexpath/cli, so
 * popups kept firing with the extension gone. And the five setup/consent
 * mementos live in the editor's globalState, which survives an uninstall — so a
 * reinstall skipped the Allow toast and the Setup offer instead of starting
 * fresh.
 *
 * ── WHAT THIS DOES (no vscode API — the hook is a plain node script) ─────────
 * 1. Which editor uninstalled us is read from the extension's own install path
 *    (`~/.cursor/extensions/…`, `~/.windsurf/extensions/…`, `~/.vscode/…`).
 * 2. Strip OUR entries from THAT editor's user-level hooks.json only — the same
 *    identification the CLI uses (`cursor-hook` / `windsurf-hook` in the
 *    command), the same event lists, other tools' entries and keys preserved.
 * 3. Shared artefacts (staged CLI dirs, launcher shim, setup runner + sentinel,
 *    session-env snapshot) are removed only when NO editor's hooks.json still
 *    references ~/.nexpath/cli — uninstalling from Windsurf must not break a
 *    Cursor that is still set up. This editor's key leaves submit-flow.json and
 *    its heartbeat files go.
 * 4. A per-editor tombstone is written; on the next activation in that editor
 *    the mementos are cleared and the tombstone consumed, so Allow + Setup run
 *    again exactly like a first install.
 *
 * Never touched: the prompt store, config/credential, hook-stats, telemetry,
 * nexpath.log — user data shared with the CLI's other agents; `nexpath
 * uninstall` owns those (with an explicit purge). Never touched: the editor's
 * own state.vscdb. Everything is best-effort and fail-quiet.
 */

export type EditorId = 'cursor' | 'windsurf' | 'vscode' | 'unknown';

export const TOMBSTONE_PREFIX = '.ext-uninstalled-';
export const UNINSTALL_LOG_FILENAME = 'ext-uninstall.log';

/** The globalState mementos a fresh install must not inherit. */
export const FRESH_INSTALL_MEMENTO_KEYS = [
  'nexpath.cliSetup',
  'nexpath.consentGranted',
  'nexpath.fdaNoticeShown',
  'nexpath.fallbackHintShown',
  'nexpath.credentialNoticeAt',
] as const;

/** `~/.cursor/extensions/<id>` ⇒ cursor; `~/.windsurf/extensions/<id>` ⇒ windsurf; `~/.vscode/…` ⇒ vscode. */
export function editorFromExtensionPath(extensionPath: unknown): EditorId {
  const p = String(extensionPath ?? '').replace(/\\/g, '/');
  if (/\/\.cursor\/extensions\//.test(p)) return 'cursor';
  if (/\/\.windsurf\/extensions\//.test(p)) return 'windsurf';
  if (/\/\.vscode(?:-[a-z]+)?\/extensions\//.test(p)) return 'vscode';
  return 'unknown';
}

/**
 * Editor from the process that runs the hook. VS Code forks `vscode:uninstall` with its own
 * Electron binary as node, so `process.execPath` names the editor even when the extensions
 * directory is custom (`--extensions-dir`, portable mode). Only the last four path segments
 * are consulted (app dir + binary, `X.app/Contents/MacOS/Electron` on macOS) so a home
 * directory that happens to contain "cursor" cannot mislead it.
 */
export function editorFromExecPath(execPath: unknown): EditorId {
  const segs = String(execPath ?? '').replace(/\\/g, '/').split('/').filter(Boolean).slice(-4);
  for (const seg of segs) {
    if (/^windsurf(\.exe|\.app|\.appimage)?$/i.test(seg)) return 'windsurf';
    if (/^cursor(\.exe|\.app|\.appimage)?$/i.test(seg)) return 'cursor';
  }
  for (const seg of segs) {
    if (/^(code|code-insiders|code - insiders|codium|vscodium)(\.exe)?$/i.test(seg)) return 'vscode';
    if (/^(visual studio code( - insiders)?|vscodium|codium)\.app$/i.test(seg)) return 'vscode';
  }
  return 'unknown';
}

/** Install location first (the default `~/.<editor>/extensions` layout), then the editor binary. */
export function resolveEditor(signals: { extensionPath?: unknown; execPath?: unknown }): EditorId {
  const fromPath = editorFromExtensionPath(signals.extensionPath);
  return fromPath !== 'unknown' ? fromPath : editorFromExecPath(signals.execPath);
}

export function tombstonePath(nexpathHome: string, editor: EditorId): string {
  return `${nexpathHome.replace(/[\\/]+$/, '')}/${TOMBSTONE_PREFIX}${editor}.json`;
}

const CURSOR_EVENTS = ['beforeSubmitPrompt', 'afterAgentResponse'] as const;
const WINDSURF_EVENTS = ['pre_user_prompt', 'post_cascade_response'] as const;

/** Mirror of the CLI's isNexpathCursorHook / isNexpathWindsurfHook — a command-substring marker, no fields of our own. */
function isOurs(editor: 'cursor' | 'windsurf', entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as { command?: unknown; powershell?: unknown };
  const has = (v: unknown, m: string): boolean => typeof v === 'string' && v.includes(m);
  return editor === 'cursor' ? has(e.command, 'cursor-hook') : (has(e.command, 'windsurf-hook') || has(e.powershell, 'windsurf-hook'));
}

/** Remove our entries from a parsed hooks.json; other tools' entries and top-level keys are preserved. */
export function stripNexpathHooks(data: unknown, editor: 'cursor' | 'windsurf'): { changed: boolean; data: unknown } {
  if (!data || typeof data !== 'object') return { changed: false, data };
  const root = data as Record<string, unknown>;
  const hooks = root.hooks && typeof root.hooks === 'object' ? (root.hooks as Record<string, unknown>) : null;
  if (!hooks) return { changed: false, data };
  let changed = false;
  for (const event of editor === 'cursor' ? CURSOR_EVENTS : WINDSURF_EVENTS) {
    const list = hooks[event];
    if (!Array.isArray(list)) continue;
    const kept = list.filter((h) => !isOurs(editor, h));
    if (kept.length !== list.length) changed = true;
    if (kept.length === 0) delete hooks[event]; else hooks[event] = kept;
  }
  return { changed, data: root };
}

/** The user-level hooks file each editor reads (project-level Cursor files are not tracked here). */
export function hooksFileFor(editor: EditorId, home: string): string | null {
  const h = home.replace(/[\\/]+$/, '');
  if (editor === 'cursor') return `${h}/.cursor/hooks.json`;
  if (editor === 'windsurf') return `${h}/.codeium/windsurf/hooks.json`;
  return null;
}

/** Does any hook command still point into `<nexpathHome>/cli/`? Separator-agnostic (bash and PowerShell shapes). */
export function stagedCliReferenced(hooksTexts: readonly string[], nexpathHome: string): boolean {
  const needle = `${nexpathHome.replace(/\\/g, '/').replace(/\/+$/, '')}/cli/`.toLowerCase();
  return hooksTexts.some((t) => t.replace(/\\\\/g, '/').replace(/\\/g, '/').toLowerCase().includes(needle));
}

export interface CleanupFs {
  exists: (p: string) => boolean;
  readText: (p: string) => string;
  writeText: (p: string, text: string) => void;
  readdir: (p: string) => string[];
  /** Remove a file or directory tree; must not throw when absent. */
  remove: (p: string) => void;
}

export interface CleanupInput {
  extensionPath: string;
  /** `process.execPath` of the hook process — the editor's own binary. */
  execPath?: string;
  home: string;
  nexpathHome: string;
  version: string;
  now: number;
  fs: CleanupFs;
}

export interface CleanupReport {
  editor: EditorId;
  hooksFile: string | null;
  hooksStripped: boolean;
  sharedRemoved: boolean;
  removed: string[];
  tombstone: string;
  errors: string[];
}

const SHARED_ARTEFACTS = ['cli', 'bin', 'nexpath-setup-runner.cjs', '.setup-sentinel', 'session-env.json'] as const;

/** The whole cleanup, pure over `fs`. Never throws — every step records its own error and the rest continues. */
export function runUninstallCleanup(input: CleanupInput): CleanupReport {
  const { fs } = input;
  const nh = input.nexpathHome.replace(/[\\/]+$/, '');
  const editor = resolveEditor({ extensionPath: input.extensionPath, execPath: input.execPath });
  const report: CleanupReport = {
    editor, hooksFile: hooksFileFor(editor, input.home), hooksStripped: false, sharedRemoved: false,
    removed: [], tombstone: tombstonePath(nh, editor), errors: [],
  };
  const attempt = (label: string, fn: () => void): void => {
    try { fn(); } catch (err) { report.errors.push(`${label}: ${(err as Error)?.message ?? String(err)}`); }
  };

  // 2. this editor's hooks only
  if ((editor === 'cursor' || editor === 'windsurf') && report.hooksFile && fs.exists(report.hooksFile)) {
    const file = report.hooksFile;
    attempt('hooks', () => {
      const parsed = JSON.parse(fs.readText(file)) as unknown;
      const { changed, data } = stripNexpathHooks(parsed, editor);
      if (changed) { fs.writeText(file, JSON.stringify(data, null, 2) + '\n'); report.hooksStripped = true; }
    });
  }

  // 3. shared artefacts — only when no editor still points at the staged CLI
  if (editor !== 'unknown') {
    attempt('shared', () => {
      const texts: string[] = [];
      for (const other of ['cursor', 'windsurf'] as const) {
        const f = hooksFileFor(other, input.home);
        if (f && fs.exists(f)) texts.push(fs.readText(f));
      }
      if (!stagedCliReferenced(texts, nh)) {
        for (const name of SHARED_ARTEFACTS) {
          const p = `${nh}/${name}`;
          if (fs.exists(p)) { fs.remove(p); report.removed.push(p); }
        }
        report.sharedRemoved = true;
      }
    });
    attempt('submit-flow', () => {
      const flag = `${nh}/submit-flow.json`;
      if ((editor === 'cursor' || editor === 'windsurf') && fs.exists(flag)) {
        const data = JSON.parse(fs.readText(flag)) as Record<string, unknown>;
        if (editor in data) {
          delete data[editor];
          const anyOn = Object.values(data).some((v) => v === true);
          if (anyOn) fs.writeText(flag, JSON.stringify(data, null, 2) + '\n');
          else { fs.remove(flag); report.removed.push(flag); }
        }
      }
    });
    attempt('heartbeats', () => {
      if (editor !== 'cursor' && editor !== 'windsurf') return;
      if (!fs.exists(nh)) return;
      for (const name of fs.readdir(nh)) {
        if (name.startsWith(`deliverer-${editor}-`) && name.endsWith('.json')) { fs.remove(`${nh}/${name}`); report.removed.push(`${nh}/${name}`); }
      }
    });
  }

  // 4. tombstone — the reinstall reset key (written even when the steps above failed)
  attempt('tombstone', () => {
    fs.writeText(report.tombstone, JSON.stringify({ schemaVersion: 1, editor, version: input.version, at: input.now }) + '\n');
  });
  return report;
}
