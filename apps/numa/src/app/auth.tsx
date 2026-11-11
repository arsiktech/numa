import { Redirect } from 'expo-router';
import { Platform } from 'react-native';

import { useSession } from '@/cloud/session';

import { authTarget } from './authTarget';

/** Where the Google sign-in sheet hands back on phones. On the web it lands on the sign-in screen. */
export default function AuthReturn() {
  const session = useSession();
  if (session.kind === 'loading') return null;
  return <Redirect href={authTarget(Platform.OS, session.kind === 'signedIn')} />;
}
