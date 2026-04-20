import { execFileSync } from "child_process";
import { writeFileSync, readFileSync } from "fs";
import * as core from "@actions/core";
import * as github from "@actions/github";
import fetch from "node-fetch";

async function run() {
  try {
    const token = core.getInput("token");
    const octokit = github.getOctokit(token);

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

    let output;
    try {
      output = execFileSync(
        "vireon",
        ["gatekeeper", "analyze", "--diff", "vireon_diff.txt", "--output", "result.json"],
        { encoding: "utf8" }
      );
    } catch (err) {
      const msg = err.code === "ENOENT"
        ? "Vireon CLI not found. Ensure the `vireon` binary is installed and available on PATH."
        : `Vireon CLI analysis failed: ${err.message}`;
      core.setFailed(msg);
      return;
    }

    console.log(output);

    const result = JSON.parse(readFileSync("result.json", "utf8"));

    const { owner, repo, number } = github.context.issue;

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: number,
      body: `### 🛡️ Vireon Gatekeeper Result  
**Risk Score:** ${result.risk_score}  
**Verdict:** ${result.verdict}

<details>
<summary>Issues</summary>

\`\`\`json
${JSON.stringify(result.issues, null, 2)}
\`\`\`

</details>
`,
    });

    if (result.verdict === "fail") {
      core.setFailed("Vireon Gatekeeper blocked this PR due to high risk.");
    }
  } catch (err) {
    core.setFailed(`Gatekeeper error: ${err.message}`);
  }
}

run();
