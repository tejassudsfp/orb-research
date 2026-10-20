/**
 * The .pptx of a deck (docs/phase6/PLAN.md P6.17), built with pptxgenjs 4.0.1 (exact-pinned) from the deck and the
 * cards. Harness-free and pure apart from the asset reads the caller supplies (`PptxSource`).
 *
 * - Native, editable charts: a Chart card's plotted points become a PowerPoint chart with its data in an embedded
 *   workbook (bar, line, area, scatter, pie), not a picture.
 * - Native tables: Table and Database cards (their preview rows) and Comparison matrices become PowerPoint tables.
 * - Pictures: Image cards, a PDF's first-page thumbnail and the design-frame snapshot (the latest in
 *   `assets/snapshots/`, taken by the print pipeline). Metrics are drawn as a big figure; any other card is its
 *   kind, title and plain text.
 * - Citations: every slide's speaker notes carry the notes Orb wrote plus "Sources: [n] title (card id)"; a Sources
 *   slide (more than one when the list is long) lists every cited card with its URL.
 * - No network: images are passed as data, never as a URL.
 */
import * as pptxModule from 'pptxgenjs';
import {
  DEFAULT_APPEARANCE,
  appearancePalette,
  fontFamilies,
  labelColors,
  themes,
  type Appearance,
  ChartData,
  DatabaseData,
  FileData,
  ImageData,
  MatrixData,
  MetricData,
  SOURCES_SLIDE_ID,
  TableData,
  cardKindLabel,
  cardTitle,
  cardUrl,
  deckCitationNumbers,
  describeCardData,
  matrixTotals,
  readCardData,
  slideNotesText,
  type Card,
  type Deck,
  type Slide,
} from '@orb/shared';

/**
 * pptxgenjs ships CJS-style typings (`export default` in a CJS-typed file), which NodeNext reads as the module itself,
 * so its class and the types of its namespace are taken from the module's `default` here.
 */
type Ctor = typeof pptxModule.default.default;
const defaulted = (pptxModule as unknown as { default: unknown }).default as Ctor | { default: Ctor };
const PptxGenJS: Ctor = 'default' in defaulted ? defaulted.default : defaulted;
type Pres = InstanceType<Ctor>;
type PptxSlide = ReturnType<Pres['addSlide']>;
type PptxTableRow = Parameters<PptxSlide['addTable']>[0][number];
type PptxTableCell = PptxTableRow[number];
type PptxTextProps = Exclude<Parameters<PptxSlide['addText']>[0], string>[number];

/** What the builder needs from the canvas. */
export type PptxSource = {
  appearance?: Appearance;
  cardOf(id: string): Card | undefined;
  /** The bytes of a canvas-relative asset path (`assets/…`), or undefined when it is not there. */
  readAsset(path: string): Promise<Uint8Array | undefined>;
  /** The latest design-frame snapshot of a design card (PNG bytes), or undefined. */
  snapshotOf(cardId: string): Promise<Uint8Array | undefined>;
};

export type PptxResult = {
  data: Uint8Array;
  /** Slides in the file, the Sources slides included. */
  slides: number;
  charts: number;
  tables: number;
  images: number;
};

/** The brand name is always lowercase (P6.1b). */
const WORDMARK = 'orb';
const W = 13.333;
const H = 7.5;
const MARGIN = 0.6;
/** Series colours (the app's chart palette order). */

type Box = { x: number; y: number; w: number; h: number };

