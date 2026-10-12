import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { Mic, MicOff, X, Check } from "lucide-react";
import { createPortal } from "react-dom";
import { Sparkle } from "@/components/ui/Sparkle";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { parseTextTransaction, type ScanResult, type ScanTransaction } from "@/services/scanReceipt";
import {
  useAssets,
  useCategories,
  useCurrentPortfolioId,
  useCurrentUser,
  useMemberships,
  usePortfolio
} from "@/services/store";
import { useDomainActions } from "@/services/domainActions";
import { isCloudId, useCloudMutations, useCloudState } from "@/services/cloudStore";
import {
  type AiAuditAttemptState,
  createAndExecuteConfirmedAiAction,
  stableClientMutationId,
  toAiAuditPayload
} from "@/features/numa/aiActionAudit";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { backdropMotion, sheetMotion } from "@/lib/motion";
import { useLocale } from "@/lib/i18n";
import { newId } from "@/lib/ids";
import {
  markReviewedRowApplied,
  pendingReviewedRows
} from "@/features/numa/reviewedBatch";
import type { CategoryKind, CurrencyCode, TxKind } from "@/lib/types";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  isAsyncRequestScopeCurrent,
  type AsyncRequestScope
} from "@/lib/asyncRequestScope";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Phase = "idle" | "listening" | "parsing" | "saving" | "review" | "error";

// SpeechRecognition is not in lib.dom types yet
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
interface SpeechRecognitionCtor {
  new (): SpeechRecognitionLike;
}

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Give up on "Listening…" after this long with no recognition result. */
const NO_RESULT_TIMEOUT_MS = 12_000;

/** Human copy for raw SpeechRecognition error codes (event.error). */
function speechErrorCopy(code: string | undefined): string {
  switch (code) {
    case "no-speech":
      return "I didn't hear anything — try speaking a little louder.";
    case "audio-capture":
      return "No microphone found. Check that one is connected and allowed.";
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access is blocked. Allow it in your browser settings, then try again.";
    case "network":
      return "Speech recognition needs a connection — check your network and retry.";
    case "aborted":
      return "Listening stopped before I caught anything. Try again?";
    case "language-not-supported":
      return "That language isn't supported for voice input here — type it in instead.";
    default:
      return "I couldn't hear you. Try again, or type it in instead.";
  }
}

/** Calm copy for parse-API failures; raw detail goes to console.warn only. */
function friendlyParseError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "";
  if (/\b429\b/.test(raw) || /rate.?limit|quota|limit reached/i.test(raw)) {
    return "You've hit today's AI limit — it resets tomorrow.";
  }
  if (/\b40[13]\b/.test(raw) || /unauthori[sz]ed|forbidden/i.test(raw)) {
    return "Your session needs a refresh — please sign in again, then retry.";
  }
  return "Numa Pro couldn't make sense of that just now. Try again in a moment.";
}

