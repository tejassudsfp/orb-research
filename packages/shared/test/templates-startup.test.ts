/**
 * P6.13 startup / product templates: competitive analysis, customer discovery, product teardown (`ui`), pricing
 * research, GTM plan (`gtm`), feature PRD research, fundraising prep, company research (`company`). Each is held to the
 * depth bar of docs/phase6/vc-dd-template.md: this file instantiates every one of them structurally (every frame, seed,
 * database, view and playbook step is valid and consistent) and checks the parts that matter per template.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGENT_TOOLS,
  DEPTHS,
  PLACEABLE_TYPES,
  TEMPLATES,
  TemplateSpecV2,
  cardDataSchema,
  columnTypeOf,
  fillTokens,
  followUpChips,
  planToolViolations,
  playbookText,
  specOf,
  stepsFor,
  templateFrames,
  templateMarkdown,
  tierGate,
  validateIntake,
  type TemplateId,
} from '../src/index.js';

const STARTUP_IDS = [
  'competitive-analysis',
  'customer-discovery',
  'ui',
  'pricing-research',
  'gtm',
  'feature-prd',
  'fundraising-prep',
  'company',
] as const satisfies readonly TemplateId[];

const ROLES = ['orb', 'scout', 'critic', 'builder'] as const;
const specs = STARTUP_IDS.map((id) => specOf(id)!);

/** The intake of a form filled to the limit of every field (a long, odd answer must still make valid seed cards). */
function fullAnswers(spec: TemplateSpecV2): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const f of spec.inputs) {
    if (f.kind === 'materials') continue;
    if (f.kind === 'depth') out[f.id] = 'standard';
    else if (f.kind === 'sites') out[f.id] = (f.sites ?? []).map((s) => s.domain);
    else if (f.kind === 'list') out[f.id] = ['One', 'Two'];
    else if (f.kind === 'select') out[f.id] = f.options![0]!;
    else if (f.kind === 'url') out[f.id] = 'https://example.com';
    else out[f.id] = 'x'.repeat(Math.min(f.maxLength, 4000));
  }
  return out;
}

/** The canvas service drops empty-string properties (a blank `{{field}}`), deep: an empty url is no url. */
function dropEmpty<T>(value: T): T {
  if (Array.isArray(value)) return value.map(dropEmpty) as T;
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => !(typeof v === 'string' && v.trim() === ''))
        .map(([k, v]) => [k, dropEmpty(v)]),
    ) as T;
  return value;
}

describe('the startup / product group', () => {
  it('lists every template on Home, with the v1 ids kept for company, gtm and ui', () => {
    const ids = TEMPLATES.map((t) => t.id);
    for (const id of STARTUP_IDS) expect(ids).toContain(id);
    expect(TEMPLATES.find((t) => t.id === 'ui')!.label).toBe('Product teardown');
    expect(TEMPLATES.find((t) => t.id === 'gtm')!.label).toBe('GTM plan');
    expect(TEMPLATES.find((t) => t.id === 'company')!.label).toBe('Company research');
    // The upgraded ones are v2 specs now, not v1 frame lists.
    for (const id of ['ui', 'gtm', 'company'] as const) expect(TEMPLATES.find((t) => t.id === id)!.spec).toBeDefined();
  });

  it('has a human-readable spec file for each, equal to the generated one', () => {
    for (const spec of specs) {
      const file = join(import.meta.dirname, '..', '..', '..', 'docs', 'templates', `${spec.id}.md`);
      expect(readFileSync(file, 'utf8'), spec.id).toBe(templateMarkdown(spec));
    }
  });
});

