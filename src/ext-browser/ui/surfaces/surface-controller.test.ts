// @vitest-environment jsdom
//
// D6 — the interaction layer, driven with real KeyboardEvents.

import { describe, it, expect, beforeEach, afterEach , vi } from 'vitest';
import {
  createSurfaceController,
  mergeDetailsIntoBody,
  moveCaretLine,
  DETAILS_MERGE_HEADING,
  type SurfaceController,
  type SurfaceEvent,
} from './surface-controller.js';
import { EDIT_KEYS_HINT } from './fixtures/pe.js';
import { PE_FIXTURE, PE_FOOTER } from './fixtures/pe.js';
import { MPS_FIRST_FIXTURE, MPS_CONTINUATION_FIXTURE, MPS_CANCEL_LABEL } from './fixtures/mps.js';
import { PEF_FIXTURE } from './fixtures/pef.js';
import type { SurfaceModel } from './surface-model.js';

const REGISTRY = {
  prompt_enhancement: PE_FIXTURE,
  mps_first: MPS_FIRST_FIXTURE,
  mps_continuation: MPS_CONTINUATION_FIXTURE,
  prompt_enhancement_feedback: PEF_FIXTURE,
};

let host: HTMLElement;
let events: SurfaceEvent[];
let controller: SurfaceController | undefined;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  events = [];
});

afterEach(() => {
  controller?.destroy();
  controller = undefined;
  document.body.innerHTML = '';
});

function mount(initial: keyof typeof REGISTRY = 'prompt_enhancement', extra: object = {}): SurfaceController {
  controller = createSurfaceController(host, {
    registry: REGISTRY,
    initial,
    onEvent: (e) => events.push(e),
    ...extra,
  });
  return controller;
}

function key(target: Element, key: string, init: KeyboardEventInit = {}): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, code: init.code ?? key, bubbles: true, cancelable: true, ...init }));
}

function bodyField(): HTMLTextAreaElement {
  return host.querySelector('textarea')!;
}

/**
 * Move focus to the row with this label.
 *
 * By label rather than by a count of ArrowDowns: the surfaces gained their
 * refinement rows, and every test that said "down twice reaches Use original
 * prompt" silently started testing a different row. A label cannot drift like
 * that, and it says what the test means.
 */
function focusOn(c: SurfaceController, label: string): void {
  for (let i = 0; i < 20; i++) {
    const focused = host.querySelector('.np-row.np-focused .np-label')?.textContent;
    if (focused === label) return;
    key(c.element, 'ArrowDown');
  }
  throw new Error(`focusOn: never reached "${label}"`);
}

// ── construction ─────────────────────────────────────────────────────────────

describe('construction', () => {
  it('renders the initial surface into a focusable np-surface-root wrapper', () => {
    const c = mount();

    expect(c.element.className).toBe('np-surface-root');
    expect(c.element.tabIndex).toBe(-1);
    expect(host.textContent).toContain('◆ NEXPATH CLI · Prompt enhancement');
  });

  it('refuses an initial surface that is not registered', () => {
    expect(() => createSurfaceController(host, { registry: {}, initial: 'prompt_enhancement' }))
      .toThrow('no model registered');
  });

  it('DOM-focuses the body field when the focused row is a field', () => {
    mount();

    expect(document.activeElement).toBe(bodyField());
  });
});

// ── navigation ───────────────────────────────────────────────────────────────

describe('navigation — the CLI clamp, never a wrap', () => {
  it('ArrowDown walks the interactive rows and clamps at the last', () => {
    const c = mount();
    const last = PE_FIXTURE.rows.filter((r) => r.kind !== 'note').length - 1;

    key(c.element, 'ArrowDown');
    expect(c.getFocusIndex()).toBe(1);
    for (let i = 0; i < last + 3; i++) key(c.element, 'ArrowDown');

    expect(c.getFocusIndex()).toBe(last);    // clamped, not wrapped to 0
  });

  it('ArrowUp clamps at the first row', () => {
    const c = mount();

    key(c.element, 'ArrowUp');

    expect(c.getFocusIndex()).toBe(0);
  });

  it('moving focus onto a field row hands it the real keyboard', () => {
    const c = mount();
    focusOn(c, 'Additional details');

    expect(document.activeElement).toBe(host.querySelectorAll('textarea')[1]);
    focusOn(c, 'Use original prompt');       // an action row
    expect(document.activeElement).toBe(c.element);
  });

  it('plain arrows move ROWS even while a field is focused — the CLI has no plain-arrow caret', () => {
    const c = mount();

    key(bodyField(), 'ArrowDown');           // dispatched from inside the textarea

    expect(c.getFocusIndex()).toBe(1);
  });

  it('preserves the user\'s edits across the re-render a focus move causes', () => {
    const c = mount();
    bodyField().value = 'edited by the user';

    key(c.element, 'ArrowDown');
    key(c.element, 'ArrowUp');

    expect(bodyField().value).toBe('edited by the user');
  });
});

