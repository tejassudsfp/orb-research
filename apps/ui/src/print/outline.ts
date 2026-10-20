/**
 * The research document's print outline (BUILD_PLAN P4.4 `/print/doc`, PRD Port › Research document), pure so it
 * is unit-tested (apps/ui/test/print.unit.test.ts).
 *
 * The standard format: title, a short summary line, one section per frame in board order (then the open board
 * for the whole board), open questions, and a numbered source list. Every card in scope appears as a numbered
 * element in the section of its frame: tables as "Table n", everything else as "Figure n"; question cards are
 * listed under Open questions (as figures there). Source and quote cards with a URL get a number in the source list,
 * and their figures cite it.
 *
 * P4.5 adds the composed prose (`compose_section` paragraphs with card citations) around these figures.
 */
import {
  QuoteData,
  SourceData,
  cardTitle,
  cardUrl,
  citationNumbers,
  portScopeCards,
  reportPlan,
  reportProblems,
  readCardData,
  type BoardState,
  type Card,
  type PortDoc,
  type PrintScope,
} from '@orb/shared';
import { cardsOf, framesInScope } from './plan.js';

export type DocFigure = {
  card: Card;
  kind: 'figure' | 'table';
  /** "Figure 3", "Table 1". */
  label: string;
  caption: string;
  /** Number in the source list this element cites, if any. */
  source?: number;
};

export type DocSection = { id: string; heading: string; figures: DocFigure[] };

export type DocSource = { n: number; title: string; url: string; cardId: string };

export type DocOutline = {
  title: string;
  summary: string;
  sections: DocSection[];
  openQuestions: DocFigure[];
  sources: DocSource[];
  /** Cards shown, in document order. */
  cards: Card[];
};

const urlOf = (card: Card): string | undefined => {
  if (card.type === 'source') return readCardData(SourceData, card.data)?.url;
  if (card.type === 'quote') return readCardData(QuoteData, card.data)?.url;
  return undefined;
};

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function docOutline(board: BoardState, title: string, scope: PrintScope): DocOutline {
  const frames = framesInScope(board, scope);
  const groups: { id: string; heading: string; cards: Card[] }[] = frames.map((f) => ({
    id: f.id,
    heading: f.title,
    cards: cardsOf(board, f.id),
  }));
  if (scope === 'all') {
    const open = cardsOf(board, null);
    if (open.length > 0) groups.push({ id: 'open', heading: 'Open board', cards: open });
  }

  const sources: DocSource[] = [];
  const sourceOf = new Map<string, number>();
  const byUrl = new Map<string, number>();
  for (const card of groups.flatMap((g) => g.cards)) {
    const url = urlOf(card);
    if (!url) continue;
    let n = byUrl.get(url);
    if (n === undefined) {
      n = sources.length + 1;
      byUrl.set(url, n);
      sources.push({ n, title: cardTitle(card), url, cardId: card.id });
    }
    sourceOf.set(card.id, n);
  }

  let figureN = 0;
  let tableN = 0;
  const figure = (card: Card): DocFigure => {
    const kind = card.type === 'table' ? 'table' : 'figure';
    const label = kind === 'table' ? `Table ${++tableN}` : `Figure ${++figureN}`;
    const n = sourceOf.get(card.id);
    return { card, kind, label, caption: cardTitle(card), ...(n !== undefined ? { source: n } : {}) };
  };

  const sections: DocSection[] = [];
  const questions: Card[] = [];
  for (const g of groups) {
    const figures: DocFigure[] = [];
    for (const card of g.cards) {
      if (card.type === 'question') questions.push(card);
      else figures.push(figure(card));
    }
    sections.push({ id: g.id, heading: g.heading, figures });
  }
  const openQuestions = questions.map(figure);
  const cards = [
    ...sections.flatMap((s) => s.figures.map((f) => f.card)),
    ...openQuestions.map((f) => f.card),
  ];
  const summary =
    cards.length === 0
      ? 'Nothing in scope yet.'
      : `From ${plural(cards.length, 'card')} in ${plural(frames.length, 'frame')} of the board, with ${plural(
          sources.length,
          'source',
        )}.`;
  return { title, summary, sections, openQuestions, sources, cards };
}

// ---- P4.5: the composed research document ----

export type DocCite = { n: number; cardId: string; title: string; frame?: string; missing?: true };

export type ComposedParagraph = {
  id: string;
  text: string;
  cites: DocCite[];
  userAuthored?: true;
  edited?: true;
};

