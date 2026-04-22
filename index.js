const core = require('@actions/core');

async function run() {
  core.info('Gatekeeper is temporarily disabled.');
  core.setOutput('should_block', false);
}

run();


