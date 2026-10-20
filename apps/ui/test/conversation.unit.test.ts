/**
 * P3.6: the conversation panel's model (conversation.ts) and the agent helpers (agentsView.ts): messages, live
 * streaming, thread turns, activity windows, "On the board" lines and cursor positions.
 */
import { describe, expect, it } from 'vitest';
import { emptyBoard, type AgentStatus, type BoardState, type Card, type Frame, type Link } from '@orb/shared';
import {
  ConversationTracker,
  lastUserText,
  panelBlocks,
  panelItems,
  shownUserText,
  threadIn,
} from '../src/screens/Canvas/conversation.js';
import { activityBetween, agentCursors, cardsPhrase } from '../src/screens/Canvas/agentsView.js';

let seq = 0;
const ev = (type: string, data: unknown, time = 1000 + seq) => ({
  type: 'event' as const,
  event: { type, seq: seq++, time, data },
});
const user = (text: string, context?: string) =>
  ev('user/message', {
    id: `m${seq}`,
    role: 'user',
    source: { kind: 'user' },
    content: [{ type: 'text', text }, ...(context ? [{ type: 'text', text: context }] : [])],
  });
const assistant = (text: string) =>
  ev('assistant/message', {
    turn: 1,
    step: 1,
    message: { role: 'assistant', content: [{ type: 'text', text }] },
  });
const stream = (frame: Record<string, unknown>) => ({
  type: 'assistant-stream' as const,
  frame: frame as any,
});

