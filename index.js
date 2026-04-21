import { execFileSync } from "child_process";
import { writeFileSync, readFileSync, existsSync } from "fs";
import * as core from "@actions/core";
import * as github from "@actions/github";
import fetch from "node-fetch";
import yaml from "js-yaml";
import semanticDrift from "./checks/semantic-drift.js";

const NATIVE_CHECKS = [semanticDrift];

// Each detected issue contributes this many points toward the 0-100 risk score.
const RISK_SCORE_PER_ISSUE = 20;

function loadConfig(configPath) {
  const defaults = {
    mode: "strict",
    rules: [],
    settings: {
      drift: { sensitivity: "medium" },
      comments: { summary: true, explain_why: false },
    },
  };

  if (!existsSync(configPath)) {
    core.info(`No config file found at ${configPath}. Using defaults.`);
    return defaults;
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = yaml.load(raw) || {};
    return {
      mode: parsed.mode ?? defaults.mode,
      rules: Array.isArray(parsed.rules) ? parsed.rules : defaults.rules,
      settings: {
        drift: {
          sensitivity: parsed.settings?.drift?.sensitivity ?? defaults.settings.drift.sensitivity,
        },
        comments: {
          summary: parsed.settings?.comments?.summary ?? defaults.settings.comments.summary,
          explain_why: parsed.settings?.comments?.explain_why ?? defaults.settings.comments.explain_why,
        },
      },
    };
  } catch (err) {
    core.warning(`Failed to parse config file at ${configPath}: ${err.message}. Using defaults.`);
    return defaults;
  }
}

function runNativeChecks(diffText, config) {
  const activeRules = new Set(config.rules.length > 0 ? config.rules : NATIVE_CHECKS.map((c) => c.id));
  const context = { diff: diffText, sensitivity: config.settings.drift.sensitivity };

  const allIssues = [];
  let anyFailed = false;

  for (const check of NATIVE_CHECKS) {
    if (!activeRules.has(check.id)) continue;
    const result = check.check(context);
    if (!result.passed) anyFailed = true;
    for (const msg of result.messages) {
      allIssues.push(msg);
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
  const { summary, explain_why } = config.settings.comments;
  const advisoryBadge = config.mode === "advisory" ? " *(advisory)*" : "";

  let body = `### 🛡️ Vireon Gatekeeper Result${advisoryBadge}  \n`;
  body += `**Risk Score:** ${result.risk_score}  \n`;
  body += `**Verdict:** ${result.verdict}\n\n`;

  if (summary && result.summary) {
    body += `**Summary:** ${result.summary}\n\n`;
  }

  if (result.issues && result.issues.length > 0) {
    body += `<details>\n<summary>Issues</summary>\n\n`;

    if (explain_why) {
      const issueLines = result.issues
        .map((issue) => {
          const why = issue.why ? `\n  > *Why:* ${issue.why}` : "";
          return `- **${issue.rule ?? "issue"}**: ${issue.message ?? JSON.stringify(issue)}${why}`;
        })
        .join("\n");
      body += `${issueLines}\n\n`;
    } else {
      body += `\`\`\`json\n${JSON.stringify(result.issues, null, 2)}\n\`\`\`\n\n`;
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
        result = runNativeChecks(diffText, config);
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
