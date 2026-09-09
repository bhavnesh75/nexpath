import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readLastProviderFailure,
  describeProviderFailure,
  PROVIDER_FAILURE_EVENT,
} from './last-provider-failure.js';
import { renderStatus, runStatus, type StatusResult } from './status.js';

/**
 * A credential that RESOLVES can still be refused — out of credit, revoked, rotated — and the
 * only symptom is that guidance goes quiet. `status` reported the credential but never whether
 * calls with it were failing, so "nothing is happening" and "every call is being refused" read
 * identically.
 */

const LINE = (ts: string, payload?: string): string =>
  `[${ts}] [WARN ] [auto] ${PROVIDER_FAILURE_EVENT}${payload ? ' ' + payload : ''}`;

let dir: string;
let logPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'nexpath-lpf-'));
  logPath = join(dir, 'nexpath.log');
});

afterEach(() => {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
});

describe('readLastProviderFailure', () => {
  it('returns null when the log does not exist', () => {
    expect(readLastProviderFailure(join(dir, 'absent.log'))).toBeNull();
  });

  it('returns null when the log carries no provider failure', () => {
    writeFileSync(logPath, '[2026-09-06T10:00:00.000Z] [INFO ] [auto] pipeline_outcome {"outcome":"no_action"}\n');
    expect(readLastProviderFailure(logPath)).toBeNull();
  });

  it('reads status and code from the line', () => {
    writeFileSync(logPath, LINE('2026-09-06T10:40:03.246Z', '{"status":401,"code":"invalid_api_key","message":"nope"}') + '\n');
    expect(readLastProviderFailure(logPath)).toEqual({
      at: '2026-09-06T10:40:03.246Z',
      status: 401,
      code: 'invalid_api_key',
    });
  });

  it('returns the LAST failure — the log is append-only, so the last one is current', () => {
    writeFileSync(logPath, [
      LINE('2026-09-06T09:00:00.000Z', '{"status":429,"code":"rate_limit"}'),
      '[2026-09-06T09:30:00.000Z] [INFO ] [auto] pipeline_outcome {}',
      LINE('2026-09-06T10:00:00.000Z', '{"status":402,"code":"insufficient_quota"}'),
      '',
    ].join('\n'));
    expect(readLastProviderFailure(logPath)?.status).toBe(402);
  });

  it('reports a failure that carries no status — a call that never reached the network', () => {
    // The emitting site distinguishes these deliberately: a construction failure (no
    // credential) carries no status, which is exactly what separates it from a refusal.
    writeFileSync(logPath, LINE('2026-09-06T10:40:03.246Z', '{"message":"missing api key"}') + '\n');
    expect(readLastProviderFailure(logPath)).toEqual({ at: '2026-09-06T10:40:03.246Z' });
  });

  it('survives a malformed payload — the timestamp still answers "when did it go quiet"', () => {
    writeFileSync(logPath, LINE('2026-09-06T10:40:03.246Z', '{not json') + '\n');
    expect(readLastProviderFailure(logPath)).toEqual({ at: '2026-09-06T10:40:03.246Z' });
  });

  it('survives a line with no payload at all', () => {
    writeFileSync(logPath, LINE('2026-09-06T10:40:03.246Z') + '\n');
    expect(readLastProviderFailure(logPath)).toEqual({ at: '2026-09-06T10:40:03.246Z' });
  });

  it('ignores a line that only QUOTES the event name in its payload', () => {
    // Reason codes and diagnostic strings are free text; one of them naming this event
    // must not be read as a provider failure. The name has to sit in the event slot.
    const quoting = '[2026-09-06T11:00:00.000Z] [WARN ] [auto] some_other_event '
      + JSON.stringify({ reasonCodes: [PROVIDER_FAILURE_EVENT] });
    writeFileSync(logPath, quoting + '\n');
    expect(readLastProviderFailure(logPath)).toBeNull();
  });

  it('still reads the real event when a quoting line sits after it', () => {
    const quoting = '[2026-09-06T11:00:00.000Z] [WARN ] [auto] some_other_event '
      + JSON.stringify({ reasonCodes: [PROVIDER_FAILURE_EVENT] });
    writeFileSync(logPath, [
      LINE('2026-09-06T10:00:00.000Z', '{"status":402}'),
      quoting,
      '',
    ].join('\n'));
    expect(readLastProviderFailure(logPath)).toEqual({ at: '2026-09-06T10:00:00.000Z', status: 402 });
  });

  it('reads a CRLF line — an anchored regex fails SILENTLY on a stray CR', () => {
    // `logger.ts` writes LF and Node does not translate it, so this should not occur. Pinned
    // because the failure mode is the one this feature exists to remove: the reader returned
    // null for a line that plainly carried a failure, i.e. it reported "nothing wrong".
    writeFileSync(logPath, LINE('2026-09-06T10:40:03.246Z', '{"status":401,"code":"invalid_api_key"}') + '\r\n');
    expect(readLastProviderFailure(logPath)).toEqual({
      at: '2026-09-06T10:40:03.246Z',
      status: 401,
      code: 'invalid_api_key',
    });
  });

  it('reads a CRLF line that carries no payload', () => {
    writeFileSync(logPath, LINE('2026-09-06T10:40:03.246Z') + '\r\n');
    expect(readLastProviderFailure(logPath)).toEqual({ at: '2026-09-06T10:40:03.246Z' });
  });

  it('never throws — an unreadable path yields null', () => {
    // A directory, not a file: readFileSync throws EISDIR.
    expect(() => readLastProviderFailure(dir)).not.toThrow();
    expect(readLastProviderFailure(dir)).toBeNull();
  });
});

