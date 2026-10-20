import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CanvasStore } from '@orb/canvas';
import { fold, parseBoardEvent } from '@orb/shared';
import { seedBoard } from '../seed-board.ts';

const home = mkdtempSync(join(tmpdir(), 'orb-seed-'));
afterAll(() => rmSync(home, { recursive: true, force: true }));

describe('scripts/seed-board.ts', () => {
  it('writes 8 frames and 300 cards through the canvas service, each card inside its frame', async () => {
    const result = await seedBoard({ home, title: 'Perf board' });
    expect(result).toMatchObject({ cards: 300, frames: 8, events: 308 });

    const lines = readFileSync(join(home, 'canvases', result.canvasId, 'board.jsonl'), 'utf8')
      .trim()
      .split('\n');
    expect(lines).toHaveLength(308);
    const state = fold(lines.map((l) => parseBoardEvent(JSON.parse(l))));
    const frames = Object.values(state.frames);
    const cards = Object.values(state.cards);
    expect(frames).toHaveLength(8);
    expect(cards).toHaveLength(300);
    expect(new Set(frames.map((f) => f.color)).size).toBe(4);
    for (const card of cards) {
      const frame = state.frames[card.frameId!]!;
      expect(card.x).toBeGreaterThanOrEqual(frame.x);
      expect(card.y).toBeGreaterThanOrEqual(frame.y);
      expect(card.x + card.w).toBeLessThanOrEqual(frame.x + frame.w);
      expect(card.y + card.h).toBeLessThanOrEqual(frame.y + frame.h);
      if (card.provenance.kind === 'agent') expect(card.why).toBeTruthy();
    }
    // Frames do not overlap.
    for (const a of frames)
      for (const b of frames)
        if (a !== b)
          expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);

    // The service reopens it to the same state.
    const store = new CanvasStore({ home });
    try {
      const board = await store.board(result.canvasId);
      expect(board.cards()).toHaveLength(300);
      expect(board.snapshot().frames.map((f) => f.title)).toEqual(frames.map((f) => f.title));
    } finally {
      await store.close();
    }
  });

  it('is deterministic in content for a seed', async () => {
    const a = await seedBoard({ home, cards: 12, frames: 2, seed: 7 });
    const b = await seedBoard({ home, cards: 12, frames: 2, seed: 7 });
    const titles = (id: string) =>
      readFileSync(join(home, 'canvases', id, 'board.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l) as { data: { card?: { data: { title: string } } } })
        .flatMap((e) => (e.data.card ? [e.data.card.data.title] : []));
    expect(titles(a.canvasId)).toEqual(titles(b.canvasId));
    expect(titles(a.canvasId)).toHaveLength(12);
  });
});
