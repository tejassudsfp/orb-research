/**
 * fast-check generators for board commands (P2.4 property tests). A `Spec` is random raw material; `toCommand`
 * turns it into a command that is VALID on a given board (it picks existing ids), or undefined when the board has
 * nothing it could apply to. Commands are planned with the real `planCommand` and a deterministic id minter.
 */
import fc from 'fast-check';
import {
  BoardCommandError,
  FrameColor,
  LinkType,
  applyChanges,
  emptyBoard,
  planCommand,
  type Actor,
  type BoardChange,
  type BoardCommand,
  type BoardState,
  type CardType,
  type SingleBoardCommand,
} from '../src/index.js';

export const SINGLE_KINDS = [
  'frame.added',
  'frame.updated',
  'frame.removed',
  'card.added',
  'card.moved',
  'card.updated',
  'card.removed',
  'link.added',
  'link.removed',
] as const;
export type SingleKind = (typeof SINGLE_KINDS)[number];
export const KINDS = [...SINGLE_KINDS, 'batch'] as const;
export type Kind = (typeof KINDS)[number];

const TITLES = ['Thesis', 'Harness', 'Open questions', 'Risks', 'Sources'];
const CARD_TYPES: CardType[] = ['note', 'source', 'quote', 'question', 'risk'];

export type Spec = {
  kind: SingleKind;
  picks: number[];
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  color: FrameColor;
  linkType: LinkType;
  cardType: CardType;
  flags: boolean[];
  badge: 'must' | 'skim' | null;
  text: string;
};

export const specArb = (kind?: SingleKind): fc.Arbitrary<Spec> =>
  fc.record({
    kind: kind ? fc.constant(kind) : fc.constantFrom(...SINGLE_KINDS),
    picks: fc.array(fc.nat(), { minLength: 1, maxLength: 4 }),
    x: fc.integer({ min: -3000, max: 3000 }),
    y: fc.integer({ min: -3000, max: 3000 }),
    w: fc.integer({ min: 40, max: 900 }),
    h: fc.integer({ min: 40, max: 900 }),
    title: fc.constantFrom(...TITLES),
    color: fc.constantFrom(...FrameColor.options),
    linkType: fc.constantFrom(...LinkType.options),
    cardType: fc.constantFrom(...CARD_TYPES),
    flags: fc.array(fc.boolean(), { minLength: 10, maxLength: 10 }),
    badge: fc.constantFrom('must' as const, 'skim' as const, null),
    text: fc.string({ maxLength: 30 }),
  });

const pick = <T>(items: readonly T[], n: number): T | undefined =>
  items.length === 0 ? undefined : items[n % items.length];
const pickMany = <T>(items: readonly T[], picks: number[]): T[] =>
  items.length === 0 ? [] : [...new Set(picks.map((n) => items[n % items.length]!))];

/** A command for `spec` that fits `state`, or undefined when the board has nothing to apply it to. */
export function toCommand(state: BoardState, spec: Spec): SingleBoardCommand | undefined {
  const cards = Object.keys(state.cards);
  const frames = Object.keys(state.frames);
  const links = Object.keys(state.links);
  const [p0 = 0, p1 = 1] = spec.picks;
  const f = spec.flags;
  const frameOrNull = (n: number) => (f[9] ? null : (pick(frames, n) ?? null));
  switch (spec.kind) {
    case 'frame.added':
      return {
        type: 'frame.added',
        frame: { title: spec.title, color: spec.color, x: spec.x, y: spec.y, w: spec.w, h: spec.h },
      };
    case 'frame.updated': {
      const id = pick(frames, p0);
      if (!id) return undefined;
      const patch: Record<string, unknown> = {};
      if (f[0]) patch.title = spec.title;
      if (f[1]) patch.color = spec.color;
      if (f[2]) patch.x = spec.x;
      if (f[3]) patch.y = spec.y;
      if (f[4]) patch.w = spec.w;
      if (f[5] || Object.keys(patch).length === 0) patch.h = spec.h;
      return { type: 'frame.updated', id, patch };
    }
    case 'frame.removed': {
      const id = pick(frames, p0);
      return id ? { type: 'frame.removed', id } : undefined;
    }
    case 'card.added':
      return {
        type: 'card.added',
        card: {
          type: spec.cardType,
          frameId: frameOrNull(p0),
          x: spec.x,
          y: spec.y,
          w: spec.w,
          h: spec.h,
          data: { text: spec.text },
          ...(f[0] ? { why: spec.text } : {}),
          ...(f[1] && spec.badge ? { badge: spec.badge } : {}),
          ...(f[2] ? { note: spec.text } : {}),
        },
      };
    case 'card.moved': {
      const ids = pickMany(cards, spec.picks);
      if (ids.length === 0) return undefined;
      if (f[8] && ids.length === 1) return { type: 'card.moved', id: ids[0]!, x: spec.x, y: spec.y };
      return {
        type: 'card.moved',
        moves: ids.map((id, i) => ({
          id,
          x: spec.x + i * 10,
          y: spec.y - i * 10,
          ...(f[i % 8] ? { frameId: frameOrNull(i + p1) } : {}),
        })),
      };
    }
    case 'card.updated': {
      const id = pick(cards, p0);
      if (!id) return undefined;
      const patch: Record<string, unknown> = {};
      if (f[0]) patch.x = spec.x;
      if (f[1]) patch.w = spec.w;
      if (f[2]) patch.data = { text: spec.text, edited: true };
      if (f[3]) patch.why = f[7] ? null : spec.text;
      if (f[4]) patch.badge = spec.badge;
      if (f[5]) patch.note = f[8] ? null : spec.text;
      if (f[6]) patch.frameId = frameOrNull(p1);
      if (Object.keys(patch).length === 0) patch.h = spec.h;
      return { type: 'card.updated', id, patch };
    }
    case 'card.removed': {
      const ids = pickMany(cards, spec.picks);
      return ids.length > 0 ? { type: 'card.removed', ids } : undefined;
    }
    case 'link.added': {
      const ends = [...cards, ...frames];
      const from = pick(ends, p0);
      const rest = ends.filter((e) => e !== from);
      const to = pick(rest, p1);
      if (!from || !to) return undefined;
      return {
        type: 'link.added',
        link: {
          from,
          to,
          type: spec.linkType,
          ...(spec.linkType === 'label' || f[0] ? { label: spec.title } : {}),
        },
      };
    }
    case 'link.removed': {
      const ids = pickMany(links, spec.picks);
      return ids.length > 0 ? { type: 'link.removed', ids } : undefined;
    }
  }
}

