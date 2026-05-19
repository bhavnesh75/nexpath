import { createHash } from 'node:crypto';
import type { PostHogBatchEnvelope, PostHogEvent, TelemetryEvent } from './types.js';

export const POSTHOG_LIB_NAME    = 'nexpath';
export const POSTHOG_LIB_VERSION = '0.1.1';

export const MAX_EVENTS_PER_BATCH = 500;
export const MAX_BYTES_PER_BATCH  = 256 * 1024;
export const MAX_BATCHES_PER_RUN  = 4;

export const ALLOWED_PROPERTY_KEYS: ReadonlyArray<string> = [
  '$lib', '$lib_version',
  'userId', 'teamId',
  'projectRoot', 'schema_version', 'v',
  'promptCount', 'stage', 'confidence', 'classifier',
  'profile',
  'flagType', 'pinchLabel', 'sessionId',
  'level', 'reason',
  'cooldownSecondsRemaining', 'currentCap',
  'advisoryCountInSession', 'decisionSessionCountInProject',
  'optionId', 'optionLabel',
  'recentPrompts', 'skipCountInProject',
  'language',
  'confirmed',
  'event_count', 'latency_ms', 'http_status',
];

export interface BatchOptions {
  apiKey:           string;
  hashProjectRoot?: boolean;
  libVersion?:      string;
  allowedKeys?:     ReadonlyArray<string>;
  maxEventsPerBatch?: number;
  maxBytesPerBatch?:  number;
  maxBatchesPerRun?:  number;
}

export interface BatchPartitions {
  batches:       PostHogBatchEnvelope[];
  consumedCount: number;
}

export function hashProjectRootValue(raw: string): string {
  return `sha256:${createHash('sha256').update(raw).digest('hex')}`;
}

export function toPostHogEvent(
  raw:  TelemetryEvent,
  opts: { hashProjectRoot: boolean; libVersion: string; allowedKeys: ReadonlyArray<string> },
): PostHogEvent | null {
  if (typeof raw.installationId !== 'string' || raw.installationId === '') return null;

  const properties: Record<string, unknown> = {
    $lib:         POSTHOG_LIB_NAME,
    $lib_version: opts.libVersion,
  };

  for (const key of opts.allowedKeys) {
    if (key === '$lib' || key === '$lib_version') continue;
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;

    let value: unknown = (raw as Record<string, unknown>)[key];
    if (key === 'projectRoot' && opts.hashProjectRoot && typeof value === 'string') {
      value = hashProjectRootValue(value);
    }
    properties[key] = value;
  }

  return {
    event:       raw.event,
    distinct_id: raw.installationId,
    timestamp:   raw.ts,
    properties,
  };
}

export function partitionEvents(events: TelemetryEvent[], opts: BatchOptions): BatchPartitions {
  const libVersion      = opts.libVersion       ?? POSTHOG_LIB_VERSION;
  const allowedKeys     = opts.allowedKeys      ?? ALLOWED_PROPERTY_KEYS;
  const hashProjectRoot = opts.hashProjectRoot  ?? true;
  const maxEvents       = opts.maxEventsPerBatch ?? MAX_EVENTS_PER_BATCH;
  const maxBytes        = opts.maxBytesPerBatch  ?? MAX_BYTES_PER_BATCH;
  const maxBatches      = opts.maxBatchesPerRun  ?? MAX_BATCHES_PER_RUN;

  const batches: PostHogBatchEnvelope[] = [];
  let current: PostHogEvent[] = [];
  let currentBytes = 0;
  let consumedCount = 0;

  const flush = () => {
    if (current.length > 0) {
      batches.push({ api_key: opts.apiKey, batch: current });
      current = [];
      currentBytes = 0;
    }
  };

  for (const raw of events) {
    if (batches.length >= maxBatches) break;

    const phEvent = toPostHogEvent(raw, { hashProjectRoot, libVersion, allowedKeys });
    if (phEvent === null) {
      consumedCount++;
      continue;
    }

    const phBytes = Buffer.byteLength(JSON.stringify(phEvent), 'utf8');
    const wouldOverflow =
      current.length > 0 &&
      (current.length >= maxEvents || currentBytes + phBytes > maxBytes);

    if (wouldOverflow) {
      flush();
      if (batches.length >= maxBatches) break;
    }

    current.push(phEvent);
    currentBytes += phBytes;
    consumedCount++;
  }

  if (batches.length < maxBatches) flush();

  return { batches, consumedCount };
}
