import { describe, it, expect } from 'vitest';
import {
  classifyDrift,
  shouldBlockMerge,
  driftLevelLabel,
  normaliseBaselineMode,
  renderGovernanceContract,
  enforceGovernanceContract,
  DEFAULT_THRESHOLDS,
} from '../src/governanceContract.js';

// ─── classifyDrift ────────────────────────────────────────────────────────────

describe('classifyDrift', () => {
  it('returns "none" for score below low threshold', () => {
    expect(classifyDrift(0)).toBe('none');
    expect(classifyDrift(19)).toBe('none');
  });

  it('returns "low" for score at or above low threshold', () => {
    expect(classifyDrift(20)).toBe('low');
    expect(classifyDrift(39)).toBe('low');
  });

  it('returns "moderate" for score at or above moderate threshold', () => {
    expect(classifyDrift(40)).toBe('moderate');
    expect(classifyDrift(59)).toBe('moderate');
  });

  it('returns "high" for score at or above high threshold', () => {
    expect(classifyDrift(60)).toBe('high');
    expect(classifyDrift(79)).toBe('high');
  });

  it('returns "critical" for score at or above critical threshold', () => {
    expect(classifyDrift(80)).toBe('critical');
    expect(classifyDrift(100)).toBe('critical');
  });

  it('respects custom thresholds', () => {
    const custom = { low: 10, moderate: 30, high: 50, critical: 70 };
    expect(classifyDrift(9, custom)).toBe('none');
    expect(classifyDrift(10, custom)).toBe('low');
    expect(classifyDrift(30, custom)).toBe('moderate');
    expect(classifyDrift(50, custom)).toBe('high');
    expect(classifyDrift(70, custom)).toBe('critical');
  });

  it('merges custom thresholds with defaults', () => {
    // Only override critical; low/moderate/high remain at defaults
    expect(classifyDrift(80, { critical: 90 })).toBe('high');
    expect(classifyDrift(90, { critical: 90 })).toBe('critical');
  });
});

// ─── shouldBlockMerge ─────────────────────────────────────────────────────────

describe('shouldBlockMerge', () => {
  it('returns false when verdict is pass', () => {
    expect(shouldBlockMerge('pass', 'strict')).toBe(false);
  });

  it('returns false in advisory mode even on failure', () => {
    expect(shouldBlockMerge('fail', 'advisory')).toBe(false);
  });

  it('returns true in strict mode on failure', () => {
    expect(shouldBlockMerge('fail', 'strict')).toBe(true);
  });

  it('returns true in hybrid mode when a critical rule failed', () => {
    expect(shouldBlockMerge('fail', 'hybrid', ['critical-rule'], ['critical-rule'])).toBe(true);
  });

  it('returns false in hybrid mode when no critical rule failed', () => {
    expect(shouldBlockMerge('fail', 'hybrid', ['critical-rule'], ['other-rule'])).toBe(false);
  });

  it('returns false in hybrid mode with no critical rules configured', () => {
    expect(shouldBlockMerge('fail', 'hybrid', [], ['any-rule'])).toBe(false);
  });
});

// ─── driftLevelLabel ─────────────────────────────────────────────────────────

describe('driftLevelLabel', () => {
  it.each([
    ['none', '✅ None'],
    ['low', '🟡 Low'],
    ['moderate', '🟠 Moderate'],
    ['high', '🔴 High'],
    ['critical', '🚨 Critical'],
  ])('returns correct label for level "%s"', (level, expected) => {
    expect(driftLevelLabel(level)).toBe(expected);
  });

  it('returns the raw value for unknown levels', () => {
    expect(driftLevelLabel('unknown-level')).toBe('unknown-level');
  });
});

// ─── normaliseBaselineMode ────────────────────────────────────────────────────

describe('normaliseBaselineMode', () => {
  it.each(['frozen', 'pr-approved', 'auto-learn'])('accepts valid mode "%s"', (mode) => {
    expect(normaliseBaselineMode(mode)).toBe(mode);
  });

  it('falls back to "pr-approved" for unrecognised mode', () => {
    expect(normaliseBaselineMode('unknown')).toBe('pr-approved');
    expect(normaliseBaselineMode('')).toBe('pr-approved');
    expect(normaliseBaselineMode(null)).toBe('pr-approved');
  });
});

// ─── renderGovernanceContract ─────────────────────────────────────────────────

