import { describe, expect, it } from 'vitest';
import {
  promptHistorySensitiveActionSignalsV1,
  PROMPT_HISTORY_SIGNAL_WINDOW_V1,
} from './prompt-history-signals.js';

/**
 * The recent-history sensitive-action lane.
 *
 * ⚠️ Every case here is built from the PROPERTY the lane promises, not from the trigger list: the
 * categories are curated content that will grow, so a fixture asserting the exact eight would fail
 * on every legitimate addition while proving nothing about the behaviour.
 */
describe('prompt-history sensitive-action signals', () => {
  it('reports the category for a sensitive action mentioned in recent prompts', () => {
    const signals = promptHistorySensitiveActionSignalsV1([
      'can you add a loading spinner to the header',
      'we need to deploy this to production tonight',
    ]);
    expect(signals.map((signal) => signal.category)).toContain('deployment');
  });

  it('NEVER returns the literal words from the prompt', () => {
    // 🔒 The owner reversed an include-the-literal-trigger-word preference once already, on leakage
    // grounds. The detector still produces that text; this lane must drop it, so the assertion is on
    // the SHAPE of what is returned rather than on any one phrase.
    const signals = promptHistorySensitiveActionSignalsV1([
      'go ahead and rm -rf the build directory, my secret token is in there',
    ]);
    expect(signals.length).toBeGreaterThan(0);
    for (const signal of signals) {
      expect(Object.keys(signal).sort()).toEqual(['category', 'promptCount']);
      expect(JSON.stringify(signal)).not.toContain('rm -rf');
      expect(JSON.stringify(signal)).not.toContain('token');
    }
  });

  it('counts DISTINCT PROMPTS, so one emphatic prompt is not a pattern', () => {
    // An emphatic developer saying the same thing three times in one message is one prompt that
    // mentioned it. Counting matches would make that look like persistent behaviour.
    const once = promptHistorySensitiveActionSignalsV1([
      'deploy it, then deploy the worker too, and deploy the docs',
    ]);
    expect(once.find((signal) => signal.category === 'deployment')?.promptCount).toBe(1);

    const twice = promptHistorySensitiveActionSignalsV1([
      'deploy it',
      'deploy the worker too',
    ]);
    expect(twice.find((signal) => signal.category === 'deployment')?.promptCount).toBe(2);
  });

  it('reads only the recent window, so an old mention stops counting', () => {
    const stale = [
      'deploy this to production',
      ...Array.from({ length: PROMPT_HISTORY_SIGNAL_WINDOW_V1 }, (_unused, index) => `unrelated prompt ${index}`),
    ];
    expect(promptHistorySensitiveActionSignalsV1(stale)).toEqual([]);
  });

  it('an ordinary history produces nothing — the lane is silent by default', () => {
    expect(promptHistorySensitiveActionSignalsV1([
      'add a loading spinner to the header',
      'the button is misaligned on mobile',
    ])).toEqual([]);
  });

  it('blank prompts and an empty history are handled without inventing a signal', () => {
    expect(promptHistorySensitiveActionSignalsV1([])).toEqual([]);
    expect(promptHistorySensitiveActionSignalsV1(['   ', ''])).toEqual([]);
  });

  it('is stable: the same history always yields the same order', () => {
    const history = ['deploy to prod', 'deploy again', 'npm install left-pad'];
    expect(promptHistorySensitiveActionSignalsV1(history))
      .toEqual(promptHistorySensitiveActionSignalsV1([...history]));
    // Most-repeated first is the contract the renderer relies on.
    const counts = promptHistorySensitiveActionSignalsV1(history).map((signal) => signal.promptCount);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });
});
