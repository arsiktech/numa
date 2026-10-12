import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BalanceView, type BalanceAddKind, type UncountedWallet } from "../BalanceView";
import { HoldingDetailDialog } from "../HoldingDetailDialog";
import { NetWorthHistory } from "../NetWorthHistory";
import { AssetDialog } from "@/components/features/AssetDialog";
import { LiabilityDialog } from "@/components/features/LiabilityDialog";
import { AddHoldingDialog } from "@/components/features/AddHoldingDialog";
import { CryptoWalletDialog } from "@/components/features/CryptoWalletDialog";
import { CryptoWalletDetailDialog } from "@/components/features/CryptoWalletSection";
import {
  useAssets,
  useCryptoWallets,
  useCurrentPortfolioId,
  useHoldingEvents,
  useHoldings,
  useLiabilities,
  useMarketQuotes,
  usePortfolio,
  useSnapshots
} from "@/services/store";
import { useDomainActions } from "@/services/domainActions";
import { useFxRates } from "@/services/fxSync";
import { useManualSnapshot } from "@/hooks/useManualSnapshot";
import { buildAutoSnapshot } from "@/lib/autoSnapshot";
import { buildBalance, type BalanceItem, type BalanceWallet } from "@/lib/balance";
import { walletSnapshotIsFresh } from "@/lib/cryptoWallets";
import { convertCurrency } from "@/lib/fx";
import { useCryptoWalletSync } from "@/features/crypto/useCryptoWalletSync";
import { emitCommand } from "@/lib/commands";
import type { Asset, AssetKind, Holding, Liability } from "@/lib/types";

/**
 * Numa Pro home: live net worth as the Balance view (decisions 2026-10-11).
 * Everything you own and owe, on one scale, and the place to add and edit it.
 * The former Wealth page merged into this screen.
 */
