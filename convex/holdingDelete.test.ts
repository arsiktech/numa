// @vitest-environment node
import { describe, expect, it } from "vitest";
import { remove } from "./holdings";
import { deleteHolding } from "./mobile";
import { privacyFixture } from "../src/test/privacyFixture";

function fixture() {
  const f = privacyFixture();
  f.seed("portfolios", "space", { name: "Synthetic", ownerId: "user", defaultCurrency: "EUR", type: "personal" });
  f.seed("memberships", "mine", { portfolioId: "space", userId: "user", role: "owner" });
  for (const holding of ["gone", "kept"]) {
    f.seed("holdings", holding, { portfolioId: "space", symbol: holding.toUpperCase(), quantity: 2, currency: "EUR" });
    for (const kind of ["buy", "sell"]) {
      f.seed("holdingEvents", `${holding}-${kind}`, { portfolioId: "space", holdingId: holding, symbol: holding.toUpperCase(),
        kind, quantity: 1, unitPrice: 10, total: 10, currency: "EUR", occurredAt: 1800000000000 });
    }
  }
  return f;
}
const events = (f: ReturnType<typeof fixture>) => f.all("holdingEvents").map(e => e._id).sort();

describe("deleting a holding deletes its buy and sell history", () => {
  it("web path: removes only the deleted holding's events, and a retry with the same id succeeds", async () => {
    const f = fixture();
    expect(await f.call(remove, { id: "gone", clientMutationId: "delete-gone" })).toMatchObject({ id: "gone", replayed: false });
    expect(f.rows.has("gone")).toBe(false);
    expect(events(f)).toEqual(["kept-buy", "kept-sell"]);
    expect(f.rows.has("kept")).toBe(true);
    await expect(f.call(remove, { id: "gone", clientMutationId: "delete-gone" })).resolves.toBeUndefined();
    expect(events(f)).toEqual(["kept-buy", "kept-sell"]);
  });
  it("mobile path: removes only the deleted holding's events and replays a retried receipt", async () => {
    const f = fixture();
    expect(await f.call(deleteHolding, { id: "gone", clientMutationId: "delete-gone" })).toMatchObject({ id: "gone", replayed: false });
    expect(f.rows.has("gone")).toBe(false);
    expect(events(f)).toEqual(["kept-buy", "kept-sell"]);
    // Unchanged by the cascade: the mobile path looks the holding up before the receipt, so a
    // retry after the row is gone answers NOT_FOUND, as deleteAsset and deleteLiability do.
    await expect(f.call(deleteHolding, { id: "gone", clientMutationId: "delete-gone" })).rejects.toThrow(/Holding not found/);
    // A retry that reaches the receipt (the holding row still readable, as when the first
    // response was lost before the client saw it) replays without deleting anything else.
    f.seed("holdings", "gone", { portfolioId: "space", symbol: "GONE", quantity: 2, currency: "EUR" });
    expect(await f.call(deleteHolding, { id: "gone", clientMutationId: "delete-gone" })).toMatchObject({ id: "gone", replayed: true });
    expect(events(f)).toEqual(["kept-buy", "kept-sell"]);
  });
  it("mobile path: a viewer cannot delete a holding or its history", async () => {
    const f = fixture();
    f.rows.get("mine").role = "viewer";
    await expect(f.call(deleteHolding, { id: "gone", clientMutationId: "viewer-delete" })).rejects.toThrow();
    await expect(f.call(remove, { id: "gone", clientMutationId: "viewer-delete-web" })).rejects.toThrow();
    expect(events(f)).toEqual(["gone-buy", "gone-sell", "kept-buy", "kept-sell"]);
  });
});
