/**
 * P3.8 design frames: `write_design_frame` writes `assets/design/<id>.html` through the canvas service and places a
 * design card, or rewrites an existing one as its next version (new time, version + 1, same file path); `place_card`
 * and `update_card` on a design card keep the file in step. Role and signal checks as for the other board tools.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DesignData, cardDataSchema, readCardData, type AgentName, type Card } from '@orb/shared';
import { describeCard } from '@orb/cards';
import { CanvasStore } from '../src/store.js';
import { writeDesignFile } from '../src/design.js';
import {
  actorOf,
  placeCard,
  updateCard,
  writeDesignFrame,
  type BoardToolExec,
  type WriteDesignFrameResult,
} from '../src/tools.js';

let home: string;
let store: CanvasStore;
let canvasId: string;
let frameId: string;

const SESSIONS: Record<AgentName, string> = {
  orb: 'orb-session-1',
  scout: 'scout-session-1',
  critic: 'critic-session-1',
  builder: 'builder-session-1',
};

const as = (role: AgentName, signal = new AbortController().signal): BoardToolExec => ({
  callId: `call_${role}`,
  signal,
  agent: {
    id: SESSIONS[role],
    options: { provider: 'openai', model: 'gpt-6-luna' },
    session: { header: { cwd: store.dirOf(canvasId) } },
  },
});

const HTML_V1 = '<!doctype html><html><body><h1>Sign up</h1><button>Start</button></body></html>';
const HTML_V2 =
  '<!doctype html><html><body><h1>Sign up</h1><button style="background:green">Go</button></body></html>';

async function write(
  args: Record<string, unknown>,
  role: AgentName = 'builder',
): Promise<WriteDesignFrameResult> {
  const res = await writeDesignFrame(store, args, as(role));
  if ('error' in res) throw new Error(`unexpected ${res.error}`);
  return res;
}
const cardOf = async (id: string): Promise<Card> => (await store.board(canvasId)).card(id)!;
const fileOf = (path: string) => readFileSync(join(store.dirOf(canvasId), path), 'utf8');

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-design-'));
  store = new CanvasStore({ home, flushMs: 5 });
  canvasId = (await store.create({ prompt: 'Design' })).id;
  await store.setRootSession(canvasId, SESSIONS.orb);
  await store.setChildAgent(canvasId, 'scout', SESSIONS.scout);
  await store.setChildAgent(canvasId, 'critic', SESSIONS.critic);
  await store.setChildAgent(canvasId, 'builder', SESSIONS.builder);
  frameId = (await store.addAgentFrame(canvasId, { title: 'Prototype' }, actorOf(as('orb'), 'orb'))).frame.id;
});

afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

describe('write_design_frame', () => {
  it('writes assets/design/<id>.html and places a design card with the HTML, version 1 and its time', async () => {
    const before = Date.now();
    const res = await write({ frameId, title: 'Sign up', html: HTML_V1, why: 'First screen of the flow.' });
    expect(res).toMatchObject({ created: true, version: 1, asset: `assets/design/${res.cardId}.html` });
    expect(res.updatedAt).toBeGreaterThanOrEqual(before);
    expect(fileOf(res.asset)).toBe(HTML_V1);
    const card = await cardOf(res.cardId);
    expect(card).toMatchObject({
      type: 'design',
      frameId,
      why: 'First screen of the flow.',
      provenance: { kind: 'agent', agent: 'builder', toolCallId: 'call_builder' },
      data: { title: 'Sign up', html: HTML_V1, version: 1, asset: res.asset, updatedAt: res.updatedAt },
    });
    expect(cardDataSchema('design').safeParse(card.data).success).toBe(true);
    // Laid out in the frame like any agent card.
    const frame = (await store.board(canvasId)).current.frames[frameId]!;
    expect(card.x).toBeGreaterThanOrEqual(frame.x);
    expect(card.x + card.w).toBeLessThanOrEqual(frame.x + frame.w);
  });

  it('rewrites a frame by cardId: same card and file, next version, new time, why kept unless given', async () => {
    const first = await write({ frameId, title: 'Sign up', html: HTML_V1, why: 'First screen.' });
    await new Promise((r) => setTimeout(r, 5));
    const second = await write({ cardId: first.cardId, title: 'Sign up', html: HTML_V2 });
    expect(second).toMatchObject({ cardId: first.cardId, created: false, version: 2, asset: first.asset });
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt);
    expect(fileOf(first.asset)).toBe(HTML_V2);
    const card = await cardOf(first.cardId);
    expect(card.data).toMatchObject({ html: HTML_V2, version: 2, updatedAt: second.updatedAt });
    expect(card.why).toBe('First screen.');
    expect((await store.board(canvasId)).cards().filter((c) => c.type === 'design')).toHaveLength(1);
    expect(describeCard(card)).toContain('(version 2)');
    // Only the one file, no temp files left.
    expect(readdirSync(join(store.dirOf(canvasId), 'assets', 'design'))).toEqual([`${first.cardId}.html`]);
    const third = await write({
      cardId: first.cardId,
      title: 'Sign up, v3',
      html: '<p>3</p>',
      why: 'Simpler.',
    });
    expect(third.version).toBe(3);
    expect(await cardOf(first.cardId)).toMatchObject({ why: 'Simpler.', data: { title: 'Sign up, v3' } });
  });

  it('the same title in the same frame rewrites the caller own frame instead of adding a second one', async () => {
    const first = await write({ frameId, title: 'Sign up', html: HTML_V1, why: 'First.' });
    const again = await write({ frameId, title: ' sign UP ', html: HTML_V2 });
    expect(again).toMatchObject({ cardId: first.cardId, created: false, version: 2 });
    const other = await write({ frameId, title: 'Pricing', html: '<p>Plans</p>', why: 'Second screen.' });
    expect(other.created).toBe(true);
    expect(other.cardId).not.toBe(first.cardId);
    // Orb's design card of the same title is not Builder's own: a new frame is made.
    const orbs = await placeCard(
      store,
      { type: 'design', frameId, title: 'Checkout', html: '<p>Pay</p>', why: 'Orb sketch.' },
      as('orb'),
      { delayMs: 0 },
    );
    if ('error' in orbs) throw new Error('unexpected');
    const mine = await write({ frameId, title: 'Checkout', html: '<p>Pay now</p>', why: 'Builder version.' });
    expect(mine.created).toBe(true);
    // ...but Builder may rewrite it by id.
    expect((await write({ cardId: orbs.cardId, title: 'Checkout', html: '<p>Pay!</p>' })).version).toBe(2);
  });

  it('refuses: a new frame without why, another card type, an unknown card or frame, roles without the tool', async () => {
    await expect(write({ frameId, title: 'X', html: '<p>x</p>' })).rejects.toThrow(/why/);
    const diagram = await placeCard(
      store,
      { type: 'diagram', frameId, title: 'Flow', mermaid: 'flowchart TD\n A-->B', why: 'Flow.' },
      as('builder'),
      { delayMs: 0 },
    );
    if ('error' in diagram) throw new Error('unexpected');
    await expect(write({ cardId: diagram.cardId, title: 'X', html: '<p>x</p>' })).rejects.toThrow(
      /not a design/,
    );
    await expect(write({ cardId: 'c_nope', title: 'X', html: '<p>x</p>' })).rejects.toThrow(/no card/);
    await expect(write({ frameId: 'f_nope', title: 'X', html: '<p>x</p>', why: 'w' })).rejects.toThrow(
      /no frame/,
    );
    await expect(write({ frameId, title: 'X', html: '', why: 'w' })).rejects.toThrow(/html/);
    await expect(write({ frameId, title: 'X', html: 'x'.repeat(100_001), why: 'w' })).rejects.toThrow(/html/);
    await expect(
      write({ frameId, title: 'X', html: '<p>x</p>', why: 'w', role: 'builder' }),
    ).rejects.toThrow();
    for (const role of ['orb', 'scout', 'critic'] as const) {
      await expect(write({ frameId, title: 'X', html: '<p>x</p>', why: 'w' }, role)).rejects.toThrow(
        /not available/,
      );
    }
    expect((await store.board(canvasId)).cards().filter((c) => c.type === 'design')).toHaveLength(0);
    expect(existsSync(join(store.dirOf(canvasId), 'assets', 'design'))).toBe(false);
  });

  it('honours exec.signal: an aborted call writes no card and leaves no file', async () => {
    const ac = new AbortController();
    ac.abort(new Error('user stop'));
    await expect(
      writeDesignFrame(store, { frameId, title: 'X', html: '<p>x</p>', why: 'w' }, as('builder', ac.signal)),
    ).rejects.toThrow('user stop');
    expect((await store.board(canvasId)).cards()).toEqual([]);
    const dir = join(store.dirOf(canvasId), 'assets', 'design');
    expect(existsSync(dir) ? readdirSync(dir) : []).toEqual([]);
  });

  it('a stop during a rewrite leaves the card and its file on the previous version', async () => {
    const first = await write({ frameId, title: 'Sign up', html: HTML_V1, why: 'First.' });
    const ac = new AbortController();
    const real = store.writeDesignFile.bind(store);
    store.writeDesignFile = async (...args) => {
      const path = await real(...args);
      ac.abort(new Error('user stop'));
      return path;
    };
    await expect(
      writeDesignFrame(
        store,
        { cardId: first.cardId, title: 'Sign up', html: HTML_V2 },
        as('builder', ac.signal),
      ),
    ).rejects.toThrow('user stop');
    store.writeDesignFile = real;
    expect((await cardOf(first.cardId)).data).toMatchObject({ html: HTML_V1, version: 1 });
    expect(fileOf(first.asset)).toBe(HTML_V1);
  });

  it('answers FRAME_FULL at the budget and leaves no orphan file', async () => {
    for (let i = 0; i < store.frameBudget; i++)
      await write({ frameId, title: `Screen ${i}`, html: `<p>${i}</p>`, why: 'Screen.' });
    const res = await writeDesignFrame(
      store,
      { frameId, title: 'One more', html: '<p>more</p>', why: 'w' },
      as('builder'),
    );
    expect(res).toMatchObject({ error: 'FRAME_FULL', frameId, budget: store.frameBudget });
    expect(readdirSync(join(store.dirOf(canvasId), 'assets', 'design'))).toHaveLength(store.frameBudget);
    // A rewrite of a frame already there still works on a full frame.
    expect((await write({ frameId, title: 'Screen 0', html: '<p>zero</p>' })).version).toBe(2);
  });
});

describe('place_card and update_card on design cards keep the file in step', () => {
  it('place_card design writes the file; update_card html rewrites it and bumps the version', async () => {
    const placed = await placeCard(
      store,
      { type: 'design', frameId, title: 'Home', html: '<p>v1</p>', why: 'Orb sketch.' },
      as('orb'),
      { delayMs: 0 },
    );
    if ('error' in placed) throw new Error('unexpected');
    const d1 = readCardData(DesignData, (await cardOf(placed.cardId)).data)!;
    expect(d1).toMatchObject({ version: 1, asset: `assets/design/${placed.cardId}.html` });
    expect(fileOf(d1.asset!)).toBe('<p>v1</p>');
    await updateCard(store, { cardId: placed.cardId, html: '<p>v2</p>' }, as('orb'));
    const d2 = readCardData(DesignData, (await cardOf(placed.cardId)).data)!;
    expect(d2).toMatchObject({ version: 2, html: '<p>v2</p>', asset: d1.asset });
    expect(fileOf(d1.asset!)).toBe('<p>v2</p>');
    // A title-only change keeps the version and the file.
    await updateCard(store, { cardId: placed.cardId, title: 'Home page' }, as('orb'));
    expect(readCardData(DesignData, (await cardOf(placed.cardId)).data)).toMatchObject({ version: 2 });
    expect(fileOf(d1.asset!)).toBe('<p>v2</p>');
  });

  it('writeDesignFile refuses bad ids and a symlinked design folder', async () => {
    const dir = store.dirOf(canvasId);
    await expect(writeDesignFile(dir, '../x', '<p>x</p>')).rejects.toThrow(/invalid/);
    await expect(writeDesignFile(dir, 'c_ok', '')).rejects.toThrow(/HTML/);
    const outside = mkdtempSync(join(tmpdir(), 'orb-design-out-'));
    mkdirSync(join(dir, 'assets'), { recursive: true });
    symlinkSync(outside, join(dir, 'assets', 'design'));
    await expect(writeDesignFile(dir, 'c_ok', '<p>x</p>')).rejects.toThrow(/not a folder/);
    expect(readdirSync(outside)).toEqual([]);
    rmSync(outside, { recursive: true, force: true });
  });
});
