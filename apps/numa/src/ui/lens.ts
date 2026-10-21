import type { Tile } from './treemapLayout';

/** Shared, bounded falloff for both lenses. Distance and radius use the same units. */
export function falloff(distance: number, radius: number): number {
  'worklet';
  if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0) return 0;
  const t = Math.min(1, Math.abs(distance) / radius);
  return (1 + Math.cos(Math.PI * t)) / 2;
}

const positive = (v: number) => {
  'worklet';
  return Number.isFinite(v) && v > 0 ? v : 0;
};

/** Keep indices, including ignored values, and avoid overflowing when values are very large. */
export function proportionalWidths(values: number[], width: number): number[] {
  'worklet';
  const extent = positive(width);
  const max = values.reduce((m, v) => Math.max(m, positive(v)), 0);
  if (!max || !extent) return values.map(() => 0);
  const weights = values.map((v) => positive(v) / max);
  const total = weights.reduce((sum, v) => sum + v, 0);
  const out = weights.map((v) => (v / total) * extent);
  // Correct the largest segment; subtracting rounding from a sliver can make it negative.
  const largest = weights.indexOf(1);
  out[largest] += extent - out.reduce((sum, v) => sum + v, 0);
  return out;
}

/**
 * Magnify an interval of a partition. The interval may cover several segments (a treemap
 * tile crosses other tiles' boundaries). Reserving its minimum preserves the outer box.
 */
function magnifyPartition(lengths: number[], extent: number, first: number, last: number, minimum: number): number[] {
  'worklet';
  const base = proportionalWidths(lengths, extent);
  if (first < 0 || last < first || last >= base.length || !base[first]) return base;
  let start = 0;
  for (let i = 0; i < first; i++) start += base[i];
  let own = 0;
  for (let i = first; i <= last; i++) own += base[i];
  const center = start + own / 2;
  let cursor = 0;
  const boosted = base.map((v) => {
    const mid = cursor + v / 2;
    cursor += v;
    return v * (1 + 3 * falloff(mid - center, Math.max(extent * 0.65, own)));
  });
  const result = proportionalWidths(boosted, extent);
  let focused = 0;
  for (let i = first; i <= last; i++) focused += result[i];
  const target = Math.min(extent, Math.max(own, positive(minimum), focused));
  const rest = extent - focused;
  if (target > focused && rest > 0) {
    for (let i = 0; i < result.length; i++) {
      result[i] = i >= first && i <= last ? result[i] * target / focused : result[i] * (extent - target) / rest;
    }
  }
  return result;
}

/** True proportions at rest; a readable focused block with smoothly weighted neighbours. */
export function lensWidths(values: number[], width: number, focus = -1, minFocus = width * 0.42): number[] {
  'worklet';
  const extent = positive(width);
  return magnifyPartition(values, extent, focus, focus, minFocus);
}

export function barRects(widths: number[], height: number): Tile[] {
  'worklet';
  let x = 0;
  return widths.map((w, index) => {
    const rect = { index, x, y: 0, w: positive(w), h: positive(height) };
    x += rect.w;
    return rect;
  });
}

/**
 * Always hit-test the original, un-gapped layout, never the enlarged drawing. In particular,
 * a sliver stays selectable after its neighbour grows. Outside drags clamp to the box edges.
 */
export function hitTestOriginal(rects: Tile[], width: number, height: number, px: number, py: number): number {
  'worklet';
  if (!Number.isFinite(px) || !Number.isFinite(py) || !(width > 0) || !(height > 0)) return -1;
  const x = Math.max(0, Math.min(width, px)), y = Math.max(0, Math.min(height, py));
  let nearest = -1, distance = Infinity;
  for (const r of rects) {
    if (![r.x, r.y, r.w, r.h].every(Number.isFinite) || r.w <= 0 || r.h <= 0) continue;
    const right = r.x + r.w, bottom = r.y + r.h;
    if (x >= r.x && (x < right || (x === width && right >= width - 1e-7)) &&
        y >= r.y && (y < bottom || (y === height && bottom >= height - 1e-7))) return r.index;
    // Absorb floating point seams as well as drags just outside a measured edge.
    const d = Math.max(r.x - x, 0, x - right) ** 2 + Math.max(r.y - y, 0, y - bottom) ** 2;
    if (d < distance) { nearest = r.index; distance = d; }
  }
  return nearest;
}

