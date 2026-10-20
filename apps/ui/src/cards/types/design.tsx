/**
 * Design frame (P3.8; interactive since P6.2): its own sidecar page on the board (scaled, scripts running) and live
 * in the reader. In print, the 2x snapshot taken at export (labelled with its capture time), or the live page where
 * there is no native capture (the reading view).
 */
import { useContext } from 'react';
import { DESIGN_FRAME_SANDBOX, DesignData, readCardData } from '@orb/shared';
import { PrintCtx, printedAt, type PrintHalf } from '../../print/kit.js';
import { DesignBody, DesignReader } from '../BuilderViews.js';
import { pptxHook } from '../pptx.js';
import type { CardUi } from './kit.js';
import p from '../../print/print.module.css';

const Print: PrintHalf = ({ card }) => {
  const { snapshots, frameUrl } = useContext(PrintCtx);
  const d = readCardData(DesignData, card.data);
  const snap = snapshots.get(card.id);
  if (!d?.html) return <p className={p.meta}>No screen yet.</p>;
  if (!snap) {
    return (
      <iframe
        className={p.designLive}
        sandbox={DESIGN_FRAME_SANDBOX}
        src={frameUrl(card.id, d.version ?? 1)}
        referrerPolicy="no-referrer"
        title={d.title ?? 'Design frame'}
        data-testid="print-design-live"
      />
    );
  }
  return (
    <>
      <img
        className={p.snapshot}
        src={snap.url}
        alt={d.title ?? 'Design frame'}
        data-testid="print-snapshot"
        data-captured-at={snap.capturedAt}
      />
      <p className={p.meta} data-testid="print-snapshot-label">
        Snapshot · {printedAt(snap.capturedAt)}
        {(d.version ?? 1) > 1 ? ` · v${d.version}` : ''}
      </p>
    </>
  );
};

export const design: CardUi = { Body: DesignBody, Reader: DesignReader, Print, pptx: pptxHook };
