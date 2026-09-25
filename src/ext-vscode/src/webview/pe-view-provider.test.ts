import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import {
  NexpathPromptEnhancementViewProvider,
  PE_VIEW_ID,
} from './pe-view-provider.js';
import type { PromptEnhancementExtensionPayloadV1 } from '../pe-payload.js';

interface FakeWebview {
  options: unknown;
  html: string;
  cspSource: string;
  onDidReceiveMessage: ReturnType<typeof vi.fn>;
  __messageListener: ((m: unknown) => void) | undefined;
}

interface FakeWebviewView {
  webview: FakeWebview;
  show: ReturnType<typeof vi.fn>;
  onDidDispose: ReturnType<typeof vi.fn>;
  __disposeListener: (() => void) | undefined;
}

function makeFakeView(): FakeWebviewView {
  const view: FakeWebviewView = {
    webview: {
      options: undefined,
      html: '',
      cspSource: 'vscode-resource:csp-source',
      onDidReceiveMessage: vi.fn((fn: (m: unknown) => void) => {
        view.webview.__messageListener = fn;
        return { dispose: vi.fn() };
      }),
      __messageListener: undefined,
    },
    show: vi.fn(),
    onDidDispose: vi.fn((fn: () => void) => {
      view.__disposeListener = fn;
      return { dispose: vi.fn() };
    }),
    __disposeListener: undefined,
  };
  return view;
}

const fakeUri = { fsPath: '/fake/extension' } as unknown as never;

const payload: PromptEnhancementExtensionPayloadV1 = {
  transportVersion: 1,
  enhancementId: 'enh-1',
  validationDecisionId: 'vd-1',
  currentBodyId: 'body-1',
  bodyRevision: 1,
  currentBodyText: 'the enhanced prompt body',
  sendPolicy: 'send_current',
  renderState: 'ready',
  additionalDetailsAvailable: false,
  directionalActions: [],
  closeActionId: 'a-close',
};

describe('NexpathPromptEnhancementViewProvider — static fields', () => {
  it('exposes a distinct view id from the DS view', () => {
    expect(PE_VIEW_ID).toBe('nexpath.promptEnhancement');
  });
});

describe('NexpathPromptEnhancementViewProvider.resolveWebviewView', () => {
  it('renders the no-popup state initially (no payload published yet)', () => {
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri);
    const view = makeFakeView();
    provider.resolveWebviewView(view as never, {} as never, {} as never);
    expect(view.webview.html).toContain('No prompt enhancement is pending');
    expect(view.webview.options).toEqual({
      enableScripts: true,
      localResourceRoots: [fakeUri],
    });
  });

  it('renders a previously-published payload if resolveWebviewView fires after publishPayload', () => {
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri);
    provider.publishPayload(payload);
    const view = makeFakeView();
    provider.resolveWebviewView(view as never, {} as never, {} as never);
    expect(view.webview.html).toContain('the enhanced prompt body');
  });

  it('clears the stored view reference on dispose', () => {
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri);
    const view = makeFakeView();
    provider.resolveWebviewView(view as never, {} as never, {} as never);
    view.__disposeListener?.();
    // publishPayload after dispose must not throw even though `view` is gone
    expect(() => provider.publishPayload(payload)).not.toThrow();
  });
});

describe('NexpathPromptEnhancementViewProvider.publishPayload', () => {
  it('updates the html and reveals the view when resolved', () => {
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri);
    const view = makeFakeView();
    provider.resolveWebviewView(view as never, {} as never, {} as never);
    provider.publishPayload(payload);
    expect(view.webview.html).toContain('the enhanced prompt body');
    expect(view.show).toHaveBeenCalledWith(true);
  });

  it('stores the payload even when the view is not yet resolved', () => {
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri);
    provider.publishPayload(payload);
    expect(provider.getCurrentPayload()).toEqual(payload);
  });
});

describe('NexpathPromptEnhancementViewProvider.clearPayload', () => {
  it('resets to the no-popup state', () => {
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri);
    const view = makeFakeView();
    provider.resolveWebviewView(view as never, {} as never, {} as never);
    provider.publishPayload(payload);
    provider.clearPayload();
    expect(view.webview.html).toContain('No prompt enhancement is pending');
    expect(provider.getCurrentPayload()).toBeNull();
  });

  it('is a no-op when the view is not resolved', () => {
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri);
    expect(() => provider.clearPayload()).not.toThrow();
    expect(provider.getCurrentPayload()).toBeNull();
  });
});

