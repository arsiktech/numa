import { createElement, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, TextInput, View } from 'react-native';

import { bindUndo, plan, type Op } from '@/ask/plan';
import { useSession } from '@/cloud/session';
import { useCloudData } from '@/data/cloud';
import { useWriter } from '@/data/writes';
import { formatMoney } from '@/domain/money';
import { parseTable } from '@/sources/csv';
import { previewImport, type ImportRow } from '@/sources/importRows';
import { useTheme } from '@/theme/theme';
import { Screen } from '@/ui/Screen';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

const KIND_WORDS = { transactions: 'transactions', balances: 'accounts and debts', holdings: 'holdings' } as const;

function describe(r: ImportRow): { title: string; amount: string } {
  const d = r.draft!;
  const m = (cents: number) => formatMoney(cents, d.currency, { cents: cents % 100 !== 0 });
  switch (d.type) {
    case 'transaction': return { title: d.description, amount: (d.kind === 'income' ? '+' : '−') + m(d.amountCents) };
    case 'asset': return { title: `${d.name}${d.existing ? ' (update)' : ''}`, amount: m(d.amountCents) };
    case 'debt': return { title: `${d.name}${d.existing ? ' (update)' : ''} · owed`, amount: m(d.amountCents) };
    case 'holding': return { title: `${d.quantity} ${d.symbol}${d.existing ? ' (update)' : ''}`, amount: d.priceCents === null ? 'cost kept' : m(Math.round(d.priceCents * d.quantity)) };
  }
}

export default function ImportScreen() {
  if (useSession().kind !== 'signedIn') return <Screen><Txt v="body" c="ink2" style={{ marginTop: 20 }}>Sign in to import your own data.</Txt></Screen>;
  return <Importer />;
}

