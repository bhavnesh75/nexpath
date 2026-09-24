// @vitest-environment jsdom
/**
 * The bridge between the engine popup flow and the UI developer's dock —
 * tested with the REAL dock, REAL surface controller, and REAL surface view
 * (no mocks of PR #1's code), so these are integration-grade: my producers
 * must satisfy their renderer, their keyboard/click grammar must come back
 * out as my commands, and the PEF-backed-by-signals flow must hold together.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountNexpathPeDock, mpsSurfaceModel, peSurfaceModel, pefSurfaceModel } from './pe-dock-adapter.js';
import { PE_FOOTER } from './surfaces/fixtures/pe.js';
import { NEXPATH_DOCK_HOST_ID } from './surfaces/dock.js';
import type { PePanelControllerV1, PePanelEventV1, PeSequenceOfferViewV1, PePanelViewV1, PeRatingViewV1 } from './pe-contract.js';

let events: PePanelEventV1[];
let adapter: PePanelControllerV1;

const commands = () => events.filter((e) => e.type === 'command').map((e) => (e.type === 'command' ? e.command : null));

function view(overrides: Partial<PePanelViewV1> = {}): PePanelViewV1 {
  return {
    schemaVersion: 1, viewSeq: 1,
    title: 'Nexpath · Prompt enhancement',
    editorHeading: 'Use enhanced prompt',
    bodyText: 'Enhanced body text',
    bodyEditable: true,
    hasAdditionalDetails: true,
    additionalDetailsText: '',
    directional: [
      { actionType: 'shorter', label: 'Shorter', availability: 'available' },
      { actionType: 'more_thorough', label: 'More thorough', availability: 'requires_llm_budget' },
    ],
    refinement: false, hasFeedback: false, trustCues: ['Your original request is kept.'],
    pinchLabel: 'Shipping something?', whyHelp: 'Risky step — confirm first.',
    ...overrides,
  };
}

function offer(overrides: Partial<PeSequenceOfferViewV1> = {}): PeSequenceOfferViewV1 {
  return {
    schemaVersion: 1, kind: 'sequence_offer', viewSeq: 1,
    title: 'Nexpath · Multi-prompt sequence', heading: 'First prompt of your sequence',
    bodyText: 'build the login page first', remainingTaskCount: 2,
    taskSummaryLines: ['add a database', 'deploy'], cancelLabel: 'Use original prompt',
    ...overrides,
  };
}

/** The dock's shadow is closed — reach the surface DOM via the wrapper the
 * controller focuses (document.activeElement pierces to the host; for tests we
 * use the adapter-internal route: the dock host exists in light DOM, and the
 * REAL renderer parks focus inside, so we drive by keyboard + activeElement,
 * plus querying through the mount element captured from mountNexpathDock…
 * simplest honest route: grab the shadow root at attach time. */
let shadowRoots: ShadowRoot[];
let intents: string[];
const realAttachShadow = HTMLElement.prototype.attachShadow;

beforeEach(() => {
  document.body.innerHTML = '';
  shadowRoots = [];
  HTMLElement.prototype.attachShadow = function (init: ShadowRootInit): ShadowRoot {
    const root = realAttachShadow.call(this, init);
    shadowRoots.push(root);
    return root;
  };
  events = [];
  intents = [];
  adapter = mountNexpathPeDock({
    onEvent: (e) => events.push(e),
    onTerminalIntent: (o) => intents.push(o),
  });
});

afterEach(() => {
  adapter.destroy();
  HTMLElement.prototype.attachShadow = realAttachShadow;
});

function surfaceEl(): HTMLElement {
  const root = shadowRoots.at(-1)!;
  return root.querySelector('.np-surface-root') as HTMLElement;
}
function bodyField(): HTMLTextAreaElement {
  return surfaceEl().querySelector('textarea') as HTMLTextAreaElement;
}
function rowByLabel(label: string): HTMLElement {
  const rows = [...surfaceEl().querySelectorAll('.np-row')];
  const hit = rows.find((r) => r.textContent?.includes(label));
  if (!hit) throw new Error(`no row containing "${label}"`);
  return hit as HTMLElement;
}
function pressOn(el: HTMLElement, key: string, init: KeyboardEventInit = {}): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init }));
}

