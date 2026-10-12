import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState } from 'react-native';

/** How often coming back to the app may ask for a new version. */
const CHECK_EVERY_MS = 10 * 60_000;
/** A downloaded version is applied on return only after a real break, never mid-task. */
const APPLY_AFTER_AWAY_MS = 15 * 60_000;

/**
 * Keeps the installed app on the newest code published for its build. The app already checks
 * when it starts; this also checks when it comes back to the foreground, and applies a
 * downloaded version after the person has been away a while, so a quick switch to copy
 * something from another app never restarts the screen they were on.
 */
export function useLiveUpdates() {
  useEffect(() => {
    if (!Updates.isEnabled || __DEV__) return;
    let lastCheck = Date.now();
    let leftAt: number | null = null;
    let ready = false;

    const check = async () => {
      lastCheck = Date.now();
      try {
        const found = await Updates.checkForUpdateAsync();
        if (found.isAvailable) ready = (await Updates.fetchUpdateAsync()).isNew || ready;
      } catch {
        // Offline or the update server is unreachable: the current version keeps running.
      }
    };

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') { if (leftAt === null) leftAt = Date.now(); return; }
      const away = leftAt === null ? 0 : Date.now() - leftAt;
      leftAt = null;
      if (ready && away >= APPLY_AFTER_AWAY_MS) { Updates.reloadAsync().catch(() => {}); return; }
      if (Date.now() - lastCheck >= CHECK_EVERY_MS) check();
    });
    return () => sub.remove();
  }, []);
}
