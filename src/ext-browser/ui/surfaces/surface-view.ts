// ============================================================================
// Renders a SurfaceModel into the CLI frame.
// ----------------------------------------------------------------------------
// Sub-phases D3.2, D3.3 and D3.4: the row order, the editable fields, and the
// focus model.
//
// ONE RENDERER, NOT FOUR. The four CLI surfaces share a single line grammar —
// header, rule, blank, pinch, cues, why-help, rows, footer — so a surface module
// supplies a model and never a renderer. D4 adds three more fixtures, not three
// more of these.
//
// WHAT LIVES WHERE. `chrome.ts` knows how a row is made; this file knows which
// rows a frame has and in what order. Nothing here reaches for a colour or a
// class name.
// ============================================================================

import {
  FRAME_LINE_HEIGHT_PX,
  buildBlankRow,
  buildBulletRow,
  buildFooterRow,
  buildFrame,
  buildHeader,
  buildHintRow,
  buildNoteRow,
  buildScrollMarkerRow,
  buildTextRow,
} from './chrome.js';
import type { SurfaceModel, SurfaceState } from './surface-model.js';

/**
 * Grow a textarea to fit its content (D3.3).
 *
 * The frame never grows with it: the field lives inside `.np-scroll`, which is
 * the only part of the frame allowed to take space, and which scrolls once the
 * band is full. Reset to `auto` first, or the height only ever ratchets upward —
 * `scrollHeight` of an already-tall box includes the slack.
 *
 * jsdom reports `scrollHeight` as 0, so this cannot be proven in a unit test;
 * the live proof is D7's content sweep.
 */
export function autoGrow(field: HTMLTextAreaElement): void {
  // A DETACHED element cannot be measured: `scrollHeight` is 0 for anything not
  // in the document. Writing that back as a height is how the field ended up
  // 0px tall and the prompt invisible until the first keystroke — the renderer
  // builds the frame detached, so the constructor's own call always measured
  // nothing. Never write a height that was not actually measured.
  if (!field.isConnected) return;
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
}

/**
 * Size every field under `root` to its content. Call once AFTER the frame is in
 * the document — that is the only moment a textarea can be measured.
 *
 * Separate from rendering because the renderer returns a detached frame by
 * design (it is a pure builder, and the tests depend on that). The cost is this
 * one call at each attach site, and the sweep fails if it is ever missed.
 */
/** `↓ N more lines below · the whole prompt is included`, the CLI's wording. */
const BELOW_SUFFIX = ' · the whole prompt is included';

/**
 * Update one field's scroll markers from what is actually on screen.
 *
 * The counts come from the live scroll position, not from the text: what is
 * hidden depends on where the user has scrolled to, which is exactly what the
 * CLI's own marker reports.
 */
export function updateFieldMarkers(field: HTMLTextAreaElement): void {
  const group = field.closest('.np-field-group');
  if (!group) return;
  const markers = group.querySelectorAll('.np-marker-row');
  const [above, below] = markers;
  if (!above || !below) return;

  const lines = (n: number): number => Math.max(0, Math.round(n / FRAME_LINE_HEIGHT_PX));
  const hiddenAbove = lines(field.scrollTop);
  const hiddenBelow = lines(field.scrollHeight - field.scrollTop - field.clientHeight);

  const set = (el: Element, text: string, show: boolean): void => {
    el.querySelector('.np-content')!.textContent = text;
    el.classList.toggle('np-marker-hidden', !show);
  };
  set(above, `↑ ${hiddenAbove} more lines above`, hiddenAbove > 0);
  set(below, `↓ ${hiddenBelow} more lines below${BELOW_SUFFIX}`, hiddenBelow > 0);
}

