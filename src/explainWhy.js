/**
 * Explain-Why Engine
 * Enriches rule results with "why this matters" and "how to fix it".
 */

function explainResults(results, config) {
  const explainEnabled = config.settings?.comments?.explain_why ?? true;
  if (!explainEnabled) return results;

  return results.map((r) => {
    const findings = r.metadata?.findings || [];
    if (findings.length === 0) return r;

    const explanations = findings.map((f) => explainFinding(f));

    const mergedMessages = [
      ...(r.messages || []),
      ...explanations.filter(Boolean),
    ];

    return {
      ...r,
      messages: mergedMessages,
    };
  });
}

function explainFinding(finding) {
  switch (finding.type) {
    case "boundary_violation":
      return [
        `Why this matters: This violates the intended architecture boundaries, increasing coupling and making the system harder to change safely.`,
        `How to fix: Move this dependency behind the appropriate layer (e.g., application/service layer) or introduce an interface/port so the higher layer does not depend directly on the lower one.`,
      ].join(" ");

    case "dependency_change":
      return [
        `Why this matters: New or removed dependencies can introduce hidden coupling, security risk, or performance changes.`,
        `How to fix: Confirm this dependency change is intentional, documented, and consistent with your architecture and dependency policies.`,
      ].join(" ");

    default:
      return null;
  }
}

export { explainResults };
