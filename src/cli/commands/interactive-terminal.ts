/**
 * Interactive-terminal failures, shared by every command that prompts.
 *
 * ── Why this is its own module ───────────────────────────────────────────────
 * The mechanism was written for `nexpath install` and lived privately inside
 * `install.ts`. `config set-token` needs exactly the same treatment — Vedansi
 * measured it dying with a raw `ERR_TTY_INIT_FAILED` on a non-TTY stdin — but
 * could not reach it, and importing `install.ts` from `token.ts` would drag the
 * whole installer's import graph onto a command that has no business loading it.
 *
 * So the mechanism moved here and `install.ts` re-exports the error class. Every
 * existing caller — `main.ts`, `install.test.ts` — is untouched by design.
 */

/**
 * `nexpath install` is interactive: every prompt it shows needs a real terminal
 * to draw on and read keys from. Run with stdin or stdout redirected — a pipe,
 * a CI step, `< /dev/null` — the prompt library cannot attach to a TTY and dies
 * with a raw `ERR_TTY_INIT_FAILED: uv_tty_init returned EBADF` and a stack
 * trace, which says nothing about what the user should do instead.
 *
 * ⚠️ This WRAPS the failure rather than predicting it. A pre-flight
 * `process.stdin.isTTY` check would be the obvious shape, but it would decide
 * on this code's behalf that a terminal is unusable, and any redirection combo
 * that happens to work today would start being refused. Nothing that works now
 * can reach this: it only re-describes a call that already threw.
 *
 * The default message is the installer's, unchanged, because that is what every
 * existing caller and test expects from `new NonInteractiveTerminalError()`.
 * A command with different advice to give passes its own text.
 */
export class NonInteractiveTerminalError extends Error {
  constructor(message?: string) {
    super(
      message ?? [
        'nexpath install needs an interactive terminal, but stdin or stdout is redirected.',
        '',
        'Run it directly in a terminal:',
        '  nexpath install',
        '',
        'For an unattended install, use --yes — it stores a credential already in',
        'the environment or keychain, and prompts for nothing:',
        '  nexpath install --yes',
      ].join('\n'),
    );
    this.name = 'NonInteractiveTerminalError';
  }
}

/** True for the TTY-attachment failure above, and nothing else. */
export function isTtyInitFailure(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'ERR_TTY_INIT_FAILED';
}

/**
 * Run an interactive prompt, translating a TTY-attachment failure into an
 * explanation. Any other error is rethrown untouched — this must never turn a
 * real bug into a friendly message about terminals.
 *
 * `makeError` lets a caller supply its own advice. Omit it and the installer's
 * message is used, which is what `install.ts`'s own call sites want.
 */
export async function withInteractiveTerminal<T>(
  run: () => Promise<T>,
  makeError: () => NonInteractiveTerminalError = () => new NonInteractiveTerminalError(),
): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (isTtyInitFailure(err)) throw makeError();
    throw err;
  }
}
