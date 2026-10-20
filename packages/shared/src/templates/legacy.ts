/**
 * The v1 templates (BUILD_PLAN P2.6) not yet upgraded: Topic deep dive and Stocks. Each one prefills a starting frame
 * layout and an agent brief. P6.12 to P6.16 upgrade or merge them into v2 specs (docs/phase6/PLAN.md); P6.13 upgraded
 * Company research (`company`), GTM (`gtm`) and UI research (`ui`, now the product teardown) and kept their ids.
 */
import type { Template } from './schema.js';

export const LEGACY_TEMPLATES: readonly Template[] = [
  {
    id: 'topic',
    label: 'Topic deep dive',
    dot: '#60A5FA',
    placeholder: 'Which topic do you want to understand?',
    brief:
      'Build a deep understanding of the topic: state a working thesis, gather background and the strongest evidence ' +
      'for and against it, and keep a list of the questions that are still open.',
    frames: [
      { title: 'Thesis', color: 'signal' },
      { title: 'Background', color: 'sky' },
      { title: 'Key questions', color: 'rho' },
      { title: 'Evidence', color: 'sky' },
      { title: 'Open questions', color: 'paper' },
    ],
  },
  {
    id: 'stocks',
    label: 'Stocks',
    dot: '#60A5FA',
    placeholder: 'Which stock or sector?',
    brief:
      'Research the stock or sector from filings and reporting: an investment thesis, the fundamentals, how it is ' +
      'valued, upcoming catalysts and the risks. There is no live market data: say how recent every figure is.',
    frames: [
      { title: 'Thesis', color: 'signal' },
      { title: 'Fundamentals', color: 'sky' },
      { title: 'Valuation', color: 'rho' },
      { title: 'Catalysts', color: 'sky' },
      { title: 'Risks', color: 'paper' },
    ],
  },
];
