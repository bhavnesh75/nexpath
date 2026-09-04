/**
 * T4 — the original-text preservation floors, turned into checks that can fail.
 *
 * EIGHTEEN, not fourteen. The phase plan's prose lists fourteen and stops at permission
 * boundaries, but its own prohibition says never to treat 13 or 14 as the locked count and
 * to read the dev plan instead. The dev-plan table (L7487-7504) carries eighteen item
 * classes; the last four — data-safety boundaries, rollback/verification requests,
 * uncertainty language, sensitive-action verb mood — had never been counted anywhere.
 *
 * Each floor answers one question: the user put this in their prompt, is it still there?
 * A violation NAMES its floor, because "something was lost" is not actionable and the
 * done-when asks for the floor to be identified.
 *
 * v1 checks PRESENCE. A floor is satisfied when the item still appears in the generated
 * body. Traceability through refs is the richer form the contract also allows, and the T2
 * carriers now exist to express it — but presence is the half that can fail today, and a
 * check that cannot fail is not a check.
 */
import { promptEnhancementAuthorityModeForTextV1 } from './safety-sendability.js';
import { findKnownToolNamesInTextV1 } from './known-tool-names.js';

export type PromptEnhancementPreservationFloorIdV1 =
  | 'commands'
  | 'file_paths'
  | 'module_api_names'
  | 'branch_names'
  | 'issue_ids'
  | 'stack_traces'
  | 'error_names'
  | 'test_names'
  | 'urls'
  | 'output_format_instructions'
  | 'constraints'
  | 'non_goals'
  | 'do_not_statements'
  | 'permission_boundaries'
  | 'data_safety_boundaries'
  | 'rollback_verification_requests'
  | 'uncertainty_language'
  | 'sensitive_action_verb_mood';

/** All eighteen, in dev-plan table order, so a reader can check the count against L7487-7504. */
export const PROMPT_ENHANCEMENT_PRESERVATION_FLOOR_IDS_V1: readonly PromptEnhancementPreservationFloorIdV1[] = [
  'commands',
  'file_paths',
  'module_api_names',
  'branch_names',
  'issue_ids',
  'stack_traces',
  'error_names',
  'test_names',
  'urls',
  'output_format_instructions',
  'constraints',
  'non_goals',
  'do_not_statements',
  'permission_boundaries',
  'data_safety_boundaries',
  'rollback_verification_requests',
  'uncertainty_language',
  'sensitive_action_verb_mood',
];

export interface PromptEnhancementPreservationFloorViolationV1 {
  /** Which floor failed. The done-when requires every failure to name one. */
  floorId: PromptEnhancementPreservationFloorIdV1;
  /** The exact thing from the user's prompt that the generated body did not keep. */
  lostFromOriginal: string;
  /** Why it counts as a violation, in terms a reader can act on. */
  hardFailReason: string;
}

/** Extracted item, kept with the text so a violation can quote what was lost. */
type FloorMatcher = {
  floorId: PromptEnhancementPreservationFloorIdV1;
  hardFailReason: string;
  /** Items the user authored that must survive. */
  extract: (originalPromptText: string) => readonly string[];
};

const uniqueTrimmed = (values: readonly string[]): readonly string[] =>
  [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];

const allMatches = (text: string, pattern: RegExp): readonly string[] =>
  uniqueTrimmed([...text.matchAll(pattern)].map((match) => match[0]));

/** Phrase-style floors: keep the whole clause the marker introduces, up to the line end. */
function clausesContaining(text: string, markers: readonly string[]): readonly string[] {
  const found: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    for (const marker of markers) {
      const at = line.toLowerCase().indexOf(marker);
      if (at >= 0) {
        found.push(line.slice(at).trim());
        break;
      }
    }
  }
  return uniqueTrimmed(found);
}

