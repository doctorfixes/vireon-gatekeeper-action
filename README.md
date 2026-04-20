# Vireon Gatekeeper Action

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Vireon%20Gatekeeper-blue?logo=github)](https://github.com/marketplace/actions/vireon-gatekeeper)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Automated PR review and gating powered by the **Vireon Gatekeeper** CLI.

Vireon Gatekeeper Action fetches the pull-request diff, runs it through the
Vireon Gatekeeper CLI, posts a structured review comment on the PR, and
optionally fails the workflow step when issues above a configurable severity
threshold are detected.

---

## Features

- 🔍 Fetches and analyzes the full PR diff automatically
- 💬 Posts a formatted review comment directly on the pull request
- 🚦 Configurable severity threshold (`low` / `medium` / `high` / `critical`)
- ❌ Optionally blocks merges when issues are found (`fail_on_issues`)
- 🪶 Zero external npm dependencies – runs with Node.js 20 built-ins only

---

## Inputs

| Name | Required | Default | Description |
|------|----------|---------|-------------|
| `github_token` | ✅ | — | GitHub token for fetching the diff and posting comments (use `${{ secrets.GITHUB_TOKEN }}`) |
| `vireon_api_key` | ✅ | — | API key for the Vireon Gatekeeper service |
| `fail_on_issues` | ❌ | `true` | Set to `false` to post the comment without failing the job |
| `severity_threshold` | ❌ | `medium` | Minimum severity to report: `low`, `medium`, `high`, or `critical` |

---

## Example workflow

Add a file like `.github/workflows/vireon-gatekeeper.yml` to your repository:

```yaml
name: Vireon Gatekeeper

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write

jobs:
  gatekeeper:
    runs-on: ubuntu-latest
    steps:
      - name: Run Vireon Gatekeeper
        uses: doctorfixes/vireon-gatekeeper-action@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          vireon_api_key: ${{ secrets.VIREON_API_KEY }}
          fail_on_issues: 'true'
          severity_threshold: 'medium'
```

### Using a pinned version (recommended for production)

```yaml
      - name: Run Vireon Gatekeeper
        uses: doctorfixes/vireon-gatekeeper-action@v1.0.0
```

---

## How it works

1. The runner injects your inputs as environment variables.
2. `index.js` reads `GITHUB_REPOSITORY` and `GITHUB_REF` to determine the PR
   number and repository details.
3. The PR diff is fetched via the GitHub REST API using the provided
   `github_token`.
4. The diff is piped to `vireon gatekeeper review --stdin` along with your API
   key and severity threshold.
5. The CLI returns a JSON report containing a `summary` and an `issues` array.
6. A formatted Markdown table is posted as a PR comment.
7. If `fail_on_issues` is `true` and at least one issue was found, the step
   exits with a non-zero code, blocking the merge.

---

## Secrets setup

Store your Vireon API key as a repository secret:

1. Navigate to **Settings → Secrets and variables → Actions**
2. Click **New repository secret**
3. Name: `VIREON_API_KEY`
4. Value: your Vireon API key

---

## Permissions

The workflow needs `pull-requests: write` permission to post the review
comment. The minimal set is:

```yaml
permissions:
  contents: read
  pull-requests: write
```

---

## License

[MIT](LICENSE) © doctorfixes