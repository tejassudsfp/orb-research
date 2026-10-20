/** P2.5 card data: per-type schemas, asset references, CSV import, table sort, card.opened planning. */
import { describe, expect, it } from 'vitest';
import {
  AssetRef,
  BoardCommandError,
  TABLE_LIMITS,
  applyChanges,
  assetMimeOf,
  cardDataSchema,
  cardTitle,
  emptyBoard,
  invertChanges,
  isHttpUrl,
  nextSort,
  parseCsv,
  planCommand,
  sortTableRows,
  sourceTitleOf,
  tableFromCsv,
  type BoardCommand,
  type BoardState,
} from '../src/index.js';

const asset = (path = 'assets/01jabc-photo.png', mime = 'image/png') => ({
  path,
  name: 'photo.png',
  mime,
  size: 10,
});
let n = 0;
const ctx = { actor: { kind: 'user' } as const, now: 1, mintId: (p: 'c' | 'f' | 'l') => `${p}_${n++}` };
const plan = (state: BoardState, cmd: BoardCommand) => applyChanges(state, planCommand(state, cmd, ctx));
const card = (type: string, data: unknown) =>
  ({ type: 'card.added', card: { type, frameId: null, x: 0, y: 0, w: 100, h: 100, data } }) as BoardCommand;

describe('asset references', () => {
  it('accept only assets/<name> paths of an accepted type', () => {
    expect(AssetRef.safeParse(asset()).success).toBe(true);
    for (const path of [
      'assets/../canvas.json',
      'assets/sub/x.png',
      '/etc/hosts',
      'board.jsonl',
      'assets/.upload-1.tmp',
      'assets/',
      'assets/a%2f..png',
    ]) {
      expect(AssetRef.safeParse(asset(path)).success, path).toBe(false);
    }
    expect(AssetRef.safeParse(asset(undefined, 'image/svg+xml')).success).toBe(false);
    expect(AssetRef.safeParse({ ...asset(), extra: 1 }).success).toBe(false);
  });

  it('assetMimeOf: declared type first, then the extension; unsupported → undefined', () => {
    expect(assetMimeOf('a.png', 'image/png')).toBe('image/png');
    expect(assetMimeOf('a.jpg', 'image/jpg')).toBe('image/jpeg');
    expect(assetMimeOf('notes.md', '')).toBe('text/markdown');
    expect(assetMimeOf('data.CSV', 'application/vnd.ms-excel')).toBe('text/csv');
    expect(assetMimeOf('readme.txt', 'text/plain; charset=utf-8')).toBe('text/plain');
    expect(assetMimeOf('paper.pdf', 'application/pdf')).toBe('application/pdf');
    expect(assetMimeOf('x.svg', 'image/svg+xml')).toBeUndefined();
    expect(assetMimeOf('x.exe', 'application/octet-stream')).toBeUndefined();
    expect(assetMimeOf('noext', '')).toBeUndefined();
  });
});

describe('card data schemas', () => {
  it('image, file and table are strict; text types are loose', () => {
    expect(
      cardDataSchema('image').safeParse({ asset: asset(), title: 'Photo', width: 4, height: 3 }).success,
    ).toBe(true);
    expect(cardDataSchema('image').safeParse({ title: 'no asset' }).success).toBe(false);
    expect(cardDataSchema('image').safeParse({ asset: asset('assets/../x.png'), title: 't' }).success).toBe(
      false,
    );
    const pdf = asset('assets/01j-paper.pdf', 'application/pdf');
    expect(cardDataSchema('file').safeParse({ asset: pdf, title: 'Paper', pages: 12 }).success).toBe(true);
    expect(
      cardDataSchema('file').safeParse({ asset: pdf, title: 'Paper', pages: null, thumb: asset() }).success,
    ).toBe(true);
    expect(cardDataSchema('file').safeParse({ asset: pdf, title: 'Paper', pages: -1 }).success).toBe(false);
    expect(cardDataSchema('note').safeParse({ text: 'hi', edited: true }).success).toBe(true);
    expect(cardDataSchema('note').safeParse({ title: 'x'.repeat(501) }).success).toBe(false);
    expect(cardDataSchema('source').safeParse({ title: 'agent source', body: 'b' }).success).toBe(true);
    expect(cardDataSchema('source').safeParse({ url: 'https://example.com/a' }).success).toBe(true);
    expect(cardDataSchema('source').safeParse({ url: 'javascript:alert(1)' }).success).toBe(false);
    expect(cardDataSchema('source').safeParse({ url: 'file:///etc/hosts' }).success).toBe(false);
  });

  it('table rows must match the columns, the sort column must exist, the data stays small', () => {
    const t = { title: 'T', columns: ['a', 'b'], rows: [['1', '2']], totalRows: 1 };
    expect(cardDataSchema('table').safeParse(t).success).toBe(true);
    expect(cardDataSchema('table').safeParse({ ...t, rows: [['1']] }).success).toBe(false);
    expect(cardDataSchema('table').safeParse({ ...t, sort: { column: 2, dir: 'asc' } }).success).toBe(false);
    expect(cardDataSchema('table').safeParse({ ...t, totalRows: 0 }).success).toBe(false);
    const big = {
      ...t,
      rows: Array.from({ length: 1000 }, () => ['x'.repeat(500), 'y'.repeat(500)]),
      totalRows: 1000,
    };
    expect(cardDataSchema('table').safeParse(big).success).toBe(false);
  });

  it('planCommand refuses card data that does not match the type (add and update)', () => {
    expect(() => planCommand(emptyBoard(), card('image', { title: 'x' }), ctx)).toThrow(BoardCommandError);
    expect(() =>
      planCommand(emptyBoard(), card('table', { title: 'x', columns: [], rows: [] }), ctx),
    ).toThrow(/invalid table card data/);
    const board = plan(emptyBoard(), card('image', { asset: asset(), title: 'Photo' }));
    const id = Object.keys(board.cards)[0]!;
    expect(() =>
      planCommand(board, { type: 'card.updated', id, patch: { data: { title: 'lost asset' } } }, ctx),
    ).toThrow(/invalid image card data/);
    const ok = plan(board, {
      type: 'card.updated',
      id,
      patch: { data: { asset: asset(), title: 'Caption' } },
    });
    expect((ok.cards[id]!.data as { title: string }).title).toBe('Caption');
  });

  it('cardTitle: title, else first text line, else the URL, else a placeholder', () => {
    expect(cardTitle({ type: 'note', data: { title: 'T', body: 'b' } })).toBe('T');
    expect(cardTitle({ type: 'note', data: { text: 'first\nsecond' } })).toBe('first');
    expect(cardTitle({ type: 'source', data: { url: 'https://x.org' } })).toBe('https://x.org');
    expect(cardTitle({ type: 'note', data: {} })).toBe('Untitled note');
  });
});

