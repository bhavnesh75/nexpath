import { describe, expect, it } from 'vitest';
import type { PromptRecord } from '../classifier/types.js';
import {
  hasR5Injection,
  substituteR5Placeholder,
  injectR5,
  strategyDFallback,
  type R5Register,
} from './r5-injection.js';

function makePrompt(text: string, index = 0): PromptRecord {
  return {
    index,
    text,
    capturedAt:      Date.now(),
    classifiedStage: 'implementation',
    confidence:      0.8,
  };
}

const SAMPLE_DESC_BASE_WITH_PLACEHOLDER = [
  '{R4_OPEN}',
  '{R5_INJECT: ~1-2 lines — "example user-grounded reason"}',
  'Gap-framing sentence.',
  'Direction-body sentence.',
  '{R4_CLOSE}',
].join('\n');

const SAMPLE_DESC_BASE_NO_PLACEHOLDER = [
  '{R4_OPEN}',
  'Gap-framing sentence.',
  'Direction-body sentence.',
  '{R4_CLOSE}',
].join('\n');

describe('r5-injection — hasR5Injection()', () => {
  it('returns true for a desc-base containing {R5_INJECT: ...}', () => {
    expect(hasR5Injection(SAMPLE_DESC_BASE_WITH_PLACEHOLDER)).toBe(true);
  });

  it('returns false for a desc-base without the placeholder', () => {
    expect(hasR5Injection(SAMPLE_DESC_BASE_NO_PLACEHOLDER)).toBe(false);
  });

  it('returns false for an empty input', () => {
    expect(hasR5Injection('')).toBe(false);
  });

  it('does not stateful-cache across consecutive calls (regex /g hazard)', () => {
    // Reset hazard: a stateful /g regex would return alternating results.
    expect(hasR5Injection(SAMPLE_DESC_BASE_WITH_PLACEHOLDER)).toBe(true);
    expect(hasR5Injection(SAMPLE_DESC_BASE_WITH_PLACEHOLDER)).toBe(true);
    expect(hasR5Injection(SAMPLE_DESC_BASE_WITH_PLACEHOLDER)).toBe(true);
  });
});

describe('r5-injection — substituteR5Placeholder()', () => {
  it('replaces the {R5_INJECT: ...} placeholder with the substitution text', () => {
    const out = substituteR5Placeholder(SAMPLE_DESC_BASE_WITH_PLACEHOLDER, 'I have been building X.');
    expect(out).toContain('I have been building X.');
    expect(out).not.toContain('{R5_INJECT');
  });

  it('is idempotent on input without a placeholder', () => {
    expect(substituteR5Placeholder(SAMPLE_DESC_BASE_NO_PLACEHOLDER, 'XXX')).toBe(SAMPLE_DESC_BASE_NO_PLACEHOLDER);
  });

  it('replaces every occurrence when more than one placeholder is present', () => {
    const multi = '{R5_INJECT: a} mid {R5_INJECT: b}';
    expect(substituteR5Placeholder(multi, '__')).toBe('__ mid __');
  });

  it('preserves the surrounding {R4_OPEN} / {R4_CLOSE} bookend placeholders', () => {
    const out = substituteR5Placeholder(SAMPLE_DESC_BASE_WITH_PLACEHOLDER, 'substituted');
    expect(out).toContain('{R4_OPEN}');
    expect(out).toContain('{R4_CLOSE}');
  });
});

describe('r5-injection — strategyDFallback()', () => {
  it('substitutes the placeholder with the D-fallback string for a known (signal_type, register)', () => {
    // TASK_REVIEW is a Class 1 signal_type with a 'formal' fallback per r5-fallbacks.ts.
    const out = strategyDFallback(SAMPLE_DESC_BASE_WITH_PLACEHOLDER, 'TASK_REVIEW', 'formal');
    expect(out).not.toContain('{R5_INJECT');
    expect(out).toContain('{R4_OPEN}');
  });

  it('returns the desc-base unchanged when no fallback exists for the (signal_type, register) pair', () => {
    const out = strategyDFallback(SAMPLE_DESC_BASE_WITH_PLACEHOLDER, 'NEVER_AUTHORED_SIGNAL_TYPE_XYZ', 'casual');
    expect(out).toBe(SAMPLE_DESC_BASE_WITH_PLACEHOLDER);
  });

  it('idempotent on input without a placeholder', () => {
    const out = strategyDFallback(SAMPLE_DESC_BASE_NO_PLACEHOLDER, 'TASK_REVIEW', 'formal');
    expect(out).toBe(SAMPLE_DESC_BASE_NO_PLACEHOLDER);
  });
});

describe('r5-injection — injectR5() entry point (skeleton)', () => {
  const history: readonly PromptRecord[] = [makePrompt('first prompt', 0), makePrompt('second prompt', 1)];

  it('returns the desc-base unchanged when no {R5_INJECT} placeholder is present', async () => {
    const out = await injectR5(SAMPLE_DESC_BASE_NO_PLACEHOLDER, history, 'TASK_REVIEW', 'formal');
    expect(out).toBe(SAMPLE_DESC_BASE_NO_PLACEHOLDER);
  });

  it('substitutes the placeholder via D-fallback (until Strategy C wires up)', async () => {
    const out = await injectR5(SAMPLE_DESC_BASE_WITH_PLACEHOLDER, history, 'TASK_REVIEW', 'formal');
    expect(out).not.toContain('{R5_INJECT');
    expect(out).toContain('{R4_OPEN}');
    expect(out).toContain('{R4_CLOSE}');
  });

  it('returns the desc-base unchanged when the (signal_type, register) pair has no fallback', async () => {
    const out = await injectR5(
      SAMPLE_DESC_BASE_WITH_PLACEHOLDER,
      history,
      'NEVER_AUTHORED_SIGNAL_TYPE_XYZ',
      'casual',
    );
    expect(out).toBe(SAMPLE_DESC_BASE_WITH_PLACEHOLDER);
  });

  it('accepts all 3 R5Register values without throwing', async () => {
    const registers: R5Register[] = ['formal', 'casual', 'beginner'];
    for (const reg of registers) {
      const out = await injectR5(SAMPLE_DESC_BASE_NO_PLACEHOLDER, history, 'TASK_REVIEW', reg);
      expect(typeof out).toBe('string');
    }
  });
});