// ── Enter on the body ────────────────────────────────────────────────────────

describe('Enter on the body — send', () => {
  it('emits the EDITED text and says so', () => {
    mount();
    bodyField().value = 'the edited prompt';

    key(bodyField(), 'Enter');

    expect(events).toEqual([{ type: 'send', surface: 'prompt_enhancement', text: 'the edited prompt' }]);
  });

  it('refuses a blank body, silently — BF-1', () => {
    mount();
    bodyField().value = '   \n  ';

    key(bodyField(), 'Enter');

    expect(events).toEqual([]);
  });
});

// ── Enter on the details — the CLI local merge ───────────────────────────────

describe('Enter on the details — the CLI\'s local merge', () => {
  it('merges under the one heading, clears the field, and returns focus to the body', () => {
    const c = mount();
    const details = host.querySelectorAll('textarea')[1]!;
    key(c.element, 'ArrowDown');             // focus details

    key(host.querySelectorAll('textarea')[1]!, 'Enter');

    const body = bodyField().value;
    expect(body).toContain(`\n\n${DETAILS_MERGE_HEADING}\nKeep the existing retry helper — do not rewrite it.`);
    expect(host.querySelectorAll('textarea')[1]!.value).toBe('');
    expect(c.getFocusIndex()).toBe(0);
    expect(events[0]!.type).toBe('apply-details');
    void details;
  });

  it('a second apply extends the ONE block — no second heading (live iMac report)', () => {
    const c = mount();
    key(c.element, 'ArrowDown');
    key(host.querySelectorAll('textarea')[1]!, 'Enter');      // first apply

    key(c.element, 'ArrowDown');
    host.querySelectorAll('textarea')[1]!.value = 'and one more thing';
    key(host.querySelectorAll('textarea')[1]!, 'Enter');      // second apply

    const body = bodyField().value;
    expect(body.split(DETAILS_MERGE_HEADING)).toHaveLength(2);  // exactly one heading
    expect(body).toContain('and one more thing');
  });

  it('refuses empty details and a blank body, silently', () => {
    const c = mount();
    key(c.element, 'ArrowDown');             // focus stays on details throughout
    host.querySelectorAll('textarea')[1]!.value = '   ';
    key(host.querySelectorAll('textarea')[1]!, 'Enter');
    expect(events).toEqual([]);

    bodyField().value = '';
    host.querySelectorAll('textarea')[1]!.value = 'details';
    key(host.querySelectorAll('textarea')[1]!, 'Enter');
    expect(events).toEqual([]);
  });

  it('mergeDetailsIntoBody matches the CLI character for character', () => {
    expect(mergeDetailsIntoBody('body', ' details ')).toBe(`body\n\n${DETAILS_MERGE_HEADING}\ndetails`);
    expect(mergeDetailsIntoBody(`body\n\n${DETAILS_MERGE_HEADING}\nfirst`, 'second'))
      .toBe(`body\n\n${DETAILS_MERGE_HEADING}\nfirst\nsecond`);
  });
});

// ── cancel paths — where PEF opens ───────────────────────────────────────────

describe('cancel is where feedback opens (§8.3)', () => {
  it('Use original prompt switches to PEF and reports it', () => {
    const c = mount();
    focusOn(c, 'Use original prompt');

    key(c.element, 'Enter');

    expect(events).toEqual([{ type: 'use-original', surface: 'prompt_enhancement' }]);
    expect(c.getModel().id).toBe('prompt_enhancement_feedback');
    expect(host.textContent).toContain('Prompt enhancement feedback');
  });

  it('Escape on PE cancels into PEF', () => {
    const c = mount();

    key(c.element, 'Escape');

    expect(events).toEqual([{ type: 'cancelled', surface: 'prompt_enhancement' }]);
    expect(c.getModel().id).toBe('prompt_enhancement_feedback');
  });
});

