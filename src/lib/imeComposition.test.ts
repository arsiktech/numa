import { describe, expect, it } from "vitest";
import { isComposingKeydown } from "./imeComposition";

describe("isComposingKeydown", () => {
  it("lets a plain Enter through", () => {
    expect(isComposingKeydown({ isComposing: false, keyCode: 13 })).toBe(false);
  });

  it("holds a keydown fired while the IME is composing", () => {
    expect(isComposingKeydown({ isComposing: true, keyCode: 229 })).toBe(true);
  });

  it("holds Safari's confirming Enter, which arrives after compositionend", () => {
    expect(isComposingKeydown({ isComposing: false, keyCode: 229 })).toBe(true);
  });
});
