/** Entry accepts decimal dots or commas, but never guesses grouping or rounds cents. */
export function parseEntryAmount(raw: string): number | null {
  const value = raw.trim();
  if (!/^(?:\d+(?:[.,]\d{1,2})?|[.,]\d{1,2})$/.test(value)) return null;
  const amount = Number(value.replace(",", "."));
  return Number.isFinite(amount) && amount > 0 && amount <= 90_000_000_000 ? amount : null;
}

export type EntryLine = { description: string; amount: number };

/** Every nonempty item is either reviewable or an error; none silently disappear. */
export function parseEntryBatch(text: string) {
  const entries: EntryLine[] = [];
  const errors: string[] = [];
  // Keep decimal commas intact. A comma before a description also accepts the
  // previous "coffee 5.50, groceries 80" format; new examples prefer new lines.
  const lines = text.split(/\n|,\s+|,(?=[^\d\s])/).map(line => line.trim()).filter(Boolean);
  lines.forEach((line, index) => {
    const match = /^(.+?)\s+(\S+)$/.exec(line);
    const amount = match ? parseEntryAmount(match[2]!) : null;
    if (!match || match[1]!.includes(",") || amount === null) errors.push(`Item ${index + 1}: add a description and a positive amount, for example Coffee 5.50.`);
    else entries.push({ description: match[1]!.trim(), amount });
  });
  return { entries, errors, valid: entries.length > 0 && errors.length === 0 };
}

export function localEntryDate(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function validEntryDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year!, month! - 1, day!, 12);
  return date.getFullYear() === year && date.getMonth() === month! - 1 && date.getDate() === day;
}
