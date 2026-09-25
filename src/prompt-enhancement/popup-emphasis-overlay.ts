/**
 * Where each emphasised phrase lands on screen — one list of column ranges per display row of
 * the body window, aligned with the rows the renderer draws.
 *
 * Pure. Nothing here modifies the buffer, and nothing here is kept between frames: the stored
 * phrases carry no offsets, so every frame finds them again in the text the user is looking at
 * right now. A phrase the user has edited away is simply not found, and is not drawn — which is
 * why no range can ever go stale.
 *
 * Three places in the body are never marked, and each is checked here rather than assumed: a
 * section's **title line**, because a heading is chrome and not the developer's sentence; the two
 * sections the standard excludes outright; and the block the popup writes when the developer
 * applies their own typed details. The last two are the same point — **their words are not
 * marked** — and it matters more than it looks, because their prompt is quoted back verbatim in
 * the body's first section, so a phrase taken *from* that prompt would otherwise be found there
 * first and emphasised at them in their own words.
 *
 * An occurrence in any of the three is passed over, not fatal — the phrase marks its next one.
 *
 * ⚠️ **The unit is the PHRASE, and painting the whole line instead was tried and withdrawn.** Under
 * line painting a phrase found anywhere in a sentence turned the entire sentence bold — which reads
 * well when the sentence is wholly apt, and badly when it is not: a line can carry one clause that
 * answers what was asked and a second that wanders past it, and making the wanderer loud along with
 * the answer is the opposite of what a mark is for. Marking the words that earned it keeps the rest
 * plain, so the reader's eye lands on the part that was actually judged. Measured either way
 * against the same labels: coverage is identical and precision does not fall, so the narrower unit
 * costs nothing — it only declines to amplify text no rule ever looked at.
 */
import { buildPromptEnhancementVisualLineMapV1 } from './multiline-editor.js';
import { buildPromptEnhancementSectionMapV1, type PromptEnhancementSectionMapInputV1 } from './popup-section-map.js';
import { NEVER_MARKED_SECTION_KINDS } from './emphasis-classes.js';
import type { PromptEnhancementEmphasisPhraseV1 } from '../store/pending-prompt-enhancements.js';

/** Half-open column range within one display row: `[startColumn, endColumn)`, 0-based. */
export interface PromptEnhancementEmphasisSpanV1 {
  startColumn: number;
  endColumn: number;
}

/** One composed section, as the popup carries it — the map's inputs plus the kind. */
export interface PromptEnhancementEmphasisOverlaySectionV1 extends PromptEnhancementSectionMapInputV1 {
  /** The composed kind, so the two never-marked sections can be recognised. */
  sectionKind?: string;
}

export interface PromptEnhancementEmphasisOverlayInputV1 {
  /** The full body text, as the editor holds it. */
  text: string;
  sections: readonly PromptEnhancementEmphasisOverlaySectionV1[];
  /** The phrases carried beside the pending row, in the order the cap kept them. */
  phrases: readonly PromptEnhancementEmphasisPhraseV1[];
  /** The field width the body is wrapped at. */
  fieldWidth: number;
  /** The window's clamped start row, as the display used it. */
  windowStart: number;
  /** How many rows the window shows. */
  windowRows: number;
  /** Whether the first / last shown row was replaced by a scroll marker. */
  markerAbove: boolean;
  markerBelow: boolean;
}

/** A half-open offset range within the buffer. */
interface OffsetRange {
  start: number;
  end: number;
}

/** The offset range of every logical line, so a line can be tested by offset. */
function logicalLineRanges(text: string): readonly OffsetRange[] {
  const ranges: OffsetRange[] = [];
  let start = 0;
  for (const line of text.split('\n')) {
    ranges.push({ start, end: start + line.length });
    start += line.length + 1;
  }
  return ranges;
}

/**
 * The stretches of the buffer no mark may start in: every found title line, every line of the two
 * sections the standard never marks, and every line of the block the developer's applied details
 * were merged into.
 */
function ineligibleRanges(input: {
  readonly text: string;
  readonly sections: readonly PromptEnhancementEmphasisOverlaySectionV1[];
}): readonly OffsetRange[] {
  const map = buildPromptEnhancementSectionMapV1(input.text, input.sections);
  const lines = logicalLineRanges(input.text);
  const out: OffsetRange[] = [];
  for (const entry of map.entries) {
    const title = lines[entry.titleLine];
    if (title) out.push(title);
    const kind = typeof entry.source === 'number' ? input.sections[entry.source]?.sectionKind : undefined;
    // The applied-details block is the developer's own typed text, merged into the body word for
    // word when they press Apply. It is never marked for the same reason the section that quotes
    // their prompt back is never marked, and for the reason their details field is not marked
    // while they are still typing in it: these are their words, not the body's instruction.
    const neverMarked = entry.source === 'details'
      || (kind !== undefined && NEVER_MARKED_SECTION_KINDS.has(kind));
    if (!neverMarked) continue;
    const first = lines[entry.titleLine];
    const last = lines[entry.endLine - 1];
    if (first && last) out.push({ start: first.start, end: last.end });
  }
  return out;
}

