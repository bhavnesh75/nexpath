// Custom popup render loop — Path A successor to the @clack/prompts.select()
// call inside the spawned TtySelectFn subprocess.
//
// Layered design:
//
//   - `computeLayout(opts, state)` is a PURE function. Given the popup inputs
//     and current focus/expand/scroll state, it returns the ordered list of
//     styled lines ready for stdout, along with parallel LineKind tags so
//     tests can assert structural invariants (separate-element emission per
//     dev-plan §11.11) without scraping styled output. No I/O, no readline.
//
//   - `renderLoop(opts)` is the INTERACTIVE wrapper. It owns a minimal
//     readline keypress loop for arrow-key focus + Enter/Esc handling,
//     re-renders via computeLayout on every state change, and resolves with
//     the SelectableItem the user picked. The Space-key D3 toggle is wired
//     via a small hook (registerKeyHandler) so the Bhavnesh Phase 6 task
//     adds the actual toggle body without restructuring this module.
//
// Vertical render order (dev-plan §11.2) — top to bottom:
//
//   pinch label                                        ┐
//   (optional subtitle)                                │ header pair (existing)
//   question line                                      ┘
//   why-help block (R4 open + content + mood + R4 close, multi-line)
//   [1 padding row — D4]
//   option-label
//     ↳ option desc-base (truncated/expanded — D1/D2/D5)
//   ... (repeat per option)
//   (focused option's shortcut hint — Bhavnesh task, hook only here)
//   [bottom OPTION_SEPARATOR padding rows — existing pattern preserved]
//
// LineKind separate-element invariant (dev-plan §11.11):
// every emitted line is its own LineKind-tagged element even when the
// pass-through styler renders them identically. Future R10 styling work
// depends on this separation.
//
// Dev-plan deviation note: §11.12 defines RenderLoopOptions with a single
// pre-composed `message: string` field. This implementation takes
// STRUCTURED inputs (pinchLabel / subtitle / question / whyHelpBlock)
// instead so the render layer can assign correct LineKind tags without
// fragile ANSI-prefix parsing. The caller composes the structured parts
// (existing buildSelectMessage in DecisionSession.ts gets a parallel
// helper for the structured shape; the legacy `message: string` builder
// stays in place for the unchanged sub-menu select() call sites).

import type { LineKind } from './styler.js';
import { styler } from './styler.js';

// ── Public types ────────────────────────────────────────────────────────────

/** A selectable item shown in the popup option list. */
export interface SelectableItem {
  /** Selection sentinel value returned when the user picks this item. */
  value:        string;
  /** Display label (the option text). */
  label:        string;
  /**
   * Desc-base content shown as a `↳`-prefixed sub-line under the option-label.
   * Empty / undefined skips the sub-line.
   */
  descBase?:    string;
  /** True for blank-row OPTION_SEPARATOR padding items. Layout emits a blank row, never receives focus. */
  isSeparator?: boolean;
  /** True for SHOW_SIMPLER / SKIP_NOW / HELP_LABEL meta items — no desc-base sub-line. */
  isMeta?:      boolean;
}

/** Inputs to the render loop — structured shape (deviation from dev-plan §11.12 literal). */
export interface RenderLoopOptions {
  /** Pinch label (`formatPinchLabel`-style — may already carry ANSI codes per legacy pattern). */
  pinchLabel:     string;
  /** Optional level subtitle. */
  subtitle?:      string;
  /** Question line text (may already carry ANSI codes per `formatQuestion`). */
  question:       string;
  /**
   * Pre-composed why-help block (R4 open + R6 content + optional R6 mood
   * sentence + R4 close — composed by `composeWhyHelpBlock` in DecisionSession.ts).
   * Multi-line allowed; each line emits as its own popup-why-help LineKind.
   * Undefined / empty: the whole why-help region is omitted and the D4
   * padding row still separates the question from the first option.
   */
  whyHelpBlock?:  string;
  /** Option list (already includes any bottom OPTION_SEPARATOR rows + meta entries). */
  options:        readonly SelectableItem[];
  /** Terminal rows. */
  rows:           number;
  /** Terminal columns. */
  cols:           number;
  /** Minimum maxItems floor — TtySelectFn precedent is 5. */
  maxItemsFloor?: number;
}

/** Current layout state — focus + per-option expand state + scroll offset. */
export interface LayoutState {
  /** Index into `options` of the focused item. */
  focusedIndex:    number;
  /** Indices of options currently in the expanded desc-base state (D3 toggle). */
  expandedOptions: ReadonlySet<number>;
  /** Top-of-viewport row offset for auto-scrolling (D5). 0 = no scroll. */
  scrollOffset:    number;
}

/** Single emitted line with its LineKind tag + the index of the option it belongs to (or null for header/padding rows). */
export interface LineEmission {
  kind:        LineKind;
  text:        string;
  /** Index into `options` if this line is part of an option's render block; null for header / padding / why-help. */
  optionIndex: number | null;
  /** True when this row is a blank padding/separator row. Styler is still called for uniform dispatch. */
  isPadding:   boolean;
}

/** Output of `computeLayout` — ordered list of emissions + post-styler lines + per-option line ranges. */
export interface RenderedLayout {
  /** Raw per-line emissions including LineKind tags. */
  emissions:        readonly LineEmission[];
  /** Per-line styled output (parallel to emissions). What goes to stdout. */
  styledLines:      readonly string[];
  /** Per-option visible-range map — startIdx/endIdx into emissions for each option's lines. */
  optionLineRanges: readonly { startIdx: number; endIdx: number; itemIndex: number }[];
}

