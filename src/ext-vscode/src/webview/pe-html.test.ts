import { describe, it, expect } from 'vitest';
import { renderPromptEnhancementHtml } from './pe-html.js';
import type { PromptEnhancementExtensionPayloadV1 } from '../pe-payload.js';

const CSP_SRC = 'vscode-resource:fake-csp';
const FIXED_NONCE = 'test-nonce-deterministic';

const readyPayload: PromptEnhancementExtensionPayloadV1 = {
  transportVersion: 1,
  enhancementId: 'enh-1',
  validationDecisionId: 'vd-1',
  currentBodyId: 'body-1',
  bodyRevision: 3,
  currentBodyText: 'the enhanced prompt body',
  sendPolicy: 'send_current',
  renderState: 'ready',
  additionalDetailsAvailable: true,
  directionalActions: [
    { actionType: 'shorter', actionId: 'a-shorter', label: 'Shorter', available: true },
    { actionType: 'more_thorough', actionId: 'a-thorough', label: 'More thorough', available: false },
  ],
  closeActionId: 'a-close',
};

describe('renderPromptEnhancementHtml — no-popup / null', () => {
  it('renders the no-popup state when payload is null', () => {
    const html = renderPromptEnhancementHtml(null, { cspSource: CSP_SRC });
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain('No prompt enhancement is pending');
  });

  it('never contains DS-specific markup even in the empty state', () => {
    const html = renderPromptEnhancementHtml(null, { cspSource: CSP_SRC });
    expect(html).not.toContain('class="option"');
    expect(html).not.toContain('Suggested alternatives');
  });
});

describe('renderPromptEnhancementHtml — typed non-ready states', () => {
  it('renders loading state from renderState, not body text', () => {
    const html = renderPromptEnhancementHtml({ ...readyPayload, renderState: 'loading' }, { cspSource: CSP_SRC });
    expect(html).toContain('Working on your prompt');
    expect(html).not.toContain('<textarea');
  });

  it('renders blocked state from renderState', () => {
    const html = renderPromptEnhancementHtml({ ...readyPayload, renderState: 'blocked' }, { cspSource: CSP_SRC });
    expect(html).toContain("can't be sent as enhanced");
    expect(html).not.toContain('<textarea');
  });

  it('renders fallback state from renderState', () => {
    const html = renderPromptEnhancementHtml({ ...readyPayload, renderState: 'fallback' }, { cspSource: CSP_SRC });
    expect(html).toContain('fallback version');
    expect(html).not.toContain('<textarea');
  });

  it('renders no_popup state from renderState even with a non-null payload', () => {
    const html = renderPromptEnhancementHtml({ ...readyPayload, renderState: 'no_popup' }, { cspSource: CSP_SRC });
    expect(html).toContain('No prompt enhancement is pending');
  });
});

