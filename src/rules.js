function evaluateRules({ contract, schema }) {
  const violations = [];

  if (Array.isArray(schema.requiredFields)) {
    schema.requiredFields.forEach((field) => {
      if (!(field in contract)) {
        violations.push({
          id: `missing:${field}`,
          message: `Missing required field: ${field}`,
          severity: 'high'
        });
      }
    });
  }

  if (schema.maxRiskLevel !== undefined && contract.riskLevel !== undefined) {
    if (contract.riskLevel > schema.maxRiskLevel) {
      violations.push({
        id: 'risk:exceeded',
        message: `riskLevel ${contract.riskLevel} exceeds max ${schema.maxRiskLevel}`,
        severity: 'critical'
      });
    }
  }

  return {
    violations,
    passed: violations.length === 0
  };
}

module.exports = { evaluateRules };
