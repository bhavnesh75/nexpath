import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPePoller } from './pe-poller.js';
import type { PendingPromptEnhancementRow } from './pe-store-reader.js';

const validResultJson = JSON.stringify({
  enhancementId: 'enh-1',
  validationDecisionId: 'vd-1',
  uiView: {
    body: {
      text: 'the enhanced body',
      currentBodyId: 'body-1',
      bodyRevision: 3,
      sendPolicy: 'send_current',
      actionLoadingState: 'idle',
      fallbackMode: 'none',
    },
    actions: [],
  },
});

const row = (o: Partial<PendingPromptEnhancementRow> = {}): PendingPromptEnhancementRow => ({
  id: 1, projectRoot: '/proj', sessionId: 's1', promptCount: 1,
  status: 'pending', createdAt: 5000, requestJson: '{}', resultJson: validResultJson,
  emphasisPhrasesJson: null, ...o,
});

describe('createPePoller (Windsurf/Devin PE delivery)', () => {
  let onDeliver: ReturnType<typeof vi.fn>;
  let onPublish: ReturnType<typeof vi.fn>;
  let onOutcome: ReturnType<typeof vi.fn>;
  let readPendingPe: ReturnType<typeof vi.fn>;
  let t: number;
  const make = (over = {}) => createPePoller({
    projectRoots: ['/proj'], readPendingPe, onDeliver, onPublish, onOutcome,
    now: () => t, setIntervalFn: () => 1, clearIntervalFn: () => {}, ...over,
  });

  beforeEach(() => {
    onDeliver = vi.fn().mockResolvedValue('inserted');
    onPublish = vi.fn();
    onOutcome = vi.fn();
    readPendingPe = vi.fn().mockResolvedValue(null);
    t = 4000;
  });

  it('delivers the current body text of a newly-parked PE row', async () => {
    readPendingPe.mockResolvedValue(row({ createdAt: 5000 }));
    const p = make(); p.start(); t = 5001;
    await p.pollOnce();
    expect(onDeliver).toHaveBeenCalledWith('the enhanced body');
    expect(onOutcome).toHaveBeenCalledWith('inserted');
  });

  it('publishes the parsed payload too, so the same renderer shows it if the panel is open', async () => {
    readPendingPe.mockResolvedValue(row({ createdAt: 5000 }));
    const p = make(); p.start(); t = 5001;
    await p.pollOnce();
    expect(onPublish).toHaveBeenCalledWith(expect.objectContaining({ currentBodyId: 'body-1', bodyRevision: 3 }));
  });

  it('does nothing when nothing has been parked since start()', async () => {
    readPendingPe.mockResolvedValue(row({ createdAt: 3000 })); // before startedAt=4000
    const p = make(); p.start();
    await p.pollOnce();
    expect(onDeliver).not.toHaveBeenCalled();
  });

  it('a row parked at exactly startedAt (same tick as start()) is not delivered — only STRICTLY-after rows count', async () => {
    readPendingPe.mockResolvedValue(row({ createdAt: 4000 })); // == startedAt (t=4000 at start())
    const p = make(); p.start(); // startedAt captured as 4000
    t = 4001;
    await p.pollOnce();
    expect(onDeliver).not.toHaveBeenCalled();
  });

  it('does not re-deliver the same row on a later poll (one-shot per createdAt)', async () => {
    readPendingPe.mockResolvedValue(row({ createdAt: 5000 }));
    const p = make(); p.start();
    t = 5001; await p.pollOnce();
    t = 6000; await p.pollOnce();
    t = 7000; await p.pollOnce();
    expect(onDeliver).toHaveBeenCalledTimes(1);
  });

  it('delivers a NEW row that arrives after an already-handled one', async () => {
    readPendingPe.mockResolvedValueOnce(row({ createdAt: 5000, resultJson: validResultJson }));
    const p = make(); p.start();
    t = 5001; await p.pollOnce();
    expect(onDeliver).toHaveBeenCalledTimes(1);

    const secondResultJson = JSON.stringify({
      enhancementId: 'enh-2', validationDecisionId: 'vd-2',
      uiView: { body: { text: 'a second enhanced body', currentBodyId: 'body-2', bodyRevision: 1, sendPolicy: 'send_current', actionLoadingState: 'idle', fallbackMode: 'none' }, actions: [] },
    });
    readPendingPe.mockResolvedValue(row({ createdAt: 6000, resultJson: secondResultJson }));
    t = 6001; await p.pollOnce();
    expect(onDeliver).toHaveBeenCalledTimes(2);
    expect(onDeliver).toHaveBeenLastCalledWith('a second enhanced body');
  });

  it('picks the newest row across multiple candidate roots', async () => {
    readPendingPe.mockImplementation(async (root: string) =>
      root === '/proj-a' ? row({ createdAt: 5000, projectRoot: root }) : row({ createdAt: 9000, projectRoot: root }),
    );
    const p = make({ projectRoots: ['/proj-a', '/proj-b'] });
    p.start(); t = 9001;
    await p.pollOnce();
    expect(onDeliver).toHaveBeenCalledTimes(1); // only the newest row across both roots
  });

  it('a row marked "shown" is still delivered — status is never treated as proof a surface already appeared', async () => {
    readPendingPe.mockResolvedValue(row({ createdAt: 5000, status: 'shown' }));
    const p = make(); p.start(); t = 5001;
    await p.pollOnce();
    expect(onDeliver).toHaveBeenCalledOnce();
  });

  it('a malformed/unparseable resultJson is never delivered', async () => {
    readPendingPe.mockResolvedValue(row({ createdAt: 5000, resultJson: '{not valid json' }));
    const p = make(); p.start(); t = 5001;
    await p.pollOnce();
    expect(onDeliver).not.toHaveBeenCalled();
  });

  it('a delivery failure still marks the row handled — never retried, even on failure', async () => {
    onDeliver.mockResolvedValue('insert_failed_no_clipboard_fallback');
    readPendingPe.mockResolvedValue(row({ createdAt: 5000 }));
    const p = make(); p.start();
    t = 5001; await p.pollOnce();
    t = 6000; await p.pollOnce();
    expect(onDeliver).toHaveBeenCalledTimes(1);
    expect(onOutcome).toHaveBeenCalledWith('insert_failed_no_clipboard_fallback');
  });

  it('onDeliver rejecting propagates out of pollOnce (reads are guarded per-root; delivery itself is not — same as advisory-poller.ts\'s onArm)', async () => {
    onDeliver.mockRejectedValue(new Error('command execution failed'));
    readPendingPe.mockResolvedValue(row({ createdAt: 5000 }));
    const p = make(); p.start(); t = 5001;
    await expect(p.pollOnce()).rejects.toThrow('command execution failed');
  });

  it('a rejection from onDeliver still resets the in-flight guard and still marks the row handled, so the next poll proceeds normally', async () => {
    onDeliver.mockRejectedValueOnce(new Error('boom'));
    readPendingPe.mockResolvedValue(row({ createdAt: 5000 }));
    const p = make(); p.start(); t = 5001;
    await expect(p.pollOnce()).rejects.toThrow('boom');

    onDeliver.mockResolvedValue('inserted');
    readPendingPe.mockResolvedValue(row({ createdAt: 6000 }));
    t = 6001;
    await p.pollOnce();
    expect(onDeliver).toHaveBeenCalledTimes(2);
  });

  it('readPendingPe throwing for a root is treated as no row there, never crashes', async () => {
    readPendingPe.mockRejectedValue(new Error('sqlite busy'));
    const p = make(); p.start(); t = 5001;
    await expect(p.pollOnce()).resolves.toBeUndefined();
    expect(onDeliver).not.toHaveBeenCalled();
  });

  /**
   * ⛔ The failure this work has hit FOUR times already: a producer that is
   * correct and never reached.
   *
   * The phrases live in a different column from the result, so the parser takes
   * them as a second argument — and a call site that simply does not pass it
   * compiles, runs, and quietly publishes a payload with no bold. Nothing in the
   * parser's own tests can see that, because they call it directly.
   *
   * So this asserts the PRODUCTION path: a row carrying phrases must publish a
   * payload carrying them.
   */
  it('publishes the phrases the row carries — the column reaches the payload', async () => {
    readPendingPe.mockResolvedValue(row({
      createdAt: 5000,
      emphasisPhrasesJson: JSON.stringify([
        { text: 'the enhanced body', emphasisClass: 3, source: 'floor' },
      ]),
    }));
    const p = make(); p.start(); t = 5001;
    await p.pollOnce();
    expect(onPublish).toHaveBeenCalledWith(
      expect.objectContaining({ emphasisPhrases: ['the enhanced body'] }),
    );
  });

  it('a row with no phrase column publishes a payload with none', async () => {
    readPendingPe.mockResolvedValue(row({ createdAt: 5000 }));
    const p = make(); p.start(); t = 5001;
    await p.pollOnce();
    expect(onPublish).toHaveBeenCalledWith(expect.not.objectContaining({ emphasisPhrases: expect.anything() }));
  });

  it('onPublish/onOutcome are optional — omitting them never crashes', async () => {
    readPendingPe.mockResolvedValue(row({ createdAt: 5000 }));
    const p = createPePoller({
      projectRoots: ['/proj'], readPendingPe, onDeliver,
      now: () => t, setIntervalFn: () => 1, clearIntervalFn: () => {},
    });
    p.start(); t = 5001;
    await expect(p.pollOnce()).resolves.toBeUndefined();
    expect(onDeliver).toHaveBeenCalledOnce();
  });

  it('never touches DS — structural proof: PePollerDeps has no field referencing pending_advisories/lastInjectedPrompt', () => {
    const deps = { projectRoots: ['/proj'], readPendingPe, onDeliver };
    expect(Object.keys(deps).sort()).toEqual(['onDeliver', 'projectRoots', 'readPendingPe']);
  });

  it('start() is idempotent (matches advisory-poller.ts) and stop() clears the interval', () => {
    const clearIntervalFn = vi.fn();
    const setIntervalFn = vi.fn(() => 'handle-1');
    const p = createPePoller({
      projectRoots: ['/proj'], readPendingPe, onDeliver, now: () => t, setIntervalFn, clearIntervalFn,
    });
    p.start();
    p.start(); // second call is a no-op
    expect(setIntervalFn).toHaveBeenCalledTimes(1);
    p.stop();
    expect(clearIntervalFn).toHaveBeenCalledWith('handle-1');
  });

  it('concurrent pollOnce calls do not double-fire (in-flight guard)', async () => {
    let resolveFirst!: () => void;
    readPendingPe.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = () => resolve(row({ createdAt: 5000 })); }));
    const p = make(); p.start(); t = 5001;
    const first = p.pollOnce();
    const second = p.pollOnce(); // fires while the first is still awaiting readPendingPe
    resolveFirst();
    await Promise.all([first, second]);
    expect(onDeliver).toHaveBeenCalledTimes(1);
  });
});
