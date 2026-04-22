/**
 * Governance Contract
 * Implements the constitutional layer for deterministic, explainable, reversible
 * governance as defined in the Gatekeeper Governance Contract (v2).
 *
 * Responsibilities:
 *   - Drift classification (Low / Moderate / High / Critical)
 *   - Blocking decision per enforcement mode (strict / advisory / hybrid)
 *   - Baseline mode validation (frozen / pr-approved / auto-learn)
 *   - Governance contract enforcement (authority, waivers, org governance)
 */

import { GOVERNANCE_CONTRACT_DEFAULTS } from './loadGovernanceContract.js';

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
 * Renders the governance contract state into a PR comment section.
 * Sections are shown or hidden according to the contract's transparency settings.
 *
 * @param {Object|null} contract - The loaded governance contract (v2 schema).  Pass
 *   `null` to render all sections (backward-compatible default).
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

  // Transparency flags — default all true when no contract is supplied.
  const t = contract?.transparency ?? {};
  const showGovernanceState = t.showGovernanceState !== false;
  const showBaselineState   = t.showBaselineState   !== false;
  const showWaivers         = t.showWaivers         !== false;
  const showAuthority       = t.showAuthority       !== false;

  const sections = [];

  sections.push(`### 🏛️ Gatekeeper Governance Contract`);
  sections.push('');

  if (showGovernanceState) {
    sections.push(
      `**Contract Version:** \`${contractVersion}\`  `,
      `**Enforcement Mode:** \`${enforcementMode}\`  `,
      `**Baseline Mode:** \`${baselineMode}\`  `,
      `**Baseline Frozen:** \`${baselineFrozen ? "yes" : "no"}\`  `,
      `**Pending Baseline Update:** \`${baselinePendingUpdate ? "yes" : "no"}\`  `,
      `**Waivers Active:** \`${waiverStatus.active ? "yes" : "no"}\`  `,
      `**Rule Authority:** \`${ruleAuthority}\``,
      '',
      '---',
      ''
    );
  }

  if (showAuthority) {
    sections.push(
      `## 🔐 Governance Authority Model`,
      '',
      `- **Repo Maintainers:**  `,
      `  Can approve baseline updates, rule changes, waivers, and freezes.`,
      '',
      `- **Org Governance Group:**  `,
      `  Controls org‑level baselines, org rule packs, and cross‑repo governance.`,
      '',
      `- **Gatekeeper Engine:**  `,
      `  Executes rules, computes drift, generates reports.  `,
      `  **Cannot modify governance without human approval.**`,
      '',
      '---',
      ''
    );
  }

  if (showBaselineState) {
    sections.push(
      `## 🧱 Baseline Governance`,
      '',
      `**Baseline Mode:** \`${baselineMode}\``,
      '',
      `- **frozen** — no learning, no updates, enforcement only  `,
      `- **pr-approved** — Gatekeeper proposes updates, humans approve  `,
      `- **auto-learn** — Gatekeeper updates baseline automatically  `,
      '',
      `**Current State:**  `,
      baselineFrozen ? `🔒 Baseline is frozen` : `🟢 Baseline is active`,
      '',
      baselinePendingUpdate
        ? `⚠️ A baseline update is pending human approval.`
        : `No pending baseline updates.`,
      '',
      '---',
      '',
      `## 📜 Rule Pack Governance`,
      '',
      `**Authority:** \`${ruleAuthority}\``,
      '',
      `- **core** — only maintainers/org governance may modify  `,
      `- **local** — repo maintainers may modify  `,
      `- **org** — org governance only  `,
      '',
      `Gatekeeper will **never** enforce a rule pack that exceeds its authority.`,
      '',
      '---',
      '',
      `## 🛡️ Enforcement Contract`,
      '',
      `**Mode:** \`${enforcementMode}\``,
      '',
      `- **strict** — violations block merges  `,
      `- **advisory** — violations surface but do not block  `,
      `- **hybrid** — critical rules strict, others advisory  `,
      '',
      `Gatekeeper will **never** silently escalate enforcement.`,
      '',
      '---',
      ''
    );
  }

  if (showWaivers) {
    const waiverLines = waiverStatus.active
      ? waiverStatus.items.map(w => `- \`${w.rule}\` — expires ${w.expires}`).join('\n')
      : '_No waivers currently active._';

    sections.push(
      `## 🕊️ Waiver & Exception System`,
      '',
      `**Waivers Active:** \`${waiverStatus.active ? "yes" : "no"}\``,
      '',
      waiverLines,
      '',
      `Waiver Types:`,
      `- file‑level ignore (\`.gatekeeper-ignore\`)  `,
      `- rule‑level waiver (\`gatekeeper-waive:rule-id\`)  `,
      `- time‑boxed waiver (\`gatekeeper-waive:7d\`)  `,
      `- baseline freeze (\`gatekeeper-baseline-freeze\`)  `,
      '',
      '---',
      ''
    );
  }

  sections.push(
    `## 🔍 Transparency & Reversibility`,
    '',
    `Gatekeeper guarantees:`,
    '',
    `- no silent baseline updates  `,
    `- no silent rule changes  `,
    `- no silent enforcement changes  `,
    `- all governance actions logged  `,
    `- all governance actions reversible  `,
    '',
    `This renderer ensures governance is **visible, explainable, and auditable**.`,
    '',
    '---',
    '',
    `Gatekeeper — deterministic, explainable, reversible governance for modern codebases.`,
    ''
  );

  return '\n' + sections.join('\n');
}

