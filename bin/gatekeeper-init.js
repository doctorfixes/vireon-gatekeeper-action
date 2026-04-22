#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function writeFileSafe(filePath, content) {
  const full = path.resolve(filePath);
  const dir = path.dirname(full);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

function main() {
  console.log('\n🚀 Gatekeeper Init — Setting up minimal governance…\n');

  const contract = {
    version: '1.0.0',
    authority: {
      repoMaintainers: [],
      orgGovernanceGroup: [],
      engine: {
        canModifyGovernance: false,
        canProposeBaselineUpdates: true
      }
    },
    baseline: {
      mode: 'pr-approved',
      freezeEnabled: false,
      updatePolicy: 'pr-approved'
    },
    enforcement: {
      mode: 'advisory',
      criticalRules: []
    },
    rules: {
      core: ['repo-learning'],
      local: [],
      org: []
    },
    waivers: {
      allowedTypes: ['file-ignore', 'rule-waiver', 'time-boxed'],
      maxDurationDays: 30,
      requireApproval: false
    },
    orgGovernance: {
      baselinePolicy: 'aggregate',
      allowedRepoClasses: ['core', 'legacy', 'experimental', 'sandbox'],
      crossRepoRulesEnabled: false
    },
    transparency: {
      showGovernanceState: true,
      showBaselineState: true,
      showWaivers: true,
      showAuthority: true
    },
    reversibility: {
      allowBaselineRollback: true,
      allowRuleRollback: true,
      allowEnforcementRollback: true
    }
  };

  const schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "Gatekeeper Governance Contract Schema (Minimal v1)",
    "type": "object",
    "properties": {
      "version": { "type": "string" }
    },
    "required": ["version"]
  };

  writeFileSafe('.gatekeeper/contract.json', JSON.stringify(contract, null, 2));
  writeFileSafe('.gatekeeper/schema.json', JSON.stringify(schema, null, 2));

  writeFileSafe(
    '.github/workflows/gatekeeper.yml',
    `name: Gatekeeper

on:
  pull_request:

jobs:
  governance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Gatekeeper
        uses: your-org/gatekeeper-action@v1
        with:
          contract: .gatekeeper/contract.json
          schema: .gatekeeper/schema.json
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`
  );

  console.log('📁 Created .gatekeeper/contract.json');
  console.log('📁 Created .gatekeeper/schema.json');
  console.log('📁 Created .github/workflows/gatekeeper.yml');
  console.log('\n✨ Gatekeeper is ready. Open a PR to see your first architecture report.\n');
}

main();

