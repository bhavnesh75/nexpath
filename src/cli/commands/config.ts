import { password, confirm, isCancel } from '@clack/prompts';
import {
  NonInteractiveTerminalError,
  withInteractiveTerminal,
} from './interactive-terminal.js';
import { openStore, closeStore, DEFAULT_DB_PATH, getConfig, setConfig, deleteConfig } from '../../store/index.js';
// Imported from its own module rather than through the store barrel: `store/index.ts` is not this
// side's file (harshil480 9 · Ashish 5 · hi0001234d 2 · bhavnesh75 1), and re-exporting through it
// bought nothing — `install.ts` already imports this directly.
import { expireSessionsForCredentialChange } from '../../store/session-reset.js';
import { ENV_PROBE_ENABLED_KEY, purgeAllEnvFacts } from '../../store/env-facts.js';
import {
  ConfigValidationError,
  setAdvisoryFrequency,
  setRole,
  setPromptEnhancementPopupCooldown,
  PROMPT_ENHANCEMENT_POPUP_COOLDOWN_KEY,
} from '../shared/config-setters.js';
import { setPromptEnhancementSequenceEnabled } from '../../config/PromptEnhancementConfig.js';
import {
  storeApiKey,
  removeApiKey,
  getKeySource,
  isValidApiKey,
} from '../../config/ApiKeyResolver.js';
import { resolveApiBaseUrl } from '../../config/NexpathTokenStore.js';

export async function configGetAction(key: string, dbPath = DEFAULT_DB_PATH): Promise<void> {
  const store = await openStore(dbPath);
  const value = getConfig(store.db, key);
  closeStore(store);

  if (value === undefined || value === '') {
    console.log(`${key} = (not set)`);
  } else {
    console.log(`${key} = ${value}`);
  }
}

