import { NavLink, useLocation } from "react-router-dom";
import { Clock3, Plus, Target, type LucideProps } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n";
import { useAppMode } from "@/lib/appMode";
import { emitCommand } from "@/lib/commands";
import { Sparkle } from "@/components/ui/Sparkle";
import { SETTINGS_ITEM, visibleNavItems } from "./navItems";

export function BottomNav() {
  const { t } = useLocale();
  const [mode] = useAppMode();
  const location = useLocation();
  // Bottom nav also surfaces Settings (which Sidebar puts in a footer button).
  // visibleNavItems hides Wealth + Shared in Light, leaving Overview + Money;
  // adding Settings gives a comfortable 3-icon mobile bar instead of 5.
  if (mode === "shared" && (location.pathname === "/" || location.pathname === "/pod")) {
    return null;
  }
  if (mode === "light") {
    const items = visibleNavItems(mode);
    const home = items[0]!;
    const buckets = items[1]!;
    const history = items[2]!;
    return (
      <nav
        aria-label="Primary"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[color:var(--color-line)] bg-[color:var(--color-paper)] pb-[max(env(safe-area-inset-bottom),12px)] pt-2 px-2 shadow-[0_-18px_50px_-34px_rgba(0,0,0,0.65)]"
      >
        <ul className="grid grid-cols-[1fr_1fr_72px_1fr_1fr] items-end max-w-md mx-auto">
          <CompactNavLink to={home.to} end label={t(home.labelKey)} icon={home.icon} />
          <CompactNavLink to={buckets.to} label={t(buckets.labelKey)} icon={buckets.icon} />
          <li className="flex justify-center">
            <button
              type="button"
              onClick={() => emitCommand("open-capture")}
              aria-label="Add something"
              className="nm-interactive mb-1 grid h-16 w-16 place-items-center rounded-[22px] bg-[color:var(--color-cta)] text-[color:var(--color-cta-ink)] shadow-[var(--shadow-lg)] active:scale-95"
            >
              <Plus size={28} strokeWidth={2.2} />
            </button>
          </li>
          <CompactNavLink to={history.to} label={t(history.labelKey)} icon={Clock3} />
          <CompactNavLink to={SETTINGS_ITEM.to} label={t(SETTINGS_ITEM.labelKey)} icon={SETTINGS_ITEM.icon} />
        </ul>
      </nav>
    );
  }
  if (mode === "advanced") {
    const home = visibleNavItems(mode)[0]!;
    return (
      <nav
        aria-label="Primary"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 border-t border-[color:var(--color-line)] bg-[color:var(--color-paper)] pb-[max(env(safe-area-inset-bottom),12px)] pt-2 px-2 shadow-[0_-18px_50px_-34px_rgba(0,0,0,0.65)]"
      >
        <ul className="grid grid-cols-5 items-end gap-1 max-w-md mx-auto">
          <CompactNavLink to={home.to} end label={t("overview")} icon={home.icon} />
          <CompactNavLink to="/money" label={t("money")} icon={Clock3} />
          {/* Numa OS is the center tab — always: threads, briefs, the catalog
              and local drafting are deterministic; AI only adds live answers. */}
          <NumaNavLink label={t("numaAi")} />
          <CompactNavLink to="/goals" label={t("goals")} icon={Target} />
          <CompactNavLink to={SETTINGS_ITEM.to} label={t("settings")} icon={SETTINGS_ITEM.icon} />
        </ul>
      </nav>
    );
  }
  const items = [...visibleNavItems(mode), SETTINGS_ITEM];
  return (
    <nav
      aria-label="Primary"
      className="lg:hidden fixed bottom-0 inset-x-0 z-30 nm-glass border-t border-[color:var(--color-line)] pb-[max(env(safe-area-inset-bottom),12px)] pt-2 px-2 shadow-[0_-18px_50px_-34px_rgba(0,0,0,0.65)]"
    >
      <ul className="nm-proximity-dock flex items-stretch justify-around max-w-md mx-auto" data-proximity-axis="x">
        {items.map((item) => {
          const Icon = item.icon;
          // SETTINGS_ITEM doesn't carry `end`; NavItem may. NavLink wants
          // `boolean | undefined`, so coalesce via a structural cast.
          const end = (item as { end?: boolean }).end;
          return (
            <li key={item.to} className="nm-proximity-item flex-1">
              <NavLink
                to={item.to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center justify-center gap-1 py-1.5 min-h-[56px] rounded-2xl text-[12px] font-medium tracking-[-0.005em] transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]",
                    isActive
                      ? "text-[color:var(--color-ink)]"
                      : "text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink-2)]"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        "grid place-items-center w-11 h-10 rounded-2xl transition-all",
                        isActive
                          ? "bg-[color:var(--color-brand-mist)] text-[color:var(--color-brand-strong)] shadow-[var(--shadow-sm)]"
                          : "text-[color:var(--color-ink-3)]"
                      )}
                    >
                      <Icon size={19} strokeWidth={1.9} />
                    </span>
                    <span>{t(item.labelKey)}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function NumaNavLink({ label }: { label: string }) {
  return (
    <li className="min-w-0">
      <NavLink
        to="/numa"
        aria-label={label}
        className={({ isActive }) =>
          cn(
            "flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[11.5px] font-semibold tracking-[-0.005em] transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]",
            isActive ? "text-[color:var(--color-ink)]" : "text-[color:var(--color-ink-3)]"
          )
        }
      >
        <span className="grid h-11 w-11 place-items-center rounded-[18px] bg-[color:var(--color-cta)] text-[color:var(--color-cta-ink)] shadow-[var(--shadow-sm)]">
          <Sparkle size={18} />
        </span>
        <span className="truncate">{label}</span>
      </NavLink>
    </li>
  );
}

function CompactNavLink({
  to,
  end,
  label,
  icon: Icon
}: {
  to: string;
  end?: boolean;
  label: string;
  icon: ComponentType<LucideProps>;
}) {
  return (
    <li className="min-w-0">
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            "flex min-h-[58px] flex-col items-center justify-center gap-1 rounded-2xl px-1 py-1.5 text-[11.5px] font-semibold tracking-[-0.005em] transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]",
            isActive
              ? "text-[color:var(--color-ink)]"
              : "text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink-2)]"
          )
        }
      >
        {({ isActive }) => (
          <>
            <span
              className={cn(
                "grid h-10 w-10 place-items-center rounded-2xl transition-all",
                isActive
                  ? "bg-[color:var(--color-brand-mist)] text-[color:var(--color-brand-strong)] shadow-[var(--shadow-sm)]"
                  : "text-[color:var(--color-ink-3)]"
              )}
            >
              <Icon size={19} strokeWidth={1.9} />
            </span>
            <span className="truncate">{label}</span>
          </>
        )}
      </NavLink>
    </li>
  );
}