describe('NexpathPromptEnhancementViewProvider.handleMessage', () => {
  it('forwards a well-formed message to onMessage', async () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri, onMessage);
    await provider.handleMessage({ type: 'pe_deliver_current_body', bodyId: 'b' });
    expect(onMessage).toHaveBeenCalledWith({ type: 'pe_deliver_current_body', bodyId: 'b' });
  });

  it('drops non-object messages without calling onMessage', async () => {
    const onMessage = vi.fn();
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri, onMessage);
    await provider.handleMessage('not an object');
    await provider.handleMessage(null);
    await provider.handleMessage(42);
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('drops messages with a non-string type without calling onMessage', async () => {
    const onMessage = vi.fn();
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri, onMessage);
    await provider.handleMessage({ type: 123 });
    await provider.handleMessage({});
    expect(onMessage).not.toHaveBeenCalled();
  });

  it('catches and logs when onMessage throws, never propagates', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onMessage = vi.fn().mockRejectedValue(new Error('routing blew up'));
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri, onMessage);
    await expect(provider.handleMessage({ type: 'pe_close' })).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith('[nexpath] PE onMessage failed:', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('defaults to a no-op handler when none is injected (P5 ships before P6 wires real routing)', async () => {
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri);
    await expect(provider.handleMessage({ type: 'pe_deliver_current_body' })).resolves.toBeUndefined();
  });

  it('routes messages received via the real onDidReceiveMessage wiring', () => {
    const onMessage = vi.fn().mockResolvedValue(undefined);
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri, onMessage);
    const view = makeFakeView();
    provider.resolveWebviewView(view as never, {} as never, {} as never);
    view.webview.__messageListener?.({ type: 'pe_close' });
    expect(onMessage).toHaveBeenCalledWith({ type: 'pe_close' });
  });
});

/**
 * The gate on the per-section remove control.
 *
 * ⛔ This is the assertion the whole "no dead control" promise rests on, and it was
 * missing until a mutation that removed the gate entirely passed every other test.
 * A control is only offered when routing was injected, because the default handler
 * is inert and a click into it would go nowhere — telling the reader a part can be
 * removed and then not removing it.
 */
describe('the remove control is offered only when someone is listening', () => {
  const payload = {
    renderState: 'ready' as const,
    currentBodyId: 'body-1',
    bodyRevision: 1,
    currentBodyText: 'Scope:\nthe login route only.',
    directionalActions: [],
    additionalDetailsAvailable: false,
    sections: [{ number: 1, title: 'Scope' }],
  } as unknown as PromptEnhancementExtensionPayloadV1;

  it('offers NO control with the default inert handler', () => {
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri);
    const view = makeFakeView();
    provider.resolveWebviewView(view as never, {} as never, {} as never);
    provider.publishPayload(payload);
    expect(view.webview.html).toContain('pe-section-number');   // the numbers are there
    expect(view.webview.html).not.toContain('pe-section-remove'); // the control is not
    expect(view.webview.html).not.toContain('pe_remove_section');
  });

  /**
   * 🔑 THE LESSON, PINNED. The first version of this gate took an injected handler
   * as proof that a click had somewhere to go. It is not: a handler can be wired and
   * still drop the message. This extension's own handler routes four message types
   * and drops the rest, so under that gate the control rendered and did nothing.
   */
  it('offers NO control for an injected handler alone — a handler can still drop the message', () => {
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri, vi.fn());
    const view = makeFakeView();
    provider.resolveWebviewView(view as never, {} as never, {} as never);
    provider.publishPayload(payload);
    expect(view.webview.html).not.toContain('pe-section-remove');
    expect(view.webview.html).not.toContain('pe_remove_section');
  });

  it('offers the control when the caller declares it can act on the message', () => {
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri, vi.fn(), { sectionRemoval: true });
    const view = makeFakeView();
    provider.resolveWebviewView(view as never, {} as never, {} as never);
    provider.publishPayload(payload);
    expect(view.webview.html).toContain('pe-section-remove');
    expect(view.webview.html).toContain('pe_remove_section');
  });

  it('offers none when the caller declares it cannot', () => {
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri, vi.fn(), { sectionRemoval: false });
    const view = makeFakeView();
    provider.resolveWebviewView(view as never, {} as never, {} as never);
    provider.publishPayload(payload);
    expect(view.webview.html).not.toContain('pe-section-remove');
  });

  it('and the same is true of the first render, before any publish', () => {
    const off = new NexpathPromptEnhancementViewProvider(fakeUri, vi.fn());
    const on = new NexpathPromptEnhancementViewProvider(fakeUri, vi.fn(), { sectionRemoval: true });
    const a = makeFakeView(); const b = makeFakeView();
    off.publishPayload(payload); on.publishPayload(payload);
    off.resolveWebviewView(a as never, {} as never, {} as never);
    on.resolveWebviewView(b as never, {} as never, {} as never);
    expect(a.webview.html).not.toContain('pe-section-remove');
    expect(b.webview.html).toContain('pe-section-remove');
  });

  it('routes a removal message to the injected handler, unchanged', async () => {
    const onMessage = vi.fn();
    const provider = new NexpathPromptEnhancementViewProvider(fakeUri, onMessage);
    const view = makeFakeView();
    provider.resolveWebviewView(view as never, {} as never, {} as never);
    const msg = { type: 'pe_remove_section', sectionNumber: 2, bodyId: 'body-1', bodyRevision: 1, hasDirtyBodyEdit: false };
    await provider.handleMessage(msg);
    expect(onMessage).toHaveBeenCalledWith(msg);
  });
});
