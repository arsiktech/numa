import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, Field, TextInput } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";
import type { PeriodSelection, PeriodPreset } from "@/lib/period";
import { usePeriodSelection } from "@/hooks/usePeriod";
import { useLocale } from "@/lib/i18n";
import { formatLocalDateInput, formatMonth } from "@/lib/dateFormat";

interface PresetOption {
  preset: PeriodPreset;
  labelKey:
    | "period.preset.month"
    | "period.preset.last-month"
    | "period.preset.30d"
    | "period.preset.this-quarter"
    | "period.preset.last-quarter"
    | "period.preset.year"
    | "period.preset.last-year";
}

const PRESETS: PresetOption[] = [
  { preset: "month", labelKey: "period.preset.month" },
  { preset: "last-month", labelKey: "period.preset.last-month" },
  { preset: "30d", labelKey: "period.preset.30d" },
  { preset: "this-quarter", labelKey: "period.preset.this-quarter" },
  { preset: "last-quarter", labelKey: "period.preset.last-quarter" },
  { preset: "year", labelKey: "period.preset.year" },
  { preset: "last-year", labelKey: "period.preset.last-year" }
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function PeriodPicker({ open, onClose }: Props) {
  const [, setSelection] = usePeriodSelection();
  const { locale, t } = useLocale();
  const dateLocale = locale === "ru" ? "ru" : locale === "es" ? "es" : "en";
  const today = useMemo(() => new Date(), []);
  const [yearBrowsed, setYearBrowsed] = useState(today.getFullYear());
  const [customStart, setCustomStart] = useState<string>(() =>
    formatLocalDateInput(new Date(today.getFullYear(), today.getMonth(), 1))
  );
  const [customEnd, setCustomEnd] = useState<string>(() => formatLocalDateInput(today));

  useEffect(() => {
    if (!open) return;
    setYearBrowsed(today.getFullYear());
  }, [open, today]);

  function apply(next: PeriodSelection) {
    setSelection(next);
    onClose();
  }

  function applyCustom() {
    const start = new Date(`${customStart}T00:00:00`);
    const end = new Date(`${customEnd}T23:59:59`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start.getTime() > end.getTime()) return;
    apply({ custom: { startMs: start.getTime(), endMs: end.getTime() } });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("period.dialogTitle")}
      description={t("period.dialogDescription")}
      width={520}
    >
      <div className="flex flex-col gap-5">
        <section>
          <p className="nm-eyebrow mb-2">{t("period.quickPresets")}</p>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((option) => (
              <button
                key={option.preset}
                type="button"
                onClick={() => apply({ preset: option.preset })}
                className="px-3 py-1.5 rounded-full text-[12.5px] font-medium border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-cream-50)] hover:border-[color:var(--color-brand)] transition-colors"
              >
                {t(option.labelKey)}
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="nm-eyebrow">{t("period.pickMonth")}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setYearBrowsed((y) => y - 1)}
                className="grid place-items-center w-8 h-8 rounded-xl text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-cream-100)]"
                aria-label={t("period.previousYear")}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-[13px] font-semibold w-12 text-center text-[color:var(--color-ink)] nm-num">
                {yearBrowsed}
              </span>
              <button
                type="button"
                onClick={() => setYearBrowsed((y) => y + 1)}
                className="grid place-items-center w-8 h-8 rounded-xl text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-cream-100)]"
                aria-label={t("period.nextYear")}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 12 }, (_, index) => {
              const month = index + 1;
              const label = formatMonth(new Date(yearBrowsed, index, 1), "short", dateLocale);
              const isFuture =
                yearBrowsed > today.getFullYear() ||
                (yearBrowsed === today.getFullYear() && month - 1 > today.getMonth());
              const isCurrent = yearBrowsed === today.getFullYear() && month - 1 === today.getMonth();
              return (
                <button
                  key={label}
                  type="button"
                  disabled={isFuture}
                  onClick={() => apply({ ym: { year: yearBrowsed, month } })}
                  className={cn(
                    "h-10 rounded-xl text-[13px] font-medium border transition-colors",
                    isFuture
                      ? "border-[color:var(--color-line)] bg-[color:var(--color-cream-50)] text-[color:var(--color-ink-5)] cursor-not-allowed"
                      : "border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-brand-mist)] hover:border-[color:var(--color-brand)] hover:text-[color:var(--color-brand-strong)]",
                    isCurrent && !isFuture && "ring-2 ring-[color:var(--color-brand-soft)]"
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-2">
            <p className="nm-eyebrow">{t("period.customRange")}</p>
            <Pill tone="neutral">{t("period.fromTo")}</Pill>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("period.start")}>
              <TextInput
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </Field>
            <Field label={t("period.end")}>
              <TextInput
                type="date"
                value={customEnd}
                min={customStart}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="button" variant="primary" onClick={applyCustom}>
              {t("period.applyRange")}
            </Button>
          </div>
        </section>
      </div>
    </Dialog>
  );
}
