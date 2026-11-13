import { router } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { useOptionalCloudData } from '@/data/cloud';
import { useTheme } from '@/theme/theme';
import { Txt } from './Txt';

/**
 * What a data screen shows before its numbers are ready. It says so when they can't load (with Try again)
 * and when there is no space yet (with the way to set one up), instead of spinning forever.
 */
export function NotReady() {
  const data = useOptionalCloudData();
  const { c } = useTheme();
  const action = data?.status === 'error'
    ? { title: 'Couldn’t load your money', label: 'Try again', onPress: data.retry }
    : data?.status === 'needsSpace'
      ? { title: 'Set up your money first', label: 'Set up', onPress: () => router.navigate('/') }
      : null;
  if (!action) return <View style={{ marginTop: 60, alignItems: 'center' }}><ActivityIndicator accessibilityLabel="Loading" /></View>;
  return (
    <View style={{ marginTop: 40, alignItems: 'center', gap: 16 }} accessibilityRole="alert">
      <Txt v="cardTitle" style={{ textAlign: 'center' }}>{action.title}</Txt>
      <Pressable onPress={action.onPress} accessibilityRole="button" style={({ pressed }) => ({ minHeight: 48, paddingHorizontal: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ink, opacity: pressed ? 0.72 : 1 })}>
        <Txt v="body" c="bg" style={{ fontFamily: 'Manrope_700Bold' }}>{action.label}</Txt>
      </Pressable>
    </View>
  );
}
