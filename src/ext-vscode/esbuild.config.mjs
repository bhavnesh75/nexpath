import { build, context } from 'esbuild';
import { execSync } from 'node:child_process';

const watch = process.argv.includes('--watch');

/**
 * RC24 (Windows tester, 2026-08-18): stamp the git commit into the bundle.
 *
 * ── THE FAILURE THIS ENDS ────────────────────────────────────────────────────
 * A tester created a LOCAL branch with our branch's name but pointing at `main`
 * (`git branch <name>` with no start-point), then built and installed it. The
 * shell prompt showed the right branch name, the build succeeded, and the
 * extension ran the OLD flow — three separate rounds of "Windows is broken"
 * were spent on a machine that never had the code. Nothing in the product said
 * which build was running. Now activation states it, so any report identifies
 * its own build in one line. Falls back to 'unknown' outside a git checkout
 * (e.g. a .vsix built from a tarball) — never fails the build.
 */
const buildId = (() => {
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return `${sha} (${branch})`;
  } catch {
    return 'unknown';
  }
})();

const config = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  // `.cjs` extension is load-bearing: package.json#type is "module" (so the
  // source-side .ts imports use ESM resolution), but esbuild bundles the
  // extension entry as CommonJS — which is what VS Code's extension host
  // requires (it `require()`s the main entry). Naming the output .cjs tells
  // Node to use the CJS loader regardless of the package's type field;
  // naming it .js would trigger ERR_REQUIRE_ESM and silently break activation.
  // Locked by src/package-main-format.test.ts.
  outfile: 'out/extension.cjs',
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  // `vscode` is provided by the host. `better-sqlite3` is a native module
  // (.node bindings) that esbuild cannot bundle; node_modules/better-sqlite3
  // ships in the .vsix and is loaded via dynamic import at runtime so the
  // native load only hits on first chat-history read.
  external: ['vscode', 'better-sqlite3'],
  sourcemap: true,
  minify: false,
  logLevel: 'info',
  // RC24: compile-time constant read by extension.ts's activation log.
  define: { __NEXPATH_BUILD__: JSON.stringify(buildId) },
};

if (watch) {
  const ctx = await context(config);
  await ctx.watch();
  console.log('[esbuild] watching src/extension.ts...');
} else {
  await build(config);
  console.log('[esbuild] built out/extension.cjs');
  // The vscode:uninstall hook — a standalone node script, no vscode API, no externals.
  await build({ ...config, entryPoints: ['src/uninstall-hook.ts'], outfile: 'out/uninstall.cjs', external: [], sourcemap: false });
  console.log('[esbuild] built out/uninstall.cjs');
}
