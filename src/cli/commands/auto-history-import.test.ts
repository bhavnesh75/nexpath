import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

// What runAuto hands the history import, and what stays exactly as it was before Cursor and
// Devin Local history were added. The import itself is tested beside its own file; here it is a
// stand-in that bootstraps the session the way a real import does.
const importState = vi.hoisted(() => ({ imported: 0, fromOtherAgents: 0, seededFromOtherAgentsOnly: false }));

vi.mock('../../store/historical-import.js', () => ({
  importHistoricalPrompts: vi.fn(async (store: unknown, projectRoot: string) => {
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    if (importState.imported > 0) {
      SessionStateManager.bootstrapFromHistory(store as never, projectRoot, [], importState.imported);
    }
    return { imported: importState.imported, fromOtherAgents: importState.fromOtherAgents, seededFromOtherAgentsOnly: importState.seededFromOtherAgentsOnly };
  }),
}));

vi.mock('./chat-history-consent.js', () => ({
  readChatHistoryConsent: vi.fn(() => ({ cursor: true, devin: true })),
}));

vi.mock('../../env/env-trajectory.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../env/env-trajectory.js')>();
  return { ...actual, recordEnvTrajectory: vi.fn(() => undefined) };
});

const { openStore } = await import('../../store/index.js');
const { runAuto } = await import('./auto.js');
const { recordEnvTrajectory } = await import('../../env/env-trajectory.js');
const { importHistoricalPrompts } = await import('../../store/historical-import.js');
const { readChatHistoryConsent } = await import('./chat-history-consent.js');

type StoreHandle = Awaited<ReturnType<typeof openStore>>;

describe('runAuto — the history import call', () => {
  let store: StoreHandle;
  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); vi.clearAllMocks(); });

  it('passes the live prompt and the consent reader itself; runAuto never reads consent', async () => {
    Object.assign(importState, { imported: 0, fromOtherAgents: 0, seededFromOtherAgentsOnly: false });
    await runAuto({ promptText: 'add a settings page', projectRoot: '/test/hist-a' }, store);
    expect(importHistoricalPrompts).toHaveBeenCalledWith(store, '/test/hist-a', {
      livePrompt: 'add a settings page',
      otherAgentConsent: readChatHistoryConsent,
    });
    expect(readChatHistoryConsent).not.toHaveBeenCalled();
  });

  it('keeps the environment probe as before: not when the import seeded the session with Claude Code history', async () => {
    Object.assign(importState, { imported: 12, fromOtherAgents: 5, seededFromOtherAgentsOnly: false });
    await runAuto({ promptText: 'add a settings page', projectRoot: '/test/hist-b' }, store);
    expect(recordEnvTrajectory).not.toHaveBeenCalled();
  });

  it('keeps the environment probe as before: on a first prompt when nothing was imported', async () => {
    Object.assign(importState, { imported: 0, fromOtherAgents: 0, seededFromOtherAgentsOnly: false });
    await runAuto({ promptText: 'add a settings page', projectRoot: '/test/hist-c' }, store);
    expect(recordEnvTrajectory).toHaveBeenCalledTimes(1);
    expect(recordEnvTrajectory).toHaveBeenCalledWith(store, '/test/hist-c', expect.objectContaining({ promptIndex: 0 }));
  });

  it('keeps the environment probe as before: a session seeded from Cursor or Devin Local history alone probes at index 0', async () => {
    Object.assign(importState, { imported: 7, fromOtherAgents: 7, seededFromOtherAgentsOnly: true });
    await runAuto({ promptText: 'add a settings page', projectRoot: '/test/hist-d' }, store);
    expect(recordEnvTrajectory).toHaveBeenCalledTimes(1);
    expect(recordEnvTrajectory).toHaveBeenCalledWith(store, '/test/hist-d', expect.objectContaining({ promptIndex: 0 }));
  });
});