// ── the other Escapes, per surface ───────────────────────────────────────────

describe('Escape is per-surface — never one handler', () => {
  it('MPS-1: leaves editor focus first, preserving the draft', () => {
    const c = mount('mps_first');
    bodyField().value = 'a draft the user typed';
    expect(document.activeElement).toBe(bodyField());

    key(bodyField(), 'Escape');

    expect(document.activeElement).toBe(c.element);   // editor left, nothing emitted
    expect(events).toEqual([]);
    expect(bodyField().value).toBe('a draft the user typed');
  });

  it('MPS-1: with no editor focused, Esc declines the offer', () => {
    const c = mount('mps_first');
    key(bodyField(), 'Escape');              // first Esc: leave the editor

    key(c.element, 'Escape');                // second Esc: decline

    expect(events).toEqual([{ type: 'declined', surface: 'mps_first' }]);
  });

  it('MPS-2: Esc cancels the whole remaining sequence — the footer says so', () => {
    const c = mount('mps_continuation');

    key(c.element, 'Escape');

    expect(events).toEqual([{ type: 'cancel-sequence', surface: 'mps_continuation' }]);
  });

  it('PEF: Esc skips', () => {
    const c = mount('prompt_enhancement_feedback');

    key(c.element, 'Escape');

    expect(events).toEqual([{ type: 'feedback-skipped', surface: 'prompt_enhancement_feedback' }]);
  });
});

// ── PEF activation ───────────────────────────────────────────────────────────

describe('PEF', () => {
  it('a fixed reason submits on Enter', () => {
    const c = mount('prompt_enhancement_feedback');

    key(c.element, 'Enter');                 // focus 0 = Not relevant enough

    expect(events).toEqual([{
      type: 'feedback', surface: 'prompt_enhancement_feedback', category: 'Not relevant enough',
    }]);
  });

  it('Other requires text — empty is refused, as the CLI\'s reducer refuses it', () => {
    const c = mount('prompt_enhancement_feedback');
    focusOn(c, 'Other');

    key(bodyField(), 'Enter');
    expect(events).toEqual([]);

    bodyField().value = 'my own reason';
    key(bodyField(), 'Enter');
    expect(events).toEqual([{
      type: 'feedback', surface: 'prompt_enhancement_feedback', text: 'my own reason',
    }]);
  });
});

// ── MPS action rows ──────────────────────────────────────────────────────────

describe('MPS action rows', () => {
  it('Cancel emits cancel-sequence with an echo', () => {
    const c = mount('mps_first');
    focusOn(c, MPS_CANCEL_LABEL);

    key(c.element, 'Enter');

    expect(events).toEqual([{ type: 'cancel-sequence', surface: 'mps_first' }]);
  });

  it('the interruption row emits and echoes', () => {
    const c = mount('mps_continuation');
    focusOn(c, 'I need to do something else first');

    key(c.element, 'Enter');

    expect(events).toEqual([{ type: 'interruption', surface: 'mps_continuation' }]);
  });
});

// ── the editor chords ────────────────────────────────────────────────────────

describe('Ctrl/Cmd+J — the newline, because Enter is send', () => {
  it('inserts at the caret and triggers auto-grow via input', () => {
    mount();
    const field = bodyField();
    field.value = 'ab';
    field.setSelectionRange(1, 1);
    let grew = false;
    field.addEventListener('input', () => { grew = true; });

    key(field, 'j', { code: 'KeyJ', ctrlKey: true });

    expect(field.value).toBe('a\nb');
    expect(field.selectionStart).toBe(2);
    expect(grew).toBe(true);
  });

  it('accepts the Cmd spelling the macOS hint names', () => {
    mount();
    const field = bodyField();
    field.value = 'x';
    field.setSelectionRange(1, 1);

    key(field, 'j', { code: 'KeyJ', metaKey: true });

    expect(field.value).toBe('x\n');
  });
});

