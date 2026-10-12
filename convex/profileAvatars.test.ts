// @vitest-environment node
import { describe, expect, it } from "vitest";
import { avatarDataURL, AVATAR_MAX_BYTES, normalizeAvatarPNG } from "./lib/avatarImage";
import { setImage } from "./profileAvatars";
import { clearAvatar, generateAvatarUploadUrl, me, setAvatar } from "./profiles";
import { deleteMyAccount } from "./users";
import { privacyFixture } from "../src/test/privacyFixture";
import { avatarPNG } from "../src/test/avatarFixture";

function fixture() {
  const f = privacyFixture();
  f.seed("profiles", "profile", { userId: "user", displayName: "Synthetic", avatarStorageId: "foreign-storage" });
  f.seed("users", "other", { email: "other@example.com" });
  f.seed("profiles", "other-profile", { userId: "other", displayName: "Other synthetic", avatarStorageId: "foreign-storage" });
  return f;
}
const request = (overrides: object = {}) => ({ expectedUserId: "user", image: avatarPNG(), clientMutationId: "photo-1", ...overrides });

describe("bounded metadata-free avatar container", () => {
  it("round-trips valid thumbnail pixels and strips text/EXIF metadata server-side", () => {
    const pure = avatarPNG();
    expect(normalizeAvatarPNG(pure)).toEqual(pure);
    for (const name of ["tEXt", "eXIf", "iCCP", "zzZZ"]) {
      const input = avatarPNG({ metadata: [name, new TextEncoder().encode("SECRET-location-and-name")] });
      expect(normalizeAvatarPNG(input)).toEqual(pure);
      expect(avatarDataURL(normalizeAvatarPNG(input))).toBe(avatarDataURL(pure));
    }
  });
  it("rejects excessive sizes/dimensions, malformed containers, animation and invalid checksums", () => {
    for (const input of [new ArrayBuffer(AVATAR_MAX_BYTES + 1), avatarPNG({ width: 257 }), avatarPNG({ height: 0 }), avatarPNG({ colorType: 3 }), avatarPNG({ metadata: ["acTL", new Uint8Array(8)] })]) {
      expect(() => normalizeAvatarPNG(input)).toThrow();
    }
    const badCRC = new Uint8Array(avatarPNG()); badCRC[32] ^= 1;
    expect(() => normalizeAvatarPNG(badCRC.buffer)).toThrow();
    const trailing = new Uint8Array(new Uint8Array(avatarPNG()).length + 1); trailing.set(new Uint8Array(avatarPNG()));
    expect(() => normalizeAvatarPNG(trailing.buffer)).toThrow();
    expect(() => normalizeAvatarPNG(avatarPNG().slice(0, -1))).toThrow();
  });
});

describe("actual actor-bound avatar handlers", () => {
  it("atomically owns one thumbnail, replays receipts, and does not delete a legacy foreign file", async () => {
    const f = fixture(); const args = request();
    const saved = await f.call(setImage, args);
    expect(await f.call(setImage, args)).toMatchObject({ id: saved.id, replayed: true });
    expect(f.all("profileAvatars")).toHaveLength(1);
    expect(f.all("profileAvatars")[0]).toMatchObject({ userId: "user", image: args.image });
    expect(f.rows.get("profile").avatarStorageId).toBeUndefined();
    expect(f.rows.get("other-profile").avatarStorageId).toBe("foreign-storage");
    expect(f.deletedStorage).toEqual([]);
    expect((await f.call(me)).avatarUrl).toBe(avatarDataURL(args.image));
    expect(f.all("mutationReceipts")[0].scopeId).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(f.all("mutationReceipts"))).not.toContain("data:image");
    await f.call(setImage, request({ image: avatarPNG({ pixel: 1 }), clientMutationId: "photo-2" }));
    expect(f.all("profileAvatars")).toHaveLength(1);
    await expect(f.call(setImage, request({ image: avatarPNG({ pixel: 2 }) }))).rejects.toThrow(/different mutation/);
  });
  it("denies account-switched/deleting/deleted actors and both old raw-storage APIs", async () => {
    const f = fixture(); f.signIn("other");
    await expect(f.call(setImage, request())).rejects.toThrow(/current account/);
    await expect(f.call(clearAvatar, { expectedUserId: "user", clientMutationId: "clear" })).rejects.toThrow(/current account/);
    f.signIn("user");
    await expect(f.call(generateAvatarUploadUrl)).rejects.toThrow(/secure profile-photo/);
    await expect(f.call(setAvatar, { storageId: "foreign-storage" })).rejects.toThrow(/secure profile-photo/);
    f.rows.get("profile").deletionStartedAt = Date.now();
    await expect(f.call(setImage, request())).rejects.toThrow(/deletion has started/);
    f.rows.delete("user"); await expect(f.call(setImage, request())).rejects.toThrow(/Account no longer exists/);
    expect(f.all("profileAvatars")).toHaveLength(0); expect(f.deletedStorage).toEqual([]);
  });
  it("clear/account deletion removes owned bytes; old replay never restores or clears a newer photo", async () => {
    const f = fixture(); const args = request();
    await f.call(setImage, args);
    const clear = { expectedUserId: "user", clientMutationId: "clear-1" };
    await f.call(clearAvatar, clear); expect(f.all("profileAvatars")).toHaveLength(0);
    await f.call(setImage, args); expect(f.all("profileAvatars")).toHaveLength(0);
    await f.call(setImage, request({ clientMutationId: "new-photo" }));
    await f.call(clearAvatar, clear); expect(f.all("profileAvatars")).toHaveLength(1);
    f.seed("profileAvatars", "other-photo", { userId: "other", image: avatarPNG() });
    await f.call(deleteMyAccount);
    expect(f.all("profileAvatars").map(row => row._id)).toEqual(["other-photo"]);
    expect(f.rows.has("other-profile")).toBe(true); expect(f.rows.has("user")).toBe(false);
    expect(f.deletedStorage).toEqual([]);
  });
});
