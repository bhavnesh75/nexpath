import { describe, it, expect, afterEach } from 'vitest';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { openStore, closeStore, type Store } from '../../store/db.js';
import { getConfig, setConfig } from '../../store/config.js';
import { ConfigValidationError } from '../../config/prompt-enhancement-errors.js';
import { buildPromptEnhancementSettingsControlV1 } from './pe-settings-control.js';
import { ROLE_OPTIONS } from './role-description.js';

const PROJECT = '/tmp/project-a';
const OTHER_PROJECT = '/tmp/project-b';

const opened: { store: Store; path: string }[] = [];

async function store(): Promise<Store> {
  const path = join(tmpdir(), `nexpath-freq-control-${randomUUID()}.db`);
  const opened_ = await openStore(path);
  opened.push({ store: opened_, path });
  return opened_;
}

afterEach(() => {
  while (opened.length > 0) {
    const entry = opened.pop()!;
    try { closeStore(entry.store); } catch { /* already closed */ }
    try { rmSync(entry.path); } catch { /* best-effort */ }
  }
});

describe('PE popup Ctrl+T — the store side', () => {
  it('reads the project-scoped value first, exactly as the pipeline resolves it', async () => {
    const db = await store();
    setConfig(db, 'advisory_frequency', 'every_event');
    setConfig(db, `advisory_frequency:${PROJECT}`, 'major_only');
    expect(buildPromptEnhancementSettingsControlV1(db, PROJECT).readFrequency()).toBe('major_only');
  });

  it('falls back to the global value, then to undefined', async () => {
    const db = await store();
    expect(buildPromptEnhancementSettingsControlV1(db, PROJECT).readFrequency()).toBeUndefined();
    setConfig(db, 'advisory_frequency', 'optimum');
    expect(buildPromptEnhancementSettingsControlV1(db, PROJECT).readFrequency()).toBe('optimum');
  });

  it('writes project-scoped — the global default and other projects are left alone', async () => {
    const db = await store();
    setConfig(db, 'advisory_frequency', 'optimum');
    setConfig(db, `advisory_frequency:${OTHER_PROJECT}`, 'every_event');

    buildPromptEnhancementSettingsControlV1(db, PROJECT).writeFrequency('major_only');

    expect(getConfig(db.db, `advisory_frequency:${PROJECT}`)).toBe('major_only');
    expect(getConfig(db.db, 'advisory_frequency'), 'the global default must not move').toBe('optimum');
    expect(getConfig(db.db, `advisory_frequency:${OTHER_PROJECT}`)).toBe('every_event');
  });

  it('a write is visible to the very next read — the footer hint is the user visible confirmation', async () => {
    const db = await store();
    const control = buildPromptEnhancementSettingsControlV1(db, PROJECT);
    control.writeFrequency('optimum');
    expect(control.readFrequency()).toBe('optimum');
    control.writeFrequency('every_event');
    expect(control.readFrequency()).toBe('every_event');
  });

  it('offers the same roles, in the same order, as the installer — one source of truth', async () => {
    const db = await store();
    // The list comes from `role-description.ts`, which install and the old DS menu also use. The
    // popup module cannot import it (it is bundled for the browser, and that file pulls in
    // picocolors), so it travels through this control instead of being copied.
    expect(buildPromptEnhancementSettingsControlV1(db, PROJECT).roleOptions)
      .toEqual(ROLE_OPTIONS.map((o) => ({ value: o.value, label: o.label })));
  });

  it('reads the role project-scoped first, then global', async () => {
    const db = await store();
    const control = buildPromptEnhancementSettingsControlV1(db, PROJECT);
    expect(control.readRole()).toBeUndefined();
    setConfig(db, 'role', 'pm');
    expect(control.readRole()).toBe('pm');
    setConfig(db, `role:${PROJECT}`, 'vibe_coder');
    expect(control.readRole()).toBe('vibe_coder');
  });

  it('reports a legacy or unrecognised role as UNSET, never as a value', async () => {
    const db = await store();
    const control = buildPromptEnhancementSettingsControlV1(db, PROJECT);
    // 'clear' is the legacy sentinel; both must read as unset so no row is marked current and the
    // menu never names a role the pipeline would not honour.
    for (const bad of ['clear', 'architect', '']) {
      setConfig(db, `role:${PROJECT}`, bad);
      expect(control.readRole(), bad).toBeUndefined();
    }
  });

  it('writes the role project-scoped, leaving the global default alone', async () => {
    const db = await store();
    setConfig(db, 'role', 'founder');
    buildPromptEnhancementSettingsControlV1(db, PROJECT).writeRole('indie_hacker');
    expect(getConfig(db.db, `role:${PROJECT}`)).toBe('indie_hacker');
    expect(getConfig(db.db, 'role'), 'the global default must not move').toBe('founder');
    expect(getConfig(db.db, `role:${OTHER_PROJECT}`)).toBeUndefined();
  });

  it('refuses a role that is not a role', async () => {
    const db = await store();
    const control = buildPromptEnhancementSettingsControlV1(db, PROJECT);
    expect(() => control.writeRole('architect')).toThrow(ConfigValidationError);
    expect(getConfig(db.db, `role:${PROJECT}`)).toBeUndefined();
  });

  it('refuses a value that is not a frequency level', async () => {
    const db = await store();
    const control = buildPromptEnhancementSettingsControlV1(db, PROJECT);
    // The chooser can only produce the three valid levels; this is the guard that keeps a future
    // caller from writing something the pipeline would silently treat as unset.
    expect(() => control.writeFrequency('turbo' as never)).toThrow(ConfigValidationError);
    expect(getConfig(db.db, `advisory_frequency:${PROJECT}`)).toBeUndefined();
  });
});
