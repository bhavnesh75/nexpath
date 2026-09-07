import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir as osTmpdir } from 'node:os';
import {
  isMcpRegistered,
  isOpenCodeRegistered,
  isHookRegistered,
  formatBytes,
  runStatus,
  renderStatus,
  type StatusResult,
  type StatusInput,
} from './status.js';
import { MCP_SERVER_NAME } from './install.js';
import { openStore, closeStore } from '../../store/db.js';
import { insertPrompt } from '../../store/prompts.js';
import { recordPromptEnhancementMemoryEvidence, recordPromptEnhancementSourceUse } from '../../store/prompt-enhancement.js';

// ── Test fixtures ─────────────────────────────────────────────────────────────

function tmp(): string {
  return mkdtempSync(join(osTmpdir(), 'nexpath-status-'));
}

function writeJson(filePath: string, data: unknown): void {
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

// ── isMcpRegistered ───────────────────────────────────────────────────────────

describe('isMcpRegistered', () => {
  let dir: string;
  beforeEach(() => { dir = tmp(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns false when file does not exist', () => {
    expect(isMcpRegistered(join(dir, 'missing.json'))).toBe(false);
  });

  it('returns false when file has no mcpServers key', () => {
    const p = join(dir, 'cfg.json');
    writeJson(p, { other: true });
    expect(isMcpRegistered(p)).toBe(false);
  });

  it('returns false when mcpServers does not contain nexpath key', () => {
    const p = join(dir, 'cfg.json');
    writeJson(p, { mcpServers: { 'other-server': {} } });
    expect(isMcpRegistered(p)).toBe(false);
  });

  it('returns true when mcpServers contains nexpath-prompt-store', () => {
    const p = join(dir, 'cfg.json');
    writeJson(p, { mcpServers: { [MCP_SERVER_NAME]: { command: 'npx' } } });
    expect(isMcpRegistered(p)).toBe(true);
  });

  it('returns false on malformed JSON', () => {
    const p = join(dir, 'bad.json');
    writeFileSync(p, 'not json');
    expect(isMcpRegistered(p)).toBe(false);
  });
});

// ── isOpenCodeRegistered ──────────────────────────────────────────────────────

describe('isOpenCodeRegistered', () => {
  let dir: string;
  beforeEach(() => { dir = tmp(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns false when file does not exist', () => {
    expect(isOpenCodeRegistered(join(dir, 'missing.json'))).toBe(false);
  });

  it('returns false when mcp key is absent', () => {
    const p = join(dir, 'oc.json');
    writeJson(p, { mcpServers: { [MCP_SERVER_NAME]: {} } });
    expect(isOpenCodeRegistered(p)).toBe(false);
  });

  it('returns true when mcp key contains nexpath-prompt-store', () => {
    const p = join(dir, 'oc.json');
    writeJson(p, { mcp: { [MCP_SERVER_NAME]: { type: 'local' } } });
    expect(isOpenCodeRegistered(p)).toBe(true);
  });

  it('returns false on malformed JSON', () => {
    const p = join(dir, 'bad.json');
    writeFileSync(p, 'not json');
    expect(isOpenCodeRegistered(p)).toBe(false);
  });
});

// ── isHookRegistered ──────────────────────────────────────────────────────────

describe('isHookRegistered', () => {
  let dir: string;
  beforeEach(() => { dir = tmp(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('returns false when settings file does not exist', () => {
    expect(isHookRegistered(join(dir, 'settings.json'))).toBe(false);
  });

  it('returns false when hooks key is absent', () => {
    const p = join(dir, 'settings.json');
    writeJson(p, { other: true });
    expect(isHookRegistered(p)).toBe(false);
  });

  it('returns false when UserPromptSubmit array has no nexpath hook', () => {
    const p = join(dir, 'settings.json');
    writeJson(p, {
      hooks: {
        UserPromptSubmit: [
          { matcher: '', hooks: [{ type: 'command', command: 'echo hi' }] },
        ],
      },
    });
    expect(isHookRegistered(p)).toBe(false);
  });

  it('returns true when UserPromptSubmit contains _nexpath_hook: true', () => {
    const p = join(dir, 'settings.json');
    writeJson(p, {
      hooks: {
        UserPromptSubmit: [
          { _nexpath_hook: true, matcher: '', hooks: [] },
        ],
      },
    });
    expect(isHookRegistered(p)).toBe(true);
  });

  it('returns true when nexpath hook is among multiple hook groups', () => {
    const p = join(dir, 'settings.json');
    writeJson(p, {
      hooks: {
        UserPromptSubmit: [
          { matcher: '', hooks: [] },
          { _nexpath_hook: true, matcher: '', hooks: [] },
        ],
      },
    });
    expect(isHookRegistered(p)).toBe(true);
  });
});

// ── formatBytes ───────────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('formats bytes when < 1024', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats KB when >= 1024 and < 1 MB', () => {
    expect(formatBytes(2_048)).toBe('2.0 KB');
  });

  it('formats MB when >= 1 MB', () => {
    expect(formatBytes(2_621_440)).toBe('2.5 MB');
  });

  it('formats 1 MB exactly', () => {
    expect(formatBytes(1_048_576)).toBe('1.0 MB');
  });

  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats 1023 bytes as B (below KB threshold)', () => {
    expect(formatBytes(1_023)).toBe('1023 B');
  });
});

