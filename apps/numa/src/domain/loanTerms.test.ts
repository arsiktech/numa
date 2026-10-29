import { accrual, addMonths, dayOf, dueDateFor, isOverdue, monthInterest, paidTotals, parseAmount, principalAt, roundDecimals, splitProblem, type LoanTerms, type TermEvent } from './loanTerms';

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);
const terms = (over: Partial<LoanTerms> = {}): LoanTerms => ({ unit: 'EUR', principal: 20_000, startedAt: day(2026, 7, 1), dueKind: 'flexible', interestTerms: 'simple', interestRate: 8, dueDate: null, ...over });
const ev = (over: Partial<TermEvent> & Pick<TermEvent, 'kind' | 'occurredAt'>): TermEvent => ({ unit: 'EUR', amount: null, principalPart: null, interestPart: null, feePart: null, ...over });
const NOW = day(2026, 10, 24);

describe('addMonths', () => {
  it('keeps the day, and the last day of a shorter month', () => {
    expect(addMonths(day(2026, 7, 1), 1)).toBe(day(2026, 8, 1));
    expect(addMonths(day(2026, 1, 31), 1)).toBe(day(2026, 2, 28));
    expect(addMonths(day(2028, 1, 31), 1)).toBe(day(2028, 2, 29));
    expect(addMonths(day(2026, 11, 30), 3)).toBe(day(2027, 2, 28));
  });
});

describe('accrual', () => {
  it.each(['borrowed', 'repaid', 'capitalized'] as const)('does not fabricate principal or interest from a foreign %s event', (kind) => {
    const loan = { ...terms(), unit: 'EUR' };
    for (const unit of ['USD', 'BTC', null, undefined]) {
      const events = [ev({ kind, amount: 100, unit, occurredAt: day(2026, 8, 15) })];
      expect(principalAt(loan, events, NOW)).toBeNull();
      const result = accrual(loan, events, kind === 'repaid' ? 19_900 : 20_100, NOW);
      expect(result).toMatchObject({ status: 'unsupported-history', reconciles: false });
      expect(result).not.toHaveProperty('owed');
      expect(result).not.toHaveProperty('accrued');
    }
  });
  it('accrues a twelfth of the yearly rate for each completed month, rounded to cents', () => {
    const a = accrual(terms(), [], 20_000, NOW);
    // 1 Jul to 1 Oct is three whole months: 3 × (20,000 × 8% ÷ 12 = 133.33) = 399.99.
    expect(a).toMatchObject({ status: 'ok', months: 3, accrued: 399.99, settled: 0, owed: 399.99, reconciles: true, historyPrincipal: 20_000 });
    expect(a.status === 'ok' && a.nextAccrualAt).toBe(day(2026, 11, 1));
  });

  it('accrues nothing before the first month completes', () => {
    expect(accrual(terms({ startedAt: day(2026, 10, 10) }), [], 20_000, NOW)).toMatchObject({ status: 'ok', months: 0, accrued: 0, owed: 0 });
  });

  it('accrues on the principal outstanding at the start of each month, after a partial repayment', () => {
    const events = [ev({ kind: 'repaid', amount: 5_000, occurredAt: day(2026, 8, 15) })];
    const a = accrual(terms(), events, 15_000, NOW);
    // The three months start on 1 Jul, 1 Aug and 1 Sep. The 15 Aug payment is not in yet for August: 133.33 + 133.33 + 100.00.
    expect(a).toMatchObject({ status: 'ok', accrued: 366.66, reconciles: true, historyPrincipal: 15_000 });
  });

  it('counts only the principal part of a split payment, and the interest part as interest settled', () => {
    const events = [ev({ kind: 'repaid', amount: 1_000, principalPart: 800, interestPart: 150, feePart: 50, occurredAt: day(2026, 8, 15) })];
    const a = accrual(terms(), events, 19_200, NOW);
    // July and August start on 20,000 (133.33 each); September starts on 19,200 (128.00).
    expect(a).toMatchObject({ status: 'ok', accrued: 394.66, settled: 150, owed: 244.66, reconciles: true });
  });

  it('adds capitalized interest to the principal and counts it as settled', () => {
    const events = [ev({ kind: 'capitalized', amount: 133.33, occurredAt: day(2026, 8, 2) })];
    const a = accrual(terms(), events, 20_133.33, NOW);
    // July and August start on 20,000 (133.33 each); September starts on 20,133.33 (134.22).
    expect(a).toMatchObject({ status: 'ok', accrued: 400.88, settled: 133.33, owed: 267.55, reconciles: true, historyPrincipal: 20_133.33 });
  });

  it('shows interest paid ahead as a negative amount owed, never hiding it', () => {
    const events = [ev({ kind: 'repaid', amount: 1_000, principalPart: 0, interestPart: 1_000, feePart: 0, occurredAt: day(2026, 7, 5) })];
    expect(accrual(terms(), events, 20_000, NOW)).toMatchObject({ status: 'ok', owed: -600.01 });
  });

  it('says so when the history and the saved balance disagree', () => {
    expect(accrual(terms(), [], 18_000, NOW)).toMatchObject({ status: 'ok', reconciles: false, historyPrincipal: 20_000 });
  });

  it('counts a history-only payment, since it was a real payment, and ignores events before the start', () => {
    const events = [ev({ kind: 'repaid', amount: 5_000, occurredAt: day(2026, 8, 15) }), ev({ kind: 'repaid', amount: 9_999, occurredAt: day(2026, 1, 1) })];
    expect(principalAt(terms(), events, NOW)).toBe(15_000);
  });

  it('ignores lent, received and notes for a debt', () => {
    const events = [ev({ kind: 'note', occurredAt: day(2026, 8, 1) }), ev({ kind: 'received', amount: 1_000, occurredAt: day(2026, 8, 1) })];
    expect(principalAt(terms(), events, NOW)).toBe(20_000);
  });

  it('calculates nothing for interest-free or manual terms, and asks for what is missing for simple', () => {
    expect(accrual(terms({ interestTerms: 'none', interestRate: null }), [], 20_000, NOW)).toEqual({ status: 'none' });
    expect(accrual(terms({ interestTerms: null }), [], 20_000, NOW)).toEqual({ status: 'none' });
    expect(accrual(terms({ interestTerms: 'manual' }), [], 20_000, NOW)).toEqual({ status: 'manual' });
    expect(accrual(terms({ interestRate: null }), [], 20_000, NOW)).toMatchObject({ status: 'incomplete', missing: 'a yearly rate' });
    expect(accrual(terms({ principal: null }), [], 20_000, NOW)).toMatchObject({ status: 'incomplete' });
    expect(accrual(terms({ startedAt: null }), [], 20_000, NOW)).toMatchObject({ status: 'incomplete' });
  });

  it('refuses a start date that is clearly a typing mistake', () => {
    expect(accrual(terms({ startedAt: 0 }), [], 20_000, NOW)).toMatchObject({ status: 'incomplete', missing: expect.stringContaining('start date') });
  });
});