describe('Ctrl/Cmd+↑/↓ — caret line movement, hand-built', () => {
  it('moves the caret a logical line, preserving the column where it can', () => {
    const field = document.createElement('textarea');
    field.value = 'first line\nsecond\nthird line';
    document.body.appendChild(field);

    field.setSelectionRange(9, 9);           // column 9 on line 1
    moveCaretLine(field, 1);
    expect(field.selectionStart).toBe(17);   // clamped to the end of 'second'

    moveCaretLine(field, 1);
    expect(field.selectionStart).toBe(24);   // column 6 restored on 'third line'

    moveCaretLine(field, -1);
    expect(field.selectionStart).toBe(17);
  });

  it('clamps the column when moving UP onto a shorter line', () => {
    // The downward cases never exercise this branch — a long line above a short
    // one is the input that does. Without the clamp the caret lands mid-way
    // through the WRONG line.
    const field = document.createElement('textarea');
    field.value = 'ab\na much longer line';
    document.body.appendChild(field);

    field.setSelectionRange(11, 11);         // column 8 on the long line

    moveCaretLine(field, -1);

    expect(field.selectionStart).toBe(2);    // clamped to the end of 'ab'
  });

  it('clamps at the first and last line', () => {
    const field = document.createElement('textarea');
    field.value = 'one\ntwo';
    document.body.appendChild(field);

    field.setSelectionRange(1, 1);
    moveCaretLine(field, -1);
    expect(field.selectionStart).toBe(0);

    field.setSelectionRange(5, 5);
    moveCaretLine(field, 1);
    expect(field.selectionStart).toBe(7);
  });

  it('is wired to the chord inside a field, and the row focus does not move', () => {
    const c = mount();
    const field = bodyField();
    field.setSelectionRange(0, 0);

    key(field, 'ArrowDown', { code: 'ArrowDown', ctrlKey: true });

    expect(c.getFocusIndex()).toBe(0);       // caret moved, row focus did not
  });
});

describe('browser-only combinations stay native — a terminal never sees them', () => {
  it('Ctrl+Shift+J is the DevTools console, not our newline', () => {
    mount();
    const field = bodyField();
    field.value = 'x';
    field.setSelectionRange(1, 1);
    let leaked = 0;
    const listener = (): void => { leaked += 1; };
    document.addEventListener('keydown', listener);

    key(field, 'J', { code: 'KeyJ', ctrlKey: true, shiftKey: true });

    document.removeEventListener('keydown', listener);
    expect(field.value).toBe('x');           // no newline inserted
    expect(leaked).toBe(1);                  // and not consumed either
  });

  it('Shift+arrow inside a field is select-by-line — row focus must not move', () => {
    const c = mount();

    key(bodyField(), 'ArrowDown', { code: 'ArrowDown', shiftKey: true });

    expect(c.getFocusIndex()).toBe(0);
  });

  it('Ctrl+Shift+arrow extends a selection — neither caret-move nor row-move fires', () => {
    const c = mount();
    const field = bodyField();
    field.setSelectionRange(0, 0);

    key(field, 'ArrowDown', { code: 'ArrowDown', ctrlKey: true, shiftKey: true });

    expect(c.getFocusIndex()).toBe(0);
    expect(field.selectionStart).toBe(0);    // our caret-mover did not run
  });
});

// ── the three panel fixes ────────────────────────────────────────────────────

describe('the three panel fixes (A4.6)', () => {
  it('stops every handled key from reaching the page — the ArrowUp hijack', () => {
    const c = mount();
    let leaked = 0;
    const listener = (): void => { leaked += 1; };
    document.addEventListener('keydown', listener);

    key(c.element, 'ArrowDown');
    key(c.element, 'Enter');
    key(c.element, 'Escape');
    key(c.element, ' ', { code: 'Space' });

    document.removeEventListener('keydown', listener);
    expect(leaked).toBe(0);
  });

  it('lets unhandled keys pass — only handled keys are stopped', () => {
    const c = mount();
    let seen = 0;
    const listener = (): void => { seen += 1; };
    document.addEventListener('keydown', listener);

    key(c.element, 'a', { code: 'KeyA' });

    document.removeEventListener('keydown', listener);
    expect(seen).toBe(1);
  });

  it('pointerdown outside a field re-takes focus, so the scoped listener keeps firing', () => {
    const c = mount('prompt_enhancement_feedback');   // focus 0 is an action row
    (document.activeElement as HTMLElement | null)?.blur?.();

    c.element.dispatchEvent(new Event('pointerdown', { bubbles: true }));

    expect(document.activeElement).toBe(c.element);
  });

  it('the keydown listener is scoped to the wrapper — a stray key elsewhere does nothing', () => {
    const c = mount();

    key(document.body, 'ArrowDown');

    expect(c.getFocusIndex()).toBe(0);
  });
});

