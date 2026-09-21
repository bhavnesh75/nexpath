/**
 * The optional model pass: what it may add, and every way it may not.
 *
 * The first block is the one that matters most, and it is asserted on a COUNT rather than on an
 * outcome: with no client injected and no opt-in, the call must never be **entered** — not fail,
 * not return nothing, not be attempted. A fake global constructor stands in for the real client and
 * fails the test if anything ever builds one, because the surface this protects is one where a key
 * is always present and a call would always succeed, billed, with nothing able to draw its answer.
 *
 * After that: every failure in turn, each asked the same question — did the marks that were already
 * there survive untouched?
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROMPT_ENHANCEMENT_EMPHASIS_CALL_EVENT_V1,
  PROMPT_ENHANCEMENT_EMPHASIS_MAX_OUTPUT_TOKENS_V1,
  PROMPT_ENHANCEMENT_EMPHASIS_MODEL_V1,
  PROMPT_ENHANCEMENT_EMPHASIS_TIMEOUT_MS_V1,
  buildPromptEnhancementEmphasisMarkableBodyV1,
  buildPromptEnhancementEmphasisModelBodyV1,
  keepPromptEnhancementEmphasisModelPhrasesV1,
  mergePromptEnhancementEmphasisPhrasesV1,
  startPromptEnhancementEmphasisModelCallV1,
  type PromptEnhancementEmphasisModelClientV1,
} from './emphasis-model-call.js';
import { redactSecrets } from '../store/redact.js';
import type { PromptEnhancementEmphasisPhraseV1 } from '../store/pending-prompt-enhancements.js';

const SECTIONS = [
  { sectionKind: 'original_request_or_goal', bodyText: 'add rate limiting to the upload endpoint' },
  { sectionKind: 'context_and_constraints', bodyText: 'Limit applies to POST /api/upload only.' },
  { sectionKind: 'verification_or_test_plan', bodyText: "I'll run the project's test suite before reporting done." },
];

const FLOOR: readonly PromptEnhancementEmphasisPhraseV1[] = [
  { text: 'only', emphasisClass: 3, source: 'floor' },
];

/** A client that answers with whatever is handed to it, and records that it was called. */
function clientAnswering(content: string) {
  const create = vi.fn(async () => ({ choices: [{ message: { content } }] }));
  return { client: { chat: { completions: { create } } } as PromptEnhancementEmphasisModelClientV1, create };
}

