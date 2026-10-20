import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireEditor, requireMember } from "./lib/access";
import { withMutationReceipt } from "./lib/mutationReceipts";
import {
  cryptoWalletAddressTypeValidator,
  cryptoWalletSnapshotValidator
} from "./lib/cryptoValidators";
import { walletFreeTextLooksSecret } from "./lib/walletInputSafety";

declare const process: {
  env: Record<string, string | undefined>;
};

const MAX_WALLETS = 8;
const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

type CryptoAddressType = "evm" | "solana" | "bitcoin";

function base58DecodedLength(value: string) {
  if (!value || [...value].some((char) => !BASE58.includes(char))) return -1;
  const bytes = [0];
  for (const char of value) {
    let carry = BASE58.indexOf(char);
    for (let index = 0; index < bytes.length; index += 1) {
      carry += bytes[index] * 58;
      bytes[index] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  let leadingZeroes = 0;
  while (value[leadingZeroes] === "1") leadingZeroes += 1;
  const payloadLength = bytes.length === 1 && bytes[0] === 0 ? 0 : bytes.length;
  return leadingZeroes + payloadLength;
}

function bech32Polymod(values: number[]) {
  const generators = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let checksum = 1;
  for (const value of values) {
    const top = checksum >>> 25;
    checksum = ((checksum & 0x1ffffff) << 5) ^ value;
    for (let index = 0; index < 5; index += 1) {
      if ((top >>> index) & 1) checksum ^= generators[index];
    }
  }
  return checksum >>> 0;
}

function convertBits(values: number[], from: number, to: number) {
  let accumulator = 0;
  let bits = 0;
  const output: number[] = [];
  const maxValue = (1 << to) - 1;
  for (const value of values) {
    if (value < 0 || value >>> from !== 0) return null;
    accumulator = (accumulator << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      output.push((accumulator >>> bits) & maxValue);
    }
  }
  if (bits >= from || ((accumulator << (to - bits)) & maxValue) !== 0) return null;
  return output;
}

function isBitcoinMainnetAddress(value: string) {
  if (value.length < 14 || value.length > 90) return false;
  if (value !== value.toLowerCase() && value !== value.toUpperCase()) return false;
  const address = value.toLowerCase();
  if (!address.startsWith("bc1")) return false;
  const separator = address.lastIndexOf("1");
  const data = [...address.slice(separator + 1)].map((char) => BECH32.indexOf(char));
  if (data.length < 7 || data.some((item) => item < 0)) return false;
  const hrp = address.slice(0, separator);
  const expanded = [
    ...[...hrp].map((char) => char.charCodeAt(0) >>> 5),
    0,
    ...[...hrp].map((char) => char.charCodeAt(0) & 31),
    ...data
  ];
  const checksum = bech32Polymod(expanded);
  const witnessVersion = data[0];
  const program = convertBits(data.slice(1, -6), 5, 8);
  if (witnessVersion > 16 || !program || program.length < 2 || program.length > 40) return false;
  if (witnessVersion === 0) {
    return checksum === 1 && (program.length === 20 || program.length === 32);
  }
  return checksum === 0x2bc830a3;
}

function isSolanaAddress(value: string) {
  return value.length >= 32 && value.length <= 44 && base58DecodedLength(value) === 32;
}

function normalizedAddress(
  raw: string,
  expectedType?: CryptoAddressType
): { address: string; addressType: CryptoAddressType } {
  const address = raw.trim();
  if (walletFreeTextLooksSecret(address)) {
    throw new ConvexError({
      code: "WALLET_SECRET_REJECTED",
      message: "Only public wallet addresses are allowed"
    });
  }
  let addressType: CryptoAddressType | null = null;
  if (EVM_ADDRESS.test(address)) addressType = "evm";
  else if (isBitcoinMainnetAddress(address)) addressType = "bitcoin";
  else if (isSolanaAddress(address)) addressType = "solana";

  if (!addressType || (expectedType && addressType !== expectedType)) {
    throw new ConvexError({
      code: "INVALID_WALLET_ADDRESS",
      message: "Enter a public EVM, Solana, or Bitcoin bc1 mainnet address"
    });
  }
  return {
    address:
      addressType === "evm" || addressType === "bitcoin"
        ? address.toLowerCase()
        : address,
    addressType
  };
}

function normalizedLabel(raw: string) {
  const label = raw.trim();
  if (!label || label.length > 48) {
    throw new ConvexError({
      code: "INVALID_WALLET_LABEL",
      message: "Wallet label must be between 1 and 48 characters"
    });
  }
  if (walletFreeTextLooksSecret(label)) {
    throw new ConvexError({
      code: "WALLET_SECRET_REJECTED",
      message: "Recovery phrases and private keys are never accepted"
    });
  }
  return label;
}

function assertInternalCaller(secret: string | undefined) {
  const expected = process.env.NUMA_PUSH_INTERNAL_SECRET ?? "";
  if (!expected) {
    throw new ConvexError({
      code: "MISCONFIGURED",
      message: "NUMA_PUSH_INTERNAL_SECRET is not set on the Convex deployment"
    });
  }
  if (!secret || secret !== expected) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Bad internal secret" });
  }
}

function assertSnapshotIsBounded(snapshot: {
  tokens: Array<{
    id: string;
    chain: string;
    symbol: string;
    name: string;
    quantity: string;
    tokenAddress?: string;
  }>;
  defiPositions: Array<{
    id: string;
    chain: string;
    protocol: string;
    label: string;
    symbols: string[];
    positionAddress?: string;
  }>;
  chains: string[];
  failedChains: string[];
  tokenFailedChains?: string[];
  defiFailedChains?: string[];
  defiPositionKeys?: string[];
}) {
  if (snapshot.tokens.length > 160 || snapshot.defiPositions.length > 100) {
    throw new ConvexError({
      code: "SNAPSHOT_TOO_LARGE",
      message: "Crypto snapshot contains too many positions"
    });
  }
  const strings = [
    ...snapshot.tokens.flatMap((token) => [
      token.id,
      token.chain,
      token.symbol,
      token.name,
      token.quantity,
      token.tokenAddress ?? ""
    ]),
    ...snapshot.defiPositions.flatMap((position) => [
      position.id,
      position.chain,
      position.protocol,
      position.label,
      position.positionAddress ?? "",
      ...position.symbols
    ]),
    ...snapshot.chains,
    ...snapshot.failedChains,
    ...(snapshot.tokenFailedChains ?? []),
    ...(snapshot.defiFailedChains ?? []),
    ...(snapshot.defiPositionKeys ?? [])
  ];
  if (strings.some((value) => value.length > 180)) {
    throw new ConvexError({
      code: "SNAPSHOT_TOO_LARGE",
      message: "Crypto snapshot contains an oversized label"
    });
  }
  if (snapshot.defiPositions.some((position) => position.symbols.length > 16)) {
    throw new ConvexError({
      code: "SNAPSHOT_TOO_LARGE",
      message: "Crypto position contains too many token symbols"
    });
  }
  if ((snapshot.defiPositionKeys?.length ?? 0) > 500) {
    throw new ConvexError({
      code: "SNAPSHOT_TOO_LARGE",
      message: "Crypto snapshot contains too many reconciliation keys"
    });
  }
}

async function requireApiWalletAccess(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  walletId: Id<"cryptoWallets">
) {
  const wallet = await ctx.db.get(walletId);
  if (!wallet) {
    throw new ConvexError({ code: "NOT_FOUND", message: "Wallet not found" });
  }
  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .filter((q) => q.eq(q.field("portfolioId"), wallet.portfolioId))
    .unique();
  if (!membership) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Wallet is not accessible" });
  }
  if (membership.role === "viewer") {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: "Editor access is required to refresh wallet data"
    });
  }
  return wallet;
}

