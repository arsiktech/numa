import { Platform } from 'react-native';

import { AppTabs } from '@/ui/Nav';
import { PhoneTabs } from '@/ui/PhoneTabs';

/** Native tab bar on phones; the glass capsule or sidebar on the web. */
export default function TabsLayout() {
  return Platform.OS === 'web' ? <AppTabs /> : <PhoneTabs />;
}
