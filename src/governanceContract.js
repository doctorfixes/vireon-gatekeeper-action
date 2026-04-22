/**
 * Governance Contract
 * Implements the constitutional layer for deterministic, explainable, reversible
 * governance as defined in the Gatekeeper Governance Contract (v1).
 *
 * Responsibilities:
 *   - Drift classification (Low / Moderate / High / Critical)
 *   - Blocking decision per enforcement mode (strict / advisory / hybrid)
 *   - Baseline mode validation (frozen / pr-approved / auto-learn)
 */

/** @type {Object} Default risk-score thresholds (0-100 scale) per drift level. */
const DEFAULT_THRESHOLDS = { low: 20, moderate: 40, high: 60, critical: 80 };

/**
 * Valid baseline modes as defined in the Governance Contract.
 *   frozen      — no learning, no updates, enforcement only
 *   pr-approved — Gatekeeper proposes baseline changes; maintainer must approve
 *   auto-learn  — baseline updated automatically (early-stage repos)
 */
const BASELINE_MODES = new Set(['frozen', 'pr-approved', 'auto-learn']);

/**
 * Classify a 0–100 risk score into a governance drift level.
 *
 * @param {number} riskScore - Integer 0–100 produced by the issue-count formula.
 * @param {Object} [thresholds] - Custom {low, moderate, high, critical} thresholds.
 * @returns {'none'|'low'|'moderate'|'high'|'critical'}
 */
function classifyDrift(riskScore, thresholds = {}) {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  if (riskScore >= t.critical) return 'critical';
  if (riskScore >= t.high) return 'high';
  if (riskScore >= t.moderate) return 'moderate';
  if (riskScore >= t.low) return 'low';
  return 'none';
}

/**
 * Determine whether a given result should block a merge.
 *
 * Strict mode  — any failure blocks.
 * Advisory mode — nothing blocks.
 * Hybrid mode   — only failures in `hybridCriticalRules` block.
 *
 * @param {string} verdict - 'pass' | 'fail'
 * @param {'strict'|'advisory'|'hybrid'} mode
 * @param {string[]} hybridCriticalRules - Rule IDs that are critical in hybrid mode.
 * @param {string[]} failedRuleIds - Rule IDs that actually produced failures.
 * @returns {boolean}
 */
function shouldBlockMerge(verdict, mode, hybridCriticalRules = [], failedRuleIds = []) {
  if (verdict !== 'fail') return false;
  if (mode === 'advisory') return false;
  if (mode === 'hybrid') {
    return failedRuleIds.some((id) => hybridCriticalRules.includes(id));
  }
  // strict (default)
  return true;
}

/**
 * Return a human-readable label and emoji for a drift level.
 *
 * @param {'none'|'low'|'moderate'|'high'|'critical'} level
 * @returns {string}
 */
function driftLevelLabel(level) {
  switch (level) {
    case 'none':     return '✅ None';
    case 'low':      return '🟡 Low';
    case 'moderate': return '🟠 Moderate';
    case 'high':     return '🔴 High';
    case 'critical': return '🚨 Critical';
    default:         return String(level);
  }
}

/**
 * Validate and normalise a baseline_mode value.
 * Falls back to 'pr-approved' if the value is unrecognised.
 *
 * @param {string} mode
 * @returns {'frozen'|'pr-approved'|'auto-learn'}
 */
function normaliseBaselineMode(mode) {
  return BASELINE_MODES.has(mode) ? mode : 'pr-approved';
}

export { classifyDrift, shouldBlockMerge, driftLevelLabel, normaliseBaselineMode, DEFAULT_THRESHOLDS };
