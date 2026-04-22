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

    case "file_moved":
      return [
        `Why this matters: Moving files across layers or modules can shift architectural boundaries and introduce drift.`,
        `How to fix: Ensure the new location aligns with your domain/application/infrastructure layering strategy.`,
      ].join(" ");

    case "file_added":
      return [
        `Why this matters: Adding new files expands the system surface area and may introduce new responsibilities or boundaries.`,
        `How to fix: Verify the new file belongs to the correct layer and follows naming and structural conventions.`,
      ].join(" ");

    case "file_removed":
      return [
        `Why this matters: Removing files can break dependencies or eliminate required architectural components.`,
        `How to fix: Confirm the removal is intentional and that no modules still depend on this file.`,
      ].join(" ");

    case "naming_violation":
      return [
        `Why this matters: Inconsistent naming reduces readability and weakens architectural clarity.`,
        `How to fix: Rename the file/class/variable to match the enforced naming convention.`,
      ].join(" ");

    case "convention_violation":
      return [
        `Why this matters: Deviating from established conventions erodes codebase consistency and increases cognitive overhead for reviewers.`,
        `How to fix: Update the code to comply with the rule-defined convention documented in your Gatekeeper configuration.`,
      ].join(" ");

    default:
      return null;
  }
}

export { explainResults };
