import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthToken } from "@convex-dev/auth/react";
import { createPortal } from "react-dom";
import { Dialog } from "@/components/ui/Dialog";
import {
  compressImage,
  scanReceipt,
  type ScanContext,
  type ScanResult
} from "@/services/scanReceipt";
import { getScanQuota, incrementScanQuota } from "@/lib/scanQuota";
import { newId } from "@/lib/ids";
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
import { useLocale } from "@/lib/i18n";
import {
  markReviewedRowApplied,
  pendingReviewedRows
} from "@/features/numa/reviewedBatch";
import type { Category } from "@/lib/types";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  isAsyncRequestScopeCurrent,
  type AsyncRequestScope
} from "@/lib/asyncRequestScope";
import { COLOR_PALETTE, friendlyScanError, type EditableTx, type Phase } from "./scan/shared";
import {
  ErrorState,
  InputState,
  Lightbox,
  ProgressState,
  RejectedState,
  ReviewState,
  } from "./scan/parts";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ScanDialog({ open, onClose }: Props) {
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const me = useCurrentUser();
  const categories = useCategories(portfolio.id);
  const memberships = useMemberships(portfolio.id);
  const allAssets = useAssets(portfolio.id);
  const cashAccounts = allAssets.filter((a) => a.kind === "cash");
  const actions = useDomainActions();
  const cloud = useCloudState();
  const cloudMutations = useCloudMutations();
  const { locale } = useLocale();
  const authToken = useAuthToken();
  const [phase, setPhase] = useState<Phase>("input");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [editable, setEditable] = useState<EditableTx[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);
  const quota = getScanQuota(me.id);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    currentRequestScopeRef.current = {
      accountId: me.id,
      portfolioId: portfolio.id,
      requestId: ++requestIdRef.current,
      open
    };
    setPhase("input");
    setImagePreview(null);
    setResult(null);
    setEditable([]);
    setErrorMessage(null);
    setSyncNotice(null);
    setLightbox(false);
    mutationIdsRef.current.clear();
    auditAttemptsRef.current.clear();
  }, [open, me.id, portfolio.id]);

  const buildContext = useCallback((): ScanContext => ({
    portfolioName: portfolio.name,
    portfolioType: portfolio.type,
    defaultCurrency: portfolio.defaultCurrency,
    categories: categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    members: memberships.map((m) => ({ userId: m.userId, displayName: m.displayName })),
    locale
  }), [portfolio, categories, memberships, locale]);

  const processFile = useCallback(
    async (file: Blob) => {
      if (quota.remaining <= 0) {
        setPhase("error");
        setErrorMessage(`You've used all ${quota.limit} scans for this month. Resets on the 1st.`);
        return;
      }
      const requestScope = beginRequest();
      setErrorMessage(null);
      setSyncNotice(null);
      mutationIdsRef.current.clear();
      auditAttemptsRef.current.clear();
      setPhase("compressing");
      try {
        const dataUrl = await compressImage(file);
        if (!requestIsCurrent(requestScope)) return;
        setImagePreview(dataUrl);
        setPhase("scanning");
        const scan = await scanReceipt(dataUrl, buildContext(), authToken);
        if (!requestIsCurrent(requestScope)) return;
        incrementScanQuota(me.id);
        setResult(scan);
        if (scan.imageType === "not_financial" || scan.transactions.length === 0) {
          setPhase("rejected");
          return;
        }
        const defaultAccountId = cashAccounts[0]?.id ?? null;
        setEditable(
          scan.transactions.map((tx) => ({
            ...tx,
            uid: newId("scan"),
            include: tx.confidence.amount > 0.35 && tx.kind !== "unknown",
            categoryToCreate: null,
            accountId: defaultAccountId
          }))
        );
        setPhase("review");
      } catch (err) {
        if (!requestIsCurrent(requestScope)) return;
        console.warn("[numa] receipt scan failed:", err);
        setPhase("error");
        setErrorMessage(friendlyScanError(err));
      }
    },
    [
      authToken,
      beginRequest,
      buildContext,
      cashAccounts,
      me.id,
      quota.limit,
      quota.remaining,
      requestIsCurrent
    ]
  );

  useEffect(() => {
    if (!open) return;
    function onPaste(event: ClipboardEvent) {
      const item = Array.from(event.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/")
      );
      if (!item) return;
      const file = item.getAsFile();
      if (file) processFile(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, processFile]);

  useEffect(() => {
    if (!open) return;
    const el = dropRef.current;
    if (!el) return;
    function onDragOver(event: DragEvent) {
      event.preventDefault();
      el?.classList.add("ring-2", "ring-[color:var(--color-brand)]");
    }
    function onDragLeave() {
      el?.classList.remove("ring-2", "ring-[color:var(--color-brand)]");
    }
    function onDrop(event: DragEvent) {
      event.preventDefault();
      el?.classList.remove("ring-2", "ring-[color:var(--color-brand)]");
      const file = event.dataTransfer?.files?.[0];
      if (file) processFile(file);
    }
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);
    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [open, processFile]);

  function updateRow(uid: string, patch: Partial<EditableTx>) {
    setEditable((prev) =>
      prev.map((row) =>
        row.uid === uid && !row.applied ? { ...row, ...patch } : row
      )
    );
  }

  async function confirmAll() {
    const requestScope = { ...currentRequestScopeRef.current };
    if (!requestIsCurrent(requestScope)) return;
    const assertCurrentRequest = () => {
      if (!requestIsCurrent(requestScope)) {
        throw new Error("This receipt belongs to a closed or replaced account workspace.");
      }
    };
    const toAdd = pendingReviewedRows(
      editable,
      (row) => row.include && (row.kind === "income" || row.kind === "expense")
    );
    setErrorMessage(null);
    setSyncNotice(null);
    setPhase("saving");
    try {
      let queuedAny = false;
      const runAuditedWrite = async <T,>({
        actionType,
        prompt,
        payload,
        operation,
        mutationKey,
        execute
      }: {
        actionType: "category.create" | "transaction.create";
        prompt: string;
        payload: unknown;
        operation: "categories.add" | "transactions.add";
        mutationKey: string;
        execute: (clientMutationId: string, auditDraftId?: string) => Promise<T>;
      }) => {
        assertCurrentRequest();
        const clientMutationId = stableClientMutationId(
          mutationIdsRef.current,
          mutationKey,
          operation
        );
        let attemptState = auditAttemptsRef.current.get(mutationKey);
        if (!attemptState) {
          attemptState = {};
          auditAttemptsRef.current.set(mutationKey, attemptState);
        }
        return await createAndExecuteConfirmedAiAction({
          cloudEnabled: cloud.enabled,
          cloudBacked: !cloud.enabled || isCloudId(cloud, portfolio.id),
          clientMutationId,
          createDraft: async (createRequestId) => {
            assertCurrentRequest();
            const id = await cloudMutations.createAiActionDraft({
              portfolioId: portfolio.id as unknown as Id<"portfolios">,
              actionType,
              prompt,
              proposedPayload: toAiAuditPayload(payload),
              createRequestId
            });
            assertCurrentRequest();
            return String(id);
          },
          execute: async (auditDraftId) => {
            assertCurrentRequest();
            const value = await execute(clientMutationId, auditDraftId);
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
      };

      // Create categories first. A queued category cannot safely be referenced
      // by child writes because its final server id does not exist yet.
      const createdCats = new Map<string, string>();
      const categoryKeyFor = (row: EditableTx) =>
        `${row.kind}:${row.categoryToCreate?.trim().toLowerCase() ?? ""}`;
      for (const row of toAdd) {
        if (!row.categoryToCreate) continue;
        const categoryKey = categoryKeyFor(row);
        if (createdCats.has(categoryKey)) continue;
        const color = COLOR_PALETTE[createdCats.size % COLOR_PALETTE.length]!;
        const newCategory = {
          portfolioId: portfolio.id,
          name: row.categoryToCreate,
          kind: row.kind === "income" ? "income" : "expense",
          icon: row.kind === "income" ? "hand-coins" : "shopping-basket",
          color,
          sortOrder: categories.length + createdCats.size
        } satisfies Omit<Category, "id">;
        const created = await runAuditedWrite({
          actionType: "category.create",
          prompt: `Receipt review: create category ${newCategory.name}`,
          payload: newCategory,
          operation: "categories.add",
          mutationKey: `category:${categoryKey}`,
          execute: (clientMutationId, auditDraftId) =>
            actions.createCategory(newCategory, { clientMutationId, auditDraftId })
        });
        assertCurrentRequest();
        if (created.queued) {
          setSyncNotice(
            "The reviewed category is saved for sync. Wait for it to finish before adding its transactions."
          );
          throw new Error("The new category is queued for sync. Add these transactions after it finishes syncing.");
        }
        createdCats.set(categoryKey, created.id);
      }

      for (const row of toAdd) {
        const categoryId =
          row.categoryToCreate && createdCats.get(categoryKeyFor(row))
            ? createdCats.get(categoryKeyFor(row))
            : row.suggestedCategoryId ?? undefined;
        const transaction = {
          portfolioId: portfolio.id,
          occurredAt: row.occurredAt ? new Date(row.occurredAt).getTime() : Date.now(),
          description: row.description.trim() || row.merchantOrCounterparty || "Scan",
          categoryId,
          accountId: row.accountId ?? undefined,
          kind: row.kind === "income" ? "income" as const : "expense" as const,
          amount: Math.abs(row.amount),
          currency: row.currency === "UNKNOWN" ? portfolio.defaultCurrency : row.currency,
          createdByUserId: me.id,
          notes: row.notes ?? undefined
        };
        const saved = await runAuditedWrite({
          actionType: "transaction.create",
          prompt: `Receipt review: save ${transaction.description}`,
          payload: transaction,
          operation: "transactions.add",
          mutationKey: `transaction:${row.uid}`,
          execute: (clientMutationId, auditDraftId) =>
            actions.createTransaction(transaction, { clientMutationId, auditDraftId })
        });
        assertCurrentRequest();
        queuedAny ||= saved.queued;
        setEditable((prev) =>
          markReviewedRowApplied(prev, row.uid, { queued: saved.queued })
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
    } catch (error) {
      if (!requestIsCurrent(requestScope)) return;
      console.warn("[numa] receipt confirmation failed:", error);
      setErrorMessage(
        error instanceof Error && /queued for sync/i.test(error.message)
          ? error.message
          : "Numa Pro couldn't save those confirmed entries. Your review is still here — try again."
      );
      setPhase("error");
    }
  }

  const dialogTitle =
    phase === "review"
      ? "Review what we read"
      : phase === "rejected"
        ? "This doesn't look like a receipt"
        : "Scan a receipt or statement";

  return (
    <>
      <Dialog open={open} onClose={handleClose} title={dialogTitle} width={640}>
        <div ref={dropRef} className="flex flex-col gap-4">
          {phase === "input" ? (
            <InputState
              quota={quota}
              onCamera={() => cameraInput.current?.click()}
              onGallery={() => galleryInput.current?.click()}
            />
          ) : null}

          {phase === "compressing" || phase === "scanning" || phase === "saving" ? (
            <ProgressState
              imagePreview={imagePreview}
              label={
                phase === "compressing"
                  ? "Preparing image…"
                  : phase === "saving"
                    ? "Saving confirmed entries…"
                    : "AI reading the receipt…"
              }
              onZoom={() => setLightbox(true)}
            />
          ) : null}

          {phase === "error" ? (
            <ErrorState
              message={errorMessage ?? "Something went wrong."}
              imagePreview={imagePreview}
              onZoom={() => setLightbox(true)}
              onRetry={() => setPhase(result ? "review" : "input")}
            />
          ) : null}

          {phase === "rejected" && result ? (
            <RejectedState
              rejection={
                result.rejectionMessage ??
                "I couldn't see a transaction in that one — give it another go?"
              }
              subject={result.detectedSubject}
              imagePreview={imagePreview}
              onZoom={() => setLightbox(true)}
              onRetry={() => setPhase("input")}
            />
          ) : null}

          {phase === "review" && result ? (
            <ReviewState
              result={result}
              editable={editable}
              categories={categories}
              cashAccounts={cashAccounts}
              currency={portfolio.defaultCurrency}
              imagePreview={imagePreview}
              onZoom={() => setLightbox(true)}
              onUpdate={updateRow}
              onConfirm={confirmAll}
              onCancel={() => {
                setSyncNotice(null);
                setPhase("input");
              }}
              syncNotice={syncNotice}
            />
          ) : null}

          <input
            ref={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) processFile(file);
              event.target.value = "";
            }}
          />
          <input
            ref={galleryInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) processFile(file);
              event.target.value = "";
            }}
          />
        </div>
      </Dialog>

      {lightbox && imagePreview
        ? createPortal(
            <Lightbox image={imagePreview} onClose={() => setLightbox(false)} />,
            document.body
          )
        : null}
    </>
  );
}

