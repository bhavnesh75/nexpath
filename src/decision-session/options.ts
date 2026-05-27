import type { Stage, UserProfile } from '../classifier/types.js';
import { STAGES } from '../classifier/types.js';
import type { FlagType } from '../classifier/Stage2Trigger.js';
import {
  ABSENCE_CONTENT_BEGINNER,
  TRANSITION_CONTENT_BEGINNER,
  TASK_REVIEW_BEGINNER,
} from './options-beginner.js';

/**
 * Per-stage decision session content (from spec-driven-stages-research.md Part 3).
 *
 * Each entry has:
 *   - question     : bold-white question line shown in the header pair
 *   - pinchFallback: static label used when the pinch-word API call fails/times-out
 *   - L1           : Level 1 options (full, pre-filled agent prompts)
 *   - L2           : Level 2 options (easier)
 *   - L3           : Level 3 options (minimum viable step)
 *
 * Every option IS a pre-filled prompt ready to send to the agent — user hits Enter.
 */

export interface DecisionContent {
  question:      string;
  pinchFallback: string;
  L1: string[];
  L2: string[];
  L3: string[];
}

// ── Per-transition content ─────────────────────────────────────────────────────

/** Transition 1: Idea → PRD */
const IDEA_TO_PRD: DecisionContent = {
  question:      'Before building — is the plan written?',
  pinchFallback: 'Before coding.',
  L1: [
    'Write a PRD for this project: define the problem, target user, core features with acceptance criteria, what is explicitly out of scope, and any technical constraints.',
    'Define the problem and success criteria first: who is this for, what problem does it solve, and how will we know when it\'s done?',
    'Cross-confirm the idea before writing spec: review what I\'ve described so far and tell me — is the problem statement clear enough to write a PRD? What\'s missing or ambiguous?',
  ],
  L2: [
    'Write a one-paragraph scope statement: what this project does, what it does not do, and the single most important success criterion.',
    'Cross-confirm the idea: given what I\'ve described, what are the top 3 things that should be clarified before I start building?',
  ],
  L3: [
    'List the 3 most important acceptance criteria for this project so we can check them before release.',
  ],
};

/** Transition 2: PRD → Architecture */
const PRD_TO_ARCHITECTURE: DecisionContent = {
  question:      'Spec ready — is the architecture decided?',
  pinchFallback: 'Design first.',
  L1: [
    'Design the system architecture for this project: list the main components, how they interact, the data model, API contracts (if any), and the tech stack with rationale for key choices.',
    'Write a technical design doc: system components, data flows, key architectural decisions and why, and any constraints or risks I should know before coding starts.',
    'Cross-confirm the spec before architecture: review the PRD/spec we have and tell me — is it precise enough that you could implement it without asking clarifying questions? List every ambiguity or gap.',
    'Review the spec for architectural blind spots: based on the requirements, what architectural decisions will have the biggest impact on maintainability, performance, or security — and what\'s the recommended approach for each?',
  ],
  L2: [
    'Sketch the main components and data flow: what are the key parts of this system and how does data move between them?',
    'Cross-confirm the spec: given the current PRD, what are the top 3 architectural decisions I need to make before starting to code?',
  ],
  L3: [
    'Cross-confirm the plan: what is the single biggest architectural risk in what I\'ve described, and what\'s the simplest way to address it?',
  ],
};

/** Transition 3: Architecture → Task Breakdown */
const ARCHITECTURE_TO_TASKS: DecisionContent = {
  question:      'Architecture done — is the task list ordered?',
  pinchFallback: 'Break it down.',
  L1: [
    'Break the implementation into an ordered task list: each task should be completable in one coding session, delivered as a vertical slice where possible, and have a clear definition of done.',
    'Create a task list file for this implementation phase: list tasks in order, with a one-line definition of done for each, so I can track progress and you have context for each session.',
    'Cross-confirm the architecture before coding: review the architecture we\'ve designed and tell me — does it fully cover all the requirements in the spec? Are there any missing components, undefined data flows, or unresolved technical decisions?',
    'Identify the first vertical slice: what is the thinnest end-to-end feature I can build first to validate the architecture and get something working?',
  ],
  L2: [
    'List the top 5 implementation steps in order, with a one-line description of what done looks like for each.',
    'Cross-confirm the architecture: given the spec and architecture, what are the top 3 things that could go wrong during implementation and how should I handle them?',
  ],
  L3: [
    'Cross-confirm the first step: what should I build first and why — what validates the core assumption of this project fastest?',
  ],
};

/** Transition 4: task_breakdown → implementation (per-task review before coding starts) */
const TASK_REVIEW: DecisionContent = {
  question:      'Task done — reviewed and tested?',
  pinchFallback: 'Quick check.',
  L1: [
    'Review what was just built for this task: does the implementation match the spec and acceptance criteria? List any discrepancies, missing logic, hallucinated code, or potential issues before I mark this done.',
    'Run the tests for what was just built and report: which tests pass, which fail, and what needs to be fixed before moving to the next task.',
    'Cross-confirm this implementation against the spec: does what was just built fully satisfy the requirements for this task? What is missing or different from what the spec required?',
  ],
  L2: [
    'Quick review of what was just built: does it do what the task asked for? Any obvious issues?',
    'Cross-confirm this task: does this implementation match the task\'s definition of done?',
  ],
  L3: [
    'Is there anything in the code just generated that looks wrong or incomplete before I move on?',
  ],
};

/** TASK_REVIEW_CASUAL — casual-register variant for cool_geek and pro_geek_soul profiles */
const TASK_REVIEW_CASUAL: DecisionContent = {
  question:      'Task done — quick check before moving on?',
  pinchFallback: 'Quick check.',
  L1: [
    'Quick look at what was just built — does it do what the task asked for? Anything off, anything missing, any weird generated code before I say it\'s done?',
    'Run the tests for what was just built and report: which pass, which fail, and what needs fixing before moving on.',
    'Does what was just built actually do what was asked? What\'s off or missing compared to what was planned?',
  ],
  L2: [
    'Quick look at what was just built: does it do what the task asked for? Any obvious problems?',
    'Does what was just built match what the task asked for — definition of done covered?',
  ],
  L3: [
    'Anything in what was just built that looks off or incomplete before moving on?',
  ],
};

/** Transition 5: Implementation → Review/Testing */
const IMPLEMENTATION_TO_REVIEW: DecisionContent = {
  question:      'Phase done — full review before moving on?',
  pinchFallback: 'Phase done?',
  L1: [
    'Run the full test suite for this phase: unit tests, integration tests, and any regression tests. Report results, failures, and what needs to be fixed.',
    'Check the spec acceptance criteria against what was built: go through each acceptance criterion in the PRD and tell me whether it is fully satisfied, partially satisfied, or not yet implemented.',
    'Cross-confirm the full implementation against the spec: review everything built in this phase and identify any gaps between what was implemented and what the spec required — include security, error handling, and edge cases.',
    'Review for regression: does anything that was working before this phase now behave differently or break?',
    // v0.3.0 — acceptance/behaviour testing gap
    'Write a manual acceptance test script for what was just built: cover the spec scenarios — happy path, boundary conditions, and error states automated tests would miss — and document the expected outcome at each step.',
  ],
  L2: [
    'Run tests for the new code in this phase and report any failures.',
    'Cross-confirm the critical path: do the 3 most important acceptance criteria from the spec pass end-to-end?',
  ],
  L3: [
    'Cross-confirm before I move on: is there anything obviously broken or missing in what was just built?',
  ],
};

/** Transition 6: Review/Testing → Release */
const REVIEW_TO_RELEASE: DecisionContent = {
  question:      'Ready to ship — final checks done?',
  pinchFallback: 'Almost there.',
  L1: [
    'Run all tests one final time before release: unit, integration, and regression. Confirm everything passes or tell me what is still failing.',
    'Cross-confirm release readiness: have all tests passed, are all spec acceptance criteria met, have security concerns been addressed, and is there a rollback plan ready if something fails in production?',
    'Review the new code for security issues before shipping: check for input validation gaps, authentication/authorization issues, hardcoded secrets, unhandled errors, and any other obvious vulnerabilities.',
    'Write a release checklist for this deployment: what needs to happen before, during, and after the release to ensure it goes smoothly and I can roll back if needed.',
  ],
  L2: [
    'Cross-confirm readiness: what are the top 3 risks in shipping this right now and how should I handle each?',
    'Run the critical path tests only and confirm they pass.',
  ],
  L3: [
    'Cross-confirm one thing: is there anything that is likely to break in production that we haven\'t tested yet?',
  ],
};

/** Transition 7: Release → Feedback Loop */
const RELEASE_TO_FEEDBACK: DecisionContent = {
  question:      'Just shipped — is the feedback loop active?',
  pinchFallback: 'Watch it live.',
  L1: [
    'Verify the production monitoring setup for what was just built: confirm error tracking is active, alert thresholds are configured, and dashboards show live metrics — list what is collecting and what still needs to be set up.',
    'Set up the feedback loop for this feature: identify what signals will tell you it is working (analytics events, error rates, user reports), confirm what is already in place, and list what still needs to be added to close the loop.',
    'Run smoke checks on what was just built: confirm the main user path works end-to-end in the live environment, check for unexpected errors in the logs, and report anything that looks wrong.',
  ],
  L2: [
    'What are the top 3 signals I should watch in the first 24 hours to know if this feature is behaving as expected in production?',
    'What is the minimum feedback setup needed to know if this feature is landing well — and what is still missing from what is currently in place?',
  ],
  L3: [
    'Is there a signal in place that would tell you if this feature silently breaks in production — or would it fail without alerting anyone?',
  ],
};

/** Absence trigger: behaviour_testing — fires when implementation proceeds without manual acceptance testing */
const BEHAVIOUR_TESTING: DecisionContent = {
  question:      'Implementation done — user scenarios tested?',
  pinchFallback: 'User scenario?',
  L1: [
    'Write a manual test scenario for the main user journey: list each step a real user would take, what they would see, and what would confirm it is working correctly.',
    'List the acceptance tests for this feature: describe 3 to 5 scenarios a real user would run through, from happy path to edge cases, and the expected outcome for each.',
    'Identify the 3 most likely ways a real user could break this feature without triggering any automated tests — then tell me how to manually verify each one.',
  ],
  L2: [
    'Describe the happy path for the main use case: what does a user do, step by step, to successfully complete the core workflow?',
    'What is the most important thing to verify manually before I call this feature done — and how do I check it?',
  ],
  L3: [
    'What is one real user scenario I should manually test right now before moving on?',
  ],
};

/** BEHAVIOUR_TESTING_CASUAL — casual-register variant for cool_geek and pro_geek_soul profiles */
const BEHAVIOUR_TESTING_CASUAL: DecisionContent = {
  question:      'Implementation done — user scenarios tested?',
  pinchFallback: 'User scenario?',
  L1: [
    'Put yourself in a user\'s shoes and go through what was just built from start to finish — what\'s the main thing it does, does it actually work, and is anything confusing or broken along the way?',
    'Think of a few different ways someone might use this feature in real life — the obvious one and a couple of less obvious ones — and actually run through each to see what happens.',
    'Think about what could go wrong for a real user in what was just built — try the stuff that automated tests wouldn\'t catch and tell me what you see.',
  ],
  L2: [
    'What\'s the simplest way someone would use this feature end to end — walk me through what they do and whether it actually works.',
    'Is there anything in what was just built that you haven\'t actually tried yourself yet — and what would "working" look like if you did?',
  ],
  L3: [
    'What\'s one specific thing that could break for a real user in this feature that hasn\'t been tried by hand yet?',
  ],
};

// ── Absence signal content sets ───────────────────────────────────────────────

/** Absence: test_creation — fires when implementation proceeds without writing tests */
const ABSENCE_TEST_CREATION: DecisionContent = {
  question:      'Code added — where are the tests?',
  pinchFallback: 'Tests missing.',
  L1: [
    'Write tests for what was just built: unit tests for each function added or modified, and at least one integration test that covers the main path through this feature.',
    'Identify what was just built that has no test coverage and write tests for the top 3 riskiest parts — the logic most likely to break silently if changed.',
    'Review what was just built for testability: is it structured so tests can be written without extensive mocking? Flag any parts that would be hard to test as-is.',
  ],
  L2: [
    'Write at least one test for what was just built — the most critical path through this feature.',
    'What would break silently in what was just built if a future change introduced a bug? Write a test that catches that.',
  ],
  L3: [
    'Write one test for the most important behaviour in what was just built before moving on.',
  ],
};

/** Absence: regression_check — fires when changes are made without regression testing */
const ABSENCE_REGRESSION_CHECK: DecisionContent = {
  question:      'Changes made — regression verified?',
  pinchFallback: 'Regression check.',
  L1: [
    'Identify which existing tests cover the code paths changed in what was just built, run them, and flag any regressions — anything that was passing before this session that is now failing.',
    'Check what was just built against the existing test suite: identify which existing tests cover the code paths that were modified, run them, and report any failures.',
    'Review what was just built for regression risk: what existing functionality could be affected by these changes, and how would you verify it still works correctly?',
  ],
  L2: [
    'Run the tests for this project and report which ones fail — specifically any that touch code changed in this session.',
    'What existing functionality is most likely to be affected by what was just built? Verify it still works.',
  ],
  L3: [
    'Run the existing tests for this project and report whether anything is now failing that wasn\'t before.',
  ],
};

/** Absence: spec_acceptance_check — fires when implementation proceeds without checking against spec */
const ABSENCE_SPEC_ACCEPTANCE: DecisionContent = {
  question:      'Implementation done — spec checked?',
  pinchFallback: 'Check the spec.',
  L1: [
    'Review what was just built against the spec and acceptance criteria: go through each requirement and confirm whether it is fully implemented, partially implemented, or missing from what was just built.',
    'Cross-confirm what was just built against the original requirements: does the implementation match what was specified? List any deviations, missing behaviour, or scope creep introduced.',
    'Audit what was just built for spec compliance: check input validation, edge cases, and error handling against the acceptance criteria — flag anything that passes the happy path but fails under edge conditions.',
  ],
  L2: [
    'Check what was just built against the spec: does it fully satisfy the acceptance criteria, or are there gaps?',
    'Does what was just built match what was specified? List any differences between the implementation and the original requirements.',
  ],
  L3: [
    'Is there anything in what was just built that doesn\'t match the spec or acceptance criteria?',
  ],
};

/** Absence: cross_confirming — fires when implementation proceeds without cross-confirmation prompts */
const ABSENCE_CROSS_CONFIRMING: DecisionContent = {
  question:      'AI generated it — have you verified it?',
  pinchFallback: 'Verify the output.',
  L1: [
    'Review what was just built critically: identify any hallucinated functions or APIs, logic that looks plausible but is incorrect, edge cases not handled, and any code that was generated but not verified against the actual system it will run in.',
    'Cross-confirm what was just built: does the generated code actually do what you expect, or does it contain plausible-sounding logic that is subtly wrong? Trace the main path through the code and verify each step.',
    'Audit what was just built for AI generation artifacts: check for made-up function names, incorrect assumptions about the codebase, missing error handling that a human would have caught, and any logic that looks correct but hasn\'t been manually verified.',
  ],
  L2: [
    'Review what was just built for correctness: is there anything that looks right at a glance but would fail when actually run or tested?',
    'Does what was just built actually do what you think it does? Trace the main execution path and verify the logic is sound.',
  ],
  L3: [
    'Is there anything in what was just built that was generated but not verified — anything you haven\'t manually checked for correctness?',
  ],
};

const ABSENCE_SECURITY_CHECK: DecisionContent = {
  question:      'Feature built — security reviewed?',
  pinchFallback: 'Security gap.',
  L1: [
    'Review what was just built for security vulnerabilities: check authentication and authorization logic, input validation for injection risks (SQL, XSS, command), and any API endpoints for missing rate limiting, improper error responses, or exposed sensitive data.',
    'Audit what was just built against OWASP Top 10 exposure: does this feature handle untrusted input safely, authenticate and authorize correctly, and avoid leaking sensitive information in error messages or logs?',
    'Cross-confirm what was just built against your threat model: what assets are being protected, what attack surface has this feature introduced, and what is the highest-severity vulnerability an attacker could exploit right now?',
  ],
  L2: [
    'Check what was just built for the most critical security gaps: input validation, proper authentication and authorization checks, and sensitive data exposure in responses or logs.',
    'What is the biggest security risk introduced by what was just built, and what would be needed to mitigate it before this ships?',
  ],
  L3: [
    'Is there anything in what was just built that could be exploited — untrusted input not validated, missing auth checks, or sensitive data exposed to callers?',
  ],
};

const ABSENCE_ERROR_HANDLING: DecisionContent = {
  question:      'Feature built — error paths handled?',
  pinchFallback: 'Error handling.',
  L1: [
    'Review what was just built for error handling gaps: identify all failure modes (network errors, invalid input, missing dependencies, unexpected state), confirm each is handled explicitly, and flag any that are silently swallowed or produce unhelpful error messages.',
    'Audit the failure paths in what was just built: what happens when each external dependency fails, each input is invalid, or each assumption is violated? Is the failure propagated, logged, or recovered from correctly in each case?',
    'Cross-confirm what was just built against its error contract: are errors typed and documented, are retries or fallbacks implemented where appropriate, and are error messages safe to expose to callers without leaking internal state?',
  ],
  L2: [
    'What failure modes in what was just built are currently unhandled or silently swallowed? Identify and fix the most critical ones.',
    'What happens in what was just built when the most likely thing goes wrong — network failure, invalid input, or missing dependency? Verify that case is handled correctly.',
  ],
  L3: [
    'Is there anything in what was just built that could fail silently or produce an unhelpful error when something unexpected happens?',
  ],
};

const ABSENCE_DOCUMENTATION: DecisionContent = {
  question:      'Code written — any documentation added?',
  pinchFallback: 'Docs missing.',
  L1: [
    'Review what was just built for documentation coverage: identify functions, classes, and modules with non-obvious behaviour that lack docstrings or inline comments, and add documentation that explains the why — the constraint, the invariant, the tradeoff — not just the what.',
    'Audit what was just built for undocumented assumptions: what design decisions, invariants, or external constraints are embedded in this code that a future maintainer could not infer from reading it? Document those specifically.',
    'Check whether what was just built needs README updates, API reference additions, or architecture notes — not just inline comments. What context would someone need to understand this feature without asking the original author?',
  ],
  L2: [
    'What parts of what was just built would be hardest for another developer to understand without documentation? Add documentation for those first.',
    'Identify the non-obvious decisions in what was just built — the ones a future maintainer might change by mistake — and document the reasoning behind each.',
  ],
  L3: [
    'Is there anything in what was just built that has non-obvious behaviour or hidden assumptions that are not documented?',
  ],
};

const ABSENCE_OBSERVABILITY: DecisionContent = {
  question:      'Feature built — how will you know it\'s working?',
  pinchFallback: 'No observability.',
  L1: [
    'Review what was just built for observability gaps: identify what this feature does in production that is currently invisible — requests, failures, latency, state changes — and add structured logging for the events that would allow you to diagnose a production incident without SSH access.',
    'Audit what was just built for monitoring coverage: what SLI would you define for this feature, what metrics would you emit, and what alert condition would page someone if this feature degraded silently in production?',
    'Check what was just built for error tracking integration: are failures captured in your error tracking system with enough context — request ID, user ID, stack trace — to diagnose the issue without reproducing it locally?',
  ],
  L2: [
    'What events in what was just built are currently invisible in production? Add structured logging for the ones that would be essential to diagnose a failure.',
    'If this feature broke silently in production tonight, what would you see in your logs and monitoring to detect it? If the answer is "nothing", what needs to be added?',
  ],
  L3: [
    'Is there anything in what was just built that could fail silently in production with no log entry or alert to detect it?',
  ],
};

const ABSENCE_COMPREHENSION: DecisionContent = {
  question:      'AI generated it — do you understand it?',
  pinchFallback: 'Comprehension check.',
  L1: [
    'Review what was just built for comprehension: trace through the main execution path and explain what each significant function, class, and data structure does — independently, without relying on comments generated alongside the code.',
    'Audit your understanding of what was just built: identify any part of the code you could not explain to a colleague without reading it again. For each such part, either gain that understanding now or flag it as a comprehension debt before moving on.',
    'Check whether what was just built contains any abstractions, design patterns, or external library usage you accepted without fully understanding — verify what each one does and why it was chosen for this specific context.',
  ],
  L2: [
    'Is there any part of what was just built you could not confidently explain to another developer right now? Address that before moving on.',
    'Walk through what was just built and identify any code you accepted because it looked correct without actually verifying the logic yourself.',
  ],
  L3: [
    'Is there anything in what was just built that you haven\'t manually traced through and fully understood?',
  ],
};

const ABSENCE_REFACTORING: DecisionContent = {
  question:      'Extended implementation — code health reviewed?',
  pinchFallback: 'Refactor check.',
  L1: [
    'Review what was just built for refactoring opportunities: identify code duplication, functions that do more than one thing, abstractions that have grown inconsistent with their usage, and naming that no longer reflects current behaviour — prioritize by maintenance risk.',
    'Audit what was just built for code health: are there patterns that have emerged across this implementation that should be abstracted, any dead code that can be removed, or any modules that have grown beyond their original responsibility?',
    'Check what was just built against existing codebase conventions: does it introduce inconsistent patterns, style deviations, or compounding technical debt that would make the next feature harder to add if not addressed now?',
  ],
  L2: [
    'What is the most significant refactoring opportunity in what was just built — the thing that if left will make the next feature harder to add?',
    'Review what was just built for duplication or inconsistency that should be cleaned up before moving on to the next task.',
  ],
  L3: [
    'Is there anything in what was just built that should be refactored or cleaned up before moving on?',
  ],
};

