import { useQuery } from 'convex/react';
import { View } from 'react-native';

import { cloud } from '@/cloud/api';
import { useTheme } from '@/theme/theme';
import { Txt } from '@/ui/Txt';
import { actorLabel, describeChange, historyDay } from './describe';

/** A record's change history, newest first. Shows nothing until there is some. */
export function RecordHistory({ portfolioId, recordId }: { portfolioId: string; recordId: string }) {
  const { c } = useTheme();
  const history = useQuery(cloud.recordHistory, { portfolioId, recordId, limit: 50 });
  if (!history?.entries.length) return null;
  return (
    <View accessibilityLabel="Change history" style={{ marginTop: 22 }}>
      <Txt v="label" c="ink3">History</Txt>
      {history.entries.map((change) => (
        <View key={change._id} style={{ minHeight: 48, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <View style={{ flexShrink: 1, gap: 2 }}>
            <Txt v="body">{describeChange(change)}</Txt>
            <Txt v="small" c="ink3">{[actorLabel(change.actor), change.reason].filter(Boolean).join(' · ')}</Txt>
          </View>
          <Txt v="small" c="ink3">{historyDay(change.at)}</Txt>
        </View>
      ))}
    </View>
  );
}