export const listForPortfolio = query({
  args: { portfolioId: v.id("portfolios") },
  handler: async (ctx, args) => {
    await requireMember(ctx, args.portfolioId);
    return await ctx.db
      .query("cryptoWallets")
      .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
      .collect();
  }
});

export const add = mutation({
  args: {
    portfolioId: v.id("portfolios"),
    address: v.string(),
    addressType: cryptoWalletAddressTypeValidator,
    label: v.string(),
    includeInNetWorth: v.boolean(),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const { userId } = await requireEditor(ctx, args.portfolioId);
    const address = normalizedAddress(args.address, args.addressType);
    const label = normalizedLabel(args.label);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "cryptoWallets.add",
      async () => {
        const duplicate = await ctx.db
          .query("cryptoWallets")
          .withIndex("by_portfolio_address", (q) =>
            q.eq("portfolioId", args.portfolioId).eq("address", address.address)
          )
          .unique();
        if (duplicate) {
          throw new ConvexError({
            code: "DUPLICATE_WALLET",
            message: `Already tracked as ${duplicate.label}`
          });
        }
        const wallets = await ctx.db
          .query("cryptoWallets")
          .withIndex("by_portfolio", (q) => q.eq("portfolioId", args.portfolioId))
          .take(MAX_WALLETS + 1);
        if (wallets.length >= MAX_WALLETS) {
          throw new ConvexError({
            code: "WALLET_LIMIT_REACHED",
            message: `Track up to ${MAX_WALLETS} wallets per portfolio`
          });
        }
        const now = Date.now();
        return await ctx.db.insert("cryptoWallets", {
          portfolioId: args.portfolioId,
          address: address.address,
          addressType: address.addressType,
          label,
          includeInNetWorth: args.includeInNetWorth,
          createdAt: now,
          updatedAt: now
        });
      }
    );
  }
});

