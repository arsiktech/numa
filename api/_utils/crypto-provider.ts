import type {
  CryptoDefiPosition,
  CryptoDefiPositionKind,
  CryptoWalletAddressType,
  CryptoWalletSnapshot,
  CryptoWalletToken
} from "../../src/lib/types.js";

const MORALIS_BASE_URL = "https://api.moralis.com/v1";
const MAX_TOKEN_PAGES = 4;
// One DeFi page is one 5,000-CU paid call. Cap at 100 positions so the
// deployment-wide wallet budget remains a real worst-case spend ceiling.
const MAX_DEFI_PAGES = 1;
const MAX_STORED_TOKENS = 160;
const MAX_STORED_DEFI_POSITIONS = 100;

export class CryptoProviderError extends Error {
  constructor(
    message: string,
    readonly status = 502
  ) {
    super(message);
  }
}

interface MoralisPage {
  result?: unknown;
  cursor?: unknown;
  meta?: unknown;
  addressType?: unknown;
  address_type?: unknown;
}

interface NormalizedDefiPage {
  positions: CryptoDefiPosition[];
  failedChains: string[];
  truncated: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown, fallback = "", max = 120) {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, max) || fallback;
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function decimal(value: unknown): string {
  const raw = typeof value === "string"
    ? value.trim()
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : "";
  if (!raw || raw.length > 120) return "0";
  return /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(raw) ? raw : "0";
}

function boolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function chainLabel(chain: string) {
  const known: Record<string, string> = {
    "0x1": "Ethereum",
    eth: "Ethereum",
    ethereum: "Ethereum",
    "0x89": "Polygon",
    polygon: "Polygon",
    "0xa4b1": "Arbitrum",
    arbitrum: "Arbitrum",
    "0xa": "Optimism",
    optimism: "Optimism",
    "0x2105": "Base",
    base: "Base",
    "solana-mainnet": "Solana",
    solana: "Solana",
    bitcoin: "Bitcoin"
  };
  return known[chain.toLowerCase()] ?? chain
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function metaFailedChains(page: MoralisPage) {
  const meta = record(page.meta);
  return [
    ...array(meta.failedChains),
    ...array(meta.failed_chains),
    ...array(meta.unsupportedChains),
    ...array(meta.unsupported_chains)
  ].flatMap((value) => typeof value === "string" ? [value.slice(0, 80)] : []);
}

function stableKey(parts: Array<string | undefined | null>) {
  return parts.filter(Boolean).join("|").slice(0, 180);
}

export function normalizeMoralisTokenPages(
  pages: MoralisPage[],
  walletAddress: string,
  addressType: CryptoWalletAddressType
) {
  const byId = new Map<string, CryptoWalletToken>();
  const failedChains = new Set<string>();
  for (const page of pages) {
    metaFailedChains(page).forEach((chain) => failedChains.add(chain));
    for (const raw of array(page.result)) {
      const row = record(raw);
      const chain = text(row.chainId ?? row.chain_id, addressType, 80);
      const nativeToken = boolean(row.nativeToken ?? row.native_token);
      const tokenAddress = text(
        row.tokenAddress ?? row.token_address,
        nativeToken ? "native" : "",
        100
      );
      const derivedAddress = text(row.derivedAddress ?? row.derived_address, "", 100);
      const symbol = text(row.symbol, "?", 28);
      const name = text(row.name, symbol === "?" ? "Unknown asset" : symbol, 80);
      const quantity = decimal(row.balance_formatted ?? row.balance);
      const priceUsd = numeric(row.usdPrice ?? row.usd_price);
      const valueUsd = numeric(row.usdValue ?? row.usd_value);
      const change24h = numeric(
        row.usdPrice24hrPercentChange ?? row.usd_price_24hr_percent_change
      );
      const suspectedSpam = boolean(row.possibleSpam ?? row.possible_spam);
      const verified = boolean(row.verifiedContract ?? row.verified_contract);
      const id = stableKey([
        addressType,
        walletAddress,
        chain,
        tokenAddress,
        derivedAddress
      ]);
      if (!id) continue;
      byId.set(id, {
        id,
        chain,
        chainName: chainLabel(chain),
        tokenAddress: tokenAddress || undefined,
        symbol,
        name,
        quantity,
        priceUsd,
        valueUsd,
        change24h,
        verified,
        suspectedSpam
      });
    }
  }
  const sortedTokens = [...byId.values()]
    .sort((a, b) => {
      if (a.suspectedSpam !== b.suspectedSpam) return a.suspectedSpam ? 1 : -1;
      return (b.valueUsd ?? -Infinity) - (a.valueUsd ?? -Infinity);
    });
  return {
    tokens: sortedTokens,
    failedChains: [...failedChains],
    truncated: sortedTokens.length > MAX_STORED_TOKENS
  };
}

function defiKind(label: string, tokenTypes: string[], isDebt: boolean): CryptoDefiPositionKind {
  const value = `${label} ${tokenTypes.join(" ")}`.toLowerCase();
  if (isDebt || /borrow|debt|loan/.test(value)) return "borrowed";
  if (/liquid|pool|lp|farm/.test(value)) return "liquidity";
  if (/stake|validator/.test(value)) return "staked";
  if (/reward|claim|unclaimed/.test(value)) return "rewards";
  if (/lock|vesting/.test(value)) return "locked";
  if (/supply|lend|deposit/.test(value)) return "supplied";
  return "other";
}

export function normalizeMoralisDefiPages(
  pages: MoralisPage[],
  walletAddress: string
): NormalizedDefiPage {
  const byId = new Map<string, CryptoDefiPosition>();
  const failedChains = new Set<string>();
  for (const page of pages) {
    metaFailedChains(page).forEach((chain) => failedChains.add(chain));
    for (const raw of array(page.result)) {
      const row = record(raw);
      const position = record(row.position);
      const details = record(position.details);
      const lending = record(details.lending);
      const tokens = array(position.tokens).map(record);
      const chain = text(row.chainId ?? row.chain_id, "unknown", 80);
      const protocolId = text(row.protocolId ?? row.protocol_id, "unknown", 80);
      const protocol = text(
        row.protocolName ?? row.protocol_name,
        protocolId === "unknown" ? "Unknown protocol" : protocolId,
        80
      );
      const label = text(position.label ?? details.type, "DeFi position", 80);
      const tokenTypes = tokens.map((token) =>
        text(token.tokenType ?? token.token_type, "", 40)
      );
      const symbols = [...new Set(tokens.flatMap((token) => {
        const symbol = text(token.symbol, "", 28);
        return symbol ? [symbol] : [];
      }))].slice(0, 16);
      const tokenAddresses = [...new Set(tokens.flatMap((token) => {
        const address = text(
          token.address ?? token.tokenAddress ?? token.token_address ?? token.contractAddress ?? token.contract_address,
          "",
          100
        );
        return address ? [address] : [];
      }))].sort();
      const isDebt = boolean(details.isDebt ?? details.is_debt) ||
        tokenTypes.some((type) => /borrow|debt|loan/i.test(type));
      const kind = defiKind(label, tokenTypes, isDebt);
      const tokenValues = tokens.flatMap((token) => {
        const value = numeric(token.usdValue ?? token.usd_value);
        return value === undefined ? [] : [Math.abs(value)];
      });
      const tokenValue = tokenValues.reduce((sum, value) => sum + value, 0);
      const balanceUsd = numeric(position.balanceUsd ?? position.balance_usd);
      const unclaimedUsd = numeric(position.unclaimedUsd ?? position.unclaimed_usd) ?? 0;
      const positionValue = Math.abs(balanceUsd ?? tokenValue);
      const rewardValue = Math.max(0, unclaimedUsd);
      const debtValueUsd = isDebt ? positionValue : 0;
      const assetValueUsd = isDebt ? rewardValue : positionValue + rewardValue;
      const positionAddress = text(position.address, "", 100);
      const poolAddress = text(
        record(details.liquidity).poolAddress ?? record(details.liquidity).pool_address,
        "",
        100
      );
      const id = stableKey([
        walletAddress,
        chain,
        protocolId,
        kind,
        positionAddress,
        poolAddress,
        tokenAddresses.join(","),
        label,
        symbols.join(",")
      ]);
      if (!id) continue;
      byId.set(id, {
        id,
        chain,
        chainName: chainLabel(chain),
        protocol,
        label,
        positionAddress: positionAddress || undefined,
        kind,
        valueUsd: assetValueUsd - debtValueUsd,
        assetValueUsd,
        debtValueUsd,
        apy: numeric(details.apy ?? position.apy),
        healthFactor: numeric(lending.healthFactor ?? lending.health_factor),
        symbols
      });
    }
  }
  const sortedPositions = [...byId.values()]
    .sort((a, b) => (b.valueUsd ?? -Infinity) - (a.valueUsd ?? -Infinity));
  return {
    positions: sortedPositions,
    failedChains: [...failedChains],
    truncated: sortedPositions.length > MAX_STORED_DEFI_POSITIONS
  };
}

function positionKey(chain: string, address: string) {
  const caseSensitive = chain.toLowerCase().includes("sol");
  return `${chain.toLowerCase()}|${caseSensitive ? address : address.toLowerCase()}`;
}

/**
 * Receipt and LP tokens can be returned by both wallet balances and DeFi.
 * Exact position-address matches are counted in DeFi only; underlying assets
 * are deliberately not symbol-matched because the wallet may hold them too.
 */
export function reconcileMoralisTokenBalances(
  tokens: CryptoWalletToken[],
  positions: CryptoDefiPosition[],
  extraPositionKeys: string[] = []
) {
  const positionAddresses = new Set(
    [
      ...extraPositionKeys,
      ...positions.flatMap((position) =>
        position.positionAddress
          ? [positionKey(position.chain, position.positionAddress)]
          : []
      )
    ]
  );
  return tokens.map((token) => ({
    ...token,
    representedInDefi:
      Boolean(token.tokenAddress) &&
      token.tokenAddress !== "native" &&
      positionAddresses.has(positionKey(token.chain, token.tokenAddress!))
  }));
}

function boundedDefiPositions(positions: CryptoDefiPosition[]) {
  const debts = positions
    .filter((position) => position.debtValueUsd > 0)
    .sort((a, b) => b.debtValueUsd - a.debtValueUsd);
  const assets = positions.filter((position) => position.debtValueUsd <= 0);
  const debtRows = debts.slice(0, MAX_STORED_DEFI_POSITIONS);
  const assetSlots = Math.max(0, MAX_STORED_DEFI_POSITIONS - debtRows.length);
  return [...assets.slice(0, assetSlots), ...debtRows];
}

async function fetchMoralisPages(
  path: string,
  apiKey: string,
  maxPages: number
) {
  const pages: MoralisPage[] = [];
  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
    const url = new URL(`${MORALIS_BASE_URL}${path}`);
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, {
      headers: { "X-Api-Key": apiKey },
      signal: AbortSignal.timeout(12_000)
    });
    if (!response.ok) {
      throw new CryptoProviderError(
        response.status === 401 || response.status === 403
          ? "Crypto data provider credentials were rejected."
          : response.status === 429
            ? "Crypto data provider is rate limited."
            : `Crypto data provider returned ${response.status}.`,
        response.status === 429 ? 429 : 502
      );
    }
    const payload = await response.json() as MoralisPage;
    pages.push(payload);
    cursor = text(payload.cursor, "", 400) || null;
    if (!cursor) break;
  }
  return { pages, hasMore: Boolean(cursor) };
}

