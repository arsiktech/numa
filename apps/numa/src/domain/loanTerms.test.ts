import { accrual, addMonths, isOverdue, paidTotals, principalAt, splitProblem, type LoanTerms, type TermEvent } from './loanTerms';

const day = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);
const terms = (over: Partial<LoanTerms> = {}): LoanTerms => ({ principal: 20_000, startedAt: day(2026, 7, 1), dueKind: 'flexible', interestTerms: 'simple', interestRate: 8, dueDate: null, ...over });
const ev = (over: Partial<TermEvent> & Pick<TermEvent, 'kind' | 'occurredAt'>): TermEvent => ({ amount: null, principalPart: null, interestPart: null, feePart: null, ...over });
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
});
