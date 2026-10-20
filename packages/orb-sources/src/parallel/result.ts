/** Pure mappers from Parallel's wire shapes to what orb shows and stores (spec §14.4). Harness-free. */
import type { Basis } from './client.js';

export type Citation = {
  url: string;
  title?: string;
  excerpt?: string;
  /** Result fields this source supports. */
  fields: string[];
  confidence?: 'high' | 'medium' | 'low';
};

/** Normalise a URL for deduplication: no fragment, no `www.`, no tracking params, no trailing slash. */
export function normalizeUrl(input: string): string {
  try {
    const u = new URL(input);
    u.hash = '';
    u.hostname = u.hostname.replace(/^www\./, '');
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|ref$|ref_src$)/i.test(k)) u.searchParams.delete(k);
    let out = u.href;
    if (out.endsWith('/') && u.pathname === '/' && !u.search) out = out.slice(0, -1);
    else if (u.pathname.length > 1 && u.pathname.endsWith('/')) out = out.replace(/\/(\?|$)/, '$1');
    return out;
  } catch {
    return input;
  }
}

const httpUrl = (u: unknown): string | undefined => {
  if (typeof u !== 'string') return undefined;
  try {
    const url = new URL(u);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const RANK = { high: 3, medium: 2, low: 1 } as const;

/**
 * The deduplicated citations of a Basis list, most-cited first (by how many fields cite them). A source's summary is
 * its first excerpt, else the reasoning of the first field that cites it; its confidence is the best of its fields.
 */
export function citationsOf(basis: readonly Basis[] | undefined): Citation[] {
  const by = new Map<string, Citation & { n: number }>();
  for (const b of basis ?? []) {
    for (const c of b.citations ?? []) {
      const url = httpUrl(c?.url);
      if (!url) continue;
      const key = normalizeUrl(url);
      let entry = by.get(key);
      if (!entry) {
        entry = { url, fields: [], n: 0 };
        by.set(key, entry);
      }
      if (!entry.title && typeof c.title === 'string' && c.title) entry.title = c.title.slice(0, 300);
      const excerpt = c.excerpts?.find((e) => typeof e === 'string' && e.trim());
      if (!entry.excerpt) {
        const text = excerpt ?? (typeof b.reasoning === 'string' ? b.reasoning : '');
        if (text.trim()) entry.excerpt = text.replace(/\s+/g, ' ').trim().slice(0, 300);
      }
      if (b.field && !entry.fields.includes(b.field)) entry.fields.push(b.field.slice(0, 120));
      if (b.confidence && (!entry.confidence || RANK[b.confidence] > RANK[entry.confidence])) entry.confidence = b.confidence;
      entry.n++;
    }
  }
  return [...by.values()]
    .sort((a, b) => b.fields.length - a.fields.length || b.n - a.n)
    .map(({ n: _n, ...c }) => ({ ...c, fields: c.fields.slice(0, 20) }));
}

/** One line per field: its confidence and why (low-confidence fields are the ones the UI flags). */
export function fieldsOf(basis: readonly Basis[] | undefined, limit = 40) {
  return (basis ?? [])
    .filter((b) => b.field)
    .slice(0, limit)
    .map((b) => ({
      field: b.field.slice(0, 160),
      ...(b.confidence ? { confidence: b.confidence } : {}),
      ...(typeof b.reasoning === 'string' && b.reasoning ? { reasoning: b.reasoning.replace(/\s+/g, ' ').slice(0, 600) } : {}),
    }));
}

/** A readable digest of a Task output: the report text, or `field: value` lines of JSON. */
export function outputText(content: unknown, max = 12_000): string {
  const text = typeof content === 'string' ? content : digestJson(content);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function digestJson(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value)) return value.map((v) => digestJson(v, depth + 1)).filter(Boolean).join('; ');
  const pad = '  '.repeat(depth);
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) =>
      v !== null && typeof v === 'object' && !Array.isArray(v) ? `${pad}${k}:\n${digestJson(v, depth + 1)}` : `${pad}${k}: ${digestJson(v, depth + 1)}`,
    )
    .join('\n');
}

/** Trim search excerpts for the model (spec §14.2: about 1,500 to 3,000 characters per result). */
export function trimExcerpts(excerpts: readonly string[] | undefined, max = 2000): string {
  const joined = (excerpts ?? []).filter(Boolean).join('\n\n').trim();
  return joined.length > max ? `${joined.slice(0, max - 1)}…` : joined;
}

export type AnswerCitation = { url: string; title?: string; span?: string };

/** A Responses API answer: the text, its url_citations (with the cited span), the searches it made, its id. */
export function mapResponses(body: any): { answer: string; citations: AnswerCitation[]; searches: string[]; reads: string[]; responseId?: string } {
  const output: any[] = Array.isArray(body?.output) ? body.output : [];
  const searches: string[] = [];
  const reads: string[] = [];
  for (const item of output) {
    if (item?.type !== 'web_search_call') continue;
    const a = item.action;
    if (a?.type === 'search') {
      for (const q of Array.isArray(a.queries) ? a.queries : [a.query]) if (typeof q === 'string' && q) searches.push(q);
    } else if (a?.type === 'open_page' && typeof a.url === 'string') reads.push(a.url);
  }
  let answer = '';
  const citations: AnswerCitation[] = [];
  const seen = new Set<string>();
  for (const item of output) {
    if (item?.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part?.type !== 'output_text' || typeof part.text !== 'string') continue;
      answer += (answer ? '\n' : '') + part.text;
      const offset = answer.length - part.text.length;
      for (const a of Array.isArray(part.annotations) ? part.annotations : []) {
        if (a?.type !== 'url_citation') continue;
        const url = httpUrl(a.url);
        if (!url) continue;
        const key = normalizeUrl(url);
        if (seen.has(key)) continue;
        seen.add(key);
        const span =
          Number.isInteger(a.start_index) && Number.isInteger(a.end_index)
            ? answer.slice(offset + a.start_index, offset + a.end_index).replace(/\s+/g, ' ').trim().slice(0, 400)
            : undefined;
        citations.push({ url, ...(typeof a.title === 'string' && a.title ? { title: a.title.slice(0, 300) } : {}), ...(span ? { span } : {}) });
      }
    }
  }
  return { answer, citations, searches, reads, ...(typeof body?.id === 'string' ? { responseId: body.id } : {}) };
}
