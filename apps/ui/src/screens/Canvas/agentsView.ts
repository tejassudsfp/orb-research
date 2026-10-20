/**
 * Pure helpers for the agent UI (P3.6): the team's colours, the "On the board" activity lines of a time window, and
 * where each agent's cursor sits on the board. DOM-free (unit-tested in apps/ui/test/agentsView.unit.test.ts).
 */
import {
  AGENT_LABELS,
  boardFrames,
  cardTitle,
  type AgentName,
  type AgentStatus,
  type BoardState,
  type Card,
  type CardType,
  type Frame,
} from '@orb/shared';

/** Agent colours (PRD Agents; design/screens/canvas.html cursors and avatars). */
export const AGENT_COLORS: Record<AgentName, { bg: string; fg: string; letter: string }> = {
  orb: { bg: '#3D5DCF', fg: '#F9FCFE', letter: 'O' },
  scout: { bg: '#60A5FA', fg: '#03050C', letter: 'S' },
  critic: { bg: '#F9FCFE', fg: '#11171D', letter: 'C' },
  builder: { bg: '#2563EB', fg: '#F9FCFE', letter: 'B' },
};

export const TEAM: readonly AgentName[] = ['scout', 'critic', 'builder'];
export const ALL_AGENTS: readonly AgentName[] = ['orb', 'scout', 'critic', 'builder'];

const PLURAL: Record<CardType, [string, string]> = {
  note: ['a note', 'notes'],
  source: ['a source', 'sources'],
  quote: ['a quote', 'quotes'],
  image: ['an image', 'images'],
  file: ['a file', 'files'],
  question: ['a question', 'questions'],
  risk: ['a risk', 'risks'],
  design: ['a design frame', 'design frames'],
  diagram: ['a diagram', 'diagrams'],
  table: ['a table', 'tables'],
  doc: ['a doc draft', 'doc drafts'],
  database: ['a database', 'databases'],
  chart: ['a chart', 'charts'],
  metric: ['a metric', 'metrics'],
  timeline: ['a timeline', 'timelines'],
  matrix: ['a comparison matrix', 'comparison matrices'],
  insight: ['an insight', 'insights'],
  hypothesis: ['a hypothesis', 'hypotheses'],
  decision: ['a decision', 'decisions'],
  framework: ['a framework', 'frameworks'],
  entity: ['a person or org', 'people and orgs'],
  product: ['a product', 'products'],
  video: ['a video', 'videos'],
  code: ['a code snippet', 'code snippets'],
  math: ['a formula', 'formulas'],
  checklist: ['a checklist', 'checklists'],
  research: ['a research run', 'research runs'],
  watch: ['a watch', 'watches'],
};

/** "a source", "2 sources", "3 cards" (mixed types). */
export function cardsPhrase(cards: readonly Pick<Card, 'type'>[]): string {
  const types = new Set(cards.map((c) => c.type));
  if (types.size === 1) {
    const [one, many] = PLURAL[cards[0]!.type];
    return cards.length === 1 ? one : `${cards.length} ${many}`;
  }
  return `${cards.length} cards`;
}

/** "01 Market" for a frame of the board. */
export function frameName(board: BoardState, frameId: string): string | undefined {
  const frames = boardFrames(board);
  const index = frames.findIndex((f) => f.id === frameId);
  return index < 0 ? undefined : `${String(index + 1).padStart(2, '0')} ${frames[index]!.title}`;
}

/** One "On the board" line: what one agent added in one place, with the ids it links to. */
export type ActivityLine = {
  key: string;
  agent: AgentName;
  text: string;
  /** Cards or frames the line links to (a link line names its two ends). */
  items: { id: string; title: string }[];
};

/**
 * What the agents put on the board between `from` (inclusive) and `to` (exclusive), ms: their cards grouped per
 * agent and frame ("Scout added 2 sources to 01 Market"), frames ("Orb added 4 frames") and links ("Critic drew a
 * tension link"), from the provenance of the board's items (so it survives a reopen). Stacked cards count under
 * their stack.
 */
