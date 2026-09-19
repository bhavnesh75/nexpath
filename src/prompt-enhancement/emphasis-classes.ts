/**
 * Which words in a composed body may be emphasised, and why.
 *
 * Five kinds of phrase earn a mark, and each is a different question: what the body asks the agent
 * to DO, which words are the developer's own, what the work must NOT touch, what must happen
 * FIRST, and the safety sentences the pipeline inserts itself. Everything else stays plain — a
 * body where most of the text is marked has emphasised nothing.
 *
 * ⛔ **This module decides classes and nothing else.** It does not locate a phrase in the rendered
 * text, does not cap how many survive, and does not store anything. Those are the next phase's, and
 * keeping them apart is what lets this one be read as a standard rather than as plumbing.
 *
 * Pure: every input is passed in. Nothing here reads the store, the clock or the environment, and
 * nothing here calls a model.
 */
import { EXECUTION_VERB, ALWAYS_ESCALATE_PATTERN } from './safety-sendability.js';
import { SECRET_IN_TEXT } from '../classifier/mistake-categories.js';
import { collectPromptEnhancementEmphasisUserTermsV1 } from './emphasis-sources.js';

/**
 * 1 action · 2 the developer's own term · 3 a boundary · 4 a condition · 5 a safety line.
 *
 * The numbers are the priority order the cap spends its budget in, which is why they are numbers
 * and not names.
 */
export type PromptEnhancementEmphasisClassV1 = 1 | 2 | 3 | 4 | 5;

export interface PromptEnhancementEmphasisCandidateV1 {
  /** The phrase as it reads in the body — the next phase re-finds it there. */
  text: string;
  emphasisClass: PromptEnhancementEmphasisClassV1;
  /**
   * Class 1 only: whether the verb commands a change rather than a look. Writes outrank reads when
   * the cap bites, so the rank has to be decided where the verb is recognised.
   */
  isWriteVerb?: boolean;
}

/** One composed section, as this module needs to see it. */
export interface PromptEnhancementEmphasisSectionInputV1 {
  sectionKind: string;
  /** The section's rendered text. Its heading is NOT part of this, and never gets a mark. */
  sectionText: string;
  groundedFactValues?: readonly string[];
  sourceFactIds?: readonly string[];
  sourceIds?: readonly string[];
  /**
   * The clearance verdict, for a section whose lines carry one of the risky kinds. `not_proposed`
   * means the body was not cleared to propose that action, so class 1 is off **here**.
   *
   * ⚠️ Per section on purpose. The rule is scoped to the risky kinds, and which lines carry one is
   * decided where the risk is classified — not here. A caller that knows a section is not risky
   * leaves this unset, and an absent verdict never suppresses anything.
   */
  clearanceVerdict?: string;
}

export interface PromptEnhancementEmphasisInputV1 {
  originalPromptText: string;
  sections: readonly PromptEnhancementEmphasisSectionInputV1[];
  /**
   * The composer's own report of the language it wrote in. When it is present and not English,
   * class 1 is off: the clause heads below are English, and a verb list without the grammar around
   * it would mark the wrong half of a sentence.
   */
  detectedLanguageSelfReport?: string;
  /** The resolved name inside the confirmation sentence, when one was inserted. */
  sensitiveActionName?: string;
}

/** The two sections whose text is never marked, whatever it contains. */
const NEVER_MARKED_SECTION_KINDS: ReadonlySet<string> = new Set([
  // The developer's own words, quoted back. Marking them would emphasise their own prompt at them.
  'original_request_or_goal',
  // Its lines propose practices by design, so the loudest mark would land on the one section that
  // is nexpath's suggestion rather than the developer's ask.
  'source_signal_guidance',
]);

/**
 * The clause heads a class-1 verb must follow, in full.
 *
 * A verb anywhere else — mid-sentence, inside the developer's restated prompt, inside a sentence
 * the pipeline inserted — is not an instruction to the agent; it is the body talking about
 * something. The first-person heads are here because the composer writes as the agent.
 */
