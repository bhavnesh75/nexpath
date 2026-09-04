// The confirmation-sentence FAMILY — every sentence the builder can produce, not a favourite one.
//
// Activated from its parked form together with the wording change and the naming-phrase fix, in
// the same commit — the order interaction is deliberate: the parked file carried a pinned-exception
// list because one action phrase (`production deploy or release`) contained the bare verb `deploy`.
// That phrase is gone, so the post-fix space carries ZERO execution-verb sentences and the guards
// below assert the stronger post-fix property: the exception list stays empty and the trap phrase
// never returns.
import { describe, expect, it } from 'vitest';
import {
  buildPromptEnhancementCanonicalConfirmation,
  promptEnhancementAuthorityModeForTextV1,
} from './safety-sendability.js';

/**
 * The confirmation sentence is not one string — it is a FAMILY of strings.
 *
 * `specificSensitiveActionTextForPrompt` picks an action phrase per risk kind the prompt matches, and
 * JOINS them, so a prompt hitting two kinds produces one sentence carrying both. Checking a single
 * example says nothing about the family: measured over singles, pairs and triples of the ten risk
 * kinds, the builder produces 175 distinct sentences.
 *
 * That matters because the sentence is STRIPPED out of the body before the escalation scanners run.
 * Two properties therefore have to hold for every member of the family, not just for a favourite one:
 *
 *   1. the sentence the builder produces can be removed again by an exact-substring strip, and
 *   2. the sentence does not itself read as an execution instruction, because if the strip ever
 *      misses, whatever is left gets scanned as if the model had written it.
 *
 * Property 2 now holds for EVERY member: the one offending phrase was reworded to
 * `production release or rollout` in the same commit that activated this file, so the pinned
 * exception the parked version carried is empty — legitimately, and guarded below.
 */

/** One minimal prompt fragment per risk kind, sufficient to make that kind match. */
const TRIGGER_BY_RISK_KIND: Readonly<Record<string, string>> = {
  destructive_filesystem_or_codebase: 'delete the old migrations folder',
  destructive_data_or_schema: 'truncate the events table',
  dependency_or_toolchain_change: 'upgrade every dependency',
  secret_env_or_credential: 'rotate the stripe api key',
  production_release_or_external_effect: 'deploy to production tonight',
  git_history_rewrite: 'force push over main',
  security_auth_permission: 'turn off the auth check',
  cost_or_resource: 'raise the billing quota',
  wide_scope_or_boundary_expansion: 'rename this across the whole repo',
  agent_mode_or_permission_boundary: 'switch to execute mode',
};

/** The phrase that used to read as an execution instruction. Guarded against returning. */
const RETIRED_TRAP_PHRASE = 'production deploy or release';

const RISK_KINDS = Object.keys(TRIGGER_BY_RISK_KIND);

function promptFor(kinds: readonly string[]): string {
  return kinds.map((kind) => TRIGGER_BY_RISK_KIND[kind]).join(' and ');
}

interface SentenceCase {
  readonly label: string;
  readonly prompt: string;
  readonly sentence: string;
}

function buildSentenceSpace(): readonly SentenceCase[] {
  const cases: SentenceCase[] = [];
  const seen = new Set<string>();
  const add = (kinds: readonly string[]): void => {
    const prompt = promptFor(kinds);
    const sentence = buildPromptEnhancementCanonicalConfirmation(prompt);
    if (seen.has(sentence)) return;
    seen.add(sentence);
    cases.push({ label: kinds.join(' + '), prompt, sentence });
  };
  for (let i = 0; i < RISK_KINDS.length; i++) {
    add([RISK_KINDS[i]!]);
    for (let j = i + 1; j < RISK_KINDS.length; j++) {
      add([RISK_KINDS[i]!, RISK_KINDS[j]!]);
      for (let k = j + 1; k < RISK_KINDS.length; k++) add([RISK_KINDS[i]!, RISK_KINDS[j]!, RISK_KINDS[k]!]);
    }
  }
  return cases;
}

const SENTENCE_SPACE = buildSentenceSpace();

describe('the confirmation sentence family', () => {
  it('is a family, not a single string — singles, pairs and triples produce many distinct sentences', () => {
    // Guards the assumption this whole file exists to replace: that one example stands for the rest.
    expect(SENTENCE_SPACE.length).toBeGreaterThan(100);
    expect(SENTENCE_SPACE.some((c) => c.sentence.includes(', and '))).toBe(true);
  });

  it('names every risk kind, so no kind is silently untested here', () => {
    expect(RISK_KINDS).toHaveLength(10);
  });
});

describe.each(SENTENCE_SPACE)('confirmation sentence [$label]', ({ prompt, sentence }) => {
  it('can be stripped back out of a body by an exact-substring removal', () => {
    // The stripper removes exactly what the builder produced. If this ever fails, the sentence
    // survives into the text the escalation scanners read.
    const body = `Approach:\n- Do the work.\n- ${sentence}`;
    expect(body.includes(sentence)).toBe(true);
    expect(body.replace(sentence, '')).not.toContain(sentence);
  });

  it('carries no unresolved placeholder', () => {
    expect(sentence).not.toMatch(/\{\{[^}]{1,80}\}\}|<[^>\n]{2,80}>/);
  });

  it('never reads as an execution instruction — the post-fix space has no exceptions', () => {
    // The property: a safety sentence must never itself look like an order to act. The parked
    // version pinned one offender; the phrase fix removed it, so this now holds unconditionally.
    expect(promptEnhancementAuthorityModeForTextV1(sentence)).not.toBe('execute_requested');
  });

  it('is rebuilt identically from the same prompt', () => {
    expect(buildPromptEnhancementCanonicalConfirmation(prompt)).toBe(sentence);
  });
});

describe('the retired exception — empty legitimately, and guarded against returning', () => {
  it('no sentence in the space reads as an execution instruction any more', () => {
    const offenders = SENTENCE_SPACE
      .filter((c) => promptEnhancementAuthorityModeForTextV1(c.sentence) === 'execute_requested')
      .map((c) => c.sentence);
    expect(offenders).toEqual([]);
  });

  it('the trap phrase never returns to any sentence', () => {
    // The parked version pinned `production deploy or release` by name because it carried the
    // bare verb `deploy`. The phrase was reworded in the same commit that activated this file;
    // a reintroduction lands here rather than going unnoticed.
    expect(SENTENCE_SPACE.some((c) => c.sentence.includes(RETIRED_TRAP_PHRASE))).toBe(false);
  });
});
