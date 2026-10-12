import { convertCurrency, type FxRates } from "@/lib/fx";
import type { Category, CurrencyCode, PodExpense } from "@/lib/types";

type WeightedTerm = string | { term: string; weight?: number };

type CategoryRule = {
  category: string;
  keywords: WeightedTerm[];
  negative?: WeightedTerm[];
};

const CATEGORY_ALIASES: Record<string, string[]> = {
  Groceries: [
    "Food",
    "Food shopping",
    "Supermarket",
    "Products",
    "Продукты",
    "Супермаркет",
    "Alimentacion",
    "Alimentación"
  ],
  Dining: [
    "Food",
    "Meals",
    "Restaurants",
    "Eating out",
    "Cafe",
    "Coffee",
    "Takeaway",
    "Рестораны",
    "Кафе",
    "Еда вне дома",
    "Comidas",
    "Restaurantes"
  ],
  Transport: ["Taxi", "Mobility", "Fuel", "Parking", "Транспорт", "Такси", "Gasolina"],
  Rent: ["Housing", "Apartment", "Flat", "Аренда", "Квартира", "Alquiler"],
  Utilities: [
    "Bills",
    "Internet",
    "Electricity",
    "Phone",
    "Коммуналка",
    "Коммунальные",
    "Связь",
    "Suministros"
  ],
  Subscriptions: ["SaaS", "Apps", "Подписки", "Suscripciones"],
  Shopping: ["Clothes", "Retail", "Одежда", "Покупки", "Compras"],
  Health: ["Medical", "Medicine", "Pharmacy", "Здоровье", "Аптека", "Salud"],
  Household: ["Home goods", "House", "Дом", "Домашнее", "Hogar"],
  Insurance: ["Seguro", "Seguros", "Страховка", "Страхование"],
  Entertainment: ["Fun", "Leisure", "Досуг", "Развлечения", "Ocio"],
  Fees: ["Bank fees", "Taxes", "Commissions", "Комиссии", "Налоги", "Impuestos"],
  "Personal care": ["Beauty", "Barber", "Cosmetics", "Красота", "Уход", "Belleza"],
  Travel: ["Trips", "Hotels", "Flights", "Путешествия", "Viajes"]
};

function term(term: string, weight: number): WeightedTerm {
  return { term, weight };
}

