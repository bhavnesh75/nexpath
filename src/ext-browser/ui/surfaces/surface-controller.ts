// ============================================================================
// D6 — the interaction layer. One controller, four surfaces.
// ----------------------------------------------------------------------------
// The keyboard grammar is the CLI's, read out of the reducers rather than
// guessed (`cli-submit-popup.ts:990-1080`, PEF `:1141-1176`, MPS keyboard
// contracts in `first-popup.ts`/`continuation-popup.ts`):
//
//   ↑ / ↓        move row focus — CLAMPED, never wrapped, exactly the CLI's
//                Math.max(0,…)/Math.min(len-1,…). Plain arrows move ROWS even
//                while a field is focused; the CLI's editor has no plain-arrow
//                caret movement (only ←/→ by character, Ctrl+↑/↓ by line).
//   Enter        activate the focused row. In a field this SENDS — it never
//                inserts a newline; Ctrl+J is the newline, which is why the
//                hint says so.
//   Escape       per-surface, and deliberately NOT one handler (D1.4): PE
//                cancels (and cancel is where PEF opens — §8.3 wires feedback
//                to Use-original-or-Esc, never to send); MPS-1 only leaves
//                editor focus, or declines when no editor is focused; MPS-2
//                cancels the whole remaining sequence; PEF skips.
//   Space        in a field, types (native). On an action row the CLI toggles
//                help expansion — no row of these four surfaces carries help
//                (owner removed the descriptions), so here it is consumed and
//                does nothing, which also stops the page scrolling.
//   Ctrl/Cmd+J   newline at the caret.
//   Ctrl/Cmd+↑/↓ caret up/down one line inside the field, hand-built — a
//                textarea has none, and the hint promises it. The CLI moves by
//                VISUAL (wrapped) line; this moves by logical line, which is
//                what is implementable reliably on both browsers. Recorded as
//                the one knowing divergence.
//
// THE THREE PANEL FIXES (A4.6), re-applied rather than rediscovered:
//   1. keydown is ELEMENT-scoped on the controller's own wrapper — a document
//      listener cannot see into the closed shadow root (`composedPath` hides
//      its internals), which is exactly how the panel's keys went dead.
//   2. pointerdown anywhere in the wrapper re-takes focus — agent pages
//      aggressively steal it, and once blurred an element-scoped listener
//      never fires again.
//   3. stopPropagation (with preventDefault) on EVERY handled key — the host
//      page binds its own document-level ArrowUp (prompt history recall), and
//      preventDefault alone does not stop the event leaving the shadow root.
//
// STATIC-BUILD ACTIVATION (A4.3): never a silent no-op. Every activation both
// emits a typed SurfaceEvent and leaves a visible trace — a surface switch, the
// CLI's own local details-merge, or a notice line in the CLI's publicNotice
// slot. The one deliberate exception is the CLI's own guards (blank body, empty
// details), which the CLI refuses silently and so does this.
//
// REFINEMENT IS A HOOK, NOT A BRANCH: directional rows and Go back reach this
// controller only through `resolveActivation`. The shape was forced by C-4 (D5
// had to stay uncommitted while this landed) and kept afterwards on its own
// merit — this file has no opinion about what a row means, which is why a
// surface can add behaviour without editing the controller.
// ============================================================================

import type { SurfaceId, SurfaceModel, SurfaceRow } from './surface-model.js';
import { growFields, renderSurface } from './surface-view.js';

/** What the surfaces report upward. The dock's own union stays `dismiss`-only —
 * window furniture and surface semantics are different layers. */
export type SurfaceEvent =
  | { type: 'send'; surface: SurfaceId; text: string }
  | { type: 'apply-details'; surface: SurfaceId; mergedBody: string }
  | { type: 'use-original'; surface: SurfaceId }
  | { type: 'cancelled'; surface: SurfaceId }
  | { type: 'cancel-sequence'; surface: SurfaceId }
  | { type: 'interruption'; surface: SurfaceId }
  | { type: 'declined'; surface: SurfaceId }
  | { type: 'feedback'; surface: SurfaceId; category?: string; text?: string }
  | { type: 'feedback-skipped'; surface: SurfaceId }
  | { type: 'activate'; surface: SurfaceId; label: string };

