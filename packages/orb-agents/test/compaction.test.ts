import { expect, it } from 'vitest';
import { summarizerRoute } from '../src/compaction.js';

it('summarizes on the selected route without rewriting history or breaking private session receivers', () => {
  class Session {
    #history = ['saved history'];
    requestHeader() {
      return { config: { provider: 'openai', model: 'old', maxTokens: 2000 } };
    }
    toolHistory() {
      return this.#history;
    }
  }
  const session = new Session();
  const agent = { id: 'old-child', session, options: { provider: 'openai', model: 'old' } };
  const routed = summarizerRoute(agent, { provider: 'chatgpt-plan', model: 'selected' });
  expect(routed.session.requestHeader().config).toEqual({
    provider: 'chatgpt-plan',
    model: 'selected',
    maxTokens: 2000,
  });
  expect(routed.options).toEqual({ provider: 'chatgpt-plan', model: 'selected' });
  expect(routed.session.toolHistory()).toEqual(['saved history']);
  expect(session.requestHeader().config.provider).toBe('openai');
  expect(agent.options.provider).toBe('openai');
});
