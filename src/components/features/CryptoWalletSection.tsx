import { useEffect, useMemo, useState } from "react";
import {
  Layers3,
  RefreshCw,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import {
  relativeCryptoUpdateTime,
  shortCryptoAddress
} from "@/lib/cryptoWallets";
import { convertCurrency, type FxRates } from "@/lib/fx";
import { formatMoney } from "@/lib/money";
import type { CryptoWallet, CurrencyCode } from "@/lib/types";
import { useDomainActions } from "@/services/domainActions";

function quantity(value: string) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && Math.abs(parsed) < 1e15) {
    if (Math.abs(parsed) >= 1_000_000) {
      return new Intl.NumberFormat(undefined, {
        notation: "compact",
        maximumFractionDigits: 3
      }).format(parsed);
    }
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(parsed);
  }
  const [whole, fraction = ""] = value.split(".");
  if (whole.length > 15) return `${whole.slice(0, 8)}…${whole.slice(-4)}`;
  return fraction ? `${whole}.${fraction.slice(0, 6)}` : whole;
}

function actionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "This wallet change could not be saved. Try again.";
}

export function CryptoWalletDetailDialog({
  wallet,
  currency,
  rates,
  syncing,
  syncMessage,
  onClose,
  onRefresh
}: {
  wallet: CryptoWallet | null;
  currency: CurrencyCode;
  rates: FxRates;
  syncing: boolean;
  syncMessage?: string | null;
  onClose: () => void;
  onRefresh: (walletId: string) => void | Promise<unknown>;
}) {
  const actions = useDomainActions();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const snapshot = wallet?.snapshot;
  const visibleTokens = useMemo(
    () => snapshot?.tokens.filter((token) => !token.suspectedSpam) ?? [],
    [snapshot]
  );
  const hiddenTokens = (snapshot?.tokens.length ?? 0) - visibleTokens.length;

  useEffect(() => {
    setConfirmRemove(false);
    setSaving(false);
    setActionError(null);
  }, [wallet?.id]);

  if (!wallet) return null;
  const total = snapshot
    ? convertCurrency(snapshot.totalValueUsd, "USD", currency, rates)
    : null;
  const tokenTotal = snapshot
    ? convertCurrency(snapshot.tokenValueUsd, "USD", currency, rates)
    : 0;
  const defiTotal = snapshot
    ? convertCurrency(snapshot.defiValueUsd, "USD", currency, rates)
    : 0;
  const debtTotal = snapshot
    ? convertCurrency(snapshot.debtValueUsd, "USD", currency, rates)
    : 0;

  async function setIncluded(includeInNetWorth: boolean) {
    setSaving(true);
    setActionError(null);
    try {
      await actions.updateCryptoWallet(wallet!.id, { includeInNetWorth });
    } catch (error) {
      setActionError(actionErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setActionError(null);
    try {
      await actions.deleteCryptoWallet(wallet!.id);
      onClose();
    } catch (error) {
      setActionError(actionErrorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={wallet.label}
      description={`${wallet.addressType.toUpperCase()} · ${shortCryptoAddress(wallet.address, 10, 8)}`}
      width={760}
    >
      <div className="space-y-4">
        <div className="overflow-hidden rounded-[20px] bg-[color:var(--color-ink)] p-5 text-[color:var(--color-bg)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:color-mix(in_oklab,var(--color-bg)_58%,transparent)]">
                estimated wallet value
              </p>
              <p className="mt-1 font-mono text-[34px] font-semibold leading-none tracking-[-0.04em]">
                {total === null ? "Reading…" : formatMoney(total, currency)}
              </p>
              <p className="mt-2 break-all font-mono text-[10.5px] text-[color:color-mix(in_oklab,var(--color-bg)_66%,transparent)]">
                <span className="sr-only">Full wallet address: </span>{wallet.address}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                void Promise.resolve(onRefresh(wallet.id)).catch((error) => {
                  setActionError(actionErrorMessage(error));
                });
              }}
              disabled={syncing}
              aria-label="Refresh wallet"
              className="nm-interactive inline-flex h-11 items-center gap-2 rounded-xl bg-[color:var(--color-brand)] px-3.5 text-[12px] font-semibold text-[color:var(--color-cta-ink)] disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
              {syncing ? "Updating" : "Refresh"}
            </button>
          </div>
          <p role="status" aria-live="polite" className="mt-3 text-[11px] text-[color:color-mix(in_oklab,var(--color-bg)_66%,transparent)]">
            {snapshot ? `${relativeCryptoUpdateTime(snapshot.updatedAt)} · ${snapshot.partial ? "partial provider coverage" : "on-chain data"}` : "Reading supported networks. Intermediate zeroes are never shown."}
          </p>
        </div>

        {actionError || syncMessage ? (
          <p
            role="alert"
            className="rounded-xl bg-[color:var(--color-blush-100)] px-3 py-2 text-[12px] text-[color:var(--color-negative)]"
          >
            {actionError ?? syncMessage}
          </p>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <DetailMetric label="Tokens" value={snapshot ? formatMoney(tokenTotal, currency) : "—"} />
          <DetailMetric label="DeFi" value={snapshot ? formatMoney(defiTotal, currency) : "—"} />
          <DetailMetric label="Borrowed" value={snapshot ? formatMoney(debtTotal, currency) : "—"} negative={debtTotal > 0} />
        </div>

        <label className="flex min-h-12 items-center justify-between gap-4 rounded-2xl bg-[color:var(--color-bg)] px-4 py-3">
          <span>
            <span className="block text-[13px] font-semibold text-[color:var(--color-ink)]">Count in Capital</span>
            <span className="mt-0.5 block text-[11.5px] text-[color:var(--color-ink-3)]">Turn off to avoid a duplicate manual holding.</span>
          </span>
          <input
            type="checkbox"
            checked={wallet.includeInNetWorth}
            disabled={saving}
            onChange={(event) => void setIncluded(event.target.checked)}
            className="h-5 w-5 accent-[color:var(--color-brand)]"
          />
        </label>

        <div className="rounded-2xl border border-[color:var(--color-line)]">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <h3 className="text-[14px] font-semibold text-[color:var(--color-ink)]">Tokens</h3>
              <p className="text-[11.5px] text-[color:var(--color-ink-3)]">Quantity is on-chain; fiat value is estimated.</p>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]">{visibleTokens.length}</span>
          </div>
          <div className="max-h-[260px] overflow-y-auto border-t border-[color:var(--color-line)] px-4">
            {visibleTokens.length ? visibleTokens.map((token) => (
              <div key={token.id} className="flex items-center gap-3 border-b border-[color:var(--color-line)] py-3 last:border-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color:var(--color-brand-soft)] text-[11px] font-bold text-[color:var(--color-brand-strong)]">{token.symbol.slice(0, 3)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[color:var(--color-ink)]">{token.symbol} <span className="font-normal text-[color:var(--color-ink-3)]">· {token.chainName}</span></span>
                  <span title={`${token.quantity} ${token.symbol}`} className="mt-0.5 block truncate font-mono text-[10.5px] text-[color:var(--color-ink-3)]">
                    {quantity(token.quantity)} {token.symbol}{token.representedInDefi ? " · counted in DeFi" : ""}
                  </span>
                </span>
                <span className="shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-[color:var(--color-ink)]">{token.valueUsd === undefined ? "Value unavailable" : formatMoney(convertCurrency(token.valueUsd, "USD", currency, rates), currency)}</span>
              </div>
            )) : (
              <p className="py-8 text-center text-[12.5px] text-[color:var(--color-ink-3)]">No supported token balances found.</p>
            )}
          </div>
          {hiddenTokens > 0 || snapshot?.tokensTruncated ? (
            <p className="border-t border-[color:var(--color-line)] px-4 py-2.5 text-[11.5px] text-[color:var(--color-ink-3)]">
              {hiddenTokens > 0
                ? `${hiddenTokens} suspected spam token${hiddenTokens === 1 ? "" : "s"} hidden${snapshot?.tokensTruncated ? " · " : ""}`
                : ""}
              {snapshot?.tokensTruncated ? "More token balances are included in the total." : ""}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[color:var(--color-line)]">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div>
              <h3 className="text-[14px] font-semibold text-[color:var(--color-ink)]">DeFi</h3>
              <p className="text-[11.5px] text-[color:var(--color-ink-3)]">Lending, staking, pools, rewards, and debt.</p>
            </div>
            <Layers3 size={16} className="text-[color:var(--color-ink-3)]" />
          </div>
          <div className="max-h-[260px] overflow-y-auto border-t border-[color:var(--color-line)] px-4">
            {snapshot?.defiPositions.length ? snapshot.defiPositions.map((position) => (
              <div key={position.id} className="flex items-center gap-3 border-b border-[color:var(--color-line)] py-3 last:border-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[color:var(--color-bg)] text-[11px] font-bold text-[color:var(--color-ink)]">{position.protocol.slice(0, 2).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold text-[color:var(--color-ink)]">{position.protocol}</span>
                  <span className="mt-0.5 block truncate text-[11px] capitalize text-[color:var(--color-ink-3)]">{position.kind} · {position.symbols.join(" + ") || position.label} · {position.chainName}</span>
                </span>
                <span className={`shrink-0 text-[12.5px] font-semibold tabular-nums ${position.debtValueUsd > 0 ? "text-[color:var(--color-negative)]" : "text-[color:var(--color-ink)]"}`}>{position.valueUsd === undefined ? "Value unavailable" : formatMoney(convertCurrency(position.valueUsd, "USD", currency, rates), currency)}</span>
              </div>
            )) : (
              <p className="py-8 text-center text-[12.5px] text-[color:var(--color-ink-3)]">No supported DeFi positions found.</p>
            )}
          </div>
          {snapshot?.defiPositionsTruncated ? (
            <p className="border-t border-[color:var(--color-line)] px-4 py-2.5 text-[11.5px] text-[color:var(--color-ink-3)]">
              More DeFi positions are included in the total.
            </p>
          ) : null}
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-[color:var(--color-bg)] px-3 py-2.5 text-[11.5px] text-[color:var(--color-ink-3)]">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-[color:var(--color-positive)]" />
          <span>Read-only public data. Removing this wallet from Numa Pro changes nothing on-chain.</span>
        </div>

        {confirmRemove ? (
          <div className="rounded-2xl bg-[color:var(--color-blush-100)] p-3">
            <p className="text-[12.5px] font-semibold text-[color:var(--color-negative)]">Remove this wallet and its saved snapshot from Numa Pro?</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setConfirmRemove(false)} className="h-11 rounded-xl bg-[color:var(--color-paper)] text-[12px] font-semibold text-[color:var(--color-ink)]">Keep wallet</button>
              <button type="button" onClick={() => void remove()} disabled={saving} aria-label="Confirm remove wallet" className="h-11 rounded-xl bg-[color:var(--color-negative)] text-[12px] font-semibold text-[color:var(--color-on-negative)] disabled:opacity-50">Confirm remove</button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmRemove(true)}
            aria-label="Remove wallet"
            className="nm-interactive inline-flex h-11 items-center gap-2 rounded-xl px-3 text-[12px] font-semibold text-[color:var(--color-negative)] hover:bg-[color:var(--color-blush-100)]"
          >
            <Trash2 size={14} /> Remove from Numa Pro
          </button>
        )}
      </div>
    </Dialog>
  );
}

function DetailMetric({ label, value, negative = false }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="rounded-2xl bg-[color:var(--color-bg)] p-3">
      <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-ink-3)]">{label}</p>
      <p className={`mt-1 truncate text-[13px] font-semibold tabular-nums ${negative ? "text-[color:var(--color-negative)]" : "text-[color:var(--color-ink)]"}`}>{value}</p>
    </div>
  );
}