export function VoiceDialog({ open, onClose }: Props) {
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const me = useCurrentUser();
  const categories = useCategories(portfolio.id);
  const members = useMemberships(portfolio.id);
  const assets = useAssets(portfolio.id);
  const cashAccounts = assets.filter((a) => a.kind === "cash");
  const actions = useDomainActions();
  const cloud = useCloudState();
  const cloudMutations = useCloudMutations();
  const { locale } = useLocale();
  const authToken = useAuthToken();

  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [editing, setEditing] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [reviewItems, setReviewItems] = useState<TxItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const noResultTimerRef = useRef<number | undefined>(undefined);
  const mutationIdsRef = useRef(new Map<string, string>());
  const auditAttemptsRef = useRef(new Map<string, AiAuditAttemptState>());
  const requestIdRef = useRef(0);
  const currentRequestScopeRef = useRef<AsyncRequestScope>({
    accountId: me.id,
    portfolioId: portfolio.id,
    requestId: 0,
    open
  });
  currentRequestScopeRef.current = {
    accountId: me.id,
    portfolioId: portfolio.id,
    requestId: requestIdRef.current,
    open
  };
  const supported = !!getRecognitionCtor();
  const prefersReducedMotion = useReducedMotion();

  const beginRequest = useCallback((): AsyncRequestScope => {
    const scope = {
      accountId: me.id,
      portfolioId: portfolio.id,
      requestId: ++requestIdRef.current,
      open: true
    };
    currentRequestScopeRef.current = scope;
    return scope;
  }, [me.id, portfolio.id]);

  const requestIsCurrent = useCallback((scope: AsyncRequestScope) =>
    isAsyncRequestScopeCurrent(currentRequestScopeRef.current, scope), []);

  const handleClose = useCallback(() => {
    currentRequestScopeRef.current = {
      ...currentRequestScopeRef.current,
      requestId: ++requestIdRef.current,
      open: false
    };
    onClose();
  }, [onClose]);

  useBodyScrollLock(open);

  useEffect(() => {
    currentRequestScopeRef.current = {
      accountId: me.id,
      portfolioId: portfolio.id,
      requestId: ++requestIdRef.current,
      open
    };
    window.clearTimeout(noResultTimerRef.current);
    recognitionRef.current?.abort();
    recognitionRef.current = null;
    setPhase("idle");
    setTranscript("");
    setEditing("");
    setResult(null);
    setReviewItems([]);
    setError(null);
    setSyncNotice(null);
    mutationIdsRef.current.clear();
    auditAttemptsRef.current.clear();
  }, [open, me.id, portfolio.id]);

  // Clear the no-result timer if the dialog unmounts mid-listen.
  useEffect(() => () => window.clearTimeout(noResultTimerRef.current), []);

  // Focus trap + Escape-to-close + focus restore (shared hook; replaces the
  // old Escape-only handler — QA 2026-06-24 a11y finding). Escape respects
  // the same phase guard as the backdrop so an in-flight capture isn't lost.
  const voicePanelRef = useRef<HTMLElement | null>(null);
  useFocusTrap(voicePanelRef, open, () => {
    if (phase !== "listening" && phase !== "parsing" && phase !== "saving") handleClose();
  });

  function startListening() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    const requestScope = beginRequest();
    rec.lang = navigator.language || "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    let finalText = "";
    rec.onresult = (event) => {
      if (!requestIsCurrent(requestScope)) return;
      // The mic is clearly working — stop the no-result watchdog.
      window.clearTimeout(noResultTimerRef.current);
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const alt = event.results[i]?.[0]?.transcript ?? "";
        interim += alt;
      }
      finalText = interim;
      setTranscript(interim);
      setEditing(interim);
    };
    rec.onerror = (event) => {
      if (!requestIsCurrent(requestScope)) return;
      window.clearTimeout(noResultTimerRef.current);
      console.warn("[numa] speech recognition error:", event.error);
      setError(speechErrorCopy(event.error));
      setPhase("error");
    };
    rec.onend = () => {
      if (!requestIsCurrent(requestScope)) return;
      window.clearTimeout(noResultTimerRef.current);
      recognitionRef.current = null;
      // If the user said something, jump to parsing right away.
      if (finalText.trim()) {
        void parse(finalText.trim());
      } else {
        setPhase("idle");
      }
    };
    rec.start();
    recognitionRef.current = rec;
    // Watchdog: some browsers keep "Listening…" open forever when recognition
    // yields nothing. After ~12s without a single result, stop and explain.
    window.clearTimeout(noResultTimerRef.current);
    noResultTimerRef.current = window.setTimeout(() => {
      if (!requestIsCurrent(requestScope)) return;
      const active = recognitionRef.current;
      if (!active) return;
      active.onresult = null;
      active.onerror = null;
      active.onend = null;
      active.abort();
      recognitionRef.current = null;
      setError("I didn't catch anything — check your mic is working, or type it in instead.");
      setPhase("error");
    }, NO_RESULT_TIMEOUT_MS);
    setPhase("listening");
    setTranscript("");
    setEditing("");
    setError(null);
    setSyncNotice(null);
  }

  function stopListening() {
    recognitionRef.current?.stop();
  }

  async function parse(text: string) {
    const requestScope = beginRequest();
    setPhase("parsing");
    setError(null);
    setResult(null);
    setReviewItems([]);
    setSyncNotice(null);
    mutationIdsRef.current.clear();
    auditAttemptsRef.current.clear();
    try {
      const r = await parseTextTransaction(text, {
        portfolioName: portfolio.name,
        portfolioType: portfolio.type,
        defaultCurrency: portfolio.defaultCurrency,
        categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
        members: members.map((m) => ({ userId: m.userId, displayName: m.displayName })),
        locale
      }, authToken);
      if (!requestIsCurrent(requestScope)) return;
      setResult(r);
      setReviewItems(
        r.transactions.map((transaction) =>
          toTxItem(transaction, portfolio.defaultCurrency)
        )
      );
      setPhase("review");
    } catch (e) {
      if (!requestIsCurrent(requestScope)) return;
      console.warn("[numa] voice parse failed:", e);
      setError(friendlyParseError(e));
      setPhase("error");
    }
  }

  async function commitTransactions(items: TxItem[]) {
    const requestScope = { ...currentRequestScopeRef.current };
    if (!requestIsCurrent(requestScope)) return;
    const assertCurrentRequest = () => {
      if (!requestIsCurrent(requestScope)) {
        throw new Error("This voice capture belongs to a closed or replaced account workspace.");
      }
    };
    setError(null);
    setSyncNotice(null);
    setPhase("saving");
    try {
      let queuedAny = false;
      for (const item of pendingReviewedRows(items, (row) => !row.skipped)) {
        assertCurrentRequest();
        const kind: TxKind = item.kind === "income" ? "income" : "expense";
        const transaction = {
          portfolioId: portfolio.id,
          occurredAt: item.occurredAt,
          description: item.description,
          categoryId: item.categoryId,
          accountId: item.accountId,
          kind,
          amount: Math.abs(item.amount),
          currency: item.currency,
          createdByUserId: me.id,
          notes: item.notes
        };
        const mutationKey = `transaction:${item.uid}`;
        const clientMutationId = stableClientMutationId(
          mutationIdsRef.current,
          mutationKey,
          "transactions.add"
        );
        let attemptState = auditAttemptsRef.current.get(mutationKey);
        if (!attemptState) {
          attemptState = {};
          auditAttemptsRef.current.set(mutationKey, attemptState);
        }
        const saved = await createAndExecuteConfirmedAiAction({
          cloudEnabled: cloud.enabled,
          cloudBacked: !cloud.enabled || isCloudId(cloud, portfolio.id),
          clientMutationId,
          createDraft: async (createRequestId) => {
            assertCurrentRequest();
            const id = await cloudMutations.createAiActionDraft({
              portfolioId: portfolio.id as unknown as Id<"portfolios">,
              actionType: "transaction.create",
              prompt: `Voice review: ${editing.trim() || transaction.description}`,
              proposedPayload: toAiAuditPayload(transaction),
              createRequestId
            });
            assertCurrentRequest();
            return String(id);
          },
          execute: async (auditDraftId) => {
            assertCurrentRequest();
            const value = await actions.createTransaction(transaction, {
              clientMutationId,
              auditDraftId
            });
            assertCurrentRequest();
            return value;
          },
          markFailed: async (id, technical) => {
            assertCurrentRequest();
            const value = await cloudMutations.markAiActionFailed({
              id: id as unknown as Id<"aiActionDrafts">,
              error: technical
            });
            assertCurrentRequest();
            return value;
          },
          attemptState
        });
        assertCurrentRequest();
        queuedAny ||= saved.queued;
        setReviewItems((prev) =>
          markReviewedRowApplied(prev, item.uid, { queued: saved.queued })
        );
      }
      if (queuedAny) {
        setSyncNotice(
          "Saved for sync. Numa Pro will retry these reviewed changes automatically; if one ultimately stops, Settings offers a fresh reviewed retry."
        );
        setPhase("review");
        return;
      }
      handleClose();
    } catch (cause) {
      if (!requestIsCurrent(requestScope)) return;
      console.warn("[numa] voice confirmation failed:", cause);
      setError("Numa Pro couldn't save those confirmed entries. Your review is still here — try again.");
      setPhase("error");
    }
  }

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            {...backdropMotion}
            onClick={() => {
              if (phase !== "listening" && phase !== "parsing" && phase !== "saving") handleClose();
            }}
            className="absolute inset-0 bg-[color:var(--color-ink)]/30 backdrop-blur-sm"
          />
          <motion.div
            ref={voicePanelRef as React.RefObject<HTMLDivElement>}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            {...sheetMotion}
            className="relative nm-glass-strong overflow-hidden flex flex-col w-full max-w-[520px] max-h-[min(calc(100dvh-32px),920px)] rounded-t-3xl sm:rounded-3xl pb-[max(env(safe-area-inset-bottom),16px)] sm:pb-0"
          >
            <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-3">
              <div className="flex items-center gap-3">
                <span className="grid place-items-center w-10 h-10 rounded-2xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)]">
                  <Mic size={18} strokeWidth={2} />
                </span>
                <div>
                  <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-[color:var(--color-ink)]">
                    Voice quick-add
                  </h2>
                  <p className="text-[12px] text-[color:var(--color-ink-3)]">
                    Just say what you spent — Numa Pro will figure it out.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (phase !== "listening" && phase !== "parsing" && phase !== "saving") handleClose();
                }}
                disabled={phase === "listening" || phase === "parsing" || phase === "saving"}
                aria-label="Close"
                className="grid place-items-center w-11 h-11 rounded-xl text-[color:var(--color-ink-4)] hover:bg-[color:var(--color-cream-100)] hover:text-[color:var(--color-ink)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-brand-soft)]"
              >
                <X size={16} />
              </button>
            </header>

            <div className="px-6 pb-6 flex-1 overflow-y-auto overscroll-contain">
              {!supported ? (
                <p className="text-[13px] text-[color:var(--color-negative)]">
                  Your browser doesn't support speech recognition. Try Chrome or Safari on macOS / iOS.
                </p>
              ) : null}

              {phase === "idle" && supported ? (
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={startListening}
                    className="w-full grid place-items-center h-32 rounded-2xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] hover:bg-[color:var(--color-brand-strong)] transition-colors"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Mic size={32} strokeWidth={1.5} />
                      <span className="text-[14px] font-semibold">Tap to talk</span>
                    </div>
                  </button>
                  <p className="text-[12px] text-[color:var(--color-ink-3)] text-center">
                    Or type it in:
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (editing.trim()) void parse(editing.trim());
                    }}
                    className="flex gap-2"
                  >
                    <input
                      value={editing}
                      onChange={(e) => setEditing(e.target.value)}
                      placeholder="I spent 12 euros on coffee yesterday"
                      aria-label="Describe a transaction to parse"
                      className="flex-1 h-11 px-4 rounded-xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[16px] sm:text-[14px] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-brand)]/40 focus:border-[color:var(--color-brand)]"
                    />
                    <Button type="submit" variant="primary" disabled={!editing.trim()}>
                      <Sparkle size={14} />
                      Parse
                    </Button>
                  </form>
                </div>
              ) : null}

              {phase === "listening" ? (
                <div className="text-center space-y-4 py-4">
                  <div className="relative inline-grid place-items-center">
                    <motion.span
                      className="absolute inset-0 rounded-full bg-[color:var(--color-brand)]/30"
                      animate={
                        prefersReducedMotion
                          ? { scale: 1, opacity: 0.7 }
                          : { scale: [1, 1.6, 1], opacity: [0.7, 0, 0.7] }
                      }
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }
                      }
                    />
                    <span className="relative grid place-items-center w-20 h-20 rounded-full bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)]">
                      <Mic size={28} />
                    </span>
                  </div>
                  <p className="text-[13px] text-[color:var(--color-ink-3)]">Listening…</p>
                  <p className="text-[15px] font-medium text-[color:var(--color-ink)] min-h-[48px]">
                    {transcript || "…"}
                  </p>
                  <Button type="button" variant="ghost" onClick={stopListening}>
                    <MicOff size={14} />
                    Stop & parse
                  </Button>
                </div>
              ) : null}

              {phase === "parsing" ? (
                <div className="text-center py-12 text-[13px] text-[color:var(--color-ink-3)]">
                  <span className="inline-block animate-pulse text-[color:var(--color-brand)]">
                    <Sparkle size={24} />
                  </span>
                  <p className="mt-2">Numa Pro is thinking…</p>
                </div>
              ) : null}

              {phase === "saving" ? (
                <div className="text-center py-12 text-[13px] text-[color:var(--color-ink-3)]">
                  <span className="inline-block animate-pulse text-[color:var(--color-brand)]">
                    <Sparkle size={24} />
                  </span>
                  <p className="mt-2">Saving confirmed entries…</p>
                </div>
              ) : null}

              {phase === "error" ? (
                <div className="space-y-3">
                  <p className="text-[13px] text-[color:var(--color-negative)]">{error}</p>
                  <Button type="button" variant="ghost" onClick={() => setPhase(result ? "review" : "idle")}>
                    Try again
                  </Button>
                </div>
              ) : null}

              {phase === "review" && result ? (
                <ReviewPanel
                  result={result}
                  items={reviewItems}
                  onItemsChange={setReviewItems}
                  categories={categories}
                  cashAccounts={cashAccounts}
                  onConfirm={commitTransactions}
                  onCancel={() => {
                    setSyncNotice(null);
                    setPhase("idle");
                  }}
                  syncNotice={syncNotice}
                />
              ) : null}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body
  );
}

