const core = require('@actions/core');
const github = require('@actions/github');
const { runGovernanceKernel } = require('./src/governanceKernel');

async function run() {
  try {
    const contractPath = core.getInput('contract');
    const schemaPath = core.getInput('schema');

    const context = {
      commitHash: github.context.sha,
      labels: github.context.payload.pull_request?.labels?.map(l => l.name) || [],
      changedFiles: [], // can be populated later
      dependencyGraphAfter: {},
      allFiles: []
    };

    const result = await runGovernanceKernel({ contractPath, schemaPath, context });

    core.setOutput('should_block', result.shouldBlock);

    const token = process.env.GITHUB_TOKEN;
    if (token && github.context.payload.pull_request) {
      const octokit = github.getOctokit(token);
      await octokit.rest.issues.createComment({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: github.context.payload.pull_request.number,
        body: result.governanceComment
      });
    }

    if (result.shouldBlock) {
      core.setFailed('Gatekeeper: merge blocked by governance rules.');
    }
  } catch (err) {
    core.setFailed(err.message);
  }
}

run();

