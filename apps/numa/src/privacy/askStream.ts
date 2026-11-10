import type { AskReply } from '@/cloud/api';

/** Read one streamed Ask reply. Returns null when the stream never finishes, so the caller can use the single reply. */
export async function readAskStream(url: string, token: string, body: unknown, onDelta: (chunk: string) => void): Promise<AskReply | null> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: AskReply | null = null;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const event = JSON.parse(line.slice(6)) as { type?: string; text?: string; status?: string; proposals?: AskReply extends { proposals: infer P } ? P : never; reason?: string };
      if (event.type === 'delta' && event.text) onDelta(event.text);
      if (event.type === 'done') {
        done = event.status === 'ok'
          ? { status: 'ok', text: event.text ?? '', proposals: event.proposals ?? [] }
          : { status: event.status === 'limited' || event.status === 'busy' || event.status === 'declined' ? event.status : 'unavailable', ...(event.reason ? { reason: event.reason as 'permission-required' } : {}) };
      }
    }
  }
  return done;
}
