/**
 * Drift Over Time
 * Computes architecture stability metrics and change events from baseline history.
 */

/**
 * Compute drift-over-time metrics from a list of versioned baseline snapshots.
 *
 * @param {Array<{version: number, commit: string|null, timestamp: string, data: Object}>} history
 * @returns {{
 *   architectureStability: number,
 *   namingStability: number,
 *   boundaryStability: number,
 *   events: Array,
 *   trend: 'stable'|'drifting'|'critical'
 * }}
 */
function computeDriftOverTime(history) {
  if (!history || history.length < 2) {
    return {
      architectureStability: 1.0,
      namingStability: 1.0,
      boundaryStability: 1.0,
      events: [],
      trend: 'stable',
    };
  }

  const events = [];
  let archChanges = 0;
  let namingChanges = 0;
  let boundaryChanges = 0;
  const transitions = history.length - 1;

  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];

    const prevData = prev.data || prev;
    const currData = curr.data || curr;
    const version = curr.version || curr.commit || i;

    // Architecture layer changes
    const prevLayers = prevData.layers || [];
    const currLayers = currData.layers || [];
    const addedLayers = currLayers.filter((l) => !prevLayers.includes(l));
    const removedLayers = prevLayers.filter((l) => !currLayers.includes(l));

    if (addedLayers.length > 0 || removedLayers.length > 0) {
      archChanges++;
      events.push({
        type: 'architecture_change',
        version,
        added: addedLayers,
        removed: removedLayers,
      });
    }

    // Naming convention changes
    const prevNaming = prevData.naming?.file_case;
    const currNaming = currData.naming?.file_case;
    if (prevNaming && currNaming && prevNaming !== currNaming) {
      namingChanges++;
      events.push({
        type: 'naming_change',
        version,
        from: prevNaming,
        to: currNaming,
      });
    }

    // Boundary (dependency edge) changes
    const prevEdges = Object.keys(prevData.boundaries?.edges || {});
    const currEdges = Object.keys(currData.boundaries?.edges || {});
    const addedEdges = currEdges.filter((e) => !prevEdges.includes(e));
    const removedEdges = prevEdges.filter((e) => !currEdges.includes(e));

    if (addedEdges.length > 0 || removedEdges.length > 0) {
      boundaryChanges++;
      events.push({
        type: 'boundary_change',
        version,
        added: addedEdges,
        removed: removedEdges,
      });
    }
  }

  const architectureStability = 1 - archChanges / transitions;
  const namingStability = 1 - namingChanges / transitions;
  const boundaryStability = 1 - boundaryChanges / transitions;

  const avgStability = (architectureStability + namingStability + boundaryStability) / 3;

  let trend;
  if (avgStability >= 0.8) {
    trend = 'stable';
  } else if (avgStability >= 0.5) {
    trend = 'drifting';
  } else {
    trend = 'critical';
  }

  return {
    architectureStability,
    namingStability,
    boundaryStability,
    events,
    trend,
  };
}

export { computeDriftOverTime };
