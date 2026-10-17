/**
 * Guard: a test run must not create anything at the filesystem root.
 *
 * A test that uses an absolute path as a fake project root — `/proj`, `/p` — is harmless on a POSIX
 * machine run by an ordinary user, because the write fails and the code swallows it. On Windows the
 * same path resolves against the current drive, the write SUCCEEDS, and a directory is left behind.
 * On Linux in a container running as root it succeeds too.
 *
 * That leftover is not merely untidy. A directory that exists changes what `statSync` answers, and a
 * separate package's tests read that answer: three of them went red on this machine for no reason
 * other than a path another suite had created hours earlier. The failure appears far from its cause,
 * on a machine that has simply run the suite before, which is the worst shape a defect can have.
 *
 * So this wraps a command, lists the root before and after, and fails if anything is new. It does not
 * care WHICH test wrote — it names the path, and the path is enough to find the writer.
 *
 *   node scripts/check-no-stray-writes.mjs -- npx vitest run
 *   node scripts/check-no-stray-writes.mjs -- npm test
 *
 * Exit code: the wrapped command's, unless the root gained an entry — then 1, whatever the command
 * returned. A suite that passes while littering has not passed.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { parse, resolve, sep } from 'node:path';

/** The root the fake absolute paths in a test would land in: the current drive on Windows, `/` elsewhere. */
function filesystemRoot() {
  return parse(resolve(process.cwd())).root;
}

function listRoot(root) {
  try {
    return new Set(readdirSync(root));
  } catch (err) {
    // Unreadable root (locked down, or a permission-restricted container). Say so rather than
    // reporting a clean run: an empty snapshot would compare equal to the next empty snapshot and
    // the guard would pass without ever having looked.
    process.stderr.write(`stray-write guard: cannot read ${root} (${err?.code ?? 'unknown'}) — not a pass, not a failure.\n`);
    return null;
  }
}

const separatorIndex = process.argv.indexOf('--');
const command = separatorIndex === -1 ? [] : process.argv.slice(separatorIndex + 1);
if (command.length === 0) {
  process.stderr.write('usage: node scripts/check-no-stray-writes.mjs -- <command> [args...]\n');
  process.exit(2);
}

const root = filesystemRoot();
const before = listRoot(root);
if (before === null) process.exit(2);

const run = spawnSync(command[0], command.slice(1), { stdio: 'inherit', shell: process.platform === 'win32' });

const after = listRoot(root);
if (after === null) process.exit(2);

const added = [...after].filter((name) => !before.has(name)).sort();

if (added.length > 0) {
  process.stderr.write(`\nstray-write guard: BLOCKED — the run created ${added.length} entr${added.length === 1 ? 'y' : 'ies'} at ${root}:\n`);
  for (const name of added) process.stderr.write(`  ${root}${name}${sep}\n`);
  process.stderr.write(
    'A test is using an absolute path as a fake project root, which is a real path here.\n' +
    'Give it a temporary directory (`mkdtempSync`) instead. Delete the entries above once it is fixed —\n' +
    'they persist, and a directory that exists changes what other suites see.\n',
  );
  process.exit(1);
}

process.stdout.write(`\nstray-write guard: OK — nothing new at ${root}.\n`);
process.exit(run.status ?? 1);
