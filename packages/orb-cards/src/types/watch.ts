/**
 * Watch (P6.7): a Parallel Monitor on a topic. It runs on Parallel's servers on a schedule, costs money on every
 * check and only the user's OK starts it. orb pulls its events when it is open; each event is also a card.
 */
import { WatchData, readCardData } from '@orb/shared';
import { DESCRIBE_MAX, clip } from '../describe.js';
import type { CardTypeSpec } from '../spec.js';

export const watch: CardTypeSpec<'watch'> = {
  type: 'watch',
  purpose:
    'A Parallel monitor that watches a topic over time. Started with watch_topic (only when the user asks), read with watch_events, ended with stop_watch.',
  origin: 'fetched',
  describe(data) {
    const d = readCardData(WatchData, data);
    if (!d) return 'Watch.';
    const parts = [`Watch "${d.title}" (${d.frequency}${d.processor ? `, ${d.processor}` : ''}): ${d.status.replace('_', ' ')}`];
    if (d.monitorId) parts.push(`monitor ${d.monitorId}`);
    if (d.eventCount !== undefined) parts.push(`${d.eventCount} event(s)`);
    const latest = d.events?.[0]?.summary;
    return clip(`${parts.join('; ')}.${latest ? ` Latest: ${latest}` : ''}`, DESCRIBE_MAX);
  },
};
