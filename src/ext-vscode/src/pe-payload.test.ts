import { describe, it, expect } from 'vitest';
import { parsePromptEnhancementExtensionPayloadV1 } from './pe-payload.js';

function rawResult(overrides: Record<string, unknown> = {}): string {
  const base = {
    enhancementId: 'enh-1',
    validationDecisionId: 'vd-1',
    uiView: {
      body: {
        text: 'the enhanced prompt body',
        currentBodyId: 'body-1',
        bodyRevision: 3,
        sendPolicy: 'send_current',
        fallbackMode: 'none',
        actionLoadingState: 'idle',
      },
      actions: [
        { actionType: 'shorter', actionId: 'a-shorter', label: 'Shorter', availability: 'available' },
        { actionType: 'more_thorough', actionId: 'a-thorough', label: 'More thorough', availability: 'disabled_loading' },
        { actionType: 'more_project_grounded', actionId: 'a-grounded', label: 'More project-grounded', availability: 'available' },
        { actionType: 'apply_details', actionId: 'a-details', label: 'Apply details', availability: 'available' },
        { actionType: 'close', actionId: 'a-close', label: 'Close', availability: 'available' },
        { actionType: 'use_current_body', actionId: 'a-use', label: 'Use this prompt', availability: 'available' },
      ],
    },
    ...overrides,
  };
  return JSON.stringify(base);
}

