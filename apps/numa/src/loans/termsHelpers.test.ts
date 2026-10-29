import { accrual, type TermEvent } from '@/domain/loanTerms';

import { calendarToday, dayText, removedText } from './termsHelpers';
import { simulateZone } from './testZone';

const noon = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d, 12);
afterEach(() => { jest.restoreAllMocks(); });

describe('calendarToday', () => {
  it('is noon UTC of the phone’s own date, the moment a typed "today" is stored as', () => {
    const clock = Date.UTC(2026, 9, 24, 22, 30);
    simulateZone(2);
    expect(calendarToday(clock)).toBe(noon(2026, 10, 25));
  });

  it('keeps the same date when the phone is behind UTC, and when it is on UTC', () => {
    const clock = Date.UTC(2026, 9, 25, 2, 0);
    simulateZone(-7);
    expect(calendarToday(clock)).toBe(noon(2026, 10, 24));
    jest.restoreAllMocks();
    simulateZone(0);
    expect(calendarToday(clock)).toBe(noon(2026, 10, 25));
  });

  it('follows a phone far ahead of UTC', () => {
    simulateZone(13);
    expect(calendarToday(Date.UTC(2026, 9, 24, 11, 30))).toBe(noon(2026, 10, 25));
  });
});

describe('a payment dated today', () => {
  // A phone at UTC+2 at 00:30 on 25 October. UTC has not reached the 25th, but a typed "today" is the 25th.
  const clock = Date.UTC(2026, 9, 24, 22, 30);
  const terms = { unit: 'EUR', principal: 20_000, startedAt: noon(2026, 7, 1), dueKind: null, interestTerms: 'simple' as const, interestRate: 8, dueDate: null };
  const paidToday: TermEvent[] = [{ kind: 'repaid', amount: 1_000, principalPart: null, interestPart: null, feePart: null, unit: 'EUR', occurredAt: noon(2026, 10, 25) }];

  it('counts in the history when today is the phone’s date, so the history agrees with the balance', () => {
    simulateZone(2);
    const a = accrual(terms, paidToday, 19_000, calendarToday(clock));
    expect(a.status === 'ok' && a.reconciles).toBe(true);
  });

  it('is ignored by the clock’s own UTC date, which is what made the history seem off', () => {
    simulateZone(2);
    const a = accrual(terms, paidToday, 19_000, clock);
    expect(a.status === 'ok' && a.reconciles).toBe(false);
  });
});

describe('dayText', () => {
  it('shows a stored calendar day as that day, even on a phone more than 12 hours ahead of UTC', () => {
    simulateZone(13);
    expect(dayText(noon(2026, 9, 20), Date.UTC(2026, 9, 24, 1))).toBe('20 Sep');
    expect(dayText(noon(2025, 12, 31), Date.UTC(2026, 9, 24, 1))).toBe('31 Dec 2025');
  });

  it('shows a dash for a date too far out for a calendar, instead of failing', () => {
    expect(dayText(9e15, Date.UTC(2026, 9, 24))).toBe('—');
  });
});

describe('removedText', () => {
  it('says what removing an entry did to the debt, as the server undoes it', () => {
    expect(removedText({ kind: 'repaid', applied: true, amount: 100, principalPart: null })).toBe('Removed, and the amount is back on the debt');
    expect(removedText({ kind: 'repaid', applied: true, amount: 100, principalPart: 70 })).toBe('Removed, and its principal part is back on the debt');
    // An interest-only payment changed no principal, so nothing comes back.
    expect(removedText({ kind: 'repaid', applied: true, amount: 100, principalPart: 0 })).toBe('Removed. It paid no principal, so the debt is unchanged');
    expect(removedText({ kind: 'capitalized', applied: true, amount: 36, principalPart: null })).toBe('Removed, and the amount is taken off the debt again');
    expect(removedText({ kind: 'repaid', applied: false, amount: 100, principalPart: null })).toBe('Removed');
  });
});
