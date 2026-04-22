# Gatekeeper by Vireon

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Gatekeeper%20by%20Vireon-blue?logo=github)](https://github.com/marketplace/actions/gatekeeper-by-vireon)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Gatekeeper v1** — Constitutional Architecture Governance Engine.

Gatekeeper analyzes every PR, learns your repository's architecture, detects semantic drift, and posts a governance report — all without blocking merges.

---

## 🚀 Quick Start

Run the scaffolder to set up Gatekeeper in any repository:

```bash
npx gatekeeper init
```

This creates:

```
.gatekeeper/
  contract.json   ← Governance Contract (advisory, pr-approved baseline)
  schema.json     ← Governance Schema

.github/workflows/
  gatekeeper.yml  ← GitHub Actions workflow
```

Then open a pull request — Gatekeeper will post your first architecture governance report automatically.

---

## 🧠 What Gatekeeper Does

On every pull request, Gatekeeper:

1. **Loads your Governance Contract** — the constitutional backbone of governance
2. **Loads or builds your architecture baseline** — learned from the repo itself
3. **Runs the repo-learning rule pack** — detects naming and boundary drift
4. **Computes drift-over-time** — longitudinal architecture stability metrics
5. **Generates an Architecture Health Report** — governance-grade audit
6. **Renders governance state** — fully visible in the PR comment
7. **Outputs `should_block`** — always `false` in v1 (advisory-only)

---

## 📦 Usage

### Minimal workflow (after `npx gatekeeper init`):

```yaml
name: Gatekeeper

on:
  pull_request:

jobs:
  governance:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4

      - name: Run Gatekeeper
        uses: doctorfixes/vireon-gatekeeper-action@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          contract: .gatekeeper/contract.json
          schema: .gatekeeper/schema.json
```

### With baseline build step (recommended):

```yaml
name: Gatekeeper

on:
  pull_request:
  push:
    branches: [main]

jobs:
  baseline:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - name: Build Baseline
        uses: doctorfixes/vireon-gatekeeper-action@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          contract: .gatekeeper/contract.json
          build_baseline: "true"

  governance:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - name: Run Gatekeeper
        uses: doctorfixes/vireon-gatekeeper-action@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
          contract: .gatekeeper/contract.json
          schema: .gatekeeper/schema.json
```

---

## 🔧 Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `token` | ✅ | — | GitHub token for PR context |
| `contract` | ❌ | `.gatekeeper/contract.json` | Path to the Governance Contract |
| `schema` | ❌ | `.gatekeeper/schema.json` | Path to the Governance Schema |
| `diff` | ❌ | — | Optional diff override (defaults to PR diff) |
| `build_baseline` | ❌ | `false` | When `true`, scan the repo and write `.gatekeeper/baseline.json` |
| `build_org_baseline` | ❌ | `false` | When `true`, aggregate repo baselines into an org-level baseline |
| `repo_baselines` | ❌ | `[]` | JSON array of per-repo baselines (used with `build_org_baseline`) |
| `governance_contract` | ❌ | — | Legacy alias for `contract` |

---

## 📤 Outputs

| Name | Description |
|------|-------------|
| `should_block` | Whether Gatekeeper recommends blocking the merge. Always `false` in v1 (advisory mode). |

---

## 🏛️ Governance Contract

The Governance Contract (`.gatekeeper/contract.json`) is the constitutional backbone of Gatekeeper. It defines:

- **Baseline mode** — how the architecture baseline is managed (`pr-approved`, `auto-learn`, `frozen`)
- **Enforcement mode** — how violations are handled (`advisory`, `hybrid`, `strict`)
- **Rule packs** — which governance rules are active
- **Waivers** — what exception mechanisms are allowed
- **Transparency** — what is surfaced in PR comments

### v1 defaults (created by `npx gatekeeper init`):

```json
{
  "version": "1.0.0",
  "baseline": { "mode": "pr-approved" },
  "enforcement": { "mode": "advisory", "criticalRules": [] },
  "rules": { "core": ["repo-learning"], "local": [], "org": [] }
}
```

---

## 📋 Rule Packs

### `repo-learning` (v1 default)

Learns the repository's de-facto architecture and flags PR changes that deviate from it:

- **Inferred naming violations** — new files that don't match the dominant naming convention
- **Inferred boundary violations** — new cross-layer dependencies not seen in the baseline

All findings include explain-why context.

---

## 🛡️ Safety & Adoption

Gatekeeper v1 is intentionally:

- **Advisory-only** — never blocks merges
- **Non-intrusive** — posts a comment, nothing more
- **Non-enforcing** — `should_block` is always `false`
- **Reversible** — governance contract can be changed or removed at any time
- **Transparent** — all governance state is visible in every PR comment

---

## 🔐 Permissions

Declare these in your workflow:

```yaml
permissions:
  contents: read
  pull-requests: write
```

---

## 🕊️ Waivers & Exceptions

Add PR labels to control governance behavior:

| Label | Effect |
|-------|--------|
| `gatekeeper-waive:<rule-id>` | Waive a specific rule for this PR |
| `gatekeeper-waive:<Nd>` | Time-boxed waiver (e.g. `gatekeeper-waive:7d`) |
| `gatekeeper-baseline-freeze` | Pause baseline updates for this PR |
| `gatekeeper-emergency-override` | Suspend all enforcement (org-level emergency) |

---

## 📄 License

[MIT](LICENSE) © Vireon

