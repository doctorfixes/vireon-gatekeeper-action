const { computeDriftOverTime } = require('../../src/driftOverTime.js');
const { generateArchitectureHealthReport } = require('../../src/architectureHealthReport.js');
const { explainResults } = require('../../src/explainWhy.js');
const { buildBaseline } = require('../../src/inferenceEngine.js');
const { enforceGovernanceContract } = require('../../src/enforceGovernanceContract.js');
const { renderGovernanceContract } = require('../../src/renderGovernanceContract.js');

// ─── computeDriftOverTime ─────────────────────────────────────────────────────

describe('computeDriftOverTime', () => {
  it('returns empty points for null input', () => {
    expect(computeDriftOverTime(null)).toEqual({ points: [] });
  });

  it('returns empty points for empty array', () => {
    expect(computeDriftOverTime([])).toEqual({ points: [] });
  });

  it('maps history to points with commitHash and timestamp', () => {
    const history = [
      { commitHash: 'abc123', createdAt: '2024-01-01T00:00:00Z' },
      { commitHash: 'def456', createdAt: '2024-01-02T00:00:00Z' },
    ];
    const result = computeDriftOverTime(history);
    expect(result.points).toHaveLength(2);
    expect(result.points[0]).toEqual({ commitHash: 'abc123', timestamp: '2024-01-01T00:00:00Z' });
    expect(result.points[1]).toEqual({ commitHash: 'def456', timestamp: '2024-01-02T00:00:00Z' });
  });
});

// ─── generateArchitectureHealthReport ────────────────────────────────────────

describe('generateArchitectureHealthReport', () => {
  it('returns no baseline summary when baseline is null', () => {
    const report = generateArchitectureHealthReport({
      baseline: null,
      history: [],
      driftOverTime: { points: [] },
      recentFindings: [],
    });
    expect(report.baselineSummary).toBe('No baseline');
  });

  it('returns baseline summary from baseline object', () => {
    const report = generateArchitectureHealthReport({
      baseline: { summary: 'Baseline v1' },
      history: [],
      driftOverTime: { points: [] },
      recentFindings: [],
    });
    expect(report.baselineSummary).toBe('Baseline v1');
  });

  it('returns correct historyCount', () => {
    const report = generateArchitectureHealthReport({
      baseline: null,
      history: [{ id: 1 }, { id: 2 }, { id: 3 }],
      driftOverTime: { points: [] },
      recentFindings: [],
    });
    expect(report.historyCount).toBe(3);
  });

  it('returns correct driftPoints count', () => {
    const report = generateArchitectureHealthReport({
      baseline: null,
      history: [],
      driftOverTime: { points: [{ a: 1 }, { b: 2 }] },
      recentFindings: [],
    });
    expect(report.driftPoints).toBe(2);
  });

  it('returns correct findingsCount', () => {
    const report = generateArchitectureHealthReport({
      baseline: null,
      history: [],
      driftOverTime: { points: [] },
      recentFindings: [{ type: 'drift' }, { type: 'violation' }],
    });
    expect(report.findingsCount).toBe(2);
  });

  it('handles missing optional fields gracefully', () => {
    const report = generateArchitectureHealthReport({});
    expect(report.baselineSummary).toBe('No baseline');
    expect(report.historyCount).toBe(0);
    expect(report.driftPoints).toBe(0);
    expect(report.findingsCount).toBe(0);
  });
});

// ─── explainResults ───────────────────────────────────────────────────────────

describe('explainResults', () => {
  it('returns empty array when no results', () => {
    expect(explainResults([])).toEqual([]);
  });

  it('extracts messages with their ruleId', () => {
    const results = [
      { id: 'rule-a', messages: ['msg1', 'msg2'] },
      { id: 'rule-b', messages: ['msg3'] },
    ];
    const explained = explainResults(results);
    expect(explained).toHaveLength(3);
    expect(explained[0]).toEqual({ ruleId: 'rule-a', message: 'msg1' });
    expect(explained[1]).toEqual({ ruleId: 'rule-a', message: 'msg2' });
    expect(explained[2]).toEqual({ ruleId: 'rule-b', message: 'msg3' });
  });

  it('skips rules with no messages', () => {
    const results = [
      { id: 'rule-a', messages: [] },
      { id: 'rule-b', messages: ['hello'] },
    ];
    const explained = explainResults(results);
    expect(explained).toHaveLength(1);
    expect(explained[0].ruleId).toBe('rule-b');
  });

  it('handles rules where messages is undefined', () => {
    const results = [{ id: 'rule-a' }];
    const explained = explainResults(results);
    expect(explained).toEqual([]);
  });
});

