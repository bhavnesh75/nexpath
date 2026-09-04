// Layer 2 — declare, then judge.
//
// The case no vocabulary can see: the developer says "i connected github with a token for
// deploys", and the body says "use the deploy token for login". Every noun is hers; only the ROLE
// moved. The curated name list passes it by construction (measured), so the composer is asked to
// STATE what each noun was for in the request and in its own text, and a deterministic rule
// decides. The model is never asked whether it did wrong — that question is the one it has an
// interest in answering falsely.
import { describe, it, expect } from 'vitest';
import { routePromptEnhancement } from './routing-taxonomy.js';
import { planPromptEnhancementSections } from './templates/section-plan.js';
import { composePromptEnhancementBody } from './compose-enhancement.js';
import { validatePromptEnhancementSafety } from './safety-sendability.js';
import {
  findPromptEnhancementNounPurposeFindingsV1,
  isPromptEnhancementNounPurposeV1,
} from './noun-purpose-transposition.js';
import { composeStructuredComposerOutputV1, type PromptEnhancementComposerClientV1 } from './llm-composer.js';
import type { PromptEnhancementSourceRefV1 } from './contracts.js';

// The flagship prompt: names a known tool AND carries a credential-shaped token, so Layer 0's
// predicate opens the gate.
const DEPLOY_PROMPT = 'add login so nobody else can see my dashboard, i connected github with token ghp_abc123def456ghi789 for deploys';
const NO_TOOL_PROMPT = 'center the hero text and make the font slightly larger';

const sourceA: PromptEnhancementSourceRefV1 = {
  sourceRefId: 'src-a-1',
  sourceKind: 'source_a_user_prompt',
  sourceId: 'prompt:noun-1',
  freshness: 'current',
  confidence: 'high',
  privacyClass: 'local_private',
};

const judge = (nounPurposes: unknown, originalPromptText = DEPLOY_PROMPT) =>
  findPromptEnhancementNounPurposeFindingsV1({ nounPurposes, originalPromptText });