const CATEGORY_RULES: CategoryRule[] = [
  {
    category: "Groceries",
    keywords: [
      term("mercadona", 60),
      term("carrefour", 60),
      term("lidl", 60),
      term("aldi", 60),
      term("consum", 55),
      term("bonpreu", 55),
      term("bon preu", 55),
      term("caprabo", 55),
      term("condis", 55),
      term("alcampo", 55),
      term("eroski", 55),
      term("supercor", 55),
      term("ametller", 48),
      term("veritas", 42),
      term("spar", 42),
      term("dia", 42),
      term("fruteria", 34),
      term("fruiteria", 34),
      term("verduleria", 34),
      term("carniceria", 34),
      term("charcuteria", 34),
      term("pescaderia", 34),
      term("supermarket", 38),
      term("grocery", 38),
      term("groceries", 38),
      term("food shop", 34),
      term("продукт", 38),
      term("супермаркет", 38),
      term("магазин продуктов", 34),
      term("овощ", 28),
      term("фрукт", 28)
    ]
  },
  {
    category: "Dining",
    keywords: [
      term("restaurant", 42),
      term("restaurante", 42),
      term("coffee", 38),
      term("cafe", 38),
      term("cafeteria", 38),
      term("dinner", 34),
      term("lunch", 34),
      term("breakfast", 34),
      term("brunch", 34),
      term("takeaway", 30),
      term("delivery food", 30),
      term("glovo", 30),
      term("wolt", 30),
      term("ubereats", 30),
      term("uber eats", 30),
      term("just eat", 30),
      term("food", 26),
      term("comida", 30),
      term("meal", 28),
      term("meals", 28),
      term("bar", 24),
      term("lounge", 28),
      term("hundred", 50),
      term("lemongrass", 55),
      term("emigrant", 55),
      term("savage lounge", 55),
      term("samsmak", 55),
      term("keksy", 55),
      term("99 cheesecakes", 62),
      term("cheesecakes", 44),
      term("la condesa", 62),
      term("casa bomba", 62),
      term("casa bomba vielha", 68),
      term("honest greens", 55),
      term("goiko", 55),
      term("vips", 50),
      term("taco alto", 55),
      term("udon", 48),
      term("tagliatella", 55),
      term("santa gloria", 48),
      term("365 obrador", 48),
      term("vivari", 48),
      term("faborit", 48),
      term("granier", 48),
      term("burrito", 42),
      term("pizza", 40),
      term("burger", 40),
      term("sushi", 40),
      term("ramen", 36),
      term("taco", 36),
      term("bakery", 34),
      term("panaderia", 34),
      term("pasteleria", 34),
      term("cookie", 34),
      term("cookies", 34),
      term("cheesecake", 34),
      term("starbucks", 42),
      term("mcdonald", 42),
      term("burger king", 42),
      term("kfc", 42),
      term("автомат", 34),
      term("вендинг", 34),
      term("кофе", 38),
      term("кафе", 38),
      term("ресторан", 42),
      term("ужин", 34),
      term("обед", 34),
      term("завтрак", 34),
      term("бар", 24)
    ]
  },
  {
    category: "Transport",
    keywords: [
      term("bolt", 55),
      term("uber", 42),
      term("cabify", 50),
      term("free now", 48),
      term("freenow", 48),
      term("taxi", 46),
      term("cab", 34),
      term("metro", 40),
      term("tmb", 40),
      term("bus", 34),
      term("renfe", 48),
      term("iryo", 48),
      term("ouigo", 48),
      term("train", 40),
      term("parking", 38),
      term("aparcamiento", 38),
      term("fuel", 38),
      term("gas station", 38),
      term("gasolina", 38),
      term("repsol", 42),
      term("waylet", 48),
      term("cepsa", 42),
      term("galp", 42),
      term("bp", 36),
      term("tesla", 36),
      term("zunder", 58),
      term("ionity", 54),
      term("electromaps", 50),
      term("wenea", 50),
      term("plenoil", 44),
      term("plenergy", 44),
      term("cargacoches", 44),
      term("charging", 34),
      term("ev charge", 44),
      term("recarga coche", 44),
      term("такси", 46),
      term("метро", 40),
      term("автобус", 34),
      term("поезд", 40),
      term("парков", 38),
      term("бензин", 38)
    ]
  },
  {
    category: "Rent",
    keywords: [
      term("maria soledad torres miralles", 95),
      term("rent", 70),
      term("landlord", 70),
      term("alquiler", 70),
      term("lease", 55),
      term("apartment rent", 65),
      term("flat rent", 65),
      term("аренда", 70),
      term("квартира", 45),
      term("жилье", 45)
    ]
  },
  {
    category: "Utilities",
    keywords: [
      term("iberdrola", 70),
      term("curenergia", 70),
      term("endesa", 70),
      term("naturgy", 70),
      term("digi", 62),
      term("vodafone", 58),
      term("movistar", 58),
      term("orange", 50),
      term("yoigo", 50),
      term("simyo", 50),
      term("lowi", 50),
      term("telefonica", 50),
      term("electric", 42),
      term("electricity", 42),
      term("water bill", 42),
      term("gas bill", 42),
      term("internet", 42),
      term("wifi", 38),
      term("phone bill", 38),
      term("mobile bill", 38),
      term("utility", 42),
      term("utilities", 42),
      term("factura luz", 44),
      term("factura agua", 44),
      term("luz", 36),
      term("agua", 36),
      term("comunidad", 32),
      term("коммун", 42),
      term("электр", 42),
      term("вода", 36),
      term("интернет", 42),
      term("телефон", 38),
      term("связь", 34)
    ]
  },
  {
    category: "Subscriptions",
    keywords: [
      term("subscription", 46),
      term("suscripcion", 46),
      term("netflix", 55),
      term("spotify", 55),
      term("youtube premium", 60),
      term("youtube", 40),
      term("icloud", 60),
      term("apple music", 60),
      term("apple tv", 60),
      term("google one", 60),
      term("openai", 60),
      term("chatgpt", 60),
      term("prime video", 55),
      term("amazon prime", 55),
      term("notion", 45),
      term("figma", 45),
      term("adobe", 45),
      term("canva", 45),
      term("подписк", 46)
    ],
    negative: [term("apple store", 70), term("google store", 70)]
  },
  {
    category: "Shopping",
    keywords: [
      term("amazon", 44),
      term("apple store", 55),
      term("google store", 55),
      term("zara", 55),
      term("h m", 55),
      term("hm", 55),
      term("mango", 50),
      term("primark", 50),
      term("uniqlo", 50),
      term("pull bear", 50),
      term("pull and bear", 50),
      term("bershka", 50),
      term("stradivarius", 50),
      term("massimo dutti", 50),
      term("decathlon", 50),
      term("shein", 50),
      term("aliexpress", 50),
      term("temu", 50),
      term("shop", 18),
      term("store", 18),
      term("marketplace", 28),
      term("одежд", 42),
      term("покупк", 34),
      term("магазин одежды", 42)
    ]
  },
  {
    category: "Health",
    keywords: [
      term("farmacia", 58),
      term("pharmacy", 58),
      term("doctor", 46),
      term("clinic", 46),
      term("clinica", 46),
      term("dentist", 46),
      term("dental", 46),
      term("medicine", 44),
      term("medicina", 44),
      term("hospital", 42),
      term("sanitas", 42),
      term("adeslas", 42),
      term("аптек", 58),
      term("врач", 46),
      term("клиник", 46),
      term("стомат", 46),
      term("лекарств", 44)
    ]
  },
  {
    category: "Household",
    keywords: [
      term("ikea", 58),
      term("leroy merlin", 58),
      term("leroy", 48),
      term("brico depot", 48),
      term("bricor", 48),
      term("zara home", 55),
      term("home goods", 44),
      term("household", 42),
      term("cleaning", 34),
      term("laundry", 34),
      term("kitchen", 32),
      term("furniture", 42),
      term("мебель", 42),
      term("дом", 28),
      term("быт", 34),
      term("уборк", 34)
    ]
  },
  {
    category: "Insurance",
    keywords: [
      term("insurance", 58),
      term("seguro", 58),
      term("seguros", 58),
      term("gnp", 55),
      term("mapfre", 55),
      term("axa", 45),
      term("allianz", 45),
      term("страхов", 58)
    ]
  },
  {
    category: "Entertainment",
    keywords: [
      term("cinema", 46),
      term("movie", 42),
      term("cine", 42),
      term("theatre", 42),
      term("theater", 42),
      term("concert", 42),
      term("museum", 36),
      term("ticket", 28),
      term("entradas", 36),
      term("кино", 46),
      term("театр", 42),
      term("концерт", 42),
      term("музей", 36)
    ]
  },
  {
    category: "Fees",
    keywords: [
      term("bank fee", 60),
      term("commission", 50),
      term("comision", 50),
      term("fee", 38),
      term("tax", 42),
      term("taxes", 42),
      term("impuesto", 42),
      term("atm fee", 50),
      term("cash withdrawal fee", 50),
      term("комисс", 50),
      term("налог", 42),
      term("штраф", 42)
    ]
  },
  {
    category: "Personal care",
    keywords: [
      term("barber", 48),
      term("haircut", 48),
      term("salon", 40),
      term("beauty", 42),
      term("cosmetic", 42),
      term("sephora", 48),
      term("kiko", 42),
      term("nails", 42),
      term("peluqueria", 48),
      term("belleza", 42),
      term("парикмах", 48),
      term("стриж", 48),
      term("космет", 42),
      term("маникюр", 42)
    ]
  },
  {
    category: "Travel",
    keywords: [
      term("airbnb", 58),
      term("booking com", 58),
      term("booking", 46),
      term("hotel", 50),
      term("hostel", 46),
      term("flight", 50),
      term("airport", 44),
      term("ryanair", 58),
      term("vueling", 58),
      term("iberia", 58),
      term("wizz", 52),
      term("easyjet", 52),
      term("trip", 30),
      term("travel", 40),
      term("отель", 50),
      term("аэропорт", 44),
      term("авиабилет", 50),
      term("билет самолет", 50),
      term("путешеств", 40)
    ]
  }
];

