import { describe, expect, it } from "vitest";
import {
  buildCloudAssetPatch,
  buildCloudCategoryPatch,
  buildCloudLiabilityPatch,
  buildCloudRecurringPatch,
  buildCloudTransactionPatch,
  requirePortfolioWriteTarget
} from "./domainPatches";

describe("cloud portfolio write target", () => {
  it("fails closed while a cloud account still points at a local placeholder", () => {
    expect(
      requirePortfolioWriteTarget({
        cloudEnabled: false,
        portfolioId: "pf_local",
        cloudPortfolioIds: new Set()
      })
    ).toBe(false);
    expect(
      requirePortfolioWriteTarget({
        cloudEnabled: true,
        portfolioId: "cloud-portfolio",
        cloudPortfolioIds: new Set(["cloud-portfolio"])
      })
    ).toBe(true);
    expect(() =>
      requirePortfolioWriteTarget({
        cloudEnabled: true,
        portfolioId: "pf_placeholder",
        cloudPortfolioIds: new Set()
      })
    ).toThrow(/still syncing/i);
  });
});

describe("buildCloudTransactionPatch", () => {
  it("uses null sentinels for fields the user clears", () => {
    expect(
      buildCloudTransactionPatch({
        categoryId: "",
        accountId: null,
        notes: "",
        location: null
      })
    ).toMatchObject({
      categoryId: null,
      accountId: null,
      notes: "",
      location: null
    });
  });

  it("leaves untouched fields undefined", () => {
    const patch = buildCloudTransactionPatch({ description: "Coffee" });
    expect(patch.description).toBe("Coffee");
    expect(patch.categoryId).toBeUndefined();
    expect(patch.accountId).toBeUndefined();
    expect(patch.notes).toBeUndefined();
    expect(patch.location).toBeUndefined();
  });
});

describe("buildCloudRecurringPatch", () => {
  it("uses null sentinels for cleared recurring optional fields", () => {
    expect(
      buildCloudRecurringPatch({
        categoryId: "",
        accountId: undefined,
        endAt: null,
        notes: ""
      })
    ).toMatchObject({
      categoryId: null,
      accountId: null,
      endAt: null,
      notes: ""
    });
  });

  it("preserves untouched recurring optional fields as undefined", () => {
    const patch = buildCloudRecurringPatch({ description: "Rent" });
    expect(patch.description).toBe("Rent");
    expect(patch.categoryId).toBeUndefined();
    expect(patch.accountId).toBeUndefined();
    expect(patch.endAt).toBeUndefined();
    expect(patch.notes).toBeUndefined();
  });
});

describe("buildCloudCategoryPatch", () => {
  it("uses null sentinels for cleared category decorations and budgets", () => {
    expect(buildCloudCategoryPatch({ emoji: "", monthlyLimit: undefined })).toMatchObject({
      emoji: null,
      monthlyLimit: null
    });
  });
});

describe("buildCloudAssetPatch", () => {
  it("uses a null sentinel for cleared asset notes", () => {
    expect(buildCloudAssetPatch({ notes: "" })).toMatchObject({ notes: "" });
    expect(buildCloudAssetPatch({ notes: undefined })).toMatchObject({ notes: null });
  });
});

describe("buildCloudLiabilityPatch", () => {
  it("uses null sentinels for cleared liability optional fields", () => {
    expect(
      buildCloudLiabilityPatch({
        interestRate: undefined,
        dueDate: null,
        notes: ""
      })
    ).toMatchObject({
      interestRate: null,
      dueDate: null,
      notes: ""
    });
  });
});
