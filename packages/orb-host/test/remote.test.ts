/**
 * Unit test of the BUILT orb-host remote (`lib/remote.js`, what dsh loads). The gateway's SRC fallback reads Remote
 * markers from the prototype and wire argument names from Function.prototype.toString
 * (dsh-api-gateway/lib/index.js `methodParameterNames`), so the bundle must keep plain parameter names.
 * Needs `pnpm build` first (as every `pnpm test` run in this repo does).
 */
import { Context } from '@deepseek-ai/cordis';
import { remoteErrorOf, remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CanvasStore } from '@orb/canvas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const libPath = pathToFileURL(resolve(import.meta.dirname, '..', 'lib', 'remote.js')).href;

let host: any;
let store: CanvasStore;
let home: string;
const sent: Array<{ canvasId: string; text: string }> = [];
const opened: string[] = [];
const fakeKeychain = new Map<string, string>();
const fakeEnv = new Map<string, string>([['TAVILY_API_KEY', `tvly-${'e'.repeat(28)}9999`]]);
const stops: string[] = [];

/** Same parsing as the gateway's SRC fallback (dsh-api-gateway/lib/index.js:1470-1495). */
function parameterNames(fn: (...args: never[]) => unknown): string[] {
  const source = Function.prototype.toString.call(fn);
  const body = source.slice(source.indexOf('(') + 1, source.indexOf(')')).trim();
  return body ? body.split(',').map((p) => p.trim()) : [];
}

/** Canvases whose fake root agent reports `running` (P2.6 tile status). */
const working = new Set<string>();

beforeAll(async () => {
  const mod = await import(libPath);
  home = mkdtempSync(join(tmpdir(), 'orb-host-'));
  store = new CanvasStore({ home });
  const ctx = new Context();
  ctx.provide('orbCanvas', store);
  // Stand-in for orb-agents (the real one needs a live harness; covered by apps/ui/test/agent.contract.test.ts).
  ctx.provide('orbAgents', {
    async createRoot(canvasId: string) {
      const sessionId = `orb-fake-${canvasId}`;
      return { canvas: await store.setRootSession(canvasId, sessionId), sessionId };
    },
    async openRoot(canvasId: string) {
      const canvas = await store.open(canvasId);
      opened.push(canvasId);
      return { canvas, sessionId: canvas.rootSessionId, origin: 'resumed' };
    },
    async stop(canvasId: string) {
      await store.open(canvasId);
      stops.push(canvasId);
      return { action: 'stop', state: 'stopped', stopMs: 1.5, agents: 1 };
    },
    async stopOne(canvasId: string, agent: string) {
      await store.open(canvasId);
      stops.push(`${canvasId}:${agent}`);
      return { action: 'stop', state: 'stopped', stopMs: 0.5, agents: 1 };
    },
    async pause(canvasId: string, agent: string) {
      await store.open(canvasId);
      stops.push(`pause:${agent}`);
      return { action: 'pause', state: 'paused', stopMs: 0.7, agents: agent === 'all' ? 2 : 1 };
    },
    async resume(canvasId: string, agent: string) {
      await store.open(canvasId);
      stops.push(`resume:${agent}`);
      return { action: 'resume', state: 'resumed', agents: 1, queued: 2 };
    },
    async redirect(canvasId: string, agent: string, text: string) {
      await store.open(canvasId);
      stops.push(`redirect:${agent}:${text}`);
      return { action: 'redirect', state: 'delivered', agents: 1 };
    },
    async statusOf(canvasId: string) {
      await store.open(canvasId);
      return { agent: 'orb', state: working.has(canvasId) ? 'running' : 'idle', at: 1 };
    },
    async *followStatus(canvasId: string, signal: AbortSignal) {
      yield { agent: 'orb', state: 'idle', sessionId: `orb-fake-${canvasId}`, at: 1 };
      if (!signal.aborted) yield { agent: 'orb', state: 'stopping', at: 2 };
    },
    async send(canvasId: string, text: string) {
      await store.open(canvasId);
      sent.push({ canvasId, text });
      return { sessionId: `orb-fake-${canvasId}` };
    },
  });
  // Stand-in for orb-keychain (the built provider is packages/orb-host/test/keychain.test.ts; the real wiring is
  // apps/ui/test/keys.contract.test.ts): an env layer (read-only) over a writable map.
  ctx.provide('credentials', {
    async resolve(ref: string) {
      if (fakeEnv.has(ref)) return { value: fakeEnv.get(ref)!, source: 'env' };
      return fakeKeychain.has(ref) ? { value: fakeKeychain.get(ref)!, source: 'keychain' } : undefined;
    },
    async describe(ref: string) {
      if (fakeEnv.has(ref)) return { configured: true, source: 'env', writable: false };
      return fakeKeychain.has(ref)
        ? { configured: true, source: 'keychain', writable: true }
        : { configured: false, writable: true };
    },
    async set(ref: string, value: string) {
      if (value === 'boom-boom-boom') throw new Error('Keychain locked');
      fakeKeychain.set(ref, value);
    },
    async unset(ref: string) {
      fakeKeychain.delete(ref);
    },
    async storedRefs() {
      return [...fakeKeychain.keys()];
    },
  });
  host = new mod.default(ctx);
});

