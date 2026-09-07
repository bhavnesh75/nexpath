import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { openStore, closeStore, DEFAULT_DB_PATH } from '../../store/db.js';
import { SCHEMA_VERSION } from '../../store/schema.js';
import { getPromptStats } from '../../store/prompts.js';
import { getPromptEnhancementStoreStatus, type PromptEnhancementStoreStatus } from '../../store/prompt-enhancement.js';
import { getAllConfig, DEFAULT_CONFIG } from '../../store/config.js';
import { readHookStats, type ProjectHookStats } from '../../store/hook-stats.js';
import {
  detectAgentsForCleanup,
  resolveAgentPaths,
  MCP_SERVER_NAME,
  type DetectedAgent,
} from './install.js';
import { allSupportedIds } from './supported-agents-by-platform.js';
import { getKeySource, type KeySource } from '../../config/ApiKeyResolver.js';
import { resolveApiBaseUrl } from '../../config/NexpathTokenStore.js';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgentStatus {
  label:      string;
  configPath: string;
  registered: boolean;
}

export interface HookStatus {
  settingsPath: string;
  registered:   boolean;
}

export interface StoreStatus {
  exists:        boolean;
  dbPath:        string;
  totalPrompts:  number;
  dbSizeBytes:   number;
  perProject:    Array<{ projectRoot: string; count: number }>;
}

/**
 * Which credential is actually in effect. `status` reported neither before, so
 * "why is nothing firing?" could not be answered from it — the answer is very
 * often that no credential resolves. Symmetric by design: it names whichever is
 * in effect, and is not a token-only readout.
 */
export interface CredentialStatus {
  /** The layer `resolveOpenAIKey` would stop at. `none` means nothing resolves. */
  source: KeySource;
  /** The service base URL, only in token mode — it is what decides where calls go. */
  serviceBaseUrl: string | null;
}

