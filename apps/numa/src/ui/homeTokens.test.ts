import { readFileSync } from 'fs';
import { join } from 'path';

import { homeColors, space } from '@/theme/tokens';

/**
 * Home and the frame around it (sidebar, top bar, phone capsule) use only the Home core set:
 * five colours, the spacing scale and the type variants. A failure names the file and the value.
 */
const files = [
  'app/(tabs)/index.tsx',
  'ui/CompositionBar.tsx', 'ui/LensBar.tsx', 'ui/LensReadout.tsx', 'ui/ScrubChart.tsx',
  'ui/NeedsYou.tsx', 'ui/TeaserCard.tsx', 'ui/MonthTeaser.tsx', 'loans/MoneyMapTeaser.tsx', 'earnings/EarningsTeaser.tsx',
  'ui/LiquidBreakdown.tsx', 'ui/CoachTip.tsx', 'ui/ProBadge.tsx', 'ui/Nav.tsx', 'ui/PinnedScreen.tsx',
];
const read = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
const allowed = new Set<string>(homeColors);
const steps = new Set<number>([0, ...Object.values(space)]);

describe('Home core set', () => {
  it.each(files)('%s uses only the five Home colours', (f) => {
    const src = read(f);
    expect(src.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) ?? []).toEqual([]);
    const used = [
      ...[...src.matchAll(/\bc\.(\w+)/g)].map((m) => m[1]),
      ...[...src.matchAll(/\bc="(\w+)"/g)].map((m) => m[1]),
      ...[...src.matchAll(/\bc=\{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/'(\w+)'/g)].map((q) => q[1])),
    ];
    expect(used.filter((k) => !allowed.has(k))).toEqual([]);
  });

  it.each(files)('%s spaces with the scale and sizes text with the type variants', (f) => {
    const src = read(f);
    const off = [...src.matchAll(/\b(margin\w*|padding\w*|gap|rowGap|columnGap)\s*:\s*(-?\d+(?:\.\d+)?)\b/g)]
      .filter((m) => !steps.has(Math.abs(Number(m[2])))).map((m) => `${m[1]}: ${m[2]}`);
    expect(off).toEqual([]);
    expect(src.match(/fontSize\s*:/g) ?? []).toEqual([]);
  });

  it('draws no gradients', () => {
    for (const f of files) expect(read(f)).not.toMatch(/Gradient/);
  });
});
