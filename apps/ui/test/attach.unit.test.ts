/**
 * P6.1 composer attachments: where an attached file's card lands (attach.ts: the current frame, a free spot, in view),
 * ingest's placer, and the sent message's attachment chips read back from the context text orb-canvas writes.
 */
import { describe, expect, it, vi } from 'vitest';
import { ATTACHED_HEADER, emptyBoard, type BoardState, type Card, type Frame } from '@orb/shared';
import { contextText } from '../../../packages/orb-canvas/src/context.ts';
import { GAP, currentFrame, freeSpot } from '../src/cards/attach.js';
import { ingest } from '../src/cards/ingest.js';
import { attachmentsIn, ConversationTracker } from '../src/screens/Canvas/conversation.js';
import { timingExpect } from '../../../scripts/testkit/namespace.ts';
import { intersects, type Rect } from '../src/canvas/viewport.js';

const frame = (id: string, x: number, y: number, w = 640, h = 420, title = id): Frame =>
  ({ id, title, x, y, w, h, tone: 'rho', provenance: { kind: 'user', at: 1 } }) as unknown as Frame;
const card = (id: string, x: number, y: number, w = 280, h = 200, frameId: string | null = null): Card =>
  ({
    id,
    type: 'note',
    frameId,
    x,
    y,
    w,
    h,
    data: { title: `Note ${id}`, body: 'Body' },
    provenance: { kind: 'user', at: 1 },
  }) as unknown as Card;
const boardOf = (frames: Frame[], cards: Card[]): BoardState => ({
  ...emptyBoard(),
  frames: Object.fromEntries(frames.map((f) => [f.id, f])),
  cards: Object.fromEntries(cards.map((c) => [c.id, c])),
});
const within = (r: Rect, outer: Rect) =>
  r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h;
const VIEW: Rect = { x: -200, y: -200, w: 1400, h: 1000 };

describe('currentFrame', () => {
  const a = frame('f_a', 0, 0);
  const b = frame('f_b', 800, 0);
  const far = frame('f_far', 5000, 5000);
  const board = boardOf([a, b, far], [card('c_in_b', 850, 80, 280, 200, 'f_b')]);

  it('prefers the selected frame, or the frame of the selected card, when it shows', () => {
    expect(currentFrame(board, VIEW, ['f_b'])?.id).toBe('f_b');
    expect(currentFrame(board, VIEW, ['c_in_b'])?.id).toBe('f_b');
    // A selected frame out of view does not count.
    expect(currentFrame(board, { x: 0, y: 0, w: 600, h: 400 }, ['f_far'])?.id).toBe('f_a');
  });

  it('else the frame under the middle of the view, else the one that shows most, else none', () => {
    expect(currentFrame(board, { x: 700, y: 0, w: 600, h: 400 }, [])?.id).toBe('f_b');
    expect(currentFrame(board, { x: -900, y: -100, w: 1200, h: 400 }, [])?.id).toBe('f_a');
    expect(currentFrame(board, { x: 3000, y: 3000, w: 400, h: 400 }, [])).toBeUndefined();
  });
});

describe('freeSpot', () => {
  it('fills the current frame in reading order, below its title band, clear of its cards', () => {
    const f = frame('f_a', 0, 0);
    const taken = card('c_1', 24, 56, 280, 200, 'f_a');
    const board = boardOf([f], [taken]);
    const size = { w: 280, h: 200 };
    const spot = freeSpot(board, size, { frame: f, view: VIEW });
    const r = { ...spot, ...size };
    expect(within(r, { x: 24, y: 56, w: 640 - 48, h: 420 - 80 })).toBe(true);
    expect(intersects(r, { x: 24 - GAP, y: 56 - GAP, w: 280 + 2 * GAP, h: 200 + 2 * GAP })).toBe(false);
    expect(spot.y).toBe(56); // the same row, right of the card
  });

  it('cards placed by the same attach do not overlap each other', () => {
    const f = frame('f_a', 0, 0);
    const board = boardOf([f], []);
    const placed: Rect[] = [];
    for (let i = 0; i < 3; i++) {
      const size = { w: 260, h: 150 };
      const spot = freeSpot(board, size, { frame: f, view: VIEW, taken: placed });
      const r = { ...spot, ...size };
      for (const p of placed) expect(intersects(r, p)).toBe(false);
      placed.push(r);
    }
  });

  it('a full frame puts the card right next to it, in view and clear of every frame', () => {
    const f = frame('f_a', 0, 0, 340, 300);
    const board = boardOf([f], [card('c_1', 24, 56, 280, 200, 'f_a')]);
    const size = { w: 280, h: 200 };
    const spot = freeSpot(board, size, { frame: f, view: VIEW });
    const r = { ...spot, ...size };
    expect(intersects(r, f)).toBe(false);
    expect(within(r, VIEW)).toBe(true);
    // Near it: within a few card sizes of the frame.
    expect(Math.abs(r.x - f.x)).toBeLessThan(1200);
  });

  it('with no frame, the open board nearest the middle of the view, off every frame and card', () => {
    const view = { x: 0, y: 0, w: 1000, h: 800 };
    const board = boardOf([frame('f_a', 300, 200, 400, 400)], [card('c_1', 100, 100)]);
    const size = { w: 300, h: 150 };
    const spot = freeSpot(board, size, { view });
    const r = { ...spot, ...size };
    expect(within(r, view)).toBe(true);
    for (const o of [...Object.values(board.frames), ...Object.values(board.cards)])
      expect(intersects(r, o)).toBe(false);
  });
});

