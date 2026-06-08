#!/usr/bin/env node
// Port desc-base templates from an authoring source into the descBase
// field of OptionEntry objects in target .ts files. Supports two source
// formats:
//   - r3-sub-ext-authoring.md (one set per `Set N — ABSENCE_FOO` heading)
//   - analysis.md (sets nested inside class-bounded sections;
//                  set headings use backtick-quoted signal names)
//
// Usage:
//   node __port-desc-bases.mjs --source <file.md> [--class <N>] <target1.ts> [<target2.ts> ...]
//
//   --source   path to authoring markdown
//   --class    optional integer (1-9) — only port templates from
//              `##### R3.N-SubN.6` section through the next `##### `
//              boundary. Used to port one class per commit when the
//              source is the consolidated analysis file.

import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const args = argv.slice(2);
let sourcePath = null;
let classNumber = null;
const targets = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--source')     sourcePath = args[++i];
  else if (args[i] === '--class') classNumber = Number(args[++i]);
  else                            targets.push(args[i]);
}
if (!sourcePath || targets.length === 0) {
  console.error('Usage: node __port-desc-bases.mjs --source <file.md> [--class N] <target1.ts> [...]');
  exit(1);
}

// ─── Source extraction ─────────────────────────────────────────────────────

function parseAuthoring(path, classNum) {
  const src = readFileSync(path, 'utf-8');
  const lines = src.split('\n');

  // Class scoping (analysis file only): bound the line range to the
  // `##### R3.<classNum>-Sub<classNum>.6` section through the next
  // `##### ` header or end of file.
  let startLine = 0;
  let endLine = lines.length;
  if (classNum !== null) {
    // The analysis file's "Candidate desc-bases" subsection number varies
    // by class (Class 1+2 use .6, Classes 3-9 use .4). Match by the title
    // text "Candidate desc-bases" rather than the subsection number, but
    // scope to the matching R3.N-SubN class prefix so we never bleed
    // across class boundaries.
    const sectionHeader = new RegExp(
      `^#####\\s+R3\\.${classNum}-Sub${classNum}\\.\\d+\\s+—\\s+Candidate desc-bases\\b`,
    );
    const startIdx = lines.findIndex((l) => sectionHeader.test(l));
    if (startIdx === -1) {
      console.error(`Class ${classNum} candidate desc-bases section not found (looking for "##### R3.${classNum}-Sub${classNum}.<N> — Candidate desc-bases")`);
      exit(1);
    }
    startLine = startIdx;
    // Find next `##### ` header after startLine to bound the section.
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (/^#####\s/.test(lines[i])) {
        endLine = i;
        break;
      }
    }
  }

  const templates = {};
  let currentSet = null;

  for (let i = startLine; i < endLine; i++) {
    const line = lines[i];

    // Set heading variants:
    //   `Set N — ABSENCE_FOO`
    //   `Set N — \`IDEA_TO_PRD\``
    //   `Set N: ABSENCE_FOO`
    //   `Six authored desc-bases for ABSENCE_FOO`
    let setName = null;
    let m = line.match(/Set\s+\d+\s*[—-]\s*`([A-Z][A-Z0-9_]+)`/);
    if (m) setName = m[1];
    if (!setName) {
      m = line.match(/Set\s+\d+[:\s—-]+(ABSENCE_[A-Z_]+)\b/);
      if (m) setName = m[1];
    }
    if (!setName) {
      m = line.match(/desc-bases\s+for\s+(ABSENCE_[A-Z_]+)/);
      if (m) setName = m[1];
    }
    if (setName) {
      currentSet = setName;
      if (!templates[currentSet]) {
        templates[currentSet] = { L1: [], L2: [], L3: [] };
      }
      continue;
    }

    if (!currentSet) continue;

    // Format A: bold-prefixed tier marker followed by its own code fence.
    //   **L1[0]** HEAVY:
    //   ```
    //   {R4_OPEN}
    //   ...
    //   {R4_CLOSE}
    //   ```
    const tierMatchA = line.match(/^\*\*(L[123])\[(\d+)\]\*\*[^\n]*?\b(HEAVY|MEDIUM|LIGHT)\b/);
    if (tierMatchA) {
      const tier = tierMatchA[1];
      const idx  = Number(tierMatchA[2]);
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('```')) j++;
      if (j >= lines.length) continue;
      const start = j + 1;
      let end = start;
      while (end < lines.length && !lines[end].startsWith('```')) end++;
      const template = lines.slice(start, end).join('\n');
      while (templates[currentSet][tier].length <= idx) {
        templates[currentSet][tier].push(undefined);
      }
      templates[currentSet][tier][idx] = template;
      continue;
    }

    // Format B: consolidated code fence — all tiers for a set inside one
    // fence, with tier markers as plain-text lines inside the fence.
    //   ```
    //   L1[0] MEDIUM-HEAVY:
    //   {R4_OPEN}
    //   ...
    //   {R4_CLOSE}
    //
    //   L1[1] MEDIUM:
    //   {R4_OPEN}
    //   ...
    //   {R4_CLOSE}
    //   ```
    // Trigger: a code-fence opener line where the NEXT non-blank line
    // matches `L[123][i] <tier-label>:`.
    if (line === '```' || line.startsWith('```')) {
      // Look ahead for an inner tier marker `L[123][i] ...`.
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === '') j++;
      if (j >= lines.length) continue;
      const peek = lines[j].match(/^(L[123])\[(\d+)\]\s+\S/);
      if (peek) {
        // Consolidated format. Walk inside the fence, parsing tier
        // markers and the content between them.
        let fenceEnd = i + 1;
        while (fenceEnd < lines.length && !lines[fenceEnd].startsWith('```')) fenceEnd++;
        // Collect blocks: each block starts at an inner tier marker and
        // ends before the next inner tier marker (or at fenceEnd).
        const innerTierRe = /^(L[123])\[(\d+)\]\s+\S/;
        const innerMarkers = [];
        for (let k = i + 1; k < fenceEnd; k++) {
          if (innerTierRe.test(lines[k])) innerMarkers.push(k);
        }
        for (let mi = 0; mi < innerMarkers.length; mi++) {
          const markerLine = innerMarkers[mi];
          const m = lines[markerLine].match(/^(L[123])\[(\d+)\]/);
          if (!m) continue;
          const tier = m[1];
          const idx  = Number(m[2]);
          const blockStart = markerLine + 1;
          const blockEnd   = mi + 1 < innerMarkers.length ? innerMarkers[mi + 1] : fenceEnd;
          // Trim trailing blank lines from the block.
          let realEnd = blockEnd;
          while (realEnd > blockStart && lines[realEnd - 1].trim() === '') realEnd--;
          const template = lines.slice(blockStart, realEnd).join('\n');
          while (templates[currentSet][tier].length <= idx) {
            templates[currentSet][tier].push(undefined);
          }
          templates[currentSet][tier][idx] = template;
        }
        i = fenceEnd;
        continue;
      }
    }
  }

  return templates;
}