// ── runStatus ─────────────────────────────────────────────────────────────────

describe('runStatus — store not initialised', () => {
  let dir: string;
  beforeEach(() => { dir = tmp(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('store.exists is false when DB file does not exist', async () => {
    const input: StatusInput = {
      dbPath:       join(dir, 'missing.db'),
      agents:       [],
      settingsPath: join(dir, 'settings.json'),
    };
    const result = await runStatus(input);
    expect(result.store.exists).toBe(false);
  });

  it('store stats are zero when DB file does not exist', async () => {
    const input: StatusInput = {
      dbPath:       join(dir, 'missing.db'),
      agents:       [],
      settingsPath: join(dir, 'settings.json'),
    };
    const result = await runStatus(input);
    expect(result.store.totalPrompts).toBe(0);
    expect(result.store.dbSizeBytes).toBe(0);
    expect(result.store.perProject).toHaveLength(0);
    expect(result.promptEnhancement).toMatchObject({
      memoryRows: 0,
      sourceUseRows: 0,
      generatedOriginRows: 0,
      feedbackRows: 0,
      statusRows: 0,
      globalMemoryRows: 0,
      globalSourceUseRows: 0,
      globalGeneratedOriginRows: 0,
      globalFeedbackRows: 0,
      globalStatusRows: 0,
      estimatedBytes: 0,
      exportedDbBytes: 0,
      capState: 'policy_disabled_or_no_data',
      rowCapState: 'policy_disabled_or_no_data',
      byteThresholdState: 'policy_disabled_or_no_data',
      lastCleanupOutcome: 'none',
    });
  });

  it('config falls back to defaults when DB is absent', async () => {
    const input: StatusInput = {
      dbPath:       join(dir, 'missing.db'),
      agents:       [],
      settingsPath: join(dir, 'settings.json'),
    };
    const result = await runStatus(input);
    expect(result.config['prompt_capture_enabled']).toBe('true');
    expect(result.config['prompt_store_max_per_project']).toBe('500');
  });

  it('store.dbPath in result matches input dbPath', async () => {
    const dbPath = join(dir, 'missing.db');
    const result = await runStatus({ dbPath, agents: [], settingsPath: join(dir, 's.json') });
    expect(result.store.dbPath).toBe(dbPath);
  });
});

describe('runStatus — with populated store', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(async () => {
    dir    = tmp();
    dbPath = join(dir, 'test.db');
    const store = await openStore(dbPath);
    insertPrompt(store, { projectRoot: '/proj/a', promptText: 'hello' });
    insertPrompt(store, { projectRoot: '/proj/a', promptText: 'world' });
    insertPrompt(store, { projectRoot: '/proj/b', promptText: 'foo' });
    closeStore(store);
  });

  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('store.exists is true when DB file exists', async () => {
    const result = await runStatus({ dbPath, agents: [], settingsPath: join(dir, 's.json') });
    expect(result.store.exists).toBe(true);
  });

  it('reports correct total prompt count', async () => {
    const result = await runStatus({ dbPath, agents: [], settingsPath: join(dir, 's.json') });
    expect(result.store.totalPrompts).toBe(3);
  });

  it('reports per-project counts correctly', async () => {
    const result = await runStatus({ dbPath, agents: [], settingsPath: join(dir, 's.json') });
    const projA = result.store.perProject.find((p) => p.projectRoot === '/proj/a');
    const projB = result.store.perProject.find((p) => p.projectRoot === '/proj/b');
    expect(projA?.count).toBe(2);
    expect(projB?.count).toBe(1);
  });

  it('dbSizeBytes is > 0 when DB exists', async () => {
    const result = await runStatus({ dbPath, agents: [], settingsPath: join(dir, 's.json') });
    expect(result.store.dbSizeBytes).toBeGreaterThan(0);
  });

  it('store.exists is true for :memory: path', async () => {
    const result = await runStatus({ dbPath: ':memory:', agents: [], settingsPath: join(dir, 's.json') });
    expect(result.store.exists).toBe(true);
  });

  it('store.dbPath in result matches input dbPath', async () => {
    const result = await runStatus({ dbPath, agents: [], settingsPath: join(dir, 's.json') });
    expect(result.store.dbPath).toBe(dbPath);
  });

  it('config reads from DB (not just defaults)', async () => {
    // Write a custom value to the store
    const store = await openStore(dbPath);
    store.db.run(
      `INSERT INTO config (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ['prompt_capture_enabled', 'false'],
    );
    closeStore(store);

    const result = await runStatus({ dbPath, agents: [], settingsPath: join(dir, 's.json') });
    expect(result.config['prompt_capture_enabled']).toBe('false');
  });

  it('reports prompt-enhancement status/debug counters from the DB', async () => {
    const store = await openStore(dbPath);
    recordPromptEnhancementMemoryEvidence(store, {
      projectRoot: '/proj/a',
      signalKey: 'debugging_observation_gap',
      evidenceKind: 'positive',
      currentEvidenceState: 'historical_candidate',
      confidenceBand: 'low',
      sourceStrength: 'weak',
      status: 'candidate',
      now: 100,
    });
    recordPromptEnhancementSourceUse(store, {
      sourceUseId: 'source-use-1',
      projectRoot: '/proj/a',
      enhancementId: 'enh-1',
      bodyId: 'body-1',
      bodyRevision: 1,
      sourceKind: 'content_template_fact',
      sourceId: 'ct:debug',
      useKind: 'body_section',
      now: 101,
    });
    closeStore(store);

    const result = await runStatus({ dbPath, agents: [], settingsPath: join(dir, 's.json') });

    expect(result.promptEnhancement).toMatchObject({
      memoryRows: 1,
      sourceUseRows: 1,
      generatedOriginRows: 0,
      feedbackRows: 0,
      statusRows: 2,
      globalMemoryRows: 1,
      globalSourceUseRows: 1,
      rawContentStoredByDefault: false,
      oldStoreSurfacesAreAuthority: false,
    });
    expect(result.promptEnhancement.estimatedBytes).toBeGreaterThan(0);
    expect(result.promptEnhancement.exportedDbBytes).toBeGreaterThan(0);
  });
});

describe('runStatus — agent MCP registration', () => {
  let dir: string;
  beforeEach(() => { dir = tmp(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('marks agent registered when MCP entry present', async () => {
    const cfgPath = join(dir, 'claude.json');
    writeJson(cfgPath, { mcpServers: { [MCP_SERVER_NAME]: {} } });
    const result = await runStatus({
      dbPath:       join(dir, 'missing.db'),
      agents:       [{ id: 'claude', label: 'Claude Code', configPath: cfgPath, type: 'claude-cli' }],
      settingsPath: join(dir, 's.json'),
    });
    expect(result.agents[0].registered).toBe(true);
  });

  it('marks agent not registered when config file is absent', async () => {
    const result = await runStatus({
      dbPath:       join(dir, 'missing.db'),
      agents:       [{ id: 'cursor', label: 'Cursor', configPath: join(dir, 'none.json'), type: 'standard' }],
      settingsPath: join(dir, 's.json'),
    });
    expect(result.agents[0].registered).toBe(false);
  });

  it('marks OpenCode agent registered using mcp key', async () => {
    const cfgPath = join(dir, 'oc.json');
    writeJson(cfgPath, { mcp: { [MCP_SERVER_NAME]: { type: 'local' } } });
    const result = await runStatus({
      dbPath:       join(dir, 'missing.db'),
      agents:       [{ id: 'openCode', label: 'OpenCode', configPath: cfgPath, type: 'opencode' }],
      settingsPath: join(dir, 's.json'),
    });
    expect(result.agents[0].registered).toBe(true);
  });

  it('marks cline-type agent using mcpServers key', async () => {
    const cfgPath = join(dir, 'cline.json');
    writeJson(cfgPath, { mcpServers: { [MCP_SERVER_NAME]: { disabled: false } } });
    const result = await runStatus({
      dbPath:       join(dir, 'missing.db'),
      agents:       [{ id: 'cline', label: 'Cline', configPath: cfgPath, type: 'cline' }],
      settingsPath: join(dir, 's.json'),
    });
    expect(result.agents[0].registered).toBe(true);
  });

  it('marks kilo-type agent using mcpServers key', async () => {
    const cfgPath = join(dir, 'kilo.json');
    writeJson(cfgPath, { mcpServers: { [MCP_SERVER_NAME]: {} } });
    const result = await runStatus({
      dbPath:       join(dir, 'missing.db'),
      agents:       [{ id: 'kiloCode', label: 'KiloCode', configPath: cfgPath, type: 'kilo' }],
      settingsPath: join(dir, 's.json'),
    });
    expect(result.agents[0].registered).toBe(true);
  });

  it('marks standard-type agent using mcpServers key', async () => {
    const cfgPath = join(dir, 'cursor.json');
    writeJson(cfgPath, { mcpServers: { [MCP_SERVER_NAME]: {} } });
    const result = await runStatus({
      dbPath:       join(dir, 'missing.db'),
      agents:       [{ id: 'cursor', label: 'Cursor', configPath: cfgPath, type: 'standard' }],
      settingsPath: join(dir, 's.json'),
    });
    expect(result.agents[0].registered).toBe(true);
  });

  it('includes all injected agents in result', async () => {
    const result = await runStatus({
      dbPath:       join(dir, 'missing.db'),
      agents:       [
        { id: 'claude',   label: 'Claude Code', configPath: join(dir, 'c.json'),   type: 'claude-cli' },
        { id: 'cursor',   label: 'Cursor',      configPath: join(dir, 'cur.json'), type: 'standard' },
      ],
      settingsPath: join(dir, 's.json'),
    });
    expect(result.agents).toHaveLength(2);
    expect(result.agents.map((a) => a.label)).toEqual(['Claude Code', 'Cursor']);
  });
});

describe('runStatus — hook registration', () => {
  let dir: string;
  beforeEach(() => { dir = tmp(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('hook.registered is false when settings file absent', async () => {
    const result = await runStatus({
      dbPath:       join(dir, 'missing.db'),
      agents:       [],
      settingsPath: join(dir, 'missing-settings.json'),
    });
    expect(result.hook.registered).toBe(false);
  });

  it('hook.settingsPath in result matches injected settingsPath', async () => {
    const settingsPath = join(dir, 'my-settings.json');
    const result = await runStatus({
      dbPath:       join(dir, 'missing.db'),
      agents:       [],
      settingsPath,
    });
    expect(result.hook.settingsPath).toBe(settingsPath);
  });

  it('hook.registered is true when nexpath hook present in settings', async () => {
    const settingsPath = join(dir, 'settings.json');
    writeJson(settingsPath, {
      hooks: { UserPromptSubmit: [{ _nexpath_hook: true, matcher: '', hooks: [] }] },
    });
    const result = await runStatus({
      dbPath:       join(dir, 'missing.db'),
      agents:       [],
      settingsPath,
    });
    expect(result.hook.registered).toBe(true);
  });
});

// ── renderStatus ──────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<StatusResult> = {}): StatusResult {
  return {
    agents: [],
    hook: { settingsPath: '/home/.claude/settings.json', registered: false },
    store: {
      exists:       false,
      dbPath:       '/home/.nexpath/prompt-store.db',
      totalPrompts: 0,
      dbSizeBytes:  0,
      perProject:   [],
    },
    promptEnhancement: {
      schemaVersion: 1,
      enabledState: 'policy_disabled_or_no_data',
      memoryRows: 0,
      sourceUseRows: 0,
      generatedOriginRows: 0,
      feedbackRows: 0,
      statusRows: 0,
      globalMemoryRows: 0,
      globalSourceUseRows: 0,
      globalGeneratedOriginRows: 0,
      globalFeedbackRows: 0,
      globalStatusRows: 0,
      estimatedBytes: 0,
      exportedDbBytes: 0,
      capState: 'policy_disabled_or_no_data',
      rowCapState: 'policy_disabled_or_no_data',
      byteThresholdState: 'policy_disabled_or_no_data',
      lastCleanupOutcome: 'none',
      telemetryPolicy: 'ids_enums_counts_status_timing_only',
      rawContentStoredByDefault: false,
      oldStoreSurfacesAreAuthority: false,
      reasonCodes: [],
      lastPruneAt: null,
      lastDecayAt: null,
      fallbackCount: 0,
      errorCount: 0,
    },
    config: { prompt_capture_enabled: 'true', prompt_store_max_per_project: '500', prompt_store_max_db_mb: '100' },
    credential: { source: 'keychain', serviceBaseUrl: null },
    hookStats: [],
    ...overrides,
  };
}

describe('renderStatus — sections', () => {
  it('omits the "MCP connections" section (temporarily disabled in renderStatus)', () => {
    const out = renderStatus(makeResult());
    expect(out).not.toContain('MCP connections');
  });

  it('includes "Prompt store" header', () => {
    const out = renderStatus(makeResult());
    expect(out).toContain('Prompt store');
  });

  it('includes "Config" header', () => {
    const out = renderStatus(makeResult());
    expect(out).toContain('Config');
  });

  it('shows "Not initialised" when store does not exist', () => {
    const out = renderStatus(makeResult());
    expect(out).toContain('Not initialised');
  });

  it('output ends with a newline (pipe-safe)', () => {
    const out = renderStatus(makeResult());
    expect(out.endsWith('\n')).toBe(true);
  });

  it('sections appear in order: Prompt store → Prompt enhancement → Hook activity → Config', () => {
    const out = renderStatus(makeResult());
    const storeIdx = out.indexOf('Prompt store');
    const peIdx = out.indexOf('Prompt enhancement');
    const hookIdx  = out.indexOf('Hook activity');
    const cfgIdx   = out.indexOf('Config');
    expect(storeIdx).toBeLessThan(peIdx);
    expect(peIdx).toBeLessThan(hookIdx);
    expect(storeIdx).toBeLessThan(hookIdx);
    expect(hookIdx).toBeLessThan(cfgIdx);
  });

  it('includes public-safe prompt-enhancement status/debug lines', () => {
    const out = renderStatus(makeResult({
      promptEnhancement: {
        schemaVersion: 1,
        enabledState: 'local_store_enabled',
        memoryRows: 3,
        sourceUseRows: 2,
        generatedOriginRows: 1,
        feedbackRows: 4,
        statusRows: 5,
        globalMemoryRows: 30,
        globalSourceUseRows: 20,
        globalGeneratedOriginRows: 10,
        globalFeedbackRows: 40,
        globalStatusRows: 50,
        estimatedBytes: 2048,
        exportedDbBytes: 4096,
        capState: 'within_bounds',
        rowCapState: 'within_bounds',
        byteThresholdState: 'within_bounds',
        lastCleanupOutcome: 'row_cap_enforced_without_prompt_fifo',
        telemetryPolicy: 'ids_enums_counts_status_timing_only',
        rawContentStoredByDefault: false,
        oldStoreSurfacesAreAuthority: false,
        reasonCodes: ['row_cap_enforced_without_prompt_fifo'],
        lastPruneAt: 1000,
        lastDecayAt: 2000,
        fallbackCount: 6,
        errorCount: 7,
      },
    }));
    expect(out).toContain('Prompt enhancement');
    expect(out).toContain('Enabled state    : local_store_enabled');
    expect(out).toContain('Schema version   : 1');
    expect(out).toContain('Memory rows      : 3');
    expect(out).toContain('Source-use rows  : 2');
    expect(out).toContain('Generated-origin : 1');
    expect(out).toContain('Global rows      : memory 30, source-use 20, generated-origin 10, feedback 40, status 50');
    expect(out).toContain('Estimated bytes  : 2.0 KB');
    expect(out).toContain('Exported DB bytes: 4.0 KB');
    expect(out).toContain('Cap state        : within_bounds');
    expect(out).toContain('Row cap state    : within_bounds');
    expect(out).toContain('Byte state       : within_bounds');
    expect(out).toContain('Last cleanup     : row_cap_enforced_without_prompt_fifo');
    expect(out).toContain('Fallback/errors  : 6/7');
    expect(out).toContain('row_cap_enforced_without_prompt_fifo');
  });

  it('includes "Hook activity" header', () => {
    const out = renderStatus(makeResult());
    expect(out).toContain('Hook activity');
  });

  it('shows no invocations message when hookStats is empty', () => {
    const out = renderStatus(makeResult({ hookStats: [] }));
    expect(out).toContain('No hook invocations recorded yet');
  });

  it('shows project stats when hookStats has entries', () => {
    const out = renderStatus(makeResult({
      hookStats: [{ projectRoot: '/my/project', lastRunAt: '2026-04-19T10:00:00Z', invocationCount: 7, lastOutcome: 'no_action' }],
    }));
    expect(out).toContain('invocations : 7');
    expect(out).toContain('no_action');
    expect(out).toContain('2026-04-19T10:00:00Z');
  });

  it('renders with empty agents list without crashing', () => {
    expect(() => renderStatus(makeResult({ agents: [] }))).not.toThrow();
  });

  it('includes dbPath in Prompt store header when store exists', () => {
    const result = makeResult({
      store: {
        exists: true, dbPath: '/custom/path/store.db',
        totalPrompts: 0, dbSizeBytes: 0, perProject: [],
      },
    });
    const out = renderStatus(result);
    expect(out).toContain('/custom/path/store.db');
  });

  it('includes dbPath in Prompt store header when store is absent', () => {
    const result = makeResult({
      store: {
        exists: false, dbPath: '/home/.nexpath/prompt-store.db',
        totalPrompts: 0, dbSizeBytes: 0, perProject: [],
      },
    });
    const out = renderStatus(result);
    expect(out).toContain('/home/.nexpath/prompt-store.db');
  });
});

// NOTE: These tests validate the "MCP connections" / agent-lines render block,
// which is temporarily disabled in status.ts. They are commented out alongside
// that section — re-enable this whole describe when the MCP status view returns.
/*
describe('renderStatus — agent lines', () => {
  it('shows ✓ for registered agent', () => {
    const result = makeResult({
      agents: [{ label: 'Cursor', configPath: '/home/.cursor/mcp.json', registered: true }],
    });
    const out = renderStatus(result);
    expect(out).toContain('✓');
    expect(out).toContain('Cursor');
    expect(out).toContain('registered');
  });

  it('shows ✗ for unregistered agent', () => {
    const result = makeResult({
      agents: [{ label: 'Cursor', configPath: '/home/.cursor/mcp.json', registered: false }],
    });
    const out = renderStatus(result);
    expect(out).toContain('✗');
    expect(out).toContain('not registered');
  });

  it('shows hook registered line when hook is present', () => {
    const result = makeResult({
      hook: { settingsPath: '/home/.claude/settings.json', registered: true },
    });
    const out = renderStatus(result);
    expect(out).toContain('advisory hook registered');
  });

  it('shows hook not registered line when hook is absent', () => {
    const out = renderStatus(makeResult());
    expect(out).toContain('advisory hook not registered');
  });

  it('includes config path for registered agent', () => {
    const result = makeResult({
      agents: [{ label: 'Claude Code', configPath: '/home/.claude.json', registered: true }],
    });
    const out = renderStatus(result);
    expect(out).toContain('/home/.claude.json');
  });

  it('includes settings path in hook registered line', () => {
    const result = makeResult({
      hook: { settingsPath: '/home/.claude/settings.json', registered: true },
    });
    const out = renderStatus(result);
    expect(out).toContain('/home/.claude/settings.json');
  });

  it('includes "run: nexpath install" hint in hook not-registered line', () => {
    const out = renderStatus(makeResult());
    expect(out).toContain('run: nexpath install');
  });

  it('renders multiple agents in order', () => {
    const result = makeResult({
      agents: [
        { label: 'Claude Code', configPath: '/c.json', registered: true },
        { label: 'Cursor',      configPath: '/cur.json', registered: false },
        { label: 'Windsurf',    configPath: '/win.json', registered: true },
      ],
    });
    const out = renderStatus(result);
    const claudeIdx  = out.indexOf('Claude Code');
    const cursorIdx  = out.indexOf('Cursor');
    const windsurfIdx = out.indexOf('Windsurf');
    expect(claudeIdx).toBeLessThan(cursorIdx);
    expect(cursorIdx).toBeLessThan(windsurfIdx);
  });
});
*/

describe('renderStatus — store stats', () => {
  it('shows total prompts when store exists', () => {
    const result = makeResult({
      store: {
        exists: true, dbPath: '/db', totalPrompts: 1234,
        dbSizeBytes: 512, perProject: [],
      },
    });
    const out = renderStatus(result);
    expect(out).toContain('1,234');
  });

  it('shows DB size when store exists', () => {
    const result = makeResult({
      store: {
        exists: true, dbPath: '/db', totalPrompts: 0,
        dbSizeBytes: 2_097_152, perProject: [],
      },
    });
    const out = renderStatus(result);
    expect(out).toContain('2.0 MB');
  });

  it('shows per-project line for each project', () => {
    const result = makeResult({
      store: {
        exists: true, dbPath: '/db', totalPrompts: 5,
        dbSizeBytes: 0,
        perProject: [
          { projectRoot: '/proj/alpha', count: 3 },
          { projectRoot: '/proj/beta',  count: 2 },
        ],
      },
    });
    const out = renderStatus(result);
    expect(out).toContain('/proj/alpha');
    expect(out).toContain('/proj/beta');
    expect(out).toContain('3 prompts');
    expect(out).toContain('2 prompts');
  });

  it('shows "Total prompts : 0" when store exists but is empty', () => {
    const result = makeResult({
      store: {
        exists: true, dbPath: '/db', totalPrompts: 0,
        dbSizeBytes: 0, perProject: [],
      },
    });
    const out = renderStatus(result);
    expect(out).toContain('Total prompts : 0');
  });

  it('shows singular "1 prompts" correctly (toLocaleString passthrough)', () => {
    const result = makeResult({
      store: {
        exists: true, dbPath: '/db', totalPrompts: 1,
        dbSizeBytes: 0, perProject: [{ projectRoot: '/p', count: 1 }],
      },
    });
    const out = renderStatus(result);
    expect(out).toContain('1 prompts');
  });

  it('shows project count', () => {
    const result = makeResult({
      store: {
        exists: true, dbPath: '/db', totalPrompts: 0,
        dbSizeBytes: 0,
        perProject: [{ projectRoot: '/a', count: 1 }, { projectRoot: '/b', count: 1 }],
      },
    });
    const out = renderStatus(result);
    expect(out).toContain('Projects      : 2');
  });
});

describe('renderStatus — config section', () => {
  it('renders each config key-value pair', () => {
    const result = makeResult({
      config: { prompt_capture_enabled: 'false', prompt_store_max_per_project: '200' },
    });
    const out = renderStatus(result);
    expect(out).toContain('prompt_capture_enabled');
    expect(out).toContain('false');
    expect(out).toContain('prompt_store_max_per_project');
    expect(out).toContain('200');
  });

  it('renders config keys in alphabetical order', () => {
    const result = makeResult({
      config: { z_key: 'z', a_key: 'a', m_key: 'm' },
    });
    const out = renderStatus(result);
    const aIdx = out.indexOf('a_key');
    const mIdx = out.indexOf('m_key');
    const zIdx = out.indexOf('z_key');
    expect(aIdx).toBeLessThan(mIdx);
    expect(mIdx).toBeLessThan(zIdx);
  });
});

// ── registerStatusCommand — CLI integration ───────────────────────────────────

describe('registerStatusCommand — CLI integration', () => {
  it('status output renders the prompt-store and config sections when run via CLI', async () => {
    const { createProgram } = await import('../index.js');
    const lines: string[] = [];
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      lines.push(String(chunk));
      return true;
    });
    const prog = createProgram();
    await prog.parseAsync(['node', 'nexpath', 'status', '--db', ':memory:']);
    spy.mockRestore();
    const out = lines.join('');
    // MCP connections section is temporarily disabled (see status.ts)
    expect(out).not.toContain('MCP connections');
    expect(out).toContain('Prompt store');
    expect(out).toContain('Config');
  });
});

// ── Credential block ─────────────────────────────────────────────────────────
//
// `status` reported neither credential before, so "why is nothing firing?"
// could not be answered from it — and the answer is very often that nothing
// resolves. Symmetric: it names whichever is in effect, never token-only.

describe('renderStatus — credential', () => {
  it('names the source for every OpenAI-key layer, and no service', () => {
    for (const source of ['env', 'dotenv', 'keychain', 'file'] as const) {
      const out = renderStatus(makeResult({ credential: { source, serviceBaseUrl: null } }));
      expect(out).toContain('Credential');
      expect(out).toContain(`Source        : ${source}`);
      expect(out).not.toContain('Service       :');
    }
  });

  it('names the service in token mode — it is what decides where calls go', () => {
    const out = renderStatus(makeResult({
      credential: { source: 'nexpath_token', serviceBaseUrl: 'https://parseos.tech/v1' },
    }));
    expect(out).toContain('Source        : nexpath_token');
    expect(out).toContain('Service       : https://parseos.tech/v1');
  });

  it('says plainly when nothing resolves, and how to fix it', () => {
    const out = renderStatus(makeResult({ credential: { source: 'none', serviceBaseUrl: null } }));
    expect(out).toContain('None resolves');
    expect(out).toContain('nexpath config set-api-key');
    expect(out).toContain('nexpath config set-token');
  });

  it('shows no remedy line when a credential IS resolving', () => {
    const out = renderStatus(makeResult({ credential: { source: 'keychain', serviceBaseUrl: null } }));
    expect(out).not.toContain('None resolves');
    expect(out).not.toContain('nexpath config set-api-key');
  });

  // First on purpose: the answer to "nothing is firing" should not sit at the
  // bottom of a long dump.
  it('comes before the prompt store', () => {
    const out = renderStatus(makeResult());
    expect(out.indexOf('Credential')).toBeGreaterThanOrEqual(0);
    expect(out.indexOf('Credential')).toBeLessThan(out.indexOf('Prompt store'));
  });
});

describe('runStatus — credential resolution', () => {
  let dir: string;
  beforeEach(() => { dir = tmp(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  // ⚠️ Injectable for the reason the other seams here are: an unmocked
  // getKeySource reaches the real OS keychain from a test run.
  it('reports whatever the resolver reports, and passes the project root through', async () => {
    const seen: string[] = [];
    const result = await runStatus({
      dbPath: join(dir, 'missing.db'),
      agents: [],
      settingsPath: join(dir, 'settings.json'),
      projectRoot: '/explicit/project',
      keySourceFn: async (root) => { seen.push(root); return 'file'; },
    });
    expect(seen).toEqual(['/explicit/project']);
    expect(result.credential).toEqual({ source: 'file', serviceBaseUrl: null });
  });

  it('carries the service base URL only in token mode', async () => {
    const token = await runStatus({
      dbPath: join(dir, 'a.db'), agents: [], settingsPath: join(dir, 's.json'),
      projectRoot: '/p', keySourceFn: async () => 'nexpath_token',
    });
    expect(token.credential.serviceBaseUrl).toBe('https://parseos.tech/v1');

    const none = await runStatus({
      dbPath: join(dir, 'b.db'), agents: [], settingsPath: join(dir, 's.json'),
      projectRoot: '/p', keySourceFn: async () => 'none',
    });
    expect(none.credential.serviceBaseUrl).toBeNull();
  });
});
