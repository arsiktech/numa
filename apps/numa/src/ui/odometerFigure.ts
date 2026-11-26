export const GLYPH_BOX = 1.4;

export type FigureColumn =
  | { key: string; kind: 'mark'; char: string }
  | { key: string; kind: 'digit'; digit: number };

/**
 * The clipping box has to hold Manrope's full em (about 1.37) or the top of a settled
 * figure is cut off. `trim` is the empty leading that used to be cancelled with a negative margin.
 */
export function glyphMetrics(fontSize: number, lineHeight: number): { textBox: number; trim: number } {
  const textBox = Math.ceil(Math.max(lineHeight, fontSize * GLYPH_BOX));
  return { textBox, trim: (textBox - lineHeight) / 2 };
}

/**
 * Places in a formatted amount. The currency and sign stay on the left. Digits and
 * separators are counted from the right, so a shorter amount drops a leading place
 * instead of turning the comma into a digit.
 */
export function figureColumns(text: string): FigureColumn[] {
  const chars = [...text];
  const firstDigit = chars.findIndex((char) => /\d/.test(char));
  const split = firstDigit < 0 ? chars.length : firstDigit;
  const columns: FigureColumn[] = chars.slice(0, split).map((char, index) => ({ key: `pre:${index}:${char}`, kind: 'mark', char }));
  const body = chars.slice(split);
  body.forEach((char, index) => {
    const place = body.length - 1 - index;
    if (/\d/.test(char)) columns.push({ key: `d:${place}`, kind: 'digit', digit: Number(char) });
    else columns.push({ key: `m:${place}:${char}`, kind: 'mark', char });
  });
  return columns;
}
