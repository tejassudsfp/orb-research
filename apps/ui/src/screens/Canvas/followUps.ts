/**
 * P6.11: the follow-up chips of a v2 template ("Build the bear case", "Draft the founder call agenda"...), shown in the
 * conversation panel once the first pass is done: every agent is idle and the agents have put a real body of work on
 * the board (more than the template's seed cards). A chip fills the message box; the user edits any [bracket] and sends.
 */
import {
  followUpChips,
  specOf,
  type AgentStatus,
  type AgentName,
  type BoardState,
  type CanvasMeta,
  type FollowUp,
} from '@orb/shared';

/** Cards by an agent (not the seeds) the board needs before the first pass counts as done. */
export const FIRST_PASS_CARDS = 8;

const busy = (st: AgentStatus | undefined) => st?.state === 'running' || st?.state === 'stopping';

export function firstPassDone(
  board: BoardState,
  team: Partial<Record<AgentName, AgentStatus>>,
  orb?: AgentStatus,
): boolean {
  if (busy(orb) || Object.values(team).some(busy)) return false;
  const made = Object.values(board.cards).filter(
    (c) => c.provenance.kind === 'agent' && !c.stackedInto,
  ).length;
  return made >= FIRST_PASS_CARDS;
}

export function followUpsFor(
  meta: Pick<CanvasMeta, 'template' | 'intake'> | undefined,
  board: BoardState,
  team: Partial<Record<AgentName, AgentStatus>>,
  orb?: AgentStatus,
): FollowUp[] {
  const spec = specOf(meta?.template);
  if (!spec || !firstPassDone(board, team, orb)) return [];
  return followUpChips(spec, meta?.intake ?? {});
}