describe('producers (my views → their models)', () => {
  // ── Issue #160 ────────────────────────────────────────────────────────────────────────────
  // The apply hint used to sit in `hints.always`, so an empty details field advertised an action
  // with nothing to act on. It now follows the CONTENT. This adapter exists to mirror the CLI, so
  // the condition is the same one at cli-submit-popup.ts:817 and cli-mps-popup.ts:205/:394 — if
  // those change, this changes with them.
  describe('the Additional Details apply hint follows the content (#160)', () => {
    const HINT = 'Enter applies these details · unapplied details are not sent';
    const detailsRow = (additionalDetailsText: string) => {
      const row = peSurfaceModel(view({ additionalDetailsText }))
        .rows.find((r) => r.kind === 'field' && r.label === 'Additional details');
      if (!row || row.kind !== 'field') throw new Error('no Additional details row');
      return row;
    };

    it('empty field ⇒ the hint is not in `always`', () => {
      expect(detailsRow('').hints?.always ?? []).not.toContain(HINT);
    });

    it('text present ⇒ the hint is back in `always`', () => {
      expect(detailsRow('use postgres').hints?.always ?? []).toContain(HINT);
    });

    // Whitespace is not content — a field holding only spaces has nothing to apply, and showing
    // the hint there would reproduce the reported problem in a narrower form.
    it('whitespace-only counts as empty', () => {
      for (const blank of [' ', '   ', '\n', ' \n ']) {
        expect(detailsRow(blank).hints?.always ?? []).not.toContain(HINT);
      }
    });

    // `whenFocused` answers a different question — those keys only work while the row holds
    // focus — so it must NOT have picked up the content condition.
    it('the edit-keys hint stays focus-keyed and unconditional', () => {
      for (const text of ['', 'use postgres']) {
        expect(detailsRow(text).hints?.whenFocused ?? []).toHaveLength(1);
      }
    });

    // The row itself never disappears — the CLI builds it unconditionally
    // (cli-submit-popup.ts:630-639) and this adapter mirrors that. Only the hint is conditional.
    it('the details row itself still renders when empty', () => {
      expect(detailsRow('').label).toBe('Additional details');
      expect(detailsRow('').text).toBe('');
    });
  });

  it('the PE model is the CLI\'s THREE rows exactly: body, Additional details, Use original prompt', () => {
    const m = peSurfaceModel(view());
    expect(m.id).toBe('prompt_enhancement');
    expect(m.pinch).toBe('Shipping something?');
    expect(m.rows.filter((r) => r.kind === 'field')).toHaveLength(2);
    expect(m.rows.filter((r) => r.kind === 'action')).toHaveLength(1);
    expect(m.rows.some((r) => r.kind === 'action' && r.act === 'use-original')).toBe(true);
  });

  it('the PE footer advertises Alt+Shift+T, and keeps the CLI footer verbatim', () => {
    // The CLI appends its own Ctrl+T hint to the same constant rather than
    // rewriting it — `PE_FOOTER` is the pinned mirror of the CLI's string, so
    // the hint has to ride beside it, not inside it.
    const m = peSurfaceModel(view());
    expect(m.footer.startsWith(PE_FOOTER)).toBe(true);
    expect(m.footer).toContain('Alt+Shift+T settings');
    // Never the CLI's own chord: plain Ctrl+T is the browser's new-tab shortcut
    // and a page cannot intercept it (`ui/panel.js:571`).
    expect(m.footer).not.toContain('Ctrl+T');
  });

  // Owner ruling 2026-08-25 after seeing a REAL CLI popup: the CLI renders no
  // directional rows at all — its own loop is commented out at
  // cli-submit-popup.ts:641-662. Ours rendered them, and a row the engine
  // silently refuses looks like broken software (tester report). Pinned so they
  // cannot reappear.
  it('renders NO directional rows even when the engine offers them (cli-submit-popup.ts:641-662)', () => {
    const m = peSurfaceModel(view());
    const labels = m.rows.map((r) => (r.kind === 'note' ? r.text : r.label));
    expect(labels).not.toContain('Shorter');
    expect(labels).not.toContain('More thorough');
    expect(labels).not.toContain('More project-grounded');
  });

  it('the MPS model carries the first prompt, the plan notes, and the engine cancel label', () => {
    const m = mpsSurfaceModel(offer());
    expect(m.id).toBe('mps_first');
    expect(m.rows.filter((r) => r.kind === 'note').map((r) => (r.kind === 'note' ? r.text : ''))).toEqual([
      'Sequence plan', 'add a database', 'deploy',
    ]);
    expect(m.rows.some((r) => r.kind === 'action' && r.act === 'cancel-sequence' && r.label === 'Use original prompt')).toBe(true);
  });

  it('the PEF model is the CLI\'s three rows — two categories + the free-text Other field (:1112)', () => {
    const m = pefSurfaceModel();
    expect(m.rows).toHaveLength(3);
    expect(m.rows[0]).toMatchObject({ kind: 'action', label: 'Not relevant enough' });
    expect(m.rows[1]).toMatchObject({ kind: 'action', label: 'Too much or too long' });
    expect(m.rows[2]).toMatchObject({ kind: 'field', label: 'Other', placeholder: '(type your feedback)' });
  });
});

describe('PE surface flows (real dock + controller)', () => {
  it('show() renders in the dock; Enter on the body sends use_current with the LIVE text — no fixture notice', () => {
    adapter.show(view());
    expect(document.getElementById(NEXPATH_DOCK_HOST_ID)).toBeTruthy();
    expect(adapter.isOpen()).toBe(true);
    const body = bodyField();
    expect(body.value).toBe('Enhanced body text');
    body.value = 'edited live';
    pressOn(body, 'Enter');
    expect(commands()).toEqual([{ type: 'use_current', bodyText: 'edited live' }]);
    expect(surfaceEl().textContent).not.toContain('static build');
  });

  it('an EMPTY body Enter is the BF-1 silent guard — nothing emitted', () => {
    adapter.show(view());
    const body = bodyField();
    body.value = '   ';
    pressOn(body, 'Enter');
    expect(commands()).toHaveLength(0);
  });

  it('details Enter runs the CLI local merge and reports edit_body with the merged text', () => {
    adapter.show(view());
    (surfaceEl().querySelectorAll('textarea')[1] as HTMLTextAreaElement).focus();
    // The controller re-renders on row-focus change — re-query the LIVE node.
    const details = surfaceEl().querySelectorAll('textarea')[1] as HTMLTextAreaElement;
    details.value = 'keep the retry helper';
    pressOn(details, 'Enter');
    const cmd = commands()[0];
    expect(cmd).toMatchObject({ type: 'edit_body' });
    expect((cmd as { bodyText: string }).bodyText).toContain('Enhanced body text');
    expect((cmd as { bodyText: string }).bodyText).toContain('Additional details to incorporate:');
    expect((cmd as { bodyText: string }).bodyText).toContain('keep the retry helper');
    expect(bodyField().value).toContain('keep the retry helper'); // visible merge
  });

  it('no directional row exists in the rendered dock — the CLI shows none', () => {
    adapter.show(view());
    const text = surfaceEl().textContent ?? '';
    expect(text).not.toContain('Shorter');
    expect(text).not.toContain('More thorough');
    expect(text).not.toContain('More project-grounded');
    expect(text).toContain('Use original prompt'); // the row that DOES exist
  });

  it('Go back renders on refinement views and emits go_back', () => {
    adapter.show(view({ refinement: true }));
    rowByLabel('Go back').click();
    expect(commands()).toEqual([{ type: 'go_back', }]);
  });

  it('setBusy(true) suppresses commands until the next show()', () => {
    adapter.show(view());
    adapter.setBusy(true);
    pressOn(bodyField(), 'Enter');
    expect(commands()).toHaveLength(0);
    adapter.show(view({ viewSeq: 2 }));
    pressOn(bodyField(), 'Enter');
    expect(commands()).toHaveLength(1);
  });
});