const FALLBACK_POD_CATEGORIES: Category[] = [
  {
    id: "podcat_groceries",
    portfolioId: "pod",
    name: "Groceries",
    kind: "expense",
    icon: "shopping-basket",
    color: "mint",
    sortOrder: 0
  },
  {
    id: "podcat_dining",
    portfolioId: "pod",
    name: "Dining",
    kind: "expense",
    icon: "utensils",
    color: "peach",
    sortOrder: 1
  },
  {
    id: "podcat_transport",
    portfolioId: "pod",
    name: "Transport",
    kind: "expense",
    icon: "car",
    color: "sand",
    sortOrder: 2
  },
  {
    id: "podcat_rent",
    portfolioId: "pod",
    name: "Rent",
    kind: "expense",
    icon: "home",
    color: "lavender",
    sortOrder: 3
  },
  {
    id: "podcat_utilities",
    portfolioId: "pod",
    name: "Utilities",
    kind: "expense",
    icon: "zap",
    color: "sky",
    sortOrder: 4
  },
  {
    id: "podcat_subscriptions",
    portfolioId: "pod",
    name: "Subscriptions",
    kind: "expense",
    icon: "repeat",
    color: "blush",
    sortOrder: 5
  },
  {
    id: "podcat_shopping",
    portfolioId: "pod",
    name: "Shopping",
    kind: "expense",
    icon: "shopping-bag",
    color: "sand",
    sortOrder: 6
  },
  {
    id: "podcat_health",
    portfolioId: "pod",
    name: "Health",
    kind: "expense",
    icon: "heart-pulse",
    color: "blush",
    sortOrder: 7
  },
  {
    id: "podcat_travel",
    portfolioId: "pod",
    name: "Travel",
    kind: "expense",
    icon: "plane",
    color: "sky",
    sortOrder: 8
  },
  {
    id: "podcat_household",
    portfolioId: "pod",
    name: "Household",
    kind: "expense",
    icon: "home",
    color: "sand",
    sortOrder: 9
  },
  {
    id: "podcat_insurance",
    portfolioId: "pod",
    name: "Insurance",
    kind: "expense",
    icon: "building-2",
    color: "sky",
    sortOrder: 10
  },
  {
    id: "podcat_entertainment",
    portfolioId: "pod",
    name: "Entertainment",
    kind: "expense",
    icon: "film",
    color: "lavender",
    sortOrder: 11
  },
  {
    id: "podcat_fees",
    portfolioId: "pod",
    name: "Fees",
    kind: "expense",
    icon: "landmark",
    color: "blush",
    sortOrder: 12
  },
  {
    id: "podcat_personal_care",
    portfolioId: "pod",
    name: "Personal care",
    kind: "expense",
    icon: "sparkles",
    color: "peach",
    sortOrder: 13
  }
];