export function growFields(root: ParentNode): void {
  const fields = [...root.querySelectorAll('textarea')];

  // Pass zero applies the CLI's window policy as per-field max-heights BEFORE
  // measuring: a field with a fixed line window (the PE details field — 5
  // rows, `cli-submit-popup.ts:1335`) caps there; every other field fills the
  // band adaptively (:1354-1365 — the CLI measures the chrome and gives the
  // body the rest). Fixed caps first, so the adaptive fields measure against
  // the already-clamped siblings, the CLI's own ordering (:1344-1346).
  const adaptive: HTMLTextAreaElement[] = [];
  for (const field of fields) {
    const lines = Number(field.dataset['maxLines'] ?? '');
    if (Number.isFinite(lines) && lines > 0) {
      field.style.maxHeight = `${lines * FRAME_LINE_HEIGHT_PX}px`;
    } else {
      adaptive.push(field);
    }
  }

  // Pass one sizes each field to its content.
  for (const field of fields) autoGrow(field);

  // Adaptive fill: the band's free space (what the chrome does not use) goes
  // to the unwindowed field, floored at the CLI's 4-row minimum (:1365). Only
  // meaningful with real layout — jsdom and hidden docks skip it.
  for (const field of adaptive) {
    const band = field.closest('.np-scroll') as HTMLElement | null;
    if (!band || band.clientHeight <= 0) continue;
    const chromeHeight = band.scrollHeight - field.offsetHeight;
    const available = Math.max(4 * FRAME_LINE_HEIGHT_PX, band.clientHeight - chromeHeight);
    field.style.maxHeight = `${available}px`;
    autoGrow(field); // re-measure under the new cap
  }

  // Pass two exists because pass one can invalidate its own measurement.
  // Growing a field pushes the scroll band into overflow, a scrollbar appears,
  // the field narrows, and the text rewraps TALLER than the height just set —
  // measured at 360px wide with a 2000-character token: 825px set, 840px
  // needed, the last line clipped.
  //
  // It must NOT be another autoGrow. That resets to `auto` first, which
  // collapses the field, removes the overflow, takes the scrollbar away, widens
  // the field and measures 825 all over again — an oscillation, not a
  // convergence, which is why running autoGrow twice changed nothing. This pass
  // only ever grows, from the settled width, so it terminates.
  for (const field of fields) {
    if (!field.isConnected) continue;
    if (field.scrollHeight > field.clientHeight) field.style.height = `${field.scrollHeight}px`;
  }

  // Sizing settles the window, so the markers can only be right after it — and
  // the line numbers are measured against that same settled layout.
  for (const field of fields) { updateFieldMarkers(field); updateFieldLineNumbers(field); }
}

/**
 * Scroll math for keeping the caret inside the field's window: above the
 * window → scroll up to it; below → scroll down just enough; inside → leave
 * the scroll alone. Pure, so the clamp is testable where jsdom cannot lay out.
 */
export function clampScrollToCaret(
  caretTop: number,
  lineHeight: number,
  scrollTop: number,
  clientHeight: number,
): number {
  if (caretTop < scrollTop) return caretTop;
  const caretBottom = caretTop + lineHeight;
  if (caretBottom > scrollTop + clientHeight) return Math.max(0, caretBottom - clientHeight);
  return scrollTop;
}

/**
 * Pixel top of the caret inside a textarea, by mirror measurement: replicate
 * the field's text layout in a hidden block, mark the caret position, read the
 * marker's offset. A textarea offers no caret-geometry API, and neither
 * setSelectionRange nor setRangeText scrolls — this is the browser's missing
 * half of the CLI's cursor math (`promptEnhancementCursorVisualPositionV1`).
 */
export function measureCaretTopPx(field: HTMLTextAreaElement): number {
  return measureOffsetPx(field, field.selectionStart ?? 0).top;
}

/**
 * Where a given character offset sits inside a textarea, in pixels relative to
 * the field's own box. The mirror technique described above, generalised from
 * the caret to any offset — the caret is just `selectionStart`.
 *
 * Returns zeros without layout (jsdom, a hidden dock), which every caller must
 * treat as "cannot place" rather than as the origin.
 */
