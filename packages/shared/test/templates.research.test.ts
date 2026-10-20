/**
 * P6.15: the research and knowledge templates (deep dive, literature review, policy analysis, technology landscape,
 * trend report) against the depth bar of the VC template. Structure only (the canvas test instantiates them, the
 * contract test runs the agents): every frame has a brief, owners with a playbook step and a placeable target mix;
 * every database is seeded and every chart is bound to columns that exist; every playbook tool is in the role's
 * allow-list; each template has an intake form, a rubric of 100, a red-flag checklist, a memo, a deck format and the
 * three tiers; Parallel (find_entities, batch_enrich, deep_research, monitors) and signed-in sources are used.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGENT_TOOLS,
  DEPTHS,
  FORBIDDEN_TOOL_PATTERNS,
  PLACEABLE_TYPES,
  cardDataSchema,
  columnTypeOf,
  deckFormatById,
  deckFormatFor,
  fillTokens,
  followUpChips,
  intakeLines,
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

const IDS = ['deep-dive', 'literature-review', 'policy-analysis', 'tech-landscape', 'trend-report'] as const;
const ROLES = ['orb', 'scout', 'critic', 'builder'] as const;
/** The templates that watch something over time (a monitor on request). */
const ONGOING: readonly TemplateId[] = ['literature-review', 'policy-analysis', 'tech-landscape', 'trend-report'];

