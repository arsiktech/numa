import { Redirect } from 'expo-router';

/** Where the Google sign-in sheet hands back on phones. The sign-in itself finishes on the sign-in screen. */
export default function AuthReturn() {
  return <Redirect href="/" />;
}