export const update = mutation({
  args: {
    id: v.id("cryptoWallets"),
    patch: v.object({
      label: v.optional(v.string()),
      includeInNetWorth: v.optional(v.boolean())
    }),
    clientMutationId: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const wallet = await ctx.db.get(args.id);
    if (!wallet) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Wallet not found" });
    }
    const { userId } = await requireEditor(ctx, wallet.portfolioId);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "cryptoWallets.update",
      async () => {
        await ctx.db.patch(args.id, {
          label: args.patch.label === undefined
            ? wallet.label
            : normalizedLabel(args.patch.label),
          includeInNetWorth:
            args.patch.includeInNetWorth ?? wallet.includeInNetWorth,
          updatedAt: Date.now()
        });
        return args.id;
      }
    );
  }
});

export const remove = mutation({
  args: { id: v.id("cryptoWallets"), clientMutationId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const wallet = await ctx.db.get(args.id);
    if (!wallet) return;
    const { userId } = await requireEditor(ctx, wallet.portfolioId);
    return await withMutationReceipt(
      ctx,
      userId,
      args.clientMutationId,
      "cryptoWallets.remove",
      async () => {
        await ctx.db.delete(args.id);
        // Its earnings history goes with it.
        const readings = await ctx.db.query("defiReadings").withIndex("by_wallet_day", (q) => q.eq("walletId", args.id)).collect();
        for (const r of readings) await ctx.db.delete(r._id);
        return args.id;
      }
    );
  }
});

/** Server-to-server cache read for the authenticated Vercel API route. */
export const listForApi = query({
  args: {
    internalSecret: v.string(),
    userId: v.id("users"),
    walletIds: v.array(v.id("cryptoWallets"))
  },
  handler: async (ctx, args) => {
    assertInternalCaller(args.internalSecret);
    const ids = [...new Set(args.walletIds)].slice(0, MAX_WALLETS);
    const wallets = [];
    for (const walletId of ids) {
      wallets.push(await requireApiWalletAccess(ctx, args.userId, walletId));
    }
    return wallets;
  }
});

/** Atomically prevents two app surfaces from paying to refresh one wallet. */
export const claimRefreshForApi = mutation({
  args: {
    internalSecret: v.string(),
    userId: v.id("users"),
    walletId: v.id("cryptoWallets"),
    leaseId: v.string(),
    expectedWalletUpdatedAt: v.number(),
    now: v.number()
  },
  handler: async (ctx, args) => {
    assertInternalCaller(args.internalSecret);
    if (!args.leaseId || args.leaseId.length > 80) {
      throw new ConvexError({ code: "INVALID_LEASE", message: "Bad refresh lease" });
    }
    const wallet = await requireApiWalletAccess(ctx, args.userId, args.walletId);
    if (wallet.updatedAt !== args.expectedWalletUpdatedAt) return false;
    if (
      wallet.syncLeaseId &&
      wallet.syncLeaseUntil &&
      wallet.syncLeaseUntil > args.now
    ) {
      return false;
    }
    await ctx.db.patch(args.walletId, {
      syncLeaseId: args.leaseId,
      // Four token pages plus one DeFi page can legitimately use ~60s of
      // provider timeout budget. Leave headroom so another surface cannot
      // duplicate those paid calls while the first request is still alive.
      syncLeaseUntil: args.now + 90_000
    });
    return true;
  }
});

export const releaseRefreshForApi = mutation({
  args: {
    internalSecret: v.string(),
    userId: v.id("users"),
    walletId: v.id("cryptoWallets"),
    leaseId: v.string()
  },
  handler: async (ctx, args) => {
    assertInternalCaller(args.internalSecret);
    const wallet = await requireApiWalletAccess(ctx, args.userId, args.walletId);
    if (wallet.syncLeaseId !== args.leaseId) return false;
    await ctx.db.patch(args.walletId, {
      syncLeaseId: undefined,
      syncLeaseUntil: undefined
    });
    return true;
  }
});

/** Server-to-server last-good snapshot write. Browser callers cannot poison it. */
export const saveSnapshotForApi = mutation({
  args: {
    internalSecret: v.string(),
    userId: v.id("users"),
    walletId: v.id("cryptoWallets"),
    leaseId: v.string(),
    snapshot: cryptoWalletSnapshotValidator
  },
  handler: async (ctx, args) => {
    assertInternalCaller(args.internalSecret);
    assertSnapshotIsBounded(args.snapshot);
    const existing = await requireApiWalletAccess(ctx, args.userId, args.walletId);
    if (existing.syncLeaseId !== args.leaseId) {
      throw new ConvexError({ code: "LEASE_LOST", message: "Refresh lease expired" });
    }
    // A slower provider request must never overwrite a newer successful sync.
    if (
      existing.snapshot &&
      existing.snapshot.updatedAt > args.snapshot.updatedAt
    ) {
      await ctx.db.patch(args.walletId, {
        syncLeaseId: undefined,
        syncLeaseUntil: undefined
      });
      return args.walletId;
    }
    await ctx.db.patch(args.walletId, {
      snapshot: args.snapshot,
      syncLeaseId: undefined,
      syncLeaseUntil: undefined,
      updatedAt: Date.now()
    });
    return args.walletId;
  }
});
