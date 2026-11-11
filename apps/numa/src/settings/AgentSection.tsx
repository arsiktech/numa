import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Platform, Pressable, Share, View } from 'react-native';

import { agentPrompt, toolWords } from '@/agents/prompt';
import { cloud, type AgentAccess, type CloudAgent } from '@/cloud/api';
import { useCloudData } from '@/data/cloud';
import { ago } from '@/domain/freshness';
import { useTheme } from '@/theme/theme';
import { Field } from '@/ui/form';
import { useToast } from '@/ui/Toast';
import { Txt } from '@/ui/Txt';
import { Action, Button, Section } from './rows';

type Created = { name: string; prompt: string };

/** Connect Claude, ChatGPT, Cursor or any MCP agent to the account in one paste, see what agents did, and disconnect them. */
export function AgentSection() {
  const { c } = useTheme();
  const toast = useToast();
  const agents = useQuery(cloud.agents, {});
  const activity = useQuery(cloud.agentActivity, { limit: 5 });
  const connect = useMutation(cloud.connectAgent);
  const disconnect = useMutation(cloud.disconnectAgent);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [access, setAccess] = useState<AgentAccess>('full');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  // The shared clock ticks every minute, so "used 3 min ago" stays current.
  const cloudData = useCloudData();
  const now = cloudData.status === 'ready' ? cloudData.now : 0;

  async function create() {
    setBusy(true);
    try {
      const r = await connect({ name: name.trim() || 'My agent', access });
      setCreated({ name: r.name, prompt: agentPrompt(r.link, r.access) });
      setOpen(false); setName('');
    } catch (e) {
      toast({ text: e instanceof Error && /TOO_MANY_AGENTS|Up to/.test(e.message) ? 'Up to 10 agents can be connected. Disconnect one first.' : 'Couldn’t connect an agent. Try again.' });
    } finally { setBusy(false); }
  }

  async function hand(prompt: string) {
    if (Platform.OS === 'web') {
      try { await navigator.clipboard.writeText(prompt); toast({ text: 'Copied. Paste it into your agent.' }); }
      catch { toast({ text: 'Couldn’t copy. Select the text above and copy it.' }); }
      return;
    }
    // The share sheet sends it straight to the Claude or ChatGPT app, or copies it.
    await Share.share({ message: prompt });
  }

  async function remove(agent: CloudAgent) {
    try { await disconnect({ id: agent.id }); toast({ text: `${agent.name} disconnected` }); }
    catch { toast({ text: 'Couldn’t disconnect. Try again.' }); }
    setConfirming(null);
  }

  return (
    <>
      <Section title="AI AGENTS" />
      <Txt v="small" c="ink2" style={{ marginTop: 6 }}>Let Claude, ChatGPT, Cursor or any agent that supports MCP read and manage your money here. It acts as you. You can see what it did and disconnect it at any time.</Txt>

      {created && (
        <View style={{ marginTop: 12, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 10 }} accessibilityLabel="Agent link ready">
          <Txt v="cardTitle">Paste this into {created.name}</Txt>
          <Txt v="small" selectable c="ink2" style={{ fontFamily: 'JetBrainsMono_500Medium', fontSize: 12, lineHeight: 18 }}>{created.prompt}</Txt>
          <Txt v="small" c="ink3">Shown once. Anyone with this link can act as you, so keep it private. If it leaks, disconnect the agent below.</Txt>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label={Platform.OS === 'web' ? 'Copy for your agent' : 'Send to your agent'} onPress={() => hand(created.prompt)} />
            <Button label="Done" quiet onPress={() => setCreated(null)} />
          </View>
        </View>
      )}

      {(agents ?? []).map((a) => (
        <View key={a.id} style={{ minHeight: 60, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: c.line }}>
          <View style={{ flex: 1 }}>
            <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold' }}>{a.name}</Txt>
            <Txt v="small" c={a.active ? 'ink2' : 'down'}>
              {!a.active ? 'Signed out. Connect it again.' : `${a.access === 'full' ? 'Can read and change' : 'Can only read'} · ${a.lastUsedAt ? `used ${ago(a.lastUsedAt, now)}` : 'not used yet'}`}
            </Txt>
          </View>
          {confirming === a.id ? (
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <Pressable onPress={() => remove(a)} accessibilityRole="button" style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, backgroundColor: c.down, justifyContent: 'center' }}>
                <Txt v="body" style={{ color: '#FFFFFF', fontFamily: 'Manrope_700Bold' }}>Disconnect</Txt>
              </Pressable>
              <Pressable onPress={() => setConfirming(null)} accessibilityRole="button" style={{ minHeight: 40, paddingHorizontal: 10, justifyContent: 'center' }}>
                <Txt v="body" style={{ fontFamily: 'Manrope_700Bold' }}>Keep</Txt>
              </Pressable>
            </View>
          ) : (
            <Pressable onPress={() => setConfirming(a.id)} accessibilityRole="button" accessibilityLabel={`Disconnect ${a.name}`} style={{ minHeight: 40, paddingHorizontal: 6, justifyContent: 'center' }}>
              <Txt v="body" style={{ fontFamily: 'Manrope_700Bold', color: c.down }}>Disconnect</Txt>
            </Pressable>
          )}
        </View>
      ))}

      {!open && <Action label="Connect an agent" detail="One link to paste into your agent." onPress={() => { setOpen(true); setCreated(null); }} />}
      {open && (
        <View style={{ marginTop: 12, padding: 16, borderRadius: 18, backgroundColor: c.s1, gap: 12 }}>
          <Field label="Agent name" value={name} onChangeText={setName} />
          <View style={{ gap: 6 }}>
            <Txt v="small" c="ink3">What it can do</Txt>
            <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup">
              {(['full', 'read'] as const).map((k) => (
                <Pressable key={k} onPress={() => setAccess(k)} accessibilityRole="radio" aria-checked={access === k}
                  style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: access === k ? c.ink : 'transparent', borderWidth: 1, borderColor: access === k ? c.ink : c.line2 }}>
                  <Txt v="body" style={{ fontFamily: 'Manrope_600SemiBold', color: access === k ? c.bg : c.ink }}>{k === 'full' ? 'Read and change' : 'Read only'}</Txt>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label={busy ? 'Connecting…' : 'Create link'} onPress={create} disabled={busy} />
            <Button label="Cancel" quiet onPress={() => setOpen(false)} />
          </View>
        </View>
      )}

      {(activity ?? []).length > 0 && (
        <View style={{ marginTop: 14, gap: 6 }}>
          <Txt v="small" c="ink3">Recent agent activity</Txt>
          {activity!.map((r) => (
            <Txt key={r.id} v="small" c={r.ok ? 'ink2' : 'down'}>
              {r.agent} · {toolWords[r.tool] ?? r.tool}{r.ok ? '' : ' (refused)'} · {ago(r.at, now)}
            </Txt>
          ))}
        </View>
      )}
    </>
  );
}
