import type { CurrencyCode } from "@/lib/money";
import {
  AI_CONTEXT_CODE_LIMIT,
  AI_CONTEXT_ID_LIMIT,
  AI_CONTEXT_NAME_LIMIT,
  AI_RECEIPT_CONTEXT_LIST_LIMIT,
  AI_RECEIPT_TEXT_LIMIT
} from "@/lib/aiRequestLimits";

export interface ScanTransaction {
  kind: "income" | "expense" | "settlement" | "holding" | "unknown";
  amount: number;
  currency: "USD" | "EUR" | "UNKNOWN";
  description: string;
  merchantOrCounterparty: string | null;
  occurredAt: string | null;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  notes: string | null;
  confidence: {
    amount: number;
    currency: number;
    description: number;
    category: number;
    date: number;
  };
}

export interface ScanResult {
  imageType:
    | "bank_transaction"
    | "bank_statement"
    | "physical_receipt"
    | "payment_app_screenshot"
    | "investment_screenshot"
    | "crypto_screenshot"
    | "other_financial"
    | "not_financial";
  detectedSubject: string;
  rejectionMessage: string | null;
  transactions: ScanTransaction[];
  summary: string;
}

export interface ScanContext {
  portfolioName: string;
  portfolioType: "personal" | "shared" | "family";
  defaultCurrency: CurrencyCode;
  categories: Array<{ id: string; name: string; kind: "income" | "expense" }>;
  members: Array<{ userId: string; displayName: string }>;
  locale?: string;
}

const MAX_DIM = 1280;
const JPEG_QUALITY = 0.82;

export async function compressImage(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const ratio = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const width = Math.round(img.width * ratio);
        const height = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas context not available");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    img.src = url;
  });
}

/**
 * The /api/parse-receipt route now requires a signed-in user (it spends on the
 * vision/AI provider), so callers pass the current Convex auth token from
 * `useAuthToken()`. Without it the request is rejected with 401.
 */
function authHeaders(authToken?: string | null): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
  };
}

export function boundedScanContext(context: ScanContext): ScanContext {
  return {
    ...context,
    portfolioName: context.portfolioName.slice(0, AI_CONTEXT_NAME_LIMIT),
    locale: context.locale?.slice(0, AI_CONTEXT_CODE_LIMIT),
    categories: context.categories
      .slice(0, AI_RECEIPT_CONTEXT_LIST_LIMIT)
      .map((category) => ({
        ...category,
        id: category.id.slice(0, AI_CONTEXT_ID_LIMIT),
        name: category.name.slice(0, AI_CONTEXT_NAME_LIMIT)
      })),
    members: context.members
      .slice(0, AI_RECEIPT_CONTEXT_LIST_LIMIT)
      .map((member) => ({
        userId: member.userId.slice(0, AI_CONTEXT_ID_LIMIT),
        displayName: member.displayName.slice(0, AI_CONTEXT_NAME_LIMIT)
      }))
  };
}

export function boundedReceiptText(text: string) {
  return text.trim().slice(0, AI_RECEIPT_TEXT_LIMIT);
}

export async function scanReceipt(
  image: string,
  context: ScanContext,
  authToken?: string | null
): Promise<ScanResult> {
  const response = await fetch("/api/parse-receipt", {
    method: "POST",
    headers: authHeaders(authToken),
    body: JSON.stringify({
      image,
      portfolioContext: boundedScanContext(context),
      locale: context.locale
    })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Vision API returned ${response.status}`);
  }
  return (await response.json()) as ScanResult;
}

/** Parse a free-form voice / text transcript into one or more transactions. */
export async function parseTextTransaction(
  text: string,
  context: ScanContext,
  authToken?: string | null
): Promise<ScanResult> {
  const response = await fetch("/api/parse-receipt", {
    method: "POST",
    headers: authHeaders(authToken),
    body: JSON.stringify({
      text: boundedReceiptText(text),
      portfolioContext: boundedScanContext(context),
      locale: context.locale
    })
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(errText || `Parse API returned ${response.status}`);
  }
  return (await response.json()) as ScanResult;
}
