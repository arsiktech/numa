import { useAction } from 'convex/react';
import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, TextInput, View } from 'react-native';

import { cloud } from '@/cloud/api';
import { useTheme } from '@/theme/theme';
import { Txt } from '@/ui/Txt';
import { pickSpreadsheet } from './pickFile';
import { readSpreadsheet, type SheetTab } from './spreadsheet';

type Way = 'file' | 'link' | 'paste';
export type Loaded = { label: string; tabs: SheetTab[] };

const SHEET_ERRORS: Record<string, string> = {
  private: 'Numa can’t open this sheet yet. In Google Sheets, set General access to “Anyone with the link”, then try again.',
  missing: 'That sheet doesn’t exist, or the link is incomplete. Copy the link again from Google Sheets.',
  badLink: 'That isn’t a Google Sheets link. It starts with docs.google.com/spreadsheets.',
  tooBig: 'That tab is too big to import at once. Split it, or export a shorter range.',
  limited: 'Too many tries this hour. Wait a bit, or choose a file instead.',
  failed: 'Couldn’t reach Google Sheets. Check your connection and try again.',
};

function Steps({ items }: { items: string[] }) {
  return (
    <View style={{ gap: 6, marginTop: 10 }}>
      {items.map((step, i) => (
        <View key={step} style={{ flexDirection: 'row', gap: 10 }}>
          <Txt v="small" c="ink3" style={{ width: 16, fontFamily: 'Manrope_700Bold' }}>{i + 1}</Txt>
          <Txt v="small" c="ink2" style={{ flex: 1 }}>{step}</Txt>
        </View>
      ))}
    </View>
  );
}

/**
 * The three ways in: a file from the phone, a Google Sheets link, or pasted cells. Each one
 * ends in the same place, a table Numa previews before anything is saved.
 */
