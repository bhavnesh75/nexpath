/**
 * The shortcut line under the enhanced body.
 *
 * The removal shortcut joins the line the editing keys and the send hint already share, and while
 * the chord is armed that whole line becomes the question the digit answers. Both matter beyond
 * their wording: the line is drawn only on the focused body row, it stays ONE line either way — so
 * the caret's row and the body's height never move — and it has to fit the narrowest window the
 * popup is ever given.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  buildPromptEnhancementCliActionRowsV1,
  buildPromptEnhancementCliFeedbackStateV1,
  renderPromptEnhancementCliFeedbackFrameV1,
  renderPromptEnhancementPopupFrameV1,
  type PromptEnhancementCliPopupViewV1,
} from './cli-submit-popup.js';
import type { PromptEnhancementPopupRenderModelV1 } from './popup-render-model.js';

const EDIT_KEYS = 'Ctrl+J new line · Ctrl+↑/↓ move line';
const REMOVE = 'Ctrl+X #N';
const SEND = 'Enter sends this prompt';
const ARMED = 'Remove which section? 1–9';

/** A minimal typed model, deliberately without directionals so the row list stays short. */
function model(editable = true): PromptEnhancementPopupRenderModelV1 {
  return {
    title: 'Nexpath · Prompt enhancement',
    editorHeading: 'Use enhanced prompt',
    identity: { enhancementId: 'e1', currentBodyId: 'b1', bodyRevision: 1, validationDecisionId: 'v1' },
    body: { editable },
    publicCopy: { trustCues: [] },
    controls: {
      additionalDetails: { availability: 'available' },
      directional: [],
      feedback: { availability: 'available', label: 'Feedback' },
      original: { availability: 'available' },
    },
  } as unknown as PromptEnhancementPopupRenderModelV1;
}

function view(m: PromptEnhancementPopupRenderModelV1, details = ''): PromptEnhancementCliPopupViewV1 {
  return { model: m, editedBodyText: 'Goal:\n  the body', additionalDetailsText: details };
}

/** The index of the row of a given kind, so a focus index is never guessed. */
function rowIndex(m: PromptEnhancementPopupRenderModelV1, kind: string): number {
  const index = buildPromptEnhancementCliActionRowsV1(m, {}).findIndex((row) => row.kind === kind);
  if (index < 0) throw new Error(`no row of kind ${kind}`);
  return index;
}

const lines = (frame: string): string[] => frame.split('\n');
const hintLine = (frame: string): string | undefined =>
  lines(frame).find((line) => line.includes(EDIT_KEYS) || line.includes(ARMED));

