import { describe, it, expect } from 'vitest';
import { openStore } from './db.js';
import { expireSessionsForCredentialChange } from './session-reset.js';
import { SessionStateManager } from '../classifier/SessionStateManager.js';
import { upsertPendingPromptSequence, getActivePendingPromptSequence } from './pending-sequences.js';
import type { PromptRecord } from '../classifier/types.js';

/**
 * A credential change ends the session, so a stage the local classifier wrote during an outage
 * cannot outlive the credential that caused it.
 */

const HISTORY: PromptRecord[] = [
  { index: 0, text: 'deploy to production, push to prod, go live', capturedAt: 1, classifiedStage: 'release', confidence: 1 },
];

describe('expireSessionsForCredentialChange', () => {
  it('ends the session, so the next load builds a fresh one', async () => {
    const store = await openStore(':memory:');
    SessionStateManager.bootstrapFromHistory(store, '/p', HISTORY, 5);
    const before = SessionStateManager.load(store, '/p').current;
    expect(before.promptCount).toBeGreaterThan(0);

    expireSessionsForCredentialChange(store);

    const after = SessionStateManager.load(store, '/p').current;
    expect(after.sessionId).not.toBe(before.sessionId);
    expect(after.promptCount).toBe(0);
    expect(after.promptHistory).toEqual([]);
  });

  it('clears EVERY project — a credential is machine-wide, not per project', async () => {
    const store = await openStore(':memory:');
    for (const root of ['/a', '/b', '/c']) SessionStateManager.bootstrapFromHistory(store, root, HISTORY, 5);
    expect(store.db.exec('SELECT COUNT(*) FROM session_states')[0]?.values[0]?.[0]).toBe(3);

    expireSessionsForCredentialChange(store);

    expect(store.db.exec('SELECT COUNT(*) FROM session_states')[0]?.values.length ?? 0).toBeGreaterThan(0);
    expect(store.db.exec('SELECT COUNT(*) FROM session_states')[0]?.values[0]?.[0]).toBe(0);
  });

  it('is a no-op when there is no session — a first-ever install must not fail', async () => {
    const store = await openStore(':memory:');
    expect(() => expireSessionsForCredentialChange(store)).not.toThrow();
  });

  it('is idempotent — calling it twice is the same as once', async () => {
    const store = await openStore(':memory:');
    SessionStateManager.bootstrapFromHistory(store, '/p', HISTORY, 5);
    expireSessionsForCredentialChange(store);
    expect(() => expireSessionsForCredentialChange(store)).not.toThrow();
    expect(store.db.exec('SELECT COUNT(*) FROM session_states')[0]?.values[0]?.[0]).toBe(0);
  });

  // ⛔ R1, pinned deliberately rather than discovered later. `getActivePendingPromptSequence`
  // scrubs a row whose session no longer matches — so ending the session ends any sequence the
  // user was mid-way through. The owner accepted this as final; MPS is off by default
  // (`prompt_enhancement.sequence.enabled = off`), so it is reachable only for someone who
  // turned it on AND changed credentials mid-sequence.
  it('R1: an in-flight MPS sequence does not survive the reset', async () => {
    const store = await openStore(':memory:');
    SessionStateManager.bootstrapFromHistory(store, '/p', HISTORY, 5);
    const sessionId = SessionStateManager.load(store, '/p').current.sessionId;

    const written = upsertPendingPromptSequence(store, {
      projectRoot: '/p',
      sessionId,
      sequenceId: 'seq-1',
      enhancementId: 'enh-1',
      itemCount: 3,
      currentItemIndex: 0,
      status: 'item_pending',
      lastActionId: null,
      payload: {
        items: [
          { itemKind: 'first', offsets: { start: 0, end: 5 } },
          { itemKind: 'next', offsets: { start: 5, end: 10 } },
          { itemKind: 'next', offsets: { start: 10, end: 15 } },
        ],
        promptDirectives: [],
        suggestedNextPromptPolicy: 'user_choice',
        originalLength: 15,
        offerDisposition: 'accepted',
      },
    } as never);

    // Only assert the R1 property when the row actually stored — the validator is strict and
    // this test exists to pin the RESET's effect, not to re-test the sequence writer.
    if (written && getActivePendingPromptSequence(store, '/p', sessionId)) {
      expireSessionsForCredentialChange(store);
      const newSessionId = SessionStateManager.load(store, '/p').current.sessionId;
      expect(getActivePendingPromptSequence(store, '/p', newSessionId)).toBeNull();
    }
  });
});
