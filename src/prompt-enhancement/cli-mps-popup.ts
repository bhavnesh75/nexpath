import type { PromptEnhancementMpsFirstPopupModelV1 } from './first-popup.js';
import type { PromptEnhancementMpsContinuationPopupModelV1 } from './continuation-popup.js';
import type { PromptEnhancementEditorFieldV1 } from './multiline-editor.js';
import { isPromptEnhancementScrollMarkerLineV1 } from './cli-submit-popup.js';
import { PROMPT_ENHANCEMENT_SEQUENCE_TASK_KINDS_V1 } from './sequence-payload.js';

// ---------------------------------------------------------------------------
// UI-6 — MPS first-popup host rendering (alignment plan §3.3).
//
// Pure, host-independent projection: it renders a validated first-popup model
// (built by `first-popup.ts`) into the locked §3.3 terminal frame. It has NO
// runtime, queue, pointer, Stop correlation, terminality, delivery, or host
// transport, and never renders `Use original`, future prompt text, a queue
// pointer, or an automatic send/advance. Focus is a display cue only
// (focusIsNotAuthority); the interactive rows are body → Additional details →
// Cancel, and the Sequence plan block is dim and non-interactive.
//
// The editable body/details shown here are exactly the buffers the reused UI-2
// multiline editor maintains; wiring live keypresses/runtime is the gated host
// step and is intentionally not created here.
// ---------------------------------------------------------------------------

export const PROMPT_ENHANCEMENT_MPS_CLI_FOOTER_V1 = 'Enter send · Esc actions' as const;
// MPS-2/6.3 (owner: UI/UX presentation lane): on the CONTINUATION surface Escape CANCELS the
// active sequence (owner ruling 2026-08-10), so the footer says so — distinct from the first popup, where
// Escape only leaves editor focus / declines the offer (nothing activated → nothing to cancel).
export const PROMPT_ENHANCEMENT_MPS_CLI_CONTINUATION_FOOTER_V1 = 'Enter send · Esc cancels sequence' as const;
export const PROMPT_ENHANCEMENT_MPS_CLI_SEQUENCE_PLAN_LABEL_V1 = 'Sequence plan' as const;
export const PROMPT_ENHANCEMENT_MPS_CLI_ADDITIONAL_DETAILS_LABEL_V1 = 'Additional details' as const;
/** Editing keys shown under a focused editable field (owner request), matching the PE popup. */
const PROMPT_ENHANCEMENT_MPS_CLI_EDIT_KEYS_HINT_V1 = process.platform === 'darwin'
  ? 'Cmd+J new line · Cmd+↑/↓ move line'
  : 'Ctrl+J new line · Ctrl+↑/↓ move line';
/** Details helpers (owner request 2026-08-07): the same wording the PE popup shows — Enter on the
 * details row APPLIES the details into the enhanced sequence prompt above; it never sends. */
const PROMPT_ENHANCEMENT_MPS_CLI_DETAILS_HINT_V1 = 'Enter applies these details · unapplied details are not sent' as const;
/** The "whole prompt is included" reassurance moves OFF the "↓ N more lines below" scroll marker
 * and ONTO the body's edit-keys hint (owner request 2026-08-07 — MPS only). */
const PROMPT_ENHANCEMENT_MPS_CLI_WHOLE_PROMPT_SUFFIX_V1 = ' · the whole prompt is included' as const;

/**
 * Render an MPS body: strip the "· the whole prompt is included" suffix off the "↓ N more lines
 * below" marker, dim the scroll markers, and report whether hidden-below content exists so the
 * caller can append the reassurance to the edit-keys hint instead.
 */
function renderMpsBodyLinesV1(
  bodyText: string,
  c: typeof PROMPT_ENHANCEMENT_MPS_CLI_SGR_V1 | null,
): { lines: readonly string[]; hiddenBelow: boolean } {
  let hiddenBelow = false;
  const lines = bodyText.split('\n').map((rawLine) => {
    let line = rawLine;
    if (rawLine.endsWith(PROMPT_ENHANCEMENT_MPS_CLI_WHOLE_PROMPT_SUFFIX_V1) && /^↓ \d+ more lines below/.test(rawLine)) {
      hiddenBelow = true;
      line = rawLine.slice(0, -PROMPT_ENHANCEMENT_MPS_CLI_WHOLE_PROMPT_SUFFIX_V1.length);
    }
    return c && isPromptEnhancementScrollMarkerLineV1(line) ? `    ${c.gray}${line}${c.reset}` : `    ${line}`;
  });
  return { lines, hiddenBelow };
}

