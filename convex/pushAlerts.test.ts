import { describe, expect, it } from "vitest";
import { dueAlerts, EXPO_TOKEN, isQuiet, limitAlerts, localClock, pickToSend, type Alert } from "./lib/pushAlerts";

const now = Date.UTC(2026, 9, 12, 20, 30); // 20:30 UTC = 22:30 in Madrid
const DAY = 86_400_000;

describe("localClock and quiet hours", () => {
  it("reads the person's own hour", () => {
    expect(localClock(now, "Europe/Madrid")).toMatchObject({ hour: 22, day: "2026-10-12" });
    expect(localClock(now, "America/New_York")).toMatchObject({ hour: 16 });
    expect(localClock(now, "Not/AZone")).toMatchObject({ hour: 20 });
  });
  it("is quiet from 22:00 to 8:00", () => {
    expect([21, 22, 3, 7, 8].map(isQuiet)).toEqual([false, true, true, true, false]);
  });
});

describe("alerts", () => {
  it("raises debts due within three days, with a link to the debt", () => {
    const a = dueAlerts([
      { id: "l1", name: "Visa", balance: 420, dueDate: now + 2 * DAY },
      { id: "l2", name: "Loan", balance: 900, dueDate: now + 10 * DAY },
      { id: "l3", name: "Paid", balance: 0, dueDate: now + DAY },
    ], now, "UTC");
    expect(a).toEqual([{ key: `due:l1:${now + 2 * DAY}`, title: "Visa is due 14 Oct", body: "Pay it on time to avoid fees.", url: "/item/liability/l1", rank: 0 }]);
  });

  it("raises limits at 80% and past 100%, in the limit's own currency only", () => {
    const cats = [{ id: "c1", name: "Dining", monthlyLimit: 100, currency: "EUR" }, { id: "c2", name: "Rent", monthlyLimit: 1000, currency: "EUR" }, { id: "c3", name: "Fun", monthlyLimit: 50, currency: "EUR" }];
    const spend = [{ categoryId: "c1", amount: 85, currency: "EUR" }, { categoryId: "c2", amount: 1200, currency: "EUR" }, { categoryId: "c3", amount: 500, currency: "USD" }];
    expect(limitAlerts(cats, spend, "2026-10").map((a) => a.title)).toEqual(["Dining is at 85% of its limit", "Rent is over its limit"]);
  });

  it("sends at most three a day, nothing twice, nothing in quiet hours", () => {
    const alerts: Alert[] = ["a", "b", "c", "d"].map((k, i) => ({ key: k, title: k, body: "", url: "/", rank: i }));
    expect(pickToSend(alerts, new Set(["a"]), 1, 12).map((a) => a.key)).toEqual(["b", "c"]);
    expect(pickToSend(alerts, new Set(), 3, 12)).toEqual([]);
    expect(pickToSend(alerts, new Set(), 0, 23)).toEqual([]);
  });

  it("accepts only Expo push tokens", () => {
    expect(EXPO_TOKEN.test("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
    expect(EXPO_TOKEN.test("https://evil.example/push")).toBe(false);
  });
});
