import { useNuma } from "./store";
import { useCloudMutations, useCloudState } from "./cloudStore";
import { useWriteQueue } from "./writeQueue";
import { requirePortfolioWriteTarget } from "./domainPatches";
import type { DomainActionContext } from "./domainActionContext";
import { createMoneyActions } from "./domainMoneyActions";
import { createWealthRecordActions } from "./domainWealthActions";
import { createPlanActions } from "./domainPlanActions";

/**
 * The typed write surface every feature uses. Composes three action groups —
 * money (portfolios/transactions/categories), wealth records (assets,
 * liabilities, holdings, wallets, settlements), and planning (recurring,
 * goals, snapshots) — over one shared per-render context.
 */
export function useDomainActions() {
  const { state, dispatch } = useNuma();
  const cloud = useCloudState();
  const mutations = useCloudMutations();
  const queue = useWriteQueue();
  const cloudPortfolioIds = new Set(cloud.portfolios.map((p) => p.id));
  const isCloudPortfolio = (portfolioId: string | undefined) =>
    requirePortfolioWriteTarget({
      cloudEnabled: cloud.enabled,
      portfolioId,
      cloudPortfolioIds
    });

  const findPortfolioFor = <T extends { id: string; portfolioId: string }>(
    collection: T[],
    id: string
  ) => collection.find((item) => item.id === id)?.portfolioId;

  const ctx: DomainActionContext = {
    state,
    dispatch,
    cloud,
    mutations,
    queue,
    isCloudPortfolio,
    findPortfolioFor
  };

  return {
    ...createMoneyActions(ctx),
    ...createWealthRecordActions(ctx),
    ...createPlanActions(ctx)
  };
}
