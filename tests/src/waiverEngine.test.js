import {
  parseWaivers,
  matchesIgnorePattern,
  applyWaivers,
  buildWaiverSummary,
} from '../../src/waiverEngine.js';

// ─── parseWaivers ─────────────────────────────────────────────────────────────

describe('parseWaivers', () => {
  it('returns empty defaults when called with no labels', () => {
    const result = parseWaivers([]);
    expect(result).toEqual({ waivedRules: [], timeBoxed: [], baselineFreeze: false, emergencyOverride: false });
  });

  it('parses emergency override label', () => {
    const result = parseWaivers(['gatekeeper-emergency-override']);
    expect(result.emergencyOverride).toBe(true);
  });

  it('parses baseline freeze label', () => {
    const result = parseWaivers(['gatekeeper-baseline-freeze']);
    expect(result.baselineFreeze).toBe(true);
  });

  it('parses rule waiver label', () => {
    const result = parseWaivers(['gatekeeper-waive:my-rule']);
    expect(result.waivedRules).toContain('my-rule');
  });

  it('parses time-boxed waiver label', () => {
    const result = parseWaivers(['gatekeeper-waive:7d']);
    expect(result.timeBoxed).toContain('7d');
  });

  it('parses time-boxed waiver with multi-digit days', () => {
    const result = parseWaivers(['gatekeeper-waive:30d']);
    expect(result.timeBoxed).toContain('30d');
  });

  it('parses GitHub label objects (with name property)', () => {
    const result = parseWaivers([{ name: 'gatekeeper-waive:rule-abc' }]);
    expect(result.waivedRules).toContain('rule-abc');
  });

  it('handles mixed label types', () => {
    const result = parseWaivers([
      'gatekeeper-emergency-override',
      { name: 'gatekeeper-baseline-freeze' },
      'gatekeeper-waive:security-check',
      'gatekeeper-waive:14d',
      'some-unrelated-label',
    ]);
    expect(result.emergencyOverride).toBe(true);
    expect(result.baselineFreeze).toBe(true);
    expect(result.waivedRules).toContain('security-check');
    expect(result.timeBoxed).toContain('14d');
  });

  it('ignores empty waive labels', () => {
    const result = parseWaivers(['gatekeeper-waive:']);
    expect(result.waivedRules).toEqual([]);
    expect(result.timeBoxed).toEqual([]);
  });

  it('ignores unrelated labels', () => {
    const result = parseWaivers(['bug', 'enhancement', 'good-first-issue']);
    expect(result).toEqual({ waivedRules: [], timeBoxed: [], baselineFreeze: false, emergencyOverride: false });
  });

  it('handles null/undefined label objects gracefully', () => {
    const result = parseWaivers([null, undefined, { name: null }]);
    expect(result).toEqual({ waivedRules: [], timeBoxed: [], baselineFreeze: false, emergencyOverride: false });
  });
});

// ─── matchesIgnorePattern ─────────────────────────────────────────────────────

describe('matchesIgnorePattern', () => {
  it('returns false for an empty patterns list', () => {
    expect(matchesIgnorePattern('src/foo.js', [])).toBe(false);
  });

  it('matches an exact file path', () => {
    expect(matchesIgnorePattern('src/foo.js', ['src/foo.js'])).toBe(true);
  });

  it('does not match a different path', () => {
    expect(matchesIgnorePattern('src/bar.js', ['src/foo.js'])).toBe(false);
  });

  it('matches with a * wildcard within one segment', () => {
    expect(matchesIgnorePattern('src/foo.test.js', ['src/*.test.js'])).toBe(true);
  });

  it('does not let * cross path segment boundaries', () => {
    expect(matchesIgnorePattern('src/sub/foo.test.js', ['src/*.test.js'])).toBe(false);
  });

  it('matches with ** wildcard across segments', () => {
    expect(matchesIgnorePattern('src/deep/nested/foo.js', ['src/**/*.js'])).toBe(true);
  });

  it('matches a directory prefix with **', () => {
    expect(matchesIgnorePattern('vendor/lib/index.js', ['vendor/**'])).toBe(true);
  });

  it('matches file in nested directory with **', () => {
    expect(matchesIgnorePattern('a/b/c/d/file.js', ['a/**/file.js'])).toBe(true);
  });

  it('normalises Windows-style backslashes in file path', () => {
    expect(matchesIgnorePattern('src\\foo.js', ['src/foo.js'])).toBe(true);
  });

  it('skips malformed patterns without crashing', () => {
    expect(() => matchesIgnorePattern('src/foo.js', ['[invalid'])).not.toThrow();
    expect(matchesIgnorePattern('src/foo.js', ['[invalid'])).toBe(false);
  });
});

// ─── applyWaivers ─────────────────────────────────────────────────────────────

