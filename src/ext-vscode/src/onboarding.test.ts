import { describe, it, expect, beforeEach, vi } from 'vitest';

// `vi.mock` is hoisted above import statements, so any identifiers it
// references must also be hoisted. `vi.hoisted` is the supported escape hatch.
const { mockShowInformationMessage, mockOpenExternal, mockUriParse } = vi.hoisted(() => ({
  mockShowInformationMessage: vi.fn(),
  mockOpenExternal: vi.fn(),
  mockUriParse: vi.fn((s: string) => ({ toString: () => s, href: s })),
}));

vi.mock('vscode', () => ({
  window: { showInformationMessage: mockShowInformationMessage },
  env: { openExternal: mockOpenExternal },
  Uri: { parse: mockUriParse },
}));

import { showOnboardingIfNeeded, macFullDiskAccessMessage } from './onboarding.js';

interface FakeContext {
  globalState: {
    get: <T>(k: string) => T | undefined;
    update: ReturnType<typeof vi.fn>;
  };
}

function makeContext(seed: Record<string, unknown> = {}): FakeContext {
  const store = new Map<string, unknown>(Object.entries(seed));
  return {
    globalState: {
      get: <T>(k: string) => store.get(k) as T | undefined,
      update: vi.fn(async (k: string, v: unknown) => {
        store.set(k, v);
      }),
    },
  };
}

describe('showOnboardingIfNeeded', () => {
  beforeEach(() => {
    mockShowInformationMessage.mockReset();
    mockOpenExternal.mockReset();
    mockUriParse.mockClear();
  });

  it('on first launch (no consent stored), shows consent toast and persists Allow', async () => {
    const ctx = makeContext();
    mockShowInformationMessage.mockResolvedValueOnce('Allow');
    await showOnboardingIfNeeded(ctx as never, 'linux');
    expect(mockShowInformationMessage).toHaveBeenCalledOnce();
    expect(ctx.globalState.update).toHaveBeenCalledWith(
      'nexpath.consentGranted',
      true,
    );
  });

  it('persists false when user clicks "Not now"', async () => {
    const ctx = makeContext();
    mockShowInformationMessage.mockResolvedValueOnce('Not now');
    await showOnboardingIfNeeded(ctx as never, 'linux');
    expect(ctx.globalState.update).toHaveBeenCalledWith(
      'nexpath.consentGranted',
      false,
    );
  });

  it('persists false when user dismisses the toast (undefined return)', async () => {
    const ctx = makeContext();
    mockShowInformationMessage.mockResolvedValueOnce(undefined);
    await showOnboardingIfNeeded(ctx as never, 'linux');
    expect(ctx.globalState.update).toHaveBeenCalledWith(
      'nexpath.consentGranted',
      false,
    );
  });

  it('skips the consent toast on subsequent launches when consent is already stored', async () => {
    const ctx = makeContext({ 'nexpath.consentGranted': true });
    await showOnboardingIfNeeded(ctx as never, 'linux');
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });

  it('on macOS first launch, shows the FDA guidance after the consent toast', async () => {
    const ctx = makeContext();
    mockShowInformationMessage
      .mockResolvedValueOnce('Allow')
      .mockResolvedValueOnce('Later');
    await showOnboardingIfNeeded(ctx as never, 'darwin');
    expect(mockShowInformationMessage).toHaveBeenCalledTimes(2);
    expect(ctx.globalState.update).toHaveBeenCalledWith(
      'nexpath.fdaNoticeShown',
      true,
    );
  });

  it('on macOS, "Open System Settings" opens the privacy-pane URL', async () => {
    const ctx = makeContext();
    mockShowInformationMessage
      .mockResolvedValueOnce('Allow')
      .mockResolvedValueOnce('Open System Settings');
    await showOnboardingIfNeeded(ctx as never, 'darwin');
    expect(mockOpenExternal).toHaveBeenCalledOnce();
    const arg = mockOpenExternal.mock.calls[0]![0] as { toString: () => string };
    expect(arg.toString()).toContain('Privacy_AllFiles');
  });

  it('on non-macOS, does NOT show the FDA guidance', async () => {
    const ctx = makeContext();
    mockShowInformationMessage.mockResolvedValueOnce('Allow');
    await showOnboardingIfNeeded(ctx as never, 'win32');
    expect(mockShowInformationMessage).toHaveBeenCalledTimes(1);
    expect(ctx.globalState.update).not.toHaveBeenCalledWith(
      'nexpath.fdaNoticeShown',
      true,
    );
  });

  it('on macOS, does NOT re-show the FDA guidance once it has been shown', async () => {
    const ctx = makeContext({
      'nexpath.consentGranted': true,
      'nexpath.fdaNoticeShown': true,
    });
    await showOnboardingIfNeeded(ctx as never, 'darwin');
    expect(mockShowInformationMessage).not.toHaveBeenCalled();
  });
});

/** ⭐ F-10 (2026-09-05) — the macOS Full Disk Access notice names the REAL host, never a hardcoded "Cursor". */
describe('⭐ F-10 — host-aware macOS Full Disk Access notice', () => {
  beforeEach(() => { mockShowInformationMessage.mockReset(); mockOpenExternal.mockReset(); });

  it('names the live appName in both places and never says Cursor for a Windsurf host', async () => {
    mockShowInformationMessage.mockResolvedValueOnce('Later');
    const ctx = makeContext({ 'nexpath.consentGranted': true });
    await showOnboardingIfNeeded(ctx as never, 'darwin', 'Windsurf');
    const msg = mockShowInformationMessage.mock.calls[0]![0] as string;
    expect(msg).toContain('Windsurf needs Full Disk Access');
    expect(msg).toContain('enable Windsurf.');
    expect(msg).not.toContain('Cursor');
  });

  it('Cursor stays Cursor; a rebranded name is used verbatim; a missing name falls back to "your editor"', () => {
    expect(macFullDiskAccessMessage('Cursor')).toContain('Cursor needs Full Disk Access');
    expect(macFullDiskAccessMessage(' Devin ')).toContain('enable Devin.');
    expect(macFullDiskAccessMessage(undefined)).toContain('your editor needs Full Disk Access');
    expect(macFullDiskAccessMessage('')).toContain('enable your editor.');
  });

  it('the vscode-provided default is used when no name is passed (mock has none ⇒ fallback), and the notice is still one-shot', async () => {
    mockShowInformationMessage.mockResolvedValueOnce('Later');
    const ctx = makeContext({ 'nexpath.consentGranted': true });
    await showOnboardingIfNeeded(ctx as never, 'darwin');
    expect(mockShowInformationMessage.mock.calls[0]![0]).toContain('your editor');
    expect(ctx.globalState.update).toHaveBeenCalledWith('nexpath.fdaNoticeShown', true);
  });
});