// ─── buildBaseline (inferenceEngine) ─────────────────────────────────────────

describe('buildBaseline', () => {
  it('returns a baseline with createdAt, commitHash, summary, layers, modules', async () => {
    const context = { commitHash: 'abc123' };
    const result = await buildBaseline(context);
    expect(result).toHaveProperty('createdAt');
    expect(result.commitHash).toBe('abc123');
    expect(result.summary).toBeTruthy();
    expect(Array.isArray(result.layers)).toBe(true);
    expect(Array.isArray(result.modules)).toBe(true);
  });

  it('createdAt is a valid ISO date string', async () => {
    const result = await buildBaseline({ commitHash: 'xyz' });
    expect(new Date(result.createdAt).toISOString()).toBe(result.createdAt);
  });
});

// ─── enforceGovernanceContract (CJS version) ─────────────────────────────────

describe('enforceGovernanceContract (src/enforceGovernanceContract.js CJS)', () => {
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

  it('passes when state matches contract', () => {
    const result = enforceGovernanceContract(makeContract(), makeState(), {});
    expect(result.passed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('fails when enforcement mode does not match contract', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ enforcementMode: 'advisory' }),
      {}
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toMatch(/Illegal enforcement mode/);
  });

  it('fails when baseline mode does not match contract', () => {
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ baselineMode: 'frozen' }),
      {}
    );
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toMatch(/Illegal baseline mode/);
  });

  it('fails for an expired waiver', () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const result = enforceGovernanceContract(
      makeContract(),
      makeState({ waiverStatus: { items: [{ rule: 'rule-a', expires: pastDate }] } }),
      {}
    );
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.includes('Expired waiver'))).toBe(true);
  });

  it('fails when org-level change is attempted without authority', () => {
    const result = enforceGovernanceContract(makeContract(), makeState(), { orgLevelChange: true });
    expect(result.passed).toBe(false);
    expect(result.violations.some(v => v.includes('Unauthorized org-level governance change'))).toBe(true);
  });

  it('uses default context of {} when context is omitted', () => {
    const result = enforceGovernanceContract(makeContract(), makeState());
    expect(result.passed).toBe(true);
  });
});

// ─── renderGovernanceContract (CJS version) ──────────────────────────────────

describe('renderGovernanceContract (src/renderGovernanceContract.js CJS)', () => {
  const contract = { version: 'v1' };
  const state = {
    contractVersion: 'v1',
    enforcementMode: 'advisory',
    baselineMode: 'pr-approved',
    baselineFrozen: false,
    drift: { points: [] },
  };

  it('returns a markdown string', () => {
    const report = renderGovernanceContract(contract, state, {});
    expect(typeof report).toBe('string');
    expect(report).toContain('Gatekeeper');
  });

  it('includes contract version in output', () => {
    const report = renderGovernanceContract(contract, state, {});
    expect(report).toContain('v1');
  });

  it('includes enforcement mode in output', () => {
    const report = renderGovernanceContract(contract, state, {});
    expect(report).toContain('advisory');
  });

  it('includes baseline mode in output', () => {
    const report = renderGovernanceContract(contract, state, {});
    expect(report).toContain('pr-approved');
  });

  it('shows explain-why messages when provided', () => {
    const extras = { explainedResults: [{ message: 'Drift detected in module A' }] };
    const report = renderGovernanceContract(contract, state, extras);
    expect(report).toContain('Drift detected in module A');
  });

  it('shows no drift message when explainedResults is empty', () => {
    const report = renderGovernanceContract(contract, state, { explainedResults: [] });
    expect(report).toContain('No significant drift detected.');
  });

  it('includes health report as JSON', () => {
    const extras = { healthReport: { baselineSummary: 'test', historyCount: 5 } };
    const report = renderGovernanceContract(contract, state, extras);
    expect(report).toContain('"historyCount": 5');
  });

  it('shows drift points count', () => {
    const stateWithDrift = { ...state, drift: { points: [1, 2, 3] } };
    const report = renderGovernanceContract(contract, stateWithDrift, {});
    expect(report).toContain('Drift points: `3`');
  });
});