const ABSENCE_NO_PUSHBACK: DecisionContent = {
  question:      'AI suggesting — are you evaluating critically?',
  pinchFallback: 'No pushback.',
  L1: [
    'Review the AI-generated outputs used in what was just built: identify any decisions, implementations, or suggestions you accepted without explicitly verifying the reasoning, checking for alternatives, or questioning the assumptions embedded in the response.',
    'Audit your acceptance pattern while building this feature: for each significant AI output, ask whether you evaluated it independently or accepted it because it was confident and plausible. Flag any output where you would struggle to justify the implementation choice to a peer reviewer.',
    'Cross-confirm the most recent AI suggestion used in what was just built: what assumptions did the AI make that were not in your prompt, what alternatives did it not consider, and is the approach it chose actually the best fit for this project?',
  ],
  L2: [
    'Take the last significant AI output used in what was just built and evaluate it critically: do you agree with the approach, and if so, can you explain why it is better than the alternatives?',
    'Is there any AI output used in what was just built that you accepted because it sounded right rather than because you verified it was right?',
  ],
  L3: [
    'Is there any AI suggestion used in what was just built that you accepted without questioning the reasoning or checking for better alternatives?',
  ],
};

const ABSENCE_CORRECTION_SEEKING: DecisionContent = {
  question:      'AI output — self-verification requested?',
  pinchFallback: 'No verification.',
  L1: [
    'Instruct the AI to self-review what was just built: ask it to identify any assumptions that may be incorrect, logic that could fail under edge cases, and any parts of the implementation it is not confident about.',
    'Request a critical re-evaluation of what was just built: ask the AI to argue against its own implementation — what would a skeptical senior engineer flag, what alternative approaches were not considered, and what are the weakest parts of this solution?',
    'Ask the AI to produce a failure analysis of what was just built: what are the most likely ways this implementation fails in production, what inputs would cause incorrect behaviour, and what would it change if asked to rebuild this from scratch?',
  ],
  L2: [
    'Ask the AI to review what was just built critically — what would it change or flag if it were reviewing this as a senior engineer rather than as the author?',
    'Request a self-critique of what was just built: what are the weakest parts, and what was the AI least confident about when generating this?',
  ],
  L3: [
    'Ask the AI to identify the part of what was just built it is least confident is correct.',
  ],
};

const ABSENCE_PROBLEM_CORRECTION: DecisionContent = {
  question:      'Bug noticed — explicitly corrected?',
  pinchFallback: 'Bug unresolved.',
  L1: [
    'Review the outstanding bugs and issues identified in this session: for each one, confirm whether it has been explicitly fixed, explicitly deferred with a tracking note, or left unaddressed. Address any that are unresolved and blocking correctness of what was just built.',
    'Audit what was just built for bugs that were noticed but not fixed: identify any error, failure, or incorrect behaviour that was mentioned in this session and is still present in the current implementation.',
    'Cross-confirm the current state of what was just built: run the tests, check the known failure cases, and verify that any issue identified earlier in this session has been resolved or explicitly acknowledged as a known limitation.',
  ],
  L2: [
    'Is there any bug or issue in what was just built that was noticed earlier in this session but not explicitly fixed? Address it before moving on.',
    'Run the tests for what was just built and confirm that any failure identified earlier in this session is now resolved.',
  ],
  L3: [
    'Is there any bug in what was just built that was noticed but not explicitly corrected before moving on?',
  ],
};

const ABSENCE_ALTERNATIVES: DecisionContent = {
  question:      'Decision made — alternatives considered?',
  pinchFallback: 'No alternatives.',
  L1: [
    'Review the key decisions made in what was just built: name the alternatives that were not chosen, explain the tradeoffs between each approach, and confirm that the chosen solution is the best fit for the constraints of this project — not just the first viable option.',
    'Audit the key technical choices made while building this feature: for each significant decision (architecture, library, algorithm, data structure), identify at least one alternative that was not explored and evaluate whether the chosen approach is still the right one given the project\'s constraints.',
    'Cross-confirm the approach taken in what was just built: what would a different engineering team have done differently, what are the known weaknesses of the chosen approach, and is there a simpler solution that would meet the requirements with fewer dependencies or moving parts?',
  ],
  L2: [
    'What was the most significant technical decision made in what was just built? Name the alternatives that were not explored and confirm the chosen approach is the right tradeoff.',
    'Is there any part of what was just built where a different approach would have been simpler, more maintainable, or better suited to the project\'s constraints?',
  ],
  L3: [
    'Is there any decision in what was just built that was made without considering alternatives — where the first approach was taken without evaluating other options?',
  ],
};

const ABSENCE_ARCH_CONFLICT: DecisionContent = {
  question:      'Feature added — architecture consistency checked?',
  pinchFallback: 'Arch conflict.',
  L1: [
    'Review what was just built for architectural consistency: does this feature follow the same patterns, abstractions, and conventions established in the existing codebase, or does it introduce a parallel approach that will diverge over time and increase maintenance cost?',
    'Audit what was just built for architecture conflicts: identify any module boundaries crossed without justification, any shared state accessed in ways inconsistent with the existing data flow, and any new dependencies introduced that conflict with the project\'s existing dependency strategy.',
    'Cross-confirm what was just built against the architectural decisions documented for this project: does this feature respect the layering, separation of concerns, and interface contracts that were established? Flag any violations and determine whether they require a refactor or an architecture decision update.',
  ],
  L2: [
    'Does what was just built follow the same patterns and conventions as the rest of the codebase, or does it introduce a new approach that conflicts with the existing architecture?',
    'Is there anything in what was just built that violates a design decision or architectural convention established earlier in this project?',
  ],
  L3: [
    'Is there anything in what was just built that doesn\'t fit the patterns or structure of the existing codebase?',
  ],
};

const ABSENCE_PROMPT_CONTEXT: DecisionContent = {
  question:      'Prompts sent — spec and arch referenced?',
  pinchFallback: 'Missing context.',
  L1: [
    'Review the prompts used to build this feature: are they grounded in the project\'s spec, architecture decisions, and task breakdown, or are they ad hoc instructions that the AI is implementing without access to the full planning context? If context is missing, inject it now before the next prompt.',
    'Audit the context richness of the prompts used to build this feature: does the AI have access to the current spec, the established architecture, and the specific acceptance criteria for what was just built, or is it making assumptions that a context-rich prompt would have resolved?',
    'Cross-confirm that what was just built is aligned with the project\'s planning artifacts: paste the relevant spec section, architecture diagram, or task definition into the conversation and ask the AI to verify that its implementation matches what was planned.',
  ],
  L2: [
    'Does the AI have the spec and architecture context it needs to build this feature correctly, or has it been working from ad hoc instructions? Inject the relevant planning context before continuing.',
    'Paste the spec or acceptance criteria for this feature into the conversation and ask the AI to check whether what was just built matches what was planned.',
  ],
  L3: [
    'Does the AI have enough context about the spec and architecture to be building this feature correctly, or is it working without the full picture?',
  ],
};

const ABSENCE_ROLLBACK_PLANNING: DecisionContent = {
  question:      'Release pending — rollback plan defined?',
  pinchFallback: 'No rollback plan.',
  L1: [
    'Define the rollback procedure for this feature before shipping: identify the steps to revert if the deployment fails, confirm the rollback can be completed within your acceptable downtime window, and verify that database migrations or data changes are reversible.',
    'Audit the rollback readiness of this feature: what happens to data, sessions, and dependent services if this deploy is reverted? Document the rollback steps, assign ownership, and confirm the plan can be executed without live debugging during an incident.',
    'Cross-confirm rollback viability for what was just built: if you rolled back this feature in production right now, what would break, what state would be left in an inconsistent state, and what would need to be cleaned up manually? Address any gaps before shipping.',
  ],
  L2: [
    'What is the rollback procedure if the deployment of this feature fails? Document it before shipping — it should be executable under pressure without needing to invent steps on the fly.',
    'Are there any parts of this feature — database migrations, external API integrations, data format changes — that cannot be cleanly rolled back? Address those before shipping or accept them as known risks.',
  ],
  L3: [
    'Is there a documented rollback plan for this feature that could be executed in production under pressure, or would reverting require improvisation?',
  ],
};

const ABSENCE_DEPLOYMENT_PLANNING: DecisionContent = {
  question:      'Release pending — deployment plan confirmed?',
  pinchFallback: 'No deploy plan.',
  L1: [
    'Define the deployment plan for this feature before shipping: confirm the target environment configuration, document any environment variables or secrets that need to be provisioned, and verify that the deployment process has been tested outside of production.',
    'Audit the deployment readiness of this feature: are there environment-specific configuration differences between staging and production that could cause a failure, any new environment variables required, or any infrastructure changes needed before this can deploy cleanly?',
    'Cross-confirm deployment readiness for this feature: what does the production environment need to have in place before this deploys successfully — configuration, secrets, database state, external service integrations — and is each of those confirmed and ready?',
  ],
  L2: [
    'What environment configuration does this feature require in production that is not yet confirmed — secrets, environment variables, infrastructure dependencies? Resolve each before shipping.',
    'Has this feature been deployed to a staging environment that mirrors production? If not, what deployment risks are you accepting by shipping without a staging verification?',
  ],
  L3: [
    'Is there a confirmed deployment plan for this feature, or is the deployment process still undefined and untested outside of development?',
  ],
};

const ABSENCE_DEPENDENCY_MGMT: DecisionContent = {
  question:      'Dependencies added — conflicts and risks reviewed?',
  pinchFallback: 'Dependency risk.',
  L1: [
    'Review the new dependencies introduced in what was just built: check for version conflicts with existing packages, known security vulnerabilities in the chosen version, and whether a more stable or widely-adopted alternative exists for the same purpose.',
    'Audit the packages added in what was just built for dependency health: are the chosen versions the latest stable releases, do any have known CVEs in the installed version, and are the licences compatible with this project\'s licence requirements?',
    'Cross-confirm the dependency decisions made in what was just built: for each new package, verify it is actively maintained, has adequate documentation, does not introduce transitive dependencies that conflict with the existing dependency tree, and is not a single-maintainer package with no succession plan.',
  ],
  L2: [
    'Check the new packages added in what was just built for version conflicts and known vulnerabilities — run a dependency audit and confirm there are no high-severity issues before shipping.',
    'Is there any package added in what was just built that is unmaintained, has an incompatible licence, or pulls in a transitive dependency that conflicts with what is already installed?',
  ],
  L3: [
    'Have the new packages added in what was just built been checked for version conflicts, known security vulnerabilities, and licence compatibility?',
  ],
};

const ABSENCE_PHASE_TRANSITION: DecisionContent = {
  question:      'Extended phase — transition readiness assessed?',
  pinchFallback: 'Phase check.',
  L1: [
    'Assess transition readiness for this project: define what must be complete before moving to the next phase, confirm which of those criteria are currently met, and identify what is blocking the transition. If no criteria are defined, define them now.',
    'Review the current phase of this project against its original definition: have the objectives for this phase been met, what work is still in progress, and is there a clear handoff point that marks the end of this phase and the beginning of the next?',
    'Cross-confirm phase completion for this project: what artifacts, decisions, or quality gates were supposed to be produced in this phase, which are complete, which are missing, and what would need to be done to be confident that proceeding to the next phase is the right call?',
  ],
  L2: [
    'What are the exit criteria for the current phase of this project? Assess which are met and which are not before committing to the next phase.',
    'Is there any unfinished work from the current phase of this project that should be resolved before transitioning — decisions deferred, quality gates not cleared, or artifacts not produced?',
  ],
  L3: [
    'What needs to be true for this project to be ready to move to the next phase, and is any of that currently incomplete or unresolved?',
  ],
};

const ABSENCE_SPEC_CROSS_CONFIRM: DecisionContent = {
  question:      'Spec written — cross-confirmed against requirements?',
  pinchFallback: 'Spec not confirmed.',
  L1: [
    'Cross-confirm this project\'s spec against its source requirements: for each requirement in the spec, verify it traces back to a stated user need or stakeholder decision, covers the acceptance criteria completely, and does not contain assumptions that were not explicitly agreed upon.',
    'Audit this project\'s spec for internal consistency and completeness: identify any requirements that contradict each other, any acceptance criteria that are ambiguous or untestable, and any scope decisions that were made without explicit stakeholder sign-off.',
    'Review this project\'s spec against what is actually feasible given the current technical constraints: flag any requirements that have no clear implementation path, any acceptance criteria that would require capabilities not available in the current stack, and any decisions that have been implicitly made but not documented.',
  ],
  L2: [
    'Go through this project\'s spec and identify any requirement that cannot be directly traced to a stated user need or a documented stakeholder decision — those are assumptions that need to be confirmed before implementation begins.',
    'Is there anything in this project\'s spec that is ambiguous enough that two developers could implement it differently and both be technically correct? Resolve those ambiguities before building.',
  ],
  L3: [
    'Is there anything in this project\'s spec that has not been verified against the original requirements — any assumption, scope decision, or acceptance criterion that was added without explicit confirmation?',
  ],
};

const ABSENCE_SPEC_REVISION: DecisionContent = {
  question:      'Spec drafted — revised since initial version?',
  pinchFallback: 'Spec unrevised.',
  L1: [
    'Revise this project\'s spec to reflect what has been learned since the initial draft: update any requirements that turned out to be more or less complex than anticipated, add acceptance criteria for edge cases discovered during implementation, and remove or defer any scope that has been implicitly dropped.',
    'Audit this project\'s spec for drift: compare the current implementation against the spec and identify where the two have diverged — either the spec is outdated and the implementation is correct, or the implementation has deviated from the spec and needs to be corrected. Resolve each divergence explicitly.',
    'Review this project\'s spec against the current state of the project: what decisions have been made during implementation that are not reflected in the spec, what requirements have been reinterpreted or changed in practice, and what new constraints or dependencies have emerged that the spec does not document?',
  ],
  L2: [
    'Compare the current implementation against this project\'s spec and flag every place they diverge — then decide for each divergence whether the spec needs to be updated or the implementation needs to change.',
    'Is there anything in this project\'s spec that was written before implementation started and no longer reflects the current technical decisions or scope? Update it now so the spec is a true record of what is being built.',
  ],
  L3: [
    'Does this project\'s spec still accurately reflect what is being built, or has the implementation diverged from the original spec without the spec being updated?',
  ],
};

/** ABSENCE_TEST_CREATION_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_TEST_CREATION_CASUAL: DecisionContent = {
  question:      'Built something — any tests written yet?',
  pinchFallback: 'Tests missing.',
  L1: [
    'Write tests for what was just built — unit tests for anything new or changed, and one test that runs the main flow. What\'s the most likely thing that could break?',
    'What\'s the riskiest part of what was just built that has no test? Write one test for that first, then keep going.',
    'Is what was just built easy to test as-is, or does it need a small refactor to make testing feasible? Share what you find.',
  ],
  L2: [
    'Write at least one test for what was just built — something that would catch it breaking silently.',
    'What\'s the most likely thing to break silently in what was just built? Write a test for that.',
  ],
  L3: [
    'Write one test for the most important behaviour in what was just built before moving on.',
  ],
};

/** ABSENCE_REGRESSION_CHECK_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_REGRESSION_CHECK_CASUAL: DecisionContent = {
  question:      'Changed something — did anything break?',
  pinchFallback: 'Regression check.',
  L1: [
    'Run the tests for this project and check — did what was just built break anything that was working before? Report what\'s failing and why.',
    'What existing code is most likely affected by what was just built? Run those tests and tell me if anything broke.',
    'Look at what was just built — what could it accidentally break in what was already working? Verify those paths still work.',
  ],
  L2: [
    'Run the test suite and flag anything that\'s now failing that wasn\'t before — especially anything near what was just built.',
    'What existing functionality is most likely affected by what was just built? Give it a quick check.',
  ],
  L3: [
    'Run the tests and tell me if anything broke after what was just built was added.',
  ],
};

/** ABSENCE_SPEC_ACCEPTANCE_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_SPEC_ACCEPTANCE_CASUAL: DecisionContent = {
  question:      'Built something — does it match what was planned?',
  pinchFallback: 'Check the spec.',
  L1: [
    'Check what was just built against the original plan — does it actually do what it was supposed to? List anything that\'s off, missing, or different from what was asked for.',
    'Compare what was just built to what was specified — any gaps, extra bits that weren\'t asked for, or things that work differently than planned?',
    'Does what was just built handle the edge cases from the spec, or just the happy path? Flag anything that would fail on a non-standard input.',
  ],
  L2: [
    'Does what was just built match what was planned? Flag anything that\'s different or missing.',
    'What\'s the biggest gap between what was just built and what the spec asked for?',
  ],
  L3: [
    'Is there anything in what was just built that doesn\'t match what was originally planned or specified?',
  ],
};

/** ABSENCE_CROSS_CONFIRMING_CASUAL — casual-register variant for pro_geek_soul and null profiles */
const ABSENCE_CROSS_CONFIRMING_CASUAL: DecisionContent = {
  question:      'AI wrote it — have you actually checked it?',
  pinchFallback: 'Verify the output.',
  L1: [
    'Take a real look at what was just built — not just \'does it look right\', but does it actually work correctly? Check for made-up functions, wrong assumptions, or logic that sounds good but doesn\'t hold up.',
    'Walk through what was just built and check each part — is there anything that looks right but is subtly off, handles the wrong case, or references something that doesn\'t exist?',
    'Check what was just built for the classic AI mistakes — hallucinated APIs, edge cases silently skipped, or missing error handling. Flag anything you haven\'t manually verified.',
  ],
  L2: [
    'Is there anything in what was just built that you accepted without actually checking if it works correctly?',
    'Walk through the main logic in what was just built — does it actually do what you expect, or just look like it does?',
  ],
  L3: [
    'Is there anything in what was just built that was generated but you haven\'t checked for correctness yet?',
  ],
};

const ABSENCE_SECURITY_CHECK_CASUAL: DecisionContent = {
  question:      'Built something — any security checks done?',
  pinchFallback: 'Security gap.',
  L1: [
    'Look at what was just built — is there anything that handles user input or touches auth that hasn\'t been checked for obvious security problems? What could an attacker do with this as it stands?',
    'Check what was just built for the easy wins an attacker would go for first — bad input handling, missing permission checks, or anything that leaks data it shouldn\'t.',
    'Walk through what was just built as if you\'re trying to break it — what\'s the first thing you\'d try? Flag anything that looks like it could be abused.',
  ],
  L2: [
    'What\'s the biggest security risk in what was just built? Flag it and explain what needs to change.',
    'Is there anything in what was just built that handles user input or auth that hasn\'t been properly validated or checked?',
  ],
  L3: [
    'Is there anything in what was just built that could be exploited — untrusted input, missing auth, or data that shouldn\'t be exposed?',
  ],
};

const ABSENCE_ERROR_HANDLING_CASUAL: DecisionContent = {
  question:      'Feature built — what happens when it breaks?',
  pinchFallback: 'Error handling.',
  L1: [
    'Look at what was just built — what happens when something goes wrong? Check for unhandled errors, anything that fails silently, and cases where the error message would tell an attacker more than the user needs to know.',
    'Walk through the unhappy paths in what was just built — what happens when a network call fails, the input is weird, or a dependency isn\'t available? Are those cases handled, or does it just crash?',
    'Think about what was just built from the angle of things going wrong — what\'s the most likely failure, and what does the user or caller see when it happens? Is that the right behaviour?',
  ],
  L2: [
    'What\'s the most likely thing to fail in what was just built, and what happens when it does? Fix it if it\'s not handled.',
    'Is there anything in what was just built that could fail without producing a useful error message or recovering gracefully?',
  ],
  L3: [
    'Is there anything in what was just built that fails silently or doesn\'t handle the obvious error cases?',
  ],
};

const ABSENCE_DOCUMENTATION_CASUAL: DecisionContent = {
  question:      'Code written — is anything documented?',
  pinchFallback: 'Docs missing.',
  L1: [
    'Look at what was just built — what parts would confuse someone reading it for the first time? Add short comments explaining the why, not just the what, for anything that isn\'t obvious from the code itself.',
    'Check what was just built for undocumented decisions — things that would make a future developer go "why did they do it this way?" Write a quick note for each before the context is forgotten.',
    'Does anything in what was just built need a README update or a note in the docs? What would someone need to know to use or maintain this feature without asking you directly?',
  ],
  L2: [
    'What\'s the most confusing part of what was just built for someone who didn\'t write it? Add a comment or doc for that.',
    'Are there any decisions in what was just built that future-you would wonder about in six months? Document them now.',
  ],
  L3: [
    'Is there anything in what was just built that needs a comment or note to explain why it works the way it does?',
  ],
};

