const fs = require('fs');
const { validateSchema } = require('./schema');
const { evaluateRules } = require('./rules');
const { computeDriftScore } = require('./drift');

function loadJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

async function runGatekeeper({ contractPath, schemaPath, mode = 'observe' }) {
  let contract;
  let schema;

  try {
    contract = loadJson(contractPath);
  } catch (e) {
    return {
      shouldBlock: mode === 'enforce',
      reason: `Unable to load contract: ${e.message}`,
      score: 1,
      failure_type: 'contract_error'
    };
  }

  try {
    schema = loadJson(schemaPath);
  } catch (e) {
    return {
      shouldBlock: mode === 'enforce',
      reason: `Unable to load schema: ${e.message}`,
      score: 1,
      failure_type: 'schema_error'
    };
  }

  try {
    validateSchema(schema, contract);
  } catch (e) {
    return {
      shouldBlock: mode === 'enforce',
      reason: `Schema validation error: ${e.message}`,
      score: 1,
      failure_type: 'schema_error'
    };
  }

  const evaluation = evaluateRules({ contract, schema });
  const drift = computeDriftScore(evaluation);

  const policyViolation = evaluation.violations.length > 0;
  const shouldBlock = mode === 'enforce' && policyViolation && drift.score >= 0.7;

  return {
    shouldBlock,
    reason: drift.reason,
    score: drift.score,
    failure_type: policyViolation ? 'policy_violation' : 'none',
    details: evaluation
  };
}

module.exports = { runGatekeeper };
