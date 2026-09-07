import { describe, it, expect, vi } from 'vitest';

// The token store is reached only through `installAction`, never by the prompt
// itself — but the prompt module imports it, and an unmocked import would drag
// `cross-keychain` into this file for no reason.
vi.mock('../../config/NexpathTokenStore.js', async () => {
  const shape = await import('../../config/credential-shape.js');
  return {
    storeNexpathToken:   vi.fn(),
    removeNexpathToken:  vi.fn(),
    isValidNexpathToken: shape.isValidNexpathToken,
  };
});

import {
  buildDefaultInstallPrompts,
  type ApiKeyPromptContext,
  type DefaultInstallPromptDeps,
} from './install.js';
import {
  CREDENTIAL_OPTIONS,
  CREDENTIAL_PROMPT_TITLE,
  CREDENTIAL_KEY_WINS_NOTICE,
  CREDENTIAL_TOKEN_HELP_LINES,
  NEXPATH_SIGNUP_URL,
  buildCredentialTokenHelpLines,
  buildCredentialOptionLines,
  credentialInputMessage,
} from '../shared/credential-description.js';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const KEY   = 'sk-abcdefghij1234567890ABCDEFGHIJ';
const TOKEN = `npk_${'a'.repeat(43)}`;
const KEYCHAIN = 'macOS Keychain';

function ctx(over: Partial<ApiKeyPromptContext> = {}): ApiKeyPromptContext {
  return {
    hasEnvKey: false,
    hasStoredKey: false,
    hasStoredToken: false,
    keychainName: KEYCHAIN,
    ...over,
  };
}

/**
 * Drive the default prompt with stubs. Records what it asked for, so a test can
 * assert the ORDER of the questions as well as the answer it produced.
 */
function harness(deps: Partial<DefaultInstallPromptDeps> & {
  answer?: string | null;
} = {}) {
  const calls: string[] = [];
  const logged: string[] = [];
  let seenMessage = '';
  let seenValidate: ((v: string) => string | undefined) | null = null;

  // ⚠️ The recording wraps the stub rather than replacing it, so a test that
  // supplies its own answer still shows up in `calls`. Written the other way
  // round once, and the order assertions silently saw an empty list.
  const envStub    = deps.envConfirmFn ?? (async () => false);
  const choiceStub = deps.choiceFn     ?? (async () => 'openai_key' as const);
  const pwStub     = deps.credentialPasswordFn
    ?? (async () => (deps.answer === undefined ? KEY : deps.answer));

  const prompts = buildDefaultInstallPrompts({
    envConfirmFn: async () => { calls.push('env'); return envStub(); },
    choiceFn:     async () => { calls.push('choice'); return choiceStub(); },
    credentialPasswordFn: async (message, validate) => {
      calls.push('password');
      seenMessage = message;
      seenValidate = validate;
      return pwStub(message, validate);
    },
    log: (line) => { logged.push(line); },
  });

  return {
    prompts,
    calls,
    logged,
    message: () => seenMessage,
    validate: () => seenValidate!,
  };
}

// ── The credential branch ────────────────────────────────────────────────────

