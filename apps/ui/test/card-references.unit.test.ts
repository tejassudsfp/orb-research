import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { Card } from '@orb/shared';
import { BoardRefsContext } from '../src/cards/context.js';
import { CardReferences } from '../src/cards/CardReferences.js';

it('shows local evidence by title instead of opaque card ids, while escaping untrusted prose', () => {
  const card = { id: 'c_evidence', type: 'source', data: { title: 'Independent evidence' } } as Card;
  const html = renderToStaticMarkup(
    createElement(
      BoardRefsContext.Provider,
      { value: { cards: { c_evidence: card }, links: {} } },
      createElement(CardReferences, { text: 'Evidence (c_evidence). <script>untrusted</script>' }),
    ),
  );
  expect(html).toContain('Independent evidence</button>');
  expect(html).toContain('data-card-id="c_evidence"');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
});

it('identifies unavailable references without inventing a title or dropping their surrounding text', () => {
  const html = renderToStaticMarkup(
    createElement(CardReferences, { text: 'See (c_removed); more analysis follows.' }),
  );
  expect(html).toContain('Unavailable reference');
  expect(html).not.toContain('c_removed');
  expect(html).toContain('more analysis follows.');
});
