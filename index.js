const core = require('@actions/core');
const github = require('@actions/github');
const path = require('path');
const fs = require('fs');
const { runGatekeeper } = require('./src/kernel');
const { diffContracts } = require('./src/diff');

async function main() {
  try {
    const contractPath = path.resolve(core.getInput('contract'));
    const schemaPath = path.resolve(core.getInput('schema'));
    const mode = core.getInput('mode') || 'observe';
    const token = core.getInput('github_token');

    const result = await runGatekeeper({ contractPath, schemaPath, mode });

    // Output results
    core.setOutput('should_block', result.shouldBlock);
    core.setOutput('reason', result.reason);
    core.setOutput('score', result.score);
    core.setOutput('failure_type', result.failure_type || 'none');

    // If no token, skip PR comment
    if (!token) return;

    const octokit = github.getOctokit(token);
    const context = github.context;

    // Only post comments on pull request events
    if (!context.payload.pull_request) return;

    // Load base contract for diff
    const baseContractPath = path.join(path.dirname(contractPath), 'contract.base.json');
    let diff = null;

    if (fs.existsSync(baseContractPath)) {
      const base = JSON.parse(fs.readFileSync(baseContractPath, 'utf8'));
      const head = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
      diff = diffContracts(base, head);
    }

    // Build PR comment
    const body = `
### 🛡️ Gatekeeper v1.2 Report

**Mode:** \`${mode}\`  
**Failure Type:** \`${result.failure_type}\`  
**Drift Score:** \`${result.score}\`

**Reason:**  
> ${result.reason}

${diff ? `**Contract Changes:**\n\`\`\`json\n${JSON.stringify(diff, null, 2)}\n\`\`\`` : ''}

---

Gatekeeper evaluates your contract against the schema and reports violations, drift, and recommended fixes.
`;

    await octokit.rest.issues.createComment({
      ...context.repo,
      issue_number: context.payload.pull_request.number,
      body
    });

  } catch (err) {
    const msg = err.message || String(err);
    core.setFailed(`Gatekeeper failed: ${msg}`);
    core.setOutput('should_block', true);
    core.setOutput('reason', `Gatekeeper internal failure: ${msg}`);
    core.setOutput('score', 1);
    core.setOutput('failure_type', 'engine_error');
  }
}

main();
