// The clearance micro-call module: the deterministic gate, the zero-wait handle, the abort
// contract, and the exact-literal parse discipline — all with an injected fake client, no
// live calls. The judgement QUALITY of the real model is the acceptance runner's job.
import { describe, it, expect } from 'vitest';
import {
  startSensitiveActionMicroClearanceV1,
  sensitiveActionMicroClearanceApplicableV1,
  SENSITIVE_ACTION_MICRO_SYSTEM_PROMPT,
  SENSITIVE_ACTION_MICRO_TIMEOUT_MS,
  type SensitiveActionMicroClientV1,
} from './sensitive-action-micro-clearance.js';

const RISKY_PROMPT = 'drop a shadow under the header and remove the extra padding';
const CLEAN_PROMPT = 'center the hero text and make the font slightly larger';

function fakeClient(reply: string | (() => Promise<string>)): {
  client: SensitiveActionMicroClientV1;
  calls: () => number;
  lastOptions: () => { timeout?: number; maxRetries?: number; signal?: AbortSignal } | undefined;
} {
  let calls = 0;
  let lastOptions: { timeout?: number; maxRetries?: number; signal?: AbortSignal } | undefined;
  const client: SensitiveActionMicroClientV1 = {
    chat: {
      completions: {
        async create(_params, options) {
          calls += 1;
          lastOptions = options;
          const content = typeof reply === 'string' ? reply : await reply();
          return { choices: [{ message: { content } }] };
        },
      },
    },
  };
  return { client, calls: () => calls, lastOptions: () => lastOptions };
}

