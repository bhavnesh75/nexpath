/**
 * `nexpath credential-status` — which credential layer resolves, as one JSON line.
 *
 * Extension-internal (2026-09-07). The VS Code extension has no way to know
 * whether a credential is configured: the vsix setup terminal runs the CLI's
 * interactive credential question, which can be passed without storing one,
 * and after that every submit-time turn silently produces nothing. The
 * extension can spawn this command (read-only, no store, no lock) and tell the
 * user once. Mirrors `status`'s `CredentialStatus.source` exactly — the same
 * resolver, consume-only (`ApiKeyResolver.getKeySource`), no env mutation.
 */
import { getKeySource, type KeySource } from '../../config/ApiKeyResolver.js';

export interface CredentialStatusJson {
  /** The layer `resolveOpenAIKey` would stop at; `none` means nothing resolves. */
  source: KeySource;
  configured: boolean;
  error?: string;
}

export interface CredentialStatusDeps {
  keySourceFn?: (projectRoot: string) => Promise<KeySource>;
  print?: (line: string) => void;
}

/** Exit 0 with the JSON line; exit 1 (still one JSON line, `source: none`) if the resolver throws. */
export async function credentialStatusAction(
  opts: { project: string },
  deps: CredentialStatusDeps = {},
): Promise<number> {
  const print = deps.print ?? ((line: string) => { process.stdout.write(line + '\n'); });
  try {
    const source = await (deps.keySourceFn ?? getKeySource)(opts.project);
    const out: CredentialStatusJson = { source, configured: source !== 'none' };
    print(JSON.stringify(out));
    return 0;
  } catch (err) {
    const out: CredentialStatusJson = {
      source: 'none', configured: false, error: (err as Error)?.message ?? 'resolver_failed',
    };
    print(JSON.stringify(out));
    return 1;
  }
}

export function registerCredentialStatusCommand(program: import('commander').Command): void {
  program
    .command('credential-status')
    .description('Print which credential layer resolves, as JSON (extension-internal)')
    .option('-p, --project <path>', 'Project root path', process.cwd())
    .action(async (opts: { project: string }) => {
      process.exitCode = await credentialStatusAction(opts);
    });
}
