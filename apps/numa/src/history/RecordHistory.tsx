import { useQuery } from 'convex/react';
import { View } from 'react-native';

import { cloud } from '@/cloud/api';
import { useTheme } from '@/theme/theme';
import { Txt } from '@/ui/Txt';
import { actorLabel, describeChange, historyWhen, presentHistory } from './describe';

/** A record's change history, newest first. Shows nothing until there is some. */
export function RecordHistory({ portfolioId, recordId }: { portfolioId: string; recordId: string }) {
  const { c } = useTheme();
  const history = useQuery(cloud.recordHistory, { portfolioId, recordId, limit: 50 });
  if (!history?.entries.length) return null;
  return (
    <View accessibilityLabel="Change history" style={{ marginTop: 22 }}>
      <Txt v="label" c="ink3">History</Txt>
      {presentHistory(history.entries).map((change) => (
        <View key={change._id} style={{ minHeight: 48, paddingVertical: 10, gap: 2, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <Txt v="body">{describeChange(change)}</Txt>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
            <Txt v="small" c="ink3" numberOfLines={1} ellipsizeMode="tail" style={{ flexShrink: 1, minWidth: 0 }}>
              {[actorLabel(change.actor), change.reason].filter(Boolean).join(' · ')}
            </Txt>
            <Txt v="small" c="ink3" numberOfLines={1} style={{ flexShrink: 0 }}>{historyWhen(change.at)}</Txt>
          </View>
        </View>
      ))}
    </View>
  );
}