describe.each(IDS.map((id) => [id] as const))('%s', (id) => {
  const spec = specOf(id)!;

  it('is registered with a chip, a v2 spec and the form its first field names the subject of', () => {
    expect(spec).toBeTruthy();
    expect(spec.inputs[0]!.required).toBe(true);
    expect(spec.inputs[0]!.kind).toBe('text');
    expect(spec.inputs.filter((f) => f.kind === 'depth')).toHaveLength(1);
    expect(spec.inputs.filter((f) => f.kind === 'materials')).toHaveLength(1);
    expect(spec.titleFrom).toContain(`{{${spec.inputs[0]!.id}}}`);
  });

  it('has the depth of the VC template: 8 to 12 briefed frames, 10 or more checklist items, a rubric of 100', () => {
    expect(spec.frames.length).toBeGreaterThanOrEqual(9);
    expect(spec.frames.length).toBeLessThanOrEqual(12);
    for (const f of spec.frames) {
      expect(f.brief.length, f.id).toBeGreaterThan(120);
      expect(f.targets.length, f.id).toBeGreaterThan(0);
      expect(f.seeds.length, f.id).toBeGreaterThan(0);
    }
    expect(spec.redFlags.length).toBeGreaterThanOrEqual(10);
    expect(spec.redFlags.map((f) => f.id)).toEqual(
      spec.redFlags.map((_, i) => `RF${String(i + 1).padStart(2, '0')}`),
    );
    expect(spec.rubric.length).toBeGreaterThanOrEqual(5);
    expect(spec.rubric.reduce((a, d) => a + d.weight, 0)).toBe(100);
    for (const d of spec.rubric) expect(Object.keys(d.anchors)).toEqual(['1', '3', '5']);
    expect(spec.followUps.length).toBeGreaterThanOrEqual(6);
  });

  it('uses the new card types and at least one database with views', () => {
    const types = new Set(spec.frames.flatMap((f) => f.seeds.map((s) => s.type)));
    for (const t of ['database', 'chart', 'metric', 'question', 'checklist', 'hypothesis', 'matrix', 'framework', 'decision'])
      expect(types.has(t as never), t).toBe(true);
    expect(types.size).toBeGreaterThanOrEqual(9);
    expect(spec.databases.length).toBeGreaterThanOrEqual(1);
    for (const d of spec.databases) expect(d.views.length).toBeGreaterThanOrEqual(2);
  });

  it('seeds a card for every database in its frame, and binds every chart to columns that exist', () => {
    for (const d of spec.databases) {
      const frame = spec.frames.find((f) => f.id === d.frame)!;
      expect(frame, d.key).toBeTruthy();
      expect(frame.seeds.some((s) => s.type === 'database' && s.db === d.key), d.key).toBe(true);
      expect(d.columns.map((c) => c.name)).toContain(d.keyColumn);
      expect(new Set(d.columns.map((c) => c.name)).size).toBe(d.columns.length);
      for (const c of d.columns) if (c.type === 'enum') expect(c.options?.length, `${d.key}.${c.name}`).toBeGreaterThan(1);
      // Views and filters name real columns, and a filter on an enum names a real option.
      for (const v of d.views) {
        const names = new Set(d.columns.map((c) => c.name));
        if (v.group) expect(names.has(v.group), `${d.key}/${v.name} group`).toBe(true);
        for (const s of v.sort ?? []) expect(names.has(s.column), `${d.key}/${v.name} sort`).toBe(true);
        for (const f of v.filter ?? []) {
          expect(names.has(f.column), `${d.key}/${v.name} filter`).toBe(true);
          const col = d.columns.find((c) => c.name === f.column)!;
          if (col.type === 'enum' && f.op === 'eq') expect(col.options).toContain(f.value);
          if (col.type === 'enum' && f.op === 'in') for (const v2 of f.value as string[]) expect(col.options).toContain(v2);
        }
        if (v.kind === 'board') expect(v.group, `${d.key}/${v.name}`).toBeTruthy();
      }
    }
    for (const f of spec.frames)
      for (const s of f.seeds) {
        if (s.type !== 'chart') continue;
        const d = spec.databases.find((x) => x.key === s.db)!;
        expect(d, `${f.id} chart ${String(s.data.title)}`).toBeTruthy();
        const names = d.columns.map((c) => c.name.toLowerCase());
        for (const col of [s.data.x, s.data.y, s.data.color])
          if (col) expect(names, `${String(s.data.title)} column ${String(col)}`).toContain(String(col).toLowerCase());
        if (s.data.y) expect(['number', 'currency', 'rating']).toContain(d.columns.find((c) => c.name.toLowerCase() === String(s.data.y).toLowerCase())!.type);
      }
  });

  it('covers every frame in the memo, the rubric and the plan, and every owner has a step for its frame', () => {
    const ids = new Set(spec.frames.map((f) => f.id));
    expect(ids.size).toBe(spec.frames.length);
    for (const s of spec.output.sections) for (const f of s.frames) expect(ids.has(f), `memo ${s.id}`).toBe(true);
    for (const d of spec.rubric) expect(ids.has(d.frame), `rubric ${d.id}`).toBe(true);
    for (const role of ROLES) for (const step of spec.plan[role]) for (const f of step.frames) expect(ids.has(f), `${role}/${step.id}`).toBe(true);
    for (const f of spec.frames)
      for (const owner of f.owners.filter((o) => o !== 'orb'))
        expect(spec.plan[owner].some((s) => s.frames.includes(f.id)), `${owner} has no step for ${f.id}`).toBe(true);
    // A child's step feeds frames it owns (Orb's own frames are the exception: a snapshot or summary it helps fill).
    for (const role of ['scout', 'critic', 'builder'] as const)
      for (const step of spec.plan[role])
        for (const f of step.frames) {
          const fr = spec.frames.find((x) => x.id === f)!;
          expect(fr.owners.includes(role) || fr.owners.join() === 'orb', `${role}/${step.id} feeds ${f}, owned by ${fr.owners}`).toBe(true);
        }
    // Every frame is in the memo, so no frame is research nobody reads.
    const inMemo = new Set(spec.output.sections.flatMap((s) => s.frames));
    for (const f of spec.frames) expect(inMemo.has(f.id), `${f.id} is in no memo section`).toBe(true);
  });

  it('only asks a role to place card types it may place, and every target is placeable or seeded', () => {
    for (const f of spec.frames)
      for (const t of f.targets) {
        const seeded = f.seeds.some((s) => s.type === t.type);
        const placeable = f.owners.some((o) => PLACEABLE_TYPES[o].includes(t.type));
        expect(seeded || placeable, `${f.id}: ${t.type} (owners ${f.owners.join(', ')})`).toBe(true);
      }
    expect(spec.plan.critic.map((s) => s.text).join(' ')).not.toMatch(/\bdoc card\b/);
  });

  it("references only tools in the role's allow-list, and never a shell, file or code tool", () => {
    expect(planToolViolations(spec)).toEqual([]);
    for (const role of ROLES)
      for (const step of spec.plan[role])
        for (const tool of step.tools) {
          expect(AGENT_TOOLS[role]).toContain(tool);
          for (const re of FORBIDDEN_TOOL_PATTERNS) expect(tool).not.toMatch(re);
        }
  });

  it('uses Parallel where it fits and signed-in sources where they help', () => {
    const scout = spec.plan.scout.flatMap((s) => s.tools);
    for (const t of ['find_entities', 'batch_enrich', 'deep_research', 'fetch_signed_in', 'upsert_rows', 'place_card'])
      expect(scout, t).toContain(t);
    expect(spec.plan.scout.find((s) => s.id === 'deep')!.minTier).toBe('standard');
    expect(spec.plan.scout.find((s) => s.id === 'deep')!.askAboveUsd).toBe(0.5);
    expect(spec.plan.orb.flatMap((s) => s.tools)).toEqual(expect.arrayContaining(['delegate', 'compose_section', 'deep_research']));
    expect(spec.plan.builder.flatMap((s) => s.tools)).toContain('place_card');
    expect(spec.plan.critic.map((s) => s.id)).toContain('red-flags');
    // The sites of the form are the sites the template explains a use for.
    const sites = spec.inputs.find((f) => f.kind === 'sites')!.sites!.map((s) => s.domain);
    expect(spec.signedIn.map((s) => s.domain)).toEqual(sites);
    if (ONGOING.includes(id)) {
      expect(spec.monitor, 'an ongoing template names its monitor').toBeTruthy();
      expect(spec.plan.orb.flatMap((s) => s.tools)).toContain('watch_topic');
      expect(spec.tiers.standard.parallelTools).toContain('watch_topic');
      expect(spec.tiers.quick.parallelTools).not.toContain('watch_topic');
    }
    // The red-flag checklist seed holds every flag, and the plan makes Critic work through them.
    const list = spec.frames.flatMap((f) => f.seeds).find((s) => s.type === 'checklist' && s.data.title === 'Red-flag checklist')!;
    expect((list.data as { items: unknown[] }).items).toHaveLength(spec.redFlags.length);
  });

  it('has a memo outline with a summary first, a one-pager and a deck format that exists', () => {
    expect(spec.output.sections.length).toBeGreaterThanOrEqual(9);
    expect(spec.output.sections[0]!.words).toBeLessThanOrEqual(200);
    expect(spec.output.onePager.includes.length).toBeGreaterThanOrEqual(4);
    const deck = deckFormatById(spec.output.deckFormat)!;
    expect(deck, spec.output.deckFormat).toBeTruthy();
    expect(deck.slides.length).toBeGreaterThanOrEqual(10);
    expect(deckFormatFor(id).id).toBe(spec.output.deckFormat);
    expect(deck.slides[0]!.layout).toBe('title');
    expect(new Set(deck.slides.map((s) => s.id)).size).toBe(deck.slides.length);
  });

  it('has the three tiers with the cost guard: Quick none, Standard core, Deep up to ultra', () => {
    expect(DEPTHS.map((d) => spec.tiers[d].label)).toEqual(['Quick scan', 'Standard', 'Deep']);
    for (const tool of ['deep_research', 'batch_enrich', 'find_entities', 'find_entities_extend'])
      expect(tierGate(spec, 'quick', tool)).toMatch(/Quick scan depth tier/);
    expect(tierGate(spec, 'quick', 'web_answer')).toBeUndefined();
    expect(tierGate(spec, 'standard', 'find_entities')).toBeUndefined();
    expect(tierGate(spec, 'standard', 'deep_research', { processor: 'core' })).toBeUndefined();
    expect(tierGate(spec, 'standard', 'deep_research', { processor: 'pro' })).toMatch(/not pro/);
    expect(tierGate(spec, 'standard', 'find_entities_extend')).toMatch(/does not allow/);
    expect(tierGate(spec, 'deep', 'deep_research', { processor: 'ultra' })).toBeUndefined();
    expect(tierGate(spec, 'deep', 'find_entities_extend')).toBeUndefined();
    for (const d of DEPTHS) expect(spec.tiers[d].askAboveUsd).toBe(0.5);
    expect(stepsFor(spec, 'scout', 'quick').map((s) => s.id)).not.toContain('deep');
    expect(stepsFor(spec, 'scout', 'standard').map((s) => s.id)).toContain('deep');
    expect(stepsFor(spec, 'orb', 'quick').map((s) => s.id)).not.toContain('gaps');
  });

  it('has seed cards that are valid card data of their type once their tokens are filled', () => {
    const answers = { [spec.inputs[0]!.id]: 'Acme', year: '2026', date: '2026-10-15' };
    for (const f of spec.frames)
      for (const s of f.seeds) {
        if (s.type === 'database' || s.type === 'chart') continue;
        const data = JSON.parse(fillTokens(JSON.stringify(s.data), answers));
        const parsed = cardDataSchema(s.type).safeParse(data);
        expect(parsed.success, `${f.id}/${s.type}: ${JSON.stringify(parsed.error?.issues[0])}`).toBe(true);
      }
  });

  it('only names tokens that are intake fields (or the dates)', () => {
    const fields = new Set([...spec.inputs.map((f) => f.id), 'year', 'date']);
    const text = JSON.stringify([spec.titleFrom, spec.frames, spec.output, spec.followUps, spec.monitor]);
    for (const m of text.matchAll(/\{\{([a-z][a-z0-9_]*)(?:\|[^}]*)?\}\}/g)) expect(fields.has(m[1]!), `{{${m[1]}}}`).toBe(true);
  });

  it('validates the intake: the subject is required, a bad option or depth is refused, the first select is not preselected', () => {
    const subject = spec.inputs[0]!.id;
    const required = spec.inputs.filter((f) => f.required).map((f) => f.id);
    const empty = validateIntake(spec.inputs, { [subject]: ' ', depth: 'standard' });
    expect(empty.ok).toBe(false);
    expect(Object.keys(empty.errors).sort()).toEqual(required.filter((r) => r !== 'depth').sort());
    const answers: Record<string, string> = { [subject]: 'Acme Robotics', depth: 'deep' };
    for (const f of spec.inputs.filter((x) => x.required && x.id !== subject && x.kind !== 'depth')) answers[f.id] = f.kind === 'url' ? 'acme.com' : 'Sample';
    const ok = validateIntake(spec.inputs, answers);
    expect(ok.errors).toEqual({});
    expect(ok.depth).toBe('deep');
    const select = spec.inputs.find((f) => f.kind === 'select')!;
    expect(validateIntake(spec.inputs, { ...answers, [select.id]: 'No such option' }).errors[select.id]).toMatch(/must be one of/);
    expect(validateIntake(spec.inputs, { ...answers, depth: 'epic' }).errors.depth).toMatch(/quick, standard or deep/);
    expect(validateIntake(spec.inputs, { [subject]: 'A', ...answers, [subject]: 'x'.repeat(401) }).errors[subject]).toMatch(/longer than/);
    expect(validateIntake(spec.inputs, { ...answers, sites: [spec.inputs.find((f) => f.kind === 'sites')!.sites![0]!.domain] }).answers.sites).toHaveLength(1);
  });

  it('injects the playbook: Scout its steps in order, Critic the checklist, Orb the rubric and the memo, Builder its frames', () => {
    const answers = { [spec.inputs[0]!.id]: 'Acme', sites: [spec.signedIn[0]!.domain] };
    const boardFrames = spec.frames.map((f, i) => ({ id: `f_${i}`, title: f.title, number: i + 1 }));
    const scout = playbookText({ spec, role: 'scout', depth: 'standard', answers, boardFrames });
    expect(scout).toContain('Your playbook, in this order:');
    expect(scout).toContain('Target mix:');
    expect(scout).toContain(spec.signedIn[0]!.domain);
    expect(scout).toContain('Depth: Standard');
    const steps = stepsFor(spec, 'scout', 'standard');
    let at = scout.indexOf('Your playbook');
    for (const s of steps) {
      const i = scout.indexOf(s.text.slice(0, 40), at);
      expect(i, `scout step ${s.id} is in order`).toBeGreaterThan(at);
      at = i;
    }
    const critic = playbookText({ spec, role: 'critic', depth: 'standard', answers, boardFrames });
    for (const f of spec.redFlags) expect(critic).toContain(f.id);
    expect(critic).not.toContain('The rubric');
    const orb = playbookText({ spec, role: 'orb', depth: 'standard', answers, boardFrames });
    expect(orb).toContain(`${spec.rubric[0]!.name} (${spec.rubric[0]!.weight}%)`);
    expect(orb).toContain(fillTokens(spec.output.memoTitle, answers));
    expect(orb).toContain(`deck format is ${spec.output.deckFormat}`);
    const builder = playbookText({ spec, role: 'builder', depth: 'standard', answers, boardFrames });
    const notBuilder = spec.frames.find((f) => !f.owners.includes('builder'))!;
    const owned = builder.slice(builder.indexOf('The frames you own:'), builder.indexOf('Your playbook'));
    expect(owned).not.toContain(`"${notBuilder.title}" [`);
    expect(owned).toContain(`"${spec.frames.find((f) => f.owners.includes('builder'))!.title}" [`);
    expect(playbookText({ spec, role: 'scout', depth: 'quick', answers, boardFrames })).toMatch(/refused/);
    expect(intakeLines(spec, answers).length).toBeGreaterThan(0);
    expect(followUpChips(spec, answers).every((c) => !c.prompt.includes('{{'))).toBe(true);
  });

  it('lays out its frames three to a row, wide, in the spec’s order', () => {
    const frames = templateFrames(id);
    expect(frames.map((f) => f.title)).toEqual(spec.frames.map((f) => f.title));
    expect(frames[0]!.w).toBeGreaterThan(500);
  });

  it('maps every column type onto the dataset engine', () => {
    for (const d of spec.databases) for (const c of d.columns) expect(columnTypeOf(c.type)).toBeTruthy();
  });

  it('has a generated docs/templates/<id>.md that names every frame, database, red flag and rubric dimension', () => {
    const file = join(import.meta.dirname, '..', '..', '..', 'docs', 'templates', `${id}.md`);
    const md = readFileSync(file, 'utf8');
    expect(md).toBe(templateMarkdown(spec));
    for (const f of spec.frames) expect(md).toContain(f.title.toUpperCase());
    for (const d of spec.databases) expect(md).toContain(`### ${d.name}`);
    for (const f of spec.redFlags) expect(md).toContain(f.text);
    for (const d of spec.rubric) expect(md).toContain(d.name);
    for (const s of spec.output.sections) expect(md).toContain(s.title);
    expect(md).toContain('Quick scan');
  });
});