export function measureOffsetPx(field: HTMLTextAreaElement, offset: number): { top: number; left: number } {
  const doc = field.ownerDocument;
  const mirror = doc.createElement('div');
  mirror.style.cssText =
    'position:absolute;visibility:hidden;left:-9999px;top:0;white-space:pre-wrap;overflow-wrap:break-word;';
  const view = doc.defaultView;
  if (view) {
    const cs = view.getComputedStyle(field);
    mirror.style.font = cs.font;
    mirror.style.lineHeight = cs.lineHeight;
    mirror.style.letterSpacing = cs.letterSpacing;
    mirror.style.padding = cs.padding;
    mirror.style.border = cs.border;
    mirror.style.boxSizing = cs.boxSizing;
    mirror.style.width = `${field.clientWidth}px`;
  }
  mirror.textContent = field.value.slice(0, offset);
  const marker = doc.createElement('span');
  marker.textContent = '​';
  mirror.appendChild(marker);
  doc.body.appendChild(mirror);
  const top = marker.offsetTop;
  const left = marker.offsetLeft;
  mirror.remove();
  return { top, left };
}

// ── the field's bold ─────────────────────────────────────────────────────────
//
// The CLI paints its emphasis into the body it draws. A textarea carries no
// markup at all, so the same thing here is a MIRROR: a div behind the field with
// the same text and the same box, the marks in `<strong>`, and the field's own
// text turned transparent so the mirror is what the reader sees. The textarea
// stays the only editable element and the only thing that is sent — the send
// path, the readonly lock, the chords, caret-follow and windowing are untouched.
//
// 🔑 SIX THINGS ARE MEASURED, NOT CHOSEN, and each one was wrong first:
//
//  1. WIDTH IS THE FIELD'S, NOT THE ROW'S AND NOT `inset: 0`. The field takes a
//     scrollbar out of its own text area (15 px, measured), so a mirror pinned to
//     the row or stretched over the field's outer box is that much too wide and
//     its wrapping walks away from the field's — 30 px out by one offset, 45 by
//     the next. And the row is not the field's box either: a character of padding
//     and a border put the text 8.5 px in.
//  2. RE-MEASURE ON INPUT, not only on resize. That scrollbar appears when the
//     body grows, so the width moves while the reader TYPES. An overlay that
//     measured once is 45 px wrong by the end of the body — measured, with the
//     mutation that proves it.
//  3. THE FIELD'S COMPUTED WRAP RULE, copied. A textarea computes `break-word`
//     from the UA stylesheet while the row sets `anywhere`, so a mirror that
//     inherits gets a rule the field does not have.
//  4. A NEGATIVE z-index. "Behind" is not what DOM order gives: an absolutely
//     positioned element paints ABOVE static content whatever the order, so
//     without this the mirror lands in front of the field.
//  5. `caret-color` ON THE FIELD, explicitly. It defaults to the text colour, and
//     the text has to go transparent for the mirror to show — so the caret goes
//     transparent with it and the reader loses the cursor in the field they are
//     editing.
//  6. AND THE MIRROR ONLY DRAWS IF BOLD IS THE SAME WIDTH in the font that
//     actually resolved. In a true monospace face it is, and that was measured —
//     but on one browser and one of the six families the stack names. Where it is
//     NOT, every mark would push the rest of its line sideways and the mirror
//     would sit visibly off the text. So the mirror measures the resolved font
//     before it draws, and draws nothing when the answer is no: the reader loses
//     the bold, which is the honest fallback, and never gets a mirror
//     that does not line up.

/** Where a field's bold ranges come from, when the model supplied a rule. */
const fieldBoldRanges = new WeakMap<
  HTMLTextAreaElement,
  (text: string) => readonly { start: number; end: number }[]
>();

/**
 * Does bold change the advance width in the font this element actually resolved?
 *
 * Asked of the live element so the answer is about the family the stack landed
 * on, which differs per platform. Two strings, one weight apart: if they measure
 * the same, a mark cannot move a glyph and the mirror can be trusted.
 *
 * Returns `false` without layout (jsdom), which the caller treats as "do not
 * draw" — a mirror that cannot be checked is a mirror that does not go up.
 */
function boldKeepsAdvanceWidth(field: HTMLTextAreaElement): boolean {
  const doc = field.ownerDocument;
  const view = doc.defaultView;
  if (!view) return false;
  const probe = doc.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;left:-9999px;top:0;white-space:pre;';
  probe.style.font = view.getComputedStyle(field).font;
  probe.textContent = 'MMMMMMMMMMWWWWWWWWWWiiiiiiiiiill0123456789';
  doc.body.appendChild(probe);
  probe.style.fontWeight = '400';
  const normal = probe.getBoundingClientRect().width;
  probe.style.fontWeight = '700';
  const bold = probe.getBoundingClientRect().width;
  probe.remove();
  // No layout at all (both zero) is not agreement — it is no answer.
  if (normal <= 0) return false;
  return Math.abs(bold - normal) < 0.01;
}

