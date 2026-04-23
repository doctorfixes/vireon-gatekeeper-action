const fs = require('fs');
const { validateSchema } = require('./schema');
const { evaluateRules } = require('./rules');
const { computeDriftScore } = require('./drift');

function loadJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

async function runGatekeeper({ contractPath, schemaPath, mode = 'enforce' }) {
  let contract;
  let schema;

  try {
    contract = loadJson(contractPath);
  } catch (e) {
    return {
      shouldBlock: mode === 'enforce',
      reason: `Config error: unable to load contract at ${contractPath} (${e.message})`,
      score: 1,
      failure_type: 'config_error',
      details: null
    };
  }

  try {
    schema = loadJson(schemaPath);
  } catch (e) {
    return {
      shouldBlock: mode === 'enforce',
      reason: `Config error: unable to load schema at ${schemaPath} (${e.message})`,
      score: 1,
      failure_type: 'config_error',
      details: null
    };
  }

  try {
    validateSchema(schema, contract);
  } catch (e) {
    return {
      shouldBlock: mode === 'enforce',
      reason: `Config error: ${e.message}`,
      score: 1,
      failure_type: 'config_error',
      details: null
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
