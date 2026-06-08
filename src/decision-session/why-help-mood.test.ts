import { describe, expect, it } from 'vitest';
import type { UserMood } from '../classifier/types.js';
import {
  WHY_HELP_MOOD,
  getMoodSentence,
  type WhyHelpMoodKey,
  type WhyHelpMoodRegister,
} from './why-help-mood.js';

describe('why-help-mood — content table', () => {
  it('contains exactly two mood keys (frustrated + rushed)', () => {
    const keys = Object.keys(WHY_HELP_MOOD);
    expect(keys.sort()).toEqual(['frustrated', 'rushed']);
  });

  it('each mood key has all three register variants', () => {
    for (const mood of Object.keys(WHY_HELP_MOOD) as WhyHelpMoodKey[]) {
      const registers = Object.keys(WHY_HELP_MOOD[mood]).sort();
      expect(registers).toEqual(['beginner', 'casual', 'formal']);
    }
  });

  it('every entry is a non-empty string', () => {
    for (const mood of Object.keys(WHY_HELP_MOOD) as WhyHelpMoodKey[]) {
      for (const reg of Object.keys(WHY_HELP_MOOD[mood]) as WhyHelpMoodRegister[]) {
        const text = WHY_HELP_MOOD[mood][reg];
        expect(typeof text).toBe('string');
        expect(text.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('why-help-mood — getMoodSentence resolver', () => {
  it('returns the matching sentence for frustrated × formal', () => {
    expect(getMoodSentence('frustrated', 'formal')).toBe(WHY_HELP_MOOD.frustrated.formal);
  });

  it('returns the matching sentence for rushed × casual', () => {
    expect(getMoodSentence('rushed', 'casual')).toBe(WHY_HELP_MOOD.rushed.casual);
  });

  it('returns the matching sentence for frustrated × beginner', () => {
    expect(getMoodSentence('frustrated', 'beginner')).toBe(WHY_HELP_MOOD.frustrated.beginner);
  });

  it('returns null for each neutral / positive mood (W2 handler — focused / methodical / casual / excited)', () => {
    const neutralMoods: UserMood[] = ['focused', 'methodical', 'casual', 'excited'];
    for (const m of neutralMoods) {
      expect(getMoodSentence(m, 'formal')).toBeNull();
      expect(getMoodSentence(m, 'casual')).toBeNull();
      expect(getMoodSentence(m, 'beginner')).toBeNull();
    }
  });

  it('returns null when mood is undefined (W3 handler)', () => {
    expect(getMoodSentence(undefined, 'formal')).toBeNull();
    expect(getMoodSentence(undefined, 'casual')).toBeNull();
    expect(getMoodSentence(undefined, 'beginner')).toBeNull();
  });
});
