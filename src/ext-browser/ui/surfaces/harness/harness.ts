// ============================================================================
// D7.1 — the surfaces harness: a real browser exercising the real code.
// ----------------------------------------------------------------------------
// jsdom computes no layout, so everything C-2 promises — the header shrinking
// before the options band starves, one row always visible, long tokens wrapping
// instead of widening the frame — can only be PROVEN here. This page mounts the
// actual dock, chrome and controller (no copies, no mocks) and carries an
// automated sweep that renders every surface across a content × viewport
// matrix and measures the result with getBoundingClientRect.
//
// It lives INSIDE src/ext-browser/ui/surfaces/ because C-5 forbids touching
// anything outside this layer — the existing panel harness is not modified.
// Dev-only: nothing imports it, it reaches no bundle, and its build output is
// git-ignored beside it.
//
// Run: `node build.mjs` in this directory, then open index.html (any static
// server). `?sweep=1` runs the matrix on load and prints one line of JSON —
// `SWEEP {"pass":…,"fail":…}` — to the console for automation.
// ============================================================================

import { mountNexpathDock } from '../dock.js';
import { installChromeStyles } from '../chrome.js';
import { growFields, renderSurface } from '../surface-view.js';
import { createSurfaceController, DETAILS_MERGE_HEADING, type SurfaceEvent } from '../surface-controller.js';
import type { SurfaceId, SurfaceModel } from '../surface-model.js';
import { PE_FIXTURE } from '../fixtures/pe.js';
import { MPS_FIRST_FIXTURE, MPS_CONTINUATION_FIXTURE } from '../fixtures/mps.js';
import { PEF_FIXTURE } from '../fixtures/pef.js';
import { withBodyText } from '../refinement.js';
import { createRefinementTransitions } from '../refinement-transitions.js';
import { PE_REFINED_TEXT, MPS_REFINED_TEXT } from '../fixtures/directional.js';

const FIXTURES: Record<SurfaceId, SurfaceModel> = {
  prompt_enhancement: PE_FIXTURE,
  mps_first: MPS_FIRST_FIXTURE,
  mps_continuation: MPS_CONTINUATION_FIXTURE,
  prompt_enhancement_feedback: PEF_FIXTURE,
};

/**
 * What the harness says about each outcome.
 *
 * These lines used to live in the controller, ending in "static build", from
 * when nothing was wired. They belong to whoever is driving the surface: the
 * live bridge says what its agent did, and the harness says that it is a
 * harness. A caller with nothing to add returns undefined and the frame stays
 * silent.
 */
const HARNESS_NOTICE = (e: SurfaceEvent): string | undefined => {
  switch (e.type) {
    case 'send': return 'Sent — harness; no agent is wired.';
    case 'feedback': return 'Feedback recorded — harness.';
    case 'feedback-skipped': return 'Feedback skipped.';
    case 'cancel-sequence': return 'Sequence cancelled — harness.';
    case 'interruption': return 'Interruption noted — the sequence prompt would return after the response.';
    case 'declined': return 'Declined — harness.';
    case 'activate': return `No action wired for "${e.label}" (harness).`;
    default: return undefined;
  }
};

/** The pre-authored recompose, per surface — the static stand-in for Option B. */
const REFINED_TEXTS = {
  prompt_enhancement: PE_REFINED_TEXT,
  mps_first: MPS_REFINED_TEXT,
};

/**
 * The payload pushed through every slot the renderer builds with innerHTML.
 *
 * Field text alone would prove nothing: it lands in `textarea.value`, which is
 * inherently safe and never touches `escapeHtml`. The label, header, hints and
 * notes are the interpolated ones, so those are what a real escaping check has
 * to carry.
 */
function withPayloadEverywhere(model: SurfaceModel, payload: string): SurfaceModel {
  return {
    ...model,
    label: payload,
    pinch: payload,
    whyHelp: payload,
    rows: model.rows.map((r) => (r.kind === 'note'
      ? { ...r, text: payload }
      : { ...r, label: payload, ...(r.kind === 'field' ? { hints: { always: [payload] } } : {}) })),
    footer: payload,
  };
}

// ── interactive mode ─────────────────────────────────────────────────────────

function mountInteractive(): void {
  const dock = mountNexpathDock();
  const shadow = dock.mountEl.getRootNode() as ShadowRoot;
  installChromeStyles(shadow);

  const log = document.getElementById('log')!;
  const logEvent = (e: SurfaceEvent): void => {
    const line = document.createElement('div');
    line.textContent = JSON.stringify(e);
    log.prepend(line);
  };
  const controller = createSurfaceController(dock.mountEl, {
    registry: FIXTURES,
    initial: 'prompt_enhancement',
    // Wired always: the refinement rows are part of the surfaces, so a
    // controller without this hook would render them as dead options — the
    // exact thing the CLI revert to 48aac87 was about.
    resolveActivation: createRefinementTransitions(REFINED_TEXTS),
    notice: HARNESS_NOTICE,
    onEvent: logEvent,
  });
  dock.show();

  for (const id of Object.keys(FIXTURES) as SurfaceId[]) {
    const button = document.createElement('button');
    button.textContent = id;
    button.addEventListener('click', () => controller.setSurface(id));
    document.getElementById('picker')!.appendChild(button);
  }

  // E3.4 — the CALLER animates. The controller runs no timer: teardown,
  // tab-visibility and prefers-reduced-motion are the caller's problems, and it
  // is the caller that knows when the round-trip actually ends.
  const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let spin: number | undefined;
  const busyButton = document.createElement('button');
  busyButton.textContent = 'busy 3s';
  busyButton.addEventListener('click', () => {
    if (spin !== undefined) return;
    let i = 0;
    // Honouring the OS setting is exactly the kind of thing that would have had
    // to live in the controller if the glyph were animated there.
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    controller.setBusy(FRAMES[0]!);
    if (!still) spin = window.setInterval(() => controller.setBusy(FRAMES[++i % FRAMES.length]!), 80);
    window.setTimeout(() => {
      if (spin !== undefined) { window.clearInterval(spin); spin = undefined; }
      controller.setBusy(null);
    }, 3000);
  });
  document.getElementById('picker')!.appendChild(busyButton);
}

// ── the sweep (D7.2 + D7.3) ──────────────────────────────────────────────────

