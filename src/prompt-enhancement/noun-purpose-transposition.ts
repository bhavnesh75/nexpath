/**
 * Layer 2 — the purpose-transposition judge. Declare, then judge.
 *
 * The defect: a body takes something the developer named for one job and quietly puts it to
 * another — "I connected github with a token for deploys" becomes "use the deploy token for
 * login". Every noun is the developer's own, so no vocabulary can see it: only the ROLE moved.
 * It survives the curated name list by construction (measured), which is why this layer exists.
 *
 * The principle: THE MODEL NEVER RENDERS A VERDICT ON ITSELF. Asking a composer "did you
 * repurpose the user's tool?" is asking it to accuse itself, and the honest answer is the one
 * that costs it a passing reply. So the composer only STATES what it did — for each noun it
 * used, the purpose the prompt gave it and the purpose its own text gives it — and the rules
 * below decide. Extraction is what models are reliable at; self-accusation is what they are
 * worst at.
 *
 * Two disjoint halves, so nothing is reported twice and no arbitration rule is needed:
 *   A — the prompt gave the noun a purpose and the body gives it a DIFFERENT one.
 *   B — the prompt gave it NO purpose and the body assigns one. Assigning a tool a purpose is a
 *       claim, and a claim needs a source; this is the existing claim discipline applied to
 *       purposes, not a new kind of check.
 *
 * ⛔ A never fires on SAME. A developer who names a tool for a job usually wants it used for that
 * job, and suppressing that is the failure this sub-milestone must not trade for.
 *
 * Everything here is additive: it can turn a pass into a finding, never a finding into a pass.
 */

/** One noun the composer used, with the purpose it had in the prompt and the purpose it has in the body. */
export interface PromptEnhancementNounPurposeV1 {
  readonly noun: string;
  /** null when the prompt assigned no purpose — the model must never infer or supply a plausible one. */
  readonly purposeInPrompt: string | null;
  readonly purposeInBody: string;
}

export type PromptEnhancementNounPurposeFindingKindV1 =
  | 'purpose_changed'
  | 'purpose_assigned_without_source';

export interface PromptEnhancementNounPurposeFindingV1 {
  readonly noun: string;
  readonly kind: PromptEnhancementNounPurposeFindingKindV1;
  readonly purposeInPrompt: string | null;
  readonly purposeInBody: string;
}

/** Runtime shape guard: anything unexpected is ABSENT, never a partial reading. */
export function isPromptEnhancementNounPurposeV1(value: unknown): value is PromptEnhancementNounPurposeV1 {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const purposeInPrompt = record['purposeInPrompt'];
  return typeof record['noun'] === 'string'
    && record['noun'].trim().length > 0
    && typeof record['purposeInBody'] === 'string'
    && record['purposeInBody'].trim().length > 0
    && (purposeInPrompt === null || purposeInPrompt === undefined || typeof purposeInPrompt === 'string');
}

/**
 * Normalise a declaration entry.
 *
 * THE INVENTION GUARD: a `purposeInPrompt` the prompt does not actually contain is treated as
 * null. Without it the model can supply a plausible purpose it inferred, and half A would then
 * manufacture its own mismatches — the failure mode that makes this layer worth nothing. The
 * check is a containment test against the prompt, not a judgement about meaning.
 */
function normalizeEntry(
  entry: PromptEnhancementNounPurposeV1,
  originalPromptText: string,
): PromptEnhancementNounPurposeV1 {
  const stated = typeof entry.purposeInPrompt === 'string' ? entry.purposeInPrompt.trim() : '';
  if (stated.length === 0) return { ...entry, purposeInPrompt: null };
  return { ...entry, purposeInPrompt: isSupportedBy(stated, [originalPromptText]) ? stated : null };
}

/**
 * Words that carry no purpose of their own. Excluded before comparing, because "for" appearing in
 * both "for deploys" and "for login" would make every transposition look like a match.
 */
const PURPOSE_FUNCTION_WORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'onto', 'its', 'his', 'her',
  'use', 'used', 'using', 'set', 'setting', 'make', 'making', 'get', 'getting', 'run', 'running',
  'any', 'all', 'each', 'one', 'via', 'per', 'out', 'off', 'own', 'new', 'also', 'then', 'than',
  'when', 'what', 'which', 'while', 'here', 'there', 'they', 'them', 'their', 'have', 'has', 'had',
  'been', 'being', 'was', 'were', 'are', 'not', 'but', 'can', 'will', 'would', 'should', 'must',
]);

