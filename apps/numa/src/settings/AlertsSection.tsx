import { useMutation, useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import { Switch } from 'react-native';

import { forgetPushToken, pushSupported, requestPushToken, savedPushToken } from '@/alerts/push';
import { cloud } from '@/cloud/api';
import { useTheme } from '@/theme/theme';
import { useToast } from '@/ui/Toast';
import { Row, Section } from './rows';

/** Alerts on this phone: what Needs you raises, at most three a day, quiet from 22:00 to 8:00. */
export function AlertsSection() {
  const { c } = useTheme();
  const toast = useToast();
  const register = useMutation(cloud.registerDevice);
  const unregister = useMutation(cloud.unregisterDevice);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void savedPushToken().then(setToken); }, []);
  const registered = useQuery(cloud.deviceRegistered, token ? { token } : 'skip') ?? false;
  if (!pushSupported) return null;

  async function toggle(on: boolean) {
    setBusy(true);
    try {
      if (on) {
        const r = await requestPushToken();
        if ('error' in r) { toast({ text: r.error }); return; }
        await register(r);
        setToken(r.token);
        toast({ text: 'Alerts are on for this phone' });
      } else if (token) {
        await unregister({ token });
        await forgetPushToken();
        setToken(null);
        toast({ text: 'Alerts are off for this phone' });
      }
    } catch {
      toast({ text: 'Couldn’t change alerts. Try again.' });
    } finally { setBusy(false); }
  }

  return (
    <>
      <Section title="ALERTS" />
      <Row title="Alerts on this phone" detail="Bills due soon and spending limits. At most 3 a day, never between 22:00 and 8:00.">
        <Switch value={registered} disabled={busy} onValueChange={toggle} trackColor={{ true: c.up, false: c.s2 }} thumbColor="#FFFFFF" accessibilityLabel="Alerts on this phone" />
      </Row>
    </>
  );
}
