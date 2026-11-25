import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';

import { SharedBalancesSection } from './SharedBalancesSection';

const NOW = Date.UTC(2026, 10, 25, 18, 42);
const KEY = 'nspro_example_key_that_must_not_remain_visible';
let mockLinks: Array<{ id: string; householdId: string; status: 'ok' | 'stale' | null; message: string | null; checkedAt: number | null; readingAt: number | null }> = [];
let mockCloud: { status: string; portfolioId?: string; space?: { role: string }; snapshot?: { assets: unknown[]; liabilities: unknown[] }; now?: number } = {
  status: 'ready', portfolioId: 'pf', space: { role: 'owner' }, snapshot: { assets: [], liabilities: [] }, now: NOW,
};
const mockConnect = jest.fn();
const mockSync = jest.fn();
const mockDisconnect = jest.fn();
const mockToast = jest.fn();
let mockMutationCall = 0;

jest.mock('convex/react', () => ({
  useQuery: () => mockLinks,
  useMutation: () => [mockConnect, mockSync, mockDisconnect][mockMutationCall++ % 3],
}));
jest.mock('@/cloud/api', () => ({ cloud: { sharedLinks: 'links', connectShared: 'connect', syncShared: 'sync', disconnectShared: 'disconnect' } }));
jest.mock('@/data/cloud', () => ({ useCloudData: () => mockCloud }));
jest.mock('@/ui/Toast', () => ({ useToast: () => mockToast }));
jest.mock('@/theme/theme', () => ({ useTheme: () => ({ c: { bg: '#000', ink: '#fff', ink2: '#aaa', ink3: '#777', s1: '#111', s2: '#222', line: '#333', line2: '#444', down: '#f55', stroke: '#666' } }) }));
jest.mock('@/theme/webFont', () => ({ webFont: (font: string) => font }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let tree: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => {
  if (tree) act(() => tree?.unmount());
  tree = undefined;
  mockMutationCall = 0;
  mockLinks = [];
  mockCloud = { status: 'ready', portfolioId: 'pf', space: { role: 'owner' }, snapshot: { assets: [], liabilities: [] }, now: NOW };
  mockConnect.mockReset(); mockSync.mockReset(); mockDisconnect.mockReset(); mockToast.mockReset();
});

const button = (label: string) => tree!.root.findAll((n) => n.props.accessibilityRole === 'button' && n.findAll((x) => x.props.children === label).length > 0)[0];
const text = () => JSON.stringify(tree!.toJSON());
const input = (label: string) => tree!.root.findAllByType(TextInput).find((n) => n.props.accessibilityLabel === label)!;

describe('Shared balances settings', () => {
  it('stores the key and clears it so it is never shown again', async () => {
    mockConnect.mockResolvedValue({ id: 'link' });
    mockLinks = [];
    await act(async () => { tree = TestRenderer.create(<SharedBalancesSection />); });
    expect(button('Connect').props.disabled).toBe(true);
    await act(async () => { input('Household id').props.onChangeText('household-one'); input('Pro app key').props.onChangeText(KEY); });
    expect(input('Pro app key').props.secureTextEntry).toBe(true);
    await act(async () => { button('Connect').props.onPress(); });
    expect(mockConnect).toHaveBeenCalledWith({ portfolioId: 'pf', householdId: 'household-one', token: KEY });
    expect(input('Pro app key').props.value).toBe('');
    expect(text()).not.toContain(KEY);
  });

  it('shows the counterparty, the last sync and a stale flag, then syncs and disconnects', async () => {
    mockLinks = [{ id: 'link', householdId: 'household-one', status: 'stale', message: 'missed', checkedAt: NOW, readingAt: NOW - 5 * 60_000 }];
    mockCloud = {
      ...mockCloud,
      snapshot: {
        assets: [],
        liabilities: [{ id: 'l1', name: 'Numa Shared · Other', balance: 988.37, currency: 'EUR', counterparty: 'Other', dueDate: null, kind: 'other', updatedAt: NOW, sharedSync: { householdId: 'household-one', unitId: 'unit-other', checkedAt: NOW, readingAt: NOW - 5 * 60_000, stale: true } }],
      },
    };
    await act(async () => { tree = TestRenderer.create(<SharedBalancesSection />); });
    expect(text()).toContain('Other');
    expect(text()).toContain('Stale');
    expect(text()).toContain('988.37');
    expect(text()).toContain('min ago');
    expect(text()).not.toContain(KEY);
    await act(async () => { button('Sync now').props.onPress(); });
    expect(mockSync).toHaveBeenCalledWith({ id: 'link' });
    await act(async () => { button('Disconnect').props.onPress(); });
    await act(async () => { button('Disconnect').props.onPress(); });
    expect(mockDisconnect).toHaveBeenCalledWith({ id: 'link' });
  });
});
