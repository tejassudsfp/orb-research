/**
 * P6.16: the people and personal templates (candidate research, event prep, a big personal decision, trip planning,
 * an investigation) against the depth bar of docs/phase6/vc-dd-template.md: an intake form, numbered briefed frames with
 * owners and target mixes, seeds, databases with schemas and views, a per-agent playbook that uses only allow-listed
 * tools, a rubric and red-flag checklist, memo and deck outputs, the three depth tiers (the cost guard) and follow-up chips.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGENT_TOOLS,
  PLACEABLE_TYPES,
  TEMPLATES,
  TEMPLATE_SPECS,
  cardDataSchema,
  fillTokens,
  followUpChips,
  intakeLines,
  planToolViolations,
  playbookText,
  specOf,
  stepsFor,
  templateMarkdown,
  tierGate,
  validateIntake,
  type TemplateId,
  type TemplateSpecV2,
} from '../src/index.js';

const IDS = ['candidate', 'event-prep', 'personal-decision', 'trip-planning', 'investigation'] as const;
const specs = IDS.map((id) => [id, specOf(id as TemplateId)!] as const);
const ROLES = ['orb', 'scout', 'critic', 'builder'] as const;
const dbOf = (s: TemplateSpecV2, key: string) => s.databases.find((d) => d.key === key)!;

describe('the five people and personal templates exist', () => {
  it('are v2 specs on Home, after VC due diligence', () => {
    for (const id of IDS) {
      expect(specOf(id), id).toBeTruthy();
      const chip = TEMPLATES.find((t) => t.id === id)!;
      expect(chip.spec).toBe(specOf(id));
    }
    expect(TEMPLATE_SPECS.map((s) => s.id)).toEqual(expect.arrayContaining([...IDS]));
  });

  it('have a distinct label, colour and ask-box placeholder', () => {
    expect(new Set(specs.map(([, s]) => s.label)).size).toBe(5);
    expect(new Set(specs.map(([, s]) => s.dot)).size).toBe(5);
    expect(specs.map(([, s]) => s.label)).toEqual([
      'Candidate research',
      'Event prep',
      'Big decision',
      'Trip planning',
      'Investigation',
    ]);
  });
});

describe.each(specs)('%s: the depth bar', (id, spec) => {
  it('has the intake form: a required subject, materials, depth and signed-in sources', () => {
    expect(spec.inputs[0]!.kind).toBe('text');
    expect(spec.inputs[0]!.required).toBe(true);
    const kinds = spec.inputs.map((f) => f.kind);
    for (const k of ['materials', 'depth', 'sites']) expect(kinds, `${id} needs a ${k} field`).toContain(k);
    expect(spec.inputs.find((f) => f.kind === 'depth')!.required).toBe(true);
    expect(spec.inputs.filter((f) => f.required).length).toBeGreaterThanOrEqual(3);
    expect(new Set(spec.inputs.map((f) => f.id)).size).toBe(spec.inputs.length);
    // Every site the form offers has a signed-in use, and the reverse.
    const offered = spec.inputs.find((f) => f.kind === 'sites')!.sites!.map((s) => s.domain);
    expect(spec.signedIn.map((s) => s.domain).sort()).toEqual([...offered].sort());
  });

  it('has 8 or more numbered frames, each with a brief, owners, a target mix and seeds', () => {
    expect(spec.frames.length).toBeGreaterThanOrEqual(8);
    expect(new Set(spec.frames.map((f) => f.id)).size).toBe(spec.frames.length);
    expect(new Set(spec.frames.map((f) => f.title)).size).toBe(spec.frames.length);
    for (const f of spec.frames) {
      expect(f.brief.length, f.id).toBeGreaterThan(150);
      expect(f.targets.length, f.id).toBeGreaterThan(0);
      expect(f.seeds.length, f.id).toBeGreaterThan(0);
    }
    expect(spec.frames[0]!.owners).toEqual(['orb']);
    expect(spec.frames[0]!.room).toBeGreaterThan(0);
  });

  it('every frame target and every seed type can be placed by an owner of the frame (or is seeded)', () => {
    for (const f of spec.frames)
      for (const t of f.targets) {
        const seeded = f.seeds.some((s) => s.type === t.type);
        const placeable = f.owners.some((o) => PLACEABLE_TYPES[o].includes(t.type));
        expect(seeded || placeable, `${f.id}: ${t.type} (owners ${f.owners.join(', ')})`).toBe(true);
      }
  });

  it('every non-Orb owner of a frame has a playbook step for it, and every step names real frames', () => {
    const ids = new Set(spec.frames.map((f) => f.id));
    for (const role of ROLES) for (const s of spec.plan[role]) for (const f of s.frames) expect(ids.has(f)).toBe(true);
    for (const f of spec.frames)
      for (const owner of f.owners.filter((o) => o !== 'orb'))
        expect(spec.plan[owner].some((s) => s.frames.includes(f.id)), `${owner} has no step for ${f.id}`).toBe(true);
  });

  it("references only tools in the role's allow-list", () => {
    expect(planToolViolations(spec)).toEqual([]);
    for (const role of ROLES)
      for (const step of spec.plan[role]) for (const tool of step.tools) expect(AGENT_TOOLS[role]).toContain(tool);
  });

  it('never has an agent place a card type its role may not, or tick a checklist, or delete a card', () => {
    const critic = spec.plan.critic.map((s) => s.text).join(' ');
    expect(critic).not.toMatch(/\bdoc card\b/);
    for (const role of ROLES) {
      const text = spec.plan[role].map((s) => s.text).join(' ');
      expect(text, `${role} must not tick`).not.toMatch(/\b(tick|check off) the checklist\b(?!.*(user|cannot))/i);
    }
    for (const role of ROLES) for (const s of spec.plan[role]) expect(s.tools).not.toContain('delete_card');
  });

  it('seeds are valid card data of their type once their tokens are filled; tokens name intake fields', () => {
    const fields = new Set(spec.inputs.map((f) => f.id));
    const answers = Object.fromEntries(
      spec.inputs.map((f) => [f.id, f.kind === 'url' ? 'https://acme.com' : `Sample ${f.id}`]),
    );
    const known = { ...answers, year: '2026', date: '2026-10-15' };
    const tokens = (s: string) => [...s.matchAll(/\{\{([a-z][a-z0-9_]*)(?:\|[^}]*)?\}\}/g)].map((m) => m[1]!);
    const every = JSON.stringify(spec);
    for (const t of tokens(every)) expect(fields.has(t) || t === 'year' || t === 'date', `token ${t}`).toBe(true);
    for (const f of spec.frames)
      for (const s of f.seeds) {
        if (s.type === 'database' || s.type === 'chart') continue;
        const data = JSON.parse(fillTokens(JSON.stringify(s.data), known));
        const parsed = cardDataSchema(s.type).safeParse(data);
        expect(parsed.success, `${f.id}/${s.type}: ${JSON.stringify(parsed.error?.issues[0])}`).toBe(true);
      }
  });

  it('has databases with typed columns, a key column, valid views, and a seed card in the frame they name', () => {
    expect(spec.databases.length).toBeGreaterThanOrEqual(3);
    for (const d of spec.databases) {
      const names = d.columns.map((c) => c.name);
      expect(new Set(names).size, d.key).toBe(names.length);
      expect(names, `${d.key} key column`).toContain(d.keyColumn);
      for (const c of d.columns) if (c.type === 'enum') expect(c.options?.length ?? 0, `${d.key}.${c.name}`).toBeGreaterThanOrEqual(2);
      for (const v of d.views) {
        for (const x of [v.group, ...(v.sort ?? []).map((k) => k.column), ...(v.filter ?? []).map((k) => k.column)])
          if (x) expect(names, `${d.key}/${v.name}: ${x}`).toContain(x);
        if (v.kind === 'board') expect(v.group, `${d.key}/${v.name} board needs a group`).toBeTruthy();
      }
      const frame = spec.frames.find((f) => f.id === d.frame)!;
      expect(frame, `${d.key} frame`).toBeTruthy();
      expect(frame.seeds.some((s) => s.type === 'database' && s.db === d.key), `${d.key} seeded in ${d.frame}`).toBe(true);
    }
    // Every database seed names a database; every chart seed is bound to a database and to columns of it.
    for (const f of spec.frames)
      for (const s of f.seeds) {
        if (s.type !== 'database' && s.type !== 'chart') continue;
        const d = dbOf(spec, s.db ?? '');
        expect(d, `${f.id}: ${s.type} ${s.db}`).toBeTruthy();
        if (s.type === 'chart') {
          const names = d.columns.map((c) => c.name);
          const data = s.data as { x: string; y?: string; color?: string };
          for (const c of [data.x, data.y, data.color]) if (c) expect(names, `chart ${s.db}: ${c}`).toContain(c);
        }
      }
  });

  it('uses the new cards: databases, charts, metrics, timelines, matrices and the synthesis cards', () => {
    const types = new Set(spec.frames.flatMap((f) => f.seeds.map((s) => s.type)));
    for (const t of ['database', 'chart', 'metric', 'question', 'risk', 'checklist', 'hypothesis', 'decision', 'framework', 'matrix'])
      expect(types, `${id} seeds a ${t}`).toContain(t);
  });

  it('has a rubric that adds up to 100 with anchors, a scorecard seed and a decision seed', () => {
    expect(spec.rubric.reduce((n, d) => n + d.weight, 0)).toBe(100);
    expect(spec.rubric.length).toBeGreaterThanOrEqual(5);
    const frames = new Set(spec.frames.map((f) => f.id));
    for (const d of spec.rubric) {
      expect(frames.has(d.frame)).toBe(true);
      expect(d.anchors[1]).not.toBe(d.anchors[5]);
    }
    const seeds = spec.frames.flatMap((f) => f.seeds);
    const sc = seeds.find((s) => s.type === 'matrix' && String(s.data.title).startsWith('Scorecard'))!;
    expect((sc.data.criteria as { weight: number }[]).map((c) => c.weight)).toEqual(spec.rubric.map((d) => d.weight));
    const decision = seeds.filter((s) => s.type === 'decision');
    expect(decision).toHaveLength(1);
    expect((decision[0]!.data as { status: string }).status).toBe('open');
  });

  it('has a red-flag checklist of 8 to 12 items, seeded as a checklist card, with a check for each', () => {
    expect(spec.redFlags.length).toBeGreaterThanOrEqual(8);
    expect(spec.redFlags.map((f) => f.id)).toEqual(spec.redFlags.map((_, i) => `RF${String(i + 1).padStart(2, '0')}`));
    const seeded = spec.frames
      .flatMap((f) => f.seeds)
      .find(
        (s) =>
          s.type === 'checklist' &&
          (s.data.items as { text: string }[]).some((i) => i.text.startsWith('RF01 ')),
      )!;
    const items = (seeded.data.items as { text: string }[]).map((i) => i.text);
    expect(items).toEqual(spec.redFlags.map((f) => `${f.id} ${f.text}`));
    // Only Critic (and Orb) own the frame that holds it; the user ticks.
    const frame = spec.frames.find((f) => f.seeds.includes(seeded))!;
    expect(frame.owners).toContain('critic');
    for (const f of spec.redFlags) expect(f.check.length).toBeGreaterThan(30);
  });

  it('has the memo outline over real frames, a one-pager, the deck format and an appendix', () => {
    const frames = new Set(spec.frames.map((f) => f.id));
    expect(spec.output.sections.length).toBeGreaterThanOrEqual(8);
    expect(spec.output.sections[0]!.words).toBe(150);
    for (const s of spec.output.sections) for (const f of s.frames) expect(frames.has(f)).toBe(true);
    // Every frame feeds the memo.
    const used = new Set(spec.output.sections.flatMap((s) => s.frames));
    for (const f of spec.frames) expect(used.has(f.id), `${f.id} is in no memo section`).toBe(true);
    expect(spec.output.citationRule).toMatch(/cite/);
    expect(spec.output.onePager.includes.length).toBeGreaterThanOrEqual(4);
    expect(spec.output.appendix).toMatch(/sources/i);
    expect(spec.output.deckFormat).toBe('standard');
    expect(spec.output.memoTitle).toContain('{{');
  });

  it('has the three depth tiers with a cost guard: Quick has no deep research, Deep allows pro and ultra', () => {
    const { quick, standard, deep } = spec.tiers;
    expect(quick.deepRuns).toBe(0);
    expect(quick.processors).toEqual([]);
    expect(quick.cardsPerFrame).toBe(12);
    expect(quick.memo).toBe('summary');
    expect(quick.parallelTools).not.toContain('deep_research');
    expect(standard.processors).toEqual(['lite', 'base', 'core']);
    expect(standard.parallelTools).toEqual(expect.arrayContaining(['deep_research', 'find_entities', 'batch_enrich']));
    expect(standard.parallelTools).not.toContain('find_entities_extend');
    expect(deep.processors).toEqual(expect.arrayContaining(['pro', 'ultra']));
    expect(deep.parallelTools).toContain('find_entities_extend');
    for (const t of [quick, standard, deep]) expect(t.askAboveUsd).toBe(0.5);
    expect(deep.deepRuns).toBeGreaterThan(standard.deepRuns);
    // The gate refuses what the tier does not allow.
    for (const tool of ['deep_research', 'find_entities', 'batch_enrich'])
      expect(tierGate(spec, 'quick', tool), tool).toMatch(/Quick scan depth tier/);
    expect(tierGate(spec, 'standard', 'deep_research', { processor: 'core' })).toBeUndefined();
    expect(tierGate(spec, 'standard', 'deep_research', { processor: 'pro' })).toMatch(/not pro/);
    expect(tierGate(spec, 'deep', 'deep_research', { processor: 'ultra' })).toBeUndefined();
  });

  it('uses Parallel where it fits: deep research with a spend ask, lists and enrichment, a monitor where it is ongoing', () => {
    const scout = spec.plan.scout;
    const deep = scout.find((s) => s.tools.includes('deep_research'))!;
    expect(deep.askAboveUsd).toBe(0.5);
    expect(deep.minTier).toBe('standard');
    expect(spec.plan.orb.some((s) => s.tools.includes('deep_research') && s.askAboveUsd === 0.5)).toBe(true);
    // Quick still has an entry for every list step (the tier gate refuses the tool; the text says what to do instead).
    const quick = stepsFor(spec, 'scout', 'quick').map((s) => s.id);
    expect(quick).not.toContain(deep.id);
    expect(stepsFor(spec, 'scout', 'standard').map((s) => s.id)).toContain(deep.id);
    const monitored = id !== 'candidate';
    expect(!!spec.monitor, `${id} monitor`).toBe(monitored);
    expect(spec.plan.orb.some((s) => s.tools.includes('watch_topic'))).toBe(monitored);
    if (monitored) expect(spec.monitor!.query).toContain('{{');
    // Orb writes the memo and can write the deck.
    const memo = spec.plan.orb.find((s) => s.tools.includes('compose_section'))!;
    expect(memo.text).toMatch(/Quick tier write the summary only/);
  });

  it('has 6 follow-up chips and signed-in uses with reasons', () => {
    expect(spec.followUps.length).toBeGreaterThanOrEqual(6);
    for (const s of spec.signedIn) expect(s.use.length).toBeGreaterThan(20);
    const subject = spec.inputs[0]!.id;
    expect(JSON.stringify(spec.followUps)).toContain(`{{${subject}}}`);
    const chips = followUpChips(spec, { [subject]: 'Acme' });
    expect(JSON.stringify(chips)).toContain('Acme');
    expect(JSON.stringify(chips)).not.toContain('{{');
  });

  it('injects its playbook: intake lines, the tier, the frames, the steps in order, the rubric and the memo for Orb', () => {
    const subject = spec.inputs[0]!;
    const answers = { [subject.id]: 'Acme Robotics' };
    const frames = spec.frames.map((f, i) => ({ id: `f_${i + 1}`, title: f.title, number: i + 1 }));
    const orb = playbookText({ spec, role: 'orb', depth: 'standard', answers, boardFrames: frames });
    expect(orb).toContain(`The ${spec.label} playbook`);
    expect(orb).toContain(`- ${subject.label}: Acme Robotics`);
    expect(orb).toContain(spec.output.sections[0]!.title);
    for (const d of spec.rubric) expect(orb).toContain(`${d.name} (${d.weight}%)`);
    expect(intakeLines(spec, answers)[0]).toContain('Acme Robotics');
    const critic = playbookText({ spec, role: 'critic', depth: 'standard', answers, boardFrames: frames });
    for (const f of spec.redFlags) expect(critic).toContain(f.id);
    const scout = playbookText({ spec, role: 'scout', depth: 'quick', answers, boardFrames: frames });
    expect(scout).toContain('No Parallel deep research');
    expect(scout).not.toContain('The red-flag checklist');
    for (const f of spec.frames.filter((x) => x.owners.includes('scout'))) expect(scout).toContain(`"${f.title}" [f_`);
  });

  it('writes docs/templates/<id>.md as the generated human-readable spec, naming every frame, database, flag and dimension', () => {
    const file = join(import.meta.dirname, '..', '..', '..', 'docs', 'templates', `${id}.md`);
    const md = readFileSync(file, 'utf8');
    expect(md).toBe(templateMarkdown(spec));
    for (const f of spec.frames) expect(md).toContain(f.title.toUpperCase());
    for (const d of spec.databases) expect(md).toContain(`### ${d.name}`);
    for (const f of spec.redFlags) expect(md).toContain(f.text);
    for (const d of spec.rubric) expect(md).toContain(d.name);
    for (const s of spec.output.sections) expect(md).toContain(s.title);
  });

  it('validates a complete intake and refuses an empty one, naming the missing fields', () => {
    const sample: Record<string, string | string[]> = {};
    for (const f of spec.inputs) {
      if (f.kind === 'materials') continue;
      if (f.kind === 'url') sample[f.id] = 'example.com';
      else if (f.kind === 'select') sample[f.id] = f.options![0]!;
      else if (f.kind === 'list' || f.kind === 'sites') sample[f.id] = ['a', 'b'];
      else if (f.kind === 'depth') sample[f.id] = 'deep';
      else sample[f.id] = 'Sample';
    }
    const ok = validateIntake(spec.inputs, sample);
    expect(ok.errors).toEqual({});
    expect(ok.depth).toBe('deep');
    const bad = validateIntake(spec.inputs, {});
    expect(bad.ok).toBe(false);
    for (const f of spec.inputs.filter((x) => x.required && x.kind !== 'depth'))
      expect(bad.errors[f.id], f.id).toMatch(/is required/);
  });
});

describe('what is particular to each template', () => {
  it('candidate research: public professional information only, no monitor, a privacy red flag and a privacy sweep', () => {
    const s = specOf('candidate')!;
    expect(s.brief).toMatch(/public professional information only/i);
    expect(s.frames[0]!.seeds.some((x) => x.type === 'doc' && String(x.data.title) === 'Scope and privacy')).toBe(true);
    expect(s.redFlags.some((f) => /Sensitive or non-professional/.test(f.text) && /age, health, family/.test(f.text))).toBe(true);
    expect(s.plan.critic.some((x) => x.id === 'privacy')).toBe(true);
    expect(s.plan.scout[0]!.text).toMatch(/Do not look for personal accounts/);
    expect(s.output.citationRule).toMatch(/Nothing outside the role/);
    // The basis for the research is a required answer, and the signed-in note warns about LinkedIn's terms.
    expect(s.inputs.find((f) => f.id === 'basis')!.required).toBe(true);
    expect(s.inputs.find((f) => f.kind === 'sites')!.help).toMatch(/LinkedIn restricts/);
    // No step searches for protected attributes, and every request about the person stays on the role.
    const all = ROLES.flatMap((r) => s.plan[r].map((x) => x.text)).join(' ');
    expect(all).not.toMatch(/search (their|his|her) (family|health|religion|politics|age)/i);
    // The decision is a person's: orb proposes.
    expect(JSON.stringify(s.frames.flatMap((f) => f.seeds))).toMatch(/A person decides|never does/);
  });

  it('event prep: people rows hold roles only, messages are drafts for the user to send, and a monitor is on request', () => {
    const s = specOf('event-prep')!;
    expect(dbOf(s, 'people').purpose).toMatch(/no personal contact details/);
    expect(s.plan.orb.find((x) => x.id === 'delegate')!.text).toMatch(/nothing is sent to anyone/);
    expect(s.plan.scout.find((x) => x.id === 'outreach')!.text).toMatch(/never send anything/);
    expect(dbOf(s, 'meetings').columns.find((c) => c.name === 'Status')!.options).toContain('Draft');
    expect(s.plan.scout.find((x) => x.id === 'people')!.tools).toEqual(expect.arrayContaining(['find_entities', 'batch_enrich']));
    expect(s.plan.orb.find((x) => x.id === 'monitor')!.text).toMatch(/confirmed by the user/);
    expect(s.tiers.quick.cardsPerFrame).toBe(12);
  });

  it('big decision: criteria with must-haves as gates, the true cost model, a pre-mortem, and the user decides', () => {
    const s = specOf('personal-decision')!;
    expect(s.brief).toMatch(/not a financial, legal or medical adviser/);
    expect(dbOf(s, 'criteria').columns.find((c) => c.name === 'Type')!.options).toEqual(['Must-have', 'Nice to have', 'Dealbreaker']);
    expect(dbOf(s, 'cost-model').columns.map((c) => c.name)).toEqual(
      expect.arrayContaining(['One-time', 'Per month', 'Total over 5 years', 'Basis']),
    );
    expect(s.plan.critic.some((x) => x.id === 'premortem')).toBe(true);
    expect(s.frames.map((f) => f.title)).toContain('Risks & regrets');
    const decision = s.frames.flatMap((f) => f.seeds).find((x) => x.type === 'decision')!;
    expect(String(decision.data.body)).toMatch(/You decide/);
    // Covers home, car and school in the scout's first step.
    const kind = s.plan.scout.find((x) => x.id === 'kind')!.text;
    for (const w of ['home', 'car', 'school']) expect(kind).toContain(w);
    expect(s.inputs.find((f) => f.id === 'kind')!.options).toEqual(
      expect.arrayContaining(['Home', 'Car', 'School or course']),
    );
  });

  it('trip planning: transport, stay, places, food, itinerary, budget, prep; nothing is booked; no medical advice', () => {
    const s = specOf('trip-planning')!;
    expect(s.databases.map((d) => d.key)).toEqual(['transport', 'stays', 'places', 'food', 'itinerary', 'budget']);
    expect(s.plan.orb.find((x) => x.id === 'delegate')!.text).toMatch(/nothing is booked, paid or sent/);
    expect(s.redFlags.some((f) => /orb gives no medical advice/.test(f.check))).toBe(true);
    expect(s.plan.scout.find((x) => x.id === 'stay')!.tools).toEqual(expect.arrayContaining(['find_entities', 'batch_enrich']));
    expect(s.plan.orb.find((x) => x.id === 'itinerary')!.tools).toContain('upsert_rows');
    expect(s.monitor!.query).toMatch(/advisories/);
    expect(s.redFlags.some((f) => /Tight connections/.test(f.text))).toBe(true);
    expect(dbOf(s, 'transport').views.some((v) => v.name === 'Tight')).toBe(true);
  });

  it('investigation: claims need two independent sources, evidence apart from inference, protect sources and private people', () => {
    const s = specOf('investigation')!;
    expect(s.brief).toMatch(/Evidence over inference/);
    expect(s.frames.map((f) => f.title)).toEqual([
      'Question & scope',
      'Timeline',
      'Entities & network',
      'Documents & records',
      'Claims & verification',
      'Source assessment',
      'Gaps, counter-evidence & checks',
      'Findings & story',
    ]);
    expect(dbOf(s, 'claims').columns.find((c) => c.name === 'Status')!.options).toEqual(
      expect.arrayContaining(['Unchecked', 'Supported', 'Contradicted', 'Unverifiable']),
    );
    expect(s.redFlags.some((f) => /single source/.test(f.text))).toBe(true);
    expect(s.redFlags.some((f) => /Source safety/.test(f.text))).toBe(true);
    expect(s.redFlags.some((f) => /Right of reply/.test(f.text))).toBe(true);
    expect(s.plan.orb.find((x) => x.id === 'right-of-reply')!.text).toMatch(/orb never contacts anyone/);
    expect(s.plan.orb.find((x) => x.id === 'findings')!.text).toMatch(/at least two cards/);
    expect(s.output.citationRule).toMatch(/evidence and inference are kept apart/);
    expect(s.output.sections.map((x) => x.title)).toContain('Question, method & limits');
    // The network diagram uses sourced links only.
    expect(s.plan.builder.find((x) => x.id === 'network')!.text).toMatch(/No inferred links/);
    expect(dbOf(s, 'source-ledger').purpose).toMatch(/Confidential sources are never entered by name/);
  });
});