export type ComposedSection = {
  id: string;
  heading: string;
  paragraphs: ComposedParagraph[];
  figures: DocFigure[];
};

export type DocReference = { n: number; cardId: string; title: string; url?: string; missing?: true };

export type ComposedOutline = {
  title: string;
  sections: ComposedSection[];
  /** Cards in the document's scope that no section shows: printed after the sections, so every element renders. */
  appendix: DocFigure[];
  references: DocReference[];
  /** Frames of the scope with their card counts (the reading view's "From the board"). */
  frames: { id: string; title: string; color: string; cards: number }[];
  /** Cards shown as figures, in document order. */
  cards: Card[];
  document?: {
    version: number;
    format: 'report' | 'custom';
    problems: string[];
    composedAt: number;
    updatedAt: number;
  };
};

/**
 * The composed document (`port/citations.json`) laid out for reading and print: numbered citations (`citationNumbers`,
 * first citation first), figures and tables numbered through the document, then an appendix with every other card
 * of the scope, and the reference list with links for source and quote cards.
 */
export function composedOutline(doc: PortDoc, board: BoardState): ComposedOutline {
  const numbers = citationNumbers(doc);
  const frameTitle = (card: Card | undefined) =>
    card?.frameId ? board.frames[card.frameId]?.title : undefined;
  let figureN = 0;
  let tableN = 0;
  const shown = new Set<string>();
  const figure = (card: Card, caption: string): DocFigure => {
    const kind = card.type === 'table' ? 'table' : 'figure';
    const label = kind === 'table' ? `Table ${++tableN}` : `Figure ${++figureN}`;
    const n = numbers.get(card.id);
    shown.add(card.id);
    return {
      card,
      kind,
      label,
      caption: caption || cardTitle(card),
      ...(n !== undefined ? { source: n } : {}),
    };
  };
  const sections: ComposedSection[] = doc.sections.map((s) => ({
    id: s.id,
    heading: s.heading,
    paragraphs: s.paragraphs.map((p) => ({
      id: p.id,
      text: p.text,
      cites: p.cardIds.map((id) => {
        const card = board.cards[id];
        const frame = frameTitle(card);
        return {
          n: numbers.get(id)!,
          cardId: id,
          title: card ? cardTitle(card) : 'A card no longer on the board',
          ...(frame ? { frame } : {}),
          ...(card ? {} : { missing: true as const }),
        };
      }),
      ...(p.userAuthored ? { userAuthored: true as const } : {}),
      ...(p.edited ? { edited: true as const } : {}),
    })),
    figures: s.figures.flatMap((f) => {
      const card = board.cards[f.cardId];
      return card && !shown.has(card.id) ? [figure(card, f.caption)] : [];
    }),
  }));
  const scoped = portScopeCards(board, doc.scope).filter((c) => !c.stackedInto);
  const frames = (
    doc.scope === 'all' ? Object.values(board.frames) : doc.scope.flatMap((id) => board.frames[id] ?? [])
  ).map((f) => ({
    id: f.id,
    title: f.title,
    color: f.color,
    cards: scoped.filter((c) => c.frameId === f.id).length,
  }));
  const order = new Map(Object.values(board.frames).map((f, i) => [f.id, i]));
  const appendix = scoped
    .filter((c) => !shown.has(c.id))
    .sort((a, b) => (order.get(a.frameId ?? '') ?? 1e9) - (order.get(b.frameId ?? '') ?? 1e9))
    .map((c) => figure(c, cardTitle(c)));
  const references: DocReference[] = [...numbers].map(([cardId, n]) => {
    const card = board.cards[cardId];
    if (!card) return { n, cardId, title: 'A card no longer on the board', missing: true as const };
    const url = cardUrl(card);
    return { n, cardId, title: cardTitle(card), ...(url ? { url } : {}) };
  });
  const cards = [
    ...sections.flatMap((s) => s.figures.map((f) => f.card)),
    ...(doc.format === 'report' ? [] : appendix.map((f) => f.card)),
  ];
  return {
    title: doc.title,
    sections,
    appendix,
    references,
    frames,
    cards,
    document: {
      version: doc.version,
      format: doc.format ?? 'custom',
      composedAt: doc.composedAt,
      updatedAt: doc.updatedAt,
      problems: doc.format === 'report' ? reportProblems(doc, reportPlan(board, doc.scope), board) : [],
    },
  };
}
