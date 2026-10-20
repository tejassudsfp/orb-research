/** A PDF's pages in the reader, rendered by pdf.js from the stored file, ten at a time (P2.5). */
import { useEffect, useRef, useState } from 'react';
import { openPdfUrl, renderPage, type PdfDoc } from './pdf.js';
import c from './cards.module.css';

export function PdfPages({ url, pages }: { url: string; pages: number | null }) {
  const host = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(10);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [doc, setDoc] = useState<PdfDoc>();

  useEffect(() => {
    let live = true;
    let opened: PdfDoc | undefined;
    openPdfUrl(url).then(
      (d) => {
        opened = d;
        if (live) setDoc(d);
        else void d.loadingTask.destroy();
      },
      () => live && setState('error'),
    );
    return () => {
      live = false;
      void opened?.loadingTask.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!doc || !host.current) return;
    let live = true;
    const el = host.current;
    void (async () => {
      const n = Math.min(doc.numPages, limit);
      for (let i = el.childElementCount + 1; i <= n && live; i++) {
        const canvas = document.createElement('canvas');
        canvas.className = c.pdfPage!;
        canvas.dataset.testid = 'reader-pdf-page';
        el.append(canvas);
        try {
          await renderPage(doc, i, canvas, Math.min(640, el.clientWidth || 640));
        } catch {
          if (live) setState('error');
          return;
        }
      }
      if (live) setState('ready');
    })();
    return () => {
      live = false;
    };
  }, [doc, limit]);

  const total = doc?.numPages ?? pages ?? 0;
  return (
    <>
      <p className={c.muted} data-testid="reader-pdf-state" data-state={state}>
        {state === 'error' ? 'This PDF could not be shown.' : `${total} page${total === 1 ? '' : 's'}`}
      </p>
      <div ref={host} className={c.pdfPages} />
      {doc && limit < doc.numPages && state === 'ready' && (
        <button type="button" className={c.chip} onClick={() => setLimit((l) => l + 10)}>
          Show more pages
        </button>
      )}
    </>
  );
}