/** The content matrix the plan names, plus the escapeHtml payload. */
const CONTENT_CASES: ReadonlyArray<readonly [string, string]> = [
  ['empty', ''],
  ['one line', 'One short line.'],
  ['50 lines', Array.from({ length: 50 }, (_, i) => `line ${i + 1} of fifty`).join('\n')],
  ['500 lines', Array.from({ length: 500 }, (_, i) => `line ${i + 1} of five hundred`).join('\n')],
  ['5000-char paragraph', 'word '.repeat(1000).trim()],
  ['2000-char unbroken token', 'x'.repeat(2000)],
  ['RTL + CJK', 'שלום עולם مرحبا بالعالم\n漢字とカタカナが混ざった行です\nمزيج של שפות 中文'],
  // `<img onerror>` rather than `<script>`: a script inserted via innerHTML is
  // inert BY SPEC, so the obvious payload can never fire and testing it proves
  // nothing. An img handler is the one that actually runs.
  ['markup payload', 'a < b & "c" > d <img src=x onerror="window.__pwned=1">'],
];

/** One CLI text line. A field shorter than this is showing nothing at all. */
const FRAME_LINE_FLOOR_PX = 14;

/** Viewport-shaped boxes. 230 and 180 are the panel bug's reproduction range. */
const SIZES: ReadonlyArray<readonly [number, number]> = [
  [2560, 1080], [1920, 1080], [1440, 800], [1024, 600],
  [800, 400], [600, 300], [360, 230], [360, 180],
];

interface CellResult {
  surface: string; content: string; w: number; h: number;
  headerVisible: boolean; rowVisible: boolean; footerVisible: boolean;
  noHOverflow: boolean; notGrown: boolean; noInjection: boolean; fieldsShowContent: boolean;
  detail: string;
}

function within(inner: DOMRect, outer: DOMRect): boolean {
  // "Visible" = some of it lies inside the box (1px tolerance).
  return inner.bottom > outer.top + 1 && inner.top < outer.bottom - 1
    && inner.right > outer.left + 1 && inner.left < outer.right - 1;
}

function sweepCell(surface: SurfaceModel, label: string, contentName: string, w: number, h: number): CellResult {
  const box = document.createElement('div');
  box.style.cssText = `width:${w}px;height:${h}px;overflow:hidden;position:relative;`;
  document.getElementById('sweep-stage')!.appendChild(box);

  const frame = renderSurface(document, surface, { focusIndex: 0 });
  box.appendChild(frame);
  growFields(frame);

  const boxRect = box.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const scroll = frame.querySelector('.np-scroll') as HTMLElement;
  const header = frame.querySelector('.np-header')!.getBoundingClientRect();
  const bullets = [...frame.querySelectorAll('.np-scroll .np-bullet')].map((b) => b.getBoundingClientRect());
  const footer = frame.querySelector('.np-footer .np-dim')!.getBoundingClientRect();

  const result: CellResult = {
    surface: label, content: contentName, w, h,
    headerVisible: within(header, boxRect),
    // The panel bug's metric: at least one option row must remain visible.
    rowVisible: bullets.some((b) => within(b, boxRect)),
    footerVisible: within(footer, boxRect),
    // Measured on the SCROLL BAND as well as the frame: `.np-frame` is
    // `overflow: hidden`, so a long token overflowing inside the band can be
    // clipped out of the frame's own scrollWidth and read as clean. The band is
    // where `overflow-wrap: anywhere` has to do its work, so the band is where
    // a failure would actually show.
    noHOverflow: frame.scrollWidth <= frame.clientWidth + 1
      && scroll.scrollWidth <= scroll.clientWidth + 1
      && frameRect.width <= boxRect.width + 1,
    notGrown: frameRect.height <= boxRect.height + 1,
    // A REAL detector: if escaping broke, the markup becomes elements. The old
    // check read a flag nothing ever sets, against a payload that cannot fire —
    // it would have passed with escaping fully removed.
    noInjection: frame.querySelector('script, img, iframe, svg, object, embed') === null
      && !(window as unknown as Record<string, unknown>)['__pwned'],
    // A field must show its content, or SAY that it cannot.
    //
    // The first version of this required the field to be tall enough for all
    // its text, which caught the 0px-tall prompt. Then the field gained a cap —
    // thirty blank lines used to push every row below it off the frame — and
    // "tall enough for everything" became the wrong invariant: a capped field
    // is correct precisely when it is SHORTER than its content. What must hold
    // now is that nothing is hidden silently: either the whole text fits, or a
    // scroll marker is on screen saying how much does not.
    fieldsShowContent: [...frame.querySelectorAll('textarea')].every((f) => {
      const height = f.getBoundingClientRect().height;
      if (height < FRAME_LINE_FLOOR_PX) return false;              // collapsed
      if (f.scrollHeight <= height + 1) return true;               // all of it shown
      const group = f.closest('.np-field-group');
      return !!group?.querySelector('.np-marker-row:not(.np-marker-hidden)');
    }),
    // The numbers, not just the verdict: a boolean tells you a field is wrong
    // and nothing about how.
    detail: [...frame.querySelectorAll('textarea')]
      .map((f, i) => `f${i} h=${Math.round(f.getBoundingClientRect().height)} sh=${f.scrollHeight} w=${Math.round(f.getBoundingClientRect().width)}`)
      .join(' | '),
  };

  box.remove();
  return result;
}

export function runSweep(): { pass: number; fail: number; failures: CellResult[] } {
  installChromeStyles(document.head);
  const failures: CellResult[] = [];
  let pass = 0;

  const surfaces: ReadonlyArray<readonly [string, SurfaceModel]> = [
    ['PE', PE_FIXTURE], ['MPS-1', MPS_FIRST_FIXTURE],
    ['MPS-2', MPS_CONTINUATION_FIXTURE], ['PEF', PEF_FIXTURE],
  ];

  for (const [label, fixture] of surfaces) {
    // The full size grid with the fixture's own content…
    for (const [w, h] of SIZES) {
      const cell = sweepCell(fixture, label, 'fixture', w, h);
      if (cell.headerVisible && cell.rowVisible && cell.footerVisible && cell.noHOverflow && cell.notGrown && cell.noInjection && cell.fieldsShowContent) pass += 1;
      else failures.push(cell);
    }
    // WHERE `overflow-wrap: anywhere` ACTUALLY MATTERS. A long token in the body
    // proves nothing about it: the body is a textarea, which soft-wraps by its
    // own rules whatever the CSS says — verified by turning the property off and
    // watching the body-only cells still pass. The property governs the
    // NON-textarea slots (labels, notes, hints, header), so the stress has to go
    // there. Same mistake the escaping payload made, found the same way.
    for (const [name, text] of [
      ['2000-char token in every slot', 'x'.repeat(2000)],
      ['5000-char paragraph in every slot', 'word '.repeat(1000).trim()],
    ] as const) {
      // 360x230 and 360x180 are the sizes that matter most here: a header made
      // tall by long content, in a box short enough that it MUST shrink to leave
      // the options band a row. That is the panel bug's exact geometry, and
      // without these sizes turning the header's `flex: 0 1 auto` into
      // `0 0 auto` — the C-2 core — passed the whole sweep.
      for (const [w, h] of [[1440, 800], [600, 300], [360, 230], [360, 180]] as const) {
        const cell = sweepCell(withPayloadEverywhere(fixture, text), label, name, w, h);
        if (cell.headerVisible && cell.rowVisible && cell.footerVisible && cell.noHOverflow && cell.notGrown && cell.noInjection && cell.fieldsShowContent) pass += 1;
        else failures.push(cell);
      }
    }

    // Every innerHTML slot carrying the live payload, once per surface.
    {
      const cell = sweepCell(
        withPayloadEverywhere(fixture, 'a < b & "c" > d <img src=x onerror="window.__pwned=1">'),
        label, 'payload in every slot', 1440, 800,
      );
      if (cell.headerVisible && cell.rowVisible && cell.footerVisible && cell.noHOverflow && cell.notGrown && cell.noInjection && cell.fieldsShowContent) pass += 1;
      else failures.push(cell);
    }

    // …and the content matrix at a wide, a narrow and the bug-range size.
    for (const [contentName, text] of CONTENT_CASES) {
      for (const [w, h] of [[1440, 800], [600, 300], [360, 230]] as const) {
        const cell = sweepCell(withBodyText(fixture, text), label, contentName, w, h);
        if (cell.headerVisible && cell.rowVisible && cell.footerVisible && cell.noHOverflow && cell.notGrown && cell.noInjection && cell.fieldsShowContent) pass += 1;
        else failures.push(cell);
      }
    }
  }

  return { pass, fail: failures.length, failures };
}

