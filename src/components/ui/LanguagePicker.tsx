import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Languages } from "lucide-react";
import { cn } from "@/lib/cn";
import { LOCALES, useLocale } from "@/lib/i18n";
import type { AppLocale } from "@/lib/types";

const FLAGS: Record<AppLocale, string> = {
  en: "🇬🇧",
  ru: "🇷🇺",
  es: "🇪🇸"
};

/** ru/es translation coverage is still partial — labelled beta for v1. */
const BETA_LOCALES: ReadonlySet<AppLocale> = new Set<AppLocale>(["ru", "es"]);

interface LanguagePickerProps {
  /** Called after the user picks a language. The pick has already been applied
   *  to the locale store; this is just a notification hook for parents that
   *  want to mirror the change to user prefs. */
  onChange?: (locale: AppLocale) => void;
  /** Renders a compact icon-only trigger instead of the labelled chip. */
  compact?: boolean;
  /** Extra classes on the trigger button. */
  className?: string;
}

/**
 * LanguagePicker — Citrus-style popover that replaces the cramped native
 * `<select>`. Trigger shows flag + native name; popover lists every locale
 * with a checkmark on the active one, big 48px rows so it's mobile-friendly.
 *
 * Uses a portal so the popover sits above sidebar overflow/clipping.
 */
export function LanguagePicker({
  onChange,
  compact = false,
  className
}: LanguagePickerProps) {
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{
    bottom: number;
    left: number;
    width: number;
  } | null>(null);

  // Position popover relative to trigger — opens UPWARD so the trigger sits
  // at the bottom of the sidebar without the panel clipping the viewport.
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const minWidth = compact ? 220 : Math.max(rect.width, 240);
    setCoords({
      bottom: window.innerHeight - rect.top + 8,
      left: Math.min(rect.left, window.innerWidth - minWidth - 12),
      width: minWidth
    });
  }, [open, compact]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        !panelRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = LOCALES.find((l) => l.value === locale) ?? LOCALES[0];

  function pick(value: AppLocale) {
    setLocale(value);
    onChange?.(value);
    setOpen(false);
  }

  const panel =
    open && coords
      ? createPortal(
          <div
            ref={panelRef}
            role="listbox"
            aria-label="Language"
            className="fixed z-[60] nm-popover"
            style={{
              bottom: coords.bottom,
              left: coords.left,
              width: coords.width
            }}
          >
            <div className="rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-1.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl">
              <div className="px-3 pt-2 pb-1 text-[10px] font-mono tracking-[0.16em] uppercase text-[color:var(--color-ink-4)]">
                Language
              </div>
              {LOCALES.map((opt) => {
                const active = opt.value === locale;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => pick(opt.value)}
                    className={cn(
                      "w-full min-h-[48px] flex items-center gap-3 px-3 rounded-xl text-left transition-colors",
                      active
                        ? "bg-[color:var(--color-brand-mist)] text-[color:var(--color-ink)]"
                        : "text-[color:var(--color-ink)] hover:bg-[color:var(--color-cream-100)]"
                    )}
                  >
                    <span aria-hidden className="text-[20px] leading-none">
                      {FLAGS[opt.value]}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold leading-tight">
                        {opt.nativeName}
                        {BETA_LOCALES.has(opt.value) ? (
                          <span className="ml-1.5 text-[10px] font-medium text-[color:var(--color-ink-4)]">
                            (beta)
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-[11px] text-[color:var(--color-ink-3)] leading-tight">
                        {opt.label}
                      </span>
                    </span>
                    {active ? (
                      <span className="w-6 h-6 rounded-full bg-[color:var(--color-brand)] grid place-items-center text-[color:var(--color-cta-ink)]">
                        <Check size={14} strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body
        )
      : null;

  if (compact) {
    return (
      <>
        <button
          ref={triggerRef}
          type="button"
          aria-label={`Language: ${current.nativeName}`}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "grid place-items-center w-11 h-11 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[color:var(--color-ink)] hover:bg-[color:var(--color-cream-100)] active:scale-[0.97] transition",
            className
          )}
        >
          <span aria-hidden className="text-[18px] leading-none">
            {FLAGS[current.value]}
          </span>
        </button>
        {panel}
      </>
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full min-h-[44px] flex items-center gap-2.5 px-3 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)]/70 text-[color:var(--color-ink)] hover:bg-[color:var(--color-paper)] active:scale-[0.99] transition",
          className
        )}
      >
        <Languages size={14} className="text-[color:var(--color-ink-4)]" />
        <span aria-hidden className="text-[16px] leading-none">
          {FLAGS[current.value]}
        </span>
        <span className="flex-1 text-left text-[12.5px] font-semibold tracking-tight">
          {current.nativeName}
        </span>
        <ChevronGlyph open={open} />
      </button>
      {panel}
    </>
  );
}

function ChevronGlyph({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      className={cn(
        "text-[color:var(--color-ink-4)] transition-transform",
        open ? "rotate-180" : ""
      )}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path d="M2 4l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
