import type { FlowLine } from '@/domain/types';

export type SankeyNode = { id: string; label: string; cents: number; y: number; h: number; side: 'left' | 'right'; kind: 'in' | 'out' | 'kept' | 'savings' };
export type Ribbon = { id: string; d: string; kind: SankeyNode['kind'] };
export type SankeyLayout = { width: number; height: number; total: number; left: SankeyNode[]; right: SankeyNode[]; center: { x: number; y: number; h: number }; ribbons: Ribbon[] };

const BAR = 6;

/**
 * A two-sided money split. Left: where money came from. Right: where it went, plus what
 * was kept. When more went out than came in, the gap comes "From savings" on the left,
 * so both sides always add up to the same total and widths stay true to the amounts.
 */
export function layoutSankey(incoming: FlowLine[], outgoing: FlowLine[], width: number, height: number, gap = 6): SankeyLayout {
  const inTotal = incoming.reduce((s, l) => s + l.cents, 0);
  const outTotal = outgoing.reduce((s, l) => s + l.cents, 0);
  const left: Omit<SankeyNode, 'y' | 'h'>[] = incoming.map((l) => ({ id: l.id, label: l.label, cents: l.cents, side: 'left', kind: 'in' }));
  const right: Omit<SankeyNode, 'y' | 'h'>[] = outgoing.map((l) => ({ id: l.id, label: l.label, cents: l.cents, side: 'right', kind: 'out' }));
  if (inTotal > outTotal) right.push({ id: 'kept', label: 'Kept', cents: inTotal - outTotal, side: 'right', kind: 'kept' });
  if (outTotal > inTotal) left.push({ id: 'savings', label: 'From savings', cents: outTotal - inTotal, side: 'left', kind: 'savings' });
  const total = Math.max(inTotal, outTotal);
  const empty: SankeyLayout = { width, height, total: 0, left: [], right: [], center: { x: width / 2 - BAR / 2, y: 0, h: 0 }, ribbons: [] };
  if (total <= 0) return empty;

  const usable = Math.max(1, height - gap * (Math.max(left.length, right.length) - 1));
  const scale = usable / total;
  const stack = (nodes: Omit<SankeyNode, 'y' | 'h'>[]) => {
    const used = nodes.reduce((s, n) => s + n.cents * scale, 0) + gap * (nodes.length - 1);
    let y = (height - used) / 2;
    return nodes.map((n) => { const h = Math.max(1, n.cents * scale); const node = { ...n, y, h }; y += h + gap; return node; });
  };
  const L = stack(left), R = stack(right);
  const centerH = total * scale;
  const center = { x: width / 2 - BAR / 2, y: (height - centerH) / 2, h: centerH };

  // A band from (x0, y0..y0+h0) to (x1, y1..y1+h1) with soft S-curves.
  const band = (x0: number, y0: number, x1: number, y1: number, h: number) => {
    const mx = (x0 + x1) / 2;
    return `M${x0} ${y0} C${mx} ${y0} ${mx} ${y1} ${x1} ${y1} L${x1} ${y1 + h} C${mx} ${y1 + h} ${mx} ${y0 + h} ${x0} ${y0 + h} Z`;
  };
  const ribbons: Ribbon[] = [];
  let cy = center.y;
  for (const n of L) { const h = n.cents * scale; ribbons.push({ id: n.id, kind: n.kind, d: band(BAR, n.y, center.x, cy, h) }); cy += h; }
  cy = center.y;
  for (const n of R) { const h = n.cents * scale; ribbons.push({ id: n.id, kind: n.kind, d: band(center.x + BAR, cy, width - BAR, n.y, h) }); cy += h; }
  return { width, height, total, left: L, right: R, center, ribbons };
}
