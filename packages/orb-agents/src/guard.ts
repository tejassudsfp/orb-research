/**
 * The defence-in-depth tool guard (BUILD_PLAN §2.4), and the Cordis row `orb-tool-guard` (`@orb/agents/guard`)
 * that installs it.
 *
 * The row sits in the `plugins` list of the `orb` agent preset (packages/orb-bundle/cordis.patch.yml), next to the
 * board tools. A preset's rows mount once in the preset's own scope, and `ToolRuntime.guardReason` walks the
 * calling agent's whole scope chain (dsh-tools/lib/index.js:2928-2935), so the guard binds EVERY agent bound to the
 * preset, whoever composed it: `orbAgents` (create/resume) and the gateway's session-controller (`session/create`,
 * and the resume behind `session/prompt` etc., whose `composeAgent` only mounts the preset:
 * dsh-api-session-controller/lib/index.js:358-372, :398-411). `orbAgents` also installs it on the agent's own ctx.
 *
 * P3.3: the row's guard applies the CALLER's allow-list (Orb, Scout, Critic or Builder, from canvas.json by session
 * id), so the children of P3.4, which share the preset scope, are bound by their own lists.
 *
 * A dsh guard denies by returning a reason string (dsh-tools/lib/types/index.d.ts:522, `ToolGuard`), and no other
 * guard can force-allow a denied call.
 */
import { AgentName, isToolAllowed } from '@orb/shared';

export function orbToolGuard(role: AgentName) {
  return (execution: { readonly name: string }): string | undefined =>
    isToolAllowed(role, execution.name)
      ? undefined
      : `tool "${execution.name}" is not available to the ${role} agent`;
}

/**
 * P3.3: one guard for every agent on the preset, per caller role. The role comes from the caller's identity
 * (`exec.agent.id`, the session id) through `roleOf` (orbCanvas.roleOfSession: canvas.json's root and child ids);
 * a session that is not a known canvas agent gets `fallback`'s allow-list. Guards are synchronous
 * (dsh-tools/lib/types/index.d.ts:522), so the lookup is too.
 */
export function roleToolGuard(roleOf: (sessionId: string) => AgentName | undefined, fallback: AgentName) {
  return (execution: {
    readonly name: string;
    readonly agent?: { readonly id: string };
  }): string | undefined => {
    const role = (execution.agent && roleOf(execution.agent.id)) || fallback;
    return orbToolGuard(role)(execution);
  };
}

export const name = 'orb-tool-guard';
export const inject = ['tools', 'orbCanvas'];

export type OrbToolGuardConfig = {
  /** The allow-list for a caller that is not a known canvas agent (BUILD_PLAN §2.4). Default `orb`. */
  agent?: AgentName;
};

export function apply(ctx: any, config: OrbToolGuardConfig = {}) {
  const fallback = AgentName.parse(config.agent ?? 'orb');
  const roleOf = (sessionId: string): AgentName | undefined => ctx.orbCanvas?.roleOfSession?.(sessionId);
  ctx.tools.guard(roleToolGuard(roleOf, fallback));
}
