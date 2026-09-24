/**
 * The prompt-enhancement panel's view/command contract — the browser rendering
 * of the CLI popup's locked layout (analysis §7 / cli-submit-popup's target
 * frame). The service worker runs the ENGINE'S OWN popup state machine
 * (`runPromptEnhancementCliSubmitPopupV1`) and bridges it to the panel through
 * these two types:
 *
 *   SW ── PePanelViewV1 ──▶ panel      (one message per render of the loop)
 *   panel ── PePanelCommandV1 ──▶ SW   (one short-lived message per user action)
 *
 * The view is a WHITELISTED projection of the engine's render model — never the
 * full prepare result (ids, session internals, and validation graphs stay in
 * the SW). The command set mirrors `PromptEnhancementCliPopupCommandV1`,
 * feedback included: suggested categories AND the CLI PEF's free-text Other
 * (PE-BR-11 closed 2026-08-25 — typed feedback persists in the browser's own
 * feedback store, capped and local, never logged to the ring as text).
 *
 * The advisory panel's frozen `ui-contract.ts` is deliberately NOT extended —
 * that file is the UI developer's contract for panel.js; this one is
 * engine-side (a settled decision) and owned with the popup host.
 */

export const PE_PANEL_SCHEMA_VERSION = 1 as const;

/**
 * One composed section of the enhanced body, as the panel is allowed to see it.
 *
 * ⚠️ The NUMBER is deliberately not here. The CLI derives each section's number
 * from the LIVE editor buffer on every frame, so a title the user just typed or
 * deleted is numbered correctly as they type. The panel has no such loop — it
 * keeps its text locally and the worker only hears about an edit on an apply or
 * a terminal action — so a number computed worker-side would freeze the moment
 * the popup opened. What crosses is therefore the section AS COMPOSED, the
 * exact input the engine's own section map takes, and the number is derived
 * where it is drawn.
 *
 * Nothing beyond those two fields is projected: the section's kind is engine
 * business. `bodyText` discloses nothing new — it is the text that already sits
 * under this section's title inside `PePanelViewV1.bodyText`.
 */
export interface PePanelSectionV1 {
  /** The section's title, exactly as its title line reads without the colon. */
  title: string;
  /** The text the section was composed with — what follows its title line. */
  bodyText: string;
}

/** One directional/adjust control row (Shorter / More thorough / More project-grounded). */
export interface PePanelDirectionalV1 {
  actionType: 'shorter' | 'more_thorough' | 'more_project_grounded';
  label: string;
  /** Engine availability verbatim; the panel disables anything not 'available'. */
  availability: string;
}

export interface PePanelViewV1 {
  schemaVersion: typeof PE_PANEL_SCHEMA_VERSION;
  /** Monotonic render counter within one popup run — commands echo it back. */
  viewSeq: number;
  /** 'Nexpath · Prompt enhancement' (the engine's locked title, passed through). */
  title: string;
  /** 'Use enhanced prompt' — the editor heading above the body. */
  editorHeading: string;
  /** Header strip (collapse absent rows — never manufactured). */
  pinchLabel?: string;
  whyHelp?: string;
  /** The ONE editable enhanced body — current text including prior edits. */
  bodyText: string;
  bodyEditable: boolean;
  /**
   * The composed sections of `bodyText`, in body order — what the panel numbers
   * `#N` from.
   *
   * DISPLAY-ONLY: a number is never part of `bodyText` and is never sent. And
   * OPTIONAL in the wire-compat sense this file already uses for
   * `detailsAvailable` / `currentFrequency`: absent means "no numbers", so an
   * older worker and a newer panel draw exactly the frame they drew before this
   * field existed.
   *
   * A section listed here is not promised a number: the engine's map gives one
   * only to a title it finds in the live text, which is how a title the user
   * edited away stops being numbered while the rest stay contiguous.
   */
  sections?: readonly PePanelSectionV1[];
  /** Additional-details field state (present only when the engine offers the action). */
  hasAdditionalDetails: boolean;
  additionalDetailsText: string;
  /**
   * Row availability, straight from the engine's controls — the CLI renders an
   * unavailable row WITH an "(unavailable)" marker instead of hiding it
   * (`cli-submit-popup.ts:777`, details row :636, use-original :672).
   * Optional for wire-compat with an older SW: absent means available.
   */
  detailsAvailable?: boolean;
  originalAvailable?: boolean;
  directional: readonly PePanelDirectionalV1[];
  /** True on a directional refinement view — renders the Go back row. */
  refinement: boolean;
  /**
   * True when the engine's controls carry the feedback action. v1 renders the
   * CLI popup's two SUGGESTED categories only, recorded as content-free
   * signals (typed feedback rows are deferred — PE-BR-11); free-text feedback
   * is not rendered.
   */
  hasFeedback: boolean;
  /** Public-safe notices (engine copy verbatim; absent = not rendered). */
  publicNotice?: string;
  providerFailureNotice?: string;
  trustCues: readonly string[];
  /**
   * What the Alt+Shift+T chooser shows as current — the stored `advisory_frequency`
   * and `role`. Optional and additive: a worker that does not send them leaves the
   * chooser's rows unlabelled rather than claiming a value, and every older view
   * still validates.
   *
   * They travel on the VIEW because this is a whitelisted projection — the panel
   * has no storage access of its own, by design, and the write goes back out on
   * the extension's footer-intent channel rather than as a popup command.
   */
  currentFrequency?: string;
  currentRole?: string;
}

