import { describe, it, expect, vi } from 'vitest';

/**
 * A session boundary must be CLOSED exactly once — one maturity graduation observation and
 * one boundary record — no matter how many times a command loads the session while crossing
 * it. `runAuto` loads twice: a throwaway manager for the injected-prompt guard, then the real
 * one after the historical import may have rewritten the row. Neither persists the fresh
 * session, so before this both saw the same expired row and both closed it.
 */

const maturityCalls: string[] = [];
vi.mock('./maturity-level.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./maturity-level.js')>();
  return {
    ...actual,
    updateProjectMaturity: (...args: Parameters<typeof actual.updateProjectMaturity>) => {
      maturityCalls.push(String(args[1]));
      return actual.updateProjectMaturity(...args);
    },
  };
});

const HISTORY = [
  { index: 0, text: 'add tests and run the suite before merging', capturedAt: 1, classifiedStage: 'implementation' as const, confidence: 0.6 },
];

async function seeded(now: number) {
  const { SessionStateManager } = await import('./SessionStateManager.js');
  const { openStore } = await import('../store/db.js');
  const store = await openStore(':memory:');
  SessionStateManager.bootstrapFromHistory(store, '/p', HISTORY, 5);
  maturityCalls.length = 0;
  return { store, SessionStateManager, boundary: now + 30 * 60 * 1000 + 10_000 };
}

describe('a session boundary is closed exactly once', () => {
  it('two loads across one boundary fold maturity once when the first does not end the session', async () => {
    const t0 = Date.now();
    const { store, SessionStateManager, boundary } = await seeded(t0);

    // The guard's throwaway load — must not close the ended session.
    SessionStateManager.load(store, '/p', boundary, { endPreviousSession: false });
    expect(maturityCalls).toHaveLength(0);

    // The real load — closes it.
    SessionStateManager.load(store, '/p', boundary);
    expect(maturityCalls).toHaveLength(1);
  });

  it('REGRESSION GUARD: two default loads still fold twice — the flag is what fixes it', async () => {
    // Pins the underlying behaviour so a future change to `load()` cannot silently make the
    // flag redundant (or silently reintroduce the double fold at another call site).
    const t0 = Date.now();
    const { store, SessionStateManager, boundary } = await seeded(t0);

    SessionStateManager.load(store, '/p', boundary);
    SessionStateManager.load(store, '/p', boundary);
    expect(maturityCalls).toHaveLength(2);
  });

  it('the flag changes side effects only — the returned state is identical', async () => {
    const t0 = Date.now();
    const { store, SessionStateManager, boundary } = await seeded(t0);

    const withoutClosing = SessionStateManager.load(store, '/p', boundary, { endPreviousSession: false }).current;
    const closing = SessionStateManager.load(store, '/p', boundary).current;

    // Both are fresh sessions past the gap: same stage, same emptied history, same counts.
    expect(withoutClosing.currentStage).toBe(closing.currentStage);
    expect(withoutClosing.promptCount).toBe(closing.promptCount);
    expect(withoutClosing.promptHistory).toEqual(closing.promptHistory);
    expect(withoutClosing.lastInjectedPrompt).toBe(closing.lastInjectedPrompt);
    // Only the identity differs — each call mints its own.
    expect(withoutClosing.sessionId).not.toBe(closing.sessionId);
  });

  it('inside the gap the flag is inert — nothing is closed either way', async () => {
    const t0 = Date.now();
    const { store, SessionStateManager } = await seeded(t0);

    SessionStateManager.load(store, '/p', t0 + 60_000, { endPreviousSession: false });
    SessionStateManager.load(store, '/p', t0 + 60_000);
    expect(maturityCalls).toHaveLength(0);
  });

  // ⛔ THE PROPERTY THAT MAKES THE FLAG SAFE AT THE GUARD CALL SITE.
  //
  // The guard writes (`clearInjectedPrompt`, which persists) only when it FINDS an injected
  // prompt. A caller that could both skip closing the session AND persist a fresh one would
  // overwrite the ended session's row before anything folded it, losing the observation for
  // good. The guard cannot: past the gap it is handed a FRESH session, whose
  // `lastInjectedPrompt` is null, so it writes nothing and the real load still finds the old
  // row to close. This is NOT true of a caller that persists unconditionally — which is why
  // the flag is used at this one site and not at every throwaway load.
  it('past the gap the non-closing load carries no injected prompt, so the guard cannot persist over the ended session', async () => {
    const t0 = Date.now();
    const { store, SessionStateManager, boundary } = await seeded(t0);

    // Give the ended session an injected prompt for the guard to find.
    SessionStateManager.load(store, '/p', t0).setInjectedPrompt(store, 'an injected turn');
    expect(SessionStateManager.load(store, '/p', t0).current.lastInjectedPrompt).toBe('an injected turn');
    maturityCalls.length = 0;

    const guardView = SessionStateManager.load(store, '/p', boundary, { endPreviousSession: false });
    expect(guardView.current.lastInjectedPrompt).toBeNull();   // nothing for the guard to clear
    expect(maturityCalls).toHaveLength(0);

    // The row is therefore untouched, and the real load still closes the boundary.
    SessionStateManager.load(store, '/p', boundary);
    expect(maturityCalls).toHaveLength(1);
  });
});
