/**
 * P6.6 entity, media and technical cards in the renderer: the bundled syntax highlighter and KaTeX, the video card
 * that is never embedded, the checklist's boxes and the print halves. Static markup, no DOM.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Card, CardType } from '@orb/shared';
import { CARD_UI } from '../src/cards/types/index.js';
import { highlightCode, languageOf } from '../src/cards/media/highlight.js';
import { renderMath } from '../src/cards/media/math.js';
import { PrintCard } from '../src/print/PrintCard.js';

const card = (type: CardType, data: unknown, extra: Partial<Card> = {}): Card => ({
  id: `c_${type}`,
  type,
  frameId: null,
  x: 0,
  y: 0,
  w: 340,
  h: 260,
  data,
  provenance: { kind: 'user', at: 1 },
  ...extra,
});
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);
const body = (c: Card, lod: 'full' | 'compact' = 'full') => html(createElement(CARD_UI[c.type].Body, { card: c, lod }));
const reader = (c: Card) => html(createElement(CARD_UI[c.type].Reader!, { card: c }));
const printed = (c: Card, mode: 'canvas' | 'figure' = 'canvas') => html(createElement(PrintCard, { card: c, mode }));

describe('code', () => {
  it('highlights bundled languages and aliases; unknown ones are escaped text', () => {
    const py = highlightCode('def f(x):\n    return x  # <b>', 'py');
    expect(py.language).toBe('python');
    expect(py.html).toContain('hljs-keyword');
    expect(py.html).not.toContain('<b>');
    expect(languageOf('TSX')).toBe('typescript');
    expect(languageOf('klingon')).toBeUndefined();
    expect(highlightCode('<script>alert(1)</script>', 'klingon').html).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    // A snippet that would run as HTML stays text in a language that has tags, too.
    expect(highlightCode('<img src=x onerror=alert(1)>', 'html').html).not.toContain('<img');
  });

  it('draws the board body, the reader and print with the highlighted source', () => {
    const c = card('code', { title: 'T', language: 'sql', code: 'select 1 from t' });
    expect(body(c)).toContain('data-testid="card-code"');
    expect(body(c)).toContain('hljs-keyword');
    expect(reader(c)).toContain('data-testid="reader-code"');
    expect(printed(c)).toContain('data-testid="print-code"');
  });
});

describe('math', () => {
  it('renders LaTeX with KaTeX and reports a bad formula without throwing', () => {
    const ok = renderMath('\\frac{a}{b}');
    expect(ok.ok && ok.html).toContain('katex');
    const bad = renderMath('\\frac{');
    expect(bad.ok).toBe(false);
    expect(renderMath('  ').ok).toBe(false);
    // `trust` is off: no link or image commands.
    const link = renderMath('\\href{https://evil.test}{x}');
    expect(link.ok ? link.html : '').not.toMatch(/<a\b|href=/);
  });

  it('draws the card, and a bad formula shows its error text', () => {
    expect(body(card('math', { title: 'M', latex: 'x^2' }))).toContain('data-testid="card-math"');
    expect(body(card('math', { title: 'M', latex: '\\frac{' }))).toContain('card-math-error');
    expect(printed(card('math', { title: 'M', latex: 'x^2' }))).toContain('katex');
  });
});

describe('video: opens externally, never embedded', () => {
  const v = card('video', { title: 'Talk', url: 'https://www.youtube.com/watch?v=1', author: 'Acme', duration: '12:30', thumb: { path: 'assets/t.png', name: 't.png', mime: 'image/png', size: 5 } });
  it('draws a thumbnail and an open button, with no iframe, video, embed or object', () => {
    for (const out of [body(v), body(v, 'compact'), reader(v), printed(v), printed(v, 'figure')]) {
      expect(out).not.toMatch(/<(iframe|video|embed|object|audio)\b/i);
    }
    expect(body(v)).toContain('data-testid="video-thumb"');
    expect(body(v)).toContain('data-testid="card-open-link"');
    expect(body(v)).toContain('youtube.com');
    expect(reader(v)).toContain('data-testid="reader-open-link"');
    expect(printed(v)).toContain('data-testid="print-link"');
  });
  it('a card without a thumbnail still draws', () => {
    expect(body(card('video', { title: 'T', url: 'https://youtu.be/x' }))).toContain('No thumbnail');
  });
});

describe('entity and product', () => {
  it('a person without a photo shows initials; an org keeps its shape class', () => {
    expect(body(card('entity', { title: 'Ada Lovelace', kind: 'person', role: 'Analyst' }))).toContain('>AL<');
    expect(body(card('entity', { title: 'Acme', kind: 'org' }))).toContain('Organisation');
  });
  it('a product lists strengths and weaknesses and points at the Data tab', () => {
    const p = card('product', { title: 'P', kind: 'competitor', strengths: ['Fast'], weaknesses: ['Dear'] });
    expect(body(p)).toContain('Competitor');
    expect(body(p)).toContain('Fast');
    expect(reader(p)).toContain('Data tab');
  });
  it('only a user card is editable in the reader', () => {
    const data = { title: 'Ada', kind: 'person' };
    expect(reader(card('entity', data))).toContain('reader-field-title');
    expect(reader(card('entity', data, { provenance: { kind: 'agent', agent: 'scout', model: 'm', sessionId: 's', at: 1 } }))).not.toContain('reader-field-title');
  });
});

describe('checklist', () => {
  const c = card('checklist', {
    title: 'T',
    items: [
      { id: 'i1', text: 'First', done: false },
      { id: 'i2', text: 'Second', done: true },
    ],
  });
  it('draws a checkbox per item with its tick, and the progress', () => {
    const out = body(c);
    expect(out.match(/data-testid="checklist-box"/g)).toHaveLength(2);
    expect(out).toContain('1 of 2 done');
    expect(out).toMatch(/checked=""/);
  });
  it('prints ticked and open boxes', () => {
    const out = printed(c);
    expect(out).toContain('data-testid="print-checklist"');
    expect(out).toContain('✓');
  });
  it('the reader can add items and says who ticks', () => {
    const out = reader(c);
    expect(out).toContain('data-testid="checklist-add"');
    expect(out).toContain('Only you tick them');
  });
});
