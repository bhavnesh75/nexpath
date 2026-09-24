/**
 * Prompt Enhancement HTML template (P5, PEH-2).
 *
 * Pure function — given a {@link PromptEnhancementExtensionPayloadV1} (or
 * `null` for no pending PE), returns a fully self-contained HTML string
 * suitable for `webviewView.webview.html = …`. No side effects, no filesystem
 * reads. A **new sibling module** to `html.ts` — `html.ts` itself is untouched
 * (`html.test.ts` locks its literal source text; the Decision Session and PE
 * surfaces are rendered by separate modules).
 *
 * Required behaviour (PEH-2), all satisfied here:
 *   - Exactly ONE editable current-body field — a `<textarea>`, not a
 *     read-only display, and never a 3-4 option button list.
 *   - No "Show simpler options" control anywhere.
 *   - `Shorter` / `More thorough` / `More project-grounded` render as
 *     CURRENT-BODY ACTIONS (they act on the one visible body), never as
 *     alternate prompt choices to pick between.
 *   - A lightweight additional-details field, shown only when the payload
 *     marks it available.
 *   - Fallback / no-popup / blocked / loading states are rendered purely from
 *     `payload.renderState` (typed, computed in `pe-payload.ts`) — never by
 *     matching body text.
 *
 * Security/theming: identical posture to `html.ts` — CSP with nonce-scoped
 * scripts, `--vscode-*` CSS variables, and `escapeHtml` (imported from
 * `html.ts`, not reimplemented) on every user/generated string.
 */

import { escapeHtml } from './html.js';
import {
  NEVER_MARKED_SECTION_KINDS,
  type PeBodySection,
  type PromptEnhancementExtensionPayloadV1,
} from '../pe-payload.js';

export interface PeRenderOptions {
  /** Pass `webview.cspSource` so the CSP allows the webview's local resources. */
  cspSource: string;
  /** Nonce for the inline `<script>` block. Tests pass a fixed value. */
  nonce?: string;
}

const NONCE_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function generateNonce(): string {
  let n = '';
  for (let i = 0; i < 32; i++) {
    n += NONCE_CHARS[Math.floor(Math.random() * NONCE_CHARS.length)];
  }
  return n;
}

const BASE_STYLE = `
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0.9em; margin: 0; line-height: 1.4; }
  .pe-status { color: var(--vscode-descriptionForeground); font-size: 0.9em; line-height: 1.5; }
`;

