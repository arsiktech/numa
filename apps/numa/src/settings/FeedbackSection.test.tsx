import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';

import { FeedbackSection } from './FeedbackSection';

let mockMe: { id: string } | undefined = { id: 'u1' };
const mockSend = jest.fn();
const mockToast = jest.fn();

jest.mock('convex/react', () => ({ useQuery: () => mockMe, useMutation: () => mockSend }));
jest.mock('@/cloud/api', () => ({ cloud: { me: 'me', sendFeedback: 'send-feedback' } }));
jest.mock('expo-constants', () => ({ expoConfig: { version: '1.0.0' } }));
jest.mock('@/ui/Toast', () => ({ useToast: () => mockToast }));
jest.mock('@/theme/theme', () => ({ useTheme: () => ({ c: { bg: '#000', ink: '#fff', ink3: '#777', s1: '#111', s2: '#222', line: '#333', line2: '#444', down: '#f55' } }) }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let tree: TestRenderer.ReactTestRenderer | undefined;
afterEach(() => { if (tree) act(() => tree?.unmount()); tree = undefined; mockMe = { id: 'u1' }; mockSend.mockReset(); mockToast.mockReset(); });

const button = (label: string) => tree!.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.findAll((x) => x.props.children === label).length > 0)[0];
const press = async (label: string) => { await act(async () => { button(label).props.onPress(); }); };
const type = (text: string) => act(() => { tree!.root.findByType(TextInput).props.onChangeText(text); });
const sentIds = () => mockSend.mock.calls.map(([args]) => args.clientMutationId);

async function openForm() {
  act(() => { tree = TestRenderer.create(<FeedbackSection />); });
  await press('Send feedback');
}

describe('FeedbackSection', () => {
  it('reuses the request id for an unchanged retry and takes a new one once the text is edited', async () => {
    mockSend.mockRejectedValue(new Error('offline'));
    await openForm();
    type('The chart is slow');
    await press('Send');
    await press('Send');
    type('The chart is slow on web');
    await press('Send');
    const [first, retry, edited] = sentIds();
    expect(retry).toBe(first);
    expect(edited).not.toBe(first);
    expect(mockSend.mock.calls[2][0]).toMatchObject({ message: 'The chart is slow on web' });
  });

  it('keeps Send disabled until the account has loaded', async () => {
    mockMe = undefined;
    await openForm();
    type('An idea');
    expect(button('Send').props.disabled).toBe(true);
  });
});
