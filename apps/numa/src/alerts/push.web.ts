/** Phone alerts are for the iOS and Android apps. The web app shows the same items under Needs you. */
export const pushSupported = false;
export type PushResult = { token: string; platform: 'ios' | 'android'; timeZone: string } | { error: string };
export async function requestPushToken(): Promise<PushResult> { return { error: 'Alerts are available in the phone app.' }; }
export const savedPushToken = async (): Promise<string | null> => null;
export const forgetPushToken = async () => {};
export function usePushTaps() {}
