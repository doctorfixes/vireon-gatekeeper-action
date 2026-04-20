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
