/**
 * What every card type's print half shares (PRD card contract part 5 "Print", BUILD_PLAN P4.4; P6.2 card platform):
 * the print context (asset URLs, design-frame snapshots and pages), the two print modes, and small pieces (body
 * text, a real link). Each type's print half lives with its UI half in src/cards/types/<type>.tsx.
 */
import { createContext, type ReactNode } from 'react';
import type { Card } from '@orb/shared';
import p from './print.module.css';

/** `canvas`: the card at its board place and size; `figure`: a numbered element of a research document. */
export type PrintMode = 'canvas' | 'figure';

export type Snapshot = { url: string; capturedAt: number };

export type PrintContext = {
  assetUrl: (path: string) => string;
  /** Design-frame snapshots taken for this print, by card id. */
  snapshots: ReadonlyMap<string, Snapshot>;
  /** P6.2: the URL of a design frame's own page (shown live when there is no snapshot). */
  frameUrl: (cardId: string, version: number) => string;
};

export const PrintCtx = createContext<PrintContext>({
  assetUrl: () => '',
  snapshots: new Map(),
  frameUrl: () => 'about:blank',
});

export type PrintHalf = (props: { card: Card; mode: PrintMode }) => ReactNode;

export const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The body text of a text card: `body`, `summary`, or a text card's lines after its title. */
export function printBodyOf(card: Card): string {
  const d = (card.data ?? {}) as Record<string, unknown>;
  const body = text(d.body) || text(d.summary);
  if (body) return body;
  if (typeof d.title !== 'string' && typeof d.text === 'string')
    return d.text.split('\n').slice(1).join('\n');
  return '';
}

export const printedAt = (at: number): string =>
  new Date(at).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const PrintBody = ({ children }: { children: ReactNode }) =>
  children ? <p className={p.body}>{children}</p> : null;

export function PrintLink({ url }: { url: string }) {
  return (
    <a className={p.link} href={url} data-testid="print-link">
      {url}
    </a>
  );
}

/** The default print half: the card's body text. */
export const PrintText: PrintHalf = ({ card }) => <PrintBody>{printBodyOf(card)}</PrintBody>;
