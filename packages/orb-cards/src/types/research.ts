/**
 * Research run (P6.7): a Parallel Task, Task Group or FindAll run on the board: live progress, then the cited result.
 * Written by the orb-canvas Parallel service when an agent starts a run (`deep_research`, `batch_enrich`,
 * `find_entities`); agents do not place or edit it. They read it with `query_board` and `research_status`.
 */
import { ResearchData, readCardData } from '@orb/shared';
import { DESCRIBE_MAX, clip } from '../describe.js';
import type { CardTypeSpec } from '../spec.js';

export const research: CardTypeSpec<'research'> = {
  type: 'research',
  purpose:
    'A Parallel research run (deep research, batch enrichment or an entity search): live progress, then the cited result. Started with deep_research, batch_enrich or find_entities; read it with research_status.',
  origin: 'fetched',
  describe(data) {
    const d = readCardData(ResearchData, data);
    if (!d) return 'Research run.';
    const parts = [`Research run "${d.title}" (${d.kind}${d.processor ? `, ${d.processor}` : ''}): ${d.status.replace('_', ' ')}`];
    if (d.runId) parts.push(`run ${d.runId}`);
    if (d.progress !== undefined && d.status === 'running') parts.push(`${Math.round(d.progress)}%`);
    if (d.total !== undefined) parts.push(`${d.done ?? 0}/${d.total} rows`);
    if (d.matched !== undefined) parts.push(`${d.matched} matched`);
    if (d.datasetId) parts.push(`dataset ${d.datasetId}`);
    if (d.error) parts.push(`error: ${d.error}`);
    const head = parts.join('; ') + '.';
    return clip(d.summary ? `${head} ${d.summary}` : head, DESCRIBE_MAX);
  },
};
