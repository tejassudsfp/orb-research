/** P2.3 board editing math: hit tests, marquee, link curves, and the one command each gesture commits. */
import { describe, expect, it } from 'vitest';
import {
  BoardCommand,
  applyChanges,
  fold,
  parseBoardEvent,
  planCommand,
  type BoardEventType,
} from '@orb/shared';
import {
  deleteCommand,
  flightTarget,
  frameAt,
  frameCommand,
  nextFrameTitle,
  itemAt,
  linkGeometry,
  linkText,
  marqueeIds,
  moveCommand,
  movePreview,
  movedSet,
  manualCardCommand,
  noteCommand,
  shownEnd,
} from '../src/canvas/geometry.js';

const user = { kind: 'user' } as const;
const prov = { ...user, at: 1 };
const board = fold(
  (
    [
      [
        'frame.added',
        { frame: { id: 'f_a', title: 'A', color: 'sky', x: 0, y: 0, w: 600, h: 400, provenance: prov } },
      ],
      [
        'frame.added',
        { frame: { id: 'f_b', title: 'B', color: 'rho', x: 1000, y: 0, w: 600, h: 400, provenance: prov } },
      ],
      [
        'card.added',
        {
          card: {
            id: 'c_1',
            type: 'note',
            frameId: 'f_a',
            x: 20,
            y: 60,
            w: 200,
            h: 100,
            data: {},
            provenance: prov,
          },
        },
      ],
      [
        'card.added',
        {
          card: {
            id: 'c_2',
            type: 'note',
            frameId: null,
            x: 700,
            y: 60,
            w: 200,
            h: 100,
            data: {},
            provenance: prov,
          },
        },
      ],
      ['link.added', { link: { id: 'l_1', from: 'c_1', to: 'c_2', type: 'tension', provenance: prov } }],
    ] as [BoardEventType, unknown][]
  ).map(([type, data], seq) => parseBoardEvent({ v: 1, seq, ts: 0, type, actor: user, data })),
);
const apply = (command: unknown) =>
  applyChanges(
    board,
    planCommand(board, BoardCommand.parse(command), { actor: user, now: 0, mintId: (p) => `${p}_new` }),
  );

