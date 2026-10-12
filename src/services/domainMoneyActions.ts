import { newId } from "@/lib/ids";
import type { Category, Portfolio, Transaction } from "@/lib/types";
import { makeClientMutationId } from "./writeQueue";
import { AuditedMutationOptions, CategoryPatch, CreatePortfolioInput, MutationResult, STARTER_CATEGORIES, TransactionPatch, asCloudCurrency, buildCloudCategoryPatch, buildCloudTransactionPatch, idAs, localCategoryPatch, localTransactionPatch, resultId } from "./domainPatches";
import type { DomainActionContext } from "./domainActionContext";

export function createMoneyActions(ctx: DomainActionContext) {
  const { state, dispatch, cloud, mutations, queue, isCloudPortfolio, findPortfolioFor } = ctx;

  async function createPortfolio(input: CreatePortfolioInput) {
    const localId = newId("pf");
    if (cloud.enabled) {
      const currency = asCloudCurrency(input.defaultCurrency);
      const clientMutationId = makeClientMutationId("portfolios.create");
      const payload = {
        clientMutationId,
        name: input.name,
        type: input.type,
        tagline: input.tagline,
        defaultCurrency: currency,
        seedDefaults: input.seedDefaults
      };
      const { result, queued } = await queue.runOrQueue({
        operation: "portfolios.create",
        payload,
        clientMutationId,
        execute: (next) => mutations.createPortfolio(next as any)
      });
      return { id: resultId(result as MutationResult, localId), clientMutationId, queued };
    }

    const now = Date.now();
    const portfolio: Portfolio = {
      id: localId,
      name: input.name,
      type: input.type,
      tagline: input.tagline,
      ownerId: state.currentUserId,
      defaultCurrency: input.defaultCurrency,
      createdAt: now
    };
    dispatch({ type: "addPortfolio", portfolio });
    if (input.seedDefaults) {
      STARTER_CATEGORIES.forEach((category, index) => {
        dispatch({
          type: "addCategory",
          category: {
            id: newId("cat"),
            portfolioId: portfolio.id,
            ...category,
            sortOrder: index
          }
        });
      });
      dispatch({
        type: "addAsset",
        asset: {
          id: newId("as"),
          portfolioId: portfolio.id,
          name: "Cash",
          kind: "cash",
          balance: 0,
          currency: input.defaultCurrency,
          notes: "Starter account",
          updatedAt: now
        }
      });
    }
    return { id: localId, clientMutationId: undefined, queued: false };
  }

  async function updatePortfolio(id: string, patch: Partial<Pick<Portfolio, "name" | "tagline" | "defaultCurrency">>) {
    if (isCloudPortfolio(id)) {
      const clientMutationId = makeClientMutationId("portfolios.update");
      const payload = {
        clientMutationId,
        id: idAs<"portfolios">(id),
        patch: {
          name: patch.name,
          tagline: patch.tagline,
          defaultCurrency: patch.defaultCurrency ? asCloudCurrency(patch.defaultCurrency) : undefined
        }
      };
      const { queued } = await queue.runOrQueue({
        operation: "portfolios.update",
        payload,
        clientMutationId,
        execute: (next) => mutations.updatePortfolio(next as any)
      });
      return { id, clientMutationId, queued };
    }
    // No local reducer action exists for editing a portfolio; keep legacy fallback
    // scoped to create/delete until the local store is fully retired.
    return { id, clientMutationId: undefined, queued: false };
  }

  async function deletePortfolio(id: string) {
    if (isCloudPortfolio(id)) {
      const clientMutationId = makeClientMutationId("portfolios.remove");
      const payload = { clientMutationId, id: idAs<"portfolios">(id) };
      const { queued } = await queue.runOrQueue({
        operation: "portfolios.remove",
        payload,
        clientMutationId,
        execute: (next) => mutations.removePortfolio(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "deletePortfolio", id });
    return { id, clientMutationId: undefined, queued: false };
  }

  async function createTransaction(
    input: Omit<Transaction, "id"> & { id?: string },
    options?: AuditedMutationOptions
  ) {
    const localId = input.id ?? newId("tx");
    if (isCloudPortfolio(input.portfolioId)) {
      const clientMutationId =
        options?.clientMutationId ?? makeClientMutationId("transactions.add");
      const payload = {
        clientMutationId,
        auditDraftId: options?.auditDraftId
          ? idAs<"aiActionDrafts">(options.auditDraftId)
          : undefined,
        portfolioId: idAs<"portfolios">(input.portfolioId),
        occurredAt: input.occurredAt,
        description: input.description,
        categoryId: input.categoryId ? idAs<"categories">(input.categoryId) : undefined,
        accountId: input.accountId ? idAs<"assets">(input.accountId) : undefined,
        kind: input.kind,
        amount: input.amount,
        currency: asCloudCurrency(input.currency),
        splits: input.splits?.map((split) => ({
          userId: idAs<"users">(split.userId),
          bps: split.bps
        })),
        notes: input.notes,
        location: input.location
      };
      const { result, queued } = await queue.runOrQueue({
        operation: "transactions.add",
        payload,
        clientMutationId,
        auditDraftId: options?.auditDraftId,
        execute: (next) => mutations.addTransaction(next as any)
      });
      return { id: resultId(result as MutationResult, localId), clientMutationId, queued };
    }
    dispatch({ type: "addTransaction", tx: { ...input, id: localId } });
    return { id: localId, clientMutationId: undefined, queued: false };
  }

  async function updateTransaction(
    id: string,
    patch: TransactionPatch,
    portfolioId = findPortfolioFor(
      [
        ...Object.values(cloud.byPortfolio).flatMap((data) => data.transactions),
        ...state.transactions
      ],
      id
    )
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = makeClientMutationId("transactions.update");
      const payload = {
        clientMutationId,
        id: idAs<"transactions">(id),
        patch: buildCloudTransactionPatch(patch)
      };
      const { queued } = await queue.runOrQueue({
        operation: "transactions.update",
        payload,
        clientMutationId,
        execute: (next) => mutations.updateTransaction(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "updateTransaction", id, patch: localTransactionPatch(patch) });
    return { id, clientMutationId: undefined, queued: false };
  }

  async function deleteTransaction(
    id: string,
    portfolioId = findPortfolioFor(
      [
        ...Object.values(cloud.byPortfolio).flatMap((data) => data.transactions),
        ...state.transactions
      ],
      id
    )
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = makeClientMutationId("transactions.remove");
      const payload = { clientMutationId, id: idAs<"transactions">(id) };
      const { queued } = await queue.runOrQueue({
        operation: "transactions.remove",
        payload,
        clientMutationId,
        execute: (next) => mutations.removeTransaction(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "deleteTransaction", id });
    return { id, clientMutationId: undefined, queued: false };
  }

  async function createCategory(
    input: Omit<Category, "id"> & { id?: string },
    options?: AuditedMutationOptions
  ) {
    const localId = input.id ?? newId("cat");
    if (isCloudPortfolio(input.portfolioId)) {
      const clientMutationId =
        options?.clientMutationId ?? makeClientMutationId("categories.add");
      const payload = {
        clientMutationId,
        auditDraftId: options?.auditDraftId
          ? idAs<"aiActionDrafts">(options.auditDraftId)
          : undefined,
        portfolioId: idAs<"portfolios">(input.portfolioId),
        name: input.name,
        kind: input.kind,
        icon: input.icon,
        color: input.color,
        sortOrder: input.sortOrder,
        emoji: input.emoji,
        monthlyLimit: input.monthlyLimit
      };
      const { result, queued } = await queue.runOrQueue({
        operation: "categories.add",
        payload,
        clientMutationId,
        auditDraftId: options?.auditDraftId,
        execute: (next) => mutations.addCategory(next as any)
      });
      return { id: resultId(result as MutationResult, localId), clientMutationId, queued };
    }
    dispatch({ type: "addCategory", category: { ...input, id: localId } });
    return { id: localId, clientMutationId: undefined, queued: false };
  }

  async function updateCategory(
    id: string,
    patch: CategoryPatch,
    portfolioId = findPortfolioFor(
      [
        ...Object.values(cloud.byPortfolio).flatMap((data) => data.categories),
        ...state.categories
      ],
      id
    ),
    options?: AuditedMutationOptions
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId =
        options?.clientMutationId ?? makeClientMutationId("categories.update");
      const payload = {
        clientMutationId,
        auditDraftId: options?.auditDraftId
          ? idAs<"aiActionDrafts">(options.auditDraftId)
          : undefined,
        id: idAs<"categories">(id),
        patch: buildCloudCategoryPatch(patch)
      };
      const { queued } = await queue.runOrQueue({
        operation: "categories.update",
        payload,
        clientMutationId,
        auditDraftId: options?.auditDraftId,
        execute: (next) => mutations.updateCategory(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "updateCategory", id, patch: localCategoryPatch(patch) });
    return { id, clientMutationId: undefined, queued: false };
  }

  async function deleteCategory(
    id: string,
    portfolioId = findPortfolioFor(
      [
        ...Object.values(cloud.byPortfolio).flatMap((data) => data.categories),
        ...state.categories
      ],
      id
    )
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = makeClientMutationId("categories.remove");
      const payload = { clientMutationId, id: idAs<"categories">(id) };
      const { queued } = await queue.runOrQueue({
        operation: "categories.remove",
        payload,
        clientMutationId,
        execute: (next) => mutations.removeCategory(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "deleteCategory", id });
    return { id, clientMutationId: undefined, queued: false };
  }

  return {
    createPortfolio,
    updatePortfolio,
    deletePortfolio,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    createCategory,
    updateCategory,
    deleteCategory,
  };
}