/** Switching the surface to a different model, optionally at a given row. */
export type SurfaceTransition = { model: SurfaceModel; focusIndex?: number };

/**
 * The pluggable activation hook (the refinement wiring plugs in here).
 * Return a transition to switch models, `'refuse'` for a CLI-style silent
 * guard, or null to fall through to the controller's own routing.
 */
export type ResolveActivation = (
  model: SurfaceModel,
  row: SurfaceRow,
  bodyText: string,
) => SurfaceTransition | 'refuse' | null;

/**
 * The same seam for Escape.
 *
 * Escape had none, and that was a design gap rather than an oversight in the
 * copy: `resolveActivation` is reached only from `activate()`, so a caller
 * could suppress everything a ROW does and nothing Escape does — which is why
 * the MPS decline path kept announcing itself in a live build that had
 * intercepted every other notice.
 *
 * `'handled'` means the caller dealt with it and the controller should do
 * nothing further; null falls through to the per-surface default.
 */
export type ResolveEscape = (model: SurfaceModel) => SurfaceTransition | 'handled' | null;

/**
 * What, if anything, the frame should say about something that just happened.
 *
 * The controller used to carry nine hard-coded lines ending in "static build",
 * written when nothing was wired. They are the CALLER's to write: a live bridge
 * knows the agent's name, the harness knows it is a harness, and a caller with
 * nothing to add returns undefined and the frame stays silent — which is what
 * the CLI does for most outcomes anyway.
 *
 * Keyed on the event rather than on an invented vocabulary of notice kinds:
 * every one of those nine lines already sat immediately after an `emit` of the
 * event it was describing.
 */
export type ResolveNotice = (event: SurfaceEvent) => string | undefined;

export interface SurfaceControllerOptions {
  registry: Partial<Record<SurfaceId, SurfaceModel>>;
  initial: SurfaceId;
  doc?: Document;
  onEvent?: (event: SurfaceEvent) => void;
  resolveActivation?: ResolveActivation;
  resolveEscape?: ResolveEscape;
  /** Omit it and the frame says nothing. */
  notice?: ResolveNotice;
}

export interface SurfaceController {
  readonly element: HTMLElement;
  getModel(): SurfaceModel;
  getFocusIndex(): number;
  setSurface(id: SurfaceId): void;
  /**
   * Show or clear the busy skeleton. Pass a glyph per frame to animate it; the
   * controller runs no timer of its own.
   */
  setBusy(glyph: string | null): void;
  destroy(): void;
}

/** The CLI's one details-merge heading (`cli-submit-popup.ts:1041`). */
export const DETAILS_MERGE_HEADING = 'Additional details to incorporate:';

/**
 * The CLI's local, deterministic details-merge (owner request 2026-08-07, "MPS
 * parity"): merged verbatim under ONE heading — a second apply extends the
 * block instead of adding a second heading (live iMac report 2026-08-07).
 */
export function mergeDetailsIntoBody(body: string, details: string): string {
  return body.includes(DETAILS_MERGE_HEADING)
    ? `${body}\n${details.trim()}`
    : `${body}\n\n${DETAILS_MERGE_HEADING}\n${details.trim()}`;
}

/** Caret one logical line up or down, column preserved where the line allows. */
export function moveCaretLine(field: HTMLTextAreaElement, direction: -1 | 1): void {
  const text = field.value;
  const pos = field.selectionStart ?? 0;
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const column = pos - lineStart;

  if (direction < 0) {
    if (lineStart === 0) { field.setSelectionRange(0, 0); return; }
    const prevStart = text.lastIndexOf('\n', lineStart - 2) + 1;
    const prevLength = lineStart - 1 - prevStart;
    const target = prevStart + Math.min(column, prevLength);
    field.setSelectionRange(target, target);
    return;
  }

  const lineEnd = text.indexOf('\n', pos);
  if (lineEnd === -1) { field.setSelectionRange(text.length, text.length); return; }
  const nextStart = lineEnd + 1;
  const nextEndRaw = text.indexOf('\n', nextStart);
  const nextEnd = nextEndRaw === -1 ? text.length : nextEndRaw;
  const target = nextStart + Math.min(column, nextEnd - nextStart);
  field.setSelectionRange(target, target);
}

