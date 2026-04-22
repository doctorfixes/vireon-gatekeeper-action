function renderGovernanceContract(contract, governanceState, extras = {}) {
  const { explainedResults, healthReport } = extras;

  const explainSection =
    explainedResults && explainedResults.length
      ? explainedResults.map(r => `- ${r.message}`).join('\n')
      : '- No significant drift detected.';

  return [
    '## ✅ Gatekeeper — Architecture Governance Report',
    '',
    '### Governance State',
    `- **Contract version:** \`${governanceState.contractVersion}\``,
    `- **Enforcement mode:** \`${governanceState.enforcementMode}\``,
    `- **Baseline mode:** \`${governanceState.baselineMode}\``,
    `- **Baseline frozen:** \`${governanceState.baselineFrozen}\``,
    `- **Waivers active:** \`none\``,
    '',
    '---',
    '',
    '## 🔍 Semantic Drift Summary',
    'Gatekeeper evaluated this pull request against the inferred architecture baseline.',
    '',
    '### Explain‑Why',
    explainSection,
    '',
    '---',
    '',
    '## 🏗️ Architecture Health Snapshot',
    '```json',
    JSON.stringify(healthReport || {}, null, 2),
    '```',
    '',
    '---',
    '',
    '## 📈 Drift Over Time',
    `- Drift points: \`${(governanceState.drift?.points || []).length}\``,
    '',
    'Gatekeeper is running in **advisory mode**. This PR is **not blocked**.'
  ].join('\n');
}

module.exports = { renderGovernanceContract };

