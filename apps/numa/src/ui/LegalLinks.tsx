import { Linking, Platform, Pressable, View } from 'react-native';
import { useTheme } from '@/theme/theme';
import { Txt } from './Txt';

const pages = [['Pricing', '/pricing'], ['Privacy', '/privacy'], ['Terms', '/terms']] as const;
/** Real document links: legal information must not depend on app authentication or JavaScript. */
export function LegalLinks() {
  const { c } = useTheme();
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
    {pages.map(([label, path]) => Platform.OS === 'web'
      ? <a key={path} href={path} target="_blank" rel="noopener noreferrer" style={{ color: c.ink2, fontFamily: 'Manrope_500Medium, system-ui, sans-serif', fontSize: 14, minHeight: 44, padding: '10px 12px', display: 'inline-flex', alignItems: 'center', textUnderlineOffset: 3 }}>{label}</a>
      : <Pressable key={path} accessibilityRole="link" onPress={() => void Linking.openURL(`https://numaworth.com${path}`)} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }}><Txt v="small" c="ink2">{label}</Txt></Pressable>)}
  </View>;
}
