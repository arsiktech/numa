import { useAuthActions } from '@convex-dev/auth/react';
import { useMutation } from 'convex/react';

import { cloud } from '@/cloud/api';
import { forgetPushToken, savedPushToken } from './push';

type Cleanup = {
  saved: () => Promise<string | null>;
  unregister: (args: { token: string }) => Promise<unknown>;
  forget: () => Promise<unknown>;
  signOut: () => Promise<void>;
};

export async function signOutWithPushCleanup({ saved, unregister, forget, signOut }: Cleanup) {
  try {
    const token = await saved();
    if (token) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          unregister({ token }),
          new Promise<void>(resolve => { timer = setTimeout(resolve, 1500); }),
        ]);
      } finally { clearTimeout(timer); }
    }
  } catch {
    // Do not delay the SDK logout for failed cleanup. Generic server payloads protect queued sends.
  } finally {
    try { await forget(); } finally { await signOut(); }
  }
}

export function usePhoneSignOut() {
  const { signOut } = useAuthActions();
  const unregister = useMutation(cloud.unregisterDevice);
  return () => signOutWithPushCleanup({ saved: savedPushToken, unregister, forget: forgetPushToken, signOut });
}
