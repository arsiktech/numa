import { describe, expect, it } from "vitest";
import { accrual, interestAddable as appAddable, interestAddProblem as appAddProblem, type TermEvent } from "../../apps/numa/src/domain/loanTerms";
import { interestAddProblem, interestOwed, monthInterest, type AccrualEvent } from "./loanAccrual";

const supportedTerms = { principal: 1_000, startedAt: Date.UTC(2026, 0, 1), interestRate: 12, unit: "EUR" };
const appTerms = { ...supportedTerms, dueKind: null, dueDate: null, interestTerms: "simple" as const };
const cutoff = Date.UTC(2026, 3, 2);

describe("unsupported legacy history units", () => {
  it.each(["borrowed", "repaid", "capitalized"] as const)("refuses %s in another currency, a coin, or an unknown unit in both engines", (kind) => {
    for (const unit of ["USD", "BTC", null, undefined]) {
      const history: TermEvent[] = [{ kind, amount: 100, principalPart: null, interestPart: null, feePart: null, unit, occurredAt: Date.UTC(2026, 1, 2) }];
      expect(accrual(appTerms, history, 900, cutoff)).toMatchObject({ status: "unsupported-history", reconciles: false });
      expect(interestOwed(supportedTerms, history, cutoff)).toBeNull();
      expect(interestAddProblem(supportedTerms, history, 1, cutoff, cutoff)).not.toBeNull();
      expect(appAddProblem(appTerms, history, 1, cutoff, cutoff)).not.toBeNull();
      expect(appAddable(appTerms, history, cutoff, cutoff)).toBeNull();
    }
  });

  it("accepts case-insensitive matching units and ignores foreign notes and events outside the accrual period", () => {
    const event = { kind: "repaid" as const, amount: 100, principalPart: null, interestPart: null, feePart: null, unit: "eur", occurredAt: Date.UTC(2026, 1, 2) };
    const history: TermEvent[] = [event, { ...event, kind: "note", unit: null }, { ...event, unit: "USD", occurredAt: Date.UTC(2025, 11, 31) }, { ...event, unit: "BTC", occurredAt: Date.UTC(2027, 0, 1) }];
    const app = accrual(appTerms, history, 900, cutoff);
    expect(app).toMatchObject({ status: "ok", reconciles: true });
    if (app.status !== "ok") throw new Error("expected supported history");
    expect(interestOwed(supportedTerms, history, cutoff)).toEqual({ accrued: app.accrued, settled: app.settled, owed: app.owed });
    expect(interestAddProblem(supportedTerms, history, 1, cutoff, cutoff)).toBeNull();
  });
});

const at = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);

describe("interestOwed", () => {
  const terms = { unit: "EUR", principal: 19_670, startedAt: at(2026, 6, 1), interestRate: 8 };

  it("accrues the yearly rate over 12 for each completed month, and nothing for a part of a month", () => {
    expect(interestOwed(terms, [], at(2026, 6, 30))).toEqual({ accrued: 0, settled: 0, owed: 0 });
    expect(interestOwed(terms, [], at(2026, 7, 1))).toEqual({ accrued: 131.13, settled: 0, owed: 131.13 });
    expect(interestOwed(terms, [], at(2026, 10, 24))).toEqual({ accrued: 524.52, settled: 0, owed: 524.52 });
  });

  it("counts interest paid in cash and interest added to the principal as settled", () => {
    const events: AccrualEvent[] = [
      { kind: "repaid", unit: "EUR", amount: 100, principalPart: 70, interestPart: 30, feePart: 0, occurredAt: at(2026, 8, 5) },
      { kind: "capitalized", unit: "EUR", amount: 50, occurredAt: at(2026, 9, 5) },
    ];
    const r = interestOwed(terms, events, at(2026, 10, 24))!;
    expect(r.settled).toBe(80);
    expect(r.owed).toBe(Math.round((r.accrued - 80) * 100) / 100);
  });

  it("charges the next month on principal that grew by added interest", () => {
    // The month that starts on 1 Aug is charged on what was owed that day, including interest added on 2 Jul.
    const plain = interestOwed(terms, [], at(2026, 9, 1))!;
    const grown = interestOwed(terms, [{ kind: "capitalized", unit: "EUR", amount: 131.13, occurredAt: at(2026, 7, 2) }], at(2026, 9, 1))!;
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
      const app = accrual({ unit: "EUR", principal, startedAt, interestRate, interestTerms: "simple", dueKind: null, dueDate: null }, events, 0, now);
      const server = interestOwed({ unit: "EUR", principal, startedAt, interestRate }, events, now);
      expect(app.status).toBe("ok");
      if (app.status !== "ok" || server === null) throw new Error("not ok");
      expect(server).toEqual({ accrued: app.accrued, settled: app.settled, owed: app.owed });

      // Whether interest can be added on a generated day: the server refuses exactly what the app refuses.
      const addAt = startedAt + pick(Math.max(1, Math.floor((now - startedAt) / 86_400_000) + 1)) * 86_400_000;
      const terms = { unit: "EUR", principal, startedAt, interestRate, interestTerms: "simple" as const, dueKind: null, dueDate: null };
      const offered = appAddable(terms, events, addAt, now);
      if (offered === null) throw new Error("expected supported history to have a known addable amount");
      const tries = [offered, offered + 0.01, Math.round(rand() * 2 * offered * 100) / 100].filter((x) => x > 0);
      for (const x of tries) {
        expect(interestAddProblem({ unit: "EUR", principal, startedAt, interestRate }, events, x, addAt, now) === null).toBe(appAddProblem(terms, events, x, addAt, now) === null);
      }
      // What the app offers is always accepted.
      if (offered > 0.005) expect(interestAddProblem({ unit: "EUR", principal, startedAt, interestRate }, events, offered, addAt, now)).toBeNull();
    }
  });
});

