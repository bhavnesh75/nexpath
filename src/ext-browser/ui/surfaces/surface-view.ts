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
  // NEVER WRITE A HEIGHT THAT WAS NOT ACTUALLY MEASURED. `scrollHeight` reads 0
  // for anything the engine is not laying out, and writing that back is what
  // made the prompt a 0px strip.
  //
  // The test is "is it rendered", not "is it in the document". `isConnected` was
  // the first guard and it closed only the DETACHED case; the dock keeps its
  // host at `display: none` until show(), and an element inside a hidden subtree
  // is CONNECTED, unrendered, and measures 0 — the same bug through a second
  // door, reported from the live build.
  //
  // `getClientRects()` separates the three states exactly: empty for detached
  // and for display:none, one rect for a rendered field even when its height is
  // currently zero.
  if (field.getClientRects().length === 0) return;
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

  // Pass one sizes each field to its content.
  for (const field of fields) autoGrow(field);

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
    // The same guard as autoGrow, and for the same reason: this pass also
    // WRITES a height, so it also has to refuse when there is nothing to
    // measure. It was still checking `isConnected` — the weaker test that
    // E1.1 replaced — which made the two passes disagree about what counts as
    // measurable.
    if (field.getClientRects().length === 0) continue;
    if (field.scrollHeight > field.clientHeight) field.style.height = `${field.scrollHeight}px`;
  }

  // Sizing settles the window, so the markers can only be right after it.
  for (const field of fields) updateFieldMarkers(field);
}

/** The editable field beneath a `field` row's label. */
function buildField(
  doc: Document,
  text: string,
  indent: 4 | 6,
  placeholder?: string,
  readOnly = false,
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
  // A busy body is a skeleton, not something to type into. Read-only rather
  // than removed, because removing the textarea would shift every field
  // ordinal by one and the controller would write the body's text into the
  // details field.
  if (readOnly) field.readOnly = true;
  // One row is the floor, not the size: `growFields` raises it to the content as
  // soon as the frame is attached. Without an inline height the field can never
  // collapse to nothing, which is the failure this replaced.
  field.rows = 1;
  // The listener dies with the element, which is discarded whole on re-render.
  field.addEventListener('input', () => { autoGrow(field); updateFieldMarkers(field); });
  // Scrolling changes what is hidden without changing the text, so the markers
  // have to follow the scroll and not only the content.
  field.addEventListener('scroll', () => updateFieldMarkers(field));

  row.appendChild(field);
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
    scroll.appendChild(buildBulletRow(doc, row.label, focused, row.kind === 'action' ? row.tone : undefined, row.kind === 'field'));

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
    // THE BUSY SKELETON, exactly as the CLI renders it
    // (`cli-mps-popup.ts:357-364`): "while wording is not ready, the body is a
    // spinner skeleton and the edit-keys hint is hidden; everything else
    // renders as normal".
    //
    // Applied to the field the MODEL marks as engine-produced, not to the first
    // one. PEF's only field is the user's own feedback, and a `preparing…`
    // skeleton there would say the engine is writing their opinion for them.
    const busy = row.prepared ? state.busy : undefined;

    group.appendChild(buildScrollMarkerRow(doc, fieldIndent));         // ↑ above
    group.appendChild(buildField(
      doc,
      busy ? `${busy.glyph} preparing…` : row.text,
      fieldIndent,
      row.placeholder,
      Boolean(busy),
    ));
    group.appendChild(buildScrollMarkerRow(doc, fieldIndent));         // ↓ below
    if (!busy) {
      for (const hint of row.hints?.always ?? []) group.appendChild(buildHintRow(doc, hint, hintIndent));
      if (focused) {
        for (const hint of row.hints?.whenFocused ?? []) group.appendChild(buildHintRow(doc, hint, hintIndent));
      }
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