/**
 * The contentful stems of a phrase — the first three letters of each meaningful word.
 *
 * Stems rather than whole words because real bodies paraphrase constantly: "move it to env" and
 * "moving the key to an environment variable" are one instruction, and a layer that cannot see
 * that blocks correct popups. Three letters is what makes move/moving and deploy/deploys the same
 * root; function words are dropped first so the shared scaffolding of English cannot pass for a
 * shared meaning.
 */
function stemsOf(text: string): readonly string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((word) => word.length >= 3 && !PURPOSE_FUNCTION_WORDS.has(word))
    .map((word) => word.slice(0, 3));
}

/** Is this purpose sourced by any of these texts — the developer's own words, or a project fact? */
function isSupportedBy(purpose: string, texts: readonly string[]): boolean {
  if (texts.length === 0) return false;
  const haystack = new Set(stemsOf(texts.join(String.fromCharCode(10))));
  const stems = stemsOf(purpose);
  return stems.length > 0 && stems.some((stem) => haystack.has(stem));
}

/**
 * Do these two purposes describe the same job?
 *
 * The question this layer exists to answer is whether the ROLE MOVED — "for deploys" becoming
 * "for login" — not whether the words differ. Any shared contentful stem means the body is still
 * talking about the same job in its own words, and silence is the correct answer. Only a purpose
 * with nothing in common with the stated one is a transposition. Erring toward silence is
 * deliberate: a layer that blocks a correct body costs the developer everything, while a missed
 * transposition costs one sentence.
 */
function purposesMatch(promptPurpose: string, bodyPurpose: string): boolean {
  const promptStems = stemsOf(promptPurpose);
  const bodyStems = stemsOf(bodyPurpose);
  if (promptStems.length === 0 || bodyStems.length === 0) return true;
  const promptSet = new Set(promptStems);
  return bodyStems.some((stem) => promptSet.has(stem));
}

/**
 * Judge the composer's declaration. An absent, malformed or empty declaration yields NO findings —
 * today's behaviour exactly.
 */
export function findPromptEnhancementNounPurposeFindingsV1(input: {
  readonly nounPurposes: unknown;
  readonly originalPromptText: string;
  /**
   * What else could have SOURCED a purpose: the resolved values of the facts the body was
   * allowed to ground in. Half B asks whether a purpose has a source, and a project fact is a
   * source — the same allowance discipline the invention gate applies, reused rather than
   * re-invented. Without it a correctly-grounded body would be reported as unsourced, and this
   * layer blocks whole popups.
   */
  readonly groundedTexts?: readonly string[];
}): readonly PromptEnhancementNounPurposeFindingV1[] {
  if (!Array.isArray(input.nounPurposes)) return [];
  const findings: PromptEnhancementNounPurposeFindingV1[] = [];
  for (const raw of input.nounPurposes) {
    if (!isPromptEnhancementNounPurposeV1(raw)) continue;
    const entry = normalizeEntry(raw, input.originalPromptText);
    if (entry.purposeInPrompt === null) {
      // Half B: the developer assigned no purpose. A purpose the allowed source facts DO supply
      // is sourced, so it is not a finding — only an unsourced one is.
      // A purpose is sourced when the developer's own request or an allowed project fact already
      // says it. Only a job that comes from nowhere is an unsupported claim.
      if (isSupportedBy(entry.purposeInBody, [input.originalPromptText, ...(input.groundedTexts ?? [])])) continue;
      findings.push({
        noun: entry.noun,
        kind: 'purpose_assigned_without_source',
        purposeInPrompt: null,
        purposeInBody: entry.purposeInBody,
      });
      continue;
    }
    // Half A: a stated purpose, and the body uses a different one. SAME never fires.
    if (!purposesMatch(entry.purposeInPrompt, entry.purposeInBody)) {
      findings.push({
        noun: entry.noun,
        kind: 'purpose_changed',
        purposeInPrompt: entry.purposeInPrompt,
        purposeInBody: entry.purposeInBody,
      });
    }
  }
  return findings;
}
