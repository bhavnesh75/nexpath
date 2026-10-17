import { describe, it, expect } from 'vitest';
import {
  createPeActionLoopState,
  buildPeActionRequest,
  applyPeActionResponse,
  type PeActionLoopState,
  type PeValidBody,
} from './pe-action-loop.js';

const initialBody: PeValidBody = { currentBodyId: 'body-1', bodyRevision: 1, bodyText: 'the original body' };

function freshState(): PeActionLoopState {
  return createPeActionLoopState(initialBody);
}

describe('createPeActionLoopState', () => {
  it('starts idle with no in-flight request and the seeded body', () => {
    const state = freshState();
    expect(state).toEqual({ lockState: 'idle', inFlightRequestId: null, lastValidBody: initialBody });
  });
});

describe('buildPeActionRequest — the 3 directional types', () => {
  for (const actionType of ['shorter', 'more_thorough', 'more_project_grounded'] as const) {
    it(`${actionType}: sends canonical ids, never dirty textarea text — no editedBodyText field at all`, () => {
      const out = buildPeActionRequest({
        requestId: 'req-1',
        actionType,
        loopState: freshState(),
        hasDirtyBodyEdit: true, // even when dirty, must not appear on the request
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.request.currentBodyId).toBe('body-1');
      expect(out.request.bodyRevision).toBe(1);
      expect(out.request.editedBodyText).toBeUndefined();
      expect(out.request.additionalDetailsText).toBeUndefined();
    });
  }

  it('shows action loading state — lockState transitions to locked_action_loading on the returned nextState', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'shorter',
      loopState: freshState(),
      hasDirtyBodyEdit: false,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.nextState.lockState).toBe('locked_action_loading');
    expect(out.nextState.inFlightRequestId).toBe('req-1');
  });

  it('keeps the previous valid body available on nextState while the request is pending', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'shorter',
      loopState: freshState(),
      hasDirtyBodyEdit: false,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.nextState.lastValidBody).toEqual(initialBody);
  });

  it('always sets actionRequestLockState to locked_action_loading on the request itself, explicitly', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'more_thorough',
      loopState: freshState(),
      hasDirtyBodyEdit: false,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.request.actionRequestLockState).toBe('locked_action_loading');
  });

  it('dirty edit + directional action: dirtyDraftDisposition=discarded_for_canonical_action, carried explicitly', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'more_project_grounded',
      loopState: freshState(),
      hasDirtyBodyEdit: true,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.request.dirtyDraftDisposition).toBe('discarded_for_canonical_action');
  });

  it('clean body + directional action: dirtyDraftDisposition=not_applicable, still carried explicitly (never omitted)', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'shorter',
      loopState: freshState(),
      hasDirtyBodyEdit: false,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.request.dirtyDraftDisposition).toBe('not_applicable');
    expect('dirtyDraftDisposition' in out.request).toBe(true);
  });
});

