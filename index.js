/**
 * Vireon Gatekeeper Action
 *
 * Fetches the pull-request diff, passes it through the Vireon Gatekeeper CLI,
 * posts the review summary as a PR comment, and optionally fails the job when
 * issues are found.
 *
 * Inputs are read from environment variables injected by the Actions runner:
 *   INPUT_GITHUB_TOKEN      – GitHub token (default: github.token)
 *   INPUT_VIREON_API_KEY    – Vireon API key
 *   INPUT_FAIL_ON_ISSUES    – "true" | "false"  (default: "true")
 *   INPUT_SEVERITY_THRESHOLD – low | medium | high | critical  (default: "medium")
 *
 * Standard GitHub Actions workflow commands are written to stdout so the runner
 * can parse them (::error::, ::warning::, ::set-output::, etc.).
 */

'use strict';

const { execFileSync } = require('child_process');
const https = require('https');

// ---------------------------------------------------------------------------
// Helpers – minimal replacement for @actions/core without external deps
// ---------------------------------------------------------------------------

function getInput(name, required = false) {
  const key = `INPUT_${name.replace(/ /g, '_').toUpperCase()}`;
  const value = (process.env[key] || '').trim();
  if (required && !value) {
    setFailed(`Input required and not supplied: ${name}`);
    process.exit(1);
  }
  return value;
}

function info(message) {
  process.stdout.write(`${message}\n`);
}

function warning(message) {
  process.stdout.write(`::warning::${message}\n`);
}

function setFailed(message) {
  process.stdout.write(`::error::${message}\n`);
  process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// GitHub REST API helpers
// ---------------------------------------------------------------------------

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) {
          reject(new Error(`GitHub API error ${res.statusCode}: ${raw}`));
          return;
        }
        try {
          resolve(JSON.parse(raw));
        } catch {
          resolve(raw);
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function githubRequest(path, method, token, body) {
  const options = {
    hostname: 'api.github.com',
    path,
    method: method || 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'vireon-gatekeeper-action/1.0.0',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  };
  const payload = body ? JSON.stringify(body) : undefined;
  if (payload) {
    options.headers['Content-Type'] = 'application/json';
    options.headers['Content-Length'] = Buffer.byteLength(payload);
  }
  return httpsRequest(options, payload);
}

// ---------------------------------------------------------------------------
// PR diff fetching
// ---------------------------------------------------------------------------

async function getPrDiff(token, owner, repo, pullNumber) {
  const options = {
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}/pulls/${pullNumber}`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3.diff',
      'User-Agent': 'vireon-gatekeeper-action/1.0.0',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`Failed to fetch PR diff (HTTP ${res.statusCode})`));
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Vireon Gatekeeper CLI invocation
// ---------------------------------------------------------------------------

function runGatekeeper(apiKey, diff, severityThreshold) {
  const args = [
    'gatekeeper',
    'review',
    '--format', 'json',
    '--severity', severityThreshold,
    '--stdin',
  ];

  const result = execFileSync('vireon', args, {
    input: diff,
    env: { ...process.env, VIREON_API_KEY: apiKey },
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  });

  return JSON.parse(result.toString('utf8'));
}

// ---------------------------------------------------------------------------
// Comment formatting
// ---------------------------------------------------------------------------

function formatComment(report) {
  const { summary, issues = [] } = report;
  const issueCount = issues.length;

  const header = issueCount === 0
    ? '## ✅ Vireon Gatekeeper — No issues found'
    : `## ⚠️ Vireon Gatekeeper — ${issueCount} issue${issueCount === 1 ? '' : 's'} found`;

  const lines = [header, ''];

  if (summary) {
    lines.push(summary, '');
  }

  if (issueCount > 0) {
    lines.push('| Severity | File | Line | Message |');
    lines.push('|----------|------|------|---------|');
    for (const issue of issues) {
      const sev = issue.severity || 'info';
      const file = issue.file || '—';
      const line = issue.line != null ? issue.line : '—';
      const msg = (issue.message || '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
      lines.push(`| ${sev} | \`${file}\` | ${line} | ${msg} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('_Powered by [Vireon Gatekeeper](https://github.com/doctorfixes/vireon-gatekeeper-action)_');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const token = getInput('github_token', true);
  const apiKey = getInput('vireon_api_key', true);
  const failOnIssues = getInput('fail_on_issues') !== 'false';
  const severityThreshold = getInput('severity_threshold') || 'medium';

  // Parse GitHub context from environment variables set by the runner.
  const repository = process.env.GITHUB_REPOSITORY || '';
  const [owner, repo] = repository.split('/');
  const refName = process.env.GITHUB_REF || '';
  const pullNumber = (() => {
    const match = refName.match(/refs\/pull\/(\d+)\/merge/);
    return match ? parseInt(match[1], 10) : null;
  })();

  if (!pullNumber) {
    warning('This action is designed to run on pull_request events. Skipping.');
    return;
  }

  info(`Fetching diff for PR #${pullNumber} in ${owner}/${repo}…`);
  const diff = await getPrDiff(token, owner, repo, pullNumber);

  if (!diff.trim()) {
    info('PR diff is empty – nothing to review.');
    return;
  }

  info('Running Vireon Gatekeeper CLI…');
  let report;
  try {
    report = runGatekeeper(apiKey, diff, severityThreshold);
  } catch (err) {
    setFailed(`Vireon Gatekeeper CLI failed: ${err.message}`);
    return;
  }

  const issueCount = (report.issues || []).length;
  info(`Gatekeeper found ${issueCount} issue(s).`);

  const comment = formatComment(report);

  info('Posting review comment to PR…');
  await githubRequest(
    `/repos/${owner}/${repo}/issues/${pullNumber}/comments`,
    'POST',
    token,
    { body: comment },
  );

  if (failOnIssues && issueCount > 0) {
    setFailed(`Vireon Gatekeeper found ${issueCount} issue(s). See PR comment for details.`);
  }
}

main().catch((err) => {
  setFailed(`Unexpected error: ${err.message}`);
});
