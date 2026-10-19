import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { cloud } from '@/cloud/api';
import { ago } from '@/domain/freshness';
import { useTheme } from '@/theme/theme';
import { Field } from '@/ui/form';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';

const errorText = (e: unknown) => {
  const data = e instanceof ConvexError && e.data && typeof e.data === 'object' ? (e.data as { code?: string; message?: string }) : null;
  return data?.code === 'INVALID_PORTAL_LINK' && data.message ? `${data.message}.` : 'Couldn’t save that. Check your connection and try again.';
};

/**
 * A debt that follows a company portal: Numa reads the portal's company balance through its
 * read-only agent link every 30 minutes and sets the debt to how far the balance is below what is owed.
 */
export function PortalSource({ portfolioId, liabilityId, now }: { portfolioId: string; liabilityId: string; now: number }) {
  const { c } = useTheme();
  const toast = useToast();
  const sources = useQuery(cloud.portalSources, { portfolioId });
  const follow = useMutation(cloud.followPortal);
  const unfollow = useMutation(cloud.unfollowPortal);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!sources) return null;
  const source = sources.find((s) => s.liabilityId === liabilityId);

  async function save() {
    setBusy(true); setError(null);
    try {
      await follow({ liabilityId, url: url.trim(), ...(key.trim() ? { key: key.trim() } : {}) });
      setOpen(false); setUrl(''); setKey('');
      toast({ text: 'Following the portal. The first reading comes in a moment.' });
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  async function stop() {
    setBusy(true);
    try { await unfollow({ liabilityId }); toast({ text: 'Stopped following. The debt keeps its last value.' }); }
    catch { toast({ text: 'Couldn’t stop following. Try again.' }); }
    finally { setBusy(false); }
  }

  if (source) {
    const state = source.status === null ? 'Reading the portal…'
      : source.status === 'ok' ? `Read ${ago(source.checkedAt ?? now, now)}.`
      : `${source.message ?? 'Couldn’t read the portal'}. Showing the last value${source.readingAt ? ` from ${ago(source.readingAt, now)}` : ''}.`;
    return (
      <View style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.line, gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Txt v="body" c="ink2">Follows</Txt>
          <Txt v="figureSm" style={{ fontSize: 14, flexShrink: 1, textAlign: 'right' }}>{source.host}</Txt>
        </View>
        <Txt v="small" c={source.status === 'ok' || source.status === null ? 'ink3' : 'warn'}>{state} Updated every 30 minutes.</Txt>
        <Pressable onPress={stop} disabled={busy} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Stop following</Txt>
        </Pressable>
      </View>
    );
  }

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.line }}>
        <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Keep in step with a company portal</Txt>
        <Txt v="body" c="ink3">›</Txt>
      </Pressable>
    );
  }

  return (
    <View style={{ marginTop: 18, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 12 }}>
      <Txt v="cardTitle">Keep in step with a company portal</Txt>
      <Txt v="body" c="ink2">Numa reads the portal’s company balance every 30 minutes and sets this debt to how far the balance is below what is owed. When the portal can’t give a complete figure, the debt keeps its last value.</Txt>
      <Field label="Portal agent link (https://…)" kind="url" value={url} onChangeText={setUrl} />
      <Field label="Key, if the portal gave one" kind="secret" value={key} onChangeText={setKey} />
      <Txt v="small" c="ink3">Make a read-only agent link in the portal. The key stays on Numa’s server and is never shown again.</Txt>
      {error && <Txt v="body" style={{ color: c.down }} accessibilityRole="alert">{error}</Txt>}
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <Pressable onPress={save} disabled={busy || !url.trim()} accessibilityRole="button" aria-disabled={busy || !url.trim()} style={{ minHeight: 44, paddingHorizontal: 20, borderRadius: 999, backgroundColor: c.ink, justifyContent: 'center', opacity: url.trim() ? 1 : 0.4 }}>
          {busy ? <ActivityIndicator color={c.bg} /> : <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>Follow</Txt>}
        </Pressable>
        <Pressable onPress={() => { setOpen(false); setError(null); }} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' }}>
          <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Cancel</Txt>
        </Pressable>
      </View>
    </View>
  );
}
