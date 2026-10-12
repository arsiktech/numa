import { describe, expect, it } from "vitest";
import {
  isAsyncRequestScopeCurrent,
  type AsyncRequestScope
} from "./asyncRequestScope";

describe("async request scope", () => {
  it("rejects a delayed result after close or account and portfolio replacement", async () => {
    const expected: AsyncRequestScope = {
      accountId: "account-a",
      portfolioId: "portfolio-a",
      requestId: 1,
      open: true
    };
    let current = expected;
    let resolve!: (value: string) => void;
    const delayed = new Promise<string>((next) => { resolve = next; });
    let committed: string | undefined;
    const task = delayed.then((value) => {
      if (isAsyncRequestScopeCurrent(current, expected)) committed = value;
    });

    current = {
      accountId: "account-b",
      portfolioId: "portfolio-b",
      requestId: 2,
      open: false
    };
    resolve("old receipt");
    await task;

    expect(committed).toBeUndefined();
  });
});
