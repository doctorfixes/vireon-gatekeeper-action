import { execSync } from "child_process";
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
      const diffUrl = github.context.payload.pull_request.diff_url;
      const res = await fetch(diffUrl);
      diffText = await res.text();
    }

    const fs = await import("fs");
    fs.writeFileSync("vireon_diff.txt", diffText);

    const output = execSync(
      `vireon gatekeeper analyze --diff vireon_diff.txt --output result.json`,
      { encoding: "utf8" }
    );

    console.log(output);

    const result = JSON.parse(fs.readFileSync("result.json", "utf8"));

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
`
    });

    if (result.verdict === "fail") {
      core.setFailed("Vireon Gatekeeper blocked this PR due to high risk.");
    }

  } catch (err) {
    core.setFailed(`Gatekeeper error: ${err.message}`);
  }
}

run();
