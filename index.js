import * as core from "@actions/core";
import * as github from "@actions/github";
import fetch from "node-fetch";
import { buildBaselineFromRepo } from "./src/inferenceEngine.js";
import {
  aggregateRepoBaselines,
  saveOrgBaseline,
  loadOrgHistory,
  computeOrgMetrics,
  generateOrgReport,
} from "./src/orgGovernance.js";
import { runGovernanceKernel } from "./src/governanceKernel.js";
import { loadGovernanceContract } from "./src/loadGovernanceContract.js";

/**
 * Build a governance PR comment from the kernel's output.
 *
 * @param {{
 *   ruleResult: Object,
 *   explainedResults: Array,
 *   governanceComment: string,
 *   driftOverTime: Object
 * }} kernelResult
 * @returns {string} Markdown body for the PR comment.
 */
function buildPRComment({ ruleResult, explainedResults, governanceComment, driftOverTime }) {
  const driftTrend = driftOverTime?.trend ?? "stable";
  const trendEmoji = { stable: "✅", drifting: "⚠️", critical: "🚨" }[driftTrend] ?? "ℹ️";
  const findingCount = (ruleResult.messages || []).length;
  const findingsLine = ruleResult.passed
    ? "✅ None"
    : `⚠️ ${findingCount} finding(s) detected`;

  let body = `### 🛡️ Gatekeeper Governance Report *(advisory)*\n\n`;
  body += `**Drift Trend:** ${trendEmoji} \`${driftTrend}\`  \n`;
  body += `**Findings:** ${findingsLine}  \n\n`;

  if (!ruleResult.passed && explainedResults?.length > 0) {
    body += `<details>\n<summary>Architecture Findings</summary>\n\n`;
    for (const r of explainedResults) {
      for (const msg of r.messages || []) {
        const text = typeof msg === "string" ? msg : msg.message ?? JSON.stringify(msg);
        const why = typeof msg === "object" && msg.why ? `\n  > *Why:* ${msg.why}` : "";
        body += `- ${text}${why}\n`;
      }
    }
    body += `\n</details>\n\n`;
  }

  if (governanceComment) {
    body += `<details>\n<summary>Governance Contract</summary>\n`;
    body += governanceComment;
    body += `\n</details>\n`;
  }

  return body;
}

async function run() {
  try {
    const token = core.getInput("token");
    const octokit = github.getOctokit(token);

    // Support both `contract` (v1) and `governance_contract` (legacy) inputs.
    const contractPath =
      core.getInput("contract") ||
      core.getInput("governance_contract") ||
      ".gatekeeper/contract.json";
    const schemaPath = core.getInput("schema") || ".gatekeeper/schema.json";

    // ── Baseline-build mode ────────────────────────────────────────────────
    if (core.getInput("build_baseline") === "true") {
      const contract = loadGovernanceContract(contractPath);
      const baselineMode = contract.baseline.mode;

      if (baselineMode === "frozen" || (contract.baseline.freezeEnabled ?? false)) {
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

    // ── Main PR analysis ──────────────────────────────────────────────────
    const pr = github.context.payload.pull_request;
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

    const labels = (pr?.labels ?? []).map((l) =>
      typeof l === "string" ? l : l?.name ?? ""
    );

    const context = {
      diff: diffText,
      commitHash: github.context.sha || null,
      labels,
    };

    core.info("Gatekeeper: Running Governance Kernel…");
    const kernelResult = await runGovernanceKernel({
      contractPath,
      schemaPath,
      context,
    });

    const {
      shouldBlock,
      ruleResult,
      explainedResults,
      governanceComment,
      driftOverTime,
      enforcementCheck,
    } = kernelResult;

    core.info(`Governance kernel complete. Drift trend: ${driftOverTime?.trend ?? "stable"}`);
    core.info(`Rule result: ${ruleResult.passed ? "passed" : "findings detected"}`);

    if (!enforcementCheck.passed) {
      for (const violation of enforcementCheck.violations) {
        core.warning(`Governance Contract violation: ${violation}`);
      }
    }

    // Build and post governance comment to PR
    const { owner, repo, number } = github.context.issue;
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body: buildPRComment(kernelResult),
    });

    // Output should_block — always false in v1 (advisory mode)
    core.setOutput("should_block", String(shouldBlock));
    core.info(`should_block: ${shouldBlock}`);

    if (shouldBlock) {
      core.setFailed("Gatekeeper: governance violation requires attention before merge.");
    } else if (!ruleResult.passed) {
      core.warning("Gatekeeper: architecture drift detected. See PR comment for findings.");
    }
  } catch (err) {
    core.setFailed(`Gatekeeper error: ${err.message}`);
  }
}

run();


