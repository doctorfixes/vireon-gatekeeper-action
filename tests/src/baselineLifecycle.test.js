const fs = require('fs');
const path = require('path');

jest.mock('fs');

const { loadBaseline, saveBaseline, loadHistory } = require('../../src/baselineLifecycle.js');

describe('baselineLifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── loadBaseline ──────────────────────────────────────────────────────────

  describe('loadBaseline', () => {
    it('returns null when baseline file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const result = loadBaseline();
      expect(result).toBeNull();
    });

    it('parses and returns the baseline when file exists', () => {
      const baseline = { summary: 'Baseline v1', layers: ['core'] };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(baseline));
      const result = loadBaseline();
      expect(result).toEqual(baseline);
    });
  });

  // ─── loadHistory ───────────────────────────────────────────────────────────

  describe('loadHistory', () => {
    it('returns an empty array when history file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const result = loadHistory();
      expect(result).toEqual([]);
    });

    it('returns the parsed history array when file exists', () => {
      const history = [{ commitHash: 'abc' }, { commitHash: 'def' }];
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(history));
      const result = loadHistory();
      expect(result).toEqual(history);
    });
  });

  // ─── saveBaseline ──────────────────────────────────────────────────────────

  describe('saveBaseline', () => {
    it('enriches the baseline with commitHash and writes it to disk', () => {
      // existsSync: dir exists, history file exists
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('[]');
      fs.writeFileSync.mockImplementation(() => {});

      const baseline = { summary: 'test', layers: [] };
      const result = saveBaseline(baseline, 'commit-hash-123');

      expect(result.commitHash).toBe('commit-hash-123');
      expect(fs.writeFileSync).toHaveBeenCalledTimes(2); // baseline + history
    });

    it('creates the directory when it does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync = jest.fn();
      fs.writeFileSync.mockImplementation(() => {});

      saveBaseline({ summary: 'test' }, 'hash-abc');
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
    });

    it('appends entry to existing history', () => {
      const existingHistory = [{ commitHash: 'old-hash', summary: 'old' }];
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify(existingHistory));
      fs.writeFileSync.mockImplementation(() => {});

      const baseline = { summary: 'new' };
      saveBaseline(baseline, 'new-hash');

      // Find the writeFileSync call for history
      const historyCalls = fs.writeFileSync.mock.calls;
      // At least 2 writes: one for baseline, one for history
      expect(historyCalls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