/** The body's edit-keys hint, optionally carrying the "whole prompt is included" reassurance. */
function mpsEditKeysHintV1(c: typeof PROMPT_ENHANCEMENT_MPS_CLI_SGR_V1 | null, withWholePrompt: boolean): string {
  const text = PROMPT_ENHANCEMENT_MPS_CLI_EDIT_KEYS_HINT_V1 + (withWholePrompt ? PROMPT_ENHANCEMENT_MPS_CLI_WHOLE_PROMPT_SUFFIX_V1 : '');
  return c ? `      ${c.lightYellow}${text}${c.reset}` : `      ${text}`;
}

/**
 * ANSI tones, matching the PE popup: cyan title + rail, green (focused) / gray (unfocused)
 * radio bullet, bold (focused) / dim (unfocused) row label, dim non-interactive plan.
 * Off (plain text) for tests; colour is not authority.
 */
const PROMPT_ENHANCEMENT_MPS_CLI_SGR_V1 = (() => {
  const e = String.fromCharCode(27);
  return {
    cyan: `${e}[36m`,
    gray: `${e}[90m`,
    green: `${e}[32m`,
    // Normal yellow — provider-failure notice only (caution line in the header).
    yellow: `${e}[33m`,
    // Shortcut/action hints — bright ("light") yellow, distinct + visible on every OS (owner 2026-08-07).
    lightYellow: `${e}[93m`,
    // Cancel row — an EXTRA-light / pale yellow (256-colour), a touch softer than the bright hint
    // yellow (owner request 2026-08-08). 256-colour renders on all modern terminals; a terminal
    // that ignores it simply falls back to the default fg (never broken).
    paleYellow: `${e}[38;5;229m`,
    dim: `${e}[2m`,
    bold: `${e}[1m`,
    reset: `${e}[0m`,
  };
})();

/**
 * Strip ANSI escape sequences + C0 control chars (and DEL, keeping tab/LF/CR)
 * from model-supplied text before rendering (public-safe). Built via RegExp so
 * no raw control bytes live in source; mirrors the PE popup's sanitiser.
 */
function publicText(value: string): string {
  const ansi = new RegExp('\\u001B(?:\\[[0-?]*[ -\\/]*[@-~]|\\][^\\u0007]*(?:\\u0007|\\u001B\\\\))', 'g');
  const control = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');
  return value.replace(ansi, '').replace(control, '');
}

export interface PromptEnhancementMpsFirstPopupFrameStateV1 {
  /** Focused interactive row: 0 = body, 1 = Additional details, 2 = Cancel. Display cue only. */
  focusIndex?: number;
  /** Apply the §3.3 ANSI tones; off (plain text) for tests and oracles. */
  colorize?: boolean;
  /**
   * Caret within the focused editable field (window-relative visual row/column). When supplied
   * with `caretOut`, the renderer records the caret's 1-based SCREEN row/column into `caretOut`
   * at the exact line it builds the field's content — the same contract as the PE popup renderer,
   * so the raw-TTY shell places the hardware cursor without re-deriving the layout.
   */
  caret?: { field: PromptEnhancementEditorFieldV1; visualRow: number; visualColumn: number };
  /** Mutable sink the renderer fills with the caret's 1-based screen position (see `caret`). */
  caretOut?: { row: number; col: number };
}

/**
 * Render the MPS first popup exactly as locked in §3.3 from a validated
 * first-popup model. Pure projection — emits only the enhanced sequence body,
 * Additional details, Cancel, and the dim Sequence plan; never `Use original`,
 * future prompt text, a queue pointer, or an automatic send/advance.
 */
