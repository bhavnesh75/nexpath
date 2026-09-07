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
  storeApiKey:    vi.fn(),
  removeApiKey:   vi.fn(),
  getKeySource:   vi.fn(),
  isValidApiKey:  (key: string) => /^sk-[A-Za-z0-9_-]{20,}$/.test(key),
}));

// Uninstall removes BOTH credentials now, so the token store needs mocking for
// the same reason the resolver does: unmocked, `removeNexpathToken` reaches the
// real OS keychain from a test run.
vi.mock('../../config/NexpathTokenStore.js', async () => {
  const shape = await import('../../config/credential-shape.js');
  return {
    storeNexpathToken:   vi.fn(),
    removeNexpathToken:  vi.fn(),
    isValidNexpathToken: shape.isValidNexpathToken,
  };
});

import { uninstallAction, resolveAgentPaths } from './install.js';
import * as resolver from '../../config/ApiKeyResolver.js';
import * as tokenStore from '../../config/NexpathTokenStore.js';

function tmpDirAgents(): { dir: string; cleanup: () => void } {
  const dir = join(tmpdir(), `nexpath-uninstall-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return { dir, cleanup: () => { try { rmSync(dir, { recursive: true }); } catch { /* ignore */ } } };
}

beforeEach(() => {
  vi.mocked(resolver.removeApiKey).mockReset().mockResolvedValue(undefined);
  vi.mocked(resolver.getKeySource).mockReset().mockResolvedValue('none');
  vi.mocked(tokenStore.removeNexpathToken).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('uninstallAction — credential cleanup (Plan #1 Phase 6)', () => {
  it('confirm Y → calls removeApiKey and logs the previous source', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        storeDeleteConfirmFn: async () => false,
        apiKeyConfirmFn: async () => true,
      });
      expect(resolver.removeApiKey).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls.map(c => c[0] as string).join('\n')).toContain('Credential removed (was in keychain)');
    } finally { cleanup(); }
  });

  // `removeNexpathToken` existed but had no caller here, so a token survived
  // uninstall indefinitely. And `getKeySource` reports only the WINNING layer,
  // so a machine holding both answers 'keychain' — the token is never named and
  // would never be reached by a check that keyed off the reported source.
  it('confirm Y → removes the Nexpath token as well as the key', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        storeDeleteConfirmFn: async () => false,
        apiKeyConfirmFn: async () => true,
      });
      expect(tokenStore.removeNexpathToken).toHaveBeenCalledTimes(1);
    } finally { cleanup(); }
  });

  it('a token-only machine still has its token removed', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('nexpath_token');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        storeDeleteConfirmFn: async () => false,
        apiKeyConfirmFn: async () => true,
      });
      expect(tokenStore.removeNexpathToken).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls.map(c => c[0] as string).join('\n'))
        .toContain('Credential removed (was in nexpath_token)');
    } finally { cleanup(); }
  });

  it('declining leaves BOTH credentials in place', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        storeDeleteConfirmFn: async () => false,
        apiKeyConfirmFn: async () => false,
      });
      expect(resolver.removeApiKey).not.toHaveBeenCalled();
      expect(tokenStore.removeNexpathToken).not.toHaveBeenCalled();
    } finally { cleanup(); }
  });

  it('confirm n → key retained, removeApiKey NOT called, retain hint shown', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        storeDeleteConfirmFn: async () => false,
        apiKeyConfirmFn: async () => false,
      });
      expect(resolver.removeApiKey).not.toHaveBeenCalled();
      const text = logSpy.mock.calls.map(c => c[0] as string).join('\n');
      expect(text).toContain('Credential retained');
      expect(text).toContain('nexpath config remove-api-key');
    } finally { cleanup(); }
  });

  it('no key stored (getKeySource=none) → silent skip, no confirm prompt fired', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('none');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const confirmFn = vi.fn<() => Promise<boolean>>();
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        storeDeleteConfirmFn: async () => false,
        apiKeyConfirmFn: confirmFn,
      });
      expect(confirmFn).not.toHaveBeenCalled();
      expect(resolver.removeApiKey).not.toHaveBeenCalled();
      expect(logSpy.mock.calls.map(c => c[0] as string).join('\n')).toContain('No stored credential found');
    } finally { cleanup(); }
  });

  it('--yes flag bypasses confirm prompt and removes the key directly', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('file');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const confirmFn = vi.fn<() => Promise<boolean>>();
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        storeDeleteConfirmFn: async () => false,
        yes: true,
        apiKeyConfirmFn: confirmFn,
      });
      expect(confirmFn).not.toHaveBeenCalled();
      expect(resolver.removeApiKey).toHaveBeenCalledTimes(1);
      expect(logSpy.mock.calls.map(c => c[0] as string).join('\n')).toContain('Credential removed (was in file)');
    } finally { cleanup(); }
  });

  it('logs MCP-removal summary BEFORE the credential cleanup section', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        storeDeleteConfirmFn: async () => false,
        apiKeyConfirmFn: async () => true,
      });
      const lines = logSpy.mock.calls.map(c => c[0] as string);
      const mcpIdx = lines.findIndex(l => l.includes('MCP registration removed'));
      const keyIdx = lines.findIndex(l => l.includes('Credential removed'));
      expect(mcpIdx).toBeGreaterThanOrEqual(0);
      expect(keyIdx).toBeGreaterThanOrEqual(0);
      expect(mcpIdx).toBeLessThan(keyIdx);
    } finally { cleanup(); }
  });

  it('projectRoot override flows through to getKeySource', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('none');
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        storeDeleteConfirmFn: async () => false,
        projectRoot: '/explicit/project',
        apiKeyConfirmFn: async () => true,
      });
      expect(resolver.getKeySource).toHaveBeenCalledWith('/explicit/project');
    } finally { cleanup(); }
  });

  it('removeApiKey throws → uninstall surfaces the error but still completes the MCP cleanup', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    vi.mocked(resolver.removeApiKey).mockRejectedValueOnce(new Error('keychain unavailable'));
    const { dir, cleanup } = tmpDirAgents();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await expect(uninstallAction({
        paths,
        execFn: () => {},
        storeDeleteConfirmFn: async () => false,
        apiKeyConfirmFn: async () => true,
      })).rejects.toThrow(/keychain unavailable/);
      expect(resolver.removeApiKey).toHaveBeenCalledTimes(1);
    } finally { cleanup(); }
  });

  it('--yes flag with no stored key still silently skips removal (yes does not force a remove call)', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('none');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        storeDeleteConfirmFn: async () => false,
        yes: true,
      });
      expect(resolver.removeApiKey).not.toHaveBeenCalled();
      expect(logSpy.mock.calls.map(c => c[0] as string).join('\n')).toContain('No stored credential found');
    } finally { cleanup(); }
  });

  it('"Prompt history retained" line appears AFTER the credential cleanup section', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('keychain');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        storeDeleteConfirmFn: async () => false,
        apiKeyConfirmFn: async () => true,
      });
      const lines = logSpy.mock.calls.map(c => c[0] as string);
      const keyIdx     = lines.findIndex(l => l.includes('Credential removed'));
      const historyIdx = lines.findIndex(l => l.includes('Prompt history retained'));
      expect(keyIdx).toBeGreaterThanOrEqual(0);
      expect(historyIdx).toBeGreaterThanOrEqual(0);
      expect(keyIdx).toBeLessThan(historyIdx);
    } finally { cleanup(); }
  });

  it('agent MCP unregistration still runs regardless of the credential cleanup branch (none source)', async () => {
    vi.mocked(resolver.getKeySource).mockResolvedValueOnce('none');
    const { dir, cleanup } = tmpDirAgents();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const paths = resolveAgentPaths(dir, dir, dir);
      await uninstallAction({
        paths,
        execFn: () => {},
        storeDeleteConfirmFn: async () => false,
      });
      const text = logSpy.mock.calls.map(c => c[0] as string).join('\n');
      expect(text).toContain('MCP registration removed from all agents');
      expect(text).toContain('No stored credential found');
    } finally { cleanup(); }
  });
});
