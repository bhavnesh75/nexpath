/**
 * ⭐ RC76 — the "previous prompt's popup" bug, reproduced against the REAL store and fixed
 * through the REAL decider + REAL consumer (no seams for the mechanism under test).
 *
 * Tester report 2026-09-08: the popup on the 4th prompt showed the 3rd prompt's content.
 * Precondition (Layer C, shown here as a fact, not changed): the store pops the newest
 * pending row for the project + session with NO prompt identity, so a row left pending by
 * prompt 3 is exactly what prompt 4's `stop` would render when prompt 4 wrote no row.
 * Fix (ours): the decider consumes every row created before THIS turn's `auto` started, in
 * the instant before `stop` is spawned.
 */
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { openStore, type Store } from '../../store/db.js';
import {
  upsertPendingPromptEnhancement,
  getPendingPromptEnhancement,
} from '../../store/pending-prompt-enhancements.js';
import { buildPromptEnhancementRequestForAuto } from './auto.js';
import { preparePromptEnhancement } from '../../prompt-enhancement/facade.js';
import { SessionStateManager } from '../../classifier/SessionStateManager.js';
import { buildStopDrivenPromptSubmitDecider } from './submit-stop-decider.js';

const ROOT = '/proj/rc76';
const SESSION = 'rc76-session';

async function validPayload(store: Store) {
  const session = SessionStateManager.load(store, ROOT);
  const request = buildPromptEnhancementRequestForAuto({
    auto: { promptText: 'implement the auth token refresh path', projectRoot: ROOT, currentAgentMode: 'workspace-write' },
    store, session, project: null, effectiveLanguage: 'en', configuredRole: null,
    effectiveFlagType: 'stage_transition', firedKey: 'stage_transition:idea→implementation', previousStage: 'idea',
    trigger: { kind: 'stage_transition' },
    stageResult: {
      classification: { stage: 'implementation', confidence: 0.9, tier: 3, allScores: {} },
      signalsPresent: [], signalsAbsent: [], fireRecommendation: true, selectedSignalKey: '', reason: 'test', degraded: false,
    },
    streamBOutputs: [],
  });
  const result = await preparePromptEnhancement(request);
  return { request, result };
}

/** A `stop` that shows nothing (exit 0, no block line) ⇒ the decider answers allow. */
function lazyStopChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter & { setEncoding: () => void }; stdin: { write: () => void; end: () => void }; kill: () => void; exitCode: number | null; signalCode: string | null };
  child.stdout = Object.assign(new EventEmitter(), { setEncoding: () => {} });
  child.stdin = { write: () => {}, end: () => {} };
  child.kill = vi.fn(); child.exitCode = 0; child.signalCode = null;
  queueMicrotask(() => { child.emit('exit', 0); child.emit('close', 0); });
  return child;
}

function realDecider(store: Store, events: string[]) {
  return buildStopDrivenPromptSubmitDecider(
    { project: ROOT },
    {
      host: 'cursor', mkdirFn: (() => {}) as never,
      spawnFn: (() => { events.push('spawn:stop'); return lazyStopChild(); }) as never,
      writeDecision: vi.fn(async () => {}) as never,
      logEvent: ((_l: string, name: string, data: unknown) => { events.push(`${name}:${JSON.stringify(data)}`); }) as never,
      readDelivererState: (() => ({ state: 'armed' as const })) as never,
      openStoreFn: (async () => store) as never,   // the real in-memory store, kept open across the decider's opens
      closeStoreFn: (() => {}) as never,
      // NO consumeStaleRows seam: the real RC71 consumer runs against the real store.
    },
  );
}

describe('⭐ RC76 — real store: a row left by prompt 3 is what prompt 4 would pop, and the decider now consumes it', () => {
  it('⭐ precondition (fact): the pop has no prompt identity — prompt 3\'s pending row is returned when prompt 4 asks', async () => {
    const store = await openStore(':memory:');
    const { request, result } = await validPayload(store);
    upsertPendingPromptEnhancement(store, { projectRoot: ROOT, sessionId: SESSION, promptCount: 3, request, result });
    const popped = getPendingPromptEnhancement(store, ROOT, SESSION);   // exactly what stop.ts:588 reads on prompt 4
    expect(popped?.promptCount).toBe(3);
    expect(popped?.status).toBe('pending');
  });

  it('⭐ fix: with THIS turn\'s auto having started after that row, the decider consumes it before stop runs', async () => {
    const store = await openStore(':memory:');
    const { request, result } = await validPayload(store);
    upsertPendingPromptEnhancement(store, { projectRoot: ROOT, sessionId: SESSION, promptCount: 3, request, result });
    const stale = getPendingPromptEnhancement(store, ROOT, SESSION)!;
    const events: string[] = [];
    const decide = realDecider(store, events);
    await expect(decide('beforeSubmitPrompt', { project: ROOT, turnStartedAt: stale.createdAt + 10_000 }, 'prompt 4 text')).resolves.toBe('allow');
    expect(getPendingPromptEnhancement(store, ROOT, SESSION)).toBeNull();   // nothing left for stop to pop
    const consumedAt = events.findIndex((e) => e.startsWith('submit_stop_decider_stale_rows_consumed:'));
    expect(consumedAt).toBeGreaterThan(-1);
    expect(events[consumedAt]).toContain('"prompt_enhancements":1');
    expect(consumedAt).toBeLessThan(events.indexOf('spawn:stop'));          // consumed BEFORE stop was spawned
  });

  it('⭐ a row written by THIS turn\'s auto (newer than the boundary) is kept for stop to show', async () => {
    const store = await openStore(':memory:');
    const { request, result } = await validPayload(store);
    upsertPendingPromptEnhancement(store, { projectRoot: ROOT, sessionId: SESSION, promptCount: 4, request, result });
    const fresh = getPendingPromptEnhancement(store, ROOT, SESSION)!;
    const events: string[] = [];
    await realDecider(store, events)('beforeSubmitPrompt', { project: ROOT, turnStartedAt: fresh.createdAt - 10_000 }, 'prompt 4 text');
    expect(getPendingPromptEnhancement(store, ROOT, SESSION)?.promptCount).toBe(4);
    expect(events.some((e) => e.startsWith('submit_stop_decider_stale_rows_consumed:'))).toBe(false);
  });

  it('control: without a boundary (the shipped call shape) the stale row survives — the bug as it was', async () => {
    const store = await openStore(':memory:');
    const { request, result } = await validPayload(store);
    upsertPendingPromptEnhancement(store, { projectRoot: ROOT, sessionId: SESSION, promptCount: 3, request, result });
    const events: string[] = [];
    await realDecider(store, events)('beforeSubmitPrompt', { project: ROOT }, 'prompt 4 text');
    expect(getPendingPromptEnhancement(store, ROOT, SESSION)?.promptCount).toBe(3);
  });
});
