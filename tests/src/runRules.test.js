import { runRules } from '../../src/runRules.js';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

describe('runRules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns an empty array when config has no rules', async () => {
    const result = await runRules({ rules: [] }, {});
    expect(result).toEqual([]);
  });

  it('returns an empty array when config.rules is missing', async () => {
    const result = await runRules({}, {});
    expect(result).toEqual([]);
  });

  it('skips a rule ID that is in nativeIds', async () => {
    const nativeIds = new Set(['native-rule']);
    const result = await runRules({ rules: ['native-rule'] }, {}, nativeIds);
    expect(result).toEqual([]);
  });

  it('fails a rule with invalid characters in the ID', async () => {
    const result = await runRules({ rules: ['../../evil'] }, {});
    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
    expect(result[0].error).toMatch(/invalid characters/);
    expect(result[0].messages[0]).toMatch(/Invalid rule ID/);
  });

  it('fails a rule whose ID has a path separator', async () => {
    const result = await runRules({ rules: ['some/path'] }, {});
    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
    expect(result[0].error).toMatch(/invalid characters/);
  });

  it('fails cleanly when the rule file does not exist', async () => {
    fs.existsSync.mockReturnValue(false);
    const result = await runRules({ rules: ['nonexistent-rule'] }, {});
    expect(result).toHaveLength(1);
    expect(result[0].passed).toBe(false);
    expect(result[0].error).toMatch(/not found/);
    expect(result[0].messages[0]).toMatch(/Missing rule pack/);
  });

  it('processes multiple rules and returns results for each', async () => {
    // Both rules are nonexistent but have valid IDs
    fs.existsSync.mockReturnValue(false);
    const result = await runRules({ rules: ['rule-one', 'rule-two'] }, {});
    expect(result).toHaveLength(2);
    expect(result[0].rule).toBe('rule-one');
    expect(result[1].rule).toBe('rule-two');
  });

  it('skips native IDs even when mixed with non-native IDs', async () => {
    fs.existsSync.mockReturnValue(false);
    const nativeIds = new Set(['native-check']);
    const result = await runRules({ rules: ['native-check', 'custom-rule'] }, {}, nativeIds);
    expect(result).toHaveLength(1);
    expect(result[0].rule).toBe('custom-rule');
  });
});
