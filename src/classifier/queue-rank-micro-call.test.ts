import { describe, it, expect } from 'vitest';
import { detectAbsenceFlags } from './AbsenceDetector.js';
import { SIGNAL_MAP } from '../core/classifier/signals.js';
import { estimateQueueIfStageStaysV1, startQueueRankMicroCallV1, parseQueueRankReplyV1 } from './queue-rank-micro-call.js';

type DetectorState = Parameters<typeof detectAbsenceFlags>[0];

/** A confirmed implementation-stage session, N prompts in, every signal counter untouched. */
function session(n: number, absenceFlags: DetectorState['absenceFlags'] = []): DetectorState {
  const signalCounters: Record<string, { lastSeenAt: number | null; count: number }> = {};
  for (const k of SIGNAL_MAP.keys()) signalCounters[k] = { lastSeenAt: null, count: 0 };
  return {
    currentStage: 'implementation',
    stageConfidence: 1,
    promptsInCurrentStage: n,
    promptCount: n,
    absenceFlags,
    signalCounters,
    promptHistory: [],
    consecutiveAcceptanceStreak: 0,
  } as unknown as DetectorState;
}

const KEY = 'cross_confirming';   // qualifies in implementation by 30 prompts; used the same way by the run scripts' self-test

describe('estimateQueueIfStageStaysV1 — the candidate list mirrors the detector as it will run after processPrompt', () => {
  it('offers a signal whose cooldown expires on THIS prompt, which the detector on the un-advanced state still hides', () => {
    const s = session(30, [{ signalKey: KEY, raisedAtIndex: 1, cooldownUntil: 31 } as DetectorState['absenceFlags'][number]]);
    const plain = detectAbsenceFlags(s, null, undefined, 1.0, 5, {}).map((f) => f.signalKey);
    const offered = estimateQueueIfStageStaysV1(s, null, undefined, 1.0, 5, {});
    expect(plain).not.toContain(KEY);       // promptCount 30 < cooldownUntil 31: still cooling
    expect(offered).toContain(KEY);         // promptCount will be 31 when the enforced queue is built
  });

  it('does not offer a signal still cooling after this prompt', () => {
    const s = session(30, [{ signalKey: KEY, raisedAtIndex: 2, cooldownUntil: 32 } as DetectorState['absenceFlags'][number]]);
    expect(estimateQueueIfStageStaysV1(s, null, undefined, 1.0, 5, {})).not.toContain(KEY);
  });

  it('equals the detector run on the state advanced by exactly one prompt in the stage and overall', () => {
    const s = session(29, [{ signalKey: KEY, raisedAtIndex: 0, cooldownUntil: 30 } as DetectorState['absenceFlags'][number]]);
    const advanced = { ...s, promptsInCurrentStage: 30, promptCount: 30 } as DetectorState;
    expect(estimateQueueIfStageStaysV1(s, null, undefined, 1.0, 5, {}))
      .toEqual(detectAbsenceFlags(advanced, null, undefined, 1.0, 5, {}).map((f) => f.signalKey));
  });

  it('never writes to the session state it is given', () => {
    const s = session(30, [{ signalKey: KEY, raisedAtIndex: 1, cooldownUntil: 31 } as DetectorState['absenceFlags'][number]]);
    const before = JSON.stringify(s);
    estimateQueueIfStageStaysV1(s, null, undefined, 1.0, 5, {});
    expect(JSON.stringify(s)).toBe(before);
    expect(s.promptCount).toBe(30);
    expect(s.promptsInCurrentStage).toBe(30);
  });
});

describe('startQueueRankMicroCallV1 — fail-closed gates', () => {
  it('is inert with fewer than two candidates and never touches the client', () => {
    let calls = 0;
    const client = { chat: { completions: { create: () => { calls += 1; return Promise.reject(new Error('must not be called')); } } } };
    const h = startQueueRankMicroCallV1(['only_one'], ['a prompt'], client as never);
    expect(h.outcome()).toBe('gated_out_fewer_than_two');
    expect(h.read()).toBeUndefined();
    expect(calls).toBe(0);
  });

  it('accepts only a reply naming one of the offered keys', () => {
    expect(parseQueueRankReplyV1('{"selected_signal_key":"b"}', ['a', 'b'])).toBe('b');
    expect(parseQueueRankReplyV1('{"selected_signal_key":"zzz"}', ['a', 'b'])).toBeUndefined();
    expect(parseQueueRankReplyV1('not json', ['a', 'b'])).toBeUndefined();
  });
});
