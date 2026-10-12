import { newId } from "@/lib/ids";
import type { NetWorthGoal, RecurringTransaction, WealthSnapshot } from "@/lib/types";
import { makeClientMutationId } from "./writeQueue";
import { AuditedMutationOptions, MutationResult, RecurringPatch, asCloudCurrency, buildCloudRecurringPatch, idAs, localRecurringPatch, resultId } from "./domainPatches";
import type { DomainActionContext } from "./domainActionContext";

export function createPlanActions(ctx: DomainActionContext) {
  const { state, dispatch, cloud, mutations, queue, isCloudPortfolio, findPortfolioFor } = ctx;

  async function createRecurring(input: Omit<RecurringTransaction, "id"> & { id?: string }) {
    const localId = input.id ?? newId("rc");
    if (isCloudPortfolio(input.portfolioId)) {
      const clientMutationId = makeClientMutationId("recurring.add");
      const payload = {
        clientMutationId,
        portfolioId: idAs<"portfolios">(input.portfolioId),
        description: input.description,
        categoryId: input.categoryId ? idAs<"categories">(input.categoryId) : undefined,
        accountId: input.accountId ? idAs<"assets">(input.accountId) : undefined,
        kind: input.kind,
        amount: input.amount,
        currency: asCloudCurrency(input.currency),
        cadence: input.cadence,
        startAt: input.startAt,
        nextRunAt: input.nextRunAt,
        endAt: input.endAt,
        notes: input.notes,
        active: input.active,
        revenueType: input.revenueType,
        incomeSource: input.incomeSource,
        createdAt: input.createdAt
      };
      const { result, queued } = await queue.runOrQueue({
        operation: "recurring.add",
        payload,
        clientMutationId,
        execute: (next) => mutations.addRecurring(next as any)
      });
      return { id: resultId(result as MutationResult, localId), clientMutationId, queued };
    }
    dispatch({ type: "addRecurring", recurring: { ...input, id: localId } });
    return { id: localId, clientMutationId: undefined, queued: false };
  }

  async function updateRecurring(
    id: string,
    patch: RecurringPatch,
    portfolioId = findPortfolioFor(
      [
        ...Object.values(cloud.byPortfolio).flatMap((data) => data.recurring),
        ...state.recurring
      ],
      id
    )
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = makeClientMutationId("recurring.update");
      const payload = {
        clientMutationId,
        id: idAs<"recurring">(id),
        patch: buildCloudRecurringPatch(patch)
      };
      const { queued } = await queue.runOrQueue({
        operation: "recurring.update",
        payload,
        clientMutationId,
        execute: (next) => mutations.updateRecurring(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "updateRecurring", id, patch: localRecurringPatch(patch) });
    return { id, clientMutationId: undefined, queued: false };
  }

  async function deleteRecurring(
    id: string,
    portfolioId = findPortfolioFor(
      [
        ...Object.values(cloud.byPortfolio).flatMap((data) => data.recurring),
        ...state.recurring
      ],
      id
    )
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = makeClientMutationId("recurring.remove");
      const payload = { clientMutationId, id: idAs<"recurring">(id) };
      const { queued } = await queue.runOrQueue({
        operation: "recurring.remove",
        payload,
        clientMutationId,
        execute: (next) => mutations.removeRecurring(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "deleteRecurring", id });
    return { id, clientMutationId: undefined, queued: false };
  }

  async function upsertGoal(
    input: NetWorthGoal,
    options?: AuditedMutationOptions
  ) {
    if (isCloudPortfolio(input.portfolioId)) {
      const cloudGoals = cloud.byPortfolio[input.portfolioId]?.goals ?? [];
      const existingId = cloudGoals.some((goal) => goal.id === input.id)
        ? idAs<"goals">(input.id)
        : undefined;
      const clientMutationId =
        options?.clientMutationId ?? makeClientMutationId("goals.upsert");
      const payload = {
        clientMutationId,
        auditDraftId: options?.auditDraftId
          ? idAs<"aiActionDrafts">(options.auditDraftId)
          : undefined,
        id: existingId,
        portfolioId: idAs<"portfolios">(input.portfolioId),
        scope: input.scope,
        target: input.target,
        currency: asCloudCurrency(input.currency),
        startAt: input.startAt,
        deadline: input.deadline,
        label: input.label,
        categoryId: input.categoryId ? idAs<"categories">(input.categoryId) : undefined,
        assetId: input.assetId ? idAs<"assets">(input.assetId) : undefined,
        holdingId: input.holdingId ? idAs<"holdings">(input.holdingId) : undefined,
        createdAt: input.createdAt
      };
      const { result, queued } = await queue.runOrQueue({
        operation: "goals.upsert",
        payload,
        clientMutationId,
        auditDraftId: options?.auditDraftId,
        execute: (next) => mutations.upsertGoal(next as any)
      });
      return { id: resultId(result as MutationResult, input.id), clientMutationId, queued };
    }
    dispatch({ type: "setGoal", goal: input });
    return { id: input.id, clientMutationId: undefined, queued: false };
  }

  async function deleteGoal(
    id: string,
    portfolioId = findPortfolioFor(
      [...Object.values(cloud.byPortfolio).flatMap((data) => data.goals), ...state.goals],
      id
    )
  ) {
    if (isCloudPortfolio(portfolioId)) {
      const clientMutationId = makeClientMutationId("goals.remove");
      const payload = { clientMutationId, id: idAs<"goals">(id) };
      const { queued } = await queue.runOrQueue({
        operation: "goals.remove",
        payload,
        clientMutationId,
        execute: (next) => mutations.removeGoal(next as any)
      });
      return { id, clientMutationId, queued };
    }
    dispatch({ type: "deleteGoal", id });
    return { id, clientMutationId: undefined, queued: false };
  }

  async function createSnapshot(input: Omit<WealthSnapshot, "id"> & { id?: string }, options?: { clientMutationId?: string }) {
    const localId = input.id ?? newId("snap");
    if (isCloudPortfolio(input.portfolioId)) {
      const clientMutationId = options?.clientMutationId ?? makeClientMutationId("wealthSnapshots.add");
      const payload = {
        clientMutationId,
        portfolioId: idAs<"portfolios">(input.portfolioId),
        takenAt: input.takenAt,
        netWorth: input.netWorth,
        liquid: input.liquid,
        invested: input.invested,
        hardAssets: input.hardAssets,
        liabilities: input.liabilities,
        currency: asCloudCurrency(input.currency),
        label: input.label,
        isAuto: input.isAuto
      };
      const { result, queued } = await queue.runOrQueue({
        operation: "wealthSnapshots.add",
        payload,
        clientMutationId,
        execute: (next) => mutations.addSnapshot(next as any)
      });
      return { id: resultId(result as MutationResult, localId), clientMutationId, queued };
    }
    dispatch({ type: "addSnapshot", snapshot: { ...input, id: localId } });
    return { id: localId, clientMutationId: undefined, queued: false };
  }

  return {
    createRecurring,
    updateRecurring,
    deleteRecurring,
    upsertGoal,
    deleteGoal,
    createSnapshot,
  };
}
