/** Research pacing at the public tool and compaction seams. Never edits a harness log directly. */
import { toolPairingBalancedAfter, toolPairingBalancedBefore } from '@deepseek-ai/dsh-compaction';

export const RESEARCH_CONTEXT_TOKENS = 64_000;
export const RESEARCH_TAIL_TOKENS = 12_000;

/** Give each checkpoint field its own budget: a long template or conversation must not displace the intake or gaps. */
export function researchCheckpoint(input: {
  request: string;
  intake: Record<string, unknown>;
  role: string;
  frameIds: string[];
  assignment?: string;
  gaps: { frameId: string; title: string; reasons: string[] }[];
}): string {
  const bounded = (text: string, limit: number) =>
    text.length <= limit
      ? text
      : `${text.slice(0, limit / 2 - 30)}\n[Earlier context abbreviated; latest constraints follow.]\n${text.slice(-limit / 2 + 30)}`;
  return [
    'Continue the research from the durable checkpoint. Reuse existing cards, rows and source evidence; do not restart.',
    `Current user request: ${bounded(input.request, 3500)}`,
    `Saved intake: ${bounded(JSON.stringify(input.intake), 2500)}`,
    `Your role: ${input.role}. Assigned frames: ${bounded(input.frameIds.join(', ') || 'the requested board', 800)}.`,
    ...(input.assignment ? [`Latest assignment: ${bounded(input.assignment, 900)}`] : []),
    `Unfinished frames: ${bounded(input.gaps.map((g) => `${g.title} [${g.frameId}]: ${g.reasons.join(' ').slice(0, 300)}`).join('\n') || 'No structural content gaps; finish current reviews and requested deliverables. Keep genuine unavailable/private/future inputs explicitly qualified; a provisional research output does not require booking confirmation, live quotes or user actions.', 3300)}`,
    'Work in batches on the next unfinished frame, save useful findings, then proceed. Scout owns evidence and datasets; orb owns assessment seeds and synthesis. Wait for active children by ending your pass; their completion wakes orb.',
  ].join('\n');
}

/** Keep the system prefix and a recent, tool-balanced tail; durable compaction owns the actual replacement. */
export function researchCompactRange(
  session: any,
  measurement: { nodes: readonly { seq: any; tokens: number }[] },
  balancedBefore = toolPairingBalancedBefore,
  balancedAfter = toolPairingBalancedAfter,
): { start: any; end: any } | undefined {
  const nodes = measurement.nodes;
  if (
    nodes.length < 4 ||
    session.surface.nodes.some((s: unknown, i: number) => s !== nodes[i]?.seq) ||
    session.surface.nodes.length !== nodes.length
  )
    return;
  const first = session.eventAt(nodes[0]!.seq)?.type === 'system/message' ? 1 : 0;
  let tail = nodes.length;
  let tokens = 0;
  while (tail > first && tokens < RESEARCH_TAIL_TOKENS) tokens += nodes[--tail]!.tokens;
  while (tail > first && !balancedBefore(session, nodes[tail]!.seq)) tail--;
  if (tail <= first + 1 || !balancedAfter(session, nodes[tail - 1]!.seq)) return;
  return { start: nodes[first]!.seq, end: nodes[tail - 1]!.seq };
}

const READS = new Set([
  'board_map',
  'query_board',
  'query_dataset',
  'read_card',
  'read_source',
  'search_board',
]);
const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );

/** Only successful reads are remembered. A write, new turn or compaction makes them eligible to run again. */
export class ResearchReads {
  private readonly entries = new Map<
    string,
    { revision: number | string; callId: string; repeats: number }
  >();
  clear(): void {
    this.entries.clear();
  }
  key(name: string, args: unknown): string | undefined {
    return READS.has(name) ? `${name}:${stable(args)}` : undefined;
  }
  repeated(key: string, revision: number | string): { callId: string; repeats: number } | undefined {
    const last = this.entries.get(key);
    if (!last || last.revision !== revision) return;
    return { callId: last.callId, repeats: ++last.repeats };
  }
  remember(key: string, revision: number | string, callId: string): void {
    if (this.entries.size >= 100) this.entries.delete(this.entries.keys().next().value!);
    this.entries.set(key, { revision, callId, repeats: 0 });
  }
}
