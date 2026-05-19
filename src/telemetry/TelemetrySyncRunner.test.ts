import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, existsSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSyncAttempt, DEFAULT_FAILURE_DISABLE_THRESHOLD } from './TelemetrySyncRunner.js';
import { saveCursor, loadCursor } from './TelemetryCursor.js';
import type { FetchLike } from './TelemetryClient.js';
import type { TelemetryEvent, TelemetryEventName } from './types.js';

let tmpDir:       string;
let livePath:     string;
let rotPath:      string;
let cursorPath:   string;
let errorLogPath: string;

beforeEach(() => {
  tmpDir       = mkdtempSync(join(tmpdir(), 'nexpath-runner-'));
  livePath     = join(tmpDir, 'telemetry.jsonl');
  rotPath      = `${livePath}.1`;
  cursorPath   = join(tmpDir, 'cursor.json');
  errorLogPath = join(tmpDir, 'sync-errors.log');
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.useRealTimers();
});

function writeEvent(path: string, event: TelemetryEventName, props: Record<string, unknown> = {}): void {
  const record = {
    ts:             '2026-05-19T10:00:00.000Z',
    v:              1,
    installationId: '550e8400-e29b-41d4-a716-446655440000',
    userId:         '8a3f1c2e-5b6d-4e7f-9a2c-1d3e5f7b9c0d',
    teamId:         'team-stub-uuid',
    projectRoot:    '/tmp/proj',
    event,
    ...props,
  };
  appendFileSync(path, JSON.stringify(record) + '\n', 'utf8');
}

function mockOkFetch(): FetchLike {
  return vi.fn<FetchLike>(async () => ({
    ok:      true,
    status:  200,
    headers: { get: () => null },
  }));
}

const API_KEY = 'phc_test';

describe('TelemetrySyncRunner — noop paths', () => {
  it('returns noop when no telemetry file exists', async () => {
    const result = await runSyncAttempt({
      apiKey:      API_KEY,
      liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath, errorLogPath,
      fetch:       mockOkFetch(),
    });
    expect(result.status).toBe('noop');
    expect(result.sentEvents).toBe(0);
  });

  it('returns noop when telemetry file has only sync self-events (feedback-loop filter)', async () => {
    writeEvent(livePath, 'telemetry_sync_attempt');
    writeEvent(livePath, 'telemetry_sync_success', { event_count: 5, latency_ms: 42 });
    const result = await runSyncAttempt({
      apiKey:      API_KEY,
      liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath, errorLogPath,
      fetch:       mockOkFetch(),
    });
    expect(result.status).toBe('noop');
    expect(result.sentEvents).toBe(0);
    expect(loadCursor(cursorPath)?.offset).toBe(statSync(livePath).size);
  });
});

describe('TelemetrySyncRunner — success path', () => {
  it('sends all events, advances cursor to newOffset, emits success self-event', async () => {
    writeEvent(livePath, 'prompt_received',   { promptCount: 1 });
    writeEvent(livePath, 'prompt_classified', { stage: 'planning', confidence: 0.9 });

    const emit  = vi.fn();
    const fetch = mockOkFetch();
    const result = await runSyncAttempt({
      apiKey:        API_KEY,
      liveLogPath:   livePath, rotatedLogPath: rotPath, cursorPath, errorLogPath,
      fetch, emitTelemetry: emit,
    });
    expect(result.status).toBe('ok');
    expect(result.sentEvents).toBe(2);
    expect(loadCursor(cursorPath)?.offset).toBe(statSync(livePath).size);
    expect(emit).toHaveBeenCalledWith('telemetry_sync_attempt',  expect.objectContaining({ event_count: 2 }));
    expect(emit).toHaveBeenCalledWith('telemetry_sync_success',  expect.objectContaining({ event_count: 2 }));
  });

  it('resets consecutive_failures to 0 on success', async () => {
    writeEvent(livePath, 'prompt_received');
    const result = await runSyncAttempt({
      apiKey:      API_KEY,
      liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath, errorLogPath,
      fetch:       mockOkFetch(),
    }, 7);
    expect(result.consecutiveFailuresAfter).toBe(0);
  });

  it('filters out sync self-events but still sends the real ones', async () => {
    writeEvent(livePath, 'prompt_received');
    writeEvent(livePath, 'telemetry_sync_attempt');
    writeEvent(livePath, 'prompt_classified', { stage: 'planning' });

    const fetch = vi.fn<FetchLike>(async () => ({
      ok:      true, status: 200, headers: { get: () => null },
    }));
    const result = await runSyncAttempt({
      apiKey:        API_KEY,
      liveLogPath:   livePath, rotatedLogPath: rotPath, cursorPath, errorLogPath,
      fetch,
    });
    expect(result.sentEvents).toBe(2);
    const body = JSON.parse((fetch.mock.calls[0][1] as { body: string }).body);
    expect(body.batch).toHaveLength(2);
    expect(body.batch.map((e: { event: string }) => e.event)).toEqual(['prompt_received', 'prompt_classified']);
  });
});

