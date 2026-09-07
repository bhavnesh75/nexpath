import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../telemetry/lifecycle-flush.js', () => ({
  flushIfTelemetryOn: vi.fn().mockResolvedValue(undefined),
  flushLifecycle:     vi.fn().mockResolvedValue(undefined),
}));
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';

vi.mock('../../config/ApiKeyResolver.js', () => ({
  storeApiKey:     vi.fn().mockResolvedValue({ source: 'keychain' }),
  isValidApiKey:   (key: string) => /^sk-[A-Za-z0-9_-]{20,}$/.test(key),
  getKeySource:    vi.fn().mockResolvedValue('none'),
  removeApiKey:    vi.fn().mockResolvedValue(undefined),
}));

// Step 1 can now store either credential, so the token store needs mocking for
// the same reason the resolver does: unmocked, `storeNexpathToken` reaches the
// real OS keychain from a test run. The validator is the real one — a stub
// would let a fixture drift from the rule it is meant to exercise.
vi.mock('../../config/NexpathTokenStore.js', async () => {
  const shape = await import('../../config/credential-shape.js');
  return {
    storeNexpathToken:   vi.fn().mockResolvedValue({ source: 'keychain' }),
    removeNexpathToken:  vi.fn().mockResolvedValue(undefined),
    isValidNexpathToken: shape.isValidNexpathToken,
  };
});

import {
  installAction,
  resolveAgentPaths,
  getKeychainName,
  type InstallPrompts,
} from './install.js';
import * as resolver from '../../config/ApiKeyResolver.js';
import * as tokenStore from '../../config/NexpathTokenStore.js';
import { openStore, closeStore } from '../../store/db.js';
import { getConfig, isConfigSet, setConfig } from '../../store/config.js';

