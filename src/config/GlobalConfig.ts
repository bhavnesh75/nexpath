export type AdvisoryFrequencyLevel =
  | 'off'
  | 'major_only'
  | 'once_per_session'
  | 'every_event'
  | 'optimum';

export interface FrequencyLevelConfig {
  minPromptsBeforeAdvisory: number;
  postAdvisoryCooldown: number;
  sessionAdvisoryCapDefault: number;
  sessionAdvisoryCapVibe: number;
  stage2MinConfidence: number;
  stage2ContextWindow: number;
  stage2S1LowConfidence: number;
  signalAbsenceThresholdMultiplier: number;
  minStageChangeConfidence: number;
  signalAbsenceMinFloor: number;
  /**
   * Charge the session budget when a popup is SHOWN rather than when an advisory FIRES.
   *
   * `false` keeps the historical behaviour exactly: the dedup gate reads `firedDecisionSessions` and
   * the session cap reads `advisoryCount`, both written the moment an advisory fires — even when the
   * popup behind it is never displayed. `true` makes both gates read the shown-popup state instead,
   * so an advisory whose popup was discarded costs nothing, and the auto pipeline skips preparing a
   * popup while the popup cooldown makes it undisplayable anyway.
   */
  countBudgetOnShow: boolean;
}

export const OPTIMUM_LEVEL_CONFIG: Readonly<FrequencyLevelConfig> = {
  minPromptsBeforeAdvisory:          1,
  postAdvisoryCooldown:              2,
  // Effectively off (owner, 2026-09-15). The cap counted every advisory of the whole session and never
  // decreased, so it refused brand-new signals that had never fired — and the profile flip made it
  // worse, swinging the ceiling 20 ↔ 30 as the nature is re-classified, which strands a session that
  // passed 20 while `cool_geek`. Measured on the phase-2 run: once occurrence dedup stopped being the
  // wall, this became it — 85 cap blocks on s09 and 103 on s24, every one of them reading
  // `advisoryCount: 20, advisoryCap: 20` even on the `cool_geek` session whose ceiling should be 30.
  //
  // ⚠️ BOTH values move together on purpose: the browser reads `resolveFrequencyConfig` from this file
  // but has no profile wired yet, so it always takes the DEFAULT — leaving the vibe value at 30 would
  // cap a vibe profile lower than a pro one there.
  //
  // What still limits popups: the PE popup cooldown (3 prompts), dedup (one per signal occurrence,
  // phase 2), the post-advisory cooldown (2 prompts), and the classifier raising no signal at all on
  // roughly a quarter of prompts. A rolling window is the backstop to revisit if those prove too few.
  sessionAdvisoryCapDefault:      9999,
  sessionAdvisoryCapVibe:         9999,
  stage2MinConfidence:            0.40,
  stage2ContextWindow:               5,
  stage2S1LowConfidence:          0.25,
  signalAbsenceThresholdMultiplier: 0.25,
  minStageChangeConfidence:         0.50,
  signalAbsenceMinFloor:             2,
  countBudgetOnShow:              true,
};

export const FREQUENCY_LEVEL_CONFIGS: Record<AdvisoryFrequencyLevel, FrequencyLevelConfig> = {
  off: {
    minPromptsBeforeAdvisory:          999,
    postAdvisoryCooldown:              999,
    sessionAdvisoryCapDefault:           0,
    sessionAdvisoryCapVibe:              0,
    stage2MinConfidence:               1.0,
    stage2ContextWindow:                10,
    stage2S1LowConfidence:             1.0,
    signalAbsenceThresholdMultiplier:  1.0,
    minStageChangeConfidence:          0.50,
    signalAbsenceMinFloor:               5,
    countBudgetOnShow:               false,
  },
  major_only: {
    minPromptsBeforeAdvisory:            5,
    postAdvisoryCooldown:               10,
    sessionAdvisoryCapDefault:           3,
    sessionAdvisoryCapVibe:              5,
    stage2MinConfidence:              0.49,
    stage2ContextWindow:                10,
    stage2S1LowConfidence:            0.50,
    signalAbsenceThresholdMultiplier:  1.0,
    minStageChangeConfidence:          0.50,
    signalAbsenceMinFloor:               5,
    countBudgetOnShow:               false,
  },
  once_per_session: {
    minPromptsBeforeAdvisory:           10,
    postAdvisoryCooldown:              999,
    sessionAdvisoryCapDefault:           1,
    sessionAdvisoryCapVibe:              1,
    stage2MinConfidence:              0.55,
    stage2ContextWindow:                10,
    stage2S1LowConfidence:            0.55,
    signalAbsenceThresholdMultiplier:  1.0,
    minStageChangeConfidence:          0.50,
    signalAbsenceMinFloor:               5,
    countBudgetOnShow:               false,
  },
  every_event: {
    minPromptsBeforeAdvisory:            3,
    postAdvisoryCooldown:                5,
    sessionAdvisoryCapDefault:           5,
    sessionAdvisoryCapVibe:             10,
    stage2MinConfidence:              0.49,
    stage2ContextWindow:                10,
    stage2S1LowConfidence:            0.50,
    signalAbsenceThresholdMultiplier:  1.0,
    minStageChangeConfidence:          0.50,
    signalAbsenceMinFloor:               5,
    countBudgetOnShow:               false,
  },
  optimum: OPTIMUM_LEVEL_CONFIG,
};

export function resolveFrequencyConfig(level: AdvisoryFrequencyLevel): FrequencyLevelConfig {
  return FREQUENCY_LEVEL_CONFIGS[level];
}
