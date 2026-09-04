// The WORK half of the no-invention rule — the MID band's supply side.
//
// 🔴 MEASURED, Session A (`2026-08-26_00-42-22_Pc1_sim-s12.log`, 8 bodies, 36 labelled lines).
// Invented NAMES collapsed over this milestone — 1.3 → 0.125 violations per body — but the middle
// band rose, 0.7 → 0.75/0.875, and it was the only number that moved the wrong way. Every line in it
// obeyed the noun rule perfectly and still enlarged the job:
//
//   · "Gather feedback from the classmate … to ensure satisfaction"  (prompt: a button overlaps)
//   · "the system logs these actions appropriately"                  (prompt: where are uploads kept)
//   · "Document the results to showcase the deployment's success"    (prompt: how do I deploy)
//
// Hiren's ruling is the shape of the fix: *"never the harmful things … but some of those things that
// fall in between of harmful → natural craft … those middle things can sometime irritate users."*
// Adding work is the middle. Sequencing and verifying the developer's OWN ask is the craft.
//
// ⛔ Rollback and recovery stay allowed on purpose. They are the risk section's own job, and a rule
// that silenced them would trade an irritation for a safety gap.
import { describe, it, expect } from 'vitest';
import { SLOT_OBLIGATION_DIRECTIVES_V1 } from './section-obligation-directives.js';

const directive = SLOT_OBLIGATION_DIRECTIVES_V1.no_invention_state;

describe('no_invention_state covers work, not only names', () => {
  it('still carries the NAME half unchanged', () => {
    // The half that was already working stays exactly as it was — this addition is additive.
    expect(directive).toContain('name only tools, libraries, services, files, APIs or project facts');
    expect(directive).toContain('never supply an example name');
  });

  it('states the work rule POSITIVELY, with nothing to echo', () => {
    // 🔴 The shape is the fix. The first version enumerated the banned work — "no extra approvals,
    // sign-offs, feedback rounds, user testing, documentation or logging steps" — and a model
    // repeated that list into a shipped body. A positive rule gives it nothing to repeat.
    expect(directive).toContain('every task in the body must be one they asked for');
    expect(directive).toContain('or a direct step toward it');
  });

  it('enumerates NO banned work — the list is what leaked', () => {
    for (const listed of ['sign-offs', 'feedback rounds', 'user testing', 'documentation or logging']) {
      expect(directive, 'still enumerates: ' + listed).not.toContain(listed);
    }
  });

  it('and says nothing that forbids rollback, recovery or verification', () => {
    // The carve-out no longer needs naming: a rule that only requires tasks to be REQUESTED cannot
    // forbid rollback on a deploy, because a deploy prompt asks for the deploy and rollback is a
    // direct step toward doing it safely. Hiren's split on the P38 line — backup stays, the
    // documentation goes — falls out of the positive rule rather than being listed beside it.
    for (const allowed of ['rollback', 'recovery', 'verifying', 'sequencing']) {
      expect(directive.toLowerCase()).not.toContain('no ' + allowed);
    }
  });
});