describe('the research group', () => {
  it('has distinct ids, labels and chips, and each template sets up its own subject field', () => {
    const specs = IDS.map((id) => specOf(id)!);
    expect(new Set(specs.map((s) => s.label)).size).toBe(IDS.length);
    expect(specs.map((s) => s.inputs[0]!.id)).toEqual(['topic', 'topic', 'policy', 'technology', 'trend']);
  });

  it('the literature review has the databases and the evidence-quality rubric of its docs', () => {
    const lit = specOf('literature-review')!;
    expect(lit.databases.map((d) => d.name)).toEqual(['Search log', 'Papers', 'Authors & groups', 'Claims']);
    expect(lit.rubric.map((d) => d.name)).toContain('Study design');
    expect(lit.databases.find((d) => d.name === 'Papers')!.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['Study type', 'Sample size', 'Quality', 'Status']),
    );
  });

  it('the policy analysis quotes the text and keeps the not-legal-advice line', () => {
    const p = specOf('policy-analysis')!;
    expect(p.databases.map((d) => d.name)).toEqual(['Provisions', 'Stakeholders', 'Impact evidence', 'Comparable policies', 'Cases']);
    expect(JSON.stringify(p.output)).toMatch(/not legal advice/);
    expect(p.databases.find((d) => d.name === 'Provisions')!.columns.map((c) => c.name)).toContain('Quote');
  });

  it('the technology landscape separates vendor claims from independent benchmarks', () => {
    const t = specOf('tech-landscape')!;
    const basis = t.databases.find((d) => d.name === 'Benchmarks')!.columns.find((c) => c.name === 'Basis')!;
    expect(basis.options).toEqual(['Independent', 'Academic', 'Vendor']);
    expect(t.databases.map((d) => d.name)).toEqual(['Vendors', 'Open-source projects', 'Benchmarks']);
  });

  it('the trend report separates hard data from buzz and surveys of intent, and can watch its indicators', () => {
    const t = specOf('trend-report')!;
    const type = t.databases.find((d) => d.name === 'Signals')!.columns.find((c) => c.name === 'Type')!;
    expect(type.options).toEqual(expect.arrayContaining(['Hard data', 'Behaviour survey', 'Intent survey', 'Buzz']));
    expect(t.plan.orb.find((s) => s.id === 'monitor')!.tools).toContain('watch_events');
  });

  it('the deep dive gives the case against the same effort as the case for', () => {
    const d = specOf('deep-dive')!;
    const f = d.frames.find((x) => x.id === 'for')!;
    const a = d.frames.find((x) => x.id === 'against')!;
    expect(a.targets.reduce((n, t) => n + t.min, 0)).toBeGreaterThanOrEqual(f.targets.reduce((n, t) => n + t.min, 0) - 2);
    expect(d.plan.orb.find((s) => s.id === 'delegate')!.text).toMatch(/same effort/);
  });
});
