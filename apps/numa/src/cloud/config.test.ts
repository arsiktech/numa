import { siteUrlOf } from './config';

describe('siteUrlOf', () => {
  it('maps a Convex cloud address to its site twin', () => {
    expect(siteUrlOf('https://happy-animal-123.convex.cloud')).toBe('https://happy-animal-123.convex.site');
    expect(siteUrlOf('https://happy-animal-123.eu-west-1.convex.cloud')).toBe('https://happy-animal-123.eu-west-1.convex.site');
  });

  it('gives nothing for a backend whose HTTP address it cannot know', () => {
    expect(siteUrlOf('http://127.0.0.1:3210')).toBeNull();
    expect(siteUrlOf('https://backend.example.com')).toBeNull();
    expect(siteUrlOf(null)).toBeNull();
  });
});
