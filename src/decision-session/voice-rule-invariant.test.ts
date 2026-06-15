// Voice-rule invariant test for option text content.
//
// Scope: all L1/L2/L3 array entries in options.ts and options-beginner.ts.
// Excluded: question / pinchFallback fields (user-facing pinch-UI labels,
// not sent to the agent as user messages).
//
// Why this is a separate file from option-generator.test.ts: the existing
// per-set "no coaching-voice relay patterns" checks cover a partial 9-phrase
// set focused on relay/coaching constructions. This file enforces the full
// 13-phrase banned-pattern list against every L1/L2/L3 string in both
// modules, in one place — a single invariant that catches regressions
// regardless of which set is modified.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const OPTIONS_FILE = join(__dirname, 'options.ts');
const OPTIONS_BEGINNER_FILE = join(__dirname, 'options-beginner.ts');

// 12 unambiguous literal banned-pattern phrases. Each is a case-insensitive
// substring match.
//
// Two patterns from the source banned-list (`it says` / `it finds`) are
// explicitly marked context-sensitive ("where 'it' = AI") and are NOT
// included as bare literals — they can legitimately appear with a clear
// non-AI referent (e.g., "the name that doesn't mean what it says anymore"
// where "it" refers to "the name"). Semantic audits catch the AI-referent
// forms; the literal CI invariant covers the 12 phrases that have no
// reasonable non-AI reading.
const BANNED_PATTERNS: ReadonlyArray<{ pattern: string; desc: string }> = [
  { pattern: 'the AI',           desc: 'third-person AI reference' },
  { pattern: 'Ask the AI',       desc: 'third-person directive to AI' },
  { pattern: 'Have the AI',      desc: 'third-person directive to AI' },
  { pattern: 'Get the AI',       desc: 'third-person directive to AI' },
  { pattern: 'Instruct the AI',  desc: 'third-person directive to AI' },
  { pattern: 'Claude',           desc: 'third-person AI reference (model name)' },
  { pattern: 'the assistant',    desc: 'third-person AI reference' },
  { pattern: 'its answer',       desc: 'third-person possessive for AI output' },
  { pattern: 'its output',       desc: 'third-person possessive for AI output' },
  { pattern: 'this option',      desc: 'third-person self-reference (prompt-as-object)' },
  { pattern: 'the action below', desc: 'third-person self-reference' },
  { pattern: 'the prompt above', desc: 'third-person self-reference' },
];

// Extract L1/L2/L3 string literals from a .ts source file.
//
// Strategy: parse the file as text. For each `const X: DecisionContent = {`
// block, find the L1 / L2 / L3 arrays and pull each string literal. Skip
// question / pinchFallback fields entirely (UI labels, exempt).
function extractOptionStrings(filePath: string): { setName: string; field: 'L1' | 'L2' | 'L3'; index: number; text: string }[] {
  const source = readFileSync(filePath, 'utf-8');
  const results: { setName: string; field: 'L1' | 'L2' | 'L3'; index: number; text: string }[] = [];

  // Match each set block: `(export )?const ABSENCE_FOO: DecisionContent = { ... };`
  // Use a non-greedy match up to the closing `};` at column 0 (or with closing brace at start of line).
  const setRegex = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]+):\s*DecisionContent\s*=\s*\{([\s\S]*?)\n\};/g;
  let setMatch: RegExpExecArray | null;
  while ((setMatch = setRegex.exec(source)) !== null) {
    const setName = setMatch[1];
    const body = setMatch[2];

    // Within each set body, find L1 / L2 / L3 arrays.
    for (const field of ['L1', 'L2', 'L3'] as const) {
      const arrayRegex = new RegExp(`${field}:\\s*\\[([\\s\\S]*?)\\n\\s{2,}\\]`, 'g');
      const arrayMatch = arrayRegex.exec(body);
      if (!arrayMatch) continue;
      const arrayBody = arrayMatch[1];

      // Pull each string literal: single-quoted, possibly multi-line via
      // escape sequences. Match `'...'` allowing `\'` escapes.
      const stringRegex = /'((?:[^'\\]|\\.)*)'/g;
      let strMatch: RegExpExecArray | null;
      let index = 0;
      while ((strMatch = stringRegex.exec(arrayBody)) !== null) {
        // Unescape `\'` and `\\` for the audit text.
        const text = strMatch[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
        results.push({ setName, field, index, text });
        index++;
      }
    }
  }

  return results;
}

