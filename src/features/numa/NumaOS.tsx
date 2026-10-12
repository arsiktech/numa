import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "framer-motion";
import { useAuthToken } from "@convex-dev/auth/react";
import {
  useAssets,
  useCategories,
  useCurrentPortfolioId,
  useCurrentUser,
  useCryptoWallets,
  useGoals,
  useHoldings,
  useLiabilities,
  useMarketQuotes,
  useMoneyPods,
  usePortfolio,
  useTransactions
} from "@/services/store";
import { useFxRates } from "@/services/fxSync";
import { useCryptoWalletSync } from "@/features/crypto/useCryptoWalletSync";
import { isCloudId, useCloudMutations, useCloudState } from "@/services/cloudStore";
import { useDomainActions } from "@/services/domainActions";
import { makeClientMutationId } from "@/services/writeQueue";
import { AI_ENABLED } from "@/lib/aiEnabled";
import { accountCacheScope, accountPortfolioCacheKey } from "@/lib/accountCache";
import { useLocale } from "@/lib/i18n";
import { useKeyboardInset } from "@/lib/keyboardInset";
import { formatMoneyDecimal } from "@/lib/money";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  aiDraftMutationOperation,
  buildContext,
  draftCompletionMessage,
  draftPortfolioId,
  draftTitle,
  executeDraft,
  friendlyChatErrorForStatus,
  parseActionDraft,
  FriendlyChatError,
  GENERIC_CHAT_ERROR,
  type ChatMessage,
  type LocalActionDraft
} from "./engine";
import { boundedChatMessages, sanitizeChatMessages } from "./chatRequest";
import { executeConfirmedAiAction } from "./aiActionAudit";
import {
  acquireChatSendLock,
  captureChatSendIdentity,
  resetChatSendLock
} from "./chatSendGuard";
import {
  dayBrief,
  dayKeyOf,
  dayTitle,
  groupByDay,
  isToday,
  loadThread,
  saveThread,
  shiftDayKey,
  tsOfDayKey
} from "./threads";
import { stillLifeKindFor } from "./stillLife";
import { useSettledMoneyContext } from "./useSettledMoneyContext";
import {
  MerchantImagesBoundary,
  MerchantImagesFeed
} from "./useMerchantImages";
import {
  PAGE_SPRING,
  Bubble,
  CatalogView,
  Composer,
  DayHero,
  DraftCard,
  EntriesRow,
  QuietDay,
  ThinkingDots,
  ThreadHeader,
  ThreadPage
} from "./os/parts";

/**
 * Numa OS — the unified conversational money surface at /numa (advanced).
 * Two views over the same objects:
 *   · thread  — one day, one conversation: dominant number, the day's entries,
 *               Numa's brief, chat with Notice → Propose → Execute drafts.
 *   · catalog — zoom out: every entry as a studio still-life in a calm,
 *               image-centric grid, grouped by day.
 * Entries carry a shared layoutId so a tile physically travels between views.
 */

type ViewMode = "thread" | "catalog";

