import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  cleanProfilePatch,
  clearPendingProfileKeys,
  clearPendingProfileStash,
  mergePendingProfilePatch,
  readPendingProfilePatch,
  usePushProfile
} from "./profileSync";

const { updateProfileMock, authState } = vi.hoisted(() => ({
  updateProfileMock: vi.fn<(patch: Record<string, unknown>) => Promise<unknown>>(),
  authState: { currentAccount: null as { id: string } | null }
}));

vi.mock("convex/react", () => ({
  useMutation: () => updateProfileMock
}));

vi.mock("@/services/auth", () => ({
  useAuth: () => ({ currentAccount: authState.currentAccount })
}));

const PENDING_KEY = "numa:profile:pending";
const ACCOUNT_A = "user-a";
const ACCOUNT_B = "user-b";

beforeEach(() => {
  window.localStorage.clear();
  authState.currentAccount = null;
  updateProfileMock.mockReset();
  updateProfileMock.mockResolvedValue(undefined);
});
afterEach(() => window.localStorage.clear());

describe("cleanProfilePatch", () => {
  it("drops undefined fields and keeps set ones", () => {
    expect(cleanProfilePatch({ locale: "ru", appMode: undefined })).toEqual({ locale: "ru" });
    expect(cleanProfilePatch({})).toEqual({});
  });

  it("keeps a falsy-but-defined value", () => {
    expect(cleanProfilePatch({ onboardingCompletedAt: 0 })).toEqual({ onboardingCompletedAt: 0 });
  });
});

describe("pending profile patch stash", () => {
  it("starts empty and round-trips a merge for the owning account", () => {
    expect(readPendingProfilePatch(ACCOUNT_A)).toEqual({});
    mergePendingProfilePatch(ACCOUNT_A, { locale: "es" });
    expect(readPendingProfilePatch(ACCOUNT_A)).toEqual({ locale: "es" });
  });

  it("lets later fields win on merge", () => {
    mergePendingProfilePatch(ACCOUNT_A, { locale: "ru", appMode: "light" });
    mergePendingProfilePatch(ACCOUNT_A, { locale: "en" });
    expect(readPendingProfilePatch(ACCOUNT_A)).toEqual({ locale: "en", appMode: "light" });
  });

  it("clears only the named keys and removes the entry when empty", () => {
    mergePendingProfilePatch(ACCOUNT_A, { locale: "ru", appMode: "advanced" });
    clearPendingProfileKeys(ACCOUNT_A, ["locale"]);
    expect(readPendingProfilePatch(ACCOUNT_A)).toEqual({ appMode: "advanced" });
    clearPendingProfileKeys(ACCOUNT_A, ["appMode"]);
    expect(readPendingProfilePatch(ACCOUNT_A)).toEqual({});
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("tolerates corrupt storage", () => {
    window.localStorage.setItem(PENDING_KEY, "{not json");
    expect(readPendingProfilePatch(ACCOUNT_A)).toEqual({});
  });

  it("never hands account A's stash to account B and discards the mismatch", () => {
    mergePendingProfilePatch(ACCOUNT_A, { locale: "ru", onboardingCompletedAt: 123 });
    expect(readPendingProfilePatch(ACCOUNT_B)).toEqual({});
    // Discarded outright — gone for A too, not just hidden from B.
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(readPendingProfilePatch(ACCOUNT_A)).toEqual({});
  });

  it("discards a legacy un-scoped stash instead of replaying it", () => {
    window.localStorage.setItem(PENDING_KEY, JSON.stringify({ locale: "ru" }));
    expect(readPendingProfilePatch(ACCOUNT_A)).toEqual({});
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it("lets a merge for a new account replace another account's stash", () => {
    mergePendingProfilePatch(ACCOUNT_A, { locale: "ru" });
    mergePendingProfilePatch(ACCOUNT_B, { appMode: "light" });
    expect(readPendingProfilePatch(ACCOUNT_B)).toEqual({ appMode: "light" });
  });

  it("clearPendingProfileStash drops the stash entirely (signOut/deleteAccount path)", () => {
    mergePendingProfilePatch(ACCOUNT_A, { locale: "ru" });
    clearPendingProfileStash();
    expect(window.localStorage.getItem(PENDING_KEY)).toBeNull();
    expect(readPendingProfilePatch(ACCOUNT_A)).toEqual({});
  });
});

describe("usePushProfile retry flush", () => {
  it("does not flush account A's stash while account B is signed in, and discards it", async () => {
    mergePendingProfilePatch(ACCOUNT_A, { locale: "ru", onboardingCompletedAt: 123 });
    authState.currentAccount = { id: ACCOUNT_B };
    renderHook(() => usePushProfile());
    await waitFor(() => expect(window.localStorage.getItem(PENDING_KEY)).toBeNull());
    expect(updateProfileMock).not.toHaveBeenCalled();
  });

  it("flushes the stash when it belongs to the signed-in account", async () => {
    mergePendingProfilePatch(ACCOUNT_A, { locale: "ru" });
    authState.currentAccount = { id: ACCOUNT_A };
    renderHook(() => usePushProfile());
    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledWith({ locale: "ru" }));
    await waitFor(() => expect(window.localStorage.getItem(PENDING_KEY)).toBeNull());
  });

  it("leaves the stash alone while signed out or the cloud account is still resolving", () => {
    mergePendingProfilePatch(ACCOUNT_A, { locale: "ru" });
    authState.currentAccount = null;
    const { rerender } = renderHook(() => usePushProfile());
    expect(updateProfileMock).not.toHaveBeenCalled();
    authState.currentAccount = { id: "cloud-loading" };
    rerender();
    expect(updateProfileMock).not.toHaveBeenCalled();
    expect(readPendingProfilePatch(ACCOUNT_A)).toEqual({ locale: "ru" });
  });

  it("re-evaluates when the account id changes (flush depends on the active account)", async () => {
    mergePendingProfilePatch(ACCOUNT_A, { locale: "ru" });
    authState.currentAccount = { id: "cloud-loading" };
    const { rerender } = renderHook(() => usePushProfile());
    expect(updateProfileMock).not.toHaveBeenCalled();
    authState.currentAccount = { id: ACCOUNT_A };
    rerender();
    await waitFor(() => expect(updateProfileMock).toHaveBeenCalledWith({ locale: "ru" }));
  });
});
