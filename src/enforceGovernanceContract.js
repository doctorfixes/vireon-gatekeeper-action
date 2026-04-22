const DEFAULT_MAX_DURATION_DAYS = 30;

/**
 * Governance Contract Enforcement Engine
 * Ensures all governance actions comply with the Governance Contract.
 *
 * @param {Object} contract - The governance contract.
 * @param {Object} state - Current governance state.
 * @param {Object} [context={}] - Context describing any proposed governance actions.
 * @returns {{ passed: boolean, violations: string[] }}
 */
function enforceGovernanceContract(contract, state, context = {}) {
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

  // 3. Baseline Freeze Enforcement
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

  // 7. Waiver Validation — expiry, allowed types, and max duration
  const allowedWaiverTypes = contract.waivers?.allowedTypes ?? [];
  const maxDurationDays =
    typeof contract.waivers?.maxDurationDays === 'number'
      ? contract.waivers.maxDurationDays
      : DEFAULT_MAX_DURATION_DAYS;

  (state.waiverStatus?.items ?? []).forEach(w => {
    const expiry = new Date(w.expires).getTime();
    if (!Number.isNaN(expiry) && Date.now() > expiry) {
      violations.push(`Expired waiver detected: ${w.rule}`);
    }

    if (w.type && !allowedWaiverTypes.includes(w.type)) {
      violations.push(
        `Waiver type '${w.type}' for rule '${w.rule}' is not permitted by the governance contract.`
      );
    }

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

module.exports = { enforceGovernanceContract };

