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

function computeDriftScore(changes, fileCount) {
  if (fileCount === 0) return 0;
  const { importChanges, exportChanges, structuralChanges } = changes;
  const weighted = importChanges * 2 + exportChanges * 3 + structuralChanges;
  return Math.min(1, weighted / Math.max(fileCount * 5, 1));
}

export default {
  id: "semantic-drift",
  description: "Detects meaningful structural changes in the codebase.",
  check(context) {
    const { diff = "", sensitivity = "medium" } = context;
    const threshold = SENSITIVITY_THRESHOLDS[sensitivity] ?? SENSITIVITY_THRESHOLDS.medium;

    const files = parseDiff(diff);
    const changes = analyzeChanges(files);
    const driftScore = computeDriftScore(changes, files.length);
    const passed = driftScore < threshold;

    return {
      passed,
      driftScore: Math.round(driftScore * 100) / 100,
      messages: changes.messages,
    };
  },
};