describe('geometry', () => {
  it('hit tests cards above frames', () => {
    expect(itemAt(board, 30, 70)).toBe('c_1');
    expect(itemAt(board, 500, 300)).toBe('f_a');
    expect(itemAt(board, 950, 500)).toBeNull();
    expect(frameAt(Object.values(board.frames), 1100, 10)).toBe('f_b');
  });

  it('a search hit inside a stack flies to the visible stack (P6.9)', () => {
    expect(flightTarget(board, 'c_1')).toMatchObject({ id: 'c_1', rect: { x: 20, y: 60 } });
    expect(flightTarget(board, 'f_b')).toMatchObject({ id: 'f_b' });
    expect(flightTarget(board, 'c_gone')).toBeUndefined();
    const stacked = {
      ...board,
      cards: {
        ...board.cards,
        c_1: { ...board.cards['c_1']!, stackedInto: 'c_2' },
      },
    };
    expect(flightTarget(stacked, 'c_1')).toMatchObject({ id: 'c_2', rect: { x: 700, y: 60 } });
  });

  it('marquee picks intersecting cards and fully enclosed frames', () => {
    expect(marqueeIds(board, { x: 100, y: 100, w: 700, h: 100 })).toEqual(['c_1', 'c_2']);
    expect(marqueeIds(board, { x: -10, y: -10, w: 620, h: 420 })).toEqual(['f_a', 'c_1']);
  });

  it('a group drag is ONE card.moved; a lone card joins the frame under its centre', () => {
    const set = movedSet(board, ['c_1', 'c_2']);
    const cmd = moveCommand(board, set, 500, 0);
    expect(cmd).toEqual({
      type: 'card.moved',
      moves: [
        { id: 'c_1', x: 520, y: 60, frameId: null },
        { id: 'c_2', x: 1200, y: 60, frameId: 'f_b' },
      ],
    });
    expect(apply(cmd).cards['c_2']).toMatchObject({ x: 1200, frameId: 'f_b' });
    expect(moveCommand(board, set, 10, 0)).toEqual({
      type: 'card.moved',
      moves: [
        { id: 'c_1', x: 30, y: 60 },
        { id: 'c_2', x: 710, y: 60 },
      ],
    });
    expect(moveCommand(board, set, 0, 0)).toBeNull();
  });

  it('a frame drag carries its cards (batch: frame.updated + card.moved, cards keep their frame)', () => {
    const set = movedSet(board, ['f_a']);
    expect(set).toEqual({ cards: ['c_1'], frames: ['f_a'] });
    expect(movePreview(board, set, 10, 20)).toEqual({
      cards: { c_1: { x: 30, y: 80 } },
      frames: { f_a: { x: 10, y: 20 } },
    });
    const cmd = moveCommand(board, set, 10, 20);
    expect(cmd).toEqual({
      type: 'batch',
      commands: [
        { type: 'frame.updated', id: 'f_a', patch: { x: 10, y: 20 } },
        // P6.8: a card carried by its frame is not "placed by hand".
        { type: 'card.moved', moves: [{ id: 'c_1', x: 30, y: 80, pinned: null }] },
      ],
    });
    expect(apply(cmd).cards['c_1']).toMatchObject({ x: 30, y: 80, frameId: 'f_a' });
  });

  it('delete removes links first, skips links that go with a removed card, frames last', () => {
    expect(deleteCommand(board, ['l_1', 'c_2', 'f_a'])).toEqual({
      type: 'batch',
      commands: [
        { type: 'card.removed', ids: ['c_2'] },
        { type: 'frame.removed', id: 'f_a' },
      ],
    });
    expect(deleteCommand(board, ['l_1'])).toEqual({ type: 'link.removed', ids: ['l_1'] });
    expect(deleteCommand(board, [])).toBeNull();
    const after = apply(deleteCommand(board, ['l_1', 'c_2', 'f_a']));
    expect(after.cards['c_1']!.frameId).toBeNull();
    expect(after.links).toEqual({});
  });

  it('notes and frames are created where the user clicks', () => {
    expect(noteCommand(board, 300, 200)).toMatchObject({
      type: 'card.added',
      card: { type: 'note', frameId: 'f_a', x: 180, y: 125, w: 240, h: 150 },
    });
    expect(frameCommand(board, { x: 5, y: 5, w: 2, h: 2 })).toMatchObject({
      frame: { title: 'Frame 3', x: 5, y: 5, w: 640, h: 420 },
    });
    expect(frameCommand(board, { x: 5, y: 5, w: 300, h: 250 })).toMatchObject({ frame: { w: 300, h: 250 } });
  });

  it('a frame drawn over loose cards adopts them in the same command (P6.9)', () => {
    // c_2 (loose, centre 800,110) is inside; c_1 already belongs to f_a and stays.
    const cmd = frameCommand(board, { x: 650, y: 20, w: 400, h: 300 });
    expect(cmd).toMatchObject({ type: 'frame.added', adopt: ['c_2'] });
    const after = apply(cmd);
    expect(after.cards['c_2']).toMatchObject({ frameId: 'f_new', x: 700, y: 60 });
    expect(after.cards['c_1']!.frameId).toBe('f_a');
    // Over nothing loose: no `adopt` key at all.
    expect(frameCommand(board, { x: 2000, y: 20, w: 400, h: 300 })).not.toHaveProperty('adopt');
  });

  it('a new frame never repeats a Frame N title still on the board, and numbers follow board order (P6.9)', () => {
    const named = (titles: string[]) => ({
      frames: Object.fromEntries(titles.map((t, i) => [`f_${i}`, { title: t }])),
    });
    // 3 frames (Frame 1, 2, 3); Frame 2 deleted -> 2 frames left, "Frame 3" is taken: the next is Frame 4, not Frame 3.
    expect(nextFrameTitle(named(['Frame 1', 'Frame 3']) as never)).toBe('Frame 4');
    expect(nextFrameTitle(named([]) as never)).toBe('Frame 1');
    // Labels are positions: deleting frame 01 makes the old 02 the new 01.
    const removed = apply({ type: 'frame.removed', id: 'f_a' });
    expect(Object.keys(removed.frames).indexOf('f_b')).toBe(0);
  });

  it('Add card makes an empty user card centred on a point, stepping off an exact overlap (P2.gate)', () => {
    expect(manualCardCommand(board, 'question', 300, 200)).toEqual({
      type: 'card.added',
      card: {
        type: 'question',
        frameId: 'f_a',
        x: 180,
        y: 125,
        w: 240,
        h: 150,
        data: { title: 'New question', body: '' },
      },
    });
    // c_1 sits at (20, 60): a card centred at (140, 135) would cover it exactly, so it moves down-right.
    const stepped = manualCardCommand(board, 'risk', 140, 135) as { card: { x: number; y: number } };
    expect([stepped.card.x, stepped.card.y]).toEqual([44, 84]);
    const parsed = BoardCommand.safeParse(manualCardCommand(board, 'quote', 2000, 2000));
    expect(parsed.success).toBe(true);
  });

  it('link curves leave the facing sides; labels read as words', () => {
    const g = linkGeometry({ x: 0, y: 0, w: 100, h: 100 }, { x: 300, y: 0, w: 100, h: 100 });
    expect(g.from).toEqual({ x: 100, y: 50 });
    expect(g.to).toEqual({ x: 300, y: 50 });
    expect(g.mid).toEqual({ x: 200, y: 50 });
    const v = linkGeometry({ x: 0, y: 0, w: 100, h: 100 }, { x: 0, y: 400, w: 100, h: 100 });
    expect([v.from, v.to]).toEqual([
      { x: 50, y: 100 },
      { x: 50, y: 400 },
    ]);
    expect(linkText({ type: 'leads-to' })).toBe('LEADS TO');
    expect(linkText({ type: 'label', label: 'see also' })).toBe('SEE ALSO');
  });
});

