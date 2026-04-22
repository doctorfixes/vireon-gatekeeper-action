import { execFileSync } from "child_process";
import { writeFileSync, readFileSync, existsSync } from "fs";
import * as core from "@actions/core";
import * as github from "@actions/github";
import fetch from "node-fetch";
import semanticDrift from "./checks/semantic-drift.js";
import architectureBoundaries from "./checks/architecture-boundaries.js";
import namingConventions from "./checks/naming-conventions.js";
import { loadConfig } from "./src/loadConfig.js";
import { runRules } from "./src/runRules.js";
import { explainResults } from "./src/explainWhy.js";
import { buildBaselineFromRepo } from "./src/inferenceEngine.js";
import {
  aggregateRepoBaselines,
  saveOrgBaseline,
  loadOrgHistory,
  computeOrgMetrics,
  generateOrgReport,
} from "./src/orgGovernance.js";
import { classifyDrift, shouldBlockMerge, driftLevelLabel, renderGovernanceContract, enforceGovernanceContract } from "./src/governanceContract.js";
import { loadIgnorePatterns, parseWaivers, applyWaivers, buildWaiverSummary } from "./src/waiverEngine.js";
import { loadGovernanceContract } from "./src/loadGovernanceContract.js";

const NATIVE_CHECKS = [semanticDrift, architectureBoundaries, namingConventions];
const NATIVE_IDS = new Set(NATIVE_CHECKS.map((c) => c.id));

// Each detected issue contributes this many points toward the 0-100 risk score.
const RISK_SCORE_PER_ISSUE = 20;
const MAX_RISK_SCORE = 100;

function runNativeChecks(diffText, config) {
  const activeRules = new Set(config.rules.length > 0 ? config.rules : NATIVE_CHECKS.map((c) => c.id));
  const context = {
    diff: diffText,
    sensitivity: config.settings.drift.sensitivity,
    threshold: config.settings.drift.threshold,
    architecture: config.settings.architecture,
    naming: config.settings.naming,
  };

  const allIssues = [];
  let anyFailed = false;

  for (const check of NATIVE_CHECKS) {
    if (!activeRules.has(check.id)) continue;
    const result = check.check(context);
    if (!result.passed) anyFailed = true;
    for (const msg of result.messages) {
      allIssues.push({ rule: check.id, ...msg });
    }
  }

  const riskScore = allIssues.length > 0 ? Math.min(MAX_RISK_SCORE, allIssues.length * RISK_SCORE_PER_ISSUE) : 0;
  return {
    risk_score: riskScore,
    verdict: anyFailed ? "fail" : "pass",
    summary: anyFailed
      ? "Semantic drift detected — structural changes may violate architectural boundaries."
      : "No significant semantic drift detected.",
    issues: allIssues,
  };
}

function buildCliArgs(configPath, configExists) {
  const args = ["gatekeeper", "analyze", "--diff", "vireon_diff.txt", "--output", "result.json"];
  if (configExists(configPath)) {
    args.push("--config", configPath);
  }
  return args;
}

