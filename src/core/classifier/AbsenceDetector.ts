import type { SessionState, AbsenceFlag, UserProfile } from './types.js';
import { SIGNAL_MAP } from './signals.js';
import { STAGE_CONFIRM_THRESHOLD } from '../session-state.js';
import { MISTAKE_CATEGORIES, type RuntimeContext } from '../../classifier/mistake-categories.js';

// The 6 new §4.E2 absence signals fire on their mistake-category detect() reading the live
// RuntimeContext (behavioural streaks + the AR-10 probe) — NOT the generic keyword-absence gate.
// Their SignalDefinition.key equals the mistake-category name; look the category up to call detect().
const REGISTRY_DETECTED_KEYS = [
  'secret_in_prompt', 'no_version_control', 'no_backup_safety',
  'no_separate_envs', 'no_automated_security_scanning', 'frustration_spiral',
  'coding_agent_mode_mismatch', 'agent_mode_too_restricted',
] as const;
const REGISTRY_DETECTED_BY_KEY = new Map(
  MISTAKE_CATEGORIES
    .filter((c) => (REGISTRY_DETECTED_KEYS as readonly string[]).includes(c.name))
    .map((c) => [c.name, c] as const),
);

// ── Phase 7 F1 custom detection constants ─────────────────────────────────────

const WORK_RHYTHM_VELOCITY_THRESHOLD_MS = 30_000;
const WORK_RHYTHM_WINDOW = 10;

const FOCUS_DRIFT_DOMAIN_THRESHOLD = 5;
const FOCUS_DRIFT_WINDOW = 20;

const FOCUS_DOMAINS: Record<string, string[]> = {
  auth:         ['login', 'password', 'token', 'authentication', 'jwt', 'oauth', 'session', 'permission'],
  database:     ['database', 'query', 'migration', 'schema', 'table', 'sql', 'orm', 'mongodb', 'postgres'],
  ui:           ['component', 'frontend', 'css', 'style', 'button', 'modal', 'layout', 'render', 'react', 'vue'],
  api:          ['endpoint', 'route', 'request', 'response', 'rest', 'graphql', 'fetch', 'axios', 'webhook'],
  testing:      ['test', 'spec', 'assert', 'mock', 'fixture', 'coverage', 'jest', 'vitest', 'cypress'],
  deployment:   ['deploy', 'docker', 'ci', 'pipeline', 'build', 'release', 'kubernetes', 'staging'],
  performance:  ['cache', 'optimize', 'latency', 'memory', 'profiling', 'benchmark', 'slow'],
  architecture: ['refactor', 'design', 'pattern', 'architecture', 'module', 'abstraction', 'structure'],
};

const FOCUS_COMPLETION_KEYWORDS = ['done', 'finished', 'merged', 'shipped', 'closed'];

function detectWorkRhythmFlag(state: SessionState): boolean {
  const history = state.promptHistory;
  if (history.length < WORK_RHYTHM_WINDOW) return false;
  const recent = history.slice(-WORK_RHYTHM_WINDOW);
  let totalInterval = 0;
  for (let i = 1; i < recent.length; i++) {
    totalInterval += (recent[i]!.capturedAt - recent[i - 1]!.capturedAt);
  }
  const avgInterval = totalInterval / (recent.length - 1);
  return avgInterval < WORK_RHYTHM_VELOCITY_THRESHOLD_MS;
}

function detectFocusDriftFlag(state: SessionState): boolean {
  const history = state.promptHistory;
  const window = history.slice(-FOCUS_DRIFT_WINDOW);
  const windowText = window.map((r) => r.text.toLowerCase()).join(' ');
  const hasCompletion = FOCUS_COMPLETION_KEYWORDS.some((kw) => windowText.includes(kw));
  if (hasCompletion) return false;
  const activeDomains = Object.values(FOCUS_DOMAINS).filter(
    (keywords) => keywords.some((kw) => windowText.includes(kw)),
  );
  return activeDomains.length >= FOCUS_DRIFT_DOMAIN_THRESHOLD;
}

export const ABSENCE_MIN_PROMPTS = 15;
export const ABSENCE_COOLDOWN_PROMPTS = 30;

