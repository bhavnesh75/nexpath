import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../config/NexpathTokenStore.js', () => ({
  storeNexpathToken:   vi.fn(),
  removeNexpathToken:  vi.fn(),
  readNexpathToken:    vi.fn(),
  isValidNexpathToken: (v: string) => typeof v === 'string' && v.startsWith('npk_') && v.length >= 40,
  // ⚠️ Deliberately not a real address. Nothing observes this value — `token.ts`
  // does not call it — so a realistic-looking URL here only goes stale and reads
  // as a second declaration of the real default, which lives in exactly one
  // place. The one test that cares overrides it explicitly below.
  resolveApiBaseUrl:   vi.fn(() => 'https://stub.example/v1'),
}));

import { configSetTokenAction, configRotateTokenAction, configRemoveTokenAction } from './token.js';
import * as tokenStore from '../../config/NexpathTokenStore.js';

function captureOutput(): { lines: string[]; print: (line: string) => void } {
  const lines: string[] = [];
  return { lines, print: (l) => lines.push(l) };
}

const VALID_TOKEN   = 'npk_' + 'a'.repeat(40);
const INVALID_TOKEN = 'sk-not-a-token';

beforeEach(() => {
  vi.mocked(tokenStore.storeNexpathToken).mockReset().mockResolvedValue({ source: 'keychain' });
  vi.mocked(tokenStore.removeNexpathToken).mockReset().mockResolvedValue(undefined);
  vi.mocked(tokenStore.readNexpathToken).mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── configSetTokenAction (FP-4.3: happy path, cancel, malformed) ────────────────

describe('configSetTokenAction', () => {
  it('happy path: prompts, stores the token, prints the source — and no disclosure (2026-09-01 decision)', async () => {
    const { lines, print } = captureOutput();
    await configSetTokenAction({ output: print, passwordFn: async () => VALID_TOKEN });

    expect(tokenStore.storeNexpathToken).toHaveBeenCalledWith(VALID_TOKEN);
    expect(lines.join('\n')).toContain('Nexpath token stored in keychain');
    expect(lines.filter((l) => l.includes('prompt context will be sent')).length).toBe(0);
  });

  it('reports file fallback when storeNexpathToken returns source="file"', async () => {
    vi.mocked(tokenStore.storeNexpathToken).mockResolvedValueOnce({ source: 'file' });
    const { lines, print } = captureOutput();
    await configSetTokenAction({ output: print, passwordFn: async () => VALID_TOKEN });
    expect(lines.join('\n')).toContain('Nexpath token stored in file');
  });

  it('cancel: a null from passwordFn stores nothing', async () => {
    const { lines, print } = captureOutput();
    await configSetTokenAction({ output: print, passwordFn: async () => null });

    expect(tokenStore.storeNexpathToken).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('Cancelled');
  });

  it('an empty string from passwordFn is treated as a cancel', async () => {
    const { lines, print } = captureOutput();
    await configSetTokenAction({ output: print, passwordFn: async () => '' });
    expect(tokenStore.storeNexpathToken).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('Cancelled');
  });

  it('a malformed token propagates the store\'s rejection rather than being silently accepted', async () => {
    vi.mocked(tokenStore.storeNexpathToken).mockRejectedValueOnce(new Error('Invalid Nexpath token format'));
    await expect(
      configSetTokenAction({ output: () => {}, passwordFn: async () => INVALID_TOKEN }),
    ).rejects.toThrow(/Invalid Nexpath token/);
  });

  it('⛔ honesty guard: never claims "nothing leaves your machine" — untrue in token mode', async () => {
    const { lines, print } = captureOutput();
    await configSetTokenAction({ output: print, passwordFn: async () => VALID_TOKEN });
    const text = lines.join('\n').toLowerCase();
    expect(text).not.toContain('nothing leaves your machine');
  });

  it('set-token output never names the service host (the disclosure line is gone, 2026-09-01)', async () => {
    vi.mocked(tokenStore.resolveApiBaseUrl).mockReturnValue('https://configured-for-this-test.example/v1');
    const { lines, print } = captureOutput();
    await configSetTokenAction({ output: print, passwordFn: async () => VALID_TOKEN });
    expect(lines.join('\n')).not.toContain('configured-for-this-test.example');
  });
});

// ── configRemoveTokenAction ──────────────────────────────────────────────────────

describe('configRemoveTokenAction', () => {
  it('reports removal when a token was actually present', async () => {
    vi.mocked(tokenStore.readNexpathToken).mockResolvedValueOnce(VALID_TOKEN);
    const { lines, print } = captureOutput();
    await configRemoveTokenAction({ output: print });

    expect(tokenStore.removeNexpathToken).toHaveBeenCalled();
    expect(lines.join('\n')).toContain('Nexpath token removed');
  });

  it('reports nothing-stored when there was no token, even if an OpenAI key exists elsewhere', async () => {
    vi.mocked(tokenStore.readNexpathToken).mockResolvedValueOnce(null);
    const { lines, print } = captureOutput();
    await configRemoveTokenAction({ output: print });
    expect(lines.join('\n')).toContain('No Nexpath token was stored');
  });
});

// ── no user-facing disclosure (2026-09-01) ───────────────────────────────────

describe('set-token output carries no privacy/disclosure statements', () => {
  it('prints only the stored-confirmation — no data-flow or storage sentences (product decision 2026-09-01)', async () => {
    const lines: string[] = [];
    await configSetTokenAction({
      output: (l) => { lines.push(l); },
      passwordFn: async () => 'npk_0123456789abcdefghij',
    });
    const all = lines.join(' ').toLowerCase();
    expect(all).toContain('nexpath token stored');
    expect(all).not.toContain('prompt context');
    expect(all).not.toContain('stores no prompt');
    expect(all).not.toContain('sent to');
  });
});

// ── configRotateTokenAction ──────────────────────────────────────────────────
//
// Parity with `config rotate-api-key`: the key has always had a rotate and the
// token had none, so replacing one meant calling set-token and trusting it to
// overwrite. Same shape as the key's — refuse when there is nothing to rotate,
// confirm before overwriting, and report where the new one landed.

describe('configRotateTokenAction', () => {
  it('errors with exit code 1 when no token is stored', async () => {
    vi.mocked(tokenStore.readNexpathToken).mockResolvedValueOnce(null);
    const { lines, print } = captureOutput();
    await configRotateTokenAction({
      output:     print,
      passwordFn: async () => VALID_TOKEN,
      confirmFn:  async () => true,
    });
    expect(process.exitCode).toBe(1);
    expect(tokenStore.storeNexpathToken).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('No existing Nexpath token to rotate');
  });

  it('rotates when a token is stored and reports where the new one landed', async () => {
    vi.mocked(tokenStore.readNexpathToken).mockResolvedValueOnce(VALID_TOKEN);
    vi.mocked(tokenStore.storeNexpathToken).mockResolvedValueOnce({ source: 'file' });
    const { lines, print } = captureOutput();
    await configRotateTokenAction({
      output:     print,
      passwordFn: async () => VALID_TOKEN,
      confirmFn:  async () => true,
    });
    expect(tokenStore.storeNexpathToken).toHaveBeenCalledWith(VALID_TOKEN);
    expect(lines.join('\n')).toContain('Nexpath token rotated; new token stored in file');
  });

  it('declining the confirm keeps the existing token and never asks for a value', async () => {
    vi.mocked(tokenStore.readNexpathToken).mockResolvedValueOnce(VALID_TOKEN);
    const passwordFn = vi.fn<() => Promise<string | null>>();
    const { lines, print } = captureOutput();
    await configRotateTokenAction({ output: print, passwordFn, confirmFn: async () => false });
    expect(passwordFn).not.toHaveBeenCalled();
    expect(tokenStore.storeNexpathToken).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('existing Nexpath token retained');
  });

  it('cancelling the input keeps the existing token', async () => {
    vi.mocked(tokenStore.readNexpathToken).mockResolvedValueOnce(VALID_TOKEN);
    const { lines, print } = captureOutput();
    await configRotateTokenAction({
      output:     print,
      passwordFn: async () => null,
      confirmFn:  async () => true,
    });
    expect(tokenStore.storeNexpathToken).not.toHaveBeenCalled();
    expect(lines.join('\n')).toContain('existing Nexpath token retained');
  });

  // ⚠️ Reads the token directly rather than asking getKeySource, for the reason
  // configRemoveTokenAction does: a stored token can be shadowed by a
  // higher-priority OpenAI key, and getKeySource would then report THAT layer —
  // so a source-based check would refuse to rotate a token that is really there.
  it('rotates a token that is shadowed by an OpenAI key', async () => {
    vi.mocked(tokenStore.readNexpathToken).mockResolvedValueOnce(VALID_TOKEN);
    vi.mocked(tokenStore.storeNexpathToken).mockResolvedValueOnce({ source: 'keychain' });
    const { print } = captureOutput();
    await configRotateTokenAction({
      output:     print,
      passwordFn: async () => VALID_TOKEN,
      confirmFn:  async () => true,
    });
    expect(tokenStore.storeNexpathToken).toHaveBeenCalledTimes(1);
  });
});