/**
 * MPS-1 sequence offer (PB6) — the browser rendering of the engine's first-popup
 * model (locked §3.3, `Nexpath · Multi-prompt sequence`): the FIRST enhanced
 * prompt of a detected sequence, the remaining-task plan, and three outcomes —
 * send the first prompt / continue to the regular enhancement popup (Esc) /
 * cancel the sequence (the model's own 'Use original prompt' row). No local
 * queue, pointer, or auto-advance exists here (continuations stay engine-gated
 * and are DEFERRED — the offer never invents sequence runtime authority).
 */
export interface PeSequenceOfferViewV1 {
  schemaVersion: typeof PE_PANEL_SCHEMA_VERSION;
  kind: 'sequence_offer';
  viewSeq: number;
  title: string;
  heading: string;
  pinchLabel?: string;
  whyHelp?: string;
  providerFailureNotice?: string;
  /** The first sequence prompt — editable; send carries the live text. */
  bodyText: string;
  remainingTaskCount: number;
  taskSummaryLines: readonly string[];
  /** The cancel row's engine label ('Use original prompt'). */
  cancelLabel: string;
}

/**
 * The advisory rating surface's view.
 *
 * Almost empty on purpose: the surface is wholly static (its question, note,
 * four scores and footer are constants in `ui/surfaces/fixtures/rating.ts`), so
 * the only thing the worker has to pass is the sequence number a command echoes
 * back. There is no body, no title and no engine state — which is also why
 * `pefSurfaceModel`'s producer took no arguments and this one takes none either.
 */
export interface PeRatingViewV1 {
  schemaVersion: typeof PE_PANEL_SCHEMA_VERSION;
  kind: 'rating';
  viewSeq: number;
}

/**
 * ⚠️ `'kind' in v` is NOT a test for "is this the sequence offer" any more.
 * Two views now carry a `kind`, so every discriminant must name the one it
 * means — `v.kind === 'sequence_offer'`. `pe-dock-adapter.ts` used the loose
 * form in four places; the two that decide behaviour were made explicit when
 * this type was added (the ✕ button's command, and the surface registry).
 */
export type PePanelAnyViewV1 = PePanelViewV1 | PeSequenceOfferViewV1 | PeRatingViewV1;