describe('applyWaivers', () => {
  const makeWaivers = (overrides = {}) => ({
    waivedRules: [],
    timeBoxed: [],
    baselineFreeze: false,
    emergencyOverride: false,
    ...overrides,
  });

  it('returns all issues in filtered when no waivers are active', () => {
    const issues = [{ rule: 'rule-a', message: 'Issue A' }];
    const { filtered, waived } = applyWaivers(issues, makeWaivers(), []);
    expect(filtered).toEqual(issues);
    expect(waived).toEqual([]);
  });

  it('emergency override moves all issues to waived', () => {
    const issues = [
      { rule: 'rule-a', message: 'Issue A' },
      { rule: 'rule-b', message: 'Issue B' },
    ];
    const { filtered, waived } = applyWaivers(issues, makeWaivers({ emergencyOverride: true }), []);
    expect(filtered).toEqual([]);
    expect(waived).toHaveLength(2);
    expect(waived[0].waiverReason).toBe('gatekeeper-emergency-override');
  });

  it('rule-level waiver suppresses matching rule issues', () => {
    const issues = [
      { rule: 'rule-a', message: 'Issue A' },
      { rule: 'rule-b', message: 'Issue B' },
    ];
    const { filtered, waived } = applyWaivers(issues, makeWaivers({ waivedRules: ['rule-a'] }), []);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].rule).toBe('rule-b');
    expect(waived[0].waiverReason).toBe('gatekeeper-waive:rule-a');
  });

  it('file-level ignore suppresses issues matching file path', () => {
    const issues = [{ rule: 'rule-x', file: 'vendor/lib.js', message: 'Ignore me' }];
    const { filtered, waived } = applyWaivers(issues, makeWaivers(), ['vendor/**']);
    expect(filtered).toEqual([]);
    expect(waived[0].waiverReason).toBe('gatekeeper-ignore');
  });

  it('extracts file path from issue.path when issue.file is absent', () => {
    const issues = [{ rule: 'rule-x', path: 'vendor/lib.js' }];
    const { filtered, waived } = applyWaivers(issues, makeWaivers(), ['vendor/**']);
    expect(filtered).toEqual([]);
    expect(waived).toHaveLength(1);
  });

  it('extracts file path from message when file and path are absent', () => {
    const issues = [{ rule: 'rule-x', message: 'Problem in "src/bad.js"' }];
    const { filtered, waived } = applyWaivers(issues, makeWaivers(), ['src/*.js']);
    expect(filtered).toEqual([]);
    expect(waived).toHaveLength(1);
  });

  it('does not suppress when ignore pattern does not match', () => {
    const issues = [{ rule: 'rule-x', file: 'src/important.js' }];
    const { filtered, waived } = applyWaivers(issues, makeWaivers(), ['vendor/**']);
    expect(filtered).toHaveLength(1);
    expect(waived).toHaveLength(0);
  });

  it('applies both file-level and rule-level waivers together', () => {
    const issues = [
      { rule: 'rule-a', file: 'vendor/lib.js' },
      { rule: 'rule-b', file: 'src/app.js' },
      { rule: 'rule-c', file: 'src/core.js' },
    ];
    const { filtered, waived } = applyWaivers(
      issues,
      makeWaivers({ waivedRules: ['rule-b'] }),
      ['vendor/**']
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].rule).toBe('rule-c');
    expect(waived).toHaveLength(2);
  });
});

// ─── buildWaiverSummary ───────────────────────────────────────────────────────

describe('buildWaiverSummary', () => {
  const emptyWaivers = { waivedRules: [], timeBoxed: [], baselineFreeze: false, emergencyOverride: false };

  it('returns null when nothing is active and no issues are waived', () => {
    expect(buildWaiverSummary(emptyWaivers, [])).toBeNull();
  });

  it('includes emergency override notice', () => {
    const summary = buildWaiverSummary({ ...emptyWaivers, emergencyOverride: true }, []);
    expect(summary).toMatch(/Emergency override active/);
  });

  it('includes baseline freeze notice', () => {
    const summary = buildWaiverSummary({ ...emptyWaivers, baselineFreeze: true }, []);
    expect(summary).toMatch(/Baseline freeze active/);
  });

  it('includes waived rules list', () => {
    const summary = buildWaiverSummary({ ...emptyWaivers, waivedRules: ['rule-a', 'rule-b'] }, []);
    expect(summary).toMatch(/rule-a/);
    expect(summary).toMatch(/rule-b/);
  });

  it('includes time-boxed waiver durations', () => {
    const summary = buildWaiverSummary({ ...emptyWaivers, timeBoxed: ['7d', '14d'] }, []);
    expect(summary).toMatch(/7d/);
    expect(summary).toMatch(/14d/);
  });

  it('includes count of suppressed issues', () => {
    const waivedIssues = [{ rule: 'x' }, { rule: 'y' }];
    const summary = buildWaiverSummary(emptyWaivers, waivedIssues);
    expect(summary).toMatch(/2 issue\(s\) suppressed/);
  });

  it('combines multiple active components', () => {
    const waivers = {
      waivedRules: ['rule-a'],
      timeBoxed: ['3d'],
      baselineFreeze: true,
      emergencyOverride: false,
    };
    const summary = buildWaiverSummary(waivers, [{ rule: 'rule-a' }]);
    expect(summary).toMatch(/Baseline freeze active/);
    expect(summary).toMatch(/rule-a/);
    expect(summary).toMatch(/3d/);
    expect(summary).toMatch(/1 issue\(s\) suppressed/);
  });
});
