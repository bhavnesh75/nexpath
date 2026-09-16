/**
 * The section map of the submit popup's body — which logical lines belong to which
 * section, rebuilt from the live buffer on every render.
 *
 * Pure: no I/O, no state, one pass over the lines. The inputs are the text as the user
 * currently sees it and the composed sections in order, each with its title and the
 * body text it was composed with. The output numbers the sections found, in position
 * order, with the line range each one occupies.
 *
 * A title line is matched as `${title}:` with trailing spaces ignored, in order, so a
 * duplicated title maps one by one. While a section's body is still exactly as composed,
 * the search for the next title resumes after that body — so a heading-shaped line that
 * happens to sit inside the user's own prompt, or inside a drafted section, cannot take
 * a later section's number. Once a body has been edited that skip no longer applies to
 * it and the plain line search runs.
 *
 * A title that is not found gets no number; the sections after it keep contiguous
 * numbers by position, and its lines stay in the range of the section found before it.
 * The applied-details block, when present after the last found section, is numbered
 * last and runs to the end of the text.
 */

/** One composed section, in `currentBody` order. */
export interface PromptEnhancementSectionMapInputV1 {
  title: string;
  /** The text the section was composed with — exactly what follows its title line. */
  bodyText: string;
}

/**
 * The title of the block the popup writes when typed details are applied into the body.
 * Held without its colon, like every other title here: the line the popup writes is
 * `${title}:`, and that is what the map matches.
 */
export const PROMPT_ENHANCEMENT_APPLIED_DETAILS_TITLE_V1 = 'Additional details to incorporate';

export interface PromptEnhancementSectionMapEntryV1 {
  /** 1-based, in position order over the sections found. */
  number: number;
  /** Index into the input sections, or `'details'` for the applied-details block. */
  source: number | 'details';
  title: string;
  /** The logical line (0-based, `text.split('\n')`) that carries the title. */
  titleLine: number;
  /** The first logical line NOT in this section: the next found title's line, or the line count. */
  endLine: number;
}

export interface PromptEnhancementSectionMapV1 {
  entries: readonly PromptEnhancementSectionMapEntryV1[];
  lineCount: number;
}

function isTitleLine(line: string, title: string): boolean {
  return line.trimEnd() === `${title}:`;
}

/**
 * The line index just past a body that sits unchanged right after `titleLine`, or
 * `undefined` when the text there is not exactly that body followed by a line break
 * or the end of the text.
 */
function unchangedBodyEnd(lines: readonly string[], titleLine: number, bodyText: string): number | undefined {
  const bodyLines = bodyText.split('\n');
  let cursor = titleLine + 1;
  for (const expected of bodyLines) {
    if (cursor >= lines.length || lines[cursor] !== expected) return undefined;
    cursor += 1;
  }
  return cursor;
}

export function buildPromptEnhancementSectionMapV1(
  text: string,
  sections: readonly PromptEnhancementSectionMapInputV1[],
): PromptEnhancementSectionMapV1 {
  const lines = text.split('\n');
  const found: { source: number | 'details'; title: string; titleLine: number }[] = [];

  // Where the next title search starts. It moves past each found title, and past that
  // section's body too while the body is still exactly as composed.
  let searchFrom = 0;
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index]!;
    let titleLine = -1;
    for (let line = searchFrom; line < lines.length; line++) {
      if (isTitleLine(lines[line]!, section.title)) { titleLine = line; break; }
    }
    if (titleLine < 0) continue;
    found.push({ source: index, title: section.title, titleLine });
    searchFrom = unchangedBodyEnd(lines, titleLine, section.bodyText) ?? titleLine + 1;
  }

  for (let line = searchFrom; line < lines.length; line++) {
    if (isTitleLine(lines[line]!, PROMPT_ENHANCEMENT_APPLIED_DETAILS_TITLE_V1)) {
      found.push({ source: 'details', title: PROMPT_ENHANCEMENT_APPLIED_DETAILS_TITLE_V1, titleLine: line });
      break;
    }
  }

  const entries = found.map((entry, position) => ({
    number: position + 1,
    source: entry.source,
    title: entry.title,
    titleLine: entry.titleLine,
    endLine: position + 1 < found.length ? found[position + 1]!.titleLine : lines.length,
  }));
  return { entries, lineCount: lines.length };
}
