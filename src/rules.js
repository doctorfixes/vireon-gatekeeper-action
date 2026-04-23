function evaluateRules({ contract, schema }) {
  const violations = [];

  const severityFor = (ruleId) => {
    const rule = schema.rules?.find(r => r.id === ruleId);
    return rule?.severity || 'medium';
  };

  if (Array.isArray(schema.requiredFields)) {
    schema.requiredFields.forEach((field) => {
      if (!(field in contract)) {
        violations.push({
          id: `missing:${field}`,
          message: `Missing required field: ${field}`,
          severity: severityFor(`required:${field}`)
        });
      }
    });
  }

  if (schema.maxRiskLevel !== undefined && contract.riskLevel !== undefined) {
    if (contract.riskLevel > schema.maxRiskLevel) {
      violations.push({
        id: 'risk:limit',
        message: `riskLevel ${contract.riskLevel} exceeds max ${schema.maxRiskLevel}`,
        severity: severityFor('risk:limit')
      });
    }
  }

  return {
    violations,
    passed: violations.length === 0
  };
}

module.exports = { evaluateRules };