export type PodCategoryBreakdownRow = {
  key: string;
  category?: Category;
  label: string;
  total: number;
  count: number;
  share: number;
  inferredCount: number;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ё/g, "е")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizedTermsForCategoryName(name: string) {
  const normalizedName = normalize(name);
  const terms = new Set<string>([normalizedName]);

  for (const [canonical, aliases] of Object.entries(CATEGORY_ALIASES)) {
    const allNames = [canonical, ...aliases];
    if (allNames.some((candidate) => normalize(candidate) === normalizedName)) {
      for (const candidate of allNames) {
        const normalized = normalize(candidate);
        if (normalized) terms.add(normalized);
      }
    }
  }

  return [...terms];
}

function categoryNameMatches(candidateName: string, canonicalName: string) {
  const candidate = normalize(candidateName);
  return normalizedTermsForCategoryName(canonicalName).includes(candidate);
}

function termValue(input: WeightedTerm) {
  return typeof input === "string" ? input : input.term;
}

function termWeight(input: WeightedTerm) {
  return typeof input === "string" ? 20 : input.weight ?? 20;
}

function termMatches(normalizedText: string, rawTerm: string) {
  const normalizedTerm = normalize(rawTerm);
  if (!normalizedTerm) return false;

  // Short words such as "bar", "bp", "hm", and "dia" must be token/phrase
  // matches; otherwise Barcelona would be categorized as Dining because it
  // contains "bar".
  if (normalizedTerm.length <= 3 || normalizedTerm.includes(" ")) {
    return new RegExp(`(^|\\s)${escapeRegExp(normalizedTerm)}(?=\\s|$)`).test(
      normalizedText
    );
  }

  return normalizedText.includes(normalizedTerm);
}