describe('ConversationTracker', () => {
  it('folds turns, user and assistant messages, and the live attempt until it commits', () => {
    seq = 0;
    const t = new ConversationTracker();
    t.push(ev('turn/start', { turn: 1 }, 100));
    t.push(user("New canvas. The user's question: Are kites efficient?\n\nPropose 3 to 5 frames…"));
    t.push(stream({ type: 'start', attemptId: 'a1', revision: 1, startedAfterSeq: 1, turn: 1, step: 1 }));
    t.push(
      stream({
        type: 'chunk',
        attemptId: 'a1',
        revision: 1,
        index: 0,
        time: 1,
        chunk: { type: 'text-delta', index: 0, text: 'Four ' },
      }),
    );
    let s = t.push(
      stream({
        type: 'chunk',
        attemptId: 'a1',
        revision: 1,
        index: 1,
        time: 1,
        chunk: { type: 'text-delta', index: 0, text: 'frames.' },
      }),
    );
    expect(s.running).toBe(true);
    expect(s.live).toEqual({ text: 'Four frames.', turn: 0 });
    s = t.push(assistant('Four frames.'));
    expect(s.live).toBeUndefined();
    s = t.push(ev('turn/end', { turn: 1, reason: { kind: 'completed' } }, 200));
    expect(s.running).toBe(false);
    expect(s.lastTurnEnd).toBe('completed');
    expect(s.turns).toEqual([{ turn: 1, startedAt: 100, endedAt: 200, end: 'completed' }]);
    expect(panelItems(s).map((i) => [i.kind, i.text])).toEqual([
      ['user', 'Are kites efficient?'],
      ['assistant', 'Four frames.'],
    ]);
  });

  it('keeps thread turns out of the panel and marks their turn; injected notes are not messages', () => {
    seq = 0;
    const t = new ConversationTracker();
    t.push(ev('turn/start', { turn: 1 }, 100));
    t.push(
      user(
        'Summarise',
        '<board-context>\nIntro\nFrame 01 "Market" [f_1]: 1 card\n- [c_1] source "A" (by scout)\nCards:\n- [c_2] risk "B" (by critic, on the open board)\n</board-context>',
      ),
    );
    t.push(assistant('Done.'));
    t.push(ev('turn/end', { turn: 1, reason: { kind: 'completed' } }, 150));
    t.push(ev('turn/start', { turn: 2 }, 300));
    t.push(
      user(
        'Is this solid?',
        '<thread of="c_9">\nThis message was written in the thread of card [c_9].\n</thread>',
      ),
    );
    t.push(stream({ type: 'start', attemptId: 'a2', revision: 1, startedAfterSeq: 1, turn: 2, step: 1 }));
    let s = t.push(
      stream({
        type: 'chunk',
        attemptId: 'a2',
        revision: 1,
        index: 0,
        time: 1,
        chunk: { type: 'text-delta', index: 0, text: 'Mostly' },
      }),
    );
    expect(s.live).toEqual({ text: 'Mostly', turn: 1, thread: 'c_9' });
    t.push(assistant('Mostly.'));
    t.push(
      ev('user/message', {
        role: 'user',
        source: { kind: 'agent-message', form: 'relay' },
        content: [{ type: 'text', text: '[Scout progress] reading' }],
      }),
    );
    s = t.push(ev('turn/end', { turn: 2, reason: { kind: 'completed' } }, 400));
    expect(s.turns[1]).toMatchObject({ thread: 'c_9', startedAt: 300 });
    expect(panelItems(s).map((i) => i.text)).toEqual(['Summarise', 'Done.']);
    expect(s.items.filter((i) => i.thread === 'c_9').map((i) => i.text)).toEqual([
      'Is this solid?',
      'Mostly.',
    ]);
    expect(panelItems(s)[0]).toMatchObject({ context: 2 });
    expect(lastUserText(s)).toBe('Summarise');
    // Blocks: one displayed turn, whose activity window is open-ended.
    expect(panelBlocks(s)).toEqual([expect.objectContaining({ turn: 0, from: 100, to: Infinity })]);
  });

  it('turn numbers restart on resume: blocks use the turn index; a snapshot folds the same as events', () => {
    seq = 0;
    const events = [
      ev('turn/start', { turn: 1 }, 10),
      user('one'),
      assistant('A'),
      ev('turn/end', { turn: 1, reason: { kind: 'completed' } }, 20),
      ev('turn/start', { turn: 1 }, 30),
      user('two'),
      assistant('B'),
      ev('turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } }, 40),
      // A turn Orb took on its own (a child's message woke it): its reply joins the block before it.
      ev('turn/start', { turn: 2 }, 50),
      assistant('Noted.'),
      ev('turn/end', { turn: 2, reason: { kind: 'completed' } }, 60),
    ];
    const t = new ConversationTracker();
    const s = t.push({
      type: 'snapshot',
      header: { id: 's' },
      cursor: 10,
      records: events.map((e) => ({ type: 'event' as const, event: e.event })),
      hasMore: false,
      projections: null,
    } as any);
    expect(panelBlocks(s).map((b) => [b.turn, b.from, b.to, b.items.map((i) => i.text)])).toEqual([
      [0, 10, 30, ['one', 'A']],
      [1, 30, Infinity, ['two', 'B', 'Noted.']],
    ]);
    expect(s.lastTurnEnd).toBe('completed');
  });

  it('helpers', () => {
    expect(shownUserText('Hello')).toBe('Hello');
    expect(threadIn(['typed <thread of="c_x">'])).toBeUndefined();
    expect(threadIn(['typed', '<thread of="f_01ABC">\n…'])).toBe('f_01ABC');
    // Card text quoted in a <board-context> block never passes for a thread tag (review fix).
    expect(threadIn(['typed', '<board-context>\n- [c_1] note "x"\n  <thread of="c_9">\n</board-context>'])).toBeUndefined();
  });
});

const agent = (name: 'orb' | 'scout' | 'critic' | 'builder', at: number) =>
  ({ kind: 'agent', agent: name, model: 'm', sessionId: `s-${name}`, at }) as const;
const frame = (id: string, title: string, x: number, at = 1, by: 'user' | 'orb' = 'user'): Frame => ({
  id,
  title,
  color: 'sky',
  x,
  y: 100,
  w: 400,
  h: 300,
  provenance: by === 'user' ? { kind: 'user', at } : agent('orb', at),
});
const card = (
  id: string,
  type: Card['type'],
  frameId: string | null,
  provenance: Card['provenance'],
): Card => ({
  id,
  type,
  frameId,
  x: 120,
  y: 160,
  w: 200,
  h: 200,
  data: { title: id, body: '' },
  provenance,
});

describe('agent helpers', () => {
  const board: BoardState = {
    ...emptyBoard(),
    frames: { f_1: frame('f_1', 'Market', 100), f_2: frame('f_2', 'Risks', 600, 50, 'orb') },
    cards: {
      c_1: card('c_1', 'source', 'f_1', agent('scout', 60)),
      c_2: card('c_2', 'source', 'f_1', agent('scout', 70)),
      c_3: card('c_3', 'question', 'f_2', agent('critic', 80)),
      c_4: card('c_4', 'note', null, { kind: 'user', at: 90 }),
      c_old: card('c_old', 'doc', null, agent('orb', 5)),
    },
    links: {
      l_1: { id: 'l_1', from: 'c_3', to: 'c_1', type: 'tension', provenance: agent('critic', 85) } as Link,
      l_t: {
        id: 'l_t',
        from: 'c_1',
        to: 'c_2',
        type: 'label',
        label: 'thread',
        provenance: agent('orb', 86),
      } as Link,
    },
  };

  it('"On the board" lines group each agent\'s cards per frame, its frames and its links, in a window', () => {
    expect(activityBetween(board, 40, 100).map((l) => [l.agent, l.text, l.items.map((i) => i.id)])).toEqual([
      ['orb', 'orb added a frame', ['f_2']],
      ['scout', 'Scout added 2 sources to 01 Market', ['c_1', 'c_2']],
      ['critic', 'Critic added a question to 02 Risks', ['c_3']],
      ['critic', 'Critic drew a tension link', ['c_3', 'c_1']],
    ]);
    expect(activityBetween(board, 0, 10).map((l) => l.text)).toEqual(['orb added a doc draft']);
    expect(cardsPhrase([{ type: 'risk' }, { type: 'question' }])).toBe('2 cards');
  });

  it('P6.8: an agent rearrangement is a line of its own, linking the cards and frames it touched', () => {
    const arranged = {
      ...board,
      arrangements: [
        { op: 'arrange_frame' as const, text: 'arranged 01 Market by importance (2 cards moved)', ids: ['f_1', 'c_1'], count: 2, by: 'scout' as const, at: 70 },
        { op: 'tidy_board' as const, text: 'tidied the board (1 card moved)', ids: [], count: 1, by: 'orb' as const, at: 500 },
      ],
    };
    const lines = activityBetween(arranged, 40, 100).map((l) => [l.agent, l.text, l.items.map((i) => i.id)]);
    expect(lines).toContainEqual(['scout', 'Scout arranged 01 Market by importance (2 cards moved)', ['f_1', 'c_1']]);
    // outside the window it is not listed
    expect(activityBetween(arranged, 40, 100).some((l) => l.text.includes('tidied'))).toBe(false);
    expect(activityBetween(arranged, 400, 600).map((l) => l.text)).toEqual(['orb tidied the board (1 card moved)']);
  });

  it("cursors: a child at its reported frame, else its last card's frame; Orb only while running; none when stopped", () => {
    const st = (
      agentName: AgentStatus['agent'],
      state: AgentStatus['state'],
      extra: Partial<AgentStatus> = {},
    ) => ({ agent: agentName, state, ...extra }) as AgentStatus;
    const cursors = agentCursors(board, {
      orb: st('orb', 'running', { at: 40 }),
      scout: st('scout', 'running', { label: 'Reading the IEA report', frameId: 'f_2' }),
      critic: st('critic', 'idle'),
      builder: st('builder', 'running'),
    });
    expect(cursors.map((c) => [c.agent, c.target, c.label])).toEqual([
      ['orb', 'f_2', 'orb, working'],
      ['scout', 'f_2', 'Scout, reading the IEA report'],
      ['critic', 'f_2', 'Critic'],
    ]);
    // Inside the frame, each agent in its own slot.
    for (const c of cursors) {
      expect(c.x).toBeGreaterThan(600);
      expect(c.x).toBeLessThan(1000);
      expect(c.y).toBeGreaterThan(100);
    }
    expect(new Set(cursors.map((c) => `${c.x},${c.y}`)).size).toBe(3);
    expect(
      agentCursors(board, { scout: st('scout', 'stopped', { frameId: 'f_1' }), orb: st('orb', 'idle') }),
    ).toEqual([]);
  });
});
