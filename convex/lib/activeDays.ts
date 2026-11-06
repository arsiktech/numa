const DAY = 86_400_000;
export function utcDate(at: number): string {
  if (!Number.isFinite(at)) throw new Error("A valid timestamp is required");
  return new Date(at).toISOString().slice(0, 10);
}
function dayNumber(day: string): number {
  const at = Date.parse(day + "T00:00:00Z");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(at) || utcDate(at) !== day) throw new Error("A valid UTC date is required");
  return Math.floor(at / DAY);
}
export type ActiveDay = { userId: string; utcDate: string };
/** Four completed Monday–Sunday UTC weeks. Cohort membership must be explicitly verified, never inferred from a login or email. */
export function activeDayReport(rows: ActiveDay[], asOf: string, outsideHouseholdIds: string[] | null) {
  const today = dayNumber(asOf);
  const end = today - ((new Date(today * DAY).getUTCDay() + 6) % 7);
  const start = end - 28;
  const cohort = outsideHouseholdIds === null ? null : new Set(outsideHouseholdIds);
  const weeks = Array.from({ length: 4 }, (_, i) => ({ from: utcDate((start + i * 7) * DAY), through: utcDate((start + i * 7 + 6) * DAY), users: new Set<string>(), outside: new Set<string>() }));
  for (const row of rows) {
    let day: number;
    try { day = dayNumber(row.utcDate); } catch { continue; }
    if (day < start || day >= end) continue;
    const week = weeks[Math.floor((day - start) / 7)];
    week.users.add(row.userId);
    if (cohort?.has(row.userId)) week.outside.add(row.userId);
  }
  const retained = cohort === null ? null : [...cohort].filter(id => weeks.filter(w => w.outside.has(id)).length >= 3).length;
  return {
    asOf, window: { from: utcDate(start * DAY), through: utcDate((end - 1) * DAY) },
    weeks: weeks.map(w => ({ from: w.from, through: w.through, activeUsers: w.users.size, outsideHouseholdActiveUsers: cohort === null ? null : w.outside.size })),
    retainedOutsideHousehold: retained, gateTarget: 10, gateMet: retained === null ? null : retained >= 10,
    cohortVerified: cohort !== null,
    interpretation: "Distinct signed-in users in completed UTC weeks. Three of four weeks is retained. No historical activity is inferred before collection; outside-household status requires an explicitly verified cohort.",
  };
}