/**
 * Redraw a field's bold mirror: the same text, the marks in `<strong>`, the
 * field's own box.
 *
 * Called on every input and every scroll, exactly like the line numbers, because
 * both of those move what the mirror has to match.
 */
export function updateFieldBold(field: HTMLTextAreaElement): void {
  const layer = field.parentElement?.querySelector('.np-bold');
  if (!(layer instanceof HTMLElement)) return;
  const doc = field.ownerDocument;
  const view = doc.defaultView;

  const ranges = fieldBoldRanges.get(field)?.(field.value) ?? [];
  // Nothing to draw, or a font that would not line up: leave the mirror empty and
  // the field's own text visible. That is the fallback, and it is silent on
  // purpose — a reader who loses the bold still has the prompt.
  if (ranges.length === 0 || !boldKeepsAdvanceWidth(field)) {
    layer.textContent = '';
    layer.hidden = true;
    field.style.color = '';
    field.style.caretColor = '';
    return;
  }

  if (view) {
    const cs = view.getComputedStyle(field);
    // (1) and (6): the field's TEXT width, which excludes its scrollbar, and its
    // own height — re-read here rather than remembered, which is (2).
    layer.style.width = `${field.clientWidth}px`;
    layer.style.height = `${field.clientHeight}px`;
    // (3): the field's own wrap rule, not the one the row would pass down.
    layer.style.setProperty('overflow-wrap', cs.overflowWrap || 'break-word');
    layer.style.setProperty('word-break', cs.wordBreak);
    layer.style.setProperty('white-space', cs.whiteSpace || 'pre-wrap');
    layer.style.font = cs.font;
    layer.style.lineHeight = cs.lineHeight;
    layer.style.letterSpacing = cs.letterSpacing;
    // (5): the caret would go transparent with the text without this.
    field.style.caretColor = cs.color;
  }
  // The field's text gives way to the mirror's. Only now — a field whose mirror
  // is empty keeps its own text, so the fallback above leaves nothing invisible.
  field.style.color = 'transparent';
  layer.hidden = false;
  layer.scrollTop = field.scrollTop;

  // Overlapping or out-of-order ranges would nest tags and duplicate text. Sort
  // and merge first, so the mirror is the body exactly once however the rule
  // answered.
  const merged: { start: number; end: number }[] = [];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last !== undefined && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else merged.push({ start: r.start, end: r.end });
  }

  // Built from text nodes and elements, never from a string of markup: the body
  // is the reader's own words and must not be able to become tags.
  layer.textContent = '';
  const text = field.value;
  let cursor = 0;
  for (const r of merged) {
    const start = Math.max(0, Math.min(r.start, text.length));
    const end = Math.max(start, Math.min(r.end, text.length));
    if (start > cursor) layer.appendChild(doc.createTextNode(text.slice(cursor, start)));
    if (end > start) {
      const strong = doc.createElement('strong');
      strong.textContent = text.slice(start, end);
      layer.appendChild(strong);
    }
    cursor = end;
  }
  if (cursor < text.length) layer.appendChild(doc.createTextNode(text.slice(cursor)));
}

// ── the field's line numbers ─────────────────────────────────────────────────
//
// Drawn as their own layer inside the field's row, never into the text: a
// textarea has no per-line hook, and putting a number in `value` would let the
// user edit it and would send it. The layer is `aria-hidden` and takes no
// pointer events, so the textarea stays the only thing anyone can reach.
//
// It is also invisible to the frame readers by construction: a row holding a
// textarea is read as `field.value` and its other children are never visited,
// which is what keeps the parity suites comparing the text and nothing else.

/** The producer's rule for this field, kept off the DOM. */
const fieldLineNumbers = new WeakMap<HTMLTextAreaElement, (text: string) => ReadonlyMap<number, number>>();

