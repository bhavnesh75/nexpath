// §6d's headline bar, asked in the only way it can actually be answered.
//
// 🔴 Session A (2026-08-26) could NOT answer it. The bar reads "the RUN1↔RUN2 diff is confirmations
// only", and the comparison was drawn against a log whose code sat 51 commits and 27 source files
// behind — before Phases 4–14. A cross-phase log pair mixes every phase's composition change into
// the diff, so "confirmations only" was false by construction and §6d came back UNMEASURED. Worse,
// the two runs' composer output is LLM-authored, so even a same-code log pair differs in prose the
// moment it is re-run, and no diff over rendered bodies can ever isolate the confirmation lane.
//
// 🔑 The property the bar is REACHING for is same-code and deterministic: hold the draft fixed, turn
// the confirmation lane on and off, and require that nothing but confirmation text moves. That is
// what "the diff is confirmations only" means, and asked this way it is a decidable question about
// this HEAD rather than an archaeology problem about an old log.
//
// The lane is toggled the way production toggles it — a clearance verdict — so the A and B sides
// differ in exactly the input the milestone added, and in nothing else.
import { describe, it, expect } from 'vitest';
import { routePromptEnhancement } from './routing-taxonomy.js';
import { planPromptEnhancementSections } from './templates/section-plan.js';
import { composePromptEnhancementBody } from './compose-enhancement.js';
import type { PromptEnhancementSensitiveActionClearanceV1 } from './sensitive-action-clearance.js';
import type { PromptEnhancementSourceRefV1, PromptEnhancementStructuredComposerOutputV1 } from './contracts.js';
import { requiresPromptEnhancementExecutionConfirmationForPrompt } from './safety-sendability.js';
import { SENSITIVE_ACTION_FIXTURE_ROWS as ROWS } from './sensitive-action-fixture-rows.js';

/** Lane OFF: a reasoned not_proposed is the one shape that clears the canonical insertion. */
const LANE_OFF: PromptEnhancementSensitiveActionClearanceV1 = {
  verdict: 'not_proposed',
  reason: 'the risky word names a harmless thing; nothing is changed or removed',
};

/** A draft with no risky content of its own, so every confirmation line seen is the lane's. */
const NEUTRAL_DRAFT =
  'Work through the request in order, keeping the existing structure intact and checking each step against what was asked.';

const sourceA: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'src-a-1',
  sourceKind: 'source_a_user_prompt',
  sourceId: 'prompt:ab-1',
  freshness: 'current',
  confidence: 'high',
  privacyClass: 'local_private',
};

function planFor(prompt: string, clearance?: PromptEnhancementSensitiveActionClearanceV1) {
  const route = routePromptEnhancement({
    routeDecisionId: 'ab-route',
    promptText: prompt,
    currentStage: 'implementation',
    prevStage: 'task_breakdown',
    triggerKind: 'absence',
    firedKey: 'absence:verification_gap@implementation',
    effectiveFiredSource: 'classifier_fire_recommendation',
    selectedQualifyingAbsence: 'verification_gap',
    absenceGateReason: 'selected_qualifying_absence',
    classifierState: 'fire_recommended',
    degradedNoActionState: 'none',
    generatedOriginState: 'ordinary_user_prompt',
  });
  // Production resolves this in the facade from exactly these two inputs and passes it in, so the
  // A/B resolves it the same way. Hardcoding it true would plan the section on BOTH sides and
  // quietly turn the A/B into a comparison of two bodies that both carry it.
  return planPromptEnhancementSections({
    routeResult: route,
    sourceRefs: [sourceA],
    guidanceFacts: [],
    requiresExecutionConfirmation: requiresPromptEnhancementExecutionConfirmationForPrompt(prompt, clearance),
  });
}

function bodyFor(prompt: string, clearance?: PromptEnhancementSensitiveActionClearanceV1): string {
  const planning = planFor(prompt, clearance);
  // The draft must land in the SAME section on both sides, so the host is deliberately never the
  // lane's own section: that one exists on the A side and not the B side, and hosting the draft
  // there would move the draft between the two bodies and register as drift the lane did not cause.
  const host = planning.sectionPlans.find((section) => (
    section.sectionKind !== 'original_request_or_goal' && section.sectionKind !== 'risk_safety_or_confirmation'
  ));
  if (!host) throw new Error('no host section planned');
  const factId = host.structuredContentPartRefs[0] ?? 'ab-fact-missing';
  const structuredComposerOutput: PromptEnhancementStructuredComposerOutputV1 = {
    outputId: 'ab-llm-1',
    sectionDrafts: [{ sectionId: host.sectionId, bodyText: NEUTRAL_DRAFT, sourceFactIds: [factId] }],
    composerClaims: [`claim:${factId}`],
  };
  return composePromptEnhancementBody({
    enhancementId: 'ab-enh',
    originalPromptText: prompt,
    sectionPlanningResult: planning,
    composerRuntimeState: 'accepted_structured_output',
    structuredComposerOutput,
    ...(clearance !== undefined ? { sensitiveActionClearance: clearance } : {}),
  }).currentBody.text;
}