describe('PEF-backed-by-signals (owner decision 2026-08-25)', () => {
  it('Esc on PE closes IMMEDIATELY with no PEF — the CLI\'s shipped rule (cli-submit-popup.ts:1469-1471)', () => {
    adapter.show(view());
    pressOn(surfaceEl(), 'Escape');
    expect(commands()).toEqual([{ type: 'close' }]);           // straight out
    expect(surfaceEl().textContent).not.toContain('Not relevant enough'); // never PEF
  });

  it('Use-original → PEF → a category click records the signal THEN completes use_original', () => {
    adapter.show(view());
    rowByLabel('Use original prompt').click();
    expect(surfaceEl().textContent).toContain('Not relevant enough'); // PEF visible
    expect(commands()).toHaveLength(0); // nothing terminal yet
    rowByLabel('Too much or too long').click();
    expect(commands()).toEqual([
      { type: 'feedback_suggested', category: 'too_much_or_too_long' },
      { type: 'use_original' },
    ]);
  });

  // ── RELEASING A HELD PROMPT WITHOUT ENDING THE FEEDBACK STEP ───────────────
  // On the submit path the user's prompt is held until the terminal command
  // arrives, and the hold has no ceiling. Because "Use original" parks its
  // command behind a satisfaction step, an abandoned survey held the prompt
  // forever — reported live as "the flow stucked". These pin the announcement
  // that lets the hold end early WITHOUT changing what the panel emits.
  describe('announcing the decision before the feedback step', () => {
    it('announces use_original the instant the row is clicked — before any command', () => {
      adapter.show(view());
      rowByLabel('Use original prompt').click();
      expect(intents).toEqual(['use_original']);
      expect(commands()).toHaveLength(0);          // command still parked (CLI order)
      expect(adapter.isCollectingFeedback?.()).toBe(true);
    });

    it('the parked command STILL follows the feedback — the announcement replaces nothing', () => {
      adapter.show(view());
      rowByLabel('Use original prompt').click();
      rowByLabel('Too much or too long').click();
      expect(commands()).toEqual([
        { type: 'feedback_suggested', category: 'too_much_or_too_long' },
        { type: 'use_original' },
      ]);
      expect(intents).toEqual(['use_original']);   // announced once, not twice
      expect(adapter.isCollectingFeedback?.()).toBe(false);
    });

    it('is not collecting feedback before a terminal choice, nor after skipping it', () => {
      adapter.show(view());
      expect(adapter.isCollectingFeedback?.()).toBe(false);
      rowByLabel('Use original prompt').click();
      pressOn(surfaceEl(), 'Escape');              // skip
      expect(adapter.isCollectingFeedback?.()).toBe(false);
    });

    it('a fresh view clears the flag — a stale feedback step never guards a new popup', () => {
      adapter.show(view());
      rowByLabel('Use original prompt').click();
      expect(adapter.isCollectingFeedback?.()).toBe(true);
      adapter.show(view({ viewSeq: 2 }));
      expect(adapter.isCollectingFeedback?.()).toBe(false);
    });

    it('NOTHING is announced for the paths that do not park a command', () => {
      // use_current carries the body text, so it must be decided by the popup,
      // not released early; Esc emits close directly with no feedback step.
      adapter.show(view());
      pressOn(surfaceEl(), 'Escape');
      expect(intents).toEqual([]);
      expect(commands()).toEqual([{ type: 'close' }]);
    });

    it('a host that does not supply the hook behaves exactly as before', () => {
      const plain = mountNexpathPeDock({ onEvent: (e) => events.push(e) });
      try {
        plain.show(view());
        // The last-attached shadow root is this adapter's.
        const rows = [...(shadowRoots.at(-1)!.querySelector('.np-surface-root') as HTMLElement)
          .querySelectorAll('.np-row')];
        (rows.find((r) => r.textContent?.includes('Use original prompt')) as HTMLElement).click();
        expect(events.at(-1)).toBeUndefined();   // still parked, nothing thrown
      } finally {
        plain.destroy();
      }
    });
  });

  it('Use-original opens PEF; skip completes with use_original', () => {
    adapter.show(view());
    rowByLabel('Use original prompt').click();
    expect(surfaceEl().textContent).toContain('Too much or too long');
    pressOn(surfaceEl(), 'Escape');
    expect(commands()).toEqual([{ type: 'use_original' }]);
  });
});

describe('MPS offer flows', () => {
  it('Enter on the offer body sends mps_send with the live text', () => {
    adapter.show(offer());
    const body = bodyField();
    body.value = 'edited first prompt';
    pressOn(body, 'Enter');
    expect(commands()).toEqual([{ type: 'mps_send', bodyText: 'edited first prompt' }]);
  });

  it('Esc with no editor focused declines; the cancel row goes through PEF then mps_cancel', () => {
    adapter.show(offer());
    pressOn(surfaceEl(), 'Escape'); // editor focused → blur only
    pressOn(surfaceEl(), 'Escape'); // now declines
    expect(commands()).toEqual([{ type: 'mps_decline' }]);

    events.length = 0;
    adapter.show(offer({ viewSeq: 2 }));
    rowByLabel('Use original prompt').click(); // the engine-labeled cancel row
    expect(surfaceEl().textContent).toContain('Not relevant enough'); // PEF
    rowByLabel('Not relevant enough').click();
    expect(commands()).toEqual([
      { type: 'feedback_suggested', category: 'not_relevant_enough' },
      { type: 'mps_cancel' },
    ]);
  });
});

describe('dock furniture', () => {
  it('the dock ✕ maps to plain close (window dismissal skips PEF) and hides', () => {
    adapter.show(view());
    const root = shadowRoots.find((r) => r.querySelector('[data-nexpath-dock-close], .np-dock-close, button'));
    const closeBtn = [...(root?.querySelectorAll('button') ?? [])]
      .find((b) => b.textContent?.includes('✕') || b.getAttribute('aria-label')?.toLowerCase().includes('close'));
    expect(closeBtn, 'dock close button').toBeTruthy();
    closeBtn!.click();
    expect(commands()).toEqual([{ type: 'close' }]);
    expect(adapter.isOpen()).toBe(false);
  });

  it('hide()/isOpen()/destroy() drive the dock', () => {
    adapter.show(view());
    expect(adapter.isOpen()).toBe(true);
    adapter.hide();
    expect(adapter.isOpen()).toBe(false);
    adapter.destroy();
    expect(document.getElementById(NEXPATH_DOCK_HOST_ID)).toBeNull();
  });
});

