const { runGovernanceKernel } = require('./governanceKernel');

/**
 * Orchestrates the full Gatekeeper evaluation.
 *
 * @param {{ contractPath: string, schemaPath: string }} params
 * @returns {Promise<{ shouldBlock: boolean, reason: string, score?: number, details?: any }>}
 */
async function runGatekeeper({ contractPath, schemaPath }) {
  const context = {
    commitHash: process.env.GITHUB_SHA || 'unknown',
  };

  const result = await runGovernanceKernel({ contractPath, schemaPath, context });

  const rawMessages = result.ruleResult?.messages;
  const messages = Array.isArray(rawMessages) ? rawMessages : [];
  const reason = messages.length > 0 ? messages.join(' ') : undefined;

  return {
    shouldBlock: !!result.shouldBlock,
    ...(reason !== undefined && { reason }),
    details: {
      ruleResult: result.ruleResult,
      enforcementCheck: result.enforcementCheck,
      driftOverTime: result.driftOverTime,
      healthReport: result.healthReport,
    },
  };
}

module.exports = { runGatekeeper };
