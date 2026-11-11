import type { CloudAsset, CloudLiability } from '@/cloud/api';
import { assetFields, debtFields, deletePlan, editPlan } from './editPlan';

const asset = (over: Partial<CloudAsset> = {}): CloudAsset => ({ id: 'a1', name: 'Synthetic watch', kind: 'collectible', balance: 1_200, currency: 'EUR', notes: 'Synthetic note', updatedAt: 0, ...over });
const debt = (over: Partial<CloudLiability> = {}): CloudLiability => ({ id: 'l1', name: 'Synthetic card', kind: 'credit_card', balance: 420, currency: 'EUR', dueDate: null, notes: 'Synthetic note', updatedAt: 0, ...over });

// The server clears notes an update leaves out, so every write resends what is stored.
describe('notes survive edits and Undo', () => {
  it.each([['asset', assetFields(asset())], ['liability', debtFields(debt())]] as const)('an ordinary %s edit and its Undo keep the note', (type, before) => {
    const p = editPlan(type, 'x', before, { ...before, balanceCents: 50_000 }, 'pf');
    expect(p.apply.args).toMatchObject({ id: 'x', balance: 500, notes: 'Synthetic note' });
    expect(p.undo.args).toMatchObject({ id: 'x', notes: 'Synthetic note' });
  });
  it.each([['asset', assetFields(asset())], ['liability', debtFields(debt())]] as const)('delete Undo re-creates the %s with its note', (type, before) => {
    expect(deletePlan(type, 'x', before, 'pf').undo.args).toMatchObject({ notes: 'Synthetic note' });
  });
  it('sends an empty note for a record without one, which the server stores as no note', () => {
    expect(editPlan('asset', 'a1', assetFields(asset({ notes: null })), assetFields(asset({ notes: null })), 'pf').apply.args).toMatchObject({ notes: '' });
    expect(deletePlan('liability', 'l1', debtFields(debt({ notes: undefined })), 'pf').undo.args).toMatchObject({ notes: '' });
  });
});

describe('a manually valued fund', () => {
  const fund = assetFields(asset({ kind: 'other', investmentType: 'fund' }));
  it('comes back as a fund after delete Undo', () => {
    expect(deletePlan('asset', 'a1', fund, 'pf').undo).toMatchObject({ fn: 'upsertAsset', args: { kind: 'other', investmentType: 'fund' } });
  });
  it('is not reclassified by an ordinary edit or its Undo', () => {
    const p = editPlan('asset', 'a1', fund, { ...fund, balanceCents: 1 }, 'pf');
    expect(p.apply.args).not.toHaveProperty('investmentType');
    expect(p.undo.args).not.toHaveProperty('investmentType');
  });
  it('sends no investment type when re-creating any other asset', () => {
    expect(deletePlan('asset', 'a1', assetFields(asset({ kind: 'other', investmentType: null })), 'pf').undo.args).not.toHaveProperty('investmentType');
    expect(deletePlan('asset', 'a1', assetFields(asset()), 'pf').undo.args).not.toHaveProperty('investmentType');
  });
});
