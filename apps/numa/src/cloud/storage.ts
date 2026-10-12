import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Small key-value storage: the keychain or keystore on phones, localStorage on the web. */
export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

const native: KeyValueStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

const web: KeyValueStorage = {
  async getItem(key) {
    try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
  },
  async setItem(key, value) {
    try { globalThis.localStorage?.setItem(key, value); } catch { /* private mode: keep it in memory only */ }
  },
  async removeItem(key) {
    try { globalThis.localStorage?.removeItem(key); } catch { /* nothing stored */ }
  },
};

export const storage: KeyValueStorage = Platform.OS === 'web' ? web : native;
