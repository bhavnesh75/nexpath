import { describe, it, expect } from 'vitest';
import { FREQUENCY_LEVEL_CONFIGS, resolveFrequencyConfig } from './GlobalConfig.js';
import {
  STAGE2_LLM_MIN_CONFIDENCE,
  STAGE2_CONTEXT_WINDOW,
  STAGE2_S1_LOW_CONFIDENCE,
} from '../classifier/Stage2Trigger.js';
import { MIN_STAGE_CHANGE_CONFIDENCE } from '../classifier/SessionStateManager.js';

/**
 * Zero-behavior-change assertions: every_event GlobalConfig values must exactly
 * match the hardcoded constants that were in place before GlobalConfig was introduced.
 * These tests are the contract — if either the constant or the config value changes,
 * the migration is no longer backward-compatible and this file will catch it.
 */
describe('GlobalConfig — every_event backward compatibility', () => {
  const cfg = FREQUENCY_LEVEL_CONFIGS.every_event;

  it('minPromptsBeforeAdvisory matches previous hardcoded constant (3)', () => {
    expect(cfg.minPromptsBeforeAdvisory).toBe(3);
  });

  it('postAdvisoryCooldown matches previous hardcoded constant (5)', () => {
    expect(cfg.postAdvisoryCooldown).toBe(5);
  });

  it('sessionAdvisoryCapDefault matches previous hardcoded constant (5)', () => {
    expect(cfg.sessionAdvisoryCapDefault).toBe(5);
  });

  it('sessionAdvisoryCapVibe matches previous hardcoded constant (10)', () => {
    expect(cfg.sessionAdvisoryCapVibe).toBe(10);
  });

  it('stage2MinConfidence matches STAGE2_LLM_MIN_CONFIDENCE', () => {
    expect(cfg.stage2MinConfidence).toBe(STAGE2_LLM_MIN_CONFIDENCE);
  });

  it('stage2ContextWindow matches STAGE2_CONTEXT_WINDOW', () => {
    expect(cfg.stage2ContextWindow).toBe(STAGE2_CONTEXT_WINDOW);
  });

  it('stage2S1LowConfidence matches STAGE2_S1_LOW_CONFIDENCE', () => {
    expect(cfg.stage2S1LowConfidence).toBe(STAGE2_S1_LOW_CONFIDENCE);
  });

  it('signalAbsenceThresholdMultiplier is 1.0 (no multiplier effect)', () => {
    expect(cfg.signalAbsenceThresholdMultiplier).toBe(1.0);
  });

  it('minStageChangeConfidence matches MIN_STAGE_CHANGE_CONFIDENCE', () => {
    expect(cfg.minStageChangeConfidence).toBe(MIN_STAGE_CHANGE_CONFIDENCE);
  });
});

describe('GlobalConfig — resolveFrequencyConfig', () => {
  it('returns the correct config object for each level', () => {
    for (const level of ['off', 'major_only', 'once_per_session', 'every_event'] as const) {
      expect(resolveFrequencyConfig(level)).toBe(FREQUENCY_LEVEL_CONFIGS[level]);
    }
  });

  it('off level has minPromptsBeforeAdvisory of 999 (effectively disabled)', () => {
    expect(FREQUENCY_LEVEL_CONFIGS.off.minPromptsBeforeAdvisory).toBe(999);
  });

  it('off level has sessionAdvisoryCapDefault of 0', () => {
    expect(FREQUENCY_LEVEL_CONFIGS.off.sessionAdvisoryCapDefault).toBe(0);
  });

  it('once_per_session level has sessionAdvisoryCapDefault of 1', () => {
    expect(FREQUENCY_LEVEL_CONFIGS.once_per_session.sessionAdvisoryCapDefault).toBe(1);
  });

  it('major_only level has postAdvisoryCooldown of 10', () => {
    expect(FREQUENCY_LEVEL_CONFIGS.major_only.postAdvisoryCooldown).toBe(10);
  });
});
