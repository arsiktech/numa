import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import type { CloudWallet } from '@/cloud/api';
import { useCloudData } from '@/data/cloud';
import { convertCents } from '@/data/fx';
import { groupNames, type Item } from '@/data/items';
import { walletSource } from '@/data/wallets';
import { ago } from '@/domain/freshness';
import { useTheme } from '@/theme/theme';
import { toneColor } from '@/ui/ItemRow';
import { useMoney } from '@/ui/money';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';
import { refreshText, useWalletWrites } from './useWallets';

function Fact({ label, value }: { label: string; value: string }) {
  const { c } = useTheme();
  return (
    <View style={{ minHeight: 48, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.line, gap: 12 }}>
      <Txt v="body" c="ink2">{label}</Txt>
      <Txt v="body" style={{ fontSize: 14, flexShrink: 1, textAlign: 'right' }}>{value}</Txt>
    </View>
  );
}

/** A tracked wallet: what's in it, where the numbers come from, and Refresh or Remove. */
export function WalletDetail({ item, now, editable }: { item: Item; now: number; editable: boolean }) {
  const { c } = useTheme();
  const { money, mask } = useMoney();
  const cloud = useCloudData();
  const toast = useToast();
  const writes = useWalletWrites();
  const [busy, setBusy] = useState<'refresh' | 'remove' | null>(null);
  const [confirming, setConfirming] = useState(false);
  const w = item.raw as CloudWallet;
  const fx = cloud.status === 'ready' ? cloud.fx : null;
  const currency = cloud.status === 'ready' ? cloud.data.currency : 'EUR';
  const tokens = (w.snapshot?.tokens ?? []).filter((t) => Number(t.quantity) > 0);

  async function refresh() {
    setBusy('refresh');
    toast({ text: refreshText[await writes.refresh(w.id)] });
    setBusy(null);
  }

  async function remove() {
    if (cloud.status !== 'ready') return;
    const portfolioId = cloud.portfolioId;
    setBusy('remove');
    try {
      await writes.remove(w.id);
      router.back();
      toast({ text: `${w.label} removed`, action: { label: 'Undo', onPress: async () => {
        try { const id = await writes.add(portfolioId, w.address, w.addressType === 'bitcoin' ? 'bitcoin' : 'evm', w.label); void writes.refresh(id); }
        catch { toast({ text: 'Couldn’t undo that.' }); }
      } } });
    } catch {
      setBusy(null); setConfirming(false);
      toast({ text: 'Couldn’t remove the wallet. Try again.' });
    }
  }

  return (
    <View>
      <Txt v="small" c="ink3" style={{ marginTop: 6 }}>{groupNames.crypto.toUpperCase()} · WALLET</Txt>
      <Txt v="title" accessibilityRole="header" style={{ marginTop: 4 }}>{item.name}</Txt>
      <Txt v="figure" style={{ marginTop: 10, fontSize: 34, lineHeight: 40 }}>{item.valueCents === null ? '—' : money(item.valueCents, { cents: true })}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c[toneColor[item.freshness.tone]] }} />
        <Txt v="body" c="ink2">{item.freshness.text}</Txt>
      </View>

      <View style={{ marginTop: 18 }}>
        <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.line, gap: 4 }}>
          <Txt v="body" c="ink2">Address</Txt>
          {/* Long addresses wrap anywhere, so the whole address stays readable and copyable. */}
          <Txt v="figureSm" selectable style={{ fontSize: 14, lineHeight: 20, wordBreak: 'break-all' } as never}>{w.address}</Txt>
        </View>
        <Fact label="Balances from" value={walletSource(w)} />
        {w.snapshot && <Fact label="Checked" value={`${ago(w.snapshot.updatedAt, now)}${w.snapshot.failedChains.length ? ` · ${w.snapshot.failedChains.length} not reachable` : ''}`} />}
      </View>

      {tokens.length > 0 && <Txt v="label" c="ink3" style={{ marginTop: 24 }}>IN THIS WALLET</Txt>}
      {tokens.map((t) => {
        const cents = t.valueUsd === undefined ? null : convertCents(Math.round(t.valueUsd * 100), 'USD', currency, fx);
        return (
          <View key={t.id} style={{ minHeight: 52, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: c.line, gap: 12 }}>
            <View style={{ flexShrink: 1 }}>
              <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }}>{mask(t.quantity)} {t.symbol}</Txt>
              <Txt v="small" c="ink3">{t.name === t.chainName ? t.chainName : `${t.name} · ${t.chainName}`}</Txt>
            </View>
            <Txt v="figureSm" style={{ fontSize: 14 }}>{cents === null ? 'No price' : money(cents)}</Txt>
          </View>
        );
      })}
      {w.snapshot && !tokens.length && <Txt v="body" c="ink2" style={{ marginTop: 18 }}>This address is empty on the networks Numa checked.</Txt>}

      {editable && (confirming ? (
        <View style={{ marginTop: 22, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 10 }}>
          <Txt v="cardTitle">Stop tracking this wallet?</Txt>
          <Txt v="body" c="ink2">It leaves your totals now. The wallet itself isn’t touched.</Txt>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Pressable onPress={remove} disabled={busy !== null} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: 999, backgroundColor: c.down, justifyContent: 'center' }}>
              {busy === 'remove' ? <ActivityIndicator color="#FFFFFF" /> : <Txt v="body" style={{ color: '#FFFFFF', fontFamily: 'Manrope_700Bold' }}>Remove</Txt>}
            </Pressable>
            <Pressable onPress={() => setConfirming(false)} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}>
              <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Cancel</Txt>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={{ marginTop: 22, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
          <Pressable onPress={refresh} disabled={busy !== null} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: c.ink, justifyContent: 'center' }}>
            {busy === 'refresh' ? <ActivityIndicator color={c.bg} /> : <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>Refresh</Txt>}
          </Pressable>
          <Pressable onPress={() => setConfirming(true)} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}>
            <Txt v="body" style={{ fontFamily: 'Manrope_700Bold', color: c.down }}>Stop tracking</Txt>
          </Pressable>
        </View>
      ))}
    </View>
  );
}
