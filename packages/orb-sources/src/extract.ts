/**
 * Text extraction for `fetch_url` and `read_source` (BUILD_PLAN P3.5):
 * - HTML → readable Markdown: linkedom parses the page, links and images are made absolute against the final URL,
 *   Mozilla Readability picks the article (or the whole body when it finds none), turndown writes Markdown;
 * - PDF → text with pdf.js (Node legacy build), one `--- page n ---` marker per page so agents can cite pages;
 * - text → as is (decoded with the declared charset).
 * Scripts, styles and forms never reach the output. Pure: no harness imports.
 */
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
import { SourceError } from './errors.js';

/** Most characters of text kept per source (agents read it in 8k chunks). */
export const MAX_SOURCE_CHARS = 2_000_000;
/** Most PDF pages read. */
export const MAX_PDF_PAGES = 1_000;

export type Extracted = {
  title: string;
  /** Markdown (HTML), plain text with page markers (PDF), or the text itself. */
  text: string;
  byline?: string;
  siteName?: string;
  publishedTime?: string;
  excerpt?: string;
  /** PDF only: its page count. */
  pdfPages?: number;
  /** True when the text was cut at MAX_SOURCE_CHARS or MAX_PDF_PAGES. */
  truncated: boolean;
};

export function decodeText(bytes: Uint8Array, charset?: string): string {
  let decoder: InstanceType<typeof TextDecoder>;
  try {
    decoder = new TextDecoder(charset ?? 'utf-8');
  } catch {
    decoder = new TextDecoder('utf-8');
  }
  return decoder.decode(bytes);
}

/** The charset an HTML page declares in a `<meta>` near its top, if the header named none. */
export function metaCharset(bytes: Uint8Array): string | undefined {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
  return /<meta[^>]+charset\s*=\s*["']?([A-Za-z0-9_-]+)/i.exec(head)?.[1]?.toLowerCase();
}

const clip = (text: string): { text: string; truncated: boolean } =>
  text.length > MAX_SOURCE_CHARS
    ? { text: text.slice(0, MAX_SOURCE_CHARS), truncated: true }
    : { text, truncated: false };

const squeeze = (s: string) => s.replace(/\n{3,}/g, '\n\n').trim();

const titleFromUrl = (url: string) => {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).at(-1) ?? '');
    return last || u.hostname;
  } catch {
    return url;
  }
};

/** HTML → Markdown article. */
export function htmlToMarkdown(html: string, url: string): Extracted {
  const { document } = parseHTML(html);
  for (const el of document.querySelectorAll(
    'script, style, noscript, template, iframe, object, embed, form',
  ))
    el.remove();
  const absolutise = (selector: string, attr: string) => {
    for (const el of document.querySelectorAll(selector)) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      try {
        const abs = new URL(v, url);
        if (abs.protocol === 'http:' || abs.protocol === 'https:') el.setAttribute(attr, abs.href);
        else el.removeAttribute(attr);
      } catch {
        el.removeAttribute(attr);
      }
    }
  };
  absolutise('a[href]', 'href');
  absolutise('img[src]', 'src');
  const docTitle = (document.querySelector('title')?.textContent ?? '').replace(/\s+/g, ' ').trim();
  // The page's single <h1> is usually the headline; Readability's title heuristic splits titles on any hyphen
  // ("Solid-state …" → "state …"), so the h1 wins when there is exactly one of a sensible length.
  const h1s = document.querySelectorAll('h1');
  const h1 = h1s.length === 1 ? (h1s[0]!.textContent ?? '').replace(/\s+/g, ' ').trim() : '';
  let article: ReturnType<Readability['parse']>;
  try {
    article = new Readability(document as any, { charThreshold: 200 }).parse();
  } catch {
    article = null;
  }
  const turndown = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
  });
  turndown.remove(['script', 'style', 'noscript'] as any);
  let markdown: string;
  if (article?.content) markdown = turndown.turndown(article.content);
  else {
    // No article found (a landing page, a list): keep the whole body as Markdown.
    const { document: again } = parseHTML(html);
    for (const el of again.querySelectorAll(
      'script, style, noscript, template, iframe, object, embed, form, nav, footer',
    ))
      el.remove();
    markdown = turndown.turndown(again.body?.innerHTML ?? again.toString());
  }
  const title = (
    (h1.length >= 3 && h1.length <= 200 ? h1 : '') ||
    article?.title ||
    docTitle ||
    titleFromUrl(url)
  )
    .trim()
    .slice(0, 500);
  const body = squeeze(markdown);
  // Readability drops the headline from the article body; put it back so every page starts with its title.
  const { text, truncated } = clip(/^#\s/.test(body) ? body : `# ${title}\n\n${body}`);
  return {
    title,
    text,
    ...(article?.byline ? { byline: article.byline.trim().slice(0, 300) } : {}),
    ...(article?.siteName ? { siteName: article.siteName.trim().slice(0, 300) } : {}),
    ...(article?.publishedTime ? { publishedTime: String(article.publishedTime).slice(0, 64) } : {}),
    ...(article?.excerpt ? { excerpt: article.excerpt.trim().slice(0, 500) } : {}),
    truncated,
  };
}

