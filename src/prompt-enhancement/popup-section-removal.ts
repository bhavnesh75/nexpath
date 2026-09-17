/**
 * Removing one section of the submit popup's body with a two-key chord.
 *
 * The prefix key arms; the next key decides. A digit 1–9 that names a section removes
 * it at once — no confirmation, no undo. Every other key disarms and goes on to mean
 * exactly what it means today, so nothing the popup already does is taken away: the
 * only key ever swallowed is a digit that followed the prefix.
 *
 * Pure: the guard and the cut both take what they need and return what changed. The
 * removal replaces only the body buffer, so a detail being typed, the focused row and
 * the viewport all survive it.
 */
import {
  promptEnhancementCursorVisualPositionV1,
  promptEnhancementKeepFieldCursorVisibleV1,
  type PromptEnhancementMultilineEditorStateV1,
} from './multiline-editor.js';
import {
  buildPromptEnhancementSectionMapV1,
  type PromptEnhancementSectionMapInputV1,
} from './popup-section-map.js';

/**
 * The key that arms the chord: byte 0x18, which the CLI delivers as an editor key and
 * the editor itself refuses, so arming on it takes nothing away. One constant, because
 * the key may be renamed later and this is the only place that decides it.
 */
export const SECTION_REMOVAL_PREFIX_KEY_V1 = '\u0018';

/** What a removal attempt did. Only `removed` changes the body. */
export type PromptEnhancementSectionRemovalOutcomeV1 =
  | 'removed'
  | 'no_such_section'
  | 'locked'
  | 'would_blank';

export interface PromptEnhancementSectionRemovalResultV1 {
  outcome: PromptEnhancementSectionRemovalOutcomeV1;
  /**
   * The editor state after the cut — the same state when nothing was removed. Only the
   * body buffer differs: the details field, the focused field and the viewport are the
   * caller's own.
   */
  editor: PromptEnhancementMultilineEditorStateV1;
  /**
   * Which entry of the caller's sections was removed. Absent for the applied-details
   * block, which is no section of the composed body, and for every refusal.
   */
  sectionIndex?: number;
}

/**
 * Remove the section a digit names from the body.
 *
 * The cut takes the section's own lines — its title, its body and the blank line that
 * separates it from the next. The last section has no next title, so it takes the blank
 * line *before* it instead; a line with text there is never taken, because it belongs to
 * the section above.
 */
export function removePromptEnhancementSectionV1(
  editor: PromptEnhancementMultilineEditorStateV1,
  sections: readonly PromptEnhancementSectionMapInputV1[],
  sectionNumber: number,
): PromptEnhancementSectionRemovalResultV1 {
  const buffer = editor.buffers.enhanced_body;
  const map = buildPromptEnhancementSectionMapV1(buffer.text, sections);
  const entry = map.entries.find((candidate) => candidate.number === sectionNumber);
  if (!entry) return { outcome: 'no_such_section', editor };
  // A locked body refuses a removal exactly as it refuses a typed character.
  if (editor.editabilityState !== 'editable') return { outcome: 'locked', editor };

  const lines = buffer.text.split('\n');
  let from = entry.titleLine;
  const to = entry.endLine;
  // The last section runs to the end, so the blank line that separated it from the
  // section above goes with it — otherwise the body keeps a trailing blank. A line with
  // text there belongs to the section above and stays.
  if (to >= lines.length && from > 0 && lines[from - 1]!.trim().length === 0) from -= 1;

  const kept = [...lines.slice(0, from), ...lines.slice(to)];
  const text = kept.join('\n');
  if (text.trim().length === 0) return { outcome: 'would_blank', editor };

  // The cursor sits where the cut was: the start of the text that followed it, or the
  // new end of the body when the last section went.
  const cursor = kept.slice(0, from).reduce((total, line) => total + line.length + 1, 0);
  const placed = {
    ...buffer,
    text,
    cursor: Math.min(cursor, text.length),
    dirty: true,
  };
  const moved = promptEnhancementKeepFieldCursorVisibleV1(
    { ...placed, desiredVisualColumn: promptEnhancementCursorVisualPositionV1(placed, editor.fieldWidth).column },
    editor.fieldWidth,
    editor.viewportRows,
  );

  return {
    outcome: 'removed',
    editor: { ...editor, buffers: { ...editor.buffers, enhanced_body: moved } },
    ...(typeof entry.source === 'number' ? { sectionIndex: entry.source } : {}),
  };
}

/** What the chord guard decided about one key. */
export interface PromptEnhancementSectionRemovalChordV1 {
  /** The arming flag after this key. */
  armed: boolean;
  /**
   * True when the chord used this key itself — the prefix that armed, or the digit of
   * an armed chord. A used key must not reach the branches that would otherwise handle
   * it; every other key falls through with its own meaning intact.
   */
  consumed: boolean;
  /** The digit's section number, present only when a digit was consumed. */
  sectionNumber?: number;
}

/**
 * The chord, decided before anything else looks at the key.
 *
 * Arming on the prefix; a digit after it is consumed; anything else disarms and falls
 * through with its own meaning intact. Not armed, the guard does nothing at all — a
 * digit types itself, as it does today.
 */
export function stepPromptEnhancementSectionRemovalChordV1(
  armed: boolean,
  key: { kind: string; raw?: string },
): PromptEnhancementSectionRemovalChordV1 {
  const isEditorKey = key.kind === 'editor' && typeof key.raw === 'string';
  // The prefix arms and is used, whether or not it was already armed — pressing it
  // twice leaves the chord armed rather than passing a control byte to the editor.
  if (isEditorKey && key.raw === SECTION_REMOVAL_PREFIX_KEY_V1) return { armed: true, consumed: true };
  if (!armed) return { armed: false, consumed: false };
  if (isEditorKey && /^[1-9]$/.test(key.raw!)) {
    return { armed: false, consumed: true, sectionNumber: Number(key.raw) };
  }
  return { armed: false, consumed: false };
}