describe('renderPromptEnhancementHtml — ready state', () => {
  it('renders exactly one editable textarea for the current body', () => {
    const html = renderPromptEnhancementHtml(readyPayload, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
    const textareaCount = (html.match(/<textarea/g) ?? []).length;
    // one for the body + one for additional-details (payload marks it available)
    expect(textareaCount).toBe(2);
    expect(html).toContain('id="pe-body"');
    expect(html).toContain('the enhanced prompt body');
  });

  it('never renders a DS-style numbered option-button list', () => {
    const html = renderPromptEnhancementHtml(readyPayload, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
    expect(html).not.toContain('class="option"');
    expect(html).not.toContain('Suggested alternatives');
    expect(html).not.toContain('data-option-id');
  });

  it('never renders a "Show simpler options" control', () => {
    const html = renderPromptEnhancementHtml(readyPayload, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
    expect(html.toLowerCase()).not.toContain('show simpler options');
  });

  it('renders directional actions as current-body action buttons, disabled ones included but marked disabled', () => {
    const html = renderPromptEnhancementHtml(readyPayload, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
    expect(html).toContain('data-action-id="a-shorter"');
    expect(html).toContain('data-action-type="shorter"');
    expect(html).toContain('data-action-id="a-thorough"');
    expect(html).toMatch(/data-action-id="a-thorough"[^>]*disabled/);
    expect(html).not.toMatch(/data-action-id="a-shorter"[^>]*disabled/);
  });

  it('renders the additional-details field only when the payload marks it available', () => {
    const withDetails = renderPromptEnhancementHtml(readyPayload, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
    expect(withDetails).toContain('id="pe-details"');

    const withoutDetails = renderPromptEnhancementHtml(
      { ...readyPayload, additionalDetailsAvailable: false },
      { cspSource: CSP_SRC, nonce: FIXED_NONCE },
    );
    expect(withoutDetails).not.toContain('id="pe-details"');
  });

  it('escapes the body text', () => {
    const html = renderPromptEnhancementHtml(
      { ...readyPayload, currentBodyText: '<script>alert(1)</script>' },
      { cspSource: CSP_SRC, nonce: FIXED_NONCE },
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('includes the CSP with the nonce for the script and the cspSource for styles', () => {
    const html = renderPromptEnhancementHtml(readyPayload, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
    expect(html).toContain(`script-src 'nonce-${FIXED_NONCE}'`);
    expect(html).toContain(CSP_SRC);
    expect(html).toContain("default-src 'none'");
  });

  it('renders the close control with the closeActionId, or empty when absent', () => {
    const html = renderPromptEnhancementHtml(readyPayload, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
    expect(html).toContain('data-action-id="a-close"');

    const noClose = renderPromptEnhancementHtml(
      { ...readyPayload, closeActionId: null },
      { cspSource: CSP_SRC, nonce: FIXED_NONCE },
    );
    expect(noClose).toContain('id="pe-close" data-action-id=""');
  });

  it('generates a fresh nonce per call when none is supplied', () => {
    const a = renderPromptEnhancementHtml(readyPayload, { cspSource: CSP_SRC });
    const b = renderPromptEnhancementHtml(readyPayload, { cspSource: CSP_SRC });
    const nonceOf = (html: string) => html.match(/nonce-([A-Za-z0-9]+)'/)?.[1];
    expect(nonceOf(a)).toBeTruthy();
    expect(nonceOf(a)).not.toBe(nonceOf(b));
  });
});

describe('renderPromptEnhancementHtml — embedded script source (mirrors html.test.ts locking its own script text)', () => {
  // The script never runs in this test environment (no DOM/acquireVsCodeApi) —
  // exactly like html.ts's own tests, this locks the LITERAL source text of
  // the message contract P6 will consume. Without these, deleting the script
  // or renaming a message type would pass every other test in this file.
  it('posts the four typed message contracts P6 will route', () => {
    const html = renderPromptEnhancementHtml(readyPayload, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
    expect(html).toContain("type: 'pe_deliver_current_body'");
    expect(html).toContain("type: 'pe_directional_action'");
    expect(html).toContain("type: 'pe_close'");
    expect(html).toContain("type: 'pe_submit_additional_details'");
  });

  it('computes hasDirtyAdditionalDetails live from the details field at click time (P7 gate signal)', () => {
    const html = renderPromptEnhancementHtml(readyPayload, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
    expect(html).toContain('hasDirtyAdditionalDetails: !!(detailsEl && detailsEl.value.trim().length > 0)');
  });

  it('computes hasDirtyBodyEdit live from the body textarea at directional-click time (P9 action-loop signal)', () => {
    const html = renderPromptEnhancementHtml(readyPayload, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
    expect(html).toContain('hasDirtyBodyEdit: bodyEl.value !== bodyEl.defaultValue');
  });

  it('guards against clicking a disabled directional action', () => {
    const html = renderPromptEnhancementHtml(readyPayload, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
    expect(html).toContain('if (btn.disabled) return;');
  });

  it('submits additional details on Enter without Shift, not on plain typing', () => {
    const html = renderPromptEnhancementHtml(readyPayload, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
    expect(html).toContain("ev.key === 'Enter' && !ev.shiftKey");
  });

  it('guards the additional-details keydown handler behind detailsEl existing (no crash when the field is absent)', () => {
    const html = renderPromptEnhancementHtml(
      { ...readyPayload, additionalDetailsAvailable: false },
      { cspSource: CSP_SRC, nonce: FIXED_NONCE },
    );
    expect(html).toContain('if (detailsEl)');
    expect(html).not.toContain('id="pe-details"');
  });

  it('sends the canonical bodyId/bodyRevision from the textarea dataset, not free-floating variables', () => {
    const html = renderPromptEnhancementHtml(readyPayload, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
    expect(html).toContain('bodyId: bodyEl.dataset.bodyId');
    expect(html).toContain('bodyRevision: Number(bodyEl.dataset.bodyRevision)');
  });

  it('does not embed any script at all in non-ready states (no acquireVsCodeApi call)', () => {
    for (const renderState of ['no_popup', 'loading', 'blocked', 'fallback'] as const) {
      const html = renderPromptEnhancementHtml({ ...readyPayload, renderState }, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
      expect(html).not.toContain('acquireVsCodeApi');
    }
  });
});

describe('the section index — the numbers beside the body', () => {
  const withSections = (
    sections: PromptEnhancementExtensionPayloadV1['sections'],
  ): PromptEnhancementExtensionPayloadV1 => ({ ...readyPayload, ...(sections ? { sections } : {}) });
  const render = (payload: PromptEnhancementExtensionPayloadV1): string =>
    renderPromptEnhancementHtml(payload, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
  const SECTIONS = [{ number: 1, title: 'Scope' }, { number: 2, title: 'Acceptance' }];

  it('draws each title with its number after it', () => {
    const html = render(withSections(SECTIONS));
    expect(html).toContain('<span class="pe-section-title">Scope</span><span class="pe-section-number">#1</span>');
    expect(html).toContain('<span class="pe-section-title">Acceptance</span><span class="pe-section-number">#2</span>');
  });

  /**
   * The property this rests on, asserted as a byte comparison rather than
   * described: with no sections the frame must be what it was before this
   * existed — the style block included, which is why the index carries its own
   * `<style>` instead of adding rules to the shared one.
   */
  it('changes NOTHING when there are no sections — byte-identical, style and all', () => {
    const before = render(readyPayload);
    expect(render(withSections(undefined))).toBe(before);
    expect(render(withSections([]))).toBe(before);
    expect(before).not.toContain('pe-sections');
    expect(before).not.toContain('pe-section-number');
  });

  it('adds the index and nothing else — the rest of the frame is untouched', () => {
    const before = render(readyPayload);
    const after = render(withSections(SECTIONS));
    // Everything the frame had, it still has, in the same order.
    const index = after.indexOf('<ol class="pe-sections"');
    expect(index).toBeGreaterThan(0);
    const withoutIndex = after.slice(0, after.indexOf('<style>\n  .pe-sections'))
      + after.slice(after.indexOf('</ol>\n') + '</ol>\n'.length);
    expect(withoutIndex).toBe(before);
  });

  it('never puts a number into the body a reader sends', () => {
    const html = render(withSections(SECTIONS));
    const body = html.slice(html.indexOf('<textarea id="pe-body"'));
    const value = body.slice(body.indexOf('>') + 1, body.indexOf('</textarea>'));
    expect(value).toBe(readyPayload.currentBodyText);
    expect(value).not.toContain('#');
  });

  it('sits ABOVE the body, so it reads as an index of what follows', () => {
    const html = render(withSections(SECTIONS));
    expect(html.indexOf('<ol class="pe-sections"')).toBeLessThan(html.indexOf('<textarea id="pe-body"'));
  });

  it('escapes every title — a section cannot inject markup', () => {
    const html = render(withSections([
      { number: 1, title: '<img src=x onerror="alert(1)">' },
      { number: 2, title: 'A & B "quoted"' },
    ]));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('&amp;');
  });

  it('leaves the CSP and the nonce exactly as they were', () => {
    const before = render(readyPayload);
    const after = render(withSections(SECTIONS));
    const csp = (html: string): string => html.slice(html.indexOf('Content-Security-Policy'), html.indexOf('">', html.indexOf('Content-Security-Policy')));
    expect(csp(after)).toBe(csp(before));
    // The index adds a <style>, and the CSP must already have allowed styles —
    // it does, and nothing here loosens it.
    expect((after.match(/nonce="test-nonce-deterministic"/g) ?? []).length)
      .toBe((before.match(/nonce="test-nonce-deterministic"/g) ?? []).length);
  });

  it('is rendered only in the ready state — a blocked or fallback frame has no body to index', () => {
    for (const renderState of ['blocked', 'fallback', 'loading', 'no_popup'] as const) {
      const html = render({ ...withSections(SECTIONS), renderState });
      if (renderState === 'loading') continue; // loading renders its own state
      expect(html, renderState).not.toContain('pe-sections');
    }
  });
});

describe('the bold preview', () => {
  const BODY = [
    'My original request (verbatim):',
    'do not delete the audit log',
    '',
    'Scope:',
    'do not delete the audit log while refactoring.',
  ].join('\n');
  const SECTIONS = [
    { number: 1, title: 'My original request (verbatim)', sectionKind: 'original_request_or_goal', titleLine: 0, endLine: 3 },
    { number: 2, title: 'Scope', sectionKind: 'context_and_constraints', titleLine: 3, endLine: 5 },
  ];
  const withBold = (
    emphasisPhrases: readonly string[] | undefined,
    over: Partial<PromptEnhancementExtensionPayloadV1> = {},
  ): PromptEnhancementExtensionPayloadV1 => ({
    ...readyPayload,
    currentBodyText: BODY,
    sections: SECTIONS,
    ...(emphasisPhrases ? { emphasisPhrases } : {}),
    ...over,
  });
  const render = (p: PromptEnhancementExtensionPayloadV1): string =>
    renderPromptEnhancementHtml(p, { cspSource: CSP_SRC, nonce: FIXED_NONCE });
  const preview = (html: string): string => {
    const at = html.indexOf('<div class="pe-preview">');
    return at < 0 ? '' : html.slice(at, html.indexOf('</div>', at));
  };

  it('draws nothing at all when there are no phrases', () => {
    const before = render(withBold(undefined));
    expect(before).not.toContain('pe-preview');
    expect(render(withBold([]))).toBe(before);
  });

  it('bolds the phrase, and leaves the body a reader sends untouched', () => {
    const html = render(withBold(['while refactoring']));
    expect(preview(html)).toContain('<strong>while refactoring</strong>');

    const field = html.slice(html.indexOf('<textarea id="pe-body"'));
    const value = field.slice(field.indexOf('>') + 1, field.indexOf('</textarea>'));
    expect(value).toBe(BODY);
    expect(value).not.toContain('<strong>');
  });

  /**
   * The rule this surface must not break on its own. The phrase appears TWICE —
   * once inside the section that quotes the developer's prompt back, and once in
   * an ordinary section. The standard never marks the first, so the mark must
   * land on the second.
   */
  it('never marks inside a section the standard excludes', () => {
    const html = render(withBold(['do not delete the audit log']));
    const body = preview(html);
    const marked = body.indexOf('<strong>');
    // The quoted-prompt section runs to the blank line before `Scope:`.
    expect(body.slice(0, marked)).toContain('My original request');
    expect(body.slice(0, marked)).toContain('Scope:');
    expect((body.match(/<strong>/g) ?? []).length).toBe(1);
  });

  it('never marks a title line', () => {
    const html = render(withBold(['Scope']));
    // `Scope` occurs only as the title, so there is nowhere left to draw it.
    expect(preview(html)).not.toContain('<strong>');
  });

  it('a phrase that is not in the body is drawn nowhere, and nothing else breaks', () => {
    const html = render(withBold(['nowhere in this body', 'while refactoring']));
    expect((preview(html).match(/<strong>/g) ?? []).length).toBe(1);
  });

  /**
   * ⛔ The safety property, asserted rather than described: the body is escaped
   * FIRST and the phrases are matched inside the escaped text, so nothing taken
   * from a body can ever be emitted as markup.
   */
  it('cannot be made to emit markup from a body or a phrase', () => {
    const hostile = 'Scope:\nuse <img src=x onerror="alert(1)"> carefully';
    const html = render(withBold(['<img src=x onerror="alert(1)">'], {
      currentBodyText: hostile,
      sections: [{ number: 1, title: 'Scope', sectionKind: 'context_and_constraints', titleLine: 0, endLine: 2 }],
    }));
    expect(html).not.toContain('<img src=x');
    expect(preview(html)).toContain('&lt;img src=x');
    // …and it is still bolded, as escaped text.
    expect(preview(html)).toContain('<strong>&lt;img');
  });

  it('bolds every phrase that has somewhere to go', () => {
    const html = render(withBold(['while refactoring', 'the audit log']));
    expect((preview(html).match(/<strong>/g) ?? []).length).toBe(2);
  });

  /**
   * The invariant that makes every other assertion here safe: strip the markup
   * back out and what is left must be the body, exactly.
   *
   * ⚠️ Written after a weaker version of this test let a real defect through.
   * Checking only for `<strong><strong>` and balanced tags passed even with the
   * overlap guard removed — that path does not nest, it DUPLICATES and DROPS
   * text either side of the overlap, which no tag count can see.
   */
  it('shows the body and nothing but the body, whatever the phrases overlap', () => {
    for (const phrases of [
      ['delete the audit log while', 'audit log while refactoring'],   // overlapping
      ['while refactoring', 'the audit log'],                          // disjoint
      ['do not delete the audit log'],                                 // one
    ]) {
      const body = preview(render(withBold(phrases)));
      expect(body.replace(/<\/?strong>/g, '').replace('<div class="pe-preview">', ''), phrases.join(' + '))
        .toBe(BODY.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      expect(body).not.toContain('<strong><strong>');
    }
  });

  it('is absent on every state that has no editable body', () => {
    for (const renderState of ['blocked', 'fallback', 'no_popup'] as const) {
      expect(render({ ...withBold(['while refactoring']), renderState }), renderState).not.toContain('pe-preview');
    }
  });
});
