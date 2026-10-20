/**
 * The human-readable spec of a v2 template (`docs/templates/<id>.md`), generated from the template itself so the two
 * cannot drift (`pnpm templates:docs` writes them; a test compares). Raw `{{field}}` tokens are kept as written.
 */
import { DEPTHS, type TemplateSpecV2 } from './schema.js';

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function templateMarkdown(spec: TemplateSpecV2): string {
  const L: string[] = [];
  const w = (...lines: string[]) => L.push(...lines);

  w(
    `# ${spec.label}`,
    '',
    '<!-- Generated from packages/shared/src/templates/' +
      spec.id +
      '.ts by `pnpm templates:docs`. Do not edit by hand. -->',
    '',
  );
  w(spec.brief, '');
  w(`Template id \`${spec.id}\`. Canvas title: \`${spec.titleFrom}\`.`, '');

  w(
    '## Intake form',
    '',
    'Shown on Home when the chip is picked.',
    '',
    '| Field | Kind | Required | Notes |',
    '|---|---|---|---|',
  );
  for (const f of spec.inputs) {
    const notes = [
      f.placeholder ? `placeholder "${f.placeholder}"` : '',
      f.options ? `one of ${f.options.join(', ')}` : '',
      f.sites ? `sites ${f.sites.map((s) => s.label).join(', ')}` : '',
      f.help ?? '',
    ]
      .filter(Boolean)
      .join('. ');
    w(`| ${cell(f.label)} (\`${f.id}\`) | ${f.kind} | ${f.required ? 'yes' : 'no'} | ${cell(notes)} |`);
  }
  w('');

  w(
    '## Depth tiers',
    '',
    '| Tier | Time | Cost | Parallel | Deep runs | Cards per frame | Memo |',
    '|---|---|---|---|---|---|---|',
  );
  for (const d of DEPTHS) {
    const t = spec.tiers[d];
    w(
      `| ${t.label} | ${t.time} | ${t.cost} | ${cell(t.parallelTools.join(', ') || 'none')} | ${t.deepRuns} | ${t.cardsPerFrame ?? 'no limit'} | ${t.memo} |`,
    );
  }
  w('');
  for (const d of DEPTHS) w(`- **${spec.tiers[d].label}:** ${spec.tiers[d].summary}`);
  w(
    '',
    "orb asks the user before any run over its tier's ceiling; a tool the tier does not allow is refused with a message to the agent.",
    '',
  );

  w('## Frames');
  spec.frames.forEach((f, i) => {
    w(
      '',
      `### ${String(i + 1).padStart(2, '0')} ${f.title.toUpperCase()} (${f.color}; ${f.owners.join(', ')})`,
      '',
      `Brief: ${f.brief}`,
      '',
    );
    if (f.targets.length)
      w(
        `Target: ${f.targets.map((t) => `${t.min}+ ${t.type}${t.note ? ` (${t.note})` : ''}`).join('; ')}.`,
        '',
      );
    if (f.seeds.length) {
      w('Seed cards:');
      for (const s of f.seeds) {
        const title = typeof s.data.title === 'string' ? s.data.title : (s.db ?? '');
        w(`- ${s.type}: ${title}${s.db ? ` (database \`${s.db}\`)` : ''}`);
      }
    }
  });
  w('');

  w('## Databases');
  for (const d of spec.databases) {
    w(
      '',
      `### ${d.name} (frame \`${d.frame}\`)`,
      '',
      d.purpose,
      '',
      '| Column | Type | Notes |',
      '|---|---|---|',
    );
    for (const c of d.columns)
      w(
        `| ${cell(c.name)} | ${c.type}${c.options ? ` (${c.options.join(', ')})` : ''} | ${cell(c.note ?? '')} |`,
      );
    w(
      '',
      `Views: ${d.views.map((v) => `${v.name} (${v.kind}${v.group ? `, by ${v.group}` : ''}${v.sort ? `, sorted by ${v.sort.map((s) => `${s.column} ${s.dir}`).join(', ')}` : ''}${v.filter ? ', filtered' : ''})`).join('; ')}.`,
    );
  }
  w('');

  w('## Agent playbook', '', "Injected into each agent's first assignment, not its persona.");
  for (const role of ['orb', 'scout', 'critic', 'builder'] as const) {
    w('', `### ${role === 'orb' ? 'orb' : role[0]!.toUpperCase() + role.slice(1)}`, '');
    spec.plan[role].forEach((s, i) => {
      w(
        `${i + 1}. ${s.text}${s.minTier !== 'quick' ? ` *(from the ${s.minTier} tier)*` : ''}${s.askAboveUsd ? ` Ask before spend over $${s.askAboveUsd.toFixed(2)}.` : ''} Tools: ${s.tools.map((t) => `\`${t}\``).join(', ')}.`,
      );
    });
  }
  w('');

  if (spec.redFlags.length) {
    w('## Red-flag checklist', '', 'Critic clears (with a source) or raises each one.', '');
    for (const f of spec.redFlags) w(`${Number(f.id.slice(2))}. ${f.text} *How:* ${f.check}`);
    w('');
  }
  if (spec.rubric.length) {
    w('## Scoring rubric', '', '| Dimension | Weight | 1 | 3 | 5 | Frame |', '|---|---|---|---|---|---|');
    for (const d of spec.rubric)
      w(
        `| ${d.name} | ${d.weight}% | ${cell(d.anchors[1])} | ${cell(d.anchors[3])} | ${cell(d.anchors[5])} | ${d.frame} |`,
      );
    w(
      '',
      'orb fills each score with at least one cited card; the user can override; the weighted total goes on the Decision card.',
      '',
    );
  }

  w('## Output', '', `Memo: ${spec.output.memoTitle}. ${spec.output.citationRule}`, '');
  spec.output.sections.forEach((s, i) =>
    w(`${i + 1}. ${s.title}${s.words ? ` (at most ${s.words} words)` : ''}: ${s.guidance}`),
  );
  w(
    '',
    `Appendix: ${spec.output.appendix}.`,
    '',
    `One-page summary: ${spec.output.onePager.includes.join(', ')}.`,
    '',
    `Deck format: \`${spec.output.deckFormat}\`.`,
    '',
  );
  if (spec.output.deck) {
    w(`Deck: ${spec.output.deck.title}. Slides, in order:`, '');
    spec.output.deck.slides.forEach((s, i) => w(`${i + 1}. ${s.title}: ${s.brief}`));
    w('');
  }

  w('## Follow-up chips', '', 'Shown after the first pass.', '');
  for (const f of spec.followUps) w(`- ${f.label}: ${f.prompt}`);
  w('');

  if (spec.signedIn.length) {
    w('## Signed-in sources', '');
    for (const s of spec.signedIn) w(`- ${s.label} (${s.domain}): ${s.use}`);
    w('');
  }
  if (spec.monitor)
    w('## Monitor', '', `Only when the user asks: \`${spec.monitor.query}\`. ${spec.monitor.why}`, '');
  return (
    L.join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trimEnd() + '\n'
  );
}