describe('ingest with a placer', () => {
  it('puts each card where the placer says and joins the frame under its centre', async () => {
    const f = frame('f_a', 0, 0);
    const place = vi.fn((_size: { w: number; h: number }) => ({ x: 40, y: 80 }));
    const { command } = await ingest(
      [{ kind: 'text', text: 'Hello\nWorld' }],
      { x: 9999, y: 9999 },
      boardOf([f], []),
      { upload: async () => ({}) as never },
      place,
    );
    expect(place).toHaveBeenCalledTimes(1);
    expect(command).toMatchObject({
      type: 'card.added',
      card: { x: 40, y: 80, frameId: 'f_a', type: 'note' },
    });
  });
});

describe('attachment chips of a sent message', () => {
  it('reads the attached cards back from the context orb-canvas writes, apart from context cards', () => {
    const f = frame('f_a', 0, 0, 640, 420, 'Evidence');
    const state = boardOf(
      [f],
      [
        card('c_att', 24, 56, 280, 200, 'f_a'),
        card('c_ctx', 2000, 2000),
        card('c_2', 400, 56, 280, 200, 'f_a'),
      ],
    );
    (state.cards.c_att!.data as { title: string }).title = 'Q3 memo "draft"';
    const ctx = contextText(state, {
      context: { frameIds: ['f_a'], cardIds: ['c_ctx'], attachmentIds: ['c_att', 'c_2'] },
    })!;
    expect(ctx).toContain(ATTACHED_HEADER);
    expect(attachmentsIn(['Look', ctx])).toEqual([
      { id: 'c_att', title: 'Q3 memo "draft"' },
      { id: 'c_2', title: 'Note c_2' },
    ]);
    expect(attachmentsIn(['Look'])).toBeUndefined();
    expect(attachmentsIn(['Look', contextText(state, { context: { cardIds: ['c_ctx'] } })!])).toBeUndefined();

    // The tracker puts them on the user item; the "in context" count leaves them out.
    const t = new ConversationTracker();
    t.push({ type: 'event', event: { type: 'turn/start', seq: 1, time: 1, data: { turn: 1 } } } as never);
    const s = t.push({
      type: 'event',
      event: {
        type: 'user/message',
        seq: 2,
        time: 2,
        data: {
          role: 'user',
          source: { kind: 'user' },
          content: [
            { type: 'text', text: 'Look' },
            { type: 'text', text: ctx },
          ],
        },
      },
    } as never);
    expect(s.items[0]).toMatchObject({
      kind: 'user',
      text: 'Look',
      context: 2,
      attachments: [{ id: 'c_att' }, { id: 'c_2' }],
    });
  });
});

describe('freeSpot cost (P6.1 review)', () => {
  it('stays a few ms per card on a zoomed-out 300-card board', () => {
    const frames: Frame[] = [];
    const cards: Card[] = [];
    for (let f = 0; f < 25; f++) {
      const fx = (f % 5) * 1100;
      const fy = Math.floor(f / 5) * 900;
      frames.push(frame(`f_${f}`, fx, fy, 1000, 800));
      for (let i = 0; i < 12; i++)
        cards.push(card(`c_${f}_${i}`, fx + 24 + (i % 3) * 320, fy + 56 + Math.floor(i / 3) * 180, 300, 170, `f_${f}`));
    }
    const board = boardOf(frames, cards);
    // The view at the minimum zoom (0.25) of a 1440×900 window.
    const view: Rect = { x: -200, y: -200, w: 5760, h: 3600 };
    const target = currentFrame(board, view, []);
    const taken: Rect[] = [];
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) {
      const spot = freeSpot(board, { w: 280, h: 200 }, { frame: target, view, taken });
      const r = { ...spot, w: 280, h: 200 };
      for (const c of [...cards, ...taken]) expect(intersects(r, c)).toBe(false);
      taken.push(r);
    }
    // 10 placements: well under a frame budget each (it was ~100 ms per card before the bounded scan).
    const elapsed = performance.now() - t0;
    timingExpect(() => {
      expect(elapsed).toBeLessThan(250);
    });
  });
});
