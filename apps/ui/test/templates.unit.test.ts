/**
 * P6.11 UI units: the intake form drawn to static markup (every field of the template, required markers, the depth
 * tiers, the signed-in sources, the materials zone), the follow-up chips' "first pass is done" rule, and
 * `startFromIntake` against a stub wire (the canvas is created WITHOUT Orb's turn when materials are dropped, the
 * materials are added, and only then does Orb start, even when a material fails).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { emptyBoard, specOf, type BoardState, type Card } from '@orb/shared';
import { IntakeForm } from '../src/screens/Home/IntakeForm.js';
import { followUpsFor, firstPassDone, FIRST_PASS_CARDS } from '../src/screens/Canvas/followUps.js';
import { startFromIntake } from '../src/screens/Home/seed.js';

const vc = specOf('vc-dd')!;
const html = (props: Partial<Parameters<typeof IntakeForm>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(IntakeForm, { spec: vc, onSubmit: () => undefined, onCancel: () => undefined, ...props }),
  );

describe('the intake form', () => {
  it("is a modal dialog with a heading and every field of the spec, in the spec's order", () => {
    const out = html();
    expect(out).toContain('role="dialog"');
    expect(out).toContain('aria-modal="true"');
    expect(out).toContain('aria-labelledby');
    expect(out).toContain('VC due diligence');
    for (const f of vc.inputs) expect(out, f.label).toContain(f.label);
    const order = vc.inputs.map((f) => out.indexOf(f.label));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('marks the required fields and links labels to controls', () => {
    const out = html();
    expect(out).toMatch(/data-testid="intake-company"[^>]*aria-required="true"/);
    expect(out).toMatch(/data-testid="intake-website"[^>]*aria-required="true"/);
    expect(out).not.toMatch(/data-testid="intake-thesis"[^>]*aria-required/);
    expect(out).toMatch(/<label[^>]*for="[^"]*-company"/);
  });

  it('prefills the company from the ask box and offers the stage options and the sector suggestions', () => {
    const out = html({ initial: 'Acme Robotics' });
    expect(out).toContain('value="Acme Robotics"');
    for (const stage of ['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Growth'])
      expect(out).toContain(`>${stage}</option>`);
    expect(out).toContain('<datalist');
    expect(out).toContain('value="Fintech"');
  });

  it('shows the three depth tiers with their time and cost, Standard checked', () => {
    const out = html();
    for (const d of ['quick', 'standard', 'deep']) expect(out).toContain(`data-testid="intake-depth-${d}"`);
    expect(out).toContain('Quick scan');
    expect(out).toContain('about 15 minutes');
    expect(out).toMatch(/checked="" value="standard"/);
  });

  it('shows the signed-in sources (disabled until connected) and the materials zone', () => {
    const out = html();
    for (const s of ['Crunchbase', 'PitchBook', 'LinkedIn', 'DocSend']) expect(out).toContain(s);
    expect(out).toContain('(not connected)');
    expect(out).toContain('data-testid="intake-materials"');
    expect(out).toContain('Drop the deck');
  });

  it('shows a busy status and an error, and disables Start while busy', () => {
    const out = html({ busy: 'Creating…', error: 'boom' });
    expect(out).toContain('Creating…');
    expect(out).toContain('boom');
    expect(out).toMatch(/data-testid="intake-start"[^>]*disabled/);
  });
});

describe('follow-up chips', () => {
  const card = (n: number, by: 'agent' | 'user'): Card => ({
    id: `c_${n}`,
    type: 'note',
    frameId: null,
    x: 0,
    y: 0,
    w: 10,
    h: 10,
    data: {},
    provenance:
      by === 'agent'
        ? { kind: 'agent', agent: 'scout', model: 'm', sessionId: 's', at: 1 }
        : { kind: 'user', at: 1 },
  });
  const board = (agent: number, user = 5): BoardState => ({
    ...emptyBoard(),
    cards: Object.fromEntries(
      [
        ...Array.from({ length: agent }, (_, i) => card(i, 'agent')),
        ...Array.from({ length: user }, (_, i) => card(100 + i, 'user')),
      ].map((c) => [c.id, c]),
    ),
  });
  const meta = { template: 'vc-dd' as const, intake: { company: 'Acme' } };
  const idle = { scout: { state: 'idle' } as never };
  const running = { scout: { state: 'running' } as never };

  it('appear only when every agent is idle and the agents placed enough cards (the seeds do not count)', () => {
    expect(followUpsFor(meta, board(FIRST_PASS_CARDS - 1), idle)).toEqual([]);
    expect(followUpsFor(meta, board(FIRST_PASS_CARDS), running)).toEqual([]);
    expect(followUpsFor(meta, board(FIRST_PASS_CARDS), idle, { state: 'running' } as never)).toEqual([]);
    expect(firstPassDone(board(0, 80), idle)).toBe(false);
    const chips = followUpsFor(meta, board(FIRST_PASS_CARDS), idle);
    expect(chips.map((c) => c.label)).toEqual(vc.followUps.map((f) => f.label));
    expect(chips.find((c) => c.label === 'Build the bear case')!.prompt).toContain('Acme');
  });

  it('are not shown on a v1 template or a plain canvas', () => {
    expect(followUpsFor({ template: 'topic' }, board(20), idle)).toEqual([]);
    expect(followUpsFor(undefined, board(20), idle)).toEqual([]);
  });
});

describe('startFromIntake', () => {
  const file = (name: string, type = 'text/csv') => ({
    kind: 'file' as const,
    file: new File(['a,b\n1,2\n'], name, { type }),
  });
  const snapshot = {
    kind: 'snapshot' as const,
    nextSeq: 2,
    cards: [],
    frames: [{ id: 'f_1', title: 'Snapshot', color: 'signal', x: 96, y: 120, w: 624, h: 700 }],
    links: [],
  };
  function stubWire(opts: { commandFails?: boolean } = {}) {
    const calls: string[] = [];
    const wire = {
      orb: {
        canvas: {
          create: vi.fn(async (args: { start?: boolean }) => {
            calls.push(`create start=${String(args.start)}`);
            return { id: 'c1' };
          }),
          start: vi.fn(async () => {
            calls.push('start');
            return { id: 'c1' };
          }),
        },
        board: {
          follow: async function* () {
            yield snapshot;
          },
          command: vi.fn(async () => {
            calls.push('command');
            if (opts.commandFails) throw new Error('board refused');
          }),
        },
      },
      assets: {
        upload: vi.fn(async (_id: string, f: { name: string }) => ({
          path: `assets/${f.name}`,
          name: f.name,
          mime: 'text/csv',
          size: 8,
        })),
      },
      data: {},
    };
    return { wire: wire as never, calls };
  }
  const options = (items: ReturnType<typeof file>[]) => ({
    prompt: 'Acme: VC due diligence',
    template: 'vc-dd' as const,
    intake: { company: 'Acme', website: 'https://acme.com' },
    depth: 'standard' as const,
    items,
  });

  it('without materials, Orb starts at once with the create call', async () => {
    const { wire, calls } = stubWire();
    await startFromIntake(wire, options([]));
    expect(calls).toEqual(['create start=true']);
  });

  it('with materials: create without Orb, add the materials as one command, then start Orb', async () => {
    const { wire, calls } = stubWire();
    const { errors } = await startFromIntake(wire, options([file('Cap table.csv')]));
    expect(errors).toEqual([]);
    expect(calls).toEqual(['create start=false', 'command', 'start']);
  });

  it('starts Orb even when adding the materials fails (the canvas must not be left idle)', async () => {
    const { wire, calls } = stubWire({ commandFails: true });
    await expect(startFromIntake(wire, options([file('Cap table.csv')]))).rejects.toThrow('board refused');
    expect(calls).toEqual(['create start=false', 'command', 'start']);
  });

  it('refuses unsupported files without failing the canvas', async () => {
    const { wire, calls } = stubWire();
    const { errors } = await startFromIntake(wire, options([file('movie.mov', 'video/quicktime')]));
    expect(errors.join(' ')).toMatch(/movie\.mov/);
    expect(calls).toEqual(['create start=true']);
  });
});
