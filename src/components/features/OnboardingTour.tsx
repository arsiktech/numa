import { useEffect, useState, type ComponentType, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Coins,
  Command,
  Heart,
  Receipt,
  Sparkles,
  type LucideProps
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { cn } from "@/lib/cn";
import { DUR, EASE_OUT, backdropMotion, sheetMotion } from "@/lib/motion";
import { useAppMode } from "@/lib/appMode";

interface OnboardingTourProps {
  open: boolean;
  onClose: () => void;
}

type IconComponent = ComponentType<LucideProps>;

interface Step {
  icon: IconComponent;
  /** Tailwind classes applied to the icon tile (background) + icon stroke colour. */
  tileClass: string;
  title: string;
  body: string;
  nextLabel: string;
}

const ADVANCED_STEPS: Step[] = [
  {
    icon: Sparkles,
    tileClass: "bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)]",
    title: "Welcome to Numa Pro",
    body: "Track every euro, every coin, every asset — and your partner's share of it. Here's a quick tour.",
    nextLabel: "Next"
  },
  {
    icon: Receipt,
    tileClass: "bg-[color:var(--color-surface-peach)] text-[color:var(--color-peach-300)]",
    title: "Three ways to add a transaction",
    body:
      "Tap + Add to type one in manually, scan a receipt with the camera, or just speak: 'Coffee, 4 euros'. Numa Pro figures out the rest.",
    nextLabel: "Next"
  },
  {
    icon: Coins,
    tileClass: "bg-[color:var(--color-surface-mint)] text-[color:var(--color-mint-300)]",
    title: "Your net worth, live",
    body:
      "Add bank accounts, real estate, and crypto under Wealth. Numa Pro pulls live prices for stocks and crypto and snapshots your net worth monthly.",
    nextLabel: "Next"
  },
  {
    icon: Sparkles,
    tileClass: "bg-[color:var(--color-surface-lavender)] text-[color:var(--color-lavender-300)]",
    title: "Ask Numa Pro anything",
    body:
      "Press ⌘J to chat with Numa Pro about your finances. 'How much did I spend on food in May?' — grounded in your real data.",
    nextLabel: "Next"
  },
  {
    icon: Command,
    tileClass: "bg-[color:var(--color-surface-sky)] text-[color:var(--color-sky-300)]",
    title: "⌘K for everything",
    body:
      "Find transactions, assets, anything — or fire commands like 'Voice add' or 'Import CSV'.",
    nextLabel: "Next"
  },
  {
    icon: Heart,
    tileClass: "bg-[color:var(--color-surface-blush)] text-[color:var(--color-blush-300)]",
    title: "You're set",
    body: "Add your first transaction or scan a receipt. Pull down anytime to refresh.",
    nextLabel: "Get started"
  }
];

// Light's 3-step tour skips Wealth + Ask-Numa Pro + ⌘K — those surfaces are
// hidden in Light, no point teaching them.
const LIGHT_STEPS: Step[] = [
  {
    icon: Sparkles,
    tileClass: "bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)]",
    title: "Welcome to Numa Pro",
    body: "A simple way to track what you spend and set monthly budgets per category. We'll keep things light.",
    nextLabel: "Next"
  },
  {
    icon: Receipt,
    tileClass: "bg-[color:var(--color-surface-peach)] text-[color:var(--color-peach-300)]",
    title: "Add an expense in seconds",
    body:
      "Tap + Add expense to log a coffee, your rent, anything. We auto-suggest the category from past entries.",
    nextLabel: "Next"
  },
  {
    icon: Coins,
    tileClass: "bg-[color:var(--color-surface-mint)] text-[color:var(--color-mint-300)]",
    title: "Set budgets, see progress",
    body:
      "Open a category to set a monthly limit. The home screen tracks how much you've spent and how much is left.",
    nextLabel: "Get started"
  }
];

export function OnboardingTour({ open, onClose }: OnboardingTourProps): ReactElement | null {
  const [index, setIndex] = useState(0);
  const [appMode] = useAppMode();
  const STEPS = appMode === "light" ? LIGHT_STEPS : ADVANCED_STEPS;
  useBodyScrollLock(open);

  // Reset to the first card every time the tour opens so re-triggers from
  // Settings ("Show onboarding again") start clean.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Keyboard: Esc closes (treated as Skip), Enter advances / finishes.
  useEffect(() => {
    if (!open) return;
    function handler(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        setIndex((prev) => {
          if (prev >= STEPS.length - 1) {
            onClose();
            return prev;
          }
          return prev + 1;
        });
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose, STEPS.length]);

  if (typeof document === "undefined") return null;
  if (!open) {
    // AnimatePresence still needs a child to track for exit animations, so we
    // render the wrapper but no overlay when closed.
    return createPortal(<AnimatePresence />, document.body);
  }

  const step = STEPS[index]!;
  const Icon = step.icon;
  const isLast = index === STEPS.length - 1;

  function next() {
    if (isLast) onClose();
    else setIndex((i) => i + 1);
  }

  return createPortal(
    <AnimatePresence>
      <div
        key="onboarding-tour"
        className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      >
        <motion.div
          {...backdropMotion}
          onClick={onClose}
          className="absolute inset-0 bg-[color:var(--color-ink)]/30 backdrop-blur-sm"
        />
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-title"
          {...sheetMotion}
          className={cn(
            "relative nm-glass-strong overflow-hidden flex flex-col w-full max-h-[88vh] rounded-t-3xl pb-[max(env(safe-area-inset-bottom),20px)]",
            "sm:rounded-3xl sm:max-h-[84vh] sm:pb-0"
          )}
          style={{ maxWidth: 440 }}
        >
          <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
            <span className="w-9 h-1.5 rounded-full bg-[color:var(--color-line-strong)]" />
          </div>

          <div className="flex items-start justify-end px-3 pt-2 sm:pt-3 shrink-0">
            {!isLast ? (
              <button
                type="button"
                onClick={onClose}
                // 44×44 touch area + ink-3 color → WCAG 2.5.5 + 1.4.3 pass.
                className="grid place-items-center min-w-11 h-11 -mr-1 px-3 rounded-lg text-[12.5px] font-medium text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)] hover:bg-[color:var(--color-cream-100)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)] transition-colors"
              >
                Skip
              </button>
            ) : (
              <span className="h-11" aria-hidden />
            )}
          </div>

          <div className="px-6 pb-6 sm:pb-7 pt-1 flex flex-col items-center text-center">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={`step-${index}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: DUR.card, ease: EASE_OUT }}
                className="flex flex-col items-center"
              >
                <span
                  className={cn(
                    "grid place-items-center w-20 h-20 rounded-3xl mb-5",
                    step.tileClass
                  )}
                >
                  <Icon size={36} strokeWidth={1.6} />
                </span>
                <h2
                  id="onboarding-title"
                  className="text-[22px] sm:text-[24px] font-semibold tracking-[-0.02em] text-[color:var(--color-ink)]"
                >
                  {step.title}
                </h2>
                <p className="mt-3 max-w-[340px] text-[14px] leading-relaxed text-[color:var(--color-ink-3)]">
                  {step.body}
                </p>
              </motion.div>
            </AnimatePresence>

            <div
              className="flex items-center gap-1.5 mt-7"
              role="tablist"
              aria-label="Tour progress"
            >
              {STEPS.map((_, i) => {
                const active = i === index;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIndex(i)}
                    role="tab"
                    aria-selected={active}
                    aria-label={`Step ${i + 1} of ${STEPS.length}`}
                    className={cn(
                      "h-1.5 rounded-full transition-all duration-300",
                      active
                        ? "w-6 bg-[color:var(--color-ink)]"
                        : "w-1.5 bg-[color:var(--color-line-strong)] hover:bg-[color:var(--color-ink-4)]"
                    )}
                  />
                );
              })}
            </div>

            <Button
              type="button"
              variant="primary"
              size="lg"
              onClick={next}
              className="mt-6 w-full"
              autoFocus
            >
              {step.nextLabel}
            </Button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
