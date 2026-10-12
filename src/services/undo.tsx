import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Undo2 } from "lucide-react";
import { toastMotion } from "@/lib/motion";

/**
 * Global "undo toast" — Gmail-style, bottom-center.
 *
 * Call `push({ message, onUndo, durationMs? })` from anywhere to show a single
 * dismissible pill ("Transaction deleted. Undo"). Only one toast is visible at
 * a time — pushing a new one replaces the previous (latest wins). Auto-dismisses
 * after `durationMs` (default 5000ms). Clicking Undo fires the callback then
 * dismisses. Esc dismisses without undo.
 *
 * Cloud caveat: for cloud-backed entities (Convex Id), the undo callback
 * usually re-dispatches an "add*" action with the captured snapshot. The cloud
 * bridge in `useNuma` re-routes that as a fresh insert and Convex generates a
 * new server-side id. The user gets their data back, but the id won't match
 * the original. That's fine for the user experience — anything that referenced
 * the old id (rare) is best-effort.
 */

interface UndoToast {
  id: number;
  message: string;
  onUndo: () => void;
  durationMs: number;
}

interface PushArgs {
  message: string;
  onUndo: () => void;
  durationMs?: number;
}

interface UndoCtx {
  push: (toast: PushArgs) => () => void;
}

const Ctx = createContext<UndoCtx | null>(null);

const DEFAULT_DURATION = 5000;

export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<UndoToast | null>(null);
  const timerRef = useRef<number | null>(null);
  const nextIdRef = useRef(1);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimer();
    setToast(null);
  }, [clearTimer]);

  const push = useCallback(
    ({ message, onUndo, durationMs = DEFAULT_DURATION }: PushArgs) => {
      clearTimer();
      const id = nextIdRef.current++;
      setToast({ id, message, onUndo, durationMs });
      timerRef.current = window.setTimeout(() => {
        setToast((current) => (current && current.id === id ? null : current));
        timerRef.current = null;
      }, durationMs);
      // Programmatic dismiss handle. Only dismisses if this toast is still the
      // active one (the caller might have already been replaced by a newer push).
      return () => {
        setToast((current) => {
          if (current && current.id === id) {
            clearTimer();
            return null;
          }
          return current;
        });
      };
    },
    [clearTimer]
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && toast) dismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toast, dismiss]);

  useEffect(() => () => clearTimer(), [clearTimer]);

  function handleUndo() {
    if (!toast) return;
    toast.onUndo();
    dismiss();
  }

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <div
              aria-live="polite"
              className="fixed left-1/2 -translate-x-1/2 z-[70] pointer-events-none bottom-20 lg:bottom-6"
              style={{
                paddingBottom: "env(safe-area-inset-bottom)"
              }}
            >
              <AnimatePresence>
                {toast ? (
                  <motion.div
                    key={toast.id}
                    {...toastMotion}
                    className="pointer-events-auto inline-flex items-center gap-3 bg-[color:var(--color-paper)] shadow-lg rounded-2xl py-2.5 px-4 border border-[color:var(--color-line)]"
                    role="status"
                  >
                    <span className="text-[13px] text-[color:var(--color-ink)] whitespace-nowrap">
                      {toast.message}
                    </span>
                    <button
                      type="button"
                      onClick={handleUndo}
                      className="inline-flex items-center gap-1 text-[13px] font-semibold text-[color:var(--color-brand-strong)] underline underline-offset-4 hover:opacity-80 transition-opacity"
                    >
                      <Undo2 size={13} strokeWidth={2.4} />
                      Undo
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>,
            document.body
          )
        : null}
    </Ctx.Provider>
  );
}

export function useUndo(): UndoCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useUndo must be used inside <UndoToastProvider>");
  return ctx;
}
