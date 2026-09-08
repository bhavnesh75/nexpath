/**
 * H5 — `.cursor/hooks.json` writer.
 *
 * The plan names four acceptance items; the three this file covers are:
 * written/removed idempotently, the `timeout` UNIT pinned by test, and other
 * tools' hooks preserved.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  writeCursorHooks, removeCursorHooks, buildCursorHookEntry, buildCursorHookCommand, buildCursorHooksConfig,
  isNexpathCursorHook, getCursorUserHooksPath, getCursorProjectHooksPath,
  CURSOR_HOOK_TIMEOUT_SECONDS, CURSOR_HOOK_EVENTS,
  readRegisteredCursorHookTimeoutSec,
} from './install.js';

const CLI = '/opt/nexpath/dist/cli/index.js';

function tmp() {
  const d = mkdtempSync(join(tmpdir(), 'nexpath-cursor-'));
  return { dir: d, file: join(d, '.cursor', 'hooks.json'), cleanup: () => rmSync(d, { recursive: true, force: true }) };
}
const read = (f: string) => JSON.parse(readFileSync(f, 'utf8')) as Record<string, never>;

describe('⚠ R4 — timeout is written in SECONDS, not milliseconds', () => {
  it('pins the emitted value', () => {
    // Cursor multiplies by 1000: "timeout": 180000 was logged as 180000000ms.
    // Emitting ms here would produce a timeout ~1000x too long, so a hung hook
    // would appear to hang forever.
    expect(buildCursorHookEntry(CLI, 'beforeSubmitPrompt').timeout).toBe(1900);
    expect(CURSOR_HOOK_TIMEOUT_SECONDS).toBe(1900);
  });

  it('is a plausible SECONDS value, never a milliseconds one', () => {
    // MUTATION GUARD: 120_000 would pass a naive "is it set?" check.
    // RC77: the popup may wait up to 30 minutes (1800 s); the registration sits above that and
    // below an hour. A milliseconds mistake would be ≥ 60_000 — still caught.
    expect(CURSOR_HOOK_TIMEOUT_SECONDS).toBeGreaterThan(1800);
    expect(CURSOR_HOOK_TIMEOUT_SECONDS).toBeLessThan(3600);
  });

  it('⚠ R3 — sits above H4\'s 60-90s hold budget, never relying on the 60s default', () => {
    // The default is a silent fail-open cliff: it could fire while we are
    // legitimately holding the prompt.
    expect(CURSOR_HOOK_TIMEOUT_SECONDS).toBeGreaterThan(90);
  });
});

describe('failClosed stays at its default (A3)', () => {
  it('is not written at all', () => {
    // Writing false explicitly would imply we had a reason to override it.
    expect(Object.keys(buildCursorHookEntry(CLI, 'beforeSubmitPrompt'))).not.toContain('failClosed');
  });
});

describe('registered events (RC41)', () => {
  it('registers beforeSubmitPrompt + afterAgentResponse and nothing else', () => {
    // RC41: `afterAgentResponse` is Cursor's response-finished hook — the
    // continuation trigger for the MPS chain (the CLI's next-Stop analog).
    // Verified against the live Cursor at ship time (its hooks log must list
    // the step as loaded). Anything beyond these two is still invented.
    expect([...CURSOR_HOOK_EVENTS]).toEqual(['beforeSubmitPrompt', 'afterAgentResponse']);
    expect(Object.keys(buildCursorHooksConfig(CLI))).toEqual(['beforeSubmitPrompt', 'afterAgentResponse']);
  });

  it('⭐ RC41/RC77 — both entries carry explicit human-wait timeouts: submit 1900 s (RC77), continuation 600 s (RC41)', () => {
    const cfg = buildCursorHooksConfig(CLI);
    expect(cfg.afterAgentResponse[0].timeout).toBe(600);
    // The submit entry keeps its measured 120s — unchanged.
    expect(cfg.beforeSubmitPrompt[0].timeout).toBe(1900);
    // Both commands carry the event name they serve.
    expect(cfg.afterAgentResponse[0].command).toContain('cursor-hook afterAgentResponse');
  });
});

describe('idempotent write', () => {
  it('writes our hook into a fresh file', () => {
    const t = tmp();
    try {
      writeCursorHooks(t.file, CLI);
      const h = read(t.file).hooks as never as Record<string, Array<{ command: string }>>;
      expect(h.beforeSubmitPrompt).toHaveLength(1);
      expect(h.beforeSubmitPrompt[0].command).toContain('cursor-hook');
    } finally { t.cleanup(); }
  });

  it('writing twice does not duplicate', () => {
    const t = tmp();
    try {
      writeCursorHooks(t.file, CLI);
      writeCursorHooks(t.file, CLI);
      const h = read(t.file).hooks as never as Record<string, unknown[]>;
      expect(h.beforeSubmitPrompt).toHaveLength(1);
    } finally { t.cleanup(); }
  });

  it('replaces a stale nexpath entry from an older install path', () => {
    const t = tmp();
    try {
      mkdirSync(dirname(t.file), { recursive: true });
      writeFileSync(t.file, JSON.stringify({
        hooks: { beforeSubmitPrompt: [{ command: 'node /OLD/path/cli.js cursor-hook beforeSubmitPrompt' }] },
      }));
      writeCursorHooks(t.file, CLI);
      const h = read(t.file).hooks as never as Record<string, Array<{ command: string }>>;
      expect(h.beforeSubmitPrompt).toHaveLength(1);
      expect(h.beforeSubmitPrompt[0].command).toContain(CLI);
    } finally { t.cleanup(); }
  });
});

describe('other tools\' hooks are preserved', () => {
  it('keeps a foreign entry on the same event', () => {
    const t = tmp();
    try {
      mkdirSync(dirname(t.file), { recursive: true });
      writeFileSync(t.file, JSON.stringify({
        hooks: { beforeSubmitPrompt: [{ command: 'some-other-tool --check' }] },
      }));
      writeCursorHooks(t.file, CLI);
      const h = read(t.file).hooks as never as Record<string, Array<{ command: string }>>;
      expect(h.beforeSubmitPrompt).toHaveLength(2);
      expect(h.beforeSubmitPrompt[0].command).toBe('some-other-tool --check');
    } finally { t.cleanup(); }
  });

  it('preserves unrelated top-level keys', () => {
    const t = tmp();
    try {
      mkdirSync(dirname(t.file), { recursive: true });
      writeFileSync(t.file, JSON.stringify({ version: 1, hooks: {} }));
      writeCursorHooks(t.file, CLI);
      expect(read(t.file).version).toBe(1);
    } finally { t.cleanup(); }
  });

  it('rewrites rather than crashing on a malformed file', () => {
    const t = tmp();
    try {
      mkdirSync(dirname(t.file), { recursive: true });
      writeFileSync(t.file, '{ not json');
      expect(() => writeCursorHooks(t.file, CLI)).not.toThrow();
      const h = read(t.file).hooks as never as Record<string, unknown[]>;
      expect(h.beforeSubmitPrompt).toHaveLength(1);
    } finally { t.cleanup(); }
  });
});

describe('idempotent removal', () => {
  it('removes ours and reports true', () => {
    const t = tmp();
    try {
      writeCursorHooks(t.file, CLI);
      expect(removeCursorHooks(t.file)).toBe(true);
      expect((read(t.file).hooks as never as Record<string, unknown>).beforeSubmitPrompt).toBeUndefined();
    } finally { t.cleanup(); }
  });

  it('leaves other tools\' hooks intact', () => {
    const t = tmp();
    try {
      mkdirSync(dirname(t.file), { recursive: true });
      writeFileSync(t.file, JSON.stringify({ hooks: { beforeSubmitPrompt: [{ command: 'other-tool' }] } }));
      writeCursorHooks(t.file, CLI);
      removeCursorHooks(t.file);
      const h = read(t.file).hooks as never as Record<string, Array<{ command: string }>>;
      expect(h.beforeSubmitPrompt).toEqual([{ command: 'other-tool' }]);
    } finally { t.cleanup(); }
  });

  it('returns false when the file does not exist', () => {
    const t = tmp();
    try { expect(removeCursorHooks(t.file)).toBe(false); } finally { t.cleanup(); }
  });

  it('removing twice is a no-op the second time', () => {
    const t = tmp();
    try {
      writeCursorHooks(t.file, CLI);
      expect(removeCursorHooks(t.file)).toBe(true);
      expect(removeCursorHooks(t.file)).toBe(false);
    } finally { t.cleanup(); }
  });
});

describe('config locations (Cursor merges three; we write only two)', () => {
  it('user and project paths', () => {
    // Host separator (Windows joins with backslashes) — the convention, not the slash, is the pin.
    expect(getCursorUserHooksPath('/home/u')).toBe(join('/home/u', '.cursor', 'hooks.json'));
    expect(getCursorProjectHooksPath('/proj')).toBe(join('/proj', '.cursor', 'hooks.json'));
  });

  it('identifies our own entries by command substring, with no marker field', () => {
    expect(isNexpathCursorHook({ command: 'node x cursor-hook beforeSubmitPrompt' })).toBe(true);
    expect(isNexpathCursorHook({ command: 'other-tool' })).toBe(false);
    expect(isNexpathCursorHook({} as never)).toBe(false);
  });
});

describe('⭐ the command string survives paths with spaces (cross-OS)', () => {
  // Real risk: Windows installs land under "C:\Program Files\..." and macOS under
  // "/Applications/...". An unquoted path would split into separate argv entries
  // and the hook would fail to launch with a confusing "cannot find module".
  const SPACED = 'C:\\Program Files\\nexpath\\dist\\cli\\index.js';

  it('quotes the CLI path VERBATIM — no JSON escaping (RC29)', () => {
    const cmd = buildCursorHookEntry(SPACED, 'beforeSubmitPrompt').command;
    // Pre-RC29 this asserted the DOUBLED form, i.e. it pinned the bug: on
    // Windows `JSON.stringify` turned every separator into `\\`, so the command
    // Cursor executed referenced a path that does not exist, and the RC26
    // registration check could never match it (setup re-ran on every reload).
    expect(cmd).toContain(`"${SPACED}"`);
    expect(cmd).not.toContain('\\\\');
  });

  it('the event name follows the quoted path, unquoted', () => {
    const cmd = buildCursorHookEntry(SPACED, 'beforeSubmitPrompt').command;
    expect(cmd.endsWith(' cursor-hook beforeSubmitPrompt')).toBe(true);
  });

  it('a spaced path still round-trips through write + identify', () => {
    const t = tmp();
    try {
      writeCursorHooks(t.file, SPACED);
      const h = read(t.file).hooks as never as Record<string, Array<{ command: string }>>;
      expect(isNexpathCursorHook(h.beforeSubmitPrompt[0])).toBe(true);
      // MUTATION GUARD: dropping the quoting would still contain 'cursor-hook',
      // so identification alone does not prove the command is launchable.
      expect(h.beforeSubmitPrompt[0].command).toContain('"');
    } finally { t.cleanup(); }
  });
});

describe('user vs project path helpers are distinct', () => {
  it('do not collide for the same directory', () => {
    // Both end in .cursor/hooks.json; a copy-paste error between them would make
    // install silently write the wrong scope.
    expect(getCursorUserHooksPath('/x')).toBe(getCursorProjectHooksPath('/x'));
    expect(getCursorUserHooksPath('/home/u')).not.toBe(getCursorProjectHooksPath('/proj'));
  });
});

/**
 * ⚠ R5 (live root cause, 2026-08-12) — Cursor REQUIRES a top-level `version`
 * (positive integer) and rejects the ENTIRE file without it: the service logs
 * "Failed to parse user hooks configuration" and registers nothing, silently.
 * This writer emitted exactly that for four days; the submit hook never fired.
 * Reproduced against the validator extracted from workbench.desktop.main.js:
 * current file → ["Config version must be a number"]; +version:1 → [].
 */
