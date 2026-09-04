import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../telemetry/index.js', () => ({
  writeTelemetry: vi.fn(),
  TELEMETRY_PATH: '/mock/telemetry.jsonl',
}));

vi.mock('../../telemetry/recent-prompts.js', () => ({
  recentPromptMetadata: vi.fn().mockReturnValue([]),
}));

vi.mock('../../decision-session/OptionGenerator.js', () => ({
  generateOptionList: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../telemetry/lifecycle-flush.js', () => ({
  flushIfTelemetryOn: vi.fn().mockResolvedValue(undefined),
  flushLifecycle:     vi.fn().mockResolvedValue(undefined),
}));

import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStore, closeStore, type Store } from '../../store/db.js';
import { flushLifecycle } from '../../telemetry/lifecycle-flush.js';
import { runStop, type StopPayload, type FeedbackDeps } from './stop.js';
import { upsertPendingAdvisory } from '../../store/pending-advisories.js';
import { SessionStateManager } from '../../classifier/SessionStateManager.js';
import type { SelectFn } from '../../decision-session/DecisionSession.js';
import {
  recordActivity as recordUsage,
  readCadence,
  USAGE_THRESHOLD_MS,
  IDLE_CAP_MS,
} from '../../store/feedback-cadence.js';
import type { FeedbackRenderFn } from '../../decision-session/feedback-popup.js';
import { FEEDBACK_OPTIONS } from '../../decision-session/feedback-popup.js';

const CWD = '/test/project';

function makePayload(overrides: Partial<StopPayload> = {}): StopPayload {
  return {
    session_id: 'sess-001', cwd: CWD, hook_event_name: 'Stop',
    stop_hook_active: false, last_assistant_message: 'Done.', ...overrides,
  };
}

function insertAdvisory(store: Store) {
  const mgr = SessionStateManager.load(store, CWD);
  mgr.setDetectedLanguage(store, undefined);
  upsertPendingAdvisory(store, {
    projectRoot: CWD, stage: 'implementation', flagType: 'absence:test_creation',
    pinchLabel: 'Hold up.', sessionId: mgr.current.sessionId, promptCount: 5,
  });
}

/** Force the global usage accumulator to the eligibility threshold. */
function makeEligible(store: Store) {
  let t = 0;
  while (readCadence(store).activeMs < USAGE_THRESHOLD_MS) {
    recordUsage(store, t);
    t += IDLE_CAP_MS;
  }
}

const pickRating = (rating: number): FeedbackRenderFn => {
  const opt = FEEDBACK_OPTIONS.find((o) => o.rating === rating)!;
  return async () => ({ value: opt.value, label: opt.label });
};
const dismissRender: FeedbackRenderFn = async () => null;

let store: Store;
/** Never the real sender: a stray real call would POST to PostHog for real. */
let sendDismissed: ReturnType<typeof vi.fn>;
let sendRatingOption: ReturnType<typeof vi.fn>;

beforeEach(async () => { store = await openStore(':memory:'); sendDismissed = vi.fn().mockResolvedValue(true); sendRatingOption = vi.fn().mockResolvedValue(true); });
afterEach(() => { closeStore(store); vi.restoreAllMocks(); });

