const CASE_PATTERNS = {
  kebab: /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/,
  snake: /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/,
  camel: /^[a-z][a-zA-Z0-9]*$/,
  pascal: /^[A-Z][a-zA-Z0-9]*$/,
};

function matchesCase(name, caseStyle) {
  const pattern = CASE_PATTERNS[caseStyle];
  if (!pattern) return true; // unknown style — skip rather than false-positive
  return pattern.test(name);
}

function getBasenameWithoutExtension(filePath) {
  const base = filePath.split("/").pop() || filePath;
  const dotIndex = base.lastIndexOf(".");
  return dotIndex > 0 ? base.slice(0, dotIndex) : base;
}

export default {
  id: "naming-conventions",
  description: "Enforces consistent identifiers and naming patterns.",
  check(context) {
    const { diff = "", naming = {} } = context;
    const {
      enforce_case = false,
      file_case = "kebab",
      class_case = "pascal",
      variable_case = "camel",
    } = naming;

    if (!enforce_case) {
      return { passed: true, messages: [] };
    }

    const messages = [];
    let anyFailed = false;

    const fileBlocks = diff.split(/^diff --git /m).filter(Boolean);

    for (const block of fileBlocks) {
      const pathMatch = block.match(/^a\/(.+?)\s+b\/(.+)$/m);
      if (!pathMatch) continue;
      const filePath = pathMatch[2].trim();
      const baseName = getBasenameWithoutExtension(filePath);

      // Check file-name casing.
      if (file_case && !matchesCase(baseName, file_case)) {
        anyFailed = true;
        messages.push({
          rule: "naming-conventions",
          message: `File name "${baseName}" does not match ${file_case}-case convention`,
          why: "Consistent file naming improves readability and tooling compatibility.",
        });
      }

      const lines = block.split("\n");
      const addedLines = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++"));

      for (const line of addedLines) {
        // Class / interface declarations.
        const classMatch = line.match(
          /^\+\s*(?:export\s+)?(?:abstract\s+)?(?:class|interface)\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/
        );
        if (classMatch) {
          const className = classMatch[1];
          if (class_case && !matchesCase(className, class_case)) {
            anyFailed = true;
            messages.push({
              rule: "naming-conventions",
              message: `Class/interface name "${className}" does not match ${class_case}-case convention`,
              why: "Consistent class naming signals intent and improves code navigation.",
            });
          }
        }

        // Variable / constant declarations.
        const varMatch = line.match(
          /^\+\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)/
        );
        if (varMatch) {
          const varName = varMatch[1];
          if (variable_case && !matchesCase(varName, variable_case)) {
            anyFailed = true;
            messages.push({
              rule: "naming-conventions",
              message: `Variable "${varName}" does not match ${variable_case}-case convention`,
              why: "Consistent variable naming reduces cognitive load and improves maintainability.",
            });
          }
        }
      }
    }

    return { passed: !anyFailed, messages };
  },
};
