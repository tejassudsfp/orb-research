/**
 * P6.11 template engine v2: the schema, the VC due-diligence template against docs/phase6/vc-dd-template.md, the
 * intake validation, the playbook text, the depth tiers' cost guard and the generated docs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGENT_TOOLS,
  DEPTHS,
  PLACEABLE_TYPES,
  TEMPLATES,
  TEMPLATE_SPECS,
  TemplateSpecV2,
  VC_DD,
  cardDataSchema,
  columnTypeOf,
  fillTokens,
  followUpChips,
  intakeLines,
  normalizeUrl,
  planToolViolations,
  playbookText,
  specOf,
  stepsFor,
  templateFrames,
  templateMarkdown,
  tierGate,
  validateIntake,
} from '../src/index.js';

const vc = specOf('vc-dd')!;

describe('the v2 schema', () => {
  it('accepts every template, and Home lists them after the v1 five', () => {
    expect(TEMPLATE_SPECS.length).toBeGreaterThan(0);
    for (const spec of TEMPLATE_SPECS) expect(TemplateSpecV2.safeParse(spec).success).toBe(true);
    // The v1 "stocks" chip was merged into "public-equity" (P6.12); only 'topic' is still a v1 chip, then every v2 spec.
    expect(TEMPLATES.map((t) => t.id)[0]).toBe('topic');
    expect(TEMPLATES.map((t) => t.id)).not.toContain('stocks');
    expect(TEMPLATES.map((t) => t.id).slice(1)).toEqual(TEMPLATE_SPECS.map((t) => t.id));
    expect(TEMPLATES.find((t) => t.id === 'vc-dd')?.spec).toBe(vc);
  });

  it('refuses a spec with an unknown field or a missing part', () => {
    expect(TemplateSpecV2.safeParse({ ...VC_DD, extra: 1 }).success).toBe(false);
    expect(TemplateSpecV2.safeParse({ ...VC_DD, frames: [] }).success).toBe(false);
    expect(TemplateSpecV2.safeParse({ ...VC_DD, plan: { ...VC_DD.plan, orb: [] } }).success).toBe(false);
  });

  it('maps the spec column types onto the six the dataset engine has', () => {
    expect(
      ['text', 'number', 'currency', 'date', 'url', 'enum', 'person', 'rating', 'boolean'].map((t) =>
        columnTypeOf(t as never),
      ),
    ).toEqual(['text', 'number', 'number', 'date', 'url', 'select', 'text', 'number', 'checkbox']);
  });
});

describe('the VC due-diligence template matches the spec', () => {
  it('has the twelve numbered frames of the spec, in order, with colours and owners', () => {
    expect(vc.frames.map((f) => [f.title, f.color, f.owners.join('+')])).toEqual([
      ['Snapshot', 'signal', 'orb'],
      ['Founders & team', 'sky', 'scout+critic'],
      ['Problem & product', 'rho', 'scout+builder'],
      ['Market', 'sky', 'scout+builder+critic'],
      ['Traction & metrics', 'rho', 'scout+orb+critic'],
      ['Customers & signals', 'sky', 'scout'],
      ['Competition', 'rho', 'scout+builder+critic'],
      ['Business model & GTM', 'sky', 'scout+orb'],
      ['Financing & cap table', 'rho', 'scout+orb'],
      ['Risks & red flags', 'paper', 'critic'],
      ['Thesis & decision', 'signal', 'orb'],
      ['Open questions for founders', 'paper', 'critic+orb'],
    ]);
    for (const f of vc.frames) {
      expect(f.brief.length).toBeGreaterThan(60);
      expect(f.targets.length).toBeGreaterThan(0);
    }
  });

  it('has the intake fields of the spec with the right required flags', () => {
    const byId = Object.fromEntries(vc.inputs.map((f) => [f.id, f]));
    expect(vc.inputs.map((f) => f.id)).toEqual([
      'company',
      'website',
      'stage',
      'round_amount',
      'round_valuation',
      'round_lead',
      'sector',
      'geography',
      'thesis',
      'concerns',
      'founders',
      'competitors',
      'materials',
      'depth',
      'sites',
    ]);
    expect(vc.inputs.filter((f) => f.required).map((f) => f.id)).toEqual(['company', 'website', 'depth']);
    expect(byId.stage!.options).toEqual(['Pre-seed', 'Seed', 'Series A', 'Series B', 'Series C+', 'Growth']);
    expect(byId.sites!.sites!.map((s) => s.label)).toEqual([
      'Crunchbase',
      'PitchBook',
      'LinkedIn',
      'DocSend',
    ]);
  });

  it('has the eight databases the spec names, with its columns', () => {
    const db = Object.fromEntries(vc.databases.map((d) => [d.name, d.columns.map((c) => c.name)]));
    expect(db['Team']).toEqual([
      'Name',
      'Role',
      'Background',
      'Prior companies',
      'Prior exits',
      'Tenure (years)',
      'LinkedIn',
      'Source',
      'Flags',
    ]);
    expect(db['Market sizing inputs']).toEqual(['Assumption', 'Value', 'Unit', 'Source', 'Confidence']);
    expect(db['KPIs']).toEqual(['Metric', 'Value', 'Period', 'Basis', 'Source', 'Note']);
    expect(db['Customers']).toEqual(['Name', 'Segment', 'Size', 'Since', 'Source', 'Quote']);
    expect(db['Competitors']).toEqual([
      'Name',
      'URL',
      'Category',
      'HQ',
      'Founded',
      'Total funding',
      'Last round',
      'Headcount',
      'Pricing',
      'Key differentiator',
      'Threat level',
      'Source',
    ]);
    expect(db['Funding rounds']).toEqual([
      'Round',
      'Date',
      'Amount',
      'Pre-money valuation',
      'Post-money valuation',
      'Lead',
      'Participants',
      'Source',
    ]);
    expect(db['Comparable valuations']).toEqual([
      'Company',
      'Round',
      'Valuation',
      'Revenue multiple',
      'Date',
      'Source',
    ]);
    // Every database has a seed card in its frame, and at least one view.
    for (const d of vc.databases) {
      const frame = vc.frames.find((f) => f.id === d.frame)!;
      expect(frame.seeds.some((s) => s.type === 'database' && s.db === d.key)).toBe(true);
      expect(d.views.length).toBeGreaterThan(0);
    }
  });

  it('has the 15 red flags and the rubric of the spec (weights add up to 100)', () => {
    expect(vc.redFlags).toHaveLength(15);
    expect(vc.redFlags.map((f) => f.id)).toEqual(
      Array.from({ length: 15 }, (_, i) => `RF${String(i + 1).padStart(2, '0')}`),
    );
    expect(vc.rubric.map((d) => [d.name, d.weight])).toEqual([
      ['Team', 25],
      ['Market', 20],
      ['Product & moat', 15],
      ['Traction', 20],
      ['Business model', 10],
      ['Deal', 10],
    ]);
    expect(vc.rubric.reduce((a, d) => a + d.weight, 0)).toBe(100);
    for (const d of vc.rubric) expect(Object.keys(d.anchors)).toEqual(['1', '3', '5']);
    // The red-flag checklist seed holds every flag.
    const risks = vc.frames.find((f) => f.id === 'risks')!;
    const list = risks.seeds.find((s) => s.type === 'checklist')!.data as { items: { text: string }[] };
    expect(list.items).toHaveLength(15);
  });

  it('has the memo outline, the one-pager, the deck format, the tiers and the six follow-ups', () => {
    expect(vc.output.sections.map((s) => s.title)).toEqual([
      'Summary & recommendation',
      'Company snapshot',
      'Team',
      'Problem & product',
      'Market',
      'Traction & metrics',
      'Customers & signals',
      'Competition',
      'Business model & GTM',
      'Financing & valuation',
      'Risks & mitigants',
      'Investment thesis: bull vs bear',
      'Scorecard',
      'Open questions / next steps',
    ]);
    expect(vc.output.sections[0]!.words).toBe(150);
    expect(vc.output.appendix).toBe('All sources');
    expect(vc.output.deckFormat).toBe('vc-ic');
    expect(DEPTHS.map((d) => vc.tiers[d].label)).toEqual(['Quick scan', 'Standard', 'Deep']);
    expect(vc.followUps.map((f) => f.label)).toEqual([
      'Go deeper on competitor X',
      'Build the bear case',
      'Draft the founder call agenda',
      'Compare to [portfolio company]',
      'Update with the new deck',
      'Re-score after the call notes',
    ]);
  });

  it('covers every frame in the memo, the rubric and the plan references', () => {
    const ids = new Set(vc.frames.map((f) => f.id));
    for (const s of vc.output.sections) for (const f of s.frames) expect(ids.has(f)).toBe(true);
    for (const d of vc.rubric) expect(ids.has(d.frame)).toBe(true);
    for (const role of ['orb', 'scout', 'critic', 'builder'] as const)
      for (const step of vc.plan[role]) for (const f of step.frames) expect(ids.has(f)).toBe(true);
    // Every owner of a frame has a playbook step for it or owns it by role (Orb owns the snapshot and thesis).
    for (const f of vc.frames)
      for (const owner of f.owners.filter((o) => o !== 'orb'))
        expect(
          vc.plan[owner].some((s) => s.frames.includes(f.id)),
          `${owner} has no step for ${f.id}`,
        ).toBe(true);
  });
});

describe('card types', () => {
  it('every frame target and every seed type can be placed by an owner of the frame (or is seeded)', () => {
    for (const f of vc.frames)
      for (const t of f.targets) {
        const seeded = f.seeds.some((s) => s.type === t.type);
        const placeable = f.owners.some((o) => PLACEABLE_TYPES[o].includes(t.type));
        expect(seeded || placeable, `${f.id}: ${t.type} (owners ${f.owners.join(', ')})`).toBe(true);
      }
  });

  it('the playbook never has an agent place a card type its role may not', () => {
    // Critic: clears with an insight and raises with a risk; it never places a doc.
    const critic = vc.plan.critic.map((s) => s.text).join(' ');
    expect(critic).not.toMatch(/\bdoc card\b/);
    expect(PLACEABLE_TYPES.critic).toEqual(expect.arrayContaining(['risk', 'insight', 'question']));
  });
});

describe('the agent plan', () => {
  it("references only tools in the role's allow-list", () => {
    expect(planToolViolations(vc)).toEqual([]);
    for (const role of ['orb', 'scout', 'critic', 'builder'] as const)
      for (const step of vc.plan[role])
        for (const tool of step.tools) expect(AGENT_TOOLS[role]).toContain(tool);
  });

  it('uses Parallel where it fits: find_entities, batch_enrich, deep_research (Scout), a monitor on request (Orb)', () => {
    const scout = vc.plan.scout.flatMap((s) => s.tools);
    for (const t of ['find_entities', 'batch_enrich', 'deep_research', 'capture_page', 'fetch_signed_in'])
      expect(scout).toContain(t);
    expect(vc.plan.orb.flatMap((s) => s.tools)).toContain('watch_topic');
  });

  it('gives Scout the eight steps of the spec in order', () => {
    expect(vc.plan.scout.map((s) => s.id)).toEqual([
      'company-site',
      'founders',
      'funding',
      'competitors',
      'market',
      'reviews',
      'timeline',
      'deep',
    ]);
    expect(vc.plan.scout.find((s) => s.id === 'deep')!.askAboveUsd).toBe(0.5);
  });

  it('filters the steps by tier', () => {
    const q = stepsFor(vc, 'scout', 'quick').map((s) => s.id);
    expect(q).not.toContain('deep');
    expect(q).toContain('competitors'); // runs on Quick too: the tier gate refuses find_entities there
    expect(stepsFor(vc, 'scout', 'standard').map((s) => s.id)).toContain('deep');
    expect(stepsFor(vc, 'orb', 'quick').map((s) => s.id)).not.toContain('gaps');
    expect(stepsFor(vc, 'orb', 'deep').map((s) => s.id)).toContain('monitor');
  });
});

describe('seed cards', () => {
  it('are valid card data of their type once their tokens are filled', () => {
    const answers = { company: 'Acme', website: 'https://acme.com', year: '2026', date: '2026-10-15' };
    for (const f of vc.frames)
      for (const s of f.seeds) {
        if (s.type === 'database' || s.type === 'chart') continue; // built from their dataset by the canvas service
        const data = JSON.parse(fillTokens(JSON.stringify(s.data), answers));
        const parsed = cardDataSchema(s.type).safeParse(data);
        expect(parsed.success, `${f.id}/${s.type}: ${JSON.stringify(parsed.error?.issues[0])}`).toBe(true);
      }
  });

  it('name a database that exists, and a chart that is bound to one', () => {
    const keys = new Set(vc.databases.map((d) => d.key));
    for (const f of vc.frames)
      for (const s of f.seeds)
        if (s.type === 'database' || s.type === 'chart') expect(keys.has(s.db ?? '')).toBe(true);
  });
});

describe('intake validation', () => {
  const ok = {
    company: 'Acme Robotics',
    website: 'acme.com',
    depth: 'deep',
    stage: 'Seed',
    sites: ['crunchbase.com'],
    founders: 'Ada Lovelace, https://linkedin.com/in/ada',
  };

  it('accepts a complete form, normalises the website and reads the depth', () => {
    const r = validateIntake(vc.inputs, ok);
    expect(r.ok).toBe(true);
    expect(r.answers).toMatchObject({
      company: 'Acme Robotics',
      website: 'https://acme.com',
      stage: 'Seed',
      sites: ['crunchbase.com'],
      depth: 'deep',
    });
    expect(r.depth).toBe('deep');
  });

  it('requires the company and the website, and says which', () => {
    const r = validateIntake(vc.inputs, { company: ' ', depth: 'standard' });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['company', 'website']);
  });

  it('refuses a bad website, a stage that is not an option, a bad depth and a founder link that is not a URL', () => {
    const r = validateIntake(vc.inputs, {
      ...ok,
      website: 'not a url',
      stage: 'Series Z',
      depth: 'epic',
      founders: 'Ada, https://nope',
    });
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['depth', 'founders', 'stage', 'website']);
  });

  it("refuses text over a field's limit and drops unknown fields and empty optional ones", () => {
    expect(validateIntake(vc.inputs, { ...ok, company: 'x'.repeat(121) }).errors.company).toMatch(
      /longer than 120/,
    );
    const r = validateIntake(vc.inputs, { ...ok, nonsense: 'x', thesis: '   ' });
    expect(r.answers).not.toHaveProperty('nonsense');
    expect(r.answers).not.toHaveProperty('thesis');
  });

  it('defaults the depth to standard', () => {
    expect(validateIntake(vc.inputs, { company: 'A', website: 'https://a.com' }).depth).toBe('standard');
  });

  it('normalises URLs', () => {
    expect(normalizeUrl('acme.com')).toBe('https://acme.com');
    expect(normalizeUrl('https://acme.com/about')).toBe('https://acme.com/about');
    expect(normalizeUrl('ftp://acme.com')).toBeUndefined();
    expect(normalizeUrl('acme')).toBeUndefined();
    expect(normalizeUrl('a b.com')).toBeUndefined();
  });
});

describe('the injected playbook', () => {
  it('keeps anchored assessment separate from evidence confidence and permits explained unknown scores', () => {
    for (const role of ['orb', 'critic'] as const) {
      const guide = playbookText({ spec: vc, role, answers: { company: 'Acme' }, boardFrames: [] });
      expect(guide).toContain('Keep evidence confidence separate');
      expect(guide).toContain('Leave an unsupported dimension null');
      expect(guide).toContain('optional Your score column belongs to the user');
    }
  });
  const answers = {
    company: 'Acme',
    website: 'https://acme.com',
    thesis: 'Robots for warehouses',
    sites: ['crunchbase.com'],
  };
  const boardFrames = vc.frames.map((f, i) => ({ id: `f_${i}`, title: f.title, number: i + 1 }));

  it('gives Scout its steps in order, its frames with briefs and targets, the tier and the ticked sites', () => {
    const text = playbookText({ spec: vc, role: 'scout', depth: 'standard', answers, boardFrames });
    expect(text).toContain('Company name: Acme');
    expect(text).toContain('Your playbook, in this order:');
    const at = (needle: string) => text.indexOf(needle, text.indexOf('Your playbook'));
    expect(at('The company site:')).toBeLessThan(at('Founders: start from'));
    expect(at('Founders: start from')).toBeLessThan(at('Funding history: Crunchbase'));
    expect(at('Funding history: Crunchbase')).toBeLessThan(at('Competitors: add the known competitors'));
    expect(text).toContain('"Founders & team" [f_1]');
    expect(text).toContain('Target mix:');
    expect(text).toContain('Depth: Standard');
    expect(text).toContain('crunchbase.com');
    expect(text).not.toContain('The red-flag checklist'); // Critic's
    expect(text).not.toContain('The rubric'); // Orb's
  });

  it('gives Critic the red-flag checklist, Orb the rubric and the memo, Builder only its frames', () => {
    const critic = playbookText({ spec: vc, role: 'critic', depth: 'standard', answers, boardFrames });
    for (const f of vc.redFlags) expect(critic).toContain(f.id);
    const orb = playbookText({ spec: vc, role: 'orb', depth: 'standard', answers, boardFrames });
    expect(orb).toContain('Team (25%)');
    expect(orb).toContain('Investment memo: Acme');
    expect(orb).toContain('14. Open questions / next steps');
    expect(orb).toContain('deck format is vc-ic');
    const builder = playbookText({ spec: vc, role: 'builder', depth: 'standard', answers, boardFrames });
    expect(builder).not.toContain('"Founders & team"'); // Builder does not own it
    expect(builder).toContain('"Problem & product"');
  });

  it('states the tier: Quick forbids deep research, Deep allows pro and ultra', () => {
    expect(playbookText({ spec: vc, role: 'scout', depth: 'quick', answers, boardFrames })).toMatch(
      /refused/,
    );
    expect(playbookText({ spec: vc, role: 'scout', depth: 'deep', answers, boardFrames })).toContain(
      'pro, ultra',
    );
  });

  it('lists the intake lines that were given', () => {
    expect(intakeLines(vc, answers)).toEqual([
      '- Company name: Acme',
      '- Website URL: https://acme.com',
      '- Your thesis or angle:',
      '    Robots for warehouses',
      '- Signed-in sources to use: crunchbase.com',
    ]);
  });

  it('fills the follow-up chips with the company and leaves [brackets] for the user', () => {
    const chips = followUpChips(vc, { company: 'Acme' });
    expect(chips.find((c) => c.label === 'Build the bear case')!.prompt).toContain('Acme');
    expect(chips.find((c) => c.label === 'Compare to [portfolio company]')!.prompt).toContain(
      '[portfolio company]',
    );
  });
});

describe('the cost guard (depth tiers)', () => {
  it('refuses the costly Parallel tools on Quick, with a message the agent can act on', () => {
    for (const tool of ['deep_research', 'batch_enrich', 'find_entities', 'find_entities_extend'])
      expect(tierGate(vc, 'quick', tool)).toMatch(/Quick scan depth tier/);
    expect(tierGate(vc, 'quick', 'parallel_extract')).toBeUndefined();
    expect(tierGate(vc, 'quick', 'web_answer')).toBeUndefined();
  });

  it('on Standard allows enrichment and core research, refuses pro, ultra and FindAll extension', () => {
    expect(tierGate(vc, 'standard', 'batch_enrich')).toBeUndefined();
    expect(tierGate(vc, 'standard', 'find_entities')).toBeUndefined();
    expect(tierGate(vc, 'standard', 'deep_research', { processor: 'core' })).toBeUndefined();
    expect(tierGate(vc, 'standard', 'deep_research', { processor: 'pro' })).toMatch(/lite, base, core/);
    expect(tierGate(vc, 'standard', 'deep_research', { processor: 'ultra' })).toMatch(/not ultra/);
    expect(tierGate(vc, 'standard', 'find_entities_extend')).toMatch(/does not allow/);
  });

  it('on Deep allows pro and ultra, and refuses an unknown processor', () => {
    expect(tierGate(vc, 'deep', 'deep_research', { processor: 'ultra' })).toBeUndefined();
    expect(tierGate(vc, 'deep', 'find_entities_extend')).toBeUndefined();
    expect(tierGate(vc, 'deep', 'deep_research', { processor: 'ultra8x' })).toMatch(/not ultra8x/);
  });

  it("defaults a deep_research without a processor to pro (the tool's default)", () => {
    expect(tierGate(vc, 'standard', 'deep_research', {})).toMatch(/not pro/);
  });
});

describe('Home frames', () => {
  it("v2 frames are wide, three to a row, in the spec's order", () => {
    const frames = templateFrames('vc-dd');
    expect(frames).toHaveLength(12);
    expect(frames.map((f) => f.title)).toEqual(vc.frames.map((f) => f.title));
    expect(new Set(frames.map((f) => f.y)).size).toBe(4);
    expect(frames[0]!.w).toBeGreaterThan(500);
  });
});

describe('docs/templates/<id>.md', () => {
  it('is the generated human-readable spec (run `pnpm templates:docs` after changing a template)', () => {
    for (const spec of TEMPLATE_SPECS) {
      const file = join(import.meta.dirname, '..', '..', '..', 'docs', 'templates', `${spec.id}.md`);
      expect(readFileSync(file, 'utf8')).toBe(templateMarkdown(spec));
    }
  });

  it('names every frame, database, red flag and rubric dimension', () => {
    const md = templateMarkdown(vc);
    for (const f of vc.frames) expect(md).toContain(f.title.toUpperCase());
    for (const d of vc.databases) expect(md).toContain(`### ${d.name}`);
    for (const f of vc.redFlags) expect(md).toContain(f.text);
    for (const d of vc.rubric) expect(md).toContain(d.name);
    for (const s of vc.output.sections) expect(md).toContain(s.title);
  });
});
