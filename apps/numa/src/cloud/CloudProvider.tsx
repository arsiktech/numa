import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import type { ReactNode } from 'react';
import { Platform } from 'react-native';

import { convexUrl } from './config';
import { storage } from './storage';
import { AppleCredentialObserver } from './AppleCredentialObserver';

const client = convexUrl ? new ConvexReactClient(convexUrl, { unsavedChangesWarning: false }) : null;

/** Convex and Convex Auth when a deployment is configured. Tokens live in the keychain or keystore on phones. */
export function CloudProvider({ children }: { children: ReactNode }) {
  if (!client) return <>{children}</>;
  return (
    <ConvexAuthProvider client={client} storage={Platform.OS === 'web' ? undefined : storage}>
      <AppleCredentialObserver />
      {children}
    </ConvexAuthProvider>
  );
}

export const cloudEnabled = client !== null;
