import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * A credential change ends the session. These assert the WIRING at the four Bhavnesh-side
 * command entry points, and the one property that must never bend: storing the credential is
 * the user's intent, clearing the session is hygiene, so hygiene failing must not fail the
 * command.
 *
 * `token.ts`'s two entry points are deliberately absent — that file is Vedansi-owned and the
 * request went over as a handoff (`credential-change-session-reset-token-ts-vedansi-handoff`).
 */

vi.mock('../../config/ApiKeyResolver.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config/ApiKeyResolver.js')>();
  return {
    ...actual,
    storeApiKey:  vi.fn().mockResolvedValue({ source: 'file' as const }),
    removeApiKey: vi.fn().mockResolvedValue(undefined),
    getKeySource: vi.fn().mockResolvedValue('file' as const),
  };
});

const VALID_KEY = 'sk-abcdefghij1234567890abcdefghij';

/** Seed a session at the default DB path (redirected to a temp home by vitest.setup). */
async function seedSession(): Promise<{ dbPath: string; sessionId: string }> {
  const { DEFAULT_DB_PATH, openStore, closeStore } = await import('../../store/db.js');
  const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
  mkdirSync(dirname(DEFAULT_DB_PATH), { recursive: true });
  const store = await openStore(DEFAULT_DB_PATH);
  SessionStateManager.bootstrapFromHistory(store, '/p', [
    { index: 0, text: 'deploy to production, push to prod, go live', capturedAt: 1, classifiedStage: 'release' as const, confidence: 1 },
  ], 5);
  const sessionId = SessionStateManager.load(store, '/p').current.sessionId;
  closeStore(store);
  return { dbPath: DEFAULT_DB_PATH, sessionId };
}

async function sessionCount(): Promise<number> {
  const { DEFAULT_DB_PATH, openStore, closeStore } = await import('../../store/db.js');
  const store = await openStore(DEFAULT_DB_PATH);
  const n = store.db.exec('SELECT COUNT(*) FROM session_states')[0]?.values[0]?.[0] as number;
  closeStore(store);
  return n;
}

afterEach(() => { vi.restoreAllMocks(); });

describe('the credential commands end the session', () => {
  it('set-api-key', async () => {
    await seedSession();
    expect(await sessionCount()).toBe(1);
    const { configSetApiKeyAction } = await import('./config.js');
    await configSetApiKeyAction({ passwordFn: async () => VALID_KEY, output: () => {} });
    expect(await sessionCount()).toBe(0);
  });

  it('rotate-api-key', async () => {
    await seedSession();
    expect(await sessionCount()).toBe(1);
    const { configRotateApiKeyAction } = await import('./config.js');
    await configRotateApiKeyAction({
      passwordFn: async () => VALID_KEY,
      confirmFn:  async () => true,
      output:     () => {},
    });
    expect(await sessionCount()).toBe(0);
  });

  it('remove-api-key — removal is a credential change too', async () => {
    await seedSession();
    expect(await sessionCount()).toBe(1);
    const { configRemoveApiKeyAction } = await import('./config.js');
    await configRemoveApiKeyAction({ output: () => {} });
    expect(await sessionCount()).toBe(0);
  });

  it('does NOT end it when the user cancels — nothing changed', async () => {
    await seedSession();
    const { configSetApiKeyAction } = await import('./config.js');
    await configSetApiKeyAction({ passwordFn: async () => null, output: () => {} });
    expect(await sessionCount()).toBe(1);
  });
});

describe('⛔ hygiene must never fail the command', () => {
  it('a store failure still saves the credential and still reports success', async () => {
    // The realistic failure is a concurrent hook holding the lock. Simulated by making the
    // store unopenable for the duration of the call.
    const db = await import('../../store/db.js');
    const spy = vi.spyOn(db, 'openStore').mockRejectedValue(new Error('database is locked'));

    const resolver = await import('../../config/ApiKeyResolver.js');
    const printed: string[] = [];
    const { configSetApiKeyAction } = await import('./config.js');

    await expect(
      configSetApiKeyAction({ passwordFn: async () => VALID_KEY, output: (l) => printed.push(l) }),
    ).resolves.toBeUndefined();

    expect(resolver.storeApiKey).toHaveBeenCalledWith(VALID_KEY);   // the credential WAS saved
    expect(printed.join('\n')).toContain('API key stored');          // and success WAS reported
    spy.mockRestore();
  });
});