describe('feedback popup integration', () => {
  it('shows feedback and sends the rating when eligible', async () => {
    vi.mocked(flushLifecycle).mockClear();
    makeEligible(store);
    const send = vi.fn().mockResolvedValue(true);
    const deps: FeedbackDeps = { render: pickRating(3), send, sendDismissed, sendRatingOption };

    const result = await runStop(makePayload(), store, undefined, undefined, deps);

    expect(result.outcome).toBe('feedback_shown');
    expect(send).toHaveBeenCalledWith(store, 3, expect.any(Number));
    // consent gate: buffered lifecycle events flushed on a rating
    expect(flushLifecycle).toHaveBeenCalledWith(store);
    // cadence reset
    const c = readCadence(store);
    expect(c.activeMs).toBe(0);
    expect(c.lastFeedbackAt).not.toBeNull();
  });

  it('⭐ on dismiss: reports the dismissal, sends no rating, and does NOT flush', async () => {
    // The dismissal event exists so that "asked and declined" is not the same
    // absence in the data as "never asked". It must still not release the
    // buffer: the rating CLICK is the consent for that, and this is its
    // opposite.
    vi.mocked(flushLifecycle).mockClear();
    makeEligible(store);
    const send = vi.fn().mockResolvedValue(true);
    const deps: FeedbackDeps = { render: dismissRender, send, sendDismissed, sendRatingOption };

    const result = await runStop(makePayload(), store, undefined, undefined, deps);

    expect(result.outcome).toBe('feedback_shown');
    expect(sendDismissed).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();             // no rating to send
    expect(flushLifecycle).not.toHaveBeenCalled();   // no consent → no flush
    expect(readCadence(store).lastFeedbackAt).not.toBeNull();
  });

  it('⭐ on a selection: sends the rating and flushes, and does NOT report a dismissal', async () => {
    vi.mocked(flushLifecycle).mockClear();
    makeEligible(store);
    const send = vi.fn().mockResolvedValue(true);
    const deps: FeedbackDeps = { render: pickRating(2), send, sendDismissed, sendRatingOption };

    await runStop(makePayload(), store, undefined, undefined, deps);

    expect(send).toHaveBeenCalledOnce();
    expect(flushLifecycle).toHaveBeenCalledOnce();
    expect(sendDismissed).not.toHaveBeenCalled();    // the two are exclusive
  });

  it('⭐ a selection also reports the option under its own event name', async () => {
    makeEligible(store);
    const send = vi.fn().mockResolvedValue(true);
    const deps: FeedbackDeps = { render: pickRating(3), send, sendDismissed, sendRatingOption };

    await runStop(makePayload(), store, undefined, undefined, deps);

    expect(sendRatingOption).toHaveBeenCalledOnce();
    expect(sendRatingOption).toHaveBeenCalledWith(store, 3, expect.any(Number));   // rating + the shared timestamp
  });

  it('⭐ a dismissal reports no option — there is none to report', async () => {
    makeEligible(store);
    const send = vi.fn().mockResolvedValue(true);
    const deps: FeedbackDeps = { render: dismissRender, send, sendDismissed, sendRatingOption };

    await runStop(makePayload(), store, undefined, undefined, deps);

    expect(sendDismissed).toHaveBeenCalledOnce();
    expect(sendRatingOption).not.toHaveBeenCalled();
  });

  it('a failed per-option send does not disturb the rating or the cadence', async () => {
    // It is the second envelope on one consent; the record the dashboards were
    // built on must not depend on it.
    makeEligible(store);
    const send = vi.fn().mockResolvedValue(true);
    sendRatingOption.mockResolvedValue(false);
    const deps: FeedbackDeps = { render: pickRating(1), send, sendDismissed, sendRatingOption };

    const result = await runStop(makePayload(), store, undefined, undefined, deps);

    expect(result.outcome).toBe('feedback_shown');
    expect(send).toHaveBeenCalledOnce();
    expect(readCadence(store).lastFeedbackAt).not.toBeNull();
  });

  it('preempts the advisory when both are due', async () => {
    makeEligible(store);
    insertAdvisory(store);
    const advisorySelect: SelectFn = vi.fn().mockResolvedValue('some option');
    const send = vi.fn().mockResolvedValue(true);
    const deps: FeedbackDeps = { render: pickRating(4), send, sendDismissed, sendRatingOption };

    const result = await runStop(makePayload(), store, advisorySelect, undefined, deps);

    expect(result.outcome).toBe('feedback_shown');
    expect(advisorySelect).not.toHaveBeenCalled(); // advisory not shown this turn
  });

  it('does not show feedback when not eligible (advisory proceeds)', async () => {
    insertAdvisory(store);
    const send = vi.fn().mockResolvedValue(true);
    const render = vi.fn<FeedbackRenderFn>(async () => null);
    const deps: FeedbackDeps = { render, send, sendDismissed, sendRatingOption };

    const result = await runStop(makePayload(), store, undefined, undefined, deps);

    expect(render).not.toHaveBeenCalled();
    expect(result.outcome).toBe('advisory_disabled'); // advisory found but disabled (MPS-7), not rendered
  });

  it('skips feedback when no renderer is available even if eligible', async () => {
    makeEligible(store);
    insertAdvisory(store);
    const send = vi.fn().mockResolvedValue(true);
    const deps: FeedbackDeps = { render: null, send, sendDismissed, sendRatingOption };

    const result = await runStop(makePayload(), store, undefined, undefined, deps);

    expect(result.outcome).toBe('advisory_disabled'); // fell through to the advisory, which is disabled (MPS-7)
    expect(send).not.toHaveBeenCalled();
    // cadence NOT reset (feedback wasn't shown)
    expect(readCadence(store).lastFeedbackAt).toBeNull();
  });

  it('persists the cadence reset after the popup with a real file store (D4 lock release + reload)', async () => {
    const dbPath = join(tmpdir(), `nexpath-stopfb-${randomUUID()}.db`);
    try {
      let s = await openStore(dbPath);
      makeEligible(s);
      const send = vi.fn().mockResolvedValue(true);
      const deps: FeedbackDeps = { render: pickRating(3), send, sendDismissed, sendRatingOption };

      const result = await runStop(makePayload(), s, undefined, undefined, deps);
      expect(result.outcome).toBe('feedback_shown');
      expect(send).toHaveBeenCalledWith(s, 3, expect.any(Number));
      closeStore(s);

      // Reopen: markFeedbackShown ran after release→popup→reacquire+reload, so the
      // reset must have landed on the reloaded db and persisted to disk.
      s = await openStore(dbPath);
      const c = readCadence(s);
      expect(c.activeMs).toBe(0);
      expect(c.lastFeedbackAt).not.toBeNull();
      closeStore(s);
    } finally {
      rmSync(dbPath, { force: true });
      rmSync(`${dbPath}.lock`, { force: true });
    }
  });
});