describe('paidTotals', () => {
  it('splits what was paid, with unsplit payments counted as principal', () => {
    const events = [
      ev({ kind: 'repaid', amount: 1_000, principalPart: 800, interestPart: 150, feePart: 50, occurredAt: 1 }),
      ev({ kind: 'repaid', amount: 500, occurredAt: 2 }),
      ev({ kind: 'borrowed', amount: 9_999, occurredAt: 3 }),
    ];
    expect(paidTotals(events)).toEqual({ total: 1_500, principal: 1_300, interest: 150, fees: 50 });
  });
});

describe('isOverdue', () => {
  it('compares calendar days for dates saved at midnight, noon or late in the day', () => {
    for (const hour of [0, 12, 23]) {
      const fixed = terms({ dueKind: 'fixed', dueDate: Date.UTC(2026, 9, 24, hour) });
      for (const nowHour of [0, 12, 23]) expect(isOverdue(fixed, 100, Date.UTC(2026, 9, 24, nowHour))).toBe(false);
      expect(isOverdue(fixed, 100, Date.UTC(2026, 9, 25))).toBe(true);
    }
  });
  it('is overdue only for a fixed loan past its date with something still owed', () => {
    const fixed = terms({ dueKind: 'fixed', dueDate: day(2026, 10, 1) });
    expect(isOverdue(fixed, 100, NOW)).toBe(true);
    expect(isOverdue(fixed, 0, NOW)).toBe(false);
    expect(isOverdue(terms(), 100, NOW)).toBe(false);
    expect(isOverdue({ ...fixed, dueDate: day(2026, 12, 1) }, 100, NOW)).toBe(false);
  });
});

