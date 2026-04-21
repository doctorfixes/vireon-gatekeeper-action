import { existsSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { resolve as resolvePath, sep } from "path";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const RULES_DIR = resolvePath(__dirname, "..", "rules");

// Only alphanumeric characters, hyphens, and underscores are permitted in rule
// IDs. This prevents path traversal attacks when constructing the file path
// for custom rules (e.g. an ID of "../../evil" must be rejected).
const VALID_RULE_ID = /^[a-zA-Z0-9_-]+$/;

/**
 * Load and execute rule packs defined in gatekeeper.yml
 * @param {Object} config - Loaded Gatekeeper config
 * @param {Object} context - PR context (diffs, files, metadata)
 * @param {Set<string>} [nativeIds] - Set of built-in rule IDs to skip
 * @returns {Promise<Array>} Array of rule results
 */
export async function runRules(config, context, nativeIds = new Set()) {
  const ruleIds = config.rules || [];
  const results = [];

  for (const ruleId of ruleIds) {
    if (nativeIds.has(ruleId)) continue;

    if (!VALID_RULE_ID.test(ruleId)) {
      results.push({
        rule: ruleId,
        passed: false,
        error: `Rule ID "${ruleId}" contains invalid characters`,
        messages: [`Gatekeeper: Invalid rule ID '${ruleId}'`],
      });
      continue;
    }

    // Defense-in-depth: even though the regex above already disallows the
    // characters needed for traversal, resolve the path and confirm it stays
    // inside RULES_DIR before importing.
    const rulePath = resolvePath(RULES_DIR, `${ruleId}.js`);
    if (!rulePath.startsWith(RULES_DIR + sep)) {
      results.push({
        rule: ruleId,
        passed: false,
        error: `Rule "${ruleId}" resolved path is outside the rules directory`,
        messages: [`Gatekeeper: Invalid rule path for '${ruleId}'`],
      });
      continue;
    }

    if (!existsSync(rulePath)) {
      results.push({
        rule: ruleId,
        passed: false,
        error: `Rule module not found: ${ruleId}`,
        messages: [`Gatekeeper: Missing rule pack '${ruleId}'`],
      });
      continue;
    }

    let ruleModule;
    try {
      const mod = await import(pathToFileURL(rulePath).href);
      ruleModule = mod.default ?? mod;
    } catch (err) {
      results.push({
        rule: ruleId,
        passed: false,
        error: `Failed to load rule: ${err.message}`,
        messages: [`Gatekeeper: Error loading rule '${ruleId}'`],
      });
      continue;
    }

    if (typeof ruleModule.check !== "function") {
      results.push({
        rule: ruleId,
        passed: false,
        error: `Rule '${ruleId}' missing required 'check' function`,
        messages: [`Gatekeeper: Invalid rule pack '${ruleId}'`],
      });
      continue;
    }

    try {
      const result = await ruleModule.check(context, config);

      results.push({
        rule: ruleId,
        passed: result?.passed ?? false,
        messages: result?.messages || [],
        driftScore: result?.driftScore || 0,
        metadata: result?.metadata || {},
      });
    } catch (err) {
      results.push({
        rule: ruleId,
        passed: false,
        error: `Rule execution failed: ${err.message}`,
        messages: [`Gatekeeper: Rule '${ruleId}' crashed during execution`],
      });
    }
  }

  return results;
}
