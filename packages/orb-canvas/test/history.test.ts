/**
 * P2.4: undo/redo through the canvas service. The per-app-session user-action stack lives in orb-canvas; undo and
 * redo append an `undo.marker` plus compensating events to board.jsonl (never rewriting it); agent actions are never
 * on the stack.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fold, parseBoardEvent, type Actor, type BoardState } from '@orb/shared';
import { BOARD_FILE, CanvasStore } from '../src/index.js';
import { specArb, toCommand, view } from '../../shared/test/boardArb.js';

let home: string;
let store: CanvasStore;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'orb-history-'));
  store = new CanvasStore({ home });
});
afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

const agent: Actor = { kind: 'agent', agent: 'scout', model: 'gpt-6-luna', sessionId: 's_test' };
const note = (x = 0, y = 0) => ({ type: 'note' as const, x, y, w: 200, h: 120, data: { text: 'hi' } });
const source = (x = 0) => ({
  type: 'source' as const,
  x,
  y: 0,
  w: 200,
  h: 120,
  data: { url: 'https://example.com/u' },
  why: 'w',
});
const logOf = (id: string) =>
  readFileSync(join(home, 'canvases', id, BOARD_FILE), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => parseBoardEvent(JSON.parse(line)));
const ids = (s: BoardState) => Object.keys(s.cards);

describe('undo/redo stack (orb-canvas)', () => {
  it('model check: random user actions, undos and redos always land on the expected earlier/later board', async () => {
    const step = fc.oneof(
      { weight: 3, arbitrary: specArb().map((spec) => ({ op: 'do' as const, spec })) },
      { weight: 2, arbitrary: fc.constant({ op: 'undo' as const }) },
      { weight: 1, arbitrary: fc.constant({ op: 'redo' as const }) },
    );
    await fc.assert(
      fc.asyncProperty(fc.array(step, { minLength: 1, maxLength: 30 }), async (steps) => {
        const { id } = await store.create({ prompt: 'model' });
        const board = await store.board(id);
        let present = board.current;
        const past: BoardState[] = [];
        const future: BoardState[] = [];
        for (const s of steps) {
          if (s.op === 'do') {
            const cmd = toCommand(board.current, s.spec);
            if (!cmd) continue;
            await store.userCommand(id, cmd);
            past.push(present);
            future.length = 0;
            present = board.current;
          } else {
            const { events, history } = await store.userCommand(id, { type: s.op });
            const [from, to] = s.op === 'undo' ? [past, future] : [future, past];
            const target = from.pop();
            if (target) {
              to.push(present);
              present = target;
              expect(events[0]).toMatchObject({
                type: 'undo.marker',
                data: { op: s.op, count: events.length - 1 },
              });
            } else {
              expect(events).toEqual([]);
            }
            expect(history).toEqual({ undo: past.length, redo: future.length });
          }
          expect(view(board.current)).toStrictEqual(view(present));
        }
        // The log is append-only and folds to the same board (reopen is exact after undo/redo).
        await board.flush();
        expect(view(fold(logOf(id)))).toStrictEqual(view(board.current));
      }),
      { numRuns: 40 },
    );
  });

  it('agent actions are never undone; undo skips to the user action before them', async () => {
    const { id } = await store.create({ prompt: 'agents' });
    const board = await store.board(id);
    const [mine] = await store.commandEvents(id, { type: 'card.added', card: note(10) });
    const myId = (mine!.data as { card: { id: string } }).card.id;
    await store.commandEvents(id, { type: 'card.added', card: source(400) }, agent);
    await store.placeAgentCard(id, { type: 'source', data: { title: 't', summary: 'b' }, why: 'w' }, agent);
    expect(board.history).toEqual({ undo: 1, redo: 0 });

    const undo = await store.userCommand(id, { type: 'undo' });
    expect(undo.events.map((e) => e.type)).toEqual(['undo.marker', 'card.removed']);
    expect(undo.events.every((e) => e.actor.kind === 'user')).toBe(true);
    expect(ids(board.current)).not.toContain(myId);
    expect(Object.values(board.current.cards).map((c) => c.provenance.kind)).toEqual(['agent', 'agent']);
    // Nothing left to undo: the agent's cards stay.
    expect((await store.userCommand(id, { type: 'undo' })).events).toEqual([]);
    expect(ids(board.current)).toHaveLength(2);

    const redo = await store.userCommand(id, { type: 'redo' });
    expect(redo.events.map((e) => e.type)).toEqual(['undo.marker', 'card.added']);
    // Redo puts the card back where it was in insertion order (first), with the same id.
    expect(ids(board.current)[0]).toBe(myId);
  });

  it("deleting an agent card is a user action: undo restores it with the agent's provenance", async () => {
    const { id } = await store.create({ prompt: 'delete agent card' });
    const board = await store.board(id);
    const placed = await store.placeAgentCard(
      id,
      { type: 'source', data: { title: 't', summary: 'b' }, why: 'w' },
      agent,
    );
    const card = (placed.data as { card: { id: string } }).card;
    await store.userCommand(id, { type: 'card.removed', ids: [card.id] });
    expect(board.current.cards[card.id]).toBeUndefined();
    await store.userCommand(id, { type: 'undo' });
    expect(board.current.cards[card.id]).toStrictEqual(card);
  });

  it('an entry whose items an agent removed since is skipped; a new user action clears redo', async () => {
    const { id } = await store.create({ prompt: 'skip' });
    const board = await store.board(id);
    await store.userCommand(id, { type: 'card.added', card: note(1) });
    const [second] = (await store.userCommand(id, { type: 'card.added', card: source(2) })).events;
    const secondId = (second!.data as { card: { id: string } }).card.id;
    await store.commandEvents(id, { type: 'card.removed', ids: [secondId] }, agent);
    // Undoing "add source" would do nothing (the agent removed it): undo removes the note instead.
    const { events, history } = await store.userCommand(id, { type: 'undo' });
    expect(events.map((e) => e.type)).toEqual(['undo.marker', 'card.removed']);
    expect(ids(board.current)).toEqual([]);
    expect(history).toEqual({ undo: 0, redo: 1 });
    await store.userCommand(id, { type: 'card.added', card: note(3) });
    expect(board.history).toEqual({ undo: 1, redo: 0 });
    expect((await store.userCommand(id, { type: 'redo' })).events).toEqual([]);
  });

  it('is unlimited within the app session and not persisted: a new service starts with an empty stack', async () => {
    const { id } = await store.create({ prompt: 'session' });
    for (let i = 0; i < 250; i++) await store.userCommand(id, { type: 'card.added', card: note(i) });
    expect((await store.history(id)).undo).toBe(250);
    for (let i = 0; i < 250; i++) await store.userCommand(id, { type: 'undo' });
    expect((await store.board(id)).cards()).toEqual([]);
    expect(await store.history(id)).toEqual({ undo: 0, redo: 250 });
    await store.userCommand(id, { type: 'redo' });
    await store.close();

    store = new CanvasStore({ home });
    const reopened = await store.board(id);
    expect(reopened.cards()).toHaveLength(1);
    expect(reopened.history).toEqual({ undo: 0, redo: 0 });
    // 250 adds + 250 × (marker + removal) + 1 × (marker + add): the log only grew.
    expect(logOf(id)).toHaveLength(250 + 500 + 2);
  });
});