export type Minter = { n: number; mintId: (prefix: 'c' | 'f' | 'l') => string };
export const minter = (): Minter => {
  const m: Minter = {
    n: 0,
    mintId: (prefix) => `${prefix}_${(m.n++).toString().padStart(6, '0')}`,
  };
  return m;
};

const userActor: Actor = { kind: 'user' };
export const agentActor: Actor = { kind: 'agent', agent: 'scout', model: 'gpt-6-luna', sessionId: 's_1' };

/**
 * Build a batch from several specs: each sub-command is chosen on the board as the earlier ones leave it, with a
 * scratch minter that the real plan then repeats (same ids in the same order).
 */
export function toBatch(state: BoardState, specs: Spec[], m: Minter): BoardCommand | undefined {
  const start = m.n;
  let scratch = state;
  const commands: SingleBoardCommand[] = [];
  for (const spec of specs) {
    const cmd = toCommand(scratch, spec);
    if (!cmd) continue;
    try {
      scratch = applyChanges(
        scratch,
        planCommand(scratch, cmd, { actor: userActor, now: 1, mintId: m.mintId }),
      );
      commands.push(cmd);
    } catch (e) {
      if (!(e instanceof BoardCommandError)) throw e;
    }
  }
  m.n = start;
  return commands.length > 0 ? { type: 'batch', commands } : undefined;
}

/** A starting board: a fixed seed (frames, cards in and out of frames, agent cards, links) plus random commands. */
export const SEED: { cmd: SingleBoardCommand; actor: Actor }[] = [
  {
    cmd: { type: 'frame.added', frame: { title: 'Thesis', color: 'sky', x: 0, y: 0, w: 800, h: 600 } },
    actor: userActor,
  },
  {
    cmd: { type: 'frame.added', frame: { title: 'Risks', color: 'rho', x: 900, y: 0, w: 600, h: 600 } },
    actor: agentActor,
  },
];

export function seedBoard(m: Minter): BoardState {
  let state = emptyBoard();
  const run = (cmd: BoardCommand, actor: Actor) => {
    state = applyChanges(state, planCommand(state, cmd, { actor, now: 1, mintId: m.mintId }));
  };
  for (const { cmd, actor } of SEED) run(cmd, actor);
  const [f1, f2] = Object.keys(state.frames);
  const card = (x: number, frameId: string | null, type: CardType = 'note') => ({
    type,
    frameId,
    x,
    y: 40,
    w: 240,
    h: 160,
    data: { text: `card ${x}` },
  });
  run({ type: 'card.added', card: card(10, f1!) }, userActor);
  run({ type: 'card.added', card: { ...card(300, f1!), why: 'seed', badge: 'must' } }, userActor);
  run({ type: 'card.added', card: { ...card(1000, f2!, 'source'), why: 'agent card' } }, agentActor);
  run({ type: 'card.added', card: { ...card(2000, null), note: 'user note tab' } }, userActor);
  const [c1, c2, c3, c4] = Object.keys(state.cards);
  run({ type: 'link.added', link: { from: c1!, to: c3!, type: 'supports' } }, userActor);
  run({ type: 'link.added', link: { from: c2!, to: f2!, type: 'tension' } }, agentActor);
  run({ type: 'link.added', link: { from: f1!, to: c4!, type: 'label', label: 'see' } }, userActor);
  return state;
}

/** Apply random specs (as user or agent) on top of `state`, skipping the ones that do not fit. */
export function grow(state: BoardState, specs: { spec: Spec; agent: boolean }[], m: Minter): BoardState {
  for (const { spec, agent } of specs) {
    const cmd = toCommand(state, spec);
    if (!cmd) continue;
    try {
      state = applyChanges(
        state,
        planCommand(state, cmd, { actor: agent ? agentActor : userActor, now: 2, mintId: m.mintId }),
      );
    } catch (e) {
      if (!(e instanceof BoardCommandError)) throw e;
    }
  }
  return state;
}

export const growthArb = fc.array(fc.record({ spec: specArb(), agent: fc.boolean() }), { maxLength: 15 });

/** The comparable view of a board: its records AND their insertion order (draw order, frame numbers). */
export const view = (s: BoardState) => ({
  cards: s.cards,
  frames: s.frames,
  links: s.links,
  order: { cards: Object.keys(s.cards), frames: Object.keys(s.frames), links: Object.keys(s.links) },
});

export const plan = (state: BoardState, cmd: BoardCommand, m: Minter): BoardChange[] =>
  planCommand(state, cmd, { actor: userActor, now: 3, mintId: m.mintId });
