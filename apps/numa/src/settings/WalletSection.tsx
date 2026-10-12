import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useCloudData } from '@/data/cloud';
import { walletDetail } from '@/data/wallets';
import { useTheme } from '@/theme/theme';
import { Field } from '@/ui/form';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';
import { addressKind, refreshText, useWalletWrites, walletErrorText } from '@/wallets/useWallets';
import { Action, Button, Section } from './rows';

/** Public wallets Numa reads balances for. Addresses only: never keys or recovery phrases. */
export function WalletSection() {
  const cloudData = useCloudData();
  const { c } = useTheme();
  const toast = useToast();
  const writes = useWalletWrites();
  const [adding, setAdding] = useState(false);
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (cloudData.status !== 'ready') return null;
  const wallets = cloudData.snapshot.wallets ?? [];
  const canEdit = cloudData.space.role !== 'viewer';

  async function add() {
    const kind = addressKind(address);
    if ('error' in kind) { setError(kind.error); return; }
    const name = label.trim() || (kind.type === 'bitcoin' ? 'Bitcoin wallet' : 'Ethereum wallet');
    setBusy(true); setError(null);
    try {
      const id = await writes.add(cloudData.status === 'ready' ? cloudData.portfolioId : '', kind.address, kind.type, name);
      setAdding(false); setAddress(''); setLabel('');
      toast({ text: `${name} added. Checking its balance…` });
      const status = await writes.refresh(id);
      toast({ text: status === 'ok' || status === 'partial' ? `${name}: ${refreshText[status].toLowerCase()}` : refreshText[status] });
    } catch (e) {
      setError(walletErrorText(e));
    } finally { setBusy(false); }
  }

  return (
    <>
      <Section title="WALLETS" />
      <Txt v="small" c="ink2" style={{ marginTop: 6 }}>Track a Bitcoin or Ethereum-style address. Numa reads public balances from mempool.space and Blockscout, and never asks for keys.</Txt>
      {wallets.map((w) => (
        <Pressable key={w.id} onPress={() => router.push({ pathname: '/item/[type]/[id]', params: { type: 'wallet', id: w.id } })} accessibilityRole="link" accessibilityLabel={`${w.label}, ${walletDetail(w)}. Open`}
          style={{ minHeight: 56, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.line }}>
          <View style={{ flex: 1 }}>
            <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }}>{w.label}</Txt>
            <Txt v="small" c="ink2">{walletDetail(w)}</Txt>
          </View>
          <Txt v="body" c="ink3">›</Txt>
        </Pressable>
      ))}
      {canEdit && !adding && <Action label="Track a wallet" detail="Paste its public address." onPress={() => { setAdding(true); setError(null); }} />}
      {adding && (
        <View style={{ marginTop: 12, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 12 }}>
          <Field label="Public address" value={address} onChangeText={(t) => { setAddress(t); setError(null); }} />
          <Field label="Wallet name" value={label} onChangeText={setLabel} />
          {error && <Txt v="small" style={{ color: c.down }} accessibilityRole="alert">{error}</Txt>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label={busy ? 'Adding…' : 'Track wallet'} onPress={add} disabled={busy || !address.trim()} />
            <Button label="Cancel" quiet onPress={() => { setAdding(false); setError(null); }} />
          </View>
        </View>
      )}
    </>
  );
}
