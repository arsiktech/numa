type Call = { operation: string; args: unknown[] };
export const calls: Call[] = [];
export const controls = { failNext: false, queued: false, includePod: false, holdNext: false };
let releasePending: (() => void) | undefined;
export function finishPendingSave() { releasePending?.(); releasePending = undefined; }
export const useCurrentPortfolioId = () => ["fictional"];
export const usePortfolio = () => ({ id: "fictional", name: "Personal", defaultCurrency: "EUR" });
export const useCurrentUser = () => ({ id: "fictional-person", email: "fixture@example.invalid" });
export const useCategories = () => [{ id: "food", portfolioId: "fictional", name: "Food", kind: "expense", color: "mint", icon: "utensils", sortOrder: 0 }, { id: "salary", portfolioId: "fictional", name: "Salary", kind: "income", color: "mint", icon: "landmark", sortOrder: 1 }];
export const useAssets = () => [{ id: "cash", name: "Everyday account", kind: "cash", currency: "EUR" }];
export const useMoneyPods = () => controls.includePod ? [{ id: "shared", name: "Weekend trip", currency: "USD" }] : [];
export const usePodMembers = () => [{ id: "alex", displayName: "Alex", linkedUserId: "fictional-person" }, { id: "sam", displayName: "Sam" }];
export const useAppMode = () => ["advanced"];
export const makeClientMutationId = () => crypto.randomUUID();
async function capture(operation: string, args: unknown[]) {
  calls.push({ operation, args });
  if (controls.holdNext) {
    controls.holdNext = false;
    await new Promise<void>(resolve => { releasePending = resolve; });
  } else await new Promise(resolve => setTimeout(resolve, 250));
  if (controls.failNext) { controls.failNext = false; throw new Error("Connection interrupted. Try again."); }
  return { id: "fictional-record", queued: controls.queued };
}
export const useDomainActions = () => ({
  createHolding: (...args: unknown[]) => capture("holding", args),
  updateHolding: (...args: unknown[]) => capture("holding.update", args),
  createSnapshot: (...args: unknown[]) => capture("snapshot", args),
  createTransaction: (...args: unknown[]) => capture("transaction", args)
});
export const usePodActions = () => ({ addPodExpense: (...args: unknown[]) => capture("pod.expense", args) });
