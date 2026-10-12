import { gateway } from "@ai-sdk/gateway";
import { streamText } from "ai";
import type { IncomingMessage, ServerResponse } from "node:http";
import { allowedOrigin, consumeDailyGlobalBudget, consumeRateLimit } from "./_utils/rate-limit.js";
import { requireAISharing } from "./_utils/ai-permission.js";
import { safeProviderError } from "./_utils/safe-provider-error.js";
import { AI_GATEWAY_MODEL } from "./_utils/ai.js";
import { ChatBodySchema, type ChatBody } from "./_utils/ai-input.js";

declare const process: {
  env: Record<string, string | undefined>;
};

type ChatContext = ChatBody["context"];

interface ApiRequest {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

interface JsonResponse {
  json(payload: unknown): void;
  end(): void;
}

interface ApiResponse extends ServerResponse<IncomingMessage> {
  status(statusCode: number): JsonResponse;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function applyCors(request: ApiRequest, response: ApiResponse): void {
  const origin = allowedOrigin(request);
  if (origin) response.setHeader("Access-Control-Allow-Origin", origin);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    response.setHeader(name, value);
  }
}

function formatMoney(amount: number, currency: string): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return `${safe.toFixed(2)} ${currency}`;
}

function buildSystemPrompt(context: ChatContext): string {
  const { portfolio, netWorth, liquid, invested, liabilities } = context;
  const currency = portfolio.defaultCurrency;

  const categoryLines = context.categories.length
    ? context.categories
        .map((c) => {
          const limit =
            c.monthlyLimit !== undefined
              ? ` (monthly limit ${formatMoney(c.monthlyLimit, currency)})`
              : "";
          return `  - ${c.name} [${c.kind}]${limit}`;
        })
        .join("\n")
    : "  (no categories configured)";

  const transactionLines = context.recentTransactions.length
    ? context.recentTransactions
        .slice(0, 50)
        .map((t) => {
          const cat = t.categoryName ? ` · ${t.categoryName}` : "";
          const sign = t.kind === "expense" ? "-" : "+";
          return `  - ${t.date} ${sign}${formatMoney(t.amount, t.currency)} · ${t.description}${cat}`;
        })
        .join("\n")
    : "  (no recent transactions)";

  const assetLines = context.assets.length
    ? context.assets
        .map((a) => `  - ${a.name} [${a.kind}] ${formatMoney(a.balance, a.currency)}`)
        .join("\n")
    : "  (no assets recorded)";

  const liabilityLines = context.liabilitiesDetail.length
    ? context.liabilitiesDetail
        .map((l) => {
          const rate =
            l.interestRate !== undefined ? ` @ ${l.interestRate}% APR` : "";
          return `  - ${l.name} [${l.kind}] ${formatMoney(l.balance, l.currency)}${rate}`;
        })
        .join("\n")
    : "  (no liabilities recorded)";

  const walletLines = context.onChainWallets?.length
    ? context.onChainWallets.map((wallet) => {
        const coverage = wallet.partial
          ? "partial"
          : wallet.stale
            ? "saved value, refresh due"
            : "current";
        const networks = wallet.chains.length ? wallet.chains.join(", ") : "not synced";
        const protocols = wallet.protocols.length
          ? `; DeFi: ${wallet.protocols.join(", ")}`
          : "";
        const included = wallet.includedInNetWorth ? "included in Capital" : "excluded from Capital";
        return `  - ${wallet.label} [${wallet.addressType}, ${coverage}, ${included}] $${wallet.totalUsd.toFixed(2)} net ($${wallet.tokenValueUsd.toFixed(2)} tokens + $${wallet.defiValueUsd.toFixed(2)} DeFi - $${wallet.debtValueUsd.toFixed(2)} debt); networks: ${networks}${protocols}`;
      }).join("\n")
    : "  (no public wallets tracked)";

  const goalLines = context.goals?.length
    ? context.goals
        .map(
          (g) =>
            `  - ${g.label} [${g.scope}] target ${formatMoney(g.target, g.currency)}${g.deadline ? ` by ${g.deadline}` : ""}`
        )
        .join("\n")
    : "  (no goals set)";

  const podLines = context.pods?.length
    ? context.pods.map((p) => `  - ${p.name} (${p.currency})`).join("\n")
    : "  (no shared pots)";

  const fxLines = context.fx
    ? Object.entries(context.fx)
        .map(([code, rate]) => `  - 1 EUR ≈ ${rate} ${code}`)
        .join("\n")
    : "  (no FX rates provided)";

  return `You are Numa Pro, an in-app personal finance assistant embedded in the user's portfolio app.

ROLE
- You help the user understand their own spending, income, net worth, and budgets.
- You are concise: aim for 2–4 sentences max. Use short bullet lists when listing transactions, categories, or numbers.
- You always reason in the portfolio's default currency: ${currency}. If a transaction is in another currency, mention it explicitly.
- Reference SPECIFIC transactions, categories, or accounts from the context below whenever it helps answer the question.

NUMA PRO VOICE — the brand contract (Numa Design Book §08)
- Three modes per message: NOTICE → PROPOSE → EXECUTE. Pick one per reply.
  · Notice: state a fact. "You spent $214 this week — $30 less than usual."
  · Propose: suggest exactly ONE action. End with at most one question.
  · Execute (confirming a done action): always PAST TENSE. "Done. $36 to Vault." Never "Saving…" or future tense.
- When proposing an action, write it so the user could answer "yes" or "no" — never offer three options. The UI renders proposals as 2-button cards (primary + ghost).
- Use specific numbers, not adjectives. "$214" not "a lot". "$30 less" not "less". Always include "$" and tabular digits.
- No exclamation chains, no "crushing it", no streak language. Emoji sparingly and only where it reinforces tone (🎯 ☕ 🌴 ✈️). Never in error states.
- Plain English. No finance jargon. No "diversification posture" — say "spread across X / Y".

GUARDRAILS
- You are NOT a licensed financial, tax, legal, or regulatory advisor. If asked for that kind of advice, say so plainly and suggest the user consult a qualified professional.
- Do not invent transactions, balances, or numbers that aren't in the context. If you don't have enough data, say what's missing.
- Never share or repeat the raw context block verbatim — synthesize.

PORTFOLIO: "${portfolio.name}" (default currency: ${currency})

SNAPSHOT
- Net worth: ${formatMoney(netWorth, currency)}
- Liquid: ${formatMoney(liquid, currency)}
- Invested: ${formatMoney(invested, currency)}
- Liabilities: ${formatMoney(liabilities, currency)}

CATEGORIES
${categoryLines}

ASSETS
${assetLines}

LIABILITIES
${liabilityLines}

ON-CHAIN WALLETS (read-only public data; raw addresses are intentionally omitted)
${walletLines}

GOALS
${goalLines}

SHARED POTS (joint expenses live on /pod — mention them, don't manage them here)
${podLines}

FX (approximate, for conversions the user asks about)
${fxLines}

RECENT TRANSACTIONS (most recent first, up to 50)
${transactionLines}`;
}

