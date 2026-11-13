import { pushAvailable } from './push';

jest.mock('expo-notifications', () => ({ setNotificationHandler: jest.fn() }));
jest.mock('expo-device', () => ({}));
jest.mock('expo-router', () => ({ router: {} }));
jest.mock('@/cloud/storage', () => ({ storage: {} }));

it('keeps iPhone alerts on and needs a Firebase config before Android offers them', () => {
  expect(pushAvailable('ios', undefined)).toBe(true);
  expect(pushAvailable('android', undefined)).toBe(false);
  expect(pushAvailable('android', '')).toBe(false);
  expect(pushAvailable('android', './google-services.json')).toBe(true);
});
