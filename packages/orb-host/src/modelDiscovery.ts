/** Read the configured provider's model directory, independently of pi-ai's release-time catalog. */
import { DiscoveredModel, type ProviderApi } from '@orb/shared';

export const MODEL_ENDPOINTS: Record<string, { baseURL: string; api: ProviderApi }> = {
  openai: { baseURL: 'https://api.openai.com/v1', api: 'openai-responses' },
  deepseek: { baseURL: 'https://api.deepseek.com', api: 'openai-completions' },
  anthropic: { baseURL: 'https://api.anthropic.com', api: 'anthropic-messages' },
  openrouter: { baseURL: 'https://openrouter.ai/api/v1', api: 'openai-completions' },
};

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_MODELS = 4000;
const positive = (...values: unknown[]): number | undefined =>
  values.find((v): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v > 0);

async function boundedJson(response: Response): Promise<any> {
  if (Number(response.headers.get('content-length')) > MAX_BYTES) {
    await response.body?.cancel();
    throw new Error('The model list is too large.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The provider returned an empty model response.');
  let total = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BYTES) throw new Error('The model list is too large.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('The provider did not return a JSON model list.');
  }
}

function entryOf(raw: any, provider?: string): DiscoveredModel | undefined {
  if (typeof raw?.id !== 'string') return;
  const id = raw.id.trim();
  if (!id || id.length > 200 || [...id].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127))
    return;
  const output = raw.output_modalities ?? raw.architecture?.output_modalities;
  const input = raw.input_modalities ?? raw.architecture?.input_modalities;
  if (Array.isArray(output) && !output.includes('text')) return;
  if (Array.isArray(input) && !input.includes('text')) return;
  // OpenAI's directory also lists embeddings, moderation and dedicated image/audio/video APIs.
  if (
    provider === 'openai' &&
    !Array.isArray(output) &&
    (/^(text-embedding|text-search|text-similarity|text-moderation|omni-moderation|tts-|whisper-|dall-e|sora|gpt-image|babbage|davinci|curie|ada(?:-|$))/.test(
      id,
    ) ||
      /(?:^|-)(audio|realtime|transcribe|tts)(?:-|$)/.test(id))
  )
    return;
  const contextWindow = positive(
    raw.contextWindow,
    raw.context_window,
    raw.context_length,
    raw.max_input_tokens,
    raw.limit?.context,
  );
  const maxTokens = positive(
    raw.maxOutputTokens,
    raw.max_output_tokens,
    raw.maxTokens,
    raw.max_tokens,
    raw.limit?.output,
    raw.top_provider?.max_completion_tokens,
  );
  const name = raw.name ?? raw.display_name ?? raw.displayName;
  const created = typeof raw.created === 'number' ? raw.created : Date.parse(raw.created_at ?? '') / 1000;
  return DiscoveredModel.parse({
    id,
    ...(typeof name === 'string' && name.trim() ? { name: name.trim().slice(0, 500) } : {}),
    ...(contextWindow ? { contextWindow } : {}),
    ...(maxTokens ? { maxTokens } : {}),
    ...(Array.isArray(input)
      ? { inputModalities: input.filter((m: unknown) => m === 'text' || m === 'image') }
      : {}),
    ...(Number.isFinite(created) && created >= 0 ? { created } : {}),
  });
}

export async function fetchProviderModels(options: {
  baseURL: string;
  api: ProviderApi;
  provider?: string;
  apiKey?: string;
  headers?: Record<string, string>;
  signal: AbortSignal;
}): Promise<DiscoveredModel[]> {
  const root = new URL(options.baseURL);
  if (!['http:', 'https:'].includes(root.protocol) || root.username || root.password)
    throw new Error('Use an HTTP or HTTPS provider URL without embedded credentials.');
  const prefix = root.pathname.replace(/\/+$/, '');
  root.pathname =
    options.api === 'anthropic-messages' ? `${prefix.replace(/\/v1$/, '')}/v1/models` : `${prefix}/models`;
  const headers = new Headers(options.headers);
  headers.set('accept', 'application/json');
  if (options.api === 'anthropic-messages') {
    headers.set('anthropic-version', '2023-06-01');
    if (options.apiKey) headers.set('x-api-key', options.apiKey);
    root.searchParams.set('limit', '1000');
  } else if (options.apiKey) headers.set('authorization', `Bearer ${options.apiKey}`);
  const models = new Map<string, DiscoveredModel>();
  const cursors = new Set<string>();
  for (let page = 0; page < 20; page++) {
    options.signal.throwIfAborted();
    const response = await fetch(root, { headers, signal: options.signal, redirect: 'error' });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(
        `Model refresh failed (HTTP ${response.status}). ${response.status === 401 || response.status === 403 ? 'Check this provider’s API key and access.' : 'Try again; the saved model list is unchanged.'}`,
      );
    }
    const body = await boundedJson(response);
    const rows = Array.isArray(body?.data)
      ? body.data
      : body?.models && typeof body.models === 'object' && !Array.isArray(body.models)
        ? Object.entries(body.models)
            .filter(([, v]) => v && typeof v === 'object')
            .map(([id, v]) => ({ ...(v as object), id }))
        : undefined;
    if (!rows) throw new Error('The provider returned no readable model directory.');
    for (const raw of rows) {
      const model = entryOf(raw, options.provider);
      if (model && !models.has(model.id)) models.set(model.id, model);
      if (models.size > MAX_MODELS)
        throw new Error('The provider lists more than 4,000 models; the saved list is unchanged.');
    }
    if (body.has_more !== true)
      return [...models.values()].sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
    const cursor = body.last_id ?? rows.at(-1)?.id;
    if (typeof cursor !== 'string' || !cursor || cursors.has(cursor))
      throw new Error('The provider repeated a model-list page.');
    cursors.add(cursor);
    root.searchParams.set('after_id', cursor);
  }
  throw new Error('The provider model directory did not finish; the saved list is unchanged.');
}
