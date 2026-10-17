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

/**
 * The highest section number the chord can name. The chord consumes ONE digit, so this is a
 * property of the key sequence and not of the body: a body with twelve sections still has only
 * nine reachable by keyboard.
 *
 * ⚠️ Coupled to the digit test inside {@link stepPromptEnhancementSectionRemovalChordV1}. That
 * test stays a literal regex (it runs on every keystroke); this constant is what a surface asks
 * when it needs to TELL a reader the range, so the two must move together.
 */
export const PROMPT_ENHANCEMENT_SECTION_REMOVAL_MAX_DIGIT_V1 = 9 as const;

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

/**
 * The one sentence a refused removal shows. Every refusal shows it — a number that names no
 * section, a body that cannot be edited, and a cut that would leave nothing behind all read the
 * same to the user, who only needs to know the section did not go.
 */
export const PROMPT_ENHANCEMENT_SECTION_REMOVAL_NOTICE_V1 = 'this section not found' as const;

/**
 * What to say about an outcome, or nothing at all.
 *
 * A completed removal is silent: the section is gone from the body, and that is the whole of the
 * feedback. Kept beside the removal itself, and pure, so what the popup says is tested without a
 * popup.
 */
export function promptEnhancementSectionRemovalNoticeV1(
  outcome: PromptEnhancementSectionRemovalOutcomeV1,
): string | undefined {
  return outcome === 'removed' ? undefined : PROMPT_ENHANCEMENT_SECTION_REMOVAL_NOTICE_V1;
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
  // A literal regex on purpose — this runs on every keystroke. Its top digit is mirrored by
  // PROMPT_ENHANCEMENT_SECTION_REMOVAL_MAX_DIGIT_V1, which is what surfaces quote to the reader.
  if (isEditorKey && /^[1-9]$/.test(key.raw!)) {
    return { armed: false, consumed: true, sectionNumber: Number(key.raw) };
  }
  return { armed: false, consumed: false };
}

/**
 * The highest digit that names a section in the body as it stands right now — what a surface
 * needs to describe the range honestly instead of quoting the key sequence's whole span.
 *
 * Two things narrow it, and both matter:
 *
 *  - the body's OWN sections, counted the way {@link removePromptEnhancementSectionV1} counts
 *    them, from the same text. A title the user has edited away is not found by either, so a
 *    range this returns can never promise a digit the removal would then refuse;
 *  - {@link PROMPT_ENHANCEMENT_SECTION_REMOVAL_MAX_DIGIT_V1}, because the chord takes one key.
 *
 * `undefined` means there is no range to name at all: the surface was given no sections, or the
 * body no longer carries any, and then every digit refuses. Callers keep their own words for
 * that case — this decides the number and never the sentence.
 */
export function promptEnhancementRemovableSectionTopV1(
  text: string,
  sections: readonly PromptEnhancementSectionMapInputV1[] | undefined,
): number | undefined {
  if (sections === undefined) return undefined;
  const count = buildPromptEnhancementSectionMapV1(text, sections).entries.length;
  if (count === 0) return undefined;
  return Math.min(count, PROMPT_ENHANCEMENT_SECTION_REMOVAL_MAX_DIGIT_V1);
}
