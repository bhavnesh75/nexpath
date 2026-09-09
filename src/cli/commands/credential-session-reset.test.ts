/** Session reset after a credential change — machine-global, best-effort, never throws. */
import { describe, it, expect, vi } from 'vitest';
import { resetSessionsAfterCredentialChange, sessionResetSkippedLine } from './credential-session-reset.js';

const fakeStore = (over: Partial<{ run: (sql: string) => void; rows: number }> = {}) => {
  const run = vi.fn(over.run ?? (() => {}));
  return { store: { db: { run, getRowsModified: () => over.rows ?? 2 } } as never, run };
};

describe('resetSessionsAfterCredentialChange', () => {
  it('⭐ deletes EVERY session_states row (machine-global — a credential has no project), saves, closes', async () => {
    const { store, run } = fakeStore({ rows: 3 });
    const saveStoreFn = vi.fn(); const closeStoreFn = vi.fn();
    const r = await resetSessionsAfterCredentialChange({ openStoreFn: async () => store, saveStoreFn, closeStoreFn });
    expect(r).toEqual({ ok: true, deleted: 3 });
    expect(run).toHaveBeenCalledWith('DELETE FROM session_states');
    expect(run.mock.calls[0]![0]).not.toContain('WHERE');
    expect(saveStoreFn).toHaveBeenCalledWith(store);
    expect(closeStoreFn).toHaveBeenCalledWith(store);
  });
  it('⭐ a locked/unopenable store ⇒ {ok:false, error} — never throws (the credential is already saved)', async () => {
    const r = await resetSessionsAfterCredentialChange({ openStoreFn: async () => { throw new Error('store locked'); } });
    expect(r).toEqual({ ok: false, error: 'store locked' });
  });
  it('a failing DELETE still closes the store', async () => {
    const { store } = fakeStore({ run: () => { throw new Error('no such table'); } });
    const closeStoreFn = vi.fn();
    const r = await resetSessionsAfterCredentialChange({ openStoreFn: async () => store, closeStoreFn, saveStoreFn: () => {} });
    expect(r.ok).toBe(false); expect(r.error).toBe('no such table');
    expect(closeStoreFn).toHaveBeenCalledTimes(1);
  });
  it('the skipped line names the reason and the 30-minute self-reset', () => {
    expect(sessionResetSkippedLine('store locked')).toContain('store locked');
    expect(sessionResetSkippedLine('x')).toContain('30 minutes');
  });
});