export default function NumaOS() {
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const me = useCurrentUser();
  const transactions = useTransactions(portfolio.id);
  const categories = useCategories(portfolio.id);
  const assets = useAssets(portfolio.id);
  const liabilities = useLiabilities(portfolio.id);
  const holdings = useHoldings(portfolio.id);
  const cryptoWallets = useCryptoWallets(portfolio.id);
  const cryptoSync = useCryptoWalletSync(cryptoWallets);
  const quotes = useMarketQuotes();
  const goals = useGoals(portfolio.id);
  const pods = useMoneyPods();
  const { rates: fxRates } = useFxRates();
  const cloud = useCloudState();
  const cloudMutations = useCloudMutations();
  const domainActions = useDomainActions();
  const { locale } = useLocale();
  const authToken = useAuthToken();
  const reducedMotion = useReducedMotion();
  const threadScope = useMemo(() => accountCacheScope(me.id), [me.id]);

  const [view, setView] = useState<ViewMode>("thread");
  const [activeDay, setActiveDay] = useState(() => dayKeyOf(Date.now()));
  const [pageDirection, setPageDirection] = useState(0);

  const dayGroups = useMemo(() => groupByDay(transactions), [transactions]);
  const categoryNameById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  // Studio shots for the most recent entries (cache hits render instantly;
  // misses keep the hand-drawn still-life without background AI work). The feed
  // lives behind its own boundary so it can never crash the money surface.
  const wantedVisuals = useMemo(
    () =>
      transactions.slice(0, 90).map((tx) => ({
        merchant: tx.description,
        kind: stillLifeKindFor(tx, tx.categoryId ? categoryNameById.get(tx.categoryId) : undefined)
      })),
    [transactions, categoryNameById]
  );
  const [merchantImageUrls, setMerchantImageUrls] = useState<Map<string, string>>(new Map());

  /* ---------------------------- thread state ---------------------------- */

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadThread(threadScope, portfolio.id, dayKeyOf(Date.now()))
  );
  const [drafts, setDrafts] = useState<Array<LocalActionDraft & { day: string }>>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [settling, setSettling] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sendInFlightRef = useRef<symbol | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const threadIdentity = threadScope
    ? accountPortfolioCacheKey(threadScope, "thread", portfolio.id, activeDay)
    : "thread:unscoped";
  const draftOwnerIdentity = threadScope
    ? accountPortfolioCacheKey(threadScope, "thread-index", portfolio.id)
    : "drafts:unscoped";
  const loadedThreadIdentityRef = useRef(threadIdentity);
  const draftOwnerIdentityRef = useRef(draftOwnerIdentity);
  const skipThreadSaveRef = useRef(false);

  // Latest money context for post-await reads inside send() — a closure would
  // hold the pre-hydration portfolio.
  const settleMoneyContext = useSettledMoneyContext(portfolio.id);
  const moneyRef = useRef({ portfolio, categories });
  useLayoutEffect(() => {
    moneyRef.current = { portfolio, categories };
  }, [categories, portfolio]);

  /* --------------------------- iOS keyboard fit -------------------------- */

  // iOS never shrinks 100dvh for the keyboard, so the composer would sink
  // behind the keys. When the keyboard occludes the layout viewport, cancel
  // Safari's pan and refit the shell to the visible strip; kbFit null means
  // the CSS heights below stay in charge.
  const kbInset = useKeyboardInset();
  const [kbFit, setKbFit] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!kbInset) {
      setKbFit(null);
      return;
    }
    window.scrollTo(0, 0);
    const top = shellRef.current?.getBoundingClientRect().top ?? 0;
    const visible = window.visualViewport?.height;
    setKbFit(visible ? Math.max(320, Math.round(visible - top)) : null);
  }, [kbInset]);

  // Load the day's saved conversation whenever the page flips.
  useLayoutEffect(() => {
    if (loadedThreadIdentityRef.current === threadIdentity) return;
    abortRef.current?.abort();
    abortRef.current = null;
    resetChatSendLock(sendInFlightRef);
    setStreaming(false);
    setSettling(false);
    setThinking(false);
    if (draftOwnerIdentityRef.current !== draftOwnerIdentity) {
      draftOwnerIdentityRef.current = draftOwnerIdentity;
      setDrafts([]);
      setInput("");
    }
    loadedThreadIdentityRef.current = threadIdentity;
    skipThreadSaveRef.current = true;
    setMessages(loadThread(threadScope, portfolio.id, activeDay));
    setError(null);
  }, [activeDay, draftOwnerIdentity, portfolio.id, threadIdentity, threadScope]);

  // Persist when idle (streaming writes land on completion).
  useEffect(() => {
    if (streaming) return;
    if (skipThreadSaveRef.current) {
      skipThreadSaveRef.current = false;
      return;
    }
    saveThread(threadScope, portfolio.id, activeDay, messages);
  }, [activeDay, messages, portfolio.id, streaming, threadScope]);

  // Keep the conversation pinned to the newest message — including when the
  // keyboard refits the shell and the scroller suddenly has less room.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, drafts, view, kbFit]);

  // Abort any in-flight stream when unmounting or flipping days.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [activeDay]);

  const context = useMemo(
    () =>
      buildContext({
        portfolio,
        transactions,
        categories,
        assets,
        liabilities,
        holdings,
        cryptoWallets: cryptoSync.wallets,
        quotes,
        goals,
        pods: pods.map((pod) => ({ name: pod.name, currency: pod.currency })),
        fxRates
      }),
    [portfolio, transactions, categories, assets, liabilities, holdings, cryptoSync.wallets, quotes, goals, pods, fxRates]
  );
  const contextRef = useRef(context);
  useLayoutEffect(() => {
    contextRef.current = context;
  }, [context]);

  const goToDay = useCallback(
    (day: string, direction: number) => {
      if (streaming) abortRef.current?.abort();
      setPageDirection(direction);
      setActiveDay(day);
    },
    [streaming]
  );

  const goPrev = useCallback(
    () => goToDay(shiftDayKey(activeDay, -1), -1),
    [activeDay, goToDay]
  );
  const goNext = useCallback(() => {
    if (isToday(activeDay)) return; // the future stays quiet
    goToDay(shiftDayKey(activeDay, 1), 1);
  }, [activeDay, goToDay]);

  // Trackpad pinch (ctrl+wheel) — pinch OUT of the thread into the catalog,
  // pinch IN from the catalog back to the day. The macOS zoom instinct, kept.
  useEffect(() => {
    let accumulated = 0;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      accumulated += event.deltaY;
      if (view === "thread" && accumulated > 60) {
        accumulated = 0;
        setView("catalog");
      } else if (view === "catalog" && accumulated < -60) {
        accumulated = 0;
        setView("thread");
      }
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [view]);

  // ← / → page days; Esc zooms out.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName)) return;
      if (view === "thread") {
        if (event.key === "ArrowLeft") goPrev();
        if (event.key === "ArrowRight") goNext();
        if (event.key === "Escape") setView("catalog");
      } else if (event.key === "Escape") {
        setView("thread");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, goPrev, goNext]);

  /* ------------------------------- send -------------------------------- */

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    const releaseSendLock = acquireChatSendLock(sendInFlightRef);
    if (!releaseSendLock) return;
    const sendIdentityIsCurrent = captureChatSendIdentity(loadedThreadIdentityRef);
    const sendDay = activeDay;
    setSettling(true);
    try {
      setError(null);
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      at: Date.now()
    };

    // Parse against a settled portfolio, never against ids the store is about
    // to swap for their cloud twins (shadowing on purpose: everything below
    // must use the post-settle context).
    const settled = await settleMoneyContext();
    if (!sendIdentityIsCurrent()) return;
    if (!settled.ready) {
      setError("Your money data is still syncing. Try again in a moment.");
      return;
    }
    const { portfolio, categories } = moneyRef.current;

    // Propose locally first — drafting works even with AI fully off.
    const draft = parseActionDraft({
      text: trimmed,
      portfolioId: portfolio.id,
      defaultCurrency: portfolio.defaultCurrency,
      createdByUserId: me.id,
      categories
    });
    if (draft) {
      if (draft.actionType === "transaction.create") {
        // The entry belongs to the day being viewed, not "now".
        draft.payload.occurredAt = isToday(sendDay) ? Date.now() : tsOfDayKey(sendDay);
      }
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Drafted for approval: ${draftTitle(draft)}.`,
          at: Date.now()
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
          setDrafts((prev) => [{ ...draft, id: String(id), day: sendDay }, ...prev]);
        } else {
          setDrafts((prev) => [{ ...draft, day: sendDay }, ...prev]);
        }
      } catch (err) {
        console.warn("[numa] could not create action draft:", err);
        setError("Couldn't prepare that action just now. Try again in a moment.");
      }
      return;
    }

    if (!AI_ENABLED) {
      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "I can draft entries from here — try “coffee 3.50”. Full answers need Numa Pro AI, which isn't switched on yet.",
          at: Date.now()
        }
      ]);
      setInput("");
      return;
    }

    const assistantMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      at: Date.now()
    };
    const nextHistory = [...messages, userMsg];
    setMessages([...nextHistory, assistantMsg]);
    setInput("");
    setStreaming(true);
    setThinking(true);

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
          locale,
          focus: {
            date: sendDay,
            label: dayTitle(sendDay, locale)
          }
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
        setThinking(false);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (!last || last.role !== "assistant") return prev;
          return [...prev.slice(0, -1), { ...last, content: buf }];
        });
      }
      if (!buf.trim()) throw new FriendlyChatError(GENERIC_CHAT_ERROR);
    } catch (e) {
      if (!sendIdentityIsCurrent()) return;
      if ((e as Error).name === "AbortError") {
        setMessages((prev) => sanitizeChatMessages(prev));
        return;
      }
      if (!(e instanceof FriendlyChatError)) console.warn("[numa] chat request failed:", e);
      setError(e instanceof FriendlyChatError ? e.message : GENERIC_CHAT_ERROR);
      setMessages((prev) => {
        let next = prev;
        const last = next[next.length - 1];
        if (last && last.role === "assistant" && last.content === "") next = next.slice(0, -1);
        const tail = next[next.length - 1];
        if (tail && tail.id === userMsg.id) next = next.slice(0, -1);
        return next;
      });
      setInput((current) => (current.trim() === "" ? trimmed : current));
      } finally {
        if (sendIdentityIsCurrent()) {
          setStreaming(false);
          setThinking(false);
          abortRef.current = null;
        }
      }
    } finally {
      if (releaseSendLock()) setSettling(false);
    }
  }

  /* ------------------------------ drafts -------------------------------- */

  async function confirmDraft(draft: LocalActionDraft & { day: string }) {
    const confirmIdentityIsCurrent = captureChatSendIdentity(loadedThreadIdentityRef);
    setDrafts((prev) => prev.map((d) => (d === draft ? { ...d, status: "executing" } : d)));
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
        prev.map((d) =>
          d === draft ? { ...d, status: result.queued ? "queued" : "confirmed" } : d
        )
      );
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: draftCompletionMessage(draft, Boolean(result.queued)),
          at: Date.now()
        }
      ]);
    } catch (err) {
      if (!confirmIdentityIsCurrent()) return;
      console.warn("[numa] action draft failed:", err);
      setDrafts((prev) => prev.map((d) => (d === draft ? { ...d, status: "failed" } : d)));
      setError("That action didn't go through. Try again in a moment.");
    }
  }

  async function cancelDraft(draft: LocalActionDraft & { day: string }) {
    setDrafts((prev) => prev.map((d) => (d === draft ? { ...d, status: "cancelled" } : d)));
    if (draft.id && cloud.enabled) {
      await cloudMutations
        .cancelAiActionDraft({ id: draft.id as unknown as Id<"aiActionDrafts"> })
        .catch(() => undefined);
    }
  }

  /* ------------------------------ render -------------------------------- */

  const group = dayGroups.get(activeDay);
  const brief = dayBrief({
    day: activeDay,
    group,
    categories,
    currency: portfolio.defaultCurrency,
    locale,
    formatAmount: formatMoneyDecimal
  });
  const dayDrafts = drafts.filter((d) => d.day === activeDay);

  return (
    <LayoutGroup id="numa-os">
      <MerchantImagesBoundary>
        <MerchantImagesFeed wanted={wantedVisuals} onUrls={setMerchantImageUrls} />
      </MerchantImagesBoundary>
      {/* Fixed height, no outer scroll: the day card fills the room between
          app chrome; only the conversation scrolls. App-like, never page-like.
          While the iOS keyboard is up, kbFit pins the shell to the visible
          strip instead. */}
      <div
        ref={shellRef}
        style={kbFit ? { height: kbFit } : undefined}
        className="mx-auto flex h-[calc(100dvh-160px)] w-full max-w-[1100px] flex-col overflow-hidden pt-1.5 lg:h-[calc(100dvh-40px)] lg:pt-0"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {view === "thread" ? (
            <motion.section
              key="thread"
              initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.985 }}
              transition={PAGE_SPRING}
              className="flex min-h-0 flex-1 flex-col"
            >
              <ThreadHeader
                day={activeDay}
                locale={locale}
                onPrev={goPrev}
                onNext={goNext}
                nextDisabled={isToday(activeDay)}
                onCatalog={() => setView("catalog")}
              />
              <ThreadPage
                key={activeDay}
                direction={pageDirection}
                reducedMotion={!!reducedMotion}
                onSwipePrev={goPrev}
                onSwipeNext={goNext}
              >
                <DayHero
                  day={activeDay}
                  locale={locale}
                  spent={group?.spent ?? 0}
                  currency={portfolio.defaultCurrency}
                  brief={brief}
                />
                {group && group.entries.length > 0 ? (
                  <EntriesRow
                    entries={group.entries}
                    categoryNameById={categoryNameById}
                    imageUrls={merchantImageUrls}
                    onZoomOut={() => setView("catalog")}
                  />
                ) : null}
                <div
                  ref={scrollRef}
                  className="mt-4 flex min-h-[120px] flex-1 flex-col gap-2.5 overflow-y-auto overscroll-contain pb-2"
                >
                  {(!group || group.entries.length === 0) && messages.length === 0 ? (
                    <QuietDay onPick={(text) => setInput(text)} />
                  ) : null}
                  {messages.map((message, index) => (
                    <Bubble
                      key={message.id}
                      message={message}
                      streaming={
                        streaming && index === messages.length - 1 && message.role === "assistant"
                      }
                    />
                  ))}
                  {thinking ? <ThinkingDots /> : null}
                  {dayDrafts.map((draft, index) => (
                    <DraftCard
                      key={draft.id ?? `${draft.prompt}-${index}`}
                      draft={draft}
                      onConfirm={() => void confirmDraft(draft)}
                      onCancel={() => void cancelDraft(draft)}
                    />
                  ))}
                </div>
                {error ? (
                  <p className="mb-2 text-center text-[12px] font-medium text-[color:var(--color-negative)]">
                    {error}
                  </p>
                ) : null}
                <Composer
                  value={input}
                  onChange={setInput}
                  onSend={() => void send(input)}
                  busy={streaming || settling}
                />
              </ThreadPage>
            </motion.section>
          ) : (
            <motion.section
              key="catalog"
              initial={{ opacity: 0, scale: reducedMotion ? 1 : 1.02 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: reducedMotion ? 1 : 1.02 }}
              transition={PAGE_SPRING}
              className="flex min-h-0 flex-1 flex-col"
            >
              <CatalogView
                dayGroups={dayGroups}
                locale={locale}
                currency={portfolio.defaultCurrency}
                categoryNameById={categoryNameById}
                imageUrls={merchantImageUrls}
                formatAmount={formatMoneyDecimal}
                onOpenDay={(day) => {
                  setActiveDay(day);
                  setPageDirection(0);
                  setView("thread");
                }}
                onClose={() => setView("thread")}
              />
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </LayoutGroup>
  );
}

/* ======================================================================= */
/* Thread view                                                             */
/* ======================================================================= */

