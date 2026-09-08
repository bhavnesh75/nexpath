import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  getWindsurfHooksPath,
  buildWindsurfHookCommand,
  buildWindsurfHookPowershell,
  buildWindsurfHookEntry,
  buildWindsurfHooksConfig,
  isNexpathWindsurfHook,
  writeWindsurfHooks,
  removeWindsurfHooks,
} from './install.js';

let dir: string;
let file: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'wshooks-'));
  file = join(dir, 'hooks.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const read = (): any => JSON.parse(readFileSync(file, 'utf8'));

/**
 * The CLI path as the source embeds it, computed the same way the source does.
 *
 * `install.ts` runs the caller's path through `resolve()` — and on Windows
 * `resolve('/abs/cli.js')` is DRIVE-RELATIVE (`C:\abs\cli.js`), not merely a
 * separator swap. That is correct behaviour for a real install, so the expected
 * value has to be derived, not pinned to a POSIX literal. The bash form then
 * forward-slashes the result; the PowerShell form keeps it native.
 */
const cliBash = (p: string): string => resolve(p).replace(/\\/g, '/');
const cliPs = (p: string): string => resolve(p);

describe('paths + command', () => {
  it('hooks.json lives under ~/.codeium/windsurf', () => {
    expect(getWindsurfHooksPath('/home/u')).toBe(
      join('/home/u', '.codeium', 'windsurf', 'hooks.json'),
    );
  });
  it('command embeds absolute node + cli (both quoted, forward-slashed)', () => {
    const cmd = buildWindsurfHookCommand('/abs/dist/cli/index.js', 'pre_user_prompt', '/usr/bin/node');
    expect(cmd).toBe(
      `"/usr/bin/node" "${cliBash('/abs/dist/cli/index.js')}" windsurf-hook pre_user_prompt`,
    );
  });
  it('forward-slashes a Windows node path (sanitized-PATH safety)', () => {
    const cmd = buildWindsurfHookCommand(
      '/abs/cli.js',
      'post_cascade_response',
      'C:\\Program Files\\nodejs\\node.exe',
    );
    expect(cmd).toBe(
      `"C:/Program Files/nodejs/node.exe" "${cliBash('/abs/cli.js')}" windsurf-hook post_cascade_response`,
    );
  });
  it('powershell variant uses the & call operator + native node path (Windows)', () => {
    const ps = buildWindsurfHookPowershell(
      '/abs/cli.js',
      'pre_user_prompt',
      'C:\\Program Files\\nodejs\\node.exe',
    );
    // PowerShell needs `&` to run a quoted executable path; node path stays native.
    expect(ps).toBe(
      `& "C:\\Program Files\\nodejs\\node.exe" "${cliPs('/abs/cli.js')}" windsurf-hook pre_user_prompt; exit $LASTEXITCODE`,
    );
  });
  it('hook entry carries BOTH command (bash) and powershell (Windows)', () => {
    const e = buildWindsurfHookEntry('/abs/cli.js', 'post_cascade_response', '/usr/bin/node');
    expect(e.command).toBe(
      `"/usr/bin/node" "${cliBash('/abs/cli.js')}" windsurf-hook post_cascade_response`,
    );
    expect(e.powershell).toBe(
      `& "/usr/bin/node" "${cliPs('/abs/cli.js')}" windsurf-hook post_cascade_response; exit $LASTEXITCODE`,
    );
  });
  it('config writes both events with both platform commands', () => {
    const cfg = buildWindsurfHooksConfig('/abs/cli.js');
    expect(cfg.pre_user_prompt[0].command).toContain('windsurf-hook pre_user_prompt');
    expect(cfg.pre_user_prompt[0].powershell).toContain('& ');
    expect(cfg.pre_user_prompt[0].powershell).toContain('windsurf-hook pre_user_prompt');
    expect(cfg.post_cascade_response[0].command).toContain('windsurf-hook post_cascade_response');
    expect(cfg.post_cascade_response[0].powershell).toContain('windsurf-hook post_cascade_response');
  });
  it('isNexpathWindsurfHook matches our command OR powershell', () => {
    expect(isNexpathWindsurfHook({ command: 'node x windsurf-hook pre_user_prompt' })).toBe(true);
    expect(isNexpathWindsurfHook({ powershell: '& "node" "x" windsurf-hook stop' })).toBe(true);
    expect(isNexpathWindsurfHook({ command: 'python3 audit.py' })).toBe(false);
    expect(isNexpathWindsurfHook({})).toBe(false);
  });
});

describe('writeWindsurfHooks', () => {
  it('creates hooks.json with both nexpath hooks (capture + popup)', () => {
    writeWindsurfHooks(file, '/abs/cli.js');
    const d = read();
    expect(d.hooks.pre_user_prompt[0].command).toContain('windsurf-hook pre_user_prompt');
    expect(d.hooks.post_cascade_response[0].command).toContain('windsurf-hook post_cascade_response');
  });

  it("keeps another tool's post_cascade_response alongside ours", () => {
    writeFileSync(file, JSON.stringify({
      hooks: { post_cascade_response: [{ command: 'python3 audit.py' }] },
    }));
    writeWindsurfHooks(file, '/abs/cli.js');
    const d = read();
    expect(d.hooks.post_cascade_response).toHaveLength(2);
    expect(d.hooks.post_cascade_response.some((h: any) => h.command === 'python3 audit.py')).toBe(true);
    expect(d.hooks.pre_user_prompt[0].command).toContain('windsurf-hook pre_user_prompt');
  });

  it('is idempotent — re-running does not duplicate our entries', () => {
    writeWindsurfHooks(file, '/abs/cli.js');
    writeWindsurfHooks(file, '/abs/cli2.js');
    const d = read();
    expect(d.hooks.pre_user_prompt).toHaveLength(1);
    expect(d.hooks.pre_user_prompt[0].command).toContain('/abs/cli2.js'); // refreshed
  });

  it("preserves other tools' hooks (same + other events)", () => {
    writeFileSync(file, JSON.stringify({
      hooks: {
        pre_user_prompt: [{ command: 'python3 audit.py' }],
        pre_write_code: [{ command: 'node guard.js' }],
      },
    }));
    writeWindsurfHooks(file, '/abs/cli.js');
    const d = read();
    // ours appended, the other tool's pre_user_prompt kept
    expect(d.hooks.pre_user_prompt).toHaveLength(2);
    expect(d.hooks.pre_user_prompt.some((h: any) => h.command === 'python3 audit.py')).toBe(true);
    // an unrelated event is untouched
    expect(d.hooks.pre_write_code[0].command).toBe('node guard.js');
  });

  it('preserves unrelated top-level keys in hooks.json', () => {
    writeFileSync(file, JSON.stringify({ version: 1, other: { a: 1 } }));
    writeWindsurfHooks(file, '/abs/cli.js');
    const d = read();
    expect(d.version).toBe(1);
    expect(d.other).toEqual({ a: 1 });
  });
});

describe('removeWindsurfHooks', () => {
  it('removes only our entries, keeps others, returns true', () => {
    writeFileSync(file, JSON.stringify({
      hooks: { pre_user_prompt: [{ command: 'python3 audit.py' }] },
    }));
    writeWindsurfHooks(file, '/abs/cli.js'); // adds ours alongside
    const removed = removeWindsurfHooks(file);
    expect(removed).toBe(true);
    const d = read();
    expect(d.hooks.pre_user_prompt).toEqual([{ command: 'python3 audit.py' }]);
    expect(d.hooks.post_cascade_response).toBeUndefined(); // ours-only event dropped
  });

  it('returns false when the file does not exist', () => {
    expect(removeWindsurfHooks(join(dir, 'nope.json'))).toBe(false);
  });

  it('returns false when there are no nexpath hooks to remove', () => {
    writeFileSync(file, JSON.stringify({ hooks: { pre_write_code: [{ command: 'node guard.js' }] } }));
    expect(removeWindsurfHooks(file)).toBe(false);
    expect(read().hooks.pre_write_code[0].command).toBe('node guard.js');
  });
});

/**
 * RC23 (Windows, 2026-08-17): a WORKSPACE-level hooks.json serves exactly one
 * project, but the command had no project argument — so the hook fell back to
 * whatever cwd Cascade gave it and wrote its decision where no poller watches.
 * On Windows/Devin the workspace hook is the ONLY hook that executes, so this
 * silently disabled the entire new flow there. The command now carries the
 * project; the global USER-level hook must NOT (it serves every project).
 */
describe('⭐ RC23 — workspace hook pins its project', () => {
  it('both command shapes carry --project when a root is given', () => {
    const cmd = buildWindsurfHookCommand('/cli/index.js', 'pre_user_prompt', '/usr/bin/node', '/ws/proj');
    const ps = buildWindsurfHookPowershell('/cli/index.js', 'pre_user_prompt', '/usr/bin/node', '/ws/proj');
    // Both resolve the root; the bash shape forward-slashes it (sanitized-PATH safety), the
    // PowerShell shape keeps the native form (on Windows '/ws/proj' resolves to 'D:\\ws\\proj').
    const native = resolve('/ws/proj');
    expect(cmd).toContain(`windsurf-hook pre_user_prompt --project "${native.replace(/\\/g, '/')}"`);
    expect(ps).toContain(`windsurf-hook pre_user_prompt --project "${native}"`);
  });

  it('⭐ the user-level (global) hook stays cwd-derived — no --project', () => {
    expect(buildWindsurfHookCommand('/cli/index.js', 'pre_user_prompt', '/usr/bin/node'))
      .not.toContain('--project');
    expect(buildWindsurfHooksConfig('/cli/index.js').pre_user_prompt[0].command)
      .not.toContain('--project');
  });

  it('writeWindsurfHooks threads the project into every event it writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rc23-'));
    const file = join(dir, 'hooks.json');
    writeWindsurfHooks(file, '/cli/index.js', '/ws/proj');
    const json = JSON.parse(readFileSync(file, 'utf8'));
    for (const ev of ['pre_user_prompt', 'post_cascade_response']) {
      expect(json.hooks[ev][0].command).toContain('--project');
      expect(json.hooks[ev][0].powershell).toContain('--project');
    }
    rmSync(dir, { recursive: true, force: true });
  });
});

