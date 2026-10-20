/**
 * What card UI halves need from the canvas around them (P2.5), provided once per Canvas screen so memoised cards do
 * not re-render while the board pans: asset and design-frame URLs, opening a card (the reader), saving a table sort, following a
 * source link.
 */
import { createContext, useContext } from 'react';
import type { AssetRef, Card, CardView, Dataset, DatasetEdit, ImportFormat, Link, TableSort } from '@orb/shared';

export type ReaderTab = 'card' | 'note' | 'data';

/** A dataset the canvas shows (P6.3): its id, name and size, for the "attach data" picker. */
export type DatasetChoice = { id: string; name: string; rowCount: number };

export type CardActions = {
  /** Same-origin URL of a stored asset of this canvas. */
  assetUrl: (asset: Pick<AssetRef, 'path'>) => string;
  /** P6.2: same-origin URL of a design frame's own page (its version keys the page to the current HTML). */
  designFrameUrl: (cardId: string, version: number) => string;
  /** Open the card in the reader (records `card.opened`). */
  open: (cardId: string, tab?: ReaderTab) => void;
  /** Select a card without opening its reader (canvas checkbox; not needed by print halves). */
  select?: (cardId: string, selected: boolean) => void;
  /** Save a table card's sort (one `card.updated`). */
  sortTable: (cardId: string, sort: TableSort | undefined) => void;
  /** Open a source link in the default browser (records `card.opened`). */
  openLink: (cardId: string, url: string) => void;
  /** P3.6: show the card's provenance ("why it's here": agent, model, time, tool call, the turn). */
  why: (cardId: string) => void;
  /** P3.6: open the thread popover of a card or frame. */
  thread: (id: string) => void;
  /** P6.3: the rows of a dataset, fresh from the sidecar. */
  readDataset: (datasetId: string, signal?: AbortSignal) => Promise<Dataset>;
  /** P6.3: save one edit of a dataset (the sidecar writes it; the cards showing it update). */
  editDataset: (datasetId: string, edit: DatasetEdit) => Promise<{ rev: number; rowCount: number }>;
  /** P6.3: the datasets this canvas's cards show. */
  datasets: () => DatasetChoice[];
  /** P6.3: make a dataset from a file or pasted text. */
  importDataset: (input: { name: string; body: Blob | string; mime?: string; format?: ImportFormat }) => Promise<DatasetChoice>;
  /** P6.3: attach a dataset view to a card, change it, or detach it (`null`). One undoable change. */
  setView: (cardId: string, view: CardView | null) => void;
  /** P6.3: turn a Table card into a Database card (one undoable change). */
  promoteTable: (cardId: string) => Promise<void>;
  /** P6.4: make a Chart card bound to a Table or Database card (one undoable change). */
  chartFrom: (cardId: string) => Promise<void>;
  /** P6.4: replace a card's data (the chart reader's controls; one undoable change). */
  updateData: (cardId: string, data: unknown) => void;
  /** P6.4: the column names of a Table card of this canvas (for a bound chart's pickers). */
  tableColumns: (cardId: string) => string[];
  /** P6.6: replace a card's data (one undoable `card.updated`): a user's edit of an entity, a tick on a checklist. */
  setData: (cardId: string, data: Record<string, unknown>) => void;
  /** P6.6: store an image the user chose (a video thumbnail, a person's photo) in this canvas's assets. */
  uploadImage: (file: File) => Promise<AssetRef>;
  /** P6.7: the user's answer to a research run or watch that waits for the cost guard's OK. */
  confirmParallel: (cardId: string, approve: boolean) => void;
};

const noop = () => undefined;

export const CardActionsContext = createContext<CardActions>({
  assetUrl: () => '',
  designFrameUrl: () => 'about:blank',
  open: noop,
  sortTable: noop,
  openLink: noop,
  why: noop,
  thread: noop,
  readDataset: () => Promise.reject(new Error('no canvas')),
  editDataset: () => Promise.reject(new Error('no canvas')),
  datasets: () => [],
  importDataset: () => Promise.reject(new Error('no canvas')),
  setView: noop,
  promoteTable: () => Promise.reject(new Error('no canvas')),
  chartFrom: () => Promise.reject(new Error('no canvas')),
  updateData: noop,
  tableColumns: () => [],
  setData: noop,
  uploadImage: () => Promise.reject(new Error('no canvas')),
  confirmParallel: noop,
});

export const useCardActions = () => useContext(CardActionsContext);

/**
 * P6.5: the board's links and cards as the synthesis cards read them (a hypothesis counts the links into it; an
 * insight names the cards it cites). Provided once by the Canvas screen; the print trees use the empty default and
 * draw from the card's own data.
 */
export type BoardRefs = { links: Readonly<Record<string, Link>>; cards: Readonly<Record<string, Card>> };

export const BoardRefsContext = createContext<BoardRefs>({ links: {}, cards: {} });

export const useBoardRefs = () => useContext(BoardRefsContext);
