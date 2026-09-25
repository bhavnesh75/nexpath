// ============================================================================
// Typed model for a CLI-parity surface.
// ----------------------------------------------------------------------------
// Sub-phase D3.1. Types only — no DOM, no rendering, no imports. What a surface
// IS, separate from how it is drawn.
//
// WHY TYPED AT ALL, when the content is static (D-5). Because it will not stay
// static. A literal-DOM build would have to be rewritten the day live data
// arrives; a typed model means the fixture is swapped for a producer and nothing
// else moves. The cost now is this file.
//
// The shape follows the CLI's own line grammar rather than any one surface, so
// MPS-1, MPS-2 and PEF (D4) describe themselves with the same vocabulary.
// ============================================================================

/** Which surface a model describes. Drives nothing here; it is for callers. */
export type SurfaceId =
  | 'prompt_enhancement'
  | 'mps_first'
  | 'mps_continuation'
  | 'prompt_enhancement_feedback'
  | 'advisory_rating'
  /**
   * The Alt+Shift+T chooser (advisory frequency / project role). ONE id for all
   * three of its views — root, the frequency list and the role list — because
   * they differ only in their rows and label, and Esc tells them apart by the
   * rows themselves (a value row carries `settingValue`), never by a label.
   */
  | 'settings';

/**
 * The hint lines under an editable field.
 *
 * Order is `always` then `whenFocused`, which is exactly what the CLI emits and
 * why two lists are needed rather than one. The body row shows its hint only
 * while focused; the details row shows "Enter applies these details" at all
 * times and adds the edit-keys line beneath it when focused
 * (`cli-submit-popup.ts:800-818`).
 */
export interface FieldHints {
  /** Shown whether or not the row has focus. */
  always?: readonly string[];
  /** Appended below `always`, only while the row has focus. */
  whenFocused?: readonly string[];
}

/**
 * One row of a surface.
 *
 * Every row is a radio option in the CLI — filled bullet when focused, hollow
 * otherwise — and an editable row additionally renders its field beneath the
 * label. That is the whole distinction, so it is the whole union.
 */