describe('⚠ R5 — top-level version is REQUIRED or Cursor rejects the whole file', () => {
  it('⭐ a fresh write emits version: 1', () => {
    const t = tmp();
    try {
      writeCursorHooks(t.file, CLI);
      expect(read(t.file).version).toBe(1);
    } finally { t.cleanup(); }
  });

  it('preserves a user-customised valid version', () => {
    const t = tmp();
    try {
      mkdirSync(dirname(t.file), { recursive: true });
      writeFileSync(t.file, JSON.stringify({ version: 2, hooks: {} }), 'utf8');
      writeCursorHooks(t.file, CLI);
      expect(read(t.file).version).toBe(2);
    } finally { t.cleanup(); }
  });

  it('replaces an invalid version (Cursor would reject 0 / floats / strings)', () => {
    const t = tmp();
    try {
      mkdirSync(dirname(t.file), { recursive: true });
      writeFileSync(t.file, JSON.stringify({ version: '1', hooks: {} }), 'utf8');
      writeCursorHooks(t.file, CLI);
      expect(read(t.file).version).toBe(1);
    } finally { t.cleanup(); }
  });

  it('removal also leaves a valid version behind (other tools\' hooks must not stay dead)', () => {
    const t = tmp();
    try {
      mkdirSync(dirname(t.file), { recursive: true });
      // A legacy nexpath-written file: no version, ours + a foreign hook.
      writeFileSync(t.file, JSON.stringify({
        hooks: { beforeSubmitPrompt: [
          { command: 'other-tool audit' },
          buildCursorHookEntry(CLI, 'beforeSubmitPrompt'),
        ] },
      }), 'utf8');
      expect(removeCursorHooks(t.file)).toBe(true);
      const after = read(t.file) as { version?: number; hooks: Record<string, Array<{ command: string }>> };
      expect(after.version).toBe(1);
      expect(after.hooks.beforeSubmitPrompt).toHaveLength(1);
      expect(after.hooks.beforeSubmitPrompt[0].command).toBe('other-tool audit');
    } finally { t.cleanup(); }
  });
});

