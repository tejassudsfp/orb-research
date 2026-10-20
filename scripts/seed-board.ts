/**
 * Seed a test canvas with frames and cards (BUILD_PLAN P2.2 performance check: 300 cards in 8 frames).
 *
 *   pnpm seed-board [--home <ORB_HOME>] [--cards 300] [--frames 8] [--title "Seeded board"] [--seed 1]
 *
 * Every event goes through the orb-canvas service (`CanvasStore.command`), the only writer of board.jsonl, so the
 * seeded log is exactly what the app would write. Content is deterministic for a given `--seed` (ids and timestamps
 * are not). The default home is $ORB_HOME, else the dev board home `<repo>/.orb-dev/Orb`.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CanvasStore } from '@orb/canvas';
import type { Actor, CardType, FrameColor } from '@orb/shared';

export type SeedOptions = {
  home: string;
  cards?: number;
  frames?: number;
  title?: string;
  seed?: number;
};

export type SeedResult = { canvasId: string; cards: number; frames: number; events: number };

/** Board geometry: frames in a 4-column grid, cards in a 5-column grid inside each frame. */
export const SEED_LAYOUT = {
  frameColumns: 4,
  cardColumns: 5,
  cardW: 240,
  cardH: 250,
  gap: 24,
  padTop: 56,
  pad: 24,
  frameGap: 120,
  originX: 80,
  originY: 120,
} as const;

const FRAME_TITLES = [
  'Thesis',
  'Market',
  'Competitors',
  'Prototype',
  'Open questions',
  'Sources',
  'Risks',
  'Port draft',
];
const TONES: FrameColor[] = ['sky', 'signal', 'rho', 'paper'];
const TYPES: CardType[] = ['source', 'note', 'quote', 'question', 'risk', 'doc'];
const WORDS = (
  'harness plugin canvas frame agent scout critic builder source citation thesis market signal research board ' +
  'evidence claim pricing churn retention cohort latency budget model token context memory link tension support ' +
  'interview survey dataset filing revenue margin segment pilot rollout onboarding search index layout reading'
).split(' ');

/** mulberry32: a small deterministic PRNG. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Write `frames` frames and `cards` cards into a new canvas under `home`. */
export async function seedBoard(options: SeedOptions): Promise<SeedResult> {
  const nCards = options.cards ?? 300;
  const nFrames = options.frames ?? 8;
  if (nFrames < 1) throw new Error('seed-board: need at least one frame');
  const rand = prng(options.seed ?? 1);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
  const words = (n: number) => Array.from({ length: n }, () => pick(WORDS)).join(' ');
  const sentence = (n: number) => {
    const w = words(n);
    return `${w[0]!.toUpperCase()}${w.slice(1)}.`;
  };

  const L = SEED_LAYOUT;
  const perFrame = Math.ceil(nCards / nFrames);
  const rows = Math.ceil(perFrame / L.cardColumns);
  const frameW = 2 * L.pad + L.cardColumns * L.cardW + (L.cardColumns - 1) * L.gap;
  const frameH = L.padTop + rows * L.cardH + (rows - 1) * L.gap + L.pad;

  const store = new CanvasStore({ home: options.home });
  let events = 0;
  try {
    const meta = await store.create({ prompt: options.title ?? `Seeded board, ${nCards} cards` });
    const frameIds: { id: string; x: number; y: number }[] = [];
    for (let i = 0; i < nFrames; i++) {
      const x = L.originX + (i % L.frameColumns) * (frameW + L.frameGap);
      const y = L.originY + Math.floor(i / L.frameColumns) * (frameH + L.frameGap);
      const event = await store.command(meta.id, {
        type: 'frame.added',
        frame: {
          title: FRAME_TITLES[i % FRAME_TITLES.length]!,
          color: TONES[i % TONES.length]!,
          x,
          y,
          w: frameW,
          h: frameH,
        },
      });
      events++;
      frameIds.push({ id: (event.data as { frame: { id: string } }).frame.id, x, y });
    }
    for (let i = 0; i < nCards; i++) {
      const frame = frameIds[i % nFrames]!;
      const slot = Math.floor(i / nFrames);
      const x = frame.x + L.pad + (slot % L.cardColumns) * (L.cardW + L.gap);
      const y = frame.y + L.padTop + Math.floor(slot / L.cardColumns) * (L.cardH + L.gap);
      const type = pick(TYPES);
      const agentCard = type !== 'note' && rand() < 0.7;
      const actor: Actor = agentCard
        ? {
            kind: 'agent',
            agent: pick(['scout', 'critic', 'builder'] as const),
            model: 'gpt-6-luna',
            sessionId: `orb-seed-${i}`,
          }
        : { kind: 'user' };
      const badge = type === 'source' ? pick(['must', 'skim', undefined] as const) : undefined;
      await store.command(
        meta.id,
        {
          type: 'card.added',
          card: {
            type,
            frameId: frame.id,
            x,
            y,
            w: L.cardW,
            h: L.cardH,
            data: { title: sentence(3 + Math.floor(rand() * 4)), body: sentence(8 + Math.floor(rand() * 7)) },
            ...(agentCard ? { why: sentence(6).slice(0, 140) } : {}),
            ...(badge ? { badge } : {}),
          },
        },
        actor,
      );
      events++;
    }
    await store.flush();
    return { canvasId: meta.id, cards: nCards, frames: nFrames, events };
  } finally {
    await store.close();
  }
}

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function main(argv: string[]): Promise<void> {
  const home = resolve(
    arg(argv, 'home') ?? process.env.ORB_HOME ?? resolve(import.meta.dirname, '..', '.orb-dev', 'Orb'),
  );
  const num = (name: string) => {
    const v = arg(argv, name);
    return v === undefined ? undefined : Number(v);
  };
  const title = arg(argv, 'title');
  const result = await seedBoard({
    home,
    ...(num('cards') !== undefined ? { cards: num('cards')! } : {}),
    ...(num('frames') !== undefined ? { frames: num('frames')! } : {}),
    ...(num('seed') !== undefined ? { seed: num('seed')! } : {}),
    ...(title ? { title } : {}),
  });
  console.log(
    `seeded ${result.canvasId}: ${result.frames} frames, ${result.cards} cards (${result.events} events) in ${home}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}
