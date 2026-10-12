import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RecurringRevenueCard } from "./RecurringRevenueCard";
import type { RecurringTransaction } from "@/lib/types";

const NOW = Date.parse("2026-10-01T00:00:00Z");
const rule = (patch: Partial<RecurringTransaction>): RecurringTransaction => ({
  id: "r", portfolioId: "p", description: "Rule", kind: "income", amount: 100, currency: "USD",
  cadence: "monthly", startAt: NOW - 1, nextRunAt: NOW + 1, active: true, createdAt: 0, ...patch
});
const rules = [
  rule({ id: "a", description: "Acme plan", amount: 500, revenueType: "subscription", incomeSource: "Acme" }),
  rule({ id: "b", description: "Beta retainer", amount: 1200, cadence: "quarterly", revenueType: "retainer", incomeSource: "Beta" }),
  rule({ id: "c", description: "Consulting", amount: 300 })
];
afterEach(cleanup);

it("shows contracted MRR, ARR and the formula for a business space", () => {
  render(<RecurringRevenueCard recurring={rules} currency="USD" rates={{ EUR: 1 }} isBusiness now={NOW} />);
  expect(screen.getByText("MRR").nextSibling?.textContent).toBe("$900");
  expect(screen.getByText("ARR").nextSibling?.textContent).toBe("$10,800");
  expect(screen.getByText(/ARR is MRR × 12/)).toBeTruthy();
  expect(screen.getByText("MRR by client")).toBeTruthy();
  expect(screen.getByText(/\$1,200 a month scheduled/)).toBeTruthy();
});

it("never shows an ARR card in a personal space", () => {
  render(<RecurringRevenueCard recurring={rules} currency="USD" rates={{ EUR: 1 }} isBusiness={false} now={NOW} />);
  expect(screen.queryByText("ARR")).toBeNull();
  expect(screen.getByText("Recurring income")).toBeTruthy();
});

it("renders nothing without recurring income", () => {
  const { container } = render(
    <RecurringRevenueCard recurring={[rule({ kind: "expense" })]} currency="USD" rates={{ EUR: 1 }} isBusiness now={NOW} />
  );
  expect(container.textContent).toBe("");
});