describe('chrome styles (live-caught 2026-08-25: unstyled transparent dock)', () => {
  it('show() installs the CLI frame stylesheet into the dock shadow root exactly once', () => {
    adapter.show(view());
    const dockShadow = shadowRoots.find((r) => r.querySelector('.np-surface-root'))!;
    const styleNodes = [...dockShadow.querySelectorAll('style')]
      .filter((s) => s.textContent?.includes('.np-frame'));
    expect(styleNodes.length).toBeGreaterThanOrEqual(1);
    adapter.show(view({ viewSeq: 2 }));
    const after = [...dockShadow.querySelectorAll('style')]
      .filter((s) => s.textContent?.includes('.np-frame'));
    expect(after.length).toBe(styleNodes.length); // once per dock lifetime, not per show
  });
});

describe('REAL prepare → whitelisted view → real dock DOM (plan §7: fixtures from real results, not hand-invented)', () => {
  it('a real keyless engine prepare renders in the dock with its actual body and controls', { timeout: 30_000 }, async () => {
    const { buildBrowserPeRequest, prepareBrowserPe } = await import('../background/pe-prepare.js');
    const { buildPePanelView } = await import('../background/pe-popup-host.js');
    const prep = await prepareBrowserPe(buildBrowserPeRequest({
      projectRoot: 'https://bolt.new/~/real-fixture',
      promptText: 'add a login page with email and password to the app',
      sessionId: 's-real', promptCount: 6,
      currentStage: 'implementation', prevStage: 'implementation',
      triggerKind: 'absence', effectiveFlagType: 'absence:tests_before_merge',
      firedKey: 'absence:tests_before_merge@implementation', triggerConfidence: 0.9,
      classifierState: 'fire_recommended', profile: null, configuredRole: 'founder',
      detectedLanguage: undefined, streamBOutputs: [],
      triggerEligibility: 'fresh_trigger_eligible', recentPromptRefs: [],
    }));
    expect(prep.safeFallback).toBe(false);
    if (prep.safeFallback) return;

    // buildPePanelView needs the engine's render view — build it the way the
    // popup host does, through the engine's own render model.
    const { buildPromptEnhancementPopupRenderModelV1 } = await import('../../prompt-enhancement/popup-render-model.js');
    const rm = buildPromptEnhancementPopupRenderModelV1({
      result: prep.result, timestampMs: 1, deliverySurface: prep.result.delivery.deliveryChannel,
    });
    expect(rm.state).toBe('render_model_ready');
    if (rm.state !== 'render_model_ready') return;
    const view = buildPePanelView(
      { model: rm.model, editedBodyText: rm.model.body.text, additionalDetailsText: '', refinement: false },
      1,
    );

    adapter.show(view);
    // The REAL engine body is in the dock's real DOM, with the locked controls.
    expect(bodyField().value).toBe(rm.model.body.text);
    expect(bodyField().value.length).toBeGreaterThan(100);
    expect(surfaceEl().textContent).toContain('Use original prompt');
    expect(surfaceEl().textContent).not.toContain('static build');
  });
});

describe('the body row\'s section numbers (the producer side)', () => {
  const BODY = ['Add a login page.', '', 'Scope:', 'the login route only.', 'Acceptance:', 'x'].join('\n');
  const SECTIONS = [
    { title: 'Scope', bodyText: 'the login route only.' },
    { title: 'Acceptance', bodyText: 'x' },
  ];
  const bodyRow = (v: PePanelViewV1) => {
    const row = peSurfaceModel(v).rows[0]!;
    if (row.kind !== 'field') throw new Error('body row is not a field');
    return row;
  };

  it('supplies no rule at all when the view carries no sections', () => {
    expect(bodyRow(view({ bodyText: BODY })).lineNumbers).toBeUndefined();
  });

  it('turns the view\'s sections into the CLI\'s own numbering', () => {
    const rule = bodyRow(view({ bodyText: BODY, sections: SECTIONS })).lineNumbers!;
    // Line 2 is `Scope:`, line 4 is `Acceptance:` — numbered in body order.
    expect([...rule(BODY)]).toEqual([[2, 1], [4, 2]]);
  });

  it('answers about the text it is GIVEN, not the text the view was built with', () => {
    const rule = bodyRow(view({ bodyText: BODY, sections: SECTIONS })).lineNumbers!;

    // The panel's own text after edits the worker never saw.
    const edited = BODY.split('\n').filter((l) => l !== 'Scope:').join('\n');
    expect([...rule(edited)]).toEqual([[3, 1]]);
    expect([...rule('nothing here')]).toEqual([]);
    // …and the original answer is unchanged, so the rule holds no state.
    expect([...rule(BODY)]).toEqual([[2, 1], [4, 2]]);
  });

  /**
   * The whole chain in one place: a REAL engine prepare, through the worker's
   * whitelist, through the producer, into the REAL dock DOM.
   *
   * The three links are each proven on their own elsewhere. This is the one that
   * fails if the wiring BETWEEN them is broken — a field renamed on the view, a
   * rule not passed to the row, a row not passed to the renderer — none of which
   * any of the three would notice on its own.
   */
  it('a real engine prepare draws its own section numbers in the real dock', { timeout: 30_000 }, async () => {
    const { buildBrowserPeRequest, prepareBrowserPe } = await import('../background/pe-prepare.js');
    const { buildPePanelView } = await import('../background/pe-popup-host.js');
    const prep = await prepareBrowserPe(buildBrowserPeRequest({
      projectRoot: 'https://bolt.new/~/real-numbers',
      promptText: 'add a login page with email and password to the app',
      sessionId: 's-num', promptCount: 6,
      currentStage: 'implementation', prevStage: 'implementation',
      triggerKind: 'absence', effectiveFlagType: 'absence:tests_before_merge',
      firedKey: 'absence:tests_before_merge@implementation', triggerConfidence: 0.9,
      classifierState: 'fire_recommended', profile: null, configuredRole: 'founder',
      detectedLanguage: undefined, streamBOutputs: [],
      triggerEligibility: 'fresh_trigger_eligible', recentPromptRefs: [],
    }));
    expect(prep.safeFallback).toBe(false);
    if (prep.safeFallback) return;

    const { buildPromptEnhancementPopupRenderModelV1 } = await import('../../prompt-enhancement/popup-render-model.js');
    const rm = buildPromptEnhancementPopupRenderModelV1({
      result: prep.result, timestampMs: 1, deliverySurface: prep.result.delivery.deliveryChannel,
    });
    expect(rm.state).toBe('render_model_ready');
    if (rm.state !== 'render_model_ready') return;

    // The engine's own composed sections, exactly as the popup loop passes them.
    const sections = prep.result.currentBody.sections.map((s) => ({ title: s.title, bodyText: s.bodyText }));
    expect(sections.length).toBeGreaterThan(0);
    const panelView = buildPePanelView(
      { model: rm.model, editedBodyText: rm.model.body.text, additionalDetailsText: '', refinement: false, sections },
      1,
    );
    expect(panelView.sections).toHaveLength(sections.length);

    adapter.show(panelView);
    const field = bodyField();
    // jsdom lays nothing out, so the one measurement the drawing gates on is
    // stubbed; an input event redraws against it. Where each mark LANDS needs a
    // real browser — what this proves is that the chain produces them at all.
    Object.defineProperty(field, 'clientHeight', { value: 400, configurable: true });
    field.dispatchEvent(new Event('input', { bubbles: true }));

    const marks = [...surfaceEl().querySelectorAll('.np-marks span')].map((el) => el.textContent);
    expect(marks).toEqual(sections.map((_, index) => `    #${index + 1}`));

    // And the body the user sees and sends is still the engine's, byte for byte.
    expect(field.value).toBe(rm.model.body.text);
    expect(field.value).not.toContain('#');
  });

  it('puts the numbers on screen and leaves the sent text alone', () => {
    adapter.show(view({ bodyText: BODY, sections: SECTIONS }));
    const field = bodyField();
    expect(field.value).toBe(BODY);
    expect(field.value).not.toContain('#');
    // Enter sends what the field holds — the numbers are not in it.
    field.focus();
    pressOn(field, 'Enter');
    expect(commands()).toEqual([{ type: 'use_current', bodyText: BODY }]);
  });
});

