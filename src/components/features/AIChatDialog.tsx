import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { ArrowUp, Camera, Check, X } from "lucide-react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Sparkle } from "@/components/ui/Sparkle";
import {
  useAssets,
  useCategories,
  useCurrentPortfolioId,
  useCurrentUser,
  useCryptoWallets,
  useLiabilities,
  useMarketQuotes,
  useHoldings,
  usePortfolio,
  useTransactions
} from "@/services/store";
import { useFxRates } from "@/services/fxSync";
import { useCryptoWalletSync } from "@/features/crypto/useCryptoWalletSync";
import { isCloudId, useCloudMutations, useCloudState } from "@/services/cloudStore";
import { useDomainActions } from "@/services/domainActions";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { cn } from "@/lib/cn";
import { backdropMotion, sheetMotion } from "@/lib/motion";
import { emitCommand } from "@/lib/commands";
import { useLocale } from "@/lib/i18n";
import { useAppMode } from "@/lib/appMode";
import {
  accountCacheScope,
  accountPortfolioCacheKey,
  quarantineLegacyPortfolioCaches,
  type AccountCacheScope
} from "@/lib/accountCache";
import {
  aiDraftMutationOperation,
  buildContext,
  draftCompletionMessage,
  draftPortfolioId,
  draftSubtitle,
  draftTitle,
  executeDraft,
  friendlyChatErrorForStatus,
  parseActionDraft,
  FriendlyChatError,
  GENERIC_CHAT_ERROR,
  type ChatMessage,
  type LocalActionDraft
} from "@/features/numa/engine";
import {
  boundedChatMessages,
  sanitizeChatMessages
} from "@/features/numa/chatRequest";
import { executeConfirmedAiAction } from "@/features/numa/aiActionAudit";
import {
  acquireChatSendLock,
  captureChatSendIdentity,
  resetChatSendLock
} from "@/features/numa/chatSendGuard";
import { useSettledMoneyContext } from "@/features/numa/useSettledMoneyContext";
import { makeClientMutationId } from "@/services/writeQueue";
import type { Id } from "../../../convex/_generated/dataModel";

interface Props {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string | null;
}

const SUGGESTED = [
  "Create a recurring rent expense",
  "Draft settlement for this pod",
  "Update groceries budget to €450",
  "Explain why my net worth changed"
];

function buildSuggestedPrompts({
  transactions,
  categories,
  assets,
  liabilities,
  holdings,
  cryptoWallets
}: {
  transactions: ReturnType<typeof useTransactions>;
  categories: ReturnType<typeof useCategories>;
  assets: ReturnType<typeof useAssets>;
  liabilities: ReturnType<typeof useLiabilities>;
  holdings: ReturnType<typeof useHoldings>;
  cryptoWallets: ReturnType<typeof useCryptoWallets>;
}) {
  const prompts: string[] = [];
  const hasStartingBalance =
    assets.some((asset) => Math.abs(asset.balance) > 0) ||
    holdings.length > 0 ||
    cryptoWallets.some((wallet) => Boolean(wallet.snapshot));
  const incomeCategories = categories.filter((category) => category.kind === "income");
  const uncategorized = transactions.filter((tx) => !tx.categoryId).length;

  if (!hasStartingBalance) {
    prompts.push("Help me set up my starting bank, cash, broker and crypto balances.");
  }
  if (transactions.length === 0) {
    prompts.push("What are the fastest first 3 entries I should add to make Numa Pro useful?");
  }
  if (incomeCategories.length === 0) {
    prompts.push("Suggest income categories and goals for my portfolio.");
  }
  if (uncategorized > 0) {
    prompts.push(`Find patterns in my ${uncategorized} uncategorized transactions and suggest categories.`);
  }
  if (holdings.length > 0 || cryptoWallets.length > 0) {
    prompts.push("Review my holdings and tell me what I should track next.");
  }
  if (liabilities.length > 0) {
    prompts.push("What's my highest-risk debt and what payoff plan should I follow?");
  }

  for (const prompt of SUGGESTED) {
    if (prompts.length >= 4) break;
    prompts.push(prompt);
  }
  return prompts.slice(0, 4);
}

function chatStorageKey(scope: AccountCacheScope, portfolioId: string) {
  return accountPortfolioCacheKey(scope, "chat", portfolioId);
}

