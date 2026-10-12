import { describe, expect, it } from "vitest";
import { validateAuditReport } from "./audit-report.mjs";

describe("release audit report validation", () => {
  it("rejects registry and malformed responses instead of treating them as clean", () => {
    expect(() => validateAuditReport({ error: { code: "ENETUNREACH", summary: "offline" } }))
      .toThrow(/offline|registry|audit/i);
    for (const error of ["", 0, false, null]) {
      expect(() => validateAuditReport({
        error,
        vulnerabilities: {},
        metadata: {
          vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 }
        }
      })).toThrow(/registry|audit/i);
    }
    expect(() => validateAuditReport({ metadata: {} })).toThrow(/malformed|vulnerabilities/i);
    for (const vulnerabilities of [[], "clean", { total: "0" }]) {
      expect(() => validateAuditReport({
        vulnerabilities: {},
        metadata: { vulnerabilities }
      })).toThrow(/malformed/i);
    }
    expect(() => validateAuditReport({
      vulnerabilities: {},
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: -1 }
      }
    })).toThrow(/malformed/i);
    expect(() => validateAuditReport({
      vulnerabilities: {},
      metadata: {
        vulnerabilities: { info: 0, low: 0, moderate: 1, high: 0, critical: 0, total: 1 }
      }
    })).toThrow(/counts|records|inconsistent/i);
  });

  it("accepts a complete clean npm audit report", () => {
    expect(validateAuditReport({
      auditReportVersion: 2,
      vulnerabilities: {},
      metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } }
    })).toEqual({});
  });
});
