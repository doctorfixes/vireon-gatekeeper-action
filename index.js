import { execFileSync } from "child_process";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { resolve as resolvePath, sep } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import * as core from "@actions/core";
import * as github from "@actions/github";
import fetch from "node-fetch";
import yaml from "js-yaml";
import semanticDrift from "./checks/semantic-drift.js";
import architectureBoundaries from "./checks/architecture-boundaries.js";
import namingConventions from "./checks/naming-conventions.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const RULES_DIR = resolvePath(__dirname, "rules");
const NATIVE_CHECKS = [semanticDrift, architectureBoundaries, namingConventions];
const NATIVE_IDS = new Set(NATIVE_CHECKS.map((c) => c.id));

// Only alphanumeric characters, hyphens, and underscores are permitted in rule
// IDs. This prevents path traversal attacks when constructing the file path
// for custom rules (e.g. an ID of "../../evil" must be rejected).
const VALID_RULE_ID = /^[a-zA-Z0-9_-]+$/;

async function loadCustomRules(ruleIds) {
  const rules = [];

  for (const id of ruleIds) {
    if (NATIVE_IDS.has(id)) continue;

    if (!VALID_RULE_ID.test(id)) {
      core.warning(
        `Skipping rule with invalid ID "${id}": only alphanumeric characters, hyphens, and underscores are allowed.`
      );
      continue;
    }

    // Defense-in-depth: even though the regex above already disallows the
    // characters needed for traversal, resolve the path and confirm it stays
    // inside RULES_DIR before importing.
    const rulePath = resolvePath(RULES_DIR, `${id}.js`);
    if (!rulePath.startsWith(RULES_DIR + sep)) {
      core.warning(`Skipping rule "${id}": resolved path is outside the rules directory.`);
      continue;
    }

    try {
      if (!existsSync(rulePath)) {
        core.warning(`Skipping rule "${id}": file not found at ${rulePath}`);
        continue;
      }
      const mod = await import(pathToFileURL(rulePath).href);
      rules.push(mod.default ?? mod);
    } catch (err) {
      core.warning(`Failed to load rule "${id}": ${err.message}`);
    }
  }

  return rules;
}

// Each detected issue contributes this many points toward the 0-100 risk score.
const RISK_SCORE_PER_ISSUE = 20;

function loadConfig(configPath) {
  const defaults = {
    mode: "strict",
    rules: [],
    settings: {
      drift: { sensitivity: "medium", threshold: null },
      comments: { summary: true, explain_why: false, max_messages: null },
      architecture: { enforce_layers: false, allowed_layers: [] },
      naming: { enforce_case: false, file_case: "kebab", class_case: "pascal", variable_case: "camel" },
    },
    plugins: { enabled: [] },
  };

  if (!existsSync(configPath)) {
    core.info(`No config file found at ${configPath}. Using defaults.`);
    return defaults;
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = yaml.load(raw) || {};
    const ds = defaults.settings;
    const ps = parsed.settings || {};
    return {
      mode: parsed.mode ?? defaults.mode,
      rules: Array.isArray(parsed.rules) ? parsed.rules : defaults.rules,
      settings: {
        drift: {
          sensitivity: ps.drift?.sensitivity ?? ds.drift.sensitivity,
          threshold: typeof ps.drift?.threshold === "number" ? ps.drift.threshold : ds.drift.threshold,
        },
        comments: {
          summary: ps.comments?.summary ?? ds.comments.summary,
          explain_why: ps.comments?.explain_why ?? ds.comments.explain_why,
          max_messages:
            typeof ps.comments?.max_messages === "number"
              ? ps.comments.max_messages
              : ds.comments.max_messages,
        },
        architecture: {
          enforce_layers: ps.architecture?.enforce_layers ?? ds.architecture.enforce_layers,
          allowed_layers: Array.isArray(ps.architecture?.allowed_layers)
            ? ps.architecture.allowed_layers
            : ds.architecture.allowed_layers,
        },
        naming: {
          enforce_case: ps.naming?.enforce_case ?? ds.naming.enforce_case,
          file_case: ps.naming?.file_case ?? ds.naming.file_case,
          class_case: ps.naming?.class_case ?? ds.naming.class_case,
          variable_case: ps.naming?.variable_case ?? ds.naming.variable_case,
        },
      },
      plugins: {
        enabled: Array.isArray(parsed.plugins?.enabled) ? parsed.plugins.enabled : defaults.plugins.enabled,
      },
    };
  } catch (err) {
    core.warning(`Failed to parse config file at ${configPath}: ${err.message}. Using defaults.`);
    return defaults;
  }
}

function runNativeChecks(diffText, config, customRules = []) {
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

  for (const check of [...NATIVE_CHECKS, ...customRules]) {
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
        const customRules = await loadCustomRules(config.rules);
        result = runNativeChecks(diffText, config, customRules);
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