function buildComment(result, config, driftLevel, waiverSummary, governanceState, contract) {
  const { summary, explain_why, max_messages } = config.settings.comments;
  const advisoryBadge = config.mode === "advisory" ? " *(advisory)*" : "";
  const hybridBadge = config.mode === "hybrid" ? " *(hybrid)*" : "";

  let body = `### 🛡️ Vireon Gatekeeper Result${advisoryBadge}${hybridBadge}  \n`;
  body += `**Risk Score:** ${result.risk_score}  \n`;
  body += `**Drift Level:** ${driftLevelLabel(driftLevel ?? 'none')}  \n`;
  body += `**Verdict:** ${result.verdict}\n\n`;

  if (waiverSummary) {
    body += `${waiverSummary}\n\n`;
  }

  if (summary && result.summary) {
    body += `**Summary:** ${result.summary}\n\n`;
  }

  if (result.issues && result.issues.length > 0) {
    const cappedIssues =
      max_messages != null && max_messages > 0
        ? result.issues.slice(0, max_messages)
        : result.issues;
    const hiddenCount = result.issues.length - cappedIssues.length;

    body += `<details>\n<summary>Issues</summary>\n\n`;

    if (explain_why) {
      const issueLines = cappedIssues
        .map((issue) => {
          const why = issue.why ? `\n  > *Why:* ${issue.why}` : "";
          return `- **${issue.rule ?? "issue"}**: ${issue.message ?? JSON.stringify(issue)}${why}`;
        })
        .join("\n");
      body += `${issueLines}\n\n`;
    } else {
      body += `\`\`\`json\n${JSON.stringify(cappedIssues, null, 2)}\n\`\`\`\n\n`;
    }

    if (hiddenCount > 0) {
      body += `*${hiddenCount} additional issue(s) not shown (max_messages: ${max_messages}).*\n\n`;
    }

    body += `</details>\n`;
  }

  if (governanceState) {
    body += `\n<details>\n<summary>Governance Contract</summary>\n`;
    body += renderGovernanceContract(contract ?? null, governanceState);
    body += `\n</details>\n`;
  }

  return body;
}

/**
 * Determine whether there are unwaived failures that should be acted upon.
 *
 * @param {Array}  activeIssues - Issues that survived waiver filtering.
 * @param {{ emergencyOverride: boolean }} waivers
 * @returns {boolean}
 */
function hasActiveFailures(activeIssues, waivers) {
  if (waivers.emergencyOverride) return false;
  return activeIssues.length > 0;
}

