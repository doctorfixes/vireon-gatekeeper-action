/**
 * Governance Runtime Kernel
 * Orchestrates governance contract, enforcement, inference, drift, rules, and rendering.
 */

import { compileGovernanceContract } from './compileGovernanceContract.js';
import { enforceGovernanceContract } from './enforceGovernanceContract.js';
import { renderGovernanceContract } from './renderGovernanceContract.js';

import { buildBaseline, loadBaseline } from './inferenceEngine.js';
import { loadBaseline as loadBaselineLifecycle, saveBaseline, loadHistory } from './baselineLifecycle.js';
import { computeDriftOverTime } from './driftOverTime.js';
import { generateArchitectureHealthReport } from './architectureHealthReport.js';
import { explainResults } from './explainWhy.js';

import repoLearningRule from '../rules/repo-learning.js';

async function runGovernanceKernel({
  contractPath,
  schemaPath,
  context,
  options = {}
}) {
  // 1. Compile governance contract
  const contract = compileGovernanceContract(contractPath, schemaPath);

  // 2. Load baseline + history
  let baseline = loadBaselineLifecycle();
  const history = loadHistory();

  // 3. Build baseline if missing and allowed
  if (!baseline && contract.baseline.mode !== 'frozen') {
    const inferred = await buildBaseline(context);
    baseline = saveBaseline(inferred, context.commitHash);
  }

  // 4. Compute drift-over-time metrics
  const driftOverTime = computeDriftOverTime(history);

  // 5. Run repo-learning rule pack
  const ruleResult = await repoLearningRule.check(
    {
      ...context,
      baseline: baseline?.data || baseline // support both shapes
    },
    contract
  );

  // 6. Explain findings
  const explainedResults = explainResults(
    [
      {
        id: repoLearningRule.id,
        messages: ruleResult.messages,
        metadata: ruleResult.metadata
      }
    ],
    { settings: { comments: { explain_why: true } } }
  );

  // 7. Governance state for enforcement + rendering
  const governanceState = buildGovernanceState(contract, {
    baseline,
    ruleResult,
    driftOverTime,
    context
  });

  // 8. Enforce governance contract itself
  const enforcementCheck = enforceGovernanceContract(
    contract,
    governanceState,
    {
      proposedBaselineUpdate: options.proposedBaselineUpdate || false,
      ruleChanges: options.ruleChanges || [],
      proposedEnforcementMode: options.proposedEnforcementMode || null,
      orgLevelChange: options.orgLevelChange || false
    }
  );

  // 9. Generate architecture health report (optional but powerful)
  const healthReport = generateArchitectureHealthReport({
    baseline: baseline.data || baseline,
    history,
    driftOverTime,
    recentFindings: ruleResult.metadata.findings || []
  });

  // 10. Render governance contract state for PR
  const governanceComment = renderGovernanceContract(
    contract,
    governanceState
  );

  // 11. Final decision
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
  const waivers = extractWaiversFromContext(context);

  return {
    contractVersion: contract.version,
    enforcementMode: contract.enforcement.mode,
    baselineMode: contract.baseline.mode,
    baselineFrozen: contract.baseline.freezeEnabled === true,
    baselinePendingUpdate: false, // can be wired to baseline lifecycle later
    ruleAuthority: 'core', // placeholder: can be derived per-rule
    waiverStatus: {
      active: waivers.length > 0,
      items: waivers
    },
    authority: {
      canUpdateBaseline: true, // wire to auth later
      canModifyRulePacks: ['local'], // example
      canChangeEnforcementMode: true,
      canModifyOrgGovernance: false
    },
    drift: driftOverTime,
    lastRunCommit: context.commitHash
  };
}

function extractWaiversFromContext(context) {
  const labels = context.labels || [];
  const waivers = [];

  labels.forEach(label => {
    if (label.startsWith('gatekeeper-waive:')) {
      const parts = label.split(':');
      const rule = parts[1];
      const duration = parts[2] || null;

      let expires = null;
      if (duration && duration.endsWith('d')) {
        const days = parseInt(duration.replace('d', ''), 10);
        const d = new Date();
        d.setDate(d.getDate() + days);
        expires = d.toISOString();
      }

      waivers.push({
        rule,
        expires: expires || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // default 7d
      });
    }
  });

  return waivers;
}

export { runGovernanceKernel };
