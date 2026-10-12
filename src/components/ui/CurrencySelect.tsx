import { cn } from "@/lib/cn";
import { SUPPORTED_CURRENCIES } from "@/lib/money";
import type { CurrencyCode } from "@/lib/types";

interface CurrencySelectProps {
  value: CurrencyCode;
  onChange: (value: CurrencyCode) => void;
  className?: string;
  id?: string;
}

/**
 * The canonical currency picker: one dropdown, one list of supported codes.
 * Previously every record dialog hand-rolled the same `SUPPORTED_CURRENCIES
 * .map(...)` select; new codes must be added in exactly one place (`lib/money`).
 */
export function CurrencySelect({ value, onChange, className, id }: CurrencySelectProps) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value as CurrencyCode)}
      className={cn(
        "h-12 sm:h-11 px-3 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[16px] sm:text-[14px] leading-[1.25] text-[color:var(--color-ink)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-2 focus:ring-[color:var(--color-brand-soft)] transition",
        className
      )}
    >
      {SUPPORTED_CURRENCIES.map((code) => (
        <option key={code} value={code}>
          {code}
        </option>
      ))}
    </select>
  );
}