const CLASS_1_CLAUSE_HEADS: readonly string[] = [
  'you must',
  'i need you to',
  'make sure to',
  "i'll",
  'i will',
  'i need to',
  'i should',
  'i can',
  "let's",
];

/**
 * The read verbs that are instructions too.
 *
 * *Find the bug*, *make a report*, *read the logs* — each is work the body is telling the agent to
 * do, and a developer scanning the popup needs to see it as plainly as a write. The list is the
 * approved starting set; it can still be edited.
 *
 * ⚠️ They rank BELOW writes when the cap bites, which is what {@link
 * PromptEnhancementEmphasisCandidateV1.isWriteVerb} carries.
 */
const READ_VERB = /\b(?:check|compare|look at|inspect|report|confirm|find|read|review|verify|test|investigate|identify|list)\b/i;

/** Words that end a phrase: the next clause has started, so the object has finished. */
const CLAUSE_BOUNDARY = /[,.;:!?]|\bbefore\b|\bafter\b|\bonce\b|\bunless\b|\buntil\b|\bonly if\b|\brather than\b/i;

/** A hard negation or scope limiter. */
const CLASS_3_BOUNDARY_WORDS: readonly string[] = ['do not', 'must not', 'never', 'without', 'only', 'not'];

/** A precondition that gates the work. */
const CLASS_4_CONDITION_WORDS: readonly string[] = ['only if', 'before', 'after', 'once', 'unless', 'until'];

/** The stance sentence's own marked span (A18) — the rest of the sentence stays plain. */
const POSTURE_STANCE_SPAN_V1 = 'rather than carrying it out' as const;

/** The confirmation's second scope unit. A boundary, not a safety line — classes 5 and 3. */
const CONFIRMATION_BOUNDARY_SPAN_V1 = 'Do not assume' as const;

/** The naming the history-lane safeguard always carries. */
const GENERIC_SAFETY_NAMING_V1 = 'sensitive action' as const;

/**
 * Cut a candidate before any secret-shaped token.
 *
 * The popup and the floors see the RAW prompt — redaction runs on the stored copy — so a value
 * that looks like a key can genuinely reach a rendered body. A mark is the loudest thing on the
 * screen, and it must never be the thing that points at one.
 */
function cutBeforeSecret(phrase: string): string {
  const match = SECRET_IN_TEXT.exec(phrase);
  return match === null ? phrase : phrase.slice(0, match.index).trim();
}

/**
 * Blank out the text the pipeline wrote itself, so the line scan cannot mark it.
 *
 * Two kinds of text are in a body but not *of* it. The safety sentences are code-inserted and
 * already have their own fixed marks — scanning them again would mark the scaffolding of a
 * sentence whose only load-bearing words were chosen deliberately. And an expectation line's
 * framing (*"— confirm before relying on it"*) is the pipeline hedging about a fact; the
 * developer's half is the value, which class 2 has already taken.
 *
 * Replaced with spaces rather than removed, so every other phrase keeps the line it sits on.
 */
function maskInsertedText(sectionText: string, sensitiveActionName?: string): string {
  const blank = (text: string, span: string): string =>
    span.length === 0 ? text : text.split(span).join(' '.repeat(span.length));

  let masked = sectionText;
  const named = sensitiveActionName?.trim();
  for (const naming of [named, GENERIC_SAFETY_NAMING_V1]) {
    if (naming === undefined || naming.length === 0) continue;
    const at = masked.indexOf(`before you do this ${naming}`);
    if (at < 0) continue;
    // The carried sentence runs to the end of its second scope unit; "Do not assume" is claimed
    // separately, so everything up to it goes.
    const end = masked.indexOf(CONFIRMATION_BOUNDARY_SPAN_V1, at);
    masked = blank(masked, masked.slice(at, end < 0 ? masked.length : end));
  }
  masked = blank(masked, POSTURE_STANCE_SPAN_V1);
  for (const match of sectionText.matchAll(/ — confirm before relying on it\./g)) {
    masked = blank(masked, match[0]);
  }
  return masked;
}

