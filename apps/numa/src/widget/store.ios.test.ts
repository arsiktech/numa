import { ExtensionStorage } from '@bacons/apple-targets';

import { sampleInput } from './fixtures';
import { widgetPayload } from './payload';
import { writeWidget } from './store.ios';

const mockSet = jest.fn();
jest.mock('@bacons/apple-targets', () => ({
  ExtensionStorage: Object.assign(jest.fn().mockImplementation(() => ({ set: (...args: unknown[]) => mockSet(...args) })), { reloadWidget: jest.fn() }),
}));

beforeEach(() => { jest.clearAllMocks(); mockSet.mockReset(); });

it('removes personal data before writing and reloads every gallery kind through the existing storage API', () => {
  const payload = widgetPayload(sampleInput());
  writeWidget(payload);
  expect(mockSet.mock.calls).toEqual([['numa.widget', undefined], ['numa.widget', JSON.stringify(payload)]]);
  expect(ExtensionStorage.reloadWidget).toHaveBeenCalledWith();
  mockSet.mockClear();
  writeWidget(null);
  expect(mockSet.mock.calls).toEqual([['numa.widget', undefined]]);
});

it('retries removal after a failed replacement and still requests a widget reload', () => {
  mockSet.mockImplementationOnce(() => undefined).mockImplementationOnce(() => { throw new Error('Example disk failure'); });
  expect(() => writeWidget(widgetPayload(sampleInput()))).not.toThrow();
  expect(mockSet).toHaveBeenLastCalledWith('numa.widget', undefined);
  expect(ExtensionStorage.reloadWidget).toHaveBeenCalledTimes(1);
});
