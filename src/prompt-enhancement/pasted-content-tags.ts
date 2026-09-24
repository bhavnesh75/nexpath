/**
 * Repair the ONE piece of agent-emitted markup that renders as broken text in the PE popup.
 *
 * ⚠️ WHY (bug report with screenshot, 2026-09-24). Claude Code expands a pasted block into the hook
 * payload as an XML-ish wrapper, and its CLOSING tag carries the opening tag's attributes:
 *
 *     <pasted_content id="eea2">
 *     nexpath-cost-curve-banner
 *     </pasted_content id="eea2">        ← attributes on a closing tag are not valid anywhere
 *
 * Nexpath does not author that markup — the "My original request (verbatim)" section is a straight
 * copy of the hook's `prompt` string (compose-enhancement.ts: `bodyText = input.originalPromptText`)
 * — but the user reads it inside OUR popup, so it is ours to render legibly.
 *
 * WHAT THIS DOES, EXACTLY: drops the attributes from a `pasted_content` CLOSING tag. Nothing else.
 * The pasted content between the tags, the opening tag (where attributes ARE valid), every other
 * tag, and every other character are untouched, so no information is lost and the id is still
 * readable on the opening tag.
 *
 * WHY AT INTAKE rather than at paint time: the popup body is a live editable buffer — the text shown
 * IS the text sent. Showing something the editor does not hold would desynchronise the cursor and
 * make Enter send something the user never saw. Normalising once, before the prompt is stored,
 * keeps the store, the composed body, the popup and the sendability gate on one identical string.
 *
 * Scoped deliberately to `pasted_content`: a blanket "strip attributes from any closing tag" rule
 * would rewrite a user's own prose about broken HTML. Widen it when a second tag is actually
 * observed in the wild, not before.
 */

/**
 * `</pasted_content …>` → `</pasted_content>`.
 *
 * Idempotent, and a no-op (same string back) for every prompt that does not contain the malformed
 * shape — which is all of them on agents that do not emit this wrapper.
 */
export function normalizePastedContentClosingTagsV1(text: string): string {
  // `[^>]*` cannot cross the tag, so a `>` inside the pasted CONTENT can never be swallowed.
  return text.replace(/<\/pasted_content\s[^>]*>/g, '</pasted_content>');
}
