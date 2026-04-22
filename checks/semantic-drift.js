const SENSITIVITY_THRESHOLDS = {
  low: 0.7,
  medium: 0.4,
  high: 0.2,
};

function parseDiff(diff) {
  const files = [];
  const fileBlocks = diff.split(/^diff --git /m).filter(Boolean);

  for (const block of fileBlocks) {
    const lines = block.split("\n");
    const added = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    const removed = lines.filter((l) => l.startsWith("-") && !l.startsWith("---"));
    files.push({ added, removed });
  }

  return files;
}

function analyzeChanges(files) {
  const messages = [];
  let importChanges = 0;
  let exportChanges = 0;
  let structuralChanges = 0;

  for (const { added, removed } of files) {
    const addedText = added.join("\n");
    const removedText = removed.join("\n");

    const importAddCount = (addedText.match(/^\+\s*(import\s|from\s['"]|require\s*\()/gm) || []).length;
    const importRemCount = (removedText.match(/^-\s*(import\s|from\s['"]|require\s*\()/gm) || []).length;
    if (importAddCount + importRemCount > 0) {
      importChanges += importAddCount + importRemCount;
      messages.push({
        rule: "semantic-drift",
        message: `Import boundary changed: +${importAddCount} / -${importRemCount}`,
        why: "Import changes alter module dependencies and can signal architectural drift.",
      });
    }

    const exportAddCount = (addedText.match(/^\+\s*(export\s+(default\s+)?|module\.exports\s*=)/gm) || []).length;
    const exportRemCount = (removedText.match(/^-\s*(export\s+(default\s+)?|module\.exports\s*=)/gm) || []).length;
    if (exportAddCount + exportRemCount > 0) {
      exportChanges += exportAddCount + exportRemCount;
      messages.push({
        rule: "semantic-drift",
        message: `Public API surface changed: +${exportAddCount} / -${exportRemCount}`,
        why: "Export changes modify the public contract of a module and can break downstream consumers.",
      });
    }

    const structAddCount = (
      addedText.match(/^\+\s*(class\s+\w+|function\s+\w+|interface\s+\w+|type\s+\w+\s*=)/gm) || []
    ).length;
    const structRemCount = (
      removedText.match(/^-\s*(class\s+\w+|function\s+\w+|interface\s+\w+|type\s+\w+\s*=)/gm) || []
    ).length;
    if (structAddCount + structRemCount > 0) {
      structuralChanges += structAddCount + structRemCount;
      messages.push({
        rule: "semantic-drift",
        message: `Structural change detected: +${structAddCount} / -${structRemCount} definitions`,
        why: "Adding or removing top-level declarations changes the shape of a module.",
      });
    }
  }

  return { importChanges, exportChanges, structuralChanges, messages };
}

export default {
  id: "semantic-drift",
  description: "Detects structural and dependency drift in the repository.",

  check(context, config) {
    const {
      diff = "",
      changedFiles = [],
      fileDiffs = null,
      dependencyGraphBefore = null,
      dependencyGraphAfter = null,
      sensitivity = "medium",
      threshold = null,
    } = context;

    const resolvedThreshold =
      typeof threshold === "number"
        ? Math.max(0, Math.min(1, threshold))
        : (SENSITIVITY_THRESHOLDS[sensitivity] ?? SENSITIVITY_THRESHOLDS.medium);

    const messages = [];
    let driftScore = 0;

    // 1. Detect new files (structural expansion)
    const newFiles = changedFiles.filter((f) => f.status === "added");
    if (newFiles.length > 0) {
      messages.push({
        rule: "semantic-drift",
        message: `New files added: ${newFiles.map((f) => f.path).join(", ")}`,
        why: "New files expand the codebase surface area and may introduce unreviewed dependencies.",
      });
      driftScore += newFiles.length * 0.05;
    }

    // 2. Detect deleted files (structural contraction)
    const deletedFiles = changedFiles.filter((f) => f.status === "removed");
    if (deletedFiles.length > 0) {
      messages.push({
        rule: "semantic-drift",
        message: `Files removed: ${deletedFiles.map((f) => f.path).join(", ")}`,
        why: "Removing files may break existing consumers or remove important behaviour.",
      });
      driftScore += deletedFiles.length * 0.05;
    }

    // 3. Detect file movement (architecture drift)
    const movedFiles = changedFiles.filter((f) => f.status === "renamed");
    if (movedFiles.length > 0) {
      messages.push({
        rule: "semantic-drift",
        message: `Files moved: ${movedFiles.map((f) => f.path).join(", ")}`,
        why: "File renames shift module identities and can silently break imports that reference the old path.",
      });
      driftScore += movedFiles.length * 0.1;
    }

    // 4. Analyse per-file diffs for import/export/structural changes.
    // Fall back to the top-level diff when fileDiffs is not provided.
    const diffSource = fileDiffs ?? diff;
    if (diffSource) {
      const parsedFiles = parseDiff(diffSource);
      const changes = analyzeChanges(parsedFiles);
      for (const msg of changes.messages) {
        messages.push(msg);
      }
      const weighted = changes.importChanges * 2 + changes.exportChanges * 3 + changes.structuralChanges;
      const fileCount = Math.max(parsedFiles.length, 1);
      driftScore += Math.min(1, weighted / (fileCount * 5));
    }

    // 5. Detect dependency graph drift.
    if (dependencyGraphBefore && dependencyGraphAfter) {
      const beforeDeps = new Set(Object.keys(dependencyGraphBefore));
      const afterDeps = new Set(Object.keys(dependencyGraphAfter));
      const addedDeps = [...afterDeps].filter((d) => !beforeDeps.has(d));
      const removedDeps = [...beforeDeps].filter((d) => !afterDeps.has(d));

      if (addedDeps.length > 0) {
        messages.push({
          rule: "semantic-drift",
          message: `New dependencies added: ${addedDeps.join(", ")}`,
          why: "New dependencies expand the attack surface and may introduce license or compatibility risks.",
        });
        driftScore += addedDeps.length * 0.1;
      }

      if (removedDeps.length > 0) {
        messages.push({
          rule: "semantic-drift",
          message: `Dependencies removed: ${removedDeps.join(", ")}`,
          why: "Removing dependencies may break code that still relies on them.",
        });
        driftScore += removedDeps.length * 0.05;
      }
    }

    const finalScore = Math.min(1, driftScore);
    const passed = finalScore < resolvedThreshold;

    return {
      passed,
      driftScore: Math.round(finalScore * 100) / 100,
      messages,
    };
  },
};