/** Interactive rows (the ones focus can reach), in order. Notes never count. */
function interactiveRows(model: SurfaceModel): SurfaceRow[] {
  return model.rows.filter((r) => r.kind !== 'note');
}

export function createSurfaceController(
  host: HTMLElement,
  options: SurfaceControllerOptions,
): SurfaceController {
  const doc = options.doc ?? document;
  const emit = options.onEvent;

  const initialModel = options.registry[options.initial];
  if (!initialModel) throw new Error(`createSurfaceController: no model registered for "${options.initial}"`);
  let model: SurfaceModel = initialModel;
  let focusIndex = 0;
  let notice: string | undefined;
  let busy: { glyph: string } | undefined;
  /** The user's live edits, by field ordinal. The DOM owns them between renders. */
  let fieldValues: string[] = [];
  let destroyed = false;

  /**
   * Re-size the fields whenever the surface actually becomes measurable.
   *
   * The dock renders its host at `display: none` and shows it afterwards, so
   * the first render measures nothing and the fields stay collapsed until the
   * user happens to type. Rather than have the dock announce itself — its event
   * union is `dismiss` only, and one more API is one more thing a caller can
   * forget — the controller watches its own box: it gains a size the moment it
   * is shown, whatever caused it.
   *
   * The same observer covers a case nobody reported: narrowing the window
   * rewraps a field's text TALLER than the height measured at the old width,
   * and nothing was re-measuring it.
   *
   * No feedback loop: `.np-surface-root` is `height: 100%`, so growing a field
   * changes nothing about the wrapper's own size. The re-entrancy flag is there
   * for the day that stops being true.
   */
  let lastWidth = -1;
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
    if (destroyed) return;
    // WIDTH ONLY, and that is what makes a feedback loop impossible rather than
    // merely unlikely. Sizing a field changes its HEIGHT, which changes the
    // wrapper's height, which fires this observer again — Chrome reports that
    // as "ResizeObserver loop completed with undelivered notifications", and
    // the harness caught exactly one. Width is the input that actually matters
    // (it decides where the text wraps) and it is the one dimension this
    // callback can never change.
    const width = Math.round(entries[0]?.contentRect.width ?? wrapper.clientWidth);
    if (width === lastWidth) return;
    lastWidth = width;
    // Deferred OUT of the observation cycle. Sizing a field changes the
    // wrapper's height — `height: 100%` against a parent with no height of its
    // own resolves to content — which queues another observation, and the
    // browser reports "ResizeObserver loop completed with undelivered
    // notifications" for that whether or not this callback then bails. The
    // width guard alone did not silence it; the harness kept counting one.
    //
    // A macrotask, not requestAnimationFrame: rAF does not fire for the dock's
    // path under headless virtual time, which would leave the fields unsized in
    // exactly the test that is meant to prove they are sized.
    setTimeout(() => { if (!destroyed) growFields(wrapper); }, 0);
  });

  const wrapper = doc.createElement('div');
  wrapper.className = 'np-surface-root';
  wrapper.tabIndex = -1;
  host.appendChild(wrapper);

  // ── state helpers ─────────────────────────────────────────────────────────

  function fields(): HTMLTextAreaElement[] {
    return [...wrapper.querySelectorAll('textarea')];
  }

  function harvest(): void {
    fieldValues = fields().map((f, i) => (f.readOnly ? (fieldValues[i] ?? '') : f.value));
  }

  /** Field ordinal of an interactive row index, or -1 when it is not a field. */
  function fieldOrdinalOf(interactiveIndex: number): number {
    const rows = interactiveRows(model);
    let ordinal = -1;
    for (let i = 0; i <= interactiveIndex && i < rows.length; i++) {
      if (rows[i]!.kind === 'field') ordinal += 1;
    }
    return rows[interactiveIndex]?.kind === 'field' ? ordinal : -1;
  }

  function bodyText(): string {
    // Field ordinal 0 is the body on every surface that has one.
    return fieldValues[0] ?? '';
  }

  function render(): void {
    lastRenderAt = Date.now(); // re-arms the focus-steal guard's window
    wrapper.replaceChildren(renderSurface(doc, model, { focusIndex, notice, busy }));

    // Re-apply the user's edits — the freshly built textareas carry model text.
    const rendered = fields();
    // A read-only field is not the user's text — it is the busy skeleton — so
    // it is neither overwritten by their edits nor harvested as one.
    fieldValues.forEach((value, i) => {
      const field = rendered[i];
      if (field && !field.readOnly) field.value = value;
    });

    // Only now can a textarea be measured: the frame is in the document and the
    // real text is in place. Growing any earlier measures either a detached
    // element or the wrong string.
    growFields(wrapper);

    // Row-focus and DOM-focus stay in step: a focused field row means its
    // textarea really has the keyboard, caret parked at the end (the CLI parks
    // it at the end when it rebuilds a field too).
    const ordinal = fieldOrdinalOf(focusIndex);
    if (ordinal >= 0 && rendered[ordinal]) {
      const field = rendered[ordinal]!;
      field.focus({ preventScroll: true });
      field.setSelectionRange(field.value.length, field.value.length);
    } else {
      wrapper.focus({ preventScroll: true });
    }

    // Clicking a row moves focus there; an ACTION row also activates, the way
    // the old panel's rows did. A field row must not activate on click —
    // clicking a textarea to type must never send.
    let interactiveIndex = -1;
    for (const rowEl of wrapper.querySelectorAll('.np-row')) {
      const bullet = rowEl.querySelector('.np-bullet');
      if (!bullet) continue;
      interactiveIndex += 1;
      const idx = interactiveIndex;
      rowEl.addEventListener('click', () => {
        if (destroyed) return;
        const row = interactiveRows(model)[idx];
        harvest();
        focusIndex = idx;
        notice = undefined;
        render();
        if (row && row.kind === 'action') activate(row);
      });
    }

    // A click into a details field must retarget Enter to the details row.
    rendered.forEach((field, ordinal) => {
      field.addEventListener('focus', () => {
        if (destroyed) return;
        const rows = interactiveRows(model);
        let seen = -1;
        for (let i = 0; i < rows.length; i++) {
          if (rows[i]!.kind === 'field') seen += 1;
          if (seen === ordinal) {
            if (focusIndex !== i) {
              harvest();
              const caret = field.selectionStart;
              focusIndex = i;
              render();
              const again = fields()[ordinal];
              if (again && caret !== null) again.setSelectionRange(caret, caret);
            }
            break;
          }
        }
      });
    });
  }

  /**
   * A surface change the CALLER asked for starts with an empty notice.
   *
   * A notice describes what just happened on the surface that raised it, so
   * carrying it onto the next one leaves the frame explaining something the
   * reader is no longer looking at — `setSurface` after a send showed "Sent."
   * under the MPS header.
   *
   * Not applied to every `show`: when an announce is what CAUSED the switch —
   * Escape on PE opening feedback — the line is about the transition itself and
   * belongs on the surface it lands on.
   */
  function showFresh(next: SurfaceModel, nextFocus = 0): void {
    notice = undefined;
    show(next, nextFocus);
  }

  function show(next: SurfaceModel, nextFocus = 0): void {
    // Busy describes THIS surface's wording being prepared, so it cannot travel
    // to another one — unlike a notice, which can be about the transition
    // itself and is cleared only for caller-driven switches. Without this,
    // switching while busy left the next surface's body as a skeleton.
    busy = undefined;
    model = next;
    focusIndex = nextFocus;
    fieldValues = interactiveRows(next)
      .filter((r) => r.kind === 'field')
      .map((r) => (r.kind === 'field' ? r.text : ''));
    render();
  }

  /**
   * Report what happened, and show whatever the caller wants said about it.
   *
   * Every outcome goes through here, including the ones that never had a line
   * of their own — a caller that wants to acknowledge an applied details merge
   * can, without the controller having had an opinion about it first.
   *
   * A new outcome supersedes an older message: if the caller says nothing this
   * time, a notice still on screen from last time is cleared rather than left
   * to describe something that is no longer what just happened.
   */
  function announce(event: SurfaceEvent): void {
    emit?.(event);
    const text = options.notice?.(event);
    if (text === notice) return;
    notice = text;
    render();
  }

  // ── activation ────────────────────────────────────────────────────────────

  function activate(row: SurfaceRow): void {
    if (row.kind === 'note') return;

    // The held D5 hook first — directionals and Go back live behind it.
    const resolved = options.resolveActivation?.(model, row, bodyText());
    if (resolved === 'refuse') return;                         // a CLI-style silent guard
    if (resolved) {
      harvest();
      showFresh(resolved.model, resolved.focusIndex ?? 0);
      return;
    }

    const surface = model.id;
    const pef = surface === 'prompt_enhancement_feedback';

    if (row.kind === 'field') {
      const ordinal = interactiveRows(model).filter((r, i) => r.kind === 'field'
        && i <= interactiveRows(model).indexOf(row)).length - 1;

      if (pef) {
        // PEF's Other: a reason typed freehand. Empty is refused, silently —
        // the CLI's reducer returns `pending` (`cli-submit-popup.ts:1166`).
        const text = (fieldValues[ordinal] ?? '').trim();
        if (text.length === 0) return;
        announce({ type: 'feedback', surface, text });
        return;
      }

      if (ordinal === 0) {
        // The body. BF-1: never send an empty or whitespace body — stay.
        const text = fieldValues[0] ?? '';
        if (text.trim().length === 0) return;
        announce({ type: 'send', surface, text });
        return;
      }

      // The details field: the CLI's LOCAL merge, not an engine call. Blank
      // body or empty details cannot drive an apply (BF-1 / bug B); otherwise
      // the details land in the body under one heading, the field clears, and
      // focus returns to the body row so the next Enter sends the merged text.
      const details = (fieldValues[ordinal] ?? '').trim();
      const body = fieldValues[0] ?? '';
      if (body.trim().length === 0 || details.length === 0) return;
      const merged = mergeDetailsIntoBody(body, details);
      fieldValues[0] = merged;
      fieldValues[ordinal] = '';
      focusIndex = interactiveRows(model).findIndex((r) => r.kind === 'field');
      announce({ type: 'apply-details', surface, mergedBody: merged });
      render();
      return;
    }

    // Action rows.
    if (pef) {
      // A fixed reason submits directly.
      announce({ type: 'feedback', surface, category: row.label });
      return;
    }
    switch (row.act) {
      case 'use-original':
        // Cancel is where feedback opens (§8.3): Use original or Esc, never send.
        announce({ type: 'use-original', surface });
        switchTo('prompt_enhancement_feedback');
        return;
      case 'cancel-sequence':
        announce({ type: 'cancel-sequence', surface });
        return;
      case 'interruption':
        announce({ type: 'interruption', surface });
        return;
      default:
        // Unknown rows are never a silent no-op (A4.3).
        announce({ type: 'activate', surface, label: row.label });
    }
  }

  function switchTo(id: SurfaceId): void {
    const next = options.registry[id];
    if (!next) return;
    show(next);
  }

  // ── escape, per surface ───────────────────────────────────────────────────

  function onEscape(): void {
    // The caller gets first refusal, exactly as it does for a row activation.
    // Without this seam a caller could intercept everything a ROW does and
    // nothing Escape does, which is why a live build that had suppressed every
    // other notice still saw the MPS decline announce itself.
    const resolved = options.resolveEscape?.(model);
    if (resolved === 'handled') return;
    if (resolved) { harvest(); showFresh(resolved.model, resolved.focusIndex ?? 0); return; }

    const surface = model.id;
    switch (surface) {
      case 'prompt_enhancement':
        // The CLI's `close` → closed_no_send, and feedback is wired to cancel.
        announce({ type: 'cancelled', surface });
        switchTo('prompt_enhancement_feedback');
        return;
      case 'mps_first': {
        // Leave editor focus, preserving the draft; with no editor focused,
        // Esc declines the offer (nothing activated, so nothing to cancel).
        const root = wrapper.getRootNode() as Document | ShadowRoot;
        const active = root.activeElement;
        if (active instanceof HTMLTextAreaElement && wrapper.contains(active)) {
          active.blur();
          wrapper.focus({ preventScroll: true });
          return;
        }
        announce({ type: 'declined', surface });
        return;
      }
      case 'mps_continuation':
        // The footer says so: Esc cancels the whole remaining sequence.
        announce({ type: 'cancel-sequence', surface });
        return;
      case 'prompt_enhancement_feedback':
        announce({ type: 'feedback-skipped', surface });
        return;
    }
  }

  // ── keys ──────────────────────────────────────────────────────────────────

  function onKeyDown(e: KeyboardEvent): void {
    if (destroyed) return;
    const inField = e.target instanceof HTMLTextAreaElement;
    // TWO chord families, live-lesson 2026-08-25:
    //  - Ctrl/Cmd (the CLI's own) works only while focus is INSIDE this
    //    wrapper. Agent pages steal focus moments after the dock shows, and a
    //    stolen-focus Ctrl+J is CHROME'S OWN Downloads shortcut — the user
    //    sees "the key does nothing AND opens a browser page". Kept for
    //    muscle-memory when focus is here, but no longer advertised.
    //  - Alt+Shift (ADVERTISED — the hint names it) is the extension's proven
    //    no-conflict family, the same remap precedent as the advisory panel's
    //    CLI Ctrl+T/Ctrl+X → Alt+Shift+T/Alt+Shift+X: Alt+Shift+J and
    //    Alt+Shift+arrows mean nothing to Chrome, Firefox, or the OS, so a
    //    press with strayed focus is harmless instead of a browser action.
    //    (Ctrl+Shift stays disqualified: Ctrl+Shift+J is DevTools.)
    const chord = (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey;
    const safeChord = e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey;
    // Row navigation is PLAIN arrows only: Shift+arrow inside a field is the
    // browser's select-by-line, which stealing the key would silently break.
    const plain = !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey;

    // Ctrl/Cmd+↑/↓ or Alt+Shift+↑/↓ — caret line movement inside a field.
    // Physical codes, the D1.3 precedent: e.key is layout- and
    // modifier-dependent (Alt+Shift+letter is a special character on macOS —
    // e.code is what stays stable).
    if ((chord || safeChord) && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
      if (inField) moveCaretLine(e.target as HTMLTextAreaElement, e.code === 'ArrowUp' ? -1 : 1);
      e.preventDefault(); e.stopPropagation();
      return;
    }

    // Ctrl/Cmd+J or Alt+Shift+J — the newline. Enter is send, so this is the
    // only way in.
    if ((chord || safeChord) && e.code === 'KeyJ') {
      if (inField) {
        const field = e.target as HTMLTextAreaElement;
        field.setRangeText('\n', field.selectionStart ?? 0, field.selectionEnd ?? 0, 'end');
        field.dispatchEvent(new Event('input', { bubbles: true }));   // auto-grow listens here
      }
      e.preventDefault(); e.stopPropagation();
      return;
    }

    // WHILE BUSY, the surface accepts nothing but Escape. Enter would act on a
    // body that is not ready, and moving focus would offer rows whose meaning
    // depends on it. Escape keeps working on purpose: waiting must never be a
    // trap, and it is the one key whose meaning does not depend on the wording.
    if (busy && e.key !== 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (plain && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      const last = interactiveRows(model).length - 1;
      const next = e.key === 'ArrowUp'
        ? Math.max(0, focusIndex - 1)
        : Math.min(last, focusIndex + 1);
      harvest();
      focusIndex = next;
      notice = undefined;
      render();
      e.preventDefault(); e.stopPropagation();
      return;
    }

    if (e.key === 'Enter') {
      harvest();
      const row = interactiveRows(model)[focusIndex];
      if (row) activate(row);
      e.preventDefault(); e.stopPropagation();
      return;
    }

    if (e.key === 'Escape') {
      harvest();
      onEscape();
      e.preventDefault(); e.stopPropagation();
      return;
    }

    if (e.key === ' ' && !inField) {
      // The CLI toggles help expansion here; none of these rows carries help
      // (the owner removed the descriptions), and unconsumed Space scrolls the
      // page.
      e.preventDefault(); e.stopPropagation();
    }
  }

  function onPointerDown(e: Event): void {
    if (destroyed) return;
    // Fix #2: re-take focus so the element-scoped keydown keeps firing. A
    // click on a textarea keeps its own focus; anything else focuses the
    // wrapper.
    if (!(e.target instanceof HTMLTextAreaElement)) {
      wrapper.focus({ preventScroll: true });
    }
  }

  // ── Focus-steal guard (live-lesson 2026-08-25) ──────────────────────────────
  // Agent pages grab focus moments after the dock shows (Bolt observed doing it
  // seconds after render): every chord then goes to the PAGE — the popup's keys
  // "stop working" and Ctrl+J becomes Chrome's Downloads. A page-script steal
  // lands focus on document.body; a REAL user click lands on the clicked
  // element — so re-take only when the new resting place is body, and only
  // within a short window after our own render (steals cluster there; a user's
  // deliberate click into the page comes later and must release the keys — the
  // panel family's non-modal rule).
  const FOCUS_STEAL_WINDOW_MS = 1_500;
  let lastRenderAt = Date.now();
  function onFocusOut(): void {
    if (destroyed) return;
    setTimeout(() => {
      if (destroyed) return;
      if (Date.now() - lastRenderAt > FOCUS_STEAL_WINDOW_MS) return;
      // Steal signature: focus RESTS ON BODY. Inside a shadow root the shadow's
      // own activeElement goes null AND the document's lands on body; mounted
      // bare (tests, the harness) the document view is the whole story. A real
      // element holding focus = deliberate user intent — leave it alone.
      const root = wrapper.getRootNode() as Document | ShadowRoot;
      const stolen = root === (doc as unknown)
        ? doc.activeElement === doc.body
        : (root.activeElement === null && doc.activeElement === doc.body);
      if (!stolen) return;
      const ordinal = fieldOrdinalOf(focusIndex);
      const field = ordinal >= 0 ? fields()[ordinal] : undefined;
      (field ?? wrapper).focus({ preventScroll: true });
    }, 0);
  }

  observer?.observe(wrapper);
  wrapper.addEventListener('keydown', onKeyDown);
  wrapper.addEventListener('pointerdown', onPointerDown);
  wrapper.addEventListener('focusout', onFocusOut);

  show(model);

  return {
    element: wrapper,
    getModel: () => model,
    getFocusIndex: () => focusIndex,
    setBusy(glyph: string | null): void {
      if (destroyed) return;
      const next = glyph === null ? undefined : { glyph };
      if (next?.glyph === busy?.glyph) return;      // the same frame twice
      // Harvest FIRST. Busy arrives while the user may be mid-edit, and a
      // re-render without this replaces the textarea with one carrying the
      // model's text — their typing is gone, and it comes back the moment the
      // skeleton clears as if it had never been written.
      harvest();
      busy = next;
      render();
    },
    setSurface(id: SurfaceId): void {
      if (destroyed) return;
      const next = options.registry[id];
      if (next) showFresh(next);
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      observer?.disconnect();
      wrapper.removeEventListener('keydown', onKeyDown);
      wrapper.removeEventListener('pointerdown', onPointerDown);
      wrapper.removeEventListener('focusout', onFocusOut);
      wrapper.remove();
    },
  };
}
