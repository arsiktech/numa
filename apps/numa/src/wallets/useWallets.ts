import { useAction, useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useCallback } from 'react';

import { cloud } from '@/cloud/api';
import { newMutationId } from '@/data/cloud';

const EVM = /^0x[0-9a-fA-F]{40}$/;

/** What kind of public address this is, or a plain reason it can't be tracked. */
export function addressKind(raw: string): { type: 'bitcoin' | 'evm'; address: string } | { error: string } {
  const address = raw.trim();
  if (address.split(/\s+/).length >= 6) return { error: 'That looks like a recovery phrase. Never share it: Numa only needs the public address.' };
  if (EVM.test(address)) return { type: 'evm', address };
  if (/^bc1[02-9ac-hj-np-z]{11,87}$/i.test(address)) return { type: 'bitcoin', address };
  if (/^[13][1-9A-HJ-NP-Za-km-z]{25,34}$/.test(address)) return { error: 'Numa tracks Bitcoin addresses that start with bc1. Your wallet app can show one.' };
  return { error: 'Paste a Bitcoin address (bc1…) or an Ethereum-style address (0x…).' };
}

const ADD_ERRORS: Record<string, string> = {
  DUPLICATE_WALLET: 'This wallet is already tracked.',
  WALLET_LIMIT_REACHED: 'You can track up to 8 wallets in a space.',
  WALLET_SECRET_REJECTED: 'That looks like a private key or recovery phrase. Numa only needs the public address.',
  INVALID_WALLET_ADDRESS: 'That address isn’t valid. Check it and try again.',
  INVALID_WALLET_LABEL: 'Give the wallet a name of up to 48 characters.',
};

export function walletErrorText(e: unknown): string {
  const code = e instanceof ConvexError && e.data && typeof e.data === 'object' ? (e.data as { code?: string }).code : undefined;
  return (code && ADD_ERRORS[code]) || 'Couldn’t add the wallet. Check your connection and try again.';
}

export const refreshText: Record<'ok' | 'partial' | 'failed' | 'recent' | 'unsupported', string> = {
  ok: 'Balance updated',
  partial: 'Balance updated. Some networks couldn’t be checked.',
  failed: 'Couldn’t reach the explorers. Numa tries again every 30 minutes.',
  recent: 'Checked a moment ago',
  unsupported: 'Numa can’t check this kind of address yet.',
};

/** Add, remove and refresh tracked wallets. Adds and removes carry receipts. */
export function useWalletWrites() {
  const add = useMutation(cloud.addWallet);
  const remove = useMutation(cloud.removeWallet);
  const refresh = useAction(cloud.refreshWallet);
  return {
    add: useCallback(async (portfolioId: string, address: string, type: 'bitcoin' | 'evm', label: string) => {
      const r = await add({ portfolioId, address, addressType: type, label, includeInNetWorth: true, clientMutationId: newMutationId('numa.addWallet') });
      return typeof r === 'string' ? r : r.id;
    }, [add]),
    remove: useCallback(async (id: string) => { await remove({ id, clientMutationId: newMutationId('numa.removeWallet') }); }, [remove]),
    refresh: useCallback(async (walletId: string) => {
      try { return (await refresh({ walletId })).status; } catch { return 'failed' as const; }
    }, [refresh]),
  };
}