describe.each(STARTUP_IDS)('%s', (id) => {
  const spec = specOf(id)!;

  it('is a valid v2 spec at the depth bar: numbered frames with briefs, owners and targets, an intake, tiers, follow-ups', () => {
    expect(TemplateSpecV2.safeParse(spec).success).toBe(true);
    expect(spec.frames.length).toBeGreaterThanOrEqual(10);
    expect(spec.frames.length).toBeLessThanOrEqual(12);
    for (const f of spec.frames) {
      expect(f.brief.length, `${f.id} brief`).toBeGreaterThan(120);
      expect(f.owners.length).toBeGreaterThan(0);
      expect(f.targets.length, `${f.id} targets`).toBeGreaterThan(0);
      expect(f.seeds.length, `${f.id} seeds`).toBeGreaterThan(0);
    }
    expect(new Set(spec.frames.map((f) => f.id)).size).toBe(spec.frames.length);
    expect(new Set(spec.frames.map((f) => f.title)).size).toBe(spec.frames.length);
    expect(spec.inputs.filter((f) => f.kind === 'depth')).toHaveLength(1);
    expect(spec.inputs.filter((f) => f.kind === 'materials')).toHaveLength(1);
    expect(spec.inputs.filter((f) => f.kind === 'sites')).toHaveLength(1);
    expect(spec.inputs.filter((f) => f.required).length).toBeGreaterThanOrEqual(2);
    expect(DEPTHS.map((d) => spec.tiers[d].label)).toEqual(['Quick scan', 'Standard', 'Deep']);
    expect(spec.followUps.length).toBeGreaterThanOrEqual(6);
    expect(spec.output.sections.length).toBeGreaterThanOrEqual(9);
    expect(spec.output.sections[0]!.words).toBe(150);
    expect(spec.output.deck!.slides.length).toBeGreaterThanOrEqual(10);
    expect(spec.output.onePager.includes.length).toBeGreaterThanOrEqual(3);
    expect(spec.signedIn.length).toBeGreaterThanOrEqual(2);
    expect(spec.monitor).toBeDefined();
  });

  it('has a database for the rows agents consolidate, each with a seed card in its frame, typed columns and views', () => {
    expect(spec.databases.length).toBeGreaterThanOrEqual(4);
    for (const d of spec.databases) {
      const frame = spec.frames.find((f) => f.id === d.frame);
      expect(frame, `${d.key} frame`).toBeDefined();
      expect(frame!.seeds.some((s) => s.type === 'database' && s.db === d.key), `${d.key} seed`).toBe(true);
      expect(d.views.length).toBeGreaterThan(0);
      const names = d.columns.map((c) => c.name);
      expect(new Set(names).size, `${d.key} columns`).toBe(names.length);
      if (d.keyColumn) expect(names, `${d.key} key`).toContain(d.keyColumn);
      for (const c of d.columns) {
        columnTypeOf(c.type);
        if (c.type === 'enum') expect(c.options?.length, `${d.key}.${c.name}`).toBeGreaterThan(1);
      }
      // A view only names columns the database has.
      for (const v of d.views) {
        if (v.group) expect(names, `${d.key}/${v.name} group`).toContain(v.group);
        for (const s of v.sort ?? []) expect(names, `${d.key}/${v.name} sort`).toContain(s.column);
        for (const f of v.filter ?? []) expect(names, `${d.key}/${v.name} filter`).toContain(f.column);
      }
    }
    // Every database seed names a database that exists.
    const keys = new Set(spec.databases.map((d) => d.key));
    for (const f of spec.frames)
      for (const s of f.seeds)
        if (s.type === 'database' || s.type === 'chart') expect(keys.has(s.db ?? ''), `${f.id}/${s.type}`).toBe(true);
  });

  it('binds each chart seed to columns of its database', () => {
    for (const f of spec.frames)
      for (const s of f.seeds) {
        if (s.type !== 'chart') continue;
        const d = spec.databases.find((x) => x.key === s.db)!;
        const names = d.columns.map((c) => c.name.toLowerCase());
        const data = s.data as { x: string; y?: string; color?: string };
        expect(names, `${f.id} chart x`).toContain(data.x.toLowerCase());
        if (data.y) expect(names, `${f.id} chart y`).toContain(data.y.toLowerCase());
        if (data.color) expect(names, `${f.id} chart color`).toContain(data.color.toLowerCase());
      }
  });

  it("references only tools in the role's allow-list, and every step names its tools and real frames", () => {
    expect(planToolViolations(spec)).toEqual([]);
    const frameIds = new Set(spec.frames.map((f) => f.id));
    for (const role of ROLES) {
      expect(spec.plan[role].length).toBeGreaterThanOrEqual(3);
      const stepIds = spec.plan[role].map((s) => s.id);
      expect(new Set(stepIds).size, `${role} step ids`).toBe(stepIds.length);
      for (const s of spec.plan[role]) {
        expect(s.tools.length, `${role}/${s.id}`).toBeGreaterThan(0);
        for (const t of s.tools) expect(AGENT_TOOLS[role], `${role}/${s.id}: ${t}`).toContain(t);
        for (const fr of s.frames) expect(frameIds.has(fr), `${role}/${s.id} frame ${fr}`).toBe(true);
      }
    }
  });

  it('has a playbook step for every frame an agent owns, and the owners can place its target cards', () => {
    for (const f of spec.frames) {
      for (const owner of f.owners.filter((o) => o !== 'orb'))
        expect(
          spec.plan[owner].some((s) => s.frames.includes(f.id)),
          `${owner} has no step for ${f.id}`,
        ).toBe(true);
      for (const t of f.targets) {
        const seeded = f.seeds.some((s) => s.type === t.type);
        const placeable = f.owners.some((o) => PLACEABLE_TYPES[o].includes(t.type));
        expect(seeded || placeable, `${f.id}: ${t.type} (owners ${f.owners.join(', ')})`).toBe(true);
      }
    }
  });

  it('uses Parallel where it fits: find_entities and batch_enrich for lists, deep_research for gaps, a monitor on request', () => {
    const scout = spec.plan.scout.flatMap((s) => s.tools);
    expect(scout).toContain('find_entities');
    expect(scout).toContain('batch_enrich');
    expect(scout).toContain('deep_research');
    expect(scout).toContain('fetch_signed_in');
    expect(spec.plan.orb.flatMap((s) => s.tools)).toContain('watch_topic');
    const deep = spec.plan.scout.find((s) => s.tools.includes('deep_research'))!;
    expect(deep.askAboveUsd).toBe(0.5);
    expect(deep.minTier).toBe('standard');
    // Costly Parallel steps never run on a tier that refuses them.
    for (const role of ['scout', 'orb'] as const)
      for (const s of spec.plan[role])
        if (s.tools.includes('deep_research')) expect(s.minTier).not.toBe('quick');
  });

  it('never has Critic place a card type it may not, or tick a checklist, or write a database', () => {
    const critic = spec.plan.critic.map((s) => s.text).join(' ');
    expect(critic).not.toMatch(/\bdoc card\b/);
    expect(critic).toMatch(/cannot tick|can't tick|you cannot|You cannot/);
    expect(spec.plan.critic.flatMap((s) => s.tools)).not.toContain('upsert_rows');
    // Only Orb, Scout and Builder write rows; steps say which rows they wrote (an agent edits only its own).
    for (const role of ['orb', 'scout', 'builder'] as const)
      for (const s of spec.plan[role]) if (s.tools.includes('upsert_rows')) expect(AGENT_TOOLS[role]).toContain('upsert_rows');
  });

  it('has a red-flag checklist the Critic clears or raises, mirrored by a checklist seed, and a rubric that adds up to 100', () => {
    expect(spec.redFlags.length).toBeGreaterThanOrEqual(10);
    expect(spec.redFlags.map((f) => f.id)).toEqual(
      spec.redFlags.map((_, i) => `RF${String(i + 1).padStart(2, '0')}`),
    );
    const list = spec.frames
      .flatMap((f) => f.seeds)
      .find((s) => s.type === 'checklist' && /checklist/i.test(String((s.data as { title: string }).title)))!;
    const items = (list.data as { items: { text: string }[] }).items;
    expect(items).toHaveLength(spec.redFlags.length);
    spec.redFlags.forEach((f, i) => expect(items[i]!.text).toBe(`${f.id} ${f.text}`));
    expect(spec.rubric.reduce((a, d) => a + d.weight, 0)).toBe(100);
    const ids = new Set(spec.frames.map((f) => f.id));
    for (const d of spec.rubric) {
      expect(ids.has(d.frame)).toBe(true);
      expect(Object.keys(d.anchors)).toEqual(['1', '3', '5']);
    }
    // The rubric's scorecard seed carries the same dimensions and weights.
    const matrix = spec.frames
      .flatMap((f) => f.seeds)
      .find((s) => s.type === 'matrix' && /rubric score/.test(String((s.data as { title: string }).title)))!;
    expect((matrix.data as { criteria: { weight: number }[] }).criteria.map((c) => c.weight)).toEqual(
      spec.rubric.map((d) => d.weight),
    );
    // There is a decision seed that stays open for the user.
    const decision = spec.frames.flatMap((f) => f.seeds).find((s) => s.type === 'decision')!;
    expect(decision.data).toMatchObject({ status: 'open' });
  });

  it('has a memo that draws on real frames, covers the frames, and a deck outline', () => {
    const ids = new Set(spec.frames.map((f) => f.id));
    const covered = new Set<string>();
    for (const s of spec.output.sections)
      for (const f of s.frames) {
        expect(ids.has(f), `${s.id} → ${f}`).toBe(true);
        covered.add(f);
      }
    // The memo says something about most frames (the intake-only frame may be folded into another).
    expect(covered.size).toBeGreaterThanOrEqual(spec.frames.length - 2);
    expect(spec.output.deckFormat).toBe('standard');
    for (const s of spec.output.deck!.slides) expect(s.brief.length).toBeGreaterThan(10);
  });

  it('only uses {{tokens}} the intake form can answer (or the date tokens)', () => {
    const known = new Set([...spec.inputs.map((f) => f.id), 'year', 'date']);
    const text = JSON.stringify(spec);
    for (const m of text.matchAll(/\{\{([a-z][a-z0-9_]*)(?:\|[^}]*)?\}\}/g))
      expect(known.has(m[1]!), `${id}: {{${m[1]}}}`).toBe(true);
    // The title is made of required fields only, so it is never blank.
    const required = new Set(spec.inputs.filter((f) => f.required).map((f) => f.id));
    for (const m of spec.titleFrom.matchAll(/\{\{([a-z][a-z0-9_]*)/g)) expect(required.has(m[1]!)).toBe(true);
  });

  it('makes valid card data for every seed, from a minimal intake and from a full one', () => {
    const minimal = { [spec.inputs[0]!.id]: 'Acme', year: '2026', date: '2026-10-15' };
    const full = { ...fullAnswers(spec), year: '2026', date: '2026-10-15' };
    for (const answers of [minimal, full])
      for (const f of spec.frames)
        for (const s of f.seeds) {
          if (s.type === 'database' || s.type === 'chart') continue; // built from their dataset by the canvas service
          const data = dropEmpty(JSON.parse(fillTokens(JSON.stringify(s.data), answers)));
          const parsed = cardDataSchema(s.type).safeParse(data);
          expect(
            parsed.success,
            `${f.id}/${s.type}/${String(data.title ?? '')}: ${JSON.stringify(parsed.error?.issues[0])}`,
          ).toBe(true);
        }
  });

  it('validates its intake: the required fields, a normalised URL, a depth', () => {
    const missing = validateIntake(spec.inputs, { depth: 'standard' });
    expect(missing.ok).toBe(false);
    expect(Object.keys(missing.errors).sort()).toEqual(
      spec.inputs
        .filter((f) => f.required && f.kind !== 'depth')
        .map((f) => f.id)
        .sort(),
    );
    const ok = validateIntake(spec.inputs, { ...fullAnswers(spec), depth: 'deep' });
    expect(ok.errors).toEqual({});
    expect(ok.ok).toBe(true);
    expect(ok.depth).toBe('deep');
    const urlField = spec.inputs.find((f) => f.kind === 'url');
    if (urlField)
      expect(validateIntake(spec.inputs, { ...fullAnswers(spec), [urlField.id]: 'example.com' }).answers[urlField.id]).toBe(
        'https://example.com',
      );
  });

  it('injects a playbook per role: the intake, the tier, its frames and steps in order; Critic the checklist, Orb the rubric, memo and deck', () => {
    const answers = { ...fullAnswers(spec), sites: [spec.signedIn[0]!.domain] };
    const boardFrames = spec.frames.map((f, i) => ({ id: `f_${i}`, title: f.title, number: i + 1 }));
    for (const role of ROLES) {
      const text = playbookText({ spec, role, depth: 'standard', answers, boardFrames });
      expect(text).toContain(`The ${spec.label} playbook`);
      expect(text).toContain('Depth: Standard');
      const steps = stepsFor(spec, role, 'standard');
      let at = text.indexOf(role === 'orb' ? 'Your playbook, in order:' : 'Your playbook, in this order:');
      expect(at).toBeGreaterThan(0);
      // Each numbered step is in the text, in order.
      for (const [i] of steps.entries()) {
        const next = text.indexOf(`\n${i + 1}. `, at);
        expect(next, `${role} step ${i + 1}`).toBeGreaterThan(at);
        at = next;
      }
      for (const f of spec.frames.filter((x) => role === 'orb' || x.owners.includes(role)))
        expect(text).toContain(`"${f.title}" [f_${spec.frames.indexOf(f)}]`);
    }
    const critic = playbookText({ spec, role: 'critic', depth: 'standard', answers, boardFrames });
    for (const f of spec.redFlags) expect(critic).toContain(f.id);
    const orb = playbookText({ spec, role: 'orb', depth: 'standard', answers, boardFrames });
    for (const d of spec.rubric) expect(orb).toContain(`${d.name} (${d.weight}%)`);
    spec.output.sections.forEach((s, i) => expect(orb).toContain(`${i + 1}. ${s.title}`));
    expect(orb).toContain('The deck (');
    expect(orb).toContain(`The deck format is ${spec.output.deckFormat}`);
    expect(playbookText({ spec, role: 'scout', depth: 'standard', answers, boardFrames })).toContain(
      spec.signedIn[0]!.domain,
    );
  });

  it('applies the cost guard: Quick refuses the costly Parallel tools, Standard caps the processors, Deep allows all', () => {
    for (const tool of ['deep_research', 'batch_enrich', 'find_entities', 'find_entities_extend'])
      expect(tierGate(spec, 'quick', tool), tool).toMatch(/Quick scan depth tier/);
    expect(tierGate(spec, 'quick', 'parallel_extract')).toBeUndefined();
    expect(tierGate(spec, 'standard', 'batch_enrich')).toBeUndefined();
    expect(tierGate(spec, 'standard', 'find_entities')).toBeUndefined();
    expect(tierGate(spec, 'standard', 'deep_research', { processor: 'core' })).toBeUndefined();
    expect(tierGate(spec, 'standard', 'deep_research', { processor: 'ultra' })).toMatch(/lite, base, core/);
    expect(tierGate(spec, 'deep', 'deep_research', { processor: 'ultra' })).toBeUndefined();
    expect(tierGate(spec, 'deep', 'find_entities_extend')).toBeUndefined();
    // Every tier asks before spend over $0.50.
    for (const d of DEPTHS) expect(spec.tiers[d].askAboveUsd).toBe(0.5);
    // Quick drops the steps that need Parallel spend.
    expect(stepsFor(spec, 'scout', 'quick').some((s) => s.tools.includes('deep_research'))).toBe(false);
    expect(stepsFor(spec, 'scout', 'standard').some((s) => s.tools.includes('deep_research'))).toBe(true);
  });

  it('has follow-up chips that fill from the intake and keep [brackets] for the user', () => {
    const answers = fullAnswers(spec);
    const chips = followUpChips(spec, answers);
    expect(chips).toHaveLength(spec.followUps.length);
    for (const c of chips) expect(c.prompt).not.toMatch(/\{\{/);
    expect(chips.some((c) => /\[[^\]]+\]/.test(c.prompt))).toBe(true);
  });

  it("keeps free room in the first frame for the materials dropped on the intake (they land there)", () => {
    expect(spec.frames[0]!.room).toBeGreaterThanOrEqual(240);
    expect(spec.inputs.some((f) => f.kind === 'materials')).toBe(true);
  });

  it('lays its frames out three to a row in the spec order', () => {
    const frames = templateFrames(id);
    expect(frames.map((f) => f.title)).toEqual(spec.frames.map((f) => f.title));
    expect(new Set(frames.map((f) => f.y)).size).toBe(Math.ceil(spec.frames.length / 3));
  });
});

describe('per-template specifics', () => {
  it('competitive analysis: a competitor database, feature coverage, pricing, battlecards and a positioning 2x2', () => {
    const s = specOf('competitive-analysis')!;
    expect(s.databases.map((d) => d.name)).toEqual(['Competitors', 'Feature coverage', 'Pricing', 'Review themes']);
    expect(s.frames.map((f) => f.title)).toContain('Battlecards');
    expect(s.frames.flatMap((f) => f.seeds).some((x) => x.type === 'framework' && (x.data as any).variant === 'quadrant')).toBe(true);
    expect(s.output.deck!.title).toContain('{{product}}');
  });

  it('customer discovery: transcripts are logged by Orb and read by Scout, quotes are verbatim, the sample is checked for bias', () => {
    const s = specOf('customer-discovery')!;
    expect(s.databases.map((d) => d.name)).toEqual(['Interviews', 'Evidence log', 'Themes', 'Recruiting list']);
    expect(s.plan.orb[0]!.text).toMatch(/one Interviews row per transcript/);
    expect(s.plan.scout[0]!.text).toMatch(/Read every transcript/);
    expect(s.plan.scout[1]!.text).toMatch(/verbatim/);
    expect(s.redFlags.map((f) => f.text).join(' ')).toMatch(/Leading questions/);
    expect(s.frames[0]!.room).toBeGreaterThanOrEqual(300); // materials dropped on the intake land in the first frame's free room
    expect(s.inputs.find((f) => f.kind === 'materials')!.help).toMatch(/transcripts/);
  });

  it('product teardown (ui): screens come from capture_page, findings are heuristic rows, mockups copy ideas not assets', () => {
    const s = specOf('ui')!;
    expect(s.databases.map((d) => d.name)).toEqual(['Screen inventory', 'Flow steps', 'UI patterns', 'Findings']);
    expect(s.plan.scout.flatMap((x) => x.tools)).toContain('capture_page');
    expect(s.plan.builder.flatMap((x) => x.tools)).toContain('write_design_frame');
    expect(JSON.stringify(s.plan.builder)).toMatch(/never copied assets/);
  });

  it('pricing research: price points are dated, willingness to pay separates stated from revealed, economics mark assumptions', () => {
    const s = specOf('pricing-research')!;
    expect(s.databases.map((d) => d.name)).toEqual([
      'Price points',
      'WTP evidence',
      'Unit economics',
      'Tier design',
      'Revenue scenarios',
    ]);
    expect(s.databases[0]!.columns.map((c) => c.name)).toContain('Captured on');
    expect(JSON.stringify(s.plan.scout)).toMatch(/stated intent is never above 3/);
    expect(s.databases[2]!.columns.find((c) => c.name === 'Basis')!.options).toEqual(['Assumed', 'Measured', 'Benchmark']);
  });

  it('GTM plan: target accounts and partners by find_entities, channels mark measured vs assumed, a dated launch plan', () => {
    const s = specOf('gtm')!;
    expect(s.databases.map((d) => d.name)).toEqual([
      'ICP & segments',
      'Target accounts',
      'Competitors',
      'Channels',
      'Funnel model',
      'Partners',
      'Launch tasks',
    ]);
    expect(s.databases.find((d) => d.key === 'channels')!.columns.find((c) => c.name === 'Basis')!.options).toContain('Measured');
    expect(s.plan.scout.find((x) => x.id === 'accounts')!.tools).toContain('find_entities');
    expect(s.plan.scout.find((x) => x.id === 'partners')!.tools).toContain('find_entities');
    expect(s.frames.map((f) => f.title)).toEqual(expect.arrayContaining(['Channels', 'Launch plan']));
  });

  it('feature PRD: requirements carry acceptance criteria and an out-of-scope list, options carry a RICE score, evidence counts people', () => {
    const s = specOf('feature-prd')!;
    const req = s.databases.find((d) => d.key === 'requirements')!;
    expect(req.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Acceptance criteria', 'Priority', 'Evidence']),
    );
    expect(req.columns.find((c) => c.name === 'Type')!.options).toContain('Out of scope');
    expect(s.databases.find((d) => d.key === 'options')!.columns.map((c) => c.name)).toContain('RICE score');
    expect(s.redFlags.map((f) => f.text).join(' ')).toMatch(/fewer than five users/);
  });

  it('fundraising prep: the founder-side mirror of VC diligence, with comparable rounds and investor targets from FindAll', () => {
    const s = specOf('fundraising-prep')!;
    expect(s.databases.map((d) => d.name)).toEqual([
      'KPIs',
      'Competitors',
      'Comparable rounds',
      'Use of funds',
      'Runway scenarios',
      'Dilution scenarios',
      'Investor targets',
    ]);
    expect(s.plan.scout.find((x) => x.id === 'comps')!.tools).toContain('find_entities');
    expect(s.plan.scout.find((x) => x.id === 'investors')!.text).toMatch(/no private contact details/);
    expect(s.output.deck!.slides.map((x) => x.title)).toContain('The ask');
    expect(s.output.memoTitle).toContain('{{company}}');
    // The VC red flags it prepares for are covered: unreconciled numbers, claimed-only traction, top-down market.
    expect(s.redFlags.map((f) => f.text).join(' ')).toMatch(/deck does not match the model/);
  });

  it('company research: filings first, a financial facts database with basis, people flagged, news timeline', () => {
    const s = specOf('company')!;
    expect(s.databases.map((d) => d.name)).toEqual([
      'Products',
      'People',
      'Competitors',
      'Customers',
      'Financial facts',
    ]);
    expect(s.databases.find((d) => d.key === 'financials')!.columns.find((c) => c.name === 'Basis')!.options).toEqual([
      'Reported',
      'Estimated',
      'Claimed',
    ]);
    expect(s.output.memoTitle).toBe('Company profile: {{company}}');
  });
});