/**
 * ⭐ RC33 (Windows/Devin tester, 2026-08-21) — the reason the submit flow never
 * actually BLOCKED on Windows. `powershell -Command "<pipeline>"` exits with the
 * pipeline's status (0, or 1 on a terminating error); it does NOT propagate a
 * native command's exit code. Node exits 2 to block; the wrapper exited 0; the
 * host's contract is "exit code 2 blocks", so it saw "not 2" and RELEASED the
 * prompt — popup open, original running behind it. `exit $LASTEXITCODE` forwards
 * node's code through the wrapper.
 */
describe('⭐ RC33 — the powershell wrapper forwards the exit code', () => {
  it('every powershell command ends with the exit forwarder', () => {
    const ps = buildWindsurfHookPowershell('/abs/cli.js', 'pre_user_prompt', 'C:\\n\\node.exe');
    expect(ps.endsWith('; exit $LASTEXITCODE')).toBe(true);
  });
  it('with --project the forwarder still comes LAST (after the flag)', () => {
    const ps = buildWindsurfHookPowershell('/abs/cli.js', 'pre_user_prompt', 'C:\\n\\node.exe', 'C:\\ws');
    expect(ps).toMatch(/--project "[^"]+"; exit \$LASTEXITCODE$/);
  });
  it('the bash command field is UNTOUCHED — POSIX propagates exit codes natively', () => {
    const e = buildWindsurfHookEntry('/abs/cli.js', 'pre_user_prompt', '/usr/bin/node');
    expect(e.command).not.toContain('LASTEXITCODE');
    expect(e.powershell).toContain('exit $LASTEXITCODE');
  });
  it('the full written config carries the forwarder on every powershell entry', () => {
    const cfg = buildWindsurfHooksConfig('/abs/cli.js');
    for (const entries of Object.values(cfg)) {
      for (const entry of entries) expect(entry.powershell).toContain('exit $LASTEXITCODE');
    }
  });
});
