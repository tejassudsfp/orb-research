/** A minimal Server-Sent Events parser over a fetch body (no dependency). */

export type SseEvent = { event: string; data: string; id?: string };

/** Parse `text/event-stream` chunks into events. Comments (`:`) are ignored; `data` lines join with a newline. */
export async function* parseSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  let data: string[] = [];
  let id: string | undefined;
  const flush = (): SseEvent | undefined => {
    if (data.length === 0 && !event) return undefined;
    const out: SseEvent = { event: event || 'message', data: data.join('\n'), ...(id !== undefined ? { id } : {}) };
    event = '';
    data = [];
    id = undefined;
    return out;
  };
  const onAbort = () => void reader.cancel(signal?.reason).catch(() => undefined);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const nl = buffer.search(/\r\n|\n|\r/);
        if (nl < 0) break;
        const m = /^(\r\n|\n|\r)/.exec(buffer.slice(nl))!;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + m[1]!.length);
        if (line === '') {
          const ev = flush();
          if (ev) yield ev;
        } else if (line.startsWith(':')) continue;
        else {
          const colon = line.indexOf(':');
          const field = colon < 0 ? line : line.slice(0, colon);
          let v = colon < 0 ? '' : line.slice(colon + 1);
          if (v.startsWith(' ')) v = v.slice(1);
          if (field === 'event') event = v;
          else if (field === 'data') data.push(v);
          else if (field === 'id') id = v;
        }
      }
    }
    const last = flush();
    if (last) yield last;
    signal?.throwIfAborted();
  } finally {
    signal?.removeEventListener('abort', onAbort);
    void reader.cancel().catch(() => undefined);
  }
}

/** JSON of an event's data, or undefined when it is not JSON. */
export function eventJson<T = any>(ev: SseEvent): T | undefined {
  try {
    return JSON.parse(ev.data) as T;
  } catch {
    return undefined;
  }
}
