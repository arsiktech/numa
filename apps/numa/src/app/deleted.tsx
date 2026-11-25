import { useQuery } from 'convex/react';
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { cloud } from '@/cloud/api';
import { useSession } from '@/cloud/session';
import { useCloudData } from '@/data/cloud';
import { RecordHistory } from '@/history/RecordHistory';
import { historyWhen, recordTypeLabel } from '@/history/describe';
import { useTheme } from '@/theme/theme';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';

export default function DeletedRoute() {
  return useSession().kind === 'signedIn' ? <Deleted /> : <Redirect href="/settings" />;
}

/** Records deleted from this space and what happened to them, newest first. Read only. */
function Deleted() {
  const data = useCloudData();
  return (
    <Screen>
      <Txt v="title" accessibilityRole="header" style={{ marginTop: 8 }}>Deleted</Txt>
      {data.status === 'ready' ? <DeletedList portfolioId={data.portfolioId} /> : <View style={{ marginTop: 40, alignItems: 'center' }}><ActivityIndicator accessibilityLabel="Loading" /></View>}
    </Screen>
  );
}

function DeletedList({ portfolioId }: { portfolioId: string }) {
  const { c } = useTheme();
  const rows = useQuery(cloud.deletedRecords, { portfolioId });
  const [open, setOpen] = useState<string | null>(null);
  if (!rows) return <View style={{ marginTop: 40, alignItems: 'center' }}><ActivityIndicator accessibilityLabel="Loading" /></View>;
  if (!rows.length) return <Txt v="body" c="ink3" style={{ marginTop: 20 }}>Nothing deleted.</Txt>;
  return (
    <View accessibilityLabel="Deleted records" style={{ marginTop: 16 }}>
      {rows.map((row) => {
        const expanded = open === row.recordId;
        return (
          <View key={row._id} style={{ borderBottomWidth: expanded ? 0 : 1, borderBottomColor: c.line }}>
            <Pressable onPress={() => setOpen(expanded ? null : row.recordId)} accessibilityRole="button" aria-expanded={expanded} accessibilityLabel={`${row.recordName}, ${recordTypeLabel(row.recordType)}`}
              style={({ pressed }) => ({ minHeight: 56, paddingVertical: 10, gap: 2, opacity: pressed ? 0.72 : 1 })}>
              <Txt v="body" numberOfLines={1} style={{ fontFamily: 'Manrope_600SemiBold' }}>{row.recordName || recordTypeLabel(row.recordType)}</Txt>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Txt v="small" c="ink3" numberOfLines={1} style={{ flexShrink: 1 }}>{recordTypeLabel(row.recordType)}</Txt>
                <Txt v="small" c="ink3" numberOfLines={1} style={{ flexShrink: 0 }}>{historyWhen(row.at)}</Txt>
              </View>
            </Pressable>
            {expanded ? <View style={{ marginTop: -14, paddingBottom: 8 }}><RecordHistory portfolioId={portfolioId} recordId={row.recordId} /></View> : null}
          </View>
        );
      })}
    </View>
  );
}
