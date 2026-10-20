import type { AgentName, CardType } from './board.js';
import { placeableTypesOf } from './cardTypes.js';
import { PARALLEL_ORB_TOOL_NAMES, PARALLEL_SCOUT_TOOL_NAMES, PARALLEL_TOOL_NAMES } from './parallel.js';

/** P6.8: the progressive-disclosure reads: a map of the board, a search, one card in full pages (every role). */
export const SCALE_TOOL_NAMES = ['board_map', 'search_board', 'read_card'] as const;
/** P6.8: semantic layout tools (never coordinates). The first two for every role (own cards only for children). */
export const LAYOUT_TOOL_NAMES = ['move_card', 'arrange_frame'] as const;
/** P6.8: layout tools of the whole board (Orb only). */
export const LAYOUT_ORB_TOOL_NAMES = ['reorder_frames', 'tidy_board'] as const;

/** Exact tool allow-lists per role (BUILD_PLAN §2.4). Nothing else is ever granted. */
export const AGENT_TOOLS: Record<AgentName, readonly string[]> = {
  orb: [
    'query_board',
    'place_card',
    'update_card',
    'add_frame',
    'update_frame',
    'add_link',
    'delegate',
    'message_agent',
    'stop_agent',
    'compose_section',
    // P6.17: the slides (Orb only), the sibling of compose_section.
    'compose_slides',
    'read_source',
    'ask_user_question',
    'query_dataset',
    'upsert_rows',
    // P6.7: Parallel (answers, deep research, bulk runs) and the watches (Orb only).
    ...PARALLEL_ORB_TOOL_NAMES,
    // P6.8: progressive disclosure and semantic layout.
    ...SCALE_TOOL_NAMES,
    ...LAYOUT_TOOL_NAMES,
    ...LAYOUT_ORB_TOOL_NAMES,
  ],
  scout: [
    'web_search',
    'fetch_url',
    'fetch_signed_in',
    'read_source',
    'capture_page',
    'query_board',
    'place_card',
    'add_link',
    'consolidate_cards',
    'report_progress',
    'send_message',
    'query_dataset',
    'upsert_rows',
    // P6.7: Parallel extract, images, answers, deep research, bulk runs and entity lists.
    ...PARALLEL_SCOUT_TOOL_NAMES,
    ...SCALE_TOOL_NAMES,
    ...LAYOUT_TOOL_NAMES,
  ],
  critic: [
    'query_board',
    'query_dataset',
    'read_source',
    'place_card',
    'add_link',
    'consolidate_cards',
    'report_progress',
    'send_message',
    ...SCALE_TOOL_NAMES,
    ...LAYOUT_TOOL_NAMES,
  ],
  builder: [
    'query_board',
    'write_design_frame',
    'place_card',
    'consolidate_cards',
    'report_progress',
    'send_message',
    'query_dataset',
    'upsert_rows',
    ...SCALE_TOOL_NAMES,
    ...LAYOUT_TOOL_NAMES,
  ],
};

/** The tools the `orb` preset's `orb-board-tools` row registers (shared by every agent bound to the preset). */
export const BOARD_TOOL_NAMES = [
  'place_card',
  'update_card',
  'query_board',
  'consolidate_cards',
  'add_frame',
  'update_frame',
  'add_link',
  // P3.8: the design card's own tool (orb-cards `design.tools`), registered by the same row.
  'write_design_frame',
  // P6.3: datasets (orb-cards `database.tools`).
  'query_dataset',
  'upsert_rows',
  // P6.8: board_map, search_board, read_card; move_card, arrange_frame, reorder_frames, tidy_board.
  ...SCALE_TOOL_NAMES,
  ...LAYOUT_TOOL_NAMES,
  ...LAYOUT_ORB_TOOL_NAMES,
] as const;

/**
 * A model route: an `llm-pi-ai` provider id and a model id of that provider (PRD Models and API keys).
 */
export type ModelRoute = { provider: string; model: string };

/**
 * The default model of every agent (user decision, 2026-10-14): OpenAI GPT Luna 6 through the `openai` route of
 * `llm-pi-ai` (openai-responses, api.openai.com). The Orb profile's `agent-default-model` row names the same route;
 * this constant is the last fallback when neither orb.json nor the harness names one.
 */
export const DEFAULT_AGENT_MODEL: Readonly<ModelRoute> = Object.freeze({
  provider: 'openai',
  model: 'gpt-6-luna',
});

