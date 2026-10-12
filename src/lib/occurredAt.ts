/**
 * Convert a `yyyy-MM-dd` date-input string into a timestamp anchored at LOCAL
 * noon. A bare date string parsed via `new Date(iso)` is interpreted as UTC
 * midnight, which renders one day earlier for every user west of UTC (all of
 * the Americas) once formatted back in local time. Anchoring at local noon
 * keeps the displayed day stable in every timezone (both positive and negative
 * UTC offsets).
 */
export function occurredAtFromIsoDate(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0).getTime();
}
