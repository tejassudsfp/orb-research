/**
 * The deck slide view (docs/phase6/PLAN.md P6.17), after the Port reading view's night shell:
 *
 * - a filmstrip of the slides (click, drag or the Move buttons to reorder; the Sources slide is added by the exports and
 *   closes the strip) and the selected slide drawn as it prints (`SlideFace`, 16:9);
 * - an edit panel: title, subtitle, bullets (one per line) and speaker notes. Save keeps a slide's citations and visual
 *   (`deck.save` changes text and order only); Delete and Add slide change the list, and a slide the user adds is theirs,
 *   exempt from the citation rule;
 * - "Ask orb to change this slide": regenerate one slide through chat (`deck.regenerateSlide`), with what to change;
 * - export: PDF slides (the print route through `printToPDF`) and a PowerPoint file (`deck.exportPptx`: native charts and
 *   tables, pictures, citations in the speaker notes, a Sources slide), each saved in `exports/` with Reveal in Finder.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { deckCitationNumbers, printRoute, readCardData, DesignData, type BoardState, type Deck, type DeckSaveArgs, type Slide } from '@orb/shared';
import { routeHref } from '../../app/router.js';
import { OrbLockup } from '../../brand/OrbMark.js';
import { BoardIcon } from '../../components/icons.js';
import type { Wire } from '../../wire/index.js';
import { SlideFace, SourcesFace } from '../../deck/SlideFace.js';
import { deckSources, sourcePages } from '../../deck/sources.js';
import { loadBoard } from '../../print/PrintApp.js';
import { PrintCtx, type PrintContext } from '../../print/kit.js';
import { canExport, exportPdf, revealExport } from '../../print/exportPdf.js';
import { orbNative } from '../../print/native.js';
import { pptxHook } from '../../cards/pptx.js';
import port from '../Port/Port.module.css';
import s from './Deck.module.css';

type Loaded = { title: string; board: BoardState; deck: Deck | null };

type Exported = { kind: 'pdf' | 'pptx'; path: string; file: string; detail: string };

/** The edits of the whole deck: every slide as it is, in the order given (`deck.save` takes the full list). */
const editsOf = (deck: Deck, order: readonly Slide[], patch?: { id: string; slide: Partial<DeckSaveArgs['slides'][number]> }): DeckSaveArgs => ({
  version: deck.version,
  slides: order.map((x) => ({
    id: x.id,
    title: x.title,
    ...(x.subtitle ? { subtitle: x.subtitle } : {}),
    bullets: x.bullets,
    ...(x.notes ? { notes: x.notes } : {}),
    ...(patch?.id === x.id ? patch.slide : {}),
  })),
});

