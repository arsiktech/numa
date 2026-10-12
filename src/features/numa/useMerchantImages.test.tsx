import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useMerchantImages } from "./useMerchantImages";

vi.mock("convex/react", () => ({
  useQuery: () => []
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthToken: () => "token"
}));

vi.mock("@/lib/aiEnabled", () => ({
  AI_ENABLED: true
}));

vi.mock("@/services/cloudStore", () => ({
  useCloudState: () => ({ enabled: true })
}));

describe("merchant image lookup", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses cached artwork without sending merchant text to an AI endpoint in the background", async () => {
    const fetchSpy = vi.spyOn(window, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ key: "dining:cafe", url: "https://example.com/cafe.png" }), {
        status: 200
      })
    );

    renderHook(() => useMerchantImages([{ merchant: "Private Cafe", kind: "dining" }]));
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