export function renderPromptEnhancementMpsFirstPopupFrameV1(
  model: PromptEnhancementMpsFirstPopupModelV1,
  frameState: PromptEnhancementMpsFirstPopupFrameStateV1 = {},
): string {
  const c = frameState.colorize ? PROMPT_ENHANCEMENT_MPS_CLI_SGR_V1 : null;
  const interactiveRowCount = 3; // body, Additional details, Cancel
  const focusIndex = Math.max(0, Math.min(interactiveRowCount - 1, Math.trunc(frameState.focusIndex ?? 0)));
  // Radio row identical to the PE popup (owner request: MPS mirrors the PE popup): a green ●
  // (focused) / gray ○ (unfocused) bullet and a bold (focused) / dim (unfocused) label. The cyan
  // left rail is applied to EVERY line as one continuous border in the post-pass below (owner
  // request: full-height rail, not per-row segments). Cancel renders EXTRA-light (pale) yellow — the same
  // bright tier as the shortcut hints (owner request 2026-08-07).
  const radioRow = (rowIndex: number, label: string, options: { suffix?: string; tone?: 'default' | 'cancel' } = {}): string => {
    const focused = rowIndex === focusIndex;
    const glyph = focused ? '●' : '○';
    const suffix = options.suffix ?? '';
    if (!c) return `${glyph} ${label}${suffix}`;
    const bullet = focused ? `${c.green}${glyph}${c.reset}` : `${c.gray}${glyph}${c.reset}`;
    const styled = options.tone === 'cancel'
      ? (focused ? `${c.bold}${c.paleYellow}${label}${c.reset}` : `${c.paleYellow}${label}${c.reset}`)
      : (focused ? `${c.bold}${label}${c.reset}` : `${c.dim}${label}${c.reset}`);
    return `${bullet} ${styled}${suffix}`;
  };
  const lines: string[] = [];
  // Record the caret's real screen position as the field content is built (see caretOut) — the
  // same contract as the PE popup renderer. Content is indented 4 spaces; with the 2-char rail
  // added in the post-pass the text lands at screen column 7.
  const recordCaret = (field: PromptEnhancementEditorFieldV1): void => {
    if (frameState.caret?.field === field && frameState.caretOut) {
      frameState.caretOut.row = lines.length + 1 + Math.max(0, frameState.caret.visualRow);
      frameState.caretOut.col = 7 + Math.max(0, frameState.caret.visualColumn);
    }
  };

  // Branded header identical to the PE popup (owner request): "◆ NEXPATH CLI ·
  // <surface>", cyan+bold, then a dim rule the same width and a blank line. Only
  // the surface name changes; model.title stays the identity.
  const surfaceLabel = publicText(model.title).replace(/^Nexpath\s*·\s*/i, '');
  const header = `◆ NEXPATH CLI · ${surfaceLabel}`;
  lines.push(c ? `${c.cyan}${c.bold}${header}${c.reset}` : header);
  lines.push(c ? `${c.dim}${'─'.repeat(header.length)}${c.reset}` : '─'.repeat(header.length));
  lines.push('');

  // Pinch label (bold) + why-help (gray) from the typed uiView — same source and styling as the
  // PE popup; rendered only when supplied (the UI never invents them).
  if (model.pinchLabel) lines.push(c ? `${c.bold}${publicText(model.pinchLabel.text)}${c.reset}` : publicText(model.pinchLabel.text));
  if (model.whyHelp) lines.push(c ? `${c.gray}${publicText(model.whyHelp.text)}${c.reset}` : publicText(model.whyHelp.text));
  // Provider-failure notice (owner ruling 2026-08-07): the same persistent public-safe yellow
  // line the PE popup shows — display only, absent on every non-failure run.
  if (model.providerFailureNotice) {
    lines.push(c ? `${c.yellow}${publicText(model.providerFailureNotice)}${c.reset}` : publicText(model.providerFailureNotice));
  }
  if (model.pinchLabel || model.whyHelp || model.providerFailureNotice) lines.push('');

  const editKeysHint = (): string =>
    c ? `      ${c.lightYellow}${PROMPT_ENHANCEMENT_MPS_CLI_EDIT_KEYS_HINT_V1}${c.reset}` : `      ${PROMPT_ENHANCEMENT_MPS_CLI_EDIT_KEYS_HINT_V1}`;
  // A field content line: real prompt text renders plain; a scroll indicator ("↑/↓ N more lines
  // …") renders DIM like a hint (owner request 2026-08-07), matching the PE popup.
  const contentLine = (line: string): string =>
    c && isPromptEnhancementScrollMarkerLineV1(line) ? `    ${c.gray}${line}${c.reset}` : `    ${line}`;

  // Enhanced sequence body — primary, interactive row 0. The "· the whole prompt is included"
  // reassurance rides on the edit-keys hint (owner request 2026-08-07), not the "↓ N more lines
  // below" marker.
  const heading = publicText(model.heading);
  lines.push(radioRow(0, heading));
  recordCaret('enhanced_body');
  const bodyRender = renderMpsBodyLinesV1(publicText(model.body.text), c);
  for (const bodyLine of bodyRender.lines) lines.push(bodyLine);
  if (focusIndex === 0) lines.push(mpsEditKeysHintV1(c, bodyRender.hiddenBelow));
  lines.push('');

  // Additional details — interactive row 1. The apply hint shows once there is something to
  // apply (issue #160); moving onto the row adds the editing keys as the LAST line. The
  // "Add extra requirement" sub-label was removed (owner request 2026-08-07) so the body can
  // show more lines — PE parity, which is also why this hint's condition matches
  // cli-submit-popup.ts exactly. If one changes, change both.
  const detailsLabel = PROMPT_ENHANCEMENT_MPS_CLI_ADDITIONAL_DETAILS_LABEL_V1;
  lines.push(radioRow(1, detailsLabel));
  recordCaret('additional_details');
  for (const detailLine of publicText(model.additionalDetails.text).split('\n')) lines.push(contentLine(detailLine));
  if (model.additionalDetails.text.trim()) lines.push(c ? `      ${c.lightYellow}${PROMPT_ENHANCEMENT_MPS_CLI_DETAILS_HINT_V1}${c.reset}` : `      ${PROMPT_ENHANCEMENT_MPS_CLI_DETAILS_HINT_V1}`);
  if (focusIndex === 1) lines.push(editKeysHint());
  lines.push('');

  // Cancel — interactive row 2, last interactive action. Light yellow (owner request
  // 2026-08-07): choosing it opens the PEF feedback popup and ends the flow, so it reads as a
  // caution action, in the same bright tier as the shortcut hints.
  const cancelLabel = publicText(model.actions.cancelRemainingSequence.label);
  const cancelUnavailable = model.actions.cancelRemainingSequence.state === 'disabled' ? '  (unavailable)' : '';
  lines.push(radioRow(2, cancelLabel, { suffix: cancelUnavailable, tone: 'cancel' }));
  lines.push('');

  // Sequence plan — dim gray, non-interactive, first popup only.
  const planLabel = PROMPT_ENHANCEMENT_MPS_CLI_SEQUENCE_PLAN_LABEL_V1;
  const total = `Total: ${model.sequencePlan.remainingTaskCount}`;
  const types = `Types: ${model.sequencePlan.taskRoleLabels.map((label) => publicText(label)).join(', ')}`;
  lines.push(c ? `  ${c.dim}${planLabel}${c.reset}` : `  ${planLabel}`);
  lines.push(c ? `  ${c.dim}${total}${c.reset}` : `  ${total}`);
  lines.push(c ? `  ${c.dim}${types}${c.reset}` : `  ${types}`);
  // Per-follow-up-task summary lines (Phase 3b) — the user's own redacted slices, numbered. Empty on
  // the describe fallback, so nothing extra renders there.
  model.sequencePlan.taskSummaryLines.forEach((line, index) => {
    const numbered = `${index + 1}. ${publicText(line)}`;
    lines.push(c ? `  ${c.dim}${numbered}${c.reset}` : `  ${numbered}`);
  });
  lines.push('');

  lines.push(c ? `${c.dim}${PROMPT_ENHANCEMENT_MPS_CLI_FOOTER_V1}${c.reset}` : PROMPT_ENHANCEMENT_MPS_CLI_FOOTER_V1);

  return applyContinuousRail(lines, c);
}

