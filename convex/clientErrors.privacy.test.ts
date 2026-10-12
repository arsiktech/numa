import { describe, expect, it } from "vitest";
import { report } from "./clientErrors";
import { privateDiagnostic } from "./lib/diagnosticPrivacy";
import { privacyFixture } from "../src/test/privacyFixture";

describe("categorical diagnostic boundary", () => {
  it("retains only approved classes/routes/versions, never query, path identifiers, message, host or credentials", () => {
    expect(privateDiagnostic({ source: "route", message: "TypeError: private@example.com balance=400", url: "https://private:secret@numa.invalid/settings?token=secret#private", release: "0.11.2" })).toEqual({
      source: "route", message: "TypeError", url: "/settings", release: "0.11.2", fingerprint: "private-v1:route:TypeError:/settings:0.11.2",
    });
    const result = privateDiagnostic({ source: "secret", message: "secret", url: "/pod/secret", release: "secret" });
    expect(result).toMatchObject({ source: "manual", message: "ApplicationError", url: "/other", release: "unknown" });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(privateDiagnostic({ source: "window", message: "TypeErrorSecret", url: "/%73ecret" })).toMatchObject({ message: "ApplicationError", url: "/other" });
  });
  it("actual public handler discards caller fingerprint, identity, raw text, stack and user agent and safely dedupes", async () => {
    const f = privacyFixture();
    const args = { source: "window", message: "TypeError: SECRET-finance", fingerprint: "SECRET-fingerprint", stack: "SECRET-stack", userAgent: "SECRET-device", url: "/settings?email=SECRET", release: "0.11.2" };
    await f.call(report, args); await f.call(report, { ...args, message: "TypeError: ANOTHER-private-value" });
    expect(f.all("clientErrors")).toHaveLength(1);
    expect(f.all("clientErrors")[0]).toMatchObject({ count: 2, message: "TypeError", url: "/settings" });
    for (const key of ["userId", "stack", "userAgent"]) expect(f.all("clientErrors")[0][key]).toBeUndefined();
    expect(JSON.stringify(f.all("clientErrors"))).not.toMatch(/SECRET|ANOTHER/);
  });
});