/**
 * RC25 (2026-08-19): the command was BARE `node`. `windsurf-hook/install.ts`
 * documents a MEASURED live finding that hosts spawn hook commands with a
 * sanitized PATH that may not contain `node` — a bare `node` ENOENTs silently
 * (0 invocations, no error surfaced anywhere). That is the exact failure class
 * RC21 root-caused for Windsurf on Windows; Cursor's writer had never been
 * checked against it. Mirrors Windsurf's already-proven absolute-path pattern.
 */
describe('⭐ RC25 — the hook command carries an ABSOLUTE node path (never bare `node`)', () => {
  it('defaults to process.execPath', () => {
    const cmd = buildCursorHookCommand('/cli/index.js', 'beforeSubmitPrompt');
    // RC29: paths are quoted VERBATIM (no JSON escaping) — on Windows process.execPath carries backslashes.
    expect(cmd).toBe(`"${process.execPath}" "/cli/index.js" cursor-hook beforeSubmitPrompt`);
    expect(cmd.startsWith('node ')).toBe(false);
  });

  it('an injected node path is quoted exactly like the CLI path (spaces-safe, cross-OS)', () => {
    const NODE = 'C:\\Program Files\\nodejs\\node.exe';
    const cmd = buildCursorHookCommand('/cli/index.js', 'beforeSubmitPrompt', NODE);
    expect(cmd).toContain(`"${NODE}"`);
    expect(cmd).not.toContain('\\\\');
    expect(cmd.endsWith('cursor-hook beforeSubmitPrompt')).toBe(true);
  });

  it('⭐ RC29 — a Windows command NEVER contains a doubled separator', () => {
    // The exact defect: `JSON.stringify` is a JSON encoder, not a quoter. On
    // POSIX it was a harmless quote-wrapper (no backslashes to escape), which is
    // why only Windows was ever affected.
    const cmd = buildCursorHookCommand(
      'C:\\Users\\janvi\\.nexpath\\cli\\0.1.4\\dist\\cli\\index.js',
      'beforeSubmitPrompt',
      'C:\\Program Files\\nodejs\\node.exe',
    );
    expect(cmd).not.toContain('\\\\');
    expect(cmd).toContain('C:\\Users\\janvi\\.nexpath\\cli\\0.1.4\\dist\\cli\\index.js');
  });

  it('RC29 — the POSIX command is byte-identical to what pre-RC29 produced', () => {
    // Proves the fix cannot regress Linux/macOS: for a path with no backslashes
    // and no quotes, plain quoting and JSON.stringify agree exactly.
    const posix = '/home/u/.nexpath/cli/0.1.4/dist/cli/index.js';
    const node = '/usr/bin/node';
    expect(buildCursorHookCommand(posix, 'beforeSubmitPrompt', node))
      .toBe(`${JSON.stringify(node)} ${JSON.stringify(posix)} cursor-hook beforeSubmitPrompt`);
  });

  it('buildCursorHookEntry threads the same node path through', () => {
    const e = buildCursorHookEntry('/cli/index.js', 'beforeSubmitPrompt', '/usr/local/bin/node');
    expect(e.command).toContain('"/usr/local/bin/node"');
  });

  it('⭐ isNexpathCursorHook still identifies the entry (command-substring detection unaffected)', () => {
    const e = buildCursorHookEntry('/cli/index.js', 'beforeSubmitPrompt');
    expect(isNexpathCursorHook(e)).toBe(true);
  });
});

