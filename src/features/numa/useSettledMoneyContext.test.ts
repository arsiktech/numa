import { describe, expect, it } from "vitest";
import { settledMoneyContextStatus } from "./useSettledMoneyContext";
import type { CloudState } from "@/services/cloudStore";

function cloud(patch: Partial<CloudState>): CloudState {
  return {
    enabled: true,
    loading: false,
    portfolios: [],
    byPortfolio: {},
    moneyPods: [],
    byPod: {},
    pendingInvites: [],
    bridge: () => false,
    ...patch
  };
}

describe("settled money context", () => {
  it("accepts local mode and a detail-hydrated cloud portfolio", () => {
    expect(settledMoneyContextStatus(cloud({ enabled: false }), "pf_local")).toEqual({
      ready: true,
      cloudBacked: false
    });
    expect(
      settledMoneyContextStatus(
        cloud({
          portfolios: [{ id: "cloud-id" } as CloudState["portfolios"][number]],
          byPortfolio: { "cloud-id": {} as never }
        }),
        "cloud-id"
      )
    ).toEqual({ ready: true, cloudBacked: true });
  });

  it("never treats a placeholder or empty cloud list as a writable settled context", () => {
    expect(settledMoneyContextStatus(cloud({ loading: true }), "pf_placeholder").ready).toBe(false);
    expect(settledMoneyContextStatus(cloud({ loading: false }), "pf_placeholder").ready).toBe(false);
  });

  it("waits for portfolio detail after the cloud portfolio list arrives", () => {
    expect(
      settledMoneyContextStatus(
        cloud({ portfolios: [{ id: "cloud-id" } as CloudState["portfolios"][number]] }),
        "cloud-id"
      ).ready
    ).toBe(false);
  });
});
