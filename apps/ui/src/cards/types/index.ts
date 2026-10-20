/** Every card type's UI half, keyed by type (a type missing here is a type error). See kit.tsx. */
import type { CardType } from '@orb/shared';
import type { CardUi } from './kit.js';
import { chart } from './chart.js';
import { checklist } from './checklist.js';
import { code } from './code.js';
import { database } from './database.js';
import { design } from './design.js';
import { decision } from './decision.js';
import { diagram } from './diagram.js';
import { doc } from './doc.js';
import { file } from './file.js';
import { framework } from './framework.js';
import { hypothesis } from './hypothesis.js';
import { image } from './image.js';
import { matrix } from './matrix.js';
import { metric } from './metric.js';
import { insight } from './insight.js';
import { entity } from './entity.js';
import { math } from './math.js';
import { note } from './note.js';
import { product } from './product.js';
import { question } from './question.js';
import { quote } from './quote.js';
import { risk } from './risk.js';
import { source } from './source.js';
import { research } from './research.js';
import { table } from './table.js';
import { timeline } from './timeline.js';
import { video } from './video.js';
import { watch } from './watch.js';

export const CARD_UI: { readonly [T in CardType]: CardUi } = {
  note,
  source,
  quote,
  image,
  file,
  question,
  risk,
  design,
  diagram,
  table,
  doc,
  database,
  chart,
  metric,
  timeline,
  matrix,
  insight,
  hypothesis,
  decision,
  framework,
  entity,
  product,
  video,
  code,
  math,
  checklist,
  research,
  watch,
};