describe('splitProblem', () => {
  it('is quiet when the parts add up, and says how far off they are when not', () => {
    expect(splitProblem(1_000, { principal: 800, interest: 150, fees: 50 })).toBeNull();
    expect(splitProblem(10, { principal: 3.33, interest: 3.33, fees: 3.34 })).toBeNull();
    expect(splitProblem(1_000, { principal: 800, interest: 100, fees: 0 })).toBe('100.00 of the payment is not placed yet.');
    expect(splitProblem(1_000, { principal: 900, interest: 200, fees: 0 })).toBe('The parts are 100.00 more than the payment.');
    expect(splitProblem(1_000, { principal: -1, interest: 1_001, fees: 0 })).toBe('Each part must be zero or more.');
    expect(splitProblem(1_000, { principal: NaN, interest: 0, fees: 0 })).toBe('Each part must be zero or more.');
  });

  it('rounds each part half up as written, as the server does', () => {
    // 1.005 is stored as 1.01, so a principal of 1.01 is the whole payment.
    expect(splitProblem(1.005, { principal: 1.01, interest: 0, fees: 0 })).toBeNull();
  });
});

describe('dates are compared by calendar day, not by the minute', () => {
  const at = (h: number, m = 0) => Date.UTC(2026, 1, 10, h, m);
  const loan = terms({ principal: 10_000, interestRate: 12, startedAt: day(2026, 1, 10) });
  const now = day(2026, 3, 15);

  it('gives the same interest however the time of day of the payment was typed', () => {
    // 10,000 at 12% from 10 Jan. 5,000 principal paid on 10 Feb. Jan month: 100.00; Feb month starts on the payment day: 50.00.
    for (const when of [at(0), at(9), at(12), at(17), at(23, 59)]) {
      const events = [ev({ kind: 'repaid', amount: 5_000, occurredAt: when })];
      expect(accrual(loan, events, 5_000, now)).toMatchObject({ status: 'ok', months: 2, accrued: 150, reconciles: true });
    }
  });

  it('counts a payment made on the start day, however early in the day it was typed', () => {
    const startNoon = day(2026, 1, 10);
    const early = [ev({ kind: 'repaid', amount: 1_000, occurredAt: Date.UTC(2026, 0, 10, 3) })];
    expect(principalAt(loan, early, startNoon)).toBe(9_000);
    expect(accrual(loan, early, 9_000, now)).toMatchObject({ status: 'ok', reconciles: true });
  });

  it('still leaves out an event from the day before the start', () => {
    const before = [ev({ kind: 'repaid', amount: 1_000, occurredAt: Date.UTC(2026, 0, 9, 23, 59) })];
    expect(principalAt(loan, before, now)).toBe(10_000);
  });

  it('gives the same answer for dates typed in any way: local noon, UTC noon, the current minute', () => {
    const typed = [day(2026, 2, 10), Date.UTC(2026, 1, 10, 17), Date.UTC(2026, 1, 10, 9, 41)];
    const answers = typed.map((when) => accrual(loan, [ev({ kind: 'repaid', amount: 5_000, occurredAt: when })], 5_000, now));
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
  });

  it('turns a moment into its calendar day', () => {
    expect(dayOf(Date.UTC(2026, 1, 10, 0, 0))).toBe(dayOf(Date.UTC(2026, 1, 10, 23, 59)));
    expect(dayOf(Date.UTC(2026, 1, 10, 23, 59))).toBe(dayOf(Date.UTC(2026, 1, 9, 23, 59)) + 1);
  });
});

describe('principal never goes below zero', () => {
  it('does not turn an overpayment in the history into negative interest', () => {
    const loan = terms({ principal: 1_000, interestRate: 12, startedAt: day(2026, 7, 1) });
    const events = [ev({ kind: 'repaid', amount: 1_400, occurredAt: day(2026, 7, 5) })];
    expect(principalAt(loan, events, NOW)).toBe(0);
    // July starts on 1,000 (10.00); August and September start on nothing owed (0.00 each), not on −400.
    expect(accrual(loan, events, 0, NOW)).toMatchObject({ status: 'ok', accrued: 10, historyPrincipal: 0 });
  });

  it('clamps at the overpayment, in date order, so money borrowed later starts from zero', () => {
    const loan = terms({ principal: 1_200, interestRate: 12, startedAt: day(2026, 1, 1) });
    // Listed out of order on purpose: the 500 was borrowed after the overpayment.
    const events = [ev({ kind: 'borrowed', amount: 500, occurredAt: day(2026, 2, 10) }), ev({ kind: 'repaid', amount: 1_400, occurredAt: day(2026, 1, 20) })];
    expect(principalAt(loan, events, day(2026, 3, 1))).toBe(500);
  });
});

