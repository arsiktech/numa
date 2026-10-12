import { useMemo, type ReactElement } from "react";
import type { Transaction } from "@/lib/types";

/**
 * Hand-drawn "studio still-life" objects — the instant, deterministic visual
 * for every money entry. One consistent style so the grid reads like a
 * catalog shoot: ink line-work that flips with the theme, paper fills, a
 * single lime accent from the theme-independent coin palette, and a soft
 * contact shadow so each object *sits* on the cream/white surface.
 *
 * These are not placeholders for the AI renders — they're the same art
 * direction. When a generated photo lands it replaces the object inside the
 * identical pedestal frame, so the switch never feels like a swap.
 */

export type StillLifeKind =
  | "coffee"
  | "groceries"
  | "dining"
  | "transport"
  | "home"
  | "travel"
  | "entertainment"
  | "shopping"
  | "health"
  | "beauty"
  | "income"
  | "spark";

const KIND_PATTERNS: Array<[StillLifeKind, RegExp]> = [
  ["coffee", /coffee|cafe|café|espresso|latte|кофе|horchat|brew/i],
  ["groceries", /grocer|market|mercado|supermarkt|lidl|aldi|carrefour|mercadona|продукт|samsmak|food/i],
  ["dining", /dinner|lunch|restaurant|ресторан|ужин|обед|bar|pizza|sushi|ramen|kebab|кебаб|bistro|taco/i],
  ["transport", /taxi|uber|bolt|cabify|metro|bus|train|транспорт|такси|метро|fuel|petrol|gas station/i],
  ["home", /rent|home|house|дом|аренда|iberdrola|digi|internet|electric|water|utility|ikea/i],
  ["travel", /flight|hotel|airbnb|travel|trip|vuelo|полёт|отель|ryanair|vueling|booking/i],
  ["entertainment", /cinema|movie|netflix|spotify|concert|game|развлеч|кино|театр|steam/i],
  ["shopping", /amazon|zara|shop|store|покупк|одежд|primor|tezenis|oysho|kiko/i],
  ["health", /pharma|farmacia|doctor|dentist|health|аптек|здоров|clinic|gym|fit/i],
  ["beauty", /beauty|salon|hair|nails|бьюти|маникюр|парикмахер|spa/i]
];

/** Resolve the still-life for a transaction from its category + description. */
export function stillLifeKindFor(tx: Transaction, categoryName?: string): StillLifeKind {
  if (tx.kind === "income") return "income";
  const haystack = `${categoryName ?? ""} ${tx.description}`;
  for (const [kind, pattern] of KIND_PATTERNS) {
    if (pattern.test(haystack)) return kind;
  }
  return "spark";
}

/** Small deterministic hash → stable per-merchant variation. */
function seedOf(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

const INK = "var(--color-ink)";
const PAPER = "var(--color-paper)";
const LIME = "var(--color-coin-lime)";
const GOLD = "var(--color-coin-gold)";

function CoffeeArt({ accent }: { accent: string }) {
  return (
    <g>
      {/* steam */}
      <path
        d="M52 26c-3 4 3 7 0 11M64 22c-3 4 3 7 0 11"
        fill="none"
        stroke={INK}
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* cup */}
      <path
        d="M40 48h36v18c0 10-8 18-18 18s-18-8-18-18V48z"
        fill={PAPER}
        stroke={INK}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* handle */}
      <path
        d="M76 53c8 0 12 4 12 9s-4 9-12 9"
        fill="none"
        stroke={INK}
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* lime coffee surface */}
      <ellipse cx="58" cy="48" rx="18" ry="4.5" fill={accent} stroke={INK} strokeWidth="3" />
      {/* saucer */}
      <path d="M34 90h48" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
    </g>
  );
}

