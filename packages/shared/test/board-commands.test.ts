/**
 * P2.3: the fold of every board event type the board folds, and `planCommand` (the command → changes mapping the
 * canvas service and the UI share).
 */
import { describe, expect, it } from 'vitest';
import {
  BoardCommand,
  BoardCommandError,
  applyChanges,
  applyEvent,
  boardLinks,
  emptyBoard,
  fold,
  parseBoardEvent,
  planCommand,
  type Actor,
  type BoardEvent,
  type BoardEventType,
  type BoardState,
  type Card,
  type Frame,
  type Link,
} from '../src/index.js';

const user: Actor = { kind: 'user' };
const agent: Actor = { kind: 'agent', agent: 'critic', model: 'm', sessionId: 's' };
const card = (id: string, extra: Partial<Card> = {}): Card => ({
  id,
  type: 'note',
  frameId: null,
  x: 0,
  y: 0,
  w: 200,
  h: 120,
  data: { title: id },
  provenance: { ...user, at: 1 },
  ...extra,
});
const frame = (id: string, extra: Partial<Frame> = {}): Frame => ({
  id,
  title: 'Thesis',
  color: 'sky',
  x: 0,
  y: 0,
  w: 600,
  h: 400,
  provenance: { ...user, at: 1 },
  ...extra,
});
const link = (id: string, from: string, to: string, extra: Partial<Link> = {}): Link => ({
  id,
  from,
  to,
  type: 'supports',
  provenance: { ...user, at: 1 },
  ...extra,
});

/** Build contiguous events from (type, data) pairs. */
function events(...changes: [BoardEventType, unknown][]): BoardEvent[] {
  return changes.map(([type, data], seq) => parseBoardEvent({ v: 1, seq, ts: seq, type, actor: user, data }));
}

/** A board with frame f_a holding c_a, a loose card c_b, and links c_a→c_b and f_a→c_b. */
const base = () =>
  events(
    ['frame.added', { frame: frame('f_a') }],
    ['card.added', { card: card('c_a', { frameId: 'f_a', x: 10, y: 20 }) }],
    ['card.added', { card: card('c_b', { x: 900 }) }],
    ['link.added', { link: link('l_1', 'c_a', 'c_b', { type: 'tension' }) }],
    ['link.added', { link: link('l_2', 'f_a', 'c_b') }],
  );

/** Fold `base()` plus more events (seq continues). */
function after(...more: [BoardEventType, unknown][]): BoardState {
  const head = base();
  const tail = more.map(([type, data], i) =>
    parseBoardEvent({ v: 1, seq: head.length + i, ts: 0, type, actor: user, data }),
  );
  return fold([...head, ...tail]);
}

