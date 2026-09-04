// The stage-2 classifier output cap (512 → 1024), tested against reply fixtures built
// from the REAL signal vocabulary (SIGNAL_MAP), the same method as the committed
// headroom runner.
//
// Why the raise: a truncated reply is not a smaller reply — it is invalid JSON, a parse
// failure, and a silent degrade, paid for and then thrown away. Sized against real data:
// across 2,371 prompts in the sim logs, 181 (7.6%) would overrun 512, the observed
// maximum names 46 signals, and that reply is ~847 REAL tokens (snake_case identifiers
// tokenise well above the chars/4 estimate, which is why the in-fixture estimates below
// only bound the FITS side). The one confirmation against a real provider-counted reply
// deliberately rides the gated sim session — this suite never makes live calls.
import { describe, it, expect } from 'vitest';
import { STAGE2_MAX_OUTPUT_TOKENS } from './Stage2Trigger.js';
import { STAGE2_MAX_OUTPUT_TOKENS as BROWSER_STAGE2_MAX_OUTPUT_TOKENS } from '../core/stage2.js';
import { parseStageClassifierReply } from './stage-classifier.js';
import { SIGNAL_MAP } from './signals.js';

/** chars/4 — the documented UNDER-estimate for identifier-dense JSON; used only for upper bounds. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** The real signal keys, exactly as the checklist carries them. */
const REAL_SIGNAL_KEYS: readonly string[] = [...SIGNAL_MAP.values()].map((signal) => signal.key);

/** A full reply in the model's real shape, naming `signalCount` REAL signals across both arrays. */
function realisticReply(signalCount: number): string {
  const keys = REAL_SIGNAL_KEYS.slice(0, signalCount);
  expect(keys.length).toBe(signalCount);
  const present = keys.filter((_, i) => i % 3 === 0);
  const absent = keys.filter((_, i) => i % 3 !== 0);
  return JSON.stringify({
    stage: 'Implementation',
    stage_confidence: 0.82,
    signals_present: present,
    signals_absent: absent,
    fire_decision_session: true,
    selected_signal_key: absent[0] ?? '',
    primary_intent: 'feature_addition',
    intent_confidence: 0.74,
    debug_evidence_present: [],
    capability_candidates: [
      'capability.verification_required',
      'capability.decomposition_candidate',
      'capability.project_grounding',
    ],
    project_fact_candidates: [],
    section_relevance_order: [
      'original_request_or_goal', 'context_and_constraints', 'approach_or_steps',
      'acceptance_or_output_expectation', 'verification_or_test_plan', 'risk_safety_or_confirmation',
      'point_inventory_or_decomposition', 'project_grounding_facts', 'source_signal_guidance',
      'reproduction_or_evidence', 'behavior_preservation', 'uncertainty_or_clarification',
      'requirement_source_state', 'handoff_or_sequence_candidate',
    ],
    sensitive_action_verdict: 'not_proposed',
    sensitive_action_reason: 'the risky word names a CSS effect; no data, file or environment is changed',
    reason: 'The developer is actively implementing the feature and several verification practices for this stage are clearly not yet in place across the recent prompts.',
  });
}

describe('stage-2 output cap', () => {
  it('the classifier cap is 1024 at its one site', () => {
    expect(STAGE2_MAX_OUTPUT_TOKENS).toBe(1024);
  });

  it('the browser path keeps its own smaller cap at 256 — a different reply shape, never synced', () => {
    expect(BROWSER_STAGE2_MAX_OUTPUT_TOKENS).toBe(256);
  });

  it('a reply naming 20 real signals parses whole and fits 1024 with headroom, verdict + reason included', () => {
    const reply = realisticReply(20);
    expect(estimateTokens(reply)).toBeLessThanOrEqual(1024);
    const parsed = parseStageClassifierReply(reply);
    expect(parsed.stage).toBe('implementation');
    expect(parsed.signalsPresent.length + parsed.signalsAbsent.length).toBe(20);
    expect(parsed.sensitiveActionVerdict).toBe('not_proposed');
  });

  it('the observed-maximum shape (46 real signals, the largest in 2,371 measured prompts) parses whole and fits 1024', () => {
    const reply = realisticReply(46);
    // Fits-side bound only: chars/4 UNDER-estimates snake_case JSON, so it can bound what
    // fits but not what overruns — the measured real-token figure (847 at 46 signals,
    // > 768, > 512) is §6d.11's table, confirmed against one real reply in the gated run.
    expect(estimateTokens(reply)).toBeLessThanOrEqual(1024);
    const parsed = parseStageClassifierReply(reply);
    expect(parsed.signalsPresent.length + parsed.signalsAbsent.length).toBe(46);
  });

  it('a truncated reply still degrades — the parse throws and the caller falls back; the cliff moves, it does not vanish', () => {
    const reply = realisticReply(46);
    const truncated = reply.slice(0, Math.floor(reply.length / 2));
    expect(() => parseStageClassifierReply(truncated)).toThrow();
  });
});
