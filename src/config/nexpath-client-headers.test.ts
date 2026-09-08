import { describe, it, expect } from 'vitest';
import {
  nexpathClientHeaders,
  NEXPATH_CLIENT_ID,
  NEXPATH_DEFAULT_SURFACE,
  NEXPATH_SURFACE_REGEX,
} from './nexpath-client-headers.js';

const TOKEN = 'npk_abcdefghijklmnopqrstuvwxyz012345';
const KEY   = 'sk-abcdefghijklmnopqrstuvwxyz012345';

/** Only the two keys this reads — nothing inherits from the real environment. */
const env = (OPENAI_API_KEY?: string, NEXPATH_AGENT?: string): NodeJS.ProcessEnv =>
  ({ ...(OPENAI_API_KEY !== undefined ? { OPENAI_API_KEY } : {}),
     ...(NEXPATH_AGENT  !== undefined ? { NEXPATH_AGENT  } : {}) });

// ── The contract: headers ride on a TOKEN, never on the user's own key ───────
describe('which credential gets headers', () => {
  it('a Nexpath token ⇒ headers', () => {
    expect(nexpathClientHeaders(env(TOKEN))).toBeDefined();
  });

  // The user's own key is their relationship with OpenAI; this package has nothing to attribute,
  // and `defaultHeaders: undefined` is the same as passing nothing — so an own-key user's requests
  // are byte-identical to before this existed.
  it('an OpenAI key ⇒ undefined, so the SDK is given nothing', () => {
    expect(nexpathClientHeaders(env(KEY))).toBeUndefined();
  });

  it('no credential at all ⇒ undefined', () => {
    expect(nexpathClientHeaders(env())).toBeUndefined();
    expect(nexpathClientHeaders(env(''))).toBeUndefined();
  });

  // A malformed token is not a token. Sending attribution for a credential the service will reject
  // anyway would only add a header to a failing call.
  it('a malformed token ⇒ undefined', () => {
    for (const bad of ['npk_', 'npk_short', 'npk-abcdefghijklmnopqrstuvwxyz01', 'not-a-credential']) {
      expect(nexpathClientHeaders(env(bad))).toBeUndefined();
    }
  });
});

// ── The surface id ───────────────────────────────────────────────────────────
describe('the surface id', () => {
  it('uses NEXPATH_AGENT when the hook set one', () => {
    for (const agent of ['cursor', 'windsurf', 'vscode']) {
      expect(nexpathClientHeaders(env(TOKEN, agent))?.['X-Nexpath-Surface']).toBe(agent);
    }
  });

  // Windsurf, Cursor and the VS Code extension all name themselves, so an absent value means the
  // Claude Code hooks or a hand-run `nexpath auto`. Agreed with Vedansi 2026-09-08 that both are
  // labelled the same.
  it('falls back to claude-code when unset', () => {
    expect(nexpathClientHeaders(env(TOKEN))?.['X-Nexpath-Surface']).toBe(NEXPATH_DEFAULT_SURFACE);
    expect(NEXPATH_DEFAULT_SURFACE).toBe('claude-code');
  });

  it('treats whitespace-only as unset rather than as a bad value', () => {
    for (const blank of [' ', '   ', '\t', '\n']) {
      expect(nexpathClientHeaders(env(TOKEN, blank))?.['X-Nexpath-Surface']).toBe(NEXPATH_DEFAULT_SURFACE);
    }
  });

  it('trims a padded value instead of rejecting it', () => {
    expect(nexpathClientHeaders(env(TOKEN, '  cursor  '))?.['X-Nexpath-Surface']).toBe('cursor');
  });

  // ⛔ The decision this pins: a value that fails the regex is OMITTED, never replaced by the
  // default. Substituting would attribute a Cursor call to Claude Code — a wrong row is worse than
  // a null one, because a null is visibly missing and a wrong value is not.
  it('OMITS an invalid surface — it does not fall back to the default', () => {
    const invalid = ['Cursor', 'CURSOR', 'my agent', '-leading-dash', '.leading-dot', 'a'.repeat(33), 'agent!'];
    for (const bad of invalid) {
      const h = nexpathClientHeaders(env(TOKEN, bad));
      expect(h).toBeDefined();
      expect(h).not.toHaveProperty('X-Nexpath-Surface');
      // The Client header still goes: that a call came from this package is worth recording even
      // when the surface is unknown.
      expect(h?.['X-Nexpath-Client']).toBe(NEXPATH_CLIENT_ID);
    }
  });

  it('the regex accepts exactly what the service stores', () => {
    for (const ok of ['cursor', 'windsurf', 'vscode', 'claude-code', 'a', '0', 'a.b_c-d', 'a'.repeat(32)]) {
      expect(NEXPATH_SURFACE_REGEX.test(ok)).toBe(true);
    }
    for (const bad of ['', 'A', '-a', '.a', '_a', 'a'.repeat(33), 'a b', 'a/b']) {
      expect(NEXPATH_SURFACE_REGEX.test(bad)).toBe(false);
    }
  });
});

describe('the client id', () => {
  it('is always cli, on every surface', () => {
    for (const agent of [undefined, 'cursor', 'windsurf', 'vscode']) {
      expect(nexpathClientHeaders(env(TOKEN, agent))?.['X-Nexpath-Client']).toBe('cli');
    }
    expect(NEXPATH_CLIENT_ID).toBe('cli');
  });
});

// ── No I/O, no ambient state ─────────────────────────────────────────────────
// This runs once per provider construction, and constructions happen per prompt on the hook path.
// It must stay a regex test on a string already in memory — `resolveOpenAIKey` writes the resolved
// credential into OPENAI_API_KEY verbatim (ApiKeyResolver.ts:63), so no keychain read is needed.
describe('cost and purity', () => {
  it('is synchronous — never returns a promise', () => {
    expect(nexpathClientHeaders(env(TOKEN))).not.toBeInstanceOf(Promise);
  });

  it('reads only the env it is given, never the ambient one', () => {
    const before = process.env['NEXPATH_AGENT'];
    process.env['NEXPATH_AGENT'] = 'ambient-should-not-leak';
    try {
      expect(nexpathClientHeaders(env(TOKEN, 'cursor'))?.['X-Nexpath-Surface']).toBe('cursor');
    } finally {
      if (before === undefined) delete process.env['NEXPATH_AGENT'];
      else process.env['NEXPATH_AGENT'] = before;
    }
  });

  it('does not mutate the env it is handed', () => {
    const e = env(TOKEN, 'cursor');
    const snapshot = JSON.stringify(e);
    nexpathClientHeaders(e);
    expect(JSON.stringify(e)).toBe(snapshot);
  });
});