const ABSENCE_OBSERVABILITY_CASUAL: DecisionContent = {
  question:      'Feature built — will you know when it breaks?',
  pinchFallback: 'No observability.',
  L1: [
    'Look at what was just built — if it breaks in production tonight, what would you see in your logs? If the answer is "not much", add logging for the key events: requests coming in, failures happening, anything that changed state.',
    'Check what was just built for blind spots in production — what does it do that you currently can\'t see? Add logging or metrics for the things you\'d want to know about when something goes wrong.',
    'What\'s the first thing you\'d check if what was just built stopped working in production? Is that thing actually observable right now, or would you be flying blind?',
  ],
  L2: [
    'What would you see in your logs if what was just built failed in production right now? If not much, add logging for the key failure points.',
    'Is there anything in what was just built that could break silently in production without triggering an alert or showing up in logs?',
  ],
  L3: [
    'If what was just built broke in production, would you be able to detect it from logs or monitoring? What\'s missing?',
  ],
};

const ABSENCE_COMPREHENSION_CASUAL: DecisionContent = {
  question:      'AI wrote it — do you actually get it?',
  pinchFallback: 'Comprehension check.',
  L1: [
    'Look at what was just built — is there any part you couldn\'t explain to someone else right now? Find the bit you\'re least confident about and trace through it until you actually understand what it does.',
    'Walk through what was just built and spot the parts you accepted because they looked right, not because you verified them. Pick the riskiest one and make sure you understand it properly.',
    'Is there anything in what was just built that uses a library or approach you haven\'t used before? Make sure you understand what it does — not just that it works — before moving on.',
  ],
  L2: [
    'What\'s the part of what was just built you\'re least confident you understand? Trace through it and make sure you get it.',
    'Is there anything in what was just built you accepted without really checking the logic? Flag it and go back through it.',
  ],
  L3: [
    'Is there anything in what was just built that you haven\'t fully understood and verified yourself?',
  ],
};

const ABSENCE_REFACTORING_CASUAL: DecisionContent = {
  question:      'Long build run — anything to clean up?',
  pinchFallback: 'Refactor check.',
  L1: [
    'Look at what was just built as a whole — is there anything that\'s gotten messy, duplicated, or harder to read than it needs to be? Flag the bits that would slow down the next person who touches this.',
    'Walk through what was just built and find the thing you\'d be embarrassed to show in a code review — the copy-pasted section, the function that does too much, the name that doesn\'t mean what it says anymore. Flag it and address it.',
    'Check if what was just built fits cleanly with the rest of the codebase or if it\'s starting to diverge in style or structure. Flag anything that would make future changes harder than they need to be.',
  ],
  L2: [
    'What\'s the messiest part of what was just built? Is it worth cleaning up now before it compounds?',
    'Is there anything in what was just built that\'s duplicated, overly complex, or inconsistent with the rest of the codebase?',
  ],
  L3: [
    'Is there anything in what was just built that should be cleaned up or simplified before moving on?',
  ],
};

const ABSENCE_NO_PUSHBACK_CASUAL: DecisionContent = {
  question:      'AI keeps suggesting — are you actually evaluating?',
  pinchFallback: 'No pushback.',
  L1: [
    'Look at the AI responses that produced what was just built — is there anything you accepted without really thinking about whether it was the right call? Pick the one you\'re least sure about and push back on it now.',
    'Check how you\'ve been accepting AI suggestions for this feature — have you been approving them because they look reasonable, or because you\'ve actually thought through the alternatives? Flag the ones where you\'re not sure.',
    'Take the most recent AI suggestion used in what was just built and challenge it: what assumptions did it make, what did it not consider, and is this actually the best way to do it for this project?',
  ],
  L2: [
    'What\'s the last AI output used in what was just built that you accepted without questioning it? Push back on it now and see if it holds up.',
    'Is there anything in what was just built where you accepted what the AI said because it sounded confident, not because you verified it yourself?',
  ],
  L3: [
    'Is there any AI suggestion used in what was just built that you accepted without actually evaluating whether it was the right approach?',
  ],
};

const ABSENCE_CORRECTION_SEEKING_CASUAL: DecisionContent = {
  question:      'Has the AI checked its own work?',
  pinchFallback: 'No verification.',
  L1: [
    'Ask the AI to take a second look at what was just built — not to explain it, but to actually critique it. What would it do differently, what assumptions did it make that might be wrong, and what are the riskiest parts?',
    'Get the AI to argue against its own output for what was just built: what\'s the case against this approach, what did it not consider, and what\'s the part it\'s least confident about?',
    'Ask the AI: if you had to find a bug or a flaw in what was just built, what would it be? Don\'t let it off the hook with "it looks fine."',
  ],
  L2: [
    'Ask the AI to review what was just built as if it hadn\'t written it — what would it flag or change?',
    'Get the AI to identify the weakest part of what was just built and explain what it\'s not sure about.',
  ],
  L3: [
    'Ask the AI to identify the part of what was just built it\'s least confident is correct.',
  ],
};

const ABSENCE_PROBLEM_CORRECTION_CASUAL: DecisionContent = {
  question:      'Spotted a bug — did it actually get fixed?',
  pinchFallback: 'Bug unresolved.',
  L1: [
    'Go through what was just built and check: is there anything that was flagged as broken or wrong earlier in this session that hasn\'t actually been fixed yet? Don\'t let it get buried under new code.',
    'Look at the known issues in what was just built — anything that came up as a bug or a problem in this session. Is each one fixed, or just acknowledged and skipped over?',
    'Run the tests for what was just built and check if any of the failures match issues that were mentioned earlier in this session. If yes, fix them before adding anything new.',
  ],
  L2: [
    'Is there anything in what was just built that was identified as broken or wrong earlier in this session but hasn\'t been fixed yet?',
    'Run the tests for what was just built and check — are any of the failures from issues that were already noticed earlier and not resolved?',
  ],
  L3: [
    'Is there any bug in what was just built that was noticed earlier in this session but not explicitly fixed?',
  ],
};

const ABSENCE_ALTERNATIVES_CASUAL: DecisionContent = {
  question:      'Decision made — any alternatives looked at?',
  pinchFallback: 'No alternatives.',
  L1: [
    'Look at the biggest decision made in what was just built — is it the right call, or just the first thing that came to mind? Name one or two other ways it could have been done and explain why this approach beats them.',
    'Check the key choices made while building this feature: is there anything where you went with the first option without stopping to think if there was a better or simpler way? Flag those and evaluate them now.',
    'Think about what was just built from the angle of a different developer on a different stack — what would they have done differently, and is the current approach actually the best fit for this project?',
  ],
  L2: [
    'What\'s the most important technical choice in what was just built? Name the alternatives you didn\'t go with and confirm this is still the right call.',
    'Is there anything in what was just built where a simpler or different approach would have worked just as well — or better?',
  ],
  L3: [
    'Is there any decision in what was just built that was made without really looking at other options first?',
  ],
};

const ABSENCE_ARCH_CONFLICT_CASUAL: DecisionContent = {
  question:      'Feature added — does it fit the codebase?',
  pinchFallback: 'Arch conflict.',
  L1: [
    'Look at what was just built and check if it fits with the rest of the codebase — does it follow the same patterns, or does it do things in a new way that the rest of the project doesn\'t? Flag anything that would make a future developer say "why is this one different?"',
    'Check what was just built for places where it crosses boundaries it probably shouldn\'t, pulls in data in a way the rest of the codebase doesn\'t, or introduces a new pattern without a clear reason. Is it consistent, or is it starting to diverge?',
    'Compare what was just built to how the same kind of thing is done elsewhere in the project — same approach, or something different? If different, is there a good reason for it, or did it just happen that way?',
  ],
  L2: [
    'Does what was just built follow the same patterns as the rest of the codebase, or does it introduce something new that might conflict with what\'s already there?',
    'Is there anything in what was just built that doesn\'t fit with the way the rest of the project is structured?',
  ],
  L3: [
    'Is there anything in what was just built that doesn\'t match the patterns or structure of the existing codebase?',
  ],
};

const ABSENCE_PROMPT_CONTEXT_CASUAL: DecisionContent = {
  question:      'Sending prompts — have you shared the spec?',
  pinchFallback: 'Missing context.',
  L1: [
    'Check the prompts used to build this feature — does the AI actually know what the spec says, what the architecture looks like, and what the task is supposed to achieve? If it\'s just getting ad hoc instructions, paste the relevant context in now so it\'s building the right thing.',
    'Has the AI been working with the full picture, or just the last thing you asked it to do? If there\'s a spec, an architecture doc, or a task breakdown it hasn\'t seen yet, share it and ask it to check that what was just built matches up.',
    'Paste the relevant spec or task definition into the conversation and ask the AI to confirm that what was just built actually does what it\'s supposed to. If there\'s a mismatch, now is a better time to find it than after shipping.',
  ],
  L2: [
    'Does the AI have enough context to build this feature correctly — has it seen the spec, the architecture, or the task breakdown? If not, share the relevant bits now.',
    'Paste the spec or the definition of done for this feature into the conversation and check whether what was just built actually matches it.',
  ],
  L3: [
    'Does the AI know what the spec says for this feature, or has it been building without seeing it?',
  ],
};

const ABSENCE_ROLLBACK_PLANNING_CASUAL: DecisionContent = {
  question:      'Shipping soon — what\'s the rollback plan?',
  pinchFallback: 'No rollback plan.',
  L1: [
    'Before you ship this feature, work out what you\'d do if the deployment goes wrong — what\'s the rollback plan, how long would it take, and is there anything in this feature that can\'t be undone cleanly?',
    'Walk through what would happen if you had to roll back this feature in production tonight — what steps would you follow, what could go wrong during the rollback, and is there anything left in an inconsistent state if you do?',
    'Check the rollback risk in this feature — any database migrations, external integrations, or data changes that would be a pain to undo? Flag those before shipping and decide if you\'re okay with them.',
  ],
  L2: [
    'What\'s the rollback plan for this feature if the deployment goes sideways? Write it down — it should be something you could follow in a panic without thinking.',
    'Is there anything in this feature that can\'t be rolled back cleanly? Know that before you ship.',
  ],
  L3: [
    'Do you have a plan for rolling back this feature if the deployment fails, or would you be making it up as you go?',
  ],
};

const ABSENCE_DEPLOYMENT_PLANNING_CASUAL: DecisionContent = {
  question:      'Shipping soon — is the deployment actually planned?',
  pinchFallback: 'No deploy plan.',
  L1: [
    'Before shipping this feature, check: do you actually have a deployment plan? What environment config does it need, what secrets need to be in place, and has anything been tested outside your local setup?',
    'Walk through how this feature is actually going to get deployed — what\'s the process, what needs to be configured in the production environment, and is there anything that only exists in your local config that hasn\'t been provisioned yet?',
    'Check the gap between where this feature runs now and what production actually needs — are there environment variables, secrets, or infrastructure pieces that aren\'t set up yet? Sort those out before shipping.',
  ],
  L2: [
    'What does the production environment need to have in place before this feature can deploy cleanly? Confirm each of those is actually ready.',
    'Has this feature been tested anywhere other than your local machine? If it goes straight to production, what are you not sure about?',
  ],
  L3: [
    'Is there a deployment plan for this feature, or are you planning to figure it out when you push?',
  ],
};

const ABSENCE_DEPENDENCY_MGMT_CASUAL: DecisionContent = {
  question:      'Added packages — any issues checked?',
  pinchFallback: 'Dependency risk.',
  L1: [
    'Check the packages added in what was just built — do they conflict with anything already installed, is there a security issue with the version you picked, and is there a better or more popular alternative you didn\'t consider?',
    'Look at the new dependencies in what was just built: are they actively maintained, is the version you\'re using the latest stable one, and do they pull in anything that clashes with what\'s already in the project?',
    'Run a quick audit on the packages added in what was just built — any known CVEs in the version you\'re using, licence issues that could cause problems, or extra packages they pull in that don\'t play nice with what\'s already there?',
  ],
  L2: [
    'Have the packages added in what was just built been checked for conflicts and vulnerabilities? Run a dependency audit and flag anything suspicious.',
    'Is there any package added in what was just built that looks risky — old version, no maintenance, licence mismatch, or something that clashes with existing dependencies?',
  ],
  L3: [
    'Have the new packages added in what was just built been checked for conflicts, vulnerabilities, or licence issues?',
  ],
};

const ABSENCE_PHASE_TRANSITION_CASUAL: DecisionContent = {
  question:      'Been in this phase a while — what comes next?',
  pinchFallback: 'Phase check.',
  L1: [
    'Step back from this project and think about where you are in the overall flow — have you actually finished this phase, or have you just been in it for a while? What needs to be done before it makes sense to move on?',
    'Look at what you set out to accomplish in this phase of this project — is it done, partially done, or have you moved past it without properly closing it off? Figure out where you actually are before starting something new.',
    'Check what you set out to finish before moving on from this phase of this project — what\'s actually done, what\'s been skipped or deferred? Make a call on whether you\'re ready to transition.',
  ],
  L2: [
    'Is there anything left unfinished in the current phase of this project that should be sorted before you move on to the next one?',
    'What\'s the next phase for this project, and what needs to be in place before you can properly start it? Are those things ready?',
  ],
  L3: [
    'Is this project actually ready to move to the next phase, or has it just been in the current phase for a long time without a clear exit point?',
  ],
};

const ABSENCE_SPEC_CROSS_CONFIRM_CASUAL: DecisionContent = {
  question:      'Spec exists — has it been checked against the plan?',
  pinchFallback: 'Spec not confirmed.',
  L1: [
    'Go through this project\'s spec and check it against the original plan — does every requirement actually come from something that was agreed on, or did some assumptions sneak in that no one has explicitly signed off on?',
    'Look at this project\'s spec for anything that\'s vague enough to be interpreted two different ways — anything that could lead to building the wrong thing and still technically meeting the spec. Fix those before coding starts.',
    'Check this project\'s spec against what you can actually build with the current stack — is there anything in there that\'s going to hit a wall when someone tries to implement it? Flag those now.',
  ],
  L2: [
    'Is there any part of this project\'s spec that came from an assumption rather than something explicitly agreed on? Track those down and confirm them.',
    'Is there anything in this project\'s spec vague enough that two people could implement it differently? Clarify it now before it causes a disagreement mid-build.',
  ],
  L3: [
    'Is there anything in this project\'s spec that hasn\'t been verified against what was actually agreed on — any assumptions that are being treated as confirmed requirements?',
  ],
};

const ABSENCE_SPEC_REVISION_CASUAL: DecisionContent = {
  question:      'Spec written — has it been updated since the first draft?',
  pinchFallback: 'Spec unrevised.',
  L1: [
    'Update this project\'s spec to match what you know now — any requirements that turned out harder or simpler than expected, any edge cases that came up during building, and any things that got quietly dropped or changed in scope.',
    'Check whether this project\'s spec still matches what\'s actually being built — where have things changed since the first draft, what decisions got made during implementation that aren\'t written down, and what would a new developer get wrong by reading the original spec?',
    'Look at where this project\'s spec and the actual implementation have drifted apart — for each gap, is it that the spec needs updating, or that the implementation went in the wrong direction?',
  ],
  L2: [
    'Is this project\'s spec still accurate, or has the implementation moved on from what was originally written? Update the parts that no longer match.',
    'What\'s changed in this project since the spec was first written that isn\'t reflected in the spec yet? Update it now while the context is still fresh.',
  ],
  L3: [
    'Does this project\'s spec still reflect what\'s actually being built, or has the implementation moved on without the spec being updated?',
  ],
};

// ── Sub-4 — idea / task_breakdown / feedback_loop ─────────────────────────────

// Group A — idea signals

const ABSENCE_IDEA_SCOPING: DecisionContent = {
  question:      'Idea in mind — is the scope defined?',
  pinchFallback: 'Scope undefined.',
  L1: [
    'Define the scope of this project precisely: what is the core problem it solves, what are the primary capabilities it must deliver, and what does a complete first version look like?',
    'Write a scope statement for this project: describe the problem in one sentence, the solution in one paragraph, and draw an explicit boundary around what is and is not included in the initial version.',
    'Cross-confirm the project scope: summarize in your own words what this project is, what problem it solves, and what \'built\' means for this project — then flag what is still ambiguous or undefined.',
  ],
  L2: [
    'Summarize the scope of this project in three sentences: the problem, the core solution, and the boundary of the first version.',
    'What is the single most important thing to define about this project before building starts? Articulate it precisely.',
  ],
  L3: [
    'What is this project, what problem does it solve, and what will the first version include?',
  ],
};

const ABSENCE_IDEA_SCOPING_CASUAL: DecisionContent = {
  question:      'Idea forming — what exactly are we building?',
  pinchFallback: 'Scope unclear.',
  L1: [
    'Walk me through this project — what\'s the main idea, what problem does it solve, and what\'s in vs out for the first version?',
    'What exactly are we building here? Describe this project in your own words — what it does, why it exists, and where the line is on what\'s included first.',
    'Summarize this project back to me in your own words — what it does, what problem it solves, and what \'done\' looks like. Flag anything that still feels fuzzy.',
  ],
  L2: [
    'What\'s this project and what\'s it supposed to do for the first version? Give me the short version.',
    'What\'s the most important thing to pin down about this project before we start building?',
  ],
  L3: [
    'What is this project and what will it do?',
  ],
};

const ABSENCE_IDEA_CONSTRAINT_CHECK: DecisionContent = {
  question:      'Idea scoped — are the non-goals defined?',
  pinchFallback: 'Non-goals missing.',
  L1: [
    'Define the constraints and non-goals for this project: what is explicitly out of scope for the first version, what functionality will not be built, and what technical constraints limit the solution space?',
    'Identify the boundary conditions of this project: what adjacent problems will not be solved, what user requests will be deferred, and what are the explicit constraints on scope, technology, or resources?',
    'Write the non-goals section for this project: list at least three things this project will not do, at least one technical constraint, and at least one explicit decision to defer for a future version.',
  ],
  L2: [
    'What are the top three things this project will not do in the first version? Document them explicitly so they do not creep in during implementation.',
    'What is the clearest out-of-scope decision for this project? State it as an explicit non-goal.',
  ],
  L3: [
    'What is one thing this project will not do, and why is that boundary important to state now?',
  ],
};

const ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL: DecisionContent = {
  question:      'Idea forming — what\'s out of scope?',
  pinchFallback: 'No non-goals set.',
  L1: [
    'What are we NOT building in the first version of this project? Walk me through what\'s intentionally out of scope — things that could be asked for but we\'re not doing yet.',
    'What are the constraints on this project? What won\'t it do, what can\'t it do, and what have we decided to skip for now?',
    'List the things this project will not do — at least three things that could be asked for but are deliberately left out. Then tell me which one is most likely to cause confusion if it\'s not stated clearly.',
  ],
  L2: [
    'What\'s one thing this project won\'t do — something someone might expect it to do but we\'re leaving out? State it clearly.',
    'What are we keeping out of this project on purpose? Give me the short list.',
  ],
  L3: [
    'Name one thing this project will not do that should be stated clearly before we start building.',
  ],
};

const ABSENCE_IDEA_USER_DEFINITION: DecisionContent = {
  question:      'Idea scoped — is the target user defined?',
  pinchFallback: 'Target user undefined.',
  L1: [
    'Define the target user for this project precisely: who is the primary user, what is their context and skill level, what problem do they have that this project solves, and what does success look like from their perspective?',
    'Write a target user profile for this project: describe who will use it, what they are trying to accomplish, what they already know and do not know, and how this project fits into their workflow.',
    'Cross-confirm the target user definition for this project: given what has been described, who is this project for, who is explicitly not the target user, and what does that boundary imply for the feature set?',
  ],
  L2: [
    'Who is the primary user of this project and what are they trying to accomplish? Define them precisely enough that you could make a product decision on their behalf.',
    'What does the target user of this project already know and not know? That context will drive every design decision.',
  ],
  L3: [
    'Who is this project for, and what are they trying to do?',
  ],
};

const ABSENCE_IDEA_USER_DEFINITION_CASUAL: DecisionContent = {
  question:      'Idea forming — who is this actually for?',
  pinchFallback: 'User not defined.',
  L1: [
    'Who is this project for? Walk me through who the main user is, what they\'re trying to do, and what they know going in — be specific enough that we could make decisions about this project on their behalf.',
    'Describe the person who\'ll use this project — who they are, what they want to do with it, and what level of experience they have. Then tell me who it\'s definitely NOT for.',
    'Think about the person using this project — who are they? Describe them to me, including what problem they have and how this project fits into what they\'re already doing.',
  ],
  L2: [
    'Who\'s the main person this project is for? Give me enough detail that we could make a feature decision based on what they need.',
    'What does the person using this project actually want to do with it? Describe them simply.',
  ],
  L3: [
    'Who is this project for and what are they trying to do?',
  ],
};

// Group B — task_breakdown signals

const ABSENCE_TASK_ORDERING: DecisionContent = {
  question:      'Tasks listed — have they been ordered?',
  pinchFallback: 'Tasks unordered.',
  L1: [
    'Order the tasks for this project by dependency and priority: identify which tasks block others, which can be done in parallel, and establish the sequence that minimises rework and delivers the earliest working state.',
    'Review the task list for this project and establish an explicit order: which task must be done first, which tasks have hard dependencies on others, and what is the critical path to a testable first version?',
    'Prioritize the task list for this project: rank tasks by impact and dependency, identify the single highest-priority task to start with, and flag any tasks that should be deferred until a working core is established.',
  ],
  L2: [
    'What is the correct order of tasks for this project? Identify the first three tasks in sequence and explain why each one must come before the next.',
    'Which task in this project should be done first, and why? Establish the top of the ordered list before anything else starts.',
  ],
  L3: [
    'What is the first task to work on for this project, and what does it unblock?',
  ],
};

