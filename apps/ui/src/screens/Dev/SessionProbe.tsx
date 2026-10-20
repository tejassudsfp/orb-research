import { useEffect, useRef, useState } from 'react';
import { ReplyTracker, isWireError, type ReplyState, type Wire } from '../../wire/index.js';

/**
 * Engine diagnostics (P1.5 spike panel, kept on `#/dev`): proves the UI drives a harness session over the gateway wire (create, prompt, streamed reply,
 * cancel). Replaced by the real chat UI in later phases.
 */
export function SessionProbe({ wire }: { wire: Wire }) {
  const [sessionId, setSessionId] = useState<string>();
  const [reply, setReply] = useState<ReplyState>({ text: '', running: false, committed: [] });
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const [mux, setMux] = useState(wire.mux.state);
  const follow = useRef<AbortController | undefined>(undefined);

  // `wire.events.start()` opens the mux before React mounts, so it can reach 'open' between this render and the
  // subscription below; re-read the state when subscribing or the panel shows 'connecting' forever.
  useEffect(() => {
    const unsubscribe = wire.mux.onState(setMux);
    setMux(wire.mux.state);
    return unsubscribe;
  }, [wire]);
  useEffect(() => () => follow.current?.abort(), []);

  const report = (e: unknown) => setError(isWireError(e) ? `${e.code}: ${e.message}` : String(e));

  async function followLoop(id: string, signal: AbortSignal) {
    while (!signal.aborted) {
      const tracker = new ReplyTracker();
      try {
        for await (const frame of wire.session.follow(id, { signal })) setReply(tracker.push(frame));
      } catch (e) {
        if (signal.aborted) return;
        if (!isWireError(e) || !e.retryable) return report(e);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  async function create() {
    setError(undefined);
    try {
      const { sessionId: id } = await wire.session.create();
      follow.current?.abort();
      const ac = new AbortController();
      follow.current = ac;
      setSessionId(id);
      setReply({ text: '', running: false, committed: [] });
      void followLoop(id, ac.signal);
    } catch (e) {
      report(e);
    }
  }

  async function send() {
    if (!sessionId || !text.trim()) return;
    setError(undefined);
    try {
      await wire.session.prompt(sessionId, text);
      setText('');
    } catch (e) {
      report(e);
    }
  }

  async function cancel() {
    if (!sessionId) return;
    try {
      await wire.session.cancel(sessionId);
    } catch (e) {
      report(e);
    }
  }

  const status = reply.running ? 'running' : (reply.lastTurnEnd ?? 'idle');
  return (
    <section data-testid="session-probe" style={{ marginTop: 32, maxWidth: 720 }}>
      <h2 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 12px' }}>Engine session</h2>
      <p style={{ color: 'var(--orb-text-muted)', margin: '0 0 12px', fontSize: 13 }}>
        Connection: <span data-testid="probe-mux">{mux}</span> · Session:{' '}
        <span data-testid="probe-session">{sessionId ?? 'none'}</span> · Turn:{' '}
        <span data-testid="probe-status">{status}</span>
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button data-testid="probe-create" onClick={() => void create()}>
          New session
        </button>
        <input
          data-testid="probe-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void send()}
          placeholder="Ask something"
          disabled={!sessionId}
          style={{ flex: 1 }}
        />
        <button data-testid="probe-send" onClick={() => void send()} disabled={!sessionId}>
          Send
        </button>
        <button data-testid="probe-cancel" onClick={() => void cancel()} disabled={!reply.running}>
          Cancel
        </button>
      </div>
      <pre
        data-testid="probe-reply"
        style={{ whiteSpace: 'pre-wrap', background: 'var(--orb-inset)', border: '1px solid var(--orb-border)', borderRadius: 12, padding: 12, minHeight: 48, fontSize: 13 }}
      >
        {reply.text}
      </pre>
      {error && (
        <p data-testid="probe-error" style={{ color: 'var(--orb-paper)', fontSize: 13 }}>
          {error}
        </p>
      )}
    </section>
  );
}
