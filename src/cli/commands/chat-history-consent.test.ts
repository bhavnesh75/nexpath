import { describe, it, expect } from 'vitest';
import { readChatHistoryConsent } from './chat-history-consent.js';

// Heartbeat files as the editor extension writes them (one JSON per host and window).
function deps(beats: Record<string, { host: string; at: number; armed: boolean; reason?: string }>, now = 1_000_000) {
  return {
    dir: '/fake/.nexpath',
    now: () => now,
    readdirFn: () => Object.keys(beats),
    readFileFn: (path: string) => {
      const name = path.replace(/^.*[\\/]/, '');
      const b = beats[name]!;
      return JSON.stringify({ schemaVersion: 1, pid: 1, ...b });
    },
  };
}

describe('readChatHistoryConsent', () => {
  it('a fresh armed beat means allowed (the poller arms only after a yes)', () => {
    expect(readChatHistoryConsent(deps({ 'deliverer-cursor-1.json': { host: 'cursor', at: 999_000, armed: true, reason: 'armed' } }))).toEqual({ cursor: true, devin: false });
  });

  it('a fresh beat that says consent_not_granted means not allowed', () => {
    expect(readChatHistoryConsent(deps({ 'deliverer-cursor-1.json': { host: 'cursor', at: 999_000, armed: false, reason: 'consent_not_granted' } })).cursor).toBe(false);
  });

  it('not armed for another reason still means the user said yes', () => {
    expect(readChatHistoryConsent(deps({ 'deliverer-windsurf-1.json': { host: 'windsurf', at: 999_000, armed: false, reason: 'not_armed_yet' } }))).toEqual({ cursor: false, devin: true });
  });

  it('a window-closing marker says nothing about consent — not allowed', () => {
    expect(readChatHistoryConsent(deps({ 'deliverer-cursor-1.json': { host: 'cursor', at: 999_000, armed: false, reason: 'disposed' } })).cursor).toBe(false);
    expect(readChatHistoryConsent(deps({ 'deliverer-cursor-1.json': { host: 'cursor', at: 999_000, armed: false, reason: 'reactivated' } })).cursor).toBe(false);
  });

  it('a stale beat, no beat, or an unreadable folder means not allowed', () => {
    expect(readChatHistoryConsent(deps({ 'deliverer-cursor-1.json': { host: 'cursor', at: 1, armed: true, reason: 'armed' } })).cursor).toBe(false);
    expect(readChatHistoryConsent(deps({}))).toEqual({ cursor: false, devin: false });
    expect(readChatHistoryConsent({ readdirFn: () => { throw new Error('EACCES'); } })).toEqual({ cursor: false, devin: false });
  });

  it("Devin Desktop's extension host is windsurf", () => {
    expect(readChatHistoryConsent(deps({ 'deliverer-windsurf-7.json': { host: 'windsurf', at: 999_000, armed: true, reason: 'armed' } })).devin).toBe(true);
  });
});
