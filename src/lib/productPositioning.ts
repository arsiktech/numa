export const NUMA_HEADLINE = "Track money.";

import type { AppMode, PrimaryJob, StarterTemplate } from "./types";

export type { PrimaryJob, StarterTemplate };

const WEEKLY_TARGET_KEY = "numa:onboarding:weeklyTarget";

export const ONBOARDING_JOBS: Array<{
  id: PrimaryJob;
  title: string;
  description: string;
  firstAction: string;
  starterTemplate: StarterTemplate;
}> = [
  {
    id: "daily_spending",
    title: "Simple",
    description: "One weekly number, quick add, clean history, and buckets to save into.",
    firstAction: "Add one real expense.",
    starterTemplate: "personal_capital"
  },
  {
    id: "net_worth",
    title: "Advanced",
    description: "Connect the whole picture — wealth, holdings, goals, and a richer history.",
    firstAction: "Add movement or an account.",
    starterTemplate: "personal_capital"
  },
  {
    id: "shared_money",
    title: "Shared pot",
    description: "Split with people: who paid, which card, who owes, and what needs settling.",
    firstAction: "Invite people or add a split.",
    starterTemplate: "trip_shared_flat"
  }
];

export function appModeForPrimaryJob(job: PrimaryJob): AppMode {
  if (job === "daily_spending") return "light";
  if (job === "shared_money") return "shared";
  return "advanced";
}

export function starterTemplateForPrimaryJob(job: PrimaryJob): StarterTemplate {
  return ONBOARDING_JOBS.find((choice) => choice.id === job)?.starterTemplate ?? "personal_capital";
}

export function storeOnboardingIntent(job: PrimaryJob, template: StarterTemplate): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem("numa:onboarding:primaryJob", job);
    window.localStorage.setItem("numa:onboarding:starterTemplate", template);
  } catch {
    // Local persistence is only an onboarding hint; cloud profile sync remains the source of truth.
  }
}

export function storeOnboardingWeeklyTarget(value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(WEEKLY_TARGET_KEY, String(Math.max(0, Math.round(value))));
  } catch {
    // Local persistence is only a first-run hint; budgets remain editable in Money.
  }
}

export function readOnboardingWeeklyTarget(fallback = 250): number {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(WEEKLY_TARGET_KEY);
    if (!raw) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  } catch {
    return fallback;
  }
}

const POT_NAME_KEY = "numa:onboarding:potName";

/**
 * Shared-mode onboarding asks for the first pot's name instead of a weekly
 * spend target. The pod first-run setup consumes it as the prefilled name.
 */
export function storeOnboardingPotName(value: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = value.trim();
    if (trimmed) window.localStorage.setItem(POT_NAME_KEY, trimmed);
    else window.localStorage.removeItem(POT_NAME_KEY);
  } catch {
    // First-run hint only; the pot can be renamed any time.
  }
}

export function readOnboardingPotName(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(POT_NAME_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}
