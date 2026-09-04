// @vitest-environment jsdom
//
// The rating surface's content, and the two ways it can silently go wrong:
// drifting from the CLI wording it quotes, and the factory drifting from the
// fixture the harness and the tests render.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  RATING_FIXTURE, RATING_SCALE, RATING_NOTE, RATING_QUESTION, RATING_FOOTER, RATING_LABEL,
} from './rating.js';
import { ratingSurfaceModel } from '../../pe-dock-adapter.js';

describe('rating fixture', () => {
  it('the scale is worst → best, 1 through 4', () => {
    expect(RATING_SCALE.map((c) => [c.label, c.rating])).toEqual([
      ['Bad', 1], ['Fine', 2], ['Good', 3], ['Excellent', 4],
    ]);
  });

  it('every action row carries its score', () => {
    const actions = RATING_FIXTURE.rows.filter((r) => r.kind === 'action');
    expect(actions.every((r) => r.kind === 'action' && typeof r.rating === 'number')).toBe(true);
  });

  it('the note is a row, dim, and sits above every score', () => {
    const rows = RATING_FIXTURE.rows;
    const note = rows[0];
    expect(note.kind).toBe('note');
    expect(note.kind === 'note' && note.tone).toBe('dim');
    expect(rows.findIndex((r) => r.kind === 'action')).toBeGreaterThan(0);
  });

  it('the surface asks its question in `pinch`, and has no field to type in', () => {
    expect(RATING_FIXTURE.pinch).toBe(RATING_QUESTION);
    expect(RATING_FIXTURE.label).toBe(RATING_LABEL);
    expect(RATING_FIXTURE.footer).toBe(RATING_FOOTER);
    expect(RATING_FIXTURE.rows.some((r) => r.kind === 'field')).toBe(false);
  });
});

/**
 * The harness renders RATING_FIXTURE; the dock will build ratingSurfaceModel().
 * If they diverge, the surface that ships is not the one that was reviewed.
 */
describe('the factory and the fixture are the same surface', () => {
  it('ratingSurfaceModel() equals RATING_FIXTURE', () => {
    expect(ratingSurfaceModel()).toEqual(RATING_FIXTURE);
  });

  it('...but is a fresh object each call, so a caller cannot mutate the fixture', () => {
    expect(ratingSurfaceModel()).not.toBe(ratingSurfaceModel());
    expect(ratingSurfaceModel().rows).not.toBe(RATING_FIXTURE.rows);
  });
});

/**
 * Same discipline as `adapters/rating-cadence.test.ts` and
 * `adapters/submit-hold-budget.test.ts`: read the shipped CLI module as text
 * and pin what this copy quotes. The wording is decided there, not here.
 */
describe('contract with the shipped CLI popup (the two must not drift)', () => {
  const shipped = readFileSync(
    join(process.cwd(), 'src', 'decision-session', 'feedback-popup.ts'), 'utf8',
  );

  it('the question is the CLI\'s, exactly', () => {
    expect(shipped).toContain(`export const FEEDBACK_QUESTION = "${RATING_QUESTION}";`);
  });

  it('the transparency note is the CLI\'s, exactly', () => {
    expect(shipped).toContain(`export const FEEDBACK_NOTE = '${RATING_NOTE}';`);
  });

  it('the four labels and their scores are the CLI\'s, in the CLI\'s order', () => {
    // Whitespace-normalised rather than a regex: the CLI's table is column-
    // aligned, and the alignment is not the contract.
    const flat = shipped.replace(/\s+/g, ' ');
    for (const { label, rating } of RATING_SCALE) {
      expect(flat).toContain(`value: 'feedback-rating-${rating}', label: '${label}', rating: ${rating}`);
    }
    // ...and there is no fifth.
    expect(shipped.match(/feedback-rating-/g)).toHaveLength(RATING_SCALE.length);
  });
});
