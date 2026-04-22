jest.mock('@actions/core');

import {
  classifyDrift,
  shouldBlockMerge,
  driftLevelLabel,
  normaliseBaselineMode,
  DEFAULT_THRESHOLDS,
  enforceGovernanceContract,
  renderGovernanceContract,
} from '../../src/governanceContract.js';

// ─── classifyDrift ────────────────────────────────────────────────────────────

describe('classifyDrift', () => {
  it('returns none for score 0', () => {
    expect(classifyDrift(0)).toBe('none');
  });

  it('returns none for score below low threshold (19)', () => {
    expect(classifyDrift(19)).toBe('none');
  });

  it('returns low for score at low threshold (20)', () => {
    expect(classifyDrift(20)).toBe('low');
  });

  it('returns low for score between low and moderate (39)', () => {
    expect(classifyDrift(39)).toBe('low');
  });

  it('returns moderate for score at moderate threshold (40)', () => {
    expect(classifyDrift(40)).toBe('moderate');
  });

  it('returns moderate for score between moderate and high (59)', () => {
    expect(classifyDrift(59)).toBe('moderate');
  });

  it('returns high for score at high threshold (60)', () => {
    expect(classifyDrift(60)).toBe('high');
  });

  it('returns high for score between high and critical (79)', () => {
    expect(classifyDrift(79)).toBe('high');
  });

  it('returns critical for score at critical threshold (80)', () => {
    expect(classifyDrift(80)).toBe('critical');
  });

  it('returns critical for score 100', () => {
    expect(classifyDrift(100)).toBe('critical');
  });

  it('accepts custom thresholds', () => {
    const custom = { low: 10, moderate: 20, high: 30, critical: 40 };
    expect(classifyDrift(5, custom)).toBe('none');
    expect(classifyDrift(10, custom)).toBe('low');
    expect(classifyDrift(20, custom)).toBe('moderate');
    expect(classifyDrift(30, custom)).toBe('high');
    expect(classifyDrift(40, custom)).toBe('critical');
  });

  it('overrides only specified thresholds and falls back to defaults', () => {
    // Only override critical
    expect(classifyDrift(50, { critical: 50 })).toBe('critical');
  });

  it('exports DEFAULT_THRESHOLDS with expected shape', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({ low: 20, moderate: 40, high: 60, critical: 80 });
  });
});

// ─── shouldBlockMerge ────────────────────────────────────────────────────────

describe('shouldBlockMerge', () => {
  it('does not block when verdict is pass', () => {
    expect(shouldBlockMerge('pass', 'strict')).toBe(false);
  });

  it('blocks in strict mode when verdict is fail', () => {
    expect(shouldBlockMerge('fail', 'strict')).toBe(true);
  });

  it('never blocks in advisory mode', () => {
    expect(shouldBlockMerge('fail', 'advisory')).toBe(false);
  });

  it('blocks in hybrid mode when a critical rule fails', () => {
    expect(shouldBlockMerge('fail', 'hybrid', ['rule-a', 'rule-b'], ['rule-a'])).toBe(true);
  });

  it('does not block in hybrid mode when no critical rule fails', () => {
    expect(shouldBlockMerge('fail', 'hybrid', ['rule-a'], ['rule-b'])).toBe(false);
  });

  it('does not block in hybrid mode when hybridCriticalRules is empty', () => {
    expect(shouldBlockMerge('fail', 'hybrid', [], ['rule-x'])).toBe(false);
  });

  it('defaults hybridCriticalRules and failedRuleIds to empty arrays', () => {
    expect(shouldBlockMerge('fail', 'hybrid')).toBe(false);
  });
});

// ─── driftLevelLabel ─────────────────────────────────────────────────────────

describe('driftLevelLabel', () => {
  it('returns correct label for none', () => {
    expect(driftLevelLabel('none')).toBe('✅ None');
  });

  it('returns correct label for low', () => {
    expect(driftLevelLabel('low')).toBe('🟡 Low');
  });

  it('returns correct label for moderate', () => {
    expect(driftLevelLabel('moderate')).toBe('🟠 Moderate');
  });

  it('returns correct label for high', () => {
    expect(driftLevelLabel('high')).toBe('🔴 High');
  });

  it('returns correct label for critical', () => {
    expect(driftLevelLabel('critical')).toBe('🚨 Critical');
  });

  it('returns string representation for unknown levels', () => {
    expect(driftLevelLabel('unknown')).toBe('unknown');
  });
});

