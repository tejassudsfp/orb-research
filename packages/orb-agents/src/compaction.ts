/** Keep auxiliary summaries on the same selected billing route as the next conversation request. */
import { BasicCompactionEngine } from '@deepseek-ai/dsh-compaction-basic';
import type { ModelRoute } from '@orb/shared';

/** A read-only route view; the real session and its historical request headers are never rewritten. */
export function summarizerRoute(agent: any, route: ModelRoute): any {
  const session = new Proxy(agent.session, {
    get(target, key) {
      if (key === 'requestHeader')
        return () => {
          const header = target.requestHeader();
          return header ? { ...header, config: { ...header.config, ...route } } : undefined;
        };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return new Proxy(agent, {
    get(target, key) {
      if (key === 'session') return session;
      if (key === 'options') return { ...target.options, ...route };
      const value = Reflect.get(target, key, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

export class OrbCompaction extends BasicCompactionEngine {
  protected override async summarize(input: any, agent: any, signal?: AbortSignal) {
    const route = await (this.ctx as any).get('orbAgents')?.routeForSession(agent.id);
    return super.summarize(input, route ? summarizerRoute(agent, route) : agent, signal);
  }
}

export default OrbCompaction;
