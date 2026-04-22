/**
 * Waiver & Exception Engine
 * Implements the Exception & Waiver System from the Gatekeeper Governance Contract (v1).
 *
 * Supported mechanisms:
 *   .gatekeeper-ignore              — file-level exceptions (one pattern per line)
 *   gatekeeper-waive:<rule-id>      — PR label: waive a specific rule for this PR
 *   gatekeeper-waive:<Nd>           — PR label: time-boxed waiver (informational, e.g. 7d)
 *   gatekeeper-baseline-freeze      — PR label: freeze baseline updates for this PR
 *   gatekeeper-emergency-override   — PR label: org-level emergency override (all enforcement suspended)
 */

import { existsSync, readFileSync } from 'fs';

// Maximum number of characters in a file extension considered when extracting
// a file path from an issue message (e.g. ".js", ".tsx", ".config.js").
const MAX_EXTENSION_LENGTH = 10;
const IGNORE_FILE = '.gatekeeper-ignore';
const WAIVE_PREFIX = 'gatekeeper-waive:';
const BASELINE_FREEZE_LABEL = 'gatekeeper-baseline-freeze';
const EMERGENCY_OVERRIDE_LABEL = 'gatekeeper-emergency-override';

// Matches time-boxed waivers like "7d", "30d"
const TIME_BOXED_RE = /^\d+d$/;

// ─── Ignore patterns ──────────────────────────────────────────────────────────

/**
 * Load glob-like ignore patterns from .gatekeeper-ignore.
 * Lines starting with '#' are comments; blank lines are skipped.
 *
 * @returns {string[]} Array of pattern strings.
 */
