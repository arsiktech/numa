import type { NumaState } from "@/lib/types";
import type { Action } from "./storeReducer";
import type { useCloudMutations, useCloudState } from "./cloudStore";
import type { useWriteQueue } from "./writeQueue";

/**
 * The per-render closure every useDomainActions action group is built on.
 * Groups are plain factories (not hooks): the hook owns the React bindings,
 * the groups own the write logic.
 */
export type DomainActionContext = {
  state: NumaState;
  dispatch: (action: Action) => void;
  cloud: ReturnType<typeof useCloudState>;
  mutations: ReturnType<typeof useCloudMutations>;
  queue: ReturnType<typeof useWriteQueue>;
  isCloudPortfolio: (portfolioId: string | undefined) => boolean;
  findPortfolioFor: <T extends { id: string; portfolioId: string }>(
    collection: T[],
    id: string
  ) => string | undefined;
};
