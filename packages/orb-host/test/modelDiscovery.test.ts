import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { fetchProviderModels } from '../src/modelDiscovery.js';

const servers: Server[] = [];
async function server(handle: (req: IncomingMessage, res: ServerResponse) => void) {
  const s = createServer(handle);
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(s.address() as { port: number }).port}`;
}
afterEach(async () => {
  for (const s of servers.splice(0)) {
    s.closeAllConnections();
    await new Promise<void>((r) => s.close(() => r()));
  }
});
const json = (res: ServerResponse, body: unknown) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

it('uses the authenticated endpoint and deployment prefix, includes new IDs and ignores non-chat APIs', async () => {
  const url = await server((req, res) => {
    expect(req.url).toBe('/deployment/v1/models');
    expect(req.headers.authorization).toBe('Bearer private-test-key');
    json(res, {
      data: [
        { id: 'text-embedding-next' },
        { id: 'gpt-image-next' },
        { id: 'gpt-live-transcribe' },
        { id: 'new-chat-2027', created: 40 },
        { id: 'old-chat', created: 10 },
        { id: 'new-chat-2027' },
        {},
        { id: 4 },
        { id: 'bad\nid' },
      ],
    });
  });
  const models = await fetchProviderModels({
    baseURL: url + '/deployment/v1/',
    api: 'openai-responses',
    provider: 'openai',
    apiKey: 'private-test-key',
    signal: AbortSignal.timeout(3000),
  });
  expect(models.map((m) => m.id)).toEqual(['new-chat-2027', 'old-chat']);
});

it('follows Anthropic pagination, preserves headers, sizes and release order', async () => {
  const paths: string[] = [];
  const url = await server((req, res) => {
    paths.push(req.url!);
    expect(req.headers['x-api-key']).toBe('anthropic-test-key');
    expect(req.headers['anthropic-version']).toBe('2023-06-01');
    expect(req.headers['x-deployment']).toBe('one');
    json(
      res,
      paths.length === 1
        ? {
            data: [
              {
                id: 'claude-new',
                display_name: 'New Claude',
                created_at: '2027-01-01T00:00:00Z',
                max_input_tokens: 200000,
                max_output_tokens: 64000,
              },
            ],
            has_more: true,
            last_id: 'claude-new',
          }
        : { data: [{ id: 'claude-old' }], has_more: false },
    );
  });
  const models = await fetchProviderModels({
    baseURL: url + '/prefix/v1/',
    api: 'anthropic-messages',
    apiKey: 'anthropic-test-key',
    headers: { 'x-deployment': 'one' },
    signal: AbortSignal.timeout(3000),
  });
  expect(paths).toEqual(['/prefix/v1/models?limit=1000', '/prefix/v1/models?limit=1000&after_id=claude-new']);
  expect(models[0]).toMatchObject({
    id: 'claude-new',
    name: 'New Claude',
    contextWindow: 200000,
    maxTokens: 64000,
  });
  expect(models).toHaveLength(2);
});

it('reads OpenRouter/DeepSeek capacities and modalities, while excluding non-text output models', async () => {
  const url = await server((_, res) =>
    json(res, {
      data: [
        {
          id: 'vendor/latest',
          context_length: 160000,
          top_provider: { max_completion_tokens: 32000 },
          architecture: { input_modalities: ['text', 'image', 'file'], output_modalities: ['text'] },
        },
        { id: 'deepseek-next', context_window: 128000, max_output_tokens: 16000, input_modalities: ['text'] },
        { id: 'vendor/image', architecture: { output_modalities: ['image'] } },
      ],
    }),
  );
  const models = await fetchProviderModels({
    baseURL: url,
    api: 'openai-completions',
    signal: AbortSignal.timeout(3000),
  });
  expect(models).toEqual([
    { id: 'vendor/latest', contextWindow: 160000, maxTokens: 32000, inputModalities: ['text', 'image'] },
    { id: 'deepseek-next', contextWindow: 128000, maxTokens: 16000, inputModalities: ['text'] },
  ]);
});

it('keeps gateway aliases rather than substituting the nested canonical ID', async () => {
  const url = await server((_, res) =>
    json(res, { models: { 'local-alias': { id: 'canonical', name: 'Local' }, metadata: true } }),
  );
  expect(
    await fetchProviderModels({ baseURL: url, api: 'openai-completions', signal: AbortSignal.timeout(3000) }),
  ).toEqual([{ id: 'local-alias', name: 'Local' }]);
});

it('does not echo error bodies or send credentials through a redirect', async () => {
  let redirected = false;
  const target = await server((_, res) => {
    redirected = true;
    json(res, { data: [] });
  });
  const url = await server((req, res) => {
    if (req.url?.startsWith('/bad')) {
      res.writeHead(401);
      res.end('private-test-key');
    } else {
      res.writeHead(302, { location: target + '/models' });
      res.end();
    }
  });
  const options = {
    api: 'openai-completions' as const,
    apiKey: 'private-test-key',
    signal: AbortSignal.timeout(3000),
  };
  await expect(fetchProviderModels({ ...options, baseURL: url + '/bad' })).rejects.toThrow('HTTP 401');
  await expect(fetchProviderModels({ ...options, baseURL: url })).rejects.toThrow();
  expect(redirected).toBe(false);
});

it('refuses oversized, malformed and cyclic paginated replies instead of returning a partial catalog', async () => {
  const url = await server((req, res) => {
    if (req.url?.startsWith('/large')) {
      res.writeHead(200, { 'content-length': 5 * 1024 * 1024 });
      res.end();
    } else if (req.url?.startsWith('/malformed')) json(res, { unrelated: [] });
    else json(res, { data: [{ id: 'same' }], has_more: true, last_id: 'same' });
  });
  for (const prefix of ['large', 'malformed', 'cycle'])
    await expect(
      fetchProviderModels({
        baseURL: url + '/' + prefix,
        api: 'openai-completions',
        signal: AbortSignal.timeout(3000),
      }),
    ).rejects.toThrow();
});

it('aborts a stalled provider request', async () => {
  const url = await server(() => {});
  await expect(
    fetchProviderModels({ baseURL: url, api: 'openai-completions', signal: AbortSignal.timeout(30) }),
  ).rejects.toThrow();
});
