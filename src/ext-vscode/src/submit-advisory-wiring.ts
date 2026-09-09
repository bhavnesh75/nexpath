/**
 * Host-agnostic construction of the submit-time advisory poller (H6).
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The poller was built inside `extension.ts`'s `host === 'windsurf'` branch, so
 * **Cursor had no construction site at all**: the CLI half could write a `cursor`
 * decision and nothing would ever read it. TypeScript surfaced this — a
 * `host === 'cursor'` check inside that branch is provably unreachable.
 *
 * Two ways to fix it. Hoisting the block out of the host branch would have
 * edited the **shipping** Windsurf path, which is exactly what `R12` warns
 * against, and without the live E2E that would catch a regression. So instead the
 * construction is extracted here verbatim and **called** from each host branch.
 * The Windsurf path keeps its behaviour by construction, and a third host later
 * is one more call rather than a third copy.
 *
 * ── WHAT IS HOST-SPECIFIC ────────────────────────────────────────────────────
 * Only three things, all passed in:
 *   - which env switch gates it (the platforms are switchable independently)
 *   - which host's records to accept (cross-host delivery would inject into the
 *     wrong editor)
 *   - which app window to raise for the clipboard fallback
 *
 * Everything else — direct-injection-first delivery, the auto-submit gate, the
 * timing stages — is identical, and staying identical is the point.
 */
import type { SubmitHookPoller } from './submit-hook-poller.js';

export type SubmitAdvisoryHost = 'windsurf' | 'cursor';

export interface SubmitAdvisoryWiringDeps {
  host: SubmitAdvisoryHost;
  /** Already-evaluated switch state for THIS host. */
  enabled: boolean;
  projectRoots: string[];
  /** Constructs the poller; injected so this module never imports `vscode`. */
  createPoller: (opts: {
    projectRoots: string[];
    readPendingDecision: (root: string) => Promise<unknown>;
    onInject: (text: string) => Promise<boolean>;
    onSubmit: () => Promise<boolean>;
    onTiming?: (t: unknown) => void;
    onOutcome?: (outcome: string) => void;
  }) => SubmitHookPoller;
  readPendingDecision: (root: string, expectedHost: SubmitAdvisoryHost) => Promise<unknown>;
  /** Direct, command-based injection for this host — the PRIMARY path. */
  injectDirect: (text: string) => Promise<boolean>;
  /** Clipboard fallback for this host. */
  fallbackClipboard: (text: string) => Promise<boolean>;
  /** Submit keystroke for this host. */
  submit: () => Promise<boolean>;
  notify: (message: string) => void;
  log: (message: string) => void;
  /** `deliverSubmitReplacement`, injected to keep this module testable. */
  deliver: (text: string, d: {
    injectDirect: (t: string) => Promise<boolean>;
    fallbackClipboard: (t: string) => Promise<boolean>;
    notify: (m: string) => void;
    log: (m: string) => void;
  }) => Promise<{ outcome: string; landed: boolean }>;
  onTiming?: (t: unknown) => void;
  /**
   * RC70 (F-3): delivery-outcome sink. The Windsurf branch always had one (the
   * outcome log line + the RC16 darwin / RC47 win32 "press Enter yourself"
   * hints); this host-agnostic wiring dropped it, so on Cursor a failed
   * auto-send left the refined text in the composer with no log and no guidance.
   */
  onOutcome?: (outcome: string) => void;
}

/**
 * Build the poller for one host, or return `null` when its switch is off.
 *
 * **Returns `null` BEFORE constructing anything** — no poller, no delivery, no
 * clipboard object. With the switch off the feature is unreachable by control
 * flow, not merely inert.
 */
export function createSubmitAdvisoryForHost(
  deps: SubmitAdvisoryWiringDeps,
): SubmitHookPoller | null {
  if (!deps.enabled) return null;

  // Set by onInject; gates auto-submit to the injected path only.
  let lastDeliveryLanded = false;

  return deps.createPoller({
    projectRoots: deps.projectRoots,
    // Accept only records written FOR THIS HOST — delivering another host's
    // record would inject into the wrong editor.
    readPendingDecision: (root) => deps.readPendingDecision(root, deps.host),
    onInject: async (text) => {
      const res = await deps.deliver(text, {
        // PRIMARY: direct command-based injection, the same mechanism the old
        // flow uses. The clipboard is reached ONLY if this fails.
        injectDirect: deps.injectDirect,
        fallbackClipboard: deps.fallbackClipboard,
        notify: deps.notify,
        log: deps.log,
      });
      lastDeliveryLanded = res.landed;
      return res.outcome !== 'failed';
    },
    // Auto-submit ONLY after a real injection: after a clipboard fallback the
    // user has not pasted yet, so Enter would submit a stale composer.
    onSubmit: async () => (lastDeliveryLanded ? deps.submit() : false),
    onTiming: deps.onTiming,
    onOutcome: deps.onOutcome,
  });
}
