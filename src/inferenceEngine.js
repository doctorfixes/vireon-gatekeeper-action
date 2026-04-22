/**
 * Inference Engine
 * Scans the repository to learn its de‑facto architecture and conventions,
 * then persists a baseline that is used to flag PR deviations.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, sep, basename, extname } from 'path';
import { saveBaseline, loadBaseline as lifecycleLoadBaseline } from './baselineLifecycle.js';

const IGNORE_DIRS = new Set([
  '.git', 'node_modules', '.github', 'dist', 'build', 'coverage', '.cache',
]);

const SOURCE_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
]);

// ─── File walking ──────────────────────────────────────────────────────────

function walkFiles(dir, results = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, results);
    } else {
      results.push(fullPath);
    }
  }

  return results;
}

// ─── Dependency extraction ─────────────────────────────────────────────────

function extractDepsFromFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (!SOURCE_EXTENSIONS.has(ext)) return [];

  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const deps = [];
  const re = /(?:import\s.*?from\s+['"]|require\s*\(['"])(\.\.?\/[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    deps.push(m[1]);
  }
  return deps;
}

function buildDepGraph(allFiles) {
  const graph = {};
  for (const file of allFiles) {
    const deps = extractDepsFromFile(file);
    if (deps.length > 0) {
      graph[file] = deps;
    }
  }
  return graph;
}

// ─── Pattern inference ─────────────────────────────────────────────────────

function inferLayers(files) {
  const candidates = {};
  files.forEach(f => {
    const parts = f.split(sep);
    parts.forEach(p => {
      if (!p || p.startsWith('.') || p.includes('.')) return;
      candidates[p] = (candidates[p] || 0) + 1;
    });
  });

  return Object.entries(candidates)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name]) => name);
}

function inferNaming(files) {
  const patterns = { kebab: 0, snake: 0, camel: 0, pascal: 0 };

  files.forEach(f => {
    const base = basename(f, extname(f));
    if (base.includes('-')) patterns.kebab++;
    else if (base.includes('_')) patterns.snake++;
    else if (/^[A-Z][a-zA-Z0-9]*$/.test(base)) patterns.pascal++;
    else if (/^[a-z][a-zA-Z0-9]*$/.test(base)) patterns.camel++;
  });

  const dominant = Object.entries(patterns).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'kebab';
  return { file_case: dominant };
}

function layerFor(filePath, layers) {
  const parts = filePath.split(sep);
  return layers.find(l => parts.includes(l)) ?? null;
}

function inferBoundaries(graph, layers) {
  const edges = {};

  for (const file in graph) {
    const fromLayer = layerFor(file, layers);
    graph[file].forEach(dep => {
      const toLayer = layerFor(dep, layers);
      if (!fromLayer || !toLayer || fromLayer === toLayer) return;
      const key = `${fromLayer}->${toLayer}`;
      edges[key] = (edges[key] || 0) + 1;
    });
  }

  return { edges };
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Build and persist a baseline from a pre-built context.
 * @param {{ allFiles: string[], dependencyGraph: Object, commitHash?: string }} context
 * @returns {Object} The raw baseline data (layers, naming, boundaries)
 */
function buildBaseline(context) {
  const { allFiles, dependencyGraph, commitHash } = context;

  const layers = inferLayers(allFiles);
  const naming = inferNaming(allFiles);
  const boundaries = inferBoundaries(dependencyGraph, layers);

  const baseline = { layers, naming, boundaries };

  saveBaseline(baseline, commitHash);

  return baseline;
}

/**
 * Scan the repository rooted at `repoRoot`, infer patterns, and persist the
 * baseline.  This is the convenience entry-point for the baseline-build step.
 * @param {string} repoRoot  Absolute or relative path to the repo root.
 * @param {string} [commitHash]  Optional commit SHA to associate with the snapshot.
 * @returns {Object} The raw baseline data (layers, naming, boundaries)
 */
function buildBaselineFromRepo(repoRoot = '.', commitHash) {
  const allFiles = walkFiles(repoRoot);
  const dependencyGraph = buildDepGraph(allFiles);
  return buildBaseline({ allFiles, dependencyGraph, commitHash });
}

/**
 * Load a previously persisted baseline.
 * @returns {Object|null} The versioned baseline entry, or null if none exists.
 */
function loadBaseline() {
  return lifecycleLoadBaseline();
}

export { buildBaseline, buildBaselineFromRepo, loadBaseline };
