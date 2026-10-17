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
import { isPromptEnhancementComposerOwnLineV1 } from './composer-own-lines.js';

/**
 * 1 action · 2 the developer's own term · 3 a boundary · 4 a condition · 5 a safety line.
 *
 * The numbers are the priority order the cap spends its budget in, which is why they are numbers
 * and not names.
 */
export type PromptEnhancementEmphasisClassV1 = 1 | 2 | 3 | 4 | 5;

export interface PromptEnhancementEmphasisCandidateV1 {
  /**
   * Which of the input's sections this candidate was read from.
   *
   * ⚠️ Optional, and a caller that ignores it gets the older behaviour — the phrase is placed in the
   * first section whose text happens to hold it. That is what produced a blank section on a real
   * popup: a term read from section 5 was placed in section 2, where the same words also appear,
   * and the section that asked for it drew nothing.
   */
  sectionIndex?: number;
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

/**
 * The section whose text is never marked, whatever it contains.
 *
 * Exported for the popup's overlay, which has to answer the same question from the other end: not
 * "may this section produce a phrase" but "may a phrase land here". A phrase taken from the
 * developer's prompt is quoted back verbatim here, so without the same list the overlay would find it
 * there first and mark their own words at them.
 *
 * ⏪ **`source_signal_guidance` was in this set until 2026-09-29** — *"its lines propose practices by
 * design, so the loudest mark would land on the one section that is nexpath's suggestion rather than
 * the developer's ask."* The owner amended that: the practices section names the thing the guidance is
 * ABOUT, and that name is the main word on the screen. It is now in
 * {@link TERM_ONLY_SECTION_KINDS} instead — its keyword may be marked, and nothing else may.
 */
export const NEVER_MARKED_SECTION_KINDS: ReadonlySet<string> = new Set([
  // The developer's own words, quoted back. Marking them would emphasise their own prompt at them.
  'original_request_or_goal',
]);

/**
 * Sections where ONLY the term classes may fire — the developer's own words and the named facts the
 * section was generated from. No instruction, no boundary, no condition, no safety line.
 *
 * 🔑 **Why a third state rather than simply opening the section.** Measured before it was written, over
 * the 33 recorded practices sections and a reported popup:
 *
 *   as a TERM-ONLY section   `implementation` in 29 of 33 · `task breakdown` in 21 — the named fact the
 *                            guidance is about, which is what the reader is looking for
 *   fully markable           the same, PLUS `Do not assume` ×4 and `sensitive action` ×4 — the inserted
 *                            safety sentence, whose marks already exist in the section that carries it,
 *                            so the same sentence would be marked twice — PLUS, on the reported popup,
 *                            the single mark `Recent practice suggests I need`: a sentence opening, cut
 *                            mid-phrase, and not a keyword at all
 *
 * ⛔ The reason the section was closed in the first place still holds for the OTHER classes: an
 * instruction marked here is nexpath telling itself what to do, drawn louder than anything the developer
 * asked for. What changed is that its NAMED FACT is not that — it is the subject of the guidance, and it
 * arrives as data (`groundedFactValues`), not as prose this module had to guess at.
 */
export const TERM_ONLY_SECTION_KINDS: ReadonlySet<string> = new Set([
  'source_signal_guidance',
]);

/**
 * The openers a clause may start after when one appears in the MIDDLE of a line.
 *
 * A verb anywhere else — mid-sentence, inside the developer's restated prompt, inside a sentence the
 * pipeline inserted — is not an instruction to the agent; it is the body talking about something. The
 * first-person heads are here because the composer writes as the agent.
 *
 * ⚠️ **Deliberately a SUBSET of {@link CLASS_1_WRAPPERS}, and the two jobs are different.** That list is
 * everything a clause can wear, peeled off the FRONT; this one is where a NEW clause can begin after a
 * comma. `emphasis-classes-list-agreement.test.ts` pins the containment so the two cannot contradict
 * each other.
 *
 * ⏪ **Merging them was built on 2026-09-29 and withdrawn on measurement.** The gap was real: on a
 * reported popup, `If anything goes wrong in this sequence, we gotta consider it a fail.` drew nothing,
 * because `we gotta` is a wrapper and was not a head. Merging finds it — and costs far more than it
 * names, because the per-section cap is already binding:
 *
 *   merged, all 76 wrappers   class 1  118 → 144  ·  class 4  33 → 25  ·  class 3  18 → 15  (222 marks)
 *   narrowed to 22 heads      class 1  118 → 130  ·  conditions and boundaries still spent  (216 marks)
 *
 * Eleven of the reader's "what must not happen" and "what comes first" marks buy twenty-six more
 * actions. That is a CAP-PRIORITY ruling, not a bug fix — the cap spends 5→1→2→3→4 and this decides how
 * much of a section class 1 may take — and it belongs to the owner. Recorded in the plan's §5L for that
 * decision rather than taken here.
 */
const CLASS_1_MIDSENTENCE_HEADS: readonly string[] = [
  'you must',
  'i need you to',
  'make sure to',
  "i'll",
  'i will',
  'i need to',
  'i should',
  'i can',
  "let's",
  // Sequencing words. They put the steps in order; they are not someone doing something, so a verb
  // behind one still opens its clause — the same reading a list marker gets. The composer writes
  // step lists this way almost every time: `First, … Next, … Then, … Finally, …`.
  'first,',
  'next,',
  'then,',
  'after that,',
  'finally,',
  'lastly,',
];

/**
 * What a clause can WEAR in front of its verb, peeled off before the verb is looked for.
 *
 * {@link CLASS_1_MIDSENTENCE_HEADS} finds one head at a time, anywhere in the line. That is the right
 * mechanism for a head in the MIDDLE of a sentence, and the wrong one for what the composer actually
 * writes, which is several of these stacked: `First, I'll need to check the logs`. Read head by head,
 * `first,` leaves `I'll need to check…` — words in front of the verb — and `i'll` leaves
 * `need to check…`, words in front of the verb again. The clause is refused with a good verb in it.
 *
 * So the front of the clause is peeled REPEATEDLY until nothing more comes off, and whatever is left
 * is what gets asked "does a verb open this".
 *
 * ⛔ **Nothing here may itself be a verb the lists hold.** Peeling a verb would hand the clause to the
 * word behind it — `ensure the data is clean` would become `the data is clean`, which instructs
 * nobody. That is why the modals appear only in a pronoun-led run (`i need to`, never a bare `need`)
 * and why `make sure that` is here while a bare `make` is not.
 *
 * Sorted longest-first at use, because the short ones are prefixes of the long ones: peeling
 * `make sure` out of `make sure to verify` would leave `to verify` and refuse it.
 */
const CLASS_1_WRAPPERS: readonly string[] = [
  // A pronoun and its modal. The composer writes as the agent, so these open most of its sentences.
  "i'll need to", "we'll need to", "i need to", "we need to", "you need to", 'i need you to',
  'i have to', 'we have to', "i'm going to", 'i am going to', "we're going to", 'we are going to',
  'i want to', "i'd like to", 'i should', 'we should', 'you should', 'you must', 'i can', 'we can',
  'i will', 'we will', "i'll", "we'll", "i'm", "we're", "let's", 'let us',
  // The modal run on its own, for when a clause head above already took the pronoun off. `I'll` is one
  // of {@link CLASS_1_MIDSENTENCE_HEADS}, so `…, I'll need to gather that info too.` arrives here as
  // `need to gather…` — measured on a reported popup, where the instruction drew nothing at all.
  // ⚠️ Every one of these ends in `to`, which is what makes them safe: `plan to run the tests` is
  // peeled and `plan a dry run` is untouched.
  'need to', 'needs to', 'have to', 'has to', 'had to', 'going to', 'want to', 'wants to',
  'would like to', 'like to', 'try to', 'tries to', 'trying to', 'ought to', 'able to',
  'plan to', 'plans to', 'intend to', 'aim to', 'hope to', 'expect to', 'continue to',
  'gotta', 'we gotta', 'i gotta', 'you gotta',
  // Insistence and politeness.
  'make sure to', 'make sure that', 'make sure', 'ensure that', 'be sure to', 'please',
  // Sequencing. These put the steps in order; they are not someone doing something.
  'first,', 'firstly,', 'second,', 'secondly,', 'third,', 'next,', 'next up,', 'then,', 'after that,',
  'finally,', 'lastly,', 'additionally,', 'also,', 'importantly,', 'specifically,',
];

/**
 * The same text with a typographic apostrophe read as a plain one.
 *
 * ⚠️ **Not cosmetic — it decided whether a wrapper came off at all.** The composer writes `Let’s` and
 * `I’ll` with U+2019, the lists here are written with U+0027, and `startsWith` compares bytes. Measured
 * on the recorded bodies, `Let’s break this epic into clear milestones` kept its wrapper and produced
 * the mark `Let’s break this epic into clear` — a wrapper, a verb and a cut object, all in bold.
 *
 * Length is preserved (one character for one character), so an offset taken from the normalised text
 * still points at the same place in the original.
 */
function withPlainApostrophes(text: string): string {
  return text.replace(/[‘’ʼ`´]/g, "'");
}

/** The wrappers longest-first, so a short one cannot peel the front off a long one. */
const CLASS_1_WRAPPERS_LONGEST_FIRST: readonly string[] = [...CLASS_1_WRAPPERS].sort(
  (left, right) => right.length - left.length,
);

/**
 * A clause with every wrapper peeled off its front.
 *
 * A wrapper only comes off at a word boundary: `I cannot check the file` starts with `i can`, and
 * peeling it would leave `not check the file` — which the verb test would then refuse for the right
 * reason by accident. Requiring the boundary refuses it for the right reason on purpose.
 */
function withoutClauseWrappers(clause: string): string {
  let text = clause.trim();
  for (let peeled = true; peeled; ) {
    peeled = false;
    const lower = withPlainApostrophes(text.toLowerCase());
    for (const wrapper of CLASS_1_WRAPPERS_LONGEST_FIRST) {
      if (!lower.startsWith(wrapper)) continue;
      const next = text.charAt(wrapper.length);
      if (next.length > 0 && /[A-Za-z]/.test(next) && /[a-z]$/.test(wrapper)) continue;
      text = text.slice(wrapper.length).replace(/^[\s,]+/, '');
      peeled = true;
      break;
    }
  }
  return text;
}

/**
 * The read verbs that are instructions too.
 *
 * *Find the bug*, *make a report*, *read the logs* — each is work the body is telling the agent to
 * do, and a developer scanning the popup needs to see it as plainly as a write. The list is the
 * approved starting set; it can still be edited.
 *
 * ⏪ **Widened again 2026-09-28** by `create`, `develop`, `establish`, `outline`, `assess`,
 * `determine`, `clarify`, `prioritize`, `provide`, `break`, `tie` and `set up` — each seen opening a
 * real instruction in the recorded bodies, counted by an audit of every sentence in every markable
 * section. Measured together: class 1 46 → 69, sections carrying a mark 65 → 75 of 129, and the
 * densest body unmoved at 43.5 %.
 *
 * ⛔ `name` was in that list and was left out. All four of its marks were
 * `Name risky or irreversible actions, ask for required confirmation…`, the composer's own template
 * line for the risk section — the same shape as `cover` below, and refused for the same reason.
 *
 * ⏪ **`cover` was removed again 2026-09-28.** Every mark it produced across the recorded bodies was
 * the composer's own template sentence — `Cover Scope and non-goals for this request with concrete,
 * source-backed specifics…` — which is Nexpath instructing itself, not anything about the developer's
 * request. It survived the 2026-09-27 census because the object gate was refusing it in every body,
 * so the census counted a verb whose marks never reached a screen. Removing it costs 4 marks and
 * nothing else.
 *
 * ⏪ **Widened 2026-09-27** by `cover`, `document`, `gather`, `define`, `specify` — counted, not
 * chosen. Across 35 recorded bodies, 273 clause openings outside the never-marked sections were
 * censused and only **14** matched any shipped list; these five are the verbs that turned up and that
 * name WORK.
 *
 * ⏪ **Widened again 2026-09-28** by `design`, `implement`, `embed`, `calculate`, `display` — the
 * verbs a step list uses. They were worth nothing on their own and are only worth something beside
 * the sentence scan in {@link classOneOfLine}: a step list is written as one line, and until that
 * line was read sentence by sentence none of its verbs could open a clause. Measured together:
 * sections drawing 43 → 44, marks 96 → 98, densest body and section unmoved.
 *
 * ⛔ **The widening stopped there, and both further steps were declined on measurement.**
 * `make`, `include`, `name`, `add` added **no marks at all** — risk with no benefit.
 * `ensure`, `start`, `calculate`, `display`, `implement` traded two actions for two conditions, a
 * net change of nothing, using the ordinary planning vocabulary that no verification or acceptance
 * section can avoid — the same reason the escalation verbs were narrowed in the safety module.
 *
 * ⛔ **This list, and only this list.** `EXECUTION_VERB` and `ALWAYS_ESCALATE_PATTERN` are imported
 * from the safety module and drive authority classification there; widening one of those would change
 * what the pipeline generates rather than what the popup emphasises.
 *
 * ⚠️ They rank BELOW writes when the cap bites, which is what {@link
 * PromptEnhancementEmphasisCandidateV1.isWriteVerb} carries.
 */
const READ_VERB = /\b(?:check|compare|look at|inspect|report|confirm|find|read|review|verify|test|investigate|identify|list|document|gather|define|specify|design|implement|embed|calculate|display|create|develop|establish|outline|assess|determine|clarify|prioritize|provide|break|tie|set up)\b/i;

/**
 * The words that open a clause WITHOUT instructing: a subject, an article, a connective, a question
 * word, or one of the nouns the composer's own sections are named after.
 *
 * 🔑 **This is the list the standard now depends on being complete, and it replaces one that could not
 * be.** Until 2026-09-29 an instruction was "a verb from an approved list at the head of its clause",
 * and the list had been widened five times. Counted over every clause opening in every body available
 * — the 35 recorded and 3 reported — with the wrappers above peeled off:
 *
 *   352 sentences · 164 open on a subject (a description, rightly unmarked) · 188 open on a word that
 *   could be a verb · the shipped lists hold 77 of those (41 %) · 55 distinct verbs they do not hold ·
 *   **39 of those 55 appear exactly ONCE (71 %)**
 *
 * A tail that shape does not get shorter by being sampled. Adding the four verbs the three reported
 * popups needed — `integrate`, `trigger`, `clear`, `link` — fixes those three popups and leaves the
 * tail exactly as long, because the vocabulary is the DEVELOPER'S and there is no reason it should
 * ever be enumerable.
 *
 * So the question is inverted. The words a reader must be right about are no longer the verbs the
 * world can write — unbounded — but the openers that are plainly not instructions, which is a closed
 * class of the language plus the handful of nouns this product's own section headings use. That list
 * can be finished, and this is it.
 *
 * ⛔ **A word in one of the verb lists is admitted whether or not it is here.** The test is built as
 * `a known verb OR not a known non-instruction`, so every mark the approved lists produced before this
 * change still survives it, and `emphasis-classes.test.ts` pins that direction. An accidental entry
 * here can therefore narrow nothing that used to work.
 */
const NOT_AN_INSTRUCTION_OPENER: ReadonlySet<string> = new Set([
  // Subjects and determiners. A clause that opens on one of these is telling, not asking.
  'i', 'we', 'you', 'they', 'it', 'he', 'she', 'this', 'that', 'these', 'those', 'there', 'here',
  'the', 'a', 'an', 'my', 'our', 'its', 'their', 'his', 'her', 'your',
  // ⚠️ Contracted, because the opener is read as a WORD and an apostrophe is part of one. Without
  // these, `We'll judge it on our ability` was admitted with `We'll` as its verb and drew the wrapper
  // in bold — measured, on a recorded body. The peel above normally takes them off first; this is the
  // second line of defence, for a contraction the peel does not know.
  "i'll", "we'll", "you'll", "they'll", "it'll", "i'm", "we're", "you're", "they're", "he's", "she's",
  "it's", "that's", "there's", "here's", "who's", "what's", "let's", "i've", "we've", "you've",
  "i'd", "we'd", "you'd", "they'd", "don't", "doesn't", "didn't", "won't", "can't", "shouldn't",
  "wouldn't", "couldn't", "isn't", "aren't", "wasn't", "weren't", "hasn't", "haven't", "hadn't",
  // ⚠️ `not` and `neither` were missing until a test of this very rule caught them: `I cannot check
  // the auth middleware yet` reaches the opener test as `not check the auth middleware yet` — the
  // clause head `i can` takes `I can` off and leaves the negation standing — and drew exactly that.
  'any', 'all', 'each', 'both', 'no', 'not', 'neither', 'none', 'nothing', 'everything', 'anything', 'something',
  'someone', 'anyone', 'everyone', 'some', 'most', 'many', 'few', 'several', 'one', 'two',
  // Connectives and subordinators. They join clauses; they do not start work.
  'if', 'when', 'while', 'once', 'after', 'before', 'without', 'unless', 'until', 'since', 'because',
  'though', 'although', 'whereas', 'therefore', 'thus', 'hence', 'otherwise', 'meanwhile',
  'for', 'to', 'in', 'on', 'at', 'by', 'as', 'so', 'and', 'but', 'or', 'nor', 'from', 'with',
  'about', 'into', 'onto', 'over', 'under', 'per', 'via', 'within', 'across', 'between', 'during',
  // Question words. A body asking itself something is not instructing the agent.
  'what', 'how', 'why', 'where', 'which', 'who', 'whom', 'whose', 'whether',
  // Participles and gerunds. `Looking at the diff, …` and `Based on the evaluation, …` are the body
  // framing what follows — the instruction, if there is one, comes after the comma and is reached by
  // the clause heads.
  'based', 'looking', 'given', 'considering', 'regarding', 'according', 'using', 'assuming',
  'gathering', 'understanding', 'depending', 'including', 'following', 'starting', 'being', 'having',
  // Bare modals and auxiliaries left standing when a wrapper peeled only part of a run.
  'is', 'are', 'was', 'were', 'be', 'been', 'am', 'has', 'have', 'had', 'does', 'do', 'did',
  'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must', 'need', 'gotta',
  // Adverbs and fillers that survive the peel.
  'just', 'only', 'even', 'still', 'also', 'again', 'already', 'always', 'never', 'often',
  'currently', 'right', 'now', 'then', 'next', 'first', 'finally', 'basically', 'actually', 'really',
  'yes', 'no-op', 'ok', 'okay', 'maybe', 'perhaps', 'ideally', 'preferably', 'likely', 'possibly',
  // Adjectives that open a fragment the composer writes as a label.
  'expected', 'possible', 'manual', 'open', 'finished', 'current', 'every', 'same', 'other', 'new',
  'previous', 'existing', 'available', 'necessary', 'important', 'critical', 'key', 'main', 'overall',
  // Nouns this product's own headings and lines are built from. These open a DESCRIPTION of the
  // section, which is the composer talking about its own structure rather than about the request.
  'success', 'completion', 'risk', 'risks', 'safety', 'scope', 'goal', 'goals', 'context', 'baseline',
  'user', 'users', 'data', 'email', 'session', 'orders', 'order', 'ui', 'backend', 'frontend',
  'behavior', 'behaviour', 'output', 'input', 'result', 'results', 'state', 'steps', 'step',
  'criteria', 'assumptions', 'constraints', 'dependencies', 'requirements', 'note', 'notes',
]);

/**
 * A finite verb, which is what a SUBJECT has and an imperative does not.
 *
 * `Task 2 must be wrapped up before Task 3` opens on a word no list holds and that is not a known
 * non-instruction opener, so the inverted test admits it — and it is a description of the plan, not an
 * instruction to anybody. What gives it away is not the opener but what comes after: a subject is
 * followed by a modal or a form of *be* or *have*, and an imperative is followed by its object.
 *
 * ⛔ **Applied only where the inverted test did the admitting.** `Check that the app's home page WILL
 * respect the new breakpoint` is an instruction with a modal in its object, and it has been a mark
 * since the first version of this module. The test below never sees it, because `check` is a listed
 * verb and a listed verb is admitted before this is asked — which is the same superset rule the rest of
 * this change is built on.
 *
 * ⛔ **The search stops at a relative pronoun**, and that is load-bearing rather than tidy. An
 * imperative's OBJECT may carry a relative clause with a modal in it — `enumerate the checks THAT MUST
 * pass before release` — and without the stop the modal inside the object was read as the modal after a
 * subject, and a good mark was refused. Measured: it cost `enumerate the checks`, and nothing else
 * changed when the stop was added.
 */
const FINITE_VERB_AFTER_SUBJECT =
  /^\s*(?:(?!(?:that|which|who|whom|whose|where|when|if|unless|because)\b)[A-Za-z0-9'’-]+\s+){0,3}?(?:must|should|shall|will|would|can|could|may|might|is|are|was|were|has|have|had)\b/i;

/**
 * Does this word carry a third-person `-s`?
 *
 * 🔑 **An English imperative never does**, and that one fact settles the shape the inverted rule could
 * not otherwise tell from an instruction: a clause whose subject is a bare noun.
 * `Limit applies to POST /api/upload only` is the standard's own worked example, and it is a
 * CONSTRAINT being stated — its marks are the developer's term and the limiter, never an action. Read
 * as grammar, `Limit` is a fine imperative verb and no opener list can say otherwise. `applies` can.
 *
 * Two shapes, both answered here:
 *   `Uses alpha-one`            — the OPENER carries the `-s`, so the opener is not an imperative.
 *   `Cache reads go through …`  — the word AFTER it does, so the opener is that verb's subject.
 *
 * ⛔ `-ss` and `-us` are exempt, because a real imperative can end that way: `process the queue`,
 * `address the warning`, `discuss the trade-off`, `focus on the endpoints`. Words under four letters are
 * exempt too (`ops`, `abs`), and so is anything already named a non-instruction opener — which is what
 * lets `capture this output` and `carry forward the requirements` keep their marks, since `this` and
 * `requirements` are listed there.
 *
 * ⚠️ **The cost, stated plainly.** An UNLISTED verb followed straight by a bare plural —
 * `capture screenshots`, `draft notes` — is refused, because nothing in the words themselves separates
 * it from `Cache reads`. A listed verb never reaches this test, so `run tests`, `review findings`,
 * `gather requirements` and `check logs` are unaffected; measured over the recorded bodies, the shape
 * costs no mark that was there before.
 */
function carriesThirdPersonS(word: string): boolean {
  const lower = withPlainApostrophes(word.toLowerCase());
  if (lower.length < 4) return false;
  if (NOT_AN_INSTRUCTION_OPENER.has(lower)) return false;
  return /(?<![su])s$/.test(lower);
}

/**
 * Is this word a participle or a gerund — a form an imperative can never take?
 *
 * The same kind of fact as the `-s` above, and it closes the other two shapes the inverted rule was
 * marking. Both were measured on the reported popups:
 *
 *   `Adding test cases to the suite…`          — a gerund NAMING the work, in a sentence about it.
 *   `limited by what the Stripe API allows`    — a past participle, describing a constraint.
 *
 * ⛔ `-eed` and `-ead` are exempt, because a handful of real imperatives end that way: `proceed`,
 * `exceed`, `succeed`, `feed`, `read`, `spread`, `lead`. Nothing else has to be, since no English
 * imperative ends in `-ing` at all — and a verb the approved lists hold never reaches this test, so
 * `embed` keeps its marks through the same superset rule everything else here relies on.
 *
 * ⚠️ **Under five letters is exempt too**, which keeps `used`, `made`, `need` and `feed` out of it: a
 * four-letter word ending in `-ed` is far more often the verb itself than a participle, and the shape
 * this is here to refuse — `Adding test cases`, `limited by what …` — is never that short.
 */
function isParticipleOrGerund(word: string): boolean {
  const lower = withPlainApostrophes(word.toLowerCase());
  if (lower.length < 5) return false;
  if (NOT_AN_INSTRUCTION_OPENER.has(lower)) return false;
  if (lower.endsWith('ing')) return true;
  return lower.endsWith('ed') && !lower.endsWith('eed') && !lower.endsWith('ead');
}

/**
 * A contracted subject-and-verb. What follows one is a CLAUSE, not an object.
 *
 * `I'll know it's done when the bar appears` — measured on a reported popup, where it drew
 * `know it's done`. An instruction acts on a thing; `it's done` is a sentence, so the word in front of
 * it is reporting rather than instructing.
 *
 * ⛔ Only reached on the inverted path, so `confirm it's saved` and `verify it's working` keep their
 * marks — `confirm` and `verify` are listed verbs and are admitted before this is asked.
 */
const CONTRACTED_SUBJECT_AND_VERB: ReadonlySet<string> = new Set([
  "it's", "that's", "there's", "he's", "she's", "they're", "we're", "you're", "i'm", "what's", "who's",
]);

/**
 * Whether this clause opens the way an instruction opens.
 *
 * Read as: a verb one of the approved lists already holds — so nothing that worked before can stop
 * working — **or** any word that is not one of the openers above, does not carry a third-person `-s`,
 * is not a participle or a gerund, and is not the subject of a sentence that is merely describing.
 */
function opensAnInstruction(rest: string, knownVerbAtStart: boolean): boolean {
  if (knownVerbAtStart) return true;
  const opener = /^[A-Za-z][A-Za-z'-]*/.exec(rest);
  if (opener === null) return false;
  if (NOT_AN_INSTRUCTION_OPENER.has(opener[0].toLowerCase())) return false;
  if (carriesThirdPersonS(opener[0])) return false;
  if (isParticipleOrGerund(opener[0])) return false;
  const after = rest.slice(opener[0].length);
  const second = /^[^A-Za-z]*([A-Za-z][A-Za-z'’-]*)/.exec(after);
  if (second !== null) {
    if (carriesThirdPersonS(second[1]!)) return false;
    if (CONTRACTED_SUBJECT_AND_VERB.has(withPlainApostrophes(second[1]!.toLowerCase()))) return false;
  }
  return !FINITE_VERB_AFTER_SUBJECT.test(after);
}

/** Words that end a phrase: the next clause has started, so the object has finished. */
const CLAUSE_BOUNDARY = /[,.;:!?]|\bbefore\b|\bafter\b|\bonce\b|\bunless\b|\buntil\b|\bonly if\b|\brather than\b/i;

/**
 * The longest a boundary or a condition may run and still be a mark.
 *
 * Both classes take the word plus the clause it governs, and a clause can be a whole sentence: the
 * longest measured was twenty-two words. Emphasis works by contrast, and a sentence in bold is a
 * paragraph a reader skips rather than a phrase they catch (owner, 2026-09-27).
 *
 * ⛔ Eight, and the number was found rather than picked. Seven was tried first, from a reading that
 * kept `do not affect unrelated files or behaviors` (7 words) — and a test then caught
 * `Do not delete the audit log while refactoring` (8 words) being dropped. Those are the SAME shape,
 * and splitting them on one word is arbitrary; worse, the section holding the second went entirely
 * blank, because its boundary went to the ceiling and its lone remaining condition then went to the
 * "a condition alone is dropped" rule below.
 *
 * Measured: of the class 3 and 4 marks that survive, 55 of 62 are two to five words and only four
 * are seven. Nothing crowds this line, so where it sits decides very little except whether one
 * shape is cut in half.
 *
 * ⛔ **Classes 1, 2 and 5 are deliberately outside this.** Class 2 has never produced a mark over
 * four words and class 5 never over four, so a ceiling there has nothing to do. Class 1 is the
 * instruction — the mark a reader most needs — and it builds `verb + clause` where class 2 builds a
 * noun phrase, so every ceiling measured took nearly all of them away. Shortening class 1 is a
 * change to how its phrase is BUILT, and it is a separate question.
 */
const CLASS_3_AND_4_MAX_WORDS_V1 = 8 as const;

/**
 * The longest an instruction may run and still be a mark.
 *
 * ⏪ **Class 1 had no ceiling until 2026-09-28, and that was right while it had six marks in the whole
 * corpus** — nothing to control. Opening the object gate took it to 57, and eight of those ran past
 * eight words: `Verify if there are any specific libraries or frameworks we should use or avoid`,
 * `confirm that we have backups of the current state in case reversion is necessary`. A popup line is
 * about twelve words wide, so those are the full line in bold.
 *
 * Measured at eight: class 1 keeps 50 of 57, sections drawing 73 → 69, and no mark anywhere runs past
 * the line. The shortening in {@link instructionObjectOnly} does the work first and this only catches
 * what it cannot — which is why it drops rather than truncates: a truncated phrase was measured and
 * rejected once already.
 */
const CLASS_1_MAX_WORDS_V1 = 8 as const;

/** A hard negation or scope limiter. */
const CLASS_3_BOUNDARY_WORDS: readonly string[] = ['do not', 'must not', 'never', 'without', 'only', 'not'];

/** The last entry above, which is the only one that needs the governor test below. */
const BARE_NOT = 'not' as const;

/**
 * What a bare `not` must be negating to count as a limit.
 *
 * `not` is a negator: it needs a verb to negate. `do not`, `must not` and `never` carry their own
 * verb and are matched whole, so a BARE `not` only ever reaches here when neither did — and there
 * it is doing one of two very different jobs:
 *
 *   `you should not send the request`   — a limit. `should` is what it negates.
 *   `practices like not sharing keys`   — a practice being NAMED. It negates nothing; the phrase
 *                                         is a noun, and marking it emphasises a description
 *                                         rather than a constraint.
 *
 * ⚠️ Class 1 already refuses the same shape for the same reason — *"only a verb that opens the
 * clause counts; one buried further in is the body describing something, not instructing"*. Class 3
 * had no equivalent test, which is the asymmetry this closes, not a special case.
 *
 * The test is on the word BEFORE, not on where the word sits: a limiter is a limiter wherever it
 * falls in a sentence, and what makes this one a limiter is that it has something to negate.
 */
const NEGATION_GOVERNOR =
  /\b(?:do|does|did|must|shall|should|will|would|can|could|may|might|is|are|was|were|be|been|being|am|has|have|had|need|dare)$/i;

/** Whether the bare `not` at this offset is negating a verb rather than sitting inside a phrase. */
function bareNotIsGoverned(line: string, at: number): boolean {
  return NEGATION_GOVERNOR.test(line.slice(0, at).trimEnd());
}

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
 *
 * Exported for the optional model pass, which must not be shown those sentences either: a phrase
 * it cannot see is a phrase it cannot propose, which is stronger than asking it not to. Its reply
 * is filtered again on the way back, so this is the first of two guards and not the only one.
 *
 * ⚠️ **Visibility only.** The behaviour is unchanged, and the classes it feeds are pinned by their
 * own tests — an edit here has to come past them.
 */
export function maskInsertedText(sectionText: string, sensitiveActionName?: string): string {
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

/**
 * Where a second thought begins. A class-1 mark stops here.
 *
 * The instruction is the verb and the thing it acts on; everything after one of these is the body
 * explaining, qualifying or adding — *"List out the exact steps **that lead to** hitting this null
 * error"*. Keeping the explanation makes the mark a sentence, and a sentence in bold is a paragraph
 * a reader skips.
 */
const CLASS_1_SECOND_THOUGHT: readonly string[] = [
  'that', 'which', 'so', 'to', 'for', 'while', 'when', 'after', 'before', 'and', 'because', 'since', 'if', 'whether',
  // ⏪ Added 2026-09-28, once the gate above stopped refusing most instructions and the long ones
  // became visible: `run user testing sessions WHERE participants will interact with the button`,
  // `Document these potential residual risks BASED on the evaluation of the diff`, `Identify the
  // dependencies AMONG the tasks defined in the previous section`. Each of those turns from the work
  // to the circumstances of the work. Measured: marks over eight words 12 → 8, median 6 → 5, and not
  // one mark lost — they are shortened, never dropped.
  'where', 'based', 'among',
];

/**
 * The fewest words a shortened instruction may keep: a verb and something to act on.
 *
 * ⚠️ Load-bearing, and the reason the rule is not simply "stop at the first one of those". `that`
 * can introduce the object itself — *"Check **that** the app's home page will respect…"* — and
 * stopping there leaves `Check` alone, which tells a reader nothing. Below this, the search goes on
 * to the next one.
 */
const CLASS_1_MIN_WORDS = 3 as const;

/**
 * An instruction cut back to the verb and its object.
 *
 * Measured over every class-1 mark the recorded bodies produce, plus a real popup's: median 13 → 7
 * words, longest 21 → 10, none left under three, and none cut mid-phrase — the stop is always a word
 * boundary the language itself provides.
 *
 * ⛔ A hard word ceiling was measured beside this and rejected: it produced `gather proof of what the
 * payments module currently` and `Check what specific diff files or changes are` — shorter, and
 * broken. A whole phrase reads better than a truncated one.
 */
/**
 * Words a phrase cannot END on: a conjunction, an article, a preposition or a bare auxiliary. Each
 * one promises something after it, and a mark that keeps the promise unkept reads as a cut sentence.
 *
 * ⛔ **Pronouns are deliberately absent.** `Without this`, `After that` and `after I refactor it` end
 * on one and are all complete; trimming them would make the mark worse, not better.
 */
const CANNOT_END_A_PHRASE: readonly string[] = [
  'and', 'or', 'but', 'the', 'a', 'an',
  'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'into', 'by', 'as',
  'is', 'are', 'was', 'were', 'be', 'been',
  // ⏪ Added 2026-09-29. The same closed class as the prepositions above, and each one turned up
  // holding a mark open: `check the results against the captured`, `compare the outcomes between`.
  'against', 'between', 'within', 'across', 'during', 'upon', 'onto', 'than', 'that', 'which', 'such',
  // ⛔ `about`, `like`, `over`, `through` and `under` were in this list for one measurement and taken
  // back out. They finish a PHRASAL VERB, so trimming them broke the phrase it was meant to mend:
  // `Only change what we talked about` became `…we talked`, and `Define what success looks like` became
  // `…success looks`. A preposition at the end of a phrase is not always a promise unkept.
  // Relational participles. They introduce what the thing relates TO, and the mark stops before it:
  // `Review the privacy policies related`, `ensure we clarify any concerns related`, `judge success
  // based`, `confirm what the expected behavior is compared`.
  'related', 'based', 'compared', 'regarding', 'concerning', 'associated', 'coming', 'due',
];

/**
 * ⏪ **The dangling-participle trim was built on 2026-09-29 and REMOVED the same day.** It is recorded
 * here rather than deleted, because the reason it failed is the reason not to try it again.
 *
 * It trimmed a phrase ending `<preposition> <word ending in -ing or -ed>`, to mend
 * `ensure stakeholder satisfaction by confirming` — one mark, where the clause boundary had taken the
 * gerund's own object with it.
 *
 * ⛔ `-ing` does not mean gerund. English is full of ordinary NOUNS that end in it, and the rule cut
 * every one of them off a phrase: measured on the owner's own reported popup, `sort them by rating`
 * became `sort them` — `rating` read as a participle, then `by` went as a hanging preposition, and two
 * words of nothing were left in bold. `setting`, `building`, `warning`, `listing`, `pricing`,
 * `training`, `shipping`, `heading`, `timing` and `meeting` are all the same trap.
 *
 * It also had to be taught, in its one day, that the preposition may not be the phrase's FIRST word —
 * a class-4 condition IS a preposition and its object, and `After linking` was being cut to `After`.
 * Two corrections for one mark's worth of tidiness, against a whole class of nouns, is a bad trade.
 *
 * What remains for that one mark: nothing. It reads `ensure stakeholder satisfaction by confirming`,
 * and a slightly long mark is better than a broken short one — which is the ruling §5C already made
 * when a hard word ceiling was measured and rejected for producing
 * `gather proof of what the payments module currently`.
 */

/**
 * A participle left holding a determiner with no noun behind it.
 *
 * `check the results against the captured` — the clause boundary took the noun after `captured`, and
 * what is left promises something the reader never gets.
 *
 * ⛔ **Narrow on purpose, and narrower than the rule above that had to be withdrawn.** Only `-ed`, never
 * `-ing`: nouns ending in `-ing` are everywhere (`rating`, `setting`, `warning`, `pricing`) and cutting
 * them broke real phrases. And only after a DETERMINER, never after a preposition: `the captured` has
 * lost its noun, while `sort them by rating` and `focus on the changes made` have not — in both of those
 * the `-ed`/`-ing` word is the phrase's own last noun or its complete modifier.
 *
 * ⛔ **A VOWEL before the `-ed` is exempt**, which is what `[^aeiou\s-]` says. It covers the reason
 * {@link isParticipleOrGerund} lists `-eed` and `-ead` — `the feed`, `the spread`, `the lead` are nouns
 * — and covers `agreed` and `succeed` with it. The two rules therefore reach the same answer by
 * different means, and neither is derived from the other.
 */
const DETERMINER_THEN_BARE_PARTICIPLE =
  /\b(?:the|a|an|this|that|these|those)\s+[A-Za-z-]*[^aeiou\s-]ed$/i;

/**
 * A phrase with any hanging tail removed.
 *
 * Applied to every class, because every class has a rule that can cut: the clause boundary, the
 * eight-word ceilings, and the instruction's second-thought stop. Measured over the 35 recorded
 * bodies: 8 marks ended on such a word and 4 of them were plainly cut — `before and`,
 * `verify if these requirements are`, `Verify the filtering functionality is`.
 */
function withoutHangingTail(phrase: string): string {
  let words = phrase.trim().split(/\s+/);
  while (words.length > 1) {
    const last = (words[words.length - 1] ?? '').toLowerCase().replace(/[^a-z']/g, '');
    const phrase = words.join(' ');
    if (!CANNOT_END_A_PHRASE.includes(last) && !DETERMINER_THEN_BARE_PARTICIPLE.test(phrase)) break;
    words = words.slice(0, -1);
  }
  return words.join(' ');
}

function instructionObjectOnly(phrase: string): string {
  const words = phrase.trim().split(/\s+/);
  for (let index = CLASS_1_MIN_WORDS; index < words.length; index++) {
    if (CLASS_1_SECOND_THOUGHT.includes(words[index]!.toLowerCase())) return words.slice(0, index).join(' ');
  }
  return phrase;
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

/**
 * The verb that comes FIRST in a clause, whichever list holds it.
 *
 * All three lists are consulted and the earliest match wins. A tie cannot happen on the same span —
 * the patterns match whole words — and where two lists would match the same word the execution
 * reading is taken, because {@link PromptEnhancementEmphasisCandidateV1.isWriteVerb} is read off the
 * matched text afterwards and a write must never be ranked as a read.
 */
function earliestVerbIn(rest: string): RegExpExecArray | null {
  const matches = [EXECUTION_VERB.exec(rest), ALWAYS_ESCALATE_PATTERN.exec(rest), READ_VERB.exec(rest)]
    .filter((match): match is RegExpExecArray => match !== null);
  if (matches.length === 0) return null;
  return matches.reduce((best, match) => (match.index < best.index ? match : best));
}

/**
 * The first word of a clause, and where it sits.
 *
 * Used when no approved list holds it — the clause is admitted on its opener not being one of the
 * non-instruction openers, and the mark is then built from that word exactly as it would be from a
 * listed verb.
 */
function openerOf(rest: string): { index: number; length: number; word: string } | null {
  const match = /[A-Za-z][A-Za-z'-]*/.exec(rest);
  if (match === null || match.index !== rest.search(/[A-Za-z]/)) return null;
  return { index: match.index, length: match[0].length, word: match[0] };
}

/** The class-1 candidates of one line: an instruction, with something it acts on. */
function classOneOfLine(line: string): PromptEnhancementEmphasisCandidateV1[] {
  // 🔑 **A line nexpath wrote about the section earns nothing.** `Name risky or irreversible actions…`
  // and `Cover Scope and non-goals…` are flawless instructions as language — imperative verb,
  // concrete object — so the grammar below cannot tell them from the developer's work, and the
  // loudest thing on the screen would be nexpath's own suggestion. The verb list used to keep them out
  // by refusing `cover` and `name` outright, which cost those verbs everywhere else; naming the LINES
  // costs nothing else.
  //
  // Tested before the sentence split so a line whose own punctuation divides it — `Ask only for
  // missing decisions…; otherwise proceed…` — is recognised whole, and again on each sentence through
  // the recursion below, so one appended to a developer's sentence is still caught.
  if (isPromptEnhancementComposerOwnLineV1(line)) return [];

  // A list marker is punctuation, not a word, so a verb behind one still OPENS its clause. The
  // composer writes almost every instruction as `- Check that …`, and without this the marker sat in
  // front of every verb and the "only a verb that opens the clause counts" test below refused all of
  // them: measured on a real body, three verbs fire without the marker and none with it.
  //
  // The offsets the marks are placed at are found again in the FULL text later, so trimming here
  // costs nothing downstream — it only decides what the phrase is.
  line = line.replace(/^\s*[-•*]\s+/, '');

  // A composed line usually holds SEVERAL sentences, and each one is its own instruction. Judged as
  // one line, the first execution verb anywhere in it decides the fate of all of them: on a real
  // body, `- First, design the layout … Then, embed functionality that lets users update quantities
  // and delete items.` was refused whole, because `delete` sits in the third sentence with words in
  // front of it. Five instructions, none of them ever looked at.
  //
  // The offsets are found again in the FULL text later, so splitting costs nothing downstream — it
  // only decides which words are weighed against "does a verb open this clause".
  const sentences = line.split(/(?<=[.;!?])\s+/).filter((part) => part.trim().length > 0);
  if (sentences.length > 1) return sentences.flatMap((sentence) => classOneOfLine(sentence));

  // Normalised, so `I’ll` and `I'll` are the same head. Length is preserved, so the offsets below
  // still index `line`.
  const lower = withPlainApostrophes(line.toLowerCase());
  // The verb has to head a clause — sentence-initial, or straight after one of the mid-sentence heads.
  const heads = new Set<number>([0]);
  for (const head of CLASS_1_MIDSENTENCE_HEADS) {
    const at = lower.indexOf(head);
    if (at >= 0) heads.add(at + head.length);
  }

  const found: PromptEnhancementEmphasisCandidateV1[] = [];
  for (const head of heads) {
    // …and whatever the clause is still WEARING comes off before the verb is looked for, however many
    // layers of it there are. See {@link CLASS_1_WRAPPERS}: the head list finds one at a time, and the
    // composer stacks them.
    const rest = withoutClauseWrappers(line.slice(head));
    // Writes, the shapes that are dangerous on sight, and the reads that are still instructions —
    // and whichever of them stands FIRST is the one this clause is about.
    //
    // ⚠️ It used to be `EXECUTION_VERB ?? ALWAYS_ESCALATE ?? READ_VERB`, which chooses by list rather
    // than by position. In `embed functionality that lets users update quantities and delete items`,
    // `embed` opens the sentence and `delete` stands eight words in — execution answered first, the
    // test below then found words in front of `delete`, and the whole sentence was thrown away with
    // a good verb sitting at position 0.
    //
    // Which list a verb is in says how dangerous it is, and that is what {@link
    // PromptEnhancementEmphasisCandidateV1.isWriteVerb} carries into the ranking below. It was never
    // meant to say which verb the clause is about.
    const verb = earliestVerbIn(rest);
    // Only a verb that opens the clause counts; one buried further in is the body describing
    // something, not instructing.
    const knownVerbAtStart = verb !== null && rest.slice(0, verb.index).trim().length === 0;
    // 🔑 …and a word NO list holds still opens an instruction, unless it is one of the openers that
    // plainly does not. See {@link NOT_AN_INSTRUCTION_OPENER} for why the test runs this way round.
    if (!opensAnInstruction(rest, knownVerbAtStart)) continue;
    const opener = knownVerbAtStart
      ? { index: verb!.index, length: verb![0].length, word: verb![0] }
      : openerOf(rest);
    if (opener === null) continue;

    // The WHOLE clause, which is what the gate below reads: whether this instruction concerns
    // something the developer named is a property of the instruction, not of how much of it is
    // drawn. ⚠️ Asking the gate about the shortened form instead cost four of six instructions —
    // measured — because a term living in the clause's tail could no longer be seen.
    const clause = cutBeforeSecret(clauseFrom(rest, opener.index, opener.length));
    if (clause.length === 0) continue;
    // …and the mark itself, cut back to the verb and its object.
    const phrase = instructionObjectOnly(clause);
    if (phrase.length === 0) continue;
    // The verb has to be acting ON something. An instruction with no object is not one.
    const object = clause.slice(opener.length).trim();
    if (object.length === 0) continue;

    // ⏪ **The object no longer has to trace to a named term** (2026-09-28). It used to: *"a verb with
    // an object nobody named is the body inventing work"*. That was written when the corpus of the
    // developer's own words was EMPTY, where refusing everything was the only safe reading.
    //
    // With the corpus fed, the rule stopped telling invented work from real work and started telling
    // work the corpus had heard of from work it had not. MEASURED on the recorded bodies: it found 47
    // instructions and threw them away — `identify` nine times, `confirm` five, `gather` five,
    // `cover` four, `verify` four — and left seven standing in the whole corpus. A reader looking for
    // what the body is telling the agent to do was being shown almost none of it.
    //
    // ⛔ The reader's protection did not go away, it moved to where it belongs: {@link
    // PROMPT_ENHANCEMENT_EMPHASIS_MAX_SECTION_SHARE_PERCENT_V1} limits how much of a section may be
    // heavy however many instructions it holds, and the cap's priority order decides what survives
    // when a section fills — the safety line, then the instruction, then the developer's own term.

    // An instruction is a phrase, not a sentence. A popup line is about twelve words wide, so a
    // mark past this is the whole line drawn heavy — which is the one thing emphasis must never be.
    // Same ceiling as classes 3 and 4, and for the same reason.
    if (phrase.trim().split(/\s+/).length > CLASS_1_MAX_WORDS_V1) continue;
    found.push({ text: phrase, emphasisClass: 1, isWriteVerb: EXECUTION_VERB.test(opener.word) });
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
      // …and a bare "not" that negates nothing is a word in a phrase, not a limit.
      if (word === BARE_NOT && !bareNotIsGoverned(line, at)) continue;
      const phrase = cutBeforeSecret(clauseFrom(line, at, word.length));
      if (phrase.length === 0) continue;
      // Claimed whether or not it is drawn, so the "a longer limiter wins" test above keeps
      // working: `do not` must still stop a bare `not` marking the same words, even on a clause
      // too long to show.
      claimed.push(phrase);
      if (phrase.trim().split(/\s+/).length > CLASS_3_AND_4_MAX_WORDS_V1) continue;
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
  /**
   * What has already been kept in this BODY.
   *
   * ⏪ Made per-section on 2026-09-27 and put back the same day. A phrase is marked where it FIRST
   * appears, and that is a ruling rather than an accident — `emphasis-locate.test.ts` states its
   * reason: *"a body that repeated the same six words in five sections would spend four and stop,
   * which is right."* Per-section dedupe reverses it, and a body that says `home page` in every
   * section would spend the whole budget on those two words.
   */
  const seen = new Set<string>();
  /** The section being read, stamped on every candidate it produces. */
  let currentSectionIndex = 0;
  const keep = (candidate: PromptEnhancementEmphasisCandidateV1): void => {
    const text = withoutHangingTail(cutBeforeSecret(candidate.text).trim());
    if (text.length === 0) return;
    const key = `${candidate.emphasisClass}:${text.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ ...candidate, text, sectionIndex: currentSectionIndex });
  };

  const classOneOn = classOneApplies(input);

  for (const [sectionIndex, section] of input.sections.entries()) {
    if (NEVER_MARKED_SECTION_KINDS.has(section.sectionKind)) continue;
    const sectionStartedAt = candidates.length;
    currentSectionIndex = sectionIndex;

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

    // 🔑 A TERM-ONLY section stops here: its keyword is marked and nothing else is. See
    // {@link TERM_ONLY_SECTION_KINDS} for what the other classes produced there when this was measured
    // — a doubly-marked safety sentence, and a sentence opening cut mid-phrase.
    if (TERM_ONLY_SECTION_KINDS.has(section.sectionKind)) continue;

    for (const safety of safetyLinesOf(section.sectionText, input.sensitiveActionName)) keep(safety);
    // The confirmation's second unit — a boundary, and the one place a fixed span is claimed
    // before the line scan, so "Do not assume, and do not rely…" is not taken as one long clause.
    if (section.sectionText.includes(CONFIRMATION_BOUNDARY_SPAN_V1)) {
      keep({ text: CONFIRMATION_BOUNDARY_SPAN_V1, emphasisClass: 3 });
    }

    // The line scan never sees what the pipeline wrote itself — those spans have their own marks.
    for (const line of maskInsertedText(section.sectionText, input.sensitiveActionName).split('\n')) {
      if (line.trim().length === 0) continue;
      if (classOneHere) for (const action of classOneOfLine(line)) keep(action);
      for (const bound of boundaryAndConditionOfLine(line)) keep(bound);
    }

    // ⚠️ **A condition qualifies something, so it is not marked where nothing it qualifies is.**
    //
    // "before wrapping up" with no marked action, term or limit beside it says nothing on its own
    // — and measuring it over ten recorded popups showed what that costs: conditions were 16 of
    // 23 marks and 5 of the 6 that landed on a line the standard rejects. A connective turns up on
    // good lines and bad alike, so a class that fires on connectives alone spends the reader's
    // attention wherever the composer happened to put one.
    //
    // The standard's own worked example already reads this way: its "before reporting done" is
    // kept because it sits in the same section as "run the project's test suite", which is the
    // thing it qualifies.
    // A term the developer supplied that sits wholly inside an instruction IN THIS SECTION is
    // already marked by it. Two nested marks read as one ragged one, and they would spend this
    // section's cap twice for a single span.
    //
    // ⚠️ **In this section, and no further.** The test ran over the whole body until 2026-09-27, and
    // both halves of its reason are about ONE span: marks in different sections are not ragged and
    // are capped separately. Measured on a real popup, `home page` in section 5 was dropped because
    // an instruction in section 2 contained those words, and section 5 drew nothing at all.
    const actionsHere = candidates.slice(sectionStartedAt).filter((candidate) => candidate.emphasisClass === 1);
    if (actionsHere.length > 0) {
      const kept = candidates.slice(sectionStartedAt).filter((candidate) => {
        if (candidate.emphasisClass !== 2) return true;
        const nested = actionsHere.some((action) => action.text.toLowerCase().includes(candidate.text.toLowerCase()));
        // The key goes back with it, so a later section may still mark the same words.
        if (nested) seen.delete(`${candidate.emphasisClass}:${candidate.text.toLowerCase()}`);
        return !nested;
      });
      candidates.length = sectionStartedAt;
      candidates.push(...kept);
    }

    const fromThisSection = candidates.slice(sectionStartedAt);
    if (fromThisSection.length > 0 && fromThisSection.every((candidate) => candidate.emphasisClass === 4)) {
      // The dedupe keys go back too, so the same words can still be marked in a later section
      // that does give them something to qualify.
      for (const dropped of fromThisSection) seen.delete(`${dropped.emphasisClass}:${dropped.text.toLowerCase()}`);
      candidates.length = sectionStartedAt;
    }
  }

  return candidates;
}