function renderSweepReport(): void {
  const { pass, fail, failures } = runSweep();
  const banner = document.getElementById('banner')!;
  banner.textContent = fail === 0
    ? `SWEEP PASS — ${pass}/${pass + fail} cells green`
    : `SWEEP FAIL — ${fail} of ${pass + fail} cells failed`;
  banner.className = fail === 0 ? 'pass' : 'fail';

  const detail = document.getElementById('failures')!;
  for (const f of failures) {
    const row = document.createElement('div');
    const flags = Object.entries(f)
      .filter(([k, v]) => v === false && k !== 'surface' && k !== 'content')
      .map(([k]) => k).join(', ');
    row.textContent = `${f.surface} · ${f.content} · ${f.w}×${f.h} → ${flags}   [${f.detail}]`;
    detail.appendChild(row);
  }
  // Reported two ways: the console line for a Chrome --dump-dom run, and a POST
  // so browsers WITHOUT that flag can be measured too. Firefox has no
  // --dump-dom, and C-3 names Firefox first.
  report('SWEEP', pass, fail, failures.slice(0, 8).map((f) => `${f.surface} · ${f.content} · ${f.w}x${f.h} [${f.detail}]`));
}

// -- the functionality run (?e2e=1) ------------------------------------------
//
// The controller's behaviour has only ever been driven in jsdom, which has no
// layout, no real focus model and a synthetic event loop. These scenarios run
// the SAME assertions against a real engine, where focus, selection and event
// dispatch are the browser's own. Each writes a line into the page so a headless
// `--dump-dom` can read the verdict without a driver library.

interface Scenario { name: string; run: () => string | null | Promise<string | null> }