describe('the shortcut line', () => {
  const m = model();
  const body = rowIndex(m, 'editor_heading');
  const details = rowIndex(m, 'additional_details');

  it('carries the removal shortcut, between the editing keys and the send hint', () => {
    const frame = renderPromptEnhancementPopupFrameV1(view(m), { focusIndex: body, helpExpanded: false });
    expect(frame).toContain(`${EDIT_KEYS} · ${REMOVE} · ${SEND}`);
    // Grouped with the editing keys, not after the terminal action.
    expect(frame.indexOf(REMOVE)).toBeLessThan(frame.indexOf(SEND));
  });

  it('draws that line once, and only on the focused body row', () => {
    const focused = renderPromptEnhancementPopupFrameV1(view(m), { focusIndex: body, helpExpanded: false });
    expect(lines(focused).filter((l) => l.includes(REMOVE))).toHaveLength(1);

    const elsewhere = renderPromptEnhancementPopupFrameV1(view(m), { focusIndex: details, helpExpanded: false });
    expect(elsewhere).not.toContain(REMOVE);
    expect(elsewhere).not.toContain(ARMED);
  });

  it('leaves the details row and the feedback Other row exactly as they were', () => {
    // The details row draws the editing keys on their own when focused — no shortcut there.
    const frame = renderPromptEnhancementPopupFrameV1(view(m, 'some detail'), { focusIndex: details, helpExpanded: false });
    const detailsHint = lines(frame).find((l) => l.includes(EDIT_KEYS));
    expect(detailsHint).toBeDefined();
    expect(detailsHint).not.toContain(REMOVE);

    // The feedback popup draws the same editing keys under its own typed row — focused, which is
    // the only time it shows them — and must not gain the shortcut either.
    const other = buildPromptEnhancementCliFeedbackStateV1({ fieldWidth: 60, viewportRows: 6 });
    const feedback = renderPromptEnhancementCliFeedbackFrameV1({ ...other, focusIndex: 2 }, { colorize: false });
    expect(feedback).toContain(EDIT_KEYS);
    expect(feedback).not.toContain(REMOVE);
  });

  it('becomes the question while the chord is armed, and keeps the frame the same height', () => {
    const plain = renderPromptEnhancementPopupFrameV1(view(m), { focusIndex: body, helpExpanded: false });
    const armed = renderPromptEnhancementPopupFrameV1(view(m), { focusIndex: body, helpExpanded: false, sectionRemovalArmed: true });

    expect(armed).toContain(ARMED);
    expect(armed).not.toContain(REMOVE);
    expect(armed).not.toContain(SEND);
    // One line either way — the caret's row and the body's height do not move.
    expect(lines(armed)).toHaveLength(lines(plain).length);
    expect(lines(armed).filter((l) => l.includes(ARMED))).toHaveLength(1);
  });

  it('shows nothing extra when the chord is armed from another row', () => {
    const frame = renderPromptEnhancementPopupFrameV1(view(m), { focusIndex: details, helpExpanded: false, sectionRemovalArmed: true });
    expect(frame).not.toContain(ARMED);
    expect(frame).not.toContain(REMOVE);
  });

  it('draws the same line on a body that cannot be edited, armed and unarmed', () => {
    const locked = model(false);
    const lockedBody = rowIndex(locked, 'editor_heading');
    const plain = renderPromptEnhancementPopupFrameV1(view(locked), { focusIndex: lockedBody, helpExpanded: false });
    const armed = renderPromptEnhancementPopupFrameV1(view(locked), { focusIndex: lockedBody, helpExpanded: false, sectionRemovalArmed: true });

    // The lock changes the row's label, not its shortcut line — the editing keys already advertise
    // keys the lock refuses, and the digit is refused with the notice instead.
    expect(plain).toContain('(unavailable)');
    expect(plain).toContain(`${EDIT_KEYS} · ${REMOVE} · ${SEND}`);
    expect(armed).toContain('(unavailable)');
    expect(armed).toContain(ARMED);
  });

  it('still fits the narrowest window the popup is ever given', () => {
    const frame = renderPromptEnhancementPopupFrameV1(view(m), { focusIndex: body, helpExpanded: false });
    const line = hintLine(frame);
    expect(line).toBeDefined();
    // The docked popup window never narrows below 80 columns, and the chrome probe counts logical
    // lines — so a line wider than that takes a row the frame was not measured for. Nine characters
    // of shortcut is what fits; this fails if the wording grows.
    expect(line!.length).toBeLessThanOrEqual(80);
    expect(REMOVE).toHaveLength(9);
  });

  it('keeps the removal key as Ctrl+X on macOS, where the editing keys become Cmd', async () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });
    vi.resetModules();
    try {
      const popup = await import('./cli-submit-popup.js');
      const m2 = model();
      const index = popup.buildPromptEnhancementCliActionRowsV1(m2, {}).findIndex((row) => row.kind === 'editor_heading');
      const frame = popup.renderPromptEnhancementPopupFrameV1(view(m2), { focusIndex: index, helpExpanded: false });
      // The prefix is a control byte, not a Cmd chord, so it does not follow the editing keys.
      expect(frame).toContain(`Cmd+J new line · Cmd+↑/↓ move line · ${REMOVE} · ${SEND}`);
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
      vi.resetModules();
    }
  });
});