function chainQuery(addressType: CryptoWalletAddressType) {
  if (addressType === "solana") return "solana-mainnet";
  if (addressType === "bitcoin") return "bitcoin";
  return "mainnets";
}

async function fetchTokens(
  address: string,
  addressType: CryptoWalletAddressType,
  apiKey: string
) {
  // Moralis infers Solana and Bitcoin from the public key/address. Its
  // `chains` filter is for choosing EVM networks and rejects non-EVM values.
  const chainFilter = addressType === "evm" ? "chains=mainnets&" : "";
  const { pages, hasMore } = await fetchMoralisPages(
    `/wallets/${encodeURIComponent(address)}/tokens?${chainFilter}limit=1000`,
    apiKey,
    MAX_TOKEN_PAGES
  );
  const normalized = normalizeMoralisTokenPages(pages, address, addressType);
  return { ...normalized, truncated: normalized.truncated || hasMore };
}

async function fetchDefi(
  address: string,
  addressType: Exclude<CryptoWalletAddressType, "bitcoin">,
  apiKey: string
) {
  const chains = encodeURIComponent(chainQuery(addressType));
  const { pages, hasMore } = await fetchMoralisPages(
    `/wallets/${encodeURIComponent(address)}/defi/positions?chains=${chains}&limit=100`,
    apiKey,
    MAX_DEFI_PAGES
  );
  const normalized = normalizeMoralisDefiPages(pages, address);
  return { ...normalized, truncated: normalized.truncated || hasMore };
}