describe('stacked cards (P3.2)', () => {
  const agent = { kind: 'agent', agent: 'scout', model: 'm', sessionId: 's', at: 1 } as const;
  const c = (id: string, x: number, extra: Record<string, unknown> = {}) => ({
    id,
    type: 'source',
    frameId: null,
    x,
    y: 0,
    w: 100,
    h: 100,
    data: { title: id },
    why: 'w',
    provenance: agent,
    ...extra,
  });
  const stack = {
    title: 'S',
    body: 'b',
    stack: { count: 2, items: [{ id: 'c_a', type: 'source', title: 'a' }, { id: 'c_b', type: 'source', title: 'b' }] },
  };
  const b = fold(
    (
      [
        ['card.added', { card: c('c_a', 0) }],
        ['card.added', { card: c('c_b', 200) }],
        ['card.added', { card: c('c_s', 400, { type: 'doc', data: stack }) }],
        ['card.stacked', { stackId: 'c_s', ids: ['c_a', 'c_b'] }],
        ['card.added', { card: c('c_d', 600) }],
      ] as [BoardEventType, unknown][]
    ).map(([type, data], seq) => parseBoardEvent({ v: 1, seq, ts: seq, type, actor: { kind: 'user' }, data })),
  );

  it('hidden stacked cards are never hit or marquee-selected', () => {
    expect(itemAt(b, 50, 50)).toBeNull();
    expect(itemAt(b, 450, 50)).toBe('c_s');
    expect(marqueeIds(b, { x: -10, y: -10, w: 2000, h: 200 })).toEqual(['c_s', 'c_d']);
  });

  it('a link end on a stacked card is drawn at its stack', () => {
    expect(shownEnd(b, 'c_a')).toBe('c_s');
    expect(shownEnd(b, 'c_d')).toBe('c_d');
    expect(shownEnd(b, 'c_nope')).toBeUndefined();
    expect(shownEnd(b, 'f_nope')).toBeUndefined();
  });
});