describe('TelemetrySyncRunner — network error', () => {
  it('returns network status, does not advance cursor, increments failures', async () => {
    writeEvent(livePath, 'prompt_received');
    const fetch = vi.fn<FetchLike>(async () => { throw new Error('ECONNREFUSED'); });
    const emit  = vi.fn();

    const result = await runSyncAttempt({
      apiKey:        API_KEY,
      liveLogPath:   livePath, rotatedLogPath: rotPath, cursorPath, errorLogPath,
      fetch, emitTelemetry: emit,
    }, 2);

    expect(result.status).toBe('network');
    expect(result.consecutiveFailuresAfter).toBe(3);
    expect(result.shouldDisableSync).toBe(false);
    expect(loadCursor(cursorPath)).toBeNull();
    expect(emit).toHaveBeenCalledWith('telemetry_sync_failed', expect.objectContaining({ reason: 'network' }));
  });
});

describe('TelemetrySyncRunner — HTTP errors', () => {
  it('4xx (non-429): writes to error log, sets shouldDisableSync after threshold', async () => {
    writeEvent(livePath, 'prompt_received');
    const fetch = vi.fn<FetchLike>(async () => ({
      ok: false, status: 400, headers: { get: () => null },
    }));

    const result = await runSyncAttempt({
      apiKey:                 API_KEY,
      liveLogPath:            livePath, rotatedLogPath: rotPath, cursorPath, errorLogPath,
      fetch,
      failureDisableThreshold: 3,
    }, 2);

    expect(result.status).toBe('http_4xx');
    expect(result.httpStatus).toBe(400);
    expect(result.consecutiveFailuresAfter).toBe(3);
    expect(result.shouldDisableSync).toBe(true);
    expect(existsSync(errorLogPath)).toBe(true);
    expect(readFileSync(errorLogPath, 'utf8')).toContain('"status":400');
  });

  it('4xx below threshold: does NOT set shouldDisableSync', async () => {
    writeEvent(livePath, 'prompt_received');
    const fetch = vi.fn<FetchLike>(async () => ({
      ok: false, status: 400, headers: { get: () => null },
    }));
    const result = await runSyncAttempt({
      apiKey:        API_KEY,
      liveLogPath:   livePath, rotatedLogPath: rotPath, cursorPath, errorLogPath,
      fetch,
    }, 0);
    expect(result.consecutiveFailuresAfter).toBe(1);
    expect(result.shouldDisableSync).toBe(false);
  });

  it('429: returns rate_limited with retryAfterSeconds', async () => {
    writeEvent(livePath, 'prompt_received');
    const fetch = vi.fn<FetchLike>(async () => ({
      ok: false, status: 429, headers: { get: (h: string) => h === 'Retry-After' ? '120' : null },
    }));
    const emit  = vi.fn();
    const result = await runSyncAttempt({
      apiKey:        API_KEY,
      liveLogPath:   livePath, rotatedLogPath: rotPath, cursorPath, errorLogPath,
      fetch, emitTelemetry: emit,
    });
    expect(result.status).toBe('rate_limited');
    expect(result.httpStatus).toBe(429);
    expect(result.retryAfterSeconds).toBe(120);
    expect(emit).toHaveBeenCalledWith('telemetry_sync_failed', expect.objectContaining({ reason: 'rate_limited' }));
  });

  it('5xx: returns http_5xx with status, does not write error log', async () => {
    writeEvent(livePath, 'prompt_received');
    const fetch = vi.fn<FetchLike>(async () => ({
      ok: false, status: 503, headers: { get: () => null },
    }));
    const result = await runSyncAttempt({
      apiKey:      API_KEY,
      liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath, errorLogPath,
      fetch,
    });
    expect(result.status).toBe('http_5xx');
    expect(result.httpStatus).toBe(503);
    expect(existsSync(errorLogPath)).toBe(false);
  });
});