// ── clicks ───────────────────────────────────────────────────────────────────

describe('clicks', () => {
  it('an action row activates on click, as the old panel\'s rows did', () => {
    const c = mount();
    const useOriginal = [...host.querySelectorAll('.np-label')]
      .find((el) => el.textContent === 'Use original prompt')!;

    useOriginal.closest('.np-row')!.dispatchEvent(new Event('click', { bubbles: true }));

    expect(events).toEqual([{ type: 'use-original', surface: 'prompt_enhancement' }]);
    expect(c.getModel().id).toBe('prompt_enhancement_feedback');
  });

  it('a field row focuses on click and does NOT activate — clicking to type must never send', () => {
    const c = mount();
    focusOn(c, 'Use original prompt');        // park focus away from the body

    const bodyLabel = [...host.querySelectorAll('.np-label')]
      .find((el) => el.textContent === 'Use enhanced prompt')!;
    bodyLabel.closest('.np-row')!.dispatchEvent(new Event('click', { bubbles: true }));

    expect(c.getFocusIndex()).toBe(0);
    expect(events).toEqual([]);
  });

  it('focusing the details textarea retargets Enter to the details row', () => {
    const c = mount();
    const details = host.querySelectorAll('textarea')[1]!;

    details.dispatchEvent(new Event('focus', { bubbles: true }));

    expect(c.getFocusIndex()).toBe(1);
    key(host.querySelectorAll('textarea')[1]!, 'Enter');
    expect(events[0]!.type).toBe('apply-details');   // applied, not sent
  });
});

// ── the pluggable hook (held D5 wiring plugs in here) ────────────────────────

describe('resolveActivation', () => {
  const other: SurfaceModel = {
    id: 'mps_first', label: 'Other', footer: 'f',
    rows: [{ kind: 'action', label: 'only' }],
  };

  it('a returned transition switches the model', () => {
    const c = mount('prompt_enhancement', {
      resolveActivation: () => ({ model: other }),
    });

    key(c.element, 'Enter');

    expect(c.getModel()).toBe(other);
    expect(events).toEqual([]);              // the hook consumed the activation
  });

  it("'refuse' is the CLI-style silent guard", () => {
    mount('prompt_enhancement', { resolveActivation: () => 'refuse' });
    bodyField().value = 'text';

    key(bodyField(), 'Enter');

    expect(events).toEqual([]);
  });

  it('null falls through to the controller\'s own routing', () => {
    mount('prompt_enhancement', { resolveActivation: () => null });
    bodyField().value = 'text';

    key(bodyField(), 'Enter');

    expect(events[0]!.type).toBe('send');
  });

  it('an unknown action row is never a silent no-op (A4.3)', () => {
    const registry = {
      ...REGISTRY,
      mps_first: {
        ...MPS_FIRST_FIXTURE,
        rows: [{ kind: 'action', label: 'Mystery row' }],
      } as SurfaceModel,
    };
    controller = createSurfaceController(host, {
      registry, initial: 'mps_first', onEvent: (e) => events.push(e),
    });

    key(controller.element, 'Enter');

    expect(events).toEqual([{ type: 'activate', surface: 'mps_first', label: 'Mystery row' }]);
  });
});

// ── notices ──────────────────────────────────────────────────────────────────

