import {
  aggregateRepoBaselines,
  computeOrgMetrics,
  generateOrgReport,
} from '../../src/orgGovernance.js';
import * as fs from 'fs';

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue('[]'),
  writeFileSync: jest.fn(),
}));

// ─── aggregateRepoBaselines ───────────────────────────────────────────────────

describe('aggregateRepoBaselines', () => {
  it('returns empty baseline for no input', () => {
    const result = aggregateRepoBaselines([]);
    expect(result).toEqual({
      layers: [],
      naming: { file_case: 'kebab' },
      boundaries: { edges: [] },
    });
  });

  it('returns empty baseline for null input', () => {
    const result = aggregateRepoBaselines(null);
    expect(result.layers).toEqual([]);
  });

  it('unions layers from multiple repos', () => {
    const repos = [
      { data: { layers: ['core', 'services'], naming: { file_case: 'kebab' }, boundaries: { edges: [] } } },
      { data: { layers: ['services', 'ui'], naming: { file_case: 'kebab' }, boundaries: { edges: [] } } },
    ];
    const result = aggregateRepoBaselines(repos);
    expect(result.layers).toContain('core');
    expect(result.layers).toContain('services');
    expect(result.layers).toContain('ui');
    expect(result.layers).toHaveLength(3);
  });

  it('picks the dominant naming convention', () => {
    const repos = [
      { data: { layers: [], naming: { file_case: 'kebab' }, boundaries: { edges: [] } } },
      { data: { layers: [], naming: { file_case: 'kebab' }, boundaries: { edges: [] } } },
      { data: { layers: [], naming: { file_case: 'snake' }, boundaries: { edges: [] } } },
    ];
    const result = aggregateRepoBaselines(repos);
    expect(result.naming.file_case).toBe('kebab');
  });

  it('unions boundary edges from multiple repos', () => {
    const repos = [
      { data: { layers: [], naming: { file_case: 'kebab' }, boundaries: { edges: ['a->b'] } } },
      { data: { layers: [], naming: { file_case: 'kebab' }, boundaries: { edges: ['b->c', 'a->b'] } } },
    ];
    const result = aggregateRepoBaselines(repos);
    expect(result.boundaries.edges).toContain('a->b');
    expect(result.boundaries.edges).toContain('b->c');
    expect(result.boundaries.edges).toHaveLength(2);
  });

  it('handles edges as an object (dict)', () => {
    const repos = [
      { data: { layers: [], naming: { file_case: 'kebab' }, boundaries: { edges: { 'a->b': true, 'b->c': true } } } },
    ];
    const result = aggregateRepoBaselines(repos);
    expect(result.boundaries.edges).toContain('a->b');
    expect(result.boundaries.edges).toContain('b->c');
  });

  it('handles repo data at the top level (no .data wrapper)', () => {
    const repos = [
      { layers: ['core'], naming: { file_case: 'snake' }, boundaries: { edges: [] } },
    ];
    const result = aggregateRepoBaselines(repos);
    expect(result.layers).toContain('core');
    expect(result.naming.file_case).toBe('snake');
  });

  it('defaults naming to kebab when no naming info is available', () => {
    const repos = [{ data: { layers: [], boundaries: { edges: [] } } }];
    const result = aggregateRepoBaselines(repos);
    expect(result.naming.file_case).toBe('kebab');
  });
});

// ─── computeOrgMetrics ────────────────────────────────────────────────────────