describe('removing a section in the panel (Alt+Shift+R, then a digit)', () => {
  const BODY = [
    'Add a login page.',
    '',
    'Scope:',
    'the login route only.',
    '',
    'Acceptance:',
    'the password is hashed.',
  ].join('\n');
  const SECTIONS = [
    { title: 'Scope', bodyText: 'the login route only.' },
    { title: 'Acceptance', bodyText: 'the password is hashed.' },
  ];
  const chord = (field: HTMLTextAreaElement, digit: string): void => {
    field.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'R', code: 'KeyR', altKey: true, shiftKey: true, bubbles: true, cancelable: true,
    }));
    field.dispatchEvent(new KeyboardEvent('keydown', {
      key: digit, code: `Digit${digit}`, bubbles: true, cancelable: true,
    }));
  };
  /** The CLI's own cut, run directly, as the reference. */
  const cliRemoval = async (text: string, n: number): Promise<string | undefined> => {
    const { removePromptEnhancementSectionV1 } = await import('../../prompt-enhancement/popup-section-removal.js');
    const { buildPromptEnhancementMultilineEditorStateV1 } = await import('../../prompt-enhancement/multiline-editor.js');
    const result = removePromptEnhancementSectionV1(
      buildPromptEnhancementMultilineEditorStateV1({
        identity: { enhancementId: 'e', currentBodyId: 'b', bodyRevision: 1, validationDecisionId: 'v' },
        enhancedBodyText: text, fieldWidth: 72, viewportRows: 6,
      }),
      SECTIONS,
      n,
    );
    return result.outcome === 'removed' ? result.editor.buffers.enhanced_body.text : undefined;
  };

  it('produces the body the CLI produces, byte for byte, and sends it as an edit', async () => {
    adapter.show(view({ bodyText: BODY, sections: SECTIONS }));
    chord(bodyField(), '1');

    const expected = await cliRemoval(BODY, 1);
    expect(expected).toBeDefined();
    expect(bodyField().value).toBe(expected);
    // D2: a removal is an EDIT. It goes out as the engine's own edit_body — no
    // new command type, so nothing on the wire had to change to carry it.
    expect(commands()).toEqual([{ type: 'edit_body', bodyText: expected }]);
  });

  it('renumbers as the CLI does: after one removal the next digit means the next section', async () => {
    adapter.show(view({ bodyText: BODY, sections: SECTIONS }));
    chord(bodyField(), '1');
    const afterFirst = bodyField().value;
    expect(afterFirst).not.toContain('Scope:');

    // No new view has arrived. #1 is now what used to be #2.
    chord(bodyField(), '1');
    expect(bodyField().value).toBe(await cliRemoval(afterFirst, 1));
    expect(bodyField().value).not.toContain('Acceptance:');
  });

  it('refuses what the ENGINE refuses — a number that names nothing', () => {
    adapter.show(view({ bodyText: BODY, sections: SECTIONS }));
    chord(bodyField(), '9');
    expect(bodyField().value).toBe(BODY);
    expect(commands()).toEqual([]);
  });

  it('refuses to empty the prompt — the engine\'s would-blank rule, not a second copy', async () => {
    const onlyOne = 'Scope:\nthe login route only.';
    expect(await cliRemoval(onlyOne, 1), 'the engine itself refuses this cut').toBeUndefined();

    adapter.show(view({ bodyText: onlyOne, sections: [SECTIONS[0]!] }));
    chord(bodyField(), '1');
    expect(bodyField().value).toBe(onlyOne);
    expect(commands()).toEqual([]);
  });

  it('refuses on a locked body, the way the engine refuses every other edit to one', () => {
    adapter.show(view({ bodyText: BODY, sections: SECTIONS, bodyEditable: false }));
    chord(bodyField(), '1');
    expect(bodyField().value).toBe(BODY);
    expect(commands()).toEqual([]);
  });

  it('is absent, not inert, when the view carries no sections', () => {
    adapter.show(view({ bodyText: BODY }));
    chord(bodyField(), '1');
    expect(bodyField().value).toBe(BODY);
    expect(commands()).toEqual([]);
  });

  it('the numbers a reader sees and the digit they type name the same section', () => {
    adapter.show(view({ bodyText: BODY, sections: SECTIONS }));
    const field = bodyField();
    Object.defineProperty(field, 'clientHeight', { value: 400, configurable: true });
    field.dispatchEvent(new Event('input', { bubbles: true }));
    const marks = [...surfaceEl().querySelectorAll('.np-marks span')].map((el) => el.textContent);
    expect(marks).toEqual(['    #1', '    #2']);

    // #1 is drawn beside `Scope:`, so 1 must take `Scope:`.
    chord(bodyField(), '1');
    expect(bodyField().value).not.toContain('Scope:');
    expect(bodyField().value).toContain('Acceptance:');
  });
});