describe('renderGovernanceContract', () => {
  const baseState = {
    contractVersion: 'v2',
    enforcementMode: 'advisory',
    baselineMode: 'pr-approved',
    ruleAuthority: 'local',
    waiverStatus: { active: false, items: [] },
    baselineFrozen: false,
    baselinePendingUpdate: false,
  };

  it('renders all sections when no contract is provided (all transparent)', () => {
    const output = renderGovernanceContract(null, baseState);
    expect(output).toContain('Governance Contract');
    expect(output).toContain('Governance Authority Model');
    expect(output).toContain('Baseline Governance');
    expect(output).toContain('Waiver & Exception System');
  });

  it('hides governance state when showGovernanceState is false', () => {
    const contract = { transparency: { showGovernanceState: false } };
    const output = renderGovernanceContract(contract, baseState);
    expect(output).not.toContain('Contract Version');
  });

  it('hides authority section when showAuthority is false', () => {
    const contract = { transparency: { showAuthority: false } };
    const output = renderGovernanceContract(contract, baseState);
    expect(output).not.toContain('Governance Authority Model');
  });

  it('hides baseline state when showBaselineState is false', () => {
    const contract = { transparency: { showBaselineState: false } };
    const output = renderGovernanceContract(contract, baseState);
    expect(output).not.toContain('Baseline Governance');
  });

  it('hides waivers when showWaivers is false', () => {
    const contract = { transparency: { showWaivers: false } };
    const output = renderGovernanceContract(contract, baseState);
    expect(output).not.toContain('Waiver & Exception System');
  });

  it('shows active waivers when waiverStatus.active is true', () => {
    const state = {
      ...baseState,
      waiverStatus: {
        active: true,
        items: [{ rule: 'my-rule', expires: '2030-01-01T00:00:00.000Z' }],
      },
    };
    const output = renderGovernanceContract(null, state);
    expect(output).toContain('my-rule');
    expect(output).toContain('2030-01-01');
  });

  it('shows frozen baseline state correctly', () => {
    const state = { ...baseState, baselineFrozen: true };
    const output = renderGovernanceContract(null, state);
    expect(output).toContain('🔒 Baseline is frozen');
  });

  it('shows pending baseline update', () => {
    const state = { ...baseState, baselinePendingUpdate: true };
    const output = renderGovernanceContract(null, state);
    expect(output).toContain('pending human approval');
  });
});

// ─── enforceGovernanceContract ────────────────────────────────────────────────

describe('enforceGovernanceContract', () => {
  function makeContract(overrides = {}) {
    return {
      enforcement: { mode: 'advisory', criticalRules: [] },
      baseline: { mode: 'pr-approved', freezeEnabled: false },
      waivers: { allowedTypes: ['rule-waiver', 'time-boxed'], maxDurationDays: 30 },
      ...overrides,
    };
  }

  function makeState(overrides = {}) {
    return {
      enforcementMode: 'advisory',
      baselineMode: 'pr-approved',
      baselineFrozen: false,
      authority: {
        canUpdateBaseline: true,
        canModifyRulePacks: ['local'],
        canChangeEnforcementMode: true,
        canModifyOrgGovernance: false,
      },
      waiverStatus: { items: [] },
      ...overrides,
    };
  }

  it('passes with no violations', () => {
    const result = enforceGovernanceContract(makeContract(), makeState(), {});
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('flags mismatched enforcement mode', () => {
    const result = enforceGovernanceContract(
      makeContract({ enforcement: { mode: 'strict' } }),
      makeState({ enforcementMode: 'advisory' }),
      {}
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toMatch(/enforcement mode/i);
  });

  it('flags mismatched baseline mode', () => {
    const result = enforceGovernanceContract(
      makeContract({ baseline: { mode: 'frozen', freezeEnabled: false } }),
      makeState({ baselineMode: 'auto-learn' }),
      {}
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toMatch(/baseline mode/i);
  });

  it('flags baseline update when baseline is frozen via state', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ baselineFrozen: true }),
      { proposedBaselineUpdate: true }
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toMatch(/frozen/i);
  });

  it('flags baseline update when baseline is frozen via contract', () => {
    const result = enforceGovernanceContract(
      makeContract({ baseline: { mode: 'pr-approved', freezeEnabled: true } }),
      makeState(),
      { proposedBaselineUpdate: true }
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toMatch(/frozen/i);
  });

  it('flags unauthorized baseline update', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ authority: { canUpdateBaseline: false, canModifyRulePacks: [], canChangeEnforcementMode: true, canModifyOrgGovernance: false } }),
      { proposedBaselineUpdate: true }
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toMatch(/Unauthorized baseline update/i);
  });

  it('flags unauthorized rule pack modification', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ authority: { canUpdateBaseline: true, canModifyRulePacks: ['local'], canChangeEnforcementMode: true, canModifyOrgGovernance: false } }),
      { ruleChanges: [{ id: 'my-rule', scope: 'org' }] }
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toMatch(/rule pack/i);
  });

  it('flags unauthorized enforcement mode change', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ authority: { canUpdateBaseline: true, canModifyRulePacks: ['local'], canChangeEnforcementMode: false, canModifyOrgGovernance: false } }),
      { proposedEnforcementMode: 'strict' }
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toMatch(/enforcement mode/i);
  });

  it('flags expired waivers', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ waiverStatus: { items: [{ rule: 'old-rule', expires: '2000-01-01T00:00:00.000Z' }] } }),
      {}
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toMatch(/Expired waiver/i);
  });

  it('flags disallowed waiver type', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ waiverStatus: { items: [{ rule: 'r', expires: '2099-01-01T00:00:00.000Z', type: 'emergency' }] } }),
      {}
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toMatch(/not permitted/i);
  });

  it('flags waiver exceeding max duration', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ waiverStatus: { items: [{ rule: 'r', expires: '2099-01-01T00:00:00.000Z', durationDays: 60 }] } }),
      {}
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toMatch(/maximum allowed duration/i);
  });

  it('flags unauthorized org-level change', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ authority: { canUpdateBaseline: true, canModifyRulePacks: ['local'], canChangeEnforcementMode: true, canModifyOrgGovernance: false } }),
      { orgLevelChange: true }
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toMatch(/org-level/i);
  });

  it('accumulates multiple violations', () => {
    const result = enforceGovernanceContract(
      makeContract({ enforcement: { mode: 'strict' }, baseline: { mode: 'frozen' } }),
      makeState({ enforcementMode: 'advisory', baselineMode: 'auto-learn' }),
      {}
    );
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });
});