export function DeckScreen({ wire, canvasId }: { wire: Wire; canvasId: string }) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [exported, setExported] = useState<Exported>();
  const [dragging, setDragging] = useState<string>();
  const dragId = useRef<string | undefined>(undefined);
  const latestDeck = useRef<Deck | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingSaves = useRef(0);
  const [over, setOver] = useState<string>();
  // The edit draft of the selected slide.
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [bullets, setBullets] = useState('');
  const [notes, setNotes] = useState('');
  const [instruction, setInstruction] = useState('');

  const load = useCallback(
    async (signal: AbortSignal) => {
      const [list, board, d] = await Promise.all([
        wire.orb.canvas.list(signal),
        loadBoard(wire, canvasId, signal),
        wire.orb.deck.get(canvasId, signal),
      ]);
      latestDeck.current = d.deck;
      setLoaded({ title: list.find((c) => c.id === canvasId)?.title ?? 'Deck', board, deck: d.deck });
    },
    [wire, canvasId],
  );
  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal).catch((err: unknown) => !ac.signal.aborted && setError((err as Error).message));
    return () => ac.abort();
  }, [load]);

  const deck = loaded?.deck ?? null;
  const board = loaded?.board;
  const numbers = useMemo(() => (deck ? deckCitationNumbers(deck) : new Map<string, number>()), [deck]);
  const sources = useMemo(() => (deck && board ? sourcePages(deckSources(deck, board)) : []), [deck, board]);
  const slide = deck?.slides.find((x) => x.id === selected) ?? (selected === 'sources' ? undefined : deck?.slides[0]);
  const onSources = selected === 'sources';

  // The draft follows the selected slide (and a saved or regenerated copy of it).
  useEffect(() => {
    if (!slide) return;
    setTitle(slide.title);
    setSubtitle(slide.subtitle ?? '');
    setBullets(slide.bullets.join('\n'));
    setNotes(slide.notes ?? '');
  }, [slide?.id, deck?.version]);

  const ctx = useMemo<PrintContext>(
    () => ({
      assetUrl: (path) => wire.assets.url(canvasId, { path }),
      snapshots: new Map(),
      frameUrl: (cardId, version) => wire.assets.designFrameUrl(canvasId, cardId, version),
    }),
    [wire, canvasId],
  );

  // Scale the 960 x 540 face to the stage.
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.8);
  useEffect(() => {
    const el = stage.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 960));
    ro.observe(el);
    setScale(el.clientWidth / 960);
    return () => ro.disconnect();
  }, [deck?.version, loaded !== undefined]);

  // Persisted state can advance before React receives the response. Queue edit intentions and build each request
  // from the previous response, so two quick drops neither conflict nor overwrite the preceding text/order edit.
  const save = (plan: (current: Deck) => DeckSaveArgs, then?: (saved: Deck) => void) => {
    pendingSaves.current++;
    setBusy('save');
    setError(undefined);
    const pending = saveQueue.current.then(async () => {
      const current = latestDeck.current;
      if (!current) return;
      const r = await wire.orb.deck.save(canvasId, plan(current));
      latestDeck.current = r.deck;
      setLoaded((l) => (l ? { ...l, deck: r.deck } : l));
      then?.(r.deck);
    });
    saveQueue.current = pending.catch((err: unknown) => setError((err as Error).message)).finally(() => {
      if (--pendingSaves.current === 0) setBusy(undefined);
    });
    return saveQueue.current;
  };

  const move = (id: string, target: string | number) => {
    if (!deck) return;
    void save((current) => {
      const from = current.slides.findIndex((x) => x.id === id);
      const to = typeof target === 'number' ? from + target : current.slides.findIndex((x) => x.id === target);
      const order = [...current.slides];
      if (from >= 0 && to >= 0 && to < order.length && from !== to) {
        const [item] = order.splice(from, 1);
        order.splice(to, 0, item!);
      }
      return editsOf(current, order);
    });
  };

  const saveSlide = () => {
    if (!deck || !slide) return;
    void save(
      (current) => editsOf(current, current.slides, {
        id: slide.id,
        slide: {
          title: title.trim() || slide.title,
          subtitle: subtitle.trim() || undefined,
          bullets: bullets
            .split('\n')
            .map((b) => b.trim())
            .filter(Boolean),
          notes: notes.trim() || undefined,
        },
      }),
    );
  };

  const remove = () => {
    if (!deck || !slide) return;
    let i = 0;
    void save((current) => {
      i = current.slides.findIndex((x) => x.id === slide.id);
      return editsOf(current, current.slides.filter((x) => x.id !== slide.id));
    }, (saved) => setSelected(saved.slides[Math.min(i, saved.slides.length - 1)]?.id));
  };

  const add = () => {
    if (!deck) return;
    void save((current) => {
      const args = editsOf(current, current.slides);
      args.slides.push({ title: 'New slide', bullets: ['Write your point here'] });
      return args;
    }, () => setSelected(undefined));
  };

  const regenerate = async () => {
    if (!slide) return;
    setBusy('regenerate');
    setError(undefined);
    try {
      await wire.orb.deck.regenerateSlide(canvasId, { slideId: slide.id, instruction: instruction.trim() });
      setInstruction('');
      await load(new AbortController().signal);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const exportPdfSlides = async () => {
    setBusy('pdf');
    setError(undefined);
    try {
      const r = await exportPdf(wire, { kind: 'deck', canvasId });
      setExported({ kind: 'pdf', path: r.export.path, file: r.export.file, detail: `${r.pages} pages` });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const exportPptx = async () => {
    if (!deck || !board) return;
    setBusy('pptx');
    setError(undefined);
    try {
      // A design frame is a picture in the .pptx: the print pipeline snapshots the frames the slides show first.
      const hasDesign = deck.slides.some((x) => {
        const c = x.visual ? board.cards[x.visual.cardId] : undefined;
        return c && pptxHook(c).kind === 'snapshot' && readCardData(DesignData, c.data)?.html;
      });
      const native = orbNative();
      if (hasDesign && native?.exportPdf) {
        const r = await native.exportPdf(printRoute({ kind: 'deck', canvasId }));
        if (!r.ok) throw new Error(r.error);
      }
      const r = await wire.orb.deck.exportPptx(canvasId);
      setExported({
        kind: 'pptx',
        path: r.path,
        file: r.file,
        detail: `${r.slides} slides, ${r.charts} chart${r.charts === 1 ? '' : 's'}, ${r.tables} table${r.tables === 1 ? '' : 's'}, ${r.images} picture${r.images === 1 ? '' : 's'}`,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(undefined);
    }
  };

  const drop = (target: string) => {
    const from = dragId.current;
    if (!deck || !from || from === target) return;
    move(from, target);
  };

  const cardOf = (id: string) => board?.cards[id];
  const working = busy !== undefined;
  const native = canExport();

  return (
    <main
      className={port.page}
      data-testid="deck-screen"
      data-canvas-id={canvasId}
      data-state={!loaded ? 'loading' : deck ? 'composed' : 'empty'}
      data-version={deck?.version}
      data-slides={deck?.slides.length}
    >
      <div className={port.glow} aria-hidden="true" />
      <div className={port.shell}>
        <div className={port.topBar}>
          <div className={port.brand}>
            <OrbLockup markSize={28} testId="brand-lockup" />
            <span className={port.chip}>SLIDES</span>
          </div>
          <a href={routeHref({ name: 'canvas', id: canvasId })} className={port.back} data-testid="back-to-canvas">
            <BoardIcon size={16} />
            Back to canvas
          </a>
        </div>

        {error && (
          <p className={port.error} role="alert" data-testid="deck-error">
            {error}
          </p>
        )}

        {loaded && !deck && (
          <div className={port.hero}>
            <span className={port.eyebrow}>Slides</span>
            <h1 className={s.h1}>{loaded.title}</h1>
            <p className={port.lead} data-testid="deck-empty">
              No slides have been composed for this canvas yet. Publish Port on the canvas, choose Slides and
              Compose: orb writes the deck from the cards, and every slide cites back to them.
            </p>
          </div>
        )}

        {loaded && deck && board && (
          <>
            <div className={port.hero}>
              <span className={port.eyebrow}>
                {deck.format === 'vc-ic' ? 'Investment committee deck' : 'Slides'} from {loaded.title}
              </span>
              <h1 className={s.h1} data-testid="deck-title">
                {deck.title}
              </h1>
            </div>

            <div className={s.layout}>
              <ol className={s.strip} data-testid="deck-strip" aria-label="Slides">
                {deck.slides.map((x, i) => (
                  <li
                    key={x.id}
                    draggable={!working}
                    onDragStart={() => {
                      dragId.current = x.id;
                      setDragging(x.id);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOver(x.id);
                    }}
                    onDragEnd={() => {
                      dragId.current = undefined;
                      setDragging(undefined);
                      setOver(undefined);
                    }}
                    onDrop={() => {
                      drop(x.id);
                      dragId.current = undefined;
                      setDragging(undefined);
                      setOver(undefined);
                    }}
                  >
                    <button
                      type="button"
                      className={`${s.thumb} ${slide?.id === x.id && !onSources ? s.thumbOn : ''} ${over === x.id && dragging !== x.id ? s.thumbDrop : ''}`}
                      data-testid="deck-thumb"
                      data-slide-id={x.id}
                      aria-current={slide?.id === x.id && !onSources ? 'true' : undefined}
                      onClick={() => setSelected(x.id)}
                    >
                      <span className={s.thumbNo}>{String(i + 1).padStart(2, '0')}</span>
                      <span className={s.thumbTitle}>{x.title}</span>
                      <span className={s.thumbMeta}>{x.userAuthored ? 'You' : x.layout}</span>
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className={`${s.thumb} ${onSources ? s.thumbOn : ''}`}
                    data-testid="deck-thumb-sources"
                    onClick={() => setSelected('sources')}
                  >
                    <span className={s.thumbNo}>{String(deck.slides.length + 1).padStart(2, '0')}</span>
                    <span className={s.thumbTitle}>Sources</span>
                    <span className={s.thumbMeta}>auto</span>
                  </button>
                </li>
                <li>
                  <button type="button" className={port.add} data-testid="deck-add" disabled={working} onClick={add}>
                    Add slide
                  </button>
                </li>
              </ol>

              <div className={s.main}>
                <PrintCtx.Provider value={ctx}>
                  <div className={s.stage} ref={stage} data-testid="deck-preview" data-slide-id={onSources ? 'sources' : slide?.id}>
                    <div className={s.stageInner} style={{ transform: `scale(${scale})` }}>
                      {onSources ? (
                        <SourcesFace
                          entries={sources[0] ?? []}
                          deckTitle={deck.title}
                          page={deck.slides.length + 1}
                          n={1}
                          of={sources.length}
                        />
                      ) : (
                        slide && (
                          <SlideFace
                            slide={slide}
                            deckTitle={deck.title}
                            page={deck.slides.findIndex((x) => x.id === slide.id) + 1}
                            numbers={numbers}
                            cardOf={cardOf}
                          />
                        )
                      )}
                    </div>
                  </div>
                </PrintCtx.Provider>

                {onSources && (
                  <p className={s.muted} data-testid="deck-sources-note">
                    The Sources slide is added by the exports: it lists every card the slides cite, numbered as in the
                    speaker notes.
                  </p>
                )}

                {slide && !onSources && (
                  <section className={s.panel} data-testid="deck-edit" data-slide-id={slide.id}>
                    <div className={s.row}>
                      <span className={s.label}>Slide {deck.slides.findIndex((x) => x.id === slide.id) + 1}</span>
                      {slide.userAuthored && <span className={s.tag}>You</span>}
                      {slide.edited && <span className={s.tag}>Edited</span>}
                      <span className={s.spacer} />
                      <button
                        type="button"
                        className={port.ghost}
                        data-testid="deck-move-up"
                        disabled={working || deck.slides[0]?.id === slide.id}
                        onClick={() => move(slide.id, -1)}
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        className={port.ghost}
                        data-testid="deck-move-down"
                        disabled={working || deck.slides.at(-1)?.id === slide.id}
                        onClick={() => move(slide.id, 1)}
                      >
                        Move down
                      </button>
                      <button type="button" className={port.ghost} data-testid="deck-delete" disabled={working} onClick={remove}>
                        Delete
                      </button>
                    </div>
                    <label className={s.field}>
                      <span className={s.label}>Title</span>
                      <input className={s.input} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} data-testid="deck-edit-title" />
                    </label>
                    {(slide.layout === 'title' || slide.layout === 'section' || slide.layout === 'quote' || slide.subtitle) && (
                      <label className={s.field}>
                        <span className={s.label}>{slide.layout === 'quote' ? 'Attribution' : 'Subtitle'}</span>
                        <input className={s.input} value={subtitle} maxLength={200} onChange={(e) => setSubtitle(e.target.value)} data-testid="deck-edit-subtitle" />
                      </label>
                    )}
                    <label className={s.field}>
                      <span className={s.label}>Bullets, one per line</span>
                      <textarea className={s.input} rows={5} value={bullets} onChange={(e) => setBullets(e.target.value)} data-testid="deck-edit-bullets" />
                    </label>
                    <label className={s.field}>
                      <span className={s.label}>Speaker notes</span>
                      <textarea className={s.input} rows={3} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} data-testid="deck-edit-notes" />
                    </label>
                    <div className={s.field}>
                      <span className={s.label}>Cites</span>
                      {slide.cardIds.length === 0 ? (
                        <p className={s.muted}>{slide.userAuthored ? 'Your own slide: no citations needed.' : 'No cards (a cover or divider).'}</p>
                      ) : (
                        <ul className={s.cites} data-testid="deck-cites">
                          {slide.cardIds.map((id) => {
                            const card = cardOf(id);
                            return (
                              <li key={id}>
                                <a
                                  className={s.cite}
                                  href={routeHref({ name: 'canvas', id: canvasId, focus: id })}
                                  data-testid="deck-cite"
                                  data-card-id={id}
                                  title={card ? pptxHook(card).title : id}
                                >
                                  [{numbers.get(id)}] {card ? pptxHook(card).label : 'missing'}
                                </a>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {slide.visual && cardOf(slide.visual.cardId) && (
                        <p className={s.muted} data-testid="deck-visual-kind">
                          In PowerPoint the visual is{' '}
                          {{ chart: 'a native, editable chart', table: 'a native table', image: 'a picture', snapshot: 'a snapshot picture', metric: 'a big figure', text: 'text' }[
                            pptxHook(cardOf(slide.visual.cardId)!).kind
                          ]}
                          .
                        </p>
                      )}
                    </div>
                    <div className={s.row}>
                      <button type="button" className={port.save} data-testid="deck-save" disabled={working || !title.trim()} onClick={saveSlide}>
                        Save slide
                      </button>
                    </div>
                    <div className={s.field}>
                      <label className={s.label} htmlFor="deck-regenerate-input">
                        Ask orb to change this slide
                      </label>
                      <div className={s.row}>
                        <input
                          id="deck-regenerate-input"
                          className={s.input}
                          style={{ flex: 1, width: 'auto' }}
                          placeholder="For example: shorter, lead with the chart, add the risk. Empty: write it afresh."
                          maxLength={500}
                          value={instruction}
                          onChange={(e) => setInstruction(e.target.value)}
                          data-testid="deck-regenerate-input"
                        />
                        <button type="button" className={port.regen} data-testid="deck-regenerate" disabled={working} onClick={() => void regenerate()}>
                          {busy === 'regenerate' ? 'Regenerating…' : 'Regenerate'}
                        </button>
                      </div>
                    </div>
                  </section>
                )}

                <section className={s.panel} data-testid="deck-export">
                  <div className={s.row}>
                    <button type="button" className={port.save} data-testid="deck-export-pptx" disabled={working} onClick={() => void exportPptx()}>
                      {busy === 'pptx' ? 'Exporting…' : 'Export PowerPoint (.pptx)'}
                    </button>
                    <button type="button" className={port.ghost} data-testid="deck-export-pdf" disabled={working || !native} onClick={() => void exportPdfSlides()}>
                      {busy === 'pdf' ? 'Exporting…' : 'Export PDF slides'}
                    </button>
                    {!native && <span className={s.muted}>PDF slides need the orb app.</span>}
                  </div>
                  {exported && (
                    <div className={s.row} role="status" data-testid="deck-exported" data-kind={exported.kind} data-path={exported.path} data-file={exported.file}>
                      <span className={s.status}>
                        Saved {exported.path} ({exported.detail})
                      </span>
                      <button type="button" className={port.ghost} data-testid="deck-reveal" onClick={() => void revealExport(exported.file)}>
                        Reveal in Finder
                      </button>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
