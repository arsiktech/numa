import { lazy, Suspense, useEffect, useState } from "react";
import { Search } from "lucide-react";
import { DialogLoadingFallback } from "@/components/layout/DialogLoadingFallback";
import { PeriodSwitcher } from "./PeriodSwitcher";
import { Sparkle } from "@/components/ui/Sparkle";
import { useLocale } from "@/lib/i18n";
import { useAppMode } from "@/lib/appMode";
import { AI_ENABLED } from "@/lib/aiEnabled";

const loadSearchDialog = () =>
  import("./SearchDialog").then((module) => ({ default: module.SearchDialog }));
const loadAIChatDialog = () =>
  import("@/components/features/AIChatDialog").then((module) => ({
    default: module.AIChatDialog
  }));

const LazySearchDialog = lazy(loadSearchDialog);
const LazyAIChatDialog = lazy(loadAIChatDialog);

/**
 * Desktop-only top bar.
 *
 * On mobile the header is completely gone (per the user's request) — the
 * sidebar is hidden too on small screens, so the visible chrome is just
 * the BottomNav at the bottom + the FloatingAddFab cluster + a small
 * Search button rendered by the FAB. PeriodSwitcher only appears inline
 * on the pages that actually need a date range (/money).
 *
 * Desktop keeps the band of: PeriodSwitcher + spacer + Search pill + Ask
 * Numa, all at h-11. PortfolioSwitcher and Mode chip live in the Sidebar
 * footer, not here.
 */
export function TopBar({ showPeriodSwitcher = true }: { showPeriodSwitcher?: boolean }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPrompt, setChatPrompt] = useState<string | null>(null);
  const { t } = useLocale();
  const [appMode] = useAppMode();
  const isLight = appMode === "light";
  // Shared-only users have no personal cashflow to chat about; mirror Light
  // and hide Ask Numa entirely so the chrome stays single-purpose.
  const isShared = appMode === "shared";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        setSearchOpen((value) => !value);
      } else if ((event.metaKey || event.ctrlKey) && key === "j" && !isLight && !isShared) {
        event.preventDefault();
        setChatOpen((value) => !value);
      } else if (event.key === "/" && !isTypingInField(event.target)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [isLight, isShared]);

  return (
    <header className="hidden lg:block sticky top-0 z-20 px-4 sm:px-6 lg:px-8 py-3 border-b border-[color:var(--color-line)] nm-glass">
      <div className="w-full flex items-center gap-3">
        {showPeriodSwitcher ? <PeriodSwitcher /> : null}
        <div className="flex-1 min-w-0" />
        <button
          type="button"
          aria-label={t("search")}
          onClick={() => setSearchOpen(true)}
          onPointerEnter={() => void loadSearchDialog()}
          onFocus={() => void loadSearchDialog()}
          className="nm-interactive inline-flex items-center gap-2 h-11 px-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-glass)] text-[12px] text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-glass-strong)] active:scale-[0.98] shadow-[var(--shadow-sm)]"
        >
          <Search size={14} />
          <span>{t("search")}</span>
          <kbd className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-[color:var(--color-cream-100)] border border-[color:var(--color-line)]">
            ⌘K
          </kbd>
        </button>
        {/* Ask Numa is Advanced-only — too much for the Light "simple expense
            tracker" pitch, and noise for the Shared-only pot mode. */}
        {isLight || isShared || !AI_ENABLED ? null : (
          <button
            type="button"
            aria-label={t("askNuma")}
            onClick={() => setChatOpen(true)}
            onPointerEnter={() => void loadAIChatDialog()}
            onFocus={() => void loadAIChatDialog()}
            className="nm-interactive inline-flex items-center gap-2 h-11 px-3.5 rounded-2xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] hover:brightness-105 active:scale-[0.98] text-[13px] font-semibold shadow-[var(--shadow-sm)]"
            title={t("askNuma")}
          >
            <Sparkle size={12} />
            {t("askNuma")}
          </button>
        )}
      </div>
      {searchOpen ? (
        <Suspense fallback={<DialogLoadingFallback />}>
          <LazySearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
        </Suspense>
      ) : null}
      {chatOpen ? (
        <Suspense fallback={<DialogLoadingFallback />}>
          <LazyAIChatDialog
            open={chatOpen}
            initialPrompt={chatPrompt}
            onClose={() => {
              setChatOpen(false);
              setChatPrompt(null);
            }}
          />
        </Suspense>
      ) : null}
    </header>
  );
}

function isTypingInField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