describe('monthInterest', () => {
  it('rounds an exact half cent up, whatever binary floating point makes of the product', () => {
    expect(monthInterest(23_758, 9)).toBe(178.19);
    expect(monthInterest(26_925.6, 12.5)).toBe(280.48);
    // Exactly 5.675 and 2.805, which plain division by 1200 still reads as just under the half.
    expect(monthInterest(544.8, 12.5)).toBe(5.68);
    expect(monthInterest(269.28, 12.5)).toBe(2.81);
  });
});

describe('rounding is half up on the digits as written', () => {
  it('rounds 12.345 to 12.35 and 1.005 to 1.01', () => {
    expect(roundDecimals(12.345, 2)).toBe(12.35);
    expect(roundDecimals(1.005, 2)).toBe(1.01);
    expect(roundDecimals(0.004, 2)).toBe(0);
  });
  it('rounds one month of interest on 1,518.00 at 1% to 1.27, not 1.26', () => {
    // 1,518.00 × 1% ÷ 12 = 1.265 exactly.
    const loan = terms({ principal: 1_518, interestRate: 1, startedAt: day(2026, 9, 1) });
    expect(accrual(loan, [], 1_518, day(2026, 10, 24))).toMatchObject({ status: 'ok', months: 1, accrued: 1.27 });
  });
});

describe('the history and the balance count as the same only when they agree to the cent', () => {
  it('treats one cent apart as a disagreement, and half a cent as rounding', () => {
    expect(accrual(terms(), [], 20_000.01, NOW)).toMatchObject({ status: 'ok', reconciles: false });
    expect(accrual(terms(), [], 19_999.99, NOW)).toMatchObject({ status: 'ok', reconciles: false });
    expect(accrual(terms(), [], 20_000, NOW)).toMatchObject({ status: 'ok', reconciles: true });
  });
});

describe('parseAmount', () => {
  it('reads thousands separators and decimal commas', () => {
    expect(parseAmount('5,000')).toBe(5_000);
    expect(parseAmount('5 000')).toBe(5_000);
    expect(parseAmount('1,234,567')).toBe(1_234_567);
    expect(parseAmount('1234,50')).toBe(1_234.5);
    expect(parseAmount('0,5')).toBe(0.5);
    // A thousands group never follows a leading 0, so these are decimal commas, as typed for a coin.
    expect(parseAmount('0,125')).toBe(0.125);
    expect(parseAmount('0,001')).toBe(0.001);
    expect(parseAmount('0,500')).toBe(0.5);
    expect(parseAmount('1,234,567.89')).toBe(1_234_567.89);
    expect(parseAmount('12.5')).toBe(12.5);
    expect(parseAmount('1,234.56')).toBe(1_234.56);
    expect(parseAmount(' 20000 ')).toBe(20_000);
  });
  it('gives NaN for anything that is not a plain amount', () => {
    for (const bad of ['', 'abc', '1e3', '-5', '5-', '1.2.3', '€5', '12,34,56x']) expect(Number.isNaN(parseAmount(bad))).toBe(true);
  });
});

describe('paidTotals by unit', () => {
  it('leaves out payments in another currency or coin', () => {
    const events = [
      ev({ kind: 'repaid', amount: 100, unit: 'EUR', occurredAt: 1 }),
      ev({ kind: 'repaid', amount: 0.1, unit: 'BTC', occurredAt: 2 }),
      ev({ kind: 'repaid', amount: 50, unit: null, occurredAt: 3 }),
    ];
    expect(paidTotals(events, 'EUR')).toEqual({ total: 150, principal: 150, interest: 0, fees: 0 });
    expect(paidTotals(events, 'btc')).toEqual({ total: 50.1, principal: 50.1, interest: 0, fees: 0 });
    expect(paidTotals(events).total).toBe(150.1);
  });
});

describe('splitProblem for a coin', () => {
  it('compares in eight decimals, so a coin split the server would refuse is refused here too', () => {
    expect(splitProblem(1, { principal: 1, interest: 0.004, fees: 0 }, 8)).toBe('0.00400000 more'.replace('0.00400000 more', 'The parts are 0.00400000 more than the payment.'));
    expect(splitProblem(0.12345678, { principal: 0.1, interest: 0.02345678, fees: 0 }, 8)).toBeNull();
    expect(splitProblem(1, { principal: 1, interest: 0.004, fees: 0 })).toBeNull();
  });
});