describe("monthInterest", () => {
  it("rounds an exact half cent up, whatever binary floating point makes of the product", () => {
    // 23,758 x 9% / 12 is exactly 178.185, and 26,925.60 x 12.5% / 12 is exactly 280.475.
    expect(monthInterest(23_758, 9)).toBe(178.19);
    expect(monthInterest(26_925.6, 12.5)).toBe(280.48);
    expect(monthInterest(19_670, 8)).toBe(131.13);
    // Exactly 5.675 and 2.805, which plain division by 1200 still reads as just under the half.
    expect(monthInterest(544.8, 12.5)).toBe(5.68);
    expect(monthInterest(269.28, 12.5)).toBe(2.81);
  });
});

describe("principal in date order", () => {
  it("clamps an overpayment at zero when it happens, so money borrowed later starts from zero", () => {
    const terms = { unit: "EUR", principal: 1_200, startedAt: at(2026, 1, 1), interestRate: 12 };
    const events: AccrualEvent[] = [
      // Listed out of order on purpose: the borrowing came after the overpayment.
      { kind: "borrowed", unit: "EUR", amount: 500, occurredAt: at(2026, 2, 10) },
      { kind: "repaid", unit: "EUR", amount: 1_400, occurredAt: at(2026, 1, 20) },
    ];
    // The month from 1 Mar is charged on 500, not on 1,200 - 1,400 + 500 = 300: 500 x 1% = 5.
    const march = interestOwed(terms, events, at(2026, 4, 1))!.accrued - interestOwed(terms, events, at(2026, 3, 1))!.accrued;
    expect(Math.round(march * 100) / 100).toBe(5);
  });
});

describe("interestAddProblem", () => {
  const terms = { unit: "EUR", principal: 19_670, startedAt: at(2026, 6, 1), interestRate: 8 };

  it("allows what was owed on the entry's date and no more", () => {
    expect(interestAddProblem(terms, [], 262.26, at(2026, 8, 15), at(2026, 10, 24))).toBeNull();
    expect(interestAddProblem(terms, [], 262.27, at(2026, 8, 15), at(2026, 10, 24))).toMatch(/more than the interest owed on that date, 262\.26/);
  });

  it("refuses back-dated interest that was paid after its date", () => {
    const paid: AccrualEvent[] = [{ kind: "repaid", unit: "EUR", amount: 400, principalPart: 0, interestPart: 400, feePart: 0, occurredAt: at(2026, 10, 10) }];
    expect(interestAddProblem(terms, paid, 262.26, at(2026, 8, 15), at(2026, 10, 24))).toMatch(/since been paid or added/);
    // Today, 124.52 is still owed (524.52 - 400), and adding it on 15 Aug leaves the total at zero or above.
    expect(interestAddProblem(terms, paid, 124.52, at(2026, 8, 15), at(2026, 10, 24))).toBeNull();
  });

  it("refuses a date before any month completed", () => {
    expect(interestAddProblem(terms, [], 10, at(2026, 6, 20), at(2026, 10, 24))).toMatch(/no unpaid interest to add on that date/);
  });
});
