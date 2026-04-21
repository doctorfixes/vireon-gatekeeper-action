function parseFilesFromDiff(diff) {
  const files = [];
  const fileBlocks = diff.split(/^diff --git /m).filter(Boolean);

  for (const block of fileBlocks) {
    const pathMatch = block.match(/^a\/(.+?)\s+b\/(.+)$/m);
    if (!pathMatch) continue;
    const filePath = pathMatch[2].trim();
    const lines = block.split("\n");
    const addedLines = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++"));
    files.push({ filePath, addedLines });
  }

  return files;
}

function detectLayer(filePath, layers) {
  const parts = filePath.toLowerCase().replace(/\\/g, "/").split("/");
  for (const part of parts) {
    const match = layers.find((l) => l.toLowerCase() === part);
    if (match) return match;
  }
  return null;
}

export default {
  id: "architecture-boundaries",
  description: "Flags changes that violate layering or module boundaries.",
  check(context) {
    const { diff = "", architecture = {} } = context;
    const { enforce_layers = false, allowed_layers = [] } = architecture;

    if (!enforce_layers || allowed_layers.length === 0) {
      return { passed: true, messages: [] };
    }

    const files = parseFilesFromDiff(diff);
    const messages = [];
    let anyFailed = false;

    for (const { filePath, addedLines } of files) {
      const layer = detectLayer(filePath, allowed_layers);

      // Only analyze files that reside inside a recognised layer directory.
      if (layer === null) continue;

      const layerIndex = allowed_layers.indexOf(layer);

      // Check added import statements for cross-layer violations.
      // Inner layers (lower index) must not import from outer layers (higher index).
      for (const line of addedLines) {
        const importMatch = line.match(
          /^\+\s*(?:import\s.*?from\s+['"]|require\s*\(['"])(\.\.?\/[^'"]+)['"]/
        );
        if (!importMatch) continue;

        const importPath = importMatch[1];
        const importedLayer = detectLayer(importPath, allowed_layers);

        if (importedLayer === null) continue;

        const importedLayerIndex = allowed_layers.indexOf(importedLayer);

        if (importedLayerIndex > layerIndex) {
          anyFailed = true;
          messages.push({
            rule: "architecture-boundaries",
            message: `Layer violation in "${filePath}": "${layer}" imports from "${importedLayer}"`,
            why: `Inner layers should not depend on outer layers. "${layer}" (layer ${layerIndex + 1}) must not import from "${importedLayer}" (layer ${importedLayerIndex + 1}).`,
          });
        }
      }
    }

    return { passed: !anyFailed, messages };
  },
};
