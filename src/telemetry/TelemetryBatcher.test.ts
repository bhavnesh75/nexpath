import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import {
  partitionEvents,
  toPostHogEvent,
  hashProjectRootValue,
  ALLOWED_PROPERTY_KEYS,
  POSTHOG_LIB_NAME,
  POSTHOG_LIB_VERSION,
} from './TelemetryBatcher.js';
import { postBatch, type FetchLike } from './TelemetryClient.js';
import type { TelemetryEvent } from './types.js';

const API_KEY = 'phc_test_key';

function ev(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    ts:             '2026-05-19T10:00:00.000Z',
    v:              1,
    installationId: '550e8400-e29b-41d4-a716-446655440000',
    userId:         '8a3f1c2e-5b6d-4e7f-9a2c-1d3e5f7b9c0d',
    teamId:         'team-stub-2c8e4f6a-1b3d-5e7f-9a2c-4d6e8f0b2c1d',
    projectRoot:    '/home/jemi/projects/demo',
    event:          'prompt_received',
    ...overrides,
  };
}

describe('TelemetryBatcher — toPostHogEvent', () => {
  it('maps installationId → distinct_id', () => {
    const out = toPostHogEvent(ev(), { hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS });
    expect(out?.distinct_id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('maps ts → timestamp', () => {
    const out = toPostHogEvent(ev({ ts: '2026-05-19T11:22:33.444Z' }), {
      hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS,
    });
    expect(out?.timestamp).toBe('2026-05-19T11:22:33.444Z');
  });

  it('moves remaining whitelisted fields into properties', () => {
    const out = toPostHogEvent(
      ev({ event: 'prompt_classified', stage: 'planning', confidence: 0.92 }),
      { hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS },
    );
    expect(out?.properties.userId).toBe('8a3f1c2e-5b6d-4e7f-9a2c-1d3e5f7b9c0d');
    expect(out?.properties.teamId).toBe('team-stub-2c8e4f6a-1b3d-5e7f-9a2c-4d6e8f0b2c1d');
    expect(out?.properties.stage).toBe('planning');
    expect(out?.properties.confidence).toBe(0.92);
  });

  it('injects $lib and $lib_version properties', () => {
    const out = toPostHogEvent(ev(), { hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS });
    expect(out?.properties.$lib).toBe(POSTHOG_LIB_NAME);
    expect(out?.properties.$lib_version).toBe('0.1.1');
  });

  it('hashes projectRoot when hashProjectRoot=true (sha256: prefix)', () => {
    const out = toPostHogEvent(ev({ projectRoot: '/home/jemi/x' }), {
      hashProjectRoot: true, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS,
    });
    const expected = `sha256:${createHash('sha256').update('/home/jemi/x').digest('hex')}`;
    expect(out?.properties.projectRoot).toBe(expected);
  });

  it('passes projectRoot raw when hashProjectRoot=false', () => {
    const out = toPostHogEvent(ev({ projectRoot: '/home/jemi/x' }), {
      hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS,
    });
    expect(out?.properties.projectRoot).toBe('/home/jemi/x');
  });

  it('returns null when installationId is missing', () => {
    const raw = ev();
    delete raw.installationId;
    const out = toPostHogEvent(raw, { hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS });
    expect(out).toBeNull();
  });

  it('drops keys not on the whitelist (security)', () => {
    const raw = ev({ secretApiKey: 'sk-leaked-key', somethingElse: 'wat' }) as TelemetryEvent;
    const out = toPostHogEvent(raw, { hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ALLOWED_PROPERTY_KEYS });
    expect(out?.properties.secretApiKey).toBeUndefined();
    expect(out?.properties.somethingElse).toBeUndefined();
  });

  it('honours custom allowedKeys parameter', () => {
    const out = toPostHogEvent(
      ev({ stage: 'planning', confidence: 0.92 }),
      { hashProjectRoot: false, libVersion: '0.1.1', allowedKeys: ['stage'] },
    );
    expect(out?.properties.stage).toBe('planning');
    expect(out?.properties.confidence).toBeUndefined();
    expect(out?.properties.userId).toBeUndefined();
  });
});

describe('TelemetryBatcher — hashProjectRootValue', () => {
  it('produces deterministic SHA-256 hash with sha256: prefix', () => {
    const a = hashProjectRootValue('/home/x');
    const b = hashProjectRootValue('/home/x');
    expect(a).toBe(b);
    expect(a.startsWith('sha256:')).toBe(true);
    expect(a.length).toBe('sha256:'.length + 64);
  });

  it('produces different hashes for different paths', () => {
    expect(hashProjectRootValue('/home/a')).not.toBe(hashProjectRootValue('/home/b'));
  });
});

describe('TelemetryBatcher — partitionEvents envelope shape', () => {
  it('empty events produce empty batches', () => {
    const result = partitionEvents([], { apiKey: API_KEY });
    expect(result.batches).toHaveLength(0);
    expect(result.consumedCount).toBe(0);
  });

  it('single event produces one batch with one PostHogEvent', () => {
    const result = partitionEvents([ev()], { apiKey: API_KEY, hashProjectRoot: false });
    expect(result.batches).toHaveLength(1);
    expect(result.batches[0].api_key).toBe(API_KEY);
    expect(result.batches[0].batch).toHaveLength(1);
    expect(result.consumedCount).toBe(1);
  });

  it('envelope wraps with api_key + batch keys (PostHog shape)', () => {
    const result = partitionEvents([ev()], { apiKey: API_KEY });
    expect(Object.keys(result.batches[0]).sort()).toEqual(['api_key', 'batch']);
  });

  it('events without installationId are skipped but consumedCount advances', () => {
    const valid   = ev();
    const noId    = ev();
    delete noId.installationId;
    const result = partitionEvents([valid, noId, valid], { apiKey: API_KEY });
    expect(result.batches[0].batch).toHaveLength(2);
    expect(result.consumedCount).toBe(3);
  });
});

describe('TelemetryBatcher — partitioning caps', () => {
  it('splits into multiple batches when maxEventsPerBatch is exceeded', () => {
    const events = Array.from({ length: 7 }, () => ev());
    const result = partitionEvents(events, {
      apiKey: API_KEY, maxEventsPerBatch: 3, maxBatchesPerRun: 10,
    });
    expect(result.batches).toHaveLength(3);
    expect(result.batches[0].batch).toHaveLength(3);
    expect(result.batches[1].batch).toHaveLength(3);
    expect(result.batches[2].batch).toHaveLength(1);
    expect(result.consumedCount).toBe(7);
  });

  it('splits into multiple batches when maxBytesPerBatch is exceeded', () => {
    const events = Array.from({ length: 10 }, (_, i) => ev({ pinchLabel: 'x'.repeat(100), promptCount: i }));
    const result = partitionEvents(events, {
      apiKey: API_KEY, maxBytesPerBatch: 500, maxBatchesPerRun: 10,
    });
    expect(result.batches.length).toBeGreaterThan(1);
    expect(result.consumedCount).toBe(10);
  });

  it('caps at maxBatchesPerRun — overflow events are NOT consumed', () => {
    const events = Array.from({ length: 10 }, () => ev());
    const result = partitionEvents(events, {
      apiKey: API_KEY, maxEventsPerBatch: 2, maxBatchesPerRun: 2,
    });
    expect(result.batches).toHaveLength(2);
    expect(result.batches[0].batch).toHaveLength(2);
    expect(result.batches[1].batch).toHaveLength(2);
    expect(result.consumedCount).toBe(4);
  });

  it('uses production caps when no override is provided', () => {
    const result = partitionEvents([ev()], { apiKey: API_KEY });
    expect(result.batches[0].batch).toHaveLength(1);
  });
});

describe('TelemetryBatcher — nested types and ordering', () => {
  it('passes recentPrompts metadata array through untouched (PII-safe shape)', () => {
    const recentPrompts = [
      { index: 1, classifiedStage: 'planning',       confidence: 0.9, capturedAt: 1715000000 },
      { index: 2, classifiedStage: 'implementation', confidence: 0.8, capturedAt: 1715000100 },
    ];
    const result = partitionEvents([ev({ event: 'decision_session_started', recentPrompts })], {
      apiKey: API_KEY, hashProjectRoot: false,
    });
    expect(result.batches[0].batch[0].properties.recentPrompts).toEqual(recentPrompts);
  });

  it('with an empty allowedKeys, properties contain only $lib and $lib_version', () => {
    const result = partitionEvents([ev({ stage: 'planning', confidence: 0.9 })], {
      apiKey: API_KEY, allowedKeys: [], hashProjectRoot: false,
    });
    expect(Object.keys(result.batches[0].batch[0].properties).sort()).toEqual(['$lib', '$lib_version']);
  });

  it('preserves input order across batch splits (FIFO)', () => {
    const events = [
      ev({ event: 'prompt_received',   promptCount: 1 }),
      ev({ event: 'prompt_classified', promptCount: 2 }),
      ev({ event: 'profile_computed',  promptCount: 3 }),
      ev({ event: 'absence_flags_detected', promptCount: 4 }),
    ];
    const result = partitionEvents(events, {
      apiKey: API_KEY, maxEventsPerBatch: 2, maxBatchesPerRun: 10, hashProjectRoot: false,
    });
    const ordered = result.batches.flatMap(b => b.batch).map(e => e.properties.promptCount);
    expect(ordered).toEqual([1, 2, 3, 4]);
  });
});

describe('TelemetryBatcher — defaults & integration', () => {
  it('defaults libVersion to POSTHOG_LIB_VERSION constant', () => {
    const result = partitionEvents([ev()], { apiKey: API_KEY });
    expect(result.batches[0].batch[0].properties.$lib_version).toBe(POSTHOG_LIB_VERSION);
  });

  it('defaults hashProjectRoot to true', () => {
    const result = partitionEvents([ev({ projectRoot: '/some/path' })], { apiKey: API_KEY });
    expect(String(result.batches[0].batch[0].properties.projectRoot)).toMatch(/^sha256:/);
  });

  it('end-to-end: 3 events → 1 batch with 3 PostHog events, all shaped correctly', () => {
    const events = [
      ev({ event: 'prompt_received',   promptCount: 1 }),
      ev({ event: 'prompt_classified', stage: 'planning', confidence: 0.9 }),
      ev({ event: 'profile_computed',  profile: 'cool_geek' }),
    ];
    const result = partitionEvents(events, { apiKey: API_KEY, hashProjectRoot: false });
    expect(result.batches[0].batch.map(e => e.event)).toEqual([
      'prompt_received', 'prompt_classified', 'profile_computed',
    ]);
    expect(result.batches[0].batch.every(e => e.distinct_id === '550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(result.batches[0].batch.every(e => e.properties.$lib === 'nexpath')).toBe(true);
  });
});

describe('TelemetryBatcher → TelemetryClient integration', () => {
  it('partitioned envelope reaches fetch with valid PostHog shape and returns ok=true', async () => {
    const events = [
      ev({ event: 'prompt_received',   promptCount: 1 }),
      ev({ event: 'prompt_classified', stage: 'planning', confidence: 0.9 }),
    ];
    const { batches } = partitionEvents(events, { apiKey: API_KEY, hashProjectRoot: true });

    const fetchMock = vi.fn<FetchLike>(async () => ({
      ok:      true,
      status:  200,
      headers: { get: () => null },
    }));

    const result = await postBatch('https://us.i.posthog.com/capture/', batches[0], { fetch: fetchMock });
    expect(result).toEqual({ ok: true, status: 200, acceptedCount: 2 });

    const init     = fetchMock.mock.calls[0][1];
    const body     = JSON.parse(init.body);
    expect(body.api_key).toBe(API_KEY);
    expect(body.batch).toHaveLength(2);
    expect(body.batch[0].event).toBe('prompt_received');
    expect(body.batch[0].distinct_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(body.batch[0].properties.$lib).toBe('nexpath');
    expect(String(body.batch[0].properties.projectRoot)).toMatch(/^sha256:/);
  });
});
