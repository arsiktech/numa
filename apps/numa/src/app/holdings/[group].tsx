import { useLocalSearchParams } from 'expo-router';

import { useSession } from '@/cloud/session';
import { groupNames, type GroupId } from '@/data/items';
import { useCloudItems, useDemoItems } from '@/data/useItems';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { Holdings } from './index';

export default function GroupScreen() {
  const { group } = useLocalSearchParams<{ group: string }>();
  const signedIn = useSession().kind === 'signedIn';
  if (!(group in groupNames)) return <Screen><Txt v="body" c="ink2" style={{ marginTop: 20 }}>That group doesn’t exist.</Txt></Screen>;
  return signedIn ? <Cloud group={group as GroupId} /> : <Demo group={group as GroupId} />;
}
function Cloud({ group }: { group: GroupId }) { return <Holdings source={useCloudItems()} only={group} />; }
function Demo({ group }: { group: GroupId }) { return <Holdings source={useDemoItems()} only={group} />; }
