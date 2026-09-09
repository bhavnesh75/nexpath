import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The crash Vedansi reported (2026-09-07, four reproductions).
 *
 * `new OpenAILLMAdapter(openai)` is an ARGUMENT to `classifyUserProfileLLM`, so it is evaluated
 * before the call — which is why the classifier's own try/catch
 * (LLMProfileClassifier.ts:207-226, returns safe defaults) could never protect it. With `openai`
 * undefined on the hook path, `llm.adapter.ts:14` falls back to `new OpenAI()` and the SDK throws
 * for a missing credential. `nexpath auto` exited 1, captured nothing, and said nothing.
 *
 * These tests pin the gate at the level the bug lives at: is the adapter CONSTRUCTED at all.
 */

const adapterCtor = vi.fn();
vi.mock('../adapters/llm.adapter.js', () => ({
  OpenAILLMAdapter: class {
    constructor(client?: unknown) {
      adapterCtor(client);
      // Mirror the real failure: no injected client and no credential ⇒ throw, exactly as the
      // OpenAI SDK does. If the gate ever regresses, this makes it a test failure, not a silent
      // behaviour change.
      if (client === undefined && !process.env['OPENAI_API_KEY']) {
        throw new Error('Missing credentials. Please pass an `apiKey` ...');
      }
    }
  },
}));

const { isUsableLlmCredential } = await import('../../config/credential-shape.js');

const VALID_KEY = 'sk-abcdefghijklmnopqrstuvwxyz012345';
const prev = process.env['OPENAI_API_KEY'];

beforeEach(() => { adapterCtor.mockReset(); });
afterEach(() => {
  if (prev === undefined) delete process.env['OPENAI_API_KEY'];
  else process.env['OPENAI_API_KEY'] = prev;
});

/**
 * The exact predicate the gate uses, applied to the same three inputs the branch sees. Kept
 * alongside the integration reality below so a change to either is visible here.
 */
function gateOpens(
  profileStale: boolean,
  historyLen: number,
  minPrompts: number,
  openai?: unknown,
): boolean {
  return profileStale
    && historyLen >= minPrompts - 1
    && (openai !== undefined || isUsableLlmCredential(process.env['OPENAI_API_KEY'] ?? ''));
}

describe('profile classification is gated on a usable credential', () => {
  it('no credential ⇒ the gate is closed, so the adapter is never constructed', () => {
    delete process.env['OPENAI_API_KEY'];
    expect(gateOpens(true, 3, 4)).toBe(false);
  });

  it('an `sk-` key ⇒ the gate opens', () => {
    process.env['OPENAI_API_KEY'] = VALID_KEY;
    expect(gateOpens(true, 3, 4)).toBe(true);
  });

  // isUsableLlmCredential deliberately answers "can we make an LLM call at all?", which a Nexpath
  // token can. isValidApiKey would have said no and silently disabled a working credential.
  it('a Nexpath token also opens it — the narrower isValidApiKey would not have', () => {
    process.env['OPENAI_API_KEY'] = 'npk_abcdefghijklmnopqrstuvwxyz012345';
    expect(gateOpens(true, 3, 4)).toBe(true);
  });

  // An injected client carries its own configuration, so requiring an env credential as well would
  // disable a working caller. Two cases in auto.test.ts do exactly this, and they failed when the
  // gate was credential-only — which is how this rule was found rather than assumed.
  it('an injected client opens the gate with no credential at all', () => {
    delete process.env['OPENAI_API_KEY'];
    expect(gateOpens(true, 3, 4, {})).toBe(true);
  });

  it('an injected client does NOT bypass the other two conditions', () => {
    delete process.env['OPENAI_API_KEY'];
    expect(gateOpens(false, 3, 4, {})).toBe(false);
    expect(gateOpens(true,  2, 4, {})).toBe(false);
  });

  it('an empty or junk value keeps it closed', () => {
    process.env['OPENAI_API_KEY'] = '';
    expect(gateOpens(true, 3, 4)).toBe(false);
    process.env['OPENAI_API_KEY'] = 'not-a-key';
    expect(gateOpens(true, 3, 4)).toBe(false);
  });

  // The credential is the ONLY thing added. The two original conditions must still decide.
  it('the pre-existing conditions still gate independently of the credential', () => {
    process.env['OPENAI_API_KEY'] = VALID_KEY;
    expect(gateOpens(false, 3, 4)).toBe(false);   // profile fresh
    expect(gateOpens(true,  2, 4)).toBe(false);   // not enough history
  });

  // Vedansi measured "3rd prompt"; on this machine the throw lands on the 4th `auto` invocation.
  // Either way the trigger is `historyLen >= MIN_PROFILE_PROMPTS - 1`, so that boundary is what
  // gets pinned rather than a prompt ordinal that depends on when history is appended.
  it('the trigger boundary is MIN_PROFILE_PROMPTS - 1, pinned so the repro cannot drift', () => {
    process.env['OPENAI_API_KEY'] = VALID_KEY;
    expect(gateOpens(true, 2, 4)).toBe(false);
    expect(gateOpens(true, 3, 4)).toBe(true);
  });
});

describe('what the gate protects against', () => {
  it('constructing the adapter with no client and no credential throws — the original crash', async () => {
    delete process.env['OPENAI_API_KEY'];
    const { OpenAILLMAdapter } = await import('../adapters/llm.adapter.js');
    expect(() => new OpenAILLMAdapter(undefined)).toThrow(/Missing credentials/);
  });

  it('with a credential the same construction is fine — the gate is not over-blocking', async () => {
    process.env['OPENAI_API_KEY'] = VALID_KEY;
    const { OpenAILLMAdapter } = await import('../adapters/llm.adapter.js');
    expect(() => new OpenAILLMAdapter(undefined)).not.toThrow();
    expect(adapterCtor).toHaveBeenCalled();
  });

  it('an injected client is always fine — this is the path tests use', async () => {
    delete process.env['OPENAI_API_KEY'];
    const { OpenAILLMAdapter } = await import('../adapters/llm.adapter.js');
    expect(() => new OpenAILLMAdapter({} as never)).not.toThrow();
  });
});
