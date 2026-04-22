jest.mock('@actions/core');

import { loadGovernanceContract, GOVERNANCE_CONTRACT_DEFAULTS, DEFAULT_CONTRACT_PATH } from '../../src/loadGovernanceContract.js';
import core from '@actions/core';
import * as fs from 'fs';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

describe('loadGovernanceContract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when contract file does not exist', () => {
    it('returns defaults and logs info', () => {
      fs.existsSync.mockReturnValue(false);
      const result = loadGovernanceContract('/some/path.json');
      expect(result).toEqual(GOVERNANCE_CONTRACT_DEFAULTS);
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining('No governance contract found'));
    });

    it('uses DEFAULT_CONTRACT_PATH when no path is provided', () => {
      fs.existsSync.mockReturnValue(false);
      loadGovernanceContract();
      expect(core.info).toHaveBeenCalledWith(expect.stringContaining(DEFAULT_CONTRACT_PATH));
    });
  });

  describe('when contract file contains invalid JSON', () => {
    it('returns defaults and logs a warning', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('{ invalid json }');
      const result = loadGovernanceContract('/path.json');
      expect(result).toEqual(GOVERNANCE_CONTRACT_DEFAULTS);
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to parse'));
    });
  });

  describe('when contract file is missing required fields', () => {
    it('warns about missing fields and fills with defaults', () => {
      const partial = JSON.stringify({ version: 'v2', authority: { repoMaintainers: [] } });
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(partial);
      const result = loadGovernanceContract('/path.json');
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('missing required fields'));
      // Missing fields get defaults
      expect(result.enforcement).toEqual(GOVERNANCE_CONTRACT_DEFAULTS.enforcement);
      expect(result.baseline).toEqual(GOVERNANCE_CONTRACT_DEFAULTS.baseline);
    });
  });

  describe('when a complete valid contract is provided', () => {
    it('returns the parsed contract merged with defaults', () => {
      const contract = {
        version: 'v2',
        authority: {
          repoMaintainers: ['alice', 'bob'],
          orgGovernanceGroup: ['org-team'],
          engine: { canModifyGovernance: true, canProposeBaselineUpdates: false },
        },
        baseline: { mode: 'frozen', freezeEnabled: true, updatePolicy: 'auto' },
        enforcement: { mode: 'strict', criticalRules: ['rule-a'] },
        rules: { core: ['c1'], local: ['l1'], org: [] },
        waivers: { allowedTypes: ['rule-waiver'], maxDurationDays: 7, requireApproval: false },
        orgGovernance: {
          baselinePolicy: 'aggregate',
          allowedRepoClasses: ['core'],
          crossRepoRulesEnabled: true,
        },
        transparency: {
          showGovernanceState: false,
          showBaselineState: true,
          showWaivers: false,
          showAuthority: true,
        },
        reversibility: {
          allowBaselineRollback: false,
          allowRuleRollback: true,
          allowEnforcementRollback: false,
        },
      };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(contract));

      const result = loadGovernanceContract('/path.json');

      expect(result.version).toBe('v2');
      expect(result.authority.repoMaintainers).toEqual(['alice', 'bob']);
      expect(result.baseline.mode).toBe('frozen');
      expect(result.enforcement.mode).toBe('strict');
      expect(result.enforcement.criticalRules).toEqual(['rule-a']);
      expect(result.waivers.maxDurationDays).toBe(7);
      expect(result.transparency.showGovernanceState).toBe(false);
      expect(result.reversibility.allowBaselineRollback).toBe(false);
    });
  });

  describe('normalisation of invalid enum values', () => {
    it('falls back to default baseline mode for unknown values', () => {
      const contract = {
        version: 'v2',
        authority: {}, baseline: { mode: 'unsupported' },
        enforcement: {}, rules: {}, waivers: {}, orgGovernance: {},
      };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(contract));
      const result = loadGovernanceContract('/path.json');
      expect(result.baseline.mode).toBe(GOVERNANCE_CONTRACT_DEFAULTS.baseline.mode);
    });

    it('falls back to default enforcement mode for unknown values', () => {
      const contract = {
        version: 'v2',
        authority: {}, baseline: {}, enforcement: { mode: 'super-strict' },
        rules: {}, waivers: {}, orgGovernance: {},
      };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(contract));
      const result = loadGovernanceContract('/path.json');
      expect(result.enforcement.mode).toBe(GOVERNANCE_CONTRACT_DEFAULTS.enforcement.mode);
    });
  });

  it('exports GOVERNANCE_CONTRACT_DEFAULTS with expected shape', () => {
    expect(GOVERNANCE_CONTRACT_DEFAULTS).toHaveProperty('version');
    expect(GOVERNANCE_CONTRACT_DEFAULTS).toHaveProperty('authority');
    expect(GOVERNANCE_CONTRACT_DEFAULTS).toHaveProperty('baseline');
    expect(GOVERNANCE_CONTRACT_DEFAULTS).toHaveProperty('enforcement');
    expect(GOVERNANCE_CONTRACT_DEFAULTS).toHaveProperty('rules');
    expect(GOVERNANCE_CONTRACT_DEFAULTS).toHaveProperty('waivers');
    expect(GOVERNANCE_CONTRACT_DEFAULTS).toHaveProperty('orgGovernance');
    expect(GOVERNANCE_CONTRACT_DEFAULTS).toHaveProperty('transparency');
    expect(GOVERNANCE_CONTRACT_DEFAULTS).toHaveProperty('reversibility');
  });

  it('exports DEFAULT_CONTRACT_PATH', () => {
    expect(typeof DEFAULT_CONTRACT_PATH).toBe('string');
    expect(DEFAULT_CONTRACT_PATH).toContain('gatekeeper-governance.json');
  });
});
