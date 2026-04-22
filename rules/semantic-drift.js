/**
 * Semantic Drift Rule Pack
 * Detects meaningful structural changes in the codebase.
 */

const SENSITIVITY_THRESHOLDS = {
  low: 0.7,
  medium: 0.4,
  high: 0.2,
};

const DRIFT_WEIGHTS = {
  fileAdded: 0.05,
  fileRemoved: 0.05,
  fileMoved: 0.1,
  dependencyAdded: 0.1,
  dependencyRemoved: 0.05,
};

/**
 * Parse a unified diff into structured changed-file and per-file diff records.
 * @param {string} diff
 * @returns {{ changedFiles: Array, fileDiffs: Array }}
 */
function parseDiff(diff) {
  const changedFiles = [];
  const fileDiffs = [];

  const fileBlocks = diff.split(/^diff --git /m).filter(Boolean);

  for (const block of fileBlocks) {
    const headerMatch = block.match(/^a\/(.+?)\s+b\/(.+?)$/m);
    if (!headerMatch) continue;

    const fromPath = headerMatch[1].trim();
    const toPath = headerMatch[2].trim();
    const lines = block.split("\n");

    let status;
    if (lines.some((l) => l.startsWith("new file"))) {
      status = "added";
    } else if (lines.some((l) => l.startsWith("deleted file"))) {
      status = "removed";
    } else if (fromPath !== toPath) {
      status = "renamed";
    } else {
      status = "modified";
    }

    const addedLines = lines
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .map((l) => l.slice(1));
    const removedLines = lines
      .filter((l) => l.startsWith("-") && !l.startsWith("---"))
      .map((l) => l.slice(1));

    changedFiles.push({
      path: toPath,
      fromPath: status === "renamed" ? fromPath : undefined,
      status,
    });

    fileDiffs.push({
      path: toPath,
      fromPath: status === "renamed" ? fromPath : undefined,
      status,
      addedLines,
      removedLines,
    });
  }

  return { changedFiles, fileDiffs };
}

/**
 * Build a dependency map { filePath → [importedPath, ...] } from a set of diff lines.
 * @param {Array} fileDiffs
 * @param {function} lineSelector - returns the lines to inspect for each file entry
 * @returns {Object}
 */
function buildDependencyGraph(fileDiffs, lineSelector) {
  const graph = {};

  for (const file of fileDiffs) {
    const lines = lineSelector(file);
    const deps = [];

    for (const line of lines) {
      const match = line.match(
        /(?:import\s.*?from\s+['"]|require\s*\(['"])(\.\.?\/[^'"]+)['"]/
      );
      if (match) {
        deps.push(match[1]);
      }
    }

    if (deps.length > 0) {
      graph[file.path] = deps;
    }
  }

  return graph;
}

export default {
  id: "semantic-drift",
  description: "Detects structural and dependency drift in the repository.",

  check(context) {
    const { diff = "", sensitivity = "medium", threshold = null } = context;

    const resolvedThreshold =
      typeof threshold === "number"
        ? Math.max(0, Math.min(1, threshold))
        : (SENSITIVITY_THRESHOLDS[sensitivity] ?? SENSITIVITY_THRESHOLDS.medium);

    const { changedFiles, fileDiffs } = parseDiff(diff);

    const messages = [];
    let driftScore = 0;

    // 1. Detect new files (structural expansion)
    const newFiles = changedFiles.filter((f) => f.status === "added");
    if (newFiles.length > 0) {
      messages.push({
        rule: "semantic-drift",
        message: `New files added: ${newFiles.map((f) => f.path).join(", ")}`,
        why: "Adding new files expands the codebase structure and may introduce new dependencies.",
      });
      driftScore += newFiles.length * DRIFT_WEIGHTS.fileAdded;
    }

    // 2. Detect deleted files (structural contraction)
    const deletedFiles = changedFiles.filter((f) => f.status === "removed");
    if (deletedFiles.length > 0) {
      messages.push({
        rule: "semantic-drift",
        message: `Files removed: ${deletedFiles.map((f) => f.path).join(", ")}`,
        why: "Removing files contracts the codebase structure and may break existing consumers.",
      });
      driftScore += deletedFiles.length * DRIFT_WEIGHTS.fileRemoved;
    }

    // 3. Detect file movement (architecture drift)
    const movedFiles = changedFiles.filter((f) => f.status === "renamed");
    if (movedFiles.length > 0) {
      messages.push({
        rule: "semantic-drift",
        message: `Files moved: ${movedFiles.map((f) => `${f.fromPath} → ${f.path}`).join(", ")}`,
        why: "Moving files changes the module layout and can break import paths across the codebase.",
      });
      driftScore += movedFiles.length * DRIFT_WEIGHTS.fileMoved;
    }

    // 4. Detect dependency changes
    const dependencyGraphBefore = buildDependencyGraph(fileDiffs, (f) => f.removedLines);
    const dependencyGraphAfter = buildDependencyGraph(fileDiffs, (f) => f.addedLines);

    const allFiles = new Set([
      ...Object.keys(dependencyGraphBefore),
      ...Object.keys(dependencyGraphAfter),
    ]);

    for (const file of allFiles) {
      const before = new Set(dependencyGraphBefore[file] || []);
      const after = new Set(dependencyGraphAfter[file] || []);

      const added = [...after].filter((d) => !before.has(d));
      const removed = [...before].filter((d) => !after.has(d));

      if (added.length > 0) {
        messages.push({
          rule: "semantic-drift",
          message: `New dependencies in "${file}": ${added.join(", ")}`,
          why: "Adding new import dependencies increases coupling and can signal architectural drift.",
        });
        driftScore += added.length * DRIFT_WEIGHTS.dependencyAdded;
      }

      if (removed.length > 0) {
        messages.push({
          rule: "semantic-drift",
          message: `Removed dependencies in "${file}": ${removed.join(", ")}`,
          why: "Removing import dependencies may indicate dead code removal or breaking interface changes.",
        });
        driftScore += removed.length * DRIFT_WEIGHTS.dependencyRemoved;
      }
    }

    const normalizedScore = Math.min(1, Math.round(driftScore * 100) / 100);
    const passed = normalizedScore < resolvedThreshold;

    return {
      passed,
      driftScore: normalizedScore,
      messages,
    };
  },
};
