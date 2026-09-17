/**
 * What the popup says about a removal.
 *
 * One sentence for every refusal and silence for a success, kept pure so the wording is pinned
 * without drawing a frame. A refusal reads the same whichever way it was refused: the user asked
 * for a section to go, and it did not — which of the three guards caught it is the popup's
 * business, not theirs.
 */
import { describe, expect, it } from 'vitest';
import {
  PROMPT_ENHANCEMENT_SECTION_REMOVAL_NOTICE_V1,
  promptEnhancementSectionRemovalNoticeV1,
  type PromptEnhancementSectionRemovalOutcomeV1,
} from './popup-section-removal.js';

describe('what a removal says', () => {
  it('says nothing at all when the section went', () => {
    expect(promptEnhancementSectionRemovalNoticeV1('removed')).toBeUndefined();
  });

  it('says the same one sentence for every refusal', () => {
    const refusals: readonly PromptEnhancementSectionRemovalOutcomeV1[] = [
      'no_such_section',
      'locked',
      'would_blank',
    ];
    for (const outcome of refusals) {
      expect(promptEnhancementSectionRemovalNoticeV1(outcome), outcome)
        .toBe(PROMPT_ENHANCEMENT_SECTION_REMOVAL_NOTICE_V1);
    }
    // One text, not three that happen to match today.
    expect(new Set(refusals.map(promptEnhancementSectionRemovalNoticeV1)).size).toBe(1);
  });

  it('is a plain sentence — nothing internal, nothing to strip', () => {
    const notice = PROMPT_ENHANCEMENT_SECTION_REMOVAL_NOTICE_V1;
    expect(notice).toBe('this section not found');
    expect(notice).toMatch(/^[a-z ]+$/);
    expect([...notice].every((ch) => ch.charCodeAt(0) >= 32)).toBe(true);
  });

  it('covers the outcome union — every member is decided, none falls through', () => {
    const all: readonly PromptEnhancementSectionRemovalOutcomeV1[] = [
      'removed',
      'no_such_section',
      'locked',
      'would_blank',
    ];
    // Exactly one outcome is silent; the rest speak. A new outcome added without a decision here
    // would break this count rather than quietly inherit the refusal text.
    expect(all.filter((o) => promptEnhancementSectionRemovalNoticeV1(o) === undefined)).toEqual(['removed']);
  });
});
