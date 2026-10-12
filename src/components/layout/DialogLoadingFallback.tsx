import { createPortal } from "react-dom";
import { LoadingSurface } from "@/components/layout/LoadingSurface";

export function DialogLoadingFallback() {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[color:var(--color-ink)]/24 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-3xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] shadow-[var(--shadow-md)]">
        <LoadingSurface compact className="min-h-[132px] bg-transparent px-4" />
      </div>
    </div>,
    document.body
  );
}