describe('default install prompt — which credential, and what comes back', () => {
  it('the OpenAI branch returns new_key', async () => {
    const h = harness({ answer: KEY });
    await expect(h.prompts.apiKeyPrompt(ctx())).resolves.toEqual({ kind: 'new_key', value: KEY });
  });

  it('the token branch returns nexpath_token', async () => {
    const h = harness({ choiceFn: async () => 'nexpath_token', answer: TOKEN });
    await expect(h.prompts.apiKeyPrompt(ctx())).resolves.toEqual({ kind: 'nexpath_token', value: TOKEN });
  });

  it('an empty answer with nothing stored is a skip, for either credential', async () => {
    for (const choice of ['openai_key', 'nexpath_token'] as const) {
      const h = harness({ choiceFn: async () => choice, answer: '' });
      await expect(h.prompts.apiKeyPrompt(ctx())).resolves.toEqual({ kind: 'skip' });
    }
  });

  it('an empty answer with that credential stored keeps it', async () => {
    const key = harness({ answer: '' });
    await expect(key.prompts.apiKeyPrompt(ctx({ hasStoredKey: true })))
      .resolves.toEqual({ kind: 'keep_existing' });

    const token = harness({ choiceFn: async () => 'nexpath_token', answer: '' });
    await expect(token.prompts.apiKeyPrompt(ctx({ hasStoredToken: true })))
      .resolves.toEqual({ kind: 'keep_existing' });
  });

  // ⚠️ The two "stored" flags are per-credential. An empty answer must not keep
  // a credential of the OTHER kind.
  it('a stored KEY does not make an empty TOKEN answer a keep', async () => {
    const h = harness({ choiceFn: async () => 'nexpath_token', answer: '' });
    await expect(h.prompts.apiKeyPrompt(ctx({ hasStoredKey: true })))
      .resolves.toEqual({ kind: 'skip' });
  });

  it('cancelling the input cancels the install', async () => {
    const h = harness({ answer: null });
    await expect(h.prompts.apiKeyPrompt(ctx())).resolves.toEqual({ kind: 'cancel' });
  });

  it('cancelling the choice cancels the install, and never asks for a value', async () => {
    const h = harness({ choiceFn: async () => null });
    await expect(h.prompts.apiKeyPrompt(ctx())).resolves.toEqual({ kind: 'cancel' });
    expect(h.calls).not.toContain('password');
  });
});

// ── R3: the environment key comes first ──────────────────────────────────────

describe('default install prompt — R3, the environment key is offered first', () => {
  it('accepting the env key short-circuits: no choice, no input', async () => {
    const h = harness({ envConfirmFn: async () => true });
    await expect(h.prompts.apiKeyPrompt(ctx({ hasEnvKey: true })))
      .resolves.toEqual({ kind: 'use_env' });
    expect(h.calls).toEqual(['env']);
  });

  it('declining the env key falls through to the choice, in that order', async () => {
    const h = harness({ envConfirmFn: async () => false, answer: KEY });
    await h.prompts.apiKeyPrompt(ctx({ hasEnvKey: true }));
    expect(h.calls).toEqual(['env', 'choice', 'password']);
  });

  it('cancelling the env confirm cancels the install', async () => {
    const h = harness({ envConfirmFn: async () => null });
    await expect(h.prompts.apiKeyPrompt(ctx({ hasEnvKey: true })))
      .resolves.toEqual({ kind: 'cancel' });
  });

  it('with no env key the confirm is never shown', async () => {
    const h = harness({ answer: KEY });
    await h.prompts.apiKeyPrompt(ctx());
    expect(h.calls).toEqual(['choice', 'password']);
  });
});

// ── R4: the token input is the key input, with different words ───────────────

