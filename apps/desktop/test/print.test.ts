/** P4.4 print pipeline helpers of the main process (no Electron): print window URL, Reveal check, page count. */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { countPdfPages, isRevealableExport, printUrl, withTimeout } from '../src/main/printJob.js';
import { makePdf } from '../../../scripts/testkit/fixtures.js';

const origin = 'http://127.0.0.1:43123';

describe('printUrl', () => {
  it('rewrites a print route onto the sidecar origin, in the hash', () => {
    expect(
      printUrl(origin, '/print/canvas?canvasId=2026-10-14-x&layout=poster&theme=night&scope=all').url,
    ).toBe(`${origin}/#/print/canvas?canvasId=2026-10-14-x&layout=poster&theme=night&scope=all`);
    expect(printUrl(origin, '#/print/doc?canvasId=abc&scope=f_1,f_2')).toEqual({
      url: `${origin}/#/print/doc?canvasId=abc&scope=f_1%2Cf_2`,
      request: { kind: 'doc', canvasId: 'abc', scope: ['f_1', 'f_2'] },
    });
    // Defaults are filled in.
    expect(printUrl(origin, '/print/canvas?canvasId=abc').url).toBe(
      `${origin}/#/print/canvas?canvasId=abc&layout=frames&theme=light&scope=all`,
    );
  });
  it('refuses anything else', () => {
    for (const route of [
      '/canvas/abc',
      '/print/canvas',
      '/print/canvas?canvasId=../x',
      '/print/canvas?canvasId=abc&evil=1',
      '/print/canvas?canvasId=abc&canvasId=def',
      '/print/doc?canvasId=abc&theme=night',
      '/print/canvas?canvasId=abc&layout=wide',
      '/print/canvas?canvasId=abc&scope=x_1',
      'https://example.com/#/print/canvas?canvasId=abc',
      42,
      undefined,
    ])
      expect(() => printUrl(origin, route), String(route)).toThrow('invalid print route');
    expect(() => printUrl('http://example.com:1', '/print/doc?canvasId=abc')).toThrow(
      'invalid sidecar origin',
    );
  });
});

describe('isRevealableExport', () => {
  let home: string;
  let file: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'orb-reveal-'));
    const exportsDir = join(home, 'canvases', '2026-10-14-x', 'exports');
    mkdirSync(exportsDir, { recursive: true });
    file = join(exportsDir, 'canvas-2026-10-14-123005.pdf');
    writeFileSync(file, makePdf(1));
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it('accepts an exported PDF of a canvas under the Orb folder', () => {
    expect(isRevealableExport(file, home)).toBe(true);
    const doc = join(home, 'canvases', '2026-10-14-x', 'exports', 'document-2026-10-14-123005-2.pdf');
    writeFileSync(doc, makePdf(1));
    expect(isRevealableExport(doc, home)).toBe(true);
  });
  it('refuses other files, other folders, missing files and paths outside the Orb folder', () => {
    const other = mkdtempSync(join(tmpdir(), 'orb-reveal-other-'));
    try {
      mkdirSync(join(other, 'canvases', 'c', 'exports'), { recursive: true });
      const outside = join(other, 'canvases', 'c', 'exports', 'canvas-2026-10-14-123005.pdf');
      writeFileSync(outside, makePdf(1));
      const board = join(home, 'canvases', '2026-10-14-x', 'board.jsonl');
      writeFileSync(board, '');
      const link = join(home, 'canvases', '2026-10-14-x', 'exports', 'canvas-2026-10-14-999999.pdf');
      symlinkSync('/etc/hosts', link);
      for (const f of [
        outside,
        board,
        link,
        join(home, 'canvases', '2026-10-14-x', 'exports', 'canvas-2026-10-14-000000.pdf'),
        join(home, 'canvases', '2026-10-14-x', 'exports', 'notes.pdf'),
        '/etc/hosts',
        'canvases/2026-10-14-x/exports/canvas-2026-10-14-123005.pdf',
        '',
        42,
      ])
        expect(isRevealableExport(f, home), String(f)).toBe(false);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });
});

describe('countPdfPages / withTimeout', () => {
  it('counts the page objects of a PDF', () => {
    expect(countPdfPages(new Uint8Array(makePdf(1)))).toBe(1);
    expect(countPdfPages(new Uint8Array(makePdf(7)))).toBe(7);
  });
  it('rejects after the time limit and passes results through', async () => {
    await expect(withTimeout(new Promise(() => undefined), 10, 'too slow')).rejects.toThrow('too slow');
    await expect(withTimeout(Promise.resolve(3), 1000, 'x')).resolves.toBe(3);
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'x')).rejects.toThrow('boom');
  });
});
