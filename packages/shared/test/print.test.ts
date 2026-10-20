/** P4.4 print contracts: print routes (build and parse), export names, snapshot paths. */
import { describe, expect, it } from 'vitest';
import {
  ExportPath,
  SnapshotPath,
  exportFileName,
  parsePrintRoute,
  printRoute,
  snapshotCapturedAt,
  snapshotPath,
  type PrintRequest,
} from '../src/index.js';

describe('print routes', () => {
  it('round-trip through printRoute and parsePrintRoute', () => {
    const canvas: PrintRequest = {
      kind: 'canvas',
      canvasId: 'abc',
      layout: 'poster',
      theme: 'night',
      scope: ['f_1', 'f_b'],
    };
    expect(printRoute(canvas)).toBe('/print/canvas?canvasId=abc&layout=poster&theme=night&scope=f_1%2Cf_b');
    expect(parsePrintRoute(printRoute(canvas))).toEqual(canvas);
    expect(parsePrintRoute(`#${printRoute({ kind: 'doc', canvasId: 'abc' })}`)).toEqual({
      kind: 'doc',
      canvasId: 'abc',
      scope: 'all',
    });
  });
  it('P6.17: the deck route carries only the canvas id', () => {
    expect(printRoute({ kind: 'deck', canvasId: 'abc' })).toBe('/print/deck?canvasId=abc');
    expect(parsePrintRoute('#/print/deck?canvasId=abc')).toEqual({ kind: 'deck', canvasId: 'abc' });
    for (const route of ['/print/deck?canvasId=abc&scope=all', '/print/deck?canvasId=abc&layout=frames', '/print/deck'])
      expect(parsePrintRoute(route), route).toBeUndefined();
  });
  it('refuses unknown keys, repeated keys and bad values', () => {
    for (const route of [
      '/print/poster?canvasId=abc',
      '/print/canvas?canvasId=abc&x=1',
      '/print/canvas?canvasId=abc&scope=all&scope=all',
      '/print/canvas?canvasId=ABC',
      '/print/canvas?canvasId=abc&scope=',
      '/print/doc?canvasId=abc&layout=frames',
      '/print/canvas?canvasId=abc#x',
    ])
      expect(parsePrintRoute(route), route).toBeUndefined();
  });
});

describe('export and snapshot names', () => {
  it('timestamps exports in local time and numbers clashes', () => {
    const at = new Date(2026, 9, 14, 9, 5, 7).getTime();
    expect(exportFileName('canvas', at)).toBe('canvas-2026-10-14-090507.pdf');
    expect(exportFileName('doc', at, 3)).toBe('document-2026-10-14-090507-3.pdf');
    expect(ExportPath.safeParse(`exports/${exportFileName('doc', at, 3)}`).success).toBe(true);
    expect(ExportPath.safeParse('exports/../board.jsonl').success).toBe(false);
    // P6.17: slides.
    expect(exportFileName('deck', at)).toBe('deck-2026-10-14-090507.pdf');
    expect(exportFileName('deck', at, 2, 'pptx')).toBe('deck-2026-10-14-090507-2.pptx');
    expect(ExportPath.safeParse('exports/deck-2026-10-14-090507-2.pptx').success).toBe(true);
    expect(ExportPath.safeParse('exports/deck-2026-10-14-090507.pptx.exe').success).toBe(false);
  });
  it('names snapshots with the card, the version and the capture time', () => {
    const path = snapshotPath('c_01ABC', 2, 1760000000000);
    expect(path).toBe('assets/snapshots/c_01ABC-v2-1760000000000.png');
    expect(SnapshotPath.safeParse(path).success).toBe(true);
    expect(snapshotCapturedAt(path)).toBe(1760000000000);
    expect(SnapshotPath.safeParse('assets/snapshots/../x-v1-1760000000000.png').success).toBe(false);
  });
});