describe('work done while the panel waits for the engine is never thrown away', () => {
  /**
   * The panel goes busy the moment a command leaves it and stays busy until the
   * engine's next view (`content/pe-inject.ts:117`). The overlay stops the
   * mouse, but not the keyboard — so a reader can keep editing in that window,
   * and until this was fixed the arriving view silently reverted everything
   * they did there.
   *
   * Measured before the fix, both of these: the second removal vanished, and so
   * did anything typed. The engine is told about the newer text instead.
   */
  const BODY = [
    'Add a login page.',
    '',
    'Scope:',
    'the login route only.',
    '',
    'Acceptance:',
    'the password is hashed.',
  ].join('\n');
  const SECTIONS = [
    { title: 'Scope', bodyText: 'the login route only.' },
    { title: 'Acceptance', bodyText: 'the password is hashed.' },
  ];
  const chord = (field: HTMLTextAreaElement, digit: string): void => {
    field.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'R', code: 'KeyR', altKey: true, shiftKey: true, bubbles: true, cancelable: true,
    }));
    field.dispatchEvent(new KeyboardEvent('keydown', {
      key: digit, code: `Digit${digit}`, bubbles: true, cancelable: true,
    }));
  };
  const typeInto = (field: HTMLTextAreaElement, text: string): void => {
    field.value = text;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  };

  it('a second removal inside the window survives, and the engine is told', () => {
    adapter.show(view({ bodyText: BODY, sections: SECTIONS }));
    chord(bodyField(), '1');
    const afterFirst = bodyField().value;

    adapter.setBusy(true);               // what pe-inject does with that edit
    chord(bodyField(), '1');             // …and the reader removes another
    const afterSecond = bodyField().value;
    expect(afterSecond).not.toBe(afterFirst);

    // The engine answers the FIRST edit — all it has heard about.
    adapter.show(view({ viewSeq: 2, bodyText: afterFirst, sections: SECTIONS }));

    expect(bodyField().value, 'the second removal must still be gone').toBe(afterSecond);
    expect(commands()).toEqual([
      { type: 'edit_body', bodyText: afterFirst },
      { type: 'edit_body', bodyText: afterSecond },
    ]);
  });

  it('text typed inside the window survives, and the engine is told', () => {
    adapter.show(view({ bodyText: BODY, sections: SECTIONS }));
    chord(bodyField(), '1');
    const afterFirst = bodyField().value;

    adapter.setBusy(true);
    const typed = `${afterFirst}\n\nAlso: rate-limit the login route.`;
    typeInto(bodyField(), typed);

    adapter.show(view({ viewSeq: 2, bodyText: afterFirst, sections: SECTIONS }));

    expect(bodyField().value).toBe(typed);
    expect(commands()[commands().length - 1]).toEqual({ type: 'edit_body', bodyText: typed });
  });

  it('does not carry the edit of one popup run into the next', () => {
    adapter.show(view({ bodyText: BODY, sections: SECTIONS }));
    chord(bodyField(), '1');
    const afterFirst = bodyField().value;

    adapter.setBusy(true);
    typeInto(bodyField(), `${afterFirst}
left over from the last run`);
    adapter.hide();                       // the run ends; the field survives it

    // A NEW run whose body happens to equal the previous run's last edit. It is
    // not an echo of anything — nothing was sent in this run — so it stands.
    adapter.show(view({ viewSeq: 1, bodyText: afterFirst, sections: SECTIONS }));
    expect(bodyField().value).toBe(afterFirst);
  });

  it('REAL news still wins — a body the engine changed is not overwritten by stale local text', () => {
    adapter.show(view({ bodyText: BODY, sections: SECTIONS }));
    chord(bodyField(), '1');
    const afterFirst = bodyField().value;

    adapter.setBusy(true);
    typeInto(bodyField(), `${afterFirst}\nlocal scribble`);

    // Not an echo of our edit: the engine recomposed the prompt (a refinement,
    // a go-back, a fallback). Its body is the news and must stand.
    const recomposed = 'A completely different, recomposed prompt.';
    adapter.show(view({ viewSeq: 2, bodyText: recomposed, sections: SECTIONS }));

    expect(bodyField().value).toBe(recomposed);
    expect(commands().some((c) => c?.type === 'edit_body' && c.bodyText.includes('scribble'))).toBe(false);
  });

  it('settles: once the engine agrees, nothing more is sent', () => {
    adapter.show(view({ bodyText: BODY, sections: SECTIONS }));
    chord(bodyField(), '1');
    const afterFirst = bodyField().value;

    adapter.setBusy(true);
    chord(bodyField(), '1');
    const afterSecond = bodyField().value;
    adapter.show(view({ viewSeq: 2, bodyText: afterFirst, sections: SECTIONS }));
    const sent = commands().length;

    // The engine now echoes the second edit too. The panel and the engine hold
    // the same text, so there is nothing left to say — no re-send loop.
    adapter.show(view({ viewSeq: 3, bodyText: afterSecond, sections: SECTIONS }));
    expect(bodyField().value).toBe(afterSecond);
    expect(commands()).toHaveLength(sent);
  });
});

describe('read-only fallback bodies (live 2026-08-25: typed edits silently dropped)', () => {
  it('bodyEditable:false renders BOTH fields natively read-only — the field never promises an edit the send path will discard', () => {
    adapter.show(view({ bodyEditable: false }));
    const fields = [...surfaceEl().querySelectorAll('textarea')] as HTMLTextAreaElement[];
    expect(fields).toHaveLength(2); // body + details
    expect(fields.every((f) => f.readOnly)).toBe(true);
  });

  it('Enter on a read-only body still sends the engine\'s own text (the CLI keeps use_current on locked bodies)', () => {
    adapter.show(view({ bodyEditable: false }));
    const field = bodyField();
    field.focus();
    pressOn(field, 'Enter');
    expect(commands()).toEqual([{ type: 'use_current', bodyText: 'Enhanced body text' }]);
  });

  it('bodyEditable:true stays fully editable (regression)', () => {
    adapter.show(view());
    const fields = [...surfaceEl().querySelectorAll('textarea')] as HTMLTextAreaElement[];
    expect(fields.some((f) => f.readOnly)).toBe(false);
  });
});

