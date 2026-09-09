import { describe, it, expect, vi, beforeEach } from 'vitest';

// The store side is irrelevant here and must not be touched: these tests are about what happens
// BEFORE a credential is ever read from the user.
vi.mock('../../store/index.js', () => ({
  openStore:  vi.fn().mockRejectedValue(new Error('no store in this test')),
  closeStore: vi.fn(),
  DEFAULT_DB_PATH: ':memory:',
  getConfig: vi.fn(), setConfig: vi.fn(), deleteConfig: vi.fn(),
  expireSessionsForCredentialChange: vi.fn(),
}));
vi.mock('../../config/ApiKeyResolver.js', () => ({
  storeApiKey:   vi.fn().mockResolvedValue({ source: 'file' }),
  removeApiKey:  vi.fn().mockResolvedValue(undefined),
  getKeySource:  vi.fn().mockResolvedValue('file'),
  isValidApiKey: (v: string) => /^sk-[A-Za-z0-9_-]{20,}$/.test(v),
}));
vi.mock('../../config/NexpathTokenStore.js', () => ({
  resolveApiBaseUrl: vi.fn().mockReturnValue('https://example.invalid'),
}));

const password = vi.fn();
const confirm  = vi.fn();
vi.mock('@clack/prompts', () => ({
  password: (...a: unknown[]) => password(...a),
  confirm:  (...a: unknown[]) => confirm(...a),
  isCancel: (v: unknown) => v === Symbol.for('clack:cancel'),
}));

const {
  configSetApiKeyAction,
  configRotateApiKeyAction,
  configRemoveApiKeyAction,
} = await import('./config.js');
const { NonInteractiveTerminalError } = await import('./interactive-terminal.js');
const resolver = await import('../../config/ApiKeyResolver.js');

/** What @clack throws when stdin/stdout is redirected. */
const ttyErr = (): Error => Object.assign(
  new Error('TTY initialization failed: uv_tty_init returned EBADF'),
  { code: 'ERR_TTY_INIT_FAILED' },
);

beforeEach(() => {
  password.mockReset();
  confirm.mockReset();
  vi.mocked(resolver.storeApiKey).mockClear();
  vi.mocked(resolver.removeApiKey).mockClear();
});

// ── The bug ──────────────────────────────────────────────────────────────────
// `nexpath config set-api-key < /dev/null` printed a raw uv_tty_init stack and, worse, still exited
// 0 — so a script could read the failure as success. `install` has translated this class since
// 2026-09-04; these commands were left behind, and token.ts inherited the gap by mirroring them.
describe('config credential prompts on a non-interactive terminal', () => {
  it('set-api-key: the TTY failure becomes an explanation, not a stack', async () => {
    password.mockRejectedValueOnce(ttyErr());
    await expect(configSetApiKeyAction()).rejects.toBeInstanceOf(NonInteractiveTerminalError);
  });

  it('set-api-key: the advice names set-api-key and points at the env var', async () => {
    password.mockRejectedValueOnce(ttyErr());
    const err = await configSetApiKeyAction().catch((e: Error) => e);
    expect(err.message).toContain('nexpath config set-api-key needs an interactive terminal');
    expect(err.message).toContain('OPENAI_API_KEY');
    // Naming the wrong command is worse than naming none.
    expect(err.message).not.toContain('rotate-api-key');
  });

  it('set-api-key: nothing is stored when the prompt could not run', async () => {
    password.mockRejectedValueOnce(ttyErr());
    await configSetApiKeyAction().catch(() => undefined);
    expect(resolver.storeApiKey).not.toHaveBeenCalled();
  });

  it('rotate-api-key: the confirm step fails the same way, and names rotate-api-key', async () => {
    confirm.mockRejectedValueOnce(ttyErr());
    const err = await configRotateApiKeyAction().catch((e: Error) => e);
    expect(err).toBeInstanceOf(NonInteractiveTerminalError);
    expect(err.message).toContain('nexpath config rotate-api-key needs an interactive terminal');
    expect(resolver.storeApiKey).not.toHaveBeenCalled();
  });

  it('rotate-api-key: the password step also names rotate-api-key, not set-api-key', async () => {
    confirm.mockResolvedValueOnce(true);
    password.mockRejectedValueOnce(ttyErr());
    const err = await configRotateApiKeyAction().catch((e: Error) => e);
    expect(err.message).toContain('rotate-api-key');
    expect(err.message).not.toContain('nexpath config set-api-key needs');
  });

  // ⛔ The whole point of the wrapper: it must never turn a real fault into a friendly message
  // about terminals.
  it('any other prompt error is rethrown untouched', async () => {
    const real = new Error('a real bug');
    password.mockRejectedValueOnce(real);
    await expect(configSetApiKeyAction()).rejects.toBe(real);
  });

  it('remove-api-key was never affected — it prompts for nothing', async () => {
    await expect(configRemoveApiKeyAction()).resolves.toBeUndefined();
    expect(password).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(resolver.removeApiKey).toHaveBeenCalledTimes(1);
  });
});

// ── The interactive path must be untouched ───────────────────────────────────
describe('the interactive path is unchanged', () => {
  it('set-api-key still stores a key the user typed', async () => {
    password.mockResolvedValueOnce('sk-abcdefghijklmnopqrstuvwxyz0123');
    await configSetApiKeyAction({ output: () => {} });
    expect(resolver.storeApiKey).toHaveBeenCalledWith('sk-abcdefghijklmnopqrstuvwxyz0123');
  });

  it('a cancel is still a cancel, not an error', async () => {
    password.mockResolvedValueOnce(Symbol.for('clack:cancel'));
    const lines: string[] = [];
    await configSetApiKeyAction({ output: (l) => lines.push(l) });
    expect(lines.join('\n')).toContain('Cancelled');
    expect(resolver.storeApiKey).not.toHaveBeenCalled();
  });

  it('an injected passwordFn still bypasses the prompt entirely', async () => {
    await configSetApiKeyAction({
      passwordFn: async () => 'sk-zzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
      output: () => {},
    });
    expect(password).not.toHaveBeenCalled();
    expect(resolver.storeApiKey).toHaveBeenCalledTimes(1);
  });
});
