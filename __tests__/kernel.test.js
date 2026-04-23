// __tests__/kernel.test.js
const path = require('path');
const { runGatekeeper } = require('../src/kernel');

describe('Gatekeeper kernel', () => {
  const base = path.resolve(__dirname, '..');

  it('returns allow for a valid, low-risk contract', async () => {
    const contractPath = path.join(base, '__tests__/fixtures/contract.valid.json');
    const schemaPath = path.join(base, '.gatekeeper/schema.json');

    const result = await runGatekeeper({ contractPath, schemaPath });

    expect(typeof result.shouldBlock).toBe('boolean');
    expect(result.shouldBlock).toBe(false);
    expect(typeof result.reason).toBe('string');
    expect(typeof result.score).toBe('number');
  });

  it('returns block for a high-risk contract', async () => {
    const contractPath = path.join(base, '__tests__/fixtures/contract.drift.json');
    const schemaPath = path.join(base, '.gatekeeper/schema.json');

    const result = await runGatekeeper({ contractPath, schemaPath });

    expect(result.shouldBlock).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.7);
  });
});
