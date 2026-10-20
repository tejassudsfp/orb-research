/**
 * "Chart this" (P6.4): the data of a new Chart card bound to a Table or Database card, with a first guess of what to
 * plot (a date or a category on x, the first number on y). The points are filled in by the canvas service once the
 * card is added. Pure (unit-tested).
 */
import { DatabaseData, TableData, readCardData, suggestChart, tableColumnInfo, type Card, type ChartData } from '@orb/shared';

export function chartDraftOf(card: Pick<Card, 'type' | 'data' | 'view'>): ChartData | undefined {
  if (card.type === 'database') {
    const d = readCardData(DatabaseData, card.data);
    if (!d) return undefined;
    const types = d.types ?? [];
    const cols = d.columns.map((name, i) => ({
      name,
      kind: types[i] === 'number' ? ('number' as const) : types[i] === 'date' ? ('date' as const) : ('other' as const),
    }));
    const pick = suggestChart(cols);
    return pick
      ? { title: d.title, ...pick, source: { kind: 'dataset', datasetId: d.datasetId }, points: [] }
      : undefined;
  }
  if (card.type === 'table') {
    const d = readCardData(TableData, card.data);
    if (!d) return undefined;
    const pick = suggestChart(tableColumnInfo(d.columns, d.rows));
    return pick ? { title: d.title, ...pick, source: { kind: 'table', cardId: (card as Card).id }, points: [] } : undefined;
  }
  return undefined;
}
