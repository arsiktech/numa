type CloudAccountForStartup = {
  id: string;
  email: string | null;
  isCloud: boolean;
};

export function cloudSnapshotScopeForAccount(
  deployment: string,
  account: CloudAccountForStartup | null | undefined
) {
  if (!account?.isCloud) return null;
  const emailKey = account.email?.trim().toLowerCase();
  const accountKey = emailKey || (account.id !== "cloud-loading" ? account.id : null);
  return accountKey ? `${deployment}|${accountKey}` : null;
}

export function shouldShowCloudLoading(input: {
  isPodSurface: boolean;
  portfoliosReady: boolean;
  podsReady: boolean;
  cachedPodCount: number;
  cachedPodDataCount: number;
}) {
  if (input.isPodSurface) {
    return !input.podsReady && input.cachedPodCount === 0 && input.cachedPodDataCount === 0;
  }
  return !input.portfoliosReady || !input.podsReady;
}
