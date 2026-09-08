/**
 * H7 — cross-package contract AGREEMENT.
 *
 * ── THE GAP THIS CLOSES ──────────────────────────────────────────────────────
 * The submit-decision record is duplicated between `src/cli` and `src/ext-vscode`
 * because they are separate npm packages that cannot import each other (the
 * `G-ROOTDIR`/TS6059 wall). Each side pins its own copy by test — but **nothing
 * has ever checked the two pins against each other**. Both suites can be green
 * while the halves disagree, and the failure is silent at runtime: the hook
 * writes a record, the extension's validator returns null, and the user's prompt
 * is cancelled with nothing injected.
 *
 * A true round-trip is impossible for the same reason the duplication exists —
 * neither package can import the other. So this reads the extension's SOURCE and
 * compares the field set it actually validates against the field set the CLI
 * actually writes. No import, no mock: the real text of both contracts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeSubmitDecision, submitDecisionPath, SUBMIT_DECISION_SCHEMA_V1 } from './submit-decision-store.js';

const EXT_DIR = join(__dirname, '..', '..', 'ext-vscode', 'src');
const extRecord = readFileSync(join(EXT_DIR, 'submit-decision-record.ts'), 'utf8');
const extRuntime = readFileSync(join(EXT_DIR, 'submit-advisory-runtime.ts'), 'utf8');

/**
 * Every field the extension's validator rejects a record for.
 *
 * The validator uses THREE forms — `typeof r.x !==`, `!isNonEmptyString(r.x)`,
 * and direct comparison `r.x !== ...`. An earlier version matched only the first
 * and found 3 of 7 fields, which would have made every assertion below vacuously
 * true. The meta-guard at the bottom of this file is what caught that.
 */
function extensionRequiredFields(): string[] {
  const body = extRecord.slice(
    extRecord.indexOf('export function parseSubmitDecisionRecordV1'),
    extRecord.indexOf('return {', extRecord.indexOf('export function parseSubmitDecisionRecordV1')),
  );
  const found = new Set<string>();
  for (const re of [/typeof r\.(\w+)\s*!==/g, /isNonEmptyString\(r\.(\w+)\)/g, /r\.(\w+)\s*!==/g]) {
    for (const m of body.matchAll(re)) found.add(m[1]);
  }
  return [...found];
}

/** Every field the CLI actually serialises, captured from a real write. */
async function cliWrittenFields(): Promise<string[]> {
  let json = '';
  await writeSubmitDecision(
    {
      projectRoot: '/proj', decisionId: 'sd-1', replacementText: 'x',
      createdAt: 1, host: 'windsurf', blockIssuedAt: 1, hookPid: 42,
    },
    { mkdirFn: async () => {}, writeFn: async (_p, d) => { json = d; }, renameFn: async () => {} },
  );
  return Object.keys(JSON.parse(json));
}

describe('⭐ the two halves of the duplicated contract must AGREE', () => {
  it('every field the extension REQUIRES is actually written by the CLI', async () => {
    // A required-but-unwritten field means the validator returns null for every
    // real record - the prompt is cancelled and nothing is ever injected.
    const written = await cliWrittenFields();
    for (const f of extensionRequiredFields()) {
      expect(written, `extension requires "${f}" but the CLI never writes it`).toContain(f);
    }
  });

  it('the schema version constant matches on both sides', () => {
    const m = extRecord.match(/SUBMIT_DECISION_SCHEMA_V1\s*=\s*(\d+)/);
    expect(m, 'extension does not declare the schema version').not.toBeNull();
    expect(Number(m![1])).toBe(SUBMIT_DECISION_SCHEMA_V1);
  });

  it('the file path convention matches on both sides', () => {
    // Divergence here means the hook writes where nobody polls - silent.
    const m = extRuntime.match(/join\((\w+),\s*'([^']+)',\s*'([^']+)'\)/);
    expect(m, 'extension path helper not found').not.toBeNull();
    expect(submitDecisionPath('/proj')).toBe(join('/proj', m![2], m![3])); // host separator
  });

  it('both sides accept the same host vocabulary', () => {
    // A host the CLI can write but the extension cannot name would be dropped.
    expect(extRecord).toMatch(/'windsurf'/);
    expect(extRecord).toMatch(/'cursor'/);
  });
});

describe('the agreement check itself is meaningful', () => {
  it('finds a non-empty required-field set', () => {
    // Guards against the regex silently matching nothing, which would make every
    // assertion above vacuously true.
    // 7 fields: schemaVersion, decisionId, replacementText, createdAt,
    // blockIssuedAt, hookPid, host.
    expect(extensionRequiredFields().length).toBe(7);
  });

  it('finds a non-empty written-field set', async () => {
    expect((await cliWrittenFields()).length).toBeGreaterThanOrEqual(4);
  });
});
