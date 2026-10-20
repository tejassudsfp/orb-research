/**
 * P6.20: a VC-like board for the layout e2e: the vc-dd template on a fresh canvas (12 frames, ~50 seed cards laid out by
 * `planTemplate`), then agent cards of many types and content lengths round the frames (placed by the layout engine,
 * as Scout and Critic do), and links of every kind between them (tension, supports, contradicts, thread labels), some
 * between frames far apart. Deterministic: the same call writes the same board. Written through the orb-canvas
 * service, the only writer of canvas files.
 */
import { CanvasStore } from '@orb/canvas';
import type { Actor, CardType } from '@orb/shared';

const scout: Actor = { kind: 'agent', agent: 'scout', model: 'gpt-6-luna', sessionId: 'orb-vc-scout' };
const critic: Actor = { kind: 'agent', agent: 'critic', model: 'gpt-6-luna', sessionId: 'orb-vc-critic' };

export const VC_INTAKE = {
  company: 'Duolingo',
  website: 'duolingo.com',
  stage: 'Growth',
  round_amount: 'to confirm',
  thesis: 'Does a freemium learning habit become a durable subscription business?',
  concerns: 'Growth after the AI wave, and the cost of free users',
  founders: 'Luis von Ahn, https://linkedin.com/in/luisvonahn',
  sites: ['sec.gov', 'investors.duolingo.com'],
  depth: 'quick',
} as const;

/** mulberry32, so the board is the same on every run. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SENTENCE =
  'Filing-based evidence for the claim, with the date and where the number comes from, and what would change the answer';
const words = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => SENTENCE.split(' ')[(i + from) % SENTENCE.split(' ').length]).join(' ');

type Made = { type: CardType; data: Record<string, unknown>; why: string; badge?: 'must' | 'skim'; actor: Actor };

/** One agent card: the type, a short or long body by the draw, a why line of one or two lines. */
function made(i: number, rand: () => number): Made {
  const long = rand() < 0.4;
  const title = `${['Revenue', 'Founders', 'Churn', 'Moat', 'Pricing', 'Hiring', 'Margin', 'Cohorts'][i % 8]} ${i}${long ? `: ${words(8, i)}` : ''}`;
  const body = words(long ? 40 + Math.floor(rand() * 40) : 6 + Math.floor(rand() * 8), i);
  const why = long ? `Why: ${words(18, i + 3)}` : 'Backs the thesis with a primary source.';
  const actor = i % 3 === 0 ? critic : scout;
  const badge = i % 7 === 0 ? ('must' as const) : undefined;
  const kinds: CardType[] = [
    'source',
    'source',
    'quote',
    'question',
    'risk',
    'metric',
    'metric',
    'entity',
    'note',
    'doc',
    'timeline',
    'matrix',
    'checklist',
    'product',
    'insight',
  ];
  const type = kinds[Math.floor(rand() * kinds.length)]!;
  const base = { why, ...(badge ? { badge } : {}), actor };
  switch (type) {
    case 'source':
      return { type, ...base, data: { title, url: `https://example.org/${i}`, summary: body, excerpts: [words(12, i)] } };
    case 'quote':
      return { type, ...base, data: { title, text: body, url: `https://example.org/q${i}` } };
    case 'question':
      return { type, ...base, data: { title, text: body } };
    case 'risk':
      return { type, ...base, data: { title, text: body } };
    case 'metric':
      return {
        type,
        ...base,
        data: { title: long ? title : title.slice(0, 18), value: `$${(i * 37) % 900}.${i % 10}M`, unit: 'USD revenue', period: 'FY2025', source: { label: 'sec.gov' }, ...(long ? { note: body.slice(0, 390) } : {}) },
      };
    case 'entity':
      return { type, ...base, data: { title: `Person ${i}`, kind: 'person', role: long ? words(9, i) : 'CEO', org: 'Duolingo', body, facts: [{ label: 'Prior company', value: long ? words(10, i) : 'reCAPTCHA' }] } };
    case 'note':
      return { type, ...base, data: { title, text: body } };
    case 'doc':
      return { type, ...base, data: { title, body } };
    case 'timeline':
      return {
        type,
        ...base,
        data: {
          title,
          events: Array.from({ length: 2 + Math.floor(rand() * 8) }, (_, k) => ({ date: `20${10 + k}-0${1 + (k % 9)}`, label: words(5, i + k), source: { label: 'sec.gov' } })),
        },
      };
    case 'matrix':
      return {
        type,
        ...base,
        data: {
          title,
          criteria: [
            { name: 'Core capability', weight: 30 },
            { name: 'Ease of use', weight: 20 },
            { name: 'Price', weight: 20 },
          ],
          options: [
            { name: 'Duolingo', scores: [4, 5, 3] },
            { name: 'Alternative A', scores: [3, 3, 4] },
          ],
        },
      };
    case 'checklist':
      return {
        type,
        ...base,
        data: { title, items: Array.from({ length: 2 + Math.floor(rand() * 9) }, (_, k) => ({ id: `i${k + 1}`, text: words(6, i + k), done: false })) },
      };
    case 'product':
      return { type, ...base, data: { title, kind: 'competitor', vendor: 'Rival Inc', body, pricing: '$12 per month', strengths: [words(5, i), words(6, i + 1)], weaknesses: [words(5, i + 2)] } };
    default:
      // 'insight' needs two citations: the first two seed cards of the board stand in (the caller fixes them up).
      return { type: 'note', ...base, data: { title, text: body } };
  }
}

export type VcBoard = { canvasId: string; frameIds: string[]; cardIds: string[]; linkIds: string[] };

/**
 * Seed the board in `orbHome` (the app's ORB_HOME). `perFrame` agent cards go round the 12 frames; links join cards in
 * the same frame and cards in different frames.
 */
export async function seedVcBoard(orbHome: string, opts: { perFrame?: number; seed?: number } = {}): Promise<VcBoard> {
  const perFrame = opts.perFrame ?? 5;
  const rand = rng(opts.seed ?? 20);
  const store = new CanvasStore({ home: orbHome, searchIndex: false, flushMs: 5, frameBudget: 40 });
  try {
    const meta = await store.create({
      prompt: 'Duolingo: VC due diligence',
      template: 'vc-dd',
      intake: VC_INTAKE as unknown as Record<string, string | string[]>,
      depth: 'quick',
      start: false,
    });
    const id = meta.id;
    const board = await store.board(id);
    const frameIds = board.frames().map((f) => f.id);
    const cardIds: string[] = [];
    let n = 0;
    for (let round = 0; round < perFrame; round++)
      for (const frameId of frameIds) {
        const c = made(n, rand);
        const ev = await store.placeAgentCard(id, { type: c.type, frameId, data: c.data, why: c.why, ...(c.badge ? { badge: c.badge } : {}) }, { ...c.actor, toolCallId: `call_${n}` } as Actor);
        cardIds.push((ev.data as { card: { id: string } }).card.id);
        n++;
      }
    const linkIds: string[] = [];
    const kinds = ['tension', 'supports', 'contradicts', 'leads-to'] as const;
    for (let k = 0; k < 18; k++) {
      const from = cardIds[(k * 7) % cardIds.length]!;
      const to = cardIds[(k * 7 + 5 + (k % 3) * frameIds.length) % cardIds.length]!;
      if (from === to) continue;
      const r = await store.addAgentLink(id, { from, to, type: kinds[k % kinds.length]! }, critic);
      linkIds.push(r.linkId);
    }
    await store.flush();
    return { canvasId: id, frameIds, cardIds, linkIds };
  } finally {
    await store.close();
  }
}
