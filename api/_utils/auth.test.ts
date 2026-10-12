import { describe, expect, it } from "vitest";
import { requestDeploymentMatchesConfigured } from "./auth";

describe("native API deployment identity", () => {
  it("accepts the configured Convex origin and rejects a different deployment", () => {
    expect(requestDeploymentMatchesConfigured(
      "https://fine-quail-653.convex.cloud",
      "https://fine-quail-653.convex.cloud"
    )).toBe(true);
    expect(requestDeploymentMatchesConfigured(
      "https://rosy-mink-170.eu-west-1.convex.cloud",
      "https://fine-quail-653.convex.cloud"
    )).toBe(false);
  });

  it("normalizes trailing slashes but fails closed on malformed origins", () => {
    expect(requestDeploymentMatchesConfigured(
      "https://fine-quail-653.convex.cloud/",
      "https://fine-quail-653.convex.cloud"
    )).toBe(true);
    expect(requestDeploymentMatchesConfigured("not-a-url", "not-a-url")).toBe(false);
  });
});
