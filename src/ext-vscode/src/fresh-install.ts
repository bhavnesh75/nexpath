/**
 * Uninstall-UX layer 2, activation side: consume the tombstone the
 * `vscode:uninstall` hook left for THIS editor and clear the mementos, so a
 * reinstall runs the Allow toast and the Setup offer again. A tombstone from
 * an unidentified editor ('unknown') is honoured by whichever editor sees it
 * first. Pure over its ports; never throws.
 */
import { editorFromExtensionPath, tombstonePath, FRESH_INSTALL_MEMENTO_KEYS, type EditorId } from './uninstall-cleanup.js';

export interface FreshInstallDeps {
  extensionPath: string;
  /** `detectHost()` result — the editor we actually run in, independent of the install path. */
  host?: string;
  nexpathHome: string;
  exists: (p: string) => boolean;
  remove: (p: string) => void;
  clearKey: (key: string) => PromiseLike<void> | void;
  log?: (line: string) => void;
}

export interface FreshInstallResult { reset: boolean; editor: EditorId; tombstone?: string }

export async function consumeUninstallTombstone(deps: FreshInstallDeps): Promise<FreshInstallResult> {
  const fromHost: EditorId | null =
    deps.host === 'cursor' || deps.host === 'windsurf' ? deps.host : deps.host === 'vscode-generic' ? 'vscode' : null;
  const fromPath = editorFromExtensionPath(deps.extensionPath);
  const editor: EditorId = fromHost ?? fromPath;
  try {
    const candidates = [...new Set<EditorId>([editor, fromPath, 'unknown'])].map((e) => tombstonePath(deps.nexpathHome, e));
    const found = candidates.find((p) => deps.exists(p));
    if (!found) return { reset: false, editor };
    for (const key of FRESH_INSTALL_MEMENTO_KEYS) {
      try { await deps.clearKey(key); } catch (err) { deps.log?.(`[nexpath] fresh-install reset: could not clear ${key}: ${(err as Error)?.message ?? String(err)}`); }
    }
    try { deps.remove(found); } catch (err) { deps.log?.(`[nexpath] fresh-install reset: could not remove the tombstone: ${(err as Error)?.message ?? String(err)}`); }
    deps.log?.(`[nexpath] fresh install after an uninstall (${editor}) — setup state reset; the first-run flow runs again`);
    return { reset: true, editor, tombstone: found };
  } catch (err) {
    deps.log?.(`[nexpath] fresh-install check failed: ${err instanceof Error ? err.message : String(err)}`);
    return { reset: false, editor };
  }
}
