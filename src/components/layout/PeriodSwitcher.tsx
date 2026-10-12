import { useMemo, useState } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";
import { PeriodPicker } from "./PeriodPicker";
import { usePeriodRange } from "@/hooks/usePeriod";
import { useLocale } from "@/lib/i18n";
import { formatDayMonth, formatDayMonthYear, formatMonth, formatMonthYear, formatYear } from "@/lib/dateFormat";

export function PeriodSwitcher() {
  const range = usePeriodRange();
  const { locale, t } = useLocale();
  const dateLocale = locale === "ru" ? "ru" : locale === "es" ? "es" : "en";
  const localizedRange = useMemo(() => {
    const selection = range.selection;
    if (selection.custom) {
      return {
        label: `${formatDayMonthYear(range.start, dateLocale)} → ${formatDayMonthYear(range.end, dateLocale)}`,
        shortLabel: `${formatDayMonth(range.start, dateLocale)} → ${formatDayMonth(range.end, dateLocale)}`
      };
    }
    if (selection.ym) {
      return {
        label: formatMonthYear(range.start, "long", dateLocale),
        shortLabel: formatMonthYear(range.start, "short", dateLocale)
      };
    }
    switch (selection.preset) {
      case "30d":
        return { label: t("period.preset.30d"), shortLabel: "30" };
      case "year":
      case "last-year":
        return { label: formatYear(range.start), shortLabel: formatYear(range.start) };
      case "this-quarter":
      case "last-quarter":
        return { label: range.label, shortLabel: range.shortLabel };
      case "last-month":
      case "month":
      default:
        return {
          label: formatMonthYear(range.start, "long", dateLocale),
          shortLabel: formatMonth(range.start, "short", dateLocale)
        };
    }
  }, [dateLocale, range.end, range.label, range.selection, range.shortLabel, range.start, t]);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={t("period.pick")}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 sm:gap-2 h-11 px-3 rounded-full border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[13px] font-medium text-[color:var(--color-ink)] hover:bg-[color:var(--color-cream-50)] active:scale-[0.98] transition shadow-[var(--shadow-sm)] min-w-0"
      >
        <CalendarRange size={14} className="text-[color:var(--color-ink-3)] shrink-0" />
        <span className="nm-num truncate sm:hidden max-w-[110px]">{localizedRange.shortLabel}</span>
        <span className="nm-num truncate hidden sm:inline max-w-[180px]">{localizedRange.label}</span>
        <ChevronDown size={14} className="text-[color:var(--color-ink-4)] shrink-0" />
      </button>
      <PeriodPicker open={open} onClose={() => setOpen(false)} />
    </>
  );
}
