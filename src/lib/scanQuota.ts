const KEY = "numa:scan-quota:v1";
const MONTHLY_LIMIT = 50;

interface QuotaState {
  userId: string;
  month: string; // "YYYY-MM"
  used: number;
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}`;
}

function load(): QuotaState[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QuotaState[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function save(state: QuotaState[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function getScanQuota(userId: string) {
  const month = currentMonth();
  const states = load();
  const entry = states.find((s) => s.userId === userId && s.month === month);
  const used = entry?.used ?? 0;
  return {
    used,
    limit: MONTHLY_LIMIT,
    remaining: Math.max(0, MONTHLY_LIMIT - used),
    month
  };
}

export function incrementScanQuota(userId: string) {
  const month = currentMonth();
  const states = load().filter((s) => s.month === month); // drop stale months
  const idx = states.findIndex((s) => s.userId === userId);
  if (idx === -1) {
    states.push({ userId, month, used: 1 });
  } else {
    states[idx] = { ...states[idx]!, used: states[idx]!.used + 1 };
  }
  save(states);
}
