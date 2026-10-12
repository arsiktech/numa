/**
 * Settle-up and edit-settlement sheets. Extracted from the former
 * `page.tsx`; behavior unchanged.
 */
import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/cn";  // eslint-disable-line @typescript-eslint/no-unused-vars
import { formatMoneyDecimal } from "@/lib/money";
import { useLocale } from "@/lib/i18n";
import { buildMemberLabelMap, settlementTransferKey, template } from "@/lib/podPageHelpers";
import { usePodActions } from "@/services/podActions";
import type { MoneyPod, PodSettlement, PodGroup, PodMember } from "@/lib/types";
import { Sheet } from "./shared";

export function EditSettlementSheet({
  open,
  onClose,
  settlement,
  members,
  groups
}: {
  open: boolean;
  onClose: () => void;
  settlement: PodSettlement | null;
  members: PodMember[];
  groups: PodGroup[];
}) {
  const { t } = useLocale();
  const actions = usePodActions();
  const memberLabels = useMemo(() => buildMemberLabelMap(members, groups), [members, groups]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!settlement) return;
    setAmount(settlement.amount.toFixed(2));
    setNote(settlement.note ?? "");
    setError(null);
  }, [settlement?.id, settlement]);

  async function save() {
    if (!settlement) return;
    const numericAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError(t("pod.errorPaymentPositive"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await actions.updatePodSettlement(settlement, {
        amount: Number(numericAmount.toFixed(2)),
        note: note.trim() || undefined
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pod.errorPaymentUpdate"));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!settlement) return;
    setDeleting(true);
    setError(null);
    try {
      await actions.deletePodSettlement(settlement);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pod.errorPaymentDelete"));
    } finally {
      setDeleting(false);
    }
  }

  const fromLabel = settlement ? memberLabels.get(settlement.fromMemberId) ?? t("pod.someone") : "";
  const toLabel = settlement ? memberLabels.get(settlement.toMemberId) ?? t("pod.someone") : "";

  return (
    <Sheet open={open} onClose={onClose} title={t("pod.editPaymentTitle")}>
      {settlement ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[color:var(--color-bg)] border border-[color:var(--color-line)] px-3 py-3">
            <p className="text-[13.5px] font-semibold text-[color:var(--color-ink)]">
              {fromLabel} → {toLabel}
            </p>
            <p className="mt-1 text-[12px] text-[color:var(--color-ink-3)]">
              {t("pod.paymentReducesBalance")}
            </p>
          </div>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]">
              {t("pod.paymentAmount")}
            </span>
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              className="mt-1 w-full h-11 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3 text-[16px] sm:text-[15px] font-semibold nm-num text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-brand)]"
              aria-label={t("pod.paymentAmount")}
            />
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]">
              {t("pod.note")}
            </span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 w-full h-11 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3 text-[16px] sm:text-[14px] text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-brand)]"
              placeholder={t("pod.optional")}
            />
          </label>
          {error ? (
            <p className="text-[12.5px] text-[color:var(--color-negative)]">{error}</p>
          ) : null}
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
            <button
              type="button"
              onClick={remove}
              disabled={deleting || saving}
              className="h-11 px-4 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[12.5px] font-semibold text-[color:var(--color-negative)] disabled:opacity-45"
            >
              {deleting ? t("pod.deleting") : t("pod.delete")}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || deleting}
              className="h-11 rounded-2xl bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] text-[13px] font-semibold disabled:opacity-45"
            >
              {saving ? t("pod.saving") : t("pod.saveChanges")}
            </button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

export function SettleSheet({
  open,
  onClose,
  pod,
  transfers
}: {
  open: boolean;
  onClose: () => void;
  pod: MoneyPod;
  transfers: Array<{
    fromMemberId: string;
    toMemberId: string;
    fromName: string;
    toName: string;
    amount: number;
  }>;
}) {
  const { t } = useLocale();
  const actions = usePodActions();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const transferKeys = transfers.map(settlementTransferKey).join("|");

  useEffect(() => {
    if (!open) return;
    setDraftAmounts(
      Object.fromEntries(transfers.map((transfer) => [
        settlementTransferKey(transfer),
        transfer.amount.toFixed(2)
      ]))
    );
  }, [open, transferKeys, transfers]);

  async function saveSettlement(transfer: (typeof transfers)[number]) {
    const key = settlementTransferKey(transfer);
    const amount = Number((draftAmounts[key] ?? transfer.amount.toFixed(2)).replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t("pod.errorPaymentPositive"));
      return;
    }
    if (amount > transfer.amount + 0.005) {
      setError(
        template(t("pod.errorPaymentMax"), {
          amount: formatMoneyDecimal(transfer.amount, pod.currency)
        })
      );
      return;
    }
    setPendingKey(key);
    setError(null);
    try {
      await actions.addPodSettlement({
        podId: pod.id,
        fromMemberId: transfer.fromMemberId,
        toMemberId: transfer.toMemberId,
        amount: Number(amount.toFixed(2)),
        currency: pod.currency,
        occurredAt: Date.now(),
        note:
          amount + 0.005 < transfer.amount
            ? t("pod.settlementPartialNote")
            : t("pod.settlementFullNote")
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("pod.errorPaymentSave"));
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("pod.settleUp")}>
      {transfers.length === 0 ? (
        <p className="text-[13.5px] text-[color:var(--color-ink-3)]">
          {t("pod.everyoneSquare")}
        </p>
      ) : (
        <div className="space-y-2">
          {transfers.map((transfer) => {
            const key = settlementTransferKey(transfer);
            const draft = draftAmounts[key] ?? transfer.amount.toFixed(2);
            const parsed = Number(draft.replace(",", "."));
            const invalid =
              !Number.isFinite(parsed) || parsed <= 0 || parsed > transfer.amount + 0.005;
            return (
              <div
                key={key}
                className="rounded-2xl bg-[color:var(--color-bg)] border border-[color:var(--color-line)] px-3 py-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar name={transfer.fromName} size={32} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] text-[color:var(--color-ink)] leading-tight">
                      <span className="font-semibold">{transfer.fromName}</span> → {transfer.toName}
                    </p>
                    <p className="text-[12px] text-[color:var(--color-ink-3)] mt-0.5">
                      {template(t("pod.owesUpTo"), {
                        amount: formatMoneyDecimal(transfer.amount, pod.currency)
                      })}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <label className="min-w-0">
                    <span className="sr-only">{t("pod.paymentAmount")}</span>
                    <input
                      value={draft}
                      onChange={(event) =>
                        setDraftAmounts((current) => ({
                          ...current,
                          [key]: event.target.value
                        }))
                      }
                      inputMode="decimal"
                      className="w-full h-11 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] px-3 text-[16px] sm:text-[15px] font-semibold nm-num text-[color:var(--color-ink)] outline-none focus:border-[color:var(--color-brand)]"
                      aria-label={template(t("pod.amountPaidBy"), { name: transfer.fromName })}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftAmounts((current) => ({
                        ...current,
                        [key]: transfer.amount.toFixed(2)
                      }))
                    }
                    className="h-11 px-3 rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] text-[12px] font-semibold text-[color:var(--color-ink)]"
                  >
                    {t("pod.full")}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => saveSettlement(transfer)}
                  disabled={pendingKey === key || invalid}
                  className="mt-2 h-10 w-full rounded-full bg-[color:var(--color-brand)] text-[color:var(--color-cta-ink)] text-[12.5px] font-semibold flex items-center justify-center gap-1 disabled:opacity-45"
                >
                  <Check size={14} /> {pendingKey === key ? t("pod.saving") : t("pod.savePayment")}
                </button>
              </div>
            );
          })}
          {error ? (
            <p className="text-[12.5px] text-[color:var(--color-negative)]">{error}</p>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}
