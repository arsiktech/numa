import type { ScanTransaction } from "@/services/scanReceipt";

/**
 * Shared state + copy helpers for the receipt-scan flow. The dialog itself and
 * its presentational parts (scan/parts.tsx) both use these.
 */

export type Phase = "input" | "compressing" | "scanning" | "saving" | "review" | "rejected" | "error";

export interface EditableTx extends ScanTransaction {
  uid: string;
  applied?: boolean;
  queued?: boolean;
  include: boolean;
  categoryToCreate: string | null; // when user opts to create the AI-suggested category
  accountId: string | null;
}

export const COLOR_PALETTE = ["mint", "peach", "lavender", "sky", "blush", "sand"] as const;

/**
 * Map raw scan/vision failures (status codes, JSON envelopes, local image
 * errors) to calm user-facing copy. The raw detail is for console.warn only.
 */
export function friendlyScanError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (/\b429\b/.test(raw) || /rate.?limit|quota|limit reached/i.test(raw)) {
    return "You've hit today's AI limit — it resets tomorrow.";
  }
  if (/\b40[13]\b/.test(raw) || /unauthori[sz]ed|forbidden/i.test(raw)) {
    return "Your session needs a refresh — please sign in again, then retry.";
  }
  return "Numa Pro couldn't read this one just now. Try again in a moment.";
}