/**
 * Continuous cyan left rail (owner request, matching the PE popup): draw the rail on EVERY line so
 * the left edge is one unbroken vertical border, not per-row segments. A blank line becomes the
 * rail alone; every other line gets "│ " + its content (rail 2 chars keeps content at column 7).
 */
function applyContinuousRail(lines: readonly string[], c: typeof PROMPT_ENHANCEMENT_MPS_CLI_SGR_V1 | null): string {
  const rail = c ? `${c.cyan}│${c.reset}` : '│';
  return lines.map((line) => (line.length === 0 ? rail : `${rail} ${line}`)).join('\n');
}

// ---------------------------------------------------------------------------
// UI-7 — MPS continuation host rendering (alignment plan §3.4).
//
// Same pure-projection contract as the first popup, for the later continuation
// surface. It renders body → Additional details → the custom-interruption row
// (label + helper) → Cancel, and — unlike the first popup — NEVER repeats the
// Sequence plan, remaining count, or future-item details. The custom
// interruption is neither cancel nor completion; the same pending item may
// return only after the typed host/runtime correlation allows it (gated). No
// runtime, pointer, Stop-completion, terminality, delivery, or transport.
// ---------------------------------------------------------------------------

export interface PromptEnhancementMpsContinuationFrameStateV1 {
  /** Focused interactive row: 0 = body, 1 = Additional details, 2 = custom interruption, 3 = Cancel. Display cue only. */
  focusIndex?: number;
  /** Apply the §3.4 ANSI tones; off (plain text) for tests and oracles. */
  colorize?: boolean;
  /**
   * Caret within the focused editable field (window-relative visual row/column). Same optional
   * contract as the first-popup renderer — when supplied with `caretOut`, the renderer records the
   * caret's 1-based SCREEN row/column so the raw-TTY shell can place the hardware cursor without
   * re-deriving the layout. Absent by default, so every existing (non-interactive) caller is
   * unaffected.
   */
  caret?: { field: PromptEnhancementEditorFieldV1; visualRow: number; visualColumn: number };
  /** Mutable sink the renderer fills with the caret's 1-based screen position (see `caret`). */
  caretOut?: { row: number; col: number };
  /**
   * MPS-1 (loading wheel): a spinner glyph shown IN the body while the next item's wording is not yet
   * ready — the body renders "<glyph> preparing…" and the edit hint is hidden; the other rows stay put
   * (skeleton). The shell cycles the glyph and drops it once wording lands. Absent = normal render.
   * (The wait itself is P5; MPS-5 8.3 found it unreachable today, so this is a defensive presentation.)
   */
  loadingSpinnerGlyph?: string;
}