export function detectAbsenceFlags(
  state:               SessionState,
  profile?:            UserProfile | null,
  projectType?:        string,
  thresholdMultiplier = 1.0,
  absenceMinFloor     = 5,
  runtimeContext:      RuntimeContext = {},
): AbsenceFlag[] {
  const { currentStage, stageConfidence, promptsInCurrentStage, promptCount } = state;

  if (stageConfidence < STAGE_CONFIRM_THRESHOLD) return [];

  const isVibeProfile    = profile?.nature === 'beginner' || profile?.nature === 'cool_geek';
  const profileMultiplier = isVibeProfile ? 0.5 : 1.0;

  // Gate 2 — the in-stage accumulation floor is enforced PER-SIGNAL at gate 3 (below), not as a
  // blanket early return: immediate-fire signals skip the floor, so the detector must still be
  // entered before the stage has accumulated `absenceMinFloor` prompts. Non-immediate signals stay
  // gated — gate 3's effectiveThreshold is always >= absenceMinFloor, so nothing the old early
  // return blocked can slip through.

  const newFlags: AbsenceFlag[] = [];

  for (const sig of SIGNAL_MAP.values()) {
    if (!sig.expectedStages.includes(currentStage)) continue;

    if (sig.relevantProjectTypes && projectType && projectType !== 'other'
        && !sig.relevantProjectTypes.includes(projectType)) continue;

    if (sig.nature && sig.nature !== profile?.nature) continue;

    if (sig.role && sig.role !== profile?.role) continue;

    // Gate 3 — per-signal threshold with profile multiplier and global frequency multiplier.
    // Immediate-fire signals skip this in-stage accumulation floor: they fire on first confident
    // detection (their own detector is confidence-gated), still bounded by the cooldown below +
    // the once-per-session dedup downstream.
    if (!sig.immediateFire) {
      const effectiveThreshold = Math.max(absenceMinFloor, Math.ceil(sig.absenceThreshold * profileMultiplier * thresholdMultiplier));
      if (promptsInCurrentStage < effectiveThreshold) continue;
    }

    if (sig.key === 'decision_fatigue_pattern') {
      const streak = state.consecutiveAcceptanceStreak ?? 0;
      if (streak < sig.absenceThreshold) continue;
    } else if (sig.key === 'work_rhythm_check') {
      if (!detectWorkRhythmFlag(state)) continue;
    } else if (sig.key === 'focus_drift_detection') {
      if (!detectFocusDriftFlag(state)) continue;
    } else if (sig.key === 'problem_correction') {
      const hasProblemContext = state.promptHistory.some((p) =>
        /\b(bug|error|broken|crash|fail(ed|ing)?|issue|problem|not working|doesn't work|TypeError|undefined|exception)\b/i.test(p.text)
      );
      if (!hasProblemContext) continue;
      const counter = state.signalCounters[sig.key];
      if (!counter || counter.lastSeenAt !== null) continue;
    } else if (sig.key === 'deployment_planning') {
      const MIN_REVIEW_TESTING_PROMPTS = 5;
      if (currentStage !== 'release' &&
          !(currentStage === 'review_testing' &&
            promptsInCurrentStage >= MIN_REVIEW_TESTING_PROMPTS)) continue;
      const counter = state.signalCounters[sig.key];
      if (!counter || counter.lastSeenAt !== null) continue;
    } else if (sig.key === 'context_loss') {
      const MIN_CONTEXT_LOSS_PROMPTS = 25;
      if (promptCount < MIN_CONTEXT_LOSS_PROMPTS) continue;
      const counter = state.signalCounters[sig.key];
      if (!counter || counter.lastSeenAt !== null) continue;
    } else if (REGISTRY_DETECTED_BY_KEY.has(sig.key)) {
      // §4.E2 registry-detected signal — fire ONLY on its real condition (the mistake-category
      // detect() reading the live RuntimeContext), never on the generic keyword-absence path.
      if (REGISTRY_DETECTED_BY_KEY.get(sig.key)!.detect(state.promptHistory, runtimeContext) < 1) continue;
    } else {
      const counter = state.signalCounters[sig.key];
      if (!counter || counter.lastSeenAt !== null) continue;
    }

    // Do not re-raise while ANY window for this signal is still open.
    //
    // This read `.find()` — the FIRST flag for the signal — while `addAbsenceFlag` appends, so once
    // the oldest flag's window had passed the cooldown never gated again and a still-missing signal
    // was re-raised on every prompt. `ABSENCE_COOLDOWN_PROMPTS` held for exactly one window and then
    // stopped meaning anything. Recorded as B-11; measured across twelve sim sessions, 2 565 raises
    // were written where 1 669 windows existed — 35 % of them artifacts, and one 171-prompt session
    // accumulated 618 flags (60 KB, re-serialised on every prompt).
    //
    // `.some()` rather than "the newest flag" on purpose: it does not depend on array order, which
    // nothing guarantees, and it states the rule the cooldown was always meant to express.
    if (state.absenceFlags.some((f) => f.signalKey === sig.key && promptCount < f.cooldownUntil)) continue;

    newFlags.push({
      signalKey:     sig.key,
      stage:         currentStage,
      raisedAtIndex: promptCount,
      cooldownUntil: promptCount + ABSENCE_COOLDOWN_PROMPTS,
    });
  }

  return newFlags;
}