export default function HomePage() {
  const [portfolioId] = useCurrentPortfolioId();
  const portfolio = usePortfolio(portfolioId);
  const currency = portfolio.defaultCurrency;
  const { rates } = useFxRates();
  const assets = useAssets(portfolio.id);
  const holdings = useHoldings(portfolio.id);
  const liabilities = useLiabilities(portfolio.id);
  const quotes = useMarketQuotes();
  const snapshots = useSnapshots(portfolio.id);
  const cryptoWallets = useCryptoWallets(portfolio.id);
  const cryptoSync = useCryptoWalletSync(cryptoWallets);
  const actions = useDomainActions();
  const snapshot = useManualSnapshot(portfolio.id);

  // Dialog state: one of these is open at a time.
  const [assetDialog, setAssetDialog] = useState<{ editing: Asset | null; kind: AssetKind } | null>(null);
  const [liabilityDialog, setLiabilityDialog] = useState<{ editing: Liability | null } | null>(null);
  const [addHoldingOpen, setAddHoldingOpen] = useState(false);
  const [editingHolding, setEditingHolding] = useState<Holding | null>(null);
  const [detailHoldingId, setDetailHoldingId] = useState<string | null>(null);
  const [trackWalletOpen, setTrackWalletOpen] = useState(false);
  const [walletId, setWalletId] = useState<string | null>(null);

  const detailHolding = holdings.find((holding) => holding.id === detailHoldingId) ?? null;
  const detailEvents = useHoldingEvents(portfolio.id, detailHolding?.id);
  const selectedWallet = cryptoSync.wallets.find((wallet) => wallet.id === walletId) ?? null;

  const balanceWallets = useMemo<BalanceWallet[]>(
    () =>
      cryptoSync.wallets
        .filter((wallet) => wallet.includeInNetWorth && wallet.snapshot)
        .map((wallet) => ({
          id: wallet.id,
          label: wallet.label,
          assets: convertCurrency(wallet.snapshot!.tokenValueUsd + wallet.snapshot!.defiValueUsd, "USD", currency, rates),
          debts: convertCurrency(wallet.snapshot!.debtValueUsd, "USD", currency, rates),
          fresh: walletSnapshotIsFresh(wallet.snapshot)
        })),
    [cryptoSync.wallets, currency, rates]
  );
  const uncountedWallets = useMemo<UncountedWallet[]>(
    () =>
      cryptoSync.wallets
        .filter((wallet) => !wallet.includeInNetWorth || !wallet.snapshot)
        .map((wallet) => ({
          id: wallet.id,
          label: wallet.label,
          reason: !wallet.includeInNetWorth ? "Tracked, but left out of net worth" : "Waiting for its first balance"
        })),
    [cryptoSync.wallets]
  );

  const summary = useMemo(
    () => buildBalance({ assets, holdings, liabilities, quotes, currency, rates, wallets: balanceWallets }),
    [assets, holdings, liabilities, quotes, currency, rates, balanceWallets]
  );

  function openAdd(kind: BalanceAddKind) {
    if (kind === "account") setAssetDialog({ editing: null, kind: "cash" });
    else if (kind === "property") setAssetDialog({ editing: null, kind: "real_estate" });
    else if (kind === "debt") setLiabilityDialog({ editing: null });
    else if (kind === "investment") setAddHoldingOpen(true);
    else if (kind === "wallet") setTrackWalletOpen(true);
  }

  function openEdit(item: BalanceItem) {
    if (item.source === "asset") {
      const asset = assets.find((row) => row.id === item.id);
      if (asset) setAssetDialog({ editing: asset, kind: asset.kind });
    } else if (item.source === "liability") {
      const liability = liabilities.find((row) => row.id === item.id);
      if (liability) setLiabilityDialog({ editing: liability });
    } else if (item.source === "holding") {
      setDetailHoldingId(item.id);
    } else if (item.source === "wallet") {
      setWalletId(item.id);
    }
  }

  // Old links (/wealth?add=…, Insights, search) land here with an add intent.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const add = searchParams.get("add");
    if (!add) return;
    const intent: Record<string, BalanceAddKind> = {
      asset: "account",
      account: "account",
      property: "property",
      liability: "debt",
      holding: "investment",
      wallet: "wallet"
    };
    if (intent[add]) openAdd(intent[add]);
    const next = new URLSearchParams(searchParams);
    next.delete("add");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function takeSnapshot() {
    const values = buildAutoSnapshot(
      { portfolio, assets, holdings, liabilities, cryptoWallets: cryptoSync.wallets },
      quotes,
      rates,
      Date.now()
    );
    void snapshot.capture(values ? { ...values, portfolioId: portfolio.id, isAuto: false } : null);
  }

  return (
    <>
      <BalanceView
        summary={summary}
        onAdd={() => emitCommand("open-capture")}
        onAddItem={openAdd}
        onEditItem={openEdit}
        uncountedWallets={uncountedWallets}
      />
      {!summary.empty ? (
        <div className="mx-auto w-full max-w-[880px] pb-8">
          <NetWorthHistory
            snapshots={snapshots}
            currency={currency}
            phase={snapshot.phase}
            message={snapshot.message}
            onCapture={takeSnapshot}
          />
        </div>
      ) : null}

      <AssetDialog
        open={assetDialog !== null}
        editing={assetDialog?.editing ?? null}
        defaultKind={assetDialog?.kind ?? "cash"}
        onClose={() => setAssetDialog(null)}
      />
      <LiabilityDialog
        open={liabilityDialog !== null}
        editing={liabilityDialog?.editing ?? null}
        onClose={() => setLiabilityDialog(null)}
      />
      <AddHoldingDialog open={addHoldingOpen} onClose={() => setAddHoldingOpen(false)} />
      <AddHoldingDialog
        open={editingHolding !== null}
        holding={editingHolding ?? undefined}
        onClose={() => setEditingHolding(null)}
      />
      <HoldingDetailDialog
        holding={editingHolding ? null : detailHolding}
        quote={detailHolding ? quotes[detailHolding.symbol] : undefined}
        events={detailEvents}
        baseCurrency={currency}
        rates={rates}
        onClose={() => setDetailHoldingId(null)}
        onEdit={() => setEditingHolding(detailHolding)}
        onDelete={async () => {
          if (!detailHolding) return;
          await actions.deleteHolding(detailHolding.id);
          setDetailHoldingId(null);
        }}
      />
      <CryptoWalletDialog
        open={trackWalletOpen}
        portfolioId={portfolio.id}
        wallets={cryptoWallets}
        onClose={() => setTrackWalletOpen(false)}
        onTracked={(id) => setWalletId(id)}
      />
      <CryptoWalletDetailDialog
        wallet={selectedWallet}
        currency={currency}
        rates={rates}
        syncing={selectedWallet ? cryptoSync.syncingIds.has(selectedWallet.id) : false}
        syncMessage={cryptoSync.error ?? cryptoSync.warning}
        onClose={() => setWalletId(null)}
        onRefresh={(id) => cryptoSync.syncWalletIds([id], true)}
      />
    </>
  );
}
