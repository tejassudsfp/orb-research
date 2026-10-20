/**
 * P3.7 "Every Orb tool honours exec.signal": every tool of the `orb` preset (board tools, source tools, team tools),
 * registered the way the preset registers them, is called with an already-aborted signal. Each one must fail with the
 * signal's reason and leave no trace: no board event, no search, no message, no status change.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PRESET_TOOL_NAMES, type AgentName } from '@orb/shared';
import { CanvasStore } from '../../orb-canvas/src/store.js';
import { apply as applyBoardTools } from '../../orb-canvas/src/tools.js';
import { apply as applySourceTools } from '../../orb-canvas/src/sources.js';
import { apply as applyPortTools } from '../../orb-canvas/src/port.js';
import { apply as applyParallelTools } from '../../orb-canvas/src/parallelTools.js';
import { apply as applyTeamTools } from '../src/tools.js';
import { OrbAgents } from '../src/service.js';

const SESSIONS: Record<AgentName, string> = {
  orb: 'orb-session-1',
  scout: 'scout-session-1',
  critic: 'critic-session-1',
  builder: 'builder-session-1',
};

let home: string;
let store: CanvasStore;
let canvasId: string;

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), 'orb-signal-'));
  store = new CanvasStore({ home, flushMs: 5 });
  canvasId = (await store.create({ prompt: 'Signals' })).id;
  await store.setRootSession(canvasId, SESSIONS.orb);
  await store.setChildAgent(canvasId, 'scout', SESSIONS.scout);
  await store.setChildAgent(canvasId, 'builder', SESSIONS.builder);
});

afterEach(async () => {
  await store.close();
  rmSync(home, { recursive: true, force: true });
});

const boardLog = async () => {
  await store.flush();
  return readFileSync(join(store.dirOf(canvasId), 'board.jsonl'), 'utf8');
};

describe('every Orb tool honours exec.signal', () => {
  it('an aborted call fails with the abort reason and changes nothing', async () => {
    const tools = new Map<string, any>();
    const searches: unknown[] = [];
    const messages: unknown[] = [];
    const agentOf = (role: AgentName) => ({
      id: SESSIONS[role],
      status: 'idle',
      options: { provider: 'openai', model: 'gpt-6-luna' },
      session: { header: { cwd: store.dirOf(canvasId) }, seq: 3 },
      followup: () => undefined,
      steer: () => undefined,
      inject: () => void messages.push('inject'),
      cancel: () => undefined,
      whenIdle: async () => undefined,
    });
    const ctx: any = {
      orbCanvas: store,
      // P6.7: the Parallel tools never reach the service when the call is already aborted.
      orbParallel: {},
      tools: { register: (tool: any) => void tools.set(tool.name, tool) },
      web: { search: async (...a: unknown[]) => void searches.push(a) },
      get: () => undefined,
      agents: { get: (id: string) => (id === SESSIONS.orb ? agentOf('orb') : undefined) },
      subagents: {
        startContinuable: async () => void messages.push('start'),
        sendMessage: async () => void messages.push('send'),
        interrupt: () => void messages.push('interrupt'),
      },
    };
    ctx.orbAgents = new OrbAgents(ctx);
    applyBoardTools(ctx);
    applySourceTools(ctx);
    applyPortTools(ctx);
    applyParallelTools(ctx);
    applyTeamTools(ctx);
    // Every tool the preset offers is covered (later tasks add theirs to PRESET_TOOL_NAMES and to this table).
    expect([...tools.keys()].sort()).toEqual([...PRESET_TOOL_NAMES].sort());

    // Something to point at, written with a live signal.
    const live = { callId: 'call_setup', signal: new AbortController().signal };
    const frame = await tools
      .get('add_frame')
      .execute({ title: 'Market' }, { ...live, agent: agentOf('orb') });
    const card = await tools.get('place_card').execute(
      {
        type: 'source',
        frameId: frame.frameId,
        title: 'A source',
        url: 'https://example.com/a',
        body: 'B.',
        why: 'Setup.',
      },
      { ...live, agent: agentOf('scout') },
    );
    const before = await boardLog();
    const statuses: unknown[] = [];
    const follow = new AbortController();
    void (async () => {
      for await (const s of (ctx.orbAgents as OrbAgents).followStatus(canvasId, follow.signal))
        statuses.push(s);
    })();
    await expect.poll(() => statuses.length).toBeGreaterThan(0);
    const statusCount = statuses.length;

    const calls: Record<string, { role: AgentName; args: Record<string, unknown> }> = {
      place_card: {
        role: 'orb',
        args: { type: 'doc', frameId: frame.frameId, title: 'T', body: 'B', why: 'W' },
      },
      update_card: { role: 'orb', args: { cardId: card.cardId, title: 'New title' } },
      query_board: { role: 'orb', args: {} },
      // P6.8: progressive disclosure and layout.
      board_map: { role: 'orb', args: {} },
      search_board: { role: 'orb', args: { q: 'source' } },
      read_card: { role: 'orb', args: { cardId: card.cardId } },
      move_card: { role: 'scout', args: { cardId: card.cardId, frameId: frame.frameId } },
      arrange_frame: { role: 'scout', args: { frameId: frame.frameId, by: 'importance' } },
      reorder_frames: { role: 'orb', args: { order: [frame.frameId] } },
      tidy_board: { role: 'orb', args: {} },
      consolidate_cards: { role: 'scout', args: { cardIds: [card.cardId], title: 'Stack', summary: 'S' } },
      add_frame: { role: 'orb', args: { title: 'Risks' } },
      update_frame: { role: 'orb', args: { frameId: frame.frameId, title: 'Markets' } },
      add_link: { role: 'orb', args: { from: card.cardId, to: frame.frameId, type: 'supports' } },
      delegate: { role: 'orb', args: { role: 'scout', frameIds: [frame.frameId], instruction: 'Go.' } },
      message_agent: { role: 'orb', args: { agent: 'scout', message: 'Hi.' } },
      stop_agent: { role: 'orb', args: { agent: 'scout' } },
      report_progress: { role: 'scout', args: { status: 'Reading', frameId: frame.frameId } },
      send_message: { role: 'scout', args: { about: 'done', message: 'Done.' } },
      web_search: { role: 'scout', args: { query: 'solid-state batteries' } },
      fetch_url: { role: 'scout', args: { url: 'https://example.com/b' } },
      fetch_signed_in: { role: 'scout', args: { url: 'https://example.com/members' } },
      read_source: { role: 'orb', args: { cardId: card.cardId } },
      capture_page: { role: 'scout', args: { url: 'https://example.com/c' } },
      compose_section: {
        role: 'orb',
        args: {
          sectionId: 'market',
          heading: 'Market',
          paragraphs: [{ text: 'P.', cardIds: [card.cardId] }],
        },
      },
      compose_slides: {
        role: 'orb',
        args: { slides: [{ slideId: 'one', layout: 'bullets', title: 'One', bullets: ['x'], cardIds: [card.cardId] }] },
      },
      query_dataset: { role: 'orb', args: { datasetId: 'd_ABCDEFGH12' } },
      upsert_rows: {
        role: 'orb',
        args: { datasetId: 'd_ABCDEFGH12', rows: [{ values: { A: 'x' } }] },
      },
      write_design_frame: {
        role: 'builder',
        args: { frameId: frame.frameId, title: 'Screen', html: '<p>x</p>', why: 'W' },
      },
      // P6.7: Parallel. Each is wrapped in abortFirst: an aborted call never reaches the service or the network.
      parallel_extract: { role: 'scout', args: { urls: ['https://example.com/p'] } },
      image_search: { role: 'scout', args: { queries: ['solar'] } },
      web_answer: { role: 'scout', args: { question: 'Why?' } },
      deep_research: { role: 'scout', args: { input: 'Research X' } },
      research_status: { role: 'scout', args: { run_id: 'trun_1' } },
      batch_enrich: { role: 'scout', args: { rows: ['a'], output_json_schema: { type: 'object', properties: { x: { type: 'string' } } } } },
      find_entities: { role: 'scout', args: { objective: 'Find companies' } },
      find_entities_extend: { role: 'scout', args: { findall_id: 'findall_1', additional_match_limit: 5 } },
      entity_search: { role: 'scout', args: { entity_type: 'companies', objective: 'Find companies' } },
      research_memory: { role: 'scout', args: {} },
      suggest_task_spec: { role: 'scout', args: { intent: 'compare vendors' } },
      watch_topic: { role: 'orb', args: { query: 'new releases' } },
      list_watches: { role: 'orb', args: {} },
      watch_events: { role: 'orb', args: { monitor_id: 'monitor_1' } },
      stop_watch: { role: 'orb', args: { monitor_id: 'monitor_1' } },
    };
    expect(Object.keys(calls).sort()).toEqual([...tools.keys()].sort());

    for (const [name, { role, args }] of Object.entries(calls)) {
      const ac = new AbortController();
      ac.abort(new Error(`user stop (${name})`));
      await expect(
        tools.get(name).execute(args, { callId: `call_${name}`, signal: ac.signal, agent: agentOf(role) }),
        name,
      ).rejects.toThrow(`user stop (${name})`);
    }
    expect(await boardLog()).toBe(before);
    // P4.5: nothing written to port/ either.
    expect(existsSync(join(store.dirOf(canvasId), 'port'))).toBe(false);
    expect(searches).toEqual([]);
    expect(messages).toEqual([]);
    await new Promise((r) => setTimeout(r, 20));
    expect(statuses.length).toBe(statusCount);
    follow.abort();
  });
});