/** Plain text (or JSON, XML, Markdown) as is. */
export function textSource(raw: string, url: string): Extracted {
  const firstLine = raw
    .split('\n')
    .find((l) => l.trim())
    ?.replace(/^#+\s*/, '')
    .trim();
  const { text, truncated } = clip(raw.replace(/\r\n/g, '\n').trim());
  return {
    title: (firstLine && firstLine.length <= 200 ? firstLine : titleFromUrl(url)).slice(0, 500),
    text,
    truncated,
  };
}

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsModule: Promise<PdfJs> | undefined;
const loadPdfJs = () => (pdfjsModule ??= import('pdfjs-dist/legacy/build/pdf.mjs'));

/** PDF → text, page by page. */
export async function pdfToText(bytes: Uint8Array, url: string, signal?: AbortSignal): Promise<Extracted> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({
    // pdf.js takes ownership of (and may detach) the buffer it is given.
    data: new Uint8Array(bytes),
    disableFontFace: true,
    useSystemFonts: false,
    stopAtErrors: false,
    verbosity: 0,
  });
  const onAbort = () => void task.destroy();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    let doc;
    try {
      doc = await task.promise;
    } catch (err) {
      if (signal?.aborted) throw signal.reason;
      throw new SourceError('EXTRACT_FAILED', `the PDF could not be read: ${(err as Error).message}`, {
        cause: err,
      });
    }
    const pages = doc.numPages;
    const read = Math.min(pages, MAX_PDF_PAGES);
    const parts: string[] = [];
    let chars = 0;
    let truncated = pages > read;
    for (let n = 1; n <= read; n++) {
      signal?.throwIfAborted();
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let line = '';
      const lines: string[] = [];
      for (const item of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
        if (typeof item.str !== 'string') continue;
        line += item.str;
        if (item.hasEOL) {
          lines.push(line);
          line = '';
        }
      }
      if (line) lines.push(line);
      page.cleanup();
      const pageText = `--- page ${n} ---\n${lines
        .map((l) => l.trimEnd())
        .join('\n')
        .trim()}`;
      parts.push(pageText);
      chars += pageText.length + 2;
      if (chars > MAX_SOURCE_CHARS) {
        truncated = true;
        break;
      }
    }
    let title = '';
    try {
      const meta = await doc.getMetadata();
      const info = meta.info as { Title?: unknown } | undefined;
      if (typeof info?.Title === 'string') title = info.Title.trim();
    } catch {
      // no metadata
    }
    if (!title) {
      const first = parts[0]
        ?.split('\n')
        .slice(1)
        .find((l) => l.trim());
      title = first && first.length <= 200 ? first.trim() : titleFromUrl(url);
    }
    const clipped = clip(parts.join('\n\n'));
    return {
      title: title.slice(0, 500),
      text: clipped.text,
      pdfPages: pages,
      truncated: truncated || clipped.truncated,
    };
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await task.destroy().catch(() => {});
  }
}

/** Extract any fetched kind. */
export async function extract(
  kind: 'html' | 'text' | 'pdf',
  bytes: Uint8Array,
  url: string,
  options: { charset?: string; signal?: AbortSignal } = {},
): Promise<Extracted> {
  if (kind === 'pdf') return pdfToText(bytes, url, options.signal);
  const charset = options.charset ?? (kind === 'html' ? metaCharset(bytes) : undefined);
  const raw = decodeText(bytes, charset);
  return kind === 'html' ? htmlToMarkdown(raw, url) : textSource(raw, url);
}
