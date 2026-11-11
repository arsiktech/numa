import { feedbackCaptureAllowed, sendFeedback, type FeedbackEndpoint } from './feedback-client';
import { feedbackButtonVisible, feedbackEndpointFrom, feedbackFacts, feedbackLocale, shouldCaptureScreenshot } from './gate';

const endpoint: FeedbackEndpoint = { url: 'configured', app: 'numa', key: 'test-key' };

test('feedback stays off unless url, app and key are all set', () => {
  expect(feedbackEndpointFrom({})).toBeNull();
  expect(feedbackEndpointFrom({ url: 'configured', app: 'numa', key: '' })).toBeNull();
  expect(feedbackEndpointFrom({ url: 'configured', app: '  ', key: 'test-key' })).toBeNull();
  expect(feedbackEndpointFrom({ url: '  ', app: 'numa', key: 'test-key' })).toBeNull();
  expect(feedbackEndpointFrom({ url: ' configured ', app: ' numa ', key: ' test-key ' })).toEqual(endpoint);
});

test('the button stays hidden on native, and on web until the service enables it', () => {
  expect(feedbackButtonVisible({ platform: 'web', endpoint: null, enabled: true })).toBe(false);
  expect(feedbackButtonVisible({ platform: 'web', endpoint, enabled: false })).toBe(false);
  expect(feedbackButtonVisible({ platform: 'ios', endpoint, enabled: true })).toBe(false);
  expect(feedbackButtonVisible({ platform: 'android', endpoint, enabled: true })).toBe(false);
  expect(feedbackButtonVisible({ platform: 'web', endpoint, enabled: true })).toBe(true);
});

test('an empty capture list sends notes only', () => {
  const on = { enabled: true, screenshots: true, capture: [] as string[] };
  expect(shouldCaptureScreenshot(on, '/')).toBe(false);
  expect(shouldCaptureScreenshot(on, '/flow')).toBe(false);
  expect(shouldCaptureScreenshot({ enabled: true, screenshots: false, capture: ['/'] }, '/')).toBe(false);
  expect(shouldCaptureScreenshot({ enabled: true, screenshots: true, capture: ['/flow'] }, '/flow')).toBe(true);
  expect(feedbackCaptureAllowed([], '/')).toBe(false);
});

test('facts are locale, theme and role', () => {
  expect(feedbackFacts({ theme: 'dark', role: 'guest' })).toEqual({ theme: 'dark', role: 'guest' });
  expect(feedbackFacts({ locale: 'en-GB', theme: 'light', role: 'member' })).toEqual({ locale: 'en-GB', theme: 'light', role: 'member' });
  expect(Object.keys(feedbackFacts({ locale: 'es', theme: 'dark', role: 'member' })).sort()).toEqual(['locale', 'role', 'theme']);
  expect(feedbackLocale('en-gb')).toBe('en-GB');
  expect(feedbackLocale('es')).toBe('es');
  expect(feedbackLocale('zh-Hans')).toBeUndefined();
});

test('a note is sent without an account id, email or name', async () => {
  Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
  const seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const previous = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: { headers: Record<string, string>; body: string }) => {
    seen.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) as Record<string, unknown> });
    return { ok: true, json: async () => ({ id: 'n1' }) } as Response;
  }) as typeof fetch;
  try {
    const result = await sendFeedback(endpoint, {
      note: '  The chart is hard to read  ',
      path: '/flow?token=secret#section',
      locale: 'en-GB',
      mood: 'neutral',
      context: feedbackFacts({ locale: 'en-GB', theme: 'dark', role: 'guest' }),
    });
    expect(result).toEqual({ ok: true, imageDropped: false });
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe('configured/v1/apps/numa/notes');
    expect(seen[0].headers['x-feedback-key']).toBe('test-key');
    expect(seen[0].body).toEqual({
      note: 'The chart is hard to read',
      path: '/flow',
      locale: 'en-GB',
      mood: 'neutral',
      viewport: { width: 800, height: 600 },
      context: { locale: 'en-GB', theme: 'dark', role: 'guest' },
    });
    expect(seen[0].body).not.toHaveProperty('email');
    expect(seen[0].body).not.toHaveProperty('name');
    expect(seen[0].body).not.toHaveProperty('userId');
    expect(JSON.stringify(seen[0].body)).not.toContain('secret');
  } finally {
    globalThis.fetch = previous;
  }
});