const FLOOR_MATCHERS: readonly FloorMatcher[] = [
  {
    floorId: 'commands',
    hardFailReason: 'Generated body changes, generalizes, drops, or invents command text.',
    // `make the landing page`, `node in the tree` — several tool names are ordinary English
    // words too, and a bare match reported a command nobody wrote. Found by measuring
    // against real composed bodies, not by reading the regex. A following article or
    // pronoun means the sentence is prose rather than an invocation.
    extract: (text) => allMatches(text, /`[^`\n]+`|(?:^|\s)(?:npm|npx|yarn|pnpm|git|docker|kubectl|make|python|node)\s+(?!(?:the|a|an|it|this|that|your|my|our|sure|them)\b)[\w:.\-/]+/gm),
  },
  {
    floorId: 'file_paths',
    hardFailReason: 'Generated body invents paths, changes path identity, or drops supplied paths.',
    extract: (text) => allMatches(text, /(?:[\w.-]+\/)+[\w.-]+\.\w+/g),
  },
  {
    floorId: 'module_api_names',
    hardFailReason: 'Generated body renames, invents, broadens, or omits named technical targets.',
    extract: (text) => allMatches(text, /\b[a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*\b(?:\(\))?/g),
  },
  {
    floorId: 'branch_names',
    hardFailReason: 'Generated body changes branch identity or invents a branch.',
    extract: (text) => allMatches(text, /\b(?:feature|fix|release|hotfix|chore|origin)\/[\w.-]+/g),
  },
  {
    floorId: 'issue_ids',
    hardFailReason: 'Generated body changes, drops, or invents issue identifiers.',
    extract: (text) => allMatches(text, /#\d+|\b[A-Z][A-Z0-9]{1,9}-\d+\b/g),
  },
  {
    floorId: 'stack_traces',
    hardFailReason: 'Generated body fabricates stack frames or loses relevant trace meaning.',
    extract: (text) => allMatches(text, /^\s*at\s+\S.*$|^\s*Traceback[^\n]*$/gm),
  },
  {
    floorId: 'error_names',
    hardFailReason: 'Generated body invents a root cause, changes error identity, or omits it.',
    extract: (text) => allMatches(text, /\b\w*(?:Error|Exception|Warning)\b|\bE[A-Z]{3,}\b/g),
  },
  {
    floorId: 'test_names',
    hardFailReason: 'Generated body invents test names or drops supplied failing-test identity.',
    extract: (text) => allMatches(text, /\b[\w.-]+\.(?:test|spec)\.\w+\b|\btest_\w+\b/g),
  },
  {
    floorId: 'urls',
    hardFailReason: 'Generated sections leak, invent, or lose an intentionally supplied URL.',
    extract: (text) => allMatches(text, /https?:\/\/[^\s)"'<>]+/g),
  },
  {
    floorId: 'output_format_instructions',
    hardFailReason: 'Generated body changes the requested output shape or omits format constraints.',
    extract: (text) => clausesContaining(text, ['as a table', 'in json', 'as json', 'bullet points', 'as a list', 'one line', 'in markdown', 'as csv']),
  },
  {
    floorId: 'constraints',
    hardFailReason: 'Generated body expands scope, changes constraints, or drops bounded requirements.',
    extract: (text) => clausesContaining(text, ['must ', 'only ', 'no more than', 'at most', 'within ', 'without changing', 'keep it under']),
  },
  {
    floorId: 'non_goals',
    hardFailReason: 'Generated body asks for work the user explicitly excluded.',
    extract: (text) => clausesContaining(text, ['out of scope', 'not in scope', 'no need to', 'skip the', 'leave the', 'ignore the']),
  },
  {
    floorId: 'do_not_statements',
    hardFailReason: 'Generated body weakens, deletes, or contradicts a user-authored do-not boundary.',
    extract: (text) => clausesContaining(text, ['do not ', "don't ", 'never ', 'avoid ']),
  },
  {
    floorId: 'permission_boundaries',
    hardFailReason: 'Generated body escalates permission or turns ask-first wording into authority.',
    extract: (text) => clausesContaining(text, ['ask first', 'ask me before', 'with my permission', 'read-only', 'do not deploy', 'check with me']),
  },
  {
    floorId: 'data_safety_boundaries',
    hardFailReason: 'Generated body weakens data-safety constraints or removes redaction floors.',
    extract: (text) => clausesContaining(text, ['production data', 'customer data', 'personal data', 'secret', 'credentials', '.env', 'do not delete', 'backup first']),
  },
  {
    floorId: 'rollback_verification_requests',
    hardFailReason: 'Generated body omits required verification or rollback behaviour, or makes it optional.',
    extract: (text) => clausesContaining(text, ['rollback', 'roll back', 'backup', 'dry run', 'dry-run', 'verify', 'validation', 'add a test', 'regression test']),
  },
  {
    floorId: 'uncertainty_language',
    hardFailReason: 'Generated body presents uncertain or unknown facts as certain.',
    extract: (text) => clausesContaining(text, ['maybe', 'i think', 'not sure', 'check if', 'review whether', 'plan before', 'possibly', 'might be']),
  },
];

/**
 * Verb mood is the one floor that is not about an item going missing: the same content can
 * satisfy every other floor while the request turns from "plan the deploy" into "deploy".
 * Reuses the shipped authority-mode reader rather than adding a fourth heuristic for it.
 *
 * ⛔ This does NOT replace the permission-boundary substitute in `safety-sendability.ts`,
 * which stays exactly where it is and is not assumed to agree with this check.
 */
function sensitiveActionVerbMoodViolation(
  originalPromptText: string,
  generatedBodyText: string,
): PromptEnhancementPreservationFloorViolationV1 | undefined {
  const originalMode = promptEnhancementAuthorityModeForTextV1(originalPromptText);
  if (originalMode !== 'plan_or_review') return undefined;
  const bodyMode = promptEnhancementAuthorityModeForTextV1(generatedBodyText);
  if (bodyMode !== 'execute_requested' && bodyMode !== 'execute_generated_escalation') return undefined;
  return {
    floorId: 'sensitive_action_verb_mood',
    lostFromOriginal: originalPromptText.trim().slice(0, 200),
    hardFailReason: 'Generated body converts planning or review language into execution wording.',
  };
}

/**
 * The NO-INVENTION check — the floors' comparison machinery pointed the other
 * way. The floors ask "the user put this in their prompt, is it still there?";
 * this asks "the section names this, did ANYONE supply it?". It reuses the
 * item-floor extractors (commands, paths, module/API names, branches, issue
 * ids, error names, test names, urls) over the SECTION text and adds two
 * product-name shapes the floors never needed (leading-cap camel case like
 * RabbitMQ; 3+-letter all-caps like SQS, with a stoplist of generic formatting
 * and protocol words). An item found in the section but present in NONE of the
 * allowed texts (the user's prompt, plus whatever fact evidence the caller
 * supplies) is a fabrication violation.
 */
const INVENTION_ITEM_FLOOR_IDS: ReadonlySet<PromptEnhancementPreservationFloorIdV1> = new Set([
  'commands', 'file_paths', 'module_api_names', 'branch_names', 'issue_ids', 'error_names', 'test_names', 'urls',
]);
const PRODUCT_NAME_PATTERNS: readonly RegExp[] = [
  /\b[A-Z][a-z0-9]+[A-Z][a-zA-Z0-9]*\b/g,
  /\b[A-Z]{3,}\b/g,
];
const GENERIC_UPPER_TOKENS: ReadonlySet<string> = new Set([
  'API', 'JSON', 'CSV', 'URL', 'URLS', 'HTTP', 'HTTPS', 'SQL', 'TODO', 'NOTE', 'IMPORTANT',
  'README', 'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HTML', 'CSS', 'YAML', 'XML', 'IDE',
  'CLI', 'PDF', 'UUID', 'JWT', 'CORS', 'CRUD', 'REST', 'NOT', 'AND', 'THE', 'FOR', 'ALL',
]);

export interface PromptEnhancementInventionViolationV1 {
  item: string;
  hardFailReason: string;
}

export function findPromptEnhancementInventionViolationsV1(input: {
  sectionText: string;
  allowedTexts: readonly string[];
}): readonly PromptEnhancementInventionViolationV1[] {
  const allowedLower = input.allowedTexts.join('\n').toLowerCase();
  const violations: PromptEnhancementInventionViolationV1[] = [];
  const reported = new Set<string>();
  const report = (item: string): void => {
    const key = item.toLowerCase();
    if (reported.has(key) || allowedLower.includes(key)) return;
    reported.add(key);
    violations.push({
      item,
      hardFailReason: 'Section under the no-invention state names a tool, file, API or project fact that is in neither the prompt nor a source fact.',
    });
  };
  for (const matcher of FLOOR_MATCHERS) {
    if (!INVENTION_ITEM_FLOOR_IDS.has(matcher.floorId)) continue;
    for (const item of matcher.extract(input.sectionText)) {
      // Consumer-side guard on the commands matcher (the GENERIC_UPPER_TOKENS precedent — the
      // SHARED matcher is byte-untouched, so a command the USER wrote keeps its preservation
      // floor). An English-verb command head followed by one plain lowercase word is prose,
      // not an invocation: "make necessary changes", "make informed decisions" — measured as
      // the only false-positive class across 477 real composed sections. A real target keeps
      // a shape word ("make build-all", "node server.js") and still reports.
      if (matcher.floorId === 'commands' && /^(?:make|python|node)\s+[a-z]+$/.test(item.trim())) continue;
      report(item);
    }
  }
  for (const pattern of PRODUCT_NAME_PATTERNS) {
    for (const item of allMatches(input.sectionText, pattern)) {
      if (GENERIC_UPPER_TOKENS.has(item)) continue;
      report(item);
    }
  }
  // Layer 0: the curated known-name list — coverage the shape patterns cannot give (measured
  // 37% without it: a name is only caught when its casing cooperates). Same report() path, so
  // the prompt/fact allowance and dedup above apply unchanged; deliberately NOT a
  // capitalisation widening — unlisted capitalised words stay invisible.
  for (const item of findKnownToolNamesInTextV1(input.sectionText)) report(item);
  return violations;
}

/**
 * Check every floor against a composed body.
 *
 * Returns one violation per lost item, each naming its floor. An empty result means every
 * item class the user supplied survived into the generated text.
 */
export function checkPromptEnhancementPreservationFloorsV1(input: {
  originalPromptText: string;
  generatedBodyText: string;
}): readonly PromptEnhancementPreservationFloorViolationV1[] {
  const violations: PromptEnhancementPreservationFloorViolationV1[] = [];
  const bodyLower = input.generatedBodyText.toLowerCase();

  for (const matcher of FLOOR_MATCHERS) {
    for (const item of matcher.extract(input.originalPromptText)) {
      if (bodyLower.includes(item.toLowerCase())) continue;
      violations.push({
        floorId: matcher.floorId,
        lostFromOriginal: item,
        hardFailReason: matcher.hardFailReason,
      });
    }
  }

  const moodViolation = sensitiveActionVerbMoodViolation(input.originalPromptText, input.generatedBodyText);
  if (moodViolation) violations.push(moodViolation);

  return violations;
}
