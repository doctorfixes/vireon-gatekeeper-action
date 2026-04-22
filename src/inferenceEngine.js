async function buildBaseline(context) {
  return {
    createdAt: new Date().toISOString(),
    commitHash: context.commitHash,
    summary: 'Baseline inferred (minimal v1)',
    layers: [],
    modules: []
  };
}

module.exports = { buildBaseline };