const ABSENCE_TASK_ORDERING_CASUAL: DecisionContent = {
  question:      'Tasks listed — what order do we do them in?',
  pinchFallback: 'No order set.',
  L1: [
    'Put the tasks for this project in order — which ones have to happen before others, which ones are independent, and what\'s the sequence that gets us to something working as fast as possible?',
    'Look at the task list for this project and sort it — what comes first, what depends on what, and what\'s the critical path to something we can actually test?',
    'What\'s the right order to tackle the tasks for this project? Rank them by what\'s blocking what, and tell me which task to start with and why.',
  ],
  L2: [
    'What are the first three tasks for this project in order? Tell me what order makes sense and why.',
    'Which task should we do first for this project and why does it come before everything else?',
  ],
  L3: [
    'What\'s the first task to work on for this project?',
  ],
};

const ABSENCE_TASK_SIZING: DecisionContent = {
  question:      'Tasks defined — are they scoped to single sessions?',
  pinchFallback: 'Tasks oversized.',
  L1: [
    'Review the task list for this project and validate sizing: each task should be completable in a single focused session. Identify any tasks that span multiple concerns, require too many unknowns to resolve in one sitting, or are so large that progress cannot be verified at the end of a session.',
    'Break down any oversized tasks in this project: for each task that could not be completed in a single session, decompose it into subtasks — each subtask should have a clear output that can be verified when done.',
    'Assess the scope of each task for this project: flag any that are too large to complete in one session, too vague to know when they\'re done, or dependent on so many unknowns that work could not proceed without stopping midway.',
  ],
  L2: [
    'Which tasks in this project are too large to finish in a single session? Break the largest one down into smaller units now.',
    'Is there any task in this project that could not be completed in a single focused session? Identify it and propose how to split it.',
  ],
  L3: [
    'Identify any task in this project that is too large to finish in a single session and break it into smaller units.',
  ],
};

const ABSENCE_TASK_SIZING_CASUAL: DecisionContent = {
  question:      'Tasks listed — are they small enough to do in one go?',
  pinchFallback: 'Tasks too big.',
  L1: [
    'Go through the tasks for this project — are any of them too big to finish in one session? If so, break them down into smaller pieces that each have a clear endpoint.',
    'Check the task list for this project: which tasks are small enough to finish in one focused session, and which ones are really multiple tasks lumped together? Split the big ones.',
    'Is any task in this project too big to do in one go? Walk me through the tasks and flag anything that would require stopping midway because there\'s too much or too many unknowns.',
  ],
  L2: [
    'Which task in this project feels the biggest? Break it down into two or three smaller tasks that could each be finished in one session.',
    'Are the tasks for this project small enough to finish one at a time, or do any of them need to be split up?',
  ],
  L3: [
    'Is there any task in this project that\'s too big to do in one session?',
  ],
};

const ABSENCE_TASK_DEFINITION_OF_DONE: DecisionContent = {
  question:      'Tasks ordered — does each task have a definition of done?',
  pinchFallback: 'No done criteria.',
  L1: [
    'Define the completion criteria for each task in this project: for every task, state what must be true for the task to be considered complete — what output exists, what has been verified, and what has not been left in an ambiguous or partially done state.',
    'Audit the task list for this project for missing definitions of done: identify every task that lacks explicit completion criteria, then define what \'done\' means for each — the specific, verifiable condition that ends work on that task.',
    'Write the definition of done for the highest-priority task in this project: what is the exact state of the codebase, tests, and documentation when this task is complete? Use that as a template to define done for the remaining tasks in this project.',
  ],
  L2: [
    'For each task in this project, write one sentence stating what \'done\' looks like — a specific, verifiable condition, not a vague description of intent.',
    'Which task in this project is missing the clearest definition of done? Define what completion looks like for that task before it starts.',
  ],
  L3: [
    'Does every task in this project have a clear, verifiable definition of done, or are any tasks missing that?',
  ],
};

const ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL: DecisionContent = {
  question:      'Tasks set — how do we know when each one\'s done?',
  pinchFallback: 'Done criteria missing.',
  L1: [
    'For each task in this project, define what done looks like — not just \'it works\' but what specifically is true when the task is finished. What can be checked? What exists that didn\'t before?',
    'Go through the tasks for this project and for each one, write what \'done\' means — the specific thing you\'d check to know it\'s complete. No vague descriptions, just the actual finish line.',
    'Pick the most important task for this project and tell me exactly what done looks like for it — what\'s been built, what\'s been tested, what\'s been verified. Use that as a template to define done for the remaining tasks in this project.',
  ],
  L2: [
    'What does done look like for each task in this project? Write a one-liner for each that describes the specific finish line.',
    'Is there any task in this project where it\'s not clear how we\'d know it\'s done? Define the finish line for that one first.',
  ],
  L3: [
    'How do we know when the first task in this project is done?',
  ],
};

// Group C — feedback_loop signals

const ABSENCE_USER_FEEDBACK_REVIEW: DecisionContent = {
  question:      'Feedback received — has it been reviewed systematically?',
  pinchFallback: 'Feedback not reviewed.',
  L1: [
    'Review the feedback received for this project systematically: collect all available feedback, categorize it by theme or feature area, and identify the recurring complaints, requests, and points of confusion that appear across multiple users.',
    'Analyze the feedback for this project for patterns: what issues surface most frequently, which complaints indicate users cannot complete their primary goal, and where does actual behavior diverge most from what was expected?',
    'Prioritize the feedback for this project by impact: distinguish critical feedback (blocking users from their goal) from high-friction feedback (users struggle but succeed) from low-signal noise, and establish which issues demand immediate action.',
  ],
  L2: [
    'What is the most critical piece of feedback for this project — the one issue that, if left unaddressed, blocks users from achieving their primary goal?',
    'What are the top two or three recurring themes across all feedback for this project?',
  ],
  L3: [
    'What are users saying about this project, and what is the most critical issue in the feedback?',
  ],
};

const ABSENCE_USER_FEEDBACK_REVIEW_CASUAL: DecisionContent = {
  question:      'Feedback in — have we actually gone through it?',
  pinchFallback: 'Feedback not reviewed.',
  L1: [
    'Go through the feedback for this project — collect what users have said, group it by theme, and tell me what comes up over and over. What are the most common complaints or requests?',
    'What patterns are you seeing in the feedback for this project? Walk me through what users are saying — what are the recurring issues, and where are people getting stuck?',
    'Look at the feedback for this project and rank it — what\'s critical (users can\'t do what they need to do), what\'s high friction (they get there but it\'s painful), and what\'s just noise? Tell me what needs to be fixed first.',
  ],
  L2: [
    'What\'s the most critical piece of feedback for this project — the one thing that, if we don\'t fix it, blocks users from doing what they came here to do?',
    'What are the top two or three things users keep saying about this project?',
  ],
  L3: [
    'What are users saying about this project?',
  ],
};

const ABSENCE_ITERATION_PLANNING: DecisionContent = {
  question:      'Feedback reviewed — has the next iteration been planned?',
  pinchFallback: 'Next iteration unplanned.',
  L1: [
    'Define the priorities for the next iteration of this project based on the feedback: rank the issues identified, determine what must be addressed in this iteration versus what can be deferred, and establish the scope of the next version.',
    'Identify the trade-offs for the next iteration of this project: which feedback-driven changes deliver the highest impact for the lowest effort, which require significant rework, and what should be deferred to preserve shipping velocity?',
    'Write the success criteria for the next iteration of this project: given the feedback received, what specific, measurable outcomes would confirm the next iteration resolved the most critical user issues?',
  ],
  L2: [
    'What are the top three changes to make in the next iteration of this project, ordered by priority? Identify them from the feedback.',
    'What is the single most important thing to build or fix in the next iteration of this project, and why does it take priority over everything else?',
  ],
  L3: [
    'What is the first change to make in the next iteration of this project based on what users said?',
  ],
};

const ABSENCE_ITERATION_PLANNING_CASUAL: DecisionContent = {
  question:      'Feedback reviewed — what are we building next?',
  pinchFallback: 'Next iteration unplanned.',
  L1: [
    'Figure out what to build next for this project based on the feedback — what needs to be fixed or added in the next round, what can wait, and what\'s the scope of the next version?',
    'Look at the feedback for this project and tell me what the trade-offs are for the next round — what\'s high impact and quick to do, what\'s a big change that needs more thought, and what should we hold off on?',
    'What does success look like for the next version of this project? Given what users said, what specific things would tell us the next iteration actually fixed the problems?',
  ],
  L2: [
    'What are the top three things to work on next for this project based on the feedback? Put them in priority order.',
    'What\'s the single most important thing to fix or build next for this project, and why does it come first?',
  ],
  L3: [
    'What\'s the first thing to build or fix in the next version of this project?',
  ],
};

// ── Sub-7 — formal content sets ───────────────────────────────────────────────

const ABSENCE_SCOPE_CREEP: DecisionContent = {
  question:      'Scope expanding — still on original plan?',
  pinchFallback: 'Scope check?',
  L1: [
    'Audit what was just built against the original scope for this iteration: list what is complete, what is still in progress, and what has been added that was not in the original plan — and decide whether each addition stays in scope, gets deferred, or gets cut.',
    'List every behaviour and feature added to this feature since implementation began — for each item, confirm whether it was in the agreed scope or was introduced along the way, and make a call: keep it, defer it, or cut it.',
    'Write a scope summary for this project before continuing: what was the original plan for this iteration, what is now in the implementation, and what is the delta — treat anything outside the original plan as a decision that must be made now.',
  ],
  L2: [
    'What was the original scope for this feature, and does the current implementation match it — or has it grown beyond the plan?',
    'What is the most important addition to what was just built that was not in the original scope — and what is the decision on it: in, deferred, or cut?',
  ],
  L3: [
    'What is one thing currently in this feature that was not in the original scope for this session?',
  ],
};

const ABSENCE_CONTEXT_LOSS: DecisionContent = {
  question:      'Long session — context recapped?',
  pinchFallback: 'Context recap?',
  L1: [
    'Summarize the current state of what was just built: what decisions have been made, what is working, what remains incomplete, and what has changed since the session started — use this as a re-anchor before continuing.',
    'Write a session summary for this project: what has been implemented, what the key technical decisions were, what the current blockers are, and what the next two or three steps are.',
    'Before continuing work on this feature: list every significant decision made in this session, the current working state of the implementation, and what remains to complete the agreed scope — this prevents the session from drifting.',
  ],
  L2: [
    'What is the current state of what was just built — what is working, what is still in progress, and what is the immediate next step?',
    'What is the most important technical decision made this session about this feature that must be explicitly carried forward before continuing?',
  ],
  L3: [
    'What is the one piece of context about this project that must not be lost before continuing — the single most important thing to anchor right now?',
  ],
};

const ABSENCE_API_DESIGN_REVIEW: DecisionContent = {
  question:      'API being built — design reviewed?',
  pinchFallback: 'API design?',
  L1: [
    'Review the API surface of what was just built for backwards compatibility: list any changes to existing endpoints, parameters, or response shapes, and confirm whether each change is backwards compatible or constitutes a breaking change that requires a version bump.',
    'Define the contract for this feature\'s API before finalizing implementation: document the endpoint paths, accepted inputs, response shapes, and any error codes — confirm these are stable and not likely to change once consumers depend on them.',
    'Establish the versioning strategy for this project\'s API: will breaking changes be managed through URL versioning, header versioning, or deprecation notices — and does the current implementation reflect that strategy?',
  ],
  L2: [
    'Does what was just built introduce any breaking changes to the existing API contract — and if so, what is the plan for consumers already depending on the current contract?',
    'Is the API surface of this feature explicitly documented and locked before implementation continues — or are the endpoint signatures, inputs, and responses still in flux?',
  ],
  L3: [
    'What is the most important API design decision for this feature that needs to be made before the implementation is considered complete?',
  ],
};

const ABSENCE_ACCESSIBILITY: DecisionContent = {
  question:      'UI being built — accessibility checked?',
  pinchFallback: 'Accessibility?',
  L1: [
    'Audit the ARIA labelling and semantic structure of what was just built: identify every interactive element and confirm it has an accessible name — via native semantics, aria-label, or aria-labelledby — and that its role is correctly communicated to assistive technologies.',
    'Test keyboard navigation for this feature: tab through every interactive element and confirm the tab order is logical, all interactive elements are reachable by keyboard, no focus is trapped unexpectedly, and all actions achievable with a mouse are also achievable without one.',
    'Review the visual accessibility of what was just built: check that all text meets WCAG AA contrast ratios against its background, that focus states are visually distinct, and that no information is conveyed by colour alone.',
  ],
  L2: [
    'Can a keyboard-only user complete the primary workflow in this feature without a mouse — and is the focus order logical as they tab through?',
    'Does every interactive element in what was just built have an accessible name that a screen reader would announce correctly?',
  ],
  L3: [
    'What is the most significant accessibility gap in this feature that a user with a disability would encounter right now?',
  ],
};

const ABSENCE_ENV_AND_SECRETS: DecisionContent = {
  question:      'Credentials in use — secrets management reviewed?',
  pinchFallback: 'Secrets setup?',
  L1: [
    'Audit the secrets storage pattern for what was just built: identify every credential, API key, and environment-specific value used — confirm none are hardcoded in source, all are loaded from environment variables, and the variable names are documented in a `.env.example` file.',
    'Review the environment configuration for this feature: confirm a `.env.example` exists with all required keys (values redacted), that `.env` is in `.gitignore`, and that any secret loaded at runtime has a clear failure path if the variable is missing.',
    'Define the secret rotation plan for this project: for each credential in use, identify who holds it, how it gets rotated if compromised, and whether the current implementation supports hot-swapping secrets without a redeploy.',
  ],
  L2: [
    'Are there any hardcoded credentials, API keys, or secrets in what was just built — and if so, what is the remediation plan before this reaches production?',
    'Is there a `.env.example` that documents every environment variable required by this feature, and is the actual `.env` file excluded from source control?',
  ],
  L3: [
    'What is the most sensitive credential used by this feature — and where is it currently stored?',
  ],
};

const ABSENCE_DATA_VALIDATION: DecisionContent = {
  question:      'Accepting input — data validation in place?',
  pinchFallback: 'Input validation?',
  L1: [
    'Define the input schema for what was just built: for every endpoint or form, document the expected shape — required fields, optional fields, data types, and any constraints (min/max, allowed values) — and implement schema validation using a library such as Zod, Yup, or Joi.',
    'Audit the validation coverage for this feature: for each input accepted, confirm there is an explicit check for required fields, correct data types, and acceptable value ranges — and that invalid inputs return a clear, descriptive error rather than failing silently or crashing.',
    'Write the unhappy-path scenarios for data validation in this project: what happens when a required field is missing, when a value is the wrong type, and when the payload structure is completely unexpected — confirm the implementation handles each case explicitly.',
  ],
  L2: [
    'Is there a schema validation layer for what was just built that rejects malformed inputs before they reach the business logic — and which library or approach is being used?',
    'What are the required fields for each input accepted by this feature, and what happens if any of them are missing or the wrong type?',
  ],
  L3: [
    'What is one input accepted by this feature that currently has no validation — and what is the worst-case outcome if it receives unexpected data?',
  ],
};

const ABSENCE_CI_PIPELINE: DecisionContent = {
  question:      'Moving toward release — CI pipeline configured?',
  pinchFallback: 'CI pipeline?',
  L1: [
    'Confirm automated test execution is configured for this project: check that a CI workflow (e.g. GitHub Actions) runs the full test suite on every pull request and push to main — verify the workflow file exists, the test command is correct, and test failures block merges.',
    'Review the CI build verification for this feature: confirm that a failing build — compilation errors, type errors, or broken imports — is caught automatically before code reaches the main branch, and that the pipeline status is visible on every pull request.',
    'Audit the CI pipeline coverage for what was just built: list every check currently configured (tests, linting, type-checking, security scans), confirm each is wired up correctly, and identify any verification that runs locally but is missing from the pipeline.',
  ],
  L2: [
    'Does this project have a CI pipeline that automatically runs its tests on every pull request — and does a test failure block a merge?',
    'What does the CI pipeline for this feature actually verify — and is there anything checked locally during development that is not running automatically in CI?',
  ],
  L3: [
    'What is the most important automated check missing from the CI pipeline for this project right now?',
  ],
};

const ABSENCE_RATE_LIMITING: DecisionContent = {
  question:      'API endpoint built — rate limiting designed?',
  pinchFallback: 'Rate limiting?',
  L1: [
    'Define the rate limiting strategy for what was just built: specify the throttle limits per user, per API key, or per IP address — confirm which identifier is used for tracking, what the limit is (requests per second or per minute), and what happens when the limit is exceeded.',
    'Design the throttle response for this feature: when a caller exceeds the rate limit, confirm the API returns a 429 status with a `Retry-After` header or equivalent signal — and document the expected backoff behaviour for clients.',
    'Establish the quota model for this project: decide whether rate limits are applied per second, per minute, or per hour, whether limits differ by user tier or API key, and whether the throttle resets on a rolling window or a fixed interval.',
  ],
  L2: [
    'What is the per-user or per-key request limit for what was just built — and is there any middleware or layer currently enforcing that limit?',
    'What response does this feature return when a caller is throttled — and does the response include enough information for the client to know when to retry?',
  ],
  L3: [
    'What is the most likely way this feature gets abused through excessive requests — and is there any throttle mechanism currently in place to prevent it?',
  ],
};

const ABSENCE_FEATURE_SCOPE: DecisionContent = {
  question:      'Feature started — Definition of Ready confirmed?',
  pinchFallback: 'Scope this first.',
  L1: [
    'Define the scope and acceptance criteria for this feature before implementation continues: what is the feature doing, what are the explicit out-of-scope items, and what conditions must be true for the feature to be accepted as done? This is the Definition of Ready for sprint planning.',
    'Write a feature specification before proceeding: intended behaviour, input/output contract, acceptance criteria (at least 3 scenarios covering happy path and key edge cases), and explicit scope boundaries. Implementation without this is a Definition of Ready violation.',
    'Cross-confirm the feature scope: given what has been built so far in this session, is there a written definition of what the feature does and how it will be accepted? If not, define it now — spec the behaviour before writing more code.',
  ],
  L2: [
    'State the acceptance criteria for this feature: what specific conditions must be true for this feature to be considered complete and ready for review?',
    'Define the scope boundary: what does this feature do, and what is explicitly deferred or out of scope? One paragraph before continuing implementation.',
  ],
  L3: [
    'What are the acceptance criteria for this feature? List them before adding more code.',
  ],
};

const ABSENCE_IMPLEMENTATION_CHECKPOINT: DecisionContent = {
  question:      'Implementation continued — current state verified?',
  pinchFallback: 'Verify first.',
  L1: [
    'Run an implementation checkpoint before continuing: verify the last unit of work is in a passing state — either by running the relevant tests or by manually tracing the main path through the recently added code. Per TDD Red-Green-Refactor practice, only continue building once the current state is green.',
    'Apply the TDD feedback loop to the last change: does what was just built satisfy its stated requirement? Trace the code path, run the tests if they exist, and confirm the current state is working before layering the next change on top of it.',
    'Checkpoint the implementation before proceeding: what is the current state — working, broken, or untested? Identify the specific condition that confirms this unit of work is done and verify it now.',
  ],
  L2: [
    'Before the next implementation step — does the current build pass? Run existing tests or manually verify the most recent change against its requirements.',
    'What was the last thing built, and is it verified to work? Run the tests or do a quick manual trace before continuing.',
  ],
  L3: [
    'Verify the last change works before adding the next one — run tests or manually confirm the current build is functional.',
  ],
};

const ABSENCE_SPEC_BEFORE_CODE: DecisionContent = {
  question:      'Implementation started — behaviour specified first?',
  pinchFallback: 'Spec before code.',
  L1: [
    'Write a behaviour specification before continuing implementation: using BDD Given/When/Then format, define at least the primary scenario — Given [context], When [action], Then [expected outcome]. Per spec-driven development practice, the specification is the source of truth; code is the verification.',
    "Define the acceptance criteria for what is being built before writing more code: what specific behaviour must be true for this implementation to be considered correct? Per Dan North's BDD principle: 'a story's behaviour is simply its acceptance criteria' — write them before you implement.",
    'Apply spec-first discipline to the current implementation unit: write the expected behaviour (inputs, process, outputs, error cases) before continuing. This is the boundary between planning and execution — the spec defines the target, implementation verifies against it.',
  ],
  L2: [
    'Write the Given/When/Then scenario for what is being built before adding more code: what context, what action, and what expected outcome?',
    'Define the expected behaviour of this implementation unit before continuing: what must be true for this to be considered correct?',
  ],
  L3: [
    'Write one Given/When/Then scenario for what is being built before the next implementation step.',
  ],
};

// ── Sub-7 — casual content sets ───────────────────────────────────────────────