describe('the notice slot belongs to the caller', () => {
  // The controller used to carry nine lines ending in "static build", written
  // when nothing was wired. What it owns now is the SLOT and when it clears;
  // the words are supplied per event, or not at all.

  it('says nothing when the caller supplies nothing', () => {
    const c = mount('mps_continuation');

    key(c.element, 'Escape');

    expect(events[0]!.type).toBe('cancel-sequence');
    expect(host.querySelectorAll('.np-footer .np-row')).toHaveLength(2);   // blank + footer
  });

  it('renders what the caller says, in the CLI\'s publicNotice position', () => {
    const c = mount('mps_continuation', {
      notice: (e: SurfaceEvent) => (e.type === 'cancel-sequence' ? 'Sequence cancelled.' : undefined),
    });

    key(c.element, 'Escape');

    const footerRows = [...host.querySelectorAll('.np-footer .np-row')]
      .map((r) => [...r.children].map((cell) => cell.textContent ?? '').join(' ').trim());

    expect(footerRows).toEqual(['', 'Sequence cancelled.', '', 'Enter send · Esc cancels sequence']);
  });

  it('is asked about every outcome, including ones that never had a line', () => {
    // apply-details never carried a notice of its own — a caller that wants to
    // acknowledge it no longer needs the controller to have had an opinion.
    const c = mount('prompt_enhancement', {
      notice: (e: SurfaceEvent) => (e.type === 'apply-details' ? 'Details applied.' : undefined),
    });
    focusOn(c, 'Additional details');

    key(host.querySelectorAll('textarea')[1]!, 'Enter');

    expect(host.textContent).toContain('Details applied.');
  });

  it('clears on the next focus move, like the CLI clears publicNotice each loop', () => {
    const c = mount('mps_continuation', { notice: () => 'something happened' });
    key(c.element, 'Escape');
    expect(host.textContent).toContain('something happened');

    key(c.element, 'ArrowDown');

    expect(host.textContent).not.toContain('something happened');
  });

  it('a later outcome supersedes an earlier line rather than leaving it up', () => {
    // Without this the frame would keep describing something that is no longer
    // what just happened.
    // Escape, not a focus move: navigation clears the notice by itself, so a
    // test that navigates proves nothing about supersede — it passed with the
    // supersede logic removed, and mutation testing said so.
    const c = mount('prompt_enhancement', {
      notice: (e: SurfaceEvent) => (e.type === 'send' ? 'Sent.' : undefined),
    });
    bodyField().value = 'text';
    key(bodyField(), 'Enter');
    expect(host.textContent).toContain('Sent.');

    key(c.element, 'Escape');                   // 'cancelled': the caller says nothing

    expect(host.textContent).not.toContain('Sent.');
  });
});

describe('the busy skeleton (E3)', () => {
  // The CLI's own shape (`cli-mps-popup.ts:357-364`): while the wording is not
  // ready the body is a spinner skeleton and its edit-keys hint is hidden;
  // everything else renders as normal.

  it('replaces the body with the glyph and hides its hints', () => {
    const c = mount();
    const hintsBefore = host.querySelectorAll('.np-hint').length;

    c.setBusy('⠋');

    expect(bodyField().value).toBe('⠋ preparing…');
    expect(host.querySelectorAll('.np-hint').length).toBeLessThan(hintsBefore);
  });

  it('leaves everything else alone — the rows, the details field, the footer', () => {
    const c = mount();

    c.setBusy('⠋');

    const labels = [...host.querySelectorAll('.np-label')].map((el) => el.textContent);
    expect(labels).toContain('Use original prompt');
    expect(labels).toContain('Additional details');
    expect(host.querySelectorAll('textarea')[1]!.value)
      .toBe('Keep the existing retry helper — do not rewrite it.');
    expect(host.querySelector('.np-footer')!.textContent).toContain(PE_FOOTER);
  });

  it('keeps the body a textarea, so no field ordinal shifts', () => {
    // Removing it would be the obvious way to make it uneditable, and it would
    // move every field ordinal down by one — the controller would then write
    // the BODY's text into the details field on the next render.
    const c = mount();
    const before = host.querySelectorAll('textarea').length;

    c.setBusy('⠋');

    expect(host.querySelectorAll('textarea')).toHaveLength(before);
    expect(bodyField().readOnly).toBe(true);
  });

  it('does not eat an edit that was in progress when it arrived', () => {
    // Busy can arrive mid-edit. A re-render that does not harvest first
    // replaces the textarea with one carrying the MODEL's text, and the user's
    // typing is gone — it reappears as if never written once the skeleton
    // clears. The first version of this test used Escape to trigger a harvest
    // and proved nothing, because Escape on PE navigates to feedback and the
    // field being read afterwards was a different field entirely.
    const c = mount();
    bodyField().value = 'what the user wrote';

    c.setBusy('⠋');
    expect(bodyField().value).toBe('⠋ preparing…');
    c.setBusy(null);

    expect(bodyField().value).toBe('what the user wrote');
  });

  it('accepts nothing but Escape while it waits', () => {
    const c = mount();
    bodyField().value = 'text';
    c.setBusy('⠋');

    key(c.element, 'ArrowDown');
    key(c.element, 'Enter');

    expect(c.getFocusIndex(), 'focus must not move').toBe(0);
    expect(events, 'nothing may be sent from a body that is not ready').toEqual([]);

    key(c.element, 'Escape');
    expect(events[0]!.type, 'but waiting must never be a trap').toBe('cancelled');
  });

  it('clears back to the real body', () => {
    const c = mount();
    c.setBusy('⠋');
    expect(bodyField().value).toBe('⠋ preparing…');

    c.setBusy(null);

    expect(bodyField().value).toContain('Add a Stripe webhook handler');
    expect(bodyField().readOnly).toBe(false);
  });

  it('does not travel to another surface', () => {
    // Busy describes THIS surface's wording being prepared. Carried over, the
    // next surface opens with a skeleton for something nobody is preparing —
    // and unlike a notice, it can never be about the transition itself.
    const c = mount();
    c.setBusy('⠋');
    expect(bodyField().value).toBe('⠋ preparing…');

    c.setSurface('mps_first');

    expect(bodyField().value).toContain('Step 1');
    expect(bodyField().readOnly).toBe(false);
  });

  it('re-renders per glyph, so the caller can animate it', () => {
    const c = mount();
    c.setBusy('⠋');
    c.setBusy('⠙');

    expect(bodyField().value).toBe('⠙ preparing…');
  });
});

