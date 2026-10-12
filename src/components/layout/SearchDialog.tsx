import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Briefcase,
  Building2,
  CreditCard,
  Database,
  Handshake,
  LineChart,
  Mic,
  Search,
  Sparkles,
  Tag,
  Wallet,
  X,
  type LucideIcon
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { CategoryIcon, tonesFor } from "@/components/features/CategoryIcon";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useCurrentPortfolioId, useNuma, usePortfolios } from "@/services/store";
import { emitCommand, type NumaCommand } from "@/lib/commands";
import { AI_ENABLED } from "@/lib/aiEnabled";
import { useAppMode } from "@/lib/appMode";
import { useLocale } from "@/lib/i18n";
import { formatMoney } from "@/lib/money";
import { format } from "date-fns";
import { cn } from "@/lib/cn";
import { backdropMotion, sheetMotion } from "@/lib/motion";
import type {
  Category,
  Membership,
  Portfolio,
  Transaction
} from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface FlatItem {
  key: string;
  group: string;
  navigate: () => void;
  render: () => React.ReactNode;
}

export function SearchDialog({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { state } = useNuma();
  const [, setActivePortfolio] = useCurrentPortfolioId();
  const portfolios = usePortfolios();
  const groups = useGlobalSearch(deferredQuery);
  const { t } = useLocale();
  const [appMode] = useAppMode();
  const portfolioById = useMemo(() => {
    const m = new Map<string, Portfolio>();
    for (const p of portfolios) m.set(p.id, p);
    return m;
  }, [portfolios]);

  useBodyScrollLock(open);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const navigateToTx = useCallback(
    (tx: Transaction) => {
      if (tx.portfolioId !== state.activePortfolioId) {
        setActivePortfolio(tx.portfolioId);
      }
      navigate(`/money?tx=${encodeURIComponent(tx.id)}`);
      onClose();
    },
    [state.activePortfolioId, setActivePortfolio, navigate, onClose]
  );

  const navigateToWealth = useCallback(
    (portfolioId: string) => {
      if (portfolioId !== state.activePortfolioId) setActivePortfolio(portfolioId);
      navigate("/");
      onClose();
    },
    [state.activePortfolioId, setActivePortfolio, navigate, onClose]
  );

  const items = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = [];
    const q = query.trim().toLowerCase();

    // Commands always render at the top — either all of them when query is empty,
    // or filtered by name match.
    const commands: { command: NumaCommand; title: string; subtitle: string; icon: LucideIcon; tone: "brand" | "peach" | "mint"; keywords: string[] }[] = [
      {
        command: "ask-numa",
        title: t("askNuma"),
        subtitle: t("search.askSubtitle"),
        icon: Sparkles,
        tone: "brand",
        keywords: ["ask", "numa", "chat", "ai", "question", "assistant"]
      },
      {
        command: "voice-add",
        title: t("search.voiceTitle"),
        subtitle: t("search.voiceSubtitle"),
        icon: Mic,
        tone: "peach",
        keywords: ["voice", "speak", "mic", "talk", "dictate", "quick", "add"]
      },
      {
        command: "import-export",
        title: t("settings.importExport"),
        subtitle: t("search.importSubtitle"),
        icon: Database,
        tone: "mint",
        keywords: ["import", "export", "csv", "data", "backup", "download", "upload"]
      }
    ];
    for (const c of commands) {
      if (appMode === "shared") continue;
      // AI is off → drop the AI quick actions (Ask Numa + Voice quick-add) so
      // they don't surface as dead options that hit the gateway and error.
      if (!AI_ENABLED && (c.command === "ask-numa" || c.command === "voice-add")) continue;
      if (c.command === "ask-numa" && appMode !== "advanced") continue;
      const match =
        !q ||
        c.title.toLowerCase().includes(q) ||
        c.keywords.some((k) => k.startsWith(q));
      if (!match) continue;
      out.push({
        key: `cmd-${c.command}`,
        group: t("search.commands"),
        navigate: () => {
          emitCommand(c.command);
          onClose();
        },
        render: () => <CommandRow title={c.title} subtitle={c.subtitle} icon={c.icon} tone={c.tone} />
      });
    }

    if (!groups) return out;

    for (const tx of groups.transactions) {
      const portfolio = portfolioById.get(tx.portfolioId);
      out.push({
        key: `tx-${tx.id}`,
        group: t("search.transactions"),
        navigate: () => navigateToTx(tx),
        render: () => <TxRow tx={tx} portfolio={portfolio} />
      });
    }
    for (const h of groups.holdings) {
      const portfolio = portfolioById.get(h.portfolioId);
      out.push({
        key: `hd-${h.id}`,
        group: t("search.holdings"),
        navigate: () => navigateToWealth(h.portfolioId),
        render: () => <BasicRow icon={LineChart} title={`${h.symbol} · ${h.name}`} subtitle={`${h.kind.toUpperCase()} · ${h.quantity} units · ${portfolio?.name ?? ""}`} />
      });
    }
    for (const a of groups.assets) {
      const portfolio = portfolioById.get(a.portfolioId);
      out.push({
        key: `as-${a.id}`,
        group: t("search.assets"),
        navigate: () => navigateToWealth(a.portfolioId),
        render: () => <BasicRow icon={Wallet} title={a.name} subtitle={`${a.kind.replace("_", " ")} · ${formatMoney(a.balance, a.currency)} · ${portfolio?.name ?? ""}`} />
      });
    }
    for (const l of groups.liabilities) {
      const portfolio = portfolioById.get(l.portfolioId);
      out.push({
        key: `li-${l.id}`,
        group: t("search.liabilities"),
        navigate: () => navigateToWealth(l.portfolioId),
        render: () => <BasicRow icon={CreditCard} title={l.name} subtitle={`${l.kind.replace("_", " ")} · ${formatMoney(l.balance, l.currency)} · ${portfolio?.name ?? ""}`} />
      });
    }
    for (const c of groups.categories) {
      const portfolio = portfolioById.get(c.portfolioId);
      out.push({
        key: `cat-${c.id}`,
        group: t("search.categories"),
        navigate: () => {
          if (c.portfolioId !== state.activePortfolioId) setActivePortfolio(c.portfolioId);
          navigate("/money");
          onClose();
        },
        render: () => <CategoryRow category={c} portfolioName={portfolio?.name} />
      });
    }
    for (const p of groups.portfolios) {
      out.push({
        key: `pf-${p.id}`,
        group: t("search.portfolios"),
        navigate: () => {
          setActivePortfolio(p.id);
          navigate("/");
          onClose();
        },
        render: () => <BasicRow icon={portfolioIcon(p.type)} title={p.name} subtitle={`${p.type} · ${p.tagline}`} />
      });
    }
    for (const m of groups.collaborators) {
      const portfolio = portfolioById.get(m.portfolioId);
      out.push({
        key: `mb-${m.id}`,
        group: t("search.collaborators"),
        navigate: () => {
          if (m.portfolioId !== state.activePortfolioId) setActivePortfolio(m.portfolioId);
          navigate("/pod");
          onClose();
        },
        render: () => <CollaboratorRow membership={m} portfolioName={portfolio?.name} />
      });
    }
    return out;
  }, [appMode, query, groups, portfolioById, navigateToTx, navigateToWealth, navigate, onClose, setActivePortfolio, state.activePortfolioId, t]);

  // Reset active index when items change
  useEffect(() => {
    setActiveIndex(0);
  }, [items.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, items.length - 1)));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const active = items[activeIndex];
        if (active) active.navigate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, activeIndex, onClose]);

  // Group items by group label for visual grouping while keeping a flat index for keyboard nav
  const grouped = useMemo(() => {
    const out: Array<{ group: string; entries: Array<{ item: FlatItem; index: number }> }> = [];
    items.forEach((item, index) => {
      const last = out[out.length - 1];
      if (last && last.group === item.group) {
        last.entries.push({ item, index });
      } else {
        out.push({ group: item.group, entries: [{ item, index }] });
      }
    });
    return out;
  }, [items]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4 sm:px-6">
          <motion.div
            {...backdropMotion}
            onClick={onClose}
            className="absolute inset-0 bg-[color:var(--color-ink)]/30 backdrop-blur-sm"
          />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={t("search")}
            {...sheetMotion}
            className="relative nm-glass-strong rounded-3xl overflow-hidden w-full max-w-[640px] flex flex-col max-h-[70vh]"
          >
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[color:var(--color-line)]">
              <Search size={18} className="text-[color:var(--color-ink-3)] shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search.placeholder")}
                className="flex-1 bg-transparent border-0 focus:outline-none text-[16px] sm:text-[15px] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-4)]"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="hidden sm:inline-block font-mono text-[10.5px] px-1.5 py-0.5 rounded-md bg-[color:var(--color-cream-100)] border border-[color:var(--color-line)] text-[color:var(--color-ink-3)]">
                Esc
              </kbd>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("search.close")}
                className="grid place-items-center w-11 h-11 -mr-2 rounded-xl hover:bg-[color:var(--color-cream-100)] text-[color:var(--color-ink-3)] sm:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                query.trim() ? <NoResults query={query} /> : <EmptyHints />
              ) : (
                <div className="py-2">
                  {grouped.map((g) => (
                    <div key={g.group} className="px-2">
                      <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[color:var(--color-ink-3)] px-3 pt-3 pb-1">
                        {g.group}
                      </p>
                      <ul className="space-y-0.5">
                        {g.entries.map(({ item, index }) => (
                          <li key={item.key}>
                            <button
                              type="button"
                              onClick={() => item.navigate()}
                              onMouseEnter={() => setActiveIndex(index)}
                              className={cn(
                                "w-full text-left rounded-xl px-3 py-2 transition-colors",
                                index === activeIndex
                                  ? "bg-[color:var(--color-brand-mist)]"
                                  : "hover:bg-[color:var(--color-cream-50)]"
                              )}
                            >
                              {item.render()}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {items.length > 0 ? (
              <div className="flex items-center justify-between text-[11px] text-[color:var(--color-ink-4)] px-4 py-2 border-t border-[color:var(--color-line)] bg-[color:var(--color-cream-50)]/40">
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Kbd>↑</Kbd>
                    <Kbd>↓</Kbd>
                    {t("search.navigate")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Kbd>↵</Kbd>
                    {t("search.open")}
                  </span>
                </span>
                <span className="nm-num">{items.length} {t("search.results")}</span>
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[color:var(--color-ink-3)]">
      {children}
    </kbd>
  );
}

function EmptyHints() {
  const { t } = useLocale();
  return (
    <div className="px-5 py-8 text-center text-[13px] text-[color:var(--color-ink-3)] space-y-2">
      <p>{t("search.emptyTitle")}</p>
      <p className="text-[12px] text-[color:var(--color-ink-4)]">
        {t("search.emptySubtitle")}
      </p>
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  const { t } = useLocale();
  return (
    <div className="px-5 py-10 text-center text-[13px] text-[color:var(--color-ink-3)]">
      {t("search.noMatches")} <span className="font-semibold text-[color:var(--color-ink)]">"{query}"</span>.
    </div>
  );
}

function TxRow({ tx, portfolio }: { tx: Transaction; portfolio?: Portfolio }) {
  const isIncome = tx.kind === "income";
  // Guard against malformed timestamps — a single transaction with a NaN
  // occurredAt previously crashed the whole search dialog via date-fns
  // throwing "Invalid time value".
  let dateLabel = "";
  if (Number.isFinite(tx.occurredAt) && tx.occurredAt > 0) {
    try {
      dateLabel = format(tx.occurredAt, "d MMM yyyy");
    } catch {
      dateLabel = "";
    }
  }
  return (
    <div className="flex items-center gap-3">
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-[color:var(--color-surface-lavender)] text-[color:var(--color-brand-strong)] shrink-0">
        <Tag size={14} strokeWidth={1.75} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)] truncate">{tx.description}</p>
        <p className="text-[11.5px] text-[color:var(--color-ink-3)] truncate">
          {dateLabel}
          {dateLabel && portfolio?.name ? " · " : ""}
          {portfolio?.name ?? ""}
        </p>
      </div>
      <p
        className={cn(
          "text-[13px] font-semibold nm-num",
          isIncome ? "text-[color:var(--color-positive)]" : "text-[color:var(--color-ink)]"
        )}
      >
        {isIncome ? "+" : "−"}
        {formatMoney(tx.amount, tx.currency)}
      </p>
    </div>
  );
}

function CommandRow({
  icon: Icon,
  title,
  subtitle,
  tone
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  tone: "brand" | "peach" | "mint";
}) {
  const styles =
    tone === "brand"
      ? "bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)]"
      : tone === "peach"
        ? "bg-[color:var(--color-surface-peach)] text-[color:var(--color-warning)]"
        : "bg-[color:var(--color-surface-mint)] text-[color:var(--color-positive)]";
  return (
    <div className="flex items-center gap-3">
      <span className={cn("grid place-items-center w-9 h-9 rounded-xl shrink-0", styles)}>
        <Icon size={14} strokeWidth={1.75} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)] truncate">{title}</p>
        <p className="text-[11.5px] text-[color:var(--color-ink-3)] truncate">{subtitle}</p>
      </div>
    </div>
  );
}

function BasicRow({ icon: Icon, title, subtitle }: { icon: LucideIcon; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-[color:var(--color-surface-mint)] text-[color:var(--color-positive)] shrink-0">
        <Icon size={14} strokeWidth={1.75} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)] truncate">{title}</p>
        <p className="text-[11.5px] text-[color:var(--color-ink-3)] truncate">{subtitle}</p>
      </div>
    </div>
  );
}

function CategoryRow({ category, portfolioName }: { category: Category; portfolioName?: string }) {
  const tone = tonesFor(category.color);
  const { t } = useLocale();
  return (
    <div className="flex items-center gap-3">
      <span
        className="grid place-items-center w-9 h-9 rounded-xl shrink-0"
        style={{ background: tone.surface, color: tone.ink }}
      >
        <CategoryIcon name={category.icon} size={14} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)] truncate">{category.name}</p>
        <p className="text-[11.5px] text-[color:var(--color-ink-3)] truncate">
          {category.kind === "income" ? t("search.earnings") : t("search.expense")}
          {portfolioName ? ` · ${portfolioName}` : ""}
        </p>
      </div>
    </div>
  );
}

function CollaboratorRow({ membership, portfolioName }: { membership: Membership; portfolioName?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={membership.displayName} size={36} />
      <div className="flex-1 min-w-0">
        <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)] truncate">{membership.displayName}</p>
        <p className="text-[11.5px] text-[color:var(--color-ink-3)] truncate">
          {membership.role} · {(membership.ownershipBps / 100).toFixed(0)}%{portfolioName ? ` · ${portfolioName}` : ""}
        </p>
      </div>
    </div>
  );
}

function portfolioIcon(type: Portfolio["type"]): LucideIcon {
  if (type === "shared") return Handshake;
  if (type === "family") return Briefcase;
  return Building2;
}