export async function configSetAction(key: string, value: string, dbPath = DEFAULT_DB_PATH): Promise<void> {
  const store = await openStore(dbPath);
  try {
    if (key === 'role' || key.startsWith('role:')) {
      setRole(store, key, value);
    } else if (key === 'advisory_frequency' || key.startsWith('advisory_frequency:')) {
      setAdvisoryFrequency(store, key, value);
    } else if (key === 'prompt_enhancement.sequence.enabled' || key.startsWith('prompt_enhancement.sequence.enabled:')) {
      setPromptEnhancementSequenceEnabled(store, key, value);
    } else if (key === PROMPT_ENHANCEMENT_POPUP_COOLDOWN_KEY || key.startsWith(PROMPT_ENHANCEMENT_POPUP_COOLDOWN_KEY + ':')) {
      setPromptEnhancementPopupCooldown(store, key, value);
    } else {
      setConfig(store, key, value);
      // S6: turning the dev-env probe off purges the stored facts (data-at-rest
      // minimisation), in addition to the read-gate that hides them while off.
      if (key === ENV_PROBE_ENABLED_KEY && value === 'false') {
        purgeAllEnvFacts(store);
      }
    }
  } catch (err) {
    closeStore(store);
    if (err instanceof ConfigValidationError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  closeStore(store);
  console.log(`${key} = ${value}`);
}

export async function configUnsetAction(key: string, dbPath = DEFAULT_DB_PATH): Promise<void> {
  const store = await openStore(dbPath);
  deleteConfig(store, key);
  closeStore(store);
  console.log(`${key} unset`);
}

// ── API key management (Plan #1 Phase 5) ─────────────────────────────────────

export type ApiKeyPasswordFn = () => Promise<string | null>;
export type ApiKeyConfirmFn  = () => Promise<boolean>;

/**
 * What to say when there is no terminal to prompt on.
 *
 * These commands exist to WRITE a credential, so `--yes` is not an answer the way it is for
 * `install` — there is nothing to fall back to. The honest advice is that the resolver reads the
 * environment first, so a caller that cannot prompt does not need this command at all.
 */
const apiKeyTtyAdvice = (command: string): string => [
  `nexpath config ${command} needs an interactive terminal, but stdin or stdout is redirected.`,
  '',
  'Run it directly in a terminal:',
  `  nexpath config ${command}`,
  '',
  'If you cannot use a terminal, you do not need this command: nexpath reads',
  'OPENAI_API_KEY from the environment or a project .env before it looks at the',
  'keychain or the stored file. Setting it there is enough.',
].join('\n');

// Named per command, because the advice tells the user what to re-run and naming the wrong
// command is worse than naming none.
const makeApiKeyPasswordFn = (command: string): ApiKeyPasswordFn => async () => {
  // ⛔ @clack needs a real TTY and dies with a raw ERR_TTY_INIT_FAILED stack before any of our code
  // runs. `install` has wrapped this since 2026-09-04; these commands did not, and the shape they
  // were copied into (token.ts) inherited the gap. Only the TTY failure is translated — every other
  // error is rethrown untouched, so a real bug never becomes a friendly message about terminals.
  const input = await withInteractiveTerminal(
    () => password({
      message:  'OpenAI API Key:',
      validate: (value) => {
        if (!isValidApiKey(value)) return 'Invalid OpenAI API key format (expected sk-...)';
        return undefined;
      },
    }) as Promise<unknown>,
    () => new NonInteractiveTerminalError(apiKeyTtyAdvice(command)),
  );
  if (isCancel(input)) return null;
  return String(input);
};

const defaultApiKeyPasswordFn = makeApiKeyPasswordFn('set-api-key');
const rotateApiKeyPasswordFn  = makeApiKeyPasswordFn('rotate-api-key');

const defaultRotateConfirmFn: ApiKeyConfirmFn = async () => {
  const answer = await withInteractiveTerminal(
    () => confirm({
      message:      'Overwrite the existing API key?',
      initialValue: false,
    }) as Promise<unknown>,
    () => new NonInteractiveTerminalError(apiKeyTtyAdvice('rotate-api-key')),
  );
  return !isCancel(answer) && answer === true;
};

export interface ConfigApiKeyOpts {
  projectRoot?: string;
  passwordFn?:  ApiKeyPasswordFn;
  confirmFn?:   ApiKeyConfirmFn;
  output?:      (line: string) => void;
}

const defaultPrint = (line: string): void => { console.log(line); };

/**
 * End every live session, because the credential just changed.
 *
 * ⛔ SWALLOWS ITS OWN FAILURE, deliberately. Storing or removing a credential is what the user
 * asked for; clearing the session is hygiene that rides along. If the store cannot be opened —
 * a concurrent hook holding the lock is the realistic case — the credential still saved, and
 * saying otherwise would be a lie about the thing the user actually cares about. The next
 * thirty idle minutes end the session anyway.
 */
async function expireSessionsBestEffort(dbPath: string = DEFAULT_DB_PATH): Promise<void> {
  let store: Awaited<ReturnType<typeof openStore>> | null = null;
  try {
    store = await openStore(dbPath);
    expireSessionsForCredentialChange(store);
  } catch {
    /* hygiene only — never fail the credential command over it */
  } finally {
    if (store) {
      try { closeStore(store); } catch { /* ignore */ }
    }
  }
}

export async function configSetApiKeyAction(opts: ConfigApiKeyOpts = {}): Promise<void> {
  const print       = opts.output      ?? defaultPrint;
  const passwordFn  = opts.passwordFn  ?? defaultApiKeyPasswordFn;
  const key = await passwordFn();
  if (key === null || key === '') {
    print('Cancelled — no API key stored.');
    return;
  }
  const result = await storeApiKey(key);
  print(`✓ API key stored in ${result.source}`);

  // The credential just changed, so the session that ran under the old one is over. Ending it
  // here is what stops a stage the local classifier wrote during an outage from outliving the
  // credential that caused it — replacing the key does not reconsider the session on its own.
  //
  // ⛔ BEST-EFFORT, and that is the whole point of the wrapper: storing the credential is the
  // user's intent, clearing a session is hygiene. A locked database must not turn a saved key
  // into a failed command.
  await expireSessionsBestEffort();
}

export async function configRotateApiKeyAction(opts: ConfigApiKeyOpts = {}): Promise<void> {
  const print       = opts.output      ?? defaultPrint;
  const passwordFn  = opts.passwordFn  ?? rotateApiKeyPasswordFn;
  const confirmFn   = opts.confirmFn   ?? defaultRotateConfirmFn;
  const projectRoot = opts.projectRoot ?? process.cwd();

  const currentSource = await getKeySource(projectRoot);
  if (currentSource === 'none') {
    print('Error: No existing API key to rotate. Use `nexpath config set-api-key` to store one first.');
    process.exitCode = 1;
    return;
  }
  // ⚠️ `nexpath_token` means the resolver found NO OpenAI key at any layer and
  // fell through to the token. Without this, a token-only machine was told
  // "Existing API key is stored in nexpath_token" and then offered to overwrite
  // a key that does not exist.
  if (currentSource === 'nexpath_token') {
    print('Error: No existing API key to rotate — a Nexpath token is configured instead.');
    print('Use `nexpath config set-api-key` to store a key, or `nexpath config rotate-token` to replace the token.');
    process.exitCode = 1;
    return;
  }

  print(`Existing API key is stored in ${currentSource}.`);
  const ok = await confirmFn();
  if (!ok) {
    print('Cancelled — existing API key retained.');
    return;
  }

  const key = await passwordFn();
  if (key === null || key === '') {
    print('Cancelled — existing API key retained.');
    return;
  }
  const result = await storeApiKey(key);
  print(`✓ API key rotated; new key stored in ${result.source} (was in ${currentSource})`);

  // Same reason as `set-api-key` above: the credential changed, so the session that ran under
  // the old one is over. Best-effort — a locked database must not fail the command.
  await expireSessionsBestEffort();
}

export async function configShowKeySourceAction(opts: ConfigApiKeyOpts = {}): Promise<void> {
  const print       = opts.output      ?? defaultPrint;
  const projectRoot = opts.projectRoot ?? process.cwd();
  const source      = await getKeySource(projectRoot);
  // "API key source" was accurate while there was one credential. `nexpath_token`
  // is not an API key and not a layer an API key was found in — it is the other
  // credential entirely, so the line has to say what was found, not where a key
  // came from.
  print(`Credential source: ${source}`);
  if (source === 'nexpath_token') {
    // In token mode the base URL decides where the calls actually go, and it is
    // env-overridable — so the value in effect is worth stating, not inferring.
    print(`Service: ${resolveApiBaseUrl()}`);
  }
}

export async function configRemoveApiKeyAction(opts: ConfigApiKeyOpts = {}): Promise<void> {
  const print       = opts.output      ?? defaultPrint;
  const projectRoot = opts.projectRoot ?? process.cwd();
  const sourceBefore = await getKeySource(projectRoot);
  await removeApiKey();
  if (sourceBefore === 'none') {
    print('No API key was stored.');
  } else {
    print(`✓ API key removed (was in ${sourceBefore}).`);
  }

  // Removal is a credential change too — arguably the sharpest one, since what follows
  // runs with no key at all and every classification degrades. Best-effort, as above.
  await expireSessionsBestEffort();
}