describe('parsePromptEnhancementExtensionPayloadV1', () => {
  it('parses a well-formed result into the extension payload envelope', () => {
    const out = parsePromptEnhancementExtensionPayloadV1(rawResult());
    expect(out).toEqual({
      transportVersion: 1,
      enhancementId: 'enh-1',
      validationDecisionId: 'vd-1',
      currentBodyId: 'body-1',
      bodyRevision: 3,
      currentBodyText: 'the enhanced prompt body',
      sendPolicy: 'send_current',
      renderState: 'ready',
      additionalDetailsAvailable: true,
      directionalActions: [
        { actionType: 'shorter', actionId: 'a-shorter', label: 'Shorter', available: true },
        { actionType: 'more_thorough', actionId: 'a-thorough', label: 'More thorough', available: false },
        { actionType: 'more_project_grounded', actionId: 'a-grounded', label: 'More project-grounded', available: true },
      ],
      closeActionId: 'a-close',
    });
  });

  it('returns null for invalid JSON', () => {
    expect(parsePromptEnhancementExtensionPayloadV1('{not json')).toBeNull();
  });

  for (const field of ['enhancementId', 'validationDecisionId']) {
    it(`returns null when ${field} is missing`, () => {
      const raw = JSON.parse(rawResult());
      delete raw[field];
      expect(parsePromptEnhancementExtensionPayloadV1(JSON.stringify(raw))).toBeNull();
    });

    it(`returns null when ${field} is a non-string truthy value (proves a real typeof check, not just truthiness)`, () => {
      const raw = JSON.parse(rawResult());
      raw[field] = 12345;
      expect(parsePromptEnhancementExtensionPayloadV1(JSON.stringify(raw))).toBeNull();
    });

    it(`returns null when ${field} is an empty string (proves the separate length check, not just typeof)`, () => {
      const raw = JSON.parse(rawResult());
      raw[field] = '';
      expect(parsePromptEnhancementExtensionPayloadV1(JSON.stringify(raw))).toBeNull();
    });
  }

  it('returns null when uiView is missing', () => {
    const raw = JSON.parse(rawResult());
    delete raw.uiView;
    expect(parsePromptEnhancementExtensionPayloadV1(JSON.stringify(raw))).toBeNull();
  });

  it('returns null when body is missing', () => {
    const raw = JSON.parse(rawResult());
    delete raw.uiView.body;
    expect(parsePromptEnhancementExtensionPayloadV1(JSON.stringify(raw))).toBeNull();
  });

  it('returns null when sendPolicy is not one of the known values', () => {
    expect(
      parsePromptEnhancementExtensionPayloadV1(
        rawResult({ uiView: { body: { text: 'x', currentBodyId: 'b', bodyRevision: 1, sendPolicy: 'bogus_policy' }, actions: [] } }),
      ),
    ).toBeNull();
  });

  it('returns null when currentBodyId is missing', () => {
    expect(
      parsePromptEnhancementExtensionPayloadV1(
        rawResult({ uiView: { body: { text: 'x', bodyRevision: 1, sendPolicy: 'send_current' }, actions: [] } }),
      ),
    ).toBeNull();
  });

  it('returns null when currentBodyId is a non-string truthy value', () => {
    expect(
      parsePromptEnhancementExtensionPayloadV1(
        rawResult({ uiView: { body: { text: 'x', currentBodyId: 42, bodyRevision: 1, sendPolicy: 'send_current' }, actions: [] } }),
      ),
    ).toBeNull();
  });

  it('returns null when currentBodyId is an empty string', () => {
    expect(
      parsePromptEnhancementExtensionPayloadV1(
        rawResult({ uiView: { body: { text: 'x', currentBodyId: '', bodyRevision: 1, sendPolicy: 'send_current' }, actions: [] } }),
      ),
    ).toBeNull();
  });

  it('returns null when bodyRevision is not a number', () => {
    expect(
      parsePromptEnhancementExtensionPayloadV1(
        rawResult({ uiView: { body: { text: 'x', currentBodyId: 'b', bodyRevision: '3', sendPolicy: 'send_current' }, actions: [] } }),
      ),
    ).toBeNull();
  });

  it('self-scrubs currentBodyText to empty string when sendPolicy is no_send', () => {
    const out = parsePromptEnhancementExtensionPayloadV1(
      rawResult({ uiView: { body: { text: 'SENSITIVE BODY', currentBodyId: 'b', bodyRevision: 1, sendPolicy: 'no_send' }, actions: [] } }),
    );
    expect(out?.currentBodyText).toBe('');
    expect(out?.renderState).toBe('blocked');
  });

  it('self-scrubs currentBodyText to empty string when sendPolicy is no_popup', () => {
    const out = parsePromptEnhancementExtensionPayloadV1(
      rawResult({ uiView: { body: { text: 'SENSITIVE BODY', currentBodyId: 'b', bodyRevision: 1, sendPolicy: 'no_popup' }, actions: [] } }),
    );
    expect(out?.currentBodyText).toBe('');
    expect(out?.renderState).toBe('no_popup');
  });

  it('renderState is loading when actionLoadingState is loading_action', () => {
    const out = parsePromptEnhancementExtensionPayloadV1(
      rawResult({
        uiView: {
          body: { text: 'x', currentBodyId: 'b', bodyRevision: 1, sendPolicy: 'send_current', actionLoadingState: 'loading_action', fallbackMode: 'none' },
          actions: [],
        },
      }),
    );
    expect(out?.renderState).toBe('loading');
  });

  it('renderState is fallback when fallbackMode is neither none nor previous_sendable_body', () => {
    const out = parsePromptEnhancementExtensionPayloadV1(
      rawResult({
        uiView: {
          body: { text: 'x', currentBodyId: 'b', bodyRevision: 1, sendPolicy: 'send_current', fallbackMode: 'deterministic_body', actionLoadingState: 'idle' },
          actions: [],
        },
      }),
    );
    expect(out?.renderState).toBe('fallback');
  });

  it('renderState is ready for previous_sendable_body fallback (treated as normal, not fallback-flagged)', () => {
    const out = parsePromptEnhancementExtensionPayloadV1(
      rawResult({
        uiView: {
          body: { text: 'x', currentBodyId: 'b', bodyRevision: 1, sendPolicy: 'send_current', fallbackMode: 'previous_sendable_body', actionLoadingState: 'idle' },
          actions: [],
        },
      }),
    );
    expect(out?.renderState).toBe('ready');
  });

  it('tolerates a non-array actions field (empty directional set, no crash)', () => {
    const out = parsePromptEnhancementExtensionPayloadV1(
      rawResult({ uiView: { body: { text: 'x', currentBodyId: 'b', bodyRevision: 1, sendPolicy: 'send_current' }, actions: 'not-an-array' } }),
    );
    expect(out?.directionalActions).toEqual([]);
    expect(out?.closeActionId).toBeNull();
    expect(out?.additionalDetailsAvailable).toBe(false);
  });

  it('skips malformed action entries instead of crashing', () => {
    const out = parsePromptEnhancementExtensionPayloadV1(
      rawResult({
        uiView: {
          body: { text: 'x', currentBodyId: 'b', bodyRevision: 1, sendPolicy: 'send_current' },
          actions: [null, 42, { actionType: 'shorter' /* missing actionId/label */ }, { actionType: 'shorter', actionId: 'ok', label: 'Shorter', availability: 'available' }],
        },
      }),
    );
    expect(out?.directionalActions).toEqual([
      { actionType: 'shorter', actionId: 'ok', label: 'Shorter', available: true },
    ]);
  });

  it('ignores unknown action types (not use_current_body/use_original/feedback/etc. in the directional set)', () => {
    const out = parsePromptEnhancementExtensionPayloadV1(
      rawResult({
        uiView: {
          body: { text: 'x', currentBodyId: 'b', bodyRevision: 1, sendPolicy: 'send_current' },
          actions: [{ actionType: 'use_original', actionId: 'a', label: 'Use original', availability: 'available' }],
        },
      }),
    );
    expect(out?.directionalActions).toEqual([]);
  });

  it('closeActionId is null when no close action is present', () => {
    const out = parsePromptEnhancementExtensionPayloadV1(
      rawResult({ uiView: { body: { text: 'x', currentBodyId: 'b', bodyRevision: 1, sendPolicy: 'send_current' }, actions: [] } }),
    );
    expect(out?.closeActionId).toBeNull();
  });
});

