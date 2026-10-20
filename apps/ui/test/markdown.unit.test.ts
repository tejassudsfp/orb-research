import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatMarkdown, chatMarkdownUrl } from '../src/components/ChatMarkdown.js';

const render = (text: string) => renderToStaticMarkup(createElement(ChatMarkdown, { text }));

describe('conversation Markdown', () => {
  it('renders headings, emphasis, paragraphs, nested lists and quotes as elements', () => {
    const html = render(
      '# Summary\n\n**Bold** and *italic* with `inline code`.\n\n- First\n  - Nested\n- Second\n\n1. Ordered\n2. Next\n\n> Evidence\n\n---',
    );
    for (const part of [
      '<h3',
      'Summary</h3>',
      '<strong>Bold</strong>',
      '<em>italic</em>',
      '<code>inline code</code>',
      '<ul>',
      '<ol>',
      '<blockquote>',
      '<hr',
    ])
      expect(html).toContain(part);
    expect(html).not.toContain('**Bold**');
  });

  it('renders GFM tables, strikethrough and read-only tasks', () => {
    const html = render(
      '| Option | Cost |\n| --- | ---: |\n| A | 10 |\n\n~~Old~~\n\n- [x] Done\n- [ ] Pending',
    );
    expect(html).toContain('aria-label="Markdown table"');
    expect(html).toContain('<thead>');
    expect(html).toContain('<td>A</td>');
    expect(html).toContain('<del>Old</del>');
    expect(html).toContain('disabled=""');
    expect(html).toContain('checked=""');
    expect(html).toContain('aria-label="Done"');
    expect(html).toContain('aria-label="Pending"');
  });

  it('names nested task checkboxes independently from their own formatted text', () => {
    const html = render('- [x] **Review** evidence\n  - [ ] Verify `source`\n- [ ] Next step');
    expect(html).toContain('aria-label="Review evidence"');
    expect(html).toContain('aria-label="Verify source"');
    expect(html).toContain('aria-label="Next step"');
    expect(html).not.toContain('aria-label="Review evidence Verify source"');
  });

  it('keeps unfinished streaming fences readable and escapes code contents', () => {
    const partial = render('```html\n<script>doNotRun()</script>\n');
    expect(partial).toContain('aria-label="Code block"');
    expect(partial).toContain('&lt;script&gt;doNotRun()&lt;/script&gt;');
    expect(render('**Now complete**')).toContain('<strong>Now complete</strong>');
  });

  it('decodes Markdown entities without turning raw HTML into executable elements', () => {
    const html = render(
      'A &amp; B\n\n<script>doNotRun()</script>\n\n<img src="https://pixel.invalid/track" onerror="doNotRun()">',
    );
    expect(html).toContain('A &amp; B');
    expect(html).not.toContain('&amp;amp;');
    expect(html).not.toMatch(/<(script|img|iframe)\b/);
  });

  it('represents image references as explicit links without loading them', () => {
    const html = render('![Diagram](https://pixel.invalid/track.png)');
    expect(html).toContain('href="https://pixel.invalid/track.png"');
    expect(html).toContain('Image: Diagram');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<link'); // React must not create an image preload either.
  });

  it('removes executable and local URL targets while retaining their labels', () => {
    for (const url of [
      'javascript:alert%281%29',
      'file:///etc/passwd',
      'data:text/html,bad',
      'vbscript:bad',
      '/api/settings',
    ]) {
      const html = render(`[Visible label](${url})`);
      expect(html).toContain('Visible label');
      expect(html).not.toContain('href=');
    }
  });

  it('gives separate messages unique footnote IDs and corresponding fragments', () => {
    const text = 'Claim[^note]\n\n[^note]: Evidence.';
    const html = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement(ChatMarkdown, { text }),
        createElement(ChatMarkdown, { text }),
      ),
    );
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    const fragments = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(6);
    expect(new Set(ids).size).toBe(ids.length);
    expect(fragments.length).toBeGreaterThanOrEqual(4);
    for (const id of fragments) expect(ids).toContain(id);
  });
});

describe('chat link destinations', () => {
  it.each(['https://example.com/a?q=1', 'http://example.com', 'mailto:hello@example.com', '#footnote'])(
    'accepts %s',
    (url) => {
      expect(chatMarkdownUrl(url)).toBeTruthy();
    },
  );
  it.each([
    'javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:image/svg+xml,bad',
    'file:///tmp/secret',
    '//example.com',
    'relative/path',
    'https://user:secret@example.com',
    '',
  ])('rejects %s', (url) => {
    expect(chatMarkdownUrl(url)).toBeUndefined();
  });
});
