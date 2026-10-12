import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { storage } from '@/cloud/storage';

const TOKEN_KEY = 'numa.pushToken.v1';
export const pushSupported = true;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export type PushResult = { token: string; platform: 'ios' | 'android'; timeZone: string } | { error: string };

/** Asks for permission and returns this phone's Expo push token. */
export async function requestPushToken(): Promise<PushResult> {
  if (!Device.isDevice) return { error: 'Alerts need a real phone, not a simulator.' };
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Alerts', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const current = await Notifications.getPermissionsAsync();
  const status = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!status.granted) return { error: 'Notifications are off for Numa. Turn them on in your phone’s Settings.' };
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  try {
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await storage.setItem(TOKEN_KEY, data);
    return { token: data, platform: Platform.OS === 'ios' ? 'ios' : 'android', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' };
  } catch {
    return { error: 'Couldn’t set up alerts. Check your connection and try again.' };
  }
}

export const savedPushToken = () => storage.getItem(TOKEN_KEY);
export const forgetPushToken = () => storage.removeItem(TOKEN_KEY);

/** Tapping an alert opens what it is about. */
export function usePushTaps() {
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const url = response?.notification.request.content.data?.url;
      if (typeof url === 'string' && url.startsWith('/')) router.push(url as never);
    };
    void Notifications.getLastNotificationResponseAsync().then(open);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}