describe('buildPeActionRequest — apply_details, the only path carrying edited body + details', () => {
  it('accepts and carries both editedBodyText and additionalDetailsText', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'apply_details',
      loopState: freshState(),
      hasDirtyBodyEdit: false,
      editedBodyText: 'the visible edited body',
      additionalDetailsText: 'extra requirements',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.request.editedBodyText).toBe('the visible edited body');
    expect(out.request.additionalDetailsText).toBe('extra requirements');
  });

  it('rejects when editedBodyText is missing', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'apply_details',
      loopState: freshState(),
      hasDirtyBodyEdit: false,
      additionalDetailsText: 'extra requirements',
    });
    expect(out.ok).toBe(false);
  });

  it('rejects when editedBodyText is present but blank/whitespace-only', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'apply_details',
      loopState: freshState(),
      hasDirtyBodyEdit: false,
      editedBodyText: '   ',
      additionalDetailsText: 'extra requirements',
    });
    expect(out.ok).toBe(false);
  });

  it('rejects when additionalDetailsText is missing', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'apply_details',
      loopState: freshState(),
      hasDirtyBodyEdit: false,
      editedBodyText: 'the visible edited body',
    });
    expect(out.ok).toBe(false);
  });

  it('rejects when additionalDetailsText is present but blank/whitespace-only', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'apply_details',
      loopState: freshState(),
      hasDirtyBodyEdit: false,
      editedBodyText: 'the visible edited body',
      additionalDetailsText: '   ',
    });
    expect(out.ok).toBe(false);
  });

  it('rejects when editedBodyText is present but the wrong type (a number, not a string)', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'apply_details',
      loopState: freshState(),
      hasDirtyBodyEdit: false,
      editedBodyText: 12345 as unknown as string,
      additionalDetailsText: 'extra requirements',
    });
    expect(out.ok).toBe(false);
  });

  it('rejects when additionalDetailsText is present but the wrong type (a number, not a string)', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'apply_details',
      loopState: freshState(),
      hasDirtyBodyEdit: false,
      editedBodyText: 'the visible edited body',
      additionalDetailsText: 67890 as unknown as string,
    });
    expect(out.ok).toBe(false);
  });

  it('directional actions never carry editedBodyText/additionalDetailsText even when supplied by the caller (structurally impossible to leak)', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'shorter',
      loopState: freshState(),
      hasDirtyBodyEdit: false,
      editedBodyText: 'should never appear',
      additionalDetailsText: 'should never appear either',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.request.editedBodyText).toBeUndefined();
    expect(out.request.additionalDetailsText).toBeUndefined();
  });
});

