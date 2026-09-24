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
import { fieldScroller, growFields, renderSurface } from './surface-view.js';
import { withBodyText } from './refinement.js';

/** What the surfaces report upward. The dock's own union stays `dismiss`-only —
 * window furniture and surface semantics are different layers. */
export type SurfaceEvent =
  | { type: 'send'; surface: SurfaceId; text: string }
  | { type: 'apply-details'; surface: SurfaceId; mergedBody: string }
  /**
   * A numbered part of the body was removed by the chord. Carries the text that
   * remains, because that — not the number — is what the host has to send: a
   * removal is an EDIT, so it travels the same road as any other body edit.
   */
  | { type: 'section-removed'; surface: SurfaceId; bodyText: string }
  | { type: 'use-original'; surface: SurfaceId }
  | { type: 'cancelled'; surface: SurfaceId }
  | { type: 'cancel-sequence'; surface: SurfaceId }
  | { type: 'interruption'; surface: SurfaceId }
  | { type: 'declined'; surface: SurfaceId }
  | { type: 'feedback'; surface: SurfaceId; category?: string; text?: string }
  | { type: 'feedback-skipped'; surface: SurfaceId }
  /**
   * The advisory rating surface's answer. `rating` is the 1-4 score carried on
   * the row; `label` rides along for logging and is NOT what the score is read
   * from — see `SurfaceRow`'s `rating`.
   */
  | { type: 'rating'; surface: SurfaceId; rating: number; label: string }
  | { type: 'rating-skipped'; surface: SurfaceId }
  | { type: 'activate'; surface: SurfaceId; label: string };

/**
 * The pluggable activation hook (held D5 wiring plugs in here).
 * Return a transition to switch models, `'refuse'` for a CLI-style silent
 * guard, or null to fall through to the controller's own routing.
 */
export type ResolveActivation = (
  model: SurfaceModel,
  row: SurfaceRow,
  bodyText: string,
) => { model: SurfaceModel; focusIndex?: number } | 'refuse' | null;

export interface SurfaceControllerOptions {
  registry: Partial<Record<SurfaceId, SurfaceModel>>;
  initial: SurfaceId;
  doc?: Document;
  onEvent?: (event: SurfaceEvent) => void;
  resolveActivation?: ResolveActivation;
  /**
   * Row focus to open on (clamped). The CLI PRESERVES its interaction state
   * across re-renders unless the body itself changed (cli-submit-popup.ts
   * :1444-1453); a host that rebuilds this controller per render passes the
   * previous focus back in to keep that behaviour.
   */
  initialFocusIndex?: number;
}