const ABSENCE_SCOPE_CREEP_CASUAL: DecisionContent = {
  question:      'Scope expanding — still on original plan?',
  pinchFallback: 'Scope check?',
  L1: [
    'Take a look at what was just built and compare it to what you originally set out to do — is anything in there that wasn\'t part of the plan? Go through it and flag any extras before adding more.',
    'Think about what this feature was supposed to do when you started — has anything crept in that wasn\'t in the original idea? Go through it and decide what to keep, what to push to later, and what to drop.',
    'Before going further with this project — list what you originally planned to build this session and what\'s actually in there now. For anything extra, make a call: now, later, or never.',
  ],
  L2: [
    'What did you originally set out to build in this feature, and does what\'s there now actually match that — or has it grown?',
    'What\'s the most important thing added to what was just built that wasn\'t part of the original plan — and what are you going to do with it?',
  ],
  L3: [
    'What\'s one thing in this feature that ended up there but wasn\'t in the original plan?',
  ],
};

const ABSENCE_CONTEXT_LOSS_CASUAL: DecisionContent = {
  question:      'Long session — context recapped?',
  pinchFallback: 'Context recap?',
  L1: [
    'Let\'s get back on the same page — go through what was just built and give me a quick rundown: what\'s done, what\'s working, and what\'s still left to do.',
    'Take a minute to catch up on this project — what have we actually built this session, what decisions did we make, and what\'s coming next?',
    'Before going further with this feature — do a quick check: where are we, what\'s working, and what\'s the next thing that actually needs to happen?',
  ],
  L2: [
    'What\'s the situation with what was just built right now — what\'s working and what still needs to happen?',
    'What\'s the most important decision we made about this feature this session that you want to make sure we don\'t lose track of?',
  ],
  L3: [
    'What\'s the one thing you most need to remember about where this project is right now before you keep going?',
  ],
};

const ABSENCE_API_DESIGN_REVIEW_CASUAL: DecisionContent = {
  question:      'API being built — design reviewed?',
  pinchFallback: 'API design?',
  L1: [
    'Take a look at what was just built and check whether it could break anything that already uses this API — are there any changes to how endpoints work, what they expect, or what they return that might surprise existing callers?',
    'Before locking in the API for this feature — go through what it accepts and what it returns, and think about whether that\'s something you\'d be comfortable with other code depending on. Is anything likely to change again?',
    'Think about how this project\'s API handles changes over time — if something needs to change in a future version, how do you manage that without breaking code that\'s already using it?',
  ],
  L2: [
    'Does what was just built change how the API works in a way that could break something already depending on it — and if so, what\'s the plan?',
    'Is the shape of this feature\'s API settled enough that you\'re comfortable building other things on top of it — or is it likely to change?',
  ],
  L3: [
    'What\'s the most important API design question about this feature that hasn\'t been answered yet?',
  ],
};

const ABSENCE_ACCESSIBILITY_CASUAL: DecisionContent = {
  question:      'UI being built — accessibility checked?',
  pinchFallback: 'Accessibility?',
  L1: [
    'Go through what was just built and check whether a screen reader could make sense of it — does every button and link have a clear label, and are there any parts that would be confusing or silent for someone using one?',
    'Try using this feature with just the keyboard — no mouse. Can you get to everything, use everything, and does the tab order feel natural? Note anything that gets stuck or hard to reach.',
    'Take a look at the visual design of this feature from an accessibility angle — is the contrast readable, are focus states visible when you tab through, and is anything communicated only through colour that a colour-blind user might miss?',
  ],
  L2: [
    'Could someone who can\'t use a mouse still complete the main task in this feature using only the keyboard — and does tabbing through it feel natural?',
    'Does everything in what was just built have a label that a screen reader would announce — so someone who can\'t see the screen knows what each button and input is for?',
  ],
  L3: [
    'What\'s the one accessibility issue in this feature that would most get in the way of someone with a disability using it?',
  ],
};

const ABSENCE_ENV_AND_SECRETS_CASUAL: DecisionContent = {
  question:      'Credentials in use — secrets management reviewed?',
  pinchFallback: 'Secrets setup?',
  L1: [
    'Take a look at what was just built and check whether any API keys, passwords, or credentials are written directly into the code — if so, move them out now and load them from a separate config file instead.',
    'Go through the environment setup for this feature — is there a `.env.example` file that lists every variable the app needs to run? Does the real `.env` file stay out of the repo?',
    'Think about what happens if one of the secrets used by this project gets leaked or needs to be changed — how would you swap it out, and does the current setup make that easy or painful?',
  ],
  L2: [
    'Is there anything in what was just built that has a real password, API key, or token written directly into the code rather than loaded from a config file?',
    'What happens in this feature if a required environment variable isn\'t set — does something break immediately with a clear message, or does it fail in a confusing way later?',
  ],
  L3: [
    'Where are the passwords and API keys for this feature sitting right now — are they safe, or is there something that needs to move?',
  ],
};

const ABSENCE_DATA_VALIDATION_CASUAL: DecisionContent = {
  question:      'Accepting input — data validation in place?',
  pinchFallback: 'Input validation?',
  L1: [
    'Take a look at what was just built and check what happens when someone sends unexpected data — a missing field, the wrong type, or a completely random value. Is the app handling it gracefully or just crashing?',
    'Go through the inputs this feature accepts and think about what you\'re actually checking before using that data — are the required fields being verified, are the types right, and is there a clear error when something is off?',
    'Think about the worst data someone could realistically send to this project — a payload that\'s completely wrong, a value that would confuse the logic, or a field that shouldn\'t be there at all — and confirm the current code handles it.',
  ],
  L2: [
    'Is there anything in what was just built that accepts data from outside and uses it directly without first checking that it\'s in the right shape?',
    'What happens in this feature if a required field is missing from the input — does it fail clearly with a useful message, or does it just break in a confusing way?',
  ],
  L3: [
    'What\'s one input this feature accepts that isn\'t being validated yet?',
  ],
};

const ABSENCE_CI_PIPELINE_CASUAL: DecisionContent = {
  question:      'Moving toward release — CI pipeline configured?',
  pinchFallback: 'CI pipeline?',
  L1: [
    'Take a look at whether this project has something set up to automatically run the tests whenever code is pushed — if not, setting up a simple GitHub Actions workflow now means you catch failures before they reach the main branch.',
    'Go through what a CI run actually does for this feature — when someone pushes code, does it automatically run the tests and stop a bad merge if something fails?',
    'Think about what was just built and whether the CI pipeline is actually checking everything it should — are the tests running, is the build being verified, and is anything important only being checked locally but not automatically?',
  ],
  L2: [
    'Does this project run its tests automatically whenever code is pushed — and does it stop a bad merge if the tests fail?',
    'Is there anything about this feature that gets checked by hand during development but isn\'t running automatically in CI — and should it be?',
  ],
  L3: [
    'What\'s the most important thing the CI pipeline should be catching for this project that it isn\'t catching right now?',
  ],
};

const ABSENCE_RATE_LIMITING_CASUAL: DecisionContent = {
  question:      'API endpoint built — rate limiting designed?',
  pinchFallback: 'Rate limiting?',
  L1: [
    'Take a look at what was just built and think about what happens if someone calls this endpoint way too many times in a short period — is there anything stopping them from doing that, and if not, what would happen to the app?',
    'Think about how this feature handles someone who keeps hammering the API — what does it tell them when they\'ve made too many requests, and does it give them enough info to know when to try again?',
    'Go through the rate limiting design for this project — how many requests does a user or API key get before they\'re throttled, does the limit reset every minute or every hour, and does it work the same way for everyone?',
  ],
  L2: [
    'Is there anything in what was just built that prevents a single user or caller from hitting the endpoint too many times — and if not, is that something that needs to be added?',
    'What does this feature say back to someone who\'s sent too many requests — do they get a useful response that tells them when they can try again?',
  ],
  L3: [
    'What\'s the most realistic way this feature gets overwhelmed by too many requests — and is there anything in place right now to prevent that?',
  ],
};

const ABSENCE_FEATURE_SCOPE_CASUAL: DecisionContent = {
  question:      'Started building — is scope defined?',
  pinchFallback: 'What\'s in scope?',
  L1: [
    'Before going further — write a quick scope statement for this feature: what it does, what it doesn\'t do, and what done looks like. One paragraph is enough. This prevents mid-build scope drift.',
    'Quick scope check: what exactly is this feature supposed to do, and what would confirm it\'s working correctly? Define the boundaries before continuing — it saves rework.',
    'Write a one-sentence definition of done for this feature before the next prompt. What needs to be true for this to be \'finished\' — not perfect, just done?',
  ],
  L2: [
    'What are the 2-3 things this feature must do to be considered complete? List them before continuing.',
    'Scope check: what is this feature doing, and what is it explicitly NOT doing? Quick answer before next step.',
  ],
  L3: [
    'What does \'done\' look like for this feature? One sentence before continuing.',
  ],
};

const ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL: DecisionContent = {
  question:      'Kept building — is the last change verified?',
  pinchFallback: 'Checkpoint.',
  L1: [
    'Quick checkpoint before continuing — does what was last built actually work end to end? Try running it or walk through the main path manually. If it\'s broken, fix it now before the next change makes the bug harder to locate.',
    'Smoke test the last change before adding more: what\'s the simplest way to verify it works right now? Run it or try the main path and report what you get.',
    'Before moving to the next feature — does everything built so far still work? Quick manual check: try the main flow and flag anything that looks off.',
  ],
  L2: [
    'Does the last change work? Run it or try it manually before continuing — one quick verification before the next prompt.',
    'Checkpoint: what\'s the most recent thing that was built, and does it actually work? Verify before adding anything else.',
  ],
  L3: [
    'Does what was last built work? Quick try before the next step.',
  ],
};

const ABSENCE_SPEC_BEFORE_CODE_CASUAL: DecisionContent = {
  question:      'Building this — behaviour defined first?',
  pinchFallback: 'Spec it first.',
  L1: [
    'Before writing more code — write a quick behaviour spec: what inputs does this take, what should it do, and what output or side effect should it produce? One paragraph is enough. Spec before code avoids building the wrong thing.',
    'Define the expected behaviour before implementing: given X (the context), when Y (the trigger), then Z (the outcome). Even one sentence of Given/When/Then saves more time than it takes to write.',
    'Quick spec before continuing: what is this code supposed to DO? Not how — what. Describe the behaviour in plain terms, then implement against that description.',
  ],
  L2: [
    'What should this do? Describe the expected behaviour in one or two sentences before writing the implementation.',
    'Spec this out before coding it: what\'s the input, what happens, what\'s the expected output? Quick answer first.',
  ],
  L3: [
    'What is this supposed to do? One sentence spec before the next prompt.',
  ],
};

// ── Phase 5 D1 — incremental_build (CASUAL + FORMAL registers) ────────────────

const ABSENCE_INCREMENTAL_BUILD_CASUAL: DecisionContent = {
  question:      'Building incrementally — verifying between steps?',
  pinchFallback: 'Verify between steps.',
  L1: [
    'Between each change — stop and verify what was just built actually works before adding the next layer. Debugging compound changes is harder than debugging one change at a time.',
    'Before moving to the next part of the implementation — try what was just built. If it\'s broken, fix it now. Layering changes on top of a broken base will cost more time than the verification takes.',
    'What\'s the last thing that was built, and has it been verified as working? If not, verify before adding more. Incremental verification is faster than debugging a pile of changes at once.',
  ],
  L2: [
    'Has what was just built been tested before continuing? Quick verification now is faster than debugging later.',
    'Is each piece being verified as done before the next is added, or are multiple changes being stacked before any are checked?',
  ],
  L3: [
    'Is what was last built working and verified before adding the next change?',
  ],
};

const ABSENCE_INCREMENTAL_BUILD: DecisionContent = {
  question:      'Incremental build — is each step verified before the next?',
  pinchFallback: 'Verify before proceeding.',
  L1: [
    'Review the build cadence: is each incremental change being verified before the next is added? Compounding unverified changes increases debugging complexity — verify at each increment.',
    'Audit the current state: what was the last change made, and has it been confirmed working? If not, verify before continuing — a clean failing test is faster to diagnose than multiple layered failures.',
    'Check whether the implementation is proceeding incrementally with verification gates, or whether multiple changes are being stacked without intermediate confirmation. The latter increases rework risk significantly.',
  ],
  L2: [
    'Is each increment being verified before the next change is added? Identify the last unverified change and confirm it before proceeding.',
    'What is the current state of the build? Which pieces have been verified as working and which have not?',
  ],
  L3: [
    'Has the most recent change been verified as working before the next one is introduced?',
  ],
};

// ── Phase 5 D4-D6 — cool_geek signals (CASUAL register) ──────────────────────

const ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL: DecisionContent = {
  question:      'Adding more — is the previous feature actually done?',
  pinchFallback: 'Finish before starting next.',
  L1: [
    'Checkpoint: what\'s the state of the last feature started? Is it done and tested end-to-end? Scrum\'s Definition of Done exists because partially-done features compound — starting new ones before previous ones meet DoD means carrying technical debt through every subsequent sprint.',
    'Before adding the next thing — is the previous feature fully working end-to-end? Not \'mostly done\', not \'works here\', but actually complete and tested? Unfinished features accumulate and come back as bugs and edge cases.',
    'How complete is the most recently started feature? Rate it honestly: \'done and tested\', \'works but untested\', \'partially built\'. Starting the next feature before the previous one meets DoD is the classic unfinished-work accumulation pattern.',
  ],
  L2: [
    'Is the previous feature done and tested? That\'s the bar — fully built, verified end-to-end. Start the next only after meeting it.',
    'What\'s the completion state of the last feature? Only move to the next after the previous is actually done.',
  ],
  L3: [
    'Is the last feature actually done and tested before starting the next?',
  ],
};

const ABSENCE_FINISHING_LINE_AWARENESS_CASUAL: DecisionContent = {
  question:      'Multiple things in progress — how many are complete?',
  pinchFallback: 'Finish one before starting next.',
  L1: [
    'Count check: how many features are currently in-progress vs. complete end-to-end? A partially-done feature delivers zero user value. Three features 40% each is worse than one feature 100% — the user can use one, and none of three.',
    'In iterative delivery, value is delivered by reaching shippable state, not by making progress. How many features started this session have reached shippable state? Pick the one closest to completion — finish that before starting another.',
    'Before starting something new — pick the feature closest to completion and push it to done. Lean delivery: finish items, don\'t accumulate WIP. What\'s the one thing to finish right now?',
  ],
  L2: [
    'How many things are in-progress? Complete the one closest to done before starting anything new.',
    'What would it take to bring the most-started feature to shippable state? Do that before adding more.',
  ],
  L3: [
    'Which feature is closest to done? Finish that one before starting the next.',
  ],
};

const ABSENCE_POLISH_VS_FUNCTION_CASUAL: DecisionContent = {
  question:      'Working on the look — does the core work end-to-end?',
  pinchFallback: 'Function before polish.',
  L1: [
    'Lean MVP principle: polish comes after function. Before spending more prompts on UI improvements — does the core functionality work end-to-end? \'MVP UI should be clean and usable, not museum-quality.\' Fix the working before fixing the looking.',
    'Does the core user flow work without errors from start to finish? If not, visual polish is blocked by a non-working core. Function first: build the thing that works, then make it look good.',
    'UI polish on a non-functional core creates maintenance debt — you\'ll redo the style when the function changes. Core functionality working end-to-end is the prerequisite for polish. Is it?',
  ],
  L2: [
    'Does the core work end-to-end before going further with styling? Function first — polish after it works.',
    'Is the working flow solid end-to-end? Lean MVP says polish after function. What\'s left to make the core work?',
  ],
  L3: [
    'Get the core working end-to-end before focusing on how it looks.',
  ],
};

const ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL: DecisionContent = {
  question:      'Adding features — is each one actually MVP scope?',
  pinchFallback: 'MVP discipline check.',
  L1: [
    'Eric Ries MVP heuristic: start with what you believe is needed, then eliminate half the features, then eliminate half again. Each addition should answer: does this test the core hypothesis? Is it the minimum needed to get real user feedback? If neither — it\'s gold-plating an unvalidated MVP.',
    'MVP scope discipline: for each new feature, ask — is this the minimum needed to test the core assumption, or is it a nice-to-have that could wait until after first validation? \'Lean startup MVP requires strict discipline, focusing on the minimum feature set to test a specific assumption.\'',
    'Before adding this — what specific hypothesis does it help validate? Features without a hypothesis-connection aren\'t MVP scope. List what\'s left to build and categorize: core hypothesis vs. nice-to-have.',
  ],
  L2: [
    'Is this feature minimum-viable — needed to test the core hypothesis — or is it gold-plating? Scope check before building.',
    'What hypothesis does this feature validate? If it doesn\'t test the core assumption, it\'s post-MVP scope.',
  ],
  L3: [
    'Is this feature MVP scope? Does it test the core hypothesis or is it a nice-to-have?',
  ],
};

const ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL: DecisionContent = {
  question:      'New idea — defined what it does before building?',
  pinchFallback: 'Spec the idea first.',
  L1: [
    'Spec-driven development principle: a feature idea is not a spec. Before building — write a one-paragraph description: what does this feature do? What does it NOT do? How does it fit into what already exists? The spec becomes the source of truth; code is its expression.',
    'Jumping from idea to code skips the bridge. Quick spec for this idea: (1) what does it do — one sentence, (2) what are its boundaries — what it explicitly does not do, (3) how does it fit into the existing product — integration points. Five minutes of spec saves hours of rework.',
    'An idea in your head is not a spec. A spec is a structured description of what the feature does and doesn\'t do, written before implementation. Write it, then build against it — this is the difference between directed building and creative wandering.',
  ],
  L2: [
    'Spec this idea before building it: what does it do, what are its boundaries, and how does it fit into what already exists? One paragraph is enough.',
    'Before implementing — write what it does and what it doesn\'t do. The spec is the source of truth; implementation is the verification.',
  ],
  L3: [
    'Define what this idea does and doesn\'t do before writing any code for it.',
  ],
};

const ABSENCE_DEMO_VS_PRODUCT_CASUAL: DecisionContent = {
  question:      'Is this demo quality or production quality — explicit distinction?',
  pinchFallback: 'Demo vs. production: name which.',
  L1: [
    'Production readiness check: what quality standard applies to what\'s being built? Demo code and production code have different requirements. If this is a demo — mark it explicitly: hardcoded data, no edge cases, visual-only. If it\'s the actual product — it needs real data connected, error states handled, and edge cases working.',
    'The difference between demo and production: demo looks right; production works right under real conditions. Treating prototype code as production without explicit upgrade creates technical debt that compounds with every sprint. \'Low quality code contains 15x more defects and takes 124% longer to resolve.\' — name which standard applies right now.',
    'Categorize explicitly what\'s being built: prototype (exploratory, disposable, no production quality required) or production (real data, real errors, edge cases, maintainable). If prototype — name it and plan the production upgrade path. If production — apply production standards now.',
  ],
  L2: [
    'Is this demo-quality or production-quality? Name it explicitly. If demo — what\'s the plan to make it production-ready? If production — is it handling real data and real error states?',
    'Demo code isn\'t wrong — treating it as production code is. What quality standard applies to what\'s being built right now?',
  ],
  L3: [
    'Is this demo or production quality? Name which, explicitly.',
  ],
};

const ABSENCE_USER_JOURNEY_CHECK_CASUAL: DecisionContent = {
  question:      'Feature being built — is the full user journey mapped?',
  pinchFallback: 'Map the user journey first.',
  L1: [
    'Jeff Patton User Story Mapping: once a basic happy path is in place, consider edge cases, alternatives, and exceptions. Before building more — answer: (1) what does the user see the first time they encounter this feature? (2) what happens when there\'s no data — the empty state? (3) what happens when something goes wrong — the error state? Each is a must-handle state.',
    'Happy-path-only features feel complete in development but break user trust in production. \'Edge cases often reveal how thoughtful a product really is.\' Before marking this feature done — map the non-happy paths: empty state, error state, first-use experience. These are the normal user experience for many users.',
    'User journey check — beyond the happy path, which of these states has been handled? (1) Empty state — no data yet. (2) Error state — something fails. (3) First-time experience — user sees this for the first time. (4) Edge case — unexpected input. Story mapping says: reveal the states the system must handle gracefully.',
  ],
  L2: [
    'Has the full user journey been mapped? Beyond the happy path — what happens in the empty state, error state, and first-use experience?',
    'The feature may work for you — does it work for users in non-ideal conditions? Empty state, error state, first-time experience — name each.',
  ],
  L3: [
    'What\'s the empty state? The error state? The first-use experience? Name all three.',
  ],
};

const ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL: DecisionContent = {
  question:      'Exploring / experimenting — spike or production code?',
  pinchFallback: 'Spike or production: name which.',
  L1: [
    'XP spike solution principle (Kent Beck / James Shore): \'Never copy spike code into production code. Even if it is exactly what you need, rewrite it using TDD so that it meets production standards.\' The purpose of exploratory code is knowledge, not shipping. Name what\'s being done: spike (to learn) or production (to ship)?',
    'The output of a spike is not production code — it\'s knowledge. Time-box the exploration, answer the question it was meant to answer, then decide: throw the spike away and rewrite properly, or extract the validated pattern into clean production code. Right now — is this spike or production?',
    'Exploratory code and production code have different standards by definition. Some practitioners keep a dedicated spikes/ directory to enforce this separation. Before committing what\'s been written — spike (throwaway, learning-focused) or production (clean, tested, maintainable)? Name which.',
  ],
  L2: [
    'Is what\'s being written spike code (exploratory, throwaway, to learn) or production code (tested, maintainable, to ship)? Name which before committing.',
    'The XP rule: never commit spike code directly as production. If this was a spike — extract the useful pattern and rewrite it cleanly before it enters the codebase.',
  ],
  L3: [
    'Spike code or production code? Name which before committing.',
  ],
};

