import { linkState, sharedCounterparties, sharedLinkError, type SharedRecord } from './sharedBalances';

const sync = (over: Partial<SharedRecord['sharedSync']> = {}) => ({ householdId: 'household-one', unitId: 'unit-other', checkedAt: 1, readingAt: 1, stale: false, ...over });

const liability = (over: Partial<SharedRecord> = {}): SharedRecord => ({ name: 'Numa Shared · Other', balance: 12.5, currency: 'EUR', counterparty: 'Other', sharedSync: sync(), ...over });
const asset = (over: Partial<SharedRecord> = {}): SharedRecord => ({ name: 'Numa Shared · Other', balance: 4, currency: 'EUR', owedBy: 'Other', sharedSync: sync({ unitId: 'unit-other' }), ...over });

describe('shared balances', () => {
  it('keeps one line per counterparty and leaves hand-entered records out', () => {
    const manual: SharedRecord = { name: 'Hand entered', balance: 999.37, currency: 'EUR', counterparty: 'Other' };
    const otherHouse = liability({ sharedSync: sync({ householdId: 'household-two', unitId: 'unit-two' }), counterparty: 'Someone else' });
    expect(sharedCounterparties('household-one', [], [liability(), manual, otherHouse])).toEqual([
      { unitId: 'unit-other', name: 'Other', balance: 12.5, currency: 'EUR', side: 'liability', stale: false },
    ]);
  });

  it('shows money owed to the space as an asset and flags a stale reading', () => {
    const rows = sharedCounterparties('household-one', [asset({ sharedSync: sync({ stale: true }) })], []);
    expect(rows).toEqual([expect.objectContaining({ side: 'asset', balance: 4, stale: true })]);
    expect(linkState('ok', rows)).toBe('stale');
    expect(linkState('ok', [{ stale: false }])).toBe('synced');
    expect(linkState(null, [])).toBe('waiting');
    expect(linkState('stale', [])).toBe('stale');
  });

  it('explains a refused key without repeating it', () => {
    expect(sharedLinkError({ data: { message: 'Paste the Numa Pro key from Numa Shared' } })).toBe('That Pro app key isn’t valid.');
    expect(sharedLinkError({ data: { message: 'Paste the household id from Numa Shared' } })).toBe('That household id isn’t valid.');
    expect(sharedLinkError(new Error('offline'))).toBe('Couldn’t save that. Try again.');
    expect(sharedLinkError({ data: { message: 'Paste the Numa Pro key from Numa Shared' } })).not.toContain('nspro_');
  });
});
