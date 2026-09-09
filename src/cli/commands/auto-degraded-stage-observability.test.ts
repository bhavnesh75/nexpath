import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * A degraded classification is the local keyword/TF-IDF guess, produced because the model
 * was unreachable — and `processPrompt` persists whatever stage it proposes. When that guess
 * MOVES the stage, the move outlives the outage and shapes later prompts.
 *
 * These assert the RECORD of that move. Nothing in this phase changes whether the move
 * happens; the last test pins that explicitly.
 */

vi.mock('../../config/ApiKeyResolver.js', () => ({
  resolveOpenAIKey: vi.fn().mockResolvedValue(null),
  getKeySource:     vi.fn().mockResolvedValue('none'),
  isValidApiKey:    vi.fn().mockReturnValue(false),
}));

vi.mock('../../telemetry/index.js', () => ({
  writeTelemetry: vi.fn(),
  TELEMETRY_PATH: '/mock/telemetry.jsonl',
}));

/**
 * Switched per test: `throw` drives the classifier's degrade path (a provider that never
 * answers), `reply` drives the healthy path with a parseable classification.
 */
let providerBehaviour: { kind: 'throw' } | { kind: 'reply'; stage: string; confidence: number } =
  { kind: 'throw' };

vi.mock('openai', () => ({
  default: class {
    chat = {
      completions: {
        create: vi.fn(async () => {
          if (providerBehaviour.kind === 'throw') {
            throw Object.assign(new Error('Insufficient credit'), { status: 402, code: 'insufficient_quota' });
          }
          return {
            choices: [{ message: { content: JSON.stringify({
              stage: providerBehaviour.stage,
              stage_confidence: providerBehaviour.confidence,
              signals_present: [], signals_absent: [],
              fire_decision_session: false, selected_signal_key: '', reason: 'test',
            }) } }],
          };
        }),
      },
    };
  },
}));

async function runAutoCommand(args: string[]): Promise<void> {
  const { Command } = await import('commander');
  const { registerAutoCommand } = await import('./auto.js');
  const program = new Command();
  program.exitOverride();
  registerAutoCommand(program);

  const originalStdin = process.stdin;
  const stream = new PassThrough();
  (stream as unknown as Record<string, unknown>).isTTY = true;
  Object.defineProperty(process, 'stdin', { value: stream, writable: true, configurable: true });

  try {
    await program.parseAsync(['node', 'nexpath', 'auto', ...args]);
  } catch {
    /* commander exitOverride — the assertions below are what matter */
  } finally {
    Object.defineProperty(process, 'stdin', { value: originalStdin, writable: true, configurable: true });
  }
}

/** Every `stage_changed_by_degraded_classifier` payload the logger saw, in order. */
function stageMoveEvents(spy: ReturnType<typeof vi.spyOn>): Array<Record<string, unknown>> {
  return spy.mock.calls
    .filter((call) => call[0] === 'stage_changed_by_degraded_classifier')
    .map((call) => (call[1] ?? {}) as Record<string, unknown>);
}

let tmpDir: string;
let dbPath: string;
let projectRoot: string;
let savedEnvKey: string | undefined;

beforeEach(() => {
  savedEnvKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  providerBehaviour = { kind: 'throw' };
  // A FILE db, not ':memory:' — session state has to survive between the two command runs
  // the "second prompt in the same stage" case needs.
  tmpDir = mkdtempSync(join(tmpdir(), 'nexpath-degrade-obs-'));
  dbPath = join(tmpDir, 'store.db');
  projectRoot = join(tmpDir, 'project');
});

afterEach(() => {
  if (savedEnvKey === undefined) delete process.env.OPENAI_API_KEY;
  else                            process.env.OPENAI_API_KEY = savedEnvKey;
  vi.restoreAllMocks();
  try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('stage_changed_by_degraded_classifier', () => {
  it('reports the move when an unreachable model lets a keyword guess change the stage', async () => {
    const { logger } = await import('../../logger.js');
    const warnSpy = vi.spyOn(logger, 'warn');

    // A fresh session starts at `idea`. The local cascade reads this prompt as `release`
    // at confidence 1.000 (measured), which clears the 0.50 stage-change gate.
    //
    // ⚠️ The keyword count matters: a single release token ("deploy the service to
    // production now") also classifies as `release` but only at 0.333, so the gate blocks
    // it and no move — and therefore no record — happens at all. The prompt is chosen to
    // exercise the branch, not for realism.
    await runAutoCommand([
      '--project', projectRoot, '--db', dbPath,
      'deploy to production, push to prod, go live',
    ]);

    const events = stageMoveEvents(warnSpy);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ projectRoot, from: 'idea', to: 'release' });
    expect(typeof events[0]?.confidence).toBe('number');
  });

  it('does NOT report when the degraded guess leaves the stage where it was', async () => {
    // First run moves idea → release and reports (asserted above).
    await runAutoCommand([
      '--project', projectRoot, '--db', dbPath,
      'deploy to production, push to prod, go live',
    ]);

    // Second run, same session, same stage: degraded again, but nothing moves.
    const { logger } = await import('../../logger.js');
    const warnSpy = vi.spyOn(logger, 'warn');
    await runAutoCommand([
      '--project', projectRoot, '--db', dbPath,
      'deploy to production, push to prod, go live',
    ]);

    expect(stageMoveEvents(warnSpy)).toEqual([]);
  });

  it('does NOT report when the model answered — a healthy stage change is not this event', async () => {
    providerBehaviour = { kind: 'reply', stage: 'Implementation', confidence: 0.9 };

    const { logger } = await import('../../logger.js');
    const warnSpy = vi.spyOn(logger, 'warn');
    await runAutoCommand([
      '--project', projectRoot, '--db', dbPath,
      'write the login handler and wire it into the router',
    ]);

    expect(stageMoveEvents(warnSpy)).toEqual([]);
  });

  it('records the move without preventing it — the stage still changes', async () => {
    // The guarantee this phase makes: diagnostics only. If a later phase ever holds the
    // stage on degrade, this is the test that should be updated deliberately rather than
    // discovered by surprise.
    await runAutoCommand([
      '--project', projectRoot, '--db', dbPath,
      'deploy to production, push to prod, go live',
    ]);

    const { openStore, closeStore } = await import('../../store/db.js');
    const { SessionStateManager } = await import('../../classifier/SessionStateManager.js');
    const store = await openStore(dbPath);
    try {
      expect(SessionStateManager.load(store, projectRoot).current.currentStage).toBe('release');
    } finally {
      closeStore(store);
    }
  });
});