/** Character offset of the END of a logical line — where its number goes. */
function endOfLineOffset(text: string, line: number): number | undefined {
  const lines = text.split('\n');
  if (line < 0 || line >= lines.length) return undefined;
  let offset = 0;
  for (let index = 0; index < line; index++) offset += lines[index]!.length + 1;
  return offset + lines[line]!.length;
}

/** The CLI's gap between a title and its number (`cli-submit-popup.ts:1052`). */
const MARK_GAP = '    ';

/**
 * Redraw one field's line numbers from the text it holds NOW.
 *
 * Every mark is rebuilt rather than moved: the set changes as the user types,
 * and a stale mark left behind would sit beside a line it no longer belongs to.
 */
export function updateFieldLineNumbers(field: HTMLTextAreaElement): void {
  const layer = field.parentElement?.querySelector('.np-marks');
  if (!(layer instanceof HTMLElement)) return;
  layer.textContent = '';

  const numbers = fieldLineNumbers.get(field)?.(field.value);
  if (!numbers || numbers.size === 0) return;

  const doc = field.ownerDocument;
  for (const [line, number] of numbers) {
    const offset = endOfLineOffset(field.value, line);
    if (offset === undefined) continue;
    const at = measureOffsetPx(field, offset);
    // The window scrolls under the layer, so a mark for a line scrolled out of
    // view must not be drawn over one that is still showing. This is also what
    // draws nothing at all without layout: an unmeasurable field reports no
    // height, so every mark falls outside it rather than stacking on line one.
    const top = field.offsetTop + at.top - field.scrollTop;
    if (top < field.offsetTop || top >= field.offsetTop + field.clientHeight) continue;
    const mark = doc.createElement('span');
    mark.className = 'np-dim';
    mark.textContent = `${MARK_GAP}#${number}`;
    mark.style.cssText = `left:${field.offsetLeft + at.left}px;top:${top}px;`;
    layer.appendChild(mark);
  }
}

/**
 * The browser half of the CLI's `keepCursorVisible` (`multiline-editor.ts`:
 * insert :282, newline :299, delete :269, visual moves :248 — every
 * caret-affecting op syncs the window so the cursor stays inside it, and the
 * details apply "scrolls to where the details landed",
 * `cli-submit-popup.ts:1037`). Our windowed textarea got none of that from the
 * platform: setSelectionRange and setRangeText move the caret WITHOUT
 * scrolling, so the caret walked below the fold and applied details landed
 * off-screen (live on Lovable, 2026-08-25). An object seam so the controller's
 * call sites are spyable in tests.
 */
export const fieldScroller = {
  follow(field: HTMLTextAreaElement): void {
    if (field.clientHeight <= 0) return; // no layout (jsdom, hidden) — nothing to sync
    field.scrollTop = clampScrollToCaret(
      measureCaretTopPx(field),
      FRAME_LINE_HEIGHT_PX,
      field.scrollTop,
      field.clientHeight,
    );
    updateFieldMarkers(field);
    updateFieldLineNumbers(field);
  },
};

