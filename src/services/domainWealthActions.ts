import { newId } from "@/lib/ids";
import type { Asset, CryptoWallet, Holding, HoldingEvent, Liability, Settlement } from "@/lib/types";
import { normalizeCryptoWalletAddress } from "@/lib/cryptoWallets";
import { makeClientMutationId } from "./writeQueue";
import { AssetPatch, LiabilityPatch, MutationResult, asCloudCurrency, buildCloudAssetPatch, buildCloudLiabilityPatch, idAs, localAssetPatch, localLiabilityPatch, resultId } from "./domainPatches";
import type { DomainActionContext } from "./domainActionContext";

export function createWealthRecordActions(ctx: DomainActionContext) {
  const { state, dispatch, cloud, mutations, queue, isCloudPortfolio, findPortfolioFor } = ctx;

  async function createAsset(input: Omit<Asset, "id" | "updatedAt"> & { id?: string; updatedAt?: number }) {
    const localId = input.id ?? newId("as");
    const asset = { ...input, id: localId, updatedAt: input.updatedAt ?? Date.now() };
    if (isCloudPortfolio(input.portfolioId)) {
      const clientMutationId = makeClientMutationId("assets.add");
      const payload = {
        clientMutationId,
        portfolioId: idAs<"portfolios">(input.portfolioId),
        name: input.name,
        kind: input.kind,
        balance: input.balance,
        currency: asCloudCurrency(input.currency),
        notes: input.notes
      };
      const { result, queued } = await queue.runOrQueue({
        operation: "assets.add",
        payload,
        clientMutationId,
        execute: (next) => mutations.addAsset(next as any)
      });
      return { id: resultId(result as MutationResult, localId), clientMutationId, queued };
    }
    dispatch({ type: "addAsset", asset });
    return { id: localId, clientMutationId: undefined, queued: false };
  }

  async function updateAsset(
    id: string,
    patch: AssetPatch,
    portfolioId = findPortfolioFor(
      [...Object.values(cloud.byPortfolio).flatMap((data) => data.assets), ...state.assets],
      id
    )
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = makeClientMutationId("assets.update");
      const payload = {
        clientMutationId,
        id: idAs<"assets">(id),
        patch: buildCloudAssetPatch(patch)
      };
      const { queued } = await queue.runOrQueue({
        operation: "assets.update",
        payload,
        clientMutationId,
        execute: (next) => mutations.updateAsset(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "updateAsset", id, patch: localAssetPatch(patch) });
    return { id, clientMutationId: undefined, queued: false };
  }

  /**
   * Atomic balance increment for goal contributions. `delta` must already be
   * in the asset's own currency (callers convert before invoking). On cloud
   * portfolios this routes to assets.adjustBalance, which re-reads the balance
   * inside the server transaction so concurrent contributions converge. The
   * local (non-cloud) fallback keeps using the updateAsset reducer with an
   * absolute balance derived from local state — single-device, so no race.
   */
  async function adjustAssetBalance(
    id: string,
    delta: number,
    portfolioId = findPortfolioFor(
      [...Object.values(cloud.byPortfolio).flatMap((data) => data.assets), ...state.assets],
      id
    )
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = makeClientMutationId("assets.adjustBalance");
      const payload = {
        clientMutationId,
        id: idAs<"assets">(id),
        delta
      };
      const { queued } = await queue.runOrQueue({
        operation: "assets.adjustBalance",
        payload,
        clientMutationId,
        execute: (next) => mutations.adjustAssetBalance(next as any)
      });
      return { id, clientMutationId, queued };
    }
    const localAsset = state.assets.find((asset) => asset.id === id);
    dispatch({
      type: "updateAsset",
      id,
      patch: { balance: (localAsset?.balance ?? 0) + delta }
    });
    return { id, clientMutationId: undefined, queued: false };
  }

  async function deleteAsset(
    id: string,
    portfolioId = findPortfolioFor(
      [...Object.values(cloud.byPortfolio).flatMap((data) => data.assets), ...state.assets],
      id
    )
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = makeClientMutationId("assets.remove");
      const payload = { clientMutationId, id: idAs<"assets">(id) };
      const { queued } = await queue.runOrQueue({
        operation: "assets.remove",
        payload,
        clientMutationId,
        execute: (next) => mutations.removeAsset(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "deleteAsset", id });
    return { id, clientMutationId: undefined, queued: false };
  }

  async function createLiability(input: Omit<Liability, "id" | "updatedAt"> & { id?: string; updatedAt?: number }) {
    const localId = input.id ?? newId("li");
    const liability = { ...input, id: localId, updatedAt: input.updatedAt ?? Date.now() };
    if (isCloudPortfolio(input.portfolioId)) {
      const clientMutationId = makeClientMutationId("liabilities.add");
      const payload = {
        clientMutationId,
        portfolioId: idAs<"portfolios">(input.portfolioId),
        name: input.name,
        kind: input.kind,
        balance: input.balance,
        currency: asCloudCurrency(input.currency),
        interestRate: input.interestRate,
        dueDate: input.dueDate,
        notes: input.notes
      };
      const { result, queued } = await queue.runOrQueue({
        operation: "liabilities.add",
        payload,
        clientMutationId,
        execute: (next) => mutations.addLiability(next as any)
      });
      return { id: resultId(result as MutationResult, localId), clientMutationId, queued };
    }
    dispatch({ type: "addLiability", liability });
    return { id: localId, clientMutationId: undefined, queued: false };
  }

  async function updateLiability(
    id: string,
    patch: LiabilityPatch,
    portfolioId = findPortfolioFor(
      [
        ...Object.values(cloud.byPortfolio).flatMap((data) => data.liabilities),
        ...state.liabilities
      ],
      id
    )
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = makeClientMutationId("liabilities.update");
      const payload = {
        clientMutationId,
        id: idAs<"liabilities">(id),
        patch: buildCloudLiabilityPatch(patch)
      };
      const { queued } = await queue.runOrQueue({
        operation: "liabilities.update",
        payload,
        clientMutationId,
        execute: (next) => mutations.updateLiability(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "updateLiability", id, patch: localLiabilityPatch(patch) });
    return { id, clientMutationId: undefined, queued: false };
  }

  async function deleteLiability(
    id: string,
    portfolioId = findPortfolioFor(
      [
        ...Object.values(cloud.byPortfolio).flatMap((data) => data.liabilities),
        ...state.liabilities
      ],
      id
    )
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = makeClientMutationId("liabilities.remove");
      const payload = { clientMutationId, id: idAs<"liabilities">(id) };
      const { queued } = await queue.runOrQueue({
        operation: "liabilities.remove",
        payload,
        clientMutationId,
        execute: (next) => mutations.removeLiability(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "deleteLiability", id });
    return { id, clientMutationId: undefined, queued: false };
  }

  async function createHolding(input: Omit<Holding, "id"> & { id?: string }, options?: { recordPurchase?: boolean; clientMutationId?: string }) {
    const localId = input.id ?? newId("ho");
    if (isCloudPortfolio(input.portfolioId)) {
      const clientMutationId = options?.clientMutationId ?? makeClientMutationId("holdings.add");
      const payload = {
        clientMutationId,
        portfolioId: idAs<"portfolios">(input.portfolioId),
        symbol: input.symbol,
        name: input.name,
        kind: input.kind,
        quantity: input.quantity,
        costBasis: input.costBasis,
        currency: asCloudCurrency(input.currency),
        acquiredAt: input.acquiredAt,
        recordPurchase: options?.recordPurchase
      };
      const { result, queued } = await queue.runOrQueue({
        operation: "holdings.add",
        payload,
        clientMutationId,
        execute: (next) => mutations.addHolding(next as any)
      });
      return { id: resultId(result as MutationResult, localId), clientMutationId, queued };
    }
    dispatch({ type: "addHolding", holding: { ...input, id: localId } });
    if (options?.recordPurchase) dispatch({ type: "addHoldingEvent", event: {
      id: newId("he"), portfolioId: input.portfolioId, holdingId: localId,
      symbol: input.symbol, kind: "buy", quantity: input.quantity,
      unitPrice: input.costBasis / input.quantity, total: input.costBasis,
      currency: input.currency, occurredAt: input.acquiredAt
    } });
    return { id: localId, clientMutationId: undefined, queued: false };
  }

  async function updateHolding(
    id: string,
    patch: Partial<Holding>,
    portfolioId = findPortfolioFor(
      [
        ...Object.values(cloud.byPortfolio).flatMap((data) => data.holdings),
        ...state.holdings
      ],
      id
    ),
    retryId?: string
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = retryId ?? makeClientMutationId("holdings.update");
      const payload = {
        clientMutationId,
        id: idAs<"holdings">(id),
        patch: {
          ...patch,
          currency: patch.currency ? asCloudCurrency(patch.currency) : undefined
        }
      };
      const { queued } = await queue.runOrQueue({
        operation: "holdings.update",
        payload,
        clientMutationId,
        execute: (next) => mutations.updateHolding(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "updateHolding", id, patch });
    return { id, clientMutationId: undefined, queued: false };
  }

  async function deleteHolding(
    id: string,
    portfolioId = findPortfolioFor(
      [
        ...Object.values(cloud.byPortfolio).flatMap((data) => data.holdings),
        ...state.holdings
      ],
      id
    )
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = makeClientMutationId("holdings.remove");
      const payload = { clientMutationId, id: idAs<"holdings">(id) };
      const { queued } = await queue.runOrQueue({
        operation: "holdings.remove",
        payload,
        clientMutationId,
        execute: (next) => mutations.removeHolding(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "deleteHolding", id });
    return { id, clientMutationId: undefined, queued: false };
  }

  async function createHoldingEvent(input: Omit<HoldingEvent, "id"> & { id?: string }) {
    const localId = input.id ?? newId("he");
    if (isCloudPortfolio(input.portfolioId)) {
      const clientMutationId = makeClientMutationId("holdingEvents.add");
      const payload = {
        clientMutationId,
        portfolioId: idAs<"portfolios">(input.portfolioId),
        holdingId: idAs<"holdings">(input.holdingId),
        symbol: input.symbol,
        kind: input.kind,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        total: input.total,
        currency: asCloudCurrency(input.currency),
        occurredAt: input.occurredAt,
        notes: input.notes
      };
      const { result, queued } = await queue.runOrQueue({
        operation: "holdingEvents.add",
        payload,
        clientMutationId,
        execute: (next) => mutations.addHoldingEvent(next as any)
      });
      return { id: resultId(result as MutationResult, localId), clientMutationId, queued };
    }
    dispatch({ type: "addHoldingEvent", event: { ...input, id: localId } });
    return { id: localId, clientMutationId: undefined, queued: false };
  }

  async function createCryptoWallet(
    input: Pick<CryptoWallet, "portfolioId" | "address" | "label"> & {
      includeInNetWorth?: boolean;
    }
  ) {
    const normalized = normalizeCryptoWalletAddress(input.address);
    if (!normalized) throw new Error("Enter a public EVM, Solana, or Bitcoin bc1 mainnet address.");
    const localId = newId("cw");
    const now = Date.now();
    const wallet: CryptoWallet = {
      id: localId,
      portfolioId: input.portfolioId,
      address: normalized.address,
      addressType: normalized.addressType,
      label: input.label.trim(),
      includeInNetWorth: input.includeInNetWorth ?? true,
      createdAt: now,
      updatedAt: now
    };
    if (isCloudPortfolio(input.portfolioId)) {
      // The provider sync needs the real server id immediately, so wallet
      // creation is intentionally online-only instead of entering the queue.
      const clientMutationId = makeClientMutationId("cryptoWallets.add");
      const result = await mutations.addCryptoWallet({
        clientMutationId,
        portfolioId: idAs<"portfolios">(input.portfolioId),
        address: wallet.address,
        addressType: wallet.addressType,
        label: wallet.label,
        includeInNetWorth: wallet.includeInNetWorth
      });
      return {
        id: resultId(result as MutationResult, localId),
        clientMutationId,
        queued: false
      };
    }
    dispatch({ type: "addCryptoWallet", wallet });
    return { id: localId, clientMutationId: undefined, queued: false };
  }

  async function updateCryptoWallet(
    id: string,
    patch: Pick<Partial<CryptoWallet>, "label" | "includeInNetWorth">,
    portfolioId = findPortfolioFor(
      [
        ...Object.values(cloud.byPortfolio).flatMap((data) => data.cryptoWallets),
        ...state.cryptoWallets
      ],
      id
    )
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = makeClientMutationId("cryptoWallets.update");
      const payload = {
        clientMutationId,
        id: idAs<"cryptoWallets">(id),
        patch
      };
      const { queued } = await queue.runOrQueue({
        operation: "cryptoWallets.update",
        payload,
        clientMutationId,
        execute: (next) => mutations.updateCryptoWallet(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "updateCryptoWallet", id, patch });
    return { id, clientMutationId: undefined, queued: false };
  }

  async function deleteCryptoWallet(
    id: string,
    portfolioId = findPortfolioFor(
      [
        ...Object.values(cloud.byPortfolio).flatMap((data) => data.cryptoWallets),
        ...state.cryptoWallets
      ],
      id
    )
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = makeClientMutationId("cryptoWallets.remove");
      const payload = { clientMutationId, id: idAs<"cryptoWallets">(id) };
      const { queued } = await queue.runOrQueue({
        operation: "cryptoWallets.remove",
        payload,
        clientMutationId,
        execute: (next) => mutations.removeCryptoWallet(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "deleteCryptoWallet", id });
    return { id, clientMutationId: undefined, queued: false };
  }

  async function createSettlement(input: Omit<Settlement, "id"> & { id?: string }) {
    const localId = input.id ?? newId("st");
    if (isCloudPortfolio(input.portfolioId)) {
      const clientMutationId = makeClientMutationId("settlements.add");
      const payload = {
        clientMutationId,
        portfolioId: idAs<"portfolios">(input.portfolioId),
        fromUserId: idAs<"users">(input.fromUserId),
        toUserId: idAs<"users">(input.toUserId),
        amount: input.amount,
        currency: asCloudCurrency(input.currency),
        occurredAt: input.occurredAt,
        note: input.note
      };
      const { result, queued } = await queue.runOrQueue({
        operation: "settlements.add",
        payload,
        clientMutationId,
        execute: (next) => mutations.addSettlement(next as any)
      });
      return { id: resultId(result as MutationResult, localId), clientMutationId, queued };
    }
    dispatch({ type: "addSettlement", settlement: { ...input, id: localId } });
    return { id: localId, clientMutationId: undefined, queued: false };
  }

  async function deleteSettlement(
    id: string,
    portfolioId = findPortfolioFor(
      [
        ...Object.values(cloud.byPortfolio).flatMap((data) => data.settlements),
        ...state.settlements
      ],
      id
    )
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = makeClientMutationId("settlements.remove");
      const payload = { clientMutationId, id: idAs<"settlements">(id) };
      const { queued } = await queue.runOrQueue({
        operation: "settlements.remove",
        payload,
        clientMutationId,
        execute: (next) => mutations.removeSettlement(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "deleteSettlement", id });
    return { id, clientMutationId: undefined, queued: false };
  }

  return {
    createAsset,
    updateAsset,
    adjustAssetBalance,
    deleteAsset,
    createLiability,
    updateLiability,
    deleteLiability,
    createHolding,
    updateHolding,
    deleteHolding,
    createHoldingEvent,
    createCryptoWallet,
    updateCryptoWallet,
    deleteCryptoWallet,
    createSettlement,
    deleteSettlement,
  };
}
