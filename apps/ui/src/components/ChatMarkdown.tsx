/** Shared, local-only Markdown for streaming replies, saved chat and card/frame threads. */
import { memo, useId, type MouseEvent } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import s from './ChatMarkdown.module.css';

/** Only explicit web/email links and in-message fragments; no filesystem or executable URLs. */
export function chatMarkdownUrl(value: string): string | undefined {
  if (value.startsWith('#') && value.length > 1) return value;
  try {
    const url = new URL(value);
    if (['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password)
      return url.href;
  } catch {
    // Relative paths have no meaningful destination in a research conversation.
  }
  return undefined;
}

type MarkdownNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: MarkdownNode[];
};

/** GFM emits disabled checkboxes without labels. Name each from its own task, excluding nested tasks. */
function labelTask(node: MarkdownNode) {
  if (node.tagName !== 'li') return;
  const checkboxes: MarkdownNode[] = [];
  const ownText = (child: MarkdownNode): string => {
    if (child.tagName === 'ul' || child.tagName === 'ol') return '';
    if (child.tagName === 'input' && child.properties?.type === 'checkbox') checkboxes.push(child);
    return child.value ?? child.children?.map(ownText).join('') ?? '';
  };
  const label = ownText(node).replace(/\s+/g, ' ').trim() || 'Task';
  for (const checkbox of checkboxes) checkbox.properties!.ariaLabel = label;
}

function fragmentId(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Footnotes in separate messages must never share IDs or change the app's hash router. */
function messageIds({ prefix }: { prefix: string }) {
  return (tree: MarkdownNode) => {
    const nodes: MarkdownNode[] = [];
    const visit = (node: MarkdownNode) => {
      labelTask(node);
      if (node.properties) nodes.push(node);
      node.children?.forEach(visit);
    };
    visit(tree);
    const ids = new Map<string, string>();
    for (const { properties: p } of nodes) if (typeof p?.id === 'string') ids.set(p.id, prefix + p.id);
    for (const { properties: p } of nodes) {
      if (!p) continue;
      if (typeof p.id === 'string') p.id = ids.get(p.id);
      if (typeof p.href === 'string' && p.href.startsWith('#')) {
        const target = ids.get(fragmentId(p.href.slice(1)));
        if (target) p.href = '#' + target;
      }
      for (const key of ['ariaDescribedBy', 'ariaLabelledBy']) {
        const value = p[key];
        if (Array.isArray(value)) p[key] = value.map((id) => ids.get(String(id)) ?? id);
      }
    }
  };
}

function followFragment(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  const root = event.currentTarget.closest('[data-markdown]');
  const id = fragmentId(event.currentTarget.getAttribute('href')!.slice(1));
  const target = root?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`);
  if (target) {
    target.scrollIntoView({ block: 'nearest' });
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
}

const components: Components = {
  a: ({ node: _node, href, children, ...props }) =>
    href ? (
      <a
        {...props}
        href={href}
        target={href.startsWith('#') ? undefined : '_blank'}
        rel="noopener noreferrer"
        onClick={href.startsWith('#') ? followFragment : undefined}
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // An agent's Markdown must not fetch tracking images or remote assets merely by appearing in chat.
  img: ({ src, alt }) =>
    src ? (
      <a href={src} target="_blank" rel="noopener noreferrer">
        {alt ? `Image: ${alt}` : 'Open image'}
      </a>
    ) : (
      <span>{alt}</span>
    ),
  h1: ({ children, id }) => <h3 id={id}>{children}</h3>,
  h2: ({ children, id }) => <h4 id={id}>{children}</h4>,
  h3: ({ children, id }) => <h5 id={id}>{children}</h5>,
  h4: ({ children, id }) => <h6 id={id}>{children}</h6>,
  h5: ({ children, id }) => <h6 id={id}>{children}</h6>,
  h6: ({ children, id }) => <h6 id={id}>{children}</h6>,
  pre: ({ children }) => (
    <pre tabIndex={0} aria-label="Code block">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className={s.tableScroll} role="region" aria-label="Markdown table" tabIndex={0}>
      <table>{children}</table>
    </div>
  ),
};

/** Memoizing completed messages keeps token-by-token parsing limited to the live reply. No raw HTML plugins. */
export const ChatMarkdown = memo(function ChatMarkdown({ text }: { text: string }) {
  const id = useId();
  return (
    <div className={s.markdown} data-markdown="true">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[messageIds, { prefix: `chat-${id}-` }]]}
        components={components}
        urlTransform={chatMarkdownUrl}
      >
        {text}
      </Markdown>
    </div>
  );
});
