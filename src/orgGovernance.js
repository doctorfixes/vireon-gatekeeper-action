/**
 * Organizational Governance Engine
 * Aggregates repo-level baselines into org-level architecture intelligence.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const ORG_DIR = '.gatekeeper-org';
const ORG_BASELINE = join(ORG_DIR, 'org-baseline.json');
const ORG_HISTORY = join(ORG_DIR, 'org-history.json');
const ORG_METRICS = join(ORG_DIR, 'org-metrics.json');
const ORG_REPORT = join(ORG_DIR, 'org-report.md');

const DEFAULT_NAMING_CASE = 'kebab';
const STABILITY_THRESHOLD = 0.7;

// ─── Directory helpers ────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

/**
 * Aggregate an array of versioned repo baseline entries into a single
 * org-level baseline.
 *
 * @param {Array<{repo: string, data: {layers: string[], naming: {file_case: string}, boundaries: {edges: Object}}}>} repoBaselines
 * @returns {{layers: string[], naming: {file_case: string}, boundaries: {edges: string[]}}}
 */
function aggregateRepoBaselines(repoBaselines) {
  if (!repoBaselines || repoBaselines.length === 0) {
    return { layers: [], naming: { file_case: DEFAULT_NAMING_CASE }, boundaries: { edges: [] } };
  }

  const layers = new Set();
  const naming = {};
  const edges = new Set();

  repoBaselines.forEach(b => {
    const data = b.data || b;

    (data.layers || []).forEach(l => layers.add(l));

    const caseType = data.naming?.file_case;
    if (caseType) naming[caseType] = (naming[caseType] || 0) + 1;

    const edgesData = data.boundaries?.edges;
    if (edgesData) {
      const edgeKeys = Array.isArray(edgesData) ? edgesData : Object.keys(edgesData);
      edgeKeys.forEach(e => edges.add(e));
    }
  });

  const namingEntries = Object.entries(naming);
  const dominantNaming = namingEntries.length > 0
    ? namingEntries.sort((a, b) => b[1] - a[1])[0][0]
    : DEFAULT_NAMING_CASE;

  return {
    layers: Array.from(layers),
    naming: { file_case: dominantNaming },
    boundaries: { edges: Array.from(edges) },
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────────

/**
 * Save the org-level baseline and append an entry to org-history.
 * @param {Object} baseline  Result of aggregateRepoBaselines.
 * @returns {Object} The versioned org-baseline entry that was written.
 */
function saveOrgBaseline(baseline) {
  ensureDir(ORG_DIR);

  const versioned = {
    // version is a Unix-millisecond timestamp used as a monotonically-increasing identifier
    version: Date.now(),
    timestamp: new Date().toISOString(),
    data: baseline,
  };

  writeFileSync(ORG_BASELINE, JSON.stringify(versioned, null, 2), 'utf8');

  const history = loadOrgHistory();
  history.push(versioned);
  writeFileSync(ORG_HISTORY, JSON.stringify(history, null, 2), 'utf8');

  return versioned;
}

/**
 * Load the full org-level baseline history.
 * @returns {Array}
 */
function loadOrgHistory() {
  if (!existsSync(ORG_HISTORY)) return [];
  try {
    return JSON.parse(readFileSync(ORG_HISTORY, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Load the current org-level baseline (if any).
 * @returns {Object|null}
 */
function loadOrgBaseline() {
  if (!existsSync(ORG_BASELINE)) return null;
  try {
    return JSON.parse(readFileSync(ORG_BASELINE, 'utf8'));
  } catch {
    return null;
  }
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

/**
 * Compute org-level architecture metrics from the history and per-repo baselines.
 *
 * @param {Object} orgBaseline  The current aggregated org baseline.
 * @param {Array}  orgHistory   Full org history array.
 * @param {Array}  repoBaselines  Array of per-repo baselines (same format as aggregateRepoBaselines input).
 * @returns {Object} Metrics object written to org-metrics.json.
 */
function computeOrgMetrics(orgBaseline, orgHistory, repoBaselines) {
  const architectureStability = computeLayerStability(orgHistory);
  const namingStability = computeNamingStability(orgHistory);
  const boundaryStability = computeBoundaryStability(orgHistory);
  const driftTrend = deriveTrend(architectureStability, namingStability, boundaryStability);

  const repoScores = (repoBaselines || []).map(rb => ({
    repo: rb.repo || 'unknown',
    namingCase: (rb.data || rb).naming?.file_case ?? 'unknown',
    layerCount: ((rb.data || rb).layers || []).length,
    edgeCount: (() => {
      const e = (rb.data || rb).boundaries?.edges;
      if (!e) return 0;
      return Array.isArray(e) ? e.length : Object.keys(e).length;
    })(),
  }));

  const metrics = {
    generatedAt: new Date().toISOString(),
    architectureStability,
    namingStability,
    boundaryStability,
    driftTrend,
    repoScores,
    orgScore: Number(((architectureStability + namingStability + boundaryStability) / 3).toFixed(3)),
  };

  ensureDir(ORG_DIR);
  writeFileSync(ORG_METRICS, JSON.stringify(metrics, null, 2), 'utf8');

  return metrics;
}

function computeLayerStability(history) {
  if (history.length < 2) return 1.0;
  let changes = 0;
  for (let i = 1; i < history.length; i++) {
    const prev = new Set(history[i - 1].data?.layers || []);
    const curr = new Set(history[i].data?.layers || []);
    const added = [...curr].filter(l => !prev.has(l)).length;
    const removed = [...prev].filter(l => !curr.has(l)).length;
    if (added + removed > 0) changes++;
  }
  return Number((1 - changes / (history.length - 1)).toFixed(3));
}

function computeNamingStability(history) {
  if (history.length < 2) return 1.0;
  let changes = 0;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1].data?.naming?.file_case;
    const curr = history[i].data?.naming?.file_case;
    if (prev && curr && prev !== curr) changes++;
  }
  return Number((1 - changes / (history.length - 1)).toFixed(3));
}

function computeBoundaryStability(history) {
  if (history.length < 2) return 1.0;
  let changes = 0;
  for (let i = 1; i < history.length; i++) {
    const prevEdges = history[i - 1].data?.boundaries?.edges;
    const currEdges = history[i].data?.boundaries?.edges;
    const prev = new Set(Array.isArray(prevEdges) ? prevEdges : Object.keys(prevEdges || {}));
    const curr = new Set(Array.isArray(currEdges) ? currEdges : Object.keys(currEdges || {}));
    const added = [...curr].filter(e => !prev.has(e)).length;
    const removed = [...prev].filter(e => !curr.has(e)).length;
    if (added + removed > 0) changes++;
  }
  return Number((1 - changes / (history.length - 1)).toFixed(3));
}

function deriveTrend(architectureStability, namingStability, boundaryStability) {
  const avg = (architectureStability + namingStability + boundaryStability) / 3;
  if (avg >= 0.9) return 'stable';
  if (avg >= 0.7) return 'drifting';
  if (avg >= 0.5) return 'unstable';
  return 'critical';
}

// ─── Org-level report ─────────────────────────────────────────────────────────

/**
 * Generate the org-level architecture health report (Markdown) and write it
 * to .gatekeeper-org/org-report.md.
 *
 * @param {Object} orgBaseline   Current org-level baseline data (aggregated).
 * @param {Object} metrics       Output of computeOrgMetrics.
 * @param {Array}  repoBaselines Per-repo baseline entries.
 * @returns {string} The Markdown report string.
 */
function generateOrgReport(orgBaseline, metrics, repoBaselines) {
  const { architectureStability, namingStability, boundaryStability, driftTrend, repoScores, orgScore } = metrics;

  const stabilitySection = `
- **Architecture Stability:** \`${architectureStability.toFixed(2)}\`
- **Naming Stability:** \`${namingStability.toFixed(2)}\`
- **Boundary Stability:** \`${boundaryStability.toFixed(2)}\`
- **Org Score:** \`${orgScore.toFixed(2)}\`
`.trim();

  const layerList = orgBaseline.layers.length > 0
    ? orgBaseline.layers.join(', ')
    : '_none detected_';

  const edgeList = orgBaseline.boundaries.edges.length > 0
    ? orgBaseline.boundaries.edges.join(', ')
    : '_none detected_';

  const repoTable = repoScores.length > 0
    ? [
        '| Repo | Naming | Layers | Edges |',
        '|------|--------|--------|-------|',
        ...repoScores.map(r =>
          `| \`${r.repo}\` | \`${r.namingCase}\` | ${r.layerCount} | ${r.edgeCount} |`
        ),
      ].join('\n')
    : '_No per-repo data available._';

  const outliers = repoScores.filter(r => {
    const isNamingOutlier = r.namingCase !== orgBaseline.naming.file_case;
    return isNamingOutlier;
  });

  const outlierSection = outliers.length > 0
    ? outliers.map(r =>
        `- \`${r.repo}\` uses \`${r.namingCase}\` naming (org standard: \`${orgBaseline.naming.file_case}\`)`
      ).join('\n')
    : '_No naming outliers detected._';

  const recommendations = generateOrgRecommendations(metrics);

  const report = `# 🏛️ Organizational Architecture Health Report

Generated automatically by Gatekeeper — org-level governance intelligence.

---

## 📊 Org-Level Stability Overview

${stabilitySection}

**Overall Trend:** \`${driftTrend}\`

---

## 🧱 Aggregated Org Architecture Baseline

**Observed Layers (union across all repos):**
\`${layerList}\`

**Dominant Naming Convention:**
\`${orgBaseline.naming.file_case}\`

**Observed Dependency Edges:**
\`${edgeList}\`

---

## 🗂️ Per-Repo Architecture Summary

${repoTable}

---

## ⚠️ Naming Convention Outliers

${outlierSection}

---

## 🧭 Recommended Interventions

${recommendations}

---

Gatekeeper — institutional architecture governance for modern codebases.
`;

  ensureDir(ORG_DIR);
  writeFileSync(ORG_REPORT, report, 'utf8');

  return report;
}

function generateOrgRecommendations(metrics) {
  const { architectureStability, namingStability, boundaryStability, driftTrend } = metrics;
  const recs = [];

  if (architectureStability < STABILITY_THRESHOLD) {
    recs.push(
      'Layer structure is inconsistent across repos. Consider establishing a shared architecture standard.'
    );
  }

  if (namingStability < STABILITY_THRESHOLD) {
    recs.push(
      'Naming conventions are diverging across the organization. Define and enforce an org-wide naming standard.'
    );
  }

  if (boundaryStability < STABILITY_THRESHOLD) {
    recs.push(
      'Dependency boundaries are shifting. Review module coupling across repos and enforce boundary rules.'
    );
  }

  if (driftTrend === 'critical') {
    recs.push(
      'Org-wide architecture is in a critical drift state. An architecture review across all repos is strongly recommended.'
    );
  }

  if (recs.length === 0) {
    return '_No interventions recommended — org architecture appears stable._';
  }

  return recs.map(r => `- ${r}`).join('\n');
}

export {
  aggregateRepoBaselines,
  saveOrgBaseline,
  loadOrgBaseline,
  loadOrgHistory,
  computeOrgMetrics,
  generateOrgReport,
};
