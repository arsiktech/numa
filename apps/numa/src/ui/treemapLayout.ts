/** A rectangle in the treemap, in the same units as the box it was laid out in. */
export type Tile = { index: number; x: number; y: number; w: number; h: number };

const worst = (row: number[], side: number) => {
  const sum = row.reduce((t, v) => t + v, 0);
  const max = Math.max(...row), min = Math.min(...row);
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
};

/** Squarified areas, keeping source indices and ignoring nonpositive or nonfinite values. */
export function squarify(values: number[], width: number, height: number): Tile[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return [];
  const positive = values.map((v, index) => ({ index, value: Number.isFinite(v) && v > 0 ? v : 0 })).filter((r) => r.value > 0);
  const max = positive.reduce((m, r) => Math.max(m, r.value), 0);
  if (!max) return [];
  const total = positive.reduce((sum, r) => sum + r.value / max, 0);
  const items = positive.map((r) => ({ index: r.index, area: (r.value / max / total) * width * height })).filter((r) => r.area > 0);
  const tiles: Tile[] = [];
  let x = 0, y = 0, w = width, h = height, i = 0;
  while (i < items.length && w > 0 && h > 0) {
    const side = Math.min(w, h);
    const row = [items[i++]];
    while (i < items.length && worst([...row, items[i]].map((r) => r.area), side) <= worst(row.map((r) => r.area), side)) row.push(items[i++]);
    const sum = row.reduce((t, r) => t + r.area, 0);
    if (w >= h) {
      const right = i === items.length ? width : Math.min(width, x + sum / h);
      const cw = right - x;
      let cy = y;
      row.forEach((r, j) => {
        const bottom = j === row.length - 1 ? height : Math.min(height, cy + r.area / cw);
        tiles.push({ index: r.index, x, y: cy, w: cw, h: Math.max(0, bottom - cy) });
        cy = bottom;
      });
      x = right; w = width - x;
    } else {
      const bottom = i === items.length ? height : Math.min(height, y + sum / w);
      const rh = bottom - y;
      let cx = x;
      row.forEach((r, j) => {
        const right = j === row.length - 1 ? width : Math.min(width, cx + r.area / rh);
        tiles.push({ index: r.index, x: cx, y, w: Math.max(0, right - cx), h: rh });
        cx = right;
      });
      y = bottom; h = height - y;
    }
  }
  return tiles.sort((a, b) => a.index - b.index);
}
