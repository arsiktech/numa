import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ query: vi.fn(), save: vi.fn(), auth: vi.fn() }));
vi.mock("convex/react", () => ({ useConvexAuth: mocks.auth, useQuery: mocks.query, useMutation: () => mocks.save }));
vi.mock("@/lib/errorReporting", () => ({ reportError: vi.fn() }));
import { AISharingControl } from "./AISharingControl";
import { AI_SHARING_DISCLOSURE, AI_SHARING_VERSION } from "../../../convex/lib/privacyPolicy";
const state = (userId = "user", allowed = false) => ({ userId, allowed, requiredVersion: AI_SHARING_VERSION, deletionPending: false, disclosure: AI_SHARING_DISCLOSURE });
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockReturnValue({ isAuthenticated: true }); mocks.query.mockReturnValue(state()); mocks.save.mockResolvedValue({ replayed: false }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("real Settings privacy controls", () => {
  it("never grants from rendering; sends the explicit actor/version only after agreement", async () => {
    render(<AISharingControl />);
    expect(mocks.save).not.toHaveBeenCalled(); expect(screen.getByRole("status")).toHaveTextContent("off");
    fireEvent.click(screen.getByRole("button", { name: "I agree to this AI data sharing" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledOnce());
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ expectedUserId: "user", allowed: true, version: AI_SHARING_VERSION });
    // No optimistic claim: permission changes only when subscription confirms it.
    expect(screen.getByRole("status")).toHaveTextContent("off");
  });
  it("reuses the receipt after a failed save and supports explicit withdrawal", async () => {
    mocks.save.mockRejectedValue(new Error("Synthetic network loss")); const view = render(<AISharingControl />);
    fireEvent.click(screen.getByRole("button", { name: "I agree to this AI data sharing" }));
    await screen.findByRole("alert"); const first = mocks.save.mock.calls[0][0];
    mocks.save.mockResolvedValue({}); fireEvent.click(screen.getByRole("button", { name: "I agree to this AI data sharing" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2)); expect(mocks.save.mock.calls[1][0]).toEqual(first);
    mocks.query.mockReturnValue(state("user", true)); view.rerender(<AISharingControl />);
    fireEvent.click(screen.getByRole("button", { name: "Withdraw AI sharing permission" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(3));
    expect(mocks.save.mock.calls[2][0]).toMatchObject({ expectedUserId: "user", allowed: false });
  });
  it("contains unavailable backend errors instead of losing the rest of Settings", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.query.mockImplementation(() => { throw new Error("privacy function unavailable"); });
    render(<><p>Other Settings controls</p><AISharingControl /></>);
    expect(screen.getByText("Other Settings controls")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Privacy controls are unavailable");
    expect(mocks.save).not.toHaveBeenCalled();
    mocks.query.mockReturnValue(state()); fireEvent.click(screen.getByRole("button", { name: "Retry privacy controls" }));
    expect(await screen.findByRole("status")).toHaveTextContent("off");
  });
  it("keyed account change abandons pending local state without applying consent to the new actor", async () => {
    let resolve: (value: unknown) => void = () => {}; mocks.save.mockImplementation(() => new Promise(done => { resolve = done; }));
    const view = render(<AISharingControl key="user" />);
    fireEvent.click(screen.getByRole("button", { name: "I agree to this AI data sharing" }));
    expect(mocks.save.mock.calls[0][0].expectedUserId).toBe("user");
    mocks.query.mockReturnValue(state("other")); view.rerender(<AISharingControl key="other" />);
    expect(screen.getByRole("button", { name: "I agree to this AI data sharing" })).toBeEnabled();
    resolve({}); await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("off"));
    expect(mocks.save).toHaveBeenCalledOnce();
  });
});
