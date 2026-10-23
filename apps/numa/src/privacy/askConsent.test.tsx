import React from 'react';
import { ScrollView, TextInput } from 'react-native';
import AskScreen from '@/app/ask';
import { AISharingActions, AISharingPanel } from './AISharingPanel';
import { DraftCard } from '@/ask/DraftCard';
import type { AskSource } from '@/ask/useAskSource';

const renderer = jest.requireActual('react-test-renderer');
const { act, create } = renderer;
let mockSource: Extract<AskSource, { status: 'ready' }>;
jest.mock('@/cloud/session', () => ({ useSession: () => ({ kind: 'signedIn' }) }));
jest.mock('@/ask/useAskSource', () => ({ useCloudAskSource: () => mockSource, useDemoAskSource: () => mockSource }));
jest.mock('@/theme/theme', () => ({ useTheme: () => ({ c: new Proxy({}, { get: () => '#111111' }) }) }));
jest.mock('@/ui/money', () => ({ useMoney: () => ({ mask: (s: string) => s }) }));
jest.mock('@/ui/Panel', () => ({ PanelFrame: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('expo-router', () => ({ router: { canGoBack: () => false, back: jest.fn(), replace: jest.fn() } }));
jest.mock('react-native-svg', () => ({ __esModule: true, default: () => null, Path: () => null }));
jest.mock('@/ask/DraftCard', () => ({ DraftCard: () => null }));

let tree: any;
const question = 'Explain the tradeoffs in these made-up numbers';
beforeEach(() => {
  jest.useFakeTimers(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const state = { userId: 'user', requiredVersion: 'current', allowed: false, granted: false, decidedAt: null, deletionPending: false, deletionStarted: false, reason: 'permission-required' as const,
    disclosure: { title: 'Choose AI', recipients: 'Anthropic', data: 'Synthetic selected-space summary', purpose: 'Draft only', withdrawal: 'Turn off in Settings', retention: 'Provider policies apply', alternative: 'Manual entries still work', links: [] } };
  mockSource = { status: 'ready', demo: false, contextKey: 'user:space', ctx: { currency: 'EUR', now: new Date(), categories: [], assets: [], liabilities: [], holdings: [] }, answers: {} as any,
    save: jest.fn(async () => ({ undo: async () => {} })), ai: jest.fn(async () => ({ status: 'ok' as const, text: 'Synthetic reply', proposals: [] })),
    sharing: { state, read: jest.fn(async () => state), change: jest.fn(async () => ({ ...state, allowed: true, granted: true, reason: null })) } };
});
afterEach(async () => { if (tree) await act(async () => { tree.unmount(); }); tree = null; jest.clearAllTimers(); jest.useRealTimers(); });
async function mount() { await act(async () => { tree = create(<AskScreen />); }); }
async function enter(value: string) {
  await act(async () => { tree.root.findByType(TextInput).props.onChangeText(value); });
  await act(async () => { tree.root.findByType(TextInput).props.onSubmitEditing(); });
}

describe('actual Ask screen sharing interactions', () => {
  function footerCallbacks() {
    return tree.root.findByProps({ testID: 'ai-consent-footer' }).findByType(AISharingActions).props;
  }
  it('serializes cancel before a stale approval callback in the same React batch', async () => {
    await mount(); await enter(question);
    const { onCancel, onAllow } = footerCallbacks();
    await act(async () => { onCancel(); onAllow(); });
    expect(mockSource.sharing!.change).not.toHaveBeenCalled();
    expect(mockSource.ai).not.toHaveBeenCalled();
    expect(tree.root.findByType(TextInput).props.value).toBe(question);
  });
  it('ignores a queued cancel after approval has synchronously claimed the decision', async () => {
    let finish!: (value: any) => void;
    (mockSource.sharing!.change as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await mount(); await enter(question);
    const { onAllow, onCancel } = footerCallbacks();
    await act(async () => { onAllow(); onCancel(); });
    expect(mockSource.sharing!.change).toHaveBeenCalledTimes(1);
    expect(mockSource.ai).not.toHaveBeenCalled();
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(footerCallbacks().busy).toBe(true);
    await act(async () => { finish({ ...mockSource.sharing!.state, allowed: true }); });
    expect(mockSource.ai).toHaveBeenCalledTimes(1);
    expect((mockSource.ai as jest.Mock).mock.calls[0][0]).toBe(question);
    expect(tree.root.findByType(TextInput).props.value).toBe('');
  });
  it('cannot reuse canceled footer callbacks for a new decision with the same question', async () => {
    await mount(); await enter(question);
    const stale = footerCallbacks();
    await act(async () => { stale.onCancel(); });
    await enter(question);
    await act(async () => { stale.onCancel(); stale.onAllow(); });
    expect(mockSource.sharing!.change).not.toHaveBeenCalled();
    expect(mockSource.ai).not.toHaveBeenCalled();
    expect(footerCallbacks().busy).toBe(false);
    await act(async () => { footerCallbacks().onCancel(); });
    expect(tree.root.findByType(TextInput).props.value).toBe(question);
  });
  it('reopens the same decision after a failed approval and sends once on explicit retry', async () => {
    (mockSource.sharing!.change as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await mount(); await enter(question);
    await act(async () => { footerCallbacks().onAllow(); });
    expect(footerCallbacks().busy).toBe(false);
    expect(footerCallbacks().error).toContain('wasn’t sent');
    expect(mockSource.ai).not.toHaveBeenCalled();
    await act(async () => { footerCallbacks().onAllow(); });
    expect(mockSource.sharing!.change).toHaveBeenCalledTimes(2);
    expect(mockSource.ai).toHaveBeenCalledTimes(1);
    expect(tree.root.findByType(TextInput).props.value).toBe('');
  });

  it('keeps an unconsented question unsent and restores it after Not now', async () => {
    await mount(); await enter(question);
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    expect(tree.root.findByProps({ testID: 'ai-consent-footer' }).findAllByType(AISharingActions)).toHaveLength(1);
    expect(tree.root.findByType(ScrollView).findAllByType(AISharingActions)).toHaveLength(0);
    expect(mockSource.ai).not.toHaveBeenCalled(); expect(mockSource.sharing!.change).not.toHaveBeenCalled();
    await act(async () => { tree.root.findByType(AISharingActions).props.onCancel(); });
    expect(tree.root.findByType(TextInput).props.value).toBe(question); expect(mockSource.ai).not.toHaveBeenCalled();
  });
  it('waits for permission confirmation and rejects duplicate approval clicks', async () => {
    let finish!: (value: any) => void;
    (mockSource.sharing!.change as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await mount(); await enter(question);
    const allow = tree.root.findByType(AISharingActions).props.onAllow;
    await act(async () => { allow(); allow(); });
    expect(mockSource.sharing!.change).toHaveBeenCalledTimes(1); expect(mockSource.ai).not.toHaveBeenCalled();
    await act(async () => { finish({ ...mockSource.sharing!.state, allowed: true }); });
    expect(mockSource.ai).toHaveBeenCalledTimes(1);
    expect((mockSource.ai as jest.Mock).mock.calls[0][0]).toBe(question);
    expect(tree.root.findByType(TextInput).props.value).toBe('');
  });
  it('keeps the question after an ambiguous or failed choice mutation', async () => {
    (mockSource.sharing!.change as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await mount(); await enter(question);
    await act(async () => { tree.root.findByType(AISharingActions).props.onAllow(); });
    expect(tree.root.findByType(AISharingActions).props.error).toContain('wasn’t sent'); expect(mockSource.ai).not.toHaveBeenCalled();
    await act(async () => { tree.root.findByType(AISharingActions).props.onCancel(); });
    expect(tree.root.findByType(TextInput).props.value).toBe(question);
  });
  it('does not send after leaving the view while approval is pending', async () => {
    let finish!: (value: any) => void; const ai = mockSource.ai;
    (mockSource.sharing!.change as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await mount(); await enter(question);
    await act(async () => { tree.root.findByType(AISharingActions).props.onAllow(); });
    await act(async () => { tree.unmount(); }); tree = null;
    await act(async () => { finish({ ...mockSource.sharing!.state, allowed: true }); });
    expect(ai).not.toHaveBeenCalled();
  });
  it('does not send an old question into a changed account or selected space', async () => {
    let finish!: (value: any) => void; const ai = mockSource.ai;
    (mockSource.sharing!.change as jest.Mock).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await mount(); await enter(question);
    await act(async () => { tree.root.findByType(AISharingActions).props.onAllow(); });
    mockSource = { ...mockSource, contextKey: 'other:space' };
    await act(async () => { tree.update(<AskScreen />); });
    await act(async () => { finish({ ...mockSource.sharing!.state, allowed: true }); });
    expect(ai).not.toHaveBeenCalled(); expect(tree.root.findByType(TextInput).props.value).toBe('');
  });
  it('blocks remote questions during deletion while preserving their text', async () => {
    mockSource.sharing!.state = { ...mockSource.sharing!.state!, deletionPending: true };
    await mount(); await enter(question);
    expect(mockSource.ai).not.toHaveBeenCalled(); expect(tree.root.findAllByType(AISharingPanel)).toHaveLength(0);
    expect(tree.root.findByType(TextInput).props.value).toBe(question);
  });
  it('still drafts a manual entry without AI permission and saves only after confirmation', async () => {
    await mount(); await enter('I have 100 in savings');
    expect(mockSource.ai).not.toHaveBeenCalled(); expect(mockSource.sharing!.change).not.toHaveBeenCalled();
    expect(mockSource.save).not.toHaveBeenCalled(); expect(tree.root.findAllByType(DraftCard)).toHaveLength(1);
    await act(async () => { tree.root.findByType(DraftCard).props.onSave(); });
    expect(mockSource.save).toHaveBeenCalledTimes(1);
  });
});
