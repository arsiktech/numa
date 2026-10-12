import { gateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import { z } from "zod";
import { consumeDailyGlobalBudget, consumeRateLimit } from "./_utils/rate-limit.js";
import { requireAISharing } from "./_utils/ai-permission.js";
import { safeProviderError } from "./_utils/safe-provider-error.js";
import { AI_GATEWAY_MODEL } from "./_utils/ai.js";
import { ReceiptBodySchema } from "./_utils/ai-input.js";

declare const process: {
  env: Record<string, string | undefined>;
};

interface ApiRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  body?: unknown;
}

interface ApiResponse {
  setHeader(name: string, value: string): void;
  status(statusCode: number): {
    json(payload: unknown): void;
    end(): void;
  };
}

const TxSchema = z.object({
  kind: z
    .enum(["income", "expense", "settlement", "holding", "unknown"])
    .describe("income = money received, expense = money spent, settlement = transfer between collaborators, holding = investment trade (stock/crypto buy/sell), unknown if uncertain"),
  amount: z.number().describe("Positive amount in major units (e.g. 12.50 for €12.50)"),
  currency: z.enum(["USD", "EUR", "UNKNOWN"]),
  description: z.string().describe("Short merchant or purpose label, 1–40 chars"),
  merchantOrCounterparty: z.string().nullable().describe("Merchant name for expenses/income, OR person name for settlements"),
  occurredAt: z
    .string()
    .nullable()
    .describe("ISO date YYYY-MM-DD or null if not visible. Use TODAY if the image clearly shows 'today' / 'now' wording."),
  suggestedCategoryId: z
    .string()
    .nullable()
    .describe("ID of the most fitting category from the provided list; null if no match"),
  suggestedCategoryName: z
    .string()
    .nullable()
    .describe("If suggestedCategoryId is null, propose a 1–2 word English category label that would fit (e.g. 'Dining', 'Groceries', 'Transport'). Otherwise null."),
  notes: z.string().nullable().describe("Anything else interesting from the image, max 80 chars"),
  confidence: z.object({
    amount: z.number().min(0).max(1),
    currency: z.number().min(0).max(1),
    description: z.number().min(0).max(1),
    category: z.number().min(0).max(1),
    date: z.number().min(0).max(1)
  })
});

const ParseSchema = z.object({
  imageType: z
    .enum([
      "bank_transaction",
      "bank_statement",
      "physical_receipt",
      "payment_app_screenshot",
      "investment_screenshot",
      "crypto_screenshot",
      "other_financial",
      "not_financial"
    ])
    .describe("What kind of image was supplied"),
  detectedSubject: z.string().describe("One-line plain description of the image content"),
  rejectionMessage: z
    .string()
    .nullable()
    .describe("If imageType is not_financial, a SHORT witty English one-liner that gently tells the user this isn't a receipt and asks for something financial. Tone: warm, friendly, light humor — never sarcastic. Max 140 chars. Otherwise null."),
  transactions: z.array(TxSchema).describe("Empty if not_financial or if no transactions are clearly readable"),
  summary: z.string().describe("One-sentence English summary of what was extracted")
});

