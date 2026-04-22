/**
 * Governance Contract Loader
 * Loads and normalises a Gatekeeper Governance Contract v2 file.
 *
 * The contract file is a JSON document whose shape is described by
 * schemas/governance-contract.v2.schema.json.  When no file is present the
 * module returns a safe set of defaults so the rest of the engine can operate
 * without special-casing a missing contract.
 */

import { readFileSync, existsSync } from 'fs';
import * as core from '@actions/core';

export const DEFAULT_CONTRACT_PATH = '.github/gatekeeper-governance.json';

/** Required top-level fields as defined by the v2 schema. */
const REQUIRED_FIELDS = ['version', 'authority', 'baseline', 'enforcement', 'rules', 'waivers', 'orgGovernance'];

/**
 * Default governance contract values.
 * These mirror the schema defaults and represent the most permissive / safe
 * operating posture for repositories that have not yet opted into a contract.
 */
export const GOVERNANCE_CONTRACT_DEFAULTS = {
  version: 'v2',
  authority: {
    repoMaintainers: [],
    orgGovernanceGroup: [],
    engine: {
      canModifyGovernance: false,
      canProposeBaselineUpdates: true,
    },
  },
  baseline: {
    mode: 'pr-approved',
    freezeEnabled: false,
    updatePolicy: 'manual',
  },
  enforcement: {
    mode: 'advisory',
    criticalRules: [],
  },
  rules: {
    core: [],
    local: [],
    org: [],
  },
  waivers: {
    allowedTypes: ['file-ignore', 'rule-waiver', 'time-boxed', 'baseline-freeze'],
    maxDurationDays: 30,
    requireApproval: true,
  },
  orgGovernance: {
    baselinePolicy: 'manual',
    allowedRepoClasses: ['core', 'legacy', 'experimental', 'sandbox'],
    crossRepoRulesEnabled: false,
  },
  transparency: {
    showGovernanceState: true,
    showBaselineState: true,
    showWaivers: true,
    showAuthority: true,
  },
  reversibility: {
    allowBaselineRollback: true,
    allowRuleRollback: true,
    allowEnforcementRollback: true,
  },
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load and normalise a governance contract file.
 *
 * @param {string} [contractPath] - Path to the governance contract JSON file.
 *   Defaults to `.github/gatekeeper-governance.json`.
 * @returns {Object} A fully normalised governance contract object.
 */
export function loadGovernanceContract(contractPath) {
  const path = contractPath || DEFAULT_CONTRACT_PATH;

  if (!existsSync(path)) {
    core.info(`No governance contract found at ${path}. Using defaults.`);
    return structuredClone(GOVERNANCE_CONTRACT_DEFAULTS);
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    core.warning(`Failed to parse governance contract at ${path}: ${err.message}. Using defaults.`);
    return structuredClone(GOVERNANCE_CONTRACT_DEFAULTS);
  }

  const missing = REQUIRED_FIELDS.filter((f) => !(f in parsed));
  if (missing.length > 0) {
    core.warning(
      `Governance contract at ${path} is missing required fields: ${missing.join(', ')}. ` +
      `Using defaults for missing fields.`
    );
  }

  return _mergeWithDefaults(parsed);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Deep-merge a raw parsed contract object with the defaults, returning a
 * fully populated contract object.
 *
 * @param {Object} parsed - The raw object read from the contract file.
 * @returns {Object}
 */
function _mergeWithDefaults(parsed) {
  const d = GOVERNANCE_CONTRACT_DEFAULTS;
  return {
    version: typeof parsed.version === 'string' ? parsed.version : d.version,

    authority: {
      repoMaintainers: Array.isArray(parsed.authority?.repoMaintainers)
        ? parsed.authority.repoMaintainers
        : d.authority.repoMaintainers,
      orgGovernanceGroup: Array.isArray(parsed.authority?.orgGovernanceGroup)
        ? parsed.authority.orgGovernanceGroup
        : d.authority.orgGovernanceGroup,
      engine: {
        canModifyGovernance: parsed.authority?.engine?.canModifyGovernance ?? d.authority.engine.canModifyGovernance,
        canProposeBaselineUpdates:
          parsed.authority?.engine?.canProposeBaselineUpdates ?? d.authority.engine.canProposeBaselineUpdates,
      },
    },

    baseline: {
      mode: _oneOf(parsed.baseline?.mode, ['frozen', 'pr-approved', 'auto-learn'], d.baseline.mode),
      freezeEnabled: parsed.baseline?.freezeEnabled ?? d.baseline.freezeEnabled,
      updatePolicy: _oneOf(parsed.baseline?.updatePolicy, ['manual', 'pr-approved', 'auto'], d.baseline.updatePolicy),
    },

    enforcement: {
      mode: _oneOf(parsed.enforcement?.mode, ['strict', 'advisory', 'hybrid'], d.enforcement.mode),
      criticalRules: Array.isArray(parsed.enforcement?.criticalRules)
        ? parsed.enforcement.criticalRules
        : d.enforcement.criticalRules,
    },

    rules: {
      core: Array.isArray(parsed.rules?.core) ? parsed.rules.core : d.rules.core,
      local: Array.isArray(parsed.rules?.local) ? parsed.rules.local : d.rules.local,
      org: Array.isArray(parsed.rules?.org) ? parsed.rules.org : d.rules.org,
    },

    waivers: {
      allowedTypes: Array.isArray(parsed.waivers?.allowedTypes)
        ? parsed.waivers.allowedTypes
        : d.waivers.allowedTypes,
      maxDurationDays:
        typeof parsed.waivers?.maxDurationDays === 'number'
          ? parsed.waivers.maxDurationDays
          : d.waivers.maxDurationDays,
      requireApproval: parsed.waivers?.requireApproval ?? d.waivers.requireApproval,
    },

    orgGovernance: {
      baselinePolicy: _oneOf(
        parsed.orgGovernance?.baselinePolicy,
        ['aggregate', 'weighted', 'manual'],
        d.orgGovernance.baselinePolicy
      ),
      allowedRepoClasses: Array.isArray(parsed.orgGovernance?.allowedRepoClasses)
        ? parsed.orgGovernance.allowedRepoClasses
        : d.orgGovernance.allowedRepoClasses,
      crossRepoRulesEnabled: parsed.orgGovernance?.crossRepoRulesEnabled ?? d.orgGovernance.crossRepoRulesEnabled,
    },

    transparency: {
      showGovernanceState: parsed.transparency?.showGovernanceState ?? d.transparency.showGovernanceState,
      showBaselineState: parsed.transparency?.showBaselineState ?? d.transparency.showBaselineState,
      showWaivers: parsed.transparency?.showWaivers ?? d.transparency.showWaivers,
      showAuthority: parsed.transparency?.showAuthority ?? d.transparency.showAuthority,
    },

    reversibility: {
      allowBaselineRollback: parsed.reversibility?.allowBaselineRollback ?? d.reversibility.allowBaselineRollback,
      allowRuleRollback: parsed.reversibility?.allowRuleRollback ?? d.reversibility.allowRuleRollback,
      allowEnforcementRollback:
        parsed.reversibility?.allowEnforcementRollback ?? d.reversibility.allowEnforcementRollback,
    },
  };
}

/**
 * Return `value` if it is one of the accepted `choices`; otherwise return `fallback`.
 *
 * @param {*}        value
 * @param {string[]} choices
 * @param {string}   fallback
 * @returns {string}
 */
function _oneOf(value, choices, fallback) {
  return choices.includes(value) ? value : fallback;
}
