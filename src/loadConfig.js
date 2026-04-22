import { readFileSync, existsSync } from "fs";
import * as core from "@actions/core";
import yaml from "js-yaml";
import { normaliseBaselineMode, DEFAULT_THRESHOLDS } from "./governanceContract.js";

export function loadConfig(configPath) {
  const defaults = {
    mode: "strict",
    rules: [],
    settings: {
      drift: { sensitivity: "medium", threshold: null },
      comments: { summary: true, explain_why: false, max_messages: null },
      architecture: { enforce_layers: false, allowed_layers: [] },
      naming: { enforce_case: false, file_case: "kebab", class_case: "pascal", variable_case: "camel" },
    },
    plugins: { enabled: [] },
    governance: {
      baseline_mode: "pr-approved",
      drift: { thresholds: { ...DEFAULT_THRESHOLDS } },
      enforcement: { hybrid_critical_rules: [] },
    },
  };

  if (!existsSync(configPath)) {
    core.info(`No config file found at ${configPath}. Using defaults.`);
    return defaults;
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = yaml.load(raw) || {};
    const ds = defaults.settings;
    const ps = parsed.settings || {};
    return {
      mode: parsed.mode ?? defaults.mode,
      rules: Array.isArray(parsed.rules) ? parsed.rules : defaults.rules,
      settings: {
        drift: {
          sensitivity: ps.drift?.sensitivity ?? ds.drift.sensitivity,
          threshold: typeof ps.drift?.threshold === "number" ? ps.drift.threshold : ds.drift.threshold,
        },
        comments: {
          summary: ps.comments?.summary ?? ds.comments.summary,
          explain_why: ps.comments?.explain_why ?? ds.comments.explain_why,
          max_messages:
            typeof ps.comments?.max_messages === "number"
              ? ps.comments.max_messages
              : ds.comments.max_messages,
        },
        architecture: {
          enforce_layers: ps.architecture?.enforce_layers ?? ds.architecture.enforce_layers,
          allowed_layers: Array.isArray(ps.architecture?.allowed_layers)
            ? ps.architecture.allowed_layers
            : ds.architecture.allowed_layers,
        },
        naming: {
          enforce_case: ps.naming?.enforce_case ?? ds.naming.enforce_case,
          file_case: ps.naming?.file_case ?? ds.naming.file_case,
          class_case: ps.naming?.class_case ?? ds.naming.class_case,
          variable_case: ps.naming?.variable_case ?? ds.naming.variable_case,
        },
      },
      plugins: {
        enabled: Array.isArray(parsed.plugins?.enabled) ? parsed.plugins.enabled : defaults.plugins.enabled,
      },
      governance: parseGovernanceConfig(parsed.governance, defaults.governance),
    };
  } catch (err) {
    core.warning(`Failed to parse config file at ${configPath}: ${err.message}. Using defaults.`);
    return defaults;
  }
}

/**
 * Parse and normalise the governance sub-block from the raw config.
 *
 * @param {Object|undefined} pg   - Raw parsed governance object (may be undefined).
 * @param {Object}           dg   - Governance defaults.
 * @returns {Object} Normalised governance config.
 */
function parseGovernanceConfig(pg, dg) {
  const rawThresholds = pg?.drift?.thresholds ?? {};
  const dt = dg.drift.thresholds;
  return {
    baseline_mode: normaliseBaselineMode(pg?.baseline_mode ?? dg.baseline_mode),
    drift: {
      thresholds: {
        low:      typeof rawThresholds.low      === "number" ? rawThresholds.low      : dt.low,
        moderate: typeof rawThresholds.moderate === "number" ? rawThresholds.moderate : dt.moderate,
        high:     typeof rawThresholds.high     === "number" ? rawThresholds.high     : dt.high,
        critical: typeof rawThresholds.critical === "number" ? rawThresholds.critical : dt.critical,
      },
    },
    enforcement: {
      hybrid_critical_rules: Array.isArray(pg?.enforcement?.hybrid_critical_rules)
        ? pg.enforcement.hybrid_critical_rules
        : dg.enforcement.hybrid_critical_rules,
    },
  };
}
