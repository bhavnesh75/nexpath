import { describe, expect, it } from 'vitest';
import type { UserProfile } from '../classifier/types.js';
import { profileToRegister } from './register.js';

function makeProfile(nature: UserProfile['nature']): UserProfile {
  return {
    nature,
    precisionScore:     5,
    playfulnessScore:   5,
    precisionOrdinal:   'medium',
    playfulnessOrdinal: 'medium',
    mood:               'focused',
    depth:              'medium',
    depthScore:         5,
    computedAt:         Date.now(),
  };
}

describe('profileToRegister()', () => {
  it('maps beginner nature to beginner register', () => {
    expect(profileToRegister(makeProfile('beginner'))).toBe('beginner');
  });

  it('maps cool_geek nature to beginner register (vibe-coder routing)', () => {
    expect(profileToRegister(makeProfile('cool_geek'))).toBe('beginner');
  });

  it('maps hardcore_pro nature to formal register', () => {
    expect(profileToRegister(makeProfile('hardcore_pro'))).toBe('formal');
  });

  it('maps pro_geek_soul nature to casual register', () => {
    expect(profileToRegister(makeProfile('pro_geek_soul'))).toBe('casual');
  });

  it('returns casual when profile is undefined', () => {
    expect(profileToRegister(undefined)).toBe('casual');
  });

  it('returns casual when profile is null', () => {
    expect(profileToRegister(null)).toBe('casual');
  });

  it('covers every UserNature variant exhaustively', () => {
    const allNatures: Array<UserProfile['nature']> = ['beginner', 'cool_geek', 'hardcore_pro', 'pro_geek_soul'];
    for (const n of allNatures) {
      const reg = profileToRegister(makeProfile(n));
      expect(['formal', 'casual', 'beginner']).toContain(reg);
    }
  });
});
