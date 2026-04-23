// src/rules.js

/**
 * Evaluate rules against the contract.
 * This is intentionally simple but structured for expansion.
 *
 * Returns:
 * {
 *   violations: [{ id, message, severity }],
 *   passed: boolean
 * }
 */
function evaluateRules({ contract, schema }) {
  const violations = [];

  // Enforce required fields from schema
  if (Array.isArray(schema.requiredFields)) {
    schema.requiredFields.forEach((field) => {
      if (!(field in contract)) {
        violations.push({
          id: `missing:${field}`,
          message: `Required field "${field}" is missing from contract`,
          severity: 'high'
        });
      }
    });
  }

  // Enforce maxRiskLevel if present
  if (schema.maxRiskLevel !== undefined && contract.riskLevel !== undefined) {
    if (contract.riskLevel > schema.maxRiskLevel) {
      violations.push({
        id: 'risk:level_exceeded',
        message: `Contract riskLevel ${contract.riskLevel} exceeds max ${schema.maxRiskLevel}`,
        severity: 'high'
      });
    }
  }

  return {
    violations,
    passed: violations.length === 0
  };
}

module.exports = {
  evaluateRules
};
