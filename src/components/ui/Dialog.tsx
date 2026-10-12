import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { backdropMotion, sheetMotion } from "@/lib/motion";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useFocusTrap } from "@/hooks/useFocusTrap";

/** Everything a Tab press can land on inside the dialog panel. */
interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Put form actions here (using the button's form attribute) to keep them
   * reachable while long content scrolls. */
  footer?: ReactNode;
  dismissible?: boolean;
  width?: number;
  /** Accessible name for the dialog when `title` is not rendered visually.
   *  Falls back to a generic "Dialog" only as a last resort — screen-reader
   *  users need to know what they just opened. */
  ariaLabel?: string;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  dismissible = true,
  width = 560,
  ariaLabel
}: DialogProps) {
  // Generated once per dialog instance, attached to the title and referenced
  // via aria-labelledby so screen readers actually announce "Edit transaction"
  // (or whatever title is) when the modal opens instead of just "dialog".
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Initial focus, focus restore, Escape-to-close and the Tab cycle all live
  // in the shared hook so hand-rolled sheets trap focus identically.
  const dismiss = () => { if (dismissible) onClose(); };
  useFocusTrap(panelRef, open, dismiss);

  useBodyScrollLock(open);

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4 lg:p-6">
          <motion.div
            {...backdropMotion}
            onClick={dismiss}
            className="absolute inset-0 bg-[color:var(--color-ink)]/30 backdrop-blur-sm"
          />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={!title && ariaLabel ? ariaLabel : undefined}
            aria-describedby={description ? descId : undefined}
            {...sheetMotion}
            className={cn(
              "relative bg-[color:var(--color-paper)] shadow-[var(--shadow-xl)] border border-[color:var(--color-line)] overflow-hidden flex flex-col w-[min(100vw,100%)] max-h-[min(calc(100dvh-12px),920px)] rounded-t-3xl pb-[max(env(safe-area-inset-bottom),20px)] outline-none",
              "sm:rounded-3xl sm:max-h-[min(calc(100dvh-32px),920px)] sm:pb-0",
              "lg:max-h-[min(calc(100dvh-48px),920px)]"
            )}
            style={{ maxWidth: `min(${width}px, calc(100vw - 24px))` }}
          >
            <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
              <span className="w-9 h-1.5 rounded-full bg-[color:var(--color-line-strong)]" />
            </div>
            <div className="flex items-start justify-between gap-3 px-4 sm:px-6 pt-3 sm:pt-5 pb-3 shrink-0">
              <div className="flex-1 min-w-0">
                {title ? (
                  <h2
                    id={titleId}
                    className="text-[16px] font-semibold text-[color:var(--color-ink)] tracking-[-0.01em] break-words"
                  >
                    {title}
                  </h2>
                ) : null}
                {description ? (
                  <p
                    id={descId}
                    className="mt-1 text-[12.5px] text-[color:var(--color-ink-3)] break-words"
                  >
                    {description}
                  </p>
                ) : null}
              </div>
              {/* Touch target bumped to 44×44 to satisfy WCAG 2.5.5 — was 32×32. */}
              <button
                type="button"
                onClick={dismiss}
                disabled={!dismissible}
                aria-label="Close"
                className="grid place-items-center w-11 h-11 -mr-1.5 -mt-1.5 rounded-xl hover:bg-[color:var(--color-cream-100)] text-[color:var(--color-ink-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-4 sm:px-6 pb-6 lg:pb-5 pt-2 overflow-y-auto overscroll-contain min-w-0">
              {children}
            </div>
            {footer ? (
              <div className="shrink-0 border-t border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-4 sm:px-6 py-4">
                {footer}
              </div>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

export function Field({
  label,
  children,
  hint
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] font-medium text-[color:var(--color-ink-3)] uppercase tracking-[0.06em]">
        {label}
      </span>
      {children}
      {hint ? (
        // ink-3 instead of ink-4 — ink-4 fails WCAG 4.5:1 in light mode (≈2.9:1).
        <span className="text-[11.5px] text-[color:var(--color-ink-3)]">{hint}</span>
      ) : null}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        // Mobile-friendly h-12 (48px tap target) collapses to h-11 on sm+.
        "min-w-0 w-full h-12 sm:h-11 px-3 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[16px] sm:text-[14px] leading-[1.25] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-3)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-2 focus:ring-[color:var(--color-brand-soft)] transition",
        props.className
      )}
    />
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full resize-none rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3.5 py-3 text-[16px] sm:text-[14px] leading-[1.45] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-3)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-2 focus:ring-[color:var(--color-brand-soft)] transition",
        props.className
      )}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-12 sm:h-11 px-3 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[16px] sm:text-[14px] leading-[1.25] text-[color:var(--color-ink)] focus:outline-none focus:border-[color:var(--color-brand)] focus:ring-2 focus:ring-[color:var(--color-brand-soft)] transition",
        props.className
      )}
    />
  );
}
