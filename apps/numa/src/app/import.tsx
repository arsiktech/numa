import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { bindUndo, CREATED, plan, type Op } from '@/ask/plan';
import { useSession } from '@/cloud/session';
import { useCloudData } from '@/data/cloud';
import { useWriter } from '@/data/writes';
import { formatMoney } from '@/domain/money';
import { parseTable } from '@/sources/csv';
import { ImportKinds, ImportSources, type Loaded } from '@/sources/ImportSources';
import { previewImport, type ImportRow } from '@/sources/importRows';
import { dayKeyOf, isWealthLog, linesOf, readWealthLog, todayFromLatest, type LogRow } from '@/sources/wealthLog';
import type { CloudWealthSnapshot } from '@/cloud/api';
import { shortDay } from '@/domain/freshness';
import { useTheme } from '@/theme/theme';
import { Screen } from '@/ui/Screen';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

const KIND_WORDS = { transactions: 'transactions', balances: 'accounts and debts', holdings: 'holdings' } as const;

function describe(r: Pick<ImportRow, 'draft'>): { title: string; amount: string } {
  const d = r.draft!;
  const m = (cents: number) => formatMoney(cents, d.currency, { cents: cents % 100 !== 0 });
  switch (d.type) {
    case 'transaction': return { title: d.description, amount: (d.kind === 'income' ? '+' : '−') + m(d.amountCents) };
    case 'asset': return { title: `${d.name}${d.existing ? ' (update)' : ''}`, amount: m(d.amountCents) };
    case 'debt': return { title: `${d.name}${d.existing ? ' (update)' : ''}${/\b(owed|borrowed)$/i.test(d.name) ? '' : ' · owed'}`, amount: m(d.amountCents) };
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
  const [loaded, setLoaded] = useState<(Loaded & { tab: number }) | null>(null);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ imported: number; failed: number[]; undo: Op[] } | null>(null);
  const [undone, setUndone] = useState(false);

  const table = useMemo(() => (text.trim() ? parseTable(text) : []), [text]);
  const log = useMemo(() => {
    if (cloud.status !== 'ready' || !isWealthLog(table)) return null;
    const read = readWealthLog(table, { currency: cloud.data.currency, existingDays: cloud.snapshot.wealthSnapshots.map((w) => w.takenAt) });
    const s = cloud.snapshot;
    // Dates this wealth log saved before, without what was in them, get their details filled in.
    const byDay = new Map(s.wealthSnapshots.map((w) => [dayKeyOf(w.takenAt), w]));
    const filled = new Set<string>();
    const fill = read.rows.flatMap((r) => {
      const w = r.duplicate && !r.problem && r.takenAt !== null ? byDay.get(dayKeyOf(r.takenAt)) : undefined;
      if (!w?.id || w.label !== 'Wealth log' || w.lines?.length || w.currency !== r.currency || !r.positions.length || filled.has(w.id)) return [];
      filled.add(w.id);
      return [{ row: r, saved: w as CloudWealthSnapshot & { id: string } }];
    });
    return { ...read, fill, today: read.latest ? todayFromLatest(read.latest, { currency: cloud.data.currency, assets: s.assets, liabilities: s.liabilities }) : null };
  }, [cloud, table]);
  const preview = useMemo(() => {
    if (cloud.status !== 'ready' || !table.length || log) return null;
    const s = cloud.snapshot;
    return previewImport(table, { currency: cloud.data.currency, now: new Date(cloud.now), categories: s.categories, assets: s.assets, liabilities: s.liabilities, holdings: s.holdings, existingTx: s.transactions });
  }, [cloud, table, log]);
  if (cloud.status !== 'ready') return <Screen><ActivityIndicator style={{ marginTop: 60 }} accessibilityLabel="Loading" /></Screen>;

  const fresh = () => { setResult(null); setUndone(false); };
  /** Opens the first tab Numa understands: a wealth log, or a table whose columns it recognises. */
  function load(next: Loaded) {
    const s = cloud.status === 'ready' ? cloud.snapshot : null;
    const known = next.tabs.findIndex((t) => {
      const tbl = parseTable(t.csv);
      if (isWealthLog(tbl)) return true;
      return !!s && !!previewImport(tbl, { currency: 'EUR', now: new Date(), categories: s.categories, assets: s.assets, liabilities: s.liabilities, holdings: s.holdings, existingTx: s.transactions }).kind;
    });
    const tab = known < 0 ? 0 : known;
    setLoaded({ ...next, tab });
    setText(next.tabs[tab].csv);
    fresh();
  }
  function showTab(tab: number) {
    if (!loaded) return;
    setLoaded({ ...loaded, tab });
    setText(loaded.tabs[tab].csv);
    fresh();
  }
  function startOver() { setLoaded(null); setText(''); fresh(); }

  const ready = preview?.rows.filter((r) => r.draft && !r.problem && !r.duplicate) ?? [];
  const dupes = preview?.rows.filter((r) => r.duplicate).length ?? 0;
  const bad = preview?.rows.filter((r) => !r.draft || r.problem) ?? [];

  /** Runs each planned write with its own receipt, collecting what Undo needs. */
  async function runAll(items: { line: number; apply: Op; undo: Op }[], failedBefore: number[] = [], clear = true) {
    setBusy({ done: 0, total: items.length });
    const undo: Op[] = [];
    const failed = [...failedBefore];
    for (const [i, it] of items.entries()) {
      try { const id = await run(it.apply); undo.push(bindUndo(it.undo, id)); }
      catch { failed.push(it.line); }
      setBusy({ done: i + 1, total: items.length });
    }
    setBusy(null);
    setResult({ imported: undo.length, failed, undo });
    if (clear) { setText(''); setLoaded(null); }
    toast({ text: `Imported ${undo.length}`, action: { label: 'Undo', onPress: () => undoAll(undo) } });
  }

  async function importAll() {
    if (cloud.status !== 'ready') return;
    const items: { line: number; apply: Op; undo: Op }[] = [];
    const failed: number[] = [];
    for (const r of ready) {
      const p = plan(r.draft!, cloud.portfolioId, cloud.fx, Date.now());
      if ('error' in p) failed.push(r.line); else items.push({ line: r.line, ...p });
    }
    await runAll(items, failed);
  }

  async function importHistory(rows: LogRow[], fill: LogView['fill']) {
    if (cloud.status !== 'ready') return;
    const portfolioId = cloud.portfolioId;
    const major = (cents: number) => cents / 100;
    const split = (r: LogRow) => ({ netWorth: major(r.netCents), liquid: major(r.liquidCents), invested: major(r.investedCents), hardAssets: major(r.hardCents), liabilities: major(r.oweCents) });
    // A date keeps up to 80 positions; a wider row still saves its totals.
    const lines = (r: LogRow) => (r.positions.length <= 80 ? linesOf(r) : []);
    await runAll([
      ...rows.map((r) => ({
        line: r.line,
        apply: { fn: 'addSnapshot', args: { portfolioId, takenAt: r.takenAt!, ...split(r), currency: r.currency, label: 'Wealth log', isAuto: false, lines: lines(r) } } as Op,
        undo: { fn: 'removeSnapshot', args: { id: CREATED } } as Op,
      })),
      ...fill.filter(({ row }) => lines(row).length).map(({ row, saved }) => ({
        line: row.line,
        apply: { fn: 'updateSnapshot', args: { id: saved.id, patch: { ...split(row), lines: lines(row) } } } as Op,
        undo: { fn: 'updateSnapshot', args: { id: saved.id, patch: { netWorth: saved.netWorth, liquid: saved.liquid ?? 0, invested: saved.invested ?? 0, hardAssets: saved.hardAssets ?? 0, liabilities: saved.liabilities ?? 0, lines: [] } } } as Op,
      })),
    ], [], false);
  }

  async function setUpToday(drafts: NonNullable<NonNullable<typeof log>['today']>['drafts']) {
    if (cloud.status !== 'ready') return;
    const items: { line: number; apply: Op; undo: Op }[] = [];
    drafts.forEach((d, i) => {
      const p = plan(d, cloud.portfolioId, cloud.fx, Date.now());
      if (!('error' in p)) items.push({ line: i + 1, ...p });
    });
    await runAll(items);
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
      <Txt v="body" c="ink2" style={{ marginTop: 6 }}>Bring the numbers you already keep. Nothing is saved until you confirm.</Txt>

      {loaded ? (
        <View style={{ marginTop: 18, padding: 14, borderRadius: 18, backgroundColor: c.s1, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Txt v="small" c="ink3">Reading</Txt>
              <Txt v="body" numberOfLines={1} style={{ fontFamily: 'Manrope_700Bold' }}>{loaded.label}{loaded.tabs.length > 1 ? ` · ${loaded.tabs[loaded.tab].name}` : ''}</Txt>
            </View>
            <Pressable onPress={startOver} accessibilityRole="button" hitSlop={8} style={{ minHeight: 40, justifyContent: 'center' }}>
              <Txt v="small" style={{ fontFamily: 'Manrope_700Bold' }}>Start over</Txt>
            </Pressable>
          </View>
          {loaded.tabs.length > 1 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }} accessibilityRole="tablist">
              {loaded.tabs.map((t, i) => (
                <Pressable key={`${t.name}-${i}`} onPress={() => showTab(i)} accessibilityRole="tab" aria-selected={i === loaded.tab}
                  style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: i === loaded.tab ? c.ink : c.s2 }}>
                  <Txt v="small" c={i === loaded.tab ? 'bg' : 'ink2'} style={{ fontFamily: 'Manrope_700Bold' }}>{t.name}</Txt>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      ) : (
        <ImportSources onLoaded={load} pasteText={text} onPaste={(t) => { setText(t); fresh(); }} />
      )}

      {!text.trim() && !result && <ImportKinds />}

      {log && <WealthLogPreview log={log} now={cloud.now} busy={busy} onHistory={importHistory} onToday={setUpToday} />}

      {preview && !preview.kind && <Txt v="body" style={{ color: c.warn, marginTop: 14 }}>Numa can’t tell what this table is. It needs the header row, with columns like Date, Description and Amount, or Name and Value, or Symbol and Quantity.{loaded && loaded.tabs.length > 1 ? ' Try another tab above.' : ''}</Txt>}

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
          <Pressable onPress={importAll} disabled={!ready.length || !!busy} accessibilityRole="button" aria-disabled={!ready.length || !!busy} aria-busy={!!busy}
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

type LogView = ReturnType<typeof readWealthLog> & { today: ReturnType<typeof todayFromLatest> | null; fill: { row: LogRow; saved: CloudWealthSnapshot & { id: string } }[] };

/** A dated wealth log: its history as net-worth points, and today's accounts and debts from the latest row. */
function WealthLogPreview({ log, now, busy, onHistory, onToday }: { log: LogView; now: number; busy: { done: number; total: number } | null; onHistory: (rows: LogRow[], fill: LogView['fill']) => void; onToday: (drafts: NonNullable<LogView['today']>['drafts']) => void }) {
  const { c } = useTheme();
  const ready = log.rows.filter((r) => !r.problem && !r.duplicate);
  const dupes = log.rows.filter((r) => r.duplicate).length;
  const bad = log.rows.filter((r) => r.problem);
  const m = (cents: number, cur: LogRow['currency']) => formatMoney(cents, cur);
  const first = ready[0]?.takenAt, last = ready[ready.length - 1]?.takenAt;
  const button = (label: string, onPress: () => void, disabled: boolean) => (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" aria-disabled={disabled} aria-busy={!!busy}
      style={{ marginTop: 16, minHeight: 48, paddingHorizontal: 22, borderRadius: 999, alignSelf: 'flex-start', backgroundColor: c.ink, justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>{busy ? `Importing ${busy.done} of ${busy.total}…` : label}</Txt>
    </Pressable>
  );
  return (
    <View style={{ marginTop: 18 }}>
      <Txt v="section">Net-worth history · {ready.length} {ready.length === 1 ? 'date' : 'dates'}</Txt>
      <Txt v="body" c="ink2" style={{ marginTop: 2 }}>
        {first && last ? `From ${shortDay(first, now)} to ${shortDay(last, now)}. Each date becomes a point on your chart, with what you owned and owed kept apart.` : 'No dates can be read yet.'}
        {dupes ? ` ${dupes} already in Numa${log.fill.length ? `; what was in ${log.fill.length === dupes ? 'them' : log.fill.length} gets filled in` : ', skipped'}.` : ''}
      </Txt>
      {bad.slice(0, 5).map((r) => <Txt key={r.line} v="small" c="warn" style={{ marginTop: 2 }}>Row {r.line}: {r.problem}</Txt>)}
      <View style={{ marginTop: 10 }}>
        {ready.map((r, i) => (
          <View key={r.line} style={{ minHeight: 48, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i === ready.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
            <View style={{ flex: 1 }}>
              <Txt v="body">{shortDay(r.takenAt!, now)}</Txt>
              <Txt v="small" c="ink3">own {m(r.liquidCents + r.investedCents + r.hardCents, r.currency)} · owe {m(r.oweCents, r.currency)}</Txt>
            </View>
            <Txt v="figureSm" style={{ fontSize: 14 }}>{m(r.netCents, r.currency)}</Txt>
          </View>
        ))}
      </View>
      {button(historyLabel(ready.length, log.fill.length), () => onHistory(ready, log.fill), (!ready.length && !log.fill.length) || !!busy)}

      {log.today && log.latest && (
        <View style={{ marginTop: 28 }}>
          <Txt v="section">Today, from {shortDay(log.latest.takenAt, now)}</Txt>
          <Txt v="body" c="ink2" style={{ marginTop: 2 }}>Sets up your accounts and debts from the latest row, so Home and Ask start from your real numbers. Negative values become debts.</Txt>
          <View style={{ marginTop: 10 }}>
            {log.today.drafts.map((d, i) => {
              const x = describe({ draft: d });
              return (
                <View key={`${d.type}-${d.name}`} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i === log.today!.drafts.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                  <Txt v="body" numberOfLines={1} style={{ flex: 1 }}>{x.title}</Txt>
                  <Txt v="figureSm" style={{ fontSize: 14 }}>{x.amount}</Txt>
                </View>
              );
            })}
          </View>
          {log.today.needQuantity.length > 0 && (
            <Txt v="small" c="ink2" style={{ marginTop: 10 }}>
              Not set up yet, because they need how many you hold so their value follows the price: {log.today.needQuantity.map((p) => `${p.name} ${formatMoney(p.cents, log.rows[0]?.currency ?? 'EUR')}`).join(', ')}. Add them in Ask, like “I own 0.5 BTC”, or track a wallet in Settings.
            </Txt>
          )}
          {button(`Set up ${log.today.drafts.length} ${log.today.drafts.length === 1 ? 'entry' : 'entries'}`, () => onToday(log.today!.drafts), !log.today.drafts.length || !!busy)}
        </View>
      )}
    </View>
  );
}

const dates = (n: number) => `${n} ${n === 1 ? 'date' : 'dates'}`;
/** "Import 3 dates", "Add details to 16 dates", or both. */
function historyLabel(fresh: number, fill: number) {
  if (!fill) return `Import ${dates(fresh)}`;
  if (!fresh) return `Add details to ${dates(fill)}`;
  return `Import ${dates(fresh)}, add details to ${fill}`;
}
