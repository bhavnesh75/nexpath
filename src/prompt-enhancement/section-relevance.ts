/**
 * I1 — the RELEVANCE OBSERVATION: of the sections that could be planned, which most serve THIS
 * prompt?
 *
 * 🔒 §15.2 step 1: *"an ORDERING, not a deletion; the model deletes nothing"*, and §15.2 step 3:
 * *"model observes, registry decides"* (prohibition 4). This module builds only the observation's
 * vocabulary and its guard. ⛔ **Nothing here prunes.** The registry does that in I2, under the
 * locked drop-criteria (§15.1 (a)/(b)/(c)) — an ordering that arrived from a model is an input to
 * that decision, never the decision.
 *
 * ⚠️ **Why the model is shown section KINDS and not the planned sections.** The classifier call
 * happens BEFORE routing and section planning — planning consumes the intent and capabilities this
 * same reply proposes. So there is no list of planned sections in existence when the observation is
 * made, and asking for one would be asking the model to rank something it cannot see. It ranks the
 * VOCABULARY; I2 applies that ordering to whatever was actually planned, and a kind the plan never
 * produced simply never matches.
 *
 * ⚠️ **This module is a LEAF on purpose, and the list is CHECKED rather than derived.** The first
 * version imported the planner's `PROMPT_ENHANCEMENT_PLANNABLE_SECTION_KINDS_V1` and derived from
 * it — which closed an import cycle (the classifier imports this module, and the planner's module
 * graph reaches the classifier) and threw `Cannot access … before initialization` at load. Making
 * the read lazy did NOT fix it: the cycle is the problem, not the timing.
 *
 * 🔑 So "one map, one meaning" is preserved by a FIXTURE rather than by an import —
 * `section-relevance.test.ts` asserts this list equals the planner's, positionally. A kind added on
 * one side and not the other fails CI. Same guarantee, no cycle.
 */

/**
 * The kinds the model may order, with what each is FOR — IN THE PLANNER'S OWN ORDER.
 *
 * ⚠️ The key order is load-bearing: it IS the vocabulary (see the accessor below), and the fixture
 * compares it to the planner's list positionally.
 */