async function run() {
  try {
    const token = core.getInput("token");
    const octokit = github.getOctokit(token);
    const configPath = core.getInput("config") || ".github/gatekeeper.yml";
    const contractPath = core.getInput("governance_contract") || ".github/gatekeeper-governance.json";

    const contract = loadGovernanceContract(contractPath);
    core.info(`Governance contract version: ${contract.version}`);

    // ── Baseline-build mode ────────────────────────────────────────────────
    if (core.getInput("build_baseline") === "true") {
      const config = loadConfig(configPath);
      // Governance contract baseline mode takes precedence over config baseline mode.
      const baselineMode = contract.baseline.mode || config.governance.baseline_mode;

      if (baselineMode === "frozen" || contract.baseline.freezeEnabled) {
        core.setFailed(
          "Governance Contract: baseline_mode is 'frozen' — baseline updates are not permitted. " +
          "Change baseline_mode to 'pr-approved' or 'auto-learn' to enable baseline builds."
        );
        return;
      }

      core.info("Inference engine: scanning repository to build baseline…");
      core.info(`Baseline mode: ${baselineMode}`);
      const commitHash = github.context.sha || null;
      const baseline = buildBaselineFromRepo(".", commitHash);
      core.info(`Baseline written to .gatekeeper/baseline.json`);
      core.info(`Baseline history updated in .gatekeeper/history.json`);
      core.info(`Inferred layers: ${baseline.layers.join(", ") || "(none)"}`);
      core.info(`Inferred naming: ${baseline.naming.file_case}`);
      const edgeCount = Object.keys(baseline.boundaries.edges).length;
      core.info(`Inferred boundary edges: ${edgeCount}`);

      if (baselineMode === "pr-approved") {
        core.info(
          "Governance Contract: baseline_mode is 'pr-approved' — the generated baseline " +
          "requires a maintainer-approved PR before it takes effect."
        );
      }
      return;
    }

    // ── Org-governance mode ───────────────────────────────────────────────
    if (core.getInput("build_org_baseline") === "true") {
      core.info("Org governance engine: aggregating repo baselines…");
      const rawInput = core.getInput("repo_baselines") || "[]";
      let repoBaselines;
      try {
        repoBaselines = JSON.parse(rawInput);
      } catch {
        core.setFailed("build_org_baseline: repo_baselines must be a valid JSON array.");
        return;
      }
      if (!Array.isArray(repoBaselines)) {
        core.setFailed("build_org_baseline: repo_baselines must be a JSON array.");
        return;
      }

      const orgBaseline = aggregateRepoBaselines(repoBaselines);
      saveOrgBaseline(orgBaseline);
      core.info(`Org baseline written to .gatekeeper-org/org-baseline.json`);
      core.info(`Org history updated in .gatekeeper-org/org-history.json`);

      const orgHistory = loadOrgHistory();
      const metrics = computeOrgMetrics(orgBaseline, orgHistory, repoBaselines);
      core.info(`Org metrics written to .gatekeeper-org/org-metrics.json`);
      core.info(`Org architecture stability: ${metrics.architectureStability.toFixed(2)}`);
      core.info(`Org naming stability: ${metrics.namingStability.toFixed(2)}`);
      core.info(`Org boundary stability: ${metrics.boundaryStability.toFixed(2)}`);
      core.info(`Org drift trend: ${metrics.driftTrend}`);
      core.info(`Org score: ${metrics.orgScore.toFixed(2)}`);

      generateOrgReport(orgBaseline, metrics, repoBaselines);
      core.info(`Org report written to .gatekeeper-org/org-report.md`);

      return;
    }

    const config = loadConfig(configPath);
    // Governance contract enforcement mode takes precedence over the config mode.
    const effectiveMode = contract.enforcement.mode || config.mode;
    core.info(`Gatekeeper mode: ${effectiveMode}`);
    core.info(`Baseline mode: ${contract.baseline.mode || config.governance.baseline_mode}`);
    if (config.rules.length > 0) {
      core.info(`Active rules: ${config.rules.join(", ")}`);
    }

    // ── Collect PR labels for waiver parsing ──────────────────────────────
    const pr = github.context.payload.pull_request;
    const prLabels = pr?.labels ?? [];
    const waivers = parseWaivers(prLabels);
    const ignorePatterns = loadIgnorePatterns();

    if (waivers.emergencyOverride) {
      core.warning("Governance Contract: emergency override active — all enforcement suspended.");
    }
    if (waivers.baselineFreeze) {
      core.info("Governance Contract: baseline-freeze label detected — baseline updates paused.");
    }

    const diffOverride = core.getInput("diff");
    let diffText = "";

    if (diffOverride) {
      diffText = diffOverride;
    } else {
      if (!pr) {
        core.setFailed("This action must run on a pull_request event.");
        return;
      }
      const res = await fetch(pr.diff_url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        core.setFailed(`Failed to fetch PR diff: HTTP ${res.status} ${res.statusText}`);
        return;
      }
      diffText = await res.text();
    }

    writeFileSync("vireon_diff.txt", diffText);

    const cliArgs = buildCliArgs(configPath, existsSync);

    let result;
    try {
      const output = execFileSync("vireon", cliArgs, { encoding: "utf8" });
      console.log(output);
      result = JSON.parse(readFileSync("result.json", "utf8"));
    } catch (err) {
      if (err.code === "ENOENT") {
        core.info("Vireon CLI not found — running built-in checks.");
        const context = {
          diff: diffText,
          sensitivity: config.settings.drift.sensitivity,
          threshold: config.settings.drift.threshold,
          architecture: config.settings.architecture,
          naming: config.settings.naming,
        };
        const [nativeResult, rawCustomResults] = await Promise.all([
          Promise.resolve(runNativeChecks(diffText, config)),
          runRules(config, context, NATIVE_IDS),
        ]);
        const customResults = explainResults(rawCustomResults, config);
        const customIssues = [];
        for (const r of customResults) {
          for (const msg of r.messages) {
            customIssues.push({ rule: r.rule, message: msg });
          }
        }
        const allIssues = [...nativeResult.issues, ...customIssues];
        const anyFailed = nativeResult.verdict === "fail" || customResults.some((r) => !r.passed);
        const riskScore = allIssues.length > 0 ? Math.min(MAX_RISK_SCORE, allIssues.length * RISK_SCORE_PER_ISSUE) : 0;
        result = {
          ...nativeResult,
          risk_score: riskScore,
          verdict: anyFailed ? "fail" : "pass",
          issues: allIssues,
        };
      } else {
        core.setFailed(`Vireon CLI analysis failed: ${err.message}`);
        return;
      }
    }

    // ── Apply waivers & governance contract ───────────────────────────────
    const { filtered: activeIssues, waived: waivedIssues } = applyWaivers(
      result.issues ?? [],
      waivers,
      ignorePatterns
    );

    const activeRiskScore =
      activeIssues.length > 0 ? Math.min(MAX_RISK_SCORE, activeIssues.length * RISK_SCORE_PER_ISSUE) : 0;

    const anyActiveFailure = hasActiveFailures(activeIssues, waivers);

    const governedResult = {
      ...result,
      risk_score: activeRiskScore,
      verdict: anyActiveFailure ? "fail" : "pass",
      issues: activeIssues,
    };

    const driftLevel = classifyDrift(activeRiskScore, config.governance.drift.thresholds);
    core.info(`Drift level: ${driftLevel} (risk score: ${activeRiskScore})`);

    const failedRuleIds = [...new Set(activeIssues.map((i) => i.rule).filter(Boolean))];
    // Merge critical rules from the governance contract and the config.
    const criticalRules = [
      ...contract.enforcement.criticalRules,
      ...config.governance.enforcement.hybrid_critical_rules,
    ];
    const blocking = shouldBlockMerge(
      governedResult.verdict,
      effectiveMode,
      criticalRules,
      failedRuleIds
    );

    const waiverSummary = buildWaiverSummary(waivers, waivedIssues);

    const waiverItems = [
      ...waivers.waivedRules.map((r) => ({ rule: r, expires: "end of PR" })),
      ...waivers.timeBoxed.map((t) => ({ rule: "all", expires: t })),
    ];
    const effectiveBaselineMode = contract.baseline.mode || config.governance.baseline_mode;
    const governanceState = {
      enforcementMode: effectiveMode,
      baselineMode: effectiveBaselineMode,
      ruleAuthority: config.governance.rule_authority,
      contractVersion: contract.version || config.governance.contract_version,
      baselineFrozen: waivers.baselineFreeze || contract.baseline.freezeEnabled,
      baselinePendingUpdate: false,
      waiverStatus: {
        active: waiverItems.length > 0 || waivers.emergencyOverride,
        items: waiverItems,
      },
    };

    // ── Enforce governance contract ────────────────────────────────────────
    const contractState = {
      enforcementMode: effectiveMode,
      baselineMode: effectiveBaselineMode,
      baselineFrozen: governanceState.baselineFrozen,
      authority: {
        canUpdateBaseline: false,
        canModifyRulePacks: [],
        canChangeEnforcementMode: false,
        canModifyOrgGovernance: false,
      },
      waiverStatus: governanceState.waiverStatus,
    };
    const contractCheck = enforceGovernanceContract(contract, contractState, {
      proposedBaselineUpdate: false,
      ruleChanges: [],
    });
    if (!contractCheck.passed) {
      for (const violation of contractCheck.violations) {
        core.warning(`Governance Contract violation: ${violation}`);
      }
    }

    const { owner, repo, number } = github.context.issue;

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body: buildComment(governedResult, config, driftLevel, waiverSummary, governanceState, contract),
    });

    if (governedResult.verdict === "fail") {
      if (!blocking) {
        core.warning("Vireon Gatekeeper detected high-risk changes (not blocking in current mode).");
      } else {
        core.setFailed("Vireon Gatekeeper blocked this PR due to high risk.");
      }
    }
  } catch (err) {
    core.setFailed(`Gatekeeper error: ${err.message}`);
  }
}

run();
