import { legalPages } from './LegalLinks';

describe('legal links', () => {
  it('leaves Pricing out of the phone apps and links Support', () => {
    for (const os of ['ios', 'android'] as const) {
      expect(legalPages(os).map(([label]) => label)).toEqual(['Privacy', 'Terms', 'Support']);
    }
  });
  it('keeps Pricing on the web', () => {
    expect(legalPages('web').map(([, path]) => path)).toEqual(['/pricing', '/privacy', '/terms', '/support']);
  });
});