/** The clause a word governs: the word, plus what follows it up to the clause's end. */
function clauseFrom(line: string, startIndex: number, wordLength: number): string {
  const rest = line.slice(startIndex + wordLength);
  const boundary = CLAUSE_BOUNDARY.exec(rest);
  const tail = boundary === null ? rest : rest.slice(0, boundary.index);
  return `${line.slice(startIndex, startIndex + wordLength)}${tail}`.trimEnd();
}

/** Find a whole-word occurrence of `word`, case-insensitively, or -1. */
function indexOfWord(line: string, word: string): number {
  const pattern = new RegExp(`(?:^|[^A-Za-z])(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![A-Za-z])`, 'i');
  const match = pattern.exec(line);
  if (match === null) return -1;
  return match.index + match[0].length - (match[1] ?? '').length;
}

/** Is this body English enough for the class-1 grammar to apply? */
function classOneApplies(input: PromptEnhancementEmphasisInputV1): boolean {
  const language = input.detectedLanguageSelfReport?.trim().toLowerCase();
  if (language === undefined || language.length === 0) return true;
  return language === 'en' || language.startsWith('en-');
}

/** The class-1 candidates of one line: an instruction, with an object that traces. */
function classOneOfLine(line: string, userTerms: readonly string[]): PromptEnhancementEmphasisCandidateV1[] {
  const lower = line.toLowerCase();
  // The verb has to head a clause — sentence-initial, or straight after one of the known heads.
  const heads: number[] = [0];
  for (const head of CLASS_1_CLAUSE_HEADS) {
    const at = lower.indexOf(head);
    if (at >= 0) heads.push(at + head.length);
  }

  const found: PromptEnhancementEmphasisCandidateV1[] = [];
  for (const head of heads) {
    const rest = line.slice(head);
    // Writes, the shapes that are dangerous on sight, and the reads that are still instructions.
    const verb = EXECUTION_VERB.exec(rest) ?? ALWAYS_ESCALATE_PATTERN.exec(rest) ?? READ_VERB.exec(rest);
    if (verb === null) continue;
    // Only a verb that opens the clause counts; one buried further in is the body describing
    // something, not instructing.
    const beforeVerb = rest.slice(0, verb.index).trim();
    if (beforeVerb.length > 0) continue;

    const phrase = cutBeforeSecret(clauseFrom(rest, verb.index, verb[0].length));
    if (phrase.length === 0) continue;
    // The object has to trace to something the developer or the project supplied. A verb with an
    // object nobody named is the body inventing work.
    const object = phrase.slice(verb[0].length).trim();
    if (object.length === 0) continue;
    if (!userTerms.some((term) => object.toLowerCase().includes(term.toLowerCase()))) continue;

    found.push({ text: phrase, emphasisClass: 1, isWriteVerb: EXECUTION_VERB.test(verb[0]) });
  }
  return found;
}

/** The class-3 and class-4 candidates of one line: a limiter or a condition, with its clause. */
function boundaryAndConditionOfLine(line: string): PromptEnhancementEmphasisCandidateV1[] {
  const found: PromptEnhancementEmphasisCandidateV1[] = [];
  const claimed: string[] = [];

  const scan = (words: readonly string[], emphasisClass: 3 | 4): void => {
    for (const word of words) {
      const at = indexOfWord(line, word);
      if (at < 0) continue;
      // A longer limiter wins: "do not" is not also a bare "not".
      if (claimed.some((taken) => taken.toLowerCase().includes(word.toLowerCase()))) continue;
      const phrase = cutBeforeSecret(clauseFrom(line, at, word.length));
      if (phrase.length === 0) continue;
      claimed.push(phrase);
      found.push({ text: phrase, emphasisClass });
    }
  };

  scan(CLASS_3_BOUNDARY_WORDS, 3);
  scan(CLASS_4_CONDITION_WORDS, 4);
  return found;
}