function Importer() {
  const { c } = useTheme();
  const cloud = useCloudData();
  const run = useWriter();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ imported: number; failed: number[]; undo: Op[] } | null>(null);
  const [undone, setUndone] = useState(false);

  const preview = useMemo(() => {
    if (cloud.status !== 'ready' || !text.trim()) return null;
    const s = cloud.snapshot;
    return previewImport(parseTable(text), { currency: cloud.data.currency, now: new Date(cloud.now), categories: s.categories, assets: s.assets, liabilities: s.liabilities, holdings: s.holdings, existingTx: s.transactions });
  }, [cloud, text]);
  if (cloud.status !== 'ready') return <Screen><ActivityIndicator style={{ marginTop: 60 }} accessibilityLabel="Loading" /></Screen>;

  const ready = preview?.rows.filter((r) => r.draft && !r.problem && !r.duplicate) ?? [];
  const dupes = preview?.rows.filter((r) => r.duplicate).length ?? 0;
  const bad = preview?.rows.filter((r) => !r.draft || r.problem) ?? [];

  async function importAll() {
    if (cloud.status !== 'ready') return;
    setBusy({ done: 0, total: ready.length });
    const undo: Op[] = [];
    const failed: number[] = [];
    for (const [i, r] of ready.entries()) {
      const p = plan(r.draft!, cloud.portfolioId, cloud.fx, Date.now());
      if ('error' in p) { failed.push(r.line); continue; }
      try { const id = await run(p.apply); undo.push(bindUndo(p.undo, id)); }
      catch { failed.push(r.line); }
      setBusy({ done: i + 1, total: ready.length });
    }
    setBusy(null);
    setResult({ imported: undo.length, failed, undo });
    setText('');
    toast({ text: `Imported ${undo.length}`, action: { label: 'Undo', onPress: () => undoAll(undo) } });
  }

  async function undoAll(ops: Op[]) {
    let left = 0;
    for (const op of [...ops].reverse()) { try { await run(op); } catch { left += 1; } }
    setUndone(true);
    toast({ text: left ? `Undone, except ${left} that changed since` : 'Import undone' });
  }

  return (
    <Screen>
      <Txt v="title" accessibilityRole="header" style={{ marginTop: 6 }}>Import</Txt>
      <Txt v="body" c="ink2" style={{ marginTop: 6 }}>Copy cells from Google Sheets, header row included, or paste a CSV from your bank or broker. Numa reads transactions, accounts and debts, or holdings, and shows everything before it saves.</Txt>

      <TextInput value={text} onChangeText={(t) => { setText(t); setResult(null); setUndone(false); }} multiline placeholder={'Date,Description,Amount\n2026-10-03,October rent,-1200'} placeholderTextColor={c.ink3} accessibilityLabel="Pasted table"
        style={{ marginTop: 16, minHeight: 150, maxHeight: 280, borderRadius: 14, padding: 14, backgroundColor: c.s1, color: c.ink, fontFamily: 'JetBrainsMono_400Regular', fontSize: 13, textAlignVertical: 'top', ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }} />
      {Platform.OS === 'web' && createElement('input', {
        type: 'file', accept: '.csv,.tsv,.txt,text/csv', 'aria-label': 'Choose a CSV file',
        style: { marginTop: 10, color: c.ink2, fontFamily: 'Manrope_500Medium' },
        onChange: (e: { target: { files?: FileList | null } }) => { const f = e.target.files?.[0]; if (f) void f.text().then((t) => { setText(t); setResult(null); setUndone(false); }); },
      })}

      {preview && !preview.kind && <Txt v="body" style={{ color: c.warn, marginTop: 14 }}>Numa can’t tell what this table is. Include the header row, with columns like Date, Description and Amount, or Name and Value, or Symbol and Quantity.</Txt>}

      {preview?.kind && (
        <View style={{ marginTop: 18 }}>
          <Txt v="section">{ready.length} {KIND_WORDS[preview.kind]} ready</Txt>
          <Txt v="body" c="ink2" style={{ marginTop: 2 }}>
            {[dupes ? `${dupes} already in Numa, skipped` : '', bad.length ? `${bad.length} can’t be read` : ''].filter(Boolean).join(' · ') || 'Everything reads cleanly.'}
          </Txt>
          {bad.slice(0, 5).map((r) => <Txt key={r.line} v="small" c="warn" style={{ marginTop: 2 }}>Row {r.line}: {r.problem ?? 'Can’t read this row'}</Txt>)}
          <View style={{ marginTop: 10 }}>
            {ready.slice(0, 50).map((r, i) => {
              const d = describe(r);
              return (
                <View key={r.line} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i === Math.min(ready.length, 50) - 1 ? 0 : 1, borderBottomColor: c.line }}>
                  <Txt v="body" numberOfLines={1} style={{ flex: 1 }}>{d.title}</Txt>
                  <Txt v="figureSm" style={{ fontSize: 14 }}>{d.amount}</Txt>
                </View>
              );
            })}
            {ready.length > 50 && <Txt v="small" c="ink3" style={{ marginTop: 6 }}>and {ready.length - 50} more</Txt>}
          </View>
          <Pressable onPress={importAll} disabled={!ready.length || !!busy} accessibilityRole="button" accessibilityState={{ disabled: !ready.length || !!busy, busy: !!busy }}
            style={{ marginTop: 16, minHeight: 48, paddingHorizontal: 22, borderRadius: 999, alignSelf: 'flex-start', backgroundColor: c.ink, justifyContent: 'center', opacity: ready.length ? 1 : 0.4 }}>
            <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>{busy ? `Importing ${busy.done} of ${busy.total}…` : `Import ${ready.length}`}</Txt>
          </Pressable>
        </View>
      )}

      {result && (
        <View style={{ marginTop: 20, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 6 }}>
          <Txt v="cardTitle">{undone ? 'Import undone' : `Imported ${result.imported}`}</Txt>
          {result.failed.length > 0 && <Txt v="body" c="warn">Rows {result.failed.join(', ')} didn’t save. Check them and paste them again.</Txt>}
          {!undone && result.undo.length > 0 && (
            <Pressable onPress={() => undoAll(result.undo)} accessibilityRole="button" style={{ minHeight: 40, alignSelf: 'flex-start', justifyContent: 'center' }}>
              <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Undo this import</Txt>
            </Pressable>
          )}
        </View>
      )}
    </Screen>
  );
}
