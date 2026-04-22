/**
 * Baseline Lifecycle Manager
 * Handles versioning, history, and diffing of architecture baselines.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASELINE_DIR = '.gatekeeper';
const BASELINE_FILE = join(BASELINE_DIR, 'baseline.json');
const HISTORY_FILE = join(BASELINE_DIR, 'history.json');

/**
 * Load the current baseline (if any).
 * @returns {Object|null}
 */
function loadBaseline() {
  if (!existsSync(BASELINE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Save a new baseline and append to history.
 * @param {Object} baseline  Raw baseline data (layers, naming, boundaries).
 * @param {string} [commitHash]  Optional commit SHA to associate with the snapshot.
 * @returns {Object} The versioned baseline entry that was written.
 */
function saveBaseline(baseline, commitHash) {
  ensureDir(BASELINE_DIR);

  const versioned = {
    version: Date.now(),
    commit: commitHash || null,
    timestamp: new Date().toISOString(),
    data: baseline,
  };

  writeFileSync(BASELINE_FILE, JSON.stringify(versioned, null, 2), 'utf8');

  const history = loadHistory();
  history.push(versioned);
  writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');

  return versioned;
}

/**
 * Load the full baseline history.
 * @returns {Array}
 */
function loadHistory() {
  if (!existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(readFileSync(HISTORY_FILE, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Compare two versioned baseline entries and return a list of drift descriptions.
 * @param {Object} oldBase  A versioned baseline (as returned by saveBaseline).
 * @param {Object} newBase  A versioned baseline (as returned by saveBaseline).
 * @returns {string[]} Array of human-readable drift descriptions.
 */
function diffBaselines(oldBase, newBase) {
  const diffs = [];

  const oldLayers = oldBase.data.layers || [];
  const newLayers = newBase.data.layers || [];

  const addedLayers = newLayers.filter(l => !oldLayers.includes(l));
  const removedLayers = oldLayers.filter(l => !newLayers.includes(l));

  if (addedLayers.length > 0) diffs.push(`New layers: ${addedLayers.join(', ')}`);
  if (removedLayers.length > 0) diffs.push(`Removed layers: ${removedLayers.join(', ')}`);

  const oldNaming = oldBase.data.naming?.file_case;
  const newNaming = newBase.data.naming?.file_case;
  if (oldNaming && newNaming && oldNaming !== newNaming) {
    diffs.push(`Naming changed: ${oldNaming} → ${newNaming}`);
  }

  const oldEdges = Object.keys(oldBase.data.boundaries?.edges || {});
  const newEdges = Object.keys(newBase.data.boundaries?.edges || {});

  const addedEdges = newEdges.filter(e => !oldEdges.includes(e));
  const removedEdges = oldEdges.filter(e => !newEdges.includes(e));

  if (addedEdges.length > 0) diffs.push(`New dependency edges: ${addedEdges.join(', ')}`);
  if (removedEdges.length > 0) diffs.push(`Removed dependency edges: ${removedEdges.join(', ')}`);

  return diffs;
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export { loadBaseline, saveBaseline, loadHistory, diffBaselines };