export async function refreshMoralisWallet(options: {
  address: string;
  addressType: CryptoWalletAddressType;
  apiKey: string;
  cached?: CryptoWalletSnapshot;
  refreshTokens: boolean;
  refreshDefi: boolean;
  /** Produce a complete token-only snapshot because DeFi is disabled by policy. */
  defiDisabled?: boolean;
  authorizeDefi?: () => Promise<boolean>;
  now?: number;
}): Promise<CryptoWalletSnapshot> {
  const now = options.now ?? Date.now();
  const tokenResult = options.refreshTokens
    ? await fetchTokens(options.address, options.addressType, options.apiKey)
        .then((value) => ({ ok: true as const, value }))
        .catch((error: unknown) => ({ ok: false as const, error }))
    : null;
  const tokenAttemptPartial = Boolean(
    tokenResult?.ok && tokenResult.value.failedChains.length > 0
  );
  const acceptTokenResult = Boolean(
    tokenResult?.ok && (!tokenAttemptPartial || !options.cached?.tokensFetchedAt)
  );
  // A DeFi call costs far more than a token call. When both sources are due,
  // only spend that budget after the token result is good enough to keep.
  const canAttemptDefi = options.addressType !== "bitcoin" &&
    options.refreshDefi &&
    (!options.refreshTokens || acceptTokenResult);
  const defiAuthorized = canAttemptDefi
    ? await (options.authorizeDefi?.() ?? Promise.resolve(true))
    : false;
  const defiResult = canAttemptDefi && defiAuthorized
    ? await fetchDefi(options.address, options.addressType, options.apiKey)
        .then((value) => ({ ok: true as const, value }))
        .catch((error: unknown) => ({ ok: false as const, error }))
    : null;

  const defiAttemptPartial = Boolean(
    defiResult?.ok && defiResult.value.failedChains.length > 0
  );
  const acceptDefiCandidate = Boolean(
    defiResult?.ok && (!defiAttemptPartial || !options.cached?.defiFetchedAt)
  );
  // If this refresh asked for both sources and token coverage regressed, keep
  // the whole prior pair. That avoids mixing a new DeFi total with an older,
  // bounded token display list and silently changing net worth.
  const acceptDefiResult = acceptDefiCandidate && !(
    options.refreshTokens && options.cached && !acceptTokenResult
  );

  const defiDisabled = options.addressType !== "bitcoin" && options.defiDisabled === true;
  const allDefiPositions = defiDisabled
    ? []
    : acceptDefiResult && defiResult?.ok
      ? defiResult.value.positions
      : options.cached?.defiPositions ?? [];
  const defiPositionKeys = defiDisabled
    ? []
    : acceptDefiResult
      ? [...new Set(allDefiPositions.flatMap((position) =>
          position.positionAddress
            ? [positionKey(position.chain, position.positionAddress)]
            : []
        ))].slice(0, 500)
      : options.cached?.defiPositionKeys ?? allDefiPositions.flatMap((position) =>
          position.positionAddress
            ? [positionKey(position.chain, position.positionAddress)]
            : []
        );
  const rawTokens = acceptTokenResult && tokenResult?.ok
    ? tokenResult.value.tokens
    : options.cached?.tokens ?? [];
  const shouldReconcileTokens = acceptTokenResult || acceptDefiResult;
  const allTokens = shouldReconcileTokens
    ? reconcileMoralisTokenBalances(rawTokens, allDefiPositions, defiPositionKeys)
    : rawTokens;
  const tokens = allTokens.slice(0, MAX_STORED_TOKENS);
  const defiPositions = boundedDefiPositions(allDefiPositions);
  const tokensFetchedAt = acceptTokenResult
    ? now
    : options.cached?.tokensFetchedAt;
  const defiFetchedAt = options.addressType === "bitcoin"
    ? undefined
    : acceptDefiResult
      ? now
      : options.cached?.defiFetchedAt;

  if (tokensFetchedAt === undefined) {
    const error = tokenResult && !tokenResult.ok ? tokenResult.error : undefined;
    throw error instanceof Error
      ? error
      : new CryptoProviderError("Wallet balances could not be read.");
  }
  if (
    options.addressType !== "bitcoin" &&
    defiFetchedAt === undefined &&
    options.refreshDefi &&
    defiResult && !defiResult.ok &&
    tokens.length === 0
  ) {
    const error = defiResult.error;
    throw error instanceof Error
      ? error
      : new CryptoProviderError("DeFi positions could not be read.");
  }

  const tokenFailedChains = tokenResult?.ok
    ? tokenResult.value.failedChains
    : options.cached?.tokenFailedChains ?? options.cached?.failedChains ?? [];
  const defiFailedChains = options.addressType === "bitcoin"
    ? []
    : defiResult?.ok
      ? defiResult.value.failedChains
      : options.cached?.defiFailedChains ?? options.cached?.failedChains ?? [];
  const failedChains = new Set([...tokenFailedChains, ...defiFailedChains]);
  const providerFailed = Boolean(
    (tokenResult && !tokenResult.ok) || (defiResult && !defiResult.ok)
  );
  const anyProviderSuccess = acceptTokenResult || acceptDefiResult;
  const tokenValueUsd = acceptTokenResult
    ? allTokens
        .filter((token) => !token.suspectedSpam && !token.representedInDefi)
        .reduce((sum, token) => sum + Math.max(0, token.valueUsd ?? 0), 0)
    : acceptDefiResult && options.cached
      ? Math.max(
          0,
          allTokens.reduce((total, token) => {
            const previous = rawTokens.find((candidate) => candidate.id === token.id);
            const wasCounted = previous && !previous.suspectedSpam && !previous.representedInDefi;
            const isCounted = !token.suspectedSpam && !token.representedInDefi;
            if (wasCounted === isCounted) return total;
            const value = Math.max(0, token.valueUsd ?? 0);
            return total + (isCounted ? value : -value);
          }, options.cached.tokenValueUsd)
        )
      : options.cached?.tokenValueUsd ?? 0;
  const defiValueUsd = defiDisabled
    ? 0
    : acceptDefiResult
      ? allDefiPositions.reduce(
          (sum, position) => sum + Math.max(0, position.assetValueUsd),
          0
        )
      : options.cached?.defiValueUsd ?? 0;
  const debtValueUsd = defiDisabled
    ? 0
    : acceptDefiResult
      ? allDefiPositions.reduce(
          (sum, position) => sum + Math.max(0, position.debtValueUsd),
          0
        )
      : options.cached?.debtValueUsd ?? 0;
  const chains = new Set<string>();
  allTokens.forEach((token) => chains.add(token.chainName));
  allDefiPositions.forEach((position) => chains.add(position.chainName));
  const reconciliationUncertain = shouldReconcileTokens &&
    allTokens.some((token) => !token.suspectedSpam && (token.valueUsd ?? 0) > 0) &&
    allDefiPositions.some(
      (position) => position.assetValueUsd > 0 && !position.positionAddress
    );
  const tokensTruncated = acceptTokenResult && tokenResult?.ok
    ? tokenResult.value.truncated
    : options.cached?.tokensTruncated ?? false;
  const defiPositionsTruncated = acceptDefiResult && defiResult?.ok
    ? defiResult.value.truncated
    : options.cached?.defiPositionsTruncated ?? false;

  return {
    provider: "moralis",
    addressType: options.addressType,
    tokenValueUsd,
    defiValueUsd,
    debtValueUsd,
    totalValueUsd: tokenValueUsd + defiValueUsd - debtValueUsd,
    tokens,
    defiPositions,
    chains: [...chains].sort(),
    failedChains: [...failedChains].sort(),
    tokenFailedChains: [...new Set(tokenFailedChains)].sort(),
    defiFailedChains: [...new Set(defiFailedChains)].sort(),
    defiPositionKeys,
    tokensTruncated,
    defiPositionsTruncated,
    tokensFetchedAt,
    defiFetchedAt,
    defiDisabled,
    updatedAt: anyProviderSuccess ? now : options.cached?.updatedAt ?? now,
    partial:
      providerFailed ||
      failedChains.size > 0 ||
      tokensTruncated ||
      defiPositionsTruncated ||
      reconciliationUncertain ||
      (options.addressType !== "bitcoin" && !defiDisabled && defiFetchedAt === undefined)
  };
}
