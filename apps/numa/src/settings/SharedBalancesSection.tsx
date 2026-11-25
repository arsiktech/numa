import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { cloud, type CloudAsset, type CloudLiability } from '@/cloud/api';
import { useCloudData } from '@/data/cloud';
import { ago } from '@/domain/freshness';
import { formatMoney } from '@/domain/money';
import { useTheme } from '@/theme/theme';
import { Field } from '@/ui/form';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';
import { Button, Row, Section } from './rows';
import { linkState, sharedCounterparties, sharedLinkError, type SharedRecord } from './sharedBalances';

const asRecord = (row: CloudAsset | CloudLiability): SharedRecord => row;

type LinkRow = { id: string; householdId: string; status: 'ok' | 'stale' | null; checkedAt: number | null; readingAt: number | null };

/** The settings block, given data it does not fetch. */
export function SharedBalancesBody({
  links, assets, liabilities, now, canEdit, busy, error, confirming,
  householdId, appKey, onHousehold, onKey, onConnect, onSync, onArm, onDisconnect, onKeep,
}: {
  links: LinkRow[];
  assets: SharedRecord[];
  liabilities: SharedRecord[];
  now: number;
  canEdit: boolean;
  busy: boolean;
  error: string | null;
  confirming: string | null;
  householdId: string;
  appKey: string;
  onHousehold: (value: string) => void;
  onKey: (value: string) => void;
  onConnect: () => void;
  onSync: (id: string) => void;
  onArm: (id: string) => void;
  onDisconnect: (id: string) => void;
  onKeep: () => void;
}) {
  const { c } = useTheme();
  return (
    <>
      <Section title="SHARED BALANCES" />
      {links.map((link) => {
        const people = sharedCounterparties(link.householdId, assets, liabilities);
        const state = linkState(link.status, people);
        const when = link.readingAt ?? link.checkedAt;
        return (
          <View key={link.id}>
            <Row title={link.householdId} detail={state === 'stale' ? 'Stale' : state === 'synced' ? 'Synced' : 'Waiting'} />
            {people.map((person) => (
              <Row key={person.unitId} title={person.name} detail={`${person.side === 'liability' ? 'Owed' : 'Owed to you'} · ${formatMoney(Math.round(person.balance * 100), person.currency, { cents: true })}${person.stale ? ' · Stale' : ''}`} />
            ))}
            <Row title="Last sync" detail={when ? ago(when, now) : 'Not yet'} />
            {canEdit && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 48, borderBottomWidth: 1, borderBottomColor: c.line }}>
                <Pressable onPress={() => onSync(link.id)} disabled={busy} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Sync now</Txt>
                </Pressable>
                {confirming === link.id ? (
                  <>
                    <Pressable onPress={() => onDisconnect(link.id)} disabled={busy} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                      <Txt v="body" style={{ fontFamily: 'Manrope_700Bold', color: c.down }}>Disconnect</Txt>
                    </Pressable>
                    <Pressable onPress={onKeep} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
                      <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Keep</Txt>
                    </Pressable>
                  </>
                ) : (
                  <Pressable onPress={() => onArm(link.id)} accessibilityRole="button" accessibilityLabel={`Disconnect ${link.householdId}`} style={{ minHeight: 44, justifyContent: 'center' }}>
                    <Txt v="body" style={{ fontFamily: 'Manrope_700Bold', color: c.down }}>Disconnect</Txt>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        );
      })}
      {canEdit && (
        <View style={{ paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <Field label="Household id" value={householdId} onChangeText={onHousehold} />
          <Field label="Pro app key" kind="secret" value={appKey} onChangeText={onKey} />
          {error ? <Txt v="small" style={{ color: c.down }} accessibilityLiveRegion="polite">{error}</Txt> : null}
          <View style={{ flexDirection: 'row' }}>
            <Button label={busy ? 'Connecting…' : 'Connect'} onPress={onConnect} disabled={busy || !householdId.trim() || !appKey.trim()} />
          </View>
        </View>
      )}
    </>
  );
}

/** Household balances copied with the Pro app key. The key is stored and never shown again. */
export function SharedBalancesSection() {
  const cloudData = useCloudData();
  const portfolioId = cloudData.status === 'ready' ? cloudData.portfolioId : null;
  const links = useQuery(cloud.sharedLinks, portfolioId ? { portfolioId } : 'skip');
  const connect = useMutation(cloud.connectShared);
  const syncNow = useMutation(cloud.syncShared);
  const disconnect = useMutation(cloud.disconnectShared);
  const toast = useToast();
  const [householdId, setHouseholdId] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  if (cloudData.status !== 'ready' || links === undefined) return null;
  const canEdit = cloudData.space.role !== 'viewer';
  const assets = cloudData.snapshot.assets.map(asRecord);
  const liabilities = cloudData.snapshot.liabilities.map(asRecord);
  if (!canEdit && links.length === 0) return null;

  async function save() {
    if (!portfolioId) return;
    setBusy(true); setError(null);
    try {
      await connect({ portfolioId, householdId: householdId.trim(), token: key.trim() });
      setHouseholdId('');
      setKey('');
      toast({ text: 'Connected. The first reading comes in a moment.' });
    } catch (e) {
      setError(sharedLinkError(e));
    } finally { setBusy(false); }
  }

  async function sync(id: string) {
    setBusy(true);
    try { await syncNow({ id }); toast({ text: 'Reading now.' }); }
    catch { toast({ text: 'Couldn’t read. Try again.' }); }
    finally { setBusy(false); }
  }

  async function remove(id: string) {
    setBusy(true);
    try { await disconnect({ id }); setConfirming(null); toast({ text: 'Disconnected.' }); }
    catch { toast({ text: 'Couldn’t disconnect. Try again.' }); }
    finally { setBusy(false); }
  }

  return (
    <SharedBalancesBody
      links={links} assets={assets} liabilities={liabilities} now={cloudData.now} canEdit={canEdit}
      busy={busy} error={error} confirming={confirming} householdId={householdId} appKey={key}
      onHousehold={setHouseholdId} onKey={setKey} onConnect={save} onSync={sync} onArm={setConfirming}
      onDisconnect={remove} onKeep={() => setConfirming(null)}
    />
  );
}
