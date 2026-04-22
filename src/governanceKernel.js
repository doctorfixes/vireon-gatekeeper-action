const { compileGovernanceContract } = require('./compileGovernanceContract');
const { enforceGovernanceContract } = require('./enforceGovernanceContract');
const { renderGovernanceContract } = require('./renderGovernanceContract');
const { buildBaseline } = require('./inferenceEngine');
const baselineLifecycle = require('./baselineLifecycle');
const { computeDriftOverTime } = require('./driftOverTime');
const { generateArchitectureHealthReport } = require('./architectureHealthReport');
const { explainResults } = require('./explainWhy');
const repoLearningRule = require('../rules/repo-learning');

async function runGovernanceKernel({ contractPath, schemaPath, context, options = {} }) {
  const contract = compileGovernanceContract(contractPath, schemaPath);

  let baseline = baselineLifecycle.loadBaseline();
  const history = baselineLifecycle.loadHistory();

  if (!baseline && contract.baseline.mode !== 'frozen') {
    const inferred = await buildBaseline(context);
    baseline = baselineLifecycle.saveBaseline(inferred, context.commitHash);
  }

  const driftOverTime = computeDriftOverTime(history);

  const ruleResult = await repoLearningRule.check(
    { ...context, baseline },
    contract
  );

  const explainedResults = explainResults(
    [{ id: repoLearningRule.id, messages: ruleResult.messages, metadata: ruleResult.metadata }],
    { settings: { comments: { explain_why: true } } }
  );

  const governanceState = buildGovernanceState(contract, {
    baseline,
    ruleResult,
    driftOverTime,
    context
  });

  const enforcementCheck = enforceGovernanceContract(contract, governanceState, options);

  const healthReport = generateArchitectureHealthReport({
    baseline,
    history,
    driftOverTime,
    recentFindings: ruleResult.metadata?.findings || []
  });

  const governanceComment = renderGovernanceContract(contract, governanceState, {
    explainedResults,
    healthReport
  });

  const shouldBlock =
    contract.enforcement.mode === 'strict' &&
    ruleResult.passed === false &&
    enforcementCheck.passed === true;

  return {
    shouldBlock,
    ruleResult,
    explainedResults,
    enforcementCheck,
    governanceComment,
    healthReport,
    driftOverTime
  };
}

function buildGovernanceState(contract, { baseline, ruleResult, driftOverTime, context }) {
  return {
    contractVersion: contract.version,
    enforcementMode: contract.enforcement.mode,
    baselineMode: contract.baseline.mode,
    baselineFrozen: contract.baseline.freezeEnabled === true,
    baselinePendingUpdate: false,
    waiverStatus: { active: false, items: [] },
    authority: {
      canUpdateBaseline: true,
      canModifyRulePacks: ['local'],
      canChangeEnforcementMode: true,
      canModifyOrgGovernance: false
    },
    drift: driftOverTime,
    lastRunCommit: context.commitHash,
    lastRuleResult: ruleResult
  };
}

module.exports = { runGovernanceKernel };

