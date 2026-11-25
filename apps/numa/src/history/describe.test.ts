import { actorLabel, describeChange, historyWhen, presentHistory } from './describe';
import type { RecordChange } from './describe';

const at = (hours: number, minutes: number) => new Date(2026, 10, 25, hours, minutes).getTime();
const base = { _id: '1', at: at(14, 32), recordId: 'x', recordName: 'Item', actor: { kind: 'app' as const } };

test('a change reads as one line', () => {
  expect(describeChange({ action: 'changed', field: 'name', oldValue: 'Flat', newValue: 'Lisbon flat', recordType: 'asset' })).toBe('Name Flat → Lisbon flat');
  expect(describeChange({ action: 'changed', field: 'location', oldValue: null, newValue: 'Bank', recordType: 'asset' })).toBe('Kept at Bank');
  expect(describeChange({ action: 'changed', field: 'notes', oldValue: 'x', newValue: '', recordType: 'asset' })).toBe('Notes removed');
  expect(describeChange({ action: 'event_added', field: 'repaid', values: { amount: 40, unit: 'EUR' }, recordType: 'liability' })).toBe('Repaid €40');
  expect(describeChange({ action: 'deleted', recordType: 'asset' })).toBe('Deleted');
});

test("uses the screen's wording and money format", () => {
  expect(describeChange({
    action: 'changed', field: 'balance', oldValue: 240000, newValue: 255000, recordType: 'asset', values: { currency: 'EUR' },
  })).toBe('Value €240,000 → €255,000');
  expect(describeChange({
    action: 'event_added', field: 'repaid', values: { amount: 1500, unit: 'EUR', balance: 10500 }, recordType: 'liability',
  })).toBe('Repaid €1,500 · balance €10,500');
});

test('who made it', () => {
  expect(actorLabel({ kind: 'app' })).toBe('You');
  expect(actorLabel({ kind: 'agent', name: 'Assistant' })).toBe('Assistant');
  expect(actorLabel({ kind: 'system' })).toBe('Numa');
});

test("shows the date and time in the screen's day-month style", () => {
  const now = new Date(2026, 10, 25, 18, 0).getTime();
  expect(historyWhen(at(14, 32), now)).toBe('25 Nov, 14:32');
  expect(historyWhen(at(14, 32), new Date(2027, 0, 1).getTime())).toBe('25 Nov 2026, 14:32');
});

test('merges an applied repayment with the balance it left', () => {
  const t = at(14, 32);
  const event: RecordChange = {
    ...base, _id: 'e1', at: t, recordType: 'liability', recordName: 'Car loan',
    action: 'event_added', field: 'repaid', values: { amount: 1500, unit: 'EUR' }, reason: 'Monthly payment',
  };
  const balance: RecordChange = {
    ...event, _id: 'e2', action: 'changed', field: 'balance', oldValue: 12000, newValue: 10500, values: { currency: 'EUR' },
  };
  const rows = presentHistory([event, balance]);
  expect(rows).toHaveLength(1);
  expect(describeChange(rows[0]!)).toBe('Repaid €1,500 · balance €10,500');
});
