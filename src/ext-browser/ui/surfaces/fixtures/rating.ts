// ============================================================================
// Static content for the advisory rating surface.
// ----------------------------------------------------------------------------
// Every string here is the CLI's own, quoted from
// `src/decision-session/feedback-popup.ts` — that file is where the wording is
// decided, and a contract test pins these against it so the two cannot drift.
//
// ── ONE DELIBERATE DEVIATION FROM THE CLI'S ORDER ────────────────────────────
//
// The CLI stacks: header(`feedback`) → note → blank → question → options
// (`buildFeedbackRenderOptions`: the note is the `subtitle`, above `question`).
//
// The browser cannot reproduce that order without touching the view, and change
// #3 of the dev plan is explicitly **None** for the view: everything in the
// header block — `pinch`, `trustCues`, `whyHelp` — renders ABOVE `rows`
// (`surface-view.ts:276-291`), and the note is a row. So the browser stacks:
//
//     header(`Feedback`) → question(pinch) → note(row) → blank → options
//
// The note and the question swap places; both still sit above the options and
// below the header, which is what the note is FOR — it must be read before a
// row is activated. Putting the question in `pinch` also matches what `pinch`
// is for: PE's "Shipping something?" is the same kind of line.
// ============================================================================

import type { SurfaceModel, SurfaceRow } from '../surface-model.js';

/** `FEEDBACK_QUESTION`, `feedback-popup.ts:19`. */
export const RATING_QUESTION = "How's nexpath working out for you?";

/** `FEEDBACK_NOTE`, `feedback-popup.ts:22` — what a send actually transmits. */
export const RATING_NOTE = 'Press Enter to send: your installation ID and timestamps — no prompt text.';

/**
 * The CLI has no footer string for this popup — `renderLoop` handles Enter/Esc
 * itself — but `SurfaceModel.footer` is required, so this follows PEF, the
 * closest sibling (a survey where skipping is free): `PEF_FOOTER` is
 * 'Enter submit · Esc skip'. "send" rather than "submit" because the CLI's own
 * note above says "Press Enter to send".
 */
export const RATING_FOOTER = 'Enter send · Esc skip';

/** Header suffix: the frame reads `◆ NEXPATH CLI · Feedback`. `FEEDBACK_PINCH_LABEL` is 'feedback'. */
export const RATING_LABEL = 'Feedback';

export interface RatingChoice {
  label: string;
  /** 1 = worst … 4 = best, the CLI's `rating` field. */
  rating: number;
}

/** `FEEDBACK_OPTIONS`, `feedback-popup.ts:38-43` — worst → best, top → bottom. */
export const RATING_SCALE: readonly RatingChoice[] = [
  { label: 'Bad',       rating: 1 },
  { label: 'Fine',      rating: 2 },
  { label: 'Good',      rating: 3 },
  { label: 'Excellent', rating: 4 },
];

/**
 * The rows, built from the scale rather than written out again.
 *
 * The score rides on the ROW, not on its label. The `act` field one kind up
 * says why: "Encoded in the model rather than matched on labels in the
 * controller, so a reworded label cannot silently unhook a behaviour." A label
 * lookup in the controller would make 'Good' → 3 a fact about a string.
 */
export function ratingRows(): SurfaceRow[] {
  return [
    { kind: 'note', text: RATING_NOTE, tone: 'dim' },
    ...RATING_SCALE.map((c, i): SurfaceRow => ({
      kind: 'action',
      label: c.label,
      rating: c.rating,
      ...(i === 0 ? { blankBefore: true } : {}),
    })),
  ];
}

export const RATING_FIXTURE: SurfaceModel = {
  id: 'advisory_rating',
  label: RATING_LABEL,
  pinch: RATING_QUESTION,
  rows: ratingRows(),
  footer: RATING_FOOTER,
};