function GroceriesArt({ accent }: { accent: string }) {
  return (
    <g>
      {/* baguette */}
      <g transform="rotate(-24 74 40)">
        <rect x="66" y="22" width="14" height="34" rx="7" fill={PAPER} stroke={INK} strokeWidth="3" />
        <path d="M70 30h6M70 38h6M70 46h6" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      </g>
      {/* leaf */}
      <path
        d="M50 30c0-7 6-11 12-11 0 7-5 11-12 11z"
        fill={accent}
        stroke={INK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* bag */}
      <path
        d="M36 44h44l-4 46H40l-4-46z"
        fill={PAPER}
        stroke={INK}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M36 44l6-8h32l6 8" fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M46 56v22M70 56v22" stroke={INK} strokeWidth="2.5" strokeLinecap="round" opacity="0.35" />
    </g>
  );
}

function DiningArt({ accent }: { accent: string }) {
  return (
    <g>
      {/* cloche */}
      <path
        d="M28 74c0-18 14-32 32-32s32 14 32 32H28z"
        fill={PAPER}
        stroke={INK}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* knob with lime cherry */}
      <circle cx="60" cy="36" r="5.5" fill={accent} stroke={INK} strokeWidth="3" />
      {/* plate */}
      <path d="M22 82h76M32 90h56" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      {/* shine */}
      <path d="M40 60c3-8 9-13 16-15" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" opacity="0.3" />
    </g>
  );
}

function TransportArt({ accent }: { accent: string }) {
  return (
    <g>
      {/* body */}
      <path
        d="M26 70c0-4 2-7 6-8l6-12c2-4 5-6 9-6h18c4 0 8 2 10 6l6 12c4 1 7 4 7 8v8c0 2-2 4-4 4H30c-2 0-4-2-4-4v-8z"
        fill={PAPER}
        stroke={INK}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* window split */}
      <path d="M42 60l4-10c1-2 2-3 4-3h20c2 0 3 1 4 3l4 10H42z" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      {/* wheels */}
      <circle cx="42" cy="84" r="7" fill={PAPER} stroke={INK} strokeWidth="3.5" />
      <circle cx="78" cy="84" r="7" fill={PAPER} stroke={INK} strokeWidth="3.5" />
    </g>
  );
}

function HomeArt({ accent }: { accent: string }) {
  return (
    <g>
      {/* roof */}
      <path d="M30 58l30-26 30 26" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* body */}
      <path d="M38 56v34h44V56" fill={PAPER} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      {/* door */}
      <rect x="52" y="68" width="16" height="22" rx="7" fill={accent} stroke={INK} strokeWidth="3" />
      {/* window */}
      <circle cx="60" cy="48" r="5" fill={PAPER} stroke={INK} strokeWidth="3" />
    </g>
  );
}

function TravelArt({ accent }: { accent: string }) {
  return (
    <g>
      {/* trail */}
      <path
        d="M26 84c10-2 16-8 22-16"
        fill="none"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="1 7"
      />
      <circle cx="26" cy="84" r="3.5" fill={accent} stroke={INK} strokeWidth="2.5" />
      {/* paper plane */}
      <path
        d="M46 62L94 38l-14 42-12-14-22-4z"
        fill={PAPER}
        stroke={INK}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M94 38L68 66" fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M68 66l-2 12 8-8" fill={accent} stroke={INK} strokeWidth="3" strokeLinejoin="round" />
    </g>
  );
}