// ─── normaliseBaselineMode ────────────────────────────────────────────────────

describe('normaliseBaselineMode', () => {
  it('accepts frozen', () => {
    expect(normaliseBaselineMode('frozen')).toBe('frozen');
  });

  it('accepts pr-approved', () => {
    expect(normaliseBaselineMode('pr-approved')).toBe('pr-approved');
  });

  it('accepts auto-learn', () => {
    expect(normaliseBaselineMode('auto-learn')).toBe('auto-learn');
  });

  it('falls back to pr-approved for unknown values', () => {
    expect(normaliseBaselineMode('invalid')).toBe('pr-approved');
    expect(normaliseBaselineMode('')).toBe('pr-approved');
    expect(normaliseBaselineMode(null)).toBe('pr-approved');
    expect(normaliseBaselineMode(undefined)).toBe('pr-approved');
  });
});

// ─── enforceGovernanceContract ───────────────────────────────────────────────

describe('enforceGovernanceContract (src/governanceContract.js)', () => {
  const makeContract = (overrides = {}) => ({
    enforcement: { mode: 'strict', criticalRules: [] },
    baseline: { mode: 'pr-approved', freezeEnabled: false },
    waivers: { allowedTypes: ['rule-waiver', 'time-boxed'], maxDurationDays: 30 },
    ...overrides,
  });

  const makeState = (overrides = {}) => ({
    enforcementMode: 'strict',
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
  });

  const makeContext = (overrides = {}) => ({
    proposedBaselineUpdate: false,
    ruleChanges: [],
    proposedEnforcementMode: null,
    orgLevelChange: false,
    ...overrides,
  });

  it('passes when everything is compliant', () => {
    const result = enforceGovernanceContract(makeContract(), makeState(), makeContext());
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('fails when enforcement mode does not match contract', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ enforcementMode: 'advisory' }),
      makeContext()
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toMatch(/Illegal enforcement mode/);
  });

  it('fails when baseline mode does not match contract', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ baselineMode: 'frozen' }),
      makeContext()
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toMatch(/Illegal baseline mode/);
  });

  it('fails when state.baselineFrozen is true and update is proposed', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ baselineFrozen: true }),
      makeContext({ proposedBaselineUpdate: true })
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.includes('frozen'))).toBe(true);
  });

  it('fails when contract.baseline.freezeEnabled is true and update is proposed', () => {
    const result = enforceGovernanceContract(
      makeContract({ baseline: { mode: 'pr-approved', freezeEnabled: true } }),
      makeState(),
      makeContext({ proposedBaselineUpdate: true })
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.includes('frozen'))).toBe(true);
  });

  it('fails when baseline update proposed but authority denied', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ authority: { canUpdateBaseline: false, canModifyRulePacks: [], canChangeEnforcementMode: false, canModifyOrgGovernance: false } }),
      makeContext({ proposedBaselineUpdate: true })
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.includes('Unauthorized baseline update'))).toBe(true);
  });

  it('fails when rule pack change is outside authority scope', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ authority: { canUpdateBaseline: false, canModifyRulePacks: ['local'], canChangeEnforcementMode: false, canModifyOrgGovernance: false } }),
      makeContext({ ruleChanges: [{ id: 'rule-x', scope: 'org' }] })
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.includes('Unauthorized rule pack modification'))).toBe(true);
  });

  it('passes when rule pack change is within authority scope', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState(),
      makeContext({ ruleChanges: [{ id: 'rule-x', scope: 'local' }] })
    );
    expect(result.passed).toBe(true);
  });

  it('fails when enforcement mode change is not authorised', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ authority: { canUpdateBaseline: true, canModifyRulePacks: ['local'], canChangeEnforcementMode: false, canModifyOrgGovernance: false } }),
      makeContext({ proposedEnforcementMode: 'advisory' })
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.includes('Unauthorized enforcement mode change'))).toBe(true);
  });

  it('fails for an expired waiver', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString(); // yesterday
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ waiverStatus: { items: [{ rule: 'rule-a', expires: pastDate }] } }),
      makeContext()
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.includes('Expired waiver'))).toBe(true);
  });

  it('passes for a waiver that has not expired', () => {
    const futureDate = new Date(Date.now() + 86400000 * 10).toISOString(); // 10 days from now
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ waiverStatus: { items: [{ rule: 'rule-a', expires: futureDate }] } }),
      makeContext()
    );
    expect(result.passed).toBe(true);
  });

  it('fails when waiver type is not allowed by contract', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const result = enforceGovernanceContract(
      makeContract({ waivers: { allowedTypes: ['rule-waiver'], maxDurationDays: 30 } }),
      makeState({ waiverStatus: { items: [{ rule: 'rule-a', expires: futureDate, type: 'emergency' }] } }),
      makeContext()
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.includes("Waiver type 'emergency'"))).toBe(true);
  });

  it('fails when waiver duration exceeds maximum', () => {
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const result = enforceGovernanceContract(
      makeContract({ waivers: { allowedTypes: ['rule-waiver'], maxDurationDays: 7 } }),
      makeState({ waiverStatus: { items: [{ rule: 'rule-a', expires: futureDate, durationDays: 30 }] } }),
      makeContext()
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.includes('exceeds the maximum allowed duration'))).toBe(true);
  });

  it('fails when org-level change is attempted without authority', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState(),
      makeContext({ orgLevelChange: true })
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.includes('Unauthorized org-level governance change'))).toBe(true);
  });

  it('accumulates multiple violations', () => {
    const pastDate = new Date(Date.now() - 1000).toISOString();
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({
        enforcementMode: 'advisory',
        baselineMode: 'frozen',
        waiverStatus: { items: [{ rule: 'r', expires: pastDate }] },
      }),
      makeContext()
    );
    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── renderGovernanceContract ─────────────────────────────────────────────────

describe('renderGovernanceContract', () => {
  const baseState = {
    enforcementMode: 'strict',
    baselineMode: 'pr-approved',
    ruleAuthority: 'local',
    waiverStatus: { active: false, items: [] },
    contractVersion: 'v2',
    baselineFrozen: false,
    baselinePendingUpdate: false,
  };

  it('renders a Markdown string', () => {
    const output = renderGovernanceContract(null, baseState);
    expect(typeof output).toBe('string');
    expect(output).toMatch(/Governance Contract/);
  });

  it('includes contract version in output', () => {
    const output = renderGovernanceContract(null, baseState);
    expect(output).toContain('v2');
  });

  it('includes enforcement mode in output', () => {
    const output = renderGovernanceContract(null, baseState);
    expect(output).toContain('strict');
  });

  it('shows baseline frozen as no when not frozen', () => {
    const output = renderGovernanceContract(null, baseState);
    expect(output).toContain('`no`');
  });

  it('shows baseline frozen as yes when frozen', () => {
    const output = renderGovernanceContract(null, { ...baseState, baselineFrozen: true });
    expect(output).toContain('🔒 Baseline is frozen');
  });

  it('shows pending baseline update notice', () => {
    const output = renderGovernanceContract(null, { ...baseState, baselinePendingUpdate: true });
    expect(output).toContain('pending human approval');
  });

  it('shows active waivers when present', () => {
    const state = {
      ...baseState,
      waiverStatus: {
        active: true,
        items: [{ rule: 'my-rule', expires: '2099-01-01' }],
      },
    };
    const output = renderGovernanceContract(null, state);
    expect(output).toContain('my-rule');
    expect(output).toContain('yes');
  });

  it('hides sections when transparency flags are false', () => {
    const contract = {
      transparency: {
        showGovernanceState: false,
        showBaselineState: false,
        showWaivers: false,
        showAuthority: false,
      },
    };
    const output = renderGovernanceContract(contract, baseState);
    expect(output).not.toContain('Enforcement Mode');
    expect(output).not.toContain('Baseline Governance');
    expect(output).not.toContain('Waiver & Exception System');
    expect(output).not.toContain('Governance Authority Model');
  });

  it('shows all sections when contract is null', () => {
    const output = renderGovernanceContract(null, baseState);
    expect(output).toContain('Governance Authority Model');
    expect(output).toContain('Baseline Governance');
    expect(output).toContain('Waiver & Exception System');
  });
});
