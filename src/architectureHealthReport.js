/**
 * Architecture Health Report Generator
 * Produces a governance-grade architecture report using:
 * - baseline
 * - baseline history
 * - drift-over-time metrics
 * - stability scores
 * - recent findings
 */

function generateArchitectureHealthReport({
  baseline,
  history,
  driftOverTime,
  recentFindings
}) {
  const {
    architectureStability,
    namingStability,
    boundaryStability,
    events,
    trend
  } = driftOverTime;

  const stabilityLine = formatStabilityLine(
    architectureStability,
    namingStability,
    boundaryStability
  );

  const eventSection = formatEventSection(events);
  const findingsSection = formatFindingsSection(recentFindings);

  return `
# 🏛️ Architecture Health Report

Generated automatically by Gatekeeper — governance-grade architecture intelligence.

---

## 📊 Stability Overview

${stabilityLine}

**Overall Trend:** \`${trend}\`

---

## 🧱 Current Inferred Architecture Baseline

**Layers:**  
\`${baseline.layers.join(', ')}\`

**Naming Convention:**  
\`${baseline.naming.file_case}\`

**Observed Dependency Edges:**  
\`${Object.keys(baseline.boundaries.edges).join(', ')}\`

---

## 🕰️ Architecture Evolution (Drift Over Time)

${eventSection}

---

## 🔍 Recent Governance Findings

${findingsSection}

---

## 🧭 Recommended Interventions

${generateRecommendations({
  architectureStability,
  namingStability,
  boundaryStability,
  trend
})}

---

Gatekeeper — institutional architecture governance for modern codebases.
`;
}

function formatStabilityLine(arch, naming, boundaries) {
  return `
- **Architecture Stability:** \`${arch.toFixed(2)}\`
- **Naming Stability:** \`${naming.toFixed(2)}\`
- **Boundary Stability:** \`${boundaries.toFixed(2)}\`
`;
}

function formatEventSection(events) {
  if (!events || events.length === 0) {
    return "_No significant architecture changes detected over time._";
  }

  return events
    .map(e => {
      switch (e.type) {
        case "architecture_change": {
          const added = e.added?.length ? `Added [${e.added.join(', ')}]` : null;
          const removed = e.removed?.length ? `Removed [${e.removed.join(', ')}]` : null;
          const detail = [added, removed].filter(Boolean).join(', ') || 'No layer changes';
          return `- **Architecture Change (v${e.version}):** ${detail}`;
        }
        case "naming_change":
          return `- **Naming Change (v${e.version}):** \`${e.from}\` → \`${e.to}\``;
        case "boundary_change": {
          const added = e.added?.length ? `Added [${e.added.join(', ')}]` : null;
          const removed = e.removed?.length ? `Removed [${e.removed.join(', ')}]` : null;
          const detail = [added, removed].filter(Boolean).join(', ') || 'No edge changes';
          return `- **Boundary Change (v${e.version}):** ${detail}`;
        }
        default:
          return null;
      }
    })
    .filter(Boolean)
    .join("\n");
}

function formatFindingsSection(findings) {
  if (!findings || findings.length === 0) {
    return "_No recent violations detected._";
  }

  return findings
    .map(f => `- **${f.type}:** ${f.detail}`)
    .join("\n");
}

function generateRecommendations({ architectureStability, namingStability, boundaryStability, trend }) {
  const recs = [];

  if (architectureStability < 0.7) {
    recs.push(
      "Consider reviewing your architecture boundaries. Frequent layer changes indicate structural instability."
    );
  }

  if (namingStability < 0.7) {
    recs.push(
      "Naming conventions appear inconsistent. Establish or reinforce a naming standard to improve clarity."
    );
  }

  if (boundaryStability < 0.7) {
    recs.push(
      "Dependency edges are shifting. Review module boundaries to prevent coupling and drift."
    );
  }

  if (trend === "critical") {
    recs.push(
      "Architecture is in a critical drift state. A dedicated architecture review or refactor cycle is recommended."
    );
  }

  if (recs.length === 0) {
    return "_No interventions recommended — architecture appears stable._";
  }

  return recs.map(r => `- ${r}`).join("\n");
}

export { generateArchitectureHealthReport };