afterAll(async () => {
  await store?.close();
  if (home) rmSync(home, { recursive: true, force: true });
});

const thrown = async (fn: () => unknown) => {
  try {
    await fn();
  } catch (e) {
    return remoteErrorOf(e);
  }
  throw new Error('expected a throw');
};

describe('orb-host remote (built output)', () => {
  it('P2.6: canvas.list tiles (preview + status), canvas.search, settings.get/set', async () => {
    const a = await host.canvasCreate({ prompt: 'Tiles template', template: 'topic' });
    working.add(a.id);
    const tiles = (await host.canvasList()) as {
      id: string;
      preview: { frames: unknown[] };
      status: { working: number; label: string };
    }[];
    const tile = tiles.find((t) => t.id === a.id)!;
    expect(tile.preview.frames).toHaveLength(5);
    expect(tile.status).toEqual({ working: 1, label: '1 agent working' });
    working.delete(a.id);
    expect((await host.canvasList()).find((t: { id: string }) => t.id === a.id).status.label).toBe('Idle');

    const { hits } = await host.canvasSearch({ q: 'evidence' });
    expect(hits).toEqual([expect.objectContaining({ canvasId: a.id, kind: 'frame', title: 'Evidence' })]);
    expect((await thrown(() => host.canvasSearch({ q: '' })))?.code).toBe('orb/invalid-args');
    expect((await thrown(() => host.canvasSearch('x')))?.code).toBe('orb/invalid-args');
    expect((await thrown(() => host.canvasCreate({ prompt: 'x', template: 'nope' })))?.code).toBe(
      'orb/invalid-args',
    );

    expect(await host.settingsGet()).toEqual({
      v: 1,
      theme: 'night',
      appearance: { themeId: 'studio', accent: 'blue', mode: 'system' },
      motion: 'system',
      customProviders: [],
      modelCatalogs: {},
      firstRunDone: false,
      models: {},
      prices: {},
      keyTests: {},
    });
    expect(await host.settingsSet({ theme: 'day' })).toEqual({
      v: 1,
      theme: 'day',
      appearance: { themeId: 'studio', accent: 'blue', mode: 'light' },
      motion: 'system',
      customProviders: [],
      modelCatalogs: {},
      firstRunDone: false,
      models: {},
      prices: {},
      keyTests: {},
    });
    expect(await host.settingsGet()).toEqual({
      v: 1,
      theme: 'day',
      appearance: { themeId: 'studio', accent: 'blue', mode: 'light' },
      motion: 'system',
      customProviders: [],
      modelCatalogs: {},
      firstRunDone: false,
      models: {},
      prices: {},
      keyTests: {},
    });
    expect((await thrown(() => host.settingsSet({ theme: 'day', key: 'not-a-secret' })))?.code).toBe(
      'orb/invalid-args',
    );
  });

  it('P4.1: keys.describe/set/unset answer redacted descriptors only; env keys are read-only', async () => {
    const raw = `sk-proj-${'k'.repeat(40)}4f2a`;
    const before = await host.keysDescribe(undefined);
    expect(before.keys.map((k: { provider: string }) => k.provider)).toEqual([
      'deepseek',
      'anthropic',
      'openai',
      'openrouter',
      'brave',
      'tavily',
      'parallel',
    ]);
    expect(before.keys.find((k: { provider: string }) => k.provider === 'openai')).toEqual({
      provider: 'openai',
      ref: 'OPENAI_API_KEY',
      configured: false,
      writable: true,
    });
    expect(before.keys.find((k: { provider: string }) => k.provider === 'tavily')).toEqual({
      provider: 'tavily',
      ref: 'TAVILY_API_KEY',
      configured: true,
      source: 'env',
      writable: false,
      redacted: 'tvly-...9999',
    });

    const set = await host.keysSet({ provider: 'openai', key: `  ${raw}\n` });
    expect(set).toEqual({
      provider: 'openai',
      ref: 'OPENAI_API_KEY',
      configured: true,
      source: 'keychain',
      writable: true,
      redacted: 'sk-proj-...4f2a',
    });
    expect(fakeKeychain.get('OPENAI_API_KEY')).toBe(raw);
    // A custom provider's key lives under ORB_<ID>_API_KEY and is listed once stored.
    await host.keysSet({ provider: 'my-ollama', key: 'ollama' });
    expect(fakeKeychain.get('ORB_MY_OLLAMA_API_KEY')).toBe('ollama');
    const after = await host.keysDescribe({ providers: ['lm-studio'] });
    expect(after.keys.find((k: { provider: string }) => k.provider === 'my-ollama')).toMatchObject({
      configured: true,
      redacted: '...',
    });
    expect(after.keys.find((k: { provider: string }) => k.provider === 'lm-studio')).toMatchObject({
      ref: 'ORB_LM_STUDIO_API_KEY',
      configured: false,
    });
    // No answer ever carries the raw key.
    expect(JSON.stringify([before, set, after])).not.toContain(raw.slice(8, 30));

    expect((await thrown(() => host.keysSet({ provider: 'tavily', key: 'tvly-new' })))?.code).toBe(
      'orb/key-shadowed',
    );
    const failed = await thrown(() => host.keysSet({ provider: 'openai', key: 'boom-boom-boom' }));
    expect(failed?.code).toBe('orb/keychain-failed');
    expect(JSON.stringify(failed)).not.toContain('boom-boom-boom');
    for (const bad of [
      { provider: 'openai', key: '' },
      { provider: 'openai', key: 'a b' },
      { provider: 'Open AI', key: 'x' },
      { provider: 'openai' },
    ])
      expect((await thrown(() => host.keysSet(bad)))?.code).toBe('orb/invalid-args');

    expect(await host.keysUnset({ provider: 'openai' })).toEqual({
      provider: 'openai',
      ref: 'OPENAI_API_KEY',
      configured: false,
      writable: true,
    });
    expect(fakeKeychain.has('OPENAI_API_KEY')).toBe(false);
  });

  it('P4.3: without the orb-cost row, cost and prices answer orb/cost-unavailable and tiles carry no meter', async () => {
    const a = await host.canvasCreate({ prompt: 'meter', template: 'topic' });
    expect((await thrown(() => host.costGet(a.id)))?.code).toBe('orb/cost-unavailable');
    expect((await thrown(() => host.pricesDescribe()))?.code).toBe('orb/cost-unavailable');
    expect((await thrown(() => host.costGet('Bad Id')))?.code).toBe('orb/invalid-args');
    expect(
      (await thrown(() => host.pricesSet({ provider: 'openai', model: 'x', rates: { input: -1 } })))?.code,
    ).toBe('orb/invalid-args');
    const tiles = await host.canvasList();
    expect(tiles.find((t: { id: string }) => t.id === a.id)).not.toHaveProperty('cost');
  });

  it('binds the orb namespace and exports exactly the implemented endpoints', () => {
    expect(host.typertRemote.namespace).toBe('orb');
    expect(remoteMethods(host).map((m) => [m.exportName ?? m.method, m.mode ?? 'unary'])).toEqual([
      ['ping', 'unary'],
      ['canvas.create', 'unary'],
      ['canvas.open', 'unary'],
      ['canvas.list', 'unary'],
      ['canvas.search', 'unary'],
      ['parallel.confirm', 'unary'],
      ['parallel.status', 'unary'],
      ['settings.get', 'unary'],
      ['settings.set', 'unary'],
      ['keys.describe', 'unary'],
      ['keys.keychain', 'unary'],
      ['keys.set', 'unary'],
      ['keys.unset', 'unary'],
      ['models.describe', 'unary'],
      ['chatgpt.describe', 'unary'],
      ['chatgpt.action', 'unary'],
      ['keys.test', 'unary'],
      ['models.discover', 'unary'],
      ['models.custom.set', 'unary'],
      ['models.custom.remove', 'unary'],
      ['cost.get', 'unary'],
      ['prices.describe', 'unary'],
      ['prices.set', 'unary'],
      ['canvas.camera', 'unary'],
      ['canvas.rename', 'unary'],
      ['canvas.start', 'unary'],
      ['board.command', 'unary'],
      ['chat.send', 'unary'],
      ['agents.control', 'unary'],
      ['port.compose', 'stream'],
      ['port.regenerateSection', 'unary'],
      ['port.saveDoc', 'unary'],
      ['port.get', 'unary'],
      ['deck.compose', 'stream'],
      ['deck.regenerateSlide', 'unary'],
      ['deck.save', 'unary'],
      ['deck.get', 'unary'],
      ['deck.exportPptx', 'unary'],
      ['agents.status', 'stream'],
      ['board.follow', 'stream'],
    ]);
  });

  it('keeps plain parameter names, with signal last, in the bundle', () => {
    const proto = Object.getPrototypeOf(host);
    expect(parameterNames(proto.ping)).toEqual([]);
    expect(parameterNames(proto.canvasCreate)).toEqual(['request']);
    expect(parameterNames(proto.canvasOpen)).toEqual(['id']);
    // P4.2 model settings endpoints.
    expect(parameterNames(proto.modelsDescribe)).toEqual([]);
    expect(parameterNames(proto.chatgptDescribe)).toEqual([]);
    expect(parameterNames(proto.chatgptAction)).toEqual(['request', 'signal']);
    expect(parameterNames(proto.keysTest)).toEqual(['request', 'signal']);
    expect(parameterNames(proto.modelsDiscover)).toEqual(['request', 'signal']);
    expect(parameterNames(proto.modelsCustomSet)).toEqual(['request']);
    expect(parameterNames(proto.modelsCustomRemove)).toEqual(['request']);
    // P4.3 cost meter and price table.
    expect(parameterNames(proto.costGet)).toEqual(['canvasId']);
    expect(parameterNames(proto.pricesDescribe)).toEqual([]);
    expect(parameterNames(proto.pricesSet)).toEqual(['request']);
    // P4.5 Port.
    expect(parameterNames(proto['port.compose'])).toEqual(['canvasId', 'request', 'signal']);
    expect(parameterNames(proto.portRegenerateSection)).toEqual(['canvasId', 'request']);
    expect(parameterNames(proto.portSaveDoc)).toEqual(['canvasId', 'request']);
    expect(parameterNames(proto.portGet)).toEqual(['canvasId']);
    // P6.17 Deck.
    expect(parameterNames(proto['deck.compose'])).toEqual(['canvasId', 'request', 'signal']);
    expect(parameterNames(proto.deckRegenerateSlide)).toEqual(['canvasId', 'request']);
    expect(parameterNames(proto.deckSave)).toEqual(['canvasId', 'request']);
    expect(parameterNames(proto.deckGet)).toEqual(['canvasId']);
    expect(parameterNames(proto.deckExportPptx)).toEqual(['canvasId']);
    expect(parameterNames(proto.canvasList)).toEqual([]);
    expect(parameterNames(proto.canvasRename)).toEqual(['canvasId', 'request']);
    expect(parameterNames(proto.canvasSearch)).toEqual(['request']);
    expect(parameterNames(proto.settingsGet)).toEqual([]);
    expect(parameterNames(proto.settingsSet)).toEqual(['request']);
    expect(parameterNames(proto.keysDescribe)).toEqual(['request']);
    expect(parameterNames(proto.keysSet)).toEqual(['request']);
    expect(parameterNames(proto.keysUnset)).toEqual(['request']);
    expect(parameterNames(proto.boardCommand)).toEqual(['canvasId', 'command']);
    expect(parameterNames(proto.chatSend)).toEqual(['canvasId', 'request']);
    expect(parameterNames(proto.agentsControl)).toEqual(['canvasId', 'request']);
    expect(parameterNames(proto['agents.status'])).toEqual(['canvasId', 'signal']);
    expect(parameterNames(proto['board.follow'])).toEqual(['canvasId', 'signal']);
  });

  it('rejects invalid payloads with orb/invalid-args', async () => {
    expect((await thrown(() => host.canvasCreate({ prompt: 42 })))?.code).toBe('orb/invalid-args');
    expect((await thrown(() => host.canvasCreate(undefined)))?.code).toBe('orb/invalid-args');
    expect((await thrown(() => host.canvasOpen('Not An Id')))?.code).toBe('orb/invalid-args');
    expect((await thrown(() => host.canvasOpen('2026-01-01-missing')))?.code).toBe('orb/not-found');
    expect((await thrown(() => host.boardCommand('2026-01-01-missing', { type: 'nope' })))?.code).toBe(
      'orb/invalid-args',
    );
    expect(
      (
        await thrown(() =>
          host.boardCommand('2026-01-01-missing', { type: 'card.moved', id: 'c_1', x: 0, y: 0 }),
        )
      )?.code,
    ).toBe('orb/not-found');
  });

  it('canvas.create creates the root agent and returns its session id; chat.send delegates to orbAgents', async () => {
    const meta = await host.canvasCreate({ prompt: 'With an agent' });
    expect(meta.rootSessionId).toBe(`orb-fake-${meta.id}`);
    expect(
      JSON.parse(readFileSync(join(home, 'canvases', meta.id, 'canvas.json'), 'utf8')).rootSessionId,
    ).toBe(meta.rootSessionId);
    expect(await host.chatSend(meta.id, { text: 'hello' })).toEqual({
      accepted: true,
      sessionId: meta.rootSessionId,
    });
    expect(sent.at(-1)).toEqual({ canvasId: meta.id, text: 'hello' });
    expect((await thrown(() => host.chatSend(meta.id, { text: '' })))?.code).toBe('orb/invalid-args');
    expect((await thrown(() => host.chatSend('Bad Id', { text: 'x' })))?.code).toBe('orb/invalid-args');
    expect((await thrown(() => host.chatSend('2026-01-01-missing', { text: 'x' })))?.code).toBe(
      'orb/not-found',
    );
  });

  it('delegates to orbCanvas: canvas.json on disk, commands appended to board.jsonl', async () => {
    const meta = await host.canvasCreate({ prompt: 'Delegated' });
    expect(await host.canvasOpen(meta.id)).toEqual(meta);
    // Opening a canvas makes its root agent live through orbAgents (resume path, P1.9).
    expect(opened.at(-1)).toBe(meta.id);
    expect((await host.canvasList()).map((c: { id: string }) => c.id)).toContain(meta.id);
    const { event } = await host.boardCommand(meta.id, {
      type: 'card.added',
      card: { type: 'note', x: 1, y: 2, w: 3, h: 4, data: {} },
    });
    expect(event).toMatchObject({ seq: 0, type: 'card.added', actor: { kind: 'user' } });
    const moveMissing = await thrown(() =>
      host.boardCommand(meta.id, { type: 'card.moved', id: 'c_missing', x: 0, y: 0 }),
    );
    expect(moveMissing?.code).toBe('orb/not-found');
    await store.flush();
    const lines = readFileSync(join(home, 'canvases', meta.id, 'board.jsonl'), 'utf8')
      .trim()
      .split('\n');
    expect(lines.map((l) => JSON.parse(l))).toEqual([event]);
  });

  it('canvas.rename rewrites canvas.json and validates the title', async () => {
    const meta = await host.canvasCreate({ prompt: 'Before rename' });
    const renamed = await host.canvasRename(meta.id, { title: '  Research canvas idea  ' });
    expect(renamed).toEqual({ ...meta, title: 'Research canvas idea' });
    expect(JSON.parse(readFileSync(join(home, 'canvases', meta.id, 'canvas.json'), 'utf8'))).toEqual(renamed);
    expect((await thrown(() => host.canvasRename(meta.id, { title: '   ' })))?.code).toBe('orb/invalid-args');
    expect((await thrown(() => host.canvasRename(meta.id, { title: 'x'.repeat(201) })))?.code).toBe(
      'orb/invalid-args',
    );
    expect((await thrown(() => host.canvasRename('2026-01-01-missing', { title: 'x' })))?.code).toBe(
      'orb/not-found',
    );
  });

  it('board.follow yields a snapshot, then events, then ends when the signal aborts', async () => {
    const { id } = await host.canvasCreate({ prompt: 'A board' });
    const ac = new AbortController();
    const it = host['board.follow'](id, ac.signal) as AsyncGenerator<unknown>;
    expect((await it.next()).value).toEqual({
      kind: 'snapshot',
      canvasId: id,
      nextSeq: 0,
      cards: [],
      frames: [],
      links: [],
    });
    const next = it.next();
    const { event } = await host.boardCommand(id, {
      type: 'card.added',
      card: { type: 'note', x: 0, y: 0, w: 1, h: 1, data: {} },
    });
    expect((await next).value).toEqual({ kind: 'event', event });
    // P2.3: a batch writes its events back to back; the pendingId comes back on the stream (not in the log).
    const cardId = (event.data as { card: { id: string } }).card.id;
    const batch = await host.boardCommand(id, {
      type: 'batch',
      pendingId: 'p-test',
      commands: [
        { type: 'frame.added', frame: { title: 'Thesis', color: 'sky', x: 0, y: 0, w: 300, h: 200 } },
        { type: 'card.moved', moves: [{ id: cardId, x: 5, y: 6 }] },
      ],
    });
    expect(batch.events.map((e: { seq: number; type: string }) => [e.seq, e.type])).toEqual([
      [1, 'frame.added'],
      [2, 'card.moved'],
    ]);
    expect(batch.event).toEqual(batch.events[1]);
    expect((await it.next()).value).toEqual({
      kind: 'event',
      event: batch.events[0],
      pendingId: 'p-test',
      final: false,
    });
    expect((await it.next()).value).toEqual({
      kind: 'event',
      event: batch.events[1],
      pendingId: 'p-test',
      final: true,
    });
    expect(JSON.stringify(batch.events)).not.toContain('p-test');
    const pending = it.next();
    ac.abort();
    expect(await pending).toEqual({ done: true, value: undefined });
  });

  it('board.follow fails with orb/not-found before yielding for an unknown canvas', async () => {
    const it = host['board.follow'](
      '1999-01-01-nothing',
      new AbortController().signal,
    ) as AsyncGenerator<unknown>;
    expect((await thrown(() => it.next()))?.code).toBe('orb/not-found');
  });

  it('agents.control: stop goes to orbAgents.stop (all) or stopOne (one agent); pause, resume and redirect to theirs', async () => {
    const { id } = await host.canvasCreate({ prompt: 'Stop me' });
    expect(await host.agentsControl(id, { agent: 'all', action: 'stop' })).toEqual({
      action: 'stop',
      state: 'stopped',
      stopMs: 1.5,
      agents: 1,
    });
    expect(await host.agentsControl(id, { agent: 'orb', action: 'stop' })).toMatchObject({
      state: 'stopped',
    });
    expect(await host.agentsControl(id, { agent: 'critic', action: 'stop' })).toMatchObject({
      state: 'stopped',
      stopMs: 0.5,
    });
    expect(stops).toEqual([id, `${id}:orb`, `${id}:critic`]);
    expect(await host.agentsControl(id, { agent: 'all', action: 'pause' })).toEqual({
      action: 'pause',
      state: 'paused',
      stopMs: 0.7,
      agents: 2,
    });
    expect(await host.agentsControl(id, { agent: 'scout', action: 'resume' })).toEqual({
      action: 'resume',
      state: 'resumed',
      agents: 1,
      queued: 2,
    });
    expect(
      await host.agentsControl(id, { agent: 'orb', action: 'redirect', text: ' Focus on pricing ' }),
    ).toEqual({ action: 'redirect', state: 'delivered', agents: 1 });
    expect(stops.slice(3)).toEqual(['pause:all', 'resume:scout', 'redirect:orb:Focus on pricing']);
    // A redirect needs text.
    expect((await thrown(() => host.agentsControl(id, { agent: 'orb', action: 'redirect' })))?.code).toBe(
      'orb/invalid-args',
    );
    expect((await thrown(() => host.agentsControl(id, { action: 'stop' })))?.code).toBe('orb/invalid-args');
    expect((await thrown(() => host.agentsControl('Bad Id', { agent: 'all', action: 'stop' })))?.code).toBe(
      'orb/invalid-args',
    );
    expect(
      (await thrown(() => host.agentsControl('1999-01-01-nothing', { agent: 'all', action: 'stop' })))?.code,
    ).toBe('orb/not-found');
  });

  it('agents.status streams validated AgentStatus items and fails fast for an unknown canvas', async () => {
    const { id } = await host.canvasCreate({ prompt: 'Status' });
    const it = host['agents.status'](id, new AbortController().signal) as AsyncGenerator<unknown>;
    expect((await it.next()).value).toEqual({
      agent: 'orb',
      state: 'idle',
      sessionId: `orb-fake-${id}`,
      at: 1,
    });
    expect((await it.next()).value).toEqual({ agent: 'orb', state: 'stopping', at: 2 });
    const missing = host['agents.status']('1999-01-01-nothing', new AbortController().signal);
    expect((await thrown(() => missing.next()))?.code).toBe('orb/not-found');
  });
});
