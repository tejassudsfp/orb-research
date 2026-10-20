/**
 * Card contract part 3 "Describe" (PRD › Card types): helpers for the plain-text description of a card's content,
 * so an agent can reason about a table, a mockup or a diagram rather than only place it. Each type's own describer
 * lives in its module (`./types/<type>.ts`); `describeCard` (registry.ts) dispatches and clips. Pure and harness-free.
 */

/** Longest description of one card. */
export const DESCRIBE_MAX = 600;

export const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
export const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Cut `text` to `max` characters with an ellipsis. */
export function clip(text: string, max = DESCRIBE_MAX): string {
  const t = oneLine(text);
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** The main text of a text card: `body`, else `text`. */
export const bodyOf = (data: unknown) => {
  const d = (data ?? {}) as Record<string, unknown>;
  return str(d.body) || str(d.text);
};

/**
 * The text a person sees in an HTML mockup: scripts, styles and comments dropped, tags removed, the common entities
 * decoded, whitespace collapsed. Not a sanitiser; only used to describe a design frame to an agent.
 */
export function visibleText(html: string): string {
  return oneLine(
    html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style|template|svg)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)\b[^>]*>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&'),
  );
}

/** The kind of a Mermaid diagram (its first keyword: `flowchart`, `sequenceDiagram`…) and its node labels. */
export function mermaidSummary(source: string): { kind: string; labels: string[] } {
  const lines = source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'));
  const kind = (lines[0] ?? '').split(/\s+/, 1)[0] ?? '';
  const labels = new Set<string>();
  const re = /\[\[?"?([^\]"]+)"?\]?\]|\(\(?"?([^)"]+)"?\)?\)|\{"?([^}"]+)"?\}|:\s*([^:;]+)$/g;
  for (const line of lines.slice(1)) {
    for (const m of line.matchAll(re)) {
      const label = oneLine(m[1] ?? m[2] ?? m[3] ?? m[4] ?? '');
      if (label) labels.add(label);
      if (labels.size >= 24) break;
    }
  }
  return { kind, labels: [...labels] };
}