export function ImportSources({ onLoaded, pasteText, onPaste }: { onLoaded: (loaded: Loaded) => void; pasteText: string; onPaste: (text: string) => void }) {
  const { c } = useTheme();
  const readSheet = useAction(cloud.readSheet);
  const [way, setWay] = useState<Way | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState('');

  async function chooseFile() {
    setWay('file');
    setError(null);
    setBusy(true);
    try {
      const picked = await pickSpreadsheet();
      if (!picked) return;
      if (!picked.tabs.length) { setError('That file has no rows Numa can read.'); return; }
      onLoaded({ label: picked.file, tabs: picked.tabs });
    } catch {
      setError('Numa couldn’t read that file. Choose a CSV or an Excel file (.xlsx).');
    } finally {
      setBusy(false);
    }
  }

  async function readLink() {
    if (!link.trim() || busy) return;
    setError(null);
    setBusy(true);
    try {
      const reply = await readSheet({ link: link.trim() });
      if (reply.status !== 'ok') { setError(SHEET_ERRORS[reply.status] ?? SHEET_ERRORS.failed); return; }
      // A link to one tab comes back as CSV; a plain share link as the whole workbook.
      const tabs = 'csv' in reply
        ? [{ name: 'Linked tab', csv: reply.csv }]
        : readSpreadsheet('sheet.xlsx', Uint8Array.from(atob(reply.xlsx), (ch) => ch.charCodeAt(0)));
      if (!tabs.length) { setError('That sheet has no rows Numa can read.'); return; }
      onLoaded({ label: 'Google Sheets', tabs });
    } catch {
      setError(SHEET_ERRORS.failed);
    } finally {
      setBusy(false);
    }
  }

  const option = (key: Way, title: string, sub: string, onPress: () => void) => {
    const open = way === key;
    return (
      <Pressable key={key} onPress={onPress} accessibilityRole="button" aria-expanded={key === 'file' ? undefined : open}
        style={{ minHeight: 64, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 18, backgroundColor: c.s1, borderWidth: 2, borderColor: open ? c.ink : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>{title}</Txt>
          <Txt v="small" c="ink2" style={{ marginTop: 2 }}>{sub}</Txt>
        </View>
        {busy && open ? <ActivityIndicator color={c.ink2} /> : <Txt v="body" c="ink3" accessibilityElementsHidden importantForAccessibility="no">›</Txt>}
      </Pressable>
    );
  };

  const field = { borderRadius: 14, padding: 14, backgroundColor: c.s1, color: c.ink, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) };

  return (
    <View style={{ marginTop: 18, gap: 10 }}>
      {option('file', 'Choose a file', 'CSV or Excel, from Files, iCloud or Google Drive', chooseFile)}
      {way === 'file' && (
        <View style={{ paddingHorizontal: 4 }}>
          <Txt v="small" c="ink2">Keep your numbers in Google Sheets? Download or send a copy as Excel (.xlsx) or CSV, save it to Files, then choose it here. Numa reads every tab and picks the one it understands.</Txt>
          {error && <Txt v="body" style={{ color: c.warn, marginTop: 10 }} accessibilityRole="alert">{error}</Txt>}
        </View>
      )}

      {option('link', 'Paste a Google Sheets link', 'Shared with “Anyone with the link”', () => { setWay(way === 'link' ? null : 'link'); setError(null); })}
      {way === 'link' && (
        <View style={{ paddingHorizontal: 4 }}>
          <Steps items={[
            'In Google Sheets, tap Share, and under General access choose “Anyone with the link”.',
            'Tap Copy link, then paste it below. Numa reads every tab and opens the one it understands.',
          ]} />
          <TextInput value={link} onChangeText={(t) => { setLink(t); setError(null); }} placeholder="docs.google.com/spreadsheets/d/…" placeholderTextColor={c.ink3}
            autoCapitalize="none" autoCorrect={false} keyboardType="url" inputMode="url" onSubmitEditing={readLink} accessibilityLabel="Google Sheets link"
            style={{ ...field, marginTop: 12, minHeight: 50, fontFamily: 'Manrope_500Medium', fontSize: 15 }} />
          <Pressable onPress={readLink} disabled={!link.trim() || busy} accessibilityRole="button" aria-disabled={!link.trim() || busy}
            style={{ marginTop: 10, minHeight: 48, paddingHorizontal: 22, borderRadius: 999, alignSelf: 'flex-start', backgroundColor: c.ink, justifyContent: 'center', opacity: link.trim() ? 1 : 0.4 }}>
            {busy ? <ActivityIndicator color={c.bg} /> : <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>Read sheet</Txt>}
          </Pressable>
          {error && <Txt v="body" style={{ color: c.warn, marginTop: 10 }} accessibilityRole="alert">{error}</Txt>}
          <Txt v="small" c="ink3" style={{ marginTop: 8 }}>Numa reads the tab once and keeps only what you confirm. You can set sharing back to Restricted afterwards.</Txt>
        </View>
      )}

      {option('paste', 'Paste cells', 'Copied from a spreadsheet, header row included', () => { setWay(way === 'paste' ? null : 'paste'); setError(null); })}
      {way === 'paste' && (
        <View style={{ paddingHorizontal: 4 }}>
          <Txt v="small" c="ink2">Easiest on a computer: select the cells, header row included, copy, and paste here. A CSV’s text works too.</Txt>
          <TextInput value={pasteText} onChangeText={onPaste} multiline placeholder={'Date,Description,Amount\n2026-10-03,October rent,-1200'} placeholderTextColor={c.ink3} accessibilityLabel="Pasted table"
            style={{ ...field, marginTop: 10, minHeight: 140, maxHeight: 260, fontFamily: 'JetBrainsMono_400Regular', fontSize: 13, textAlignVertical: 'top' }} />
        </View>
      )}
    </View>
  );
}

/** What Numa recognises, so people know before they start. */
export function ImportKinds() {
  const { c } = useTheme();
  const kinds = [
    ['Wealth log', 'One row per date, your accounts and investments across'],
    ['Bank or card export', 'Date, description and amount'],
    ['Balances', 'Account name and value; negative values become debts'],
    ['Holdings', 'Symbol and quantity, with cost if you have it'],
  ];
  return (
    <View style={{ marginTop: 26 }}>
      <Txt v="section">What Numa can read</Txt>
      <View style={{ marginTop: 6 }}>
        {kinds.map(([title, sub], i) => (
          <View key={title} style={{ paddingVertical: 10, borderBottomWidth: i === kinds.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
            <Txt v="body">{title}</Txt>
            <Txt v="small" c="ink3" style={{ marginTop: 2 }}>{sub}</Txt>
          </View>
        ))}
      </View>
      <Txt v="small" c="ink3" style={{ marginTop: 8 }}>You see everything before it’s saved, and one tap undoes the import.</Txt>
    </View>
  );
}