describe('Voice-rule invariant — 12 literal banned-pattern phrases', () => {
  describe('options.ts L1/L2/L3 arrays', () => {
    const entries = extractOptionStrings(OPTIONS_FILE);

    it('extracts a reasonable number of option strings (sanity)', () => {
      // options.ts has ~50+ sets, each with ~6 strings on average → expect >= 200.
      expect(entries.length).toBeGreaterThan(200);
    });

    for (const { pattern, desc } of BANNED_PATTERNS) {
      it(`no L1/L2/L3 string contains "${pattern}" (${desc})`, () => {
        const violations = entries.filter(({ text }) =>
          text.toLowerCase().includes(pattern.toLowerCase())
        );
        if (violations.length > 0) {
          const detail = violations
            .map((v) => `  ${v.setName}.${v.field}[${v.index}]: ${v.text.slice(0, 120)}${v.text.length > 120 ? '...' : ''}`)
            .join('\n');
          throw new Error(`Found "${pattern}" in ${violations.length} L1/L2/L3 string(s):\n${detail}`);
        }
      });
    }
  });

  describe('options-beginner.ts L1/L2/L3 arrays', () => {
    const entries = extractOptionStrings(OPTIONS_BEGINNER_FILE);

    it('extracts a reasonable number of option strings (sanity)', () => {
      expect(entries.length).toBeGreaterThan(100);
    });

    for (const { pattern, desc } of BANNED_PATTERNS) {
      it(`no L1/L2/L3 string contains "${pattern}" (${desc})`, () => {
        const violations = entries.filter(({ text }) =>
          text.toLowerCase().includes(pattern.toLowerCase())
        );
        if (violations.length > 0) {
          const detail = violations
            .map((v) => `  ${v.setName}.${v.field}[${v.index}]: ${v.text.slice(0, 120)}${v.text.length > 120 ? '...' : ''}`)
            .join('\n');
          throw new Error(`Found "${pattern}" in ${violations.length} L1/L2/L3 string(s):\n${detail}`);
        }
      });
    }
  });
});

// ─── descBase template-literal content (full coverage) ─────────────────────
//
// Pulls every `` descBase: `...` `` template-literal value out of the
// options source and runs the same 12-phrase invariant against the
// template body. Closes the coverage gap that left descBase content
// catching banned phrases only by accidental apostrophe bracketing.

function extractDescBaseTemplates(filePath: string): { snippet: string; text: string }[] {
  const source = readFileSync(filePath, 'utf-8');
  const results: { snippet: string; text: string }[] = [];

  // Match `descBase: `<body>`,` where `<body>` may span multiple lines
  // and may contain escaped backticks (\`) and escaped backslashes (\\).
  const re = /descBase:\s*`((?:[^`\\]|\\.)*)`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const raw = m[1];
    // Unescape \\` and \\\\ + interpret \\n as a newline so semantic checks
    // see the same text the runtime would see.
    const text = raw
      .replace(/\\`/g, '`')
      .replace(/\\\\/g, '\\')
      .replace(/\\n/g, '\n');
    const start = m.index + m[0].indexOf('`') + 1;
    const snippet = source.slice(Math.max(0, start - 60), Math.min(source.length, start + 60));
    results.push({ snippet, text });
  }
  return results;
}

describe('Voice-rule invariant — descBase template-literal content', () => {
  describe('options.ts descBase templates', () => {
    const entries = extractDescBaseTemplates(OPTIONS_FILE);

    it('extracts a reasonable number of desc-base templates (sanity)', () => {
      // Pre-Phase-2 baseline: ~1000 templates expected once content port is complete.
      expect(entries.length).toBeGreaterThan(400);
    });

    for (const { pattern, desc } of BANNED_PATTERNS) {
      it(`no descBase template contains "${pattern}" (${desc})`, () => {
        const violations = entries.filter(({ text }) =>
          text.toLowerCase().includes(pattern.toLowerCase())
        );
        if (violations.length > 0) {
          const detail = violations
            .slice(0, 8)
            .map((v) => `  …${v.snippet.replace(/\n/g, '\\n')}…`)
            .join('\n');
          const more = violations.length > 8 ? `\n  (${violations.length - 8} more not shown)` : '';
          throw new Error(`Found "${pattern}" in ${violations.length} descBase template(s):\n${detail}${more}`);
        }
      });
    }
  });

  describe('options-beginner.ts descBase templates', () => {
    const entries = extractDescBaseTemplates(OPTIONS_BEGINNER_FILE);

    it('extracts a reasonable number of desc-base templates (sanity)', () => {
      expect(entries.length).toBeGreaterThan(150);
    });

    for (const { pattern, desc } of BANNED_PATTERNS) {
      it(`no descBase template contains "${pattern}" (${desc})`, () => {
        const violations = entries.filter(({ text }) =>
          text.toLowerCase().includes(pattern.toLowerCase())
        );
        if (violations.length > 0) {
          const detail = violations
            .slice(0, 8)
            .map((v) => `  …${v.snippet.replace(/\n/g, '\\n')}…`)
            .join('\n');
          const more = violations.length > 8 ? `\n  (${violations.length - 8} more not shown)` : '';
          throw new Error(`Found "${pattern}" in ${violations.length} descBase template(s):\n${detail}${more}`);
        }
      });
    }
  });
});
