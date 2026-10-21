import { barRects, falloff, hitTestOriginal, lensTarget, lensTreemap, lensWidths, mixGeometry, packRects, proportionalWidths, stepFocus } from './lens';
import { squarify, type Tile } from './treemapLayout';

const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
const unpack = (packed: number[]): Tile[] => Array.from({ length: (packed.length - 1) / 4 }, (_, i) => ({ index: i, x: packed[1 + i * 4], y: packed[2 + i * 4], w: packed[3 + i * 4], h: packed[4 + i * 4] }));

function expectPartition(rects: Tile[], width: number, height: number) {
  expect(sum(rects.map((r) => r.w * r.h))).toBeCloseTo(width * height, 5);
  rects.forEach((r) => {
    expect([r.x, r.y, r.w, r.h].every(Number.isFinite)).toBe(true);
    expect(Math.min(r.x, r.y, r.w, r.h)).toBeGreaterThanOrEqual(-1e-8);
    expect(r.x + r.w).toBeLessThanOrEqual(width + 1e-8);
    expect(r.y + r.h).toBeLessThanOrEqual(height + 1e-8);
  });
  let maxOverlap = 0;
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    const overlap = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    maxOverlap = Math.max(maxOverlap, overlap);
  }
  expect(maxOverlap).toBeLessThan(1e-7);
}

describe('bar lens', () => {
  it('preserves the row width and a readable minimum at every focus, including the edges', () => {
    const values = [800_000, 1, 9, 150_000, 2, 1];
    for (let focus = 0; focus < values.length; focus++) {
      const widths = lensWidths(values, 360, focus, 150);
      expect(sum(widths)).toBeCloseTo(360, 8);
      expect(widths[focus]).toBeGreaterThanOrEqual(150 - 1e-8);
      expect(widths.every((w) => Number.isFinite(w) && w >= 0)).toBe(true);
    }
  });
  it('keeps the shared falloff monotonic and symmetric', () => {
    const strengths = [0, 1, 2, 3, 4, 5].map((d) => falloff(d, 5));
    expect(strengths[0]).toBe(1);
    expect(strengths[5]).toBe(0);
    strengths.slice(1).forEach((v, i) => expect(v).toBeLessThan(strengths[i]));
    expect(falloff(-2, 5)).toBe(falloff(2, 5));
    expect(falloff(NaN, 5)).toBe(0);
    expect(falloff(1, 0)).toBe(0);
  });
  it('widens equal neighbours in decreasing order of distance', () => {
    const widths = lensWidths([1, 1, 1, 1, 1, 1, 1], 350, 3, 130);
    expect(widths[3]).toBeGreaterThan(widths[2]);
    expect(widths[2]).toBeGreaterThan(widths[1]);
    expect(widths[1]).toBeGreaterThan(widths[0]);
    expect(widths[2]).toBeCloseTo(widths[4], 8);
  });
  it('handles no values, one value, zero width and invalid money without NaN', () => {
    expect(lensWidths([], 300, 0)).toEqual([]);
    expect(lensWidths([1], 300, 0, 500)).toEqual([300]);
    expect(lensWidths([0, -1, NaN, Infinity], 300, 0)).toEqual([0, 0, 0, 0]);
    expect(lensWidths([1, 2], 0, 1)).toEqual([0, 0]);
    expect(lensWidths([1, 2], NaN, 1)).toEqual([0, 0]);
    const ignored = lensWidths([0, 4, -2, 6], 300, 0);
    expect(ignored[0]).toBe(0); expect(ignored[2]).toBe(0);
    expect(ignored[1]).toBeCloseTo(120, 8); expect(ignored[3]).toBeCloseTo(180, 8);
    expect(sum(lensWidths([Number.MAX_VALUE, Number.MAX_VALUE], 300, 0))).toBeCloseTo(300);
  });
  it('retains every tiny original hit target while another drawing is enlarged', () => {
    const values = [1_000_000, 1, 2, 3, 4, 1];
    const rest = barRects(proportionalWidths(values, 360), 60);
    for (const current of rest) {
      lensWidths(values, 360, current.index);
      for (const r of rest) expect(hitTestOriginal(rest, 360, 60, r.x + r.w / 2, 30)).toBe(r.index);
    }
    expect(hitTestOriginal(rest, 360, 60, 360, 60)).toBe(values.length - 1);
    expect(hitTestOriginal(rest, 360, 60, 500, 30)).toBe(values.length - 1);
    expect(hitTestOriginal(rest, 360, 60, -10, 30)).toBe(0);
  });
});

