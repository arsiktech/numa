import React from 'react';
import { TextInput } from 'react-native';
import AskScreen from '@/app/ask';
import { DraftCard } from './DraftCard';
import type { AskSource } from './useAskSource';

const { act, create } = jest.requireActual('react-test-renderer');
jest.setTimeout(20_000);
let mockSource: Extract<AskSource, { status: 'ready' }>;
const mockStorage = new Map<string, string>();
jest.mock('@/cloud/session', () => ({ useSession: () => ({ kind: 'signedIn' }) }));
jest.mock('@/ask/useAskSource', () => ({ useCloudAskSource: () => mockSource, useDemoAskSource: () => mockSource }));
jest.mock('@/cloud/storage', () => ({ storage: {
  getItem: async (k: string) => mockStorage.get(k) ?? null,
  setItem: async (k: string, v: string) => { mockStorage.set(k, v); },
  removeItem: async (k: string) => { mockStorage.delete(k); },
} }));
jest.mock('@/theme/theme', () => ({ useTheme: () => ({ c: new Proxy({}, { get: () => '#111111' }) }) }));
jest.mock('@/ui/money', () => ({ useMoney: () => ({ mask: (s: string) => s }) }));
jest.mock('@/ui/Panel', () => ({ PanelFrame: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { canGoBack: () => false, back: jest.fn(), replace: jest.fn() } }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: () => null, Path: () => null }));
jest.mock('./DraftCard', () => ({ DraftCard: () => null }));
let tree: any;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; jest.useFakeTimers(); mockStorage.clear();
  mockSource = { status: 'ready', demo: false, contextKey: 'recovery-user:space-a', ctx: { currency: 'EUR', now: new Date(), categories: [], assets: [], liabilities: [], holdings: [] }, answers: {} as any,
    save: jest.fn(async () => ({ undo: async () => {} })) };
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); tree = null; jest.clearAllTimers(); jest.useRealTimers(); });
async function mount() { await act(async () => { tree = create(<AskScreen />); }); }
async function type(value: string) { await act(async () => { tree.root.findByType(TextInput).props.onChangeText(value); }); }
async function draft() { await type('I have 100 in savings'); await act(async () => { tree.root.findByType(TextInput).props.onSubmitEditing(); }); }
async function reopen() { await act(async () => tree.unmount()); tree = null; await mount(); }

it('recovers the composer and edited unsaved draft after reopening, scoped to account and space', async () => {
  await mount(); await draft();
  const changed = { ...tree.root.findByType(DraftCard).props.draft, amountCents: 12345 };
  await act(async () => { tree.root.findByType(DraftCard).props.onChange(changed); });
  await type('Unsent synthetic note'); await reopen();
  expect(tree.root.findByType(TextInput).props.value).toBe('Unsent synthetic note');
  expect(tree.root.findByType(DraftCard).props.draft.amountCents).toBe(12345);
  expect(mockSource.save).not.toHaveBeenCalled();
  mockSource = { ...mockSource, contextKey: 'recovery-user:space-b' };
  await act(async () => tree.update(<AskScreen />));
  expect(tree.root.findByType(TextInput).props.value).toBe(''); expect(tree.root.findAllByType(DraftCard)).toHaveLength(0);
  mockSource = { ...mockSource, contextKey: 'other-user:space-a' };
  await act(async () => tree.update(<AskScreen />));
  expect(tree.root.findByType(TextInput).props.value).toBe(''); expect(tree.root.findAllByType(DraftCard)).toHaveLength(0);
});
it('claims Save synchronously so duplicate callbacks cannot submit twice', async () => {
  let finish!: (v: any) => void;
  (mockSource.save as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await mount(); await draft(); const save = tree.root.findByType(DraftCard).props.onSave;
  await act(async () => { void save(); void save(); });
  expect(mockSource.save).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ undo: async () => {} }); });
  expect(tree.root.findByType(DraftCard).props.status).toBe('saved');
});
it('ignores old save callbacks and late completion after switching space', async () => {
  let finish!: (v: any) => void; const submit = mockSource.save as jest.Mock;
  submit.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await mount(); await draft(); const stale = tree.root.findByType(DraftCard).props.onSave;
  await act(async () => { void stale(); });
  mockSource = { ...mockSource, contextKey: 'recovery-user:space-new' };
  await act(async () => tree.update(<AskScreen />));
  await act(async () => { void stale(); finish({ undo: async () => {} }); });
  expect(submit).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByType(DraftCard)).toHaveLength(0);
  expect(tree.root.findByType(TextInput).props.value).toBe('');
});
it('does not restore discarded or confirmed saved cards as unsaved drafts', async () => {
  await mount(); await draft();
  await act(async () => tree.root.findByType(DraftCard).props.onDiscard());
  await reopen(); expect(tree.root.findAllByType(DraftCard)).toHaveLength(0);
  await draft(); await act(async () => { await tree.root.findByType(DraftCard).props.onSave(); });
  await reopen(); expect(tree.root.findAllByType(DraftCard)).toHaveLength(0);
});