describe('default install prompt — R4, the two inputs have the same shape', () => {
  it('the key input names the keychain, and offers "keep existing" only when one is stored', async () => {
    const cases = [
      { stored: false, expect: `API Key (will be stored in ${KEYCHAIN}):` },
      { stored: true,  expect: `API Key (Enter to keep existing key stored in ${KEYCHAIN}):` },
    ];
    for (const c of cases) {
      const h = harness({ choiceFn: async () => 'openai_key', answer: '' });
      await h.prompts.apiKeyPrompt(ctx({ hasStoredKey: c.stored }));
      expect(h.message()).toBe(c.expect);
    }
  });

  // The token field is deliberately bare. It used to carry the key half's
  // parenthetical, which put a long aside about a keystroke in front of a field
  // where most people are pasting something for the first time.
  it('the token input is just the field, stored or not', async () => {
    for (const stored of [false, true]) {
      const h = harness({ choiceFn: async () => 'nexpath_token', answer: '' });
      await h.prompts.apiKeyPrompt(ctx({ hasStoredToken: stored }));
      expect(h.message()).toBe('Paste token here:');
    }
  });

  it('tells the token user where to get one, before asking for it', async () => {
    const h = harness({ choiceFn: async () => 'nexpath_token', answer: TOKEN });
    await h.prompts.apiKeyPrompt(ctx());
    const shown = h.logged.join('\n');
    expect(shown).toContain(NEXPATH_SIGNUP_URL);
    for (const line of CREDENTIAL_TOKEN_HELP_LINES) expect(shown).toContain(line);
  });

  // It sits between the chosen option and the field it is about, so it has to
  // be drawn on the picker's own gutter. Printed bare, it breaks the vertical
  // rule running down the install and reads as output that escaped.
  it('draws the help on the frame, not as loose output', async () => {
    const h = harness({ choiceFn: async () => 'nexpath_token', answer: TOKEN });
    await h.prompts.apiKeyPrompt(ctx());
    expect(h.logged.length).toBeGreaterThan(0);
    // Colour codes are stripped first: the gutter is cyan in production, and
    // whether picocolors is active here depends on the runner's TTY detection,
    // not on anything this test is about.
    const bare = (line: string) => line.replace(/\[[0-9;]*m/g, '');
    for (const line of h.logged) expect(bare(line).startsWith('│')).toBe(true);
  });

  it('does not show that help when the OpenAI key was chosen', async () => {
    const h = harness({ choiceFn: async () => 'openai_key', answer: KEY });
    await h.prompts.apiKeyPrompt(ctx());
    expect(h.logged.join('\n')).not.toContain(NEXPATH_SIGNUP_URL);
  });

  it('the OpenAI branch rejects anything that is not an OpenAI key', async () => {
    const h = harness({ answer: KEY });
    await h.prompts.apiKeyPrompt(ctx());
    const v = h.validate();
    expect(v(KEY)).toBeUndefined();
    expect(v(TOKEN)).toBe('Invalid OpenAI API key format (expected sk-...)');
    expect(v('')).toBe('Invalid OpenAI API key format (expected sk-...)');
  });

  it('the token branch rejects anything that is not a Nexpath token', async () => {
    const h = harness({ choiceFn: async () => 'nexpath_token', answer: TOKEN });
    await h.prompts.apiKeyPrompt(ctx());
    const v = h.validate();
    expect(v(TOKEN)).toBeUndefined();
    expect(v(KEY)).toBe('Invalid Nexpath token format (expected npk_...)');
    expect(v('npk_short')).toBe('Invalid Nexpath token format (expected npk_...)');
  });

  // The "Enter to keep existing" affordance is the validate accepting empty —
  // without this the message would offer something the input then refuses.
  it('empty passes validation only when that credential is already stored', async () => {
    const stored = harness({ answer: '' });
    await stored.prompts.apiKeyPrompt(ctx({ hasStoredKey: true }));
    expect(stored.validate()('')).toBeUndefined();

    const fresh = harness({ answer: '' });
    await fresh.prompts.apiKeyPrompt(ctx());
    expect(fresh.validate()('')).toBe('Invalid OpenAI API key format (expected sk-...)');
  });
});

// ── R8: the one line of new user-facing copy ─────────────────────────────────

describe('default install prompt — R8, the key-wins notice', () => {
  it('is printed when a token is chosen while a key is stored', async () => {
    const h = harness({ choiceFn: async () => 'nexpath_token', answer: TOKEN });
    await h.prompts.apiKeyPrompt(ctx({ hasStoredKey: true }));
    expect(h.logged).toContain(CREDENTIAL_KEY_WINS_NOTICE);
  });

  // ⚠️ Asserts the notice's ABSENCE, not an empty log: the token branch also
  // prints where to get a token, so "nothing was logged" would now be a test
  // that fails for the wrong reason.
  it('is NOT printed when no key is stored', async () => {
    const h = harness({ choiceFn: async () => 'nexpath_token', answer: TOKEN });
    await h.prompts.apiKeyPrompt(ctx());
    expect(h.logged).not.toContain(CREDENTIAL_KEY_WINS_NOTICE);
  });

  it('is NOT printed when the OpenAI key itself is the choice', async () => {
    const h = harness({ answer: KEY });
    await h.prompts.apiKeyPrompt(ctx({ hasStoredKey: true }));
    expect(h.logged).toEqual([]);
  });
});

// ── The choice seam is real, not just declared ───────────────────────────────

describe('default install prompt — credentialChoicePrompt is a live seam', () => {
  it('an override of the choice alone is what the prompt uses', async () => {
    const base = buildDefaultInstallPrompts({
      envConfirmFn: async () => false,
      credentialPasswordFn: async () => TOKEN,
      log: () => {},
    });
    // Replace ONLY the choice — this is the shape the interface promises callers.
    const overridden = { ...base, credentialChoicePrompt: async () => 'nexpath_token' as const };
    await expect(overridden.apiKeyPrompt(ctx()))
      .resolves.toEqual({ kind: 'nexpath_token', value: TOKEN });
  });
});

// ── The copy module ──────────────────────────────────────────────────────────

describe('credential-description — the copy the picker renders', () => {
  it('lists the OpenAI key first, which is also the default selection', () => {
    expect(CREDENTIAL_OPTIONS.map((o) => o.value)).toEqual(['openai_key', 'nexpath_token']);
    expect(CREDENTIAL_OPTIONS[0].label).toBe('OpenAI API key');
  });

  it('there are exactly two options — the choice is which, never whether', () => {
    expect(CREDENTIAL_OPTIONS).toHaveLength(2);
  });

  it('every option carries its own detail lines, including a link', () => {
    for (const option of CREDENTIAL_OPTIONS) {
      expect(option.detail.length).toBeGreaterThan(0);
      expect(option.detail.some((line) => line.startsWith('https://'))).toBe(true);
    }
    expect(CREDENTIAL_OPTIONS[0].detail.join('\n')).toContain('https://platform.openai.com/api-keys');
    expect(CREDENTIAL_OPTIONS[1].detail.join('\n')).toContain('https://parseos.tech/nexpath/signup');
  });

  it('no option`s detail talks about precedence — that is not a chooser`s question', () => {
    for (const option of CREDENTIAL_OPTIONS) {
      expect(option.detail.join('\n')).not.toContain('always used');
      expect(option.detail.join('\n')).not.toContain('If both are set');
    }
  });

  // Colours are injectable so a spawned window can force ANSI regardless of the
  // parent's detection. Passing identity functions asserts the STRUCTURE
  // without pinning escape codes, which would make the test about picocolors.
  const rowsFor = (index: number) =>
    buildCredentialOptionLines(
      index,
      new Proxy({}, { get: () => (s: string) => s }) as unknown as Parameters<
        typeof buildCredentialOptionLines
      >[1],
    );

  it('frames every line on the gutter', () => {
    for (const line of rowsFor(0)) expect(line.startsWith('│')).toBe(true);
  });

  // The point of the layout: each option's detail sits directly under THAT
  // option, so the reader compares the two where the choice is being made
  // rather than against a heading repeated further down the screen.
  it('puts each option’s detail directly beneath it, indented past the bullet', () => {
    const lines = rowsFor(0).map((l) => l.replace(/^│/, ''));

    const openAiRow = lines.findIndex((l) => l.includes('OpenAI API key'));
    const tokenRow  = lines.findIndex((l) => l.includes('Nexpath token'));
    expect(openAiRow).toBeGreaterThanOrEqual(0);
    expect(tokenRow).toBeGreaterThan(openAiRow);

    // Everything between the two option rows is the first option's detail…
    const between = lines.slice(openAiRow + 1, tokenRow);
    expect(between.map((l) => l.trim())).toEqual([...CREDENTIAL_OPTIONS[0].detail]);
    // …and it is indented further than the option row it belongs to.
    const indent = (l: string) => l.length - l.trimStart().length;
    for (const line of between) expect(indent(line)).toBeGreaterThan(indent(lines[openAiRow]));

    // The second option's detail follows it, and the block ends there.
    expect(
      lines.slice(tokenRow + 1).filter((l) => l.trim() !== '').map((l) => l.trim()),
    ).toEqual([...CREDENTIAL_OPTIONS[1].detail]);
  });

  it('marks the cursor row and only that row', () => {
    const first = rowsFor(0);
    expect(first.find((l) => l.includes('OpenAI API key'))).toContain('●');
    expect(first.find((l) => l.includes('Nexpath token'))).toContain('○');

    const second = rowsFor(1);
    expect(second.find((l) => l.includes('OpenAI API key'))).toContain('○');
    expect(second.find((l) => l.includes('Nexpath token'))).toContain('●');

    // Moving the cursor changes the bullets and nothing else — the detail the
    // reader is comparing must not shift or disappear underneath them.
    const stripBullets = (lines: string[]) => lines.map((l) => l.replace(/[●○]/g, '•'));
    expect(stripBullets(first)).toEqual(stripBullets(second));
  });

  // The picker used to close with "If both are set, your OpenAI key is always
  // used" — true, but it answers a question nobody has while choosing ONE
  // credential. The rule is still stated where it changes what to expect:
  // CREDENTIAL_KEY_WINS_NOTICE, shown only when the token is picked over a
  // stored key.
  it('says nothing about precedence — that belongs where it applies', () => {
    const text = rowsFor(0).join('\n');
    expect(text).not.toContain('always used');
    expect(text).not.toContain('If both are set');
    expect(CREDENTIAL_KEY_WINS_NOTICE).toContain('will be used instead of this token');
  });

  it('the block is exactly the two options and their detail — nothing else', () => {
    const body = rowsFor(0).map((l) => l.replace(/^│/, '').trim()).filter((l) => l !== '');
    expect(body).toEqual([
      `● ${CREDENTIAL_OPTIONS[0].label}`,
      ...CREDENTIAL_OPTIONS[0].detail,
      `○ ${CREDENTIAL_OPTIONS[1].label}`,
      ...CREDENTIAL_OPTIONS[1].detail,
    ]);
  });

  it('credentialInputMessage covers all four states', () => {
    expect(credentialInputMessage('openai_key', 'X', false)).toBe('API Key (will be stored in X):');
    expect(credentialInputMessage('openai_key', 'X', true)).toBe('API Key (Enter to keep existing key stored in X):');
    // The token half ignores both arguments by design.
    expect(credentialInputMessage('nexpath_token', 'X', false)).toBe('Paste token here:');
    expect(credentialInputMessage('nexpath_token', 'X', true)).toBe('Paste token here:');
  });

  it('the framed help opens and closes on a bare gutter line', () => {
    const lines = buildCredentialTokenHelpLines(
      new Proxy({}, { get: () => (v: string) => v }) as unknown as Parameters<
        typeof buildCredentialTokenHelpLines
      >[0],
    );
    expect(lines[0]).toBe('│');
    expect(lines[lines.length - 1]).toBe('│');
    expect(lines.length).toBe(CREDENTIAL_TOKEN_HELP_LINES.length + 2);
    expect(lines.slice(1, -1).map((l) => l.replace(/^│ {2}/, '')))
      .toEqual([...CREDENTIAL_TOKEN_HELP_LINES]);
  });

  it('the token help is a paragraph, not numbered steps, and names the signup URL', () => {
    const text = CREDENTIAL_TOKEN_HELP_LINES.join(' ');
    expect(text).toContain(NEXPATH_SIGNUP_URL);
    expect(text.toLowerCase()).toContain('sign up');
    expect(text).toContain('paste it');
    // No step numbering, and every line short enough for a narrow terminal.
    for (const line of CREDENTIAL_TOKEN_HELP_LINES) {
      expect(line).not.toMatch(/^\s*(\d+[.)]|[-*•])\s/);
      expect(line.length).toBeLessThanOrEqual(78);
    }
  });

  it('the title says what the question is', () => {
    expect(CREDENTIAL_PROMPT_TITLE).toBe('Choose how Nexpath runs');
  });
});
