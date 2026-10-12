export interface AsyncRequestScope {
  accountId: string;
  portfolioId: string;
  requestId: number;
  open: boolean;
}

export function isAsyncRequestScopeCurrent(
  current: AsyncRequestScope,
  expected: AsyncRequestScope
) {
  return current.open &&
    expected.open &&
    current.accountId === expected.accountId &&
    current.portfolioId === expected.portfolioId &&
    current.requestId === expected.requestId;
}