describe('computeOrgMetrics', () => {
  beforeEach(() => {
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('[]');
  });

  it('returns 1.0 stability for a single history entry', () => {
    const orgBaseline = { layers: ['core'], naming: { file_case: 'kebab' }, boundaries: { edges: [] } };
    const orgHistory = [{ data: orgBaseline }];
    const metrics = computeOrgMetrics(orgBaseline, orgHistory, []);
    expect(metrics.architectureStability).toBe(1.0);
    expect(metrics.namingStability).toBe(1.0);
    expect(metrics.boundaryStability).toBe(1.0);
  });

  it('computes architecture stability with no layer changes', () => {
    const baseline = { layers: ['core'], naming: { file_case: 'kebab' }, boundaries: { edges: [] } };
    const history = [
      { data: { layers: ['core'], naming: { file_case: 'kebab' }, boundaries: { edges: [] } } },
      { data: { layers: ['core'], naming: { file_case: 'kebab' }, boundaries: { edges: [] } } },
    ];
    const metrics = computeOrgMetrics(baseline, history, []);
    expect(metrics.architectureStability).toBe(1.0);
  });

  it('computes architecture stability with layer changes', () => {
    const baseline = { layers: ['core', 'ui'], naming: { file_case: 'kebab' }, boundaries: { edges: [] } };
    const history = [
      { data: { layers: ['core'], naming: { file_case: 'kebab' }, boundaries: { edges: [] } } },
      { data: { layers: ['core', 'ui'], naming: { file_case: 'kebab' }, boundaries: { edges: [] } } },
      { data: { layers: ['core'], naming: { file_case: 'kebab' }, boundaries: { edges: [] } } },
    ];
    const metrics = computeOrgMetrics(baseline, history, []);
    // 2 changes out of 2 transitions → stability = 1 - 2/2 = 0
    expect(metrics.architectureStability).toBe(0);
  });

  it('derives trend stable when average is >= 0.9', () => {
    const baseline = { layers: ['core'], naming: { file_case: 'kebab' }, boundaries: { edges: [] } };
    const history = [{ data: baseline }];
    const metrics = computeOrgMetrics(baseline, history, []);
    expect(metrics.driftTrend).toBe('stable');
  });

  it('includes per-repo scores', () => {
    const baseline = { layers: [], naming: { file_case: 'kebab' }, boundaries: { edges: [] } };
    const repoBaselines = [
      { repo: 'repo-a', data: { layers: ['core'], naming: { file_case: 'kebab' }, boundaries: { edges: ['a->b'] } } },
    ];
    const metrics = computeOrgMetrics(baseline, [{ data: baseline }], repoBaselines);
    expect(metrics.repoScores).toHaveLength(1);
    expect(metrics.repoScores[0].repo).toBe('repo-a');
    expect(metrics.repoScores[0].layerCount).toBe(1);
    expect(metrics.repoScores[0].edgeCount).toBe(1);
  });

  it('writes metrics to file', () => {
    const baseline = { layers: [], naming: { file_case: 'kebab' }, boundaries: { edges: [] } };
    computeOrgMetrics(baseline, [{ data: baseline }], []);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});

// ─── generateOrgReport ────────────────────────────────────────────────────────

describe('generateOrgReport', () => {
  beforeEach(() => {
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('[]');
  });

  const makeMetrics = (overrides = {}) => ({
    architectureStability: 1.0,
    namingStability: 1.0,
    boundaryStability: 1.0,
    driftTrend: 'stable',
    repoScores: [],
    orgScore: 1.0,
    ...overrides,
  });

  it('returns a markdown string', () => {
    const orgBaseline = { layers: ['core'], naming: { file_case: 'kebab' }, boundaries: { edges: [] } };
    const report = generateOrgReport(orgBaseline, makeMetrics(), []);
    expect(typeof report).toBe('string');
    expect(report).toContain('Organizational Architecture Health Report');
  });

  it('includes stability metrics in report', () => {
    const orgBaseline = { layers: [], naming: { file_case: 'kebab' }, boundaries: { edges: [] } };
    const report = generateOrgReport(orgBaseline, makeMetrics({ architectureStability: 0.75 }), []);
    expect(report).toContain('0.75');
  });

  it('includes drift trend in report', () => {
    const orgBaseline = { layers: [], naming: { file_case: 'kebab' }, boundaries: { edges: [] } };
    const report = generateOrgReport(orgBaseline, makeMetrics({ driftTrend: 'drifting' }), []);
    expect(report).toContain('drifting');
  });

  it('lists layers in report', () => {
    const orgBaseline = { layers: ['core', 'services'], naming: { file_case: 'kebab' }, boundaries: { edges: [] } };
    const report = generateOrgReport(orgBaseline, makeMetrics(), []);
    expect(report).toContain('core');
    expect(report).toContain('services');
  });

  it('shows none detected when no layers', () => {
    const orgBaseline = { layers: [], naming: { file_case: 'kebab' }, boundaries: { edges: [] } };
    const report = generateOrgReport(orgBaseline, makeMetrics(), []);
    expect(report).toContain('_none detected_');
  });

  it('includes per-repo table when scores are present', () => {
    const orgBaseline = { layers: [], naming: { file_case: 'kebab' }, boundaries: { edges: [] } };
    const metrics = makeMetrics({
      repoScores: [{ repo: 'my-repo', namingCase: 'kebab', layerCount: 2, edgeCount: 3 }],
    });
    const report = generateOrgReport(orgBaseline, metrics, []);
    expect(report).toContain('my-repo');
  });

  it('reports naming outliers', () => {
    const orgBaseline = { layers: [], naming: { file_case: 'kebab' }, boundaries: { edges: [] } };
    const metrics = makeMetrics({
      repoScores: [{ repo: 'odd-repo', namingCase: 'snake', layerCount: 0, edgeCount: 0 }],
    });
    const report = generateOrgReport(orgBaseline, metrics, []);
    expect(report).toContain('odd-repo');
    expect(report).toContain('snake');
  });

  it('includes stability recommendations when stability is low', () => {
    const orgBaseline = { layers: [], naming: { file_case: 'kebab' }, boundaries: { edges: [] } };
    const metrics = makeMetrics({
      architectureStability: 0.5,
      namingStability: 0.5,
      boundaryStability: 0.5,
      driftTrend: 'critical',
    });
    const report = generateOrgReport(orgBaseline, metrics, []);
    expect(report).toContain('architecture standard');
    expect(report).toContain('naming standard');
    expect(report).toContain('boundary rules');
    expect(report).toContain('critical drift');
  });

  it('writes report to file', () => {
    const orgBaseline = { layers: [], naming: { file_case: 'kebab' }, boundaries: { edges: [] } };
    generateOrgReport(orgBaseline, makeMetrics(), []);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
