// index.js
const core = require('@actions/core');
const path = require('path');
const { runGatekeeper } = require('./src/kernel');

async function main() {
  try {
    const contractInput = core.getInput('contract', { required: true });
    const schemaInput = core.getInput('schema', { required: true });

    const contractPath = path.resolve(process.cwd(), contractInput);
    const schemaPath = path.resolve(process.cwd(), schemaInput);

    core.info(`Gatekeeper: loading contract from ${contractPath}`);
    core.info(`Gatekeeper: loading schema from ${schemaPath}`);

    const result = await runGatekeeper({ contractPath, schemaPath });

    const shouldBlock = !!result.shouldBlock;
    const reason = result.reason || '';
    const score = typeof result.score === 'number' ? result.score : null;

    core.info(`Gatekeeper decision: ${shouldBlock ? 'BLOCK' : 'ALLOW'}`);
    if (reason) core.info(`Reason: ${reason}`);
    if (score !== null) core.info(`Score: ${score}`);

    core.setOutput('should_block', shouldBlock);
    if (reason) core.setOutput('reason', reason);
    if (score !== null) core.setOutput('score', score);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    core.error(`Gatekeeper failed: ${msg}`);
    // Fail-closed by default
    core.setOutput('should_block', true);
    core.setOutput('reason', `Gatekeeper internal failure: ${msg}`);
    core.setFailed(`Gatekeeper failed: ${msg}`);
  }
}

main();