export type SurfaceRow =
  | {
      kind: 'field';
      label: string;
      /** Current text of the field. Static today; a producer fills it later. */
      text: string;
      /** Shown in place of empty text — PEF's `(type your feedback)`. */
      placeholder?: string;
      hints?: FieldHints;
      /** The CLI opens some blocks with a blank line; the model says which. */
      blankBefore?: boolean;
      /**
       * The CLI's locked editor (`editabilityState !== 'editable'` — e.g. a
       * read-only fallback body): the field renders but typing is impossible.
       * Live 2026-08-25: rendering a locked body as editable let the user type
       * text the engine then correctly discarded on send — the field must
       * never promise an edit the send path will not honour.
       */
      readOnly?: boolean;
      /** The CLI's "  (unavailable)" row marker (`cli-submit-popup.ts:777`). */
      unavailable?: boolean;
      /**
       * Fixed window for this field in lines — the CLI caps the PE details
       * field at 5 rows (`cli-submit-popup.ts:1335`). Fields WITHOUT it size
       * adaptively to the remaining band, the CLI's fill-the-window rule
       * (:1354-1365).
       */
      maxLines?: number;
      /**
       * Display-only numbers for this field's own lines: given the text the
       * field currently holds, which logical line (0-based) carries which
       * number. The renderer draws each one dim after its line and nowhere
       * else; nothing here reaches the text, the caret, or what is sent.
       *
       * A FUNCTION rather than a list, and that is the load-bearing part. The
       * field's text changes under the user's fingers with no re-render — this
       * surface has no text-changed event and the producer is not asked for one
       * — so a precomputed list would describe the text as it was when the model
       * was built. Asked afresh on every keystroke, the answer is always about
       * what is actually on screen.
       *
       * It also keeps this layer honest: the surfaces know nothing about what a
       * number MEANS. Whoever builds the model owns that rule and passes it in.
       *
       * ⚠️ A rule is bound to the content its producer built it from. Deriving a
       * model whose field holds DIFFERENT content — a locally recomposed body,
       * say — must rebuild the rule rather than carry this one across, or the
       * new text is numbered against the old structure.
       */
      lineNumbers?: (text: string) => ReadonlyMap<number, number>;
      /**
       * Remove the numbered part a digit names from this field's text and give
       * back what remains — or `undefined` when the rule refuses, which is the
       * only way it can say no. A refusal leaves the field exactly as it was.
       *
       * A rule for the same reasons as `lineNumbers`, and it must agree with it:
       * the digit a reader types is the number they can SEE, so both answers are
       * computed from the text in front of them, and neither layer here knows
       * what a section is or which removals are refused. Whoever builds the
       * model owns both, and owns keeping them consistent.
       */
      removeSection?: (text: string, sectionNumber: number) => string | undefined;
      /**
       * Which stretches of this field's text are emphasised — half-open
       * `[start, end)` character offsets into the text as given, in any order.
       *
       * A rule for the same reasons as `lineNumbers`: asked afresh on every
       * keystroke, so the answer is always about what is on screen, and this
       * layer knows nothing about what an emphasised stretch MEANS. Whoever
       * builds the model owns that rule — including the standard's two
       * exclusions, a title line and a section whose kind is excluded, which are
       * decided before a range ever reaches here.
       *
       * ⛔ DISPLAY-ONLY, and this is the whole of it: a range never touches
       * `text`, so the field's value is what it always was and what is sent is
       * unchanged. Absent means no bold, and the row is then the row it was
       * before this field existed — down to the DOM.
       */
      boldRanges?: (text: string) => readonly { start: number; end: number }[];
      /**
       * The line to show INSTEAD of this field's focused hint while the removal
       * chord is armed — the question the digit answers.
       *
       * It replaces the hint rather than joining it, which is the CLI's own
       * rule and its reason: the frame keeps its line count either way, so
       * nothing below the hint moves when the chord arms. A line that appeared
       * would push the rows down and back on every press.
       *
       * Absent means the chord changes nothing on screen — which is what the
       * surface did before this existed.
       */
      armedHint?: string;
      /**
       * What to say when {@link removeSection} refuses.
       *
       * ONE string for every refusal, as the CLI settled: a number naming no
       * section, a locked body, and a cut that would leave the prompt blank all
       * read the same to a reader, who needs to know only that the section did
       * not go. Why it did not is not their question.
       *
       * It is shown for ONE render and then clears itself. This surface runs its
       * own loop rather than the engine's, so nothing else would ever take it
       * down again.
       */
      removalNotice?: string;
    }
  | {
      kind: 'action';
      label: string;
      /**
       * What activating this row means (D6). Encoded in the model rather than
       * matched on labels in the controller, so a reworded label cannot silently
       * unhook a behaviour. Rows without one fall through to the controller's
       * generic activate event — or to its pluggable transitions hook.
       */
      act?: 'use-original' | 'cancel-sequence' | 'interruption';
      /**
       * The advisory rating surface's 1-4 score (`feedback-popup.ts:38-43`,
       * 1 = Bad … 4 = Excellent). On the row for the same reason `act` is: the
       * controller must not learn that 'Good' means 3, or renaming the label
       * would silently change what gets sent.
       */
      rating?: number;
      /**
       * The settings chooser's row identity — which setting this row is about.
       * On the row for the same reason `rating` is: the label carries the
       * CURRENT value ("Advisory frequency - High"), so matching on it would
       * unhook the row the moment a value changes.
       */
      setting?: 'frequency' | 'role' | 'done';
      /**
       * The value a settings row SELECTS. Present on the rows of the two lists
       * and absent on the root's, which is exactly how Esc knows whether it is
       * in a list (go back to the root) or at the root (leave the chooser).
       */
      settingValue?: string;
      /** MPS's Cancel row carries the CLI's paleYellow. */
      tone?: 'plain' | 'cancel';
      /** A line under the label, like MPS-2's interruption helper. */
      helper?: string;
      blankBefore?: boolean;
      /** The CLI's "  (unavailable)" row marker (`cli-submit-popup.ts:777`). */
      unavailable?: boolean;
    }
  | {
      /**
       * A line the user cannot act on: MPS-1's `Sequence plan` block, MPS-2's
       * `Your original:` and the prompt beneath it. No bullet, no focus — the
       * CLI prints these as plain indented text and never counts them as rows.
       */
      kind: 'note';
      text: string;
      /** Column the CLI indents it to. */
      indent?: 2 | 4;
      tone?: 'dim' | 'plain';
      blankBefore?: boolean;
    };

/**
 * A whole surface, in the order the CLI renders it: header, pinch label, trust
 * cues, why-help, an optional provider-failure notice, the rows, then the footer.
 *
 * Optional fields are optional in the CLI too — it omits the pinch label when a
 * surface has none, and emits the provider-failure notice only on a real
 * provider failure, never on a no-key or invalid-output run.
 */
export interface SurfaceModel {
  id: SurfaceId;
  /** Header suffix: the frame reads `◆ NEXPATH CLI · <label>`. */
  label: string;
  pinch?: string;
  trustCues?: readonly string[];
  /** Multi-line. Rendered one row per line, as the CLI does. */
  whyHelp?: string;
  /** Present only on a real provider failure. Rendered in the caution tone. */
  providerFailure?: string;
  /** MPS-2's `Sequence 1 of 4`, dim, on its own line under the header block. */
  progress?: string;
  /**
   * Columns a field's content and its hints indent to.
   *
   * Not one number, because the CLI does not use one: PE indents both by four,
   * MPS keeps content at four but pushes hints to six, and PEF puts both at six.
   * Per-surface rather than per-row, because within a surface they never differ.
   */
  fieldIndent?: 4 | 6;
  hintIndent?: 4 | 6;
  rows: readonly SurfaceRow[];
  footer: string;
}

/** Which row currently has focus. Not part of the model — it changes, the model does not. */
export interface SurfaceState {
  focusIndex: number;
  /**
   * A transient line above the footer — the CLI's publicNotice slot. State, not
   * model: it describes what just happened, not what the surface is.
   */
  notice?: string;
}
