/** P2.5 drop/paste ingest: each accepted kind becomes the right card, uploads first, one batch per drop. */
import { describe, expect, it, vi } from 'vitest';
import {
  BoardCommand,
  applyChanges,
  emptyBoard,
  planCommand,
  type AssetRef,
  type BoardState,
  type Card,
} from '@orb/shared';
import { CASCADE, ingest, itemsFromTransfer, noteFromText, type IngestDeps } from '../src/cards/ingest.js';
import { makePdf, makePng } from '../../../scripts/testkit/fixtures.ts';

const file = (name: string, type: string, body: string | Uint8Array) =>
  new File([typeof body === 'string' ? body : new Uint8Array(body)], name, { type });

function deps(): IngestDeps & { uploads: { name: string; mime: string }[] } {
  const uploads: { name: string; mime: string }[] = [];
  let n = 0;
  return {
    uploads,
    upload: vi.fn(async ({ name, mime, body }) => {
      uploads.push({ name, mime });
      const ext =
        {
          'image/png': 'png',
          'application/pdf': 'pdf',
          'text/csv': 'csv',
          'text/markdown': 'md',
          'text/plain': 'txt',
        }[mime as string] ?? 'bin';
      return { path: `assets/01j${n++}-x.${ext}`, name, mime, size: body.size } as AssetRef;
    }),
    pdfSummary: vi.fn(async () => ({
      pages: 7,
      thumb: new Blob([new Uint8Array(makePng(2, 3))], { type: 'image/png' }),
    })),
    imageSize: vi.fn(async () => ({ width: 1600, height: 900 })),
  };
}

/** Apply the ingest command to a board the way the service would (validates every card's data). */
function apply(board: BoardState, command: unknown): Card[] {
  let i = 0;
  const changes = planCommand(board, BoardCommand.parse(command), {
    actor: { kind: 'user' },
    now: 1,
    mintId: (p) => `${p}_${i++}`,
  });
  return Object.values(applyChanges(board, changes).cards);
}

