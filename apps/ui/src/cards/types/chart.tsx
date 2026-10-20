/**
 * Chart (P6.4): a Vega-Lite SVG of the card's plotted points. Board: sized to the card. Reader: large, with the
 * data as a table (the same numbers, for a screen reader and for copying). Print: vector SVG (text stays text).
 */
import {
  CHART_AGGS,
  CHART_MARKS,
  ChartData,
  chartPlot,
  chartSummary,
  readCardData,
  type Card,
} from '@orb/shared';
import { PrintBody, printBodyOf, type PrintHalf } from '../../print/kit.js';
import { ChartView } from '../ChartView.js';
import { VisualViewport } from '../VisualViewport.js';
import { getPrintChartTheme } from '../chartSpec.js';
import { useCardActions } from '../context.js';
import { useDataset } from '../dataset/useDataset.js';
import { pptxHook } from '../pptx.js';
import { TextBody, type CardBody, ReaderText, type CardUi } from './kit.js';
import s from '../../canvas/canvas.module.css';
import c from '../cards.module.css';
import p from '../../print/print.module.css';

const Body: CardBody = ({ card, lod }) => {
  const d = readCardData(ChartData, card.data);
  if (!d) return <TextBody card={card} lod={lod} />;
  if (lod === 'compact') {
    const n = chartPlot(d).points.length;
    return (
      <p className={s.cardBody}>
        {d.mark} chart · {n} point{n === 1 ? '' : 's'}
      </p>
    );
  }
  const dims = { w: Math.max(220, card.w - 28), h: Math.max(110, card.h - 128) };
  return <ChartView data={d} dims={dims} testid="card-chart" />;
};

function sourceLine(d: ChartData): string {
  if (d.source.kind === 'dataset')
    return `Bound to a database (${d.source.datasetId}); the chart follows its rows.`;
  if (d.source.kind === 'table') return `Bound to table card ${d.source.cardId}; the chart follows its rows.`;
  return 'Data entered with the chart.';
}

/** The column names a chart can pick from: its inline columns, its dataset's, or its Table card's. */
function useColumns(d: ChartData | undefined): string[] {
  const { tableColumns } = useCardActions();
  const ds = useDataset(d?.source.kind === 'dataset' ? d.source.datasetId : undefined, d?.rev ?? 0).ds;
  if (!d) return [];
  if (d.source.kind === 'inline') return d.source.columns;
  if (d.source.kind === 'table') return tableColumns(d.source.cardId);
  return ds ? ds.columns.map((c) => c.name) : [];
}

/** The chart's controls: mark, x, y, colour and how rows combine. Each change is one undoable edit. */
function Controls({ card, d }: { card: Card; d: ChartData }) {
  const { updateData } = useCardActions();
  const columns = useColumns(d);
  const set = (key: 'mark' | 'x' | 'y' | 'color' | 'agg', value: string) => {
    const { [key]: _old, ...rest } = card.data as Record<string, unknown>;
    updateData(card.id, value === '' ? rest : { ...rest, [key]: value });
  };
  const options = (current: string | undefined, none?: string) => (
    <>
      {none !== undefined && <option value="">{none}</option>}
      {[...new Set([...(current && !columns.includes(current) ? [current] : []), ...columns])].map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </>
  );
  return (
    <div className={c.chartControls} data-testid="chart-controls">
      <label>
        Chart
        <select value={d.mark} data-testid="chart-mark" onChange={(e) => set('mark', e.target.value)}>
          {CHART_MARKS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label>
        X
        <select value={d.x} data-testid="chart-x" onChange={(e) => set('x', e.target.value)}>
          {options(d.x)}
        </select>
      </label>
      <label>
        Y
        <select value={d.y ?? ''} data-testid="chart-y" onChange={(e) => set('y', e.target.value)}>
          {options(d.y, 'count rows')}
        </select>
      </label>
      <label>
        Series
        <select
          value={d.color ?? ''}
          data-testid="chart-color"
          onChange={(e) => set('color', e.target.value)}
        >
          {options(d.color, 'none')}
        </select>
      </label>
      <label>
        Combine
        <select value={d.agg ?? ''} data-testid="chart-agg" onChange={(e) => set('agg', e.target.value)}>
          <option value="">{d.y ? 'sum' : 'count'}</option>
          {CHART_AGGS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Reader({ card }: { card: Card }) {
  const d = readCardData(ChartData, card.data);
  if (!d) return <ReaderText card={card} />;
  const { points, note } = chartPlot(d);
  const series = d.color !== undefined && points.some((x) => x.c !== undefined);
  return (
    <div data-testid="reader-chart-box">
      <Controls card={card} d={d} />
      <VisualViewport label="chart">
        <ChartView data={d} dims={{ w: 760, h: 400 }} testid="reader-chart" big />
      </VisualViewport>
      <p className={c.chartNote}>
        {sourceLine(d)}
        {note ? ` ${note}.` : ''}
      </p>
      {points.length > 0 && (
        <div className={c.tableWrap}>
          <table className={c.table} data-testid="reader-chart-data">
            <caption className={c.muted}>{chartSummary(d)}</caption>
            <thead>
              <tr>
                <th scope="col">{d.x}</th>
                {series && <th scope="col">{d.color}</th>}
                <th scope="col">{d.y ?? 'count'}</th>
              </tr>
            </thead>
            <tbody>
              {points.slice(0, 100).map((pt, i) => (
                <tr key={i}>
                  <td>{pt.x}</td>
                  {series && <td>{pt.c}</td>}
                  <td>{pt.y}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const Print: PrintHalf = ({ card, mode }) => {
  const d = readCardData(ChartData, card.data);
  if (!d) return <PrintBody>{printBodyOf(card)}</PrintBody>;
  const dims =
    mode === 'canvas'
      ? { w: Math.max(220, card.w - 28), h: Math.max(110, card.h - 128) }
      : { w: 640, h: 340 };
  return (
    <div>
      <ChartView data={d} dims={dims} theme={getPrintChartTheme()} testid="print-chart" />
      <p className={p.meta}>{chartPlot(d).note ?? ''}</p>
    </div>
  );
};

export const chart: CardUi = { Body, Reader, Print, pptx: pptxHook };
