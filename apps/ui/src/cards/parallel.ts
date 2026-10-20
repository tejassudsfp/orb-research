/** P6.7: plain-text helpers shared by the Research run card, the Watch card and the conversation panel prompt. */
import type { ResearchData, ResearchStatus, WatchData } from '@orb/shared';

export const usd = (n: number | undefined): string =>
  n === undefined ? '' : n < 0.01 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;

const KIND: Record<ResearchData['kind'], string> = {
  deep_research: 'Deep research',
  batch_enrich: 'Batch enrichment',
  find_entities: 'Entity search',
};
export const researchKindLabel = (kind: ResearchData['kind']): string => KIND[kind];

const STATUS: Record<ResearchStatus, string> = {
  awaiting_approval: 'Needs your OK',
  queued: 'Queued',
  running: 'Researching',
  completed: 'Done',
  failed: 'Failed',
  detached: 'Detached',
  declined: 'Declined',
  cancelled: 'Cancelled',
};
export const researchStatusLabel = (status: ResearchStatus): string => STATUS[status];

/** One line of live state: "Researching 42% · 12 sources read", "Batch 3 / 10 rows", "7 matched of 31 checked". */
export function researchLine(d: ResearchData): string {
  const parts: string[] = [researchStatusLabel(d.status)];
  const active = d.status === 'running' || d.status === 'queued' || d.status === 'detached';
  if (d.status === 'running' && d.progress !== undefined) parts[0] += ` ${Math.round(d.progress)}%`;
  if (d.kind === 'batch_enrich' && d.total !== undefined) parts.push(`${d.done ?? 0} / ${d.total} rows`);
  if (d.kind === 'find_entities' && (d.matched !== undefined || d.generated !== undefined))
    parts.push(`${d.matched ?? 0} matched of ${d.generated ?? 0} checked`);
  if (d.sourcesRead !== undefined && (active || d.status === 'completed')) parts.push(`${d.sourcesRead} sources read`);
  if (d.processor) parts.push(d.processor);
  return parts.join(' · ');
}

export function watchLine(d: WatchData): string {
  const parts: string[] = [d.status === 'active' ? `Watching ${d.frequency}` : d.status.replace('_', ' ')];
  if (d.eventCount !== undefined) parts.push(`${d.eventCount} event${d.eventCount === 1 ? '' : 's'}`);
  if (d.monthlyUsd !== undefined) parts.push(`~${usd(d.monthlyUsd)} / month`);
  return parts.join(' · ');
}
