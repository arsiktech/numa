import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ save: vi.fn(), clear: vi.fn(), prepare: vi.fn() }));
vi.mock("convex/react", async () => {
  const { getFunctionName } = await vi.importActual<typeof import("convex/server")>("convex/server");
  return { useMutation: (reference: any) => getFunctionName(reference) === "profileAvatars:setImage" ? mocks.save : mocks.clear };
});
vi.mock("@/lib/avatarUpload", () => ({ prepareAvatar: mocks.prepare }));
vi.mock("@/lib/i18n", () => ({ useLocale: () => ({ t: (key: string) => key }) }));
import { AvatarControls } from "./AvatarControls";
const image = new Uint8Array([1, 2, 3]).buffer;
const select = () => fireEvent.change(screen.getByLabelText("Choose profile photo"), { target: { files: [new File(["synthetic"], "synthetic.png", { type: "image/png" })] } });
beforeEach(() => { vi.clearAllMocks(); mocks.prepare.mockResolvedValue(image); mocks.save.mockResolvedValue({}); mocks.clear.mockResolvedValue({}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("real avatar Settings controls", () => {
  it("sends only prepared bytes with the captured actor and preserves failed intent for safe retry", async () => {
    mocks.save.mockRejectedValueOnce(new Error("Synthetic response lost"));
    render(<AvatarControls key="user" userId={"user" as never} hasAvatar={false} />);
    select(); await screen.findByRole("alert");
    expect(mocks.save.mock.calls[0][0]).toMatchObject({ expectedUserId: "user", image });
    const original = mocks.save.mock.calls[0][0];
    fireEvent.click(screen.getByRole("button", { name: "Retry photo change" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][0]).toEqual(original); expect(mocks.prepare).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
  it("does not send a photo when the account changes during local decoding", async () => {
    let resolve: (bytes: ArrayBuffer) => void = () => {};
    mocks.prepare.mockImplementation(() => new Promise(done => { resolve = done; }));
    const view = render(<AvatarControls key="user" userId={"user" as never} hasAvatar={false} />);
    select(); const signal = mocks.prepare.mock.calls[0][1] as AbortSignal;
    view.rerender(<AvatarControls key="other" userId={"other" as never} hasAvatar={false} />);
    expect(signal.aborted).toBe(true); resolve(image);
    await waitFor(() => expect(screen.getByRole("button", { name: "settings.changePhoto" })).toBeEnabled());
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("binds removal to its actor, never a raw file ID, and does not optimistically replace photo state", async () => {
    render(<AvatarControls key="user" userId={"user" as never} hasAvatar />);
    fireEvent.click(screen.getByRole("button", { name: "settings.removePhoto" }));
    await waitFor(() => expect(mocks.clear).toHaveBeenCalledOnce());
    expect(mocks.clear.mock.calls[0][0]).toMatchObject({ expectedUserId: "user", clientMutationId: expect.stringMatching(/^avatar-/) });
    expect(mocks.clear.mock.calls[0][0]).not.toHaveProperty("storageId");
    expect(screen.getByRole("button", { name: "settings.removePhoto" })).toBeInTheDocument();
  });
});
