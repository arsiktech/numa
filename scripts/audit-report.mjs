export function validateAuditReport(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("npm audit returned a malformed report.");
  }
  if (Object.prototype.hasOwnProperty.call(report, "error")) {
    const summary =
      typeof report.error === "object" && report.error !== null
        ? report.error.summary ?? report.error.code
        : report.error;
    throw new Error(`npm audit registry error: ${String(summary ?? "unknown error")}`);
  }
  if (
    !report.vulnerabilities ||
    typeof report.vulnerabilities !== "object" ||
    Array.isArray(report.vulnerabilities)
  ) {
    throw new Error("npm audit returned a malformed vulnerabilities map.");
  }
  if (
    !report.metadata ||
    typeof report.metadata !== "object" ||
    Array.isArray(report.metadata) ||
    !report.metadata.vulnerabilities ||
    typeof report.metadata.vulnerabilities !== "object" ||
    Array.isArray(report.metadata.vulnerabilities)
  ) {
    throw new Error("npm audit returned malformed vulnerability metadata.");
  }
  const severityKeys = ["info", "low", "moderate", "high", "critical", "total"];
  if (
    !severityKeys.every((key) => {
      const value = report.metadata.vulnerabilities[key];
      return typeof value === "number" && Number.isFinite(value) && value >= 0;
    })
  ) {
    throw new Error("npm audit returned malformed vulnerability counts.");
  }
  const severityTotal = ["info", "low", "moderate", "high", "critical"]
    .reduce((total, key) => total + report.metadata.vulnerabilities[key], 0);
  if (report.metadata.vulnerabilities.total !== severityTotal) {
    throw new Error("npm audit returned inconsistent vulnerability counts.");
  }
  if (
    report.metadata.vulnerabilities.total > 0 &&
    Object.keys(report.vulnerabilities).length === 0
  ) {
    throw new Error("npm audit returned counts without vulnerability records.");
  }
  return report.vulnerabilities;
}
