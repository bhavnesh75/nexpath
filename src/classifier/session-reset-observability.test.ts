import { describe, it, expect, vi, afterEach } from 'vitest';
import { SessionStateManager, SESSION_GAP_MS } from './SessionStateManager.js';
import { openStore } from '../store/db.js';
import { logger } from '../logger.js';
import type { ClassificationResult, PromptRecord } from './types.js';

/**
 * A session boundary drops the accumulated stage, prompt history, signal counters and
 * fired-event keys, and until now it left no trace at all — a run either side of one could
 * not be told apart from a run inside it. These assert the RECORD only: nothing here changes
 * when a session resets or what a reset does.
 */

const HISTORY: PromptRecord[] = [
  { index: 0, text: 'implement the feature module with tests', capturedAt: 1, classifiedStage: 'idea', confidence: 0.5 },
];

/** Every `session_reset` payload the logger saw, in order. */
function resetEvents(spy: ReturnType<typeof vi.spyOn>): Array<Record<string, unknown>> {
  return spy.mock.calls
    .filter((call) => call[0] === 'session_reset')
    .map((call) => (call[1] ?? {}) as Record<string, unknown>);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('session_reset — the load() boundary', () => {
  it('reports the ended session and the one replacing it', async () => {
    const store = await openStore(':memory:');
    const t0 = Date.now();
    SessionStateManager.bootstrapFromHistory(store, '/p', HISTORY, 5);
    const before = SessionStateManager.load(store, '/p', t0).current;

    const infoSpy = vi.spyOn(logger, 'info');
    const after = SessionStateManager.load(store, '/p', t0 + SESSION_GAP_MS + 10_000).current;

    const events = resetEvents(infoSpy);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      reason:              'inactivity_gap',
      projectRoot:         '/p',
      previousSessionId:   before.sessionId,
      previousStage:       before.currentStage,
      previousPromptCount: before.promptCount,
      newSessionId:        after.sessionId,
    });
    // The record is only useful if it names two DIFFERENT sessions.
    expect(after.sessionId).not.toBe(before.sessionId);
  });

  it('is silent inside the gap — a continuing session is not a reset', async () => {
    const store = await openStore(':memory:');
    const t0 = Date.now();
    SessionStateManager.bootstrapFromHistory(store, '/p', HISTORY, 5);

    const infoSpy = vi.spyOn(logger, 'info');
    SessionStateManager.load(store, '/p', t0 + 60_000);

    expect(resetEvents(infoSpy)).toEqual([]);
  });

  it('is silent for a project with no persisted session — nothing ended', async () => {
    const store = await openStore(':memory:');
    const infoSpy = vi.spyOn(logger, 'info');

    SessionStateManager.load(store, '/never-seen', Date.now());

    expect(resetEvents(infoSpy)).toEqual([]);
  });

  it('is silent for a load that does not end the previous session', async () => {
    // The throwaway load `runAuto` makes for its injected-prompt guard. Recording there would
    // report one boundary twice in a single command, from two managers only one of which is
    // kept. The side-effect half is in session-boundary-closed-once.test.ts.
    const store = await openStore(':memory:');
    const t0 = Date.now();
    SessionStateManager.bootstrapFromHistory(store, '/p', HISTORY, 5);

    const infoSpy = vi.spyOn(logger, 'info');
    SessionStateManager.load(store, '/p', t0 + SESSION_GAP_MS + 10_000, { endPreviousSession: false });

    expect(resetEvents(infoSpy)).toEqual([]);
  });

  it('reports exactly once when a guard load precedes the real one — the runAuto shape', async () => {
    const store = await openStore(':memory:');
    const t0 = Date.now();
    SessionStateManager.bootstrapFromHistory(store, '/p', HISTORY, 5);
    const boundary = t0 + SESSION_GAP_MS + 10_000;

    const infoSpy = vi.spyOn(logger, 'info');
    SessionStateManager.load(store, '/p', boundary, { endPreviousSession: false });
    SessionStateManager.load(store, '/p', boundary);

    expect(resetEvents(infoSpy)).toHaveLength(1);
  });
});

describe('session_reset — the processPrompt() boundary', () => {
  // The other place a session can end: inside a manager that was already loaded, when the
  // gap elapses between one prompt and the next.
  it('reports the in-place reset with the ended session values', async () => {
    const store = await openStore(':memory:');
    const t0 = Date.now();
    SessionStateManager.bootstrapFromHistory(store, '/p', HISTORY, 5);
    const mgr = SessionStateManager.load(store, '/p', t0);
    const endedSessionId = mgr.current.sessionId;
    const endedStage = mgr.current.currentStage;
    const endedPromptCount = mgr.current.promptCount;
    expect(endedPromptCount).toBeGreaterThan(0); // the gap branch requires it

    const classification: ClassificationResult = {
      stage: 'implementation', confidence: 0.4, tier: 1, allScores: { implementation: 0.4 },
    };
    const infoSpy = vi.spyOn(logger, 'info');
    mgr.processPrompt(store, 'add a button', classification, t0 + SESSION_GAP_MS + 10_000);

    const events = resetEvents(infoSpy);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      reason:              'inactivity_gap',
      projectRoot:         '/p',
      previousSessionId:   endedSessionId,
      previousStage:       endedStage,
      previousPromptCount: endedPromptCount,
      newSessionId:        mgr.current.sessionId,
    });
    expect(mgr.current.sessionId).not.toBe(endedSessionId);
  });

  it('is silent when the next prompt arrives inside the gap', async () => {
    const store = await openStore(':memory:');
    const t0 = Date.now();
    SessionStateManager.bootstrapFromHistory(store, '/p', HISTORY, 5);
    const mgr = SessionStateManager.load(store, '/p', t0);

    const classification: ClassificationResult = {
      stage: 'implementation', confidence: 0.4, tier: 1, allScores: { implementation: 0.4 },
    };
    const infoSpy = vi.spyOn(logger, 'info');
    mgr.processPrompt(store, 'add a button', classification, t0 + 60_000);

    expect(resetEvents(infoSpy)).toEqual([]);
  });
});
