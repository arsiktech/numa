import { describe, expect, it } from "vitest";
import { lockDocumentScroll } from "./useBodyScrollLock";

describe("lockDocumentScroll", () => {
  it("locks and restores document scrolling", () => {
    document.documentElement.style.overflow = "clip";
    document.body.style.overflow = "auto";

    const restore = lockDocumentScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    restore();
    expect(document.documentElement.style.overflow).toBe("clip");
    expect(document.body.style.overflow).toBe("auto");
  });

  it("keeps scrolling locked until every nested lock is released", () => {
    document.documentElement.style.overflow = "";
    document.body.style.overflow = "";

    const restoreWelcome = lockDocumentScroll();
    const restoreOnboarding = lockDocumentScroll();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    restoreWelcome();
    expect(document.documentElement.style.overflow).toBe("hidden");
    expect(document.body.style.overflow).toBe("hidden");

    restoreOnboarding();
    expect(document.documentElement.style.overflow).toBe("");
    expect(document.body.style.overflow).toBe("");
  });
});
