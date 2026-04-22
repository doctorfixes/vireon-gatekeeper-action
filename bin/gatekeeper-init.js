#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function writeFileSafe(filePath, content) {
  const full = resolve(filePath);
  const dir = dirname(full);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(full, content, "utf8");
}

function main() {
  console.log("\n🚀 Gatekeeper Init — Setting up minimal governance…\n");

  // 1. Minimal contract
  writeFileSafe(
    ".gatekeeper/contract.json",
    JSON.stringify(
      {
        version: "1.0.0",
        authority: {
          repoMaintainers: [],
          orgGovernanceGroup: [],
          engine: {
            canModifyGovernance: false,
            canProposeBaselineUpdates: true
          }
        },
        baseline: {
          mode: "pr-approved",
          freezeEnabled: false,
          updatePolicy: "pr-approved"
        },
        enforcement: {
          mode: "advisory",
          criticalRules: []
        },
        rules: {
          core: ["repo-learning"],
          local: [],
          org: []
        },
        waivers: {
          allowedTypes: ["file-ignore", "rule-waiver", "time-boxed"],
          maxDurationDays: 30,
          requireApproval: false
        },
        orgGovernance: {
          baselinePolicy: "aggregate",
          allowedRepoClasses: [
            "core",
            "legacy",
            "experimental",
            "sandbox"
          ],
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
      },
      null,
      2
    )
  );

  // 2. Minimal schema
  writeFileSafe(
    ".gatekeeper/schema.json",
    readFileSync(
      resolve(__dirname, "../contract/gatekeeper-governance-schema.json"),
      "utf8"
    )
  );

  // 3. GitHub workflow
  writeFileSafe(
    ".github/workflows/gatekeeper.yml",
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

  console.log("📁 Created .gatekeeper/contract.json");
  console.log("📁 Created .gatekeeper/schema.json");
  console.log("📁 Created .github/workflows/gatekeeper.yml");

  console.log("\n✨ Gatekeeper is ready. Open a PR to see your first architecture report.\n");
}

main();