function e2eScenarios(): Scenario[] {
  const mount = (initial: SurfaceId) => {
    const host = document.createElement('div');
    document.getElementById('sweep-stage')!.appendChild(host);
    const events: SurfaceEvent[] = [];
    const controller = createSurfaceController(host, {
      registry: FIXTURES, initial, onEvent: (e) => events.push(e),
    });
    return { host, controller, events };
  };
  // Same surfaces as everything else — the refinement rows are part of them —
  // with the hook that makes those rows do something.
  const mountD5 = (initial: SurfaceId) => {
    const host = document.createElement('div');
    document.getElementById('sweep-stage')!.appendChild(host);
    const events: SurfaceEvent[] = [];
    const controller = createSurfaceController(host, {
      registry: FIXTURES,
      initial,
      resolveActivation: createRefinementTransitions(REFINED_TEXTS),
      onEvent: (e) => events.push(e),
    });
    return { host, controller, events };
  };
  const press = (el: Element, key: string, init: KeyboardEventInit = {}): void => {
    el.dispatchEvent(new KeyboardEvent('keydown', {
      key, code: init.code ?? key, bubbles: true, cancelable: true, ...init,
    }));
  };
  const eq = (a: unknown, b: unknown, what: string): string | null =>
    JSON.stringify(a) === JSON.stringify(b) ? null : what + ': got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b);

  return [
    {
      name: 'the body field really holds the keyboard on mount',
      run() {
        const { host, controller } = mount('prompt_enhancement');
        const ok = document.activeElement === host.querySelector('textarea');
        controller.destroy();
        return ok ? null : 'the body textarea did not take real focus';
      },
    },
    {
      name: 'Enter sends the text the user actually typed',
      run() {
        const { host, controller, events } = mount('prompt_enhancement');
        const field = host.querySelector('textarea')!;
        field.value = 'typed in a real browser';
        press(field, 'Enter');
        const r = eq(events, [{ type: 'send', surface: 'prompt_enhancement', text: 'typed in a real browser' }], 'events');
        controller.destroy();
        return r;
      },
    },
    {
      name: 'a blank body is refused, silently (BF-1)',
      run() {
        const { host, controller, events } = mount('prompt_enhancement');
        host.querySelector('textarea')!.value = '   \n  ';
        press(host.querySelector('textarea')!, 'Enter');
        const r = eq(events.length, 0, 'events');
        controller.destroy();
        return r;
      },
    },
    {
      name: 'Enter on details merges locally and returns focus to the body',
      run() {
        const { host, controller, events } = mount('prompt_enhancement');
        press(controller.element, 'ArrowDown');
        press(host.querySelectorAll('textarea')[1]!, 'Enter');
        const body = host.querySelector('textarea')!.value;
        const errors = [
          body.includes(DETAILS_MERGE_HEADING) ? null : 'merge heading missing',
          host.querySelectorAll('textarea')[1]!.value === '' ? null : 'details not cleared',
          controller.getFocusIndex() === 0 ? null : 'focus did not return to the body',
          events[0]?.type === 'apply-details' ? null : 'apply-details not emitted',
        ].filter(Boolean);
        controller.destroy();
        return errors.length ? errors.join('; ') : null;
      },
    },
    {
      name: 'Ctrl+J inserts a newline at the real caret',
      run() {
        const { host, controller } = mount('prompt_enhancement');
        const field = host.querySelector('textarea')!;
        field.value = 'ab';
        field.setSelectionRange(1, 1);
        press(field, 'j', { code: 'KeyJ', ctrlKey: true });
        const r = eq([field.value, field.selectionStart], ['a\nb', 2], 'value/caret');
        controller.destroy();
        return r;
      },
    },
    {
      name: 'Ctrl+Shift+J stays native - it is the DevTools chord',
      run() {
        const { host, controller } = mount('prompt_enhancement');
        const field = host.querySelector('textarea')!;
        field.value = 'x';
        field.setSelectionRange(1, 1);
        press(field, 'J', { code: 'KeyJ', ctrlKey: true, shiftKey: true });
        const r = eq(field.value, 'x', 'value');
        controller.destroy();
        return r;
      },
    },
    {
      name: 'arrows clamp at both ends, never wrap',
      run() {
        // The last index comes from the fixture, not a literal. It was 2 until
        // the refinement rows joined the surface, and a hard-coded 2 turned a
        // content change into a false failure.
        const last = PE_FIXTURE.rows.filter((r) => r.kind !== 'note').length - 1;
        const { controller } = mount('prompt_enhancement');
        press(controller.element, 'ArrowUp');
        const top = controller.getFocusIndex();
        for (let i = 0; i < last + 4; i++) press(controller.element, 'ArrowDown');
        const bottom = controller.getFocusIndex();
        controller.destroy();
        return eq([top, bottom], [0, last], 'top/bottom focus');
      },
    },
    {
      name: 'Escape on PE cancels into the feedback surface',
      run() {
        const { controller, events } = mount('prompt_enhancement');
        press(controller.element, 'Escape');
        const r = eq([events[0]?.type, controller.getModel().id],
          ['cancelled', 'prompt_enhancement_feedback'], 'event/surface');
        controller.destroy();
        return r;
      },
    },
    {
      name: 'MPS-1 Escape leaves the editor before it declines',
      run() {
        const { host, controller, events } = mount('mps_first');
        const field = host.querySelector('textarea')!;
        field.value = 'a draft';
        press(field, 'Escape');
        const afterFirst = events.length === 0 && document.activeElement !== field;
        press(controller.element, 'Escape');
        const afterSecond = events[0]?.type === 'declined';
        const draftKept = host.querySelector('textarea')!.value === 'a draft';
        controller.destroy();
        return afterFirst && afterSecond && draftKept ? null
          : 'first=' + afterFirst + ' second=' + afterSecond + ' draftKept=' + draftKept;
      },
    },
    {
      name: 'typing does not rebuild the frame (500-line smoothness)',
      run() {
        const { host, controller } = mount('prompt_enhancement');
        const before = host.querySelector('.np-frame');
        const field = host.querySelector('textarea')!;
        field.value = Array.from({ length: 500 }, (_, i) => 'line ' + i).join('\n');
        for (let i = 0; i < 20; i++) {
          field.value += 'x';
          field.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const r = host.querySelector('.np-frame') === before ? null : 'the frame was rebuilt while typing';
        controller.destroy();
        return r;
      },
    },
    {
      name: 'handled keys do not reach the page (the ArrowUp hijack)',
      run() {
        const { controller } = mount('prompt_enhancement');
        let leaked = 0;
        const listener = (): void => { leaked += 1; };
        document.addEventListener('keydown', listener);
        press(controller.element, 'ArrowDown');
        press(controller.element, 'Escape');
        document.removeEventListener('keydown', listener);
        controller.destroy();
        return eq(leaked, 0, 'keys that escaped to the page');
      },
    },
    {
      name: 'PEF: a fixed reason submits, Other needs text',
      run() {
        const { host, controller, events } = mount('prompt_enhancement_feedback');
        press(controller.element, 'Enter');
        const fixed = events[0]?.type === 'feedback';
        press(controller.element, 'ArrowDown');
        press(controller.element, 'ArrowDown');
        const field = host.querySelector('textarea')!;
        press(field, 'Enter');
        const refusedEmpty = events.length === 1;
        field.value = 'my reason';
        press(field, 'Enter');
        const accepted = events.length === 2;
        controller.destroy();
        return fixed && refusedEmpty && accepted ? null
          : 'fixed=' + fixed + ' refusedEmpty=' + refusedEmpty + ' accepted=' + accepted;
      },
    },
    {
      name: 'the whole block dims when the caret leaves it — title AND body',
      run() {
        // Owner request 2026-08-24. Row selection and "I am typing here" must
        // not look identical, so the label above a field is bright only while
        // that field holds the keyboard. Measured as a real computed colour,
        // because a class name would prove nothing about what is on screen.
        const { host, controller } = mount('prompt_enhancement');
        const label = host.querySelector('.np-focused .np-label') as HTMLElement | null;
        const field = host.querySelector('textarea')!;
        if (!label) { controller.destroy(); return 'no focused label found'; }

        // `:focus` and `:focus-within` only match while the WINDOW has focus,
        // and Firefox honours that strictly where Chrome does not. A headless
        // window has none, so this engine cannot be asked the question at all —
        // reported as SKIPPED rather than passed, because a green tick here
        // would be a claim nothing measured.
        if (!document.hasFocus()) {
          controller.destroy();
          return 'skip: needs a focused window — :focus-within cannot match without one';
        }

        let blurFired = false;
        field.addEventListener('blur', () => { blurFired = true; });
        field.focus();
        const wasActive = document.activeElement === field;
        const editing = getComputedStyle(label).color;
        const editingBody = getComputedStyle(field).color;
        field.blur();
        const idle = getComputedStyle(label).color;
        const idleBody = getComputedStyle(field).color;
        controller.destroy();

        if (editing === idle) {
          // Say WHY, not just that they matched: whether the engine gave the
          // field focus at all, whether a blur event arrived, and whether the
          // document itself is focused (a headless window often is not).
          return `identical (${editing}) — hasFocus=${document.hasFocus()}`
            + ` activeWasField=${wasActive} blurFired=${blurFired}`
            + ` classAfter=${label.className}`;
        }
        // The BODY has to come down with its title. A dim heading over bright
        // text still reads as the active block — that was the second report.
        if (editingBody === idleBody) {
          return `the body looked identical editing and idle: ${editingBody}`;
        }
        // The active block must have its own internal hierarchy too — a title
        // and a body at the same colour and weight read as one flat run.
        if (editing === editingBody) {
          return `title and body are the same colour while editing: ${editing}`;
        }
        // Editing: the title is the brightest tier and its body one step below,
        // so the heading reads as a heading. Idle: both fall to the dim tier.
        const want = (l: string, b: string): boolean =>
          l === 'rgb(245, 245, 244)' && b === 'rgb(208, 208, 208)';
        const dim = (l: string, b: string): boolean =>
          l === 'rgb(168, 169, 168)' && b === 'rgb(168, 169, 168)';
        return want(editing, editingBody) && dim(idle, idleBody)
          ? null
          : `editing=[${editing} / ${editingBody}] idle=[${idle} / ${idleBody}]`;
      },
    },
    {
      name: 'a field full of newlines windows instead of pushing the frame apart',
      run() {
        // The reported bug: Ctrl+J thirty times grew the textarea to its
        // content, so the hint line and every row under it left the frame. The
        // CLI windows at about fourteen lines and prints
        // "↑ N more lines above" for the rest.
        const { host, controller } = mount('prompt_enhancement');
        const field = host.querySelector('textarea')!;
        const cap = 14 * 15;                                  // FIELD_VIEWPORT_LINES

        field.value = Array.from({ length: 40 }, (_, i) => `line ${i}`).join('\n');
        field.dispatchEvent(new Event('input', { bubbles: true }));
        const height = field.getBoundingClientRect().height;

        // …and scrolling to the bottom must report what is above.
        field.scrollTop = field.scrollHeight;
        field.dispatchEvent(new Event('scroll'));
        const group = field.closest('.np-field-group')!;
        const above = group.querySelector('.np-marker-row:not(.np-marker-hidden) .np-content');
        const text = above?.textContent ?? '(no marker shown)';
        controller.destroy();

        if (height > cap + 2) return `the field grew to ${Math.round(height)}px; the cap is ${cap}px`;
        return /^↑ \d+ more lines above$/.test(text)
          ? null : `expected an "N more lines above" marker, got: ${text}`;
      },
    },
    {
      name: 'a long prompt shows its marker on FIRST render, before any input',
      run() {
        // The case no interaction reaches. A prompt that is already long when
        // the surface opens windows immediately, and only the post-attach sizing
        // pass can put the marker up — the input and scroll listeners have not
        // fired yet and never will if the user just reads and presses Enter.
        const box = document.createElement('div');
        box.style.cssText = 'width:900px;height:600px;';
        document.getElementById('sweep-stage')!.appendChild(box);

        const long = { ...PE_FIXTURE, rows: PE_FIXTURE.rows.map((r) => (r.kind === 'field'
          ? { ...r, text: Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n') }
          : r)) };
        const frame = renderSurface(document, long, { focusIndex: 0 });
        box.appendChild(frame);
        growFields(frame);

        const marker = frame.querySelector('.np-marker-row:not(.np-marker-hidden) .np-content');
        const text = marker?.textContent ?? '(none)';
        box.remove();
        return /more lines (above|below)/.test(text)
          ? null : `no marker on first render, got: ${text}`;
      },
    },
    {
      name: 'the dock mounts hidden and the field sizes itself on show',
      run() {
        // THE PRODUCTION PATH, not an approximation of it. The dock renders its
        // host at display:none behind a CLOSED shadow root and shows it
        // afterwards; the first version of this scenario used a plain div,
        // which left the question of whether a ResizeObserver reaches across
        // the shadow boundary unanswered. It does.
        const dock = mountNexpathDock();
        const root = dock.mountEl.getRootNode();
        if (!(root instanceof ShadowRoot)) { dock.destroy(); return 'the dock is not in a shadow root'; }
        installChromeStyles(root);
        const controller = createSurfaceController(dock.mountEl, {
          registry: FIXTURES, initial: 'prompt_enhancement',
        });
        const field = dock.mountEl.querySelector('textarea');
        if (!field) { controller.destroy(); dock.destroy(); return 'no textarea in the dock'; }

        // Nothing may be written while the host is hidden: the observer alone
        // would still end up right, but only after a frame at 0px — a visible
        // flash. Asserting this is what keeps the guard and the observer two
        // separately verifiable fixes.
        const whileHidden = field.style.height;
        dock.show();

        // setTimeout rather than rAF: rAF does not fire for this path under
        // headless virtual time — a property of the harness, not of the code.
        return new Promise<string | null>((resolve) => {
          setTimeout(() => {
            const shown = Math.round(field.getBoundingClientRect().height);
            const wanted = field.scrollHeight;
            const roErrors = (window as unknown as Record<string, number>)['__roErrors'] ?? 0;
            controller.destroy();
            dock.destroy();
            const problems = [
              whileHidden === '0px' ? 'a height was written while hidden' : null,
              shown < wanted - 1 ? `after show ${shown}px for ${wanted}px of content` : null,
              shown < 14 ? `still collapsed at ${shown}px` : null,
              roErrors > 0 ? `${roErrors} ResizeObserver loop errors` : null,
            ].filter(Boolean);
            resolve(problems.length ? problems.join('; ') : null);
          }, 300);
        });
      },
    },
    {
      name: 'the busy skeleton renders and keeps the frame usable',
      run() {
        const { host, controller } = mount('prompt_enhancement');
        const field = host.querySelector('textarea')!;
        field.value = 'mid-edit when it arrived';

        const hintsBefore = host.querySelectorAll('.np-hint').length;
        controller.setBusy('⠋');
        // Re-queried, not reused: a render replaces the children, so the
        // reference captured above is a detached element still holding the old
        // value — the first version of this read it and reported the code
        // broken when the code was right.
        const skeleton = host.querySelector('textarea')!.value;
        const hintsWhileBusy = host.querySelectorAll('.np-hint').length;
        const rowsWhileBusy = host.querySelectorAll('.np-label').length;
        const editable = !host.querySelector('textarea')!.readOnly;

        controller.setBusy(null);
        const restored = host.querySelector('textarea')!.value;
        controller.destroy();

        const problems = [
          skeleton === '⠋ preparing…' ? null : `body was "${skeleton}"`,
          // The CLI hides the BODY's edit-keys hint and nothing else — the
          // details row's "Enter applies these details" is about a field that
          // still works while the wording is being prepared. Asserting zero
          // hints would have enforced hiding that too.
          hintsWhileBusy < hintsBefore ? null : `hints unchanged at ${hintsWhileBusy}`,
          hintsWhileBusy > 0 ? null : 'every hint went, including the details row hint',
          rowsWhileBusy >= 6 ? null : `only ${rowsWhileBusy} rows — the rest should render as normal`,
          editable ? 'the skeleton was editable' : null,
          restored === 'mid-edit when it arrived' ? null : `the edit came back as "${restored}"`,
        ].filter(Boolean);
        return problems.length ? problems.join('; ') : null;
      },
    },
    {
      name: 'typing never clips the line being written',
      async run() {
        // The converge step exists because growing a field can invalidate the
        // measurement that grew it: the band gains a scrollbar, the field
        // narrows by its width, and the text rewraps TALLER than the height
        // just set. `growFields` runs that step; the input listener did not, so
        // the clipping landed on the line being typed - exactly where the
        // reader is looking.
        //
        // EVERY NUMBER BELOW IS MEASURED. The first version of this scenario
        // typed filler into a fixed-height box and asserted no clipping, and it
        // could not fail: provoking the fault needs three things to coincide,
        // and fixed numbers only ever bought two of them.
        //
        //   1. the scrollbar must arrive ON the keystroke under test, not
        //      before it - at a fixed height it was already there;
        //   2. the field must still be under its 210px cap when it does, since
        //      a capped field scrolls on purpose and clipping there is correct;
        //   3. the width the scrollbar takes must actually change the WRAP
        //      COUNT, which depends entirely on the text and the font - filler
        //      that wraps identically at both widths can never clip.
        //
        // So all three are derived here instead of guessed: the scrollbar width
        // from a probe carrying the real `.np-scroll` class, the line height
        // from the field itself, a body length that provably needs another line
        // at the narrower width (searched with a hidden clone of the real
        // field), and the box height that makes the band cross its threshold on
        // exactly that keystroke (binary-searched). Nothing is tuned to this
        // machine's font, and every step that could quietly not happen is
        // asserted, so a pass cannot mean "the setup fell through".
        //
        // And there is a FOURTH condition, which is a property of the platform
        // rather than of this scenario, and which two earlier explanations in
        // this file got wrong before it was measured: whether the field's own
        // scrollbar is wider than the band's. See (a2). Where it is - Chrome on
        // Windows, the one place that has actually been measured - `autoGrow`
        // already measures at a narrower width than the text finally wraps at,
        // so it always writes a generous height and the converge step cannot be
        // provoked no matter how the geometry is arranged. This scenario
        // reports that as a SKIP, never as a pass.
        const box = document.createElement('div');
        box.style.cssText = 'width:360px;height:900px;overflow:hidden;';
        document.getElementById('sweep-stage')!.appendChild(box);

        const host = document.createElement('div');
        // The real dock hands the controller a height-constrained host. Without
        // this the frame's `height: 100%` resolves against an auto-height
        // parent, the band grows to fit instead of scrolling, and no scrollbar
        // exists at all - the scenario would exercise nothing it is named for.
        host.style.cssText = 'height:100%;';
        box.appendChild(host);
        const controller = createSurfaceController(host, {
          registry: FIXTURES, initial: 'prompt_enhancement',
        });
        const field = host.querySelector('textarea')!;
        const band = host.querySelector('.np-scroll') as HTMLElement;
        const done = (why: string | null): string | null => {
          controller.destroy();
          box.remove();
          return why;
        };
        const scrollbarNow = (): number => band.offsetWidth - band.clientWidth;

        // (a) WHAT THE SCROLLBAR COSTS, read off the real stylesheet rather
        //     than from the 8px the CSS asks for - Chrome renders 10.
        const gauge = document.createElement('div');
        gauge.className = band.className;
        gauge.style.cssText = 'position:absolute;top:-9999px;width:200px;height:40px;overflow-y:auto;';
        const filler = document.createElement('div');
        filler.style.height = '400px';
        gauge.appendChild(filler);
        box.appendChild(gauge);
        const scrollbar = gauge.offsetWidth - gauge.clientWidth;
        gauge.remove();
        if (scrollbar <= 0) {
          return done(`skip: this browser's band scrollbar takes no layout width (${scrollbar}px), so the narrowing under test cannot occur`);
        }

        // (a2) WHAT THE FIELD'S OWN SCROLLBAR COSTS - which decides whether the
        //      fault can exist on this machine at all. `autoGrow` measures with
        //      `height: auto`, and that makes the content overflow the
        //      textarea's two-row default box, so the measurement happens WITH
        //      the field's own scrollbar in place. If that scrollbar is wider
        //      than the band's, the measured width is already narrower than the
        //      width the text finally wraps at, the height written is generous,
        //      and nothing can clip. Chrome on Windows is that case: measured
        //      15px field against 10px band.
        //
        //      The other case is an OVERLAY scrollbar on the field while the
        //      band's rule forces a classic one - the measurement then happens
        //      at full width and the converge step is the only thing holding
        //      the typed line on screen. Firefox here is exactly that, measured
        //      0px field against 8px band (its `scrollbar-width: thin`), and it
        //      is where this scenario catches the regression: removing the
        //      converge step fails it with 15px hidden. macOS Chrome is the
        //      same shape, an unstyled textarea keeping the platform overlay
        //      while `.np-scroll`'s `::-webkit-scrollbar` rule forces a classic
        //      one, which is the likeliest origin of the original report.
        const fieldGauge = field.cloneNode(false) as HTMLTextAreaElement;
        fieldGauge.style.cssText = 'position:absolute;top:-9999px;left:0;width:200px;height:30px;max-height:none;';
        field.parentElement!.appendChild(fieldGauge);
        fieldGauge.value = `${'x\n'.repeat(40)}x`;
        const fieldScrollbar = fieldGauge.offsetWidth - fieldGauge.clientWidth;
        fieldGauge.remove();

        // (b) A BODY THAT PROVABLY REWRAPS TALLER when the field narrows.
        const wide = field.clientWidth;
        const narrow = wide - scrollbar;
        const clone = field.cloneNode(false) as HTMLTextAreaElement;
        // `overflow-y: hidden` is not cosmetic here. The real rule is `auto`,
        // and a clone left at `auto` with `height: auto` overflows its own
        // two-row default box, grows its OWN scrollbar, and then measures the
        // text at ~15px narrower than the width it was asked about - which
        // reports a rewrap that the real field never performs. Measured: the
        // search claimed 5 lines at 310px where the field renders 4.
        clone.style.cssText = 'position:absolute;top:-9999px;left:0;max-height:none;overflow-y:hidden;';
        field.parentElement!.appendChild(clone);
        clone.value = 'x';
        clone.style.height = 'auto';
        const lineHeight = clone.scrollHeight;
        const linesAt = (width: number, text: string): number => {
          clone.style.width = `${width}px`;
          clone.value = text;
          clone.style.height = 'auto';
          return Math.round(clone.scrollHeight / lineHeight);
        };
        let body = '';
        let lines = 0;
        // Word length matters as much as word count. A line holds
        // `floor((width + space) / wordWidth)` words, so the scrollbar only
        // changes the count when its width straddles a word boundary - with
        // three-character words that boundary is ~24px apart and a 10px
        // scrollbar can miss it entirely, which is exactly why the search below
        // tries several word lengths rather than one.
        search:
        for (const word of ['x', 'xx', 'xxx', 'xxxx']) {
          for (let words = 8; words <= 600; words += 1) {
            const text = Array.from({ length: words }, () => word).join(' ');
            const atWide = linesAt(wide, text);
            // Keep clear of the 14-line cap in BOTH states: the fault only
            // counts while the field is still growing freely.
            if (atWide + 1 > 12) break;
            // And keep clear of the OTHER end. A body that is one line wide is
            // useless here even if it rewraps: the field starts at one line, so
            // typing it grows the band by nothing and no threshold is crossed.
            if (atWide < 4) continue;
            if (linesAt(narrow, text) > atWide) { body = text; lines = atWide; break search; }
          }
        }
        clone.remove();
        if (!body || lineHeight <= 0) {
          return done('skip: no body below the field cap rewraps taller when the field loses the scrollbar');
        }

        // (c) THE BOX HEIGHT that makes the band cross on that keystroke. Found
        //     by asking the real layout, with the field pinned short and then
        //     pinned tall, so nothing depends on guessing the chrome's height.
        const crosses = (height: number): boolean => {
          box.style.height = `${height}px`;
          field.style.height = `${lineHeight}px`;
          const roomWhileShort = band.scrollHeight <= band.clientHeight;
          field.style.height = `${lines * lineHeight}px`;
          const tightWhenGrown = band.scrollHeight > band.clientHeight;
          return roomWhileShort && tightWhenGrown;
        };
        let chosen = 0;
        let lo = 120;
        let hi = 900;
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          box.style.height = `${mid}px`;
          field.style.height = `${lines * lineHeight}px`;
          if (band.scrollHeight > band.clientHeight) { chosen = mid; lo = mid + 1; } else hi = mid - 1;
        }
        // The search above lands on the EDGE of the valid window - the tallest
        // box that still overflows - which leaves the band over its threshold
        // by a single pixel. Firefox declined to render a scrollbar for a 1px
        // overflow at that edge (measured: bandSc=270 bandCl=269, scrollbar
        // 0px), so walk back to the middle of the window, where the overflow is
        // a comfortable margin rather than a rounding error.
        if (chosen) {
          let lowest = chosen;
          for (let step = 1; step <= 60 && crosses(chosen - step); step += 1) lowest = chosen - step;
          chosen = Math.floor((lowest + chosen) / 2);
        }
        if (!chosen || !crosses(chosen)) {
          box.style.height = `${chosen || 900}px`;
          field.style.height = `${lineHeight}px`;
          const shortS = band.scrollHeight; const shortC = band.clientHeight;
          field.style.height = `${lines * lineHeight}px`;
          const tallS = band.scrollHeight; const tallC = band.clientHeight;
          return done(`skip: no box height crosses [chosen=${chosen} lh=${lineHeight} lines=${lines} short=${shortS}/${shortC} tall=${tallS}/${tallC}]`);
        }
        box.style.height = `${chosen}px`;

        // Back to a one-line field, through the real input path, and let the
        // controller's ResizeObserver work settle - it defers out of the
        // observation cycle, and the keystroke below must be the only thing
        // this scenario measures.
        field.style.height = '';
        field.value = 'x';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => { setTimeout(resolve, 0); });
        await new Promise((resolve) => { setTimeout(resolve, 0); });
        if (scrollbarNow() !== 0) {
          return done('skip: the band already carried a scrollbar before the keystroke under test');
        }

        // (d) THE KEYSTROKE this scenario is about.
        field.value = body;
        field.dispatchEvent(new Event('input', { bubbles: true }));

        // The provocation has to have HAPPENED. Without these two checks a
        // green result would mean "nothing narrowed", which is how the first
        // version of this scenario passed while testing nothing.
        //
        // They report SKIP, not FAIL, and the distinction is deliberate: they
        // describe an environment failing to stage the fault, not the product
        // failing. What they must never do is let the run go GREEN, because a
        // green line would claim the converge step is covered. Band scrolling
        // itself is not left untested by this: the C-2 sweep asserts it across
        // 164 cells.
        //
        // Firefox reached the first of these while the box height still sat at
        // the EDGE of its valid window, where the band cleared its threshold by
        // one pixel and Firefox declined to draw a scrollbar for that; walking
        // to the middle of the window fixed it, and Firefox now runs the whole
        // scenario. Kept because the next browser may not.
        if (scrollbarNow() !== scrollbar) {
          return done(`skip: the keystroke did not bring the band scrollbar in (${scrollbarNow()}px of an expected ${scrollbar}px), so nothing narrowed [box=${chosen} lines=${lines} fieldH=${field.clientHeight} bandSc=${band.scrollHeight} bandCl=${band.clientHeight}]`);
        }
        if (field.clientWidth !== narrow) {
          return done(`skip: the field is ${field.clientWidth}px, expected it to narrow to ${narrow}px`);
        }
        const clipped = field.scrollHeight - field.clientHeight;

        // Everything above is now VERIFIED on this machine: the band crossed on
        // this keystroke, the field narrowed, and the body genuinely needs one
        // more line at that width. Only the fault itself can be out of reach -
        // see (a2). Reporting that as a skip rather than a pass is the whole
        // point: a green line here would otherwise mean "the converge step is
        // covered", and on this platform it is not.
        if (fieldScrollbar >= scrollbar) {
          return done(`skip: setup verified (${lines}->${lines + 1} lines at ${narrow}px), but autoGrow measures with the field's own ${fieldScrollbar}px scrollbar — wider than the band's ${scrollbar}px — so the height it writes is already generous and no clip is reachable. This bites where the field's scrollbar is an overlay and the band's is not: the macOS default.`);
        }
        return done(clipped > 1
          ? `${clipped}px of the line being typed is hidden — the field was sized for ${lines} lines at ${wide}px and then rewrapped at ${narrow}px`
          : null);
      },
    },
    {
      name: 'a short field neither windows nor shows a marker',
      run() {
        const { host, controller } = mount('prompt_enhancement');
        const field = host.querySelector('textarea')!;
        field.value = 'one line';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        const group = field.closest('.np-field-group')!;
        const shown = group.querySelector('.np-marker-row:not(.np-marker-hidden)');
        controller.destroy();
        return shown ? 'a marker appeared for text that fits' : null;
      },
    },
    {
      name: 'the editable prompt draws no focus ring',
      run() {
        // The CLI has no box around its editor; a browser outline reads as a
        // form control dropped into a terminal frame.
        const { host, controller } = mount('prompt_enhancement');
        const field = host.querySelector('textarea')!;
        field.focus();
        // Every value read BEFORE destroy: a CSSStyleDeclaration from
        // getComputedStyle goes empty once its element leaves the document, and
        // reading through it afterwards reports '' for everything. The first
        // version of this scenario did exactly that and blamed the stylesheet.
        const style = getComputedStyle(field);
        const outlineStyle = style.outlineStyle;
        const outlineWidth = style.outlineWidth;
        const border = style.borderTopWidth;
        controller.destroy();
        // `outline: none` leaves outline-width at its initial `medium` (3px) —
        // that is the COMPUTED value; nothing is painted while the style is
        // none. So the style is what decides, not the width.
        return outlineStyle === 'none' && border === '0px'
          ? null : `outline-style=${outlineStyle} width=${outlineWidth} border=${border}`;
      },
    },
    {
      name: 'D5: Shorter opens the refinement view with the recomposed body',
      run() {
        const { host, controller } = mountD5('prompt_enhancement');
        press(controller.element, 'ArrowDown');
        press(controller.element, 'ArrowDown');   // Shorter
        press(controller.element, 'Enter');
        const labels = [...host.querySelectorAll('.np-label')].map((el) => el.textContent);
        const r = eq([labels, host.querySelector('textarea')!.value],
          [['Use enhanced prompt', '\u2190 Go back'], PE_REFINED_TEXT], 'labels/body');
        controller.destroy();
        return r;
      },
    },
    {
      name: 'D5: Go back restores the main view AND the edited body',
      run() {
        const { host, controller } = mountD5('prompt_enhancement');
        host.querySelector('textarea')!.value = 'edited before Shorter';
        press(controller.element, 'ArrowDown');
        press(controller.element, 'ArrowDown');
        press(controller.element, 'Enter');       // -> refinement
        press(controller.element, 'ArrowDown');   // Go back
        press(controller.element, 'Enter');
        const labels = [...host.querySelectorAll('.np-label')].map((el) => el.textContent);
        const errors = [
          labels.includes('Shorter') ? null : 'did not return to the main view',
          host.querySelector('textarea')!.value === 'edited before Shorter'
            ? null : 'the edited body was not restored',
        ].filter(Boolean);
        controller.destroy();
        return errors.length ? errors.join('; ') : null;
      },
    },
    {
      name: 'D5: a blank body refuses the directional, silently (bug B)',
      run() {
        const { host, controller } = mountD5('prompt_enhancement');
        host.querySelector('textarea')!.value = '   ';
        press(controller.element, 'ArrowDown');
        press(controller.element, 'ArrowDown');
        press(controller.element, 'Enter');
        const stayed = [...host.querySelectorAll('.np-label')]
          .map((el) => el.textContent).includes('Shorter');
        controller.destroy();
        return stayed ? null : 'the blank body was allowed to open a refinement';
      },
    },
    {
      name: 'D5: MPS-1 keeps its Sequence plan through the refinement',
      run() {
        const { host, controller } = mountD5('mps_first');
        press(controller.element, 'ArrowDown');
        press(controller.element, 'ArrowDown');   // Shorter
        press(controller.element, 'Enter');
        const errors = [
          host.querySelector('textarea')!.value === MPS_REFINED_TEXT ? null : 'body not recomposed',
          (host.textContent ?? '').includes('Sequence plan') ? null : 'the Sequence plan vanished',
        ].filter(Boolean);
        controller.destroy();
        return errors.length ? errors.join('; ') : null;
      },
    },
  ];
}

