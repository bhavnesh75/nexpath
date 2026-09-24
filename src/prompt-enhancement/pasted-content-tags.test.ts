import { describe, it, expect } from 'vitest';
import { normalizePastedContentClosingTagsV1 } from './pasted-content-tags.js';

/**
 * Regression guard for the bug report of 2026-09-24: Claude Code closes its pasted-block wrapper
 * with the opening tag's attributes still attached, and the PE popup rendered that verbatim.
 *
 * The prompt in the first case is the reported one, reduced to the shape that matters.
 */
describe('normalizePastedContentClosingTagsV1', () => {
  it('drops attributes from the closing tag, keeping the pasted content byte-for-byte', () => {
    const reported = [
      'Listen',
      '',
      '<pasted_content id="eea2">',
      'nexpath-cost-curve-banner',
      '</pasted_content id="eea2">',
      '',
      ' and square are differen post not daily one',
    ].join('\n');

    expect(normalizePastedContentClosingTagsV1(reported)).toBe([
      'Listen',
      '',
      '<pasted_content id="eea2">',
      'nexpath-cost-curve-banner',
      '</pasted_content>',
      '',
      ' and square are differen post not daily one',
    ].join('\n'));
  });

  it('repairs every block when the same paste is referenced more than once', () => {
    // The reported prompt carried the SAME id twice — the user referenced one paste in two places.
    const twice = '<pasted_content id="eea2">a</pasted_content id="eea2"> mid '
      + '<pasted_content id="eea2">a</pasted_content id="eea2">';
    expect(normalizePastedContentClosingTagsV1(twice))
      .toBe('<pasted_content id="eea2">a</pasted_content> mid <pasted_content id="eea2">a</pasted_content>');
  });

  it('leaves the OPENING tag alone — attributes are valid there, and the id stays readable', () => {
    const out = normalizePastedContentClosingTagsV1('<pasted_content id="eea2">x</pasted_content id="eea2">');
    expect(out).toContain('<pasted_content id="eea2">');
  });

  it('leaves an already well-formed closing tag untouched', () => {
    const wellFormed = '<pasted_content id="eea2">x</pasted_content>';
    expect(normalizePastedContentClosingTagsV1(wellFormed)).toBe(wellFormed);
  });

  it('is idempotent — running it on its own output changes nothing further', () => {
    const once = normalizePastedContentClosingTagsV1('<pasted_content id="a">x</pasted_content id="a">');
    expect(normalizePastedContentClosingTagsV1(once)).toBe(once);
  });

  it('never touches a `>` inside the pasted content', () => {
    const withAngle = '<pasted_content id="a">if (a > b) return;</pasted_content id="a">';
    expect(normalizePastedContentClosingTagsV1(withAngle))
      .toBe('<pasted_content id="a">if (a > b) return;</pasted_content>');
  });

  it('is scoped to pasted_content — a user writing about other broken markup is left alone', () => {
    // Deliberate: a blanket "strip attributes from any closing tag" rule would rewrite prose and
    // code samples. This stays narrow until a second tag is actually observed.
    const prose = 'my template emits </div class="row"> and I cannot see why';
    expect(normalizePastedContentClosingTagsV1(prose)).toBe(prose);
  });

  it('returns an ordinary prompt unchanged', () => {
    const ordinary = 'add a login form and write tests for it';
    expect(normalizePastedContentClosingTagsV1(ordinary)).toBe(ordinary);
  });
});
