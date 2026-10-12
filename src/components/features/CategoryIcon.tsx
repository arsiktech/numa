import {
  Briefcase,
  HandCoins,
  Landmark,
  ShoppingCart,
  ShoppingBasket,
  Utensils,
  Car,
  Plane,
  Home,
  Zap,
  Repeat,
  HeartPulse,
  ShoppingBag,
  Film,
  GraduationCap,
  PiggyBank,
  Sparkles,
  Wine,
  CreditCard,
  Building2,
  LineChart,
  Layers,
  type LucideIcon
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  "hand-coins": HandCoins,
  landmark: Landmark,
  "shopping-cart": ShoppingCart,
  "shopping-basket": ShoppingBasket,
  utensils: Utensils,
  car: Car,
  plane: Plane,
  home: Home,
  zap: Zap,
  repeat: Repeat,
  "heart-pulse": HeartPulse,
  "shopping-bag": ShoppingBag,
  film: Film,
  "graduation-cap": GraduationCap,
  "piggy-bank": PiggyBank,
  sparkles: Sparkles,
  wine: Wine,
  "credit-card": CreditCard,
  "building-2": Building2,
  "line-chart": LineChart,
  layers: Layers
};

export function CategoryIcon({
  name,
  size = 16,
  strokeWidth = 1.75,
  className
}: {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const Icon = icons[name] ?? Sparkles;
  return <Icon size={size} strokeWidth={strokeWidth} className={className} />;
}

export const toneForCategoryColor: Record<
  string,
  { surface: string; ink: string; soft: string }
> = {
  lavender: {
    surface: "var(--color-surface-lavender)",
    ink: "var(--color-brand-strong)",
    soft: "var(--color-lavender-200)"
  },
  mint: {
    surface: "var(--color-surface-mint)",
    ink: "var(--color-positive)",
    soft: "var(--color-mint-200)"
  },
  peach: {
    surface: "var(--color-surface-peach)",
    ink: "var(--color-peach-ink)",
    soft: "var(--color-peach-200)"
  },
  blush: {
    surface: "var(--color-surface-blush)",
    ink: "var(--color-negative)",
    soft: "var(--color-blush-200)"
  },
  sky: {
    surface: "var(--color-surface-sky)",
    ink: "var(--color-info)",
    soft: "var(--color-sky-200)"
  },
  sand: {
    surface: "var(--color-surface-sand)",
    ink: "var(--color-sand-ink)",
    soft: "var(--color-sand-200)"
  }
};

export function tonesFor(color: string) {
  // Unknown colors fall back to warm sand, not lavender — purple-by-default
  // was reading as leftover dashboard chrome on Citrus surfaces. Categories
  // the user explicitly colored lavender still get lavender.
  return toneForCategoryColor[color] ?? toneForCategoryColor.sand!;
}
