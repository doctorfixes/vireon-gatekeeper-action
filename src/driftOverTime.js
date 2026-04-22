function computeDriftOverTime(history) {
  return {
    points: (history || []).map(h => ({
      commitHash: h.commitHash,
      timestamp: h.createdAt
    }))
  };
}

module.exports = { computeDriftOverTime };