export interface SurfaceController {
  readonly element: HTMLElement;
  getModel(): SurfaceModel;
  getFocusIndex(): number;
  setSurface(id: SurfaceId): void;
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

/**
 * True when this element or any ancestor — crossing the shadow boundary to the
 * host — is inline-hidden. Layout-free on purpose (see the focus-steal guard).
 */
function isHiddenByAncestor(el: HTMLElement): boolean {
  let node: HTMLElement | null = el;
  for (let hops = 0; node && hops < 32; hops += 1) {
    if (node.style?.display === 'none') return true;
    const parent = node.parentElement as HTMLElement | null;
    if (parent) { node = parent; continue; }
    const root = node.getRootNode();
    node = root instanceof ShadowRoot ? (root.host as HTMLElement) : null;
  }
  return false;
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
  /** The user's live edits, by field ordinal. The DOM owns them between renders. */
  let fieldValues: string[] = [];
  let destroyed = false;
  /**
   * Where Alt+Shift+T came FROM, with the body as the user had left it.
   *
   * Saved here rather than by the activation hook because the hook never sees a
   * key — and restoring the model alone would discard what they had typed, the
   * same mistake `refinement-transitions.ts` calls out for Go back. Checking a
   * setting mid-edit must cost nothing.
   */
  let settingsReturn: { model: SurfaceModel; focusIndex: number } | null = null;
  /**
   * Alt+Shift+R has been pressed and the next key is the chord's.
   *
   * The arm/disarm half is written here rather than borrowed from the CLI's:
   * that one arms on a control BYTE the terminal delivers, and this surface has
   * DOM events and a different key. What must not be a second copy is the
   * REMOVAL, and that is the injected rule — this flag decides only whether a
   * digit belongs to the chord or to the text.
   */
  let removalArmed = false;

  const wrapper = doc.createElement('div');
  wrapper.className = 'np-surface-root';
  wrapper.tabIndex = -1;
  host.appendChild(wrapper);

  // ── state helpers ─────────────────────────────────────────────────────────

  function fields(): HTMLTextAreaElement[] {
    return [...wrapper.querySelectorAll('textarea')];
  }

  function harvest(): void {
    fieldValues = fields().map((f) => f.value);
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

/**
 * Scroll the panel's own list so the focused row is visible, moving as little as
 * possible — the CLI's window only ever shifts by what it must.
 *
 * Uses rects rather than `offsetTop` so it does not depend on which ancestor
 * happens to be the offset parent. In jsdom every rect is zero, so this is inert
 * there rather than wrong.
 */
function scrollRowIntoView(wrapper: HTMLElement): void {
  const row = wrapper.querySelector<HTMLElement>('.np-focused');
  const scroller = wrapper.querySelector<HTMLElement>('.np-scroll');
  if (!row || !scroller) return;
  try {
    const r = row.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    if (box.height === 0) return; // not laid out yet
    if (r.top < box.top) scroller.scrollTop -= box.top - r.top;
    else if (r.bottom > box.bottom) scroller.scrollTop += r.bottom - box.bottom;
  } catch {
    /* measurement unavailable — the panel is still usable, just not auto-scrolled */
  }
}

  function bodyText(): string {
    // Field ordinal 0 is the body on every surface that has one.
    return fieldValues[0] ?? '';
  }

  function render(): void {
    lastRenderAt = Date.now(); // re-arms the focus-steal guard's window
    wrapper.replaceChildren(renderSurface(doc, model, { focusIndex, notice }));
    // ONE render, then gone. This surface runs its own loop rather than the
    // engine's, so nothing else would ever take a notice down again — it would
    // sit there through every later frame until an unrelated keypress cleared
    // it. Dropped AFTER the frame is built, so the frame just drawn still has
    // it and the next one does not.
    notice = undefined;
    // A rebuilt frame draws the model's own hint again, so an armed chord would
    // become INVISIBLE while still live — the next digit would then remove a
    // section with nothing on screen having asked for one. The chord is a
    // two-keystroke transaction, and anything that rebuilds the frame has
    // interrupted it, so it disarms here rather than lingering unseen.
    removalArmed = false;

    // Re-apply the user's edits — the freshly built textareas carry model text.
    const rendered = fields();
    fieldValues.forEach((value, i) => { if (rendered[i]) rendered[i]!.value = value; });

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

    // Bring the focused row into view.
    //
    // `preventScroll: true` above is deliberate — letting the browser scroll on
    // focus moves the HOST PAGE, not the panel. But it also means nothing ever
    // scrolls the panel's own list, so arrowing down to a row below the fold
    // moved the selection marker somewhere the user could not see it (reported
    // live 2026-08-26: "not auto scroll to down when focus goes to original
    // prompt"). Scrolling the panel's own scroller is the missing half.
    scrollRowIntoView(wrapper);

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

  function show(next: SurfaceModel, nextFocus = 0): void {
    model = next;
    focusIndex = Math.max(0, Math.min(interactiveRows(next).length - 1, nextFocus));
    fieldValues = interactiveRows(next)
      .filter((r) => r.kind === 'field')
      .map((r) => (r.kind === 'field' ? r.text : ''));
    render();
  }

  /**
   * Remove the part a digit named, if the model's rule allows it.
   *
   * The rule answers about the LIVE text, so the body is harvested from the DOM
   * first: the reader typed a number they could see, and what they can see is
   * what is in the field, not what the last render was built from. A refusal
   * changes nothing and says nothing — the digit is still swallowed, because it
   * belonged to the chord either way.
   */
  function removeSection(sectionNumber: number): void {
    const body = interactiveRows(model).find((row) => row.kind === 'field');
    if (body?.kind !== 'field' || !body.removeSection) return;
    harvest();
    const remaining = body.removeSection(bodyText(), sectionNumber);
    if (remaining === undefined) {
      // A refusal SAYS so, once. Silence here was the state before this phase,
      // and it reads exactly like a key that did nothing.
      if (body.removalNotice !== undefined) { notice = body.removalNotice; render(); }
      return;
    }
    fieldValues[0] = remaining;
    render();
    emit?.({ type: 'section-removed', surface: model.id, bodyText: remaining });
  }

  /**
   * Swap the body row's hint line for its armed question, IN PLACE.
   *
   * ⛔ Deliberately not a re-render, and the two reasons are both behaviour:
   *
   *  - a re-render parks the caret at the end of the field, so arming the chord
   *    mid-sentence would move the reader's cursor;
   *  - disarming happens on the keydown of whatever key was pressed NEXT, before
   *    the browser has inserted it. Rebuilding the frame there detaches the
   *    textarea the keystroke was aimed at, and the character is lost — which
   *    would break the rule the chord is built on, that anything other than a
   *    digit goes on to mean exactly what it means today.
   *
   * So only the text of one line changes. The frame keeps its line count either
   * way, which is the CLI's own reason for replacing the hint rather than adding
   * a line beneath it.
   */
  function paintArmedHint(armed: boolean): void {
    const row = interactiveRows(model).find((r) => r.kind === 'field');
    if (row?.kind !== 'field' || row.armedHint === undefined) return;
    const group = wrapper.querySelector('.np-field-group');
    const hints = group ? [...group.querySelectorAll('.np-hint')] : [];
    const line = hints[hints.length - 1];
    if (!line) return;
    const focused = row.hints?.whenFocused ?? [];
    line.textContent = armed ? row.armedHint : (focused[focused.length - 1] ?? line.textContent);
  }

  function say(text: string): void {
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
      show(resolved.model, resolved.focusIndex ?? 0);
      return;
    }

    // "Done" in the settings chooser — the CLI's `__DONE__` (TtySelectFn.ts:461).
    // Handled here and not by the hook because leaving means restoring the saved
    // model WITH its body, and the save slot lives in this closure.
    if (row.kind === 'action' && row.setting === 'done') {
      leaveSettings();
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
        emit?.({ type: 'feedback', surface, text });
        say('Feedback recorded — static build.');
        return;
      }

      if (ordinal === 0) {
        // The body. BF-1: never send an empty or whitespace body — stay.
        const text = fieldValues[0] ?? '';
        if (text.trim().length === 0) return;
        emit?.({ type: 'send', surface, text });
        say('Sent — static build; no agent is wired.');
        return;
      }

      // The details field: the CLI's LOCAL merge, not an engine call. Blank
      // body or empty details cannot drive an apply (BF-1 / bug B); otherwise
      // the details land in the body under one heading, the field clears, and
      // focus returns to the body row so the next Enter sends the merged text.
      // A LOCKED body (read-only fallback) refuses the apply the way the CLI's
      // locked editor makes it unreachable — merging into a body the engine
      // will not accept edits to would show text that cannot be sent.
      const bodyRow = interactiveRows(model).find((r) => r.kind === 'field');
      if (bodyRow && bodyRow.kind === 'field' && bodyRow.readOnly) return;
      const details = (fieldValues[ordinal] ?? '').trim();
      const body = fieldValues[0] ?? '';
      if (body.trim().length === 0 || details.length === 0) return;
      const merged = mergeDetailsIntoBody(body, details);
      fieldValues[0] = merged;
      fieldValues[ordinal] = '';
      focusIndex = interactiveRows(model).findIndex((r) => r.kind === 'field');
      emit?.({ type: 'apply-details', surface, mergedBody: merged });
      render();
      // The CLI's apply parks the cursor at the end "so the view scrolls to
      // where the details landed" (cli-submit-popup.ts:1037) — render() parks
      // the caret but a textarea never scrolls to it on its own, so the merge
      // sat off-screen below the window (live on Lovable, 2026-08-25).
      const bodyField = fields()[0];
      if (bodyField) fieldScroller.follow(bodyField);
      return;
    }

    // Action rows.
    if (pef) {
      // A fixed reason submits directly.
      emit?.({ type: 'feedback', surface, category: row.label });
      say('Feedback recorded — static build.');
      return;
    }
    if (surface === 'advisory_rating' && row.kind === 'action') {
      // Mirrors the PEF branch above: a rating surface's action rows all mean
      // one thing, so they dispatch on the SURFACE, not on `act`. The score
      // comes off the row — a controller that mapped 'Good' to 3 itself would
      // send the wrong number the day someone rewords the label.
      //
      // A row with no score is not guessed at and not silently swallowed: it
      // falls through to the `default` below, which emits `activate` and says
      // so out loud (A4.3).
      if (typeof row.rating === 'number') {
        emit?.({ type: 'rating', surface, rating: row.rating, label: row.label });
        say('Rating recorded — static build.');
        return;
      }
    }
    switch (row.act) {
      case 'use-original':
        // Cancel is where feedback opens (§8.3): Use original or Esc, never send.
        emit?.({ type: 'use-original', surface });
        switchTo('prompt_enhancement_feedback');
        return;
      case 'cancel-sequence':
        emit?.({ type: 'cancel-sequence', surface });
        say('Sequence cancelled — static build.');
        return;
      case 'interruption':
        emit?.({ type: 'interruption', surface });
        say('Interruption noted — static build; the sequence prompt would return after the response.');
        return;
      default:
        // Unknown rows are never a silent no-op (A4.3).
        emit?.({ type: 'activate', surface, label: row.label });
        say(`No action wired for "${row.label}" (static build).`);
    }
  }

  function switchTo(id: SurfaceId): void {
    const next = options.registry[id];
    if (!next) return;
    show(next);
  }

  // ── settings chooser (Alt+Shift+T) ────────────────────────────────────────

  /** True while one of the chooser's two VALUE lists is open (see `settingValue`). */
  function inSettingsList(): boolean {
    return model.id === 'settings'
      && model.rows.some((r) => r.kind === 'action' && r.settingValue !== undefined);
  }

  /** Open the chooser, remembering the surface and body to come back to. */
  function enterSettings(): void {
    const root = options.registry.settings;
    if (!root || model.id === 'settings') return;
    harvest();
    // `withBodyText` THROWS on a surface with no body (`refinement.ts:137`), and a
    // throw inside a key listener is swallowed by the browser — the chooser would
    // simply never open, with nothing in the console to say why. Surfaces without
    // a field are saved as they are; only a body needs carrying back.
    const hasBody = model.rows.some((r) => r.kind === 'field');
    settingsReturn = { model: hasBody ? withBodyText(model, bodyText()) : model, focusIndex };
    show(root, 0);
  }

  /** Close the chooser, restoring BOTH halves — the surface and the edited body. */
  function leaveSettings(): void {
    const back = settingsReturn;
    settingsReturn = null;
    if (!back) {
      switchTo('prompt_enhancement');
      return;
    }
    show(back.model, back.focusIndex);
  }

  // ── escape, per surface ───────────────────────────────────────────────────

  function onEscape(): void {
    const surface = model.id;
    switch (surface) {
      case 'settings':
        // Two meanings, told apart by the ROWS: inside a value list Esc goes
        // back to the root (the CLI's sub-menu Esc), at the root it leaves the
        // chooser for the prompt. Never a close — a user who opened settings
        // mid-edit must not lose the popup, let alone the body.
        if (inSettingsList()) { switchTo('settings'); return; }
        leaveSettings();
        return;
      case 'prompt_enhancement':
        // The CLI's Esc is an IMMEDIATE close — "Feedback opens ONLY when the
        // user chooses Use original prompt … Close / Esc / crash send nothing
        // and show no feedback" (cli-submit-popup.ts:1469-1471, the shipped
        // rule; the §8.3 'every cancel' comment there is stale). The PEF
        // surface opens via Use original only.
        emit?.({ type: 'cancelled', surface });
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
        emit?.({ type: 'declined', surface });
        say('Declined — static build.');
        return;
      }
      case 'mps_continuation':
        // The footer says so: Esc cancels the whole remaining sequence.
        emit?.({ type: 'cancel-sequence', surface });
        say('Sequence cancelled — static build.');
        return;
      case 'prompt_enhancement_feedback':
        emit?.({ type: 'feedback-skipped', surface });
        say('Feedback skipped.');
        return;
      case 'advisory_rating':
        // Esc is a free skip, exactly as PEF's is. NOTE: nothing in TypeScript
        // forces this case to exist — the switch has no exhaustiveness guard,
        // so a missing case compiles clean and Esc would silently do nothing.
        // `surface-controller.test.ts` is what actually holds it in place.
        emit?.({ type: 'rating-skipped', surface });
        say('Feedback skipped.');
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

    // ARMED: the next key after Alt+Shift+R belongs to the chord. A digit 1-9
    // names a part and is swallowed — it must never reach the text, which is the
    // whole reason this sits above every other branch. Anything else disarms and
    // goes on to mean exactly what it means today, so the chord takes nothing
    // away: press Alt+Shift+R then Alt+Shift+T and the chooser still opens.
    if (removalArmed) {
      removalArmed = false;
      paintArmedHint(false);
      if (plain && /^[1-9]$/.test(e.key)) {
        removeSection(Number(e.key));
        e.preventDefault(); e.stopPropagation();
        return;
      }
    }

    // Alt+Shift+R — arm the removal chord; the digit that follows names the part.
    // The CLI's shape is Ctrl+X then a digit, and only the SHAPE can match here:
    // Ctrl+X is cut inside a textarea and Alt+Shift+X already ends the feature, so
    // R (for remove) is the free letter. Matched on e.code for the same reason as
    // every chord below it — with Alt held, e.key is a composed character on
    // macOS and layout-dependent elsewhere.
    //
    // Pressing it twice leaves the chord armed rather than doing anything, which
    // is the CLI's own rule for its prefix key.
    if (safeChord && e.code === 'KeyR') {
      removalArmed = true;
      paintArmedHint(true);
      e.preventDefault(); e.stopPropagation();
      return;
    }

    // Alt+Shift+T — the settings chooser (advisory frequency / project role).
    // The CLI's Ctrl+T; plain Ctrl+T is the browser's new-tab shortcut and is
    // not interceptable by a page, so this is the advisory panel's own remap
    // (`ui/panel.js:571-574`, user decision 2026-07-11). Matched on e.code for
    // the same reason as the chords above: with Alt held, e.key is a composed
    // character on macOS and layout-dependent elsewhere.
    //
    // Works from inside a field too — it changes no text, and a user editing the
    // body is exactly who wants to see how often this popup will appear. It is a
    // no-op unless the host registered a `settings` model, so a surface that
    // cannot act on it (the fixtures, the rating popup) never opens an empty one.
    // The "already open" case is `enterSettings`'s own guard, not a second one
    // here: two guards for one rule mean neither is covered — remove either and
    // the other still hides the bug.
    if (safeChord && e.code === 'KeyT' && options.registry.settings) {
      enterSettings();
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Ctrl/Cmd+↑/↓ or Alt+Shift+↑/↓ — caret line movement inside a field.
    // Physical codes, the D1.3 precedent: e.key is layout- and
    // modifier-dependent (Alt+Shift+letter is a special character on macOS —
    // e.code is what stays stable).
    if ((chord || safeChord) && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
      if (inField) {
        const field = e.target as HTMLTextAreaElement;
        moveCaretLine(field, e.code === 'ArrowUp' ? -1 : 1);
        // The CLI's keepCursorVisible on visual moves (multiline-editor.ts:248)
        // — setSelectionRange never scrolls, so the window must follow here.
        fieldScroller.follow(field);
      }
      e.preventDefault(); e.stopPropagation();
      return;
    }

    // Ctrl/Cmd+J or Alt+Shift+J — the newline. Enter is send, so this is the
    // only way in. setRangeText BYPASSES the readonly attribute (it blocks
    // native typing only), so the chord must respect the lock itself — the
    // Firefox live round (2026-08-25) put a newline into a locked fallback
    // body this way, text the send path then rightly discarded.
    if ((chord || safeChord) && e.code === 'KeyJ') {
      if (inField && !(e.target as HTMLTextAreaElement).readOnly) {
        const field = e.target as HTMLTextAreaElement;
        field.setRangeText('\n', field.selectionStart ?? 0, field.selectionEnd ?? 0, 'end');
        field.dispatchEvent(new Event('input', { bubbles: true }));   // auto-grow listens here
        // The CLI's keepCursorVisible on insert_newline (multiline-editor.ts:299)
        // — setRangeText never scrolls, so a newline at the fold walked the
        // caret out of the window (live on Lovable, 2026-08-25).
        fieldScroller.follow(field);
      }
      e.preventDefault(); e.stopPropagation();
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
      // Enter SENDS, so it must be the plain, committed one.
      //  - Shift+Enter is the universal "newline" chord in every chat composer;
      //    a user reaching for it must never fire an irreversible send (our own
      //    newline is Alt+Shift+J, advertised in the hint).
      //  - An IME commit (`isComposing`, or the legacy keyCode 229) is the user
      //    accepting a candidate mid-word, not submitting — without this guard
      //    every CJK/Indic user sends half a sentence.
      // Both are swallowed rather than passed to the page: the panel owns Enter
      // while it has focus, and letting them through would reach the agent's own
      // composer underneath.
      const composing = e.isComposing === true || e.keyCode === 229;
      if (e.shiftKey || composing) {
        e.preventDefault(); e.stopPropagation();
        return;
      }
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

  // ── Focus-steal guard (live-lessons 2026-08-25, twice) ──────────────────────
  // Agent pages grab focus moments after the dock shows: every chord then goes
  // to the PAGE — the popup's keys "stop working" and Ctrl+J becomes Chrome's
  // Downloads. The first guard re-took focus only when it rested on
  // document.body — but the SAME DAY's real-prompt round showed Replit and
  // Lovable re-focusing their own COMPOSER (a real element, not body) right at
  // popup time, sailing past that signature: the user had to click the popup
  // before any key worked. The honest steal signature is INTENT, not the
  // landing spot: a steal is a focus move OUT of this surface with no recent
  // user pointerdown outside it. A deliberate click into the page (tracked at
  // the document level; events inside the closed shadow retarget to the host,
  // so they never count as "outside") releases the keys — the panel family's
  // non-modal rule survives — and after the post-render window the page wins
  // by default, exactly as before.
  const FOCUS_STEAL_WINDOW_MS = 3_000;
  const USER_INTENT_MS = 1_000;
  let lastRenderAt = Date.now();
  let lastOutsidePointerAt = 0;
  function onDocPointerDown(e: Event): void {
    if (destroyed) return;
    const target = e.target as Node | null;
    const root = wrapper.getRootNode() as Document | ShadowRoot;
    const host = (root as ShadowRoot).host as HTMLElement | undefined;
    const insideSurface = target !== null
      && (wrapper.contains(target) || (host !== undefined && (target === host || host.contains(target))));
    if (!insideSurface) lastOutsidePointerAt = Date.now();
  }
  function onFocusOut(): void {
    if (destroyed) return;
    setTimeout(() => {
      if (destroyed) return;
      if (Date.now() - lastRenderAt > FOCUS_STEAL_WINDOW_MS) return;
      const root = wrapper.getRootNode() as Document | ShadowRoot;
      // A HIDDEN surface must never take focus: the dock hides the host with
      // display:none the moment a send resolves, and the injector is about to
      // focus the agent's composer — re-taking here would yank the caret into
      // an invisible popup mid-inject (guard for the 2026-08-25 inject path).
      // A HIDDEN surface must never take focus. The dock hides the host with
      // display:none the moment a send resolves (the injector is about to focus
      // the agent's composer), and hides the MOUNT when collapsed — re-taking
      // focus in either case locks the keyboard inside an invisible panel,
      // because every key this controller handles is then preventDefault'ed
      // away from the page. Walked by inline display rather than layout so the
      // check is honest in jsdom too (offsetParent is always null there).
      if (isHiddenByAncestor(wrapper)) return;
      // Focus still inside this surface (row-to-row moves) — nothing happened.
      const active = root === (doc as unknown) ? doc.activeElement : root.activeElement;
      if (active !== null && wrapper.contains(active)) return;
      // The user just clicked the page — a deliberate release, respected.
      if (Date.now() - lastOutsidePointerAt < USER_INTENT_MS) return;
      const ordinal = fieldOrdinalOf(focusIndex);
      const field = ordinal >= 0 ? fields()[ordinal] : undefined;
      (field ?? wrapper).focus({ preventScroll: true });
    }, 0);
  }

  // The CLI repaints its frame on terminal resize and re-syncs both field
  // windows (GAP-2, cli-submit-popup.ts:1311-1321 + the editor's resize
  // re-clamp). The browser reflows CSS on its own, but the fields' measured
  // inline heights and scroll markers go stale when the dock's width changes —
  // re-grow them.
  function onWindowResize(): void {
    if (destroyed) return;
    growFields(wrapper);
  }

  wrapper.addEventListener('keydown', onKeyDown);
  wrapper.addEventListener('pointerdown', onPointerDown);
  wrapper.addEventListener('focusout', onFocusOut);
  doc.addEventListener('pointerdown', onDocPointerDown, true);
  doc.defaultView?.addEventListener('resize', onWindowResize);

  show(model, options.initialFocusIndex ?? 0);

  return {
    element: wrapper,
    getModel: () => model,
    getFocusIndex: () => focusIndex,
    setSurface(id: SurfaceId): void {
      if (destroyed) return;
      switchTo(id);
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      wrapper.removeEventListener('keydown', onKeyDown);
      wrapper.removeEventListener('pointerdown', onPointerDown);
      wrapper.removeEventListener('focusout', onFocusOut);
      doc.removeEventListener('pointerdown', onDocPointerDown, true);
      doc.defaultView?.removeEventListener('resize', onWindowResize);
      wrapper.remove();
    },
  };
}