describe('open focus + stale docks (live 2026-08-25: keys dead until a manual click)', () => {
  it('show() makes the dock visible BEFORE the surface renders, so the first focus() really lands', () => {
    adapter.show(view());
    const host = document.getElementById(NEXPATH_DOCK_HOST_ID) as HTMLElement;
    expect(host.style.display).not.toBe('none');
    // Focus inside the shadow retargets: the document sees the HOST as active.
    // Before the ordering fix the host was display:none during render() and
    // focus stayed wherever the page had it (jsdom: body).
    expect(document.activeElement).toBe(host);
    const root = shadowRoots.at(-1)!;
    expect(root.activeElement).toBe(bodyField()); // and the body field holds the keyboard
  });

  it('sweeps dock hosts left by an orphaned content-script generation before mounting its own', () => {
    adapter.destroy();
    const orphan = document.createElement('div');
    orphan.id = NEXPATH_DOCK_HOST_ID;
    document.body.appendChild(orphan);
    adapter = mountNexpathPeDock({ onEvent: (e) => events.push(e) });
    adapter.show(view());
    expect(orphan.isConnected).toBe(false); // the stale twin is gone
    expect(document.querySelectorAll(`#${NEXPATH_DOCK_HOST_ID}`)).toHaveLength(1);
  });
});

describe('apply echo keeps the CLI\'s scrolled-to-the-merge position (live 2026-08-25)', () => {
  it('the show() following a details apply follows the body caret once; other shows never do', async () => {
    const { fieldScroller } = await import('./surfaces/surface-view.js');
    const follow = vi.spyOn(fieldScroller, 'follow').mockImplementation(() => {});
    try {
      adapter.show(view());
      expect(follow).not.toHaveBeenCalled(); // opening never follows (CLI opens at the top)

      // Type details and apply — the controller merges locally and follows its
      // own render; the adapter arms the one-shot for the engine's echo.
      (surfaceEl().querySelectorAll('textarea')[1] as HTMLTextAreaElement).focus();
      // The controller re-renders on row-focus change — re-query the LIVE node.
      const freshDetails = surfaceEl().querySelectorAll('textarea')[1] as HTMLTextAreaElement;
      freshDetails.value = 'echo follow details';
      pressOn(freshDetails, 'Enter');
      expect(commands().some((c) => c?.type === 'edit_body')).toBe(true);
      follow.mockClear();

      adapter.show(view({ viewSeq: 2, bodyText: 'echoed merged body' })); // the engine's echo
      expect(follow).toHaveBeenCalledTimes(1); // one-shot follow on the rebuilt body

      follow.mockClear();
      adapter.show(view({ viewSeq: 3 }));      // any later render
      expect(follow).not.toHaveBeenCalled();   // the shot is spent
    } finally {
      follow.mockRestore();
    }
  });
});

describe('CLI row grammar — full-read parity (2026-08-25 line-by-line audit)', () => {
  it('an unavailable details control still RENDERS its row, marked and read-only (cli-submit-popup.ts:630-639,:777)', () => {
    adapter.show(view({ hasAdditionalDetails: false, detailsAvailable: false }));
    const details = [...surfaceEl().querySelectorAll('textarea')][1] as HTMLTextAreaElement;
    expect(details).toBeTruthy();                       // never hidden
    expect(details.readOnly).toBe(true);                // typing impossible
    expect(surfaceEl().textContent).toContain('Additional details  (unavailable)');
  });

  it('a locked body marks the heading row "(unavailable)" — the CLI\'s lock indicator (:610,:777)', () => {
    adapter.show(view({ bodyEditable: false }));
    expect(surfaceEl().textContent).toContain('Use enhanced prompt  (unavailable)');
  });

  it('an unavailable Use-original row carries the marker (:672,:777)', () => {
    adapter.show(view({ originalAvailable: false }));
    expect(surfaceEl().textContent).toContain('Use original prompt  (unavailable)');
  });

  it('the refinement view shows ONLY the body and "← Go back" (:614-628)', () => {
    const m = peSurfaceModel(view({ refinement: true }));
    expect(m.rows).toHaveLength(2);
    expect(m.rows[0]!.kind).toBe('field');
    expect(m.rows[1]).toMatchObject({ kind: 'action', label: '← Go back', blankBefore: true });
  });

  it('the CLI blank-line rule: blank before details and Go back, NOT before Use original (:769-775)', () => {
    const m = peSurfaceModel(view());
    const details = m.rows.find((r) => r.kind === 'field' && r.label === 'Additional details');
    const useOriginal = m.rows.find((r) => r.kind === 'action' && r.act === 'use-original');
    expect(details && 'blankBefore' in details && details.blankBefore).toBe(true);
    expect(useOriginal && (useOriginal as { blankBefore?: boolean }).blankBefore).toBeUndefined();
  });
});

describe('PEF free-text Other — PE-BR-11 closed (CLI cli-submit-popup.ts:1112,:1164-1166)', () => {
  function openPefViaUseOriginal(): void {
    adapter.show(view());
    rowByLabel('Use original prompt').click();
  }
  function otherField(): HTMLTextAreaElement {
    return surfaceEl().querySelector('textarea') as HTMLTextAreaElement; // PEF's only field
  }

  it('typing into Other and Enter emits feedback_other then the remembered terminal', () => {
    openPefViaUseOriginal();
    otherField().focus();
    const field = otherField(); // re-query after the focus re-render
    field.value = '  needs project names  ';
    pressOn(field, 'Enter');
    expect(commands()).toEqual([
      { type: 'feedback_other', text: 'needs project names' }, // trimmed, CLI :1164
      { type: 'use_original' },
    ]);
  });

  it('empty Other is the CLI silent pending — nothing emitted, PEF stays', () => {
    openPefViaUseOriginal();
    otherField().focus();
    pressOn(otherField(), 'Enter');
    expect(commands()).toHaveLength(0);
    expect(surfaceEl().textContent).toContain('Not relevant enough'); // still PEF
  });

  it('over the 5,000-char cap is silently refused (:1165)', () => {
    openPefViaUseOriginal();
    otherField().focus();
    const field = otherField();
    field.value = 'x'.repeat(5_001);
    pressOn(field, 'Enter');
    expect(commands()).toHaveLength(0);
  });
});

