import { describe, expect, it } from "vitest";
import { walletFreeTextLooksSecret } from "../../convex/lib/walletInputSafety";

describe("wallet free-text safety", () => {
  it("rejects recovery phrases and private keys in any wallet field", () => {
    expect(walletFreeTextLooksSecret("abandon ".repeat(12).trim())).toBe(true);
    expect(walletFreeTextLooksSecret(`Backup ${"f".repeat(64)}`)).toBe(true);
    expect(walletFreeTextLooksSecret("Main watch-only wallet")).toBe(false);
  });
});
