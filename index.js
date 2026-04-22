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

const NATIVE_CHECKS = [semanticDrift, architectureBoundaries, namingConventions];
const NATIVE_IDS = new Set(NATIVE_CHECKS.map((c) => c.id));

// Each detected issue contributes this many points toward the 0-100 risk score.
const RISK_SCORE_PER_ISSUE = 20;

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

  const riskScore = allIssues.length > 0 ? Math.min(100, allIssues.length * RISK_SCORE_PER_ISSUE) : 0;
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

function buildComment(result, config) {
  const { summary, explain_why, max_messages } = config.settings.comments;
  const advisoryBadge = config.mode === "advisory" ? " *(advisory)*" : "";

  let body = `### 🛡️ Vireon Gatekeeper Result${advisoryBadge}  \n`;
  body += `**Risk Score:** ${result.risk_score}  \n`;
  body += `**Verdict:** ${result.verdict}\n\n`;

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

  return body;
}

async function run() {
  try {
    const token = core.getInput("token");
    const octokit = github.getOctokit(token);
    const configPath = core.getInput("config") || ".github/gatekeeper.yml";

    // ── Baseline-build mode ────────────────────────────────────────────────
    if (core.getInput("build_baseline") === "true") {
      core.info("Inference engine: scanning repository to build baseline…");
      const baseline = buildBaselineFromRepo(".");
      core.info(`Baseline written to .gatekeeper/baseline.json`);
      core.info(`Inferred layers: ${baseline.layers.join(", ") || "(none)"}`);
      core.info(`Inferred naming: ${baseline.naming.file_case}`);
      const edgeCount = Object.keys(baseline.boundaries.edges).length;
      core.info(`Inferred boundary edges: ${edgeCount}`);
      return;
    }

    const config = loadConfig(configPath);
    core.info(`Gatekeeper mode: ${config.mode}`);
    if (config.rules.length > 0) {
      core.info(`Active rules: ${config.rules.join(", ")}`);
    }

    const diffOverride = core.getInput("diff");
    let diffText = "";

    if (diffOverride) {
      diffText = diffOverride;
    } else {
      const pr = github.context.payload.pull_request;
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
        const riskScore = allIssues.length > 0 ? Math.min(100, allIssues.length * RISK_SCORE_PER_ISSUE) : 0;
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

    const { owner, repo, number } = github.context.issue;

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body: buildComment(result, config),
    });

    if (result.verdict === "fail") {
      if (config.mode === "advisory") {
        core.warning("Vireon Gatekeeper detected high-risk changes (advisory mode — not blocking).");
      } else {
        core.setFailed("Vireon Gatekeeper blocked this PR due to high risk.");
      }
    }
  } catch (err) {
    core.setFailed(`Gatekeeper error: ${err.message}`);
  }
}

run();
