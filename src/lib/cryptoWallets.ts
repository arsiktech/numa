import type {
  CryptoDefiPosition,
  CryptoWallet,
  CryptoWalletAddressType,
  CryptoWalletSnapshot,
  CryptoWalletToken,
  CurrencyCode
} from "./types";
import { convertCurrency, type FxRates } from "./fx";
import { walletFreeTextLooksSecret } from "../../convex/lib/walletInputSafety";

export const MAX_TRACKED_CRYPTO_WALLETS = 8;
export const CRYPTO_TOKEN_CACHE_MS = 10 * 60 * 1000;
export const CRYPTO_DEFI_CACHE_MS = 6 * 60 * 60 * 1000;

const EVM_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BECH32 = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

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

export type CryptoWalletInputProblem =
  | "empty"
  | "suspected-secret"
  | "invalid";

export function detectCryptoWalletAddressType(
  input: string
): CryptoWalletAddressType | null {
  const address = input.trim();
  if (EVM_ADDRESS.test(address)) return "evm";
  if (isBitcoinMainnetAddress(address)) return "bitcoin";
  if (isSolanaAddress(address)) return "solana";
  return null;
}

export function cryptoWalletInputProblem(
  input: string
): CryptoWalletInputProblem | null {
  const value = input.trim();
  if (!value) return "empty";
  if (walletFreeTextLooksSecret(value)) return "suspected-secret";
  return detectCryptoWalletAddressType(value) ? null : "invalid";
}

export function cryptoWalletFreeTextProblem(input: string) {
  return walletFreeTextLooksSecret(input) ? "suspected-secret" as const : null;
}

export function normalizeCryptoWalletAddress(input: string) {
  const address = input.trim();
  const addressType = detectCryptoWalletAddressType(address);
  if (!addressType) return null;
  return {
    address:
      addressType === "evm" || addressType === "bitcoin"
        ? address.toLowerCase()
        : address,
    addressType
  };
}

export function shortCryptoAddress(address: string, head = 6, tail = 4) {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function cryptoWalletLabelForAi(wallet: Pick<
  CryptoWallet,
  "address" | "addressType" | "label"
>) {
  const fallback = wallet.addressType === "evm"
    ? "EVM wallet"
    : wallet.addressType === "solana"
      ? "Solana wallet"
      : "Bitcoin wallet";
  const label = wallet.label.trim();
  if (!label || cryptoWalletInputProblem(label) === "suspected-secret") return fallback;
  const sameAddress = wallet.addressType === "solana"
    ? label.includes(wallet.address)
    : label.toLowerCase().includes(wallet.address.toLowerCase());
  if (sameAddress) return fallback;
  const addressCandidates = label.match(
    /0x[a-fA-F0-9]{40}|bc1[ac-hj-np-zAC-HJ-NP-Z02-9]{11,87}|[1-9A-HJ-NP-Za-km-z]{32,44}/g
  ) ?? [];
  return addressCandidates.some((candidate) => detectCryptoWalletAddressType(candidate))
    ? fallback
    : label;
}

export function walletSnapshotIsFresh(
  snapshot: CryptoWalletSnapshot | undefined,
  now = Date.now()
) {
  if (!snapshot) return false;
  const tokensFresh = now - snapshot.tokensFetchedAt < CRYPTO_TOKEN_CACHE_MS;
  const defiFresh =
    snapshot.addressType === "bitcoin" ||
    snapshot.defiDisabled === true ||
    (snapshot.defiFetchedAt !== undefined &&
      now - snapshot.defiFetchedAt < CRYPTO_DEFI_CACHE_MS);
  return tokensFresh && defiFresh;
}

export interface CryptoPortfolioRollup {
  tokenValueUsd: number;
  defiValueUsd: number;
  debtValueUsd: number;
  totalValueUsd: number;
  includedValueUsd: number;
  includedDebtUsd: number;
  tokens: Array<CryptoWalletToken & { walletId: string; walletLabel: string }>;
  defiPositions: Array<
    CryptoDefiPosition & { walletId: string; walletLabel: string }
  >;
  chains: string[];
  updatedAt?: number;
  partial: boolean;
  stale: boolean;
}

export function rollupCryptoWallets(
  wallets: CryptoWallet[],
  now = Date.now()
): CryptoPortfolioRollup {
  const snapshots = wallets.flatMap((wallet) =>
    wallet.snapshot ? [{ wallet, snapshot: wallet.snapshot }] : []
  );
  const chains = new Set<string>();
  const tokens: CryptoPortfolioRollup["tokens"] = [];
  const defiPositions: CryptoPortfolioRollup["defiPositions"] = [];

  let tokenValueUsd = 0;
  let defiValueUsd = 0;
  let debtValueUsd = 0;
  let includedValueUsd = 0;
  let includedDebtUsd = 0;
  let partial = false;
  let stale = false;
  let updatedAt: number | undefined;

  for (const { wallet, snapshot } of snapshots) {
    tokenValueUsd += snapshot.tokenValueUsd;
    defiValueUsd += snapshot.defiValueUsd;
    debtValueUsd += snapshot.debtValueUsd;
    if (wallet.includeInNetWorth) {
      includedValueUsd += snapshot.tokenValueUsd + snapshot.defiValueUsd;
      includedDebtUsd += snapshot.debtValueUsd;
    }
    partial ||= snapshot.partial;
    stale ||= !walletSnapshotIsFresh(snapshot, now);
    updatedAt = updatedAt === undefined
      ? snapshot.updatedAt
      : Math.min(updatedAt, snapshot.updatedAt);
    snapshot.chains.forEach((chain) => chains.add(chain));
    tokens.push(
      ...snapshot.tokens.map((token) => ({
        ...token,
        walletId: wallet.id,
        walletLabel: wallet.label
      }))
    );
    defiPositions.push(
      ...snapshot.defiPositions.map((position) => ({
        ...position,
        walletId: wallet.id,
        walletLabel: wallet.label
      }))
    );
  }

  return {
    tokenValueUsd,
    defiValueUsd,
    debtValueUsd,
    totalValueUsd: tokenValueUsd + defiValueUsd - debtValueUsd,
    includedValueUsd,
    includedDebtUsd,
    tokens: tokens.sort((a, b) => (b.valueUsd ?? -Infinity) - (a.valueUsd ?? -Infinity)),
    defiPositions: defiPositions.sort(
      (a, b) => (b.valueUsd ?? -Infinity) - (a.valueUsd ?? -Infinity)
    ),
    chains: [...chains].sort(),
    updatedAt,
    partial,
    stale: stale || snapshots.length < wallets.length
  };
}

export function relativeCryptoUpdateTime(
  updatedAt: number | undefined,
  now = Date.now()
) {
  if (!updatedAt) return "Not synced";
  const minutes = Math.max(0, Math.floor((now - updatedAt) / 60_000));
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days}d ago`;
}

export function cryptoCapitalAmounts(
  wallets: CryptoWallet[],
  rates: FxRates,
  currency: CurrencyCode
) {
  const rollup = rollupCryptoWallets(wallets);
  const assets = convertCurrency(rollup.includedValueUsd, "USD", currency, rates);
  const debts = convertCurrency(rollup.includedDebtUsd, "USD", currency, rates);
  return { assets, debts, net: assets - debts };
}