describe('describeProviderFailure', () => {
  it('names status and code when both are present', () => {
    expect(describeProviderFailure({ at: 'x', status: 401, code: 'invalid_api_key' }))
      .toBe(' (status 401, invalid_api_key)');
  });

  it('names whichever half it has', () => {
    expect(describeProviderFailure({ at: 'x', status: 500 })).toBe(' (status 500)');
    expect(describeProviderFailure({ at: 'x', code: 'timeout' })).toBe(' (timeout)');
  });

  it('says nothing when it has neither — there is nothing to name', () => {
    expect(describeProviderFailure({ at: 'x' })).toBe('');
  });
});

// ── The surfacing in `nexpath status` ────────────────────────────────────────

function resultWith(lastProviderFailure: StatusResult['credential']['lastProviderFailure']): StatusResult {
  return {
    agents: [],
    hook: { settingsPath: '/s.json', registered: false },
    store: { exists: false, dbPath: '/db', totalPrompts: 0, dbSizeBytes: 0, perProject: [] },
    promptEnhancement: {
      schemaVersion: 1, enabledState: 'policy_disabled_or_no_data',
      memoryRows: 0, sourceUseRows: 0, generatedOriginRows: 0, feedbackRows: 0, statusRows: 0,
      globalMemoryRows: 0, globalSourceUseRows: 0, globalGeneratedOriginRows: 0,
      globalFeedbackRows: 0, globalStatusRows: 0, estimatedBytes: 0, exportedDbBytes: 0,
      capState: 'policy_disabled_or_no_data', rowCapState: 'policy_disabled_or_no_data',
      byteThresholdState: 'policy_disabled_or_no_data', lastCleanupOutcome: 'none',
      telemetryPolicy: 'ids_enums_counts_status_timing_only', rawContentStoredByDefault: false,
      oldStoreSurfacesAreAuthority: false, reasonCodes: [], lastPruneAt: null, lastDecayAt: null,
      fallbackCount: 0, errorCount: 0,
    } as unknown as StatusResult['promptEnhancement'],
    config: {},
    credential: { source: 'keychain', serviceBaseUrl: null, lastProviderFailure },
    hookStats: [],
  };
}

describe('renderStatus — the last provider failure', () => {
  it('reports it beside the credential, with the status and code as logged', () => {
    const out = renderStatus(resultWith({ at: '2026-09-06T10:40:03.246Z', status: 401, code: 'invalid_api_key' }));
    expect(out).toContain('Last LLM error: 2026-09-06T10:40:03.246Z (status 401, invalid_api_key)');
    expect(out).toContain('nexpath config set-api-key');
  });

  it('does not repeat the remedy when no credential resolves — the lines above already give it', () => {
    const result = resultWith({ at: '2026-09-06T10:40:03.246Z', status: 401 });
    result.credential.source = 'none';
    const out = renderStatus(result);
    expect(out).toContain('Last LLM error');
    expect(out).toContain('None resolves');
    expect(out).not.toContain('If guidance has gone quiet');
    // The command pair appears once, from the "set one" line — not twice.
    expect(out.split('nexpath config set-api-key  |  nexpath config set-token').length - 1).toBe(1);
  });

  it('says nothing when there has been no failure', () => {
    expect(renderStatus(resultWith(null))).not.toContain('Last LLM error');
  });

  it('⛔ does not throw when the field is absent — a status readout must not crash', () => {
    // `renderStatus` is exported and callers build results by hand; an earlier draft used
    // `!== null` and threw on `undefined`, taking 27 existing tests with it.
    const result = resultWith(null);
    delete (result.credential as { lastProviderFailure?: unknown }).lastProviderFailure;
    expect(() => renderStatus(result)).not.toThrow();
    expect(renderStatus(result)).not.toContain('Last LLM error');
  });
});

describe('runStatus — the reader is wired and injectable', () => {
  it('carries the injected failure onto the result', async () => {
    const result = await runStatus({
      dbPath: ':memory:',
      agents: [],
      settingsPath: join(dir, 's.json'),
      keySourceFn: async () => 'keychain',
      lastProviderFailureFn: () => ({ at: '2026-09-06T10:40:03.246Z', status: 402 }),
    });
    expect(result.credential.lastProviderFailure).toEqual({ at: '2026-09-06T10:40:03.246Z', status: 402 });
  });

  it('carries null when nothing has failed', async () => {
    const result = await runStatus({
      dbPath: ':memory:',
      agents: [],
      settingsPath: join(dir, 's.json'),
      keySourceFn: async () => 'keychain',
      lastProviderFailureFn: () => null,
    });
    expect(result.credential.lastProviderFailure).toBeNull();
  });
});
