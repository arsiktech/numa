import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  Layers3,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  WalletCards
} from "lucide-react";
import { Dialog } from "@/components/ui/Dialog";
import {
  relativeCryptoUpdateTime,
  shortCryptoAddress,
  walletSnapshotIsFresh,
  type CryptoPortfolioRollup
} from "@/lib/cryptoWallets";
import { convertCurrency, type FxRates } from "@/lib/fx";
import { formatMoney } from "@/lib/money";
import type { CryptoWallet, CurrencyCode } from "@/lib/types";
import { useDomainActions } from "@/services/domainActions";

function walletStatus(wallet: CryptoWallet, syncing: boolean) {
  if (syncing) return "Updating";
  if (!wallet.snapshot) return "Needs refresh";
  if (wallet.snapshot.partial) return "Partial";
  if (!walletSnapshotIsFresh(wallet.snapshot)) return "Refresh due";
  return relativeCryptoUpdateTime(wallet.snapshot.updatedAt);
}

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

async function copyAddress(address: string) {
  if (!navigator.clipboard) return false;
  await navigator.clipboard.writeText(address);
  return true;
}

function actionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "This wallet change could not be saved. Try again.";
}

export function CryptoWalletSection({
  wallets,
  rollup,
  currency,
  rates,
  syncingIds,
  syncing,
  error,
  warning,
  hasManualCrypto,
  onTrack,
  onSelectWallet,
  onRefreshAll,
  className = ""
}: {
  wallets: CryptoWallet[];
  rollup: CryptoPortfolioRollup;
  currency: CurrencyCode;
  rates: FxRates;
  syncingIds: Set<string>;
  syncing: boolean;
  error: string | null;
  warning: string | null;
  hasManualCrypto: boolean;
  onTrack: () => void;
  onSelectWallet: (walletId: string) => void;
  onRefreshAll: () => void | Promise<unknown>;
  className?: string;
}) {
  const total = convertCurrency(rollup.totalValueUsd, "USD", currency, rates);
  const hasSnapshot = rollup.updatedAt !== undefined;
  const pendingWallets = wallets.filter((wallet) => !wallet.snapshot).length;
  const headlineStatus = pendingWallets > 0
    ? `${pendingWallets} wallet${pendingWallets === 1 ? "" : "s"} still reading`
    : rollup.partial
      ? "partial coverage"
      : rollup.stale
        ? "saved values · refresh due"
        : relativeCryptoUpdateTime(rollup.updatedAt);

  return (
    <section
      aria-labelledby="crypto-wallets-title"
      className={`rounded-2xl border border-[color:var(--color-line)] bg-[color:var(--color-paper)] p-4 shadow-[var(--shadow-sm)] sm:p-5 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-ink-3)]">
            on-chain · read-only
          </p>
          <h2 id="crypto-wallets-title" className="mt-1 text-[17px] font-bold text-[color:var(--color-ink)]">
            Wallets
          </h2>
          <p className="mt-0.5 text-[12px] text-[color:var(--color-ink-3)]">
            Tokens and DeFi positions visible from public addresses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {wallets.length > 0 ? (
            <button
              type="button"
              onClick={() => void onRefreshAll()}
              disabled={syncing}
              aria-label="Refresh wallets"
              className="nm-interactive grid h-11 w-11 place-items-center rounded-xl bg-[color:var(--color-bg)] text-[color:var(--color-ink)] disabled:opacity-50"
            >
              <RefreshCw size={15} className={syncing ? "animate-spin" : ""} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onTrack}
            className="nm-interactive inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl bg-[color:var(--color-cta)] px-4 text-[12.5px] font-semibold text-[color:var(--color-cta-ink)]"
          >
            <Plus size={15} /> Track wallet
          </button>
        </div>
      </div>

      {wallets.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-[18px] bg-[color:var(--color-ink)] p-4 text-[color:var(--color-bg)] sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-[color:color-mix(in_oklab,var(--color-bg)_60%,transparent)]">
                {pendingWallets > 0 ? "known on-chain value so far" : "estimated on-chain value"}
              </p>
              <p className="mt-1 font-mono text-[30px] font-semibold leading-none tracking-[-0.04em] sm:text-[36px]">
                {hasSnapshot ? formatMoney(total, currency) : "Reading…"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[12px] font-semibold">
                {wallets.length} wallet{wallets.length === 1 ? "" : "s"} · {rollup.chains.length} network{rollup.chains.length === 1 ? "" : "s"}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:color-mix(in_oklab,var(--color-bg)_60%,transparent)]">
                {headlineStatus}
              </p>
            </div>
          </div>
          <div className="mt-4 flex min-h-6 items-center gap-2 overflow-hidden" aria-hidden>
            {(rollup.chains.length ? rollup.chains : ["Waiting for first scan"]).slice(0, 7).map((chain, index) => (
              <span key={chain} className="flex min-w-0 items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${index === 0 ? "bg-[color:var(--color-brand)]" : "bg-[color:color-mix(in_oklab,var(--color-bg)_42%,transparent)]"}`} />
                <span className="truncate font-mono text-[10px] uppercase tracking-[0.08em] text-[color:color-mix(in_oklab,var(--color-bg)_70%,transparent)]">
                  {chain}
                </span>
                {index < Math.min(6, rollup.chains.length - 1) ? (
                  <span className="h-px w-5 shrink-0 bg-[color:color-mix(in_oklab,var(--color-bg)_22%,transparent)]" />
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 grid min-h-[170px] place-items-center rounded-[18px] bg-[color:var(--color-bg)] px-5 text-center">
          <div>
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-2xl bg-[color:var(--color-brand-soft)] text-[color:var(--color-brand-strong)]">
              <WalletCards size={19} />
            </span>
            <p className="mt-3 text-[14px] font-semibold text-[color:var(--color-ink)]">No public wallets tracked</p>
            <p className="mt-1 max-w-sm text-[12px] leading-relaxed text-[color:var(--color-ink-3)]">
              Add an address to see supported tokens, networks, lending, staking, pools, and debt.
            </p>
          </div>
        </div>
      )}

      {error || warning ? (
        <p
          role="status"
          aria-live="polite"
          className={`mt-3 rounded-xl px-3 py-2 text-[12px] ${error ? "bg-[color:var(--color-blush-100)] text-[color:var(--color-negative)]" : "bg-[color:var(--color-bg)] text-[color:var(--color-ink-3)]"}`}
        >
          {error ?? warning}
        </p>
      ) : null}

      {hasManualCrypto && wallets.some((wallet) => wallet.includeInNetWorth) ? (
        <div className="mt-3 flex gap-2 rounded-xl bg-[color:var(--color-peach-100)] px-3 py-2.5 text-[12px] text-[color:var(--color-ink-2)]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-[color:var(--color-warning)]" />
          <span>Manual crypto holdings are also counted. Exclude any wallet that duplicates them.</span>
        </div>
      ) : null}

      {wallets.length > 0 ? (
        <div className="mt-3 divide-y divide-[color:var(--color-line)]">
          {wallets.map((wallet) => (
            <WalletRow
              key={wallet.id}
              wallet={wallet}
              currency={currency}
              rates={rates}
              syncing={syncingIds.has(wallet.id)}
              onOpen={() => onSelectWallet(wallet.id)}
            />
          ))}
        </div>
      ) : null}

    </section>
  );
}