/** 44-point previous/next controls provide a stable way to inspect even subpixel tiles. */
export function stepFocus(current: number, direction: -1 | 1, count: number): number {
  'worklet';
  if (!Number.isInteger(count) || count <= 0) return -1;
  if (current < 0 || current >= count) return direction === 1 ? 0 : count - 1;
  return (current + direction + count) % count;
}

function stopsFor(rects: Tile[], extent: number, axis: 'x' | 'y'): number[] {
  'worklet';
  const ends = [0, extent];
  for (const r of rects) ends.push(r[axis], r[axis] + (axis === 'x' ? r.w : r.h));
  const bounded = ends.filter(Number.isFinite).map((v) => Math.max(0, Math.min(extent, v))).sort((a, b) => a - b);
  return bounded.filter((v, i) => i === 0 || v !== bounded[i - 1]);
}

function warp(stops: number[], extent: number, start: number, end: number, minimum: number): number[] {
  'worklet';
  const first = stops.indexOf(Math.max(0, Math.min(extent, start))), last = stops.indexOf(Math.max(0, Math.min(extent, end))) - 1;
  const widths = magnifyPartition(stops.slice(1).map((v, i) => v - stops[i]), extent, first, last, minimum);
  const result = [0];
  for (const w of widths) result.push(result[result.length - 1] + w);
  result[result.length - 1] = extent;
  return result;
}

function mapped(v: number, stops: number[], warped: number[]): number {
  'worklet';
  const exact = stops.indexOf(v);
  if (exact >= 0) return warped[exact];
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i]) return warped[i - 1] + (warped[i] - warped[i - 1]) * (v - stops[i - 1]) / (stops[i] - stops[i - 1]);
  }
  return warped[warped.length - 1];
}

/**
 * A separable 2D fisheye of the squarified partition. Shared boundaries move together, so
 * strips and their tiles grow without holes, overlaps or a change to the box's area. The
 * readout outside the box holds names that cannot fit even in the enlarged rectangle.
 */
export function lensTreemap(rects: Tile[], width: number, height: number, focus: number, minWidth = width * 0.42, minHeight = height * 0.4): Tile[] {
  'worklet';
  const tile = rects.find((r) => r.index === focus);
  if (!tile || !positive(width) || !positive(height)) return rects;
  const xs = stopsFor(rects, width, 'x'), ys = stopsFor(rects, height, 'y');
  const xw = warp(xs, width, tile.x, tile.x + tile.w, minWidth);
  const yw = warp(ys, height, tile.y, tile.y + tile.h, minHeight);
  return rects.map((r) => {
    const x = mapped(r.x, xs, xw), y = mapped(r.y, ys, yw);
    return { index: r.index, x, y, w: Math.max(0, mapped(r.x + r.w, xs, xw) - x), h: Math.max(0, mapped(r.y + r.h, ys, yw) - y) };
  });
}

/** Motion settings affect geometry only; the retained selection/readout is independent. */
export function lensTarget(rects: Tile[], width: number, height: number, focus: number, active: boolean, reduced: boolean, kind: 'bar' | 'map'): Tile[] {
  'worklet';
  if (!active || reduced || focus < 0) return rects;
  return kind === 'map' ? lensTreemap(rects, width, height, focus)
    : barRects(lensWidths(rects.map((r) => r.w), width, focus), height);
}

/** Packed rectangles use one common interpolation phase, including for interrupted springs. */
export function packRects(rects: Tile[]): number[] {
  'worklet';
  // Never length 16: Reanimated treats a 16-element array as a transform matrix.
  const count = rects.reduce((max, r) => Math.max(max, r.index + 1), 0);
  const result = Array.from({ length: 1 + count * 4 }, () => 0);
  for (const r of rects) {
    const offset = 1 + r.index * 4;
    result[offset] = r.x; result[offset + 1] = r.y; result[offset + 2] = r.w; result[offset + 3] = r.h;
  }
  return result;
}

export function mixGeometry(from: number[], to: number[], phase: number): number[] {
  'worklet';
  if (from.length !== to.length) return to;
  const p = Number.isFinite(phase) ? Math.max(0, Math.min(1, phase)) : 1;
  return to.map((v, i) => from[i] + (v - from[i]) * p);
}