describe('a notice does not outlive its surface', () => {
  it('a caller-driven switch starts clean', () => {
    // It described what happened on the surface that raised it; carried over,
    // it explains something the reader is no longer looking at. `setSurface`
    // after a send showed "Sent." under the MPS header.
    const c = mount('prompt_enhancement', {
      notice: (e: SurfaceEvent) => (e.type === 'send' ? 'Sent.' : undefined),
    });
    bodyField().value = 'x';
    key(bodyField(), 'Enter');
    expect(host.textContent).toContain('Sent.');

    c.setSurface('mps_first');

    expect(host.textContent).not.toContain('Sent.');
  });

  it('but a line about the transition itself lands with it', () => {
    // Escape on PE opens feedback, and a caller explaining WHY should be read
    // on the surface it opened.
    const c = mount('prompt_enhancement', {
      notice: (e: SurfaceEvent) => (e.type === 'cancelled' ? 'Cancelled — tell us why?' : undefined),
    });

    key(c.element, 'Escape');

    expect(c.getModel().id).toBe('prompt_enhancement_feedback');
    expect(host.textContent).toContain('Cancelled — tell us why?');
  });
});

describe('Escape has the same seam as a row activation', () => {
  // It had none, and a caller could suppress everything a row did and nothing
  // Escape did — which is why the MPS decline path kept announcing itself in a
  // build that had intercepted every other notice.

  it("'handled' stops the controller doing anything further", () => {
    const c = mount('mps_continuation', { resolveEscape: () => 'handled' as const });

    key(c.element, 'Escape');

    expect(events).toEqual([]);
    expect(c.getModel().id).toBe('mps_continuation');
  });

  it('a returned transition switches the surface', () => {
    const c = mount('prompt_enhancement', {
      resolveEscape: () => ({ model: PEF_FIXTURE }),
    });

    key(c.element, 'Escape');

    expect(c.getModel().id).toBe('prompt_enhancement_feedback');
    expect(events).toEqual([]);                 // the hook consumed it
  });

  it('null falls through to the per-surface default', () => {
    const c = mount('mps_continuation', { resolveEscape: () => null });

    key(c.element, 'Escape');

    expect(events).toEqual([{ type: 'cancel-sequence', surface: 'mps_continuation' }]);
  });
});

describe('typing never re-renders the frame (D7 smoothness)', () => {
  it('input events leave the frame element untouched — typing is native', () => {
    // The acceptance is "no per-keystroke full re-render of the body": with 500
    // lines in the field, rebuilding the DOM on every keystroke would stutter.
    // Typing lives entirely in the textarea; the controller re-renders only on
    // focus moves and activations.
    const c = mount();
    const frameBefore = host.querySelector('.np-frame');
    const field = bodyField();

    for (let i = 0; i < 20; i++) {
      field.value += 'x';
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }

    expect(host.querySelector('.np-frame')).toBe(frameBefore);
    void c;
  });
});

