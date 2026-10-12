import { describe, expect, it } from "vitest";
import {
  assertPasswordPolicy,
  validatePasswordPolicy
} from "../../convex/lib/passwordPolicy";

describe("password policy", () => {
  it("accepts a non-common password with enough length and character variety", () => {
    const result = validatePasswordPolicy("River!42Market");
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("rejects short passwords", () => {
    const result = validatePasswordPolicy("A1!tiny");
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("minLength");
  });

  it("treats a missing password as invalid instead of throwing", () => {
    const result = validatePasswordPolicy(undefined);
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("minLength");
  });

  it("rejects common passwords even with substitutions", () => {
    const result = validatePasswordPolicy("P@ssw0rd123!");
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("commonPassword");
  });

  it("rejects weak common-word passwords with short numeric sequences", () => {
    const result = validatePasswordPolicy("Test1234!!!");
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("commonPassword");
    expect(result.issues.map((issue) => issue.code)).toContain("sequentialCharacters");
  });

  it("rejects obvious sequential passwords", () => {
    const result = validatePasswordPolicy("Abcdef!2026");
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("sequentialCharacters");
  });

  it("rejects passwords that include account identity", () => {
    const result = validatePasswordPolicy("Arseny!2026", {
      email: "owner@example.com",
      displayName: "Arseny"
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("personalInfo");
  });

  it("rejects passwords that include the email local part", () => {
    const result = validatePasswordPolicy("Sunny2121!Safe", {
      email: "sunny2121@example.com"
    });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("personalInfo");
  });

  it("defines decomposed-Unicode vectors shared with the native policy", () => {
    const decomposedRepeat = `Aa1${"e\u0301".repeat(5)}`;
    expect(validatePasswordPolicy(decomposedRepeat).ok).toBe(true);

    const personal = validatePasswordPolicy("Safe!42e\u0301ric", {
      email: "e\u0301ric@example.com"
    });
    expect(personal.issues.map((issue) => issue.code)).toContain("personalInfo");
  });

  it("uses email-only personal context during password reset", () => {
    expect(validatePasswordPolicy("Safe!42abco", { email: "a@b.co" }).ok).toBe(true);
  });

  it("throws from the auth-facing assertion for weak passwords", () => {
    expect(() => assertPasswordPolicy("password123")).toThrow(
      /common|easily guessed|length|uppercase/i
    );
  });
});