describe('card.opened (P2.5)', () => {
  it('plans one card.opened change for an existing card; unknown ids are refused; it has no inverse', () => {
    const board = plan(emptyBoard(), card('note', { title: 'n' }));
    const id = Object.keys(board.cards)[0]!;
    const changes = planCommand(board, { type: 'card.opened', id }, ctx);
    expect(changes).toEqual([{ type: 'card.opened', data: { id } }]);
    expect(applyChanges(board, changes).cards[id]!.opened).toBe(true);
    expect(invertChanges(board, changes)).toEqual([]);
    expect(() => planCommand(board, { type: 'card.opened', id: 'c_missing' }, ctx)).toThrow(/no card/);
  });
});

describe('CSV import', () => {
  it('parses quotes, doubled quotes, quoted line breaks, CRLF, BOM and a final newline', () => {
    expect(parseCsv('﻿a,b,c\r\n1,"x, y","say ""hi"""\n2,"line\nbreak",\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x, y', 'say "hi"'],
      ['2', 'line\nbreak', ''],
    ]);
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(parseCsv('a\tb\n1\t2\r3\t4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
    expect(parseCsv('')).toEqual([]);
  });

  it('tableFromCsv: header row, padded/cut rows, blank headers named, limits kept, totalRows counts all', () => {
    const t = tableFromCsv('name,,score\nAda,x,3,extra\nBob\n\n', 'Scores');
    expect(t.columns).toEqual(['name', 'Column 2', 'score']);
    expect(t.rows).toEqual([
      ['Ada', 'x', '3'],
      ['Bob', '', ''],
    ]);
    expect(t.totalRows).toBe(2);
    expect(cardDataSchema('table').safeParse(t).success).toBe(true);

    const many = ['h', ...Array.from({ length: 5000 }, (_, i) => String(i))].join('\n');
    const big = tableFromCsv(many, 'Big');
    expect(big.rows.length).toBe(TABLE_LIMITS.rows);
    expect(big.totalRows).toBe(5000);
    const wide = tableFromCsv(
      `${Array.from({ length: 80 }, (_, i) => `c${i}`).join(',')}\n${'y'.repeat(900)}`,
      'W',
    );
    expect(wide.columns.length).toBe(TABLE_LIMITS.columns);
    expect(wide.rows[0]![0]!.length).toBe(TABLE_LIMITS.cell);
    const heavy = tableFromCsv(
      ['h1,h2', ...Array.from({ length: 1000 }, () => `${'z'.repeat(500)},${'w'.repeat(500)}`)].join('\n'),
      'Heavy',
    );
    expect(cardDataSchema('table').safeParse(heavy).success).toBe(true);
    expect(heavy.rows.length).toBeLessThan(1000);
    // As ingest builds it: cut before the upload, then the stored CSV's ref (long file name) and a later sort
    // are added; the card must still fit the table schema.
    const longName = `${'"'.repeat(125)}${'q'.repeat(125)}.csv`; // quotes double once JSON-escaped
    // Rows sized so the cut lands exactly on the budget tableFromCsv keeps.
    const title = 'q'.repeat(250);
    const budget =
      TABLE_LIMITS.bytes - (JSON.stringify({ title, columns: ['h1', 'h2', 'h3'] }).length + 2048);
    // A row of three cells costs its characters + 11 (brackets, quotes, commas, separator).
    let full = Math.floor(budget / 1000);
    if (budget - full * 1000 < 11) full -= 1;
    const rest = budget - full * 1000 - 11;
    const part = (n: number, i: number) => 'z'.repeat(Math.max(0, Math.min(500, n - i * 500)));
    const rowsCsv = [
      ...Array.from({ length: full }, () => `${'z'.repeat(330)},${'w'.repeat(330)},${'v'.repeat(329)}`),
      `${part(rest, 0)},${part(rest, 1)},${part(rest, 2)}`,
      'tail,row,x',
    ];
    const cut = tableFromCsv(['h1,h2,h3', ...rowsCsv].join('\n'), title);
    expect(cut.rows.length).toBe(full + 1);
    const withAsset = {
      ...cut,
      asset: {
        path: `assets/01jaaaaaaaaaaaaaaaaaaaaaaa-${'q'.repeat(48)}.csv`,
        name: longName,
        mime: 'text/csv',
        size: 9_999_999,
      },
      sort: { column: 2, dir: 'desc' },
    };
    expect(cardDataSchema('table').safeParse(withAsset).success).toBe(true);
    expect(() => tableFromCsv('\n\n', 'Empty')).toThrow(/no rows/);
  });
});

describe('table sort', () => {
  const rows = [
    ['b', '10'],
    ['a', '9'],
    ['', '1,200'],
    ['C', 'n/a'],
    ['a2', '-3'],
  ];
  it('sorts numbers numerically, text naturally, empties last; stable; desc reverses', () => {
    expect(sortTableRows(rows, undefined)).toEqual([0, 1, 2, 3, 4]);
    expect(sortTableRows(rows, { column: 1, dir: 'asc' }).map((i) => rows[i]![1])).toEqual([
      '-3',
      '9',
      '10',
      '1,200',
      'n/a',
    ]);
    expect(sortTableRows(rows, { column: 0, dir: 'asc' }).map((i) => rows[i]![0])).toEqual([
      'a',
      'a2',
      'b',
      'C',
      '',
    ]);
    expect(sortTableRows(rows, { column: 0, dir: 'desc' }).map((i) => rows[i]![0])).toEqual([
      'C',
      'b',
      'a2',
      'a',
      '',
    ]);
  });
  it('a header click cycles ascending → descending → off; another column starts ascending', () => {
    expect(nextSort(undefined, 1)).toEqual({ column: 1, dir: 'asc' });
    expect(nextSort({ column: 1, dir: 'asc' }, 1)).toEqual({ column: 1, dir: 'desc' });
    expect(nextSort({ column: 1, dir: 'desc' }, 1)).toBeUndefined();
    expect(nextSort({ column: 1, dir: 'desc' }, 0)).toEqual({ column: 0, dir: 'asc' });
  });
});

describe('source URLs', () => {
  it('isHttpUrl and sourceTitleOf', () => {
    expect(isHttpUrl(' https://www.example.com/a/b ')).toBe(true);
    expect(isHttpUrl('http://x.org')).toBe(true);
    expect(isHttpUrl('see https://x.org')).toBe(false);
    expect(isHttpUrl('ftp://x.org')).toBe(false);
    expect(isHttpUrl('not a url')).toBe(false);
    expect(sourceTitleOf('https://www.example.com/papers/attention/')).toBe('example.com/papers/attention');
    expect(sourceTitleOf('https://arxiv.org/')).toBe('arxiv.org');
  });
});

describe('describeCardData (query_board)', () => {
  it('describes each user card type in plain text', async () => {
    const { describeCardData } = await import('../src/index.js');
    const pdf = asset('assets/01j-p.pdf', 'application/pdf');
    expect(
      describeCardData({ type: 'image', data: { asset: asset(), title: 'Chart', width: 4, height: 3 } }),
    ).toBe('Image "Chart" (photo.png, 4×3).');
    expect(describeCardData({ type: 'file', data: { asset: pdf, title: 'Paper', pages: 12 } })).toBe(
      'File "Paper" (photo.png, 12 pages).',
    );
    expect(
      describeCardData({
        type: 'table',
        data: { title: 'T', columns: ['a', 'b'], rows: [['1', '2']], totalRows: 9 },
      }),
    ).toBe('Table with columns a, b; 9 rows. First rows: 1 | 2');
    expect(describeCardData({ type: 'source', data: { url: 'https://x.org', title: 'x' } })).toBe(
      'https://x.org',
    );
    expect(describeCardData({ type: 'doc', data: { title: 't', body: 'b'.repeat(900) } })).toHaveLength(500);
    expect(describeCardData({ type: 'note', data: { text: 'hello' } })).toBe('hello');
  });
});