function tmpDirAgents(): { dir: string; cleanup: () => void } {
  const dir = join(tmpdir(), `nexpath-install3-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return { dir, cleanup: () => { try { rmSync(dir, { recursive: true }); } catch { /* ignore */ } } };
}

let savedEnvKey: string | undefined;

beforeEach(() => {
  savedEnvKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  vi.mocked(resolver.storeApiKey).mockReset().mockResolvedValue({ source: 'keychain' });
  vi.mocked(resolver.getKeySource).mockReset().mockResolvedValue('none');
  vi.mocked(tokenStore.storeNexpathToken).mockReset().mockResolvedValue({ source: 'keychain' });
});

afterEach(() => {
  if (savedEnvKey === undefined) delete process.env.OPENAI_API_KEY;
  else                            process.env.OPENAI_API_KEY = savedEnvKey;
  vi.restoreAllMocks();
});

function makePrompts(overrides: Partial<InstallPrompts> = {}): InstallPrompts {
  return {
    apiKeyPrompt:           async () => ({ kind: 'skip' }),
    credentialChoicePrompt: async () => 'openai_key',
    ...overrides,
  };
}

// installAction also runs the advisory frequency + role step. These non-interactive
// stubs keep that step from blocking on real stdin during 3-step tests.
const noopFreqPrompt = async () => 'every_event';
const noopRolePrompt = async () => 'founder';

// ── Step 1: API key prompt ───────────────────────────────────────────────────

describe('install 3-step — Step 1: API key', () => {
  it('new_key result → storeApiKey called with the value; summary source = keychain', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'new_key', value: 'sk-abcdefghij1234567890abcdefghij' }),
        }),
      });
      expect(resolver.storeApiKey).toHaveBeenCalledWith('sk-abcdefghij1234567890abcdefghij');
      expect(summary).not.toBeNull();
      expect(summary!.apiKey.source).toBe('keychain');
    } finally { cleanup(); }
  });

  it('use_env result → storeApiKey called with process.env.OPENAI_API_KEY', async () => {
    process.env.OPENAI_API_KEY = 'sk-fromenv1234567890abcdefghij1234';
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'use_env' }),
        }),
      });
      expect(resolver.storeApiKey).toHaveBeenCalledWith('sk-fromenv1234567890abcdefghij1234');
    } finally { cleanup(); }
  });

  it('keep_existing result → storeApiKey NOT called; summary source = kept', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'keep_existing' }),
        }),
      });
      expect(resolver.storeApiKey).not.toHaveBeenCalled();
      expect(summary!.apiKey.source).toBe('kept');
    } finally { cleanup(); }
  });

  it('skip result → storeApiKey NOT called; summary source = skipped', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'skip' }),
        }),
      });
      expect(resolver.storeApiKey).not.toHaveBeenCalled();
      expect(summary!.apiKey.source).toBe('skipped');
    } finally { cleanup(); }
  });

  // ── The second credential ───────────────────────────────────────────────
  //
  // One credential was required before and one still is; the choice is which,
  // not whether. So these mirror the key cases above rather than adding a new
  // shape beside them.

  const TOKEN = `npk_${'a'.repeat(43)}`;

  it('nexpath_token result → storeNexpathToken called; summary source = nexpath_token', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'nexpath_token', value: TOKEN }),
        }),
      });
      expect(tokenStore.storeNexpathToken).toHaveBeenCalledWith(TOKEN);
      expect(resolver.storeApiKey).not.toHaveBeenCalled();
      expect(summary!.apiKey.source).toBe('nexpath_token');
    } finally { cleanup(); }
  });

  it('a stored token is offered "keep existing" — hasStoredToken reaches the prompt', async () => {
    // getKeySource reports the token as its own layer, which is neither
    // 'keychain' nor 'file'. Before this, a returning token user was prompted
    // as though nothing were configured.
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('nexpath_token');
    const seen: unknown[] = [];
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async (ctx) => { seen.push(ctx); return { kind: 'keep_existing' }; },
        }),
      });
      expect(seen[0]).toMatchObject({ hasStoredToken: true, hasStoredKey: false });
    } finally { cleanup(); }
  });

  it('a stored OpenAI key still reports hasStoredKey, not hasStoredToken', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const seen: unknown[] = [];
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async (ctx) => { seen.push(ctx); return { kind: 'keep_existing' }; },
        }),
      });
      expect(seen[0]).toMatchObject({ hasStoredKey: true, hasStoredToken: false });
    } finally { cleanup(); }
  });

  it('an environment key suppresses both stored flags, as it always has', async () => {
    process.env.OPENAI_API_KEY = 'sk-fromenv1234567890abcdefghij1234';
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('nexpath_token');
    const seen: unknown[] = [];
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async (ctx) => { seen.push(ctx); return { kind: 'use_env' }; },
        }),
      });
      expect(seen[0]).toMatchObject({ hasEnvKey: true, hasStoredKey: false, hasStoredToken: false });
    } finally { cleanup(); }
  });

  // The summary block is rendered by clack's `note`, which writes straight to
  // stdout rather than through console.log — so the line has to be read there.
  it('the Setup Complete summary names which credential was stored', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const written: string[] = [];
    const stdoutSpy = vi.spyOn(process.stdout, 'write')
      .mockImplementation((chunk: unknown) => { written.push(String(chunk)); return true; });
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'nexpath_token', value: TOKEN }),
        }),
      });
      stdoutSpy.mockRestore();
      expect(written.join('')).toContain('Nexpath token');
    } finally { stdoutSpy.mockRestore(); cleanup(); }
  });

  it('cancel result → returns null and writes nothing', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'cancel.db');
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        dbPath,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'cancel' }),
        }),
      });
      expect(summary).toBeNull();
      expect(resolver.storeApiKey).not.toHaveBeenCalled();
      const store = await openStore(dbPath);
      // Cancel wrote nothing → getConfig returns the (now off-by-default) DEFAULT_CONFIG value.
      expect(getConfig(store.db, 'telemetry.enabled')).toBe('false');
      closeStore(store);
    } finally { cleanup(); }
  });
});

// ── Telemetry: OFF by default, no install prompt (NF Plan A) ──────────────────

describe('install — telemetry OFF by default (no install prompt)', () => {
  it('fresh install → telemetry.enabled AND telemetry_sync_enabled both "false" (no prompt shown)', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'telem.db');
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        dbPath,
        confirmFn: async () => true,
        promptFn: makePrompts({}),
      });
      const store = await openStore(dbPath);
      expect(getConfig(store.db, 'telemetry.enabled')).toBe('false');
      expect(getConfig(store.db, 'telemetry_sync_enabled')).toBe('false');
      closeStore(store);
    } finally { cleanup(); }
  });

  it('--yes mode → telemetry OFF by default, both flags "false" and explicitly set', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'telem-yes-mode.db');
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({ yes: true }, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        dbPath,
      });
      const store = await openStore(dbPath);
      expect(getConfig(store.db, 'telemetry.enabled')).toBe('false');
      expect(getConfig(store.db, 'telemetry_sync_enabled')).toBe('false');
      expect(isConfigSet(store.db, 'telemetry.enabled')).toBe(true);
      expect(isConfigSet(store.db, 'telemetry_sync_enabled')).toBe(true);
      closeStore(store);
    } finally { cleanup(); }
  });

  it('PRESERVES an existing telemetry choice (does NOT flip a user who ENABLED it back to the off default)', async () => {
    // Now that the default is OFF, the meaningful guard is the reverse: a user (or the VS Code two-pass
    // setup) who explicitly ENABLED telemetry must not be silently flipped back to off on a re-run.
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'telem-yes-preserve.db');
    try {
      // Simulate pass 1: user explicitly enabled telemetry.
      const pre = await openStore(dbPath);
      setConfig(pre, 'telemetry.enabled',      'true');
      setConfig(pre, 'telemetry_sync_enabled', 'true');
      closeStore(pre);

      // Pass 2: a non-interactive --yes install must NOT flip it back to the off default.
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({ yes: true, platform: 'vscode' }, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        dbPath,
      });

      const store = await openStore(dbPath);
      expect(getConfig(store.db, 'telemetry.enabled')).toBe('true');
      expect(getConfig(store.db, 'telemetry_sync_enabled')).toBe('true');
      closeStore(store);
      // Summary reflects the preserved (enabled) state, not a forced off.
      expect(summary?.telemetry.enabled).toBe(true);
    } finally { cleanup(); }
  });
});

// ── Summary returned ─────────────────────────────────────────────────────────

describe('install 3-step — Summary returned', () => {
  it('summary object includes apiKey.source, telemetry.enabled, agents.registered/failed', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'skip' }),
        }),
      });
      expect(summary).not.toBeNull();
      expect(summary!.apiKey.source).toBe('skipped');
      expect(summary!.telemetry.enabled).toBe(false); // off by default (NF Plan A)
      expect(Array.isArray(summary!.agents.registered)).toBe(true);
      expect(Array.isArray(summary!.agents.failed)).toBe(true);
    } finally { cleanup(); }
  });

  it('--yes bypasses prompts; summary still returned with default apiKey="skipped", telemetry=false', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({ yes: true }, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
      });
      expect(summary).not.toBeNull();
      expect(summary!.apiKey.source).toBe('skipped');
      expect(summary!.telemetry.enabled).toBe(false); // off by default (NF Plan A)
    } finally { cleanup(); }
  });
});

// ── Q3 + Q4 follow-ups: rich UI logs + clipboard in summary ─────────────────

describe('install 3-step — Q3 rich UI: "Stored in <keychain>" confirmation line', () => {
  it('logs "✓ Stored in <keychain>" after a new_key storeApiKey call', async () => {
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      vi.mocked(resolver.storeApiKey).mockResolvedValueOnce({ source: 'keychain' });
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        platformForKeychain: 'darwin',
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'new_key', value: 'sk-abcdefghij1234567890abcdefghij' }),
        }),
      });
      const output = logSpy.mock.calls.map(c => c[0] as string).join('\n');
      expect(output).toContain('Stored in macOS Keychain');
    } finally { cleanup(); }
  });

  it('logs "✓ Stored in fallback file" when storeApiKey falls back to the 0600 file', async () => {
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      vi.mocked(resolver.storeApiKey).mockResolvedValueOnce({ source: 'file' });
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: makePrompts({
          apiKeyPrompt: async () => ({ kind: 'new_key', value: 'sk-abcdefghij1234567890abcdefghij' }),
        }),
      });
      const output = logSpy.mock.calls.map(c => c[0] as string).join('\n');
      expect(output).toContain('Stored in fallback file');
    } finally { cleanup(); }
  });
});

describe('install 3-step — Q4: clipboard install reflected in summary', () => {
  it('summary.extras has clipboardInstalled=false and clipboardTool=null when skipClipboardCheck is true', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({ yes: true }, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
      });
      expect(summary!.extras.clipboardInstalled).toBe(false);
      expect(summary!.extras.clipboardTool).toBeNull();
    } finally { cleanup(); }
  });

  it('InstallSummary type includes extras { clipboardInstalled, clipboardTool } fields', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({ yes: true }, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
      });
      expect(summary).not.toBeNull();
      expect(summary!.extras).toBeDefined();
      expect('clipboardInstalled' in summary!.extras).toBe(true);
      expect('clipboardTool' in summary!.extras).toBe(true);
    } finally { cleanup(); }
  });
});

// ── Context detection: hasEnvKey / hasStoredKey ──────────────────────────────

describe('install 3-step — apiKeyPrompt context detection', () => {
  it('hasEnvKey=true when OPENAI_API_KEY env var is valid', async () => {
    process.env.OPENAI_API_KEY = 'sk-abcdefghij1234567890abcdefghij';
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const apiKeyPrompt = vi.fn<InstallPrompts['apiKeyPrompt']>().mockResolvedValue({ kind: 'skip' });
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: { apiKeyPrompt },
      });
      const ctx = apiKeyPrompt.mock.calls[0][0];
      expect(ctx.hasEnvKey).toBe(true);
    } finally { cleanup(); }
  });

  it('hasEnvKey=false when OPENAI_API_KEY env var has an invalid prefix', async () => {
    process.env.OPENAI_API_KEY = 'invalid-not-sk-prefix';
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const apiKeyPrompt = vi.fn<InstallPrompts['apiKeyPrompt']>().mockResolvedValue({ kind: 'skip' });
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: { apiKeyPrompt },
      });
      const ctx = apiKeyPrompt.mock.calls[0][0];
      expect(ctx.hasEnvKey).toBe(false);
    } finally { cleanup(); }
  });

  it('hasStoredKey=true when getKeySource returns "keychain" or "file" and env is unset', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const apiKeyPrompt = vi.fn<InstallPrompts['apiKeyPrompt']>().mockResolvedValue({ kind: 'keep_existing' });
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true,
        promptFn: { apiKeyPrompt },
      });
      const ctx = apiKeyPrompt.mock.calls[0][0];
      expect(ctx.hasStoredKey).toBe(true);
      expect(ctx.hasEnvKey).toBe(false);
    } finally { cleanup(); }
  });

  it('keychainName in context matches platformForKeychain override', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const apiKeyPrompt = vi.fn<InstallPrompts['apiKeyPrompt']>().mockResolvedValue({ kind: 'skip' });
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        platformForKeychain: 'win32',
        confirmFn: async () => true,
        promptFn: { apiKeyPrompt },
      });
      const ctx = apiKeyPrompt.mock.calls[0][0];
      expect(ctx.keychainName).toBe('Credential Manager');
    } finally { cleanup(); }
  });
});

// ── Cancellation semantics (non-transactional design documented) ─────────────

describe('install 3-step — cancellation aborts subsequent steps', () => {
  it('cancel at Step 1 → no telemetry config write and no agent registration', async () => {
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const dbPath = join(dir, 'cancel-step1.db');
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const summary = await installAction({}, {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        dbPath,
        promptFn: {
          apiKeyPrompt: async () => ({ kind: 'cancel' }),
        },
      });
      expect(summary).toBeNull();
      const store = await openStore(dbPath);
      expect(isConfigSet(store.db, 'telemetry.enabled')).toBe(false);
      expect(isConfigSet(store.db, 'telemetry_sync_enabled')).toBe(false);
      closeStore(store);
    } finally { cleanup(); }
  });

  // (Removed "cancel at Step 2" — there is no telemetry step to cancel anymore; telemetry is off by
  //  default with no install prompt. Step-1 API-key cancellation is covered above.)
});

// ── getKeychainName platform variants ────────────────────────────────────────

describe('getKeychainName', () => {
  it('returns "macOS Keychain" on darwin', () => {
    expect(getKeychainName('darwin')).toBe('macOS Keychain');
  });

  it('returns "Secret Service (libsecret)" on linux', () => {
    expect(getKeychainName('linux')).toBe('Secret Service (libsecret)');
  });

  it('returns "Credential Manager" on win32', () => {
    expect(getKeychainName('win32')).toBe('Credential Manager');
  });

  it('falls back to the encrypted-file message on other platforms', () => {
    expect(getKeychainName('freebsd' as NodeJS.Platform)).toMatch(/Encrypted file/);
  });
});

// ── Install timestamp ─────────────────────────────────────────────────────────

describe('install — install timestamp', () => {
  it('records installed_at on install and keeps it unchanged on re-run', async () => {
    const { dir, cleanup } = tmpDirAgents();
    const dbPath = join(dir, 'store.db');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      const deps = {
        paths, isWin: false, execFn: () => {}, skipClipboardCheck: true,
        freqPromptFn: noopFreqPrompt, rolePromptFn: noopRolePrompt,
        confirmFn: async () => true, promptFn: makePrompts(), dbPath,
      };

      await installAction({}, deps);
      let s = await openStore(dbPath);
      const first = getConfig(s.db, 'installed_at');
      closeStore(s);
      expect(first).toBeDefined();
      expect(Number(first)).toBeGreaterThan(0);

      // Re-running install must not overwrite the original install time.
      await installAction({}, deps);
      s = await openStore(dbPath);
      const second = getConfig(s.db, 'installed_at');
      closeStore(s);
      expect(second).toBe(first);
    } finally { cleanup(); }
  });
});
