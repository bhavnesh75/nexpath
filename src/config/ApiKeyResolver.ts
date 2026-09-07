import { promises as fs } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { config as loadDotenv } from 'dotenv';
import { getPassword, setPassword, deletePassword } from 'cross-keychain';
import { readNexpathToken, resolveApiBaseUrl } from './NexpathTokenStore.js';
import { OPENAI_KEY_REGEX, isValidApiKey } from './credential-shape.js';

export const KEYCHAIN_SERVICE = 'nexpath';
export const KEYCHAIN_ACCOUNT = 'openai_api_key';
export const FALLBACK_PATH    = join(homedir(), '.nexpath', 'config.json');

// The shape rules moved to the zero-import `credential-shape` module so the
// browser build can share them instead of copying them. Re-exported here under
// their established names: every existing importer of this module is unchanged,
// and both values behave exactly as before.
export { OPENAI_KEY_REGEX as API_KEY_REGEX, isValidApiKey };

// The fifth and last resolution layer. `nexpath_token` means Mode B — no
// OpenAI key anywhere, a Nexpath token stored instead. This is the single
// place both env vars get set, so nothing that calls `resolveOpenAIKey` or
// `getKeySource` — the only two entry points that reach an LLM call — needs
// to change.
export type KeySource = 'env' | 'dotenv' | 'keychain' | 'file' | 'nexpath_token' | 'none';

export interface ResolveOptions {
  fallbackPath?: string;
}

export async function resolveOpenAIKey(projectRoot: string, opts: ResolveOptions = {}): Promise<string | null> {
  const fallbackPath = opts.fallbackPath ?? FALLBACK_PATH;

  const envKey = tryEnv();
  if (envKey) return envKey;

  const dotenvKey = tryProjectDotenv(projectRoot);
  if (dotenvKey) {
    process.env.OPENAI_API_KEY = dotenvKey;
    return dotenvKey;
  }

  const keychainKey = await tryKeychain();
  if (keychainKey) {
    process.env.OPENAI_API_KEY = keychainKey;
    return keychainKey;
  }

  const fileKey = await tryFallbackFile(fallbackPath);
  if (fileKey) {
    process.env.OPENAI_API_KEY = fileKey;
    return fileKey;
  }

  // The fifth and last layer: only reached when none of the 4 above found an
  // OpenAI key. The own-key-always-wins guarantee is structural here, not a
  // separate check — every earlier layer already returned before this runs.
  // No key + a stored token means the token takes over instead.
  // ⚠️ fallbackPath must be forwarded — without it this silently reads the
  // real home-directory file regardless of what the caller passed in, which
  // would only ever surface as a bug in an isolated test or a custom-path
  // caller, never in ordinary use where the two defaults happen to coincide.
  const token = await readNexpathToken({ fallbackPath });
  if (token) {
    process.env.OPENAI_API_KEY = token;
    // Never clobber a base URL the user configured themselves — e.g. pointed
    // at their own proxy for testing. This only sets it when it is genuinely
    // unset.
    if (!process.env.OPENAI_BASE_URL) {
      process.env.OPENAI_BASE_URL = resolveApiBaseUrl();
    }
    return token;
  }

  return null;
}

export async function getKeySource(projectRoot: string, opts: ResolveOptions = {}): Promise<KeySource> {
  const fallbackPath = opts.fallbackPath ?? FALLBACK_PATH;

  if (tryEnv())                            return 'env';
  if (tryProjectDotenv(projectRoot))       return 'dotenv';
  if (await tryKeychain())                 return 'keychain';
  if (await tryFallbackFile(fallbackPath)) return 'file';
  if (await readNexpathToken({ fallbackPath })) return 'nexpath_token';
  return 'none';
}

export async function storeApiKey(key: string, opts: ResolveOptions = {}): Promise<{ source: 'keychain' | 'file' }> {
  if (!isValidApiKey(key)) {
    throw new Error('Invalid OpenAI API key format (expected /^sk-[A-Za-z0-9_-]{20,}$/)');
  }
  const fallbackPath = opts.fallbackPath ?? FALLBACK_PATH;

  try {
    await setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, key);
    return { source: 'keychain' };
  } catch {
    await writeFallbackFile(fallbackPath, key);
    return { source: 'file' };
  }
}

export async function removeApiKey(opts: ResolveOptions = {}): Promise<void> {
  const fallbackPath = opts.fallbackPath ?? FALLBACK_PATH;

  try { await deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT); } catch { /* silent */ }
  try {
    // The fallback file may also hold a Nexpath token under a different JSON
    // key (NexpathTokenStore's own field), so remove only our own key rather
    // than the whole file. Unlinking it took the token with it.
    const raw = await fs.readFile(fallbackPath, 'utf8');

    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = undefined; }

    // ⚠️ Not a JSON object: no store can read a credential out of it, but it may
    // still hold the key as raw text — and this function must never report a
    // removal it did not perform. Remove the file, as it did before it learned
    // to share one.
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      await fs.unlink(fallbackPath);
      return;
    }

    const fields = parsed as Record<string, unknown>;
    if ('openai_api_key' in fields) {
      delete fields.openai_api_key;
      await fs.writeFile(fallbackPath, JSON.stringify(fields, null, 2), { mode: 0o600 });
    }
  } catch {
    /* no fallback file, or unreadable — nothing to remove */
  }
}

function tryEnv(): string | null {
  const key = process.env.OPENAI_API_KEY;
  if (key && isValidApiKey(key)) return key;
  return null;
}

function tryProjectDotenv(projectRoot: string): string | null {
  try {
    const envPath = join(projectRoot, '.env');
    const result  = loadDotenv({ path: envPath, processEnv: {}, quiet: true });
    if (result.error) return null;
    const key = result.parsed?.OPENAI_API_KEY;
    if (key && isValidApiKey(key)) return key;
    return null;
  } catch {
    return null;
  }
}

async function tryKeychain(): Promise<string | null> {
  try {
    const key = await getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    if (key && isValidApiKey(key)) return key;
    return null;
  } catch {
    return null;
  }
}

async function tryFallbackFile(fallbackPath: string): Promise<string | null> {
  try {
    const raw    = await fs.readFile(fallbackPath, 'utf8');
    const parsed = JSON.parse(raw) as { openai_api_key?: string };
    const key    = parsed.openai_api_key;
    if (key && isValidApiKey(key)) return key;
    return null;
  } catch {
    return null;
  }
}

async function writeFallbackFile(fallbackPath: string, key: string): Promise<void> {
  await fs.mkdir(dirname(fallbackPath), { recursive: true });

  // The fallback file is SHARED: NexpathTokenStore keeps its own token under a
  // different JSON key in this same file. Writing `{ openai_api_key }` flat
  // destroyed it — on any machine where the keychain is unavailable, storing a
  // key silently removed a stored token. Merge, exactly as writeFallbackToken
  // already does in the other direction.
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await fs.readFile(fallbackPath, 'utf8')) as Record<string, unknown>;
  } catch {
    /* no existing file, or unreadable — start fresh rather than fail; a corrupt
       file is replaced by the valid one written below. Mirrors the token side. */
  }

  const payload = JSON.stringify({ ...existing, openai_api_key: key }, null, 2);
  await fs.writeFile(fallbackPath, payload, { mode: 0o600 });
  await fs.chmod(fallbackPath, 0o600);
}
