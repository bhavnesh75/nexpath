import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { registerAdapter } from '../registry.js';
import type {
  InstallContext,
  InstallResult,
  VSCodeExtensionAdapter,
} from '../types.js';

/**
 * Cursor adapter (M9 of M2 Branch 4).
 *
 * Cursor is a VS Code fork. Nexpath integrates via a companion VS Code
 * extension that runs INSIDE Cursor (sub-package at `src/ext-vscode/`).
 * This CLI-side adapter only handles install-time concerns:
 *   1. Detect whether Cursor is installed on this machine.
 *   2. Print deep-link instructions for the user to install the extension
 *      via Open VSX (Cursor's marketplace).
 *   3. Self-register with the agent registry so `nexpath install` picks
 *      it up automatically.
 *
 * The actual runtime work (watching `state.vscdb`, rendering the
 * decision-session webview, injecting selected options into the chat
 * input) happens inside the VS Code extension at activation time — see
 * `src/ext-vscode/src/extension.ts` for the wiring.
 *
 * The `extractPrompt` method is intentionally a stub. The architecture
 * doc declares it on the `VSCodeExtensionAdapter` interface for symmetric
 * API shape, but actual row decoding lives at the extension's runtime via
 * `src/ext-vscode/src/extractors/` — the CLI never runs the watcher and
 * therefore never decodes rows. A future refactor could relocate the
 * extractors to the CLI level and have the adapter wrap them; for now
 * the stub returns `null` so any caller asking the CLI adapter to decode
 * a row gets the explicit "I don't know" answer.
 */

/** Marketplace identifier used in both Open VSX and the VS Code Marketplace. */
const MARKETPLACE_ID = 'nexpath.nexpath-vscode';

const OPEN_VSX_URL = `https://open-vsx.org/extension/${MARKETPLACE_ID.replace(
  '.',
  '/',
)}`;
const VS_CODE_MARKETPLACE_URL = `https://marketplace.visualstudio.com/items?itemName=${MARKETPLACE_ID}`;

/**
 * OS-specific Cursor configuration directory. Existence of this directory
 * is the heuristic the adapter uses to decide whether Cursor is installed.
 */
export function cursorConfigDir(
  home: string,
  platform: NodeJS.Platform = process.platform,
  appdata?: string,
): string {
  switch (platform) {
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Cursor');
    case 'win32':
      return join(appdata ?? process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'Cursor');
    default:
      return join(home, '.config', 'Cursor');
  }
}

export const cursorAdapter: VSCodeExtensionAdapter = {
  id: 'cursor',
  label: 'Cursor',
  category: 'vscode-extension',
  marketplace: { openVsx: MARKETPLACE_ID, vsCode: MARKETPLACE_ID },

  detect(ctx: InstallContext): boolean {
    return existsSync(cursorConfigDir(ctx.home));
  },

  chatHistoryPaths(ctx: InstallContext): string[] {
    // Return the base workspaceStorage directory; per-workspace state.vscdb
    // enumeration happens at extension activation time (we can't enumerate
    // here because the user may open new workspaces after install runs).
    return [join(cursorConfigDir(ctx.home), 'User', 'workspaceStorage')];
  },

  extractPrompt(_rowKey: string, _rowValue: unknown) {
    // See module JSDoc — decoding lives in the extension, not the CLI adapter.
    return null;
  },

  async install(ctx: InstallContext): Promise<InstallResult> {
    if (!this.detect(ctx)) {
      console.log(`-  ${'Cursor'.padEnd(12)} — not detected; skipping`);
      return { status: 'skipped', notes: 'Cursor not installed on this machine' };
    }
    console.log(`✓ ${'Cursor'.padEnd(12)} — install the Nexpath extension to activate guidance:`);
    console.log(`    Open VSX:            ${OPEN_VSX_URL}`);
    console.log(`    VS Code Marketplace: ${VS_CODE_MARKETPLACE_URL}`);
    console.log(`    Or via CLI:          cursor --install-extension ${MARKETPLACE_ID}`);
    return {
      status: 'installed',
      notes:
        'Deep-link instructions printed; the user must install the VS Code extension manually before guidance activates.',
    };
  },

  async uninstall(ctx: InstallContext): Promise<void> {
    if (!this.detect(ctx)) {
      console.log(`-  ${'Cursor'.padEnd(12)} — not detected; skipping`);
      return;
    }
    console.log(`-  ${'Cursor'.padEnd(12)} — uninstall the Nexpath extension from the Cursor Extensions panel`);
    console.log(`    Or via CLI:          cursor --uninstall-extension ${MARKETPLACE_ID}`);
  },
};

// Side-effect registration on module load — registered before any installAction
// invocation thanks to the side-effect import in src/agents/index.ts.
registerAdapter(cursorAdapter);
