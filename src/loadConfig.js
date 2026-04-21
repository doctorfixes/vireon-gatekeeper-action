import { readFileSync, existsSync } from "fs";
import * as core from "@actions/core";
import yaml from "js-yaml";

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
    };
  } catch (err) {
    core.warning(`Failed to parse config file at ${configPath}: ${err.message}. Using defaults.`);
    return defaults;
  }
}
