const core = require('@actions/core');
const path = require('path');
const { runGatekeeper } = require('./src/kernel');

async function main() {
  try {
    const contractPath = core.getInput('contract', { required: true });
    const schemaPath = core.getInput('schema', { required: true });

    const contractAbs = path.resolve(process.cwd(), contractPath);
    const schemaAbs = path.resolve(process.cwd(), schemaPath);

    core.info(`Gatekeeper: loading contract from ${contractAbs}`);
    core.info(`Gatekeeper: loading schema from ${schemaAbs}`);

    const result = await runGatekeeper({
      contractPath: contractAbs,
      schemaPath: schemaAbs,
    });

    core.info(`Gatekeeper decision: ${result.shouldBlock ? 'BLOCK' : 'ALLOW'}`);
    if (result.reason) core.info(`Reason: ${result.reason}`);

    core.setOutput('should_block', !!result.shouldBlock);
    if (result.reason) core.setOutput('reason', result.reason);
    if (typeof result.score === 'number') core.setOutput('score', result.score);
  } catch (err) {
    core.setFailed(`Gatekeeper failed: ${err.message || String(err)}`);
    core.setOutput('should_block', true);
  }
}

main();
