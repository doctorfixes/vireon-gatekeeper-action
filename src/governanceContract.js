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

/**
 * Governance Contract Renderer
 * Renders the governance contract state into a PR comment.
 *
 * @param {Object} contract - The governance contract object (reserved for future use).
 * @param {Object} state - Current governance state.
 * @param {'strict'|'advisory'|'hybrid'} state.enforcementMode
 * @param {'frozen'|'pr-approved'|'auto-learn'} state.baselineMode
 * @param {'core'|'local'|'org'} state.ruleAuthority
 * @param {{ active: boolean, items: Array<{rule: string, expires: string}> }} state.waiverStatus
 * @param {string} state.contractVersion
 * @param {boolean} state.baselineFrozen
 * @param {boolean} state.baselinePendingUpdate
 * @returns {string} Markdown string for use in a PR comment.
 */
function renderGovernanceContract(contract, state) {
  const {
    enforcementMode,
    baselineMode,
    ruleAuthority,
    waiverStatus,
    contractVersion,
    baselineFrozen,
    baselinePendingUpdate
  } = state;

  return `
### 🏛️ Gatekeeper Governance Contract

**Contract Version:** \`${contractVersion}\`  
**Enforcement Mode:** \`${enforcementMode}\`  
**Baseline Mode:** \`${baselineMode}\`  
**Baseline Frozen:** \`${baselineFrozen ? "yes" : "no"}\`  
**Pending Baseline Update:** \`${baselinePendingUpdate ? "yes" : "no"}\`  
**Waivers Active:** \`${waiverStatus.active ? "yes" : "no"}\`  
**Rule Authority:** \`${ruleAuthority}\`

---

## 🔐 Governance Authority Model

- **Repo Maintainers:**  
  Can approve baseline updates, rule changes, waivers, and freezes.

- **Org Governance Group:**  
  Controls org‑level baselines, org rule packs, and cross‑repo governance.

- **Gatekeeper Engine:**  
  Executes rules, computes drift, generates reports.  
  **Cannot modify governance without human approval.**

---

## 🧱 Baseline Governance

**Baseline Mode:** \`${baselineMode}\`

- **frozen** — no learning, no updates, enforcement only  
- **pr-approved** — Gatekeeper proposes updates, humans approve  
- **auto-learn** — Gatekeeper updates baseline automatically  

**Current State:**  
${baselineFrozen ? "🔒 Baseline is frozen" : "🟢 Baseline is active"}

${
  baselinePendingUpdate
    ? "⚠️ A baseline update is pending human approval."
    : "No pending baseline updates."
}

---

## 📜 Rule Pack Governance

**Authority:** \`${ruleAuthority}\`

- **core** — only maintainers/org governance may modify  
- **local** — repo maintainers may modify  
- **org** — org governance only  

Gatekeeper will **never** enforce a rule pack that exceeds its authority.

---

## 🛡️ Enforcement Contract

**Mode:** \`${enforcementMode}\`

- **strict** — violations block merges  
- **advisory** — violations surface but do not block  
- **hybrid** — critical rules strict, others advisory  

Gatekeeper will **never** silently escalate enforcement.

---

## 🕊️ Waiver & Exception System

**Waivers Active:** \`${waiverStatus.active ? "yes" : "no"}\`

${
  waiverStatus.active
    ? waiverStatus.items
        .map(w => `- \`${w.rule}\` — expires ${w.expires}`)
        .join("\n")
    : "_No waivers currently active._"
}

Waiver Types:
- file‑level ignore (`.gatekeeper-ignore`)  
- rule‑level waiver (`gatekeeper-waive:rule-id`)  
- time‑boxed waiver (`gatekeeper-waive:7d`)  
- baseline freeze (`gatekeeper-baseline-freeze`)  

---

## 🔍 Transparency & Reversibility

Gatekeeper guarantees:

- no silent baseline updates  
- no silent rule changes  
- no silent enforcement changes  
- all governance actions logged  
- all governance actions reversible  

This renderer ensures governance is **visible, explainable, and auditable**.

---

Gatekeeper — deterministic, explainable, reversible governance for modern codebases.
`;
}

export { classifyDrift, shouldBlockMerge, driftLevelLabel, normaliseBaselineMode, DEFAULT_THRESHOLDS, renderGovernanceContract };