describe('half A — a stated purpose that the body changed', () => {
  it('"token for deploys" used for login is a finding', () => {
    const findings = judge([{ noun: 'token', purposeInPrompt: 'for deploys', purposeInBody: 'for login' }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe('purpose_changed');
    expect(findings[0]!.noun).toBe('token');
  });
});

describe('half B — a purpose the body assigned with no source', () => {
  it('a noun the developer never gave a job to, given one by the body, is a finding', () => {
    const findings = judge([{ noun: 'github', purposeInPrompt: null, purposeInBody: 'for storing user sessions' }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe('purpose_assigned_without_source');
  });

  it('a purpose the PROJECT FACTS supply is sourced — not a finding', () => {
    // Half B asks whether a purpose has a source, and a source fact is a source. Without this
    // allowance a correctly-grounded body would block, which is exactly what this layer must
    // never do — the same allowed-texts discipline every other layer here applies.
    expect(findPromptEnhancementNounPurposeFindingsV1({
      nounPurposes: [{ noun: 'github token', purposeInPrompt: null, purposeInBody: 'for deploys' }],
      originalPromptText: 'add login so nobody else can see my dashboard, i connected github with token ghp_abc123def456ghi789',
      groundedTexts: ['the github token is used for deploys'],
    })).toEqual([]);
  });

  it('the same purpose with NO source is still a finding', () => {
    // Sourced by neither the request (which never mentions deploys) nor a project fact.
    expect(findPromptEnhancementNounPurposeFindingsV1({
      nounPurposes: [{ noun: 'github token', purposeInPrompt: null, purposeInBody: 'for deploys' }],
      originalPromptText: 'add login so nobody else can see my dashboard, i connected github with token ghp_abc123def456ghi789',
      groundedTexts: [],
    })).toHaveLength(1);
  });

  it('the halves are disjoint — nothing is reported twice', () => {
    const findings = judge([
      { noun: 'token', purposeInPrompt: 'for deploys', purposeInBody: 'for login' },
      { noun: 'github', purposeInPrompt: null, purposeInBody: 'for sessions' },
    ]);
    expect(findings.map((finding) => finding.kind)).toEqual(['purpose_changed', 'purpose_assigned_without_source']);
    expect(new Set(findings.map((finding) => finding.noun)).size).toBe(2);
  });
});

describe('THE SILENT CASE — a tool used for the job it was given', () => {
  // The most important test here: a developer who names a tool for a purpose usually WANTS it used
  // for that purpose. A layer that flags this has traded away the thing it was built to protect.
  it('"token for deploys" used for deploys is NOT a finding', () => {
    expect(judge([{ noun: 'token', purposeInPrompt: 'for deploys', purposeInBody: 'for deploys' }])).toEqual([]);
  });

  it('the same purpose worded differently is still the same purpose', () => {
    expect(judge([{ noun: 'token', purposeInPrompt: 'for deploys', purposeInBody: 'to run the deploys' }])).toEqual([]);
    expect(judge([{ noun: 'github', purposeInPrompt: 'connected github', purposeInBody: 'the connected github account' }])).toEqual([]);
  });
});

describe('the K-rows survive — the acceptance bar, as declarations a truthful model would make', () => {
  // The layer blocks whole popups, so a body it wrongly flags costs the developer everything.
  // These are the owner-ruled welcome rows expressed as the declaration the composer would emit
  // for them: every one must stay silent, however differently the body words the same job.
  const welcomeRows: readonly [string, string, { noun: string; purposeInPrompt: string | null; purposeInBody: string }][] = [
    ['K1 — the tool he asked for, used for that',
      'Create a React app with a home page that shows study groups as cards',
      { noun: 'React', purposeInPrompt: 'create a React app', purposeInBody: 'building the app' }],
    ['K2 — the browser she named, checked as she described',
      "she said when she types a long message it cuts off, she's on chrome same as me",
      { noun: 'chrome', purposeInPrompt: 'she is on chrome', purposeInBody: 'check the chrome settings' }],
    ['K4 — the move she asked about, in the body own words',
      'i hardcoded my key sk-live-abc123 in the app, should i move it to env',
      { noun: 'key', purposeInPrompt: 'move it to env', purposeInBody: 'moving the key to an environment variable' }],
    ['the same job, paraphrased',
      'i connected github with token ghp_abc123 for deploys',
      { noun: 'token', purposeInPrompt: 'for deploys', purposeInBody: 'to run the deploys' }],
    ['a noun merely named again, not given a job',
      'add login so nobody else can see my dashboard, i connected github with token ghp_abc123',
      { noun: 'github', purposeInPrompt: null, purposeInBody: 'the connected github account' }],
  ];

  it.each(welcomeRows)('%s stays silent', (_label, prompt, nounPurpose) => {
    expect(findPromptEnhancementNounPurposeFindingsV1({
      nounPurposes: [nounPurpose],
      originalPromptText: prompt,
      groundedTexts: [],
    })).toEqual([]);
  });

  it('and the transposition still fires beside them — the layer is not simply silent', () => {
    expect(findPromptEnhancementNounPurposeFindingsV1({
      nounPurposes: [{ noun: 'token', purposeInPrompt: 'for deploys', purposeInBody: 'for login' }],
      originalPromptText: 'i connected github with token ghp_abc123 for deploys, add a dashboard',
      groundedTexts: [],
    })).toHaveLength(1);
  });
});

describe('the layer still CATCHES — silence on paraphrase did not hollow it out', () => {
  // The K-row protection loosened the comparison deliberately; this is the other side of that
  // trade. Four distinct shapes of "the job moved" must still be caught, or the layer is
  // decorative — and the two same-job forms beside them must stay silent.
  const TRANSPOSITION_PROMPT = 'i connected github with token ghp_abc123 for deploys, and set up stripe for payments';
  const rows: readonly [string, string, string, boolean][] = [
    ['a credential moved to authentication', 'for deploys', 'for login', true],
    ['a credential moved to sending mail', 'for deploys', 'to send the welcome emails', true],
    ['a payment service moved to analytics', 'for payments', 'for tracking user analytics', true],
    ['a credential moved to schema work', 'for deploys', 'to run database migrations', true],
    ['the same job, restated', 'for deploys', 'for deploys', false],
    ['the same job, in the body own words', 'for deploys', 'deploying the app', false],
  ];

  it.each(rows)('%s', (_label, purposeInPrompt, purposeInBody, fires) => {
    const findings = findPromptEnhancementNounPurposeFindingsV1({
      nounPurposes: [{ noun: 'token', purposeInPrompt, purposeInBody }],
      originalPromptText: TRANSPOSITION_PROMPT,
      groundedTexts: [],
    });
    expect(findings.length > 0).toBe(fires);
  });
});

describe('absent means today, measured on real bodies rather than fixtures', () => {
  it('across every preset, an absent or empty declaration changes no outcome', async () => {
    // Stability rule 3 is the promise that this layer is invisible until it has something to say.
    // Fixtures can satisfy it by construction; real composed bodies are the honest test.
    const { PROMPT_ENHANCEMENT_TAXONOMY_PRESETS } = await import('./routing-taxonomy.js');
    const prompts = [
      'center the hero text',
      'i connected github with token ghp_abc123 for deploys, add a dashboard',
      'delete the old migrations folder',
      'review my auth module',
      'upgrade every dependency',
    ];
    let compared = 0;
    for (const preset of PROMPT_ENHANCEMENT_TAXONOMY_PRESETS) {
      for (const prompt of prompts) {
        const route = routePromptEnhancement({
          routeDecisionId: 'stability-route',
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
          classifierPrimaryIntent: preset.primaryIntent,
          classifierIntentConfidence: 0.9,
        } as never);
        const planning = planPromptEnhancementSections({ routeResult: route, sourceRefs: [sourceA], guidanceFacts: [] });
        const body = composePromptEnhancementBody({
          enhancementId: 'stability-enh',
          originalPromptText: prompt,
          sectionPlanningResult: planning,
        }).currentBody;
        const base = validatePromptEnhancementSafety({ currentBody: body });
        const empty = validatePromptEnhancementSafety({ currentBody: body, nounPurposes: [] });
        const absent = validatePromptEnhancementSafety({ currentBody: body, nounPurposes: undefined });
        compared += 1;
        expect(empty.sendPolicy, `${preset.primaryIntent} | ${prompt}`).toBe(base.sendPolicy);
        expect(absent.sendPolicy, `${preset.primaryIntent} | ${prompt}`).toBe(base.sendPolicy);
        expect(empty.failures.map((f) => f.failureCode)).toEqual(base.failures.map((f) => f.failureCode));
      }
    }
    expect(compared).toBeGreaterThan(150);
  });
});

describe('the invention guard — a purpose the prompt never stated is treated as null', () => {
  it('a supplied purpose with no support in the prompt falls to half B, never a manufactured mismatch', () => {
    // Without this the model can infer "for authentication", and half A would then report a
    // mismatch the developer never created — the failure mode that makes this layer worthless.
    const findings = judge(
      [{ noun: 'token', purposeInPrompt: 'for authentication', purposeInBody: 'for login' }],
      'i connected github with token ghp_abc123def456ghi789',
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.kind).toBe('purpose_assigned_without_source');
    expect(findings[0]!.purposeInPrompt).toBeNull();
  });

  it('a purpose the developer DID state is kept', () => {
    const findings = judge([{ noun: 'token', purposeInPrompt: 'for deploys', purposeInBody: 'for login' }]);
    expect(findings[0]!.purposeInPrompt).toBe('for deploys');
  });
});

describe('stability — four ways for the declaration to be unusable, and today survives all four', () => {
  it.each([
    ['absent', undefined],
    ['malformed (not an array)', { noun: 'token' }],
    ['unexpected types inside', [{ noun: 42, purposeInPrompt: [], purposeInBody: null }]],
    ['present but empty', []],
  ])('%s => no findings', (_label, value) => {
    expect(judge(value)).toEqual([]);
  });

  it('a malformed entry beside a valid one costs only itself', () => {
    const findings = judge([
      { noun: '', purposeInPrompt: 'x', purposeInBody: 'y' },
      { noun: 'token', purposeInPrompt: 'for deploys', purposeInBody: 'for login' },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.noun).toBe('token');
  });

  it('the shape guard accepts the contract shape and rejects everything else', () => {
    expect(isPromptEnhancementNounPurposeV1({ noun: 'token', purposeInPrompt: null, purposeInBody: 'for login' })).toBe(true);
    expect(isPromptEnhancementNounPurposeV1({ noun: 'token', purposeInBody: '' })).toBe(false);
    expect(isPromptEnhancementNounPurposeV1(null)).toBe(false);
  });
});

// ── The composer prompt gate, and the pipeline behaviour ─────────────────────────────────────

function planFor(prompt: string) {
  const route = routePromptEnhancement({
    routeDecisionId: 'noun-route',
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
  return planPromptEnhancementSections({ routeResult: route, sourceRefs: [sourceA], guidanceFacts: [] });
}

/** Capture the prompt the model receives, and count the calls it takes. */
async function capturedComposerPrompt(prompt: string, reply?: Record<string, unknown>) {
  let captured = '';
  let calls = 0;
  const client: PromptEnhancementComposerClientV1 = {
    chat: {
      completions: {
        create: async (body) => {
          calls += 1;
          const user = body.messages.find((message) => message.role === 'user');
          captured = typeof user?.content === 'string' ? user.content : '';
          return {
            choices: [{
              message: {
                content: JSON.stringify(reply ?? {
                  detectedLanguageSelfReport: 'en',
                  requestModeSelfReport: 'implementation',
                  sectionDrafts: [],
                  composerClaims: [],
                  authorityEvidence: 'x',
                  authorityModeSelfReport: 'implementation',
                }),
              },
            }],
          };
        },
      },
    },
  };
  const result = await composeStructuredComposerOutputV1({
    enhancementId: 'noun-enh',
    originalPromptText: prompt,
    planning: planFor(prompt),
  }, client);
  return { captured, calls, result };
}

describe('the prompt gate — Layer 0 decides whether the block is even asked for', () => {
  it('a prompt naming a known tool and carrying a credential token GETS the block', async () => {
    const { captured } = await capturedComposerPrompt(DEPLOY_PROMPT);
    expect(captured).toContain('ALSO REPORT — nounPurposes');
    expect(captured).toContain('A null is a correct answer');
    // The caveat must name the conflict of interest, not offer a generic caution.
    expect(captured).toContain('describing text you wrote yourself');
    expect(captured).toContain('a missed move is far worse than a false alarm');
    // The cheap nudge rides the same block.
    expect(captured).toContain('do not repurpose a tool the developer mentioned');
  });

  it('a prompt with no known tool and no credential token gets NO block — the recorded cost', async () => {
    const { captured } = await capturedComposerPrompt(NO_TOOL_PROMPT);
    expect(captured).not.toContain('nounPurposes');
  });

  it('an UNLISTED noun shuts the gate, which silences BOTH halves — the cost, ruled and pinned', async () => {
    // Owner ruling 2026-08-25: the gate stays and this cost is recorded rather than engineered
    // around. The declaration is what half B judges, so no block means no declaration means no
    // finding of either kind — Layer 2 covers prompts naming a known tool or a credential shape,
    // and nothing else. Pinned so the limit stays a stated fact, never an unnoticed miss.
    const { captured } = await capturedComposerPrompt('rotate my auth thingy tomorrow');
    expect(captured).not.toContain('nounPurposes');
    expect(findPromptEnhancementNounPurposeFindingsV1({
      nounPurposes: undefined,
      originalPromptText: 'rotate my auth thingy tomorrow',
      groundedTexts: [],
    })).toEqual([]);
  });
});

describe('no retry — a declaration is never a composition failure', () => {
  /** A reply the composer accepts, so any extra call is attributable to the declaration alone. */
  function validReply(prompt: string, bodyText: string, nounPurposes?: unknown) {
    const planning = planFor(prompt);
    const host = planning.sectionPlans.find((plan) => plan.sectionKind !== 'original_request_or_goal')!;
    const factId = host.structuredContentPartRefs[0] ?? 'noun-fact-missing';
    return {
      detectedLanguageSelfReport: 'en',
      requestModeSelfReport: 'implementation',
      sectionDrafts: [{ sectionId: host.sectionId, bodyText, sourceFactIds: [factId] }],
      composerClaims: [`claim:${factId}`],
      authorityEvidence: bodyText,
      authorityModeSelfReport: 'implementation',
      ...(nounPurposes !== undefined ? { nounPurposes } : {}),
    };
  }

  it('a declaration that WOULD produce findings costs no call a clean one does not', async () => {
    // The rule is "zero ADDITIONAL calls", so the comparison is against the same reply with a
    // clean declaration — that isolates the declaration from every other retry cause.
    const clean = await capturedComposerPrompt(DEPLOY_PROMPT, validReply(DEPLOY_PROMPT, 'Keep the login flow simple.',
      [{ noun: 'token', purposeInPrompt: 'for deploys', purposeInBody: 'for deploys' }]));
    const mismatch = await capturedComposerPrompt(DEPLOY_PROMPT, validReply(DEPLOY_PROMPT, 'Keep the login flow simple.',
      [{ noun: 'token', purposeInPrompt: 'for deploys', purposeInBody: 'for login' }]));
    expect(mismatch.calls).toBe(clean.calls);
  });

  it('a malformed declaration never discards the reply — the drafts survive', async () => {
    const malformed = await capturedComposerPrompt(DEPLOY_PROMPT,
      validReply(DEPLOY_PROMPT, 'Keep the login flow simple.', 'not-an-array'));
    const absent = await capturedComposerPrompt(DEPLOY_PROMPT,
      validReply(DEPLOY_PROMPT, 'Keep the login flow simple.'));
    expect(malformed.result.ok).toBe(absent.result.ok);
    expect(malformed.calls).toBe(absent.calls);
    if (malformed.result.ok && absent.result.ok) {
      expect(malformed.result.output.sectionDrafts.length).toBe(absent.result.output.sectionDrafts.length);
    }
  });
});

describe('additive only — the layer accuses, it never acquits', () => {
  it('a body that would fail another check still fails it when the declaration is clean', () => {
    const planning = planFor(DEPLOY_PROMPT);
    const body = composePromptEnhancementBody({
      enhancementId: 'noun-enh',
      originalPromptText: DEPLOY_PROMPT,
      sectionPlanningResult: planning,
    }).currentBody;
    const index = body.sections.findIndex((section) => section.sectionKind !== 'original_request_or_goal');
    const sections = body.sections.map((section, position) => position === index
      ? { ...section, bodyText: '- Provide the safety_hook_linkage before shipping.' }
      : section);
    const withCleanDeclaration = validatePromptEnhancementSafety({
      currentBody: { ...body, sections },
      nounPurposes: [{ noun: 'token', purposeInPrompt: 'for deploys', purposeInBody: 'for deploys' }],
    });
    expect(withCleanDeclaration.failures.some((failure) => failure.failureCode.startsWith('source_honesty:internal_vocabulary_rendered'))).toBe(true);
    expect(withCleanDeclaration.sendPolicy).toBe('no_send');
  });

  it('a transposition finding reaches validation as a blocking outcome', () => {
    const planning = planFor(DEPLOY_PROMPT);
    const body = composePromptEnhancementBody({
      enhancementId: 'noun-enh',
      originalPromptText: DEPLOY_PROMPT,
      sectionPlanningResult: planning,
    }).currentBody;
    const result = validatePromptEnhancementSafety({
      currentBody: body,
      nounPurposes: [{ noun: 'token', purposeInPrompt: 'for deploys', purposeInBody: 'for login' }],
    });
    expect(result.failures.map((failure) => failure.failureCode))
      .toContain('noun_purpose_transposition:purpose_changed:token');
    expect(result.sendPolicy).toBe('no_send');
  });

  it('the same body with the declaration ABSENT validates exactly as today', () => {
    const planning = planFor(DEPLOY_PROMPT);
    const body = composePromptEnhancementBody({
      enhancementId: 'noun-enh',
      originalPromptText: DEPLOY_PROMPT,
      sectionPlanningResult: planning,
    }).currentBody;
    const withDeclaration = validatePromptEnhancementSafety({ currentBody: body, nounPurposes: undefined });
    const without = validatePromptEnhancementSafety({ currentBody: body });
    expect(withDeclaration.failures.map((f) => f.failureCode)).toEqual(without.failures.map((f) => f.failureCode));
    expect(withDeclaration.sendPolicy).toBe(without.sendPolicy);
  });
});