describe('the body sections the view numbers', () => {
  const BODY = [
    'Add a login page.',
    '',
    'Scope:',
    'the login route only.',
    '',
    'Acceptance:',
    'the password is hashed.',
  ].join('\n');
  /** A result carrying the composed sections, as `result_json` does. */
  const withSections = (
    sections: unknown,
    bodyOverrides: Record<string, unknown> = {},
  ): string => rawResult({
    currentBody: { sections },
    uiView: {
      body: {
        text: BODY,
        currentBodyId: 'body-1',
        bodyRevision: 3,
        sendPolicy: 'send_current',
        fallbackMode: 'none',
        actionLoadingState: 'idle',
        ...bodyOverrides,
      },
      actions: [],
    },
  });
  const SECTIONS = [
    { sectionId: 's1', sectionKind: 'context_and_constraints', title: 'Scope', bodyText: 'the login route only.' },
    { sectionId: 's2', sectionKind: 'acceptance_or_output_expectation', title: 'Acceptance', bodyText: 'the password is hashed.' },
  ];

  it('numbers the sections 1..N in body order', () => {
    const out = parsePromptEnhancementExtensionPayloadV1(withSections(SECTIONS));
    expect(out?.sections).toEqual([
      { number: 1, title: 'Scope' },
      { number: 2, title: 'Acceptance' },
    ]);
  });

  it('projects the title and the number and nothing else — no ids, no kinds, no body text', () => {
    const out = parsePromptEnhancementExtensionPayloadV1(withSections(SECTIONS));
    for (const section of out!.sections!) {
      expect(Object.keys(section).sort()).toEqual(['number', 'title']);
    }
    expect(JSON.stringify(out!.sections)).not.toContain('sectionId');
    expect(JSON.stringify(out!.sections)).not.toContain('sectionKind');
  });

  it('never puts a number into the body text', () => {
    const out = parsePromptEnhancementExtensionPayloadV1(withSections(SECTIONS));
    expect(out?.currentBodyText).toBe(BODY);
    expect(out?.currentBodyText).not.toContain('#');
  });

  it('omits the field entirely when the result carries no sections', () => {
    expect(parsePromptEnhancementExtensionPayloadV1(rawResult())).not.toHaveProperty('sections');
  });

  it('gives no number to a title that is not a line of the body, and keeps the rest contiguous', () => {
    const out = parsePromptEnhancementExtensionPayloadV1(withSections([
      { title: 'Nowhere', bodyText: 'x' },
      ...SECTIONS,
    ]));
    // `Nowhere:` is not in the body, so it is skipped and numbering does not
    // leave a hole — the CLI's own rule for a title it cannot find.
    expect(out?.sections).toEqual([
      { number: 1, title: 'Scope' },
      { number: 2, title: 'Acceptance' },
    ]);
  });

  it('matches a title LINE, not a mention of the words inside the prose', () => {
    const body = ['Scope is discussed below.', '', 'Acceptance:', 'the password is hashed.'].join('\n');
    const out = parsePromptEnhancementExtensionPayloadV1(withSections(SECTIONS, { text: body }));
    // "Scope" appears, but never as `Scope:` on its own line.
    expect(out?.sections).toEqual([{ number: 1, title: 'Acceptance' }]);
  });

  it('ignores trailing spaces on a title line, as the CLI does', () => {
    const body = ['Scope:   ', 'the login route only.'].join('\n');
    const out = parsePromptEnhancementExtensionPayloadV1(withSections([SECTIONS[0]!], { text: body }));
    expect(out?.sections).toEqual([{ number: 1, title: 'Scope' }]);
  });

  describe('titles are matched in order, the way the CLI matches them', () => {
    it('a duplicated title maps one line to one section, never both to the same line', () => {
      const body = ['Scope:', 'the login route only.'].join('\n');
      const out = parsePromptEnhancementExtensionPayloadV1(withSections(
        [{ title: 'Scope' }, { title: 'Scope' }],
        { text: body },
      ));
      // Only ONE `Scope:` line exists, so only one section can claim it.
      expect(out?.sections).toEqual([{ number: 1, title: 'Scope' }]);
    });

    it('two lines for a duplicated title give two numbers', () => {
      const body = ['Scope:', 'a', '', 'Scope:', 'b'].join('\n');
      const out = parsePromptEnhancementExtensionPayloadV1(withSections(
        [{ title: 'Scope' }, { title: 'Scope' }],
        { text: body },
      ));
      expect(out?.sections).toEqual([
        { number: 1, title: 'Scope' },
        { number: 2, title: 'Scope' },
      ]);
    });

    it('a title that appears only ABOVE the section before it is not found', () => {
      // The body has `Acceptance:` before `Scope:`, but the sections are listed
      // Scope then Acceptance. The search never goes backwards, so Acceptance
      // has no line left after Scope's — exactly what the CLI reports.
      const body = ['Acceptance:', 'the password is hashed.', '', 'Scope:', 'the login route only.'].join('\n');
      const out = parsePromptEnhancementExtensionPayloadV1(withSections(
        [{ title: 'Scope' }, { title: 'Acceptance' }],
        { text: body },
      ));
      expect(out?.sections).toEqual([{ number: 1, title: 'Scope' }]);
    });
  });

  describe('never throws, whatever the shape', () => {
    const MALFORMED: ReadonlyArray<[string, unknown]> = [
      ['sections is a string', 'Scope'],
      ['sections is an object', { Scope: 1 }],
      ['sections is null', null],
      ['sections is an empty array', []],
      ['an entry is null', [null]],
      ['an entry is a string', ['Scope']],
      ['an entry has no title', [{ sectionId: 's1' }]],
      ['a title is not a string', [{ title: 7 }]],
      ['a title is empty', [{ title: '' }]],
    ];
    for (const [name, sections] of MALFORMED) {
      it(`${name} — the field is absent, and the rest of the payload survives`, () => {
        const out = parsePromptEnhancementExtensionPayloadV1(withSections(sections));
        expect(out).not.toBeNull();
        expect(out).not.toHaveProperty('sections');
        expect(out?.currentBodyText).toBe(BODY);
      });
    }

    it('currentBody itself being junk is the same absence', () => {
      for (const currentBody of ['x', 7, null, []]) {
        const out = parsePromptEnhancementExtensionPayloadV1(rawResult({ currentBody }));
        expect(out).not.toBeNull();
        expect(out).not.toHaveProperty('sections');
      }
    });
  });

  it('a blocked body scrubs its text, so it carries no numbers either', () => {
    const out = parsePromptEnhancementExtensionPayloadV1(
      withSections(SECTIONS, { sendPolicy: 'no_send' }),
    );
    expect(out?.currentBodyText).toBe('');
    expect(out).not.toHaveProperty('sections');
  });
});
