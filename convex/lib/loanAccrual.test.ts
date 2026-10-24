import { describe, expect, it } from "vitest";
import { accrual, type TermEvent } from "../../apps/numa/src/domain/loanTerms";
import { interestOwed, type AccrualEvent } from "./loanAccrual";

const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);

describe("interestOwed", () => {
  const terms = { principal: 19_670, startedAt: at(2026, 6, 1), interestRate: 8 };

  it("accrues the yearly rate over 12 for each completed month, and nothing for a part of a month", () => {
    expect(interestOwed(terms, [], at(2026, 6, 30))).toEqual({ accrued: 0, settled: 0, owed: 0 });
    expect(interestOwed(terms, [], at(2026, 7, 1))).toEqual({ accrued: 131.13, settled: 0, owed: 131.13 });
    expect(interestOwed(terms, [], at(2026, 10, 24))).toEqual({ accrued: 524.52, settled: 0, owed: 524.52 });
  });

  it("counts interest paid in cash and interest added to the principal as settled", () => {
    const events: AccrualEvent[] = [
      { kind: "repaid", amount: 100, principalPart: 70, interestPart: 30, feePart: 0, occurredAt: at(2026, 8, 5) },
      { kind: "capitalized", amount: 50, occurredAt: at(2026, 9, 5) },
    ];
    const r = interestOwed(terms, events, at(2026, 10, 24))!;
    expect(r.settled).toBe(80);
    expect(r.owed).toBe(Math.round((r.accrued - 80) * 100) / 100);
  });

  it("charges the next month on principal that grew by added interest", () => {
    // The month that starts on 1 Aug is charged on what was owed that day, including interest added on 2 Jul.
    const plain = interestOwed(terms, [], at(2026, 9, 1))!;
    const grown = interestOwed(terms, [{ kind: "capitalized", amount: 131.13, occurredAt: at(2026, 7, 2) }], at(2026, 9, 1))!;
    expect(grown.accrued).toBeGreaterThan(plain.accrued);
    expect(grown.owed).toBe(Math.round((grown.accrued - 131.13) * 100) / 100);
  });

  it("returns null for a start date that is a typing mistake", () => {
    expect(interestOwed({ ...terms, startedAt: at(1900, 1, 1) }, [], at(2026, 10, 24))).toBeNull();
  });
});

// The server's copy and the app's copy of the maths must agree, so the cap the server enforces is
// the one the app shows. A small seeded generator keeps the cases the same on every run.
describe("interestOwed agrees with the app's accrual", () => {
  function seeded(seed: number) {
    let s = seed;
    return () => { s = (s * 1_664_525 + 1_013_904_223) % 4_294_967_296; return s / 4_294_967_296; };
  }

  it("matches accrued, settled and owed over many generated histories", () => {
    const rand = seeded(94);
    const pick = (n: number) => Math.floor(rand() * n);
    for (let run = 0; run < 400; run += 1) {
      const principal = Math.round((100 + rand() * 90_000) * 100) / 100;
      const startedAt = at(2024, 1, 1) + pick(900) * 86_400_000;
      const interestRate = [0.5, 3, 7.5, 8, 12.25, 19.99][pick(6)];
      const now = startedAt + pick(1_100) * 86_400_000;
      const events: TermEvent[] = [];
      for (let i = 0, n = pick(6); i < n; i += 1) {
        const occurredAt = startedAt + pick(Math.max(1, Math.floor((now - startedAt) / 86_400_000))) * 86_400_000;
        const amount = Math.round((10 + rand() * 900) * 100) / 100;
        const kind = (["repaid", "repaid", "borrowed", "capitalized"] as const)[pick(4)];
        if (kind === "repaid" && pick(2) === 0) {
          const interestPart = Math.round(amount * rand() * 100) / 100;
          events.push({ kind, amount, principalPart: Math.round((amount - interestPart) * 100) / 100, interestPart, feePart: 0, unit: "EUR", occurredAt });
        } else {
          events.push({ kind, amount, principalPart: null, interestPart: null, feePart: null, unit: "EUR", occurredAt });
        }
      }
      const app = accrual({ principal, startedAt, interestRate, interestTerms: "simple", dueKind: null, dueDate: null }, events, 0, now);
      const server = interestOwed({ principal, startedAt, interestRate }, events, now);
      expect(app.status).toBe("ok");
      if (app.status !== "ok" || server === null) throw new Error("not ok");
      expect(server).toEqual({ accrued: app.accrued, settled: app.settled, owed: app.owed });
    }
  });
});
