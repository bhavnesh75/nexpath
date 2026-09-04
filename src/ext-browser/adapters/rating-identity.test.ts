import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getInstallationId,
  _resetIdentityInFlight,
  KEY_INSTALLATION_ID,
  type RatingIdentityKeyStore,
} from './rating-identity.js';

/** A storage.local stand-in that records what was written. */
function memStore(seed: Record<string, string> = {}) {
  const data = { ...seed };
  const writes: [string, string][] = [];
  const store: RatingIdentityKeyStore = {
    getKey: async (k) => (k in data ? data[k] : null),
    setKey: async (k, v) => { data[k] = v; writes.push([k, v]); },
  };
  return { store, data, writes };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

beforeEach(() => {
  _resetIdentityInFlight();
  vi.restoreAllMocks();
});

describe('getInstallationId', () => {
  it('mints a UUID on first use and persists it under the CLI key', async () => {
    const { store, data, writes } = memStore();

    const id = await getInstallationId(store);

    expect(id).toMatch(UUID_RE);
    expect(data[KEY_INSTALLATION_ID]).toBe(id);
    expect(writes).toEqual([[KEY_INSTALLATION_ID, id]]);
  });

  it('returns the stored id and writes nothing when one already exists', async () => {
    const { store, writes } = memStore({ [KEY_INSTALLATION_ID]: 'already-here' });

    expect(await getInstallationId(store)).toBe('already-here');
    expect(writes).toEqual([]);
  });

  it('is stable across calls — the same id every time, generated once', async () => {
    const { store, writes } = memStore();

    const first = await getInstallationId(store);
    _resetIdentityInFlight();                       // as if the worker restarted
    const second = await getInstallationId(store);
    const third  = await getInstallationId(store);

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(writes).toHaveLength(1);                 // minted exactly once
  });

  it('⭐ two overlapping first-time callers get the SAME id, minted once', async () => {
    // Without the in-flight guard both read null, both mint, and the loser
    // reports an id that is not the one in storage.
    const { store, writes } = memStore();
    const spy = vi.spyOn(globalThis.crypto, 'randomUUID');

    const [a, b] = await Promise.all([getInstallationId(store), getInstallationId(store)]);

    expect(a).toBe(b);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(1);
  });

  it('an unreadable store still yields a usable id rather than throwing', async () => {
    const store: RatingIdentityKeyStore = {
      getKey: async () => { throw new Error('storage gone'); },
      setKey: async () => {},
    };

    await expect(getInstallationId(store)).resolves.toMatch(UUID_RE);
  });

  it('an unwritable store still yields a usable id rather than throwing', async () => {
    const store: RatingIdentityKeyStore = {
      getKey: async () => null,
      setKey: async () => { throw new Error('quota'); },
    };

    await expect(getInstallationId(store)).resolves.toMatch(UUID_RE);
  });

  it('the in-flight guard is released after a failure, so the next call retries', async () => {
    let fail = true;
    const store: RatingIdentityKeyStore = {
      getKey: async () => { if (fail) { fail = false; throw new Error('transient'); } return 'settled'; },
      setKey: async () => {},
    };

    await getInstallationId(store);                 // mints, guard released
    expect(await getInstallationId(store)).toBe('settled');
  });
});