/**
 * ⭐ RC77 — the registration is what bounds the popup wait on Cursor, so (a) re-running setup
 * over an install that still carries the old 120 s must yield the new value, and (b) the
 * hook must be able to read back what THIS machine registered.
 */
describe('⭐ RC77 — registered timeout: upgrade path + read-back', () => {
  it('⭐ writing over an existing entry with the old 120 s replaces it with 1900 s, other tools untouched', () => {
    const t = tmp();
    try {
      mkdirSync(dirname(t.file), { recursive: true });
      writeFileSync(t.file, JSON.stringify({
        version: 1,
        hooks: {
          beforeSubmitPrompt: [
            { command: '"/usr/bin/node" "/x/dist/cli/index.js" cursor-hook beforeSubmitPrompt', timeout: 120 },
            { command: 'other-tool --pre', timeout: 5 },
          ],
        },
      }));
      writeCursorHooks(t.file, CLI);
      const data = JSON.parse(readFileSync(t.file, 'utf8')) as { hooks: Record<string, Array<{ command: string; timeout?: number }>> };
      const ours = data.hooks.beforeSubmitPrompt.filter((e) => e.command.includes('cursor-hook'));
      expect(ours).toHaveLength(1);
      expect(ours[0]!.timeout).toBe(1900);
      expect(data.hooks.beforeSubmitPrompt.find((e) => e.command === 'other-tool --pre')?.timeout).toBe(5);
    } finally { t.cleanup(); }
  });
  it('⭐ readRegisteredCursorHookTimeoutSec returns our entry\'s value, and null for absent / malformed / foreign entries', () => {
    const t = tmp();
    try {
      mkdirSync(dirname(t.file), { recursive: true });
      writeCursorHooks(t.file, CLI);
      expect(readRegisteredCursorHookTimeoutSec(t.file)).toBe(1900);
      writeFileSync(t.file, JSON.stringify({ hooks: { beforeSubmitPrompt: [{ command: 'other-tool', timeout: 7 }] } }));
      expect(readRegisteredCursorHookTimeoutSec(t.file)).toBeNull();
      writeFileSync(t.file, '{not json');
      expect(readRegisteredCursorHookTimeoutSec(t.file)).toBeNull();
      expect(readRegisteredCursorHookTimeoutSec(t.file + '.missing')).toBeNull();
      writeFileSync(t.file, JSON.stringify({ hooks: { beforeSubmitPrompt: [{ command: 'x cursor-hook beforeSubmitPrompt' }] } }));
      expect(readRegisteredCursorHookTimeoutSec(t.file)).toBeNull();   // no timeout field ⇒ Cursor's default applies upstream
    } finally { t.cleanup(); }
  });
});
