import { describe, it, expect, beforeEach } from 'vitest';
import { openStore, type Store } from '../store/db.js';
import { setConfig } from '../store/config.js';
import {
  resolvePromptEnhancementPopupCooldownV1,
  isPromptEnhancementPopupCooldownActiveV1,
} from './popup-cooldown.js';

describe('resolvePromptEnhancementPopupCooldownV1', () => {
  let store: Store;
  beforeEach(async () => { store = await openStore(':memory:'); });

  it('defaults to 7 when unset', () => {
    expect(resolvePromptEnhancementPopupCooldownV1(store, '/p')).toBe(7);
  });
  it('uses the global config value', () => {
    setConfig(store, 'prompt_enhancement.popup_cooldown', '3');
    expect(resolvePromptEnhancementPopupCooldownV1(store, '/p')).toBe(3);
  });
  it('project-scoped overrides global', () => {
    setConfig(store, 'prompt_enhancement.popup_cooldown', '3');
    setConfig(store, 'prompt_enhancement.popup_cooldown:/p', '9');
    expect(resolvePromptEnhancementPopupCooldownV1(store, '/p')).toBe(9);
  });
  it('allows 0 (disables the cooldown)', () => {
    setConfig(store, 'prompt_enhancement.popup_cooldown', '0');
    expect(resolvePromptEnhancementPopupCooldownV1(store, '/p')).toBe(0);
  });
  it('negative → default 7', () => {
    setConfig(store, 'prompt_enhancement.popup_cooldown', '-2');
    expect(resolvePromptEnhancementPopupCooldownV1(store, '/p')).toBe(7);
  });
  it('non-numeric → default 7', () => {
    setConfig(store, 'prompt_enhancement.popup_cooldown', 'abc');
    expect(resolvePromptEnhancementPopupCooldownV1(store, '/p')).toBe(7);
  });
});

describe('isPromptEnhancementPopupCooldownActiveV1', () => {
  it('never active when no popup has shown yet (lastPopupIndex = -1)', () => {
    expect(isPromptEnhancementPopupCooldownActiveV1(-1, 100, 7)).toBe(false);
  });
  it('active within the cooldown window (3 < 7)', () => {
    expect(isPromptEnhancementPopupCooldownActiveV1(10, 13, 7)).toBe(true);
  });
  it('not active at the cooldown boundary (7 < 7 is false)', () => {
    expect(isPromptEnhancementPopupCooldownActiveV1(10, 17, 7)).toBe(false);
  });
  it('not active after the cooldown window', () => {
    expect(isPromptEnhancementPopupCooldownActiveV1(10, 20, 7)).toBe(false);
  });
  it('cooldown 0 disables (never active even right after a popup)', () => {
    expect(isPromptEnhancementPopupCooldownActiveV1(10, 10, 0)).toBe(false);
  });
});