export function activityBetween(board: BoardState, from: number, to: number): ActivityLine[] {
  const inWindow = (p: Card['provenance']) => p.kind === 'agent' && p.at >= from && p.at < to;
  const lines: ActivityLine[] = [];
  const byAgent = new Map<
    AgentName,
    {
      frames: Frame[];
      cards: Map<string, Card[]>;
      links: number;
      linkItems: { id: string; title: string }[];
      linkTypes: Set<string>;
      arranged: NonNullable<BoardState['arrangements']>;
    }
  >();
  const slot = (agent: AgentName) => {
    let s = byAgent.get(agent);
    if (!s)
      byAgent.set(
        agent,
        (s = { frames: [], cards: new Map(), links: 0, linkItems: [], linkTypes: new Set(), arranged: [] }),
      );
    return s;
  };
  for (const frame of boardFrames(board))
    if (frame.provenance.kind === 'agent' && inWindow(frame.provenance))
      slot(frame.provenance.agent).frames.push(frame);
  for (const card of Object.values(board.cards)) {
    if (card.provenance.kind !== 'agent' || !inWindow(card.provenance) || card.stackedInto) continue;
    const s = slot(card.provenance.agent);
    const key = card.frameId ?? '';
    s.cards.set(key, [...(s.cards.get(key) ?? []), card]);
  }
  for (const link of Object.values(board.links)) {
    if (link.provenance.kind !== 'agent' || !inWindow(link.provenance)) continue;
    // A thread's automatic link goes with its card.
    if (link.type === 'label' && link.label === 'thread') continue;
    const s = slot(link.provenance.agent);
    s.links++;
    s.linkTypes.add(link.type === 'label' ? (link.label ?? 'label') : link.type.replace('-', ' '));
    for (const end of [link.from, link.to]) {
      const card = board.cards[end];
      const frame = board.frames[end];
      const title = card ? cardTitle(card) : frame ? frame.title : undefined;
      if (title && !s.linkItems.some((i) => i.id === end)) s.linkItems.push({ id: end, title });
    }
  }
  // P6.8: an agent's rearrangements (move_card, arrange_frame, reorder_frames, tidy_board), from their records.
  for (const a of board.arrangements ?? []) if (a.at >= from && a.at < to) slot(a.by).arranged.push(a);
  for (const agent of ['orb', 'scout', 'critic', 'builder'] as const) {
    const s = byAgent.get(agent);
    if (!s) continue;
    const name = AGENT_LABELS[agent];
    s.arranged.forEach((a, i) =>
      lines.push({
        key: `${agent}:arranged:${a.at}:${i}`,
        agent,
        text: `${name} ${a.text}`,
        items: a.ids.slice(0, 6).flatMap((id) => {
          const card = board.cards[id];
          const frame = board.frames[id];
          const title = card ? cardTitle(card) : frame?.title;
          return title ? [{ id, title }] : [];
        }),
      }),
    );
    if (s.frames.length > 0)
      lines.push({
        key: `${agent}:frames`,
        agent,
        text: `${name} added ${s.frames.length === 1 ? 'a frame' : `${s.frames.length} frames`}`,
        items: s.frames.map((f) => ({ id: f.id, title: f.title })),
      });
    for (const [frameId, cards] of s.cards) {
      const where = frameId ? frameName(board, frameId) : undefined;
      lines.push({
        key: `${agent}:cards:${frameId}`,
        agent,
        text: `${name} added ${cardsPhrase(cards)}${where ? ` to ${where}` : ''}`,
        items: cards.map((c) => ({ id: c.id, title: cardTitle(c) })),
      });
    }
    if (s.links > 0) {
      const kind = s.linkTypes.size === 1 ? `${[...s.linkTypes][0]} ` : '';
      lines.push({
        key: `${agent}:links`,
        agent,
        text: `${name} drew ${s.links === 1 ? `a ${kind}link` : `${s.links} ${kind}links`}`,
        items: s.linkItems.slice(0, 6),
      });
    }
  }
  return lines;
}

/** An agent's live cursor on the board, in world coordinates. */
export type AgentCursor = {
  agent: AgentName;
  x: number;
  y: number;
  label: string;
  state: AgentStatus['state'];
  /** The frame (or card) it points at. */
  target: string;
};

const clip = (text: string, n = 42) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

/**
 * Where each agent's cursor is (PRD Agents › Cursors: "the cursor glides to the frame it is working in"):
 * - a child at the frame of its last `report_progress` / assignment (`agents.status` frameId), else at the frame of
 *   the last card it placed; shown while it is running, idle or paused (not once stopped);
 * - Orb only while it is running, at the frame of the last card or frame it added in this run.
 * Each agent has its own slot near the frame's top right, so cursors on one frame do not overlap.
 */
export function agentCursors(
  board: BoardState,
  statuses: Partial<Record<AgentName, AgentStatus>>,
): AgentCursor[] {
  const out: AgentCursor[] = [];
  ALL_AGENTS.forEach((agent, slot) => {
    const st = statuses[agent];
    if (!st) return;
    if (st.state === 'stopped' || st.state === 'stop-timeout' || st.state === 'stopping') return;
    if (agent === 'orb' && st.state !== 'running') return;
    let frame = st.frameId ? board.frames[st.frameId] : undefined;
    let card: Card | undefined;
    if (!frame) {
      const since = agent === 'orb' ? (st.at ?? 0) : 0;
      let latest: { at: number; frame?: Frame; card?: Card } | undefined;
      for (const c of Object.values(board.cards)) {
        if (
          c.provenance.kind !== 'agent' ||
          c.provenance.agent !== agent ||
          c.provenance.at < since ||
          c.stackedInto
        )
          continue;
        if (!latest || c.provenance.at >= latest.at) {
          const f = c.frameId ? board.frames[c.frameId] : undefined;
          latest = { at: c.provenance.at, ...(f ? { frame: f } : { card: c }) };
        }
      }
      if (agent === 'orb')
        for (const f of Object.values(board.frames))
          if (f.provenance.kind === 'agent' && f.provenance.agent === 'orb' && f.provenance.at >= since)
            if (!latest || f.provenance.at >= latest.at) latest = { at: f.provenance.at, frame: f };
      frame = latest?.frame;
      card = latest?.card;
    }
    if (!frame && !card) return;
    const name = AGENT_LABELS[agent];
    const label =
      st.state === 'running'
        ? `${name}, ${clip(st.label && st.label !== 'Idle' ? st.label.charAt(0).toLowerCase() + st.label.slice(1) : 'working')}`
        : st.state === 'paused'
          ? `${name}, paused`
          : name;
    const box = frame ?? card!;
    out.push({
      agent,
      x: box.x + Math.max(24, Math.min(box.w - 48, box.w * 0.55 + slot * 18)),
      y: box.y + (frame ? 18 + slot * 30 : -12 + slot * 24),
      label,
      state: st.state,
      target: box.id,
    });
  });
  return out;
}
