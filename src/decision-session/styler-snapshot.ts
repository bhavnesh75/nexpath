// Test scaffold helpers for the styler diagnostic-bypass pattern.
//
// Phase 5 hand-off deliverable per the dev-plan §11.13 dual-snapshot
// pattern: the future render.test.ts snapshot test (Phase 6+ Bhavnesh
// work) produces BOTH a styled snapshot AND an unstyled snapshot
// (NEXPATH_STYLER_PASSTHROUGH=1) so a mismatch between the two
// flags either a broken styler (identical when it shouldn't be) or
// a layout-state leak through the styler.
//
// While the styler body is still pass-through (Phase 1 + Phase 5
// baseline), styled and unstyled outputs are identical — the helpers
// here let tests verify the capture mechanism today, and become
// load-bearing once Bhavnesh's Phase 6 styler body diverges them.

import { STYLER_PASSTHROUGH_ENV } from './styler.js';

/**
 * Run `fn` with the `NEXPATH_STYLER_PASSTHROUGH` env-var set to `value`
 * (or unset when `value` is `undefined`). Restores the prior env-var
 * state on completion, including on thrown exceptions (try/finally).
 *
 * Synchronous variant — for async render paths use
 * `withStylerEnvAsync` below.
 */
export function withStylerEnv<T>(value: '1' | undefined, fn: () => T): T {
  const prev = process.env[STYLER_PASSTHROUGH_ENV];
  try {
    if (value === undefined) delete process.env[STYLER_PASSTHROUGH_ENV];
    else                     process.env[STYLER_PASSTHROUGH_ENV] = value;
    return fn();
  } finally {
    if (prev === undefined) delete process.env[STYLER_PASSTHROUGH_ENV];
    else                    process.env[STYLER_PASSTHROUGH_ENV] = prev;
  }
}

/**
 * Async variant of `withStylerEnv`. The env-var is restored after the
 * returned promise settles (either resolved or rejected).
 */
export async function withStylerEnvAsync<T>(value: '1' | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env[STYLER_PASSTHROUGH_ENV];
  try {
    if (value === undefined) delete process.env[STYLER_PASSTHROUGH_ENV];
    else                     process.env[STYLER_PASSTHROUGH_ENV] = value;
    return await fn();
  } finally {
    if (prev === undefined) delete process.env[STYLER_PASSTHROUGH_ENV];
    else                    process.env[STYLER_PASSTHROUGH_ENV] = prev;
  }
}

/**
 * Capture render output twice — once with the styler bypass ON
 * (`NEXPATH_STYLER_PASSTHROUGH=1`) and once with it OFF. Returns both
 * results so callers can snapshot them independently or assert
 * structural invariants between them.
 *
 * Today, the pass-through styler body produces identical `styled`
 * and `unstyled` results — the divergence emerges once a non-trivial
 * styler body lands. Snapshot tests built on this helper continue to
 * work without modification across that transition.
 *
 * @param produce Pure function that, given the current env-var state,
 *                produces a snapshot-friendly value (string,
 *                string[], JSON-stringifiable, etc.). Called twice.
 */
export function captureStyledAndUnstyled<T>(produce: () => T): { styled: T; unstyled: T } {
  const unstyled = withStylerEnv('1',       produce);
  const styled   = withStylerEnv(undefined, produce);
  return { styled, unstyled };
}

/** Async variant of `captureStyledAndUnstyled`. */
export async function captureStyledAndUnstyledAsync<T>(
  produce: () => Promise<T>,
): Promise<{ styled: T; unstyled: T }> {
  const unstyled = await withStylerEnvAsync('1',       produce);
  const styled   = await withStylerEnvAsync(undefined, produce);
  return { styled, unstyled };
}
