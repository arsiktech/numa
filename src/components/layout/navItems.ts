import {
  LayoutDashboard,
  Wallet,
  Settings,
  PiggyBank,
  Sparkles,
  Target,
  TrendingUp,
  type LucideProps
} from "lucide-react";
import type { ComponentType } from "react";
import type { AppMode } from "@/lib/appMode";
import type { I18nKey } from "@/lib/i18n";

/**
 * Single source of truth for primary nav items, used by both Sidebar (desktop)
 * and BottomNav (mobile). Labels are resolved at the call site via the i18n
 * `t()` hook — we just expose the key here so this file stays a pure config.
 *
 * `advanced: true` items are hidden in Light mode (see `visibleNavItems`).
 */
export interface NavItem {
  to: string;
  labelKey: I18nKey;
  icon: ComponentType<LucideProps>;
  end?: boolean;
  /** When true, item is hidden in Light mode. */
  advanced: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: "/",       labelKey: "overview", icon: LayoutDashboard, end: true,  advanced: false },
  { to: "/buckets", labelKey: "buckets", icon: PiggyBank,                     advanced: false },
  { to: "/money",  labelKey: "money",    icon: Wallet,                        advanced: false }
];

export const ADVANCED_NAV_ITEMS: NavItem[] = [
  { to: "/",         labelKey: "overview", icon: LayoutDashboard, end: true, advanced: false },
  { to: "/money",    labelKey: "money",    icon: Wallet,                    advanced: true },
  { to: "/numa",     labelKey: "numaAi",   icon: Sparkles,                  advanced: true },
  { to: "/goals",    labelKey: "goals",    icon: Target,                    advanced: true },
  { to: "/insights", labelKey: "insights", icon: TrendingUp,                advanced: true }
];

/**
 * Settings always-on (mobile bottom-nav slot, desktop footer button). Not in
 * NAV_ITEMS because desktop shows it differently — but it's exported here so
 * the BottomNav doesn't hand-roll its own copy.
 */
export const SETTINGS_ITEM: { to: string; labelKey: I18nKey; icon: ComponentType<LucideProps> } = {
  to: "/settings",
  labelKey: "settings",
  icon: Settings
};

/**
 * Shared-mode strips the personal app down to just the pot. We surface a
 * single "Pot" item at "/" — the shared-mode home route renders the pod page
 * directly so we don't need a separate URL.
 */
const SHARED_POT_ITEM: NavItem = {
  to: "/",
  labelKey: "shared",
  icon: PiggyBank,
  end: true,
  advanced: false
};

/** Filter NAV_ITEMS to those visible in the given mode. */
export function visibleNavItems(mode: AppMode): NavItem[] {
  if (mode === "shared") {
    return [SHARED_POT_ITEM];
  }
  if (mode === "light") {
    return NAV_ITEMS.filter((item) => !item.advanced);
  }
  // Numa OS is always visible in advanced mode: day threads, briefs, the
  // catalog, and local drafting are deterministic. Live chat + image
  // generation additionally light up behind VITE_NUMA_AI_ENABLED=1.
  return ADVANCED_NAV_ITEMS;
}