async function renderE2eReport(): Promise<void> {
  (window as unknown as Record<string, unknown>)['__roErrors'] = 0;
  window.addEventListener('error', (e) => {
    if (String(e.message).includes('ResizeObserver')) {
      const w = window as unknown as Record<string, number>;
      w['__roErrors'] = (w['__roErrors'] ?? 0) + 1;
    }
  });
  installChromeStyles(document.head);
  // Awaited one at a time: a scenario that waits for a ResizeObserver frame can
  // only answer with a promise, and running them concurrently would let one
  // scenario's DOM churn land inside another's measurement.
  const results: Array<{ name: string; failure: string | null }> = [];
  for (const s of e2eScenarios()) {
    let failure: string | null;
    try {
      // A scenario that never settles must not take the suite with it. A throw
      // inside a requestAnimationFrame callback does NOT reject the promise it
      // was created for, so the await simply waits forever and the page renders
      // no banner at all — silence that reads exactly like a page that failed
      // to load. Losing one scenario to a timeout is recoverable; losing the
      // whole run with no output is not.
      failure = await Promise.race([
        Promise.resolve(s.run()),
        new Promise<string>((resolve) => setTimeout(
          () => resolve('timed out after 5s — did an async callback throw?'), 5000)),
      ]);
    } catch (e) { failure = 'threw: ' + String(e); }
    results.push({ name: s.name, failure });
  }
  const skipped = results.filter((r) => r.failure?.startsWith('skip: '));
  const failed = results.filter((r) => r.failure && !r.failure.startsWith('skip: '));
  const banner = document.getElementById('banner')!;
  const tail = skipped.length ? ` (${skipped.length} skipped)` : '';
  banner.textContent = failed.length === 0
    ? `E2E PASS - ${results.length - skipped.length}/${results.length - skipped.length} scenarios green${tail}`
    : `E2E FAIL - ${failed.length} of ${results.length} scenarios failed${tail}`;
  banner.className = failed.length === 0 ? 'pass' : 'fail';

  const detail = document.getElementById('failures')!;
  for (const r of results) {
    const row = document.createElement('div');
    const mark = !r.failure ? 'ok    ' : r.failure.startsWith('skip: ') ? 'SKIP  ' : 'FAIL  ';
    row.textContent = mark + r.name + (r.failure ? ' -> ' + r.failure : '');
    detail.appendChild(row);
  }
  // Names travel with the counts: a bare number tells you Gecko disagreed and
  // nothing about where, and Firefox has no --dump-dom to read the page with.
  report('E2E', results.length - failed.length - skipped.length, failed.length,
    [...failed, ...skipped].map((r) => r.name + ' -> ' + r.failure));
}

/**
 * Publish a verdict. The console line serves a Chrome `--dump-dom` run; the POST
 * serves every other engine, Firefox above all, which has no such flag.
 * Fire-and-forget: a harness opened from the filesystem has no server, and that
 * must not turn into an unhandled rejection on the page.
 */
function report(kind: string, pass: number, fail: number, failures: string[] = []): void {
  const payload = JSON.stringify({ kind, pass, fail, failures, ua: navigator.userAgent });
  console.log(kind + ' ' + payload);
  void fetch('/result', { method: 'POST', body: payload }).catch(() => undefined);
}

// -- boot --------------------------------------------------------------------

// Boot only on the harness page itself. The guard is what lets a test import
// `runSweep` without the module trying to mount into a page that is not there.
if (document.getElementById('bar') && document.getElementById('sweep-stage')) {
  const mode = new URLSearchParams(location.search);
  if (mode.get('sweep') === '1') renderSweepReport();
  else if (mode.get('e2e') === '1') void renderE2eReport();
  else mountInteractive();
}
