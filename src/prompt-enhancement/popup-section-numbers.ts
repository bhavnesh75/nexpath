/**
 * Where each section's number lands on screen — one entry per display row of the body
 * window, aligned with the rows the renderer draws.
 *
 * Pure. The number for a section goes on the LAST visual segment of its title line:
 * a title wider than the field wraps into several segments, and the number belongs
 * after the title's end, not in the middle of it. Display row `r` is visual line
 * `windowStart + r`; the rows the window replaced with its scroll markers are never
 * numbered, because what is drawn there is not the title.
 */
import { buildPromptEnhancementVisualLineMapV1 } from './multiline-editor.js';
import { buildPromptEnhancementSectionMapV1, type PromptEnhancementSectionMapInputV1 } from './popup-section-map.js';

export interface PromptEnhancementSectionNumbersInputV1 {
  /** The full body text, as the editor holds it. */
  text: string;
  sections: readonly PromptEnhancementSectionMapInputV1[];
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

/**
 * The suffix for each display row: the section number to draw after that row, or
 * `undefined` for a row that carries none. Length equals the number of rows the window
 * shows, so the renderer can index it by the row it is drawing.
 */
export function buildPromptEnhancementSectionNumberSuffixesV1(
  input: PromptEnhancementSectionNumbersInputV1,
): readonly (number | undefined)[] {
  const map = buildPromptEnhancementSectionMapV1(input.text, input.sections);
  const visual = buildPromptEnhancementVisualLineMapV1(input.text, input.fieldWidth);
  const shownRows = Math.min(input.windowRows, Math.max(0, visual.length - input.windowStart));
  const out: (number | undefined)[] = new Array(shownRows).fill(undefined);
  if (map.entries.length === 0) return out;

  // The last visual segment of each logical line: the one with the greatest start offset.
  const lastSegmentOf = new Map<number, number>();
  for (let index = 0; index < visual.length; index++) {
    const line = visual[index]!;
    const known = lastSegmentOf.get(line.physicalLine);
    if (known === undefined || visual[known]!.startOffset < line.startOffset) lastSegmentOf.set(line.physicalLine, index);
  }

  for (const entry of map.entries) {
    const segment = lastSegmentOf.get(entry.titleLine);
    if (segment === undefined) continue;
    const row = segment - input.windowStart;
    if (row < 0 || row >= shownRows) continue;
    if (input.markerAbove && row === 0) continue;
    if (input.markerBelow && row === shownRows - 1) continue;
    out[row] = entry.number;
  }
  return out;
}