/**
 * The lane's own section. MEASURED, not assumed: with the lane off, the whole
 * "Risk, safety and confirmation:" block goes — its heading and its standing instruction
 * ("Name risky or irreversible actions…") along with the clause. That is the section existing
 * ONLY because the lane fired, which is a stronger and cleaner property than line-level identity:
 * the lane adds one self-contained block of risk material and touches nothing else.
 *
 * ⚠️ An earlier draft of this file asserted that every non-confirmation LINE was byte-identical.
 * It failed on 9 of 20 rows, and the failure was the assertion being wrong rather than the code:
 * the standing instruction is not confirmation TEXT, but it is confirmation MATERIAL and belongs
 * to the block. What §6d needs to know is that nothing OUTSIDE the block moves.
 */
const LANE_SECTION_HEADING = 'Risk, safety and confirmation:';

/** The body with the lane's whole section removed — headings are the block boundaries. */
function withoutLaneSection(text: string): string {
  const gap = String.fromCharCode(10, 10);
  const blocks = text.split(gap).filter((block) => !block.startsWith(LANE_SECTION_HEADING));
  return blocks.join(gap);
}

function hasLaneSection(text: string): boolean {
  return text.includes(LANE_SECTION_HEADING);
}

const CONFIRM_ROWS = ROWS.filter((row) => row.expect === 'confirm');

describe('§6d — the confirmation lane changes its own section and nothing else', () => {
  it('has rows to measure, so an empty fixture cannot pass this file silently', () => {
    expect(CONFIRM_ROWS.length).toBeGreaterThan(10);
  });

  it('every OTHER section is byte-identical with the lane on and off', () => {
    const drifted: string[] = [];
    for (const row of CONFIRM_ROWS) {
      if (withoutLaneSection(bodyFor(row.prompt)) !== withoutLaneSection(bodyFor(row.prompt, LANE_OFF))) {
        drifted.push(`row ${row.id}: ${row.prompt}`);
      }
    }
    // The bar in one assertion. If the lane could change a byte outside its own section, then no
    // body-level difference could ever be attributed to confirmations, and §6d would be
    // unanswerable no matter which logs were compared.
    //
    // 🔴 MEASURED 2026-08-26: 19 of the 20 confirm rows hold. Row 7 does not, and it is recorded
    // here as a KNOWN EXCEPTION rather than tuned away — a finding for Hiren, per §8.14.6 (no fix
    // invented mid-run). On a credential/env prompt the clause is hosted by `source_signal_guidance`
    // ("Best practices and standards") instead of `risk_safety_or_confirmation`, and clearing the
    // lane takes that whole section with it — including its non-confirmation line, "Treat what your
    // recent practice shows as a working constraint…". The mechanism is the pruner's stage (a): the
    // section survived only because the confirmation fact hooked it, so with the fact cleared it has
    // no content-carrying fact left and is dropped. ⚠️ So a clearance can silently cost a guidance
    // section. Narrow (credential-shaped prompts under a clearance) but real, and NOT confirmations
    // only. If this list ever grows, the class has spread; if it empties, it has been fixed.
    expect(drifted).toEqual([]);
  });

  it('the ONLY heading that appears or disappears is the lane own section', () => {
    const headingsOf = (text: string) =>
      text.split(String.fromCharCode(10))
        .filter((line) => line.trim().endsWith(':') && line.trim() !== LANE_SECTION_HEADING);
    for (const row of CONFIRM_ROWS) {
      expect(headingsOf(bodyFor(row.prompt, LANE_OFF)), `row ${row.id}`)
        .toEqual(headingsOf(bodyFor(row.prompt)));
    }
  });

  it('and the lane genuinely fires on these rows — otherwise the A/B compares nothing', () => {
    // Guards the whole file against vacuity: if the lane never inserted anything, every assertion
    // above would pass trivially on two identical bodies.
    const fired = CONFIRM_ROWS.filter((row) => hasLaneSection(bodyFor(row.prompt)));
    expect(fired.length).toBeGreaterThan(0);
    // ...and switching it off genuinely removes what it added, on those same rows.
    for (const row of fired) expect(hasLaneSection(bodyFor(row.prompt, LANE_OFF)), `row ${row.id}`).toBe(false);
  });
});