function WalletRow({
  wallet,
  currency,
  rates,
  syncing,
  onOpen
}: {
  wallet: CryptoWallet;
  currency: CurrencyCode;
  rates: FxRates;
  syncing: boolean;
  onOpen: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const snapshot = wallet.snapshot;
  const value = snapshot
    ? convertCurrency(snapshot.totalValueUsd, "USD", currency, rates)
    : null;
  const status = walletStatus(wallet, syncing);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <div className="flex items-center gap-2 py-3">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${wallet.label}, ${wallet.address}, ${value === null ? "value pending" : formatMoney(value, currency)}, ${status}`}
        className="nm-interactive flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 text-left hover:bg-[color:var(--color-bg)]"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[color:var(--color-ink)] font-mono text-[11px] font-bold uppercase text-[color:var(--color-brand)]">
          {wallet.addressType.slice(0, 3)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-[color:var(--color-ink)]">
            {wallet.label}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[10.5px] text-[color:var(--color-ink-3)]">
            {shortCryptoAddress(wallet.address)} · {snapshot?.chains.slice(0, 3).join(" · ") || wallet.addressType.toUpperCase()}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[13.5px] font-semibold tabular-nums text-[color:var(--color-ink)]">
            {value === null ? "Reading…" : formatMoney(value, currency)}
          </span>
          <span className={`mt-0.5 block font-mono text-[10px] uppercase tracking-[0.06em] ${snapshot?.partial ? "text-[color:var(--color-warning)]" : "text-[color:var(--color-ink-3)]"}`}>
            {status}
          </span>
        </span>
        <ChevronRight size={15} className="shrink-0 text-[color:var(--color-ink-4)]" />
      </button>
      <button
        type="button"
        onClick={() => void copyAddress(wallet.address).then(setCopied).catch(() => setCopied(false))}
        aria-label="Copy wallet address"
        className="nm-interactive grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-bg)] hover:text-[color:var(--color-ink)]"
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
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
