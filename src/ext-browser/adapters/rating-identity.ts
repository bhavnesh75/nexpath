/**
 * The browser's installation id — a port of the CLI's `telemetry/identity.ts`,
 * narrowed to the one id the rating popup needs.
 *
 * A random UUID, generated once and persisted, that identifies this
 * INSTALLATION and nothing else. It is not derived from anything about the
 * user, the machine or the pages visited, and it is the only identifier any
 * envelope carries.
 *
 * ── WHAT CHANGED IN THE PORT, AND WHY ────────────────────────────────────────
 *
 * 1. **`globalThis.crypto.randomUUID()`, not `node:crypto`.** Precedent, not an
 *    assumption: the shipped worker already calls it (`service-worker.ts:1382`).
 *    ⚠️ The repo's `shims/node-crypto.ts` exposes `createHash` ONLY — it has no
 *    `randomUUID`, so importing the CLI's module here would fail at runtime, not
 *    at build.
 *
 * 2. **Asynchronous**, because `storage.local` is.
 *
 * 3. **Only `installation_id`.** The CLI also mints `user_id` and `team_id`;
 *    nothing browser-side sends either, and an id that is never sent is an
 *    identifier stored for no reason.
 *
 * 4. **Single-flight instead of a value cache.** The CLI caches per process to
 *    save repeated reads. The concern here is different: `getInstallationId` is
 *    async, so two overlapping first-time callers would BOTH read null, BOTH
 *    mint a UUID, and the loser would report an id that is not the one stored.
 *    An in-flight promise makes "generated once" true rather than likely.
 *    A service worker restart clears it, which is correct — the persisted value
 *    is then simply read back.
 */

/** The slice of the key store this module needs; injected so tests need no polyfill. */
export interface RatingIdentityKeyStore {
  getKey(name: string): Promise<string | null>;
  setKey(name: string, value: string): Promise<void>;
}

/** `identity.ts:5` — the CLI's key name, kept so the two stores read alike. */
export const KEY_INSTALLATION_ID = 'installation_id';

/** Resolves to the id being minted right now, if one is in flight. */
let inFlight: Promise<string> | null = null;

async function readOrMint(store: RatingIdentityKeyStore): Promise<string> {
  let existing: string | null = null;
  try {
    existing = await store.getKey(KEY_INSTALLATION_ID);
  } catch {
    // An unreadable store is treated as empty; the mint below still returns a
    // usable id for this send even if it cannot be persisted.
  }
  if (existing) return existing;

  const fresh = globalThis.crypto.randomUUID();
  try {
    await store.setKey(KEY_INSTALLATION_ID, fresh);
  } catch {
    // Persisting failed — return the id anyway rather than failing the send.
    // The next call mints a different one, which loses continuity but never
    // blocks; a store that cannot be written has larger problems.
  }
  return fresh;
}

/**
 * The installation id, generating and persisting one on first use.
 *
 * Never throws: identity backs telemetry, and telemetry must not be able to
 * break the thing it measures.
 */
export async function getInstallationId(store: RatingIdentityKeyStore): Promise<string> {
  if (inFlight) return inFlight;
  inFlight = readOrMint(store).finally(() => { inFlight = null; });
  return inFlight;
}

/** Test-only — drops the in-flight guard so per-test isolation works. */
export function _resetIdentityInFlight(): void {
  inFlight = null;
}
