function generateArchitectureHealthReport({ baseline, history, driftOverTime, recentFindings }) {
  return {
    baselineSummary: baseline?.summary || 'No baseline',
    historyCount: (history || []).length,
    driftPoints: (driftOverTime?.points || []).length,
    findingsCount: (recentFindings || []).length
  };
}

module.exports = { generateArchitectureHealthReport };