function expenseCategories(categories: Category[]) {
  const realCategories = categories.filter((category) => category.kind === "expense");
  const fallbackMissing = FALLBACK_POD_CATEGORIES.filter(
    (category) =>
      !realCategories.some((realCategory) =>
        categoryNameMatches(realCategory.name, category.name)
      )
  );
  return [...realCategories, ...fallbackMissing].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function getPodExpenseCategories(categories: Category[]) {
  return expenseCategories(categories);
}

export function isFallbackPodCategory(categoryId: string | undefined) {
  return Boolean(categoryId?.startsWith("podcat_"));
}

export function inferPodCategory(
  description: string,
  categories: Category[]
): Category | undefined {
  const normalized = normalize(description);
  if (!normalized.trim()) return undefined;

  const visibleCategories = expenseCategories(categories);
  const scores = new Map<string, { category: Category; score: number }>();

  function addScore(category: Category | undefined, score: number) {
    if (!category || score <= 0) return;
    const current = scores.get(category.id);
    scores.set(category.id, {
      category,
      score: (current?.score ?? 0) + score
    });
  }

  function findCategory(canonicalName: string) {
    return visibleCategories.find((candidate) =>
      categoryNameMatches(candidate.name, canonicalName)
    );
  }

  for (const category of visibleCategories) {
    for (const alias of normalizedTermsForCategoryName(category.name)) {
      if (termMatches(normalized, alias)) {
        addScore(category, normalize(category.name) === alias ? 90 : 60);
      }
    }
  }

  for (const rule of CATEGORY_RULES) {
    const category = findCategory(rule.category);
    if (!category) continue;

    let score = 0;
    for (const keyword of rule.keywords) {
      if (termMatches(normalized, termValue(keyword))) {
        score += termWeight(keyword);
      }
    }
    for (const keyword of rule.negative ?? []) {
      if (termMatches(normalized, termValue(keyword))) {
        score -= termWeight(keyword);
      }
    }
    addScore(category, score);
  }

  const best = [...scores.values()]
    .filter((candidate) => candidate.score >= 24)
    .sort((a, b) => b.score - a.score)[0];
  return best?.category;
}

export function resolvePodExpenseCategory(
  expense: Pick<PodExpense, "categoryId" | "description">,
  categories: Category[]
) {
  const stored = expense.categoryId
    ? categories.find((category) => category.id === expense.categoryId)
    : undefined;
  return {
    category: stored ?? inferPodCategory(expense.description, categories),
    inferred: !stored
  };
}

export function buildPodCategoryBreakdown({
  expenses,
  categories,
  currency,
  rates
}: {
  expenses: PodExpense[];
  categories: Category[];
  currency: CurrencyCode;
  rates: FxRates;
}): PodCategoryBreakdownRow[] {
  const rows = new Map<string, PodCategoryBreakdownRow>();
  let grandTotal = 0;

  for (const expense of expenses) {
    const { category, inferred } = resolvePodExpenseCategory(expense, categories);
    const key = category?.id ?? "__uncategorized";
    const total = convertCurrency(expense.amount, expense.currency, currency, rates);
    grandTotal += total;
    const current =
      rows.get(key) ??
      ({
        key,
        category,
        label: category?.name ?? "Uncategorized",
        total: 0,
        count: 0,
        share: 0,
        inferredCount: 0
      } satisfies PodCategoryBreakdownRow);
    current.total += total;
    current.count += 1;
    if (inferred && category) current.inferredCount += 1;
    rows.set(key, current);
  }

  return Array.from(rows.values())
    .map((row) => ({
      ...row,
      share: grandTotal > 0 ? row.total / grandTotal : 0
    }))
    .sort((a, b) => b.total - a.total);
}
