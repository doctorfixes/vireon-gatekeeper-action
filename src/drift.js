// src/drift.js

/**
 * Compute a drift/risk score from evaluation.
 * For now: score = normalized violation count.
 */
function computeDriftScore(evaluation) {
  const count = evaluation.violations.length;

  if (count === 0) {
    return {
      score: 0,
      reason: 'No violations detected'
    };
  }

  // Simple normalization: 1 violation = 0.4, 2 = 0.8, 3+ = 1.0
  let score = 0.4 * count;
  if (score > 1) score = 1;

  return {
    score,
    reason: `${count} violation(s) detected`
  };
}

module.exports = {
  computeDriftScore
};