function shell(cspSource: string, scriptCsp: string, title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} data:;${scriptCsp}">
<title>${title}</title>
<style>${BASE_STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function renderNoPopupState(cspSource: string): string {
  return shell(
    cspSource,
    '',
    'Nexpath',
    '<p class="pe-status">No prompt enhancement is pending.</p>',
  );
}

function renderLoadingState(cspSource: string): string {
  return shell(
    cspSource,
    '',
    'Nexpath · Prompt enhancement',
    '<p class="pe-status">Working on your prompt…</p>',
  );
}

function renderBlockedState(cspSource: string): string {
  return shell(
    cspSource,
    '',
    'Nexpath · Prompt enhancement',
    '<p class="pe-status">This prompt can\'t be sent as enhanced right now.</p>',
  );
}

function renderFallbackState(cspSource: string): string {
  return shell(
    cspSource,
    '',
    'Nexpath · Prompt enhancement',
    '<p class="pe-status">Showing a fallback version of this prompt.</p>',
  );
}

/**
 * The body's section index — each title with the number the CLI draws beside it.
 *
 * WHY AN INDEX AND NOT A NUMBER ON THE LINE ITSELF. The body is ONE `<textarea>`
 * (PEH-2 requires exactly that, and the delivered text is its `value`), so there
 * is nowhere on a title line to put a number that is not also IN the text — and
 * text is what gets sent. The CLI can draw beside its lines because it paints
 * every row itself; here the control paints its own content.
 *
 * An overlay was the other candidate and is rejected on this surface: the body
 * inherits `--vscode-font-family`, which is PROPORTIONAL, so a mirrored layer
 * cannot be aligned to it by measurement the way a monospace one can.
 *
 * So the numbers are rendered as a short read-only index above the body. It says
 * the same thing — which sections there are, and what number each one has —
 * without a character of it being sendable.
 *
 * Returns '' when there is nothing to draw, and the caller then emits nothing at
 * all: with no sections the frame is byte-identical to the one drawn before this
 * existed, its style block included.
 */
function renderSectionIndex(sections: readonly PeBodySection[] | undefined): string {
  if (!sections || sections.length === 0) return '';
  const rows = sections
    .map((section) => `  <li class="pe-section"><span class="pe-section-title">${escapeHtml(section.title)}</span>`
      + `<span class="pe-section-number">#${String(section.number)}</span></li>`)
    .join('\n');
  // Not `aria-hidden`: unlike a decorative overlay this is the ONLY place the
  // numbers exist, so a reader who cannot see the styling still needs them.
  return `<style>
  .pe-sections { list-style: none; margin: 0 0 0.6em 0; padding: 0; font-size: 0.86em; }
  .pe-section { display: flex; justify-content: space-between; gap: 1em; padding: 0.15em 0; color: var(--vscode-descriptionForeground); }
  .pe-section-number { flex: 0 0 auto; opacity: 0.8; }
</style>
<ol class="pe-sections" aria-label="Sections of this prompt, in order">
${rows}
</ol>
`;
}

/**
 * The bold preview — the body again, read-only, with the emphasised phrases in
 * bold.
 *
 * WHY A PREVIEW AND NOT BOLD IN THE FIELD. The body is a `<textarea>`, which
 * cannot carry markup at all, and the surface requires it to stay exactly one
 * editable field. The browser panel draws its bold through a mirrored overlay,
 * and that technique is rejected here rather than merely unbuilt: the body
 * inherits the editor's UI font, which is PROPORTIONAL, so bold glyphs are wider
 * and the overlay's wrapping drifts from the textarea's — the failure the
 * browser has to spike for is a certainty here. The field is user-resizable too,
 * a second axis an overlay would have to chase.
 *
 * So the preview is an additional read-only block. The textarea remains the one
 * editable field and the one thing that is sent.
 *
 * ⛔ SAFETY — the order is the whole of it. The body is escaped FIRST, and the
 * phrases are escaped too and then matched inside the escaped text. Nothing
 * taken from a body is ever emitted as markup, so a phrase containing `<b>`
 * finds nothing and a body containing it stays inert.
 */
function renderBoldPreview(payload: PromptEnhancementExtensionPayloadV1): string {
  const phrases = payload.emphasisPhrases ?? [];
  if (phrases.length === 0 || payload.currentBodyText.length === 0) return '';

  const marks = locateEmphasisMarks(payload);
  if (marks.length === 0) return '';

  // Escape once, then slice the ESCAPED text at offsets computed on the escaped
  // text — never map a raw offset onto escaped output, which is where this kind
  // of code usually goes wrong.
  const escapedBody = escapeHtml(payload.currentBodyText);
  const escapedMarks = marks
    .map((m) => ({ start: escapeHtml(payload.currentBodyText.slice(0, m.start)).length, text: escapeHtml(m.text) }))
    .map((m) => ({ start: m.start, end: m.start + m.text.length }))
    .sort((a, b) => a.start - b.start);

  let out = '';
  let cursor = 0;
  for (const mark of escapedMarks) {
    if (mark.start < cursor) continue;            // overlapping runs draw once
    out += escapedBody.slice(cursor, mark.start);
    out += `<strong>${escapedBody.slice(mark.start, mark.end)}</strong>`;
    cursor = mark.end;
  }
  out += escapedBody.slice(cursor);

  // ⚠️ The leading newline belongs to the BLOCK, not to the template. Written the
  // other way round, an absent preview still left a blank line behind, and every
  // recorded frame shifted by one — 174 lines reported as moved for a feature
  // that had drawn nothing. Absent must mean absent, to the byte.
  return `
<style>
  .pe-preview-label { margin: 0.9em 0 0.3em 0; font-size: 0.83em; color: var(--vscode-descriptionForeground); }
  .pe-preview { white-space: pre-wrap; overflow-wrap: anywhere; padding: 0.7em; border-radius: 4px; border: 1px solid var(--vscode-input-border, var(--vscode-editorWidget-border)); background: var(--vscode-editor-background); color: var(--vscode-descriptionForeground); font-size: 0.9em; }
  .pe-preview strong { color: var(--vscode-foreground); font-weight: 600; }
</style>
<p class="pe-preview-label">What this prompt emphasises</p>
<div class="pe-preview">${out}</div>
`;
}

/**
 * Where each phrase may be drawn — the FIRST occurrence that is allowed to carry
 * a mark, and nothing if there is none.
 *
 * Two stretches are never marked, and both are the standard's own rule rather
 * than a preference here: a section's title line, and any section whose kind is
 * one the standard excludes. A phrase that appears only inside those is drawn
 * nowhere, which is what the popup itself does.
 */
function locateEmphasisMarks(
  payload: PromptEnhancementExtensionPayloadV1,
): { start: number; text: string }[] {
  const text = payload.currentBodyText;
  const lines = text.split('\n');
  const lineStart: number[] = [];
  let offset = 0;
  for (const line of lines) { lineStart.push(offset); offset += line.length + 1; }

  /** Half-open [start, end) offsets a mark may not begin inside. */
  const barred: { start: number; end: number }[] = [];
  for (const section of payload.sections ?? []) {
    const titleFrom = lineStart[section.titleLine];
    if (titleFrom !== undefined) {
      barred.push({ start: titleFrom, end: titleFrom + (lines[section.titleLine]?.length ?? 0) });
    }
    if (!NEVER_MARKED_SECTION_KINDS.has(section.sectionKind)) continue;
    const from = lineStart[section.titleLine];
    const to = section.endLine < lineStart.length ? lineStart[section.endLine] : text.length;
    if (from !== undefined && to !== undefined) barred.push({ start: from, end: to });
  }

  const out: { start: number; text: string }[] = [];
  for (const phrase of payload.emphasisPhrases ?? []) {
    if (phrase.length === 0) continue;
    for (let at = text.indexOf(phrase); at >= 0; at = text.indexOf(phrase, at + 1)) {
      if (barred.some((range) => at >= range.start && at < range.end)) continue;
      out.push({ start: at, text: phrase });
      break;
    }
  }
  return out;
}

function renderReadyState(
  payload: PromptEnhancementExtensionPayloadV1,
  nonce: string,
  cspSource: string,
): string {
  const bodyEsc = escapeHtml(payload.currentBodyText);
  const directionalHtml = payload.directionalActions
    .map((action) => {
      const labelEsc = escapeHtml(action.label);
      const idEsc = escapeHtml(action.actionId);
      return `<button class="pe-action" data-action-id="${idEsc}" data-action-type="${action.actionType}" ${action.available ? '' : 'disabled'}>${labelEsc}</button>`;
    })
    .join('\n');
  const detailsHtml = payload.additionalDetailsAvailable
    ? '<textarea id="pe-details" class="pe-details" placeholder="Add details (optional)" rows="2"></textarea>'
    : '';
  const closeIdEsc = payload.closeActionId ? escapeHtml(payload.closeActionId) : '';

  const style = `
  .pe-body { width: 100%; box-sizing: border-box; min-height: 6em; padding: 0.7em; border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-editorWidget-border)); font-family: inherit; font-size: 0.93em; resize: vertical; }
  .pe-actions { display: flex; gap: 0.5em; flex-wrap: wrap; margin-top: 0.7em; }
  button.pe-action { padding: 0.5em 0.8em; border-radius: 4px; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: 1px solid var(--vscode-button-border, transparent); cursor: pointer; font-family: inherit; font-size: 0.9em; }
  button.pe-action:disabled { opacity: 0.5; cursor: default; }
  button.pe-action:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
  .pe-details { width: 100%; box-sizing: border-box; margin-top: 0.7em; padding: 0.5em; border-radius: 4px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border, var(--vscode-editorWidget-border)); font-family: inherit; font-size: 0.88em; }
  .pe-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 0.9em; }
  button.pe-deliver { padding: 0.55em 1em; border-radius: 4px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; font-family: inherit; font-size: 0.93em; }
  button.pe-deliver:hover { background: var(--vscode-button-hoverBackground); }
  button.pe-close { font-size: 0.83em; color: var(--vscode-descriptionForeground); cursor: pointer; background: none; border: none; padding: 0.3em 0; font-family: inherit; }
  button.pe-close:hover { color: var(--vscode-foreground); text-decoration: underline; }
`;

  const body = `<style>${style}</style>
${renderSectionIndex(payload.sections)}<textarea id="pe-body" class="pe-body" data-body-id="${escapeHtml(payload.currentBodyId)}" data-body-revision="${payload.bodyRevision}">${bodyEsc}</textarea>
<div class="pe-actions">
${directionalHtml}
</div>
${detailsHtml}
<div class="pe-footer">
  <button class="pe-deliver" id="pe-deliver">Use this prompt</button>
  <button class="pe-close" id="pe-close" data-action-id="${closeIdEsc}">Close</button>
</div>${renderBoldPreview(payload)}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const bodyEl = document.getElementById('pe-body');
  const detailsEl = document.getElementById('pe-details');

  document.getElementById('pe-deliver').addEventListener('click', () => {
    vscode.postMessage({
      type: 'pe_deliver_current_body',
      bodyId: bodyEl.dataset.bodyId,
      bodyRevision: Number(bodyEl.dataset.bodyRevision),
      bodyText: bodyEl.value,
      // P7 (PEH-7): unsubmitted text in the details field must block
      // delivery (dirty_additional_details_requires_apply_or_clear) until
      // the user presses Enter there (submits) or clears it — this is the
      // only signal proving that, computed live at click time since the
      // extension has no other way to know the field's current dirtiness.
      hasDirtyAdditionalDetails: !!(detailsEl && detailsEl.value.trim().length > 0),
    });
  });
  document.getElementById('pe-close').addEventListener('click', (ev) => {
    vscode.postMessage({ type: 'pe_close', actionId: ev.currentTarget.dataset.actionId });
  });
  document.querySelectorAll('button.pe-action').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      vscode.postMessage({
        type: 'pe_directional_action',
        actionId: btn.dataset.actionId,
        actionType: btn.dataset.actionType,
        bodyId: bodyEl.dataset.bodyId,
        bodyRevision: Number(bodyEl.dataset.bodyRevision),
        // P9 (PEH-6): unsaved manual edits must be discarded, not silently sent
        // as if canonical, when a directional action fires — this is the only
        // signal proving the textarea diverged from its last-rendered canonical
        // text, computed live at click time (defaultValue reflects the
        // server-rendered initial body; value is whatever the user has typed).
        hasDirtyBodyEdit: bodyEl.value !== bodyEl.defaultValue,
      });
    });
  });
  if (detailsEl) {
    detailsEl.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        vscode.postMessage({
          type: 'pe_submit_additional_details',
          bodyId: bodyEl.dataset.bodyId,
          bodyRevision: Number(bodyEl.dataset.bodyRevision),
          additionalDetailsText: detailsEl.value,
          // P9 (PEH-6): Apply is the only path sending the current VISIBLE
          // edited body alongside the details — the user may have edited the
          // body before applying details, and that edit must not be lost.
          bodyText: bodyEl.value,
        });
      }
    });
  }
</script>`;

  return shell(cspSource, ` script-src 'nonce-${nonce}';`, 'Nexpath · Prompt enhancement', body);
}

/**
 * Render the Prompt Enhancement HTML.
 *   - `payload === null` → no-popup state.
 *   - `payload.renderState` selects loading / blocked / fallback / no_popup /
 *     ready — always from typed state, never from inspecting body text.
 */
export function renderPromptEnhancementHtml(
  payload: PromptEnhancementExtensionPayloadV1 | null,
  opts: PeRenderOptions,
): string {
  const nonce = opts.nonce ?? generateNonce();
  if (payload === null) return renderNoPopupState(opts.cspSource);
  switch (payload.renderState) {
    case 'no_popup': return renderNoPopupState(opts.cspSource);
    case 'loading':  return renderLoadingState(opts.cspSource);
    case 'blocked':  return renderBlockedState(opts.cspSource);
    case 'fallback': return renderFallbackState(opts.cspSource);
    case 'ready':    return renderReadyState(payload, nonce, opts.cspSource);
  }
}
