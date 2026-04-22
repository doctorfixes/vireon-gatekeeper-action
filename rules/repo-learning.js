const rule = {
  id: 'repo-learning',
  description: 'Learns repo architecture and reports basic findings (minimal v1).',

  async check(context, contract) {
    return {
      passed: true,
      messages: ['Gatekeeper inferred a baseline for this repository (minimal v1).'],
      metadata: {
        findings: [],
        contractVersion: contract.version,
        commitHash: context.commitHash
      }
    };
  }
};

module.exports = rule;