const clip = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, Math.max(0, n - 1)).trimEnd()}…`);

/** Natural size of a PNG, JPEG, GIF or WebP (so a picture can be fitted without stretching). */
export function imageSize(b: Uint8Array): { w: number; h: number } | undefined {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { w: dv.getUint32(16), h: dv.getUint32(20) };
  if (b.length > 10 && b[0] === 0x47 && b[1] === 0x49)
    return { w: dv.getUint16(6, true), h: dv.getUint16(8, true) };
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)
        return { w: dv.getUint16(i + 7), h: dv.getUint16(i + 5) };
      i += 2 + dv.getUint16(i + 2);
    }
    return undefined;
  }
  if (b.length > 30 && b[0] === 0x52 && b[8] === 0x57) {
    const tag = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    if (tag === 'VP8X')
      return {
        w: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)),
        h: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)),
      };
    if (tag === 'VP8 ') return { w: dv.getUint16(26, true) & 0x3fff, h: dv.getUint16(28, true) & 0x3fff };
    if (tag === 'VP8L') {
      const bits = dv.getUint32(21, true);
      return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
    }
  }
  return undefined;
}

const mimeOf = (b: Uint8Array): string | undefined => {
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  return undefined; // WebP and others: PowerPoint support varies, so they are not embedded
};

/** The box that fits a `w x h` picture inside `box`, centred. */
function fit(box: Box, size: { w: number; h: number } | undefined): Box {
  if (!size || size.w <= 0 || size.h <= 0) return box;
  const k = Math.min(box.w / size.w, box.h / size.h);
  const w = size.w * k;
  const h = size.h * k;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

type Tally = { charts: number; tables: number; images: number };

/** The series of a Chart card's plotted points, as pptxgenjs chart data. */
function chartSeries(d: ChartData): {
  labels: string[];
  series: { name: string; labels: string[]; values: number[] }[];
} {
  const labels: string[] = [];
  const byColor = new Map<string, Map<string, number>>();
  for (const p of d.points) {
    const label = String(p.x);
    if (!labels.includes(label)) labels.push(label);
    const key = p.c ?? d.y ?? d.title ?? 'Value';
    const m = byColor.get(key) ?? new Map<string, number>();
    m.set(label, (m.get(label) ?? 0) + p.y);
    byColor.set(key, m);
  }
  return {
    labels,
    series: [...byColor].map(([name, m]) => ({
      name: clip(name, 60),
      labels,
      values: labels.map((l) => m.get(l) ?? 0),
    })),
  };
}

/** Per-export closure: simultaneous exports never share mutable palette or font state. */
function themedRenderer(appearance: Appearance = DEFAULT_APPEARANCE) {
  const light = appearancePalette(appearance, 'light');
  const dark = appearancePalette(appearance, 'dark');
  const hex = (value: string) => value.replace('#', '');
  const C = {
    night: hex(dark.palette.bg),
    nightText: hex(dark.palette.text),
    ink: hex(light.palette.text),
    muted: hex(light.palette.muted),
    rule: hex(light.palette.line),
    signal: hex(light.accent.accent),
    sky: hex(dark.accent.link),
    paper: hex(light.palette.surface),
    tint: hex(light.palette.hover),
  };
  const FONT = fontFamilies[light.style.fonts.ui.family].replace(/ Variable$/, '');
  const HEAD_FONT = fontFamilies[light.style.fonts.heading.family].replace(/ Variable$/, '');
  const SERIES = [C.signal, ...Object.values(labelColors(themes[appearance.themeId], 'light')).map(hex)];
  function addChart(pptx: Pres, slide: PptxSlide, card: Card, d: ChartData, box: Box, tally: Tally): boolean {
    if (d.points.length === 0) return false;
    const base = {
      ...box,
      showLegend: false,
      catAxisLabelFontFace: FONT,
      valAxisLabelFontFace: FONT,
      catAxisLabelFontSize: 11,
      valAxisLabelFontSize: 11,
      catAxisLabelColor: C.muted,
      valAxisLabelColor: C.muted,
      valGridLine: { color: C.rule, size: 0.5 },
      chartColors: SERIES,
      showTitle: false,
      dataLabelFontFace: FONT,
    } as const;
    const { labels, series } = chartSeries(d);
    const legend = series.length > 1;
    if (d.mark === 'pie') {
      const one = series[0]!;
      slide.addChart(pptx.ChartType.pie, [{ name: one.name, labels: one.labels, values: one.values }], {
        ...base,
        showLegend: true,
        legendPos: 'r',
        legendFontFace: FONT,
        legendFontSize: 11,
        showPercent: true,
        dataLabelColor: C.paper,
        dataLabelFontSize: 11,
      });
    } else if (d.mark === 'scatter') {
      const xs = d.points.map((p) => (typeof p.x === 'number' ? p.x : Number(p.x)));
      if (xs.some((x) => !Number.isFinite(x))) {
        // A non-numeric x cannot be scattered: draw it as a line over the categories instead.
        slide.addChart(pptx.ChartType.line, series, { ...base, showLegend: legend, lineDataSymbolSize: 8 });
      } else {
        const keys = [...new Set(d.points.map((p) => p.c ?? d.y ?? 'Value'))];
        const data = [
          { name: d.x, values: xs },
          ...keys.map((k) => ({
            name: clip(k, 60),
            values: d.points.map((p) => ((p.c ?? d.y ?? 'Value') === k ? p.y : (null as unknown as number))),
          })),
        ];
        slide.addChart(pptx.ChartType.scatter, data, {
          ...base,
          showLegend: keys.length > 1,
          lineSize: 0,
          lineDataSymbolSize: 9,
        });
      }
    } else {
      const type =
        d.mark === 'line'
          ? pptx.ChartType.line
          : d.mark === 'area'
            ? pptx.ChartType.area
            : pptx.ChartType.bar;
      slide.addChart(type, series, {
        ...base,
        showLegend: legend,
        legendPos: 'b',
        legendFontFace: FONT,
        legendFontSize: 11,
        ...(d.mark === 'bar'
          ? { barDir: 'col' as const, barGrouping: 'clustered' as const, barGapWidthPct: 60 }
          : {}),
        ...(d.mark === 'line' ? { lineSize: 2.5, lineDataSymbolSize: 7 } : {}),
        showCatAxisTitle: false,
        showValAxisTitle: Boolean(d.y),
        valAxisTitle: d.y ?? '',
        valAxisTitleFontFace: FONT,
        valAxisTitleFontSize: 11,
        valAxisTitleColor: C.muted,
      });
    }
    void labels;
    void card;
    tally.charts++;
    return true;
  }

  const cell = (text: string, opts: Record<string, unknown> = {}): PptxTableCell => ({
    text: clip(text, 160),
    options: { fontFace: FONT, fontSize: 11, color: C.ink, valign: 'middle', ...opts },
  });

  function addTable(
    slide: PptxSlide,
    columns: readonly string[],
    rows: readonly (readonly string[])[],
    box: Box,
    tally: Tally,
    note?: string,
  ): void {
    const cols = columns.slice(0, 8);
    const maxRows = Math.max(3, Math.floor((box.h - 0.35) / 0.34) - 1);
    const shown = rows.slice(0, Math.min(maxRows, 14));
    const body: PptxTableRow[] = [
      cols.map((c) => cell(c, { bold: true, color: C.paper, fill: { color: C.signal }, fontSize: 11 })),
      ...shown.map((r, i) =>
        cols.map((_, j) => cell(r[j] ?? '', { fill: { color: i % 2 === 0 ? C.paper : C.tint } })),
      ),
    ];
    slide.addTable(body, {
      x: box.x,
      y: box.y,
      w: box.w,
      colW: Array(cols.length).fill(box.w / cols.length) as number[],
      rowH: 0.34,
      border: { type: 'solid', pt: 0.5, color: C.rule },
      fontFace: FONT,
      margin: [0.03, 0.08, 0.03, 0.08],
    });
    const more = rows.length > shown.length || columns.length > cols.length;
    const text = [
      note,
      more
        ? `Showing ${shown.length} of ${rows.length} rows${columns.length > cols.length ? `, ${cols.length} of ${columns.length} columns` : ''}.`
        : undefined,
    ]
      .filter(Boolean)
      .join(' ');
    if (text)
      slide.addText(text, {
        x: box.x,
        y: box.y + Math.min(box.h - 0.3, 0.34 * (shown.length + 1) + 0.12),
        w: box.w,
        h: 0.3,
        fontFace: FONT,
        fontSize: 10,
        italic: true,
        color: C.muted,
      });
    tally.tables++;
  }

  /** A card as text: its kind, title and plain text. */
  function addCardText(slide: PptxSlide, card: Card, box: Box): void {
    slide.addShape('rect', { ...box, fill: { color: C.tint }, line: { color: C.rule, width: 0.75 } });
    slide.addText(
      [
        {
          text: `${cardKindLabel(card)}\n`,
          options: { fontSize: 11, color: C.signal, bold: true, breakLine: true },
        },
        {
          text: `${clip(cardTitle(card), 120)}\n`,
          options: { fontSize: 18, bold: true, color: C.ink, breakLine: true },
        },
        { text: clip(describeCardData(card, 900), 900), options: { fontSize: 13, color: C.muted } },
      ],
      {
        x: box.x + 0.2,
        y: box.y + 0.15,
        w: box.w - 0.4,
        h: box.h - 0.3,
        fontFace: FONT,
        valign: 'top',
        fit: 'shrink',
      },
    );
  }

  async function addPicture(
    slide: PptxSlide,
    bytes: Uint8Array | undefined,
    box: Box,
    tally: Tally,
    alt: string,
    hintSize?: { w?: number | undefined; h?: number | undefined },
  ): Promise<boolean> {
    if (!bytes) return false;
    const mime = mimeOf(bytes);
    if (!mime) return false;
    const size =
      imageSize(bytes) ?? (hintSize?.w && hintSize.h ? { w: hintSize.w, h: hintSize.h } : undefined);
    const at = fit(box, size);
    slide.addImage({ data: `${mime};base64,${Buffer.from(bytes).toString('base64')}`, ...at, altText: alt });
    tally.images++;
    return true;
  }

  /** Put a card on a slide as its native element; answers false when it could not (the caller draws its text). */
  async function addVisual(
    pptx: Pres,
    slide: PptxSlide,
    card: Card,
    box: Box,
    src: PptxSource,
    tally: Tally,
  ): Promise<void> {
    switch (card.type) {
      case 'chart': {
        const d = readCardData(ChartData, card.data);
        if (d && addChart(pptx, slide, card, d, box, tally)) return;
        break;
      }
      case 'table': {
        const d = readCardData(TableData, card.data);
        if (d) {
          addTable(
            slide,
            d.columns,
            d.rows,
            box,
            tally,
            [
              d.totalRows > d.rows.length ? `${d.totalRows} rows in the table.` : '',
              d.rows.some((row) => row.some((value) => value.length > 160))
                ? 'Long cells condensed; full cell text in speaker notes.'
                : '',
            ]
              .filter(Boolean)
              .join(' ') || undefined,
          );
          return;
        }
        break;
      }
      case 'database': {
        const d = readCardData(DatabaseData, card.data);
        if (d && d.preview && d.preview.length > 0) {
          addTable(
            slide,
            d.columns,
            d.preview,
            box,
            tally,
            d.rowCount > d.preview.length ? `${d.rowCount} rows in the database.` : undefined,
          );
          return;
        }
        break;
      }
      case 'matrix': {
        const d = readCardData(MatrixData, card.data);
        if (d) {
          const { totals, winners } = matrixTotals(d);
          const cols = [
            'Criterion (weight)',
            ...d.options.map((o, i) => (winners.includes(i) ? `${o.name} (winner)` : o.name)),
          ];
          const rows = d.criteria.map((c, ci) => [
            `${c.name} (${c.weight})`,
            ...d.options.map((o) => (o.scores[ci] == null ? '—' : String(o.scores[ci]))),
          ]);
          rows.push(['Weighted total', ...totals.map((t) => (t === null ? 'Not scored' : t.toFixed(2)))]);
          addTable(slide, cols, rows, box, tally);
          return;
        }
        break;
      }
      case 'metric': {
        const d = readCardData(MetricData, card.data);
        if (d) {
          slide.addShape('rect', { ...box, fill: { color: C.tint }, line: { color: C.rule, width: 0.75 } });
          slide.addText(d.title, {
            x: box.x + 0.3,
            y: box.y + 0.25,
            w: box.w - 0.6,
            h: 0.5,
            fontFace: FONT,
            fontSize: 16,
            color: C.muted,
          });
          slide.addText(`${d.value}${d.unit ? ` ${d.unit}` : ''}`, {
            x: box.x + 0.3,
            y: box.y + 0.9,
            w: box.w - 0.6,
            h: Math.max(1, box.h * 0.4),
            fontFace: FONT,
            fontSize: 54,
            bold: true,
            color: C.signal,
            fit: 'shrink',
          });
          const meta = [
            d.change
              ? `${d.change.direction === 'up' ? '▲' : d.change.direction === 'down' ? '▼' : '▬'} ${d.change.value}`
              : '',
            d.period ?? '',
          ]
            .filter(Boolean)
            .join('   ');
          if (meta)
            slide.addText(meta, {
              x: box.x + 0.3,
              y: box.y + box.h - 0.9,
              w: box.w - 0.6,
              h: 0.5,
              fontFace: FONT,
              fontSize: 16,
              color: C.ink,
            });
          return;
        }
        break;
      }
      case 'image': {
        const d = readCardData(ImageData, card.data);
        if (
          d &&
          (await addPicture(slide, await src.readAsset(d.asset.path), box, tally, d.title, {
            w: d.width,
            h: d.height,
          }))
        )
          return;
        break;
      }
      case 'file': {
        const d = readCardData(FileData, card.data);
        if (d?.thumb && (await addPicture(slide, await src.readAsset(d.thumb.path), box, tally, d.title)))
          return;
        break;
      }
      case 'design': {
        if (await addPicture(slide, await src.snapshotOf(card.id), box, tally, cardTitle(card))) return;
        break;
      }
      default:
        break;
    }
    addCardText(slide, card, box);
  }

  function footer(pptx: Pres, slide: PptxSlide, deckTitle: string, dark: boolean): void {
    const y = H - 0.5;
    const ink = dark ? C.nightText : C.muted;
    // The Constellation mark, drawn: a hexagon with its signal point, then the lowercase wordmark.
    slide.addShape(pptx.ShapeType.hexagon, {
      x: MARGIN,
      y: y + 0.05,
      w: 0.26,
      h: 0.23,
      fill: { color: dark ? C.night : C.paper },
      line: { color: C.signal, width: 1.25 },
    });
    slide.addShape(pptx.ShapeType.ellipse, {
      x: MARGIN + 0.03,
      y: y + 0.12,
      w: 0.07,
      h: 0.07,
      fill: { color: C.sky },
      line: { color: C.sky, width: 0 },
    });
    slide.addText(WORDMARK, {
      x: MARGIN + 0.34,
      y,
      w: 0.9,
      h: 0.33,
      fontFace: FONT,
      fontSize: 12,
      bold: true,
      color: dark ? C.nightText : C.ink,
    });
    slide.addText(clip(deckTitle, 90), {
      x: 2.2,
      y,
      w: W - 4.4,
      h: 0.33,
      fontFace: FONT,
      fontSize: 10,
      color: ink,
      align: 'center',
    });
  }

  async function addSlide(
    pptx: Pres,
    deck: Deck,
    s: Slide,
    src: PptxSource,
    numbers: ReadonlyMap<string, number>,
    tally: Tally,
  ): Promise<void> {
    const slide = pptx.addSlide();
    const card = s.visual ? src.cardOf(s.visual.cardId) : undefined;
    const fullTable = card?.type === 'table' ? readCardData(TableData, card.data) : undefined;
    const notes = [
      slideNotesText(s, numbers, src.cardOf),
      ...(fullTable && card
        ? [
            `Full table cell text — ${cardTitle(card)} [${card.id}]:\n${[fullTable.columns, ...fullTable.rows].map((row) => row.join(' | ')).join('\n')}`,
          ]
        : []),
      ...[...new Set([...s.cardIds, ...(card ? [card.id] : [])])].flatMap((id) => {
        const cited = src.cardOf(id);
        return cited?.detail ? [`Detailed analysis — ${cardTitle(cited)} [${id}]:\n${cited.detail}`] : [];
      }),
    ]
      .filter(Boolean)
      .join('\n\n');
    if (notes) slide.addNotes(notes);
    if (s.layout === 'title' || s.layout === 'section') {
      slide.background = { color: C.night };
      slide.addShape('rect', {
        x: 0,
        y: 0,
        w: 0.18,
        h: H,
        fill: { color: C.signal },
        line: { color: C.signal, width: 0 },
      });
      slide.addText(s.title, {
        x: 0.9,
        y: s.layout === 'title' ? 2.3 : 2.8,
        w: W - 1.8,
        h: 1.6,
        fontFace: HEAD_FONT,
        fontSize: s.layout === 'title' ? 44 : 36,
        bold: true,
        color: C.nightText,
        valign: 'bottom',
        fit: 'shrink',
      });
      if (s.subtitle)
        slide.addText(s.subtitle, {
          x: 0.9,
          y: 4.05,
          w: W - 1.8,
          h: 1,
          fontFace: FONT,
          fontSize: 20,
          color: C.sky,
          valign: 'top',
          fit: 'shrink',
        });
      footer(pptx, slide, deck.title, true);
      return;
    }
    slide.background = { color: C.paper };
    slide.addText(s.title, {
      x: MARGIN,
      y: 0.4,
      w: W - 2 * MARGIN,
      h: 0.9,
      fontFace: HEAD_FONT,
      fontSize: 28,
      bold: true,
      color: C.ink,
      valign: 'middle',
      fit: 'shrink',
    });
    slide.addShape('rect', {
      x: MARGIN,
      y: 1.32,
      w: 0.9,
      h: 0.05,
      fill: { color: C.signal },
      line: { color: C.signal, width: 0 },
    });
    const top = 1.6;
    const bottom = H - 0.75;
    const bulletRuns = (size: number) =>
      s.bullets.map((b) => ({
        text: b,
        options: { bullet: { indent: 18 }, fontSize: size, color: C.ink, breakLine: true, paraSpaceAfter: 8 },
      }));
    const caption = (box: Box) => {
      if (s.visual?.caption)
        slide.addText(s.visual.caption, {
          x: box.x,
          y: box.y + box.h + 0.05,
          w: box.w,
          h: 0.35,
          fontFace: FONT,
          fontSize: 11,
          italic: true,
          color: C.muted,
          valign: 'top',
          fit: 'shrink',
        });
    };
    if (s.layout === 'bullets') {
      slide.addText(bulletRuns(s.bullets.length > 6 ? 18 : 22), {
        x: MARGIN,
        y: top,
        w: W - 2 * MARGIN,
        h: bottom - top,
        fontFace: FONT,
        valign: 'top',
        fit: 'shrink',
      });
    } else if (s.layout === 'visual') {
      const withText = s.bullets.length > 0;
      const box: Box = withText
        ? { x: MARGIN, y: top, w: 7.9, h: bottom - top - 0.45 }
        : { x: MARGIN, y: top, w: W - 2 * MARGIN, h: bottom - top - 0.45 };
      if (card) await addVisual(pptx, slide, card, box, src, tally);
      caption(box);
      if (withText)
        slide.addText(bulletRuns(16), {
          x: 8.8,
          y: top,
          w: W - 8.8 - MARGIN,
          h: bottom - top,
          fontFace: FONT,
          valign: 'top',
          fit: 'shrink',
        });
    } else if (s.layout === 'two-column') {
      slide.addText(bulletRuns(18), {
        x: MARGIN,
        y: top,
        w: 5.3,
        h: bottom - top,
        fontFace: FONT,
        valign: 'top',
        fit: 'shrink',
      });
      const box: Box = { x: 6.3, y: top, w: W - 6.3 - MARGIN, h: bottom - top - 0.45 };
      if (card) await addVisual(pptx, slide, card, box, src, tally);
      caption(box);
    } else {
      // quote
      const d = card ? ((card.data ?? {}) as Record<string, unknown>) : undefined;
      const quote =
        s.bullets[0] ?? (typeof d?.body === 'string' ? d.body : typeof d?.text === 'string' ? d.text : '');
      slide.addText(`“${quote}”`, {
        x: 1.2,
        y: 2,
        w: W - 2.4,
        h: 2.8,
        fontFace: HEAD_FONT,
        fontSize: 30,
        italic: true,
        color: C.ink,
        valign: 'middle',
        fit: 'shrink',
      });
      const who = s.subtitle ?? (card ? cardTitle(card) : '');
      if (who)
        slide.addText(`— ${who}`, {
          x: 1.2,
          y: 5,
          w: W - 2.4,
          h: 0.5,
          fontFace: FONT,
          fontSize: 16,
          color: C.muted,
        });
    }
    footer(pptx, slide, deck.title, false);
  }

  const PER_SOURCES_SLIDE = 9;

  /** Build the .pptx of a deck: its slides, then the Sources slide(s). */
  async function build(deck: Deck, src: PptxSource): Promise<PptxResult> {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.title = deck.title;
    pptx.author = WORDMARK;
    pptx.company = WORDMARK;
    pptx.subject = 'Deck exported from orb';
    const tally: Tally = { charts: 0, tables: 0, images: 0 };
    const numbers = deckCitationNumbers(deck);
    for (const s of deck.slides) await addSlide(pptx, deck, s, src, numbers, tally);

    // The Sources slide(s): every cited card, numbered as in the speaker notes.
    const entries = [...numbers].map(([id, n]) => ({ id, n, card: src.cardOf(id) }));
    const pages = Math.max(1, Math.ceil(entries.length / PER_SOURCES_SLIDE));
    let slides = deck.slides.length;
    for (let page = 0; page < pages; page++) {
      const slide = pptx.addSlide();
      slides++;
      slide.background = { color: C.paper };
      slide.addNotes(`${SOURCES_SLIDE_ID}: every card this deck cites.`);
      slide.addText(pages > 1 ? `Sources (${page + 1}/${pages})` : 'Sources', {
        x: MARGIN,
        y: 0.4,
        w: W - 2 * MARGIN,
        h: 0.9,
        fontFace: HEAD_FONT,
        fontSize: 28,
        bold: true,
        color: C.ink,
        valign: 'middle',
      });
      slide.addShape('rect', {
        x: MARGIN,
        y: 1.32,
        w: 0.9,
        h: 0.05,
        fill: { color: C.signal },
        line: { color: C.signal, width: 0 },
      });
      const runs: PptxTextProps[] = [];
      if (entries.length === 0)
        runs.push({
          text: 'This deck cites no cards.',
          options: { fontSize: 16, color: C.muted, breakLine: true },
        });
      for (const e of entries.slice(page * PER_SOURCES_SLIDE, (page + 1) * PER_SOURCES_SLIDE)) {
        const url = e.card ? cardUrl(e.card) : undefined;
        runs.push({
          text: `[${e.n}]  ${e.card ? clip(cardTitle(e.card), 110) : 'A card no longer on the board'}`,
          options: { fontSize: 14, bold: true, color: C.ink, breakLine: !url && false },
        });
        runs.push({
          text: `   ${e.card ? cardKindLabel(e.card) : ''} · card ${e.id}`,
          options: { fontSize: 10, color: C.muted, breakLine: !url },
        });
        if (url)
          runs.push({
            text: `   ${clip(url, 120)}`,
            options: { fontSize: 11, color: C.signal, hyperlink: { url, tooltip: url }, breakLine: true },
          });
      }
      slide.addText(runs, {
        x: MARGIN,
        y: 1.6,
        w: W - 2 * MARGIN,
        h: H - 2.4,
        fontFace: FONT,
        valign: 'top',
        fit: 'shrink',
        paraSpaceAfter: 4,
      });
      footer(pptx, slide, deck.title, false);
    }
    const out = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
    return { data: new Uint8Array(out.buffer, out.byteOffset, out.byteLength), slides, ...tally };
  }

  return build;
}

/** Native output uses the selected style/accent with print-friendly light content and a paired dark cover. */
export async function buildDeckPptx(deck: Deck, src: PptxSource): Promise<PptxResult> {
  return themedRenderer(src.appearance)(deck, src);
}