describe('treemap lens and stable selection', () => {
  it('keeps true geometry with reduced motion and on release while leaving the focus selectable', () => {
    const rest = squarify([1000, 1, 0.1], 360, 190);
    expect(lensTarget(rest, 360, 190, 2, true, true, 'map')).toBe(rest);
    expect(lensTarget(rest, 360, 190, 2, false, false, 'map')).toBe(rest);
    const bars = barRects(proportionalWidths([1000, 1, 0.1], 360), 60);
    expect(lensTarget(bars, 360, 60, 2, true, true, 'bar')).toBe(bars);
    expect(lensTarget(bars, 360, 60, 2, false, false, 'bar')).toBe(bars);
    expect(stepFocus(1, 1, 3)).toBe(2);
  });
  it('keeps an exact partition and a readable focus for each tile', () => {
    const rest = squarify([900, 300, 20, 1, 1, 0.01], 360, 200);
    expectPartition(rest, 360, 200);
    for (const r of rest) {
      const result = lensTreemap(rest, 360, 200, r.index, 144, 80);
      expectPartition(result, 360, 200);
      expect(result[r.index].w).toBeGreaterThanOrEqual(144 - 1e-7);
      expect(result[r.index].h).toBeGreaterThanOrEqual(80 - 1e-7);
    }
  });
  it('handles many tiny tiles and traverses every one with original hit tests and the browse controls', () => {
    const values = [1_000_000, ...Array.from({ length: 48 }, (_, i) => (i + 1) / 100)];
    const rest = squarify(values, 360, 190);
    expect(rest).toHaveLength(values.length);
    const reached = new Set<number>();
    let index = -1;
    for (let i = 0; i < rest.length; i++) {
      index = stepFocus(index, 1, rest.length); reached.add(index);
      const target = rest[index];
      expect(hitTestOriginal(rest, 360, 190, target.x + target.w / 2, target.y + target.h / 2)).toBe(index);
      const result = lensTreemap(rest, 360, 190, index);
      expectPartition(result, 360, 190);
      expect(result[index].w).toBeGreaterThanOrEqual(360 * 0.42 - 1e-7);
      expect(result[index].h).toBeGreaterThanOrEqual(190 * 0.4 - 1e-7);
    }
    expect(reached.size).toBe(rest.length);
    expect(stepFocus(index, 1, rest.length)).toBe(0);
    for (let i = rest.length - 1; i >= 0; i--) {
      index = stepFocus(index, -1, rest.length);
      expect(index).toBe((i - 1 + rest.length) % rest.length);
    }
  });
  it('can select all tiles touching the exact right and bottom edges, including the corner', () => {
    const rest = squarify([700, 80, 9, 3, 1, 0.1], 320, 180);
    for (const r of rest) {
      if (Math.abs(r.x + r.w - 320) < 1e-8) expect(hitTestOriginal(rest, 320, 180, 320, r.y + r.h / 2)).toBe(r.index);
      if (Math.abs(r.y + r.h - 180) < 1e-8) expect(hitTestOriginal(rest, 320, 180, r.x + r.w / 2, 180)).toBe(r.index);
    }
    const corner = rest.find((r) => Math.abs(r.x + r.w - 320) < 1e-8 && Math.abs(r.y + r.h - 180) < 1e-8)!;
    expect(hitTestOriginal(rest, 320, 180, 320, 180)).toBe(corner.index);
    expect(hitTestOriginal(rest, 320, 180, NaN, 0)).toBe(-1);
  });
  it('handles a single tile, an empty box and invalid source values', () => {
    const one = squarify([5], 300, 170);
    expect(lensTreemap(one, 300, 170, 0)).toEqual(one);
    expect(lensTreemap([], 0, 0, 0)).toEqual([]);
    expect(squarify([0, -4, NaN, Infinity], 300, 170)).toEqual([]);
    expect(squarify([1], Infinity, 170)).toEqual([]);
    const filtered = squarify([0, 2, -1, 3], 300, 170);
    expect(filtered.map((r) => r.index)).toEqual([1, 3]);
    expectPartition(filtered, 300, 170);
    expect(stepFocus(-1, 1, 0)).toBe(-1);
  });
  it('preserves the partition throughout a spring, a retarget and release', () => {
    const rest = squarify([800, 30, 1, 1, 0.01], 350, 190);
    const first = lensTreemap(rest, 350, 190, 4);
    const second = lensTreemap(rest, 350, 190, 2);
    const middle = mixGeometry(packRects(rest), packRects(first), 0.43);
    for (const p of [-0.1, 0, 0.2, 0.7, 1, 1.2]) {
      const redirected = mixGeometry(middle, packRects(second), p);
      expectPartition(unpack(redirected), 350, 190);
      expectPartition(unpack(mixGeometry(redirected, packRects(rest), 0.62)), 350, 190);
    }
  });
});
