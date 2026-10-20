/** P6.5 synthesis cards through the board tools: citations are enforced and checked against the board, roles gate. */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cardKindLabel, type AgentName, type Card } from '@orb/shared';
import { CanvasStore } from '../src/store.js';
import { placeCard as placeCardTool, queryBoard, updateCard, type BoardToolExec } from '../src/tools.js';

let home: string;
let store: CanvasStore;
let canvasId: string;
const SESSIONS: Record<AgentName, string> = { orb: 's-orb', scout: 's-scout', critic: 's-critic', builder: 's-builder' };
const as = (role: AgentName): BoardToolExec => ({
  callId: 'call_1',
  signal: new AbortController().signal,
  agent: {
    id: SESSIONS[role],
    options: { provider: 'openai', model: 'gpt-6-luna' },
    session: { header: { cwd: store.dirOf(canvasId) } },
  },
});
const now = { delayMs: 0 };
async function place(role: AgentName, args: Record<string, unknown>): Promise<string> {
  const res = await placeCardTool(store, { why: 'w', ...args }, as(role), now);
  if ('error' in res) throw new Error(res.error);
  return res.cardId;
}
const cardOf = async (id: string): Promise<Card> => (await store.board(canvasId)).card(id)!;

let a: string;
let b: string;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-synth-'));
  store = new CanvasStore({ home, flushMs: 5, searchIndex: false });
  canvasId = (await store.create({ prompt: 'Synthesis' })).id;
  await store.setRootSession(canvasId, SESSIONS.orb);
  for (const role of ['scout', 'critic', 'builder'] as const) await store.setChildAgent(canvasId, role, SESSIONS[role]);
  a = await place('scout', { type: 'quote', title: 'Src A', body: 'It holds.', url: 'https://example.org/a' });
  b = await place('scout', { type: 'quote', title: 'Src B', body: 'It scales.', url: 'https://example.org/b' });
});
afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

describe('insight', () => {
  it('is refused with fewer than two citations, repeated ones, or cards that are not on the board', async () => {
    const insight = { type: 'insight', title: 'So what' };
    await expect(place('orb', { ...insight, citations: [a] })).rejects.toThrow(/at least 2 cards/);
    await expect(place('orb', { ...insight })).rejects.toThrow(/citations/);
    await expect(place('orb', { ...insight, citations: [a, a] })).rejects.toThrow(/different cards/);
    await expect(place('orb', { ...insight, citations: [a, 'c_ghost'] })).rejects.toThrow(/not found: c_ghost/);
    expect((await store.board(canvasId)).cards()).toHaveLength(2);
  });

  it('places with two citations; an update cannot drop below two or cite itself', async () => {
    const id = await place('critic', { type: 'insight', title: 'So what', body: 'Both agree.', citations: [a, b] });
    expect((await cardOf(id)).data).toEqual({ title: 'So what', body: 'Both agree.', citations: [a, b] });
    await expect(updateCard(store, { cardId: id, citations: [a] }, as('orb'))).rejects.toThrow(/at least 2 cards/);
    await expect(updateCard(store, { cardId: id, citations: [a, id] }, as('orb'))).rejects.toThrow(/not found/);
    await updateCard(store, { cardId: id, title: 'Sharper', citations: [b, a] }, as('orb'));
    expect((await cardOf(id)).data).toMatchObject({ title: 'Sharper', citations: [b, a] });
    const described = await queryBoard(store, {}, as('orb'));
    expect(JSON.stringify(described)).toContain(`citing ${b}, ${a}`);
  });
});

describe('hypothesis', () => {
  it('keeps confidence and evidence, and an update changes them', async () => {
    const id = await place('critic', {
      type: 'hypothesis',
      title: 'Teams pay first',
      confidence: 40,
      evidenceFor: [a],
    });
    expect((await cardOf(id)).data).toMatchObject({ confidence: 40, evidenceFor: [a] });
    await expect(place('critic', { type: 'hypothesis', title: 'H', confidence: 140 })).rejects.toThrow(/confidence/);
    await expect(place('critic', { type: 'hypothesis', title: 'H', confidence: 5, evidenceAgainst: ['c_x'] })).rejects.toThrow(
      /not found: c_x/,
    );
    await updateCard(store, { cardId: id, confidence: 75, evidenceAgainst: [b] }, as('orb'));
    const card = await cardOf(id);
    expect(card.data).toMatchObject({ confidence: 75, evidenceFor: [a], evidenceAgainst: [b] });
    expect(cardKindLabel(card)).toBe('hypothesis · 75%');
  });
});

describe('decision and framework', () => {
  it('a decision keeps its options, choice and rubric; bad shapes are refused', async () => {
    const decision = {
      type: 'decision',
      title: 'Pick',
      options: [
        { label: 'Pro', scores: [8, 6] },
        { label: 'Team', scores: [6, 9] },
      ],
      criteria: [
        { name: 'Price', weight: 2 },
        { name: 'Reach', weight: 1 },
      ],
    };
    const id = await place('builder', decision);
    expect((await cardOf(id)).data).toMatchObject({ status: 'open' });
    await updateCard(store, { cardId: id, choice: 'Pro', decisionStatus: 'decided', rationale: 'Cheapest.' }, as('orb'));
    expect((await cardOf(id)).data).toMatchObject({ status: 'decided', choice: 'Pro', rationale: 'Cheapest.' });
    await expect(place('builder', { ...decision, choice: 'Nope' })).rejects.toThrow(/choice/);
    await expect(place('builder', { ...decision, options: [{ label: 'Only' }] })).rejects.toThrow(/options/);
    await expect(place('builder', { ...decision, decisionStatus: 'decided' })).rejects.toThrow(/needs a choice/);
    await expect(updateCard(store, { cardId: id, choice: 'Gone' }, as('orb'))).rejects.toThrow(/choice/);
  });

  it('a framework takes the cells of its variant only', async () => {
    const id = await place('critic', {
      type: 'framework',
      title: 'Plan',
      variant: 'swot',
      entries: [
        { cell: 'strengths', text: 'Cheap' },
        { cell: 'strengths', text: 'Simple' },
        { cell: 'threats', text: 'Bundling' },
      ],
    });
    expect((await cardOf(id)).data).toMatchObject({
      variant: 'swot',
      cells: { strengths: ['Cheap', 'Simple'], threats: ['Bundling'] },
    });
    await expect(
      place('critic', { type: 'framework', title: 'P', variant: 'proscons', entries: [{ cell: 'strengths', text: 'x' }] }),
    ).rejects.toThrow(/not a proscons cell/);
    await updateCard(store, { cardId: id, entries: [{ cell: 'weaknesses', text: 'Few integrations' }] }, as('orb'));
    expect((await cardOf(id)).data).toMatchObject({ cells: { weaknesses: ['Few integrations'] } });
    await expect(
      updateCard(store, { cardId: id, entries: [{ cell: 'pros', text: 'x' }] }, as('orb')),
    ).rejects.toThrow(/variant/);
  });

  it('roles: Scout places none, the Critic no decision', async () => {
    await expect(place('scout', { type: 'hypothesis', title: 'H', confidence: 5 })).rejects.toThrow(/scout may not place/);
    await expect(
      place('critic', { type: 'decision', title: 'D', options: [{ label: 'A' }, { label: 'B' }] }),
    ).rejects.toThrow(/critic may not place decision/);
    await place('orb', { type: 'decision', title: 'D', options: [{ label: 'A' }, { label: 'B' }] });
  });
});