const ABSENCE_DEPENDENCY_ADVENTURE_CASUAL: DecisionContent = {
  question:      'Adding a dependency — evaluated the need and maintenance cost?',
  pinchFallback: 'Evaluate before adding.',
  L1: [
    'Dependency management principle: \'Dependencies are not free and extract an ongoing maintenance cost.\' Every library added for interest rather than specific need becomes code you did not write but have localized responsibility for. Before adding this — what specific problem does it solve that you can\'t solve without it?',
    '\'Dependency hell\' occurs when two libraries demand incompatible versions of the same dependency — resolving this can derail development schedules. Maintenance consumes 70-90% of total project costs. Before installing this package — have alternatives been evaluated? What specific problem does it solve?',
    'Three questions before adding any dependency: (1) what specific problem does it solve? (2) have existing tools or a small custom solution been considered? (3) what is the ongoing maintenance cost — updates, security patches, version conflicts? Explore-first library additions become unmaintained technical debt.',
  ],
  L2: [
    'What specific problem does this dependency solve? Have alternatives been evaluated? What\'s the maintenance cost? Answer all three before installing.',
    'Dependencies are not free — they extract ongoing maintenance. What need does this library solve that justifies its long-term cost?',
  ],
  L3: [
    'What specific problem does this library solve that justifies adding it as a permanent dependency?',
  ],
};

const ABSENCE_RESTART_IMPULSE_CHECK_CASUAL: DecisionContent = {
  question:      'Hitting friction — debugged before considering a restart?',
  pinchFallback: 'Debug before restarting.',
  L1: [
    'Joel Spolsky: \'When you start from scratch there is absolutely no reason to believe that you are going to do a better job than you did the first time. Each fixed bug took weeks or years of real-world usage to be discovered — when you throw away code, all the knowledge that went into it is lost.\' Before restarting: what specifically went wrong and why?',
    'Root cause analysis principle: every restart impulse is a debugging failure. \'RCA explains why the system became vulnerable to the fault, how the fault was triggered, and what durable changes will reduce the probability of it happening again.\' Rewriting skips all three steps. Debug first — identify the root cause before deciding whether restart is warranted.',
    'The restart impulse is almost always wrong. Problems in the current code are known. Problems in the rewrite are unknown — and most of the same issues will be reproduced without the bug knowledge that accumulated in the current version. What specifically is broken? Fix that.',
  ],
  L2: [
    'Before rewriting — what specifically went wrong? Name the root cause. Debug first, then decide whether restart is actually warranted.',
    'The current code has accumulated knowledge from real use. Rewriting discards that. What\'s the specific problem? Fix it.',
  ],
  L3: [
    'What specifically is broken? Debug it before deciding to restart.',
  ],
};

const ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL: DecisionContent = {
  question:      'Session balance — how much went to core vs. creative features?',
  pinchFallback: 'Core value first.',
  L1: [
    'Value-driven development: \'features that generate the maximum value for the users without creating the maximum cost.\' Before the next creative or aesthetic feature — look at this session: what proportion of prompts went to core product functionality vs. creative/extra features? If more than 30-40% is creative, the core is under-served.',
    'Value vs. effort check: creative features have effort cost but often low core-product value. \'Value-driven development prevents feature bloat — adding features that don\'t provide value.\' For each creative feature added this session — what core user need does it serve? If it doesn\'t serve a core need, it\'s future technical debt.',
    'Session ratio check: count prompts on core features (things users actually need) vs. creative/extra features (things that are interesting to build). If creative is outweighing core — core first. Creative features compound maintenance cost without proportional user value.',
  ],
  L2: [
    'What\'s the ratio of core product prompts to creative/extra feature prompts this session? If creative is outweighing core — prioritize core functionality first.',
    'Every creative feature has a maintenance cost. Does this one serve a core user need, or is it a fun-to-build extra? Core first.',
  ],
  L3: [
    'Has core product gotten more attention than creative extras this session? Check the ratio.',
  ],
};

// ── Phase 5 D7 — pro_geek_soul cluster 1 (CASUAL register) ───────────────────

const ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL: DecisionContent = {
  question:      'Complex logic added — documented the why?',
  pinchFallback: 'Add the why comment.',
  L1: [
    'Clean Code principle: \'Don\'t use comments to explain WHAT the code is doing — use them to explain WHY you did it.\' For the non-obvious logic just added — add a comment explaining the reasoning, constraint, or edge case it handles. Future maintainers (including you) will need this context.',
    'Two things to add for complex code: (1) an inline comment explaining WHY this approach was chosen — what constraint, edge case, or tradeoff it addresses; (2) a docstring for any public function that explains parameters, return value, and edge behavior. Complex code without this context becomes invisible debt.',
    'The WHY behind non-obvious code is not preserved in the implementation — only a comment captures it. What\'s the reasoning behind what was just written? The algorithm choice, the edge case it handles, the tradeoff it makes — add that as an inline comment now before the context is gone.',
  ],
  L2: [
    'For the complex logic just added — add an inline comment explaining WHY this approach was chosen. What constraint or edge case does it address?',
    'Docstrings for public interfaces, inline comments for non-obvious logic. Add the \'why\' before moving on — it becomes invisible after the context is gone.',
  ],
  L3: [
    'Add an inline comment explaining why this logic works the way it does before continuing.',
  ],
};

const ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL: DecisionContent = {
  question:      'Shortcut taken — tagged it as debt?',
  pinchFallback: 'Tag the shortcut.',
  L1: [
    'Martin Fowler\'s Technical Debt Quadrant: \'Prudent Deliberate\' debt — acknowledged and added to the backlog — is acceptable. \'Reckless Deliberate\' — shortcuts taken without acknowledgment — compounds invisibly. Tag any shortcut with a TODO or FIXME comment before moving on.',
    'Ward Cunningham\'s debt metaphor: taking a shortcut is a legitimate decision — not tagging it is the anti-pattern. Minimum: // TODO: [what needs fixing] — [why it was deferred]. Takes 10 seconds, prevents invisible accumulation across every subsequent sprint.',
    'Shortcut taken without a debt tag means it\'s invisible — no backlog item, no reminder, no context for the next person who reads it. Add a // TODO: or // FIXME: with what needs to be fixed and why it was deferred. Then it\'s Prudent Deliberate debt, not Reckless.',
  ],
  L2: [
    'Is the shortcut tagged with a TODO/FIXME? That\'s the minimum for Prudent Deliberate debt — acknowledge it so it\'s not forgotten.',
    'Untagged shortcuts are invisible debt. Add // TODO: [what to fix] before continuing.',
  ],
  L3: [
    'Tag any shortcut with TODO/FIXME before moving on — untagged debt accumulates invisibly.',
  ],
};

const ABSENCE_TEST_DEPTH_CHECK_CASUAL: DecisionContent = {
  question:      'Tests written — covering beyond the happy path?',
  pinchFallback: 'Add edge and error path tests.',
  L1: [
    'Testing pyramid (Mike Cohn, 2009): tests must cover happy paths, edge cases, and negative scenarios. \'Start with happy path tests, then add error cases that verify graceful failure handling.\' Happy-path-only tests provide false confidence — everything looks green but real-world conditions break the code.',
    'Branch coverage over line coverage: every decision path needs a test. For what was just written — what are the edge cases? (empty input, null, boundary values). What are the error paths? (what happens when this fails). Add at least one test for each non-happy-path scenario.',
    'Three test categories beyond the happy path: (1) boundary value tests — empty, null, max, min; (2) error path tests — what happens when the operation fails; (3) negative tests — invalid input, unexpected state. Without these, test coverage is misleadingly high.',
  ],
  L2: [
    'Do the tests cover edge cases (empty, null, boundary values) and error paths (what happens when this fails)? Happy path only is false confidence.',
    'Add at least one edge case test and one error path test for what was just implemented before the tests are considered adequate.',
  ],
  L3: [
    'Add edge case and error path tests — happy path only is incomplete coverage.',
  ],
};

const ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL: DecisionContent = {
  question:      'Architecture decision made — noted the rationale?',
  pinchFallback: 'Add an architecture note.',
  L1: [
    'Architecture Decision Records (Michael Nygard, 2011): \'An ADR captures a single architectural decision and its rationale. People months or years later need to understand why the system is constructed the way that it is.\' For the structural decision just made — add a short note: context, decision, consequences. A code comment block or doc entry works.',
    'The question future maintainers will ask: \'why was it built this way?\' Without a note, that question has no answer. Minimum viable ADR: what was decided, why, and what the tradeoffs are. Keep doc/adr/ in the repo for significant decisions.',
    'Pattern choice, new abstraction layer, architectural tradeoff — these deserve a note. The code shows WHAT was done; only documentation shows WHY. Add a short rationale note before continuing — context disappears from memory faster than the code does.',
  ],
  L2: [
    'What was the rationale for the architectural decision just made? Add a short note — context, decision, and consequences. Even one paragraph captures what\'s needed.',
    'Code shows what; only documentation shows why. Add an architecture note before the context is gone.',
  ],
  L3: [
    'Add a brief rationale note for the architectural decision — why this approach was chosen.',
  ],
};

// ── Phase 5 D8 — pro_geek_soul cluster 2 (CASUAL register) ───────────────────

const ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL: DecisionContent = {
  question:      'New dependency added — evaluated it before adopting?',
  pinchFallback: 'Check the dependency before adding.',
  L1: [
    'NIST SSDF requires evaluating third-party components for maintenance status, license compatibility, and security properties before integration. For the dependency just added: Is it actively maintained (last release date, open issues trend)? Is the license compatible? Are there lighter-weight alternatives? A few minutes of evaluation now prevents being stuck with an abandoned or license-incompatible package later.',
    'Three things to check before committing to a new dependency: (1) maintenance status — last release date, whether the repo is active; (2) license compatibility — MIT/Apache are generally safe, GPL has restrictions; (3) bundle size impact — what does this add to the build? The smaller the scope of what\'s needed, the more alternatives to compare. Evaluate first, install after.',
    'Dependencies aren\'t free — they\'re ongoing maintenance commitments. Before adopting: check when it was last released, check whether there are lighter-weight alternatives that cover the needed scope, and confirm the license is compatible with the project. A package left unevaluated is a silent risk every time a security advisory hits.',
  ],
  L2: [
    'Before committing to this dependency: check maintenance status (last release date, open issues), license compatibility, and whether alternatives exist.',
    'Dependencies are ongoing maintenance commitments. Evaluate maintenance status, license, and alternatives before adopting.',
  ],
  L3: [
    'Check maintenance status, license compatibility, and alternatives before adding this dependency.',
  ],
};

const ABSENCE_SECURITY_REVIEW_GAP_CASUAL: DecisionContent = {
  question:      'Security surface touched — applied security checks?',
  pinchFallback: 'Apply security checks now.',
  L1: [
    'OWASP Secure by Design: security must be designed in, not bolted on. For what was just implemented — what security surfaces were introduced? Input validation (are all inputs sanitized?), authorization (is access properly gated?), injection prevention (SQL, command, path traversal). These checks belong during implementation, not as a post-implementation audit. Shift-left: add the check when the surface is created.',
    'Three security checks for implementation work: (1) input validation — all user-supplied values must be validated/sanitized before use; (2) authorization — is the action properly gated to the user who should be able to perform it; (3) injection prevention — SQL queries parameterized, shell commands avoided, file paths validated. Add these now while the code is in context, not after the feature is shipped.',
    'Security surfaces introduced during implementation: auth endpoints, data storage, user input, file handling. For each: is input validated? Is access gated? Is there injection risk? OWASP Top 10 covers the categories — what was just built touches which of these? Add the check as part of completing the feature, not as a separate hardening pass.',
  ],
  L2: [
    'For what was just implemented: is input validated, is access properly authorized, and is there injection risk? These are implementation-phase checks, not post-ship.',
    'Security checks (input validation, authorization, injection) belong during implementation — add them now before moving on.',
  ],
  L3: [
    'Apply input validation, authorization checks, and injection prevention for what was just built.',
  ],
};

const ABSENCE_API_CONTRACT_DEFINITION_CASUAL: DecisionContent = {
  question:      'API being built — defined the contract first?',
  pinchFallback: 'Define the interface before implementing.',
  L1: [
    'OpenAPI contract-first principle: define the API interface before writing the handler. For the endpoint being built — what does it accept (request schema: required fields, types, validation rules)? What does it return (response schema: success shape, error shape, status codes)? What is the error response format? Defining this first prevents implicit contracts that drift between callers and implementors — and makes mock servers and tests possible before the backend exists.',
    'Contract-first API development: the request schema, response schema, and error response format must be defined before implementation. Three things to specify: (1) what the request body/params accept; (2) what a successful response returns; (3) what error responses look like and under what conditions. Write these as a schema or doc comment before writing the handler logic.',
    'Building a route without a defined interface creates an implicit contract — the caller infers what to send and what to expect from the implementation, and both sides drift independently. Define the interface first: request shape, response shape, error cases. Minimum viable contract: a comment block with the schema above the handler.',
  ],
  L2: [
    'Before implementing the endpoint: define the request schema, response schema, and error response format. Interface-first prevents implicit contracts.',
    'What does this API accept and return? Define the contract before writing the handler logic — implicit contracts drift between callers and implementors.',
  ],
  L3: [
    'Define the request schema, response schema, and error response format before writing the handler.',
  ],
};

const ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL: DecisionContent = {
  question:      'Implementation done — covered the error paths?',
  pinchFallback: 'Add error handling for failure cases.',
  L1: [
    'McConnell\'s defensive programming (Code Complete): \'Defensive programming mandates covering all failure paths, not just happy paths.\' For what was just implemented — what are the error states? What happens when an external call fails? What happens when input is malformed? What happens when a database write fails? Each needs explicit handling: error state, fallback behavior, user-facing message. Code that only works on the happy path is incomplete by construction standards.',
    'Three error-path categories for every implementation: (1) external service failures — what if the API call, database query, or file operation fails; (2) input validation failures — malformed data, missing required fields, out-of-range values; (3) edge state failures — empty result sets, concurrent writes, unexpected null. Add explicit handling for each category before the feature is considered done.',
    'The happy path is the easy path — every real-world user hits an error case eventually. For what was just built: what error states exist? Is there an error boundary? Is there a fallback? Does the error surface as a useful message or as a silent failure? Add error handling now while the implementation is in context, not during the first production incident.',
  ],
  L2: [
    'Does the implementation cover error paths — external failures, malformed input, and edge states? Happy path only is incomplete by construction standards.',
    'Add explicit error handling for failure cases before moving on — what happens when this breaks in production?',
  ],
  L3: [
    'Add error handling for failure paths — external failures, malformed input, and edge states.',
  ],
};

// ── Phase 5 D9 — pro_geek_soul cluster 3 (CASUAL register) ───────────────────

const ABSENCE_REFACTORING_CHECKPOINT_CASUAL: DecisionContent = {
  question:      'Adding to messy code — refactored first?',
  pinchFallback: 'Do a cleanup pass before extending.',
  L1: [
    'Boy Scout Rule (Clean Code): \'Leave the code cleaner than you found it.\' Before adding a feature to code that was already acknowledged as messy or complex — do a refactoring pass first. The alternative is adding features on top of complexity, which makes the next change harder, not the same difficulty. The refactoring pass before extending is the investment that prevents compound complexity debt.',
    'Adding to messy code without cleaning it first means the next developer (including future you) inherits the original mess plus the new feature built on top of it. Before extending: extract repeated logic into helpers, simplify conditionals, rename confusing variables. The feature addition is then built on clean ground, not on accumulated complexity.',
    'Three things to do before extending complex code: (1) extract any repeated logic into well-named helpers; (2) simplify long conditionals or deeply nested blocks; (3) rename anything that required a comment to explain. Then add the feature. The Boy Scout Rule applies here: leave the code cleaner than you found it, not messier than you found it.',
  ],
  L2: [
    'Before adding to the existing messy or complex code: do a refactoring pass first. Extract, simplify, rename — then extend. Building on top of complexity doubles it.',
    'The cleanup pass before the feature is the investment that prevents compound debt. What can be extracted, simplified, or renamed before adding to this?',
  ],
  L3: [
    'Do a refactoring pass on the existing code before extending — leave it cleaner than you found it.',
  ],
};

const ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL: DecisionContent = {
  question:      'Interface changed — checked existing consumers?',
  pinchFallback: 'Check what calls this before changing.',
  L1: [
    'Semantic Versioning (semver.org): MAJOR version = backwards-incompatible change. The formal rule: any change to an interface used by existing callers must enumerate those callers and assess the impact before implementation. For the function signature, API contract, or interface just changed — what calls it? What are the downstream effects? Have those callers been updated or is the change backwards-compatible?',
    'Hyrum\'s Law: \'With a sufficient number of users of an API, it does not matter what you promise in the contract — all observable behaviors will be depended on by somebody.\' The practical implication: before changing any interface, find all callers (grep the codebase), assess what each expects, and either maintain compatibility or update each caller explicitly. Silent interface breaks cause runtime errors that show up later, not at the point of change.',
    'Three steps before changing a function signature or API contract: (1) grep for all callers; (2) check whether the change is backwards-compatible or breaking; (3) if breaking — update all callers, or version the interface. A change made without step 1 is a change made blind. The downstream breakage shows up at runtime, not at compile.',
  ],
  L2: [
    'Before the interface change: enumerate all callers, assess whether the change is backwards-compatible, and update any affected consumers. Changes made blind cause silent runtime breaks.',
    'What calls this? Grep for it before changing — then decide whether to maintain compatibility or update all callers explicitly.',
  ],
  L3: [
    'Check all callers of this interface before changing it — update or version any that are affected.',
  ],
};

const ABSENCE_SELF_REVIEW_HABIT_CASUAL: DecisionContent = {
  question:      'Long implementation run — done a review pass?',
  pinchFallback: 'Read back through what was built.',
  L1: [
    'Google Engineering Practices: \'The author is the first reviewer.\' Before submitting or continuing, read back through the diff: does the code do what was intended? Are there naming inconsistencies? Is anything more complex than it needs to be? Are tests missing? The self-review pass catches what was obvious in the context of writing but invisible in isolation — logic errors, naming drift, gaps in coverage.',
    'A 15-prompt implementation run without a review pass is a run where each decision was made in context but never assessed as a whole. Read back through what was built: does the overall structure make sense? Are there inconsistencies between early and late decisions? Did anything get added that\'s redundant or conflicts with earlier code? The review pass is the quality gate that catches accumulated drift.',
    'Three things to check in a self-review pass: (1) does the implementation match the original intent — were any assumptions made that drifted from the goal; (2) naming and structure coherence — do variable and function names still make sense given the full implementation; (3) coverage gaps — are there paths or states that were implemented but not tested. Read the diff before moving on.',
  ],
  L2: [
    'Read back through the implementation before continuing: does it make sense as a whole? Check for naming drift, structural inconsistencies, and coverage gaps.',
    'The self-review pass catches what was invisible in the context of writing. Read the diff — does this all hang together?',
  ],
  L3: [
    'Do a review pass on what was built — read the diff and check for drift, gaps, and inconsistencies.',
  ],
};

const ABSENCE_PERFORMANCE_AWARENESS_CASUAL: DecisionContent = {
  question:      'Data-heavy operation — considered performance?',
  pinchFallback: 'Check for performance implications.',
  L1: [
    'Knuth (1974): \'We should not pass up our opportunities in that critical 3%.\' The full quote is not an excuse to avoid performance — it\'s a prioritization rule: ignore the 97% of noncritical paths, but act on the critical 3%. For what was just built — is this in the critical 3%? A full-table fetch, N+1 in a loop, or unthrottled list render qualifies. The check here is awareness, not micro-optimization: is there an obvious performance problem worth addressing before it ships?',
    'Three data-heavy patterns that require a performance check before shipping: (1) N+1 queries — does this loop trigger a database call per iteration; (2) full-table fetches — is the query unbounded and potentially returning thousands of records; (3) expensive renders — is a large list rendering without virtualization, memoization, or lazy loading. These are not premature optimization targets — they\'re known problem patterns with well-understood solutions.',
    'Performance awareness for this operation: what is the data volume? What happens at 10x, 100x the expected load? Is there an N+1 pattern? Is there pagination? Is there a memo or cache in front of an expensive computation? The question is not \'is this perfectly optimized?\' — it is \'is there an obvious performance problem that will hit in production that could be caught now?\'',
  ],
  L2: [
    'For the data-heavy operation just built: check for N+1 queries, unbounded fetches, and expensive unthrottled renders before this ships.',
    'Performance awareness at the right time — not micro-optimization, just checking: is there an obvious performance problem in what was just built?',
  ],
  L3: [
    'Check for N+1 queries, unbounded fetches, or expensive renders before this feature ships.',
  ],
};

// ── Phase 5 D10 — hardcore_pro cluster 1 (FORMAL register) ───────────────────

