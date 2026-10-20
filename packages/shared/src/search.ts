/**
 * Card text for search (shared by the Home index in orb-canvas and the board's Cmd+F in the UI), and the board
 * search itself (BUILD_PLAN P2.7, PRD Canvas › Search on the board): pure, so it runs in the UI over the folded
 * board with no round trip, and is unit-tested without a DOM.
 */
import type { Card } from './board.js';
import type { BoardState } from './fold.js';
import { FileData, ImageData, TableData, cardTitle, readCardData } from './cards.js';

/** Longest body text indexed / searched per card. */
export const CARD_TEXT_MAX = 30_000;

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** The searchable title and body text of a card: its text fields, table cells, file names, note and why. */
export function cardText(card: Card): { title: string; body: string } {
  const d = (card.data ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of [
    'body',
    'text',
    'summary',
    'quote',
    'url',
    'caption',
    'question',
    'answer',
    // P6.6: entity, product, video, code, math
    'role',
    'org',
    'location',
    'vendor',
    'pricing',
    'platform',
    'author',
    'code',
    'latex',
  ]) {
    if (str(d[key])) parts.push(str(d[key]));
  }
  if (card.type === 'checklist' && Array.isArray(d.items))
    for (const it of d.items as { text?: unknown }[]) if (str(it?.text)) parts.push(str(it.text));
  for (const key of ['facts']) {
    const list = d[key];
    if (Array.isArray(list))
      for (const f of list as { label?: unknown; value?: unknown }[])
        parts.push(`${str(f?.label)} ${str(f?.value)}`);
  }
  for (const key of ['strengths', 'weaknesses'])
    if (Array.isArray(d[key])) parts.push(...(d[key] as unknown[]).map(str).filter(Boolean));
  if (card.type === 'table') {
    const t = readCardData(TableData, card.data);
    if (t) {
      parts.push(t.columns.join(' '));
      let size = 0;
      for (const row of t.rows) {
        const line = row.join(' ');
        size += line.length;
        if (size > CARD_TEXT_MAX) break;
        parts.push(line);
      }
    }
  }
  const asset =
    (card.type === 'image' && readCardData(ImageData, card.data)?.asset) ||
    (card.type === 'file' && readCardData(FileData, card.data)?.asset);
  if (asset) parts.push(asset.name);
  if (card.note) parts.push(card.note);
  if (card.why) parts.push(card.why);
  if (card.detail) parts.push(card.detail);
  const body = parts.join('\n');
  return { title: cardTitle(card), body: body.length > CARD_TEXT_MAX ? body.slice(0, CARD_TEXT_MAX) : body };
}

/** Case- and diacritic-insensitive form of a text (NFKD, marks dropped, lower case). */
export const foldText = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();

/** The words of a query, folded (letters and digits only; at most 16). */
export function searchWords(query: string): string[] {
  return foldText(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, 16);
}

/** Cards within this many world px vertically count as one row in reading order. */
const ROW_BAND = 80;

/**
 * Cards whose text (title + body, see `cardText`) contains every word of `query` (substring, case- and
 * diacritic-insensitive), stacked cards left out, in reading order: top to bottom in bands of 80 px, then left to right. Empty query → [].
 */
export function searchBoard(board: BoardState, query: string): string[] {
  const words = searchWords(query);
  if (words.length === 0) return [];
  const hits: Card[] = [];
  for (const card of Object.values(board.cards)) {
    if (card.stackedInto) continue;
    const { title, body } = cardText(card);
    const text = foldText(`${title}\n${body}`);
    if (words.every((w) => text.includes(w))) hits.push(card);
  }
  hits.sort(
    (a, b) =>
      Math.floor(a.y / ROW_BAND) - Math.floor(b.y / ROW_BAND) ||
      a.x - b.x ||
      a.y - b.y ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  return hits.map((c) => c.id);
}