/** The class-5 candidates: the pipeline's own sentences, each marked only where it carries weight. */
function safetyLinesOf(
  sectionText: string,
  sensitiveActionName?: string,
): PromptEnhancementEmphasisCandidateV1[] {
  const found: PromptEnhancementEmphasisCandidateV1[] = [];
  // The confirmation: only its named action. Its second scope unit is a boundary, added below.
  const named = sensitiveActionName?.trim();
  if (named !== undefined && named.length > 0 && sectionText.includes(`before you do this ${named}`)) {
    found.push({ text: named, emphasisClass: 5 });
  }
  // The history-lane safeguard always carries the generic naming.
  if (sectionText.includes(`before you do this ${GENERIC_SAFETY_NAMING_V1}`)) {
    found.push({ text: GENERIC_SAFETY_NAMING_V1, emphasisClass: 5 });
  }
  // The stance: only the half that says what to do instead.
  if (sectionText.includes(POSTURE_STANCE_SPAN_V1)) {
    found.push({ text: POSTURE_STANCE_SPAN_V1, emphasisClass: 5 });
  }
  return found;
}

/**
 * Every phrase in this body that may be emphasised, with the class that earned it.
 *
 * Returned in body order, deduplicated by text and class. Nothing is located, capped or stored —
 * a candidate here has earned a mark, not been given one.
 */
export function classifyPromptEnhancementEmphasisCandidatesV1(
  input: PromptEnhancementEmphasisInputV1,
): readonly PromptEnhancementEmphasisCandidateV1[] {
  const candidates: PromptEnhancementEmphasisCandidateV1[] = [];
  const seen = new Set<string>();
  const keep = (candidate: PromptEnhancementEmphasisCandidateV1): void => {
    const text = cutBeforeSecret(candidate.text).trim();
    if (text.length === 0) return;
    const key = `${candidate.emphasisClass}:${text.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ ...candidate, text });
  };

  const classOneOn = classOneApplies(input);

  for (const section of input.sections) {
    if (NEVER_MARKED_SECTION_KINDS.has(section.sectionKind)) continue;

    const userTerms = collectPromptEnhancementEmphasisUserTermsV1({
      originalPromptText: input.originalPromptText,
      sectionText: section.sectionText,
      ...(section.groundedFactValues ? { groundedFactValues: section.groundedFactValues } : {}),
      ...(section.sourceFactIds ? { sourceFactIds: section.sourceFactIds } : {}),
      ...(section.sourceIds ? { sourceIds: section.sourceIds } : {}),
    });

    // A section the body was not cleared to propose an action in marks no instruction. The rule is
    // scoped to the risky kinds, and which lines carry one is decided where the risk is classified
    // — so an unset verdict never suppresses anything here.
    const classOneHere = classOneOn && section.clearanceVerdict !== 'not_proposed';

    for (const term of userTerms) keep({ text: term, emphasisClass: 2 });
    for (const safety of safetyLinesOf(section.sectionText, input.sensitiveActionName)) keep(safety);
    // The confirmation's second unit — a boundary, and the one place a fixed span is claimed
    // before the line scan, so "Do not assume, and do not rely…" is not taken as one long clause.
    if (section.sectionText.includes(CONFIRMATION_BOUNDARY_SPAN_V1)) {
      keep({ text: CONFIRMATION_BOUNDARY_SPAN_V1, emphasisClass: 3 });
    }

    // The line scan never sees what the pipeline wrote itself — those spans have their own marks.
    for (const line of maskInsertedText(section.sectionText, input.sensitiveActionName).split('\n')) {
      if (line.trim().length === 0) continue;
      if (classOneHere) for (const action of classOneOfLine(line, userTerms)) keep(action);
      for (const bound of boundaryAndConditionOfLine(line)) keep(bound);
    }
  }

  // A term the developer supplied that sits wholly inside an instruction is already marked by it.
  // Two nested marks read as one ragged one, and they would spend the cap twice for a single span.
  const actions = candidates.filter((candidate) => candidate.emphasisClass === 1);
  return candidates.filter((candidate) => {
    if (candidate.emphasisClass !== 2) return true;
    return !actions.some((action) => action.text.toLowerCase().includes(candidate.text.toLowerCase()));
  });
}
