import { describe, expect, it } from "vitest";
import { emailSignInErrorMessage } from "./authErrorText";

describe("emailSignInErrorMessage", () => {
  it("hides raw Convex auth server errors behind a user-safe credential message", () => {
    const message = emailSignInErrorMessage(
      new Error("[CONVEX A(auth:signIn)] Server Error"),
      "Wrong email or password."
    );

    expect(message).toBe("Wrong email or password.");
  });

  it("keeps unrelated errors visible", () => {
    const message = emailSignInErrorMessage(
      new Error("Network request failed"),
      "Wrong email or password."
    );

    expect(message).toBe("Network request failed");
  });
});