/**
 * Governance Contract Enforcement Engine (v2)
 * Ensures all governance actions comply with the Governance Contract.
 *
 * The `contract` parameter must conform to the v2 schema
 * (`schemas/governance-contract.v2.schema.json`).  Use
 * `loadGovernanceContract()` from `src/loadGovernanceContract.js` to obtain a
 * fully normalised contract object.
 *
 * @param {Object} contract - The v2 governance contract.
 * @param {Object} contract.enforcement
 * @param {string} contract.enforcement.mode - The required enforcement mode.
 * @param {string[]} contract.enforcement.criticalRules - Rules that are always critical.
 * @param {Object} contract.baseline
 * @param {string} contract.baseline.mode - The required baseline mode.
 * @param {boolean} [contract.baseline.freezeEnabled] - Whether the baseline freeze is active.
 * @param {Object} contract.waivers
 * @param {string[]} contract.waivers.allowedTypes - Permitted waiver types.
 * @param {number}  contract.waivers.maxDurationDays - Maximum waiver duration in days.
 * @param {Object} state - Current governance state.
 * @param {string} state.enforcementMode - Active enforcement mode.
 * @param {string} state.baselineMode - Active baseline mode.
 * @param {boolean} state.baselineFrozen - Whether the baseline is frozen.
 * @param {{ canUpdateBaseline: boolean, canModifyRulePacks: string[], canChangeEnforcementMode: boolean, canModifyOrgGovernance: boolean }} state.authority
 * @param {{ items: Array<{rule: string, expires: string, type?: string, durationDays?: number}> }} state.waiverStatus
 * @param {Object} context - Context for the proposed governance action.
 * @param {boolean} [context.proposedBaselineUpdate] - Whether a baseline update is proposed.
 * @param {Array<{id: string, scope: string}>} context.ruleChanges - Proposed rule pack changes.
 * @param {string} [context.proposedEnforcementMode] - Proposed new enforcement mode.
 * @param {boolean} [context.orgLevelChange] - Whether an org-level governance change is proposed.
 * @returns {{ passed: boolean, violations: string[] }}
 */
function enforceGovernanceContract(contract, state, context) {
  const violations = [];

  // 1. Enforcement Mode Protection
  if (state.enforcementMode !== contract.enforcement.mode) {
    violations.push(
      `Illegal enforcement mode: ${state.enforcementMode}. Contract requires: ${contract.enforcement.mode}`
    );
  }

  // 2. Baseline Mode Protection
  if (state.baselineMode !== contract.baseline.mode) {
    violations.push(
      `Illegal baseline mode: ${state.baselineMode}. Contract requires: ${contract.baseline.mode}`
    );
  }

  // 3. Baseline Freeze Enforcement (explicit freeze flag or contract-level freeze)
  const baselineFrozen = state.baselineFrozen || (contract.baseline.freezeEnabled ?? false);
  if (baselineFrozen && context.proposedBaselineUpdate) {
    violations.push(
      `Baseline is frozen — baseline updates are not permitted until freeze is lifted.`
    );
  }

  // 4. Baseline Update Authority
  if (context.proposedBaselineUpdate && !state.authority.canUpdateBaseline) {
    violations.push(
      `Unauthorized baseline update — only maintainers or org governance may approve baseline changes.`
    );
  }

  // 5. Rule Pack Authority Enforcement
  (context.ruleChanges ?? []).forEach(ruleChange => {
    if (!state.authority.canModifyRulePacks.includes(ruleChange.scope)) {
      violations.push(
        `Unauthorized rule pack modification: ${ruleChange.id} (${ruleChange.scope}).`
      );
    }
  });

  // 6. Enforcement Mode Escalation Protection
  if (context.proposedEnforcementMode && !state.authority.canChangeEnforcementMode) {
    violations.push(
      `Unauthorized enforcement mode change — only maintainers or org governance may modify enforcement.`
    );
  }

  // 7. Waiver Validation — expiry and allowed types
  const allowedWaiverTypes = contract.waivers?.allowedTypes ?? [];
  const maxDurationDays = typeof contract.waivers?.maxDurationDays === 'number'
    ? contract.waivers.maxDurationDays
    : GOVERNANCE_CONTRACT_DEFAULTS.waivers.maxDurationDays;

  (state.waiverStatus?.items ?? []).forEach(w => {
    // Expiry check
    const expiry = new Date(w.expires).getTime();
    if (!Number.isNaN(expiry) && Date.now() > expiry) {
      violations.push(`Expired waiver detected: ${w.rule}`);
    }

    // Allowed type check
    if (w.type && !allowedWaiverTypes.includes(w.type)) {
      violations.push(
        `Waiver type '${w.type}' for rule '${w.rule}' is not permitted by the governance contract.`
      );
    }

    // Max duration check
    if (typeof w.durationDays === 'number' && w.durationDays > maxDurationDays) {
      violations.push(
        `Waiver for '${w.rule}' exceeds the maximum allowed duration of ${maxDurationDays} days (got ${w.durationDays}).`
      );
    }
  });

  // 8. Org-Level Governance Protection
  if (context.orgLevelChange && !state.authority.canModifyOrgGovernance) {
    violations.push(
      `Unauthorized org-level governance change — only org governance may modify org baselines or org rule packs.`
    );
  }

  return {
    passed: violations.length === 0,
    violations
  };
}

export { classifyDrift, shouldBlockMerge, driftLevelLabel, normaliseBaselineMode, DEFAULT_THRESHOLDS, renderGovernanceContract, enforceGovernanceContract };