/** Let the started promise's microtasks run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the deterministic gate — no keyword candidate, no call, ever', () => {
  it('a risky-word prompt is applicable; a clean prompt is not; empty text is not', () => {
    expect(sensitiveActionMicroClearanceApplicableV1(RISKY_PROMPT)).toBe(true);
    expect(sensitiveActionMicroClearanceApplicableV1(CLEAN_PROMPT)).toBe(false);
    expect(sensitiveActionMicroClearanceApplicableV1('   ')).toBe(false);
  });

  it('a gated-out prompt never touches the client and reads undefined', async () => {
    const fake = fakeClient('{"sensitive_action_verdict":"not_proposed","sensitive_action_reason":"styling"}');
    const handle = startSensitiveActionMicroClearanceV1(CLEAN_PROMPT, fake.client);
    await settle();
    expect(fake.calls()).toBe(0);
    expect(handle.read()).toBeUndefined();
    handle.abort(); // idempotent no-op on the inert handle
  });
});

describe('the zero-wait handle — read is synchronous, never awaited', () => {
  it('reads undefined before the reply settles and the value after', async () => {
    let release!: (value: string) => void;
    const pending = new Promise<string>((resolve) => { release = resolve; });
    const fake = fakeClient(() => pending);
    const handle = startSensitiveActionMicroClearanceV1(RISKY_PROMPT, fake.client);
    expect(handle.read()).toBeUndefined(); // nothing settled yet — the fail-closed read
    release('{"sensitive_action_verdict":"not_proposed","sensitive_action_reason":"a stated benign reading"}');
    await settle();
    expect(handle.read()).toEqual({ verdict: 'not_proposed', reason: 'a stated benign reading' });
  });

  it('passes the per-call discipline: timeout, maxRetries 0, and an abort signal', async () => {
    const fake = fakeClient('{"sensitive_action_verdict":"proposed"}');
    startSensitiveActionMicroClearanceV1(RISKY_PROMPT, fake.client);
    await settle();
    expect(fake.lastOptions()?.timeout).toBe(SENSITIVE_ACTION_MICRO_TIMEOUT_MS);
    expect(fake.lastOptions()?.maxRetries).toBe(0);
    expect(fake.lastOptions()?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('the abort contract — a pending request is torn down, nothing ever throws out', () => {
  it('abort before settle: read stays undefined and no rejection escapes', async () => {
    const fake = fakeClient(() => new Promise<string>((_, reject) => {
      // Simulate the SDK surfacing the abort as a rejection.
      setTimeout(() => reject(new Error('Request was aborted.')), 5);
    }));
    const handle = startSensitiveActionMicroClearanceV1(RISKY_PROMPT, fake.client);
    handle.abort();
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(handle.read()).toBeUndefined(); // the abandoned verdict is the absent, fail-closed one
  });

  it('a client that throws synchronously-late (provider error) reads undefined', async () => {
    const fake = fakeClient(() => Promise.reject(new Error('provider down')));
    const handle = startSensitiveActionMicroClearanceV1(RISKY_PROMPT, fake.client);
    await settle();
    expect(handle.read()).toBeUndefined();
  });
});

describe('the parse discipline — exact literals, reasonless carried for the downstream void', () => {
  const cases: [string, string, { verdict: string; reason?: string } | undefined][] = [
    ['valid clearance', '{"sensitive_action_verdict":"not_proposed","sensitive_action_reason":"a css term"}', { verdict: 'not_proposed', reason: 'a css term' }],
    ['valid positive', '{"sensitive_action_verdict":"proposed"}', { verdict: 'proposed', reason: undefined }],
    ['fenced json', '```json\n{"sensitive_action_verdict":"proposed"}\n```', { verdict: 'proposed', reason: undefined }],
    ['reasonless negative (void downstream, carried as parsed)', '{"sensitive_action_verdict":"not_proposed","sensitive_action_reason":"  "}', { verdict: 'not_proposed', reason: undefined }],
    ['proposed with a name (captured, consumed by nothing)', '{"sensitive_action_verdict":"proposed","sensitive_action_name":"production deployment"}', { verdict: 'proposed', reason: undefined, name: 'production deployment' }],
    ['junk name shapes read as absent', '{"sensitive_action_verdict":"proposed","sensitive_action_name":"   "}', { verdict: 'proposed', reason: undefined }],
    ['a name never rescues a reasonless negative (still void downstream)', '{"sensitive_action_verdict":"not_proposed","sensitive_action_name":"styling tweak"}', { verdict: 'not_proposed', reason: undefined, name: 'styling tweak' }],
    ['malformed verdict', '{"sensitive_action_verdict":"definitely_fine","sensitive_action_reason":"x"}', undefined],
    ['not json', 'the prompt seems fine to me', undefined],
    ['empty reply', '', undefined],
  ];
  it.each(cases)('%s', async (_name, reply, expected) => {
    const fake = fakeClient(reply);
    const handle = startSensitiveActionMicroClearanceV1(RISKY_PROMPT, fake.client);
    await settle();
    expect(handle.read()).toEqual(expected);
  });
});

describe('the outcome states — gated-out, settled, unusable and failed are distinguishable', () => {
  it('gated-out reads its own state (normal, not a failure)', () => {
    const fake = fakeClient('{}');
    const handle = startSensitiveActionMicroClearanceV1(CLEAN_PROMPT, fake.client);
    expect(handle.outcome()).toBe('gated_out_no_risk_keyword');
  });

  it('a settled usable verdict reports settled', async () => {
    const fake = fakeClient('{"sensitive_action_verdict":"proposed"}');
    const handle = startSensitiveActionMicroClearanceV1(RISKY_PROMPT, fake.client);
    await settle();
    expect(handle.outcome()).toBe('settled');
  });

  it('an unusable reply reports unusable_reply — distinct from a transport failure', async () => {
    const fake = fakeClient('not json at all');
    const handle = startSensitiveActionMicroClearanceV1(RISKY_PROMPT, fake.client);
    await settle();
    expect(handle.outcome()).toBe('unusable_reply');
  });

  it('a rejected call reports pending_or_failed — the state the reliability bound counts', async () => {
    const fake = fakeClient(() => Promise.reject(new Error('provider down')));
    const handle = startSensitiveActionMicroClearanceV1(RISKY_PROMPT, fake.client);
    await settle();
    expect(handle.outcome()).toBe('pending_or_failed');
  });

  it('a still-pending call reads pending_or_failed at the join (the discard case)', () => {
    const fake = fakeClient(() => new Promise<string>(() => {}));
    const handle = startSensitiveActionMicroClearanceV1(RISKY_PROMPT, fake.client);
    expect(handle.outcome()).toBe('pending_or_failed');
    handle.abort();
  });
});

describe('the shipped prompt is pinned — the acceptance-measured text is the deployed text', () => {
  it('carries the imperative rule, the counter-examples, and unsure => proposed', () => {
    expect(SENSITIVE_ACTION_MICRO_SYSTEM_PROMPT).toContain('names a risky action IS a proposal');
    expect(SENSITIVE_ACTION_MICRO_SYSTEM_PROMPT).toContain('npm install the new charting package');
    expect(SENSITIVE_ACTION_MICRO_SYSTEM_PROMPT).toContain('Routine-sounding is NOT the same as not-proposed');
    expect(SENSITIVE_ACTION_MICRO_SYSTEM_PROMPT).toContain('NEVER guess "not_proposed"');
    expect(SENSITIVE_ACTION_MICRO_SYSTEM_PROMPT).toContain('treated as unanswered');
  });

  it('asks for the action name only alongside a proposed verdict, as a bounded noun phrase', () => {
    expect(SENSITIVE_ACTION_MICRO_SYSTEM_PROMPT).toContain('sensitive_action_name');
    expect(SENSITIVE_ACTION_MICRO_SYSTEM_PROMPT).toContain('only with proposed');
    expect(SENSITIVE_ACTION_MICRO_SYSTEM_PROMPT).toContain('2-5 word noun phrase');
  });
});
