/** P3.5: extraction (Readability + turndown, pdf.js text), the source cache and its ≤8k chunks. */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  CHUNK_CHARS,
  SourceCache,
  chunkText,
  extract,
  htmlToMarkdown,
  sourceIdOf,
  urlKey,
} from '../src/index.js';
import { makePdf } from '../../../scripts/testkit/fixtures.js';

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const ARTICLE = `<!doctype html><html><head><title>Solid-state batteries | Example News</title>
<meta name="author" content="A. Writer"><script>window.evil = 1</script><style>p{color:red}</style></head>
<body><nav><a href="/">Home</a> <a href="/about">About</a></nav>
<article><h1>Solid-state batteries are close</h1><p class="byline">By A. Writer</p>
<p>Solid-state cells replace the liquid electrolyte with a solid one. ${'They promise higher energy density and better safety. '.repeat(12)}</p>
<h2>What is left</h2><p>Manufacturing at scale is the open problem. See <a href="/report.pdf">the report</a> and
<a href="javascript:alert(1)">this</a>.</p><img src="/chart.png" alt="Chart"><form><input name="q"></form>
<script>document.write('injected')</script></article><footer>© Example</footer></body></html>`;

describe('extraction', () => {
  it('turns an article into Markdown with absolute links and no scripts', () => {
    const out = htmlToMarkdown(ARTICLE, 'https://news.example.com/2026/battery');
    expect(out.title).toMatch(/Solid-state batteries/);
    expect(out.text).toContain('## What is left');
    expect(out.text).toContain('[the report](https://news.example.com/report.pdf)');
    expect(out.text).toContain('![Chart](https://news.example.com/chart.png)');
    expect(out.text).not.toMatch(/javascript:|window\.evil|injected|color:red/);
    expect(out.truncated).toBe(false);
  });

  it('keeps the body of a page that has no article', () => {
    const out = htmlToMarkdown(
      '<html><head><title>List</title></head><body><ul><li>One</li><li>Two</li></ul></body></html>',
      'https://x.example/',
    );
    expect(out.title).toBe('List');
    expect(out.text).toMatch(/One[\s\S]*Two/);
  });

  it('reads PDF text page by page with pdf.js', async () => {
    const out = await extract('pdf', makePdf(3, 'Battery outlook 2026'), 'https://x.example/outlook.pdf');
    expect(out.pdfPages).toBe(3);
    expect(out.text).toContain('--- page 1 ---\nBattery outlook 2026');
    expect(out.text).toContain('--- page 3 ---\nPage 3');
    expect(out.title).toBe('Battery outlook 2026');
  });

  it('refuses a broken PDF with a clear error', async () => {
    await expect(
      extract('pdf', new TextEncoder().encode('%PDF-1.4 garbage'), 'https://x.example/a.pdf'),
    ).rejects.toMatchObject({
      code: 'EXTRACT_FAILED',
    });
  });

  it('decodes text with the declared or meta charset', async () => {
    const latin = Buffer.from(
      '<html><head><meta charset="iso-8859-1"><title>Caf\xe9</title></head><body><p>Cr\xe8me</p></body></html>',
      'latin1',
    );
    const out = await extract('html', latin, 'https://x.example/');
    expect(out.title).toBe('Café');
    const txt = await extract('text', Buffer.from('# Notes\nline two'), 'https://x.example/notes.md');
    expect(txt).toMatchObject({ title: 'Notes', text: '# Notes\nline two' });
  });
});

describe('chunks and cache', () => {
  it('chunks are at most 8k characters and rebuild the text exactly', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 40_000, unit: fc.constantFrom('a', 'b', ' ', '\n', 'é', 'xyz ') }),
        (text) => {
          const chunks = chunkText(text);
          expect(chunks.join('')).toBe(text);
          for (const c of chunks) expect(c.length).toBeLessThanOrEqual(CHUNK_CHARS);
          if (text.length > 0) for (const c of chunks) expect(c.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('writes <id>.md and <id>.json and serves pages of it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'orb-sources-'));
    dirs.push(dir);
    const cache = SourceCache.forCanvas(dir);
    const text = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} ${'word '.repeat(150)}`).join('\n\n');
    const url = 'https://example.com/long#section';
    const meta = await cache.write(
      {
        key: urlKey(url),
        url,
        finalUrl: 'https://example.com/long/',
        chain: [url, 'https://example.com/long/'],
        kind: 'html',
        title: 'Long',
        bytes: 1234,
        truncated: false,
        fetchedAt: 1,
      },
      text,
    );
    expect(meta.id).toBe(sourceIdOf('https://example.com/long'));
    expect(readdirSync(join(dir, 'assets', 'sources')).sort()).toEqual([`${meta.id}.json`, `${meta.id}.md`]);
    expect(readFileSync(join(dir, 'assets', 'sources', `${meta.id}.md`), 'utf8')).toBe(text);
    expect(meta.pages).toBe(chunkText(text).length);
    expect(meta.pages).toBeGreaterThan(1);
    const p2 = await cache.page(meta.id, 2);
    expect(p2?.text).toBe(chunkText(text)[1]);
    expect(p2?.text.length).toBeLessThanOrEqual(8000);
    await expect(cache.page(meta.id, meta.pages + 1)).rejects.toThrow(/does not exist/);
    // Found by its own URL, its final URL, or any URL of its redirect chain.
    expect((await cache.findUrl('https://example.com/long'))?.id).toBe(meta.id);
    expect((await cache.findUrl('https://example.com/long/'))?.id).toBe(meta.id);
    expect(await cache.findUrl('https://example.com/other')).toBeUndefined();
    expect(await cache.page('../../etc/passwd')).toBeUndefined();
  });
});