// ── Locked constants (dev-plan §11.5 / §11.6 / §11.8 / §11.9 / R1.1-Sub1.4) ─

/** D1 — visible line cap for the truncated desc-base state. */
export const D1_TRUNCATED_LINE_CAP = 2;

/** D5 — hard truncate cap for the expanded desc-base state. */
export const D5_EXPANDED_LINE_CAP = 8;

/** D4 — number of blank rows between the why-help block and the first option. */
export const D4_PADDING_ROW_COUNT = 1;

/** D2 — truncation marker appended when content overflows the active cap. */
export const D2_TRUNCATION_MARKER = '...';

/** R1.1-Sub1.4 Variant A — desc-base sub-line prefix glyph. */
export const SUB_LINE_PREFIX = '↳ ';

/** Default minimum maxItems floor — matches TtySelectFn precedent. */
export const DEFAULT_MAX_ITEMS_FLOOR = 5;

// ── Pure layout computation ─────────────────────────────────────────────────

/**
 * Build the ordered list of line emissions for the popup, applying every
 * dev-plan §11 layout rule (vertical order, LineKind separate-element
 * invariant, D1/D2/D4/D5 truncation + padding, styler dispatch). Returns
 * structural metadata alongside the styled lines so tests can assert
 * invariants without scraping the styled output.
 *
 * Per §11.2 the layout iterates:
 *
 *   1. pinch-label    — one emission
 *   2. (subtitle)     — one emission with pinch-label kind (no subtitle-specific kind in §11.10)
 *   3. question       — one emission
 *   4. why-help block — one emission per line
 *   5. D4 padding     — one blank row (popup-why-help kind, isPadding=true)
 *   6. per-option:
 *        option-label     — one emission
 *        desc-base sub-line(s) — D1 / D5 truncated, with `↳` prefix on first line + `...` marker on overflow
 *   7. (caller appends any bottom OPTION_SEPARATOR / meta rows via `options`)
 *
 * D1/D2/D5 are filled in by sub-batch 4b/4d; the 4a skeleton emits each
 * option's desc-base as a single un-truncated line so the structural
 * surface is in place for the truncation work to plug into.
 */
export function computeLayout(opts: RenderLoopOptions, state: LayoutState): RenderedLayout {
  const emissions: LineEmission[] = [];

  // ── Header pair ────────────────────────────────────────────────────────────
  emissions.push({ kind: 'pinch-label', text: opts.pinchLabel, optionIndex: null, isPadding: false });

  if (opts.subtitle && opts.subtitle.length > 0) {
    // No separate subtitle LineKind exists in §11.10 — emit under pinch-label
    // since the subtitle is part of the header pair.
    emissions.push({ kind: 'pinch-label', text: opts.subtitle, optionIndex: null, isPadding: false });
  }

  emissions.push({ kind: 'question', text: opts.question, optionIndex: null, isPadding: false });

  // ── Why-help block ─────────────────────────────────────────────────────────
  // Each line of the composed why-help block emits as a SEPARATE popup-why-help
  // LineKind element (dev-plan §11.11 load-bearing separate-element invariant).
  if (opts.whyHelpBlock && opts.whyHelpBlock.length > 0) {
    const lines = opts.whyHelpBlock.split('\n');
    for (const ln of lines) {
      emissions.push({ kind: 'popup-why-help', text: ln, optionIndex: null, isPadding: false });
    }
  }

  // ── D4 padding row(s) between why-help and first option ────────────────────
  for (let p = 0; p < D4_PADDING_ROW_COUNT; p++) {
    // Padding row carries no semantic content — emitted as a blank popup-why-help
    // line so dispatch is uniform (styler is still called) without inventing a
    // new "padding" LineKind.
    emissions.push({ kind: 'popup-why-help', text: '', optionIndex: null, isPadding: true });
  }

  // ── Option list ────────────────────────────────────────────────────────────
  const optionLineRanges: { startIdx: number; endIdx: number; itemIndex: number }[] = [];
  for (let i = 0; i < opts.options.length; i++) {
    const item     = opts.options[i];
    const startIdx = emissions.length;

    if (item.isSeparator) {
      // Blank padding row, no LineKind-specific styling.
      emissions.push({ kind: 'option-label', text: '', optionIndex: i, isPadding: true });
    } else {
      // option-label line.
      emissions.push({ kind: 'option-label', text: item.label, optionIndex: i, isPadding: false });

      // desc-base sub-line — only for non-meta items with descBase content.
      // Truncation (D1/D2/D5) lives in sub-batch 4b/4d; 4a emits the raw
      // descBase as a single sub-line (with `↳` prefix) for structural shape.
      if (!item.isMeta && item.descBase && item.descBase.length > 0) {
        const isExpanded = state.expandedOptions.has(i);
        emissions.push({
          kind:        isExpanded ? 'desc-base-expanded' : 'desc-base-truncated',
          text:        `${SUB_LINE_PREFIX}${item.descBase}`,
          optionIndex: i,
          isPadding:   false,
        });
      }
    }

    optionLineRanges.push({ startIdx, endIdx: emissions.length, itemIndex: i });
  }

  // ── Styler dispatch (D6) ───────────────────────────────────────────────────
  // Every emitted line passes through styler(text, kind). Pass-through today
  // (Phase 1 styler returns input unchanged); Bhavnesh R10 work replaces the
  // body with per-kind ANSI mapping. The dispatch site stays the same.
  const styledLines = emissions.map((e) => styler(e.text, e.kind));

  return { emissions, styledLines, optionLineRanges };
}
