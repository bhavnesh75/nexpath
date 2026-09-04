// Layer 0 — the curated known-name coverage of the invention detector, and the gate predicate.
//
// The defect being closed: the shape patterns catch a product name only when its casing
// cooperates (measured 37% over 30 real tool names), so a body steering the user toward OAuth
// or Redis they never asked for sailed through. The flagship case below FAILED before this
// layer landed and is the proof it exists. The K1–K5 rows are the other half of the bar: a
// user who names a tool for a purpose wants it used — suppressing any of them fails the
// sub-milestone whatever else is achieved.
import { describe, it, expect } from 'vitest';
import { findPromptEnhancementInventionViolationsV1 } from './preservation-floors.js';
import {
  KNOWN_TOOL_AND_CREDENTIAL_NAMES_V1,
  findKnownToolNamesInTextV1,
  textNamesKnownToolOrCredentialV1,
} from './known-tool-names.js';

const AUTH_PROMPT_WITHOUT_OAUTH = 'add login so nobody else can see my dashboard';

function inventions(sectionText: string, promptText: string, extraAllowed: readonly string[] = []) {
  return findPromptEnhancementInventionViolationsV1({
    sectionText,
    allowedTexts: [promptText, ...extraAllowed],
  }).map((violation) => violation.item);
}

describe('the flagship transposition — a tool named that the user never mentioned', () => {
  it('a body steering toward OAuth against a no-OAuth prompt is DETECTED (failed before Layer 0)', () => {
    expect(inventions('Set up OAuth for the login flow.', AUTH_PROMPT_WITHOUT_OAUTH)).toContain('OAuth');
  });

  it('the discriminating pair: the same prompt answered in her own nouns is NOT detected', () => {
    expect(inventions('Add a login page and session management.', AUTH_PROMPT_WITHOUT_OAUTH)).toEqual([]);
  });
});

describe('the fixture table — the 18 non-JWT missed names, both halves per name', () => {
  const missedNonJwt = [
    'OAuth', 'Redis', 'Kafka', 'Postgres', 'Docker', 'Stripe', 'Vercel', 'Nginx', 'Auth0',
    'Firebase', 'Supabase', 'Cloudflare', 'Twilio', 'Okta', 'Keycloak', 'bcrypt', 'argon2',
    'Passport',
  ] as const;

  it.each(missedNonJwt.map((name) => [name] as const))(
    '%s: invented in the body => detected; named in the prompt => allowed',
    (name) => {
      const body = `Use ${name} for this part of the build.`;
      // Invented: the prompt never mentions the tool — the finding names it in list casing.
      expect(inventions(body, 'build the settings page for my app')).toContain(name);
      // Prompt-named: the user's own mention allows it — Layer 0 is not a ban on saying Docker.
      expect(inventions(body, `should i use ${name.toLowerCase()} for my app?`)).toEqual([]);
    },
  );

  it('a source fact naming the tool also allows it — the inherited allowance, unchanged', () => {
    expect(inventions('Use Redis for the cache.', 'speed up my dashboard', ['project uses Redis for caching'])).toEqual([]);
  });
});

describe('the ruled exception — JWT stays allow-listed, visibly', () => {
  it('JWT is NOT in the curated list', () => {
    expect(KNOWN_TOOL_AND_CREDENTIAL_NAMES_V1).not.toContain('JWT');
  });

  it('a body inventing "a JWT here" is NOT detected — allow-listed by design, worth knowing', () => {
    expect(inventions('Use a JWT here for the session token.', AUTH_PROMPT_WITHOUT_OAUTH)).toEqual([]);
  });
});

describe('K1–K5 survive — the false-positive guard, the more important half', () => {
  const keepRows: readonly [string, string, string][] = [
    ['K1 sequencing his own ask',
      'Create a React app with a home page that shows study groups as cards',
      '1. Set up the React environment. 2. Create the components needed for the home page layout. 3. Design the card component. 4. Fetch study group data.'],
    ['K2 diagnostic direction from her prompt',
      "she said when she types a long message it cuts off and the send button is overlapping, she's on chrome same as me",
      "First, I'll compare both screens to identify layout differences between my laptop and hers. Then I'll check the Chrome settings on her device."],
    ['K3 the checklist she asked for',
      'is there anything obvious i should check before showing it to my professor?',
      '1. Check the layout on a phone. 2. Confirm the demo data loads. 3. Reread what the professor asked for.'],
    ['K4 her own question, sharpened',
      'i hardcoded my key sk-live-abc123 in the app, should i move it to env',
      'I need to figure out if hardcoding my key into the app is a bad idea and why I should switch this to an environment variable instead.'],
    ['K5 the safety lane on a real secret',
      'i hardcoded my key sk-live-abc123 in the app, should i move it to env',
      'Before switching to environment variables, I gotta ask for go-ahead confirmation.'],
  ];

  it.each(keepRows)('%s is NOT flagged', (_label, prompt, body) => {
    expect(inventions(body, prompt)).toEqual([]);
  });
});