/** The editable field beneath a `field` row's label. */
function buildField(
  doc: Document,
  text: string,
  indent: 4 | 6,
  placeholder?: string,
  readOnly?: boolean,
  maxLines?: number,
  lineNumbers?: (text: string) => ReadonlyMap<number, number>,
  boldRanges?: (text: string) => readonly { start: number; end: number }[],
): HTMLElement {
  const row = doc.createElement('div');
  row.className = 'np-row';

  const field = doc.createElement('textarea');
  field.className = `np-content np-ind-${indent} np-field`;
  field.value = text;
  // PEF shows `(type your feedback)` in an empty field. A placeholder rather
  // than pre-filled text: the CLI prints it only while there is nothing there,
  // and text the user did not write must never be sent as if they had.
  if (placeholder) field.placeholder = placeholder;
  // The CLI's locked editor: the text shows, the caret works, typing does not.
  // A native readonly textarea is exactly that — and it keeps the send path
  // honest, because a browser-blocked keystroke can never produce text the
  // engine would discard (the 2026-08-25 read-only-fallback lesson).
  if (readOnly) field.readOnly = true;
  // The window policy marker growFields reads (see its pass zero).
  if (maxLines !== undefined && maxLines > 0) field.dataset['maxLines'] = String(maxLines);
  // One row is the floor, not the size: `growFields` raises it to the content as
  // soon as the frame is attached. Without an inline height the field can never
  // collapse to nothing, which is the failure this replaced.
  field.rows = 1;
  // The listener dies with the element, which is discarded whole on re-render.
  field.addEventListener('input', () => {
    autoGrow(field); updateFieldMarkers(field); updateFieldLineNumbers(field);
    // On EVERY input, not only on resize: the field's scrollbar comes and goes as
    // the body grows, and with it the width the mirror has to match.
    updateFieldBold(field);
  });
  // Scrolling changes what is hidden without changing the text, so the markers
  // have to follow the scroll and not only the content.
  field.addEventListener('scroll', () => {
    updateFieldMarkers(field); updateFieldLineNumbers(field); updateFieldBold(field);
  });

  row.appendChild(field);

  // Only when the model asked for numbers. Without them the row is exactly the
  // row it has always been — no extra element, nothing to position, and the
  // frame is unchanged down to the DOM.
  if (lineNumbers) {
    fieldLineNumbers.set(field, lineNumbers);
    row.className = 'np-row np-has-marks';
    const layer = doc.createElement('div');
    layer.className = 'np-marks';
    layer.setAttribute('aria-hidden', 'true');
    row.appendChild(layer);
  }

  // Same rule as the numbers: only when the model asked. Without a bold rule the
  // row gains no element at all, so a frame with no phrases is the frame it was
  // before any of this existed — which is what the recorded frames check.
  //
  // It goes inside the FIELD'S own parent and is sized to the field, never
  // stretched over the row: the row carries a character of padding and a border,
  // and the field carries a scrollbar. Both were measured, and both put a mirror
  // that trusts the row visibly off the text.
  if (boldRanges) {
    fieldBoldRanges.set(field, boldRanges);
    row.className = row.className.includes('np-has-marks') ? row.className : 'np-row np-has-marks';
    const bold = doc.createElement('div');
    bold.className = 'np-bold';
    // Inert, and both halves matter: aria-hidden keeps it out of the accessibility
    // tree (the field already carries the text), and pointer-events keeps every
    // click and drag on the textarea, which stays the only thing anyone reaches.
    bold.setAttribute('aria-hidden', 'true');
    bold.hidden = true;
    row.appendChild(bold);
  }
  return row;
}

/**
 * Render a surface into a detached frame element.
 *
 * Returns the frame; the caller appends it to the dock's `mountEl`. Pure: it
 * reads the model and the focus index and touches nothing else.
 */
