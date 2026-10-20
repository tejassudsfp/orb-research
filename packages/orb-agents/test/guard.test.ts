import { AGENT_TOOLS } from '@orb/shared';
import { describe, expect, it } from 'vitest';
import { apply as applyGuardRow, orbToolGuard, roleToolGuard } from '../src/guard.js';

describe('orbToolGuard (BUILD_PLAN §2.4 allow-list)', () => {
  const guard = orbToolGuard('orb');

  it('allows every tool on the Orb allow-list', () => {
    for (const name of AGENT_TOOLS.orb) expect(guard({ name }), name).toBeUndefined();
  });

  it('denies shell, fs, workflow, job, cordis, subagent and any unlisted tool', () => {
    for (const name of [
      'bash',
      'pwsh',
      'run_code',
      'workflow',
      'ralph',
      'job_start',
      'cordis_eval',
      'read',
      'write',
      'edit',
      'glob',
      'grep',
      'subagent',
      'subagent_fork',
      'web_search',
      'report_progress',
      'anything_else',
    ]) {
      expect(guard({ name }), name).toMatch(/not available to the orb agent/);
    }
  });

  it('applies the caller role: scout may not delegate, critic may not fetch', () => {
    expect(orbToolGuard('scout')({ name: 'delegate' })).toBeDefined();
    expect(orbToolGuard('scout')({ name: 'fetch_url' })).toBeUndefined();
    expect(orbToolGuard('critic')({ name: 'fetch_url' })).toBeDefined();
  });

  it('the preset row registers the guard for its configured role on ctx.tools', () => {
    const guards: Array<(e: { name: string }) => string | undefined> = [];
    const ctx = { tools: { guard: (g: (e: { name: string }) => string | undefined) => guards.push(g) } };
    applyGuardRow(ctx, { agent: 'orb' });
    applyGuardRow(ctx);
    expect(guards).toHaveLength(2);
    for (const g of guards) {
      expect(g({ name: 'place_card' })).toBeUndefined();
      expect(g({ name: 'todo_write' })).toMatch(/not available to the orb agent/);
    }
    expect(() => applyGuardRow(ctx, { agent: 'nobody' as never })).toThrow();
  });

  it("P3.3: the preset guard applies the caller's role from its session id, else the fallback list", () => {
    const roles: Record<string, 'orb' | 'scout' | 'critic' | 'builder'> = {
      s1: 'scout',
      c1: 'critic',
      o1: 'orb',
    };
    const guard = roleToolGuard((id) => roles[id], 'orb');
    const call = (name: string, id?: string) => guard({ name, ...(id ? { agent: { id } } : {}) });
    expect(call('add_frame', 'o1')).toBeUndefined();
    expect(call('add_frame', 's1')).toBe('tool "add_frame" is not available to the scout agent');
    expect(call('web_search', 's1')).toBeUndefined();
    expect(call('consolidate_cards', 'c1')).toBeUndefined();
    expect(call('consolidate_cards', 'o1')).toMatch(/not available to the orb agent/);
    expect(call('fetch_url', 'c1')).toMatch(/not available to the critic agent/);
    // Unknown sessions and calls without an agent get the fallback list; forbidden tools are never allowed.
    expect(call('add_frame', 'nobody')).toBeUndefined();
    expect(call('add_frame')).toBeUndefined();
    expect(call('bash', 'o1')).toMatch(/not available/);
  });

  it('the preset row reads roles from orbCanvas.roleOfSession', () => {
    const guards: Array<(e: { name: string; agent?: { id: string } }) => string | undefined> = [];
    const ctx = {
      tools: { guard: (g: (typeof guards)[number]) => guards.push(g) },
      orbCanvas: { roleOfSession: (id: string) => (id === 'b1' ? 'builder' : undefined) },
    };
    applyGuardRow(ctx);
    expect(guards[0]!({ name: 'write_design_frame', agent: { id: 'b1' } })).toBeUndefined();
    expect(guards[0]!({ name: 'add_link', agent: { id: 'b1' } })).toMatch(
      /not available to the builder agent/,
    );
    expect(guards[0]!({ name: 'add_link', agent: { id: 'x' } })).toBeUndefined();
  });
});
