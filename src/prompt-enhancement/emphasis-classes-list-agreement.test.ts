/**
 * The two clause lists may differ in SIZE but never in content.
 *
 * `emphasis-classes.ts` reads a clause's front twice over:
 *
 *   CLASS_1_WRAPPERS           everything a clause can WEAR, peeled off the front until nothing comes off
 *   CLASS_1_MIDSENTENCE_HEADS  where a NEW clause may begin after a comma
 *
 * The second is deliberately smaller — widening it spends the per-section cap on actions and takes
 * boundary and condition marks away from the reader, which is a ruling for the owner (plan §5L). What is
 * NOT deliberate, and is what this file exists to catch, is the two disagreeing: a head that the peel
 * does not know would be found mid-sentence and then left wearing its own wrapper, and that is how
 * `Let’s break this epic into clear` came to be a mark with the wrapper inside it.
 *
 * ⛔ Read from SOURCE, because both lists are module-private and should stay that way. The same pattern
 * as `composer-own-lines.test.ts`, and for the same reason: a guard is worth nothing if it can only be
 * written by widening the thing it guards.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { NEVER_MARKED_SECTION_KINDS, TERM_ONLY_SECTION_KINDS } from './emphasis-classes.js';

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'emphasis-classes.ts'), 'utf8');

/** The string entries of one `const NAME: readonly string[] = [ … ];` declaration. */
function entriesOf(name: string): readonly string[] {
  const at = source.indexOf(`const ${name}: readonly string[] = [`);
  if (at < 0) throw new Error(`${name} is not declared in emphasis-classes.ts`);
  const end = source.indexOf('];', at);
  if (end < 0) throw new Error(`${name}'s declaration is not closed`);
  const block = source.slice(at, end);
  // Comment lines inside the block carry prose with apostrophes in it, which would pair with the next
  // real quote and shift every entry after it — so they go first.
  const code = block.replace(/^\s*\/\/.*$/gm, '');
  return [...code.matchAll(/'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)"/g)]
    .map((match) => (match[1] ?? match[2] ?? '').replace(/\\'/g, "'"))
    .filter((entry) => entry.length > 0);
}

describe('the clause lists agree', () => {
  const wrappers = entriesOf('CLASS_1_WRAPPERS');
  const heads = entriesOf('CLASS_1_MIDSENTENCE_HEADS');

  it('reads both lists at all — an empty read would make every assertion below vacuous', () => {
    expect(wrappers.length).toBeGreaterThan(40);
    expect(heads.length).toBeGreaterThan(10);
  });

  it('every mid-sentence head is also peeled as a wrapper', () => {
    // A head the peel does not know is found mid-sentence and then left wearing itself: the clause
    // starts after `let's`, and `let's` is still in front of the verb of the clause behind it.
    const unpeeled = heads.filter((head) => !wrappers.includes(head));
    expect(unpeeled).toEqual([]);
  });

  it('the head list is the smaller of the two, which is the point', () => {
    // If they ever become equal, the merge has happened by accident rather than by the owner's ruling.
    expect(heads.length).toBeLessThan(wrappers.length);
  });

  it('neither list carries a duplicate', () => {
    expect(new Set(wrappers).size).toBe(wrappers.length);
    expect(new Set(heads).size).toBe(heads.length);
  });

  it('no wrapper is a verb one of the approved lists holds', async () => {
    // ⛔ Peeling a verb hands the clause to the word behind it: `ensure the data is clean` would become
    // `the data is clean`, which instructs nobody. The header says this; here it is checked.
    const { EXECUTION_VERB, ALWAYS_ESCALATE_PATTERN } = await import('./safety-sendability.js');
    for (const wrapper of wrappers) {
      const bare = wrapper.replace(/[,]$/, '');
      // Only single-word wrappers can BE a verb; `make sure to` ends in a word that is not the verb.
      if (bare.includes(' ')) continue;
      expect(EXECUTION_VERB.test(bare), `${wrapper} is an execution verb`).toBe(false);
      expect(ALWAYS_ESCALATE_PATTERN.test(bare), `${wrapper} is an escalation verb`).toBe(false);
    }
  });
});

/**
 * The VS Code preview keeps its OWN copy of the never-marked set, and nothing was watching it.
 *
 * `src/ext-vscode/**` is excluded from this suite by `vitest.config.ts` — that sub-package has its own
 * package.json and a native dependency the root does not install — so its tests never run here. Its copy
 * of `NEVER_MARKED_SECTION_KINDS` is therefore unprotected by anything that runs, and a change on either
 * side would let the preview and the popup disagree about which sections may carry a mark.
 *
 * ⛔ Caught by mutation: restoring `source_signal_guidance` to the preview's copy broke nothing, because
 * no test that runs could see it. Read from SOURCE, like the two lists above, for the same reason.
 */
describe('the VS Code preview agrees with the engine about what is never marked', () => {
  const previewSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'ext-vscode', 'src', 'pe-payload.ts'),
    'utf8',
  );

  /** The entries of the preview's own copy. */
  const previewKinds = (): readonly string[] => {
    const at = previewSource.indexOf('export const NEVER_MARKED_SECTION_KINDS');
    if (at < 0) throw new Error('the preview no longer declares NEVER_MARKED_SECTION_KINDS');
    const end = previewSource.indexOf(']);', at);
    const block = previewSource.slice(at, end).replace(/^\s*\/\/.*$/gm, '');
    return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]!);
  };

  it('reads that copy at all — an empty read would prove nothing', () => {
    expect(previewKinds().length).toBeGreaterThan(0);
  });

  it('holds exactly the kinds the engine never marks', () => {
    expect([...previewKinds()].sort()).toEqual([...NEVER_MARKED_SECTION_KINDS].sort());
  });

  it('does not bar the term-only section, whose keyword the engine now marks', () => {
    // Barring it there would drop exactly the mark the 2026-09-29 change was made for, and the preview
    // would disagree with the popup beside it.
    for (const kind of TERM_ONLY_SECTION_KINDS) {
      expect(previewKinds()).not.toContain(kind);
    }
  });
});