export function renderSurface(doc: Document, model: SurfaceModel, state: SurfaceState): HTMLElement {
  const { frame, fixedTop, scroll, footer } = buildFrame(doc);

  // Clamp and truncate, exactly as the CLI does (`cli-submit-popup.ts:725-727`).
  // Without it an out-of-range index focuses NOTHING — no filled bullet, no hint
  // line, and a frame that looks broken rather than merely mis-focused. D6 drives
  // this index, and an off-by-one there is ordinary; the CLI guards for the same
  // reason. An empty row list keeps -1, which focuses nothing because there is
  // nothing to focus.
  // Notes are not rows the user can reach, so they do not count. The CLI never
  // puts them in its row list at all; here they share the array because they are
  // interleaved with the rows, and the index has to skip them or every row after
  // a note would be off by one.
  const interactive = model.rows.filter((r) => r.kind !== 'note').length;
  const focusIndex = interactive === 0
    ? -1
    : Math.max(0, Math.min(interactive - 1, Math.trunc(state.focusIndex)));

  // ── header region ────────────────────────────────────────────────────────
  for (const row of buildHeader(doc, model.label)) fixedTop.appendChild(row);
  fixedTop.appendChild(buildBlankRow(doc));

  if (model.pinch) fixedTop.appendChild(buildTextRow(doc, model.pinch, 'pinch'));
  for (const cue of model.trustCues ?? []) fixedTop.appendChild(buildTextRow(doc, cue));
  // Multi-line, one row per line — the CLI splits it the same way so a long
  // why-help block stays readable instead of becoming one run-on line.
  if (model.whyHelp) {
    for (const line of model.whyHelp.split('\n')) fixedTop.appendChild(buildTextRow(doc, line, 'why'));
  }
  if (model.providerFailure) fixedTop.appendChild(buildTextRow(doc, model.providerFailure, 'caution'));

  // Only when the block above actually said something. MPS gates this blank the
  // same way; a surface with no pinch, cues or why-help — PEF — goes straight
  // from the rule to its rows.
  if (model.pinch || model.trustCues?.length || model.whyHelp || model.providerFailure) {
    fixedTop.appendChild(buildBlankRow(doc));
  }

  if (model.progress) {
    fixedTop.appendChild(buildTextRow(doc, model.progress, 'dim'));
    fixedTop.appendChild(buildBlankRow(doc));
  }

  // ── rows ─────────────────────────────────────────────────────────────────
  const fieldIndent = model.fieldIndent ?? 4;
  const hintIndent = model.hintIndent ?? 4;

  let interactiveIndex = 0;
  model.rows.forEach((row) => {
    if (row.blankBefore) scroll.appendChild(buildBlankRow(doc));

    if (row.kind === 'note') {
      scroll.appendChild(buildNoteRow(doc, row.text, row.indent ?? 2, row.tone ?? 'dim'));
      return;
    }

    const focused = interactiveIndex === focusIndex;
    interactiveIndex += 1;
    // The CLI appends "  (unavailable)" to a row it cannot act on instead of
    // hiding it (`cli-submit-popup.ts:777`) — a locked heading and unavailable
    // details/use-original rows all say so on the row itself.
    const rowLabel = row.unavailable ? `${row.label}  (unavailable)` : row.label;
    scroll.appendChild(buildBulletRow(doc, rowLabel, focused, row.kind === 'action' ? row.tone : undefined, row.kind === 'field'));

    if (row.kind === 'action') {
      // Dim, not plain — the CLI's own comment reads "label, then dim helper"
      // (`cli-mps-popup.ts:398`), and tone is exactly what the parity test
      // cannot see, so this is asserted directly below.
      if (row.helper) scroll.appendChild(buildNoteRow(doc, row.helper, 4, 'dim'));
      return;
    }

    // The label, the editor and its hints go in ONE group so CSS can ask
    // whether the user is editing: `:focus-within` needs a common ancestor, and
    // the label and the textarea are separate rows. The group has no layout box
    // of its own — the rows sit in normal flow exactly as before.
    //
    // The alternative was a JS class toggled on focus/blur, which was tried and
    // measured wrong: headless Firefox reported `blurFired=false` with the
    // field still the active element, so the "editing" state stuck on. CSS
    // focus state is the engine's own and needs no event to arrive.
    const group = doc.createElement('div');
    group.className = 'np-field-group';
    group.appendChild(scroll.removeChild(scroll.lastElementChild!));   // the label row
    group.appendChild(buildScrollMarkerRow(doc, fieldIndent));         // ↑ above
    group.appendChild(buildField(
      doc, row.text, fieldIndent, row.placeholder, row.readOnly, row.maxLines, row.lineNumbers, row.boldRanges,
    ));
    group.appendChild(buildScrollMarkerRow(doc, fieldIndent));         // ↓ below
    for (const hint of row.hints?.always ?? []) group.appendChild(buildHintRow(doc, hint, hintIndent));
    if (focused) {
      for (const hint of row.hints?.whenFocused ?? []) group.appendChild(buildHintRow(doc, hint, hintIndent));
    }
    scroll.appendChild(group);
  });

  // ── footer ───────────────────────────────────────────────────────────────
  footer.appendChild(buildBlankRow(doc));
  // The CLI's publicNotice slot: blank, notice, blank, footer
  // (`cli-submit-popup.ts:829-833`). Plain tone, exactly as the CLI prints it.
  if (state.notice) {
    footer.appendChild(buildTextRow(doc, state.notice));
    footer.appendChild(buildBlankRow(doc));
  }
  footer.appendChild(buildFooterRow(doc, model.footer));

  return frame;
}
