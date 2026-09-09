/** `nexpath credential-status` — one JSON line, consume-only resolver, never throws. */
import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';
import { credentialStatusAction, registerCredentialStatusCommand } from './credential-status.js';

describe('credential-status', () => {
  it('prints {source, configured:true} for a resolving layer, exit 0', async () => {
    const lines: string[] = [];
    const code = await credentialStatusAction({ project: '/p' }, { keySourceFn: async () => 'nexpath_token', print: (l) => { lines.push(l); } });
    expect(code).toBe(0);
    expect(JSON.parse(lines[0]!)).toEqual({ source: 'nexpath_token', configured: true });
  });
  it('prints {source:none, configured:false} when nothing resolves (the silent-product state), exit 0', async () => {
    const lines: string[] = [];
    const keySourceFn = vi.fn(async (root: string) => { expect(root).toBe('/proj'); return 'none' as const; });
    expect(await credentialStatusAction({ project: '/proj' }, { keySourceFn, print: (l) => { lines.push(l); } })).toBe(0);
    expect(JSON.parse(lines[0]!)).toEqual({ source: 'none', configured: false });
  });
  it('a throwing resolver ⇒ still one JSON line (source none + error), exit 1 — never throws', async () => {
    const lines: string[] = [];
    const code = await credentialStatusAction({ project: '/p' }, { keySourceFn: async () => { throw new Error('keychain locked'); }, print: (l) => { lines.push(l); } });
    expect(code).toBe(1);
    expect(JSON.parse(lines[0]!)).toEqual({ source: 'none', configured: false, error: 'keychain locked' });
  });
  it('registers `credential-status` with --project', () => {
    const program = new Command();
    registerCredentialStatusCommand(program);
    const cmd = program.commands.find((c) => c.name() === 'credential-status');
    expect(cmd).toBeDefined();
    expect(cmd!.options.map((o) => o.long)).toContain('--project');
  });
});