const SECTION_PURPOSE_V1: Readonly<Record<string, string>> = {
  original_request_or_goal: 'the developer\'s own request, carried verbatim',
  uncertainty_or_clarification: 'what is ambiguous and needs asking',
  acceptance_or_output_expectation: 'what finished looks like and how it will be judged',
  verification_or_test_plan: 'how the change will be proven to work',
  reproduction_or_evidence: 'the steps, logs or samples that show the problem',
  behavior_preservation: 'what must keep working unchanged',
  risk_safety_or_confirmation: 'risk, rollback, and what needs confirming before acting',
  project_grounding_facts: 'facts about this specific project that shape the work',
  requirement_source_state: 'where the requirement came from and how firm it is',
  handoff_or_sequence_candidate: 'work that should be split or handed on',
  context_and_constraints: 'the constraints, environment and limits the work must respect',
  point_inventory_or_decomposition: 'the separate points the request contains',
  finding_format: 'how findings should be reported back',
  source_signal_guidance: 'what the current signals say about this developer\'s practice',
  // ── Everything below is APPENDED (owner-approved wording, 2026-08-25): the section kinds the
  // routing presets plan beyond the planner's own maps. The composer's purpose line reads these;
  // the classifier's relevance menu deliberately does NOT (it keeps the planner's vocabulary
  // above — see the accessor below), so the classifier prompt does not grow. Same register as
  // the fourteen: what the section is FOR, in words a model can act on.
  // Preset kinds planned at every level.
  affected_behavior_tests: 'the tests that cover the behaviour being touched',
  affected_surface: 'the screens, files or endpoints the change will touch',
  approach_or_steps: 'the steps to carry out the request, in order',
  assumptions_open_questions: 'what is being assumed, and what still needs asking',
  auth_config_boundary: 'which auth and configuration settings are in scope and which are not',
  backup_dry_run: 'the backup and the dry run to do before the real change',
  backward_compatibility_boundary: 'what older clients or data must keep working',
  baseline_current_metric: 'the current measurement, taken before anything changes',
  baseline_current_output_proof: 'proof of what the code produces today, captured before the change',
  baseline_metric_state: 'the current numbers the change will be judged against',
  behavioral_assertion: 'the behaviour a test must assert, stated as an observable outcome',
  behavioral_coverage: 'which behaviours the tests cover, and which they miss',
  boundary_map: 'where the change starts and stops, and what sits just outside it',
  call_path_boundary: 'the call path being changed, and the callers that must stay unaffected',
  changelog_breaking_change_state: 'whether this is a breaking change, and what the changelog must say',
  code_diff_target: 'exactly which code the diff should touch',
  compatibility: 'what must stay compatible across versions, clients or platforms',
  config_diff_or_evidence: 'the configuration difference, or the evidence that there is one',
  confirmation_need: 'what needs the developer\'s go-ahead before it is done',
  contract_matrix_testing: 'how each side of the contract gets tested against the other',
  contract_test_expectation: 'what the contract tests are expected to prove',
  contracts_data_flow: 'the contracts and the data flow between the pieces involved',
  current_behavior: 'what the code does today, before any change',
  current_new_versions: 'the versions in use now and the versions being moved to',
  current_test_weakness: 'where the existing tests are weak or missing',
  data_integrity_verification: 'how data integrity will be checked after the change',
  data_schema_source_of_truth: 'which schema or data store is the source of truth',
  data_shape_change: 'how the shape of the data changes, and what depends on the old shape',
  dependency_order: 'which pieces depend on which, and the order that follows',
  desired_extension: 'what the code should do after the extension that it does not do now',
  docs_config_alignment: 'keeping docs and configuration in step with the change',
  evidence_preservation: 'the evidence to keep intact while investigating',
  evidence_request: 'the specific evidence to ask for before going further',
  exact_steps_request: 'a request for the exact steps that lead to the problem',
  expected_actual_state: 'what was expected against what actually happens',
  fit_gap_checklist: 'where the proposed approach fits the need, and where it falls short',
  fixture_mock_context: 'the fixtures and mocks the tests rely on, and what they stand in for',
  fixture_mock_quality: 'whether the fixtures and mocks are realistic enough to trust',
  hypothesis_isolation: 'the hypotheses to test, one at a time, and how to isolate each',
  impact_severity: 'how bad the problem is, and who it affects',
  incremental_steps: 'the small steps to take, each one checkable on its own',
  intended_work_preservation: 'the work already intended or in progress that must not be lost',
  interfaces_modules: 'the interfaces and modules involved, and how they connect',
  isolation_hypothesis: 'the single hypothesis to isolate first, and how',
  last_known_good_current_behavior: 'the last state that worked, against what happens now',
  migration_order: 'the order the migration steps must run in',
  mitigation_boundary: 'what the mitigation covers, and what it deliberately leaves alone',
  narrow_fix_boundary: 'the smallest fix that addresses the problem, and nothing beyond it',
  no_secret_leakage: 'making sure no secret ends up in code, logs or output',
  non_secret_config_names: 'which configuration names are safe to mention, without their values',
  one_module_layer_at_a_time: 'changing one module or layer at a time, and checking between',
  pass_fail_comparison: 'what passes and what fails, compared side by side',
  pre_change_snapshot_baseline: 'a snapshot of the current state to keep before changing anything',
  problem_statement: 'what is going wrong, stated plainly',
  profiling_measurement_path: 'how the performance will be measured, and where',
  recent_change: 'what changed recently that could have caused this',
  reference_search: 'where to look for existing examples or references before building',
  regression_risk: 'what could break elsewhere because of this change',
  repeatability_attempts: 'how many times the problem was reproduced, and how reliably',
  request_response_sample: 'a sample request and response that shows the behaviour',
  request_response_schema: 'the shape of the request and the response',
  residual_risk: 'the risk that remains after the change',
  review_scope: 'what the review covers',
  review_target_scope: 'exactly what is under review, and what is not',
  risk_statement: 'the risk, stated plainly',
  rollback_recovery: 'how to roll back, and how to recover if the rollback fails',
  rollout_steps: 'the steps to roll the change out safely',
  scope_non_goals: 'what is in scope, and what is deliberately not',
  security_surface: 'the security-sensitive surface the change touches',
  smallest_hot_path_change: 'the smallest change to the hot path that could help',
  smallest_repro_request: 'a request for the smallest case that still reproduces the problem',
  source_of_truth_state: 'which source is authoritative, and its current state',
  stable_fixtures: 'the fixtures that must stay stable for the tests to mean anything',
  stack_trace_or_error_state: 'the stack trace or error output that shows the failure',
  status_schema_contract: 'the status values and schema the contract guarantees',
  supported_clients_versions_platforms: 'which clients, versions and platforms must be supported',
  system_boundaries: 'where this system starts and stops, and what it touches',
  target_artifact: 'the exact artifact the work should produce',
  task_order_dependencies: 'which tasks depend on which, and the order that follows',
  test_command_output: 'the exact test command and what it printed',
  test_target: 'exactly what the tests should target',
  threat_input_auth_secret_data_checks: 'the checks for untrusted input, auth, secrets and sensitive data',
  tradeoffs: 'the trade-offs between the options, stated plainly',
  triggering_input_state: 'the input or state that triggers the problem',
  unused_code_proof: 'proof that the code being removed is genuinely unused',
  user_journey_screen_state: 'the user journey and the screen state where the problem appears',
  version_environment_contrast: 'the difference between the versions or environments involved',
  workload_or_bottleneck_evidence: 'evidence of where the load goes or where it bottlenecks',
  workload_or_input_size: 'the size of the workload or input that matters here',
  // Preset kinds planned at the thorough level.
  alternatives: 'the alternatives considered, and why this one',
  approval_checkpoint: 'the point where approval is needed before continuing',
  assertion_gap_check: 'which assertions are missing from the tests',
  assertion_quality_check: 'whether the assertions actually test the behaviour that matters',
  assertion_quality_review: 'a review of how meaningful the test assertions are',
  baseline_tests: 'the tests to run before the change, to know the starting point',
  before_after_expectation: 'what is expected before the change and after it',
  before_after_measurement: 'the measurement taken before and after the change',
  before_after_verification: 'checking the result against the state captured before the change',
  blocked_decisions: 'the decisions that are blocked, and what unblocks them',
  callsite_matrix: 'every call site affected, laid out so none is missed',
  change_isolation: 'keeping the change isolated so its effect can be seen on its own',
  checklist_focus: 'the checklist items that matter most for this change',
  client_impact_review: 'how the change affects the clients that depend on it',
  compatibility_matrix: 'which combinations of versions, clients or platforms must work together',
  config_matrix: 'the configuration combinations that must be checked',
  configuration_contract_check: 'checking that the configuration still meets its contract',
  contract_matrix_tests: 'the tests that cover each side of the contract',
  contract_test_plan: 'how the contract will be tested',
  coupling_interface_review: 'reviewing how tightly the pieces are coupled through their interfaces',
  cutover_validation: 'how the switch-over will be validated before it is final',
  data_integrity_checks: 'the checks that prove the data is still intact',
  decision_criteria: 'the criteria the decision will be made on',
  deeper_checks: 'the further checks worth doing beyond the basics',
  definition_of_done: 'what has to be true for this to count as done',
  dependency_risk_review: 'the risks the dependencies bring in',
  dependency_security_check: 'checking the dependencies for known security problems',
  docs_drift_check: 'checking whether the docs have drifted from the code',
  edge_case_fit: 'whether the approach still fits at the edge cases',
  edge_cases: 'the edge cases to handle',
  environment_reproduction_matrix: 'the environments the problem should be reproduced in',
  evidence_capture_list: 'the evidence to capture, listed so nothing is lost',
  exception_path_verification: 'checking the error and exception paths, not just the happy path',
  expand_migrate_contract: 'expanding first, migrating, then contracting, so nothing breaks mid-way',
  feature_flag_plan: 'how a feature flag will control the change',
  fix_boundary: 'where the fix stops',
  fixture_coupling_review: 'reviewing how tightly the tests are coupled to their fixtures',
  fixture_stability_review: 'reviewing whether the fixtures are stable enough to trust',
  hot_path_isolation: 'isolating the hot path so its cost can be seen on its own',
  hypothesis_order: 'the order to test the hypotheses in, most likely first',
  incident_regression_checks: 'the checks that stop this incident from coming back',
  incident_response_notes: 'the notes from responding to the incident',
  integration_checkpoint: 'the point where the pieces are checked together',
  integration_regression_checks: 'the checks that the pieces still work together',
  interaction_state_matrix: 'the states and interactions that must be covered',
  layout_regression_checks: 'the checks that the layout has not regressed',
  load_profile_notes: 'what the load looks like, and when it peaks',
  local_ci_repeat_matrix: 'repeating the check locally and in CI, across the combinations that matter',
  manual_browser_checks: 'the checks to do by hand in a browser',
  measurement_plan_review: 'a review of how the improvement will be measured',
  migration_notes: 'the notes anyone running the migration needs',
  migration_rehearsal: 'rehearsing the migration before the real run',
  milestone_size: 'how big each milestone should be',
  module_sequence_plan: 'the order to work through the modules in',
  nearby_behavior_checks: 'checking the behaviour next to the change, not just the change itself',
  nearby_regression_checks: 'checking that nearby behaviour has not regressed',
  no_feature_change_boundary: 'a boundary that keeps this from becoming a feature change',
  no_unrelated_change_boundary: 'a boundary that keeps unrelated changes out',
  non_secret_validation_steps: 'validation steps that never expose a secret',
  observable_outcome: 'the outcome that can be observed, to know it worked',
  per_path_test_plan: 'a test plan for each path through the code',
  performance_regression_guard: 'the guard that catches a performance regression',
  pin_path: 'pinning the version or path before relying on it',
  post_change_monitoring: 'what to watch after the change goes in',
  post_cleanup_regression: 'checking for regressions after the cleanup',
  postmortem_followup: 'the follow-ups from the post-mortem',
  race_isolation_plan: 'how to isolate the race condition so it can be seen',
  reader_handoff_notes: 'the notes the next reader needs to pick this up',
  regression_guard: 'the guard that catches a regression',
  regression_notes: 'notes on the regressions to watch for',
  regression_value: 'the value the regression check protects',
  release_readiness_checks: 'the checks that say the release is ready',
  relevant_suite_rerun: 'rerunning the test suites that are relevant to the change',
  remediation_options: 'the ways the problem could be fixed, laid out to choose from',
  removal_boundary: 'where the removal stops',
  repeated_verification_matrix: 'repeating the verification across the combinations that matter',
  repro_reduction_plan: 'how to shrink the reproduction to its smallest form',
  requirement_mapping: 'how each requirement maps to the work',
  restore_service_plan: 'how service will be restored if things go wrong',
  retry_rate_limit_notes: 'notes on retries and rate limits',
  risk_review: 'a review of the risks',
  risk_summary: 'the risks, summarised',
  rollback_drill: 'practising the rollback before it is needed',
  rollback_test_plan: 'how the rollback will be tested',
  schema_diff_review: 'a review of the schema difference',
  stabilization_boundary: 'where stabilisation stops and new work begins',
  stakeholder_context: 'who is affected, and what they need',
  stop_before_fix_instruction: 'an instruction to stop and report before fixing anything',
  suggested_changes: 'the changes being suggested',
  suggested_fixes: 'the fixes being suggested',
  targeted_checks: 'the checks aimed at this specific change',
  targeted_regression_tests: 'the regression tests aimed at this specific change',
  targeted_rerun: 'rerunning just the tests that target this change',
  test_gap_review: 'a review of the gaps in the tests',
  versioning_risk: 'the risk that versioning brings',
  vertical_slice_boundaries: 'the boundaries of each vertical slice',
};

