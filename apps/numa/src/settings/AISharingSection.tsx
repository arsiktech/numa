import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useAISharing, type AISharingControls } from '@/privacy/useAISharing';
import { AISharingPanel } from '@/privacy/AISharingPanel';
import { useTheme } from '@/theme/theme';
import { Txt } from '@/ui/Txt';
import { Action, Row, Section } from './rows';

export function AISharingSection() {
  const sharing = useAISharing();
  return <AISharingView key={sharing.state?.userId ?? 'loading'} sharing={sharing} />;
}

function AISharingView({ sharing }: { sharing: AISharingControls }) {
  const p = sharing.state; const { c } = useTheme();
  const [reviewing, setReviewing] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const alive = useRef(true); const locked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function change(allowed: boolean) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try { await sharing.change(allowed); if (alive.current) setReviewing(false); }
    catch { if (alive.current) setError('Couldn’t confirm your sharing choice. Check the current setting or try again.'); }
    finally { if (alive.current) { locked.current = false; setBusy(false); } }
  }
  const detail = !p ? 'Loading your sharing choice…' : !p.userId ? 'Sign in again to review this choice.' : p.deletionPending ? 'AI replies are paused while account deletion is pending.' : p.allowed ? 'Questions and financial context can go to Anthropic (Claude). You still confirm every saved entry.' : 'Off. Manual entries and local answers still work.';
  return <>
    <Section title="AI SHARING" />
    <Row title="AI replies" detail={detail}><Txt v="small" c="ink2">{p?.allowed ? 'On' : 'Off'}</Txt></Row>
    {p?.granted && !p.deletionStarted ? <Action label={busy ? 'Turning off…' : 'Turn off AI sharing'} disabled={busy} detail="Stops new authorizations. Requests already underway may finish." onPress={() => { void change(false); }} /> : <Action label="Review and allow AI sharing" disabled={busy || !p?.userId || !!p?.deletionPending} onPress={() => { setError(null); setReviewing(true); }} />}
    {reviewing && p?.userId && !p.deletionPending ? <View style={{ marginTop: 14 }}><AISharingPanel disclosure={p.disclosure} allowLabel="Allow AI sharing" busy={busy} error={error} onAllow={() => { void change(true); }} onCancel={() => setReviewing(false)} /></View> : error ? <Txt v="small" style={{ color: c.down, marginTop: 8 }} accessibilityRole="alert">{error}</Txt> : null}
  </>;
}
