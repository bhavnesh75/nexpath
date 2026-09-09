/**
 * ⭐ Non-TTY prompt failure in `set-token` / `rotate-token` — the shared mechanism
 * (`interactive-terminal.ts`, c8f0f50c; the API-key commands got the same fix in 2cfe5d02).
 * Only `ERR_TTY_INIT_FAILED` is translated; the advice names the command that was run;
 * nothing is stored; other errors pass through unchanged; `remove-token` never prompted
 * and is unaffected; the interactive path is byte-for-byte what it was; main.ts routes
 * both commands through the shared `runInteractiveCommand` catch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CANCEL = Symbol('cancel');
vi.mock('@clack/prompts', () => ({
  password: vi.fn(),
  confirm:  vi.fn(),
  isCancel: (v: unknown) => v === CANCEL,
}));
vi.mock('../../config/NexpathTokenStore.js', () => ({
  storeNexpathToken:   vi.fn(),
  removeNexpathToken:  vi.fn(),
  readNexpathToken:    vi.fn(),
  isValidNexpathToken: (v: string) => typeof v === 'string' && v.startsWith('npk_') && v.length >= 40,
  resolveApiBaseUrl:   vi.fn(() => 'https://stub.example/v1'),
}));
vi.mock('./credential-session-reset.js', async (importOriginal) => {
  const mod = await importOriginal<typeof import('./credential-session-reset.js')>();
  return { ...mod, resetSessionsAfterCredentialChange: vi.fn(async () => ({ ok: true, deleted: 1 })) };
});

import { password, confirm } from '@clack/prompts';
import * as tokenStore from '../../config/NexpathTokenStore.js';
import { configSetTokenAction, configRotateTokenAction, configRemoveTokenAction, tokenTtyAdvice } from './token.js';
import { NonInteractiveTerminalError } from './interactive-terminal.js';
import { NonInteractiveTerminalError as ReExported } from './install.js';

const ttyFailure = () => Object.assign(new Error('TTY initialization failed: uv_tty_init returned EINVAL'), { code: 'ERR_TTY_INIT_FAILED' });
const VALID = 'npk_' + 'a'.repeat(40);
const out: string[] = [];

beforeEach(() => {
  out.length = 0;
  vi.mocked(password).mockReset();
  vi.mocked(confirm).mockReset();
  vi.mocked(tokenStore.storeNexpathToken).mockReset().mockResolvedValue({ source: 'keychain' });
  vi.mocked(tokenStore.removeNexpathToken).mockReset().mockResolvedValue(undefined);
  vi.mocked(tokenStore.readNexpathToken).mockReset().mockResolvedValue(null);
});

describe('⭐ set-token with stdin/stdout redirected', () => {
  it('translates ERR_TTY_INIT_FAILED into NonInteractiveTerminalError naming set-token; stores nothing', async () => {
    vi.mocked(password).mockRejectedValueOnce(ttyFailure());
    await expect(configSetTokenAction({ output: (l) => out.push(l) })).rejects.toBeInstanceOf(NonInteractiveTerminalError);
    vi.mocked(password).mockRejectedValueOnce(ttyFailure());
    const err = await configSetTokenAction({ output: (l) => out.push(l) }).catch((e: unknown) => e as Error);
    expect(err.message).toBe(tokenTtyAdvice('set-token'));
    expect(err.message).toContain('nexpath config set-token needs an interactive terminal');
    expect(err.message).toContain('  nexpath config set-token');
    expect(err.message).toContain('OPENAI_API_KEY');
    expect(tokenStore.storeNexpathToken).not.toHaveBeenCalled();
    expect(out).toEqual([]);
  });
  it('one class: the install.ts re-export IS the interactive-terminal class (instanceof holds either way)', () => {
    expect(ReExported).toBe(NonInteractiveTerminalError);
  });
});

describe('⭐ rotate-token — both prompt sites', () => {
  beforeEach(() => { vi.mocked(tokenStore.readNexpathToken).mockResolvedValue(VALID); });
  it('the confirm prompt failing names rotate-token; nothing stored', async () => {
    vi.mocked(confirm).mockRejectedValueOnce(ttyFailure());
    const err = await configRotateTokenAction({ output: (l) => out.push(l) }).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(NonInteractiveTerminalError);
    expect(err.message).toBe(tokenTtyAdvice('rotate-token'));
    expect(password).not.toHaveBeenCalled();
    expect(tokenStore.storeNexpathToken).not.toHaveBeenCalled();
  });
  it('the password prompt failing (after a real confirm) names rotate-token, not set-token', async () => {
    vi.mocked(confirm).mockResolvedValueOnce(true);
    vi.mocked(password).mockRejectedValueOnce(ttyFailure());
    const err = await configRotateTokenAction({ output: (l) => out.push(l) }).catch((e: unknown) => e as Error);
    expect(err).toBeInstanceOf(NonInteractiveTerminalError);
    expect(err.message).toContain('nexpath config rotate-token needs an interactive terminal');
    expect(err.message).not.toContain('set-token needs');
    expect(tokenStore.storeNexpathToken).not.toHaveBeenCalled();
  });
});

describe('⭐ only the TTY class is translated', () => {
  it('another error from the same prompt is rethrown unchanged (same object, no friendly message)', async () => {
    const other = Object.assign(new Error('disk on fire'), { code: 'EIO' });
    vi.mocked(password).mockRejectedValueOnce(other);
    const err = await configSetTokenAction({ output: (l) => out.push(l) }).catch((e: unknown) => e);
    expect(err).toBe(other);
    expect(err).not.toBeInstanceOf(NonInteractiveTerminalError);
  });
});

describe('⭐ remove-token was never affected', () => {
  it('completes with every prompt primed to fail — it prompts for nothing', async () => {
    vi.mocked(password).mockRejectedValue(ttyFailure());
    vi.mocked(confirm).mockRejectedValue(ttyFailure());
    vi.mocked(tokenStore.readNexpathToken).mockResolvedValue(VALID);
    await configRemoveTokenAction({ output: (l) => out.push(l) });
    expect(tokenStore.removeNexpathToken).toHaveBeenCalledTimes(1);
    expect(password).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('⭐ the interactive path is unchanged', () => {
  it('a typed token is stored; a cancel is still a cancel', async () => {
    vi.mocked(password).mockResolvedValueOnce(VALID);
    await configSetTokenAction({ output: (l) => out.push(l) });
    expect(tokenStore.storeNexpathToken).toHaveBeenCalledWith(VALID);
    expect(out[0]).toBe('✓ Nexpath token stored in keychain');
    vi.mocked(password).mockResolvedValueOnce(CANCEL);
    out.length = 0;
    await configSetTokenAction({ output: (l) => out.push(l) });
    expect(out).toEqual(['Cancelled — no Nexpath token stored.']);
    expect(tokenStore.storeNexpathToken).toHaveBeenCalledTimes(1);
  });
  it('the prompt options are the ones shipped (message, validation)', async () => {
    vi.mocked(password).mockResolvedValueOnce(VALID);
    await configSetTokenAction({ output: (l) => out.push(l) });
    const opts = vi.mocked(password).mock.calls[0]![0] as { message: string; validate: (v: string) => string | undefined };
    expect(opts.message).toBe('Nexpath token:');
    expect(opts.validate('nope')).toBe('Invalid Nexpath token format (expected npk_...)');
    expect(opts.validate(VALID)).toBeUndefined();
  });
});

describe('⭐ main.ts — the catch half is the shared runInteractiveCommand', () => {
  it('set-token and rotate-token are registered through it; remove-token is not (it never prompts)', () => {
    const main = readFileSync(fileURLToPath(new URL('../main.ts', import.meta.url)), 'utf8');
    const block = (name: string) => main.slice(main.indexOf(`.command('${name}')`), main.indexOf(`.command('${name}')`) + 400);
    expect(block('set-token')).toContain('await runInteractiveCommand(() => configSetTokenAction());');
    expect(block('rotate-token')).toContain('await runInteractiveCommand(() => configRotateTokenAction());');
    expect(block('remove-token')).toContain('await configRemoveTokenAction();');
    expect(block('remove-token')).not.toContain('runInteractiveCommand');
    expect(main).toContain('async function runInteractiveCommand(run: () => Promise<void>): Promise<void>');
  });
});