/**
 * The team tools the `orb` preset's `orb-agent-tools` row registers (P3.4): Orb's `delegate`, `message_agent`,
 * `stop_agent`, and the children's `report_progress` and `send_message`.
 */
export const TEAM_TOOL_NAMES = [
  'delegate',
  'message_agent',
  'stop_agent',
  'report_progress',
  'send_message',
] as const;

/**
 * The source tools the `orb` preset's `orb-source-tools` row registers (P3.5): Scout's `web_search`, `fetch_url`,
 * `capture_page`, and `read_source` (Orb, Scout, Critic).
 */
export const SOURCE_TOOL_NAMES = [
  'web_search',
  'fetch_url',
  'read_source',
  'capture_page',
  // P6.10: a read-only render of a connected, signed-in site (Scout only).
  'fetch_signed_in',
] as const;

/** P4.5: the research document tool the `orb` preset's `orb-port-tools` row registers (Orb only). */
export const PORT_TOOL_NAMES = ['compose_section', 'compose_slides'] as const;

/**
 * Every tool the `orb` preset registers (board + team + sources + port). Later tasks add theirs here (P3.5 sources, P3.8
 * `write_design_frame`, P4 `compose_section`), so restrictions only ever name tools that exist: dsh's
 * `tools.restrict` throws on an unknown name (dsh-tools/lib/index.js `restrict`).
 */
export const PRESET_TOOL_NAMES: readonly string[] = [
  ...BOARD_TOOL_NAMES,
  ...TEAM_TOOL_NAMES,
  ...SOURCE_TOOL_NAMES,
  ...PORT_TOOL_NAMES,
  // P6.7: the `orb-parallel-tools` row.
  ...PARALLEL_TOOL_NAMES,
];

/** Preset tools a role must not even be offered (outside its allow-list); the guard denies them anyway. */
export const hiddenPresetTools = (agent: AgentName): string[] =>
  PRESET_TOOL_NAMES.filter((tool) => !AGENT_TOOLS[agent].includes(tool));

/** @deprecated P3.2 name of {@link hiddenPresetTools}. */
export const hiddenBoardTools = hiddenPresetTools;

/**
 * A child's `toolFilter.allow` (P3.4): its §2.4 allow-list, limited to the tools the preset really registers today
 * (an allow naming an unknown tool would make `startContinuable` fail).
 */
export const childToolAllow = (agent: ChildAgentName): string[] =>
  AGENT_TOOLS[agent].filter((tool) => PRESET_TOOL_NAMES.includes(tool));

/** The child roles Orb can delegate to (one of each per canvas). */
export const CHILD_AGENTS = ['scout', 'critic', 'builder'] as const;
export type ChildAgentName = (typeof CHILD_AGENTS)[number];
export const isChildAgent = (agent: string): agent is ChildAgentName =>
  (CHILD_AGENTS as readonly string[]).includes(agent);

/** Display names of the agents (PRD Agents). */
export const AGENT_LABELS: Record<AgentName, string> = {
  orb: 'orb',
  scout: 'Scout',
  critic: 'Critic',
  builder: 'Builder',
};

/** Card types each role may place (BUILD_PLAN §2.4), from the card-type manifest's `roles` (cardTypes.ts). */
export const PLACEABLE_TYPES: Record<AgentName, readonly CardType[]> = {
  scout: placeableTypesOf('scout'),
  critic: placeableTypesOf('critic'),
  builder: placeableTypesOf('builder'),
  orb: placeableTypesOf('orb'),
};

/** Tool names no Orb agent may ever hold, regardless of allow-lists. */
export const FORBIDDEN_TOOL_PATTERNS: readonly RegExp[] = [
  /^bash/,
  /^pwsh/,
  /^run_code$/,
  /^workflow$/,
  /^ralph$/,
  /^job_/,
  /^cordis_/,
  /^(read|write|edit|glob|grep)$/,
  /^subagent(_fork)?$/,
];

export function isToolAllowed(agent: AgentName, tool: string): boolean {
  if (FORBIDDEN_TOOL_PATTERNS.some((re) => re.test(tool))) return false;
  return AGENT_TOOLS[agent].includes(tool);
}

/**
 * P3.7: the steer a paused agent gets on Resume (PRD Agents › Controls: Pause holds the agent until Resume). It is a
 * user-sourced message (the user pressed Resume); the conversation panel does not show it as a chat message.
 */
export const RESUME_TEXT = 'Continue where you left off.';
