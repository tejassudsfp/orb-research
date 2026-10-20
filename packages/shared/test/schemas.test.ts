import { describe, expect, it } from 'vitest';
import { parseBoardEvent, isToolAllowed, AGENT_TOOLS } from '../src/index.js';

const agentActor = { kind: 'agent', agent: 'orb', model: 'deepseek/deepseek-chat', sessionId: 's1' } as const;

describe('board event schema', () => {
  it('accepts a valid card.added', () => {
    const ev = parseBoardEvent({
      v: 1,
      seq: 0,
      ts: 1,
      type: 'card.added',
      actor: agentActor,
      data: {
        card: {
          id: 'c_01',
          type: 'source',
          frameId: null,
          x: 0,
          y: 0,
          w: 240,
          h: 160,
          data: { title: 't' },
          why: 'because',
          provenance: { ...agentActor, at: 1 },
        },
      },
    });
    expect(ev.type).toBe('card.added');
  });

  it('rejects unknown event types and bad payloads', () => {
    expect(() =>
      parseBoardEvent({ v: 1, seq: 0, ts: 1, type: 'orb/x', actor: { kind: 'user' }, data: {} }),
    ).toThrow();
    expect(() =>
      parseBoardEvent({ v: 1, seq: 0, ts: 1, type: 'card.moved', actor: { kind: 'user' }, data: { id: 1 } }),
    ).toThrow();
  });

  it('rejects a why longer than 140 chars', () => {
    expect(() =>
      parseBoardEvent({
        v: 1,
        seq: 0,
        ts: 1,
        type: 'card.added',
        actor: { kind: 'user' },
        data: {
          card: {
            id: 'c_1',
            type: 'note',
            frameId: null,
            x: 0,
            y: 0,
            w: 1,
            h: 1,
            data: {},
            why: 'x'.repeat(141),
            provenance: { kind: 'user', at: 1 },
          },
        },
      }),
    ).toThrow();
  });
});

describe('allow-lists', () => {
  it('never allows forbidden tools', () => {
    for (const tool of ['bash', 'read', 'workflow', 'job_start', 'cordis_eval', 'subagent', 'run_code']) {
      for (const agent of Object.keys(AGENT_TOOLS) as (keyof typeof AGENT_TOOLS)[]) {
        expect(isToolAllowed(agent, tool)).toBe(false);
      }
    }
  });
  it('allows listed tools', () => {
    expect(isToolAllowed('orb', 'place_card')).toBe(true);
    expect(isToolAllowed('critic', 'web_search')).toBe(false);
  });
});