export default async function handler(request: ApiRequest, response: ApiResponse) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const parsed = ReceiptBodySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid receipt input", issues: parsed.error.issues });
    return;
  }

  const apiKey = process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_AI_GATEWAY_API_KEY;
  if (!apiKey) {
    response.status(500).json({
      error: "AI Gateway not configured. Set AI_GATEWAY_API_KEY."
    });
    return;
  }

  // Identity before spend: OCR/vision calls cost money, so require a signed-in
  // user and meter per user id rather than a spoofable request fingerprint.
  const userId = await requireAISharing(request, response);
  if (!userId) return;

  const image = parsed.data.image;
  const text = parsed.data.text;
  const hasImage = typeof image === "string" && image.length >= 100;
  const hasText = typeof text === "string" && text.trim().length > 0;
  if (!hasImage && !hasText) {
    response.status(400).json({ error: "Send a non-empty `image` (data-URL/base64) or `text` transcript." });
    return;
  }

  const portfolioContext = parsed.data.portfolioContext ?? {};
  const locale = parsed.data.locale ?? portfolioContext.locale ?? "en";
  const today = new Date().toISOString().slice(0, 10);

  const rateLimit = await consumeRateLimit(request, response, {
    route: "/api/parse-receipt",
    limit: 20,
    windowMs: 60_000,
    identity: userId
  });
  if (!rateLimit.allowed) {
    response.status(rateLimit.status).json({ error: rateLimit.error });
    return;
  }

  // Deployment-wide daily ceiling for vision/OCR spend (see rate-limit.ts).
  const dailyBudget = await consumeDailyGlobalBudget(request, response, {
    route: "/api/parse-receipt",
    envVar: "NUMA_AI_DAILY_LIMIT_SCAN",
    defaultLimit: 200
  });
  if (!dailyBudget.allowed) {
    response.status(dailyBudget.status).json({
      error: "Receipt scanning reached today's shared usage limit. It resets within 24 hours."
    });
    return;
  }

  const categoryLines = (portfolioContext.categories ?? [])
    .map((c) => `  - id="${c.id}" name="${c.name}" kind=${c.kind}`)
    .join("\n");
  const memberLines = (portfolioContext.members ?? [])
    .map((m) => `  - "${m.displayName}"`)
    .join("\n");

  const systemPrompt = `You are Numa Pro's receipt-OCR assistant. The user uploads an image or dictates a transaction and you extract financial transactions from it.

You return strictly the JSON described by the schema — never free text.

Active portfolio: "${portfolioContext.portfolioName ?? "Personal"}" (type=${portfolioContext.portfolioType ?? "personal"}, default currency=${portfolioContext.defaultCurrency ?? "EUR"}).
Today: ${today}.
User locale: ${locale}. Understand English, Russian, Spanish, and mixed-language utterances. Write rejectionMessage, suggestedCategoryName, detectedSubject, and summary in the user's language when possible.

Categories the user already has (use one of these IDs if anything fits, otherwise null):
${categoryLines || "  (none configured)"}

Members on this portfolio:
${memberLines || "  (just the owner)"}

Rules:
- If the image is NOT a financial document at all (unrelated screenshot, meme, etc.), set imageType = "not_financial", leave transactions = [], and write a short warm quip in the user's language in rejectionMessage that gently asks for a receipt / bank screenshot / invoice. NEVER guess transactions from non-financial content.
- If the image is a bank statement / scrollable list, extract EVERY transaction you can read (could be 1, could be 20).
- amount is ALWAYS positive in major units. The sign is encoded by 'kind'.
- currency = "UNKNOWN" if you genuinely cannot tell.
- suggestedCategoryId: ONLY pick from the provided list; otherwise null. If null, fill suggestedCategoryName with a sensible new category label (1–2 words, in the user's language) so the user can one-click create it.
- For shared portfolios, if the image shows a transfer between two PEOPLE (not a merchant) — set kind="settlement" and put the receiver name in merchantOrCounterparty.
- For an investment / brokerage screenshot — set kind="holding" and description like "AAPL buy" or "BTC sell"; this app currently logs holdings separately so still return what you see.
- confidence: be honest. 1.0 = clearly visible; 0.5 = guess; below 0.4 = mark and let the user verify.
- summary should be a 1-sentence recap in the user's language.`;

  // Voice/text uses a plain string content (exactly like /api/chat, the path
  // the gateway serves reliably); only the image path needs content-parts.
  const userContent: string | Array<{ type: "text"; text: string } | { type: "image"; image: string }> =
    hasImage
      ? [
          {
            type: "text" as const,
            text: "Parse this image for Numa Pro. Return only structured data per the schema."
          },
          {
            type: "image" as const,
            image: image!
          }
        ]
      : `The user dictated this transaction by voice. Parse it into one or more transactions following the schema. If the user clearly mentions only one transaction, return exactly one item in transactions[]. Treat imageType as "physical_receipt" (we are reusing the schema; pick the closest type if the description sounds like a bank line). NEVER set imageType="not_financial" — voice input is always intentional.\n\nTranscript:\n"""\n${text!.trim()}\n"""`;

  try {
    const { object } = await generateObject({
      model: gateway(AI_GATEWAY_MODEL),
      schema: ParseSchema,
      maxRetries: 2,
      headers: {
        "x-ai-gateway-key": apiKey
      },
      // System prompt as the top-level param (not a { role: "system" }
      // message) — the latter made the gateway warn "System messages are not
      // supported".
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userContent
        }
      ]
    });

    response.setHeader("Cache-Control", "no-store");
    response.status(200).json(object);
  } catch (err) {
    console.error("receipt provider failure", safeProviderError(err));
    response.status(502).json({
      error: "Couldn't read that image. Try a clearer photo of a receipt, invoice, or statement."
    });
  }
}