function loadHistory(scope: AccountCacheScope | null, portfolioId: string): ChatMessage[] {
  if (typeof window === "undefined" || !scope) return [];
  try {
    quarantineLegacyPortfolioCaches(window.localStorage, portfolioId);
    const raw = window.localStorage.getItem(chatStorageKey(scope, portfolioId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed)) return [];
    return sanitizeChatMessages(parsed);
  } catch {
    return [];
  }
}

function saveHistory(
  scope: AccountCacheScope | null,
  portfolioId: string,
  messages: ChatMessage[]
) {
  if (typeof window === "undefined" || !scope) return;
  try {
    // Cap at 100 messages to keep localStorage tidy.
    const trimmed = sanitizeChatMessages(messages).slice(-100);
    window.localStorage.setItem(chatStorageKey(scope, portfolioId), JSON.stringify(trimmed));
  } catch {
    /* ignore quota */
  }
}

export function AIChatDialog({ open, onClose, initialPrompt = null }: Props) {
  const [appMode] = useAppMode();
  const isAdvanced = appMode === "advanced";
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const me = useCurrentUser();
  const transactions = useTransactions(portfolio.id);
  const categories = useCategories(portfolio.id);
  const assets = useAssets(portfolio.id);
  const liabilities = useLiabilities(portfolio.id);
  const holdings = useHoldings(portfolio.id);
  const cryptoWallets = useCryptoWallets(portfolio.id);
  const activeCryptoWallets = useMemo(
    () => (open && isAdvanced ? cryptoWallets : []),
    [cryptoWallets, isAdvanced, open]
  );
  const cryptoSync = useCryptoWalletSync(activeCryptoWallets);
  const quotes = useMarketQuotes();
  const { rates: fxRates } = useFxRates();
  const cloud = useCloudState();
  const cloudMutations = useCloudMutations();
  const domainActions = useDomainActions();
  const { locale } = useLocale();
  const authToken = useAuthToken();
  const historyScope = useMemo(() => accountCacheScope(me.id), [me.id]);
  const historyIdentity = historyScope
    ? chatStorageKey(historyScope, portfolio.id)
    : "chat:unscoped";

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadHistory(historyScope, portfolio.id)
  );
  const [drafts, setDrafts] = useState<LocalActionDraft[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendInFlightRef = useRef<symbol | null>(null);
  const loadedHistoryIdentityRef = useRef(historyIdentity);
  const skipHistorySaveRef = useRef(false);

  // Latest money context for post-await reads inside send() — a closure would
  // hold the pre-hydration portfolio.
  const settleMoneyContext = useSettledMoneyContext(portfolio.id);
  const moneyRef = useRef({ portfolio, categories });
  useLayoutEffect(() => {
    moneyRef.current = { portfolio, categories };
  }, [categories, portfolio]);

  useBodyScrollLock(open);

  // Re-load before passive persistence runs so one account's in-memory
  // messages can never be written into another account/portfolio namespace.
  useLayoutEffect(() => {
    if (loadedHistoryIdentityRef.current === historyIdentity) return;
    abortRef.current?.abort();
    abortRef.current = null;
    resetChatSendLock(sendInFlightRef);
    setStreaming(false);
    setSettling(false);
    setError(null);
    setDrafts([]);
    setInput("");
    loadedHistoryIdentityRef.current = historyIdentity;
    skipHistorySaveRef.current = true;
    setMessages(loadHistory(historyScope, portfolio.id));
  }, [historyIdentity, historyScope, portfolio.id]);

  // Persist on every message change, but only when not actively streaming
  // (otherwise we'd write on every chunk). Streaming writes happen on completion.
  useEffect(() => {
    if (streaming) return;
    if (skipHistorySaveRef.current) {
      skipHistorySaveRef.current = false;
      return;
    }
    saveHistory(historyScope, portfolio.id, messages);
  }, [historyScope, messages, portfolio.id, streaming]);

  const context = useMemo(
    () => buildContext({
      portfolio,
      transactions,
      categories,
      assets,
      liabilities,
      holdings,
      cryptoWallets: isAdvanced ? cryptoSync.wallets : [],
      quotes,
      fxRates
    }),
    [portfolio, transactions, categories, assets, liabilities, holdings, cryptoSync.wallets, fxRates, isAdvanced, quotes]
  );
  const contextRef = useRef(context);
  useLayoutEffect(() => {
    contextRef.current = context;
  }, [context]);
  const suggestedPrompts = useMemo(
    () => buildSuggestedPrompts({
      transactions,
      categories,
      assets,
      liabilities,
      holdings,
      cryptoWallets: isAdvanced ? cryptoSync.wallets : []
    }),
    [transactions, categories, assets, liabilities, holdings, cryptoSync.wallets, isAdvanced]
  );

  useEffect(() => {
    if (open && !isAdvanced) onClose();
  }, [isAdvanced, onClose, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !streaming) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, streaming]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !initialPrompt) return;
    setInput(initialPrompt);
  }, [open, initialPrompt]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    const releaseSendLock = acquireChatSendLock(sendInFlightRef);
    if (!releaseSendLock) return;
    const sendIdentityIsCurrent = captureChatSendIdentity(loadedHistoryIdentityRef);
    setSettling(true);
    try {
      setError(null);
    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmed };
    // Parse against a settled portfolio, never against ids the store is about
    // to swap for their cloud twins (shadowing on purpose).
    const settled = await settleMoneyContext();
    if (!sendIdentityIsCurrent()) return;
    if (!settled.ready) {
      setError("Your money data is still syncing. Try again in a moment.");
      return;
    }
    const { portfolio, categories } = moneyRef.current;
    const draft = parseActionDraft({
      text: trimmed,
      portfolioId: portfolio.id,
      defaultCurrency: portfolio.defaultCurrency,
      createdByUserId: me.id,
      categories
    });
    if (draft) {
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Drafted for approval: ${draftTitle(draft)}.`
        }
      ]);
      setInput("");
      try {
        if (settled.cloud.enabled) {
          if (!settled.cloudBacked || !isCloudId(settled.cloud, portfolio.id)) {
            throw new Error("The cloud money context changed before the audit record was ready.");
          }
          const id = await cloudMutations.createAiActionDraft({
            portfolioId: portfolio.id as unknown as Id<"portfolios">,
            actionType: draft.actionType,
            prompt: draft.prompt,
            proposedPayload: draft.payload,
            createRequestId: `chat:${userMsg.id}`
          });
          if (!sendIdentityIsCurrent()) return;
          setDrafts((prev) => [{ ...draft, id: String(id) }, ...prev]);
        } else {
          setDrafts((prev) => [draft, ...prev]);
        }
      } catch (err) {
        console.warn("[numa] could not create action draft:", err);
        setError("Couldn't prepare that action just now. Try again in a moment.");
      }
      return;
    }

    const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: "assistant", content: "" };
    const nextHistory = [...messages, userMsg];
    setMessages([...nextHistory, assistantMsg]);
    setInput("");
    setStreaming(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {})
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          messages: boundedChatMessages(nextHistory),
          context: contextRef.current,
          locale
        })
      });
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => "");
        console.warn(`[numa] chat API failed (${res.status}):`, detail);
        throw new FriendlyChatError(friendlyChatErrorForStatus(res.status));
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (!sendIdentityIsCurrent()) {
          ctrl.abort();
          return;
        }
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;
          return [...prev.slice(0, -1), { ...last, content: buf }];
        });
      }
      // A 200 with an empty stream means the provider failed mid-stream (the
      // status was already committed before the error). Surface it instead of
      // leaving a silent empty bubble.
      if (!buf.trim()) {
        throw new FriendlyChatError(GENERIC_CHAT_ERROR);
      }
    } catch (e) {
      if (!sendIdentityIsCurrent()) return;
      if ((e as Error).name === "AbortError") {
        setMessages((prev) => sanitizeChatMessages(prev));
        return;
      }
      if (!(e instanceof FriendlyChatError)) {
        console.warn("[numa] chat request failed:", e);
      }
      setError(e instanceof FriendlyChatError ? e.message : GENERIC_CHAT_ERROR);
      // Drop the empty assistant bubble (and the failed user message when the
      // stream produced nothing), then restore the prompt into the composer so
      // nothing has to be retyped — just hit send again.
      setMessages((prev) => {
        let next = prev;
        const last = next[next.length - 1];
        if (last && last.role === "assistant" && last.content === "") {
          next = next.slice(0, -1);
        }
        const tail = next[next.length - 1];
        if (tail && tail.id === userMsg.id) {
          next = next.slice(0, -1);
        }
        return next;
      });
      setInput((current) => (current.trim() === "" ? trimmed : current));
      } finally {
        if (sendIdentityIsCurrent()) {
          setStreaming(false);
          abortRef.current = null;
        }
      }
    } finally {
      if (releaseSendLock()) setSettling(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void send(input);
  }

  async function confirmDraft(draft: LocalActionDraft) {
    const confirmIdentityIsCurrent = captureChatSendIdentity(loadedHistoryIdentityRef);
    setDrafts((prev) =>
      prev.map((item) => (item === draft ? { ...item, status: "executing" } : item))
    );
    try {
      const clientMutationId = makeClientMutationId(aiDraftMutationOperation(draft));
      const result = await executeConfirmedAiAction({
        cloudEnabled: cloud.enabled,
        cloudBacked: !cloud.enabled || isCloudId(cloud, draftPortfolioId(draft)),
        draftId: draft.id,
        clientMutationId,
        execute: (auditDraftId) =>
          executeDraft(draft, domainActions, clientMutationId, auditDraftId),
        markFailed: (id, technical) => cloudMutations.markAiActionFailed({
          id: id as unknown as Id<"aiActionDrafts">,
          error: technical
        })
      });
      if (!confirmIdentityIsCurrent()) return;
      setDrafts((prev) =>
        prev.map((item) =>
          item === draft ? { ...item, status: result.queued ? "queued" : "confirmed" } : item
        )
      );
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: draftCompletionMessage(draft, Boolean(result.queued))
        }
      ]);
    } catch (err) {
      if (!confirmIdentityIsCurrent()) return;
      // Keep the technical detail for the backend record + console; show calm copy.
      console.warn("[numa] action draft failed:", err);
      setDrafts((prev) =>
        prev.map((item) => (item === draft ? { ...item, status: "failed" } : item))
      );
      setError("That action didn't go through. Try again in a moment.");
    }
  }

  async function cancelDraft(draft: LocalActionDraft) {
    setDrafts((prev) =>
      prev.map((item) => (item === draft ? { ...item, status: "cancelled" } : item))
    );
    if (draft.id && cloud.enabled) {
      await cloudMutations.cancelAiActionDraft({
        id: draft.id as unknown as Id<"aiActionDrafts">
      }).catch(() => undefined);
    }
  }

  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open && isAdvanced ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            {...backdropMotion}
            onClick={onClose}
            className="absolute inset-0 bg-[color:var(--color-ink)]/30 backdrop-blur-sm"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            {...sheetMotion}
            className="relative nm-glass-strong overflow-hidden flex flex-col w-full max-w-[560px] max-h-[88vh] rounded-t-3xl sm:rounded-3xl pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-0"
          >
            <header className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-3">
              <div className="flex items-center gap-3">
                {/* Sparkle avatar — the only place the 4-point star marks AI on
                    this surface. Display-font title, ONLINE pill, TODAY caption
                    mirrors PDF page 7. */}
                <span
                  className="grid place-items-center w-[38px] h-[38px] rounded-[12px]"
                  style={{ background: "var(--color-cta)", color: "var(--color-cta-ink)" }}
                >
                  <Sparkle size={14} />
                </span>
                <div>
                  <h2
                    className="text-[20px] font-bold leading-none tracking-[-0.025em] text-[color:var(--color-ink)]"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    Numa Pro
                  </h2>
                  <p
                    className="mt-1 inline-flex items-center gap-1 text-[9px] font-mono tracking-[0.16em] uppercase"
                    style={{ color: "var(--color-positive)" }}
                  >
                    <span className="text-[10px] leading-none">●</span>
                    online
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="hidden sm:inline-block text-[9px] font-mono tracking-[0.16em] uppercase text-[color:var(--color-ink-3)] mr-2"
                  aria-hidden
                >
                  today
                </span>
                {messages.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMessages([]);
                      saveHistory(historyScope, portfolio.id, []);
                    }}
                    disabled={streaming}
                    className="text-[11.5px] font-medium text-[color:var(--color-ink-4)] hover:text-[color:var(--color-ink-2)] px-2 h-8 rounded-lg hover:bg-[color:var(--color-cream-100)] disabled:opacity-40"
                  >
                    Clear
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="grid place-items-center w-11 h-11 rounded-xl text-[color:var(--color-ink-4)] hover:bg-[color:var(--color-cream-100)] hover:text-[color:var(--color-ink)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
                >
                  <X size={16} />
                </button>
              </div>
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-3 space-y-3 min-h-[280px]">
              {messages.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-[13px] text-[color:var(--color-ink-3)]">
                    Try one of these:
                  </p>
                  <div className="flex flex-col gap-2">
                    {suggestedPrompts.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => void send(q)}
                        className="text-left px-3 py-2 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] hover:bg-[color:var(--color-cream-50)] text-[13px] text-[color:var(--color-ink-2)] transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "flex",
                      m.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {/* Bubble shape per PDF page 7: rounded-2xl with one
                        bottom corner less rounded — left for Numa, right for
                        the user, like a tail. Ink-on-bg for user (high
                        contrast); paper bordered for Numa. */}
                    <div
                      className={cn(
                        "max-w-[85%] px-3.5 py-2.5 text-[13.5px] leading-[1.5] whitespace-pre-wrap rounded-2xl",
                        m.role === "user"
                          ? "bg-[color:var(--color-ink)] text-[color:var(--color-bg)] rounded-br-[6px] max-w-[80%]"
                          : "bg-[color:var(--color-paper)] border border-[color:var(--color-line)] text-[color:var(--color-ink)] rounded-bl-[6px]"
                      )}
                    >
                      {m.content || (m.role === "assistant" && streaming ? "…" : "")}
                    </div>
                  </div>
                ))
              )}
              {drafts
                .filter((draft) => ["draft", "executing", "failed"].includes(draft.status))
                .map((draft) => (
                  <div
                    key={draft.id ?? draft.prompt}
                    className="rounded-2xl border border-[color:var(--color-brand-soft)] bg-[color:var(--color-brand-mist)] p-3 text-[13px]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-mono tracking-[0.14em] uppercase text-[color:var(--color-ink-3)]">
                          Suggested action
                        </p>
                        <p className="font-semibold text-[color:var(--color-ink)]">
                          {draftTitle(draft)}
                        </p>
                        <p className="mt-1 text-[color:var(--color-ink-3)]">
                          {draftSubtitle(draft)}
                        </p>
                        <p className="mt-2 text-[11px] text-[color:var(--color-ink-3)]">
                          Source: your prompt · Confidence: draft · Destination: {portfolio.name}
                        </p>
                      </div>
                      {draft.status === "failed" ? (
                        <span className="text-[11px] font-semibold text-[color:var(--color-negative)]">
                          failed
                        </span>
                      ) : draft.status === "executing" ? (
                        <span className="text-[11px] font-semibold text-[color:var(--color-ink-3)]">
                          saving…
                        </span>
                      ) : null}
                    </div>
                    {draft.status === "executing" ? null : <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => void cancelDraft(draft)}
                        className="h-8 px-3 rounded-full text-[12px] font-semibold text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-paper)]"
                      >
                        Cancel
                      </button>
                      {draft.status === "draft" ? <button
                        type="button"
                        onClick={() => void confirmDraft(draft)}
                        className="h-8 px-3 rounded-full bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] text-[12px] font-semibold inline-flex items-center gap-1.5"
                      >
                        <Check size={13} />
                        Confirm
                      </button> : null}
                    </div>}
                  </div>
                ))}
            </div>

            {error ? (
              <p className="px-6 pb-2 text-[12.5px] text-[color:var(--color-negative)]">
                {error}
              </p>
            ) : null}

            {/* Composer per PDF page 7 — rounded pill with placeholder text,
                camera icon (paper bg circle), lime up-arrow send button. */}
            <form
              onSubmit={handleSubmit}
              className="px-4 pb-3 pt-2"
            >
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-full bg-[color:var(--color-paper)] border border-[color:var(--color-line)]">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask Numa Pro anything…"
                  aria-label="Ask Numa Pro anything"
                  disabled={streaming || settling}
                  className="flex-1 min-w-0 h-9 px-3 bg-transparent text-[16px] sm:text-[14px] text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)] disabled:opacity-50"
                />
                <button
                  type="button"
                  aria-label="Attach photo"
                  disabled={streaming || settling}
                  onClick={() => {
                    onClose();
                    emitCommand("scan-receipt");
                  }}
                  className="grid place-items-center w-10 h-10 rounded-full bg-[color:var(--color-cream-100)] text-[color:var(--color-ink-3)] hover:text-[color:var(--color-ink)] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
                >
                  <Camera size={14} />
                </button>
                <button
                  type="submit"
                  disabled={!input.trim() || streaming || settling}
                  className="grid place-items-center w-9 h-9 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: "var(--color-brand)",
                    color: "var(--color-cta-ink)"
                  }}
                  aria-label="Send"
                >
                  <ArrowUp size={16} strokeWidth={2.5} />
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
