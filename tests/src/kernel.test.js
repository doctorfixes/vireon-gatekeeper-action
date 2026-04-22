const path = require('path');
const { runGatekeeper } = require('../../src/kernel');

describe('Gatekeeper kernel', () => {
  const contractPath = path.resolve(__dirname, '../../.gatekeeper/contract.json');
  const schemaPath = path.resolve(__dirname, '../../.gatekeeper/schema.json');

  it('runs without throwing and returns a decision shape', async () => {
    const result = await runGatekeeper({ contractPath, schemaPath });

    expect(result).toHaveProperty('shouldBlock');
    expect(typeof result.shouldBlock).toBe('boolean');

    if (result.reason !== undefined) {
      expect(typeof result.reason).toBe('string');
    }
  });

  it('returns shouldBlock: false for advisory enforcement mode', async () => {
    const result = await runGatekeeper({ contractPath, schemaPath });
    expect(result.shouldBlock).toBe(false);
  });

  it('includes details object with expected fields', async () => {
    const result = await runGatekeeper({ contractPath, schemaPath });
    expect(result).toHaveProperty('details');
    expect(result.details).toHaveProperty('ruleResult');
    expect(result.details).toHaveProperty('enforcementCheck');
    expect(result.details).toHaveProperty('driftOverTime');
    expect(result.details).toHaveProperty('healthReport');
  });
});