describe('buildPeActionRequest — duplicate send intent rejected', () => {
  it('refuses a second request while one is already locked/in-flight', () => {
    const first = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'shorter',
      loopState: freshState(),
      hasDirtyBodyEdit: false,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = buildPeActionRequest({
      requestId: 'req-2',
      actionType: 'more_thorough',
      loopState: first.nextState,
      hasDirtyBodyEdit: false,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reasonCodes).toContain('duplicate_send_intent_rejected_action_in_flight');
  });
});

describe('applyPeActionResponse — validated replacement only', () => {
  it('replaces the body on a matching accepted_result response', () => {
    const built = buildPeActionRequest({ requestId: 'req-1', actionType: 'shorter', loopState: freshState(), hasDirtyBodyEdit: false });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const applied = applyPeActionResponse(built.nextState, {
      requestId: 'req-1',
      outcome: 'accepted_result',
      currentBodyId: 'body-2',
      bodyRevision: 2,
      bodyText: 'the shortened body',
    });
    expect(applied.accepted).toBe(true);
    expect(applied.nextState.lastValidBody).toEqual({ currentBodyId: 'body-2', bodyRevision: 2, bodyText: 'the shortened body' });
    expect(applied.nextState.lockState).toBe('idle');
    expect(applied.nextState.inFlightRequestId).toBeNull();
  });

  it('rejects a malformed "accepted_result" (missing bodyText) and keeps the previous valid body', () => {
    const built = buildPeActionRequest({ requestId: 'req-1', actionType: 'shorter', loopState: freshState(), hasDirtyBodyEdit: false });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const applied = applyPeActionResponse(built.nextState, {
      requestId: 'req-1',
      outcome: 'accepted_result',
      currentBodyId: 'body-2',
      bodyRevision: 2,
      // bodyText omitted — malformed
    });
    expect(applied.accepted).toBe(false);
    expect(applied.nextState.lastValidBody).toEqual(initialBody);
    expect(applied.nextState.lockState).toBe('idle'); // still unlocks, just doesn't accept the body
  });

  const validAcceptedFields = { currentBodyId: 'body-2', bodyRevision: 2, bodyText: 'the shortened body' };

  it('rejects when currentBodyId is missing', () => {
    const built = buildPeActionRequest({ requestId: 'req-1', actionType: 'shorter', loopState: freshState(), hasDirtyBodyEdit: false });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const { currentBodyId: _omit, ...rest } = validAcceptedFields;
    const applied = applyPeActionResponse(built.nextState, { requestId: 'req-1', outcome: 'accepted_result', ...rest });
    expect(applied.accepted).toBe(false);
    expect(applied.reasonCodes).toContain('malformed_accepted_result_rejected');
    expect(applied.nextState.lastValidBody).toEqual(initialBody);
  });

  it('rejects when currentBodyId is present but an empty string', () => {
    const built = buildPeActionRequest({ requestId: 'req-1', actionType: 'shorter', loopState: freshState(), hasDirtyBodyEdit: false });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const applied = applyPeActionResponse(built.nextState, { requestId: 'req-1', outcome: 'accepted_result', ...validAcceptedFields, currentBodyId: '' });
    expect(applied.accepted).toBe(false);
    expect(applied.nextState.lastValidBody).toEqual(initialBody);
  });

  it('rejects when bodyRevision is missing', () => {
    const built = buildPeActionRequest({ requestId: 'req-1', actionType: 'shorter', loopState: freshState(), hasDirtyBodyEdit: false });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const { bodyRevision: _omit, ...rest } = validAcceptedFields;
    const applied = applyPeActionResponse(built.nextState, { requestId: 'req-1', outcome: 'accepted_result', ...rest });
    expect(applied.accepted).toBe(false);
    expect(applied.nextState.lastValidBody).toEqual(initialBody);
  });

  it('rejects when bodyRevision is present but the wrong type (a string, not a number)', () => {
    const built = buildPeActionRequest({ requestId: 'req-1', actionType: 'shorter', loopState: freshState(), hasDirtyBodyEdit: false });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const applied = applyPeActionResponse(built.nextState, {
      requestId: 'req-1',
      outcome: 'accepted_result',
      ...validAcceptedFields,
      bodyRevision: '2' as unknown as number,
    });
    expect(applied.accepted).toBe(false);
    expect(applied.nextState.lastValidBody).toEqual(initialBody);
  });
});

describe('the full loop: multiple round trips use the latest canonical state, not the original', () => {
  it('a second request built after an accepted response uses the NEW canonical currentBodyId/bodyRevision', () => {
    const firstReq = buildPeActionRequest({ requestId: 'req-1', actionType: 'shorter', loopState: freshState(), hasDirtyBodyEdit: false });
    expect(firstReq.ok).toBe(true);
    if (!firstReq.ok) return;
    expect(firstReq.request.currentBodyId).toBe('body-1');
    expect(firstReq.request.bodyRevision).toBe(1);

    const accepted = applyPeActionResponse(firstReq.nextState, {
      requestId: 'req-1', outcome: 'accepted_result', currentBodyId: 'body-2', bodyRevision: 2, bodyText: 'the shortened body',
    });
    expect(accepted.accepted).toBe(true);

    const secondReq = buildPeActionRequest({ requestId: 'req-2', actionType: 'more_thorough', loopState: accepted.nextState, hasDirtyBodyEdit: false });
    expect(secondReq.ok).toBe(true);
    if (!secondReq.ok) return;
    // Must use body-2/rev-2 (the just-accepted body) — NOT the original body-1/rev-1.
    expect(secondReq.request.currentBodyId).toBe('body-2');
    expect(secondReq.request.bodyRevision).toBe(2);
  });
});

describe('applyPeActionResponse — previous valid body survives failure/timeout/over_budget/fallback', () => {
  for (const outcome of ['rejected', 'timeout', 'over_budget', 'fallback'] as const) {
    it(`${outcome}: unlocks the loop but leaves lastValidBody untouched`, () => {
      const built = buildPeActionRequest({ requestId: 'req-1', actionType: 'more_thorough', loopState: freshState(), hasDirtyBodyEdit: false });
      expect(built.ok).toBe(true);
      if (!built.ok) return;
      const applied = applyPeActionResponse(built.nextState, { requestId: 'req-1', outcome });
      expect(applied.accepted).toBe(false);
      expect(applied.reasonCodes).toContain(outcome);
      expect(applied.nextState.lastValidBody).toEqual(initialBody);
      expect(applied.nextState.lockState).toBe('idle');
    });
  }
});

describe('applyPeActionResponse — stale/superseded results never overwrite a newer body (negative fixture)', () => {
  it('a response for an OLD requestId is ignored entirely once a newer request has superseded it', () => {
    const firstReq = buildPeActionRequest({ requestId: 'req-1', actionType: 'shorter', loopState: freshState(), hasDirtyBodyEdit: false });
    expect(firstReq.ok).toBe(true);
    if (!firstReq.ok) return;

    // The first request's response never arrives in time; instead the user fires a second
    // request. (In practice buildPeActionRequest would reject this while locked — this fixture
    // simulates the loop already having unlocked via an unrelated path, e.g. a timeout, to
    // isolate the specific guarantee: a LATE response for req-1 must never land after that.)
    const timedOut = applyPeActionResponse(firstReq.nextState, { requestId: 'req-1', outcome: 'timeout' });
    const secondReq = buildPeActionRequest({ requestId: 'req-2', actionType: 'more_thorough', loopState: timedOut.nextState, hasDirtyBodyEdit: false });
    expect(secondReq.ok).toBe(true);
    if (!secondReq.ok) return;

    // The stale req-1 response FINALLY arrives, after req-2 is already in flight.
    const staleResult = applyPeActionResponse(secondReq.nextState, {
      requestId: 'req-1',
      outcome: 'accepted_result',
      currentBodyId: 'stale-body',
      bodyRevision: 99,
      bodyText: 'this must never appear',
    });
    expect(staleResult.accepted).toBe(false);
    expect(staleResult.reasonCodes).toContain('stale_or_superseded_response_ignored');
    // req-2 is still the in-flight request — untouched by the stale req-1 response.
    expect(staleResult.nextState).toEqual(secondReq.nextState);
    expect(staleResult.nextState.lastValidBody).toEqual(initialBody);
  });

  it('a duplicate response for an already-settled requestId is ignored, not double-applied', () => {
    const built = buildPeActionRequest({ requestId: 'req-1', actionType: 'shorter', loopState: freshState(), hasDirtyBodyEdit: false });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const firstApply = applyPeActionResponse(built.nextState, {
      requestId: 'req-1', outcome: 'accepted_result', currentBodyId: 'body-2', bodyRevision: 2, bodyText: 'shortened',
    });
    expect(firstApply.accepted).toBe(true);
    // The same response arrives again (duplicate delivery) after the loop already unlocked.
    const secondApply = applyPeActionResponse(firstApply.nextState, {
      requestId: 'req-1', outcome: 'accepted_result', currentBodyId: 'body-3', bodyRevision: 3, bodyText: 'should not apply',
    });
    expect(secondApply.accepted).toBe(false);
    expect(secondApply.nextState.lastValidBody).toEqual(firstApply.nextState.lastValidBody);
  });
});

describe('no extension-side prompt rewriting — structural proof', () => {
  it('applyPeActionResponse never transforms bodyText; it is passed through verbatim', () => {
    const built = buildPeActionRequest({ requestId: 'req-1', actionType: 'shorter', loopState: freshState(), hasDirtyBodyEdit: false });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const verbatimText = 'EXACT_MARKER_TEXT_9f3a — must appear byte-identical, never rewritten';
    const applied = applyPeActionResponse(built.nextState, {
      requestId: 'req-1', outcome: 'accepted_result', currentBodyId: 'body-2', bodyRevision: 2, bodyText: verbatimText,
    });
    expect(applied.nextState.lastValidBody.bodyText).toBe(verbatimText);
  });

  it('buildPeActionRequest never transforms editedBodyText/additionalDetailsText for apply_details; passed through verbatim', () => {
    const bodyMarker = 'EXACT_BODY_MARKER_1a2b';
    const detailsMarker = 'EXACT_DETAILS_MARKER_3c4d';
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'apply_details',
      loopState: freshState(),
      hasDirtyBodyEdit: false,
      editedBodyText: bodyMarker,
      additionalDetailsText: detailsMarker,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.request.editedBodyText).toBe(bodyMarker);
    expect(out.request.additionalDetailsText).toBe(detailsMarker);
  });
});