function loadIgnorePatterns() {
  if (!existsSync(IGNORE_FILE)) return [];
  try {
    return readFileSync(IGNORE_FILE, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'));
  } catch {
    return [];
  }
}

// ─── Waiver parsing ───────────────────────────────────────────────────────────

/**
 * Parse PR labels into a structured waiver descriptor.
 *
 * @param {Array<string|{name:string}>} prLabels - Array of label strings or GitHub label objects.
 * @returns {{ waivedRules: string[], timeBoxed: string[], baselineFreeze: boolean, emergencyOverride: boolean }}
 */
function parseWaivers(prLabels = []) {
  const waivedRules = [];
  const timeBoxed = [];
  let baselineFreeze = false;
  let emergencyOverride = false;

  for (const raw of prLabels) {
    const name = (typeof raw === 'string' ? raw : raw?.name ?? '').trim();

    if (name === EMERGENCY_OVERRIDE_LABEL) {
      emergencyOverride = true;
    } else if (name === BASELINE_FREEZE_LABEL) {
      baselineFreeze = true;
    } else if (name.startsWith(WAIVE_PREFIX)) {
      const value = name.slice(WAIVE_PREFIX.length);
      if (TIME_BOXED_RE.test(value)) {
        timeBoxed.push(value);
      } else if (value) {
        waivedRules.push(value);
      }
    }
  }

  return { waivedRules, timeBoxed, baselineFreeze, emergencyOverride };
}

// ─── Pattern matching ─────────────────────────────────────────────────────────

/**
 * Test whether a file path matches any of the ignore patterns.
 * Supports `**` (any path segments) and `*` (any characters within one segment).
 *
 * @param {string} filePath
 * @param {string[]} patterns
 * @returns {boolean}
 */
function matchesIgnorePattern(filePath, patterns) {
  const normalised = filePath.replace(/\\/g, '/');
  for (const pattern of patterns) {
    const regexStr = pattern
      // Normalize path separators first; remaining backslashes are then escaped below
      .replace(/\\/g, '/')
      // Escape all regex metacharacters including backslash (belt-and-suspenders
      // after the normalization above, and guards against any future code changes)
      .replace(/[\\+.^${}()|[\]]/g, '\\$&')
      // ** → match any path (including separators)
      .replace(/\*\*/g, '\x00')
      // * → match within one segment only
      .replace(/\*/g, '[^/]*')
      // restore ** placeholder
      .replace(/\x00/g, '.*');
    try {
      if (new RegExp(`(^|/)${regexStr}($|/)`).test(normalised)) return true;
    } catch {
      // malformed pattern — skip without crashing
    }
  }
  return false;
}

// ─── Apply waivers ────────────────────────────────────────────────────────────

// Pre-compiled regex for extracting a file path from an issue message string.
const FILE_IN_MESSAGE_RE = new RegExp(`"([^"]+\\.[a-zA-Z]{1,${MAX_EXTENSION_LENGTH}})"`);

/**
 * Best-effort extraction of a file path from an issue message string.
 * Looks for the first double-quoted token that contains a dot-extension.
 *
 * @param {string|undefined} message
 * @returns {string|null}
 */
function extractFileFromMessage(message) {
  if (!message) return null;
  const m = message.match(FILE_IN_MESSAGE_RE);
  return m ? m[1] : null;
}

/**
 * Filter an issue list against active waivers and ignore patterns.
 *
 * @param {Array<{rule?:string, message?:string, file?:string, path?:string}>} issues
 * @param {{ waivedRules: string[], timeBoxed: string[], baselineFreeze: boolean, emergencyOverride: boolean }} waivers
 * @param {string[]} ignorePatterns
 * @returns {{ filtered: Array, waived: Array }}
 */
function applyWaivers(issues, waivers, ignorePatterns) {
  // Emergency override suspends all enforcement
  if (waivers.emergencyOverride) {
    return {
      filtered: [],
      waived: issues.map((i) => ({ ...i, waiverReason: EMERGENCY_OVERRIDE_LABEL })),
    };
  }

  const filtered = [];
  const waived = [];

  for (const issue of issues) {
    // 1. File-level ignore (.gatekeeper-ignore)
    const file = issue.file ?? issue.path ?? extractFileFromMessage(issue.message);
    if (file && matchesIgnorePattern(file, ignorePatterns)) {
      waived.push({ ...issue, waiverReason: 'gatekeeper-ignore' });
      continue;
    }

    // 2. Rule-level waiver (PR label gatekeeper-waive:<rule-id>)
    if (issue.rule && waivers.waivedRules.includes(issue.rule)) {
      waived.push({ ...issue, waiverReason: `${WAIVE_PREFIX}${issue.rule}` });
      continue;
    }

    filtered.push(issue);
  }

  return { filtered, waived };
}

// ─── Waiver summary ───────────────────────────────────────────────────────────

/**
 * Build a human-readable waiver summary line for inclusion in the PR comment.
 *
 * @param {{ waivedRules: string[], timeBoxed: string[], baselineFreeze: boolean, emergencyOverride: boolean }} waivers
 * @param {Array} waivedIssues - Issues that were suppressed.
 * @returns {string|null} Markdown string, or null if nothing is active.
 */
function buildWaiverSummary(waivers, waivedIssues) {
  const parts = [];

  if (waivers.emergencyOverride) {
    parts.push('🚨 **Emergency override active** — all enforcement suspended by org governance.');
  }

  if (waivers.baselineFreeze) {
    parts.push('🧊 **Baseline freeze active** — baseline updates are paused for this PR.');
  }

  if (waivers.waivedRules.length > 0) {
    parts.push(`⚠️ **Rule waivers active:** \`${waivers.waivedRules.join('`, `')}\``);
  }

  if (waivers.timeBoxed.length > 0) {
    parts.push(`⏱️ **Time-boxed waivers active:** ${waivers.timeBoxed.join(', ')}`);
  }

  if (waivedIssues.length > 0) {
    parts.push(`*${waivedIssues.length} issue(s) suppressed by waiver or ignore rules.*`);
  }

  return parts.length > 0 ? parts.join('\n') : null;
}

export { loadIgnorePatterns, parseWaivers, applyWaivers, buildWaiverSummary, matchesIgnorePattern };