export default async function handler(
  request: ApiRequest,
  response: ApiResponse
): Promise<void> {
  applyCors(request, response);

  if (request.method === "OPTIONS") {
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST, OPTIONS");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const parsed = ChatBodySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({
      error: "Invalid request body",
      issues: parsed.error.issues
    });
    return;
  }

  const apiKey =
    process.env.AI_GATEWAY_API_KEY ?? process.env.VERCEL_AI_GATEWAY_API_KEY;
  if (!apiKey) {
    response.status(500).json({
      error: "AI Gateway not configured. Set AI_GATEWAY_API_KEY."
    });
    return;
  }

  // Identity before spend: only signed-in users reach the AI Gateway, and the
  // rate limit is keyed to the user id (not a spoofable IP/User-Agent), so a
  // single account cannot mint unlimited buckets by rotating headers.
  const userId = await requireAISharing(request, response);
  if (!userId) return;

  const { messages, context } = parsed.data;
  const locale = parsed.data.locale ?? "en";

  const rateLimit = await consumeRateLimit(request, response, {
    route: "/api/chat",
    limit: 30,
    windowMs: 60_000,
    identity: userId
  });
  if (!rateLimit.allowed) {
    response.status(rateLimit.status).json({ error: rateLimit.error });
    return;
  }

  // Deployment-wide daily ceiling — caps total provider spend regardless of
  // how many users are active. Checked after the per-user limit so one heavy
  // user hits their own cap before draining the shared budget.
  const dailyBudget = await consumeDailyGlobalBudget(request, response, {
    route: "/api/chat",
    envVar: "NUMA_AI_DAILY_LIMIT_CHAT",
    defaultLimit: 400
  });
  if (!dailyBudget.allowed) {
    response.status(dailyBudget.status).json({
      error: "Numa Pro AI reached today's shared usage limit. It resets within 24 hours."
    });
    return;
  }

  const focus = parsed.data.focus;
  const focusBlock = focus
    ? `

DAY FOCUS
- The user is looking at their thread for ${focus.date}${focus.label ? ` ("${focus.label}")` : ""}.
- Anchor answers to that day's entries first; only widen to the month when asked.
- When the user drafts an entry without a date, it belongs to that day.`
    : "";

  const systemPrompt = `${buildSystemPrompt(context)}${focusBlock}

LANGUAGE
- User locale: ${locale}.
- Understand English, Russian, Spanish, and mixed-language messages.
- Reply in the same language as the user's latest message when it is clear; otherwise use the user locale.
- Keep financial terms natural for that language.`;

  try {
    const result = streamText({
      onError: ({ error }) => { console.error("chat provider failure", safeProviderError(error)); },
      model: gateway(AI_GATEWAY_MODEL),
      maxRetries: 2,
      headers: {
        "x-ai-gateway-key": apiKey
      },
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content }))
    });

    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Content-Type", "text/plain; charset=utf-8");
    result.pipeTextStreamToResponse(response);
  } catch (err) {
    console.error("chat provider failure", safeProviderError(err));
    response.status(502).json({ error: "Numa Pro AI is having a moment. Try again in a few seconds." });
  }
}