// ── lifecycle ────────────────────────────────────────────────────────────────

describe('lifecycle', () => {
  it('setSurface switches; an unregistered id is ignored', () => {
    const c = mount();

    c.setSurface('mps_continuation');
    expect(c.getModel().id).toBe('mps_continuation');

    const before = c.getModel();
    c.setSurface('prompt_enhancement');
    expect(c.getModel().id).toBe('prompt_enhancement');
    void before;
  });

  it('destroy removes the wrapper and deadens every key', () => {
    const c = mount();
    c.destroy();

    expect(host.querySelector('.np-surface-root')).toBeNull();
    expect(() => key(document.body, 'ArrowDown')).not.toThrow();
    expect(events).toEqual([]);
  });
});

describe('Alt+Shift chords — the advertised no-conflict family (2026-08-25 remap)', () => {
  // The advisory panel's Ctrl+T→Alt+Shift+T precedent applied to the editor
  // chords: with strayed focus Ctrl+J is Chrome's Downloads, so the HINT now
  // names Alt+Shift, which no browser or OS claims. e.code drives the match —
  // on macOS Alt+Shift+J's e.key is a special character.
  it('Alt+Shift+J inserts the newline at the caret', () => {
    mount();
    const field = bodyField();
    field.value = 'ab';
    field.setSelectionRange(1, 1);

    key(field, 'J', { code: 'KeyJ', altKey: true, shiftKey: true });

    expect(field.value).toBe('a\nb');
    expect(field.selectionStart).toBe(2);
  });

  it('Alt+Shift+↑/↓ moves the caret by line', () => {
    mount();
    const field = bodyField();
    field.value = 'one\ntwo';
    field.setSelectionRange(6, 6); // in "two"

    key(field, 'ArrowUp', { code: 'ArrowUp', altKey: true, shiftKey: true });
    expect(field.selectionStart).toBeLessThanOrEqual(3); // now in "one"

    key(field, 'ArrowDown', { code: 'ArrowDown', altKey: true, shiftKey: true });
    expect(field.selectionStart).toBeGreaterThanOrEqual(4); // back in "two"
  });

  it('Alt WITHOUT Shift (and Ctrl+Shift) stay native — never consumed', () => {
    mount();
    const field = bodyField();
    field.value = 'x';
    field.setSelectionRange(1, 1);

    key(field, 'j', { code: 'KeyJ', altKey: true });                    // AltGr class
    key(field, 'J', { code: 'KeyJ', ctrlKey: true, shiftKey: true });   // DevTools console
    expect(field.value).toBe('x'); // no newline from either
  });

  it('the shipped hint advertises the Alt+Shift family, not Ctrl+J', () => {
    expect(EDIT_KEYS_HINT).toMatch(/(Alt|Option)\+Shift\+J/);
    expect(EDIT_KEYS_HINT).not.toContain('Ctrl+J');
  });
});

describe('focus-steal guard (live 2026-08-25: agent pages grab focus after show)', () => {
  it('a steal that lands focus on document.body within the window is re-taken to the focused field', async () => {
    mount();
    const field = bodyField();
    expect(document.activeElement === field || field.getRootNode().activeElement === field
      || document.activeElement === document.body).toBe(true);
    field.focus();
    // Page-script steal signature: blur → focus rests on body.
    field.blur();
    expect(document.activeElement).toBe(document.body);
    await new Promise((r) => setTimeout(r, 10));
    expect(document.activeElement).not.toBe(document.body); // re-taken
  });

  it('a steal AFTER the window expires is respected (the non-modal rule survives)', async () => {
    vi.useFakeTimers();
    try {
      mount();
      const field = bodyField();
      field.focus();
      vi.advanceTimersByTime(2_000); // past FOCUS_STEAL_WINDOW_MS with no render
      field.blur();
      await vi.advanceTimersByTimeAsync(50);
      expect(document.activeElement).toBe(document.body); // left alone
    } finally {
      vi.useRealTimers();
    }
  });
});