describe('TelemetrySyncRunner — partial-credit cursor advance', () => {
  it('after first batch succeeds and second fails, cursor advances by first batch only', async () => {
    for (let i = 0; i < 5; i++) writeEvent(livePath, 'prompt_received', { promptCount: i });

    let callCount = 0;
    const fetch = vi.fn<FetchLike>(async () => {
      callCount++;
      if (callCount === 1) return { ok: true, status: 200, headers: { get: () => null } };
      throw new Error('network down');
    });

    const result = await runSyncAttempt({
      apiKey:             API_KEY,
      liveLogPath:        livePath, rotatedLogPath: rotPath, cursorPath, errorLogPath,
      fetch,
      maxEventsPerBatch:  2,
      maxBatchesPerRun:   10,
    });

    expect(result.status).toBe('network');
    expect(result.sentEvents).toBe(2);
    const cursor = loadCursor(cursorPath);
    expect(cursor).not.toBeNull();
    expect(cursor!.offset).toBeGreaterThan(0);
    expect(cursor!.offset).toBeLessThan(statSync(livePath).size);
  });

  it('cap-hit (consumedCount < events.length): cursor advances only through consumed events', async () => {
    for (let i = 0; i < 8; i++) writeEvent(livePath, 'prompt_received', { promptCount: i });

    const result = await runSyncAttempt({
      apiKey:             API_KEY,
      liveLogPath:        livePath, rotatedLogPath: rotPath, cursorPath, errorLogPath,
      fetch:              mockOkFetch(),
      maxEventsPerBatch:  2,
      maxBatchesPerRun:   2,
    });

    expect(result.status).toBe('ok');
    expect(result.sentEvents).toBe(4);
    const cursor = loadCursor(cursorPath);
    expect(cursor!.offset).toBeGreaterThan(0);
    expect(cursor!.offset).toBeLessThan(statSync(livePath).size);
  });
});

describe('TelemetrySyncRunner — endpoint and auth', () => {
  it('uses default PostHog endpoint when none provided', async () => {
    writeEvent(livePath, 'prompt_received');
    const fetch = vi.fn<FetchLike>(async () => ({
      ok: true, status: 200, headers: { get: () => null },
    }));
    await runSyncAttempt({
      apiKey:      API_KEY,
      liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath, errorLogPath,
      fetch,
    });
    expect(fetch.mock.calls[0][0]).toBe('https://us.i.posthog.com/capture/');
  });

  it('uses custom endpoint when provided', async () => {
    writeEvent(livePath, 'prompt_received');
    const fetch = vi.fn<FetchLike>(async () => ({
      ok: true, status: 200, headers: { get: () => null },
    }));
    await runSyncAttempt({
      endpoint:    'https://eu.example.com/capture/',
      apiKey:      API_KEY,
      liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath, errorLogPath,
      fetch,
    });
    expect(fetch.mock.calls[0][0]).toBe('https://eu.example.com/capture/');
  });

  it('apiKey is propagated to the request body', async () => {
    writeEvent(livePath, 'prompt_received');
    const fetch = vi.fn<FetchLike>(async () => ({
      ok: true, status: 200, headers: { get: () => null },
    }));
    await runSyncAttempt({
      apiKey:      'phc_xyz',
      liveLogPath: livePath, rotatedLogPath: rotPath, cursorPath, errorLogPath,
      fetch,
    });
    const body = JSON.parse((fetch.mock.calls[0][1] as { body: string }).body);
    expect(body.api_key).toBe('phc_xyz');
  });
});

describe('TelemetrySyncRunner — constants', () => {
  it('DEFAULT_FAILURE_DISABLE_THRESHOLD is 10', () => {
    expect(DEFAULT_FAILURE_DISABLE_THRESHOLD).toBe(10);
  });
});