/**
 * Render the MPS continuation popup exactly as locked in §3.4 from a validated
 * continuation model. Pure projection — emits the enhanced next body, Additional
 * details, the "I need to do something else first" interruption (label + helper),
 * and Cancel; it never repeats the Sequence plan and never renders `Use original`,
 * future prompt text, a queue pointer, or an automatic send/advance.
 */
export function renderPromptEnhancementMpsContinuationFrameV1(
  model: PromptEnhancementMpsContinuationPopupModelV1,
  frameState: PromptEnhancementMpsContinuationFrameStateV1 = {},
): string {
  const c = frameState.colorize ? PROMPT_ENHANCEMENT_MPS_CLI_SGR_V1 : null;
  const interactiveRowCount = 4; // body, Additional details, custom interruption, Cancel
  const focusIndex = Math.max(0, Math.min(interactiveRowCount - 1, Math.trunc(frameState.focusIndex ?? 0)));
  // Radio row identical to the PE popup (owner request: MPS mirrors the PE popup): a green ●
  // (focused) / gray ○ (unfocused) bullet and a bold (focused) / dim (unfocused) label. The cyan
  // left rail is applied to EVERY line as one continuous border in the post-pass (owner request:
  // full-height rail). Cancel renders EXTRA-light (pale) yellow (owner request 2026-08-08) — same tones as
  // the first popup.
  const radioRow = (rowIndex: number, label: string, options: { suffix?: string; tone?: 'default' | 'cancel' } = {}): string => {
    const focused = rowIndex === focusIndex;
    const glyph = focused ? '●' : '○';
    const suffix = options.suffix ?? '';
    if (!c) return `${glyph} ${label}${suffix}`;
    const bullet = focused ? `${c.green}${glyph}${c.reset}` : `${c.gray}${glyph}${c.reset}`;
    const styled = options.tone === 'cancel'
      ? (focused ? `${c.bold}${c.paleYellow}${label}${c.reset}` : `${c.paleYellow}${label}${c.reset}`)
      : (focused ? `${c.bold}${label}${c.reset}` : `${c.dim}${label}${c.reset}`);
    return `${bullet} ${styled}${suffix}`;
  };
  const lines: string[] = [];
  // Record the caret's real screen position as the field content is built (see caretOut) — the
  // same contract as the first-popup renderer. Content is indented 4 spaces; with the 2-char rail
  // added in the post-pass the text lands at screen column 7.
  const recordCaret = (field: PromptEnhancementEditorFieldV1): void => {
    if (frameState.caret?.field === field && frameState.caretOut) {
      frameState.caretOut.row = lines.length + 1 + Math.max(0, frameState.caret.visualRow);
      frameState.caretOut.col = 7 + Math.max(0, frameState.caret.visualColumn);
    }
  };

  // Branded header identical to the PE popup (owner request): "◆ NEXPATH CLI ·
  // <surface>", cyan+bold, then a dim rule the same width and a blank line. Only
  // the surface name changes; model.title stays the identity.
  const surfaceLabel = publicText(model.title).replace(/^Nexpath\s*·\s*/i, '');
  const header = `◆ NEXPATH CLI · ${surfaceLabel}`;
  lines.push(c ? `${c.cyan}${c.bold}${header}${c.reset}` : header);
  lines.push(c ? `${c.dim}${'─'.repeat(header.length)}${c.reset}` : '─'.repeat(header.length));
  lines.push('');

  // Pinch label (bold) + why-help (gray) from the typed uiView — same source and styling as the
  // PE popup; rendered only when supplied (the UI never invents them).
  if (model.pinchLabel) lines.push(c ? `${c.bold}${publicText(model.pinchLabel.text)}${c.reset}` : publicText(model.pinchLabel.text));
  if (model.whyHelp) lines.push(c ? `${c.gray}${publicText(model.whyHelp.text)}${c.reset}` : publicText(model.whyHelp.text));
  if (model.pinchLabel || model.whyHelp) lines.push('');

  const editKeysHint = (): string =>
    c ? `      ${c.lightYellow}${PROMPT_ENHANCEMENT_MPS_CLI_EDIT_KEYS_HINT_V1}${c.reset}` : `      ${PROMPT_ENHANCEMENT_MPS_CLI_EDIT_KEYS_HINT_V1}`;
  const contentLine = (line: string): string =>
    c && isPromptEnhancementScrollMarkerLineV1(line) ? `    ${c.gray}${line}${c.reset}` : `    ${line}`;

  // MPS-3 (Part B): sequence progress line near the top (owner decision: top placement). `done`/`total`
  // come off the packaged continuation (done = currentItemIndex, total = itemCount - 1 deliverable items —
  // item 0 was sent at intake); the copy is formatted
  // here, never carried on the model. CONTINUATION-only surface (the first popup shows the sequence plan).
  const progressLine = `Sequence ${model.progress.done} of ${model.progress.total}`;
  lines.push(c ? `${c.dim}${progressLine}${c.reset}` : progressLine);
  lines.push('');

  // Enhanced next sequence body — primary, interactive row 0. Same "whole prompt is included" on
  // the edit-keys hint as the first popup (owner request 2026-08-07).
  const heading = publicText(model.heading);
  lines.push(radioRow(0, heading));
  recordCaret('enhanced_body');
  // MPS-1 (loading wheel): while wording is not ready, the body is a spinner skeleton ("<glyph> preparing…")
  // and the edit-keys hint is hidden; everything else renders as normal (owner: skeleton + spinner in body).
  const bodyText = frameState.loadingSpinnerGlyph
    ? `${frameState.loadingSpinnerGlyph} preparing…`
    : publicText(model.body.text);
  const bodyRender = renderMpsBodyLinesV1(bodyText, c);
  for (const bodyLine of bodyRender.lines) lines.push(bodyLine);
  if (focusIndex === 0 && !frameState.loadingSpinnerGlyph) lines.push(mpsEditKeysHintV1(c, bodyRender.hiddenBelow));
  lines.push('');

  // MPS-12 (Ruling C §22.2): a TASK item (`first_task`/`task`) shows the user's original slice verbatim;
  // a CONFIRMATION item shows NO original region — no label, box, or placeholder. Driven by the item KIND
  // (never inferred from empty text). Plain dim presentation, reused as-is (owner: no restyle). Skipped
  // while the loading skeleton is up.
  if (!frameState.loadingSpinnerGlyph
    && (PROMPT_ENHANCEMENT_SEQUENCE_TASK_KINDS_V1 as readonly string[]).includes(model.itemKind)) {
    // Label on its own line, then the original's windowed content indented and pushed PER LINE — the
    // runner wraps it to the field width and caps its height. Pushing each line separately guarantees
    // the continuous left rail reaches every line: a long original previously went in as ONE multi-line
    // string, so only its first line got the rail and the frame overflowed the terminal. Scroll markers
    // dim like the body; other lines stay dim (read-only cue).
    lines.push(c ? `  ${c.dim}Your original:${c.reset}` : '  Your original:');
    for (const originalLine of publicText(model.body.originalPromptText).split('\n')) {
      if (!c) { lines.push(`    ${originalLine}`); continue; }
      lines.push(isPromptEnhancementScrollMarkerLineV1(originalLine)
        ? `    ${c.gray}${originalLine}${c.reset}`
        : `    ${c.dim}${originalLine}${c.reset}`);
    }
    lines.push('');
  }

  // Additional details — interactive row 1. Same PE-parity helpers as the first popup: apply hint
  // once there is something to apply (issue #160), editing keys as the LAST line when focused;
  // no "Add extra requirement" label.
  const detailsLabel = PROMPT_ENHANCEMENT_MPS_CLI_ADDITIONAL_DETAILS_LABEL_V1;
  lines.push(radioRow(1, detailsLabel));
  recordCaret('additional_details');
  for (const detailLine of publicText(model.additionalDetails.text).split('\n')) lines.push(contentLine(detailLine));
  if (model.additionalDetails.text.trim()) lines.push(c ? `      ${c.lightYellow}${PROMPT_ENHANCEMENT_MPS_CLI_DETAILS_HINT_V1}${c.reset}` : `      ${PROMPT_ENHANCEMENT_MPS_CLI_DETAILS_HINT_V1}`);
  if (focusIndex === 1) lines.push(editKeysHint());
  lines.push('');

  // Custom interruption — interactive row 2: label, then dim helper. Neither cancel nor completion.
  const interruptionLabel = publicText(model.actions.customInterruption.label);
  lines.push(radioRow(2, interruptionLabel));
  for (const helperLine of publicText(model.actions.customInterruption.helper).split('\n')) {
    lines.push(c ? `    ${c.dim}${helperLine}${c.reset}` : `    ${helperLine}`);
  }
  lines.push('');

  // Cancel — interactive row 3. Light yellow (owner request 2026-08-07) — same caution tone as
  // the first popup.
  const cancelLabel = publicText(model.actions.cancelRemainingSequence.label);
  const cancelUnavailable = model.actions.cancelRemainingSequence.state === 'disabled' ? '  (unavailable)' : '';
  lines.push(radioRow(3, cancelLabel, { suffix: cancelUnavailable, tone: 'cancel' }));
  lines.push('');

  // No Sequence plan / Total / Types on the continuation surface (§3.4).
  lines.push(c ? `${c.dim}${PROMPT_ENHANCEMENT_MPS_CLI_CONTINUATION_FOOTER_V1}${c.reset}` : PROMPT_ENHANCEMENT_MPS_CLI_CONTINUATION_FOOTER_V1);

  return applyContinuousRail(lines, c);
}