const ABSENCE_DECISION_RECORD_ABSENCE_FORMAL: DecisionContent = {
  question:      'Architectural decision made — ADR recorded?',
  pinchFallback: 'Record the decision with context and consequences.',
  L1: [
    'Architecture Decision Records (Nygard, 2011): capture context, decision, and consequences for every significant architectural choice. The ADR format answers: What context makes this decision necessary? What was decided? What are the consequences and trade-offs accepted? Without a record, the rationale becomes invisible to future maintainers and cannot be revisited when requirements change. Write the ADR while the context is still loaded.',
    'The value of an ADR is the rationale, not the decision. Document: (1) what alternatives were considered; (2) why this option was selected over them; (3) what constraints or forces drove the choice; (4) what the known consequences are. Future engineers need to determine whether the context that forced this decision has changed — without a record, that assessment is impossible.',
    'Minimum viable ADR: a short doc or comment block — title, status, context, decision, consequences. ADRs do not need to be long; Nygard\'s originals are 1–2 pages. Keep them in doc/adr/ in the repository. A decision without a record is a decision that will be questioned repeatedly without ever being resolved, by everyone who inherits the codebase.',
  ],
  L2: [
    'For the architectural decision just made: record context, decision, and consequences in an ADR. Without a record, the rationale is invisible to every future maintainer — including the author six months from now.',
    'What alternatives were considered, and why was this option chosen over them? Document the reasoning — it disappears from memory faster than the code does.',
  ],
  L3: [
    'Write an ADR for this decision: context, decision, consequences, and alternatives considered.',
  ],
};

const ABSENCE_OVER_ENGINEERING_CHECK_FORMAL: DecisionContent = {
  question:      'Is this abstraction required by current requirements?',
  pinchFallback: 'Apply YAGNI — build only what current requirements require.',
  L1: [
    'YAGNI (You Aren\'t Gonna Need It — Kent Beck, XP 1999): implement things only when you actually need them, never when you foresee you might. Martin Fowler (2015): \'The cost of YAGNI is that you may need to refactor later, but that is usually less expensive than the cost of carrying unneeded complexity.\' YAGNI test: does a current user story, ticket, or requirement map to this abstraction? If not, remove it and implement the minimal solution. Refactor to the abstraction when the second use case arrives.',
    'Over-engineering is a senior engineer trap: the abstractions appear reasonable because they are technically correct — \'we will need this extensibility eventually.\' Empirical counter: Kohavi et al. (Microsoft Research) found only 1/3 of shipped features improved intended metrics. Speculative development compounds carrying cost at the same rate as rushed development compounds defect cost. The YAGNI discipline: no current requirement, no implementation.',
    'Three YAGNI violation indicators: (1) the phrase \'in case we need\' was used to justify the abstraction; (2) no current requirement maps to the extensibility being built; (3) the implementation would be simpler and still complete current requirements without the abstraction. If any apply — revert to the minimal implementation. The refactoring to the abstraction when the second use case arrives costs less than carrying unneeded complexity through every sprint until then.',
  ],
  L2: [
    'Does a current requirement necessitate this abstraction? If not, apply YAGNI: implement the minimal solution that satisfies today\'s requirements. Refactor to the abstraction when the second concrete use case arrives.',
    'YAGNI check: is there a ticket, story, or current requirement that requires this extensibility? \'We will need it eventually\' is the over-engineering justification — defer until needed.',
  ],
  L3: [
    'Apply YAGNI — remove speculative abstraction and implement only what current requirements require.',
  ],
};

const ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL: DecisionContent = {
  question:      'Critical implementation complete — review plan established?',
  pinchFallback: 'Establish a review plan before merging.',
  L1: [
    'Code review effectiveness (Fagan Inspection; McConnell, Code Complete 2004): peer review catches 60–90% of defects vs. 25–45% for testing alone — the highest-ROI quality control mechanism in software engineering. For critical or complex features, a review plan is not optional. Establish: who reviews this, what the review checklist covers (design correctness, error handling completeness, security surface, test coverage), and what the merge gate is.',
    'Google Engineering Practices: \'The author is the first reviewer, but not the only one.\' For critical paths — new service boundaries, auth flows, data model changes, infrastructure code — peer review before merge is mandatory. If no peer is available: a structured self-review covering design correctness, error handling completeness, and security surface is the minimum acceptable review artifact before merge.',
    'Three review artifacts for critical implementations: (1) diff review for design correctness — does the implementation match the intended architecture and are there unintended side effects; (2) error handling completeness — are all documented failure modes handled; (3) security surface review — were attack surfaces introduced that require threat modeling. Establish which of these will be covered and by whom. Merging a critical implementation without a review plan is an SRE anti-pattern.',
  ],
  L2: [
    'Establish a review plan before merging: who reviews it, what the checklist covers (design correctness, error handling, security surface), and what the merge gate is.',
    'Peer review catches 60–90% of defects testing misses. Critical paths require a review plan — peer, pair, or structured self-review — before merge.',
  ],
  L3: [
    'Establish and complete a review plan before merging — design correctness, error handling, security surface.',
  ],
};

// ── Phase 5 D11 — hardcore_pro cluster 2 (FORMAL register) ───────────────────

const ABSENCE_OBSERVABILITY_FIRST_FORMAL: DecisionContent = {
  question:      'Feature shipping — observability instrumented?',
  pinchFallback: 'Add logging, metrics, and tracing before shipping.',
  L1: [
    'Google SRE Book (Beyer et al., 2016): monitoring is non-negotiable infrastructure for production systems. Three pillars of observability: (1) logs — structured event records of what happened; (2) metrics — counters and gauges measuring how much and how fast; (3) traces — distributed spans showing where time was spent. A feature without all three is partially blind in production. Add instrumentation alongside the feature, not after the first incident.',
    'Observability-first principle: you cannot manage what you cannot measure. For the feature just built — what are the key success metrics? (request count, error rate, latency p99) What are the logged events? (entry, exit, error cases) Is there a distributed trace covering the full request path? Define and instrument these before shipping. The cost of adding observability post-incident is an unknown production state plus a time-pressured instrumentation sprint.',
    'Minimum viable observability for a production feature: (1) a structured log entry for every significant operation — success and failure paths; (2) a counter or histogram for the primary operation rate and error rate; (3) a trace span covering the feature\'s critical path. Without these, the SRE on-call has no signal when the feature degrades. Add them now while the feature\'s critical path is loaded.',
  ],
  L2: [
    'For the feature being shipped: are logs, metrics, and distributed traces in place? Observability must be instrumented alongside the feature — not added after the first production incident.',
    'Three pillars before shipping: structured logs for success and failure paths, metrics for rate and error tracking, traces for the critical request path.',
  ],
  L3: [
    'Add logging, metrics, and tracing instrumentation before shipping — all three pillars required.',
  ],
};

const ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL: DecisionContent = {
  question:      'External dependencies integrated — failure modes enumerated?',
  pinchFallback: 'Enumerate failure modes for each dependency.',
  L1: [
    'FMEA (MIL-STD-1629A) / Nygard Release It! (2007): every external dependency introduces failure modes requiring enumeration before implementation. For each dependency just integrated — enumerate: (1) what happens when it is completely unavailable; (2) what happens when it responds slowly (timeout scenario); (3) what happens when it returns partial or degraded data. Each failure mode maps to a stability pattern: circuit breaker, timeout, bulkhead, fallback. Without enumeration, these patterns are not applied.',
    'Distributed systems fail in cascading ways — a single dependency failure becomes a system-wide outage when no isolation pattern is in place. Nygard\'s stability patterns address enumerated failure modes: circuit breakers isolate a failing dependency; timeouts prevent thread exhaustion; bulkheads limit blast radius; fallbacks provide degraded service. The question to answer for every integration: which failure modes exist, and which stability pattern addresses each one?',
    'Three failure mode categories for every external dependency: (1) availability — the dependency is completely unreachable; (2) latency — the dependency responds but slowly, exhausting connection pools; (3) correctness — the dependency responds with invalid, partial, or unexpected data. Define the expected behavior in each category before implementing the integration. The missing behavior is the bug that hits in production at 3am.',
  ],
  L2: [
    'For each dependency just integrated: enumerate the failure modes (unavailable, slow, degraded) and specify which stability pattern addresses each — circuit breaker, timeout, fallback, or bulkhead.',
    'What happens when this dependency is down, slow, or returning bad data? Enumerate before implementing — the unenumerated failure mode is the production incident.',
  ],
  L3: [
    'Enumerate failure modes for each dependency and specify the stability pattern for each before shipping.',
  ],
};

const ABSENCE_CONTRACT_TESTING_GAP_FORMAL: DecisionContent = {
  question:      'Service boundary established — contract tests defined?',
  pinchFallback: 'Define consumer-driven contract tests for this boundary.',
  L1: [
    'Consumer-Driven Contracts (Ian Robinson, martinfowler.com, 2006): service boundaries require contract tests to survive independent deployment. Consumer-driven contracts shift contract definition to the consumer — the consumer specifies what it needs from the producer, and the producer verifies it satisfies those requirements in isolation, without requiring both services to be deployed together. Tools: Pact, Spring Cloud Contract. Without contract tests, integration regressions are caught only in staging.',
    'The independent deployment problem: when consumer and producer deploy independently, there is no integration test run at deploy time. Contract tests solve this by running provider verification against consumer contracts in the producer\'s CI pipeline — catching contract breaks before they reach staging. For the service boundary just defined: write consumer contract tests that specify the exact shape of requests and responses the consumer depends on, then run provider verification in CI.',
    'Three contract test artifacts for a service boundary: (1) consumer contract — specifies the request shape and response fields the consumer actually uses (not the full schema); (2) provider verification — the producer\'s CI step that validates it satisfies registered consumer contracts; (3) contract broker — a registry keeping consumer contracts accessible for verification (Pact Broker). Define these before the first independent deployment of either service.',
  ],
  L2: [
    'For the service boundary just established: define consumer-driven contracts specifying the exact request/response shape each consumer requires, and add provider verification to the producer\'s CI pipeline.',
    'Without contract tests, integration regressions surface only in staging. Consumer-driven contracts (Pact/Spring Cloud Contract) catch boundary breaks in CI before independent deployment.',
  ],
  L3: [
    'Define consumer-driven contract tests for this service boundary before independent deployment.',
  ],
};

// ── Phase 5 D12 — hardcore_pro clusters 3+4 (FORMAL register) ────────────────

const ABSENCE_CAPACITY_PLANNING_GAP_FORMAL: DecisionContent = {
  question:      'Load-adding feature — capacity estimate done?',
  pinchFallback: 'Complete a capacity estimate before shipping.',
  L1: [
    'Google SRE (Beyer et al., 2016): load-adding features require a capacity estimate before production deployment. Three required numbers: (1) peak RPS at expected traffic; (2) storage growth rate at 30/90/365 days; (3) downstream resource utilization headroom (DB connection pool, cache, dependent APIs). Without all three, the feature ships blind to its production cost.',
    'Capacity estimate checklist for the feature being built: what is the steady-state RPS at expected traffic? What does storage growth look like over 90 days? Does the existing infrastructure have headroom — or does this feature require provisioning before it can ship safely? A back-of-envelope estimate takes 20 minutes; a production load surprise takes on-call hours.',
    'Pre-ship capacity gate: (1) estimate peak RPS; (2) project storage growth curve; (3) confirm infrastructure headroom for dependent services. If any number is unknown, the feature is not ready to ship — it lacks the data to size infrastructure or set autoscaling thresholds. Provide all three before shipping.',
  ],
  L2: [
    'Estimate three numbers before shipping: peak RPS at expected traffic, storage growth rate at 90 days, and infrastructure headroom on dependent services. These determine whether current capacity can absorb the feature.',
    'Capacity planning gate: what RPS does this feature add at peak? What is the storage cost over 90 days? Does existing infrastructure have headroom? Answer all three before shipping.',
  ],
  L3: [
    'Capacity estimate required: RPS at peak, storage growth rate, infrastructure headroom. Provide all three before shipping.',
  ],
};

const ABSENCE_SECURITY_THREAT_MODELING_FORMAL: DecisionContent = {
  question:      'Security-sensitive feature — STRIDE threat model completed?',
  pinchFallback: 'Complete a STRIDE threat model before shipping.',
  L1: [
    'STRIDE (Adam Shostack, \'Threat Modeling: Designing for Security\', Wiley 2014) requires systematic enumeration of Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service, and Elevation of Privilege threats for every feature introducing a new attack surface. For each applicable STRIDE category: identify the attack vector, the trust boundary it crosses, and the mitigation control. This 30-minute structured pass prevents OWASP Top 10 vulnerabilities from reaching production.',
    'OWASP Threat Modeling Process: Data Flow Diagram → trust boundary identification → threat enumeration per STRIDE → mitigation design. The output is a list of threats and their controls. For the feature being built — identify which STRIDE categories apply (minimum: Information Disclosure, Elevation of Privilege, Tampering for any auth-adjacent or data-handling feature) and define the mitigation for each.',
    'Attack surface review required before shipping security-sensitive features: (1) identify trust boundaries crossed by the feature; (2) enumerate applicable STRIDE threats; (3) for each threat, define the mitigation control (input validation, rate limiting, authorization check, audit logging). A feature without a completed STRIDE pass is not production-ready by OWASP Secure by Design standards.',
  ],
  L2: [
    'Apply STRIDE to the feature: for each applicable category (Spoofing, Tampering, Repudiation, Information Disclosure, DoS, Elevation of Privilege) — what is the attack vector and what is the mitigation? This enumeration must be completed before shipping.',
    'Threat model required: identify trust boundaries, enumerate applicable STRIDE threats, define mitigation controls. This prevents OWASP Top 10 vulnerabilities from shipping to production.',
  ],
  L3: [
    'STRIDE threat model required: enumerate applicable threats and define mitigation controls before shipping.',
  ],
};

const ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL: DecisionContent = {
  question:      'Schema change — expand-migrate-contract pattern applied?',
  pinchFallback: 'Apply backwards-compatible phased migration.',
  L1: [
    'Evolutionary Database Design (Fowler/Sadalage, 2003/2016): schema changes must be backwards-compatible with both the current and new application versions running simultaneously. The expand-migrate-contract pattern: Phase 1 (expand) — add new columns/tables alongside existing; Phase 2 (migrate) — backfill data with both versions live; Phase 3 (contract) — remove old structures only after all application versions are updated. Never DROP, RENAME, or add NOT NULL constraints in a single migration deployment.',
    'The backwards-compatibility invariant: a schema change that breaks the currently-running application version is an outage if the deployment fails or requires rollback. For every destructive migration operation — validate: does this work with application version N (currently running) AND version N+1 (being deployed)? If no — redesign as a phased migration across multiple deployments.',
    'Pre-migration safety checklist: (1) is the migration backwards-compatible with the current application version? (2) can it be rolled back without data loss? (3) is this a multi-phase migration for any destructive operation (DROP, RENAME, type change, NOT NULL addition)? All three must be YES before deploying. Single-phase destructive migrations are an outage risk.',
  ],
  L2: [
    'Apply expand-migrate-contract: no DROP, RENAME, or NOT NULL constraint addition in a single deployment. Destructive migrations must be phased — expand first, migrate data with both versions live, contract only after old application code is fully retired.',
    'Migration safety gate: is this backwards-compatible with the running application version? Can it be rolled back without data loss? If no to either, redesign as a phased migration.',
  ],
  L3: [
    'Expand-migrate-contract required: no destructive schema changes in a single deployment. Phase across multiple deployments.',
  ],
};

const ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL: DecisionContent = {
  question:      'Significant feature shipping — deployment strategy defined?',
  pinchFallback: 'Define deployment strategy and rollback plan before shipping.',
  L1: [
    'Continuous Delivery (Humble/Farley, 2010): every production deployment requires a defined deployment mechanism and rollback plan. Options: (1) Feature flag — ship behind a flag, enable gradually, instant rollback by disabling; (2) Canary — route N% of traffic to new version, watch error rates and latency before full rollout; (3) Blue-green — maintain two environments, cut traffic; (4) Staged rollout — deploy to subset of regions/tenants. Choose one explicitly and define the rollback procedure before the deployment is executed.',
    'Deploying without a strategy converts a planned deployment into improvised incident response if anything goes wrong. The rollback plan — what command, who runs it, what does it restore to, how long does it take — must be defined before deployment, not after a failure. For significant features: feature flag is the lowest-risk option (instant rollback, gradual exposure, dark launch capability).',
    'Pre-deployment checklist: (1) is there a deployment mechanism that allows gradual rollout (canary, feature flag, staged rollout)? (2) is there a defined rollback procedure that can be executed under time pressure? (3) are monitoring thresholds set so a bad deployment is automatically detected before full rollout? All three are required for a production deployment of a significant feature.',
  ],
  L2: [
    'Define before deploying: the rollout strategy (canary/feature flag/blue-green/staged) and the rollback plan (what reverts this, who runs it, how long does it take). Both must exist before the deployment is executed.',
    'Deployment without a rollback plan is an incident waiting to happen. Define the strategy, the rollback procedure, and the monitoring threshold that triggers it.',
  ],
  L3: [
    'Define deployment strategy (canary/feature flag/blue-green/staged) and rollback plan before shipping.',
  ],
};

const ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL: DecisionContent = {
  question:      'New service/feature shipping — operational runbook written?',
  pinchFallback: 'Write the runbook before shipping.',
  L1: [
    'Google SRE Book (Beyer et al., 2016): runbooks are required operational documentation for any production service. \'Runbooks capture the operational knowledge required to keep a service running — how to deploy, how to diagnose common failures, what the escalation path is.\' Without a runbook, the on-call engineer responding to a 3am alert has no guide to the service they\'re debugging.',
    'Minimum viable runbook for a new service or significant feature: (1) what this service/feature does — one paragraph; (2) how to deploy and roll back; (3) common failure modes and how to diagnose each; (4) which metrics/dashboards are the key health indicators; (5) escalation path if automated remediation fails. A short wiki page suffices — the content matters more than the format.',
    'Operational readiness gate: before any new service ships to production, define the answer to three on-call questions: what is this thing? How do I know it\'s broken? What do I do when it breaks? These three answers constitute the minimum viable runbook. A service without them cannot be supported by an on-call rotation.',
  ],
  L2: [
    'Write the runbook before shipping: what the service does, how to deploy and roll back, common failure modes and diagnostics, key health metrics, and escalation path. This is the minimum required for on-call supportability.',
    'On-call operators need three things: how to know the service is healthy, how to diagnose it when it fails, and who to escalate to. Write these before shipping.',
  ],
  L3: [
    'Write the runbook before shipping: what it does, how to debug failures, key metrics, and escalation path.',
  ],
};

const ABSENCE_SLO_DEFINITION_GAP_FORMAL: DecisionContent = {
  question:      'User-facing feature/service — SLOs defined?',
  pinchFallback: 'Define SLOs before shipping.',
  L1: [
    'Google SRE Book (Beyer et al., 2016): \'SLOs are the key mechanism by which SRE and product teams agree on the required level of service reliability.\' Three required SLO dimensions: availability (% of requests succeeding), latency (% of requests completing within N ms at p99), and error rate budget (% of requests allowed to fail). Without defined SLOs, alerting thresholds are arbitrary and reliability trade-offs cannot be made with data.',
    'Alex Hidalgo, \'Implementing Service Level Objectives\' (O\'Reilly, 2020): \'SLOs create a shared language for discussing reliability trade-offs between engineering and product.\' Before shipping a user-facing feature: define availability target (e.g., 99.9%), latency target (e.g., p99 < 500ms), and error rate budget (e.g., < 0.1% of requests return errors). These three numbers become the basis for alerts, error budgets, and go/no-go decisions for risky changes.',
    'SLO definition before shipping protects against two failure modes: (1) shipping without alerting thresholds, so incidents are discovered by users not monitoring; (2) investing in reliability improvements with no data to justify the cost or define \'reliable enough.\' Define availability, latency, and error rate targets — these are not post-ship tasks, they are pre-ship gates.',
  ],
  L2: [
    'Define three SLO dimensions before shipping: availability target (% of requests succeeding), latency target (p99 response time), and error rate budget (% of requests allowed to fail). These become the basis for alerting thresholds and reliability trade-off decisions.',
    'Without SLOs, alerting is arbitrary, error budgets don\'t exist, and there is no shared definition of \'reliable enough.\' Define availability, latency, and error rate targets before shipping.',
  ],
  L3: [
    'Define SLOs before shipping: availability target, latency target (p99), and error rate budget.',
  ],
};

// ── Content resolution ─────────────────────────────────────────────────────────

/**
 * Absence-signal content overrides.
 * When Stage 2 fires for an absence flag, map the signal to the most relevant content.
 * Signals not listed here fall back to the stage-based transition content.
 */
