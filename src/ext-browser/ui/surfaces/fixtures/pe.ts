// ============================================================================
// Static content for the PE surface.
// ----------------------------------------------------------------------------
// Sub-phase D3.5. The strings are the CLI's own, so the parity test has
// something real to compare: hint text and the footer are quoted from
// `cli-submit-popup.ts`, and the body reads like a prompt the popup would
// actually be holding.
//
// This is the file a producer replaces when live data arrives (D-5). Nothing
// else has to move, which is the whole reason the model is typed.
// ============================================================================

import type { SurfaceModel } from '../surface-model.js';

/**
 * The edit-keys hint — the ADVERTISED chords are the extension's Alt+Shift
 * family, NOT the CLI's Ctrl/Cmd spelling. Deliberate divergence (2026-08-25,
 * the advisory panel's Ctrl+T→Alt+Shift+T precedent): with focus strayed to
 * the agent page, Ctrl+J is CHROME'S OWN Downloads shortcut, so advertising it
 * trains users into opening a browser page. Alt+Shift+J / Alt+Shift+↑↓ mean
 * nothing to any browser or OS; the controller still ACCEPTS Ctrl/Cmd+J
 * in-panel for CLI muscle memory. macOS names the Option key.
 */
export const EDIT_KEYS_HINT =
  typeof process !== 'undefined' && process.platform === 'darwin'
    ? 'Option+Shift+J new line · Option+Shift+↑/↓ move line'
    : 'Alt+Shift+J new line · Alt+Shift+↑/↓ move line';

/** `cli-submit-popup.ts:511`. */
export const BODY_HINT = 'Enter sends this prompt';

/** `cli-submit-popup.ts:512`. */
export const DETAILS_HINT = 'Enter applies these details · unapplied details are not sent';

/**
 * The panel's own three removal texts — ruled 2026-09-24, and deliberately NOT
 * the CLI's.
 *
 * The CLI says `Ctrl+X #N`, `Remove which section? 1-9` and `this section not
 * found`. None of those can be reused here:
 *
 *  - the chord differs, because `Ctrl+X` is cut inside a textarea and the panel
 *    advertises the `Alt+Shift` family (the same remap as the edit keys above);
 *  - the armed line names `#1-#9` rather than `1-9`, because the panel draws its
 *    numbers as `#1` and `#2` — the digit is named the way the reader sees it;
 *  - the notice is worded apart from the CLI's on purpose. `section not found`
 *    was considered and dropped: it sits INSIDE the CLI's own string, and the
 *    parity rewrite substitutes globally, so the day a notice normalisation is
 *    added it would turn the CLI's line into that text with a word doubled.
 */
export const REMOVAL_HINT = 'Alt+Shift+R #N';

/**
 * Shown INSTEAD of the hint while the chord is armed — never in addition to it,
 * so the frame keeps its line count and nothing below moves.
 */
export const REMOVAL_ARMED_HINT = 'Alt+Shift+R — which section? #1–#9';

/** ONE text for every refusal, as the CLI settled: the reader needs only that the section did not go. */
export const REMOVAL_NOTICE = 'no section with that number';

/** `PROMPT_ENHANCEMENT_CLI_FOOTER_V1`, `cli-submit-popup.ts:509`. */
export const PE_FOOTER = '↑↓ move · Esc cancel';

export const PE_FIXTURE: SurfaceModel = {
  id: 'prompt_enhancement',
  label: 'Prompt enhancement',
  pinch: 'Shipping something?',
  trustCues: ['Your original request is kept in full.'],
  whyHelp: 'Shown because this looks risky to roll back — plan the undo path first.',
  rows: [
    {
      kind: 'field',
      label: 'Use enhanced prompt',
      text: [
        'Add a Stripe webhook handler for payment_intent.succeeded.',
        '',
        'Scope: only the webhook route + its handler.',
        'Acceptance: signature verified, idempotent on retry, unit test for both paths.',
        'Verification: run the payment test suite and paste the output.',
      ].join('\n'),
      // Focused only. Off-focus the send hint would be a lie — Enter acts on
      // whichever row IS focused, not on the body (owner, 2026-08-19).
      hints: { whenFocused: [`${EDIT_KEYS_HINT} · ${REMOVAL_HINT} · ${BODY_HINT}`] },
      armedHint: REMOVAL_ARMED_HINT,
      removalNotice: REMOVAL_NOTICE,
    },
    {
      kind: 'field',
      label: 'Additional details',
      text: 'Keep the existing retry helper — do not rewrite it.',
      // Always, then the edit keys when focused — the CLI's order.
      hints: { always: [DETAILS_HINT], whenFocused: [EDIT_KEYS_HINT] },
      blankBefore: true,
    },
    // The refinement rows are part of THIS surface, not a variant of it. The
    // CLI keeps its own copies commented out (`cli-submit-popup.ts:641-664`,
    // owner 2026-08-19: do not show dead buttons) because its recompose path is
    // not wired; the browser's is, so C-4 puts them on screen. That difference
    // is handled in one place — the parity suite strips them before comparing —
    // rather than by keeping a second fixture that made them look optional.
    { kind: 'action', label: 'Shorter', blankBefore: true },
    { kind: 'action', label: 'More thorough' },
    { kind: 'action', label: 'More project-grounded' },
    { kind: 'action', label: 'Use original prompt', act: 'use-original' },
  ],
  footer: PE_FOOTER,
};