describe('the matcher discipline — case-insensitive, whole-word, never a capitalisation widening', () => {
  it('lowercase and shouted forms of a listed name both match', () => {
    expect(findKnownToolNamesInTextV1('wire redis into the cache')).toEqual(['Redis']);
    expect(findKnownToolNamesInTextV1('WIRE REDIS INTO THE CACHE')).toEqual(['Redis']);
  });

  it('substrings never match — "predisposed" does not name Redis, "dockerfile" does not name Docker', () => {
    expect(findKnownToolNamesInTextV1('she was predisposed to agree')).toEqual([]);
    expect(findKnownToolNamesInTextV1('the dockerfiles are unchanged')).toEqual([]);
  });

  it('ordinary capitalised sentence-openers stay invisible — Check, Consider, Test are not names', () => {
    expect(inventions('Check the layout. Consider the spacing. Test the form.', 'fix my settings page')).toEqual([]);
  });

  it('the list has no duplicates', () => {
    expect(new Set(KNOWN_TOOL_AND_CREDENTIAL_NAMES_V1.map((name) => name.toLowerCase())).size)
      .toBe(KNOWN_TOOL_AND_CREDENTIAL_NAMES_V1.length);
  });
});

describe('the live consumer — a list-caught name reaches the validator as a blocking failure', () => {
  it('a lowercase curated name on a no_invention_state section blocks through validatePromptEnhancementSafety', async () => {
    // The census suite proves the obligation is enforced, but its probe item (RabbitMQ) is
    // shape-caught by the OLD pattern — this row proves the CURATED loop's catches ride the
    // same live path: lowercase "redis" is invisible to every shape pattern and must still
    // produce the blocking fabricated-item failure, in list casing.
    const { validatePromptEnhancementSafety } = await import('./safety-sendability.js');
    const { routePromptEnhancement } = await import('./routing-taxonomy.js');
    const { planPromptEnhancementSections } = await import('./templates/section-plan.js');
    const { composePromptEnhancementBody } = await import('./compose-enhancement.js');
    const route = routePromptEnhancement({
      routeDecisionId: 'layer0-route',
      promptText: 'speed up my dashboard',
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
    const planning = planPromptEnhancementSections({
      routeResult: route,
      sourceRefs: [{
        sourceRefId: 'src-a-1', sourceKind: 'source_a_user_prompt', sourceId: 'prompt:layer0-1',
        freshness: 'current', confidence: 'high', privacyClass: 'local_private',
      }],
      guidanceFacts: [],
    });
    const body = composePromptEnhancementBody({
      enhancementId: 'layer0-enh',
      originalPromptText: 'speed up my dashboard',
      sectionPlanningResult: planning,
    }).currentBody;
    const targetIndex = body.sections.findIndex((section) => section.sectionKind !== 'original_request_or_goal');
    const sections = body.sections.map((section, index) => index === targetIndex
      ? { ...section, slotObligations: ['no_invention_state' as const], bodyText: 'wire redis into the cache layer' }
      : section);
    const validation = validatePromptEnhancementSafety({ currentBody: { ...body, sections } });
    expect(validation.failures.map((failure) => failure.failureCode))
      .toContain('no_invention_state:fabricated_item:Redis');
    expect(validation.sendPolicy).toBe('no_send');
  });
});

describe('the gate predicate — known name OR credential-shaped token, with its recorded cost', () => {
  it('a known tool name gates in', () => {
    expect(textNamesKnownToolOrCredentialV1('wire up Redis caching for the feed')).toBe(true);
  });

  it('a credential-shaped token gates in (the classifier secret shapes, reused not duplicated)', () => {
    expect(textNamesKnownToolOrCredentialV1('my api_key = abc12345secretvalue is in the file')).toBe(true);
    expect(textNamesKnownToolOrCredentialV1('the key sk-abcdefghij1234567890 leaked')).toBe(true);
  });

  it('the recorded cost, pinned as EXPECTED: an unlisted noun does not gate in', () => {
    // "my auth thingy" answers false BY DESIGN — acceptable only while the ungated judge half
    // still runs on everything. A consumer gating both halves must remove this gate.
    expect(textNamesKnownToolOrCredentialV1('rotate my auth thingy tomorrow')).toBe(false);
  });
});