describe('same-body echo preserves the interaction state (CLI :1444-1453)', () => {
  it('keeps row focus and the typed details draft across a rebuild with the same body', () => {
    adapter.show(view());
    ([...surfaceEl().querySelectorAll('textarea')][1] as HTMLTextAreaElement).focus();
    const details = [...surfaceEl().querySelectorAll('textarea')][1] as HTMLTextAreaElement;
    details.value = 'half-typed draft';

    adapter.show(view({ viewSeq: 2, publicNotice: 'a notice' })); // same bodyText echo

    const rebuiltDetails = [...surfaceEl().querySelectorAll('textarea')][1] as HTMLTextAreaElement;
    expect(rebuiltDetails.value).toBe('half-typed draft');           // draft survives
    const root = shadowRoots.at(-1)!;
    expect(root.activeElement).toBe(rebuiltDetails);                 // focus survives
  });

  it('a CHANGED body rebuilds fresh — the CLI resets on a new bodyRevision', () => {
    adapter.show(view());
    ([...surfaceEl().querySelectorAll('textarea')][1] as HTMLTextAreaElement).focus();
    adapter.show(view({ viewSeq: 2, bodyText: 'a different body' }));
    const root = shadowRoots.at(-1)!;
    expect(root.activeElement).toBe(bodyField()); // back to the body row
  });
});

describe('unapplied details are NOT sent (the CLI\'s shipped send semantics)', () => {
  // The plan text said "dirty details disable Use-enhanced"; the SHIPPED CLI
  // reducer does neither disable nor merge — Enter on the body sends the body
  // and typed-but-unapplied details are dropped, with the always-visible hint
  // carrying the warning (cli-submit-popup.ts:1018-1029 + :512). Pin ours to
  // the shipped behaviour, not the plan sentence.
  it('Enter on the body sends the body only; typed-but-unapplied details are excluded', () => {
    adapter.show(view());
    const details = surfaceEl().querySelectorAll('textarea')[1] as HTMLTextAreaElement;
    details.value = 'TYPED BUT NEVER APPLIED';
    const body = bodyField();
    body.focus();
    pressOn(body, 'Enter');
    const cmd = commands()[0] as { type: string; bodyText: string };
    expect(cmd).toMatchObject({ type: 'use_current' });
    expect(cmd.bodyText).toBe('Enhanced body text');
    expect(cmd.bodyText).not.toContain('TYPED BUT NEVER APPLIED');
  });
});

describe('locked bodies explain themselves (tester read a silent read-only popup as broken)', () => {
  it('a locked body shows an always-visible read-only line naming what Enter will do', () => {
    adapter.show(view({ bodyEditable: false }));
    const text = surfaceEl().textContent ?? '';
    expect(text).toContain('Read-only');
    expect(text).toContain('Enter sends this prompt as shown');
  });

  it('an editable body shows the normal edit-keys hint instead, and never the read-only line', () => {
    adapter.show(view());
    const body = bodyField();
    body.focus();
    const text = surfaceEl().textContent ?? '';
    expect(text).not.toContain('Read-only');
  });
});

// ── the advisory rating surface (Phase 4) ────────────────────────────────────

function ratingView(overrides: Partial<PeRatingViewV1> = {}): PeRatingViewV1 {
  return { schemaVersion: 1, kind: 'rating', viewSeq: 1, ...overrides };
}

describe('advisory rating (real dock + controller)', () => {
  it('show() renders the note and exactly the four scores, worst to best', () => {
    adapter.show(ratingView());

    expect(document.getElementById(NEXPATH_DOCK_HOST_ID)).toBeTruthy();
    const text = surfaceEl().textContent ?? '';
    expect(text).toContain("How's nexpath working out for you?");
    expect(text).toContain('no prompt text');                 // the transparency note
    for (const label of ['Bad', 'Fine', 'Good', 'Excellent']) expect(text).toContain(label);
    expect(surfaceEl().querySelector('textarea')).toBeNull(); // never a text box
  });

  it('⭐ clicking Good sends {type:"rating", rating:3}', () => {
    adapter.show(ratingView());

    rowByLabel('Good').click();

    expect(commands()).toEqual([{ type: 'rating', rating: 3 }]);
  });

  it.each([['Bad', 1], ['Fine', 2], ['Good', 3], ['Excellent', 4]] as const)(
    'Enter on %s sends rating %i',
    (label, rating) => {
      adapter.show(ratingView());
      rowByLabel(label).click();
      expect(commands()).toEqual([{ type: 'rating', rating }]);
    },
  );

  it('⭐ Escape skips — one `close`, and no rating', () => {
    adapter.show(ratingView());

    pressOn(surfaceEl(), 'Escape');

    expect(commands()).toEqual([{ type: 'close' }]);
  });

  it('the command echoes the view it came from', () => {
    adapter.show(ratingView({ viewSeq: 7 }));

    rowByLabel('Excellent').click();

    expect(events).toEqual([{ type: 'command', viewSeq: 7, command: { type: 'rating', rating: 4 } }]);
  });

  it('⭐ the dock ✕ on a rating sends `close`, NOT `mps_decline`', () => {
    // The rating view carries a `kind`, and the ✕ handler used to branch on
    // `'kind' in view` — which would have sent a SEQUENCE DECLINE for a rating.
    // Both commands typecheck, so nothing but this test catches it. The comment
    // on that handler explains what a wrong close costs: one wedged mailbox and
    // no popups again for that project until the worker restarts.
    adapter.show(ratingView());
    const root = shadowRoots.find((r) => r.querySelector('button'));
    const closeBtn = [...(root?.querySelectorAll('button') ?? [])]
      .find((b) => b.textContent?.includes('✕') || b.getAttribute('aria-label')?.toLowerCase().includes('close'));

    closeBtn!.click();

    expect(commands()).toEqual([{ type: 'close' }]);
  });

  it('the rating registry holds ONE surface — no feedback form to fall into', () => {
    adapter.show(ratingView());

    pressOn(surfaceEl(), 'Escape');

    // PEF's rows must never appear: a rating has nowhere to transition to.
    expect(surfaceEl().textContent ?? '').not.toContain('Not relevant enough');
  });

  it('a PE view after a rating still behaves like PE — the third branch changed nothing', () => {
    adapter.show(ratingView());
    adapter.show(view());

    pressOn(surfaceEl(), 'Escape');

    expect(commands()).toEqual([{ type: 'close' }]);
    expect(bodyField()).toBeTruthy();          // the PE body is back
  });
});
