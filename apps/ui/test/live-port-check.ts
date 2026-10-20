/**
 * P4.5 live check of the research document with the real model (never part of `pnpm test` / `pnpm e2e`):
 *
 *   pnpm tsx apps/ui/test/live-port-check.ts      (after `pnpm build`)
 *
 * A sidecar (temp homes, throwaway Keychain service) with the real key in its launch env (OPENAI_API_KEY from the
 * environment, else the dev key from the Keychain `ai.orb.app`, scripts/util/devKey.ts) and Orb on its default route
 * (openai / gpt-6-luna). A small board (two frames, five cards; a third frame out of scope) is composed with
 * `port.compose` (standard format), then one section is regenerated. PASS when Orb wrote at least two sections
 * through `compose_section`, every paragraph cites cards of the scope only, `port/doc.md` has the reference list, and
 * the regenerate rewrote that section. Prints the progress, the sections and timings; never the key.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PortProgress } from '@orb/shared';
import { createWire } from '../src/wire/index.js';
import { startSidecar } from '../../../scripts/testkit/index.ts';
import { ensureDevKey } from '../../../scripts/util/devKey.ts';

if (!(await ensureDevKey('OPENAI_API_KEY')))
  throw new Error('live-port-check: needs OPENAI_API_KEY in the environment or the dev Keychain');

const sc = await startSidecar({ env: { OPENAI_API_KEY: process.env.OPENAI_API_KEY! } });
const wire = createWire({ baseUrl: sc.baseUrl, fetch: sc.fetch, createSocket: sc.createSocket });
let pass: boolean;
try {
  const { id } = await wire.orb.canvas.create({ prompt: 'Home batteries for renters' });
  const frame = async (title: string, x: number) =>
    (
      (
        await wire.orb.board.command(id, {
          type: 'frame.added',
          frame: { title, color: 'sky', x, y: 0, w: 700, h: 600 },
        })
      ).event!.data as { frame: { id: string } }
    ).frame.id;
  const card = async (frameId: string, c: Record<string, unknown>) =>
    (
      (
        await wire.orb.board.command(id, {
          type: 'card.added',
          card: { frameId, x: 20, y: 60, w: 300, h: 180, ...c } as never,
        })
      ).event!.data as { card: { id: string } }
    ).card.id;
  const market = await frame('Market', 0);
  const risks = await frame('Risks', 800);
  const other = await frame('Unrelated', 1600);
  const inScope = new Set<string>([
    await card(market, {
      type: 'source',
      data: {
        title: 'Plug-in balcony batteries: 2026 sales report',
        url: 'https://example.com/balcony-batteries-2026',
        summary: 'Sales of plug-in home batteries for apartments doubled in 2026; most buyers rent.',
      },
    }),
    await card(market, {
      type: 'note',
      data: { text: 'Renters cannot install wall batteries without the landlord.' },
    }),
    await card(market, {
      type: 'table',
      data: {
        title: 'Prices',
        columns: ['Model', 'kWh', 'Price'],
        rows: [
          ['A', '1.6', '$599'],
          ['B', '2.0', '$799'],
        ],
        totalRows: 2,
      },
    }),
    await card(risks, {
      type: 'question',
      data: { title: 'Do insurers accept them?', body: 'Unclear for rented flats.' },
    }),
    await card(risks, {
      type: 'risk',
      data: { title: 'Fire codes', body: 'Some cities restrict indoor lithium storage.' },
    }),
  ]);
  const outside = await card(other, { type: 'note', data: { text: 'Garden furniture trends.' } });

  const t0 = performance.now();
  const events: PortProgress[] = [];
  for await (const e of wire.orb.port.compose(id, { scope: [market, risks], instructions: '' })) {
    events.push(e);
    console.log(
      `  ${Math.round(performance.now() - t0)} ms  ${e.type}${'sectionId' in e ? ` ${e.sectionId}` : ''}${'message' in e ? `: ${e.message}` : ''}`,
    );
  }
  const composeMs = Math.round(performance.now() - t0);
  const { doc } = await wire.orb.port.get(id);
  const sections = doc?.sections ?? [];
  for (const s of sections)
    console.log(
      `  [${s.id}] ${s.heading}: ${s.paragraphs.length} paragraph(s), ${s.figures.length} figure(s), cites ${s.paragraphs.map((p) => p.cardIds.length).join('/')}`,
    );
  const cited = sections.flatMap((s) => s.paragraphs.flatMap((p) => p.cardIds));
  const allCited = sections.every((s) => s.paragraphs.every((p) => p.cardIds.length > 0));
  const onlyScope = cited.every((c) => inScope.has(c)) && !cited.includes(outside);
  const md = readFileSync(join(sc.paths.orbHome, 'canvases', id, 'port', 'doc.md'), 'utf8');
  console.log(
    `compose: ${composeMs} ms, ${sections.length} sections, ${new Set(cited).size} distinct cards cited, rejected calls: ${events.filter((e) => e.type === 'rejected').length}`,
  );

  const target = sections[0]?.id;
  let regenOk = false;
  if (target) {
    const before = JSON.stringify(sections[0]!.paragraphs.map((p) => p.text));
    const r0 = performance.now();
    const { doc: after } = await wire.orb.port.regenerateSection(id, target);
    const s = after.sections.find((x) => x.id === target)!;
    regenOk =
      JSON.stringify(s.paragraphs.map((p) => p.text)) !== before &&
      s.paragraphs.every((p) => p.cardIds.length > 0);
    console.log(
      `regenerate [${target}]: ${Math.round(performance.now() - r0)} ms, rewritten=${regenOk}, sections still ${after.sections.length}`,
    );
  }
  pass =
    events.at(-1)?.type === 'done' &&
    sections.length >= 2 &&
    allCited &&
    onlyScope &&
    md.includes('## References') &&
    regenOk;
} finally {
  wire.dispose();
  await sc.stop();
}
console.log(pass ? 'PASS' : 'FAIL');
process.exit(pass ? 0 : 1);
