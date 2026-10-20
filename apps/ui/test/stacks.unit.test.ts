import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { Card } from '@orb/shared';
import { BoardRefsContext } from '../src/cards/context.js';
import { doc } from '../src/cards/types/doc.js';
import { source } from '../src/cards/types/source.js';

const card = (id: string, type: Card['type'], data: unknown) => ({ id, type, data }) as Card;

it('lists every stack member as an action, uses live titles and explains unavailable members', () => {
  const member = card('c_live', 'source', { title: '<Live title>', summary: 'Evidence' });
  const stack = card('c_stack', 'doc', {
    title: 'Evidence',
    body: 'Two records',
    stack: {
      count: 2,
      items: [
        { id: member.id, type: 'source', title: 'Old title' },
        { id: 'c_missing', type: 'quote', title: 'Unavailable quotation' },
      ],
    },
  });
  const html = renderToStaticMarkup(
    createElement(
      BoardRefsContext.Provider,
      { value: { cards: { [member.id]: member }, links: {} } },
      createElement(doc.Reader!, { card: stack }),
    ),
  );
  expect(html.match(/data-testid="stack-member"/g)).toHaveLength(2);
  expect(html).toContain('&lt;Live title&gt;');
  expect(html).not.toContain('Old title');
  expect(html).toContain('disabled=""');
  expect(html).toContain('Card unavailable');
});

it('preserves a source summary and every excerpt in the expanded reader, including a source without a URL', () => {
  const item = card('c_source', 'source', {
    title: 'Evidence',
    summary: 'Full source notes',
    excerpts: ['First excerpt', 'Second excerpt'],
  });
  const html = renderToStaticMarkup(createElement(source.Reader!, { card: item }));
  expect(html).toContain('Full source notes');
  expect(html).toContain('First excerpt');
  expect(html).toContain('Second excerpt');
  expect(html).not.toContain('Nothing more');
});