const ABSENCE_CONTENT: Partial<Record<string, DecisionContent>> = {
  test_creation:         ABSENCE_TEST_CREATION,
  regression_check:      ABSENCE_REGRESSION_CHECK,
  spec_acceptance_check: ABSENCE_SPEC_ACCEPTANCE,
  cross_confirming:      ABSENCE_CROSS_CONFIRMING,
  behaviour_testing:     BEHAVIOUR_TESTING,
  security_check:        ABSENCE_SECURITY_CHECK,
  error_handling:        ABSENCE_ERROR_HANDLING,
  documentation:         ABSENCE_DOCUMENTATION,
  observability:         ABSENCE_OBSERVABILITY,
  comprehension:         ABSENCE_COMPREHENSION,
  refactoring_review:      ABSENCE_REFACTORING,
  no_agent_pushback:       ABSENCE_NO_PUSHBACK,
  correction_seeking:      ABSENCE_CORRECTION_SEEKING,
  problem_correction:      ABSENCE_PROBLEM_CORRECTION,
  alternatives_seeking:    ABSENCE_ALTERNATIVES,
  architecture_conflict:   ABSENCE_ARCH_CONFLICT,
  prompt_context_richness: ABSENCE_PROMPT_CONTEXT,
  rollback_planning:       ABSENCE_ROLLBACK_PLANNING,
  deployment_planning:     ABSENCE_DEPLOYMENT_PLANNING,
  dependency_management:   ABSENCE_DEPENDENCY_MGMT,
  phase_transition:        ABSENCE_PHASE_TRANSITION,
  spec_cross_confirm:      ABSENCE_SPEC_CROSS_CONFIRM,
  spec_revision:           ABSENCE_SPEC_REVISION,
  idea_scoping:            ABSENCE_IDEA_SCOPING,
  idea_constraint_check:   ABSENCE_IDEA_CONSTRAINT_CHECK,
  idea_user_definition:    ABSENCE_IDEA_USER_DEFINITION,
  task_ordering:           ABSENCE_TASK_ORDERING,
  task_sizing:             ABSENCE_TASK_SIZING,
  task_definition_of_done: ABSENCE_TASK_DEFINITION_OF_DONE,
  user_feedback_review:    ABSENCE_USER_FEEDBACK_REVIEW,
  iteration_planning:      ABSENCE_ITERATION_PLANNING,
  scope_creep:             ABSENCE_SCOPE_CREEP,
  context_loss:            ABSENCE_CONTEXT_LOSS,
  api_design_review:       ABSENCE_API_DESIGN_REVIEW,
  accessibility:           ABSENCE_ACCESSIBILITY,
  environment_and_secrets: ABSENCE_ENV_AND_SECRETS,
  data_validation:         ABSENCE_DATA_VALIDATION,
  ci_pipeline:             ABSENCE_CI_PIPELINE,
  rate_limiting:           ABSENCE_RATE_LIMITING,
  feature_scope_before_build:    ABSENCE_FEATURE_SCOPE,
  implementation_checkpoint:     ABSENCE_IMPLEMENTATION_CHECKPOINT,
  spec_before_code:              ABSENCE_SPEC_BEFORE_CODE,
  incremental_build:             ABSENCE_INCREMENTAL_BUILD,
  decision_record_absence:       ABSENCE_DECISION_RECORD_ABSENCE_FORMAL,
  over_engineering_check:        ABSENCE_OVER_ENGINEERING_CHECK_FORMAL,
  pair_review_absence:           ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL,
  observability_first:           ABSENCE_OBSERVABILITY_FIRST_FORMAL,
  failure_mode_analysis:         ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL,
  contract_testing_gap:          ABSENCE_CONTRACT_TESTING_GAP_FORMAL,
  capacity_planning_gap:         ABSENCE_CAPACITY_PLANNING_GAP_FORMAL,
  security_threat_modeling:      ABSENCE_SECURITY_THREAT_MODELING_FORMAL,
  database_migration_safety:     ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL,
  deployment_strategy_absence:   ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL,
  operational_runbook_gap:       ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL,
  slo_definition_gap:            ABSENCE_SLO_DEFINITION_GAP_FORMAL,
};

const ABSENCE_CONTENT_CASUAL: Partial<Record<string, DecisionContent>> = {
  test_creation:         ABSENCE_TEST_CREATION_CASUAL,
  regression_check:      ABSENCE_REGRESSION_CHECK_CASUAL,
  spec_acceptance_check: ABSENCE_SPEC_ACCEPTANCE_CASUAL,
  cross_confirming:      ABSENCE_CROSS_CONFIRMING_CASUAL,
  behaviour_testing:     BEHAVIOUR_TESTING_CASUAL,
  security_check:        ABSENCE_SECURITY_CHECK_CASUAL,
  error_handling:        ABSENCE_ERROR_HANDLING_CASUAL,
  documentation:         ABSENCE_DOCUMENTATION_CASUAL,
  observability:         ABSENCE_OBSERVABILITY_CASUAL,
  comprehension:         ABSENCE_COMPREHENSION_CASUAL,
  refactoring_review:      ABSENCE_REFACTORING_CASUAL,
  no_agent_pushback:       ABSENCE_NO_PUSHBACK_CASUAL,
  correction_seeking:      ABSENCE_CORRECTION_SEEKING_CASUAL,
  problem_correction:      ABSENCE_PROBLEM_CORRECTION_CASUAL,
  alternatives_seeking:    ABSENCE_ALTERNATIVES_CASUAL,
  architecture_conflict:   ABSENCE_ARCH_CONFLICT_CASUAL,
  prompt_context_richness: ABSENCE_PROMPT_CONTEXT_CASUAL,
  rollback_planning:       ABSENCE_ROLLBACK_PLANNING_CASUAL,
  deployment_planning:     ABSENCE_DEPLOYMENT_PLANNING_CASUAL,
  dependency_management:   ABSENCE_DEPENDENCY_MGMT_CASUAL,
  phase_transition:        ABSENCE_PHASE_TRANSITION_CASUAL,
  spec_cross_confirm:      ABSENCE_SPEC_CROSS_CONFIRM_CASUAL,
  spec_revision:           ABSENCE_SPEC_REVISION_CASUAL,
  idea_scoping:            ABSENCE_IDEA_SCOPING_CASUAL,
  idea_constraint_check:   ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL,
  idea_user_definition:    ABSENCE_IDEA_USER_DEFINITION_CASUAL,
  task_ordering:           ABSENCE_TASK_ORDERING_CASUAL,
  task_sizing:             ABSENCE_TASK_SIZING_CASUAL,
  task_definition_of_done: ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL,
  user_feedback_review:    ABSENCE_USER_FEEDBACK_REVIEW_CASUAL,
  iteration_planning:      ABSENCE_ITERATION_PLANNING_CASUAL,
  scope_creep:             ABSENCE_SCOPE_CREEP_CASUAL,
  context_loss:            ABSENCE_CONTEXT_LOSS_CASUAL,
  api_design_review:       ABSENCE_API_DESIGN_REVIEW_CASUAL,
  accessibility:           ABSENCE_ACCESSIBILITY_CASUAL,
  environment_and_secrets: ABSENCE_ENV_AND_SECRETS_CASUAL,
  data_validation:         ABSENCE_DATA_VALIDATION_CASUAL,
  ci_pipeline:             ABSENCE_CI_PIPELINE_CASUAL,
  rate_limiting:           ABSENCE_RATE_LIMITING_CASUAL,
  feature_scope_before_build:    ABSENCE_FEATURE_SCOPE_CASUAL,
  implementation_checkpoint:     ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL,
  spec_before_code:              ABSENCE_SPEC_BEFORE_CODE_CASUAL,
  incremental_build:             ABSENCE_INCREMENTAL_BUILD_CASUAL,
  feature_completion_check:      ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL,
  finishing_line_awareness:      ABSENCE_FINISHING_LINE_AWARENESS_CASUAL,
  polish_vs_function:            ABSENCE_POLISH_VS_FUNCTION_CASUAL,
  mvp_scope_discipline:          ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL,
  idea_to_spec_bridge:           ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL,
  demo_vs_product:               ABSENCE_DEMO_VS_PRODUCT_CASUAL,
  user_journey_check:            ABSENCE_USER_JOURNEY_CHECK_CASUAL,
  technical_spike_treatment:     ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL,
  dependency_adventure:          ABSENCE_DEPENDENCY_ADVENTURE_CASUAL,
  restart_impulse_check:         ABSENCE_RESTART_IMPULSE_CHECK_CASUAL,
  creative_vs_core_ratio:        ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL,
  code_documentation_gap:        ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL,
  technical_debt_acknowledgment: ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL,
  test_depth_check:              ABSENCE_TEST_DEPTH_CHECK_CASUAL,
  architecture_note_absence:     ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL,
  dependency_audit_gap:          ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL,
  security_review_gap:           ABSENCE_SECURITY_REVIEW_GAP_CASUAL,
  api_contract_definition:       ABSENCE_API_CONTRACT_DEFINITION_CASUAL,
  error_handling_coverage:       ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL,
  refactoring_checkpoint:        ABSENCE_REFACTORING_CHECKPOINT_CASUAL,
  backwards_compatibility_check: ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL,
  self_review_habit:             ABSENCE_SELF_REVIEW_HABIT_CASUAL,
  performance_awareness:         ABSENCE_PERFORMANCE_AWARENESS_CASUAL,
};

/**
 * Stage transition content lookup.
 * Keyed by the DESTINATION stage (currentStage after transition).
 */
const TRANSITION_CONTENT: Partial<Record<Stage, DecisionContent>> = {
  prd:            IDEA_TO_PRD,
  architecture:   PRD_TO_ARCHITECTURE,
  task_breakdown: ARCHITECTURE_TO_TASKS,
  review_testing: IMPLEMENTATION_TO_REVIEW,
  release:        REVIEW_TO_RELEASE,
  feedback_loop:  RELEASE_TO_FEEDBACK,
};

function selectAbsenceMap(nature: UserProfile['nature'] | null | undefined): Partial<Record<string, DecisionContent>> {
  if (nature === 'hardcore_pro') return ABSENCE_CONTENT;
  return ABSENCE_CONTENT_CASUAL;
}

function selectNonBeginnerVariant(nature: UserProfile['nature'] | null | undefined): DecisionContent {
  if (nature === 'hardcore_pro') return TASK_REVIEW;
  return TASK_REVIEW_CASUAL;
}

/**
 * Resolve the decision content to display.
 *
 * Priority:
 *   1. Absence flag with a specific override → use it
 *   2. Stage transition → use destination-stage content
 *   3. Implementation stage (within-stage absence) → heuristic variant by profile.nature
 *   4. Ultimate fallback → heuristic variant by profile.nature
 */
function resolveSkippedTransitionContent(
  transitionMap: Partial<Record<Stage, DecisionContent>>,
  prevStage:     Stage,
  currentStage:  Stage,
): DecisionContent | null {
  const prevIdx = STAGES.indexOf(prevStage);
  const currIdx = STAGES.indexOf(currentStage);
  if (prevIdx < 0 || currIdx < 0 || currIdx - prevIdx <= 1) return null;
  for (let i = currIdx - 1; i > prevIdx; i--) {
    const stage = STAGES[i];
    if (stage && transitionMap[stage]) return transitionMap[stage]!;
  }
  return null;
}

export function resolveDecisionContent(
  currentStage: Stage,
  flagType:     FlagType,
  profile?:     UserProfile | null,
  prevStage?:   Stage,
): DecisionContent {
  const isBeginner    = profile?.nature === 'beginner';
  const isVibe        = isBeginner;
  const absenceMap    = isVibe ? ABSENCE_CONTENT_BEGINNER : selectAbsenceMap(profile?.nature);
  const transitionMap = isVibe ? TRANSITION_CONTENT_BEGINNER : TRANSITION_CONTENT;

  if (flagType.startsWith('absence:')) {
    const signalKey = flagType.slice('absence:'.length);
    const override  = absenceMap[signalKey];
    if (override) return override;
  }

  if (flagType === 'stage_transition' && prevStage) {
    const skipped = resolveSkippedTransitionContent(transitionMap, prevStage, currentStage);
    if (skipped) return skipped;
  }

  const direct = transitionMap[currentStage];
  if (direct) return direct;

  if (currentStage === 'implementation') return isBeginner ? TASK_REVIEW_BEGINNER : selectNonBeginnerVariant(profile?.nature);

  return isBeginner ? TASK_REVIEW_BEGINNER : selectNonBeginnerVariant(profile?.nature);
}

// ── Option list building ───────────────────────────────────────────────────────

export const SHOW_SIMPLER  = 'Show simpler options →' as const;
export const SKIP_NOW      = 'Skip for now — nexpath optimize will remind me later' as const;

export type SpecialOption  = typeof SHOW_SIMPLER | typeof SKIP_NOW;
export type DecisionOption = string | SpecialOption;

export interface BuiltOptionList {
  /** The selectable options for this level, including "Show simpler options →" and "Skip for now". */
  options: DecisionOption[];
  /** Whether "Show simpler options →" is included (levels 1 and 2 only). */
  hasNextLevel: boolean;
}

/**
 * Build the full option list for a given level.
 *
 * Structure (per research):
 *   - Content options for this level
 *   - [separator implied in UI — not a selectable option]
 *   - "Show simpler options →"  (levels 1 and 2 only)
 *   - "Skip for now — nexpath optimize will remind me later"  (always last)
 */
export function buildOptionList(
  content: DecisionContent,
  level:   1 | 2 | 3,
): BuiltOptionList {
  const contentOptions: string[] =
    level === 1 ? content.L1 :
    level === 2 ? content.L2 :
                  content.L3;

  const hasNextLevel = level < 3;
  const options: DecisionOption[] = [...contentOptions];

  if (hasNextLevel) options.push(SHOW_SIMPLER);
  options.push(SKIP_NOW);

  return { options, hasNextLevel };
}

// ── Level subtitle ─────────────────────────────────────────────────────────────

/** Returns the level subtitle shown below the pinch label (research spec). */
export function getLevelSubtitle(level: 1 | 2 | 3): string | null {
  if (level === 1) return null;
  if (level === 2) return '— lighter options';
  return '— minimum viable step';
}

// ── Re-exports ─────────────────────────────────────────────────────────────────

export {
  IDEA_TO_PRD,
  PRD_TO_ARCHITECTURE,
  ARCHITECTURE_TO_TASKS,
  TASK_REVIEW,
  TASK_REVIEW_CASUAL,
  IMPLEMENTATION_TO_REVIEW,
  REVIEW_TO_RELEASE,
  RELEASE_TO_FEEDBACK,
  BEHAVIOUR_TESTING,
  BEHAVIOUR_TESTING_CASUAL,
  ABSENCE_TEST_CREATION,
  ABSENCE_TEST_CREATION_CASUAL,
  ABSENCE_REGRESSION_CHECK,
  ABSENCE_REGRESSION_CHECK_CASUAL,
  ABSENCE_SPEC_ACCEPTANCE,
  ABSENCE_SPEC_ACCEPTANCE_CASUAL,
  ABSENCE_CROSS_CONFIRMING,
  ABSENCE_CROSS_CONFIRMING_CASUAL,
  ABSENCE_SECURITY_CHECK,
  ABSENCE_SECURITY_CHECK_CASUAL,
  ABSENCE_ERROR_HANDLING,
  ABSENCE_ERROR_HANDLING_CASUAL,
  ABSENCE_DOCUMENTATION,
  ABSENCE_DOCUMENTATION_CASUAL,
  ABSENCE_OBSERVABILITY,
  ABSENCE_OBSERVABILITY_CASUAL,
  ABSENCE_COMPREHENSION,
  ABSENCE_COMPREHENSION_CASUAL,
  ABSENCE_REFACTORING,
  ABSENCE_REFACTORING_CASUAL,
  ABSENCE_NO_PUSHBACK,
  ABSENCE_NO_PUSHBACK_CASUAL,
  ABSENCE_CORRECTION_SEEKING,
  ABSENCE_CORRECTION_SEEKING_CASUAL,
  ABSENCE_PROBLEM_CORRECTION,
  ABSENCE_PROBLEM_CORRECTION_CASUAL,
  ABSENCE_ALTERNATIVES,
  ABSENCE_ALTERNATIVES_CASUAL,
  ABSENCE_ARCH_CONFLICT,
  ABSENCE_ARCH_CONFLICT_CASUAL,
  ABSENCE_PROMPT_CONTEXT,
  ABSENCE_PROMPT_CONTEXT_CASUAL,
  ABSENCE_ROLLBACK_PLANNING,
  ABSENCE_ROLLBACK_PLANNING_CASUAL,
  ABSENCE_DEPLOYMENT_PLANNING,
  ABSENCE_DEPLOYMENT_PLANNING_CASUAL,
  ABSENCE_DEPENDENCY_MGMT,
  ABSENCE_DEPENDENCY_MGMT_CASUAL,
  ABSENCE_PHASE_TRANSITION,
  ABSENCE_PHASE_TRANSITION_CASUAL,
  ABSENCE_SPEC_CROSS_CONFIRM,
  ABSENCE_SPEC_CROSS_CONFIRM_CASUAL,
  ABSENCE_SPEC_REVISION,
  ABSENCE_SPEC_REVISION_CASUAL,
  ABSENCE_IDEA_SCOPING,
  ABSENCE_IDEA_SCOPING_CASUAL,
  ABSENCE_IDEA_CONSTRAINT_CHECK,
  ABSENCE_IDEA_CONSTRAINT_CHECK_CASUAL,
  ABSENCE_IDEA_USER_DEFINITION,
  ABSENCE_IDEA_USER_DEFINITION_CASUAL,
  ABSENCE_TASK_ORDERING,
  ABSENCE_TASK_ORDERING_CASUAL,
  ABSENCE_TASK_SIZING,
  ABSENCE_TASK_SIZING_CASUAL,
  ABSENCE_TASK_DEFINITION_OF_DONE,
  ABSENCE_TASK_DEFINITION_OF_DONE_CASUAL,
  ABSENCE_USER_FEEDBACK_REVIEW,
  ABSENCE_USER_FEEDBACK_REVIEW_CASUAL,
  ABSENCE_ITERATION_PLANNING,
  ABSENCE_ITERATION_PLANNING_CASUAL,
  ABSENCE_SCOPE_CREEP,
  ABSENCE_SCOPE_CREEP_CASUAL,
  ABSENCE_CONTEXT_LOSS,
  ABSENCE_CONTEXT_LOSS_CASUAL,
  ABSENCE_API_DESIGN_REVIEW,
  ABSENCE_API_DESIGN_REVIEW_CASUAL,
  ABSENCE_ACCESSIBILITY,
  ABSENCE_ACCESSIBILITY_CASUAL,
  ABSENCE_ENV_AND_SECRETS,
  ABSENCE_ENV_AND_SECRETS_CASUAL,
  ABSENCE_DATA_VALIDATION,
  ABSENCE_DATA_VALIDATION_CASUAL,
  ABSENCE_CI_PIPELINE,
  ABSENCE_CI_PIPELINE_CASUAL,
  ABSENCE_RATE_LIMITING,
  ABSENCE_RATE_LIMITING_CASUAL,
  ABSENCE_FEATURE_SCOPE,
  ABSENCE_FEATURE_SCOPE_CASUAL,
  ABSENCE_IMPLEMENTATION_CHECKPOINT,
  ABSENCE_IMPLEMENTATION_CHECKPOINT_CASUAL,
  ABSENCE_SPEC_BEFORE_CODE,
  ABSENCE_SPEC_BEFORE_CODE_CASUAL,
  ABSENCE_INCREMENTAL_BUILD,
  ABSENCE_INCREMENTAL_BUILD_CASUAL,
  ABSENCE_FEATURE_COMPLETION_CHECK_CASUAL,
  ABSENCE_FINISHING_LINE_AWARENESS_CASUAL,
  ABSENCE_POLISH_VS_FUNCTION_CASUAL,
  ABSENCE_MVP_SCOPE_DISCIPLINE_CASUAL,
  ABSENCE_IDEA_TO_SPEC_BRIDGE_CASUAL,
  ABSENCE_DEMO_VS_PRODUCT_CASUAL,
  ABSENCE_USER_JOURNEY_CHECK_CASUAL,
  ABSENCE_TECHNICAL_SPIKE_TREATMENT_CASUAL,
  ABSENCE_DEPENDENCY_ADVENTURE_CASUAL,
  ABSENCE_RESTART_IMPULSE_CHECK_CASUAL,
  ABSENCE_CREATIVE_VS_CORE_RATIO_CASUAL,
  ABSENCE_CODE_DOCUMENTATION_GAP_CASUAL,
  ABSENCE_TECHNICAL_DEBT_ACKNOWLEDGMENT_CASUAL,
  ABSENCE_TEST_DEPTH_CHECK_CASUAL,
  ABSENCE_ARCHITECTURE_NOTE_ABSENCE_CASUAL,
  ABSENCE_DEPENDENCY_AUDIT_GAP_CASUAL,
  ABSENCE_SECURITY_REVIEW_GAP_CASUAL,
  ABSENCE_API_CONTRACT_DEFINITION_CASUAL,
  ABSENCE_ERROR_HANDLING_COVERAGE_CASUAL,
  ABSENCE_REFACTORING_CHECKPOINT_CASUAL,
  ABSENCE_BACKWARDS_COMPATIBILITY_CHECK_CASUAL,
  ABSENCE_SELF_REVIEW_HABIT_CASUAL,
  ABSENCE_PERFORMANCE_AWARENESS_CASUAL,
  ABSENCE_DECISION_RECORD_ABSENCE_FORMAL,
  ABSENCE_OVER_ENGINEERING_CHECK_FORMAL,
  ABSENCE_PAIR_REVIEW_ABSENCE_FORMAL,
  ABSENCE_OBSERVABILITY_FIRST_FORMAL,
  ABSENCE_FAILURE_MODE_ANALYSIS_FORMAL,
  ABSENCE_CONTRACT_TESTING_GAP_FORMAL,
  ABSENCE_CAPACITY_PLANNING_GAP_FORMAL,
  ABSENCE_SECURITY_THREAT_MODELING_FORMAL,
  ABSENCE_DATABASE_MIGRATION_SAFETY_FORMAL,
  ABSENCE_DEPLOYMENT_STRATEGY_ABSENCE_FORMAL,
  ABSENCE_OPERATIONAL_RUNBOOK_GAP_FORMAL,
  ABSENCE_SLO_DEFINITION_GAP_FORMAL,
};
