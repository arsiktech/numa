import { actorLabel, describeChange } from './describe';

test('a change reads as one line', () => {
  expect(describeChange({ action: 'changed', field: 'name', oldValue: 'Flat', newValue: 'Lisbon flat' })).toBe('Name Flat → Lisbon flat');
  expect(describeChange({ action: 'changed', field: 'location', oldValue: null, newValue: 'Bank' })).toBe('Kept at Bank');
  expect(describeChange({ action: 'changed', field: 'notes', oldValue: 'x', newValue: '' })).toBe('Notes removed');
  expect(describeChange({ action: 'event_added', field: 'repaid', values: { amount: 40, unit: 'EUR' } })).toBe('Repaid 40 EUR');
  expect(describeChange({ action: 'deleted' })).toBe('Deleted');
});

test('who made it', () => {
  expect(actorLabel({ kind: 'app' })).toBe('You');
  expect(actorLabel({ kind: 'agent', name: 'Assistant' })).toBe('Assistant');
  expect(actorLabel({ kind: 'system' })).toBe('Numa');
});
