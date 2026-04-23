# Vireon Gatekeeper (v1.1)

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Gatekeeper%20by%20Vireon-blue?logo=github)](https://github.com/marketplace/actions/gatekeeper-by-vireon)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A lightweight, contract‑based governance check for GitHub repositories.
Gatekeeper validates a repository's `.gatekeeper/contract.json` against a `.gatekeeper/schema.json` and provides a deterministic, human‑readable result.

Gatekeeper v1.1 is advisory‑first and designed for safe adoption across individual repos or entire organizations.

---

## ✨ What Gatekeeper Does Today

Gatekeeper performs three core functions:

### 1. Contract Validation

Ensures the repository's contract includes all required fields defined in the schema.

Example required fields:

- `serviceName`
- `owner`
- `riskLevel`

Missing fields → violation.

---

### 2. Policy Evaluation

Gatekeeper evaluates simple governance rules defined in the schema, such as:

- maximum allowed `riskLevel`
- required metadata fields

Violations are returned with:

- rule ID
- human‑readable message
- severity

---

### 3. Drift Scoring

Gatekeeper computes a severity‑weighted drift score between 0 and 1.

- `0` → no issues
- `1` → critical violations

This score can be used for:

- dashboards
- governance reporting
- PR comments
- risk visibility

---

## 🧭 Modes

Gatekeeper supports two modes:

### `observe` (default — for safe rollout)

- Evaluates contract + schema
- Reports violations
- Never blocks PRs

### `enforce`

- Evaluates contract + schema
- Blocks PRs if violations exceed threshold

---

## 📦 How to Use

### 1. Add a contract to your repo

Create `.gatekeeper/contract.json`:

```json
{
  "serviceName": "example-service",
  "owner": "team-a",
  "riskLevel": 1
}
```

### 2. Add a schema

Create `.gatekeeper/schema.json`:

```json
{
  "requiredFields": ["serviceName", "owner", "riskLevel"],
  "maxRiskLevel": 2
}
```

### 3. Add the GitHub Action

Create `.github/workflows/gatekeeper.yml`:

```yaml
name: Gatekeeper

on:
  pull_request:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Gatekeeper
        uses: doctorfixes/vireon-gatekeeper-action@v1.1
        with:
          contract: .gatekeeper/contract.json
          schema: .gatekeeper/schema.json
          mode: observe
```

Switch to `mode: enforce` when ready.

---

## 🧪 Outputs

Gatekeeper returns:

| Output | Description |
|--------|-------------|
| `should_block` | `true` or `false` depending on mode + violations |
| `reason` | Human‑readable explanation of top violation |
| `score` | Drift score (0–1) |
| `failure_type` | `policy_violation`, `config_error`, `engine_error`, or `none` |

---

## 🧱 What Gatekeeper Does Not Do (Yet)

Gatekeeper v1.1 does not include:

- multi‑layer PR analysis
- architecture learning
- semantic drift detection
- dependency graph analysis
- auto‑fixing
- org‑wide baselines
- PR comment generation

These are planned for future versions.

---

## 🚧 Roadmap

### v1.2

- PR comment output
- Schema‑driven rule severities
- Contract diff awareness

### v2.0

- Architecture drift detection
- Dependency graph rules
- Org‑wide governance baseline

---

## 📄 License

[MIT](LICENSE) © Vireon