/**
 * The first occurrence of a phrase that may actually be marked: matched case-insensitively, the
 * way the phrases were located in the first place, and skipping any that begins inside one of the
 * stretches above.
 */
function firstEligibleOccurrence(
  text: string,
  phrase: string,
  ineligible: readonly OffsetRange[],
): OffsetRange | undefined {
  if (phrase.length === 0) return undefined;
  const haystack = text.toLowerCase();
  const needle = phrase.toLowerCase();
  for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
    if (ineligible.some((range) => at >= range.start && at < range.end)) continue;
    return { start: at, end: at + phrase.length };
  }
  return undefined;
}

/**
 * Merge the ranges of one row so none overlaps another.
 *
 * ⚠️ Not tidiness — correctness. The standard deliberately marks a term *and* the clause around
 * it, so two kept phrases can nest; drawn as two ranges, the inner one's reset would end the outer
 * one's bold early and the rest of the clause would come out plain. One merged range draws what
 * both asked for.
 */
function merged(spans: readonly PromptEnhancementEmphasisSpanV1[]): PromptEnhancementEmphasisSpanV1[] {
  const sorted = [...spans].sort((left, right) => left.startColumn - right.startColumn);
  const out: PromptEnhancementEmphasisSpanV1[] = [];
  for (const span of sorted) {
    const last = out[out.length - 1];
    if (last && span.startColumn <= last.endColumn) last.endColumn = Math.max(last.endColumn, span.endColumn);
    else out.push({ ...span });
  }
  return out;
}

/**
 * The column ranges to draw in bold on each display row. Length equals the number of rows the
 * window shows, so the renderer can index it by the row it is drawing; a row with nothing to mark
 * gets an empty list.
 */
/**
 * Where a body's emphasised phrases may be marked, as character offsets into the text.
 *
 * ⛔ THE SAME RULES AS THE POPUP'S OWN OVERLAY, not a second copy of them: it calls the very
 * functions `buildPromptEnhancementEmphasisSpansV1` calls, and neither is edited. What differs is
 * only the shape of the answer — the popup needs spans per visual row because it wraps text itself
 * at a fixed width inside a window; a surface that wraps with CSS has no such width and no window,
 * and needs the offsets.
 *
 * Exported for that second surface, on the precedent already set for the floor guard: one
 * definition, read by both consumers, rather than two that drift with the drifting one being
 * whichever is tested less.
 *
 * Each phrase contributes at most one range — its first occurrence that is allowed to carry a mark,
 * matched case-insensitively, skipping a title line and any section whose kind the standard
 * excludes. A phrase with nowhere to go contributes nothing.
 */
export function locatePromptEnhancementEmphasisOffsetsV1(input: {
  readonly text: string;
  readonly sections: readonly PromptEnhancementEmphasisOverlaySectionV1[];
  readonly phrases: readonly { readonly text: string }[];
}): readonly { start: number; end: number }[] {
  const ineligible = ineligibleRanges(input);
  const out: { start: number; end: number }[] = [];
  for (const phrase of input.phrases) {
    const at = firstEligibleOccurrence(input.text, phrase.text, ineligible);
    if (at !== undefined) out.push({ start: at.start, end: at.end });
  }
  return out;
}

export function buildPromptEnhancementEmphasisSpansV1(
  input: PromptEnhancementEmphasisOverlayInputV1,
): readonly (readonly PromptEnhancementEmphasisSpanV1[])[] {
  const visual = buildPromptEnhancementVisualLineMapV1(input.text, input.fieldWidth);
  const shownRows = Math.min(input.windowRows, Math.max(0, visual.length - input.windowStart));
  const rows: PromptEnhancementEmphasisSpanV1[][] = Array.from({ length: shownRows }, () => []);
  if (input.phrases.length === 0 || shownRows === 0) return rows;

  const ineligible = ineligibleRanges(input);
  for (const phrase of input.phrases) {
    const painted = firstEligibleOccurrence(input.text, phrase.text, ineligible);
    if (painted === undefined) continue;
    // A painted range that crosses a wrap becomes one sub-range per row it touches — arithmetic
    // off the map's offsets, never a guess about where the wrap fell.
    for (const [index, line] of visual.entries()) {
      if (line.startOffset >= painted.end || line.endOffset <= painted.start) continue;
      const row = index - input.windowStart;
      if (row < 0 || row >= shownRows) continue;
      // A scroll marker is not the buffer's text at all — it replaced the row, so it carries no
      // mark, the same rule the section numbers follow.
      if (input.markerAbove && row === 0) continue;
      if (input.markerBelow && row === shownRows - 1) continue;
      const startColumn = Math.max(painted.start, line.startOffset) - line.startOffset;
      const endColumn = Math.min(painted.end, line.endOffset) - line.startOffset;
      if (endColumn > startColumn) rows[row]!.push({ startColumn, endColumn });
    }
  }
  return rows.map(merged);
}