interface TxItem {
  uid: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  kind: "income" | "expense";
  occurredAt: number;
  categoryId?: string;
  accountId?: string;
  notes?: string;
  skipped: boolean;
  applied?: boolean;
  queued?: boolean;
}

function ReviewPanel({
  result,
  items,
  onItemsChange,
  categories,
  cashAccounts,
  onConfirm,
  onCancel,
  syncNotice
}: {
  result: ScanResult;
  items: TxItem[];
  onItemsChange: Dispatch<SetStateAction<TxItem[]>>;
  categories: { id: string; name: string; kind: CategoryKind; emoji?: string }[];
  cashAccounts: { id: string; name: string }[];
  onConfirm: (items: TxItem[]) => void;
  onCancel: () => void;
  syncNotice: string | null;
}) {
  if (result.transactions.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-[color:var(--color-ink-3)]">
          {result.rejectionMessage ?? "I couldn't quite catch a transaction in that. Try again?"}
        </p>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Try again
        </Button>
      </div>
    );
  }

  function patch(idx: number, p: Partial<TxItem>) {
    onItemsChange((prev) =>
      prev.map((it, i) => (i === idx && !it.applied ? { ...it, ...p } : it))
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-[color:var(--color-ink-3)]">{result.summary}</p>
      {syncNotice ? (
        <p className="rounded-2xl border border-[color:var(--color-warning)] bg-[color:var(--color-warning-soft)] px-4 py-3 text-[12px] leading-relaxed text-[color:var(--color-ink-2)]">
          {syncNotice}
        </p>
      ) : null}
      <div className="space-y-3">
        {items.map((it, idx) => (
          <div
            key={it.uid}
            className={cn(
              "rounded-2xl border p-3",
              it.skipped || it.applied
                ? "opacity-50 border-[color:var(--color-line)]"
                : "border-[color:var(--color-line)] bg-[color:var(--color-paper)]"
            )}
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <input
                aria-label={`Description for ${it.description || "transaction"}`}
                value={it.description}
                disabled={it.applied}
                onChange={(e) => patch(idx, { description: e.target.value })}
                className="flex-1 text-[16px] sm:text-[14px] font-semibold bg-transparent focus:outline-none border-b border-transparent focus:border-[color:var(--color-line)] pb-1"
              />
              <button
                type="button"
                disabled={it.applied}
                onClick={() => patch(idx, { skipped: !it.skipped })}
                className="text-[11px] uppercase tracking-[0.06em] text-[color:var(--color-ink-4)] hover:text-[color:var(--color-ink-2)]"
              >
                {it.queued ? "Saved for sync" : it.applied ? "Saved" : it.skipped ? "Include" : "Skip"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                aria-label={`Type for ${it.description || "transaction"}`}
                value={it.kind}
                disabled={it.applied}
                onChange={(e) => patch(idx, { kind: e.target.value as "income" | "expense" })}
                className="h-9 px-3 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[16px] sm:text-[13px]"
              >
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <div className="flex items-center gap-1.5">
                <input
                  aria-label={`Amount for ${it.description || "transaction"}`}
                  type="number"
                  step="0.01"
                  value={it.amount}
                  disabled={it.applied}
                  onChange={(e) => patch(idx, { amount: Number(e.target.value) })}
                  className="flex-1 h-9 px-3 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[16px] sm:text-[13px] text-right nm-num"
                />
                <select
                  aria-label={`Currency for ${it.description || "transaction"}`}
                  value={it.currency}
                  disabled={it.applied}
                  onChange={(e) => patch(idx, { currency: e.target.value as CurrencyCode })}
                  className="h-9 px-2 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[16px] sm:text-[12px]"
                >
                  <option value="EUR">€</option>
                  <option value="USD">$</option>
                </select>
              </div>
              <select
                aria-label={`Category for ${it.description || "transaction"}`}
                value={it.categoryId ?? ""}
                disabled={it.applied}
                onChange={(e) => patch(idx, { categoryId: e.target.value || undefined })}
                className="h-9 px-3 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[16px] sm:text-[13px]"
              >
                <option value="">No category</option>
                {categories
                  .filter((c) => c.kind === it.kind)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.emoji ? `${c.emoji} ` : ""}
                      {c.name}
                    </option>
                  ))}
              </select>
              <select
                aria-label={`Account for ${it.description || "transaction"}`}
                value={it.accountId ?? ""}
                disabled={it.applied}
                onChange={(e) => patch(idx, { accountId: e.target.value || undefined })}
                className="h-9 px-3 rounded-lg border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[16px] sm:text-[13px]"
              >
                <option value="">No account</option>
                {cashAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-2 text-[11px] text-[color:var(--color-ink-4)]">
              {formatMoney(it.amount, it.currency)} ·{" "}
              {new Date(it.occurredAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric"
              })}
            </p>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Try again
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={() => onConfirm(items)}
          disabled={items.every((item) => item.skipped || item.applied)}
        >
          <Check size={14} />
          Add {items.filter((item) => !item.skipped && !item.applied).length} transaction
          {items.filter((item) => !item.skipped && !item.applied).length === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}

function toTxItem(tx: ScanTransaction, fallback: CurrencyCode): TxItem {
  const kind: "income" | "expense" = tx.kind === "income" ? "income" : "expense";
  const currency: CurrencyCode = tx.currency === "USD" || tx.currency === "EUR" ? tx.currency : fallback;
  const occurredAt = tx.occurredAt ? Date.parse(tx.occurredAt) : Date.now();
  return {
    uid: newId("voice"),
    description: tx.description || tx.merchantOrCounterparty || "Transaction",
    amount: Math.abs(tx.amount || 0),
    currency,
    kind,
    occurredAt: Number.isFinite(occurredAt) ? occurredAt : Date.now(),
    categoryId: tx.suggestedCategoryId ?? undefined,
    notes: tx.notes ?? undefined,
    skipped: false
  };
}
