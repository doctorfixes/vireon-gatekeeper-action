const core = require('@actions/core');
const path = require('path');
const { runGatekeeper } = require('./src/kernel');

async function main() {
  try {
    const contractPath = path.resolve(core.getInput('contract'));
    const schemaPath = path.resolve(core.getInput('schema'));
    const mode = core.getInput('mode') || 'enforce';

    const result = await runGatekeeper({ contractPath, schemaPath, mode });

    core.setOutput('should_block', result.shouldBlock);
    core.setOutput('reason', result.reason);
    core.setOutput('score', result.score);
    core.setOutput('failure_type', result.failure_type || 'none');
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
