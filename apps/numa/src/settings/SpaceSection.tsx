import { useMutation } from 'convex/react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { cloud, type CloudCurrency, type CloudSpace } from '@/cloud/api';
import { newMutationId, useCloudData } from '@/data/cloud';
import { useTheme } from '@/theme/theme';
import { Field, Seg } from '@/ui/form';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';
import { Action, Button, Row, Section } from './rows';

const kindWord = (s: CloudSpace) => (s.spaceKind === 'business' ? 'Business' : s.spaceKind === 'legacy_shared' ? 'Shared' : 'Personal');

/** Which space Numa shows, its currency, and making a new one. */
export function SpaceSection() {
  const cloudData = useCloudData();
  const { c } = useTheme();
  const toast = useToast();
  const updatePortfolio = useMutation(cloud.updatePortfolio);
  const createSpace = useMutation(cloud.createSpace);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'personal' | 'business'>('business');
  const [currency, setCurrency] = useState<CloudCurrency>('EUR');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (cloudData.status !== 'ready') return null;
  const { spaces, space, selectSpace } = cloudData;
  const owner = space.role === 'owner';

  async function setSpaceCurrency(next: CloudCurrency) {
    if (next === space.defaultCurrency) return;
    const before = space.defaultCurrency;
    const write = (to: CloudCurrency) => updatePortfolio({ id: space.id, patch: { defaultCurrency: to }, clientMutationId: newMutationId('numa.updatePortfolio') });
    try {
      await write(next);
      toast({ text: `Totals now in ${next}`, action: { label: 'Undo', onPress: async () => { await write(before); } } });
    } catch { toast({ text: 'Couldn’t change the currency. Try again.' }); }
  }

  async function create() {
    const clean = name.trim();
    if (!clean) { setError('Give the space a name.'); return; }
    setBusy(true); setError(null);
    try {
      const { id } = await createSpace({ name: clean, spaceKind: kind, currency, clientMutationId: newMutationId('numa.createSpace') });
      selectSpace(id);
      setAdding(false); setName('');
      toast({ text: `Now showing ${clean}` });
    } catch (e) {
      setError(e instanceof Error && /1–80 characters/.test(e.message) ? 'Use a name up to 80 characters.' : 'Couldn’t create the space. Try again.');
    } finally { setBusy(false); }
  }

  return (
    <>
      <Section title="SPACE" />
      <View accessibilityRole="radiogroup" accessibilityLabel="Space">
        {spaces.map((s) => {
          const on = s.id === space.id;
          return (
            <Pressable key={s.id} onPress={() => { if (!on) { selectSpace(s.id); toast({ text: `Now showing ${s.name}` }); } }} accessibilityRole="radio" aria-checked={on} accessibilityLabel={`${s.name}, ${kindWord(s)}, ${s.defaultCurrency}`}
              style={{ minHeight: 56, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? c.ink : c.line2, alignItems: 'center', justifyContent: 'center' }}>
                {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.ink }} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }}>{s.name}</Txt>
                <Txt v="small" c="ink2">{kindWord(s)} · {s.defaultCurrency}{s.role !== 'owner' ? ' · shared with you' : ''}</Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
      {adding ? (
        <View style={{ paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <Field label="Space name" value={name} onChangeText={setName} />
          <Seg label="Kind" options={[['business', 'Business'], ['personal', 'Personal']]} value={kind} onChange={setKind} />
          <Seg label="New space currency" options={[["EUR", "EUR"], ["USD", "USD"]]} value={currency} onChange={setCurrency} />
          <Txt v="small" c="ink2">A new space starts empty. Nothing is moved or copied from {space.name}.</Txt>
          {error ? <Txt v="small" style={{ color: c.down }} accessibilityLiveRegion="polite">{error}</Txt> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label={busy ? 'Creating…' : 'Create space'} onPress={create} disabled={busy} />
            <Button label="Cancel" quiet onPress={() => { setAdding(false); setError(null); }} />
          </View>
        </View>
      ) : (
        <Action label="New space" detail="Keep a company or a side project apart from your own money." onPress={() => setAdding(true)} />
      )}
      <Row title="Currency" detail={owner ? `Totals in ${space.name} are shown in this currency. Each record keeps its own.` : `Totals are in ${space.defaultCurrency}. Only the owner can change it.`}>
        {owner ? <Seg label="Currency" options={[['EUR', 'EUR'], ['USD', 'USD']]} value={space.defaultCurrency} onChange={setSpaceCurrency} /> : null}
      </Row>
    </>
  );
}