export interface StatusResult {
  agents:     AgentStatus[];
  hook:       HookStatus;
  store:      StoreStatus;
  credential: CredentialStatus;
  promptEnhancement: PromptEnhancementStoreStatus;
  config:     Record<string, string>;
  hookStats:  ProjectHookStats[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function readJsonSafe(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Check if nexpath-prompt-store is registered in a standard mcpServers config.
 * Used for Claude Code (~/.claude.json), Cursor, Windsurf, Cline, Roo Code, KiloCode.
 */
export function isMcpRegistered(configPath: string): boolean {
  if (!existsSync(configPath)) return false;
  const data    = readJsonSafe(configPath);
  const servers = data.mcpServers as Record<string, unknown> | undefined;
  return servers !== undefined && MCP_SERVER_NAME in servers;
}

/**
 * Check if nexpath-prompt-store is registered in OpenCode's "mcp" key.
 */
export function isOpenCodeRegistered(configPath: string): boolean {
  if (!existsSync(configPath)) return false;
  const data = readJsonSafe(configPath);
  const mcp  = data.mcp as Record<string, unknown> | undefined;
  return mcp !== undefined && MCP_SERVER_NAME in mcp;
}

/**
 * Check if the nexpath advisory hook is registered in ~/.claude/settings.json.
 * Identified by the _nexpath_hook: true marker.
 */
export function isHookRegistered(settingsPath: string): boolean {
  if (!existsSync(settingsPath)) return false;
  const data   = readJsonSafe(settingsPath);
  const hooks  = data.hooks as Record<string, unknown> | undefined;
  if (!hooks) return false;
  const groups = hooks.UserPromptSubmit as Array<Record<string, unknown>> | undefined;
  if (!groups) return false;
  return groups.some((g) => g._nexpath_hook === true);
}

/** Format bytes to human-readable string (e.g. 2.3 MB, 512 KB). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024)     return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function agentRegistered(agent: DetectedAgent): boolean {
  if (agent.type === 'opencode') return isOpenCodeRegistered(agent.configPath);
  return isMcpRegistered(agent.configPath);
}

// ── Core logic ─────────────────────────────────────────────────────────────────

export interface StatusInput {
  dbPath:      string;
  home?:       string;
  agents?:     DetectedAgent[];  // injectable for tests
  settingsPath?: string;         // injectable for tests
  projectRoot?: string;          // injectable for tests
  /** Injectable so a status run in a test never reads the real keychain. */
  keySourceFn?: (projectRoot: string) => Promise<KeySource>;
}

export async function runStatus(input: StatusInput): Promise<StatusResult> {
  const home         = input.home         ?? homedir();
  const agents       = input.agents       ?? (() => {
    const supported = allSupportedIds();
    return detectAgentsForCleanup(resolveAgentPaths(home)).filter((a) => supported.has(a.id));
  })();
  const settingsPath = input.settingsPath ?? join(home, '.claude', 'settings.json');

  // ── Agent MCP registration ─────────────────────────────────────────────────
  const agentStatuses: AgentStatus[] = agents.map((agent) => ({
    label:      agent.label,
    configPath: agent.configPath,
    registered: agentRegistered(agent),
  }));

  // ── Advisory hook registration ─────────────────────────────────────────────
  const hook: HookStatus = {
    settingsPath,
    registered: isHookRegistered(settingsPath),
  };

  // ── Prompt store stats + config ───────────────────────────────────────────
  // Open the DB once; read both stats and config in the same session.
  let store: StoreStatus;
  let promptEnhancement: PromptEnhancementStoreStatus;
  let config: Record<string, string>;

  if (input.dbPath === ':memory:' || existsSync(input.dbPath)) {
    const db = await openStore(input.dbPath);
    try {
      const stats = getPromptStats(db);
      promptEnhancement = getPromptEnhancementStoreStatus(db);
      store = {
        exists:       true,
        dbPath:       input.dbPath,
        totalPrompts: stats.totalPrompts,
        dbSizeBytes:  stats.dbSizeBytes,
        perProject:   stats.perProject.map((p) => ({
          projectRoot: p.projectRoot,
          count:       p.count,
        })),
      };
      config = getAllConfig(db.db);
    } finally {
      closeStore(db);
    }
  } else {
    store = {
      exists:       false,
      dbPath:       input.dbPath,
      totalPrompts: 0,
      dbSizeBytes:  0,
      perProject:   [],
    };
    promptEnhancement = {
      schemaVersion: SCHEMA_VERSION,
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
    };
    config = { ...DEFAULT_CONFIG };
  }

  const hookStatsMap = readHookStats();
  const hookStats    = Object.values(hookStatsMap).sort((a, b) =>
    b.lastRunAt.localeCompare(a.lastRunAt),
  );

  // ── Credential ─────────────────────────────────────────────────────────────
  const credentialSource = await (input.keySourceFn ?? getKeySource)(
    input.projectRoot ?? process.cwd(),
  );
  const credential: CredentialStatus = {
    source: credentialSource,
    serviceBaseUrl: credentialSource === 'nexpath_token' ? resolveApiBaseUrl() : null,
  };

  return { agents: agentStatuses, hook, store, credential, promptEnhancement, config, hookStats };
}

// ── Render ────────────────────────────────────────────────────────────────────

const TICK  = '\u2713';
const CROSS = '\u2717';
const DASH  = '-';

function line(char: string, label: string, detail: string): string {
  return `  ${char} ${label.padEnd(14)} ${detail}`;
}

export function renderStatus(result: StatusResult): string {
  const lines: string[] = [];

  // ── MCP connections (temporarily disabled) ─────────────────────────────────
  // The block below renders each detected agent's MCP registration plus the
  // Claude Code advisory-hook status. It is commented out for now. To bring the
  // `nexpath status` MCP view back in the future: un-comment this block and
  // re-enable the matching tests in status.test.ts (the "renderStatus — agent
  // lines" describe and the "MCP connections" section assertions). The data is
  // still gathered in runStatus(), so apply any other necessary changes there.
  //
  // lines.push('MCP connections');
  // for (const a of result.agents) {
  //   const sym    = a.registered ? TICK : CROSS;
  //   const detail = a.registered
  //     ? `registered  (${a.configPath})`
  //     : `not registered`;
  //   lines.push(line(sym, a.label, detail));
  // }
  //
  // // Advisory hook line (Claude Code only)
  // const sym    = result.hook.registered ? TICK : DASH;
  // const detail = result.hook.registered
  //   ? `advisory hook registered  (${result.hook.settingsPath})`
  //   : `advisory hook not registered  (run: nexpath install)`;
  // lines.push(line(sym, 'Claude Code', detail));
  //
  // lines.push('');

  // ── Credential ────────────────────────────────────────────────────────────
  // First, because "nothing is firing" is most often "nothing resolves", and
  // that answer should not be at the bottom of a long dump.
  lines.push('Credential');
  const noCredential = result.credential.source === 'none';
  lines.push(`  Source        : ${result.credential.source}`);
  if (result.credential.serviceBaseUrl !== null) {
    lines.push(`  Service       : ${result.credential.serviceBaseUrl}`);
  }
  if (noCredential) {
    lines.push('  None resolves — guidance stays deterministic.');
    lines.push('  Set one: nexpath config set-api-key  |  nexpath config set-token');
  }
  lines.push('');

  // ── Prompt store ──────────────────────────────────────────────────────────
  if (result.store.exists) {
    lines.push(`Prompt store  (${result.store.dbPath})`);
    lines.push(`  Total prompts : ${result.store.totalPrompts.toLocaleString()}`);
    lines.push(`  DB size       : ${formatBytes(result.store.dbSizeBytes)}`);
    lines.push(`  Projects      : ${result.store.perProject.length}`);
    for (const p of result.store.perProject) {
      lines.push(`    ${p.projectRoot}  —  ${p.count.toLocaleString()} prompts`);
    }
  } else {
    lines.push(`Prompt store  (${result.store.dbPath})`);
    lines.push(`  Not initialised — run: nexpath install && nexpath init`);
  }

  lines.push('');

  lines.push('Prompt enhancement');
  lines.push(`  Enabled state    : ${result.promptEnhancement.enabledState}`);
  lines.push(`  Schema version   : ${result.promptEnhancement.schemaVersion}`);
  lines.push(`  Memory rows      : ${result.promptEnhancement.memoryRows.toLocaleString()}`);
  lines.push(`  Source-use rows  : ${result.promptEnhancement.sourceUseRows.toLocaleString()}`);
  lines.push(`  Generated-origin : ${result.promptEnhancement.generatedOriginRows.toLocaleString()}`);
  lines.push(`  Feedback rows    : ${result.promptEnhancement.feedbackRows.toLocaleString()}`);
  lines.push(`  Status rows      : ${result.promptEnhancement.statusRows.toLocaleString()}`);
  lines.push(`  Global rows      : memory ${result.promptEnhancement.globalMemoryRows.toLocaleString()}, source-use ${result.promptEnhancement.globalSourceUseRows.toLocaleString()}, generated-origin ${result.promptEnhancement.globalGeneratedOriginRows.toLocaleString()}, feedback ${result.promptEnhancement.globalFeedbackRows.toLocaleString()}, status ${result.promptEnhancement.globalStatusRows.toLocaleString()}`);
  lines.push(`  Estimated bytes  : ${formatBytes(result.promptEnhancement.estimatedBytes)}`);
  lines.push(`  Exported DB bytes: ${formatBytes(result.promptEnhancement.exportedDbBytes)}`);
  lines.push(`  Cap state        : ${result.promptEnhancement.capState}`);
  lines.push(`  Row cap state    : ${result.promptEnhancement.rowCapState}`);
  lines.push(`  Byte state       : ${result.promptEnhancement.byteThresholdState}`);
  lines.push(`  Last cleanup     : ${result.promptEnhancement.lastCleanupOutcome}`);
  lines.push(`  Last prune       : ${formatOptionalTimestamp(result.promptEnhancement.lastPruneAt)}`);
  lines.push(`  Last decay       : ${formatOptionalTimestamp(result.promptEnhancement.lastDecayAt)}`);
  lines.push(`  Fallback/errors  : ${result.promptEnhancement.fallbackCount}/${result.promptEnhancement.errorCount}`);
  if (result.promptEnhancement.reasonCodes.length > 0) {
    lines.push(`  Reasons          : ${result.promptEnhancement.reasonCodes.join(', ')}`);
  }

  lines.push('');

  // ── Hook activity ─────────────────────────────────────────────────────────
  lines.push('Hook activity');
  if (result.hookStats.length === 0) {
    lines.push('  No hook invocations recorded yet');
  } else {
    for (const s of result.hookStats) {
      const label = s.projectRoot.length > 40
        ? '...' + s.projectRoot.slice(-37)
        : s.projectRoot;
      lines.push(`  ${label}`);
      lines.push(`    last run    : ${s.lastRunAt}`);
      lines.push(`    invocations : ${s.invocationCount}`);
      lines.push(`    last outcome: ${s.lastOutcome}`);
    }
  }

  lines.push('');

  // ── Config ────────────────────────────────────────────────────────────────
  lines.push('Config');
  for (const [key, value] of Object.entries(result.config).sort()) {
    lines.push(`  ${key.padEnd(36)} : ${value}`);
  }

  return lines.join('\n') + '\n';
}

function formatOptionalTimestamp(value: number | null): string {
  return value === null ? 'never' : new Date(value).toISOString();
}

// ── CLI entry point ────────────────────────────────────────────────────────────

export function registerStatusCommand(program: import('commander').Command): void {
  program
    .command('status')
    // ⚠️ "MCP connections" STAYS. It reads as stale — that section is commented
    // out in renderStatus — but the removal is temporary and a test pins the
    // word deliberately, so dropping it would quietly undo that decision. The
    // credential is added beside it because the output now leads with one.
    .description('Verify MCP connections across detected agents, which credential is in effect, prompt store stats, and config summary')
    .option('--db <path>', 'Database path', DEFAULT_DB_PATH)
    .action(async (opts: { db: string }) => {
      const result = await runStatus({ dbPath: opts.db });
      process.stdout.write(renderStatus(result));
    });
}