describe('ingest', () => {
  it('turns a mixed drop into one batch of valid cards, cascading from the drop point', async () => {
    const d = deps();
    const items = [
      { kind: 'file', file: file('Chart.png', 'image/png', makePng(4, 4)) },
      { kind: 'file', file: file('Paper.pdf', 'application/pdf', makePdf(2)) },
      { kind: 'file', file: file('scores.csv', '', 'name,score\nAda,3\n') },
      { kind: 'file', file: file('Ideas.md', '', '# Ideas\n\n- one\n') },
      { kind: 'url', url: 'https://www.example.com/post/1' },
      { kind: 'text', text: 'First line\nsecond line' },
    ] as const;
    const { command, errors } = await ingest(items, { x: 1000, y: 500 }, emptyBoard(), d);
    expect(errors).toEqual([]);
    expect(command).toMatchObject({ type: 'batch' });
    const cards = apply(emptyBoard(), command);
    expect(cards.map((c) => c.type)).toEqual(['image', 'file', 'table', 'note', 'source', 'note']);
    const [img, pdf, table, md, src, txt] = cards as [Card, Card, Card, Card, Card, Card];
    expect(img.data).toMatchObject({
      title: 'Chart',
      width: 1600,
      height: 900,
      asset: { mime: 'image/png' },
    });
    expect(img.h).toBe(Math.round(300 * (900 / 1600)) + 56);
    expect(pdf.data).toMatchObject({
      title: 'Paper',
      pages: 7,
      asset: { mime: 'application/pdf' },
      thumb: { mime: 'image/png' },
    });
    expect(table.data).toMatchObject({
      title: 'scores',
      columns: ['name', 'score'],
      rows: [['Ada', '3']],
      totalRows: 1,
    });
    expect(md.data).toMatchObject({
      title: 'Ideas',
      body: '# Ideas\n\n- one',
      asset: { mime: 'text/markdown' },
    });
    expect(src.data).toEqual({ url: 'https://www.example.com/post/1', title: 'example.com/post/1' });
    expect(txt.data).toEqual({ title: 'First line', body: 'second line' });
    // The first card is centred on the drop point, the rest cascade.
    expect(img.x + img.w / 2).toBe(1000);
    expect(pdf.x - (1000 - pdf.w / 2)).toBe(CASCADE);
    // Uploads: the five files plus the PDF's cover thumbnail.
    expect(d.uploads.map((u) => u.mime)).toEqual(
      expect.arrayContaining(['image/png', 'application/pdf', 'text/csv', 'text/markdown', 'image/png']),
    );
    expect(d.uploads).toHaveLength(5);
  });

  it('a single item is one card.added that joins the frame under it', async () => {
    let board = emptyBoard();
    board = applyChanges(
      board,
      planCommand(
        board,
        { type: 'frame.added', frame: { title: 'F', color: 'sky', x: 0, y: 0, w: 800, h: 600 } },
        {
          actor: { kind: 'user' },
          now: 1,
          mintId: () => 'f_1',
        },
      ),
    );
    const { command } = await ingest(
      [{ kind: 'url', url: 'https://x.org' }],
      { x: 300, y: 300 },
      board,
      deps(),
    );
    expect(command).toMatchObject({ type: 'card.added', card: { type: 'source', frameId: 'f_1' } });
  });

  it('refuses unsupported, empty and oversized files without uploading them; the rest still land', async () => {
    const d = deps();
    const big = { name: 'huge.pdf', type: 'application/pdf', size: 60 * 1024 * 1024 } as unknown as File;
    const { command, errors } = await ingest(
      [
        { kind: 'file', file: file('evil.svg', 'image/svg+xml', '<svg/>') },
        { kind: 'file', file: file('empty.txt', 'text/plain', '') },
        { kind: 'file', file: big },
        { kind: 'file', file: file('blank.csv', 'text/csv', '\n\n') },
        { kind: 'text', text: 'kept' },
      ],
      { x: 0, y: 0 },
      emptyBoard(),
      d,
    );
    expect(errors).toHaveLength(4);
    expect(errors.join(' ')).toMatch(/evil\.svg: orb accepts/);
    expect(errors.join(' ')).toMatch(/empty\.txt is empty/);
    expect(errors.join(' ')).toMatch(/huge\.pdf is larger than 50 MB/);
    expect(errors.join(' ')).toMatch(/no rows/);
    expect(d.uploads).toEqual([]);
    expect(command).toMatchObject({ type: 'card.added', card: { type: 'note' } });
  });

  it('a PDF whose summary fails still becomes a File card (no page count, no thumbnail)', async () => {
    const d = deps();
    d.pdfSummary = vi.fn(async () => {
      throw new Error('broken');
    });
    const { command } = await ingest(
      [{ kind: 'file', file: file('x.pdf', 'application/pdf', makePdf(1)) }],
      { x: 0, y: 0 },
      emptyBoard(),
      d,
    );
    const [card] = apply(emptyBoard(), command);
    expect(card!.data).toMatchObject({ pages: null });
    expect(card!.data).not.toHaveProperty('thumb');
  });

  it('an upload failure is reported and nothing is added', async () => {
    const d = deps();
    d.upload = vi.fn(async () => {
      throw new Error('the file is larger than 20 MB');
    });
    const { command, errors } = await ingest(
      [{ kind: 'file', file: file('a.png', 'image/png', makePng(1, 1)) }],
      { x: 0, y: 0 },
      emptyBoard(),
      d,
    );
    expect(command).toBeNull();
    expect(errors).toEqual(['the file is larger than 20 MB']);
  });
});

describe('itemsFromTransfer and noteFromText', () => {
  const dt = (files: File[], data: Record<string, string>) => ({
    files: files as unknown as FileList,
    getData: (t: string) => data[t] ?? '',
  });
  it('files first, then uri-list links, then text (a lone URL is a link)', () => {
    const f = file('a.png', 'image/png', 'x');
    expect(itemsFromTransfer(dt([f], { 'text/plain': 'ignored' }))).toEqual([{ kind: 'file', file: f }]);
    expect(
      itemsFromTransfer(
        dt([], { 'text/uri-list': '# comment\nhttps://a.org\nfile:///etc/hosts\nhttps://b.org' }),
      ),
    ).toEqual([
      { kind: 'url', url: 'https://a.org' },
      { kind: 'url', url: 'https://b.org' },
    ]);
    expect(itemsFromTransfer(dt([], { 'text/plain': ' https://c.org ' }))).toEqual([
      { kind: 'url', url: 'https://c.org' },
    ]);
    expect(itemsFromTransfer(dt([], { 'text/plain': 'hello' }))).toEqual([{ kind: 'text', text: 'hello' }]);
    expect(itemsFromTransfer(dt([], { 'text/plain': '   ' }))).toEqual([]);
  });
  it('noteFromText splits the first line off as the title and caps the text', () => {
    expect(noteFromText('\r\nTitle\r\nBody line\n')).toEqual({ title: 'Title', body: 'Body line' });
    expect(noteFromText('x'.repeat(30_000), 'File').body.length).toBe(20_000);
  });
});
