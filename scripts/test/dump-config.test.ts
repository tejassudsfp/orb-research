import { describe, expect, it } from 'vitest';
import { dumpConfig } from '../dump-config.ts';
import { enabledState, parseDump, type Row } from '../util/dump.ts';

const rows = parseDump(dumpConfig());
const byId = new Map(rows.filter((r) => r.id).map((r) => [r.id!, r]));
const state = (id: string) => {
  const row = byId.get(id);
  if (!row) throw new Error(`row ${id} missing`);
  return enabledState(row);
};

describe('orb profile dump (Gate 1.1)', () => {
  it('mounts the selected-route compactor instead of silently skipping an attempted plugin rename', () => {
    expect(state('compaction-basic')).toBe('disabled');
    expect(state('orb-compaction')).toBe('enabled');
    expect(byId.get('orb-compaction')).toMatchObject({
      name: '@orb/agents/compaction',
      config: { maxTokens: 4096, headroomTokens: 8192, retainRatio: 0.08 },
    });
  });
  it('contains dsh-base core rows', () => {
    for (const id of ['session', 'agent', 'agent-loop', 'tools', 'llm-pi-ai', 'session-persistence-jsonl']) {
      expect(state(id), id).toBe('enabled');
    }
  });

  it('contains the gateway host rows', () => {
    for (const id of [
      'typert-gateway',
      'webserver',
      'web-startup',
      'connection',
      'api-remotes',
      'session-controller',
    ]) {
      expect(state(id), id).toBe('enabled');
    }
  });

  it('contains every orb row, enabled', () => {
    const orbRows = rows.filter((r) => r.id?.startsWith('orb-'));
    expect(orbRows.map((r) => r.id)).toEqual(
      expect.arrayContaining([
        'orb-keychain',
        'orb-web-shell',
        'orb-canvas',
        'orb-agents',
        'orb-host',
        'orb-preset',
      ]),
    );
    for (const r of orbRows) expect(enabledState(r), r.id).toBe('enabled');
  });

  it('enables no telemetry, analytics, feedback or phone-home row', () => {
    for (const id of [
      'session-telemetry-otel',
      'command-feedback',
      'message-feedback',
      'session-log-deepseek',
      'plugin-package-inventory-deepseek',
      'desktop-product-telemetry',
      'product-analytics',
      'llm-deepseek',
      'llm-deepseek-account',
      'deepseek-account',
      'web-search-deepseek',
      'plugin-manager',
    ]) {
      expect(state(id), id).toBe('disabled');
    }
    const telemetryish = rows.filter((r) =>
      /telemetry|analytics|feedback|inventory-deepseek/.test(`${r.id} ${r.name}`),
    );
    for (const r of telemetryish) expect(enabledState(r), r.id).toBe('disabled');
  });

  it('enables no dsh ui-* row and no web-app dist server', () => {
    const ui = rows.filter((r: Row) => r.id?.startsWith('ui-') || /dsh-client-ui-/.test(r.name ?? ''));
    expect(ui.length).toBeGreaterThan(40);
    for (const r of ui) expect(enabledState(r), r.id).toBe('disabled');
    expect(state('web-runtime')).toBe('disabled');
  });

  it('P4.1: the plaintext credentials row is off; orb-keychain (@orb/host/keychain) is the one credentials provider', () => {
    expect(state('credentials')).toBe('disabled');
    expect((byId.get('orb-keychain') as Row).name).toBe('@orb/host/keychain');
    expect(state('orb-keychain')).toBe('enabled');
    const providers = rows.filter(
      (r) => /credentials-local|\/keychain$/.test(r.name ?? '') && enabledState(r) === 'enabled',
    );
    expect(providers.map((r) => r.id)).toEqual(['orb-keychain']);
    expect((byId.get('orb-host') as Row & { inject?: string[] }).inject).toContain('credentials');
  });

  it('mounts orb-host (the `orb` Remote namespace) from the @orb/host/remote subpath with typert injected', () => {
    const host = byId.get('orb-host') as Row & { inject?: string[] };
    expect(host.name).toBe('@orb/host/remote');
    expect(host.inject).toEqual(expect.arrayContaining(['typert', 'orbCanvas', 'orbAgents']));
  });

  it('mounts orb-agents (root agents, `orbAgents`) from @orb/agents/service', () => {
    const agents = byId.get('orb-agents') as Row & { inject?: string[] };
    expect(agents.name).toBe('@orb/agents/service');
    expect(agents.inject).toEqual(expect.arrayContaining(['agents', 'agentPresets', 'orbCanvas']));
    expect(state('orb-agents')).toBe('enabled');
  });

  it('mounts orb-canvas (the `orbCanvas` service, sole board.jsonl writer) from @orb/canvas/service', () => {
    const canvas = byId.get('orb-canvas') as Row;
    expect(canvas.name).toBe('@orb/canvas/service');
    expect(state('orb-canvas')).toBe('enabled');
  });

  it('mounts only the orb preset, which holds no shell/fs/workflow/job tools', () => {
    for (const id of ['preset-standard', 'preset-ptc', 'preset-minimal', 'preset-cordis']) {
      if (byId.has(id)) expect(state(id), id).toBe('disabled');
    }
    const preset = byId.get('orb-preset') as { config: { plugins: Row[] } };
    const names = preset.config.plugins.map((p) => p.name ?? '');
    for (const n of names)
      expect(n).not.toMatch(/tool-(bash|pwsh|fs|workflow|jobs|ralph|cordis|subagent)|terminal|ptc/);
    // P1.8: the board tools (place_card, query_board) are a preset row, so they are agent-scoped.
    // The allow-list guard is a preset row too, so it binds gateway-composed sessions on the preset as well.
    // P3.3: Orb's persona is its own row, which hands the text from packages/orb-agents/src/persona.ts to dsh-persona.
    // P3.4: the team tools (delegate, message_agent, stop_agent, report_progress, send_message) are a preset row too.
    // P3.5: the source tools (web_search, fetch_url, read_source, capture_page) are a preset row too.
    // P4.5: Orb's compose_section (the research document) is a preset row too.
    expect(names).toEqual([
      '@orb/canvas/tools',
      '@orb/canvas/sources',
      // P6.7: the Parallel tools are a preset row too (the `orb-parallel` service row is a host row).
      '@orb/canvas/parallel-tools',
      '@orb/canvas/port',
      '@orb/agents/guard',
      '@orb/agents/tools',
      '@orb/agents/persona',
    ]);
    expect(
      rows.some((r) =>
        [
          '@orb/canvas/tools',
          '@orb/canvas/sources',
          '@orb/canvas/parallel-tools',
          '@orb/canvas/port',
          '@orb/agents/guard',
          '@orb/agents/tools',
        ].includes(r.name ?? ''),
      ),
    ).toBe(false);
  });

  it('P5.1: the base rows Orb never uses are off (boot profile; reasons in packages/orb-bundle/cordis.patch.yml)', () => {
    for (const id of [
      'session-title',
      'session-title-llm',
      'jobs',
      'goal',
      'goal-round-driver',
      'mcp-resources',
      'ptc-runtime',
      'skill',
      'workspace-files',
      'workspace-controller',
      'directory-picker',
      'workspace-changes',
      'plugin-inventory',
      'session-log-download',
      'file-reference-local',
      'session-reference',
      'session-turn-outline',
      'session-stats',
      'shell-env',
      'subagent-fork-in-process',
    ]) {
      expect(state(id), id).toBe('disabled');
    }
    // Needed by rows Orb keeps: commands (file-upload → session-controller) and bash-sandbox (`shell` → permission).
    for (const id of ['commands', 'file-upload', 'session-controller', 'permission', 'user-questions']) {
      expect(state(id), id).toBe('enabled');
    }
    expect(state('bash-sandbox')).toBe('dynamic');
  });

  it('routes the default model to OpenAI gpt-6-luna through llm-pi-ai', () => {
    const def = byId.get('agent-default-model') as { config: { provider: string; model: string } };
    expect(def.config).toMatchObject({ provider: 'openai', model: 'gpt-6-luna' });
  });
});