describe('the day interest is due by', () => {
  const withDay = (over: Partial<LoanTerms> = {}) => terms({ interestDueDay: 10, ...over });

  it('is due on the next occurrence of that day after the month completes', () => {
    expect(dueDateFor(day(2026, 8, 1), 10)).toBe(day(2026, 8, 10));
    expect(dueDateFor(day(2026, 8, 10), 10)).toBe(day(2026, 8, 10));
    expect(dueDateFor(day(2026, 9, 16), 10)).toBe(day(2026, 10, 10));
    expect(dueDateFor(day(2026, 1, 31), 28)).toBe(day(2026, 2, 28));
    expect(dueDateFor(day(2026, 12, 20), 10)).toBe(day(2027, 1, 10));
  });

  it('is overdue when the oldest interest owed passed its due day, and says when it was due', () => {
    // 1 Jul start, now 24 Oct: months complete on 1 Aug, 1 Sep and 1 Oct, 133.33 each. The oldest, 1 Aug, was due 10 Aug.
    expect(accrual(withDay(), [], 20_000, NOW)).toMatchObject({ status: 'ok', dueAt: day(2026, 8, 10), overdue: true });
  });

  it('moves the due date forward as interest is paid, oldest month first', () => {
    const paid = (amount: number) => [ev({ kind: 'repaid', amount, principalPart: 0, interestPart: amount, feePart: 0, occurredAt: day(2026, 10, 2) })];
    expect(accrual(withDay(), paid(133.33), 20_000, NOW)).toMatchObject({ dueAt: day(2026, 9, 10), overdue: true });
    expect(accrual(withDay(), paid(266.66), 20_000, NOW)).toMatchObject({ dueAt: day(2026, 10, 10), overdue: true });
  });

  it('is not overdue, and shows the next due date, when all completed interest is settled', () => {
    const all = [ev({ kind: 'repaid', amount: 399.99, principalPart: 0, interestPart: 399.99, feePart: 0, occurredAt: day(2026, 10, 2) })];
    expect(accrual(withDay(), all, 20_000, NOW)).toMatchObject({ owed: 0, dueAt: day(2026, 11, 10), overdue: false });
  });

  it('is not overdue before the day has passed', () => {
    // Started 16 Jun: months complete on the 16th. The 16 Oct one is due 10 Nov, which is still ahead on 24 Oct.
    const loan = withDay({ startedAt: day(2026, 6, 16) });
    const paid = [ev({ kind: 'repaid', amount: 399.99, principalPart: 0, interestPart: 399.99, feePart: 0, occurredAt: day(2026, 10, 2) })];
    expect(accrual(loan, paid, 20_000, NOW)).toMatchObject({ status: 'ok', months: 4, dueAt: day(2026, 11, 10), overdue: false });
    // With nothing paid, the oldest month completed on 16 Jul and was due 10 Aug.
    expect(accrual(loan, [], 20_000, NOW)).toMatchObject({ overdue: true, dueAt: day(2026, 8, 10) });
  });

  it('shows no due date and no overdue flag without a due day, and changes no figure', () => {
    const without = accrual(terms(), [], 20_000, NOW);
    const withIt = accrual(withDay(), [], 20_000, NOW);
    expect(without).toMatchObject({ dueAt: null, overdue: false });
    if (without.status !== 'ok' || withIt.status !== 'ok') throw new Error('expected both to be worked out');
    expect([withIt.accrued, withIt.owed, withIt.settled, withIt.months]).toEqual([without.accrued, without.owed, without.settled, without.months]);
  });
});

describe('the running month estimate', () => {
  it('works out the days gone in the running month from the principal at its start, and is not part of what is owed', () => {
    // From 1 Oct to 24 Oct is 23 of 31 days: 133.33 × 23 ÷ 31 = 98.92.
    const a = accrual(terms(), [], 20_000, NOW);
    expect(a).toMatchObject({ status: 'ok', running: 98.92, owed: 399.99 });
  });

  it('works for a loan that has not completed its first month', () => {
    // From 10 Oct to 24 Oct is 14 of 31 days: 133.33 × 14 ÷ 31 = 60.22.
    expect(accrual(terms({ startedAt: day(2026, 10, 10) }), [], 20_000, NOW)).toMatchObject({ status: 'ok', months: 0, owed: 0, running: 60.22 });
  });

  it('starts from nothing on the day a month completes', () => {
    expect(accrual(terms({ startedAt: day(2026, 9, 24) }), [], 20_000, NOW)).toMatchObject({ months: 1, running: 0 });
  });

  it('uses the principal at the start of the running month, not a payment made inside it', () => {
    const inMonth = [ev({ kind: 'repaid', amount: 10_000, occurredAt: day(2026, 10, 15) })];
    expect(accrual(terms(), inMonth, 10_000, NOW)).toMatchObject({ running: 98.92 });
  });
});