/**
 * The removal request.
 *
 * ⛔ Nothing here performs a cut, and nothing here could: this package cannot
 * import the engine's section rules, so what a number MEANS is decided by the
 * side that owns them. These tests are about the request being well-formed and
 * refused when it is not — the two things this side is actually responsible for.
 */
describe('buildPeActionRequest — remove_section', () => {
  it('carries the number the reader named, with the canonical body it was read from', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'remove_section',
      loopState: freshState(),
      hasDirtyBodyEdit: false,
      sectionNumber: 2,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.request.actionType).toBe('remove_section');
    expect(out.request.sectionNumber).toBe(2);
    // The number is only trustworthy against the body it was read from, so both travel.
    expect(out.request.currentBodyId).toBe('body-1');
    expect(out.request.bodyRevision).toBe(1);
  });

  it('never carries body text — a cut is decided from the canonical body, not a draft', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1',
      actionType: 'remove_section',
      loopState: freshState(),
      hasDirtyBodyEdit: true,
      sectionNumber: 1,
      editedBodyText: 'a dirty draft that must not travel',
      additionalDetailsText: 'nor this',
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.request.editedBodyText).toBeUndefined();
    expect(out.request.additionalDetailsText).toBeUndefined();
  });

  it('says a dirty draft was discarded, like every other canonical action', () => {
    const out = buildPeActionRequest({
      requestId: 'req-1', actionType: 'remove_section', loopState: freshState(),
      hasDirtyBodyEdit: true, sectionNumber: 1,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.request.dirtyDraftDisposition).toBe('discarded_for_canonical_action');
  });

  it('locks the loop, so a second click cannot overlap the first', () => {
    const first = buildPeActionRequest({
      requestId: 'req-1', actionType: 'remove_section', loopState: freshState(),
      hasDirtyBodyEdit: false, sectionNumber: 1,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = buildPeActionRequest({
      requestId: 'req-2', actionType: 'remove_section', loopState: first.nextState,
      hasDirtyBodyEdit: false, sectionNumber: 2,
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reasonCodes).toContain('duplicate_send_intent_rejected_action_in_flight');
  });

  /**
   * Whether a number names an actual part is the far side's refusal to make. Whether
   * it is a number at all is knowable here, so it is refused here rather than sent.
   */
  for (const [label, sectionNumber] of [
    ['absent', undefined],
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['not a number', '2' as unknown as number],
  ] as const) {
    it(`refuses a number that is ${label}`, () => {
      const out = buildPeActionRequest({
        requestId: 'req-1', actionType: 'remove_section', loopState: freshState(),
        hasDirtyBodyEdit: false,
        ...(sectionNumber === undefined ? {} : { sectionNumber }),
      });
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.reasonCodes).toContain('remove_section_requires_a_positive_whole_number');
    });
  }

  it('leaves the other request types alone — none of them gains a number', () => {
    for (const actionType of ['shorter', 'more_thorough', 'more_project_grounded'] as const) {
      const out = buildPeActionRequest({
        requestId: 'req-1', actionType, loopState: freshState(), hasDirtyBodyEdit: false,
        sectionNumber: 3, // offered, and must be ignored
      });
      expect(out.ok).toBe(true);
      if (!out.ok) return;
      expect(out.request.sectionNumber, actionType).toBeUndefined();
    }
  });
});
