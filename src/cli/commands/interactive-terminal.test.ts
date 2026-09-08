import { describe, it, expect } from 'vitest';
import {
  NonInteractiveTerminalError,
  isTtyInitFailure,
  withInteractiveTerminal,
} from './interactive-terminal.js';

const ttyErr = (): Error => Object.assign(new Error('uv_tty_init returned EBADF'), {
  code: 'ERR_TTY_INIT_FAILED',
});

describe('isTtyInitFailure', () => {
  it('true for the TTY-attachment code', () => {
    expect(isTtyInitFailure(ttyErr())).toBe(true);
  });

  it('false for every other error, so a real bug is never mistaken for one', () => {
    expect(isTtyInitFailure(new Error('boom'))).toBe(false);
    expect(isTtyInitFailure(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe(false);
    expect(isTtyInitFailure(null)).toBe(false);
    expect(isTtyInitFailure(undefined)).toBe(false);
  });
});

describe('NonInteractiveTerminalError', () => {
  // The installer's callers and install.test.ts construct this with no argument
  // and expect the installer's advice. That default is a compatibility promise.
  it('defaults to the installer message', () => {
    const m = new NonInteractiveTerminalError().message;
    expect(m).toContain('nexpath install needs an interactive terminal');
    expect(m).toContain('nexpath install --yes');
  });

  it('carries a caller-supplied message instead, for commands with other advice', () => {
    const m = new NonInteractiveTerminalError('set-token needs a terminal.').message;
    expect(m).toBe('set-token needs a terminal.');
  });

  it('keeps its name in both forms — main.ts matches on the class, but the name is user-visible', () => {
    expect(new NonInteractiveTerminalError().name).toBe('NonInteractiveTerminalError');
    expect(new NonInteractiveTerminalError('x').name).toBe('NonInteractiveTerminalError');
  });
});

describe('withInteractiveTerminal', () => {
  it('returns the value when nothing throws', async () => {
    await expect(withInteractiveTerminal(async () => 42)).resolves.toBe(42);
  });

  it('translates a TTY failure into the explanation', async () => {
    await expect(
      withInteractiveTerminal(async () => { throw ttyErr(); }),
    ).rejects.toBeInstanceOf(NonInteractiveTerminalError);
  });

  it('uses the caller-supplied error when one is given', async () => {
    await expect(
      withInteractiveTerminal(
        async () => { throw ttyErr(); },
        () => new NonInteractiveTerminalError('token advice'),
      ),
    ).rejects.toThrow('token advice');
  });

  // The point of the whole wrapper: it must never turn a real fault into a
  // friendly message about terminals.
  it('rethrows any other error untouched', async () => {
    const other = new Error('a real bug');
    await expect(
      withInteractiveTerminal(async () => { throw other; }),
    ).rejects.toBe(other);
  });

  it('does not call makeError for a non-TTY failure', async () => {
    let called = 0;
    await expect(
      withInteractiveTerminal(
        async () => { throw new Error('nope'); },
        () => { called += 1; return new NonInteractiveTerminalError('x'); },
      ),
    ).rejects.toThrow('nope');
    expect(called).toBe(0);
  });
});
