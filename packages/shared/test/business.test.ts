/**
 * P6.14 business templates: sales account research, partnership evaluation, vendor/tool selection and market entry.
 * The engine tests (templates.test.ts) cover the VC template; this file holds each business template to the same depth
 * bar: numbered frames with briefs and owners, seeds and databases that agree with each other, a playbook that only
 * names allow-listed tools and covers every owner, a rubric and red flags that add up, a memo, a deck and the tiers.
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_TOOLS,
  DEPTHS,
  PLACEABLE_TYPES,
  TEMPLATES,
  TemplateSpecV2,
  cardDataSchema,
  deckFormatById,
  deckFormatFor,
  fillTokens,
  followUpChips,
  intakeTitle,
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
import { BUSINESS_IDS, SAMPLE_INTAKE } from './businessIntakes.js';

describe.each(BUSINESS_IDS)('business template %s', (id) => {
  const spec = specOf(id as TemplateId)!;
  const intake = SAMPLE_INTAKE[id];
  const subject = String(Object.values(intake)[0]);

  it('is registered, valid and listed on Home', () => {
    expect(spec).toBeTruthy();
    expect(TemplateSpecV2.safeParse(spec).success).toBe(true);
    expect(TEMPLATES.find((t) => t.id === id)?.spec).toBe(spec);
    expect(spec.frames.length).toBeGreaterThanOrEqual(10);
    expect(templateFrames(id as TemplateId)).toHaveLength(spec.frames.length);
  });

  it('has numbered frames with a real brief, owners, a target mix and at least one seed', () => {
    expect(new Set(spec.frames.map((f) => f.id)).size).toBe(spec.frames.length);
    for (const f of spec.frames) {
      expect(f.brief.length, f.id).toBeGreaterThan(120);
      expect(f.targets.length, f.id).toBeGreaterThan(0);
      expect(f.seeds.length, f.id).toBeGreaterThan(0);
    }
    // The first frame is Orb's and keeps room for the materials; the last is the decision or plan Orb owns.
    expect(spec.frames[0]!.owners).toEqual(['orb']);
    expect(spec.frames[0]!.room).toBeGreaterThan(0);
    expect(spec.frames.at(-1)!.owners).toContain('orb');
  });

  it('takes the subject first, requires it and the depth, and offers materials and signed-in sources', () => {
    expect(spec.inputs[0]!.required).toBe(true);
    expect(spec.inputs.filter((f) => f.required).length).toBeGreaterThanOrEqual(2);
    expect(spec.inputs.map((f) => f.kind)).toEqual(expect.arrayContaining(['materials', 'depth', 'sites']));
    const sites = spec.inputs.find((f) => f.kind === 'sites')!.sites!.map((s) => s.domain);
    expect(spec.signedIn.map((s) => s.domain)).toEqual(sites);
    for (const s of spec.inputs.filter((f) => f.kind === 'select')) expect(s.options!.length).toBeGreaterThan(2);
  });

  it('every token in the spec is an intake field', () => {
    const ids = new Set([...spec.inputs.map((f) => f.id), 'year', 'date']);
    const text = JSON.stringify(spec);
    for (const m of text.matchAll(/\{\{([a-z][a-z0-9_]*)(?:\|[^}]*)?\}\}/g))
      expect(ids.has(m[1]!), `{{${m[1]}}}`).toBe(true);
  });

  it('has databases that match their seeds: a card in the frame, key column and view columns that exist', () => {
    expect(spec.databases.length).toBeGreaterThanOrEqual(4);
    for (const d of spec.databases) {
      const frame = spec.frames.find((f) => f.id === d.frame)!;
      expect(frame, d.key).toBeTruthy();
      expect(frame.seeds.some((s) => s.type === 'database' && s.db === d.key)).toBe(true);
      const cols = d.columns.map((c) => c.name);
      expect(new Set(cols).size).toBe(cols.length);
      if (d.keyColumn) expect(cols).toContain(d.keyColumn);
      for (const c of d.columns) if (c.type === 'enum') expect(c.options!.length, `${d.key}/${c.name}`).toBeGreaterThan(1);
      for (const v of d.views) {
        for (const name of [v.group, v.cover, ...(v.sort ?? []).map((s) => s.column), ...(v.filter ?? []).map((f) => f.column)])
          if (name) expect(cols, `${d.key}/${v.name}`).toContain(name);
      }
      // Every database has a table view and a second way to look at it.
      expect(d.views.length).toBeGreaterThan(1);
    }
    const keys = new Set(spec.databases.map((d) => d.key));
    for (const f of spec.frames)
      for (const s of f.seeds) if (s.type === 'database' || s.type === 'chart') expect(keys.has(s.db ?? '')).toBe(true);
  });

  it('has a rubric that adds up to 100 and a scorecard seed that mirrors it', () => {
    expect(spec.rubric.length).toBeGreaterThanOrEqual(5);
    expect(spec.rubric.reduce((a, d) => a + d.weight, 0)).toBe(100);
    const ids = new Set(spec.frames.map((f) => f.id));
    for (const d of spec.rubric) {
      expect(Object.keys(d.anchors)).toEqual(['1', '3', '5']);
      expect(ids.has(d.frame)).toBe(true);
    }
    const card = spec.frames.flatMap((f) => f.seeds).find((s) => s.type === 'matrix' && /^Scorecard/.test(String(s.data.title)))!;
    const criteria = (card.data as { criteria: { name: string; weight: number }[] }).criteria;
    expect(criteria.map((c) => c.weight)).toEqual(spec.rubric.map((d) => d.weight));
    expect(criteria.map((c) => c.name)).toEqual(spec.rubric.map((d) => `${d.name} (${d.weight}%)`));
  });

  it('has a red-flag checklist: numbered, each seeded in the checklist, with a how-to-check', () => {
    expect(spec.redFlags.length).toBeGreaterThanOrEqual(10);
    expect(spec.redFlags.map((f) => f.id)).toEqual(
      spec.redFlags.map((_, i) => `RF${String(i + 1).padStart(2, '0')}`),
    );
    const list = spec.frames
      .flatMap((f) => f.seeds)
      .find((s) => s.type === 'checklist' && s.data.title === 'Red-flag checklist')!;
    const items = (list.data as { items: { text: string }[] }).items;
    expect(items).toHaveLength(spec.redFlags.length);
    spec.redFlags.forEach((f, i) => expect(items[i]!.text).toBe(`${f.id} ${f.text}`));
    for (const f of spec.redFlags) expect(f.check.length).toBeGreaterThan(40);
    // The frame holding the checklist is Critic's.
    const frame = spec.frames.find((f) => f.seeds.some((s) => s.data === list.data))!;
    expect(frame.owners).toContain('critic');
  });

  it('has a memo that covers real frames, a one-pager, a deck format that exists and the cited-memo rule', () => {
    const ids = new Set(spec.frames.map((f) => f.id));
    expect(spec.output.sections.length).toBeGreaterThanOrEqual(10);
    for (const s of spec.output.sections) for (const f of s.frames) expect(ids.has(f)).toBe(true);
    // Every frame feeds at least one memo section.
    const fed = new Set(spec.output.sections.flatMap((s) => s.frames));
    for (const f of spec.frames) expect(fed.has(f.id), `${f.id} is not in the memo`).toBe(true);
    expect(spec.output.sections[0]!.words).toBeLessThanOrEqual(200);
    expect(spec.output.citationRule).toMatch(/cite/i);
    expect(spec.output.onePager.includes.length).toBeGreaterThanOrEqual(4);
    const deck = deckFormatById(spec.output.deckFormat)!;
    expect(deck, spec.output.deckFormat).toBeTruthy();
    expect(deckFormatFor(id).id).toBe(spec.output.deckFormat);
    expect(deck.slides.length).toBeGreaterThanOrEqual(8);
    expect(deck.slides[0]!.layout).toBe('title');
  });

  it("references only tools in the role's allow-list and gives every non-Orb owner a step for its frames", () => {
    expect(planToolViolations(spec)).toEqual([]);
    const ids = new Set(spec.frames.map((f) => f.id));
    for (const role of ['orb', 'scout', 'critic', 'builder'] as const) {
      const steps = spec.plan[role];
      expect(new Set(steps.map((s) => s.id)).size).toBe(steps.length);
      for (const s of steps) {
        for (const f of s.frames) expect(ids.has(f), `${role}/${s.id}: ${f}`).toBe(true);
        for (const t of s.tools) expect(AGENT_TOOLS[role]).toContain(t);
      }
    }
    for (const f of spec.frames)
      for (const owner of f.owners.filter((o) => o !== 'orb'))
        expect(spec.plan[owner].some((s) => s.frames.includes(f.id)), `${owner} has no step for ${f.id}`).toBe(true);
    // Orb owns its frames through its steps too.
    for (const f of spec.frames)
      if (f.owners.includes('orb'))
        expect(spec.plan.orb.some((s) => s.frames.includes(f.id)), `orb has no step for ${f.id}`).toBe(true);
  });

  it('uses Parallel where it fits: find_entities and batch_enrich into a database, deep research for gaps, a monitor on request', () => {
    const scout = spec.plan.scout.flatMap((s) => s.tools);
    for (const t of ['find_entities', 'batch_enrich', 'deep_research', 'upsert_rows', 'capture_page', 'fetch_signed_in'])
      expect(scout, t).toContain(t);
    // Entity lists are consolidated into the template's database (the Parallel run fills one of its own).
    expect(spec.plan.scout.find((s) => s.tools.includes('find_entities'))!.tools).toEqual(
      expect.arrayContaining(['query_dataset', 'upsert_rows']),
    );
    expect(spec.plan.orb.flatMap((s) => s.tools)).toContain('compose_section');
    expect(spec.plan.orb.flatMap((s) => s.tools)).toContain('ask_user_question');
    expect(spec.monitor).toBeTruthy();
    expect(spec.plan.orb.flatMap((s) => s.tools)).toContain('watch_topic');
    // Spend steps ask first and wait for Standard.
    for (const role of ['orb', 'scout'] as const)
      for (const s of spec.plan[role].filter((x) => x.tools.includes('deep_research'))) {
        expect(s.minTier).not.toBe('quick');
        expect(s.askAboveUsd).toBe(0.5);
      }
  });

  it('only targets and seeds card types an owner of the frame may place (or that are seeded)', () => {
    for (const f of spec.frames)
      for (const t of f.targets) {
        const seeded = f.seeds.some((s) => s.type === t.type);
        const placeable = f.owners.some((o) => PLACEABLE_TYPES[o].includes(t.type));
        expect(seeded || placeable, `${f.id}: ${t.type} (owners ${f.owners.join(', ')})`).toBe(true);
      }
    // Critic never has a doc or an entity in its playbook text.
    const critic = spec.plan.critic.map((s) => s.text).join(' ');
    expect(critic).not.toMatch(/\bdoc card\b|\bentity card\b|\bupsert_rows\b/);
  });

  it('has seed cards that are valid data of their type once the tokens are filled', () => {
    const answers = { ...validateIntake(spec.inputs, intake).answers, year: '2026', date: '2026-10-15' };
    for (const f of spec.frames)
      for (const s of f.seeds) {
        if (s.type === 'database' || s.type === 'chart') continue;
        const data = JSON.parse(fillTokens(JSON.stringify(s.data), answers));
        const parsed = cardDataSchema(s.type).safeParse(data);
        expect(parsed.success, `${f.id}/${s.type}: ${JSON.stringify(parsed.error?.issues[0])}`).toBe(true);
      }
  });

  it('validates its intake, titles the canvas from it and defaults the depth', () => {
    const r = validateIntake(spec.inputs, intake);
    expect(r.ok, JSON.stringify(r.errors)).toBe(true);
    expect(intakeTitle(spec, r.answers)).toContain(subject);
    expect(validateIntake(spec.inputs, {}).ok).toBe(false);
    const required = spec.inputs.filter((f) => f.required && f.kind !== 'depth').map((f) => f.id);
    expect(Object.keys(validateIntake(spec.inputs, { depth: 'quick' }).errors).sort()).toEqual([...required].sort());
    expect(validateIntake(spec.inputs, { ...intake, depth: 'epic' }).ok).toBe(false);
  });

  it('gives each agent its own playbook, in order, with its frames and the tier', () => {
    const boardFrames = spec.frames.map((f, i) => ({ id: `f_${i}`, title: f.title, number: i + 1 }));
    const answers = validateIntake(spec.inputs, intake).answers;
    const scout = playbookText({ spec, role: 'scout', depth: 'standard', answers, boardFrames });
    expect(scout).toContain('Your playbook, in this order:');
    expect(scout).toContain('Depth: Standard');
    expect(scout).toContain(String((answers.sites as string[])[0]));
    const order = stepsFor(spec, 'scout', 'standard').map((s) => fillTokens(s.text, answers).slice(0, 40));
    let at = scout.indexOf('Your playbook');
    for (const t of order) {
      const next = scout.indexOf(t, at);
      expect(next, t).toBeGreaterThanOrEqual(at);
      at = next;
    }
    const critic = playbookText({ spec, role: 'critic', depth: 'standard', answers, boardFrames });
    for (const f of spec.redFlags) expect(critic).toContain(f.id);
    expect(scout).not.toContain('The red-flag checklist');
    const orb = playbookText({ spec, role: 'orb', depth: 'standard', answers, boardFrames });
    for (const d of spec.rubric) expect(orb).toContain(`${d.name} (${d.weight}%)`);
    expect(orb).toContain(`deck format is ${spec.output.deckFormat}`);
    expect(orb).toContain('Monitor (only if the user asks)');
    expect(orb).not.toContain('{{');
    // Quick drops the spend steps.
    expect(stepsFor(spec, 'scout', 'quick').map((s) => s.id)).not.toContain('deep');
  });

  it('has three tiers whose cost guard refuses the costly Parallel tools on Quick and pro/ultra on Standard', () => {
    expect(DEPTHS.map((d) => spec.tiers[d].label)).toEqual(['Quick scan', 'Standard', 'Deep']);
    for (const tool of ['deep_research', 'batch_enrich', 'find_entities', 'find_entities_extend'])
      expect(tierGate(spec, 'quick', tool)).toMatch(/Quick scan depth tier/);
    expect(tierGate(spec, 'standard', 'find_entities')).toBeUndefined();
    expect(tierGate(spec, 'standard', 'deep_research', { processor: 'core' })).toBeUndefined();
    expect(tierGate(spec, 'standard', 'deep_research', { processor: 'pro' })).toMatch(/not pro/);
    expect(tierGate(spec, 'deep', 'deep_research', { processor: 'ultra' })).toBeUndefined();
    expect(spec.tiers.quick.memo).toBe('summary');
    expect(spec.tiers.deep.deepRuns).toBeGreaterThan(spec.tiers.standard.deepRuns);
  });

  it('has follow-up chips that fill from the intake and leave [brackets] for the user', () => {
    expect(spec.followUps.length).toBeGreaterThanOrEqual(5);
    const answers = validateIntake(spec.inputs, intake).answers;
    const chips = followUpChips(spec, answers);
    expect(chips.map((c) => c.prompt).join(' ')).not.toContain('{{');
    expect(chips.map((c) => c.prompt).join(' ')).toContain(subject.split(',')[0]!.trim());
    expect(chips.some((c) => /\[[^\]]+\]/.test(c.prompt))).toBe(true);
  });

  it('writes a human-readable spec that names every frame, database, red flag, rubric dimension and memo section', () => {
    const md = templateMarkdown(spec);
    for (const f of spec.frames) expect(md).toContain(f.title.toUpperCase());
    for (const d of spec.databases) expect(md).toContain(`### ${d.name}`);
    for (const f of spec.redFlags) expect(md).toContain(f.text);
    for (const d of spec.rubric) expect(md).toContain(d.name);
    for (const s of spec.output.sections) expect(md).toContain(s.title);
  });
});

describe('the business group', () => {
  it('lists the four templates after the investing ones, with distinct ids, labels and colours', () => {
    const specs = BUSINESS_IDS.map((id) => specOf(id as TemplateId)!);
    expect(new Set(specs.map((s) => s.label)).size).toBe(4);
    expect(new Set(specs.map((s) => s.dot)).size).toBe(4);
    expect(new Set(specs.map((s) => s.output.deckFormat)).size).toBe(4);
    expect(specs.map((s) => s.label)).toEqual([
      'Sales account research',
      'Partnership evaluation',
      'Vendor / tool selection',
      'Market entry',
    ]);
  });
});
