import type { AskReply } from '@/cloud/api';

function parseReply(event: { text?: string; status?: string; proposals?: AskReply extends { proposals: infer P } ? P : never; reason?: string }): AskReply {
  return event.status === 'ok'
    ? { status: 'ok', text: event.text ?? '', proposals: event.proposals ?? [] }
    : {
        status: event.status === 'limited' || event.status === 'busy' || event.status === 'declined' ? event.status : 'unavailable',
        ...(event.reason ? { reason: event.reason as 'permission-required' } : {}),
      };
}

/** Read one streamed Ask reply. Returns null when the stream never finishes, so the caller can use the single reply. */
export async function readAskStream(url: string, token: string, body: unknown, onDelta: (chunk: string) => void): Promise<AskReply | null> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) return null;
  const contentType = response.headers?.get?.('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      const data = await response.json() as { text?: string; status?: string; proposals?: AskReply extends { proposals: infer P } ? P : never; reason?: string };
      return data && typeof data === 'object' && typeof data.status === 'string' ? parseReply(data) : null;
    } catch {
      return null;
    }
  }
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let done: AskReply | null = null;
  const handleLine = (line: string) => {
    if (!line.startsWith('data: ')) return;
    let event: { type?: string; text?: string; status?: string; proposals?: AskReply extends { proposals: infer P } ? P : never; reason?: string };
    try { event = JSON.parse(line.slice(6)); } catch { return; }
    if (event.type === 'delta' && event.text) onDelta(event.text);
    if (event.type === 'done') done = parseReply(event);
  };
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) handleLine(line);
  }
  buffer += decoder.decode();
  if (buffer) {
    for (const line of buffer.split('\n')) handleLine(line);
  }
  return done;
}
