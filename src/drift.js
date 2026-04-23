const SEVERITY_WEIGHTS = {
  low: 0.1,
  medium: 0.25,
  high: 0.4,
  critical: 0.7
};

function computeDriftScore(evaluation) {
  const { violations } = evaluation;

  if (!violations || violations.length === 0) {
    return { score: 0, reason: 'No violations detected' };
  }

  let score = 0;
  violations.forEach((v) => {
    const weight = SEVERITY_WEIGHTS[v.severity] || SEVERITY_WEIGHTS.medium;
    score += weight;
  });
  if (score > 1) score = 1;

  const top = violations.length > 0 ? violations[0] : null;
  const reason = top
    ? `${violations.length} violation(s): ${top.message} (rule: ${top.id})`
    : `${violations.length} violation(s) detected`;

  return { score, reason };
}

module.exports = { computeDriftScore };
