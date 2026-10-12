import { describe, expect, it } from "vitest";
import { en } from "./locales/en";

describe("locale dictionaries", () => {
  it("ru and es cover exactly the English key set", async () => {
    const [ru, es] = await Promise.all([import("./locales/ru"), import("./locales/es")]);
    const enKeys = Object.keys(en).sort();
    expect(Object.keys(ru.default).sort()).toEqual(enKeys);
    expect(Object.keys(es.default).sort()).toEqual(enKeys);
  });

  it("has no empty translations", async () => {
    const [ru, es] = await Promise.all([import("./locales/ru"), import("./locales/es")]);
    for (const dict of [en, ru.default, es.default]) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value, `empty translation for ${key}`).not.toBe("");
      }
    }
  });
});