describe('board fold, every event type (P2.3)', () => {
  it('frame.added / card.added / link.added build the board in insertion order', () => {
    const s = fold(base());
    expect(s.seq).toBe(4);
    expect(Object.keys(s.frames)).toEqual(['f_a']);
    expect(Object.keys(s.cards)).toEqual(['c_a', 'c_b']);
    expect(boardLinks(s).map((l) => [l.id, l.from, l.to, l.type])).toEqual([
      ['l_1', 'c_a', 'c_b', 'tension'],
      ['l_2', 'f_a', 'c_b', 'supports'],
    ]);
  });

  it('frame.updated renames, recolours, moves and resizes; keeps the frame order; ignores unknown ids', () => {
    const s = after(
      ['frame.added', { frame: frame('f_b', { title: 'Market' }) }],
      ['frame.updated', { id: 'f_a', patch: { title: 'Open questions', color: 'paper' } }],
      ['frame.updated', { id: 'f_a', patch: { x: 50, y: 60, w: 700, h: 500 } }],
      ['frame.updated', { id: 'f_zz', patch: { title: 'Nope' } }],
    );
    expect(s.seq).toBe(8);
    expect(Object.keys(s.frames)).toEqual(['f_a', 'f_b']);
    expect(s.frames['f_a']).toMatchObject({
      title: 'Open questions',
      color: 'paper',
      x: 50,
      y: 60,
      w: 700,
      h: 500,
    });
    expect(s.frames['f_zz']).toBeUndefined();
    // Moving a frame alone does not move its cards (the UI sends their moves in the same batch).
    expect(s.cards['c_a']).toMatchObject({ x: 10, y: 20 });
  });

  it('frame.removed drops the frame and its links, keeps its cards with frameId null', () => {
    const s = after(['frame.removed', { id: 'f_a' }]);
    expect(s.frames).toEqual({});
    expect(s.cards['c_a']).toMatchObject({ frameId: null, x: 10, y: 20 });
    expect(Object.keys(s.links)).toEqual(['l_1']);
    expect(after(['frame.removed', { id: 'f_zz' }]).frames).toHaveProperty('f_a');
  });

  it('card.moved: one event moves a group, can re-home cards, and still reads the Phase 1 form', () => {
    const s = after(
      [
        'card.moved',
        {
          moves: [
            { id: 'c_a', x: 1000, y: 5, frameId: null },
            { id: 'c_b', x: 30, y: 40, frameId: 'f_a' },
            { id: 'c_zz', x: 0, y: 0 },
          ],
        },
      ],
      ['card.moved', { id: 'c_a', x: 1001, y: 6 }],
    );
    expect(s.cards['c_a']).toMatchObject({ x: 1001, y: 6, frameId: null });
    expect(s.cards['c_b']).toMatchObject({ x: 30, y: 40, frameId: 'f_a' });
    expect(s.cards['c_zz']).toBeUndefined();
  });

  it('card.updated resizes and patches content; badge null clears the badge', () => {
    const s = after(
      ['card.updated', { id: 'c_a', patch: { w: 320, h: 260, badge: 'must', note: 'mine' } }],
      ['card.updated', { id: 'c_b', patch: { data: { title: 'Renamed' }, frameId: 'f_a' } }],
    );
    expect(s.cards['c_a']).toMatchObject({ w: 320, h: 260, badge: 'must', note: 'mine', x: 10 });
    expect(s.cards['c_b']).toMatchObject({ data: { title: 'Renamed' }, frameId: 'f_a' });
    const cleared = applyEvent(
      s,
      parseBoardEvent({
        v: 1,
        seq: s.seq + 1,
        ts: 0,
        type: 'card.updated',
        actor: user,
        data: { id: 'c_a', patch: { badge: null } },
      }),
    );
    expect(cleared.cards['c_a']).not.toHaveProperty('badge');
  });

  it('card.removed drops several cards and every link that touches them', () => {
    const s = after(['card.removed', { ids: ['c_b', 'c_zz'] }]);
    expect(Object.keys(s.cards)).toEqual(['c_a']);
    expect(s.links).toEqual({});
  });

  it('card.opened marks a card opened', () => {
    expect(after(['card.opened', { id: 'c_b' }]).cards['c_b']!.opened).toBe(true);
  });

  it('link.removed drops links; a link added to a missing end is ignored', () => {
    const s = after(
      ['link.removed', { ids: ['l_1'] }],
      ['link.added', { link: link('l_3', 'c_a', 'c_missing') }],
    );
    expect(Object.keys(s.links)).toEqual(['l_2']);
  });

  it('types not folded yet only advance seq', () => {
    // thread.message is folded since P3.6 (fold.test.ts).
    for (const type of ['context.changed', 'viewport.saved'] as const) {
      const s = after([type, {}]);
      expect(s.seq).toBe(5);
      expect(s).toEqual({ ...fold(base()), seq: 5 });
    }
    // undo.marker (P2.4) has a payload schema but changes nothing itself.
    const s = after(['undo.marker', { op: 'undo', count: 1 }]);
    expect(s).toEqual({ ...fold(base()), seq: 5 });
    expect(() => after(['undo.marker', {}])).toThrow();
  });

  it('validates payloads of every folded type', () => {
    const bad: [BoardEventType, unknown][] = [
      ['frame.updated', { id: 'f_a', patch: {} }],
      ['frame.updated', { id: 'f_a', patch: { color: 'red' } }],
      ['frame.updated', { id: 'f_a', patch: { w: 0 } }],
      ['frame.removed', { id: 'c_a' }],
      ['card.moved', { moves: [] }],
      ['card.updated', { id: 'c_a', patch: { provenance: user } }],
      ['card.removed', { ids: [] }],
      ['link.added', { link: link('l_x', 'c_a', 'c_a') }],
      ['link.added', { link: link('l_x', 'c_a', 'c_b', { type: 'label' }) }],
      ['link.added', { link: { ...link('l_x', 'c_a', 'c_b'), type: 'blocks' } }],
      ['link.removed', { ids: ['c_a'] }],
    ];
    for (const [type, data] of bad) {
      expect(() => parseBoardEvent({ v: 1, seq: 0, ts: 0, type, actor: user, data }), type).toThrow();
    }
    expect(
      parseBoardEvent({
        v: 1,
        seq: 0,
        ts: 0,
        type: 'link.added',
        actor: user,
        data: { link: link('l_x', 'c_a', 'f_b', { type: 'label', label: 'see also' }) },
      }).type,
    ).toBe('link.added');
  });

  it('keeps untouched records and cards identical', () => {
    const s0 = fold(base());
    const s1 = after(['link.removed', { ids: ['l_2'] }]);
    expect(s1.cards).toEqual(s0.cards);
    const s2 = applyEvent(
      s0,
      parseBoardEvent({
        v: 1,
        seq: 5,
        ts: 0,
        type: 'card.moved',
        actor: user,
        data: { moves: [{ id: 'c_b', x: 1, y: 1 }] },
      }),
    );
    expect(s2.frames).toBe(s0.frames);
    expect(s2.links).toBe(s0.links);
    expect(s2.cards['c_a']).toBe(s0.cards['c_a']);
  });
});