// ─── Target port ───────────────────────────────────────────────────────────

function portTarget(path, templates) {
  const src = readFileSync(path, 'utf-8');
  const lines = src.split('\n');
  const out = [];

  let currentSet = null;
  let currentTier = null;
  let tierIndex = 0;
  let portedCount = 0;
  let skippedNoTemplate = 0;
  let skippedAlreadyPorted = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const setMatch = line.match(/^(?:export\s+)?const\s+([A-Z][A-Z0-9_]+):\s*DecisionContent\s*=\s*\{/);
    if (setMatch) {
      currentSet = setMatch[1];
      currentTier = null;
      tierIndex = 0;
      out.push(line);
      continue;
    }
    if (currentSet && /^\};/.test(line)) {
      currentSet = null;
      currentTier = null;
      out.push(line);
      continue;
    }
    if (!currentSet) { out.push(line); continue; }

    const tierMatch = line.match(/^\s*(L[123]):\s*\[/);
    if (tierMatch) {
      currentTier = tierMatch[1];
      tierIndex = 0;
      out.push(line);
      continue;
    }
    if (currentTier && /^\s*\],/.test(line)) {
      currentTier = null;
      out.push(line);
      continue;
    }

    function applyTemplate(indent, optionText, quoteChar) {
      const setTemplates = templates[currentSet];
      const template = setTemplates?.[currentTier]?.[tierIndex];
      if (template !== undefined) {
        // Escape backticks, backslashes, and `${` for the template-literal
        // wrapper.
        const escaped = template
          .replace(/\\/g, '\\\\')
          .replace(/`/g, '\\`')
          .replace(/\$\{/g, '\\${');
        const literal = '`' + escaped + '`';
        out.push(`${indent}{`);
        out.push(`${indent}  option: ${quoteChar}${optionText}${quoteChar},`);
        out.push(`${indent}  descBase: ${literal},`);
        out.push(`${indent}},`);
        portedCount++;
        tierIndex++;
        return true;
      }
      skippedNoTemplate++;
      tierIndex++;
      return false;
    }

    const emptyMatch = line.match(/^(\s*)\{ option: '((?:[^'\\]|\\.)*)', descBase: '' \},?\s*$/);
    if (emptyMatch && currentTier) {
      if (!applyTemplate(emptyMatch[1], emptyMatch[2], "'")) out.push(line);
      continue;
    }
    const emptyMatchDQ = line.match(/^(\s*)\{ option: "((?:[^"\\]|\\.)*)", descBase: '' \},?\s*$/);
    if (emptyMatchDQ && currentTier) {
      if (!applyTemplate(emptyMatchDQ[1], emptyMatchDQ[2], '"')) out.push(line);
      continue;
    }

    // Already-ported multi-line entry (starts with `{` line alone)
    if (currentTier && /^\s*\{\s*$/.test(line)) {
      out.push(line);
      let j = i + 1;
      while (j < lines.length && !/^\s*\},\s*$/.test(lines[j])) {
        out.push(lines[j]);
        j++;
      }
      if (j < lines.length) out.push(lines[j]);
      i = j;
      tierIndex++;
      skippedAlreadyPorted++;
      continue;
    }

    out.push(line);
  }

  writeFileSync(path, out.join('\n'), 'utf-8');
  return { portedCount, skippedNoTemplate, skippedAlreadyPorted };
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

const templates = parseAuthoring(sourcePath, classNumber);
const setCount = Object.keys(templates).length;
console.log(`Source: ${sourcePath}${classNumber !== null ? ` (class ${classNumber} only)` : ''}`);
console.log(`Extracted templates for ${setCount} sets.`);

let totalPorted = 0;
for (const target of targets) {
  const result = portTarget(target, templates);
  console.log(`${target}: ported=${result.portedCount}, skipped(no-template)=${result.skippedNoTemplate}, skipped(already-ported)=${result.skippedAlreadyPorted}`);
  totalPorted += result.portedCount;
}
console.log(`---`);
console.log(`Total ported: ${totalPorted}`);
