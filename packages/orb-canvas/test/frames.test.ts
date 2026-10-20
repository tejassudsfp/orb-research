/**
 * P3.3 unit tests: Orb's frame and link tools (`add_frame`, `update_frame`, `add_link`) against a real CanvasStore,
 * the frame layout (`placeFrame`), the chat context text (`contextText` / `chatContext`) and the session role cache
 * the preset guard reads (`roleOfSession`). The dsh wiring is covered by apps/ui/test/orb-root.contract.test.ts.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ATTACHED_HEADER,
  TEMPLATE_LAYOUT,
  fold,
  templateFrames,
  type AgentName,
  type BoardEvent,
} from '@orb/shared';
import { CONTEXT_MAX_CHARS, contextText } from '../src/context.js';
import { placeFrame } from '../src/layout.js';
import { CanvasStore, FRAME_TONES, MAX_FRAMES } from '../src/store.js';
import { addFrame, addLink, placeCard, updateFrame, type BoardToolExec } from '../src/tools.js';

let home: string;
let store: CanvasStore;
let canvasId: string;

const SESSIONS: Record<AgentName, string> = {
  orb: 'orb-session-1',
  scout: 'scout-session-1',
  critic: 'critic-session-1',
  builder: 'builder-session-1',
};

const as = (role: AgentName, callId = 'call_1'): BoardToolExec => ({
  callId,
  signal: new AbortController().signal,
  agent: {
    id: SESSIONS[role],
    options: { provider: 'openai', model: 'gpt-6-luna' },
    session: { header: { cwd: store.dirOf(canvasId) } },
  },
});

async function readLog(id = canvasId): Promise<BoardEvent[]> {
  await store.flush();
  return readFileSync(join(store.dirOf(id), 'board.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as BoardEvent);
}

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-frames-'));
  store = new CanvasStore({ home, flushMs: 5 });
  canvasId = (await store.create({ prompt: 'Frames' })).id;
  await store.setRootSession(canvasId, SESSIONS.orb);
  await store.setChildAgent(canvasId, 'scout', SESSIONS.scout);
  await store.setChildAgent(canvasId, 'critic', SESSIONS.critic);
  await store.setChildAgent(canvasId, 'builder', SESSIONS.builder);
});

afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

describe('add_frame', () => {
  it('places frames on the template grid with Orb provenance, off the undo stack', async () => {
    const titles = ['Thesis', 'Market', 'Competitors', 'Prototype', 'Open questions'];
    const results = [];
    for (const [i, title] of titles.entries())
      results.push(await addFrame(store, { title }, as('orb', `call_f${i}`)));
    expect(results.map((r) => [r.number, r.title, r.created])).toEqual(
      titles.map((t, i) => [String(i + 1).padStart(2, '0'), t, true]),
    );
    const frames = (await readLog()).map((e) => (e.data as any).frame);
    // Exactly where a five-frame template puts its frames, in the template tone sequence.
    expect(frames.map((f: any) => ({ x: f.x, y: f.y, w: f.w, h: f.h }))).toEqual(
      templateFrames('topic').map(({ x, y, w, h }) => ({ x, y, w, h })),
    );
    expect(frames.map((f: any) => f.color)).toEqual([...FRAME_TONES]);
    expect(frames[0].provenance).toMatchObject({
      kind: 'agent',
      agent: 'orb',
      model: 'gpt-6-luna',
      provider: 'openai',
      sessionId: SESSIONS.orb,
      toolCallId: 'call_f0',
    });
    expect(await store.history(canvasId)).toEqual({ undo: 0, redo: 0 });
  });

  it('never adds a frame twice (same title, case and spacing ignored) and honours a colour', async () => {
    const a = await addFrame(store, { title: 'Open questions', color: 'paper' }, as('orb'));
    const b = await addFrame(store, { title: '  open   QUESTIONS ' }, as('orb'));
    expect(b).toEqual({ ...a, created: false });
    expect((await store.board(canvasId)).frames()).toHaveLength(1);
    expect((await store.board(canvasId)).frames()[0]!.color).toBe('paper');
  });

  it('keeps clear of user frames and cards, and caps a board at MAX_FRAMES', async () => {
    // A user frame where the first slot would be, and a user note where the second would be.
    await store.userCommand(canvasId, {
      type: 'frame.added',
      frame: { title: 'Mine', color: 'sky', x: 100, y: 130, w: 300, h: 200 },
    });
    const { originX, originY, w, gap } = TEMPLATE_LAYOUT;
    await store.userCommand(canvasId, {
      type: 'card.added',
      card: {
        type: 'note',
        frameId: null,
        x: originX + w + gap + 10,
        y: originY + 10,
        w: 200,
        h: 100,
        data: { text: 'n' },
      },
    });
    const r = await addFrame(store, { title: 'Agent frame' }, as('orb'));
    const frame = (await store.board(canvasId)).current.frames[r.frameId]!;
    expect([frame.x, frame.y]).toEqual([originX + 2 * (w + gap), originY]);
    for (let i = 0; frame && (await store.board(canvasId)).frames().length < MAX_FRAMES; i++) {
      await addFrame(store, { title: `F${i}` }, as('orb'));
    }
    await expect(addFrame(store, { title: 'One too many' }, as('orb'))).rejects.toThrow(/at most 24/);
    // No two frames overlap.
    const frames = (await store.board(canvasId)).frames();
    for (const f of frames)
      for (const o of frames)
        if (f !== o)
          expect(f.x < o.x + o.w && f.x + f.w > o.x && f.y < o.y + o.h && f.y + f.h > o.y).toBe(false);
  });

  it('is Orb-only (§2.4) and validates its arguments', async () => {
    for (const role of ['scout', 'critic', 'builder'] as const) {
      await expect(addFrame(store, { title: 'X' }, as(role))).rejects.toThrow(
        `add_frame is not available to the ${role} agent`,
      );
    }
    await expect(addFrame(store, { title: '' }, as('orb'))).rejects.toThrow(/title/);
    await expect(addFrame(store, { title: 'X', x: 5 }, as('orb'))).rejects.toThrow(/x/);
    await expect(addFrame(store, { title: 'X', color: 'red' }, as('orb'))).rejects.toThrow(/color/);
    expect(await readLog()).toEqual([]);
  });

  it('honours exec.signal', async () => {
    const ac = new AbortController();
    ac.abort(new Error('stopped'));
    await expect(addFrame(store, { title: 'X' }, { ...as('orb'), signal: ac.signal })).rejects.toThrow(
      'stopped',
    );
    expect(await readLog()).toEqual([]);
  });
});

describe('placeFrame', () => {
  it('fills the template grid in reading order, then goes below everything when no slot is free', () => {
    const empty = fold([]);
    expect(placeFrame(empty)).toEqual({ x: 96, y: 120, w: 400, h: 300 });
    const big = fold([
      {
        v: 1,
        seq: 0,
        ts: 1,
        type: 'frame.added',
        actor: { kind: 'user' },
        data: {
          frame: {
            id: 'f_big',
            title: 'Big',
            color: 'sky',
            x: -1e6,
            y: -1e6,
            w: 3e6,
            h: 1e6 + 100_000,
            provenance: { kind: 'user', at: 1 },
          },
        },
      },
    ] as BoardEvent[]);
    const r = placeFrame(big);
    expect(r.x).toBe(96);
    expect(r.y).toBe(100_000 + 48);
  });
});

describe('update_frame', () => {
  it('renames and recolours (any frame), never moves or resizes', async () => {
    const { frameId } = await addFrame(store, { title: 'Market' }, as('orb'));
    expect(
      await updateFrame(store, { frameId, title: ' Market  size ', color: 'rho' }, as('orb', 'call_u')),
    ).toEqual({
      frameId,
      title: 'Market size',
      color: 'rho',
    });
    const user = await store.userCommand(canvasId, {
      type: 'frame.added',
      frame: { title: 'Notes', color: 'sky', x: 2000, y: 0, w: 300, h: 200 },
    });
    const userFrame = (user.events[0]!.data as any).frame.id as string;
    await updateFrame(store, { frameId: userFrame, title: 'My notes' }, as('orb'));
    await expect(updateFrame(store, { frameId, x: 10 }, as('orb'))).rejects.toThrow(/x/);
    await expect(updateFrame(store, { frameId }, as('orb'))).rejects.toThrow(/nothing to update/);
    await expect(updateFrame(store, { frameId: 'f_nope', title: 'X' }, as('orb'))).rejects.toThrow(
      /no frame/,
    );
    await expect(updateFrame(store, { frameId, title: 'X' }, as('scout'))).rejects.toThrow(
      /not available to the scout/,
    );
    const updates = (await readLog()).filter((e) => e.type === 'frame.updated');
    expect(updates.map((e) => e.data)).toEqual([
      { id: frameId, patch: { title: 'Market size', color: 'rho' } },
      { id: userFrame, patch: { title: 'My notes' } },
    ]);
    expect(updates[0]!.actor).toMatchObject({ kind: 'agent', agent: 'orb', toolCallId: 'call_u' });
  });
});

describe('add_link', () => {
  it('links cards and frames once, for Orb, Scout and Critic only', async () => {
    const { frameId } = await addFrame(store, { title: 'Thesis' }, as('orb'));
    const q = (await placeCard(
      store,
      { type: 'question', frameId, title: 'Q?', body: 'b', why: 'w' },
      as('critic'),
      { delayMs: 0 },
    )) as { cardId: string };
    const s = (await placeCard(
      store,
      { type: 'source', frameId, title: 'S', url: 'https://example.org', body: 'b', why: 'w' },
      as('scout'),
      { delayMs: 0 },
    )) as { cardId: string };
    const made = await addLink(store, { from: s.cardId, to: q.cardId, type: 'supports' }, as('scout'));
    expect(made.created).toBe(true);
    // The same link either way round is not drawn twice; another type is a new link.
    expect(await addLink(store, { from: q.cardId, to: s.cardId, type: 'supports' }, as('critic'))).toEqual({
      ...made,
      created: false,
    });
    expect(
      (await addLink(store, { from: q.cardId, to: frameId, type: 'tension' }, as('critic'))).created,
    ).toBe(true);
    const label = await addLink(
      store,
      { from: s.cardId, to: frameId, type: 'label', label: 'see' },
      as('orb'),
    );
    expect(label.created).toBe(true);
    await expect(addLink(store, { from: s.cardId, to: frameId, type: 'label' }, as('orb'))).rejects.toThrow(
      /label link needs a label/,
    );
    await expect(
      addLink(store, { from: s.cardId, to: s.cardId, type: 'supports' }, as('orb')),
    ).rejects.toThrow(/two different ends/);
    await expect(
      addLink(store, { from: s.cardId, to: 'c_nope', type: 'supports' }, as('orb')),
    ).rejects.toThrow(/no card/);
    await expect(
      addLink(store, { from: s.cardId, to: q.cardId, type: 'supports' }, as('builder')),
    ).rejects.toThrow(/add_link is not available to the builder agent/);
    const links = (await readLog()).filter((e) => e.type === 'link.added').map((e) => (e.data as any).link);
    expect(links.map((l: any) => [l.type, l.provenance.agent, l.label])).toEqual([
      ['supports', 'scout', undefined],
      ['tension', 'critic', undefined],
      ['label', 'orb', 'see'],
    ]);
  });
});

describe('chat context', () => {
  it('renders frames, cards and the thread card as describe() text, with ids and no coordinates', async () => {
    const { frameId } = await addFrame(store, { title: 'Thesis' }, as('orb'));
    const q = (await placeCard(
      store,
      { type: 'question', frameId, title: 'Does Y hold?', body: 'Small samples.', why: 'Key gap.' },
      as('critic'),
      { delayMs: 0 },
    )) as { cardId: string };
    const note = await store.userCommand(canvasId, {
      type: 'card.added',
      card: { type: 'note', frameId: null, x: 3000, y: 3000, w: 200, h: 100, data: { text: 'My hunch' } },
    });
    const noteId = (note.events[0]!.data as any).card.id as string;
    const text = (await store.chatContext(canvasId, {
      context: { frameIds: [frameId], cardIds: [q.cardId, noteId] },
      threadOf: q.cardId,
    }))!;
    expect(text).toContain('<board-context>');
    expect(text).toContain(`Frame 01 "Thesis" [${frameId}]: 1 card`);
    expect(text).toContain(`- [${q.cardId}] question "Does Y hold?" (by critic)`);
    expect(text).toContain('Why: Key gap.');
    // The question is listed once with its frame; the loose note says where it is.
    expect(text.split(`- [${q.cardId}]`)).toHaveLength(3); // once in context, once in the thread
    expect(text).toContain(`- [${noteId}] note "My hunch" (by user, on the open board)`);
    // The thread block opens the context part (orb-agents and the UI match the tag only there).
    expect(text.startsWith(`<thread of="${q.cardId}">\n`)).toBe(true);
    expect(text).not.toMatch(/3000|"x"/);
    // A frame thread lists the frame.
    expect(await store.chatContext(canvasId, { threadOf: frameId })).toContain(
      `This message was written in the thread of frame 01 "Thesis" [${frameId}]`,
    );
    expect(await store.chatContext(canvasId, {})).toBeUndefined();
    await expect(store.chatContext(canvasId, { context: { frameIds: ['f_nope'] } })).rejects.toMatchObject({
      code: 'orb/not-found',
    });
    await expect(store.chatContext(canvasId, { threadOf: 'c_nope' })).rejects.toMatchObject({
      code: 'orb/not-found',
    });
  });

  it('P6.1: lists attached cards first, once, in their own block', async () => {
    const { frameId } = await addFrame(store, { title: 'Evidence' }, as('orb'));
    const added = await store.userCommand(canvasId, {
      type: 'card.added',
      card: {
        type: 'note',
        frameId,
        x: 10,
        y: 70,
        w: 200,
        h: 100,
        data: { title: 'memo', body: 'Revenue grew 40%.' },
      },
    });
    const attachedId = (added.events[0]!.data as any).card.id as string;
    const text = (await store.chatContext(canvasId, {
      context: { frameIds: [frameId], cardIds: [attachedId], attachmentIds: [attachedId] },
    }))!;
    const block = /<board-context>\n[^\n]*\n([\s\S]*)<\/board-context>/.exec(text)![1]!;
    expect(block.startsWith(`${ATTACHED_HEADER}\n- [${attachedId}] note "memo" (by user, in frame `)).toBe(
      true,
    );
    expect(block).toContain('Revenue grew 40%.');
    // Its frame lists it too, but the loose "Cards:" block does not repeat it.
    expect(block).not.toContain('Cards:');
    // Attachments alone are context as well.
    expect(await store.chatContext(canvasId, { context: { attachmentIds: [attachedId] } })).toContain(
      ATTACHED_HEADER,
    );
    await expect(
      store.chatContext(canvasId, { context: { attachmentIds: ['c_nope'] } }),
    ).rejects.toMatchObject({ code: 'orb/not-found' });
  });

  it('cuts very long context', () => {
    const cards = Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [
        `c_${i}`,
        {
          id: `c_${i}`,
          type: 'doc',
          frameId: null,
          x: 0,
          y: 0,
          w: 1,
          h: 1,
          data: { title: `T${i}`, body: 'word '.repeat(2000) },
          provenance: { kind: 'user', at: 1 },
        },
      ]),
    );
    const state = { ...fold([]), cards } as any;
    const text = contextText(state, { context: { cardIds: Object.keys(cards) } })!;
    expect(text.length).toBeLessThanOrEqual(CONTEXT_MAX_CHARS + 60);
    // P6.8: 50 cards in context list the first 25, each clipped, and say where the rest is.
    expect(text).toContain('- … 25 more cards in context (use board_map, search_board and read_card)');
    expect(text).not.toContain('word '.repeat(150));
    // Many frames in context are cut at the budget, with the same pointer.
    const frames = Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [`f_${i}`, { id: `f_${i}`, title: `F${i}`, color: 'sky', x: 0, y: 0, w: 1, h: 1, provenance: { kind: 'user', at: 1 } }]),
    );
    const framed = Object.fromEntries(
      Object.entries(cards).map(([id, c], i) => [id, { ...(c as object), frameId: `f_${i % 12}` }]),
    );
    const cut = contextText({ ...fold([]), cards: framed, frames } as any, { context: { frameIds: Object.keys(frames) } })!;
    expect(cut.length).toBeLessThanOrEqual(CONTEXT_MAX_CHARS + 60);
    expect(cut).toMatch(/context cut; use board_map, search_board and read_card\)$/);
  });
});

describe('roleOfSession (the preset guard lookup)', () => {
  it('knows the root and child sessions of every canvas.json read or written', async () => {
    expect(store.roleOfSession(SESSIONS.orb)).toBe('orb');
    expect(store.roleOfSession(SESSIONS.scout)).toBe('scout');
    expect(store.roleOfSession(SESSIONS.builder)).toBe('builder');
    expect(store.roleOfSession('someone-else')).toBeUndefined();
    const fresh = new CanvasStore({ home, flushMs: 5 });
    expect(fresh.roleOfSession(SESSIONS.critic)).toBeUndefined();
    await fresh.open(canvasId);
    expect(fresh.roleOfSession(SESSIONS.critic)).toBe('critic');
    await fresh.close();
  });
});
