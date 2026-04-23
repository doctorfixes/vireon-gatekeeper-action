const path = require('path');
const { runGatekeeper } = require('../src/kernel');

describe('Gatekeeper kernel v1.1', () => {
  const base = path.resolve(__dirname, '..');

  it('allows a valid contract in enforce mode', async () => {
    const contract = path.join(base, '__tests__/fixtures/contract.valid.json');
    const schema = path.join(base, '.gatekeeper/schema.json');

    const result = await runGatekeeper({ contractPath: contract, schemaPath: schema, mode: 'enforce' });

    expect(result.shouldBlock).toBe(false);
    expect(result.failure_type).toBe('none');
  });

  it('blocks a high-risk contract in enforce mode', async () => {
    const contract = path.join(base, '__tests__/fixtures/contract.drift.json');
    const schema = path.join(base, '.gatekeeper/schema.json');

    const result = await runGatekeeper({ contractPath: contract, schemaPath: schema, mode: 'enforce' });

    expect(result.shouldBlock).toBe(true);
    expect(result.failure_type).toBe('policy_violation');
  });

  it('does not block in observe mode, even with violations', async () => {
    const contract = path.join(base, '__tests__/fixtures/contract.drift.json');
    const schema = path.join(base, '.gatekeeper/schema.json');

    const result = await runGatekeeper({ contractPath: contract, schemaPath: schema, mode: 'observe' });

    expect(result.shouldBlock).toBe(false);
    expect(result.failure_type).toBe('policy_violation');
  });
});