function EntertainmentArt({ accent }: { accent: string }) {
  return (
    <g transform="rotate(-8 60 62)">
      {/* ticket */}
      <path
        d="M28 48h64v10a6 6 0 000 12v10H28V70a6 6 0 000-12V48z"
        fill={PAPER}
        stroke={INK}
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M64 48v40" stroke={INK} strokeWidth="2.5" strokeDasharray="2 6" strokeLinecap="round" />
      {/* lime star */}
      <path
        d="M46 60l2.6 5.4 5.9.7-4.4 4 1.2 5.9-5.3-3-5.3 3 1.2-5.9-4.4-4 5.9-.7L46 60z"
        fill={accent}
        stroke={INK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </g>
  );
}

function ShoppingArt({ accent }: { accent: string }) {
  return (
    <g>
      {/* handles */}
      <path d="M46 46c0-9 6-15 14-15s14 6 14 15" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
      {/* bag */}
      <path d="M34 46h52l-5 44H39l-5-44z" fill={PAPER} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      {/* lime tag */}
      <g transform="rotate(14 82 58)">
        <path d="M76 50h12l4 5-4 5H76a3 3 0 01-3-3v-4a3 3 0 013-3z" fill={accent} stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      </g>
    </g>
  );
}

function HealthArt({ accent }: { accent: string }) {
  return (
    <g transform="rotate(-24 60 64)">
      {/* capsule */}
      <rect x="30" y="52" width="60" height="26" rx="13" fill={PAPER} stroke={INK} strokeWidth="3.5" />
      <path d="M60 52v26" stroke={INK} strokeWidth="3" />
      <rect x="60" y="52" width="30" height="26" rx="13" fill={accent} stroke={INK} strokeWidth="3.5" />
      {/* cross */}
      <path d="M45 61v8M41 65h8" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function BeautyArt({ accent }: { accent: string }) {
  return (
    <g transform="rotate(10 60 58)">
      {/* mirror */}
      <circle cx="60" cy="52" r="20" fill={PAPER} stroke={INK} strokeWidth="3.5" />
      <circle cx="60" cy="52" r="13" fill={accent} stroke={INK} strokeWidth="3" />
      <path d="M52 47c2-3 5-5 8-5" fill="none" stroke={PAPER} strokeWidth="3" strokeLinecap="round" />
      {/* handle */}
      <path d="M60 72v18" stroke={INK} strokeWidth="4" strokeLinecap="round" />
    </g>
  );
}

function IncomeArt({ accent }: { accent: string }) {
  return (
    <g>
      {/* coin stack */}
      <ellipse cx="60" cy="82" rx="26" ry="8" fill={PAPER} stroke={INK} strokeWidth="3.5" />
      <ellipse cx="60" cy="72" rx="26" ry="8" fill={PAPER} stroke={INK} strokeWidth="3.5" />
      <ellipse cx="60" cy="62" rx="26" ry="8" fill={accent} stroke={INK} strokeWidth="3.5" />
      {/* the n */}
      <path d="M54 62c0-3 2-4 4-4s4 1 4 4" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function SparkArt({ accent }: { accent: string }) {
  return (
    <g>
      {/* pedestal cube */}
      <path d="M44 62l16-8 16 8v20l-16 8-16-8V62z" fill={PAPER} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M44 62l16 8 16-8M60 70v20" fill="none" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      {/* four-point spark */}
      <path
        d="M60 24c1.5 7 4 9.5 11 11-7 1.5-9.5 4-11 11-1.5-7-4-9.5-11-11 7-1.5 9.5-4 11-11z"
        fill={accent}
        stroke={INK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </g>
  );
}

const ART: Record<StillLifeKind, (props: { accent: string }) => ReactElement> = {
  coffee: CoffeeArt,
  groceries: GroceriesArt,
  dining: DiningArt,
  transport: TransportArt,
  home: HomeArt,
  travel: TravelArt,
  entertainment: EntertainmentArt,
  shopping: ShoppingArt,
  health: HealthArt,
  beauty: BeautyArt,
  income: IncomeArt,
  spark: SparkArt
};

export function MerchantStillLife({
  kind,
  seedKey,
  className
}: {
  kind: StillLifeKind;
  /** Merchant/description — drives the stable per-merchant variation. */
  seedKey: string;
  className?: string;
}) {
  const { rotation, accent } = useMemo(() => {
    const seed = seedOf(`${kind}:${seedKey.trim().toLowerCase()}`);
    return {
      rotation: (seed - 0.5) * 7, // −3.5° … +3.5° — organic, never sloppy
      accent: seed > 0.82 ? GOLD : LIME
    };
  }, [kind, seedKey]);
  const Art = ART[kind];
  return (
    <svg
      viewBox="0 0 120 120"
      className={className}
      role="img"
      aria-hidden
      style={{ display: "block" }}
    >
      {/* soft contact shadow — the object SITS, it doesn't float */}
      <ellipse cx="60" cy="99" rx="27" ry="4.5" fill={INK} opacity="0.10" />
      <g transform={`rotate(${rotation.toFixed(2)} 60 60)`}>
        <Art accent={accent} />
      </g>
    </svg>
  );
}
