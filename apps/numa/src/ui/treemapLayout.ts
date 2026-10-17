/** A rectangle in the treemap, in the same units as the box it was laid out in. */
export type Tile = { index: number; x: number; y: number; w: number; h: number };

const worst = (row: number[], side: number) => {
  const sum = row.reduce((t, v) => t + v, 0);
  const max = Math.max(...row), min = Math.min(...row);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
};

/**
 * Squarified treemap: each value gets an area in proportion to it, with tiles kept as close to
 * square as possible so small ones stay readable. Values must be positive; order is kept.
 */
export function squarify(values: number[], width: number, height: number): Tile[] {
  const total = values.reduce((t, v) => t + v, 0);
  if (!(total > 0) || width <= 0 || height <= 0) return [];
  const scale = (width * height) / total;
  const items = values.map((v, index) => ({ index, area: v * scale }));
  const tiles: Tile[] = [];
  let x = 0, y = 0, w = width, h = height;
  let i = 0;
  while (i < items.length) {
    const side = Math.min(w, h);
    const row = [items[i]];
    i += 1;
    while (i < items.length && worst([...row, items[i]].map((r) => r.area), side) <= worst(row.map((r) => r.area), side)) { row.push(items[i]); i += 1; }
    const sum = row.reduce((t, r) => t + r.area, 0);
    if (w >= h) {
      // A column along the left edge.
      const cw = sum / h;
      let cy = y;
      for (const r of row) { const rh = r.area / cw; tiles.push({ index: r.index, x, y: cy, w: cw, h: rh }); cy += rh; }
      x += cw; w -= cw;
    } else {
      const rh = sum / w;
      let cx = x;
      for (const r of row) { const rw = r.area / rh; tiles.push({ index: r.index, x: cx, y, w: rw, h: rh }); cx += rw; }
      y += rh; h -= rh;
    }
  }
  return tiles.sort((a, b) => a.index - b.index);
}
