import { describe, expect, it } from "vitest";
import {
  acquireChatSendLock,
  captureChatSendIdentity,
  resetChatSendLock
} from "./chatSendGuard";

describe("chat send lock", () => {
  it("rejects a second submit while the first is awaiting cloud settlement", () => {
    const lock = { current: null as symbol | null };
    const release = acquireChatSendLock(lock);

    expect(release).toBeTypeOf("function");
    expect(acquireChatSendLock(lock)).toBeNull();

    release?.();
    expect(acquireChatSendLock(lock)).toBeTypeOf("function");
  });

  it("does not let an old release unlock a new identity's send", () => {
    const lock = { current: null as symbol | null };
    const releaseOld = acquireChatSendLock(lock)!;
    resetChatSendLock(lock);
    const releaseNew = acquireChatSendLock(lock)!;

    expect(releaseOld()).toBe(false);
    expect(acquireChatSendLock(lock)).toBeNull();
    expect(releaseNew()).toBe(true);
  });

  it("rejects a delayed continuation after an account identity switch", async () => {
    const identity = { current: "account-a:portfolio-1" };
    const stillCurrent = captureChatSendIdentity(identity);
    await Promise.resolve();
    identity.current = "account-b:portfolio-1";

    expect(stillCurrent()).toBe(false);
  });

  it("rejects a delayed continuation after a day-thread switch", async () => {
    const identity = { current: "account-a:portfolio-1:2026-08-23" };
    const stillCurrent = captureChatSendIdentity(identity);
    await Promise.resolve();
    identity.current = "account-a:portfolio-1:2026-08-22";

    expect(stillCurrent()).toBe(false);
  });

  it("rejects a delayed draft confirmation after its account thread changes", async () => {
    const identity = { current: "account-a:portfolio-1:2026-08-23" };
    const confirmationIsCurrent = captureChatSendIdentity(identity);
    await Promise.resolve();
    identity.current = "account-b:portfolio-1:2026-08-23";

    expect(confirmationIsCurrent()).toBe(false);
  });
});
