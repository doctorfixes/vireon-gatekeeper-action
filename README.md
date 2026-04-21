# Gatekeeper by Vireon

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Gatekeeper%20by%20Vireon-blue?logo=github)](https://github.com/marketplace/actions/gatekeeper-by-vireon)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Governance-grade enforcement engine for pull requests.  
Powered by **Vireon**, the Intelligence Engine.

Gatekeeper analyzes every PR, detects architecture drift, identifies regressions, enforces policy, and generates deterministic auto-fixes — all inside GitHub.

---

## 🚀 Features

- Multi-layer PR analysis
- Architecture governance
- Incident regression detection
- Deterministic auto-fixing
- Zero-infrastructure deployment
- PR comments with risk scoring
- Fails checks on high-risk changes

---

## 📦 Usage

Add this to your workflow:

```yaml
name: Gatekeeper

on:
  pull_request:

jobs:
  gatekeeper:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run Vireon Gatekeeper
        uses: doctorfixes/vireon-gatekeeper-action@v1
        with:
          token: ${{ secrets.GITHUB_TOKEN }}
```

---

## 🔧 Inputs

| Name | Required | Description |
|------|----------|-------------|
| `token` | ✅ | GitHub token for PR context |
| `diff` | ❌ | Optional diff override (defaults to PR diff) |
| `config` | ❌ | Path to config file (defaults to `.github/gatekeeper.yml`) |

---

## ⚙️ Configuration

Create `.github/gatekeeper.yml` in your repository to customize Gatekeeper's behavior:

```yaml
mode: advisory   # "advisory" posts findings as a warning without blocking the PR
                 # "strict" (default) fails the PR when verdict is "fail"

rules:
  - semantic-drift
  - architecture-boundaries
  - naming-conventions

settings:
  drift:
    sensitivity: medium   # low | medium | high
  comments:
    summary: true         # include a plain-text summary in the PR comment
    explain_why: true     # show per-issue "why" explanations in the PR comment
```

### `mode`

| Value | Behaviour |
|-------|-----------|
| `strict` (default) | PR check fails when verdict is `fail` |
| `advisory` | Findings are posted as a warning; PR is never blocked |

### `rules`

An optional list of rule names to enable. When omitted, all rules configured in the Vireon CLI are used.

| Rule | Description |
|------|-------------|
| `semantic-drift` | Detects semantic/meaning drift across the diff |
| `architecture-boundaries` | Flags changes that violate layering or module boundaries |
| `naming-conventions` | Enforces consistent identifiers and naming patterns |

### `settings.drift.sensitivity`

Controls how aggressively the drift detector flags changes: `low`, `medium` (default), or `high`.

### `settings.comments`

| Key | Default | Description |
|-----|---------|-------------|
| `summary` | `true` | Prepend a plain-text summary to the PR comment |
| `explain_why` | `false` | Show per-issue explanations rather than raw JSON |

---

## 🔐 Permissions

Add this block to your workflow file to grant the required permissions. The `action.yml` lists them for reference, but permissions must be declared in your workflow:

```yaml
permissions:
  contents: read
  pull-requests: write
  checks: write
```

---

## 🛡️ Output

Gatekeeper posts a PR comment containing:

- Risk score
- Verdict
- Issues detected
- Auto-fix suggestions (if available)

If the verdict is `fail`, the workflow fails.

---

## 📄 License

[MIT](LICENSE) © Vireon