describe('planCommand', () => {
  let n = 0;
  const ctx = (actor: Actor = user) => ({ actor, now: 42, mintId: (p: 'c' | 'f' | 'l') => `${p}_${++n}` });
  const plan = (state: BoardState, command: unknown, actor?: Actor) =>
    planCommand(state, BoardCommand.parse(command), ctx(actor));
  const s = () => fold(base());

  it('mints ids and stamps provenance for adds', () => {
    const [f] = plan(emptyBoard(), {
      type: 'frame.added',
      frame: { title: 'Market', color: 'rho', x: 0, y: 0, w: 100, h: 100 },
    });
    expect(f).toMatchObject({
      type: 'frame.added',
      data: { frame: { title: 'Market', provenance: { kind: 'user', at: 42 } } },
    });
    expect((f!.data as { frame: Frame }).frame.id).toMatch(/^f_/);
    const [l] = plan(s(), {
      type: 'link.added',
      link: { from: 'c_a', to: 'f_a', type: 'leads-to', label: 'dropped' },
    });
    expect((l!.data as { link: Link }).link).not.toHaveProperty('label');
  });

  it('rejects unknown ids with not-found', () => {
    const cases = [
      { type: 'frame.updated', id: 'f_zz', patch: { title: 'x' } },
      { type: 'frame.removed', id: 'f_zz' },
      { type: 'card.moved', moves: [{ id: 'c_zz', x: 0, y: 0 }] },
      { type: 'card.moved', moves: [{ id: 'c_a', x: 0, y: 0, frameId: 'f_zz' }] },
      { type: 'card.updated', id: 'c_zz', patch: { w: 300 } },
      { type: 'card.removed', ids: ['c_a', 'c_zz'] },
      { type: 'card.added', card: { type: 'note', frameId: 'f_zz', x: 0, y: 0, w: 1, h: 1, data: {} } },
      { type: 'link.added', link: { from: 'c_a', to: 'c_zz', type: 'supports' } },
      { type: 'link.removed', ids: ['l_zz'] },
    ];
    for (const c of cases) {
      let err: unknown;
      try {
        plan(s(), c);
      } catch (e) {
        err = e;
      }
      expect(err, JSON.stringify(c)).toBeInstanceOf(BoardCommandError);
      expect((err as BoardCommandError).code).toBe('not-found');
    }
  });

  it('rejects a card listed twice in one move and a mixed move form', () => {
    expect(() =>
      plan(s(), {
        type: 'card.moved',
        moves: [
          { id: 'c_a', x: 0, y: 0 },
          { id: 'c_a', x: 1, y: 1 },
        ],
      }),
    ).toThrow(/twice/);
    expect(() =>
      plan(s(), { type: 'card.moved', id: 'c_a', x: 1, y: 1, moves: [{ id: 'c_a', x: 0, y: 0 }] }),
    ).toThrow();
    expect(() => plan(s(), { type: 'card.moved', id: 'c_a' })).toThrow();
  });

  it('keeps agents off user notes', () => {
    for (const c of [
      { type: 'card.removed', ids: ['c_a'] },
      { type: 'card.updated', id: 'c_a', patch: { w: 300 } },
      { type: 'card.moved', moves: [{ id: 'c_a', x: 0, y: 0 }] },
    ]) {
      expect(() => plan(s(), c, agent)).toThrow(expect.objectContaining({ code: 'forbidden' }));
      expect(() => plan(s(), c)).not.toThrow();
    }
  });

  it('plans a batch on the board as the earlier commands leave it, all or nothing', () => {
    const changes = plan(s(), {
      type: 'batch',
      commands: [
        { type: 'link.removed', ids: ['l_1'] },
        { type: 'card.removed', ids: ['c_a', 'c_b'] },
        { type: 'frame.removed', id: 'f_a' },
      ],
    });
    const result = applyChanges(s(), changes);
    expect(result).toEqual({ seq: 4, cards: {}, frames: {}, links: {} });
    // l_2 went with c_b, so removing it afterwards is an error and the whole batch is refused.
    expect(() =>
      plan(s(), {
        type: 'batch',
        commands: [
          { type: 'card.removed', ids: ['c_b'] },
          { type: 'link.removed', ids: ['l_2'] },
        ],
      }),
    ).toThrow(BoardCommandError);
  });

  it('a group move is one card.moved; the Phase 1 form plans to the Phase 1 payload', () => {
    expect(
      plan(s(), {
        type: 'card.moved',
        moves: [
          { id: 'c_a', x: 1, y: 2 },
          { id: 'c_b', x: 3, y: 4 },
        ],
      }),
    ).toEqual([
      {
        type: 'card.moved',
        data: {
          moves: [
            { id: 'c_a', x: 1, y: 2 },
            { id: 'c_b', x: 3, y: 4 },
          ],
        },
      },
    ]);
    expect(plan(s(), { type: 'card.moved', id: 'c_a', x: 1, y: 2 })).toEqual([
      { type: 'card.moved', data: { id: 'c_a', x: 1, y: 2 } },
    ]);
  });

  it('planned changes fold to the same board as the events the service would write', () => {
    const command = {
      type: 'batch',
      commands: [
        { type: 'frame.updated', id: 'f_a', patch: { x: 100, color: 'signal' } },
        { type: 'card.moved', moves: [{ id: 'c_a', x: 110, y: 20 }] },
        { type: 'card.updated', id: 'c_b', patch: { w: 260, h: 200 } },
        { type: 'link.added', link: { from: 'c_b', to: 'f_a', type: 'contradicts' } },
      ],
    };
    const changes = plan(s(), command);
    const written = changes.map((c, i) => parseBoardEvent({ v: 1, seq: 5 + i, ts: 0, actor: user, ...c }));
    // The service appends as the user, so the optimistic fold carries the actor too (a drag pins the card).
    expect(fold(written, s())).toEqual({ ...applyChanges(s(), changes.map((c) => ({ ...c, actor: user }))), seq: 8 });
  });
});
