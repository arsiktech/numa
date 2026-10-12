import { v } from "convex/values";

export const cryptoWalletAddressTypeValidator = v.union(
  v.literal("evm"),
  v.literal("solana"),
  v.literal("bitcoin")
);

export const cryptoDefiPositionKindValidator = v.union(
  v.literal("supplied"),
  v.literal("staked"),
  v.literal("liquidity"),
  v.literal("borrowed"),
  v.literal("rewards"),
  v.literal("locked"),
  v.literal("other")
);

export const cryptoWalletTokenValidator = v.object({
  id: v.string(),
  chain: v.string(),
  chainName: v.string(),
  tokenAddress: v.optional(v.string()),
  symbol: v.string(),
  name: v.string(),
  quantity: v.string(),
  priceUsd: v.optional(v.number()),
  valueUsd: v.optional(v.number()),
  change24h: v.optional(v.number()),
  verified: v.boolean(),
  suspectedSpam: v.boolean(),
  representedInDefi: v.optional(v.boolean())
});

export const cryptoDefiPositionValidator = v.object({
  id: v.string(),
  chain: v.string(),
  chainName: v.string(),
  protocol: v.string(),
  label: v.string(),
  positionAddress: v.optional(v.string()),
  kind: cryptoDefiPositionKindValidator,
  valueUsd: v.optional(v.number()),
  assetValueUsd: v.number(),
  debtValueUsd: v.number(),
  apy: v.optional(v.number()),
  healthFactor: v.optional(v.number()),
  symbols: v.array(v.string())
});

export const cryptoWalletSnapshotValidator = v.object({
  // "public": keyless explorers (mempool.space, Blockscout) used by the rebuilt app.
  provider: v.union(v.literal("moralis"), v.literal("public")),
  addressType: cryptoWalletAddressTypeValidator,
  tokenValueUsd: v.number(),
  defiValueUsd: v.number(),
  debtValueUsd: v.number(),
  totalValueUsd: v.number(),
  tokens: v.array(cryptoWalletTokenValidator),
  defiPositions: v.array(cryptoDefiPositionValidator),
  chains: v.array(v.string()),
  failedChains: v.array(v.string()),
  tokenFailedChains: v.optional(v.array(v.string())),
  defiFailedChains: v.optional(v.array(v.string())),
  defiPositionKeys: v.optional(v.array(v.string())),
  tokensTruncated: v.optional(v.boolean()),
  defiPositionsTruncated: v.optional(v.boolean()),
  tokensFetchedAt: v.number(),
  defiFetchedAt: v.optional(v.number()),
  defiDisabled: v.optional(v.boolean()),
  updatedAt: v.number(),
  partial: v.boolean()
});
