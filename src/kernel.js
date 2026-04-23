// src/kernel.js
const fs = require('fs');
const { validateSchema } = require('./schema');
const { evaluateRules } = require('./rules');
const { computeDriftScore } = require('./drift');

function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

/**
 * Orchestrates the full Gatekeeper evaluation.
 * Returns: { shouldBlock, reason, score, details }
 */
async function runGatekeeper({ contractPath, schemaPath }) {
  const contract = loadJson(contractPath);
  const schema = loadJson(schemaPath);

  validateSchema(schema, contract);

  const evaluation = evaluateRules({ contract, schema });
  const drift = computeDriftScore(evaluation);

  const shouldBlock = drift.score >= 0.7;

  return {
    shouldBlock,
    reason: drift.reason,
    score: drift.score,
    details: evaluation
  };
}

module.exports = {
  runGatekeeper
};
