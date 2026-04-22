/**
 * Repo-Learning Rule Pack
 * Loads the inferred baseline and flags PR changes that deviate from the
 * repository's learned architecture, naming conventions, and module boundaries.
 */

import { loadBaseline } from '../src/inferenceEngine.js';
import { basename, extname } from 'path';

const CASE_PATTERNS = {
  kebab: /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
  snake: /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/,
  camel: /^[a-z][a-zA-Z0-9]*$/,
  pascal: /^[A-Z][a-zA-Z0-9]*$/,
};

function parseDiff(diff) {
  const fileDiffs = [];
  const fileBlocks = diff.split(/^diff --git /m).filter(Boolean);

  for (const block of fileBlocks) {
    const headerMatch = block.match(/^a\/(.+?)\s+b\/(.+?)$/m);
    if (!headerMatch) continue;

    const fromPath = headerMatch[1].trim();
    const toPath = headerMatch[2].trim();
    const lines = block.split('\n');

    const isNew = lines.some(l => l.startsWith('new file'));
    const addedLines = lines
      .filter(l => l.startsWith('+') && !l.startsWith('+++'))
      .map(l => l.slice(1));

    fileDiffs.push({ fromPath, toPath, isNew, addedLines });
  }

  return fileDiffs;
}

function layerFor(filePath, layers) {
  const normalised = filePath.replace(/\\/g, '/');
  const parts = normalised.split('/');
  return layers.find(l => parts.includes(l)) ?? null;
}

function extractNewDeps(addedLines) {
  const deps = [];
  const re = /(?:import\s.*?from\s+['"]|require\s*\(['"])(\.\.?\/[^'"]+)['"]/g;
  for (const line of addedLines) {
    let m;
    while ((m = re.exec(line)) !== null) {
      deps.push(m[1]);
    }
  }
  return deps;
}

export default {
  id: 'repo-learning',
  description: 'Flags PR changes that deviate from the inferred baseline architecture and conventions.',

  check(context) {
    const { diff = '' } = context;

    const baseline = loadBaseline();
    if (!baseline) {
      return {
        passed: true,
        messages: ['repo-learning: No baseline found — skipping inferred checks. Run build_baseline to establish one.'],
        metadata: { findings: [] },
      };
    }

    const { layers = [], naming = {}, boundaries = {} } = baseline;
    const allowedEdges = new Set(Object.keys(boundaries.edges || {}));

    const fileDiffs = parseDiff(diff);
    const messages = [];
    const findings = [];

    for (const { toPath, isNew, addedLines } of fileDiffs) {
      // ── Naming convention check on new files ───────────────────────────
      if (isNew && naming.file_case) {
        const base = basename(toPath, extname(toPath));
        const pattern = CASE_PATTERNS[naming.file_case];
        if (pattern && !pattern.test(base)) {
          messages.push({
            rule: 'repo-learning',
            message: `New file "${toPath}" does not match inferred ${naming.file_case}-case naming convention`,
            why: `The repository predominantly uses ${naming.file_case}-case filenames. Consistent naming was learned from the existing codebase.`,
          });
          findings.push({ type: 'inferred_naming_violation', detail: `"${toPath}" violates inferred ${naming.file_case}-case convention` });
        }
      }

      // ── Boundary check on new dependencies ────────────────────────────
      if (layers.length > 0) {
        const fromLayer = layerFor(toPath, layers);
        const newDeps = extractNewDeps(addedLines);

        for (const dep of newDeps) {
          const toLayer = layerFor(dep, layers);
          if (!fromLayer || !toLayer || fromLayer === toLayer) continue;

          const edge = `${fromLayer}->${toLayer}`;
          if (!allowedEdges.has(edge)) {
            messages.push({
              rule: 'repo-learning',
              message: `Inferred boundary violation in "${toPath}": "${fromLayer}" → "${toLayer}" was not observed in the baseline`,
              why: `The baseline recorded only these cross-layer edges: ${[...allowedEdges].join(', ') || '(none)'}. This new dependency introduces an unrecognized direction.`,
            });
            findings.push({ type: 'inferred_boundary_violation', detail: `"${toPath}" introduces new cross-layer dependency "${fromLayer}" → "${toLayer}"` });
          }
        }
      }
    }

    const passed = findings.length === 0;

    return {
      passed,
      messages,
      driftScore: findings.length > 0 ? Math.min(1, findings.length * 0.2) : 0,
      metadata: { findings },
    };
  },
};
