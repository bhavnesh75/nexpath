import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openStore, type Store } from '../store/db.js';
import { _resetIdentityCache } from './identity.js';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual };
});

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TelemetryWriter — writeTelemetry', () => {
  beforeEach(() => {
    vi.resetModules();
    _resetIdentityCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    _resetIdentityCache();
  });

  it('creates the directory and writes on first call when file does not exist', async () => {
    const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    const mkdirSpy  = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);
    const appendSpy = vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    writeTelemetry('/tmp/proj', 'prompt_received');

    expect(mkdirSpy).toHaveBeenCalledWith(expect.stringContaining('.nexpath'), { recursive: true });
    expect(appendSpy).toHaveBeenCalledWith(TELEMETRY_PATH, expect.any(String), 'utf8');
  });

  it('written line is valid JSON', async () => {
    const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    let written = '';
    vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
      if (_p === TELEMETRY_PATH) written += String(data);
    });
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

    writeTelemetry('/tmp/proj', 'prompt_classified', { stage: 'implementation', confidence: 0.9 });

    expect(() => JSON.parse(written.trim())).not.toThrow();
  });

  it('written line always contains ts, v, projectRoot, event', async () => {
    const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    let written = '';
    vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
      if (_p === TELEMETRY_PATH) written += String(data);
    });
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

    writeTelemetry('/my/project', 'profile_computed', { nature: 'beginner' });

    const parsed = JSON.parse(written.trim()) as Record<string, unknown>;
    expect(typeof parsed['ts']).toBe('string');
    expect(parsed['v']).toBe(1);
    expect(parsed['projectRoot']).toBe('/my/project');
    expect(parsed['event']).toBe('profile_computed');
  });

  it('spreads extra data fields onto the record', async () => {
    const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    let written = '';
    vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
      if (_p === TELEMETRY_PATH) written += String(data);
    });
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

    writeTelemetry('/proj', 'prompt_classified', { stage: 'implementation', confidence: 0.87 });

    const parsed = JSON.parse(written.trim()) as Record<string, unknown>;
    expect(parsed['stage']).toBe('implementation');
    expect(parsed['confidence']).toBe(0.87);
  });

  it('rotates file by renaming when size exceeds 5MB', async () => {
    const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {});
    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'statSync').mockReturnValue({ size: 6 * 1024 * 1024 } as ReturnType<typeof fs.statSync>);

    writeTelemetry('/proj', 'pipeline_no_action', { reason: 'no_flag' });

    expect(renameSpy).toHaveBeenCalledWith(TELEMETRY_PATH, `${TELEMETRY_PATH}.1`);
  });

  it('does not rotate when file is under 5MB', async () => {
    const { writeTelemetry } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(() => {});
    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'statSync').mockReturnValue({ size: 1024 } as ReturnType<typeof fs.statSync>);

    writeTelemetry('/proj', 'pipeline_no_action', { reason: 'no_flag' });

    expect(renameSpy).not.toHaveBeenCalled();
  });

  it('never throws even if appendFileSync throws', async () => {
    const { writeTelemetry } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => { throw new Error('disk full'); });
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

    expect(() => writeTelemetry('/proj', 'prompt_received')).not.toThrow();
  });

  it('never throws even if rotate throws', async () => {
    const { writeTelemetry } = await import('./TelemetryWriter.js');
    const fs = await import('node:fs');

    vi.spyOn(fs, 'existsSync').mockImplementation(() => { throw new Error('fs error'); });
    vi.spyOn(fs, 'appendFileSync').mockImplementation(() => {});

    expect(() => writeTelemetry('/proj', 'prompt_received')).not.toThrow();
  });

  it('TELEMETRY_PATH is exported and contains telemetry.jsonl', async () => {
    const { TELEMETRY_PATH } = await import('./TelemetryWriter.js');
    expect(typeof TELEMETRY_PATH).toBe('string');
    expect(TELEMETRY_PATH).toContain('telemetry.jsonl');
  });

  // ── Identity-ID injection (Phase 1) ──────────────────────────────────────────

  describe('identity-ID injection when store is provided', () => {
    let store: Store;

    beforeEach(async () => {
      store = await openStore(':memory:');
    });

    afterEach(() => {
      store.db.close();
    });

    it('record carries installationId, userId, teamId when store is passed', async () => {
      const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      let written = '';
      vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
        if (_p === TELEMETRY_PATH) written += String(data);
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      writeTelemetry('/proj', 'prompt_received', { promptCount: 1 }, store);

      const parsed = JSON.parse(written.trim()) as Record<string, unknown>;
      expect(parsed['installationId']).toMatch(UUID_V4);
      expect(parsed['userId']).toMatch(UUID_V4);
      expect(parsed['teamId']).toMatch(UUID_V4);
    });

    it('record omits identity IDs when store is NOT passed', async () => {
      const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      let written = '';
      vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
        if (_p === TELEMETRY_PATH) written += String(data);
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      writeTelemetry('/proj', 'prompt_received', { promptCount: 1 });

      const parsed = JSON.parse(written.trim()) as Record<string, unknown>;
      expect(parsed).not.toHaveProperty('installationId');
      expect(parsed).not.toHaveProperty('userId');
      expect(parsed).not.toHaveProperty('teamId');
    });

    it('IDs are stable across multiple writes within the same process', async () => {
      const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      const lines: string[] = [];
      vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
        if (_p === TELEMETRY_PATH) lines.push(String(data).trim());
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      writeTelemetry('/proj', 'prompt_received', { promptCount: 1 }, store);
      writeTelemetry('/proj', 'prompt_classified', { stage: 'planning' }, store);

      const a = JSON.parse(lines[0]) as Record<string, string>;
      const b = JSON.parse(lines[1]) as Record<string, string>;
      expect(a['installationId']).toBe(b['installationId']);
      expect(a['userId']).toBe(b['userId']);
      expect(a['teamId']).toBe(b['teamId']);
    });

    it('IDs persist across a simulated process restart (close + reopen)', async () => {
      const { writeTelemetry, TELEMETRY_PATH } = await import('./TelemetryWriter.js');
      const fs = await import('node:fs');

      const lines: string[] = [];
      vi.spyOn(fs, 'appendFileSync').mockImplementation((_p, data) => {
        if (_p === TELEMETRY_PATH) lines.push(String(data).trim());
      });
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as never);

      writeTelemetry('/proj', 'prompt_received', { promptCount: 1 }, store);
      const first = JSON.parse(lines[0]) as Record<string, string>;

      // Simulate restart: same in-memory DB, but identity cache wiped.
      _resetIdentityCache();

      writeTelemetry('/proj', 'prompt_classified', { stage: 'planning' }, store);
      const second = JSON.parse(lines[1]) as Record<string, string>;

      expect(second['installationId']).toBe(first['installationId']);
      expect(second['userId']).toBe(first['userId']);
      expect(second['teamId']).toBe(first['teamId']);
    });
  });
});