export type PePanelCommandV1 =
  | { type: 'use_current'; bodyText: string }
  | { type: 'use_original' }
  | { type: 'apply_details'; bodyText: string; detailsText: string }
  | { type: 'shorter'; bodyText: string }
  | { type: 'more_thorough'; bodyText: string }
  | { type: 'more_project_grounded'; bodyText: string }
  | { type: 'go_back' }
  | { type: 'close' }
  /**
   * The panel merged/edited the body LOCALLY (the CLI-parity details merge in
   * the dock) — non-terminal; the engine records it as its own edit_body so
   * editedBodyText tracks what the user sees.
   */
  | { type: 'edit_body'; bodyText: string }
  /** Suggested feedback: the content-free category (CLI PEF rows 1-2). */
  | { type: 'feedback_suggested'; category: 'not_relevant_enough' | 'too_much_or_too_long' }
  /** Free-text feedback — the CLI PEF's "Other" row (1..5000 chars, :1165). */
  | { type: 'feedback_other'; text: string }
  // MPS-1 offer outcomes (valid only while a sequence-offer view is live).
  | { type: 'mps_send'; bodyText: string }
  | { type: 'mps_decline' }
  | { type: 'mps_cancel' }
  /**
   * The advisory rating surface's answer: the 1-4 score the user picked
   * (`decision-session/feedback-popup.ts:38-43`, 1 = Bad … 4 = Excellent).
   *
   * There is no matching "skipped" command. Esc and the dock's ✕ both mean no
   * rating, and both already have one: `close`.
   */
  | { type: 'rating'; rating: number };

/** Panel → host events (same driving pattern as the advisory panel's onEvent). */
export type PePanelEventV1 =
  | { type: 'command'; viewSeq: number; command: PePanelCommandV1 }
  | { type: 'move'; dx: number; dy: number };

export interface PePanelControllerV1 {
  show(view: PePanelAnyViewV1): void;
  /** Disable inputs while a command round-trips (the next show() re-enables). */
  setBusy(busy: boolean): void;
  hide(): void;
  destroy(): void;
  /** True while the panel is visible (drives the content-side keepalive). */
  isOpen(): boolean;
  /**
   * True while the panel is showing the feedback surface AFTER a terminal choice.
   *
   * Optional and additive: a host that does not implement it behaves exactly as
   * before. It exists so a close arriving from elsewhere cannot tear down a
   * feedback step the user is in the middle of — see pe-inject's close handler.
   */
  isCollectingFeedback?(): boolean;
}

const COMMAND_TYPES = new Set([
  'use_current', 'use_original', 'apply_details', 'shorter',
  'more_thorough', 'more_project_grounded', 'go_back', 'close',
  'edit_body', 'feedback_suggested', 'feedback_other',
  'mps_send', 'mps_decline', 'mps_cancel',
  'rating',
]);

/** The CLI's scale is 1..4 and nothing else — `feedback-popup.ts:38-43`. */
const RATING_MIN = 1;
const RATING_MAX = 4;
const TEXT_FREE_COMMANDS = new Set(['use_original', 'go_back', 'close', 'mps_decline', 'mps_cancel']);
const FEEDBACK_CATEGORIES = new Set(['not_relevant_enough', 'too_much_or_too_long']);
/** The CLI's Other-feedback bound (`cli-submit-popup.ts:136`, enforced :1165). */
export const PE_FEEDBACK_OTHER_MAX_CHARS = 5_000;

export function isPePanelCommandV1(value: unknown): value is PePanelCommandV1 {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v['type'] !== 'string' || !COMMAND_TYPES.has(v['type'])) return false;
  if (TEXT_FREE_COMMANDS.has(v['type'])) return true;
  if (v['type'] === 'feedback_suggested') {
    return typeof v['category'] === 'string' && FEEDBACK_CATEGORIES.has(v['category']);
  }
  if (v['type'] === 'rating') {
    // Bounded here, at the trust boundary, because this number is the ONLY
    // user-influenced value that reaches the analytics envelope. A page that
    // forged a command must not be able to post rating 0, 99 or 1.5.
    const r = v['rating'];
    return typeof r === 'number' && Number.isInteger(r) && r >= RATING_MIN && r <= RATING_MAX;
  }
  if (v['type'] === 'feedback_other') {
    return typeof v['text'] === 'string'
      && v['text'].trim().length > 0
      && v['text'].length <= PE_FEEDBACK_OTHER_MAX_CHARS;
  }
  if (typeof v['bodyText'] !== 'string') return false;
  if (v['type'] === 'apply_details') return typeof v['detailsText'] === 'string';
  return true;
}
