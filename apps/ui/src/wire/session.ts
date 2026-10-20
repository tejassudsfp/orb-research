/**
 * Typed calls into the harness `session` Remote namespace (dsh-api-session-controller). Every method takes one
 * parameter named `request` (`list` names it `_request`), so the wire args are `{request: …}`.
 */
import {
  AcceptedValue,
  AssistantTextDelta,
  SessionCreateValue,
  SessionFollowFrame,
  SessionListValue,
  SessionPageValue,
  TurnEndData,
  type SessionPageRequest,
  type SessionCreateRequest,
  type SessionFollowFrame as FollowFrame,
} from '@orb/shared';
import { call } from './call.js';
import { randomId, type WireEnv } from './env.js';
import type { MuxClient } from './mux.js';

export type SessionApi = ReturnType<typeof sessionApi>;

export function sessionApi(env: WireEnv, mux: MuxClient) {
  return {
    list: (signal?: AbortSignal) =>
      call(
        env,
        'session',
        'list',
        { _request: {} },
        { schema: SessionListValue, ...(signal ? { signal } : {}) },
      ),
    create: (request: SessionCreateRequest = {}, signal?: AbortSignal) =>
      call(
        env,
        'session',
        'create',
        { request },
        { schema: SessionCreateValue, ...(signal ? { signal } : {}) },
      ),
    /** Queue (or steer) one text prompt. Resolves once the agent accepted it; the reply arrives on `follow`. */
    prompt: (
      sessionId: string,
      text: string,
      opts: { mode?: 'queue' | 'steer'; requestId?: string; signal?: AbortSignal } = {},
    ) =>
      call(
        env,
        'session',
        'prompt',
        {
          request: {
            requestId: opts.requestId ?? randomId(),
            sessionId,
            mode: opts.mode ?? 'queue',
            content: [{ type: 'text', text }],
          },
        },
        { schema: AcceptedValue, ...(opts.signal ? { signal: opts.signal } : {}) },
      ),
    /** Cancel the active turn (the pending inbox is kept). */
    cancel: (sessionId: string, signal?: AbortSignal) =>
      call(
        env,
        'session',
        'cancel',
        { request: { sessionId } },
        { schema: AcceptedValue, ...(signal ? { signal } : {}) },
      ),
    /**
     * One backwards page of a session log, without activating its agent (P3.6 provenance: the turn that produced a
     * card, `throughSeq` = the card's `provenance.eventSeq`).
     */
    page: (request: SessionPageRequest, signal?: AbortSignal) =>
      call(env, 'session', 'page', { request }, { schema: SessionPageValue, ...(signal ? { signal } : {}) }),
    /** Snapshot, then durable events and (by default) live assistant-stream frames. */
    follow: (sessionId: string, opts: { assistantStream?: boolean; signal?: AbortSignal } = {}) =>
      mux.open(
        'session/follow',
        {
          request: {
            address: { kind: 'session', sessionId },
            ...(opts.assistantStream === false ? {} : { assistantStream: true }),
          },
        },
        { schema: SessionFollowFrame, ...(opts.signal ? { signal: opts.signal } : {}) },
      ),
  };
}

export type ReplyState = {
  /** Text of the attempt being streamed (or last streamed). */
  text: string;
  /** Turn currently running, if any. */
  running: boolean;
  /** `reason.kind` of the last `turn/end`: `completed`, `aborted` (cancelled), `error`, `blocked`, `max-tokens`, … */
  lastTurnEnd?: string;
  /** The full `turn/end` reason (an `aborted` reason carries its cause, e.g. `{kind:'user'}`). */
  lastTurnEndReason?: Record<string, unknown>;
  /** Committed assistant messages' text, in order. */
  committed: string[];
};

/**
 * Folds `session/follow` frames into the visible assistant reply. Live text comes from assistant-stream `chunk`
 * frames (`{type:'text-delta', text}`); the durable `assistant/message` event is the committed version.
 */
export class ReplyTracker {
  state: ReplyState = { text: '', running: false, committed: [] };
  private attemptId?: string;

  push(frame: FollowFrame): ReplyState {
    const s = this.state;
    if (frame.type === 'snapshot') {
      for (const r of frame.records) this.event(r.event.type, r.event.data);
    } else if (frame.type === 'event') {
      this.event(frame.event.type, frame.event.data);
    } else {
      const f = frame.frame;
      if (f.type === 'start') {
        this.attemptId = f.attemptId;
        s.text = '';
      } else if (f.type === 'chunk' && f.attemptId === this.attemptId) {
        const delta = AssistantTextDelta.safeParse(f.chunk);
        if (delta.success) s.text += delta.data.text;
      }
    }
    this.state = { ...s, committed: [...s.committed] };
    return this.state;
  }

  private event(type: string, data: unknown) {
    const s = this.state;
    if (type === 'turn/start') s.running = true;
    if (type === 'turn/end') {
      s.running = false;
      const parsed = TurnEndData.safeParse(data);
      if (parsed.success) {
        s.lastTurnEnd = parsed.data.reason.kind;
        s.lastTurnEndReason = parsed.data.reason;
      }
    }
    if (type === 'assistant/message') {
      const content = (data as { message?: { content?: unknown } })?.message?.content;
      if (Array.isArray(content)) {
        const text = content
          .filter(
            (p): p is { type: 'text'; text: string } => p?.type === 'text' && typeof p.text === 'string',
          )
          .map((p) => p.text)
          .join('');
        s.committed.push(text);
      }
    }
  }
}