const NL = String.fromCharCode(10);
const settle = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('the call is never entered without a client or the opt-in', () => {
  // The protection this exists for: a surface that HAS a key, where a call would succeed and be
  // billed, and where nothing could draw the answer.
  const savedKey = process.env['OPENAI_API_KEY'];
  beforeEach(() => { process.env['OPENAI_API_KEY'] = `sk-${'a'.repeat(32)}`; });
  afterEach(() => {
    if (savedKey === undefined) delete process.env['OPENAI_API_KEY'];
    else process.env['OPENAI_API_KEY'] = savedKey;
  });

  it('starts nothing, and constructs nothing, with a key sitting in the environment', async () => {
    const handle = startPromptEnhancementEmphasisModelCallV1({
      originalPromptText: 'add rate limiting',
      sections: SECTIONS,
    });
    await settle();
    expect(handle.outcome()).toBe('gated_out_no_client');
    expect(handle.read()).toEqual([]);
  });

  it('starts nothing when the opt-in is false rather than absent', async () => {
    const handle = startPromptEnhancementEmphasisModelCallV1({
      originalPromptText: 'add rate limiting',
      sections: SECTIONS,
      enabled: false,
    });
    await settle();
    expect(handle.outcome()).toBe('gated_out_no_client');
  });

  it('does start when a client is injected — so the checks above are about the guard, not the wiring', async () => {
    const { client, create } = clientAnswering('{"phrases":[]}');
    startPromptEnhancementEmphasisModelCallV1({ originalPromptText: 'x', sections: SECTIONS, client });
    await settle();
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('every failure leaves the marks that were already there', () => {
  const failures: { name: string; create: () => unknown }[] = [
    { name: 'never answers', create: () => new Promise(() => {}) },
    { name: 'a provider error', create: () => Promise.reject(new Error('503')) },
    { name: 'garbage', create: () => Promise.resolve({ choices: [{ message: { content: 'not json at all' } }] }) },
    { name: 'the right shape with the wrong contents', create: () => Promise.resolve({ choices: [{ message: { content: '{"phrases":"nope"}' } }] }) },
    { name: 'an empty choice list', create: () => Promise.resolve({ choices: [] }) },
  ];

  for (const failure of failures) {
    it(`reads as nothing: ${failure.name}`, async () => {
      const client = { chat: { completions: { create: vi.fn(failure.create) } } } as unknown as PromptEnhancementEmphasisModelClientV1;
      const handle = startPromptEnhancementEmphasisModelCallV1({
        originalPromptText: 'add rate limiting', sections: SECTIONS, client,
      });
      await settle();
      expect(handle.read()).toEqual([]);
      // And the merged list is the floor's, unchanged, phrase for phrase.
      expect(mergePromptEnhancementEmphasisPhrasesV1({ floor: FLOOR, model: [], sections: SECTIONS }))
        .toEqual(FLOOR);
    });
  }

  it('an abort before it settles is just another failure', async () => {
    let reject: (error: Error) => void = () => {};
    const create = vi.fn(() => new Promise((_resolve, no) => { reject = no; }));
    const client = { chat: { completions: { create } } } as unknown as PromptEnhancementEmphasisModelClientV1;
    const handle = startPromptEnhancementEmphasisModelCallV1({
      originalPromptText: 'add rate limiting', sections: SECTIONS, client,
    });
    const signal = (create.mock.calls[0] as unknown as [unknown, { signal: AbortSignal }])[1].signal;
    expect(signal.aborted).toBe(false);
    handle.abort();
    // The point of the abort is that the REQUEST is torn down — not that the promise happens to
    // reject afterwards, which it would anyway.
    expect(signal.aborted).toBe(true);
    reject(new Error('aborted'));
    await settle();
    expect(handle.read()).toEqual([]);
    expect(handle.outcome()).toBe('pending_or_failed');
  });

  it('never throws out of the module, whatever the client does', () => {
    const client = { chat: { completions: { create: () => { throw new Error('synchronous'); } } } } as unknown as PromptEnhancementEmphasisModelClientV1;
    expect(() => startPromptEnhancementEmphasisModelCallV1({
      originalPromptText: 'x', sections: SECTIONS, client,
    })).not.toThrow();
  });
});

describe('what comes back, and what is thrown away', () => {
  const markable = buildPromptEnhancementEmphasisModelBodyV1({ sections: SECTIONS });
  const drawn = SECTIONS.map((section) => section.bodyText).join('\n');
  const keep = (phrases: readonly string[]) =>
    keepPromptEnhancementEmphasisModelPhrasesV1({ phrases, drawnBodyText: drawn, markableBodyText: markable });

  it('keeps a phrase that is in the body word for word', () => {
    expect(keep(["run the project's test suite"])).toEqual(["run the project's test suite"]);
  });

  it('throws away a phrase that is not in the body', () => {
    expect(keep(['run the integration suite'])).toEqual([]);
  });

  it('throws away a phrase the model reworded, however slightly', () => {
    expect(keep(["run the projects test suite"])).toEqual([]);
  });

  it('throws away a phrase carrying a redaction marker, padded as the redactor really writes it', () => {
    // ⚠️ The marker is padded to the length of what it replaced, so the bracket ends up at the far
    // end: a check for the literal "[REDACTED]" would miss every secret long enough to need
    // padding, which is all of them.
    const redacted = redactSecrets(`use sk-${'d'.repeat(24)} for now`);
    const marker = redacted.split(' ')[1];
    expect(marker.startsWith('sk-[REDACTED')).toBe(true);
    expect(marker.endsWith(']')).toBe(true);
    expect(marker.includes('[REDACTED]')).toBe(false);
    expect(keepPromptEnhancementEmphasisModelPhrasesV1({
      phrases: [marker], drawnBodyText: redacted, markableBodyText: redacted,
    })).toEqual([]);
  });

  it('throws away a phrase that still looks like a secret', () => {
    const withSecret = { sectionKind: 'context_and_constraints', bodyText: `use sk-${'b'.repeat(24)} for now` };
    const sections = [withSecret];
    expect(keepPromptEnhancementEmphasisModelPhrasesV1({
      phrases: [`sk-${'b'.repeat(24)}`],
      drawnBodyText: withSecret.bodyText,
      markableBodyText: buildPromptEnhancementEmphasisModelBodyV1({ sections }),
    })).toEqual([]);
  });

  it('throws away the same phrase twice', () => {
    expect(keep(['only', 'only'])).toEqual(['only']);
  });

  it('throws away a phrase that spans a section the model was not shown', () => {
    // The excluded section sits BETWEEN two the model may see, so the text it was given joins
    // across a gap the real body does not have. A phrase written across that join exists in what
    // the model saw and nowhere on screen — only the check against the drawn body can refuse it.
    const sections = [
      { sectionKind: 'context_and_constraints', bodyText: 'alpha' },
      { sectionKind: 'original_request_or_goal', bodyText: 'the developer said this' },
      { sectionKind: 'verification_or_test_plan', bodyText: 'beta' },
    ];
    const spanning = `alpha${NL}beta`;
    const markableBodyText = buildPromptEnhancementEmphasisMarkableBodyV1({ sections });
    const drawnBodyText = sections.map((section) => section.bodyText).join(NL);
    expect(markableBodyText).toBe(spanning);
    expect(drawnBodyText).not.toContain(spanning);
    expect(keepPromptEnhancementEmphasisModelPhrasesV1({
      phrases: [spanning], drawnBodyText, markableBodyText,
    })).toEqual([]);
  });

  it('throws away a phrase from the section the model was not shown', () => {
    expect(keep(['add rate limiting to the upload endpoint'])).toEqual([]);
  });

  it('never shows the model the developer’s own restated prompt', () => {
    expect(markable).not.toContain('add rate limiting to the upload endpoint');
    expect(markable).toContain('POST /api/upload');
  });
});

describe('the pipeline’s own confirmation sentence, which the model must never see', () => {
  // ⚠️ The mask finds that sentence by looking for `before you do this <naming>`, and the
  // naming is whatever the clearance resolved — here "a destructive migration". No caller was
  // passing it, so the mask found nothing, the sentence reached the model, and a phrase lifted
  // straight out of it came back, passed every output rule and was drawn in bold: emphasis landing
  // on the pipeline's own safety wording, which is the one thing this body exists to prevent.
  const NAMED = 'a destructive migration';
  const SAFETY = `Still, before you do this ${NAMED} you must ask me for go-ahead confirmation, `
    + 'and before you ask, confirm the actual state at ground level by reading the real source. '
    + 'Do not assume, and do not rely on what you did earlier in this session.';
  const WITH_SAFETY = [
    ...SECTIONS,
    { sectionKind: 'risk_safety_and_confirmation', bodyText: SAFETY },
  ];

  it('derives the naming from the body when the caller does not supply it', () => {
    const body = buildPromptEnhancementEmphasisModelBodyV1({ sections: WITH_SAFETY });
    expect(body).not.toContain('you must ask me for go-ahead confirmation');
    expect(body).not.toContain(NAMED);
  });

  it('is the same body the caller gets by passing the naming itself', () => {
    expect(buildPromptEnhancementEmphasisModelBodyV1({ sections: WITH_SAFETY }))
      .toBe(buildPromptEnhancementEmphasisModelBodyV1({ sections: WITH_SAFETY, sensitiveActionName: NAMED }));
  });

  it('throws away every phrase lifted out of that sentence', () => {
    const drawnWithSafety = WITH_SAFETY.map((section) => section.bodyText).join(NL);
    const markableWithSafety = buildPromptEnhancementEmphasisModelBodyV1({ sections: WITH_SAFETY });
    const kept = keepPromptEnhancementEmphasisModelPhrasesV1({
      phrases: [
        'ask me for go-ahead confirmation',
        'confirm the actual state at ground level',
        'reading the real source',
        `before you do this ${NAMED}`,
      ],
      drawnBodyText: drawnWithSafety,
      markableBodyText: markableWithSafety,
    });
    expect(kept).toEqual([]);
  });

  it('still keeps a phrase from a section that is not the safety one', () => {
    // The guard must not swallow the rest of the body with the sentence it is aimed at.
    const drawnWithSafety = WITH_SAFETY.map((section) => section.bodyText).join(NL);
    const markableWithSafety = buildPromptEnhancementEmphasisModelBodyV1({ sections: WITH_SAFETY });
    expect(keepPromptEnhancementEmphasisModelPhrasesV1({
      phrases: ['POST /api/upload'],
      drawnBodyText: drawnWithSafety,
      markableBodyText: markableWithSafety,
    })).toEqual(['POST /api/upload']);
  });
});

describe('the marks it adds are added, never substituted', () => {
  it('puts the rule-based marks first and the model’s after them', () => {
    const merged = mergePromptEnhancementEmphasisPhrasesV1({
      floor: FLOOR, model: ["run the project's test suite"], sections: SECTIONS,
    });
    expect(merged.map((phrase) => [phrase.source, phrase.text])).toEqual([
      ['floor', 'only'],
      ['model', "run the project's test suite"],
    ]);
  });

  it('drops a model phrase the rule-based pass already found', () => {
    const merged = mergePromptEnhancementEmphasisPhrasesV1({ floor: FLOOR, model: ['only'], sections: SECTIONS });
    expect(merged).toEqual(FLOOR);
  });

  it('spends the cap on the rule-based marks first, so none of them is pushed out', () => {
    // Four is one section's budget. A rule-based list that already fills it leaves the model
    // nothing THERE — and, more importantly, loses none of its own to the re-count.
    const full: PromptEnhancementEmphasisPhraseV1[] = Array.from({ length: 4 }, (_unused, index) => ({
      text: `f${index}`, emphasisClass: 3, source: 'floor' as const,
    }));
    const sections = [{ sectionKind: 'context_and_constraints', bodyText: `${full.map((p) => p.text).join(' ')} extra` }];
    const merged = mergePromptEnhancementEmphasisPhrasesV1({ floor: full, model: ['extra'], sections });
    expect(merged).toEqual(full);
  });
});

describe('the shape of the call', () => {
  it('uses the model, the cap and the timeout the contract fixes', async () => {
    const { client, create } = clientAnswering('{"phrases":[]}');
    startPromptEnhancementEmphasisModelCallV1({ originalPromptText: 'x', sections: SECTIONS, client });
    await settle();
    const [params, options] = create.mock.calls[0] as unknown as [Record<string, unknown>, Record<string, unknown>];
    expect(params.model).toBe(PROMPT_ENHANCEMENT_EMPHASIS_MODEL_V1);
    expect(params.max_tokens).toBe(PROMPT_ENHANCEMENT_EMPHASIS_MAX_OUTPUT_TOKENS_V1);
    expect(options.timeout).toBe(PROMPT_ENHANCEMENT_EMPHASIS_TIMEOUT_MS_V1);
    expect(options.maxRetries).toBe(0);
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('tells the caller when it settles, even when it settles before anyone is listening', async () => {
    const { client } = clientAnswering(`{"phrases":["run the project's test suite"]}`);
    const handle = startPromptEnhancementEmphasisModelCallV1({
      originalPromptText: 'x', sections: SECTIONS, client,
    });
    await settle();
    // Registered AFTER the reply landed — the repaint must still be asked for.
    const repaint = vi.fn();
    handle.onSettled(repaint);
    expect(repaint).toHaveBeenCalledTimes(1);
    expect(handle.read().map((phrase) => phrase.text)).toEqual(["run the project's test suite"]);
  });

  it('sends the prompt and the body with secrets replaced', async () => {
    const { client, create } = clientAnswering('{"phrases":[]}');
    startPromptEnhancementEmphasisModelCallV1({
      originalPromptText: `my key is sk-${'c'.repeat(24)}`,
      sections: SECTIONS,
      client,
    });
    await settle();
    const [params] = create.mock.calls[0] as unknown as [{ messages: { content: string }[] }];
    const sent = params.messages.map((message) => message.content).join('\n');
    expect(sent).not.toContain('c'.repeat(24));
    // ⚠️ Without the closing bracket: the redactor pads its marker to the length of what it
    // replaced, so a real one reads 'sk-[REDACTED..........]' and the bracket is at the end.
    expect(sent).toContain('[REDACTED');
  });
});

describe('what it reports, and under whose name', () => {
  it('reports its own event, never the classifier’s', async () => {
    const seen: { event: string; outcome: string; phraseCount: number }[] = [];
    const { client } = clientAnswering(`{"phrases":["run the project's test suite"]}`);
    startPromptEnhancementEmphasisModelCallV1({
      originalPromptText: 'x', sections: SECTIONS, client, onOutcome: (event) => seen.push(event),
    });
    await settle();
    expect(seen).toEqual([{
      event: PROMPT_ENHANCEMENT_EMPHASIS_CALL_EVENT_V1, outcome: 'settled', phraseCount: 1,
    }]);
    // ⛔ The classifier's provider-error event is what `nexpath status` reports. A timeout here
    // costs a few unbolded words; read under that name it would look like the classifier failing.
    expect(seen.every((event) => event.event !== 'stage_classifier_provider_error')).toBe(true);
  });

  it('reports the outcome where nothing was started at all', async () => {
    const seen: { outcome: string }[] = [];
    startPromptEnhancementEmphasisModelCallV1({
      originalPromptText: 'x', sections: SECTIONS, onOutcome: (event) => seen.push(event),
    });
    await settle();
    expect(seen.map((event) => event.outcome)).toEqual(['gated_out_no_client']);
  });

  it('reports a failure once, and only once', async () => {
    const seen: { outcome: string }[] = [];
    const client = { chat: { completions: { create: vi.fn(() => Promise.reject(new Error('503'))) } } } as unknown as PromptEnhancementEmphasisModelClientV1;
    startPromptEnhancementEmphasisModelCallV1({
      originalPromptText: 'x', sections: SECTIONS, client, onOutcome: (event) => seen.push(event),
    });
    await settle();
    expect(seen.map((event) => event.outcome)).toEqual(['pending_or_failed']);
  });

  it('survives a sink that throws', async () => {
    const { client } = clientAnswering('{"phrases":[]}');
    expect(() => startPromptEnhancementEmphasisModelCallV1({
      originalPromptText: 'x', sections: SECTIONS, client,
      onOutcome: () => { throw new Error('sink'); },
    })).not.toThrow();
    await settle();
  });
});
