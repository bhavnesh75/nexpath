import { describe, expect, it } from 'vitest';
import type {
  UniversalWhyHelpVariants,
  NonStandardWhyHelpVariants,
  WhyHelpEntry,
  WhyHelpVariants,
  SignalClass,
} from './why-help.js';
import { WHY_HELP_PER_CLASS, ALL_SIGNAL_CLASSES } from './why-help.js';

describe('why-help — type shape', () => {
  it('UniversalWhyHelpVariants requires formal + casual + beginner', () => {
    const ok: UniversalWhyHelpVariants = {
      formal:   'F',
      casual:   'C',
      beginner: 'B',
    };
    expect(ok.formal).toBe('F');
    expect(ok.casual).toBe('C');
    expect(ok.beginner).toBe('B');
  });

  it('NonStandardWhyHelpVariants accepts any subset of the 3 registers', () => {
    const empty:        NonStandardWhyHelpVariants = {};
    const formalOnly:   NonStandardWhyHelpVariants = { formal: 'F' };
    const casualBeg:    NonStandardWhyHelpVariants = { casual: 'C', beginner: 'B' };
    const all:          NonStandardWhyHelpVariants = { formal: 'F', casual: 'C', beginner: 'B' };
    expect(empty).toEqual({});
    expect(formalOnly.formal).toBe('F');
    expect(casualBeg.casual).toBe('C');
    expect(all.formal).toBe('F');
  });

  it('WhyHelpEntry discriminated union accepts each of the 4 class structures', () => {
    const universal: WhyHelpEntry = {
      structure: 'universal-triplet',
      content: { formal: 'F', casual: 'C', beginner: 'B' },
    };
    const class7: WhyHelpEntry = {
      structure: 'class7-vibe-coder',
      content: { casual: 'C', beginner: 'B' },
    };
    const class8: WhyHelpEntry = {
      structure: 'class8-role-cluster',
      content: { founder_casual: 'fc', indie_hacker_casual: 'ihc', pm_formal: 'pmf' },
    };
    const class9: WhyHelpEntry = {
      structure: 'class9-formal-only',
      content: { formal: 'F' },
    };
    expect(universal.structure).toBe('universal-triplet');
    expect(class7.structure).toBe('class7-vibe-coder');
    expect(class8.structure).toBe('class8-role-cluster');
    expect(class9.structure).toBe('class9-formal-only');
  });

  it('WhyHelpVariants alias matches UniversalWhyHelpVariants shape', () => {
    const v: WhyHelpVariants = { formal: 'F', casual: 'C', beginner: 'B' };
    const u: UniversalWhyHelpVariants = v;
    expect(u).toEqual(v);
  });
});

describe('why-help — content table', () => {
  it('WHY_HELP_PER_CLASS contains exactly 9 signal classes', () => {
    expect(Object.keys(WHY_HELP_PER_CLASS)).toHaveLength(9);
  });

  it('ALL_SIGNAL_CLASSES enumerates the 9 keys present in WHY_HELP_PER_CLASS', () => {
    expect(ALL_SIGNAL_CLASSES).toHaveLength(9);
    for (const cls of ALL_SIGNAL_CLASSES) {
      expect(WHY_HELP_PER_CLASS[cls]).toBeDefined();
    }
  });

  it('classes 1-6 use the universal-triplet structure with all 3 registers populated', () => {
    const universalClasses: SignalClass[] = [
      'class1_stage_transition',
      'class2_verification_quality',
      'class3_spec_architecture',
      'class4_release_observability_infra',
      'class5_session_quality',
      'class6_planning_idea_task',
    ];
    for (const cls of universalClasses) {
      const entry = WHY_HELP_PER_CLASS[cls];
      expect(entry.structure).toBe('universal-triplet');
      if (entry.structure === 'universal-triplet') {
        expect(entry.content.formal.trim().length).toBeGreaterThan(0);
        expect(entry.content.casual.trim().length).toBeGreaterThan(0);
        expect(entry.content.beginner.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('class 7 vibe-coder uses class7-vibe-coder structure with casual + beginner only', () => {
    const entry = WHY_HELP_PER_CLASS.class7_cool_geek_vibe_coder;
    expect(entry.structure).toBe('class7-vibe-coder');
    if (entry.structure === 'class7-vibe-coder') {
      expect(entry.content.casual.trim().length).toBeGreaterThan(0);
      expect(entry.content.beginner.trim().length).toBeGreaterThan(0);
    }
  });

  it('class 8 role-specific uses class8-role-cluster structure with 3 role-keyed entries', () => {
    const entry = WHY_HELP_PER_CLASS.class8_role_cluster;
    expect(entry.structure).toBe('class8-role-cluster');
    if (entry.structure === 'class8-role-cluster') {
      expect(entry.content.founder_casual!.trim().length).toBeGreaterThan(0);
      expect(entry.content.indie_hacker_casual!.trim().length).toBeGreaterThan(0);
      expect(entry.content.pm_formal!.trim().length).toBeGreaterThan(0);
    }
  });

  it('class 9 academic-formal uses class9-formal-only structure with formal only', () => {
    const entry = WHY_HELP_PER_CLASS.class9_academic_hardcore_pro;
    expect(entry.structure).toBe('class9-formal-only');
    if (entry.structure === 'class9-formal-only') {
      expect(entry.content.formal.trim().length).toBeGreaterThan(0);
    }
  });

  it('total block count across all classes is 24 (6×3 + 2 + 3 + 1)', () => {
    let count = 0;
    for (const cls of ALL_SIGNAL_CLASSES) {
      const entry = WHY_HELP_PER_CLASS[cls];
      if (entry.structure === 'universal-triplet') count += 3;
      else if (entry.structure === 'class7-vibe-coder') count += 2;
      else if (entry.structure === 'class8-role-cluster') count += 3;
      else if (entry.structure === 'class9-formal-only') count += 1;
    }
    expect(count).toBe(24);
  });

  it('no block contains banned third-person AI patterns (the AI / Claude / it says / its answer / its output)', () => {
    const banned = ['the AI', 'Ask the AI', 'Have the AI', 'Get the AI', 'Instruct the AI', 'Claude', 'the assistant', 'its answer', 'its output'];
    const collect = (entry: WhyHelpEntry): string[] => {
      switch (entry.structure) {
        case 'universal-triplet':   return [entry.content.formal, entry.content.casual, entry.content.beginner];
        case 'class7-vibe-coder':   return [entry.content.casual, entry.content.beginner];
        case 'class8-role-cluster': return [entry.content.founder_casual ?? '', entry.content.indie_hacker_casual ?? '', entry.content.pm_formal ?? ''];
        case 'class9-formal-only':  return [entry.content.formal];
      }
    };
    for (const cls of ALL_SIGNAL_CLASSES) {
      const blocks = collect(WHY_HELP_PER_CLASS[cls]);
      for (const text of blocks) {
        for (const p of banned) {
          expect(text, `class ${cls}: banned pattern "${p}" appeared`).not.toContain(p);
        }
      }
    }
  });
});
