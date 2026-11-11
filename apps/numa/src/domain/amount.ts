/**
 * "5,000", "1,234,567.89" and "5 000" are thousands; "0,5", "0,125" and "1234,50" use a decimal comma.
 * A comma is a thousands separator only between groups of three digits after a first group of one to
 * three that does not start with 0. Returns NaN when the text is not a plain amount.
 */
export function parseAmount(text: string): number {
  const compact = text.trim().replace(/\s/g, '');
  const thousands = /^[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(compact);
  const clean = thousands ? compact.replace(/,/g, '') : compact.replace(',', '.');
  return /^\d*\.?\d+$|^\d+\.$/.test(clean) ? Number(clean) : NaN;
}
