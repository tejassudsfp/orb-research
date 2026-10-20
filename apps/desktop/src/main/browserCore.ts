import { BROWSER } from '@orb/shared';
import { checkCaptureUrl } from './captureFilter.js';

// Fixed code in an isolated world. A model can supply only a query or URL, never code, cookies or a selector.
export const BROWSER_SNAPSHOT = `(() => {
  const text = (document.body?.innerText || '').slice(0, 12000);
  const title = document.title || '';
  const challenge = /^(?:just a moment|access denied|verify (?:you are|you're) human|robot check|attention required)/i.test(title) ||
    (!!document.querySelector('form#challenge-form, #anomaly-modal, form[action*="sorry/index"], #b_captcha')) ||
    (text.length < 5000 && !document.querySelector('article') && /unusual traffic from your computer network|verify that you are human|press and hold.*human/i.test(text));
  const candidates = Array.from(document.querySelectorAll('.b_algo h2 a, .result__a')).slice(0, 30).map(a => ({
    url: a.href, title: (a.innerText || a.textContent || '').trim().slice(0, 500),
    snippet: (a.closest('.b_algo, .result')?.innerText || '').trim().slice(0, 1500)
  }));
  const clone = document.documentElement.cloneNode(true);
  for (const node of clone.querySelectorAll('script, style, noscript, iframe, object, embed, template, form')) node.remove();
  const html = clone.outerHTML;
  const pending = text.length < 3000 && /(?:^|\\n)\\s*(?:loading(?:\\.\\.\\.|…)?|please wait)[\\s.!]*(?:\\n|$)/im.test(text);
  return { url: location.href, title: title.slice(0, 500), challenge, pending, textLength: text.trim().length,
    html: html.slice(0, ${BROWSER.maxHtmlChars}), truncated: html.length > ${BROWSER.maxHtmlChars}, candidates };
})()`;

export type Snapshot = {
  url: string;
  title: string;
  challenge: boolean;
  pending: boolean;
  textLength: number;
  html: string;
  truncated: boolean;
  candidates: Array<{ url: string; title: string; snippet: string }>;
};

export function searchTarget(query: string, engine: 'Bing' | 'DuckDuckGo'): string {
  const url = new URL(
    engine === 'Bing' ? 'https://www.bing.com/search' : 'https://html.duckduckgo.com/html/',
  );
  url.searchParams.set('q', query);
  return url.href;
}

/** Search-engine tracking redirects become the original, validated public source URL. */
export function searchSource(raw: string): string | undefined {
  try {
    let url = new URL(raw);
    if (url.hostname === 'www.bing.com' && url.pathname === '/ck/a') {
      const value = url.searchParams.get('u');
      if (value?.startsWith('a1')) url = new URL(Buffer.from(value.slice(2), 'base64').toString('utf8'));
    } else if (
      (url.hostname === 'duckduckgo.com' || url.hostname.endsWith('.duckduckgo.com')) &&
      url.pathname.startsWith('/l/')
    ) {
      url = new URL(url.searchParams.get('uddg') ?? '');
    }
    if (
      ['bing.com', 'duckduckgo.com'].some(
        (host) => url.hostname === host || url.hostname.endsWith('.' + host),
      )
    )
      return undefined;
    checkCaptureUrl(url.href);
    url.hash = '';
    return url.href.length <= 4096 ? url.href : undefined;
  } catch {
    return undefined;
  }
}
