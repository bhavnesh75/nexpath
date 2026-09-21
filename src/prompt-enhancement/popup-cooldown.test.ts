import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openStore } from '../store/db.js';
import type { Store } from '../store/db.js';
import { setConfig } from '../store/config.js';
import {
  resolvePromptEnhancementPopupCooldownV1,
  isPromptEnhancementPopupCooldownActiveV1,
} from './popup-cooldown.js';

// The shipped cooldown default and the window arithmetic. Phase 0 moved the default 7 → 3 on the
// strength of a measured run (s09: 9 popups at 7, 14 at 3) and nothing pinned the new number — the
// value could have gone back to 7 with every test still green, silently undoing the phase.

describe('resolvePromptEnhancementPopupCooldownV1', () => {
  let store: Store;
  beforeEach(async () => { store = await openStore(':memory:'); });
  afterEach(() => { store.db.close(); });

  it('defaults to 3 prompts when nothing is configured', () => {
    expect(resolvePromptEnhancementPopupCooldownV1(store, '/proj')).toBe(3);
  });

  it('a project-scoped value wins over the global one', () => {
    setConfig(store, 'prompt_enhancement.popup_cooldown', '5');
    setConfig(store, 'prompt_enhancement.popup_cooldown:/proj', '9');
    expect(resolvePromptEnhancementPopupCooldownV1(store, '/proj')).toBe(9);
    expect(resolvePromptEnhancementPopupCooldownV1(store, '/other')).toBe(5);
  });

  it('0 is honoured — it disables the cooldown rather than falling back to the default', () => {
    setConfig(store, 'prompt_enhancement.popup_cooldown', '0');
    expect(resolvePromptEnhancementPopupCooldownV1(store, '/proj')).toBe(0);
  });

  it('a non-numeric or negative value falls back to the default instead of throwing', () => {
    for (const bad of ['abc', '-1', '']) {
      setConfig(store, 'prompt_enhancement.popup_cooldown', bad);
      expect(resolvePromptEnhancementPopupCooldownV1(store, '/proj'), bad).toBe(3);
    }
  });
});

describe('isPromptEnhancementPopupCooldownActiveV1', () => {
  it('the first popup of a session always shows (no popup index yet)', () => {
    expect(isPromptEnhancementPopupCooldownActiveV1(-1, 0, 3)).toBe(false);
    expect(isPromptEnhancementPopupCooldownActiveV1(-1, 50, 3)).toBe(false);
  });

  it('suppresses inside the window and releases exactly at it', () => {
    expect(isPromptEnhancementPopupCooldownActiveV1(10, 10, 3)).toBe(true);   // same prompt
    expect(isPromptEnhancementPopupCooldownActiveV1(10, 12, 3)).toBe(true);   // 2 prompts later
    expect(isPromptEnhancementPopupCooldownActiveV1(10, 13, 3)).toBe(false);  // the 3rd releases it
    expect(isPromptEnhancementPopupCooldownActiveV1(10, 99, 3)).toBe(false);
  });

  it('cooldown 0 is never active', () => {
    expect(isPromptEnhancementPopupCooldownActiveV1(10, 10, 0)).toBe(false);
  });
});
