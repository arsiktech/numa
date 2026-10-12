import { describe, expect, it } from "vitest";
import { splitPodRailName } from "./podRailName";

describe("splitPodRailName", () => {
  it("keeps short pot names intact", () => {
    expect(splitPodRailName("Home")).toEqual({ context: null, label: "Home" });
  });

  it("uses a safe fallback for blank names", () => {
    expect(splitPodRailName("   ")).toEqual({ context: null, label: "Shared pot" });
  });

  it("separates long context from the working pot label", () => {
    expect(splitPodRailName("ДОМ НА ХОЛМЕ ДОМАШНИЙ БЮДЖЕТ")).toEqual({
      context: "ДОМ НА ХОЛМЕ",
      label: "ДОМАШНИЙ БЮДЖЕТ"
    });
  });
});
