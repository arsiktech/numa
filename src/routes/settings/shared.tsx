

import { useAuth } from "@/services/auth";

import { type AppMode } from "@/lib/appMode";

export type AccountForSettings = NonNullable<ReturnType<typeof useAuth>["currentAccount"]>;

export const MODE_META: Record<AppMode, { emoji: string; title: string; description: string; firstMove: string }> = {
  light: {
    emoji: "🌿",
    title: "Simple",
    description: "Weekly spend, buckets, fast capture.",
    firstMove: "Start by adding one expense."
  },
  advanced: {
    emoji: "🔮",
    title: "Advanced",
    description: "Net worth, holdings, goals, Numa Pro AI.",
    firstMove: "Start with a movement or account."
  },
  shared: {
    emoji: "🤝",
    title: "Shared Pot",
    description: "Joint expenses, splits, settle up.",
    firstMove: "Start by inviting people or adding a split."
  }
};

/**
 * The "current mode" hero button, shared by the light and reference settings
 * surfaces so the two never drift (they previously duplicated this block,
 * including a hardcoded Citrus palette). Uses --color-cta tokens so it adapts
 * to every palette.
 */

export function errorMessage(err: unknown, fallback: string) {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  return fallback;
}
