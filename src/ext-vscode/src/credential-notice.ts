/**
 * No-credential notice (2026-09-07).
 *
 * ── WHY ───────────────────────────────────────────────────────────────────────
 * The vsix setup terminal runs the CLI's interactive credential question, which
 * can be passed without storing a credential. After that the product is inert:
 * `auto` cannot classify, no enhancement is ever built, every submit-time turn
 * ends `submit_stop_decider_done {stdout_len:0}` — and nothing on the extension
 * side says so (measured on a real install: `nexpath status → Source: none`).
 *
 * ── WHAT ──────────────────────────────────────────────────────────────────────
 * Once per activation, deferred, the extension asks the CLI
 * (`nexpath credential-status`, read-only, no store, no lock) which credential
 * layer resolves. `none` ⇒ one information message naming the two commands.
 * Re-shown at most once per 24 h (globalState stamp) so a user who chose to
 * run without a credential is not nagged on every window.
 *
 * Fail-quiet: no CLI, a spawn failure, or unparsable output ⇒ nothing shown.
 * Pure over its ports; the real wiring lives in extension.ts.
 */
export const CREDENTIAL_NOTICE_KEY = 'nexpath.credentialNoticeAt';
export const CREDENTIAL_NOTICE_REPEAT_MS = 24 * 60 * 60 * 1000;

export const CREDENTIAL_NOTICE_MESSAGE =
  'Nexpath: no LLM credential is configured, so prompt guidance is inactive. ' +
  'In a terminal run `nexpath config set-api-key` (your OpenAI key) or ' +
  '`nexpath config set-token` (your Nexpath token), then reload the window.';

export interface CredentialStatusResult {
  source: string;
  configured: boolean;
}

export interface CredentialNoticeDeps {
  /** Spawns `nexpath credential-status`; resolves null on any failure. */
  queryStatus: () => Promise<CredentialStatusResult | null>;
  /** Shows the notice (never awaited for a choice — fire-and-forget). */
  show: (message: string) => void;
  /** Persisted stamp of the last notice (globalState). */
  getLastShownAt: () => number | undefined;
  /** vscode's `Memento.update` returns a Thenable — any PromiseLike is fine. */
  setLastShownAt: (at: number) => PromiseLike<void> | void;
  log?: (line: string) => void;
  now?: () => number;
}

export type CredentialNoticeOutcome =
  | 'shown' | 'configured' | 'unknown' | 'recently_shown';

/** Never throws; returns what happened so the caller can log it. */
export async function maybeShowCredentialNotice(deps: CredentialNoticeDeps): Promise<CredentialNoticeOutcome> {
  const now = deps.now ?? (() => Date.now());
  try {
    const status = await deps.queryStatus();
    if (!status) {
      deps.log?.('[nexpath] credential check: CLI unavailable or unparsable — no notice');
      return 'unknown';
    }
    if (status.configured) {
      deps.log?.(`[nexpath] credential check: source=${status.source}`);
      return 'configured';
    }
    const last = deps.getLastShownAt();
    if (typeof last === 'number' && now() - last < CREDENTIAL_NOTICE_REPEAT_MS) {
      deps.log?.('[nexpath] credential check: none configured (notice shown recently)');
      return 'recently_shown';
    }
    deps.log?.('[nexpath] credential check: none configured — showing the one-time notice');
    deps.show(CREDENTIAL_NOTICE_MESSAGE);
    await deps.setLastShownAt(now());
    return 'shown';
  } catch (err) {
    deps.log?.(`[nexpath] credential check failed: ${err instanceof Error ? err.message : String(err)}`);
    return 'unknown';
  }
}
