/** No-credential notice — pure over its ports; fail-quiet; once per 24 h. */
import { describe, it, expect, vi } from 'vitest';
import {
  maybeShowCredentialNotice, CREDENTIAL_NOTICE_MESSAGE, CREDENTIAL_NOTICE_REPEAT_MS,
} from './credential-notice.js';

function ports(over: Partial<Parameters<typeof maybeShowCredentialNotice>[0]> = {}) {
  const shown: string[] = []; let stamp: number | undefined;
  return {
    shown, get stamp() { return stamp; },
    deps: {
      queryStatus: async () => ({ source: 'none', configured: false }),
      show: (m: string) => { shown.push(m); },
      getLastShownAt: () => stamp,
      setLastShownAt: (at: number) => { stamp = at; },
      now: () => 1_000_000,
      ...over,
    },
  };
}

describe('maybeShowCredentialNotice', () => {
  it('⭐ none configured ⇒ shows the notice naming both commands and stamps the time', async () => {
    const p = ports();
    expect(await maybeShowCredentialNotice(p.deps)).toBe('shown');
    expect(p.shown).toEqual([CREDENTIAL_NOTICE_MESSAGE]);
    expect(CREDENTIAL_NOTICE_MESSAGE).toContain('nexpath config set-api-key');
    expect(CREDENTIAL_NOTICE_MESSAGE).toContain('nexpath config set-token');
    expect(p.stamp).toBe(1_000_000);
  });
  it('configured ⇒ nothing shown, no stamp', async () => {
    const p = ports({ queryStatus: async () => ({ source: 'nexpath_token', configured: true }) });
    expect(await maybeShowCredentialNotice(p.deps)).toBe('configured');
    expect(p.shown).toEqual([]); expect(p.stamp).toBeUndefined();
  });
  it('⭐ CLI unavailable / unparsable (null) ⇒ nothing shown — never a false alarm', async () => {
    const p = ports({ queryStatus: async () => null });
    expect(await maybeShowCredentialNotice(p.deps)).toBe('unknown');
    expect(p.shown).toEqual([]);
  });
  it('shown within the last 24 h ⇒ not repeated; after 24 h ⇒ shown again', async () => {
    const recent = ports({ getLastShownAt: () => 1_000_000 - CREDENTIAL_NOTICE_REPEAT_MS + 1 });
    expect(await maybeShowCredentialNotice(recent.deps)).toBe('recently_shown');
    expect(recent.shown).toEqual([]);
    const old = ports({ getLastShownAt: () => 1_000_000 - CREDENTIAL_NOTICE_REPEAT_MS });
    expect(await maybeShowCredentialNotice(old.deps)).toBe('shown');
  });
  it('a throwing port never throws out (logged, unknown)', async () => {
    const logs: string[] = [];
    const p = ports({ queryStatus: async () => { throw new Error('boom'); }, log: (l) => { logs.push(l); } });
    expect(await maybeShowCredentialNotice(p.deps)).toBe('unknown');
    expect(logs.join('\n')).toContain('boom');
    const show = vi.fn(() => { throw new Error('ui gone'); });
    expect(await maybeShowCredentialNotice(ports({ show }).deps)).toBe('unknown');
  });
});
