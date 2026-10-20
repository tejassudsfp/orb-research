/**
 * P6.12: the investing and finance templates (public equity, market map, portfolio monitoring, M&A screening, fund / LP
 * diligence) at the depth bar of docs/phase6/vc-dd-template.md. Every check runs on every one of the five: the spec
 * is internally consistent (frames, databases, seeds, charts, plan, rubric, red flags, memo, deck, tiers, follow-ups),
 * every playbook step uses only allow-listed tools, Parallel is used where it fits, and the v1 "stocks" template is merged.
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_TOOLS,
  DECK_FORMATS,
  DEPTHS,
  PLACEABLE_TYPES,
  TEMPLATES,
  TemplateSpecV2,
  cardDataSchema,
  deckFormatById,
  deckFormatFor,
  fillTokens,
  followUpChips,
  planToolViolations,
  playbookText,
  resolveTemplateId,
  specOf,
  stepsFor,
  templateOf,
  tierGate,
  type TemplateId,
  type TemplateSpecV2 as Spec,
} from '../src/index.js';

const IDS = ['public-equity', 'market-map', 'portfolio-monitor', 'ma-screen', 'fund-dd'] as const satisfies readonly TemplateId[];
const ROLES = ['orb', 'scout', 'critic', 'builder'] as const;

describe.each(IDS)('investing/finance template %s', (id) => {
  const spec = specOf(id)!;

  it('is a registered v2 template with its own Home chip and a valid spec', () => {
    expect(spec).toBeTruthy();
    expect(TemplateSpecV2.safeParse(spec).success).toBe(true);
    expect(TEMPLATES.find((t) => t.id === id)?.spec).toBe(spec);
  });

  it('has the depth bar: 10+ numbered frames each with a brief, owners and a target mix', () => {
    expect(spec.frames.length).toBeGreaterThanOrEqual(10);
    expect(new Set(spec.frames.map((f) => f.id)).size).toBe(spec.frames.length);
    for (const f of spec.frames) {
      expect(f.brief.length, f.id).toBeGreaterThan(120);
      expect(f.targets.length, f.id).toBeGreaterThan(0);
      expect(f.owners.length, f.id).toBeGreaterThan(0);
      expect(f.seeds.length, f.id).toBeGreaterThan(0);
    }
    // The first frame leaves room for the materials; one frame is Orb's, one is the Critic's red-flag frame, one is open questions.
    expect(spec.frames[0]!.room).toBeGreaterThan(0);
    expect(spec.frames.some((f) => f.owners.join() === 'critic')).toBe(true);
    expect(spec.frames.at(-1)!.owners).toEqual(expect.arrayContaining(['critic', 'orb']));
  });

  it('has an intake with the subject first and required, the materials zone, the depth and the signed-in sources', () => {
    const [first] = spec.inputs;
    expect(first!.required).toBe(true);
    expect(first!.kind).toBe('text');
    expect(spec.inputs.filter((f) => f.required).map((f) => f.kind)).toEqual(expect.arrayContaining(['text', 'depth']));
    expect(spec.inputs.map((f) => f.kind)).toEqual(expect.arrayContaining(['materials', 'depth', 'sites', 'longtext']));
    const sites = spec.inputs.find((f) => f.kind === 'sites')!;
    expect(sites.sites!.map((s) => s.domain).sort()).toEqual(spec.signedIn.map((s) => s.domain).sort());
    expect(new Set(spec.inputs.map((f) => f.id)).size).toBe(spec.inputs.length);
    for (const f of spec.inputs.filter((x) => x.kind === 'select')) expect(f.options?.length, f.id).toBeGreaterThan(1);
  });

  it('uses only intake fields in its {{tokens}}', () => {
    const known = new Set([...spec.inputs.map((f) => f.id), 'year', 'date']);
    const tokens = [...JSON.stringify(spec).matchAll(/\{\{([a-z][a-z0-9_]*)/g)].map((m) => m[1]!);
    expect(tokens.length).toBeGreaterThan(5);
    for (const t of tokens) expect(known.has(t), `{{${t}}}`).toBe(true);
  });

  it('declares databases with typed schemas, a key column, views over real columns and a seed card in their frame', () => {
    expect(spec.databases.length).toBeGreaterThanOrEqual(5);
    const frameIds = new Set(spec.frames.map((f) => f.id));
    for (const d of spec.databases) {
      expect(frameIds.has(d.frame), d.key).toBe(true);
      const names = d.columns.map((c) => c.name);
      expect(new Set(names).size, d.key).toBe(names.length);
      expect(d.keyColumn && names.includes(d.keyColumn), `${d.key} keyColumn`).toBe(true);
      for (const c of d.columns) if (c.type === 'enum') expect(c.options?.length, `${d.key}.${c.name}`).toBeGreaterThan(1);
      expect(d.views.length, d.key).toBeGreaterThan(0);
      for (const v of d.views) {
        if (v.group) {
          expect(names, `${d.key}/${v.name} group`).toContain(v.group);
          // A board needs a column with a few distinct values to make its lanes.
          if (v.kind === 'board')
            expect(d.columns.find((c) => c.name === v.group)!.type, `${d.key}/${v.name} lanes`).toBe('enum');
        }
        for (const k of v.sort ?? []) expect(names, `${d.key}/${v.name} sort`).toContain(k.column);
        for (const f of v.filter ?? []) expect(names, `${d.key}/${v.name} filter`).toContain(f.column);
      }
      const frame = spec.frames.find((f) => f.id === d.frame)!;
      expect(frame.seeds.some((s) => s.type === 'database' && s.db === d.key), `${d.key} seed`).toBe(true);
    }
    // Every database seed names a database; every database has exactly one seed.
    const dbSeeds = spec.frames.flatMap((f) => f.seeds.filter((s) => s.type === 'database'));
    expect(dbSeeds.map((s) => s.db).sort()).toEqual(spec.databases.map((d) => d.key).sort());
  });

  it('binds every chart seed to a database and to real columns of it', () => {
    const charts = spec.frames.flatMap((f) => f.seeds.filter((s) => s.type === 'chart'));
    expect(charts.length).toBeGreaterThanOrEqual(2);
    for (const c of charts) {
      const d = spec.databases.find((x) => x.key === c.db);
      expect(d, `chart ${String(c.data.title)}`).toBeTruthy();
      const names = d!.columns.map((x) => x.name);
      for (const field of ['x', 'y', 'color'] as const) {
        const col = c.data[field];
        if (col !== undefined) expect(names, `${String(c.data.title)}.${field}`).toContain(col);
      }
      const y = d!.columns.find((x) => x.name === c.data.y)!;
      expect(['number', 'currency', 'rating'], `${String(c.data.title)} y type`).toContain(y.type);
    }
  });

  it('seeds the new card types: metric placeholders, checklists, hypotheses, a decision, a scorecard matrix, risk categories and a timeline', () => {
    const types = new Set(spec.frames.flatMap((f) => f.seeds.map((s) => s.type)));
    for (const t of ['metric', 'checklist', 'hypothesis', 'decision', 'matrix', 'risk', 'timeline', 'database', 'chart', 'question', 'framework'])
      expect(types.has(t as never), t).toBe(true);
    const metrics = spec.frames.flatMap((f) => f.seeds.filter((s) => s.type === 'metric'));
    expect(metrics.length).toBeGreaterThanOrEqual(8);
    for (const m of metrics) expect(m.data.value).toBe('—'); // a placeholder until it is filled
    const decision = spec.frames.flatMap((f) => f.seeds).find((s) => s.type === 'decision')!;
    expect((decision.data.options as unknown[]).length).toBeGreaterThanOrEqual(4);
    expect(decision.data.status).toBe('open');
  });

  it('has seed cards that are valid card data once their tokens are filled', () => {
    const answers = Object.fromEntries(spec.inputs.map((f) => [f.id, f.kind === 'url' ? 'https://acme.example' : 'Acme Robotics']));
    for (const f of spec.frames)
      for (const s of f.seeds) {
        if (s.type === 'database' || s.type === 'chart') continue;
        const data = JSON.parse(fillTokens(JSON.stringify(s.data), { ...answers, year: '2026', date: '2026-10-15' }));
        const parsed = cardDataSchema(s.type).safeParse(data);
        expect(parsed.success, `${f.id}/${s.type}: ${JSON.stringify(parsed.error?.issues[0])}`).toBe(true);
      }
  });

  it('can place every frame target: a seed of that type or a card type an owner may place', () => {
    for (const f of spec.frames)
      for (const t of f.targets) {
        const seeded = f.seeds.some((s) => s.type === t.type);
        const placeable = f.owners.some((o) => PLACEABLE_TYPES[o].includes(t.type));
        expect(seeded || placeable, `${f.id}: ${t.type} (owners ${f.owners.join(', ')})`).toBe(true);
      }
  });

  it("references only tools in the role's allow-list, and Critic never changes a database", () => {
    expect(planToolViolations(spec)).toEqual([]);
    for (const role of ROLES)
      for (const step of spec.plan[role]) for (const tool of step.tools) expect(AGENT_TOOLS[role]).toContain(tool);
    expect(spec.plan.critic.flatMap((s) => s.tools)).not.toContain('upsert_rows');
  });

  it('gives every non-Orb frame owner a playbook step for that frame, and every step only real frames', () => {
    const ids = new Set(spec.frames.map((f) => f.id));
    for (const role of ROLES) for (const s of spec.plan[role]) for (const f of s.frames) expect(ids.has(f), `${role}/${s.id}: ${f}`).toBe(true);
    for (const f of spec.frames)
      for (const owner of f.owners.filter((o) => o !== 'orb'))
        expect(spec.plan[owner].some((s) => s.frames.includes(f.id)), `${owner} has no step for ${f.id}`).toBe(true);
    for (const role of ROLES) expect(new Set(spec.plan[role].map((s) => s.id)).size).toBe(spec.plan[role].length);
  });

  it('uses Parallel where it fits: find_entities and batch_enrich for lists, deep_research for gaps (asking above $0.50), a monitor on request', () => {
    const scout = spec.plan.scout.flatMap((s) => s.tools);
    for (const t of ['find_entities', 'batch_enrich', 'deep_research', 'fetch_signed_in', 'upsert_rows']) expect(scout, t).toContain(t);
    expect(spec.plan.scout.find((s) => s.id === 'deep')).toMatchObject({ askAboveUsd: 0.5, minTier: 'standard' });
    const orb = spec.plan.orb.flatMap((s) => s.tools);
    for (const t of ['watch_topic', 'deep_research', 'compose_section', 'update_card', 'delegate']) expect(orb, t).toContain(t);
    expect(spec.monitor?.query).toBeTruthy();
    // The enrichment step names the database it consolidates into: find_entities fills a database card of its own.
    const enrich = spec.plan.scout.find((s) => s.tools.includes('batch_enrich'))!;
    expect(enrich.text).toMatch(/upsert_rows/);
  });

  it('has a Builder playbook with charts bound to the databases and a design-frame summary on Standard and above', () => {
    const builder = spec.plan.builder;
    expect(builder.flatMap((s) => s.tools)).toEqual(expect.arrayContaining(['place_card', 'query_dataset', 'write_design_frame']));
    expect(builder.find((s) => s.tools.includes('write_design_frame'))!.minTier).toBe('standard');
  });

  it('has a Critic that clears or raises every red flag, each with a check and a checklist seed that lists them all', () => {
    expect(spec.redFlags.length).toBeGreaterThanOrEqual(10);
    spec.redFlags.forEach((f, i) => {
      expect(f.id).toBe(`RF${String(i + 1).padStart(2, '0')}`);
      expect(f.check.length).toBeGreaterThan(30);
    });
    const checklist = spec.frames
      .flatMap((f) => f.seeds)
      .find((s) => s.type === 'checklist' && Array.isArray(s.data.items) && (s.data.items as unknown[]).length === spec.redFlags.length)!;
    expect(checklist).toBeTruthy();
    const items = (checklist.data.items as { text: string }[]).map((i) => i.text);
    for (const f of spec.redFlags) expect(items.some((t) => t.startsWith(f.id))).toBe(true);
    expect(spec.plan.critic.map((s) => s.text).join(' ')).toMatch(/cleared|clear/);
    const critic = playbookText({ spec, role: 'critic', depth: 'standard', answers: { [spec.inputs[0]!.id]: 'Acme' }, boardFrames: [] });
    for (const f of spec.redFlags) expect(critic).toContain(f.id);
  });

  it('has a rubric whose weights add up to 100, anchored at 1, 3 and 5, over real frames, and a scorecard seed with one column per dimension', () => {
    expect(spec.rubric.length).toBeGreaterThanOrEqual(5);
    expect(spec.rubric.reduce((a, d) => a + d.weight, 0)).toBe(100);
    const ids = new Set(spec.frames.map((f) => f.id));
    for (const d of spec.rubric) {
      expect(Object.keys(d.anchors)).toEqual(['1', '3', '5']);
      expect(ids.has(d.frame)).toBe(true);
    }
    const matrix = spec.frames.flatMap((f) => f.seeds).find((s) => s.type === 'matrix' && String(s.data.title).includes('rubric score'))!;
    expect(matrix).toBeTruthy();
    expect((matrix.data.criteria as { weight: number }[]).map((c) => c.weight)).toEqual(spec.rubric.map((d) => d.weight));
  });

  it('has a memo that covers every frame, cites cards, ends with sources, has a one-pager and names an existing deck', () => {
    const ids = new Set(spec.frames.map((f) => f.id));
    const covered = new Set(spec.output.sections.flatMap((s) => s.frames));
    for (const f of spec.output.sections.flatMap((s) => s.frames)) expect(ids.has(f)).toBe(true);
    for (const f of spec.frames) expect(covered.has(f.id), `frame ${f.id} is in no memo section`).toBe(true);
    expect(spec.output.sections.length).toBeGreaterThanOrEqual(11);
    expect(spec.output.sections[0]!.words).toBe(150);
    expect(spec.output.citationRule).toMatch(/cites? cards/);
    expect(spec.output.appendix).toBe('All sources');
    expect(spec.output.onePager.includes.length).toBeGreaterThanOrEqual(4);
    // The deck: a format of its own with a title slide and the closing next-steps slide, chosen by the template id.
    const deck = deckFormatById(spec.output.deckFormat)!;
    expect(deck, spec.output.deckFormat).toBeTruthy();
    expect(deckFormatFor(id).id).toBe(spec.output.deckFormat);
    expect(DECK_FORMATS).toContain(deck);
    expect(deck.slides[0]!.layout).toBe('title');
    expect(deck.slides.length).toBeGreaterThanOrEqual(9);
    expect(deck.slides.some((s) => s.layout === 'visual')).toBe(true);
    expect(new Set(deck.slides.map((s) => s.id)).size).toBe(deck.slides.length);
  });

  it('has Quick, Standard and Deep tiers as a cost guard', () => {
    expect(DEPTHS.map((d) => spec.tiers[d].label)).toEqual(['Quick scan', 'Standard', 'Deep']);
    for (const tool of ['deep_research', 'batch_enrich', 'find_entities', 'find_entities_extend'])
      expect(tierGate(spec, 'quick', tool), tool).toMatch(/Quick scan depth tier/);
    expect(tierGate(spec, 'quick', 'parallel_extract')).toBeUndefined();
    expect(tierGate(spec, 'standard', 'find_entities')).toBeUndefined();
    expect(tierGate(spec, 'standard', 'batch_enrich')).toBeUndefined();
    expect(tierGate(spec, 'standard', 'deep_research', { processor: 'core' })).toBeUndefined();
    expect(tierGate(spec, 'standard', 'deep_research', { processor: 'pro' })).toMatch(/not pro/);
    expect(tierGate(spec, 'deep', 'deep_research', { processor: 'ultra' })).toBeUndefined();
    expect(tierGate(spec, 'deep', 'find_entities_extend')).toBeUndefined();
    expect(spec.tiers.standard.parallelTools).toContain('watch_topic');
    expect(spec.tiers.quick.parallelTools).not.toContain('watch_topic');
    for (const d of DEPTHS) expect(spec.tiers[d].askAboveUsd).toBe(0.5);
    // Quick drops the deep steps from the plan; Deep keeps the monitor.
    expect(stepsFor(spec, 'scout', 'quick').map((s) => s.id)).not.toContain('deep');
    expect(stepsFor(spec, 'orb', 'quick').map((s) => s.id)).not.toContain('monitor');
    expect(stepsFor(spec, 'orb', 'deep').map((s) => s.id)).toContain('monitor');
  });

  it('has follow-up chips: at least five, with the subject filled in and [brackets] left for the user', () => {
    expect(spec.followUps.length).toBeGreaterThanOrEqual(5);
    const subject = spec.inputs[0]!.id;
    const chips = followUpChips(spec, { [subject]: 'Acme Robotics' });
    expect(chips.some((c) => c.prompt.includes('Acme Robotics'))).toBe(true);
    expect(chips.some((c) => /\[[a-z ]+\]/.test(c.prompt))).toBe(true);
    for (const c of chips) expect(c.prompt).not.toContain('{{' + subject);
  });

  it("injects the playbook into the right roles with the intake, the tier and the frames", () => {
    const subject = spec.inputs[0]!.id;
    const answers = { [subject]: 'Acme Robotics', sites: [spec.signedIn[0]!.domain] };
    const boardFrames = spec.frames.map((f, i) => ({ id: `f_${i}`, title: f.title, number: i + 1 }));
    const orb = playbookText({ spec, role: 'orb', depth: 'standard', answers, boardFrames });
    expect(orb).toContain(`The ${spec.label} playbook`);
    expect(orb).toContain('Acme Robotics');
    expect(orb).toContain(spec.output.sections[0]!.title);
    expect(orb).toContain(`The deck format is ${spec.output.deckFormat}`);
    for (const d of spec.rubric) expect(orb).toContain(`${d.name} (${d.weight}%)`);
    const scout = playbookText({ spec, role: 'scout', depth: 'quick', answers, boardFrames });
    expect(scout).toMatch(/refused/);
    expect(scout).toContain(spec.signedIn[0]!.domain);
    const steps = stepsFor(spec, 'scout', 'quick');
    const at = steps.map((s) => scout.indexOf(fillTokens(s.text, answers).slice(0, 40)));
    expect(at.every((n) => n >= 0)).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('has a human-readable spec of the same name', () => {
    expect(templateOf(id).label).toBe(spec.label);
  });
});

describe('the v1 Stocks template is merged into Public equity', () => {
  it('has no chip of its own, resolves to public-equity for a new canvas and still opens for an old one', () => {
    expect(TEMPLATES.some((t) => t.id === 'stocks')).toBe(false);
    expect(resolveTemplateId('stocks')).toBe('public-equity');
    expect(resolveTemplateId('company')).toBe('company');
    expect(templateOf('stocks').brief).toMatch(/no live market data/i); // an existing canvas still shows its label and brief
  });

  it('keeps the v1 guidance: public equity says there is no live market data and dates every figure', () => {
    const spec = specOf('public-equity') as Spec;
    expect(spec.brief).toMatch(/no live market data/i);
    expect(JSON.stringify(spec.frames[0])).toMatch(/as of/);
    for (const f of ['Thesis', 'Financials', 'Valuation', 'Catalysts', 'Risks'])
      expect(spec.frames.some((x) => x.title.toLowerCase().includes(f.toLowerCase()) || x.brief.toLowerCase().includes(f.toLowerCase()))).toBe(true);
  });
});

describe('what makes each template different', () => {
  it('public equity: scenarios, financials, peers and the equity-ic deck', () => {
    const s = specOf('public-equity')!;
    expect(s.databases.map((d) => d.name)).toEqual(expect.arrayContaining(['Financials', 'Peers', 'Valuation scenarios', 'Segments', 'Debt & liquidity', 'Catalysts', 'Analyst views', 'Management']));
    expect(s.rubric.map((d) => d.name)).toContain('Valuation');
    expect(s.frames.map((f) => f.title)).toEqual(expect.arrayContaining(['Snapshot', 'Financials', 'Valuation', 'Catalysts & calendar', 'Thesis & decision']));
    expect(s.signedIn.map((x) => x.domain)).toContain('seekingalpha.com');
  });
  it('market map: a Companies database discovered with FindAll, funding flows, investors and acquisitions', () => {
    const s = specOf('market-map')!;
    expect(s.databases.map((d) => d.name)).toEqual(expect.arrayContaining(['Companies', 'Segments', 'Funding rounds', 'Investors', 'Acquisitions', 'Pricing', 'Market sizing inputs']));
    const companies = s.databases.find((d) => d.name === 'Companies')!;
    expect(companies.columns.length).toBeGreaterThanOrEqual(14);
    expect(companies.columns.find((c) => c.name === 'Status')!.options).toEqual(expect.arrayContaining(['Acquired', 'Shut down']));
    expect(s.plan.scout.find((p) => p.id === 'discover')!.tools).toContain('find_entities');
  });
  it('portfolio monitoring: an ongoing template with a KPI tracker, a signal log, a status call and monitors', () => {
    const s = specOf('portfolio-monitor')!;
    expect(s.databases.map((d) => d.name)).toEqual(expect.arrayContaining(['KPI tracker', 'Signal log', 'Team changes', 'Customer signals', 'Competitor moves', 'Financing events', 'Action items']));
    const status = s.frames[0]!.seeds.find((x) => x.type === 'decision')!;
    expect((status.data.options as { label: string }[]).map((o) => o.label)).toEqual(['On track', 'Watch', 'Needs help', 'Write-down risk']);
    expect(s.plan.orb.find((p) => p.id === 'monitor')!.tools).toEqual(expect.arrayContaining(['watch_topic', 'list_watches', 'watch_events', 'stop_watch']));
    expect(s.followUps.map((f) => f.label)).toContain('Watch this company');
  });
  it('M&A screening: a target universe, precedent transactions, synergies and a ranked decision', () => {
    const s = specOf('ma-screen')!;
    expect(s.databases.map((d) => d.name)).toEqual(expect.arrayContaining(['Target universe', 'Target financials', 'Precedent transactions', 'Trading comps', 'Synergies', 'Stakeholders']));
    expect(s.rubric.map((d) => d.name)).toEqual(expect.arrayContaining(['Strategic fit', 'Synergy potential']));
    expect(s.plan.scout.map((p) => p.id)).toEqual(expect.arrayContaining(['discover', 'enrich', 'comps', 'feasibility']));
  });
  it('fund / LP diligence: reported against verified track record, terms against the market and references', () => {
    const s = specOf('fund-dd')!;
    expect(s.databases.map((d) => d.name)).toEqual(expect.arrayContaining(['Investment team', 'Fund performance', 'Portfolio companies', 'Exits', 'Terms', 'References', 'Peer funds']));
    const perf = s.databases.find((d) => d.name === 'Fund performance')!;
    expect(perf.columns.find((c) => c.name === 'Basis')!.options).toEqual(['Reported', 'Verified']);
    expect(s.redFlags.length).toBe(14);
    expect(s.rubric.map((d) => d.name)).toContain('Track record');
  });
});