/**
 * How many leading keys form the CLASSIFIER's relevance vocabulary — the planner's own kinds, in
 * the planner's order. The keys after them are preset kinds the composer needs purpose text for;
 * offering them to the classifier would grow its prompt for no ranking benefit.
 */
const RELEVANCE_VOCABULARY_SIZE = 14;

/** The vocabulary offered to the model, in the planner's own order. */
export function promptEnhancementRelevanceSectionKindsV1(): readonly string[] {
  return Object.keys(SECTION_PURPOSE_V1).slice(0, RELEVANCE_VOCABULARY_SIZE);
}

/** What a section kind is FOR, in words — for every kind the pipeline can plan. */
export function promptEnhancementSectionPurposeV1(kind: string): string | undefined {
  return SECTION_PURPOSE_V1[kind];
}

/** One prompt line per kind: the id the reply must use, and what it is for. */
export function promptEnhancementRelevanceMenuLinesV1(): readonly string[] {
  return promptEnhancementRelevanceSectionKindsV1()
    .map((kind) => `- ${kind} — ${SECTION_PURPOSE_V1[kind] ?? ''}`.trimEnd());
}

/** Narrow one raw entry. An unknown kind is DROPPED, never guessed at and never invented. */
export function isPromptEnhancementRelevanceSectionKindV1(value: unknown): value is string {
  // Narrowed to the vocabulary the model was OFFERED, not every key with purpose text — a
  // preset kind the menu never listed is not a ranking the model could have been asked for.
  return typeof value === 'string' && promptEnhancementRelevanceSectionKindsV1().includes(value);
}

/**
 * Normalise a raw ordering: known kinds only, first occurrence wins, order preserved.
 *
 * ⚠️ Duplicates are dropped rather than rejected. The observation is a RANKING — a model that names
 * the same kind twice has still told us where it ranks it, and discarding the whole reply over a
 * repeat would throw away a usable ordering for a formatting slip.
 */
export function normalizePromptEnhancementRelevanceOrderV1(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (!isPromptEnhancementRelevanceSectionKindV1(entry) || seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out;
}
