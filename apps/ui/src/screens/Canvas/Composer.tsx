/**
 * The Port composer sheet (PRD Port › Composer; BUILD_PLAN P4.4), opened from Publish Port and the panel's Compose
 * button:
 *
 * - mode: Canvas PDF or Research document;
 * - scope: the whole board, or the frames ticked in the list (the frames selected on the board start ticked);
 * - Canvas PDF options: one page per frame or a poster; print-friendly light (the default) or night as on screen;
 * - Export: prints the print route in a hidden window (`window.orbNative.exportPdf`), stores the PDF in the canvas's
 *   `exports/` with a timestamped name, and offers Reveal in Finder.
 *
 * P4.5, Research document mode:
 * - an instructions box (saved with the canvas, reused on regenerate; empty = the standard format);
 * - Compose: Orb writes the document with compose_section (`port.compose` stream: one line per section as it lands);
 * - before composing, unread Must read cards in the scope are listed with Open (the card opens on the board) and
 *   Continue anyway (PRD Port › Composer);
 * - Export prints the composed document (or, before anything is composed, the standard format of the board).
 *
 * P6.17, Slides mode: a format (the template's deck, the standard deck or the investment-committee deck), an instructions
 * box, Compose slides (`deck.compose`: one line per slide as it lands), Open the slide view (reorder, edit, regenerate,
 * export .pptx) and Export PDF slides (the `/print/deck` route).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFocusTrap } from '../../components/useFocusTrap.js';
import {
  reportProblems,
  reportPlan,
  DECK_FORMATS,
  unreadMustRead,
  type BoardState,
  type Deck,
  type Frame,
  type PortDoc,
  type PrintKind,
  type PrintLayout,
  type PrintScope,
  type PrintTheme,
  type UnreadCard,
} from '@orb/shared';
import { routeHref } from '../../app/router.js';
import { CloseIcon } from '../../components/icons.js';
import type { Wire } from '../../wire/index.js';
import { canExport, exportPdf, revealExport, type ExportResult } from '../../print/exportPdf.js';
import s from './Composer.module.css';
import { radioKeys } from '../../components/radioKeys.js';

/** P4.5: the compose run of the research document. */
type Compose =
  | { phase: 'idle' }
  | { phase: 'unread'; cards: UnreadCard[] }
  | { phase: 'composing'; sections: { id: string; heading: string }[]; rejected: number }
  | { phase: 'composed'; sections: { id: string; heading: string }[] }
  | { phase: 'failed'; message: string };

/** PRD Port › Composer: unread Must read cards in scope, with Open and Continue anyway. */
function UnreadWarning({
  cards,
  onOpenCard,
  onContinue,
}: {
  cards: readonly UnreadCard[];
  onOpenCard: (cardId: string) => void;
  onContinue: () => void;
}) {
  return (
    <div className={s.warning} role="alert" data-testid="composer-unread">
      <p className={s.warningText}>
        {cards.length === 1
          ? '1 Must read card in this scope is still unopened.'
          : `${cards.length} Must read cards in this scope are still unopened.`}
      </p>
      <ul className={s.unreadList}>
        {cards.slice(0, 8).map((c) => (
          <li key={c.id} className={s.unreadItem} data-testid="composer-unread-card" data-card-id={c.id}>
            <span className={s.unreadTitle}>{c.title}</span>
            <button
              type="button"
              className={s.link}
              data-testid="composer-unread-open"
              onClick={() => onOpenCard(c.id)}
            >
              Open
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className={s.secondary} data-testid="composer-continue" onClick={onContinue}>
        Continue anyway
      </button>
    </div>
  );
}

/** P6.17: the compose run of the slides. */
type DeckCompose =
  | { phase: 'idle' }
  | { phase: 'unread'; cards: UnreadCard[] }
  | { phase: 'composing'; slides: { id: string; title: string }[]; rejected: number }
  | { phase: 'composed'; slides: { id: string; title: string }[] }
  | { phase: 'failed'; message: string };

type State =
  | { phase: 'idle' }
  | { phase: 'exporting' }
  | { phase: 'done'; result: ExportResult }
  | { phase: 'error'; message: string };

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  testid,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  testid: string;
}) {
  return (
    <div className={s.field}>
      <span className={s.label}>{label}</span>
      <div
        className={s.segmented}
        role="radiogroup"
        onKeyDown={radioKeys}
        aria-label={label}
        data-testid={testid}
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? `${s.segment} ${s.segmentOn}` : s.segment}
            data-value={o.value}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Composer({
  wire,
  canvasId,
  frames,
  selectedFrames,
  board,
  onOpenCard,
  onClose,
}: {
  wire: Wire;
  canvasId: string;
  /** The board's frames in board order. */
  frames: readonly Frame[];
  /** Frames selected on the board when the sheet opened. */
  selectedFrames: readonly string[];
  /** P4.5: the board (unread Must read cards in scope). */
  board: BoardState;
  /** P4.5: Open on an unread card: close the sheet and open that card on the board. */
  onOpenCard: (cardId: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<PrintKind>('canvas');
  const [layout, setLayout] = useState<PrintLayout>('frames');
  const [theme, setTheme] = useState<PrintTheme>('light');
  const [whole, setWhole] = useState(selectedFrames.length === 0);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(selectedFrames));
  const [state, setState] = useState<State>({ phase: 'idle' });
  const [instructions, setInstructions] = useState('');
  const [documentFormat, setDocumentFormat] = useState<'report' | 'custom'>('report');
  const [compose, setCompose] = useState<Compose>({ phase: 'idle' });
  const [saved, setSaved] = useState<PortDoc | null>(null);
  const [deckSaved, setDeckSaved] = useState<Deck | null>(null);
  const [deckInstructions, setDeckInstructions] = useState('');
  const [deckFormat, setDeckFormat] = useState('');
  const [deckCompose, setDeckCompose] = useState<DeckCompose>({ phase: 'idle' });
  /** Unread Must read cards found when Export was pressed (a Canvas PDF, or the standard-format document). */
  const [exportUnread, setExportUnread] = useState<UnreadCard[] | null>(null);
  const sheet = useRef<HTMLElement>(null);
  const live = useRef(new AbortController());
  // P5.2: the focus moves to the sheet, Tab stays in it, and goes back to Publish Port on close.
  useFocusTrap(sheet);
  useEffect(() => {
    const ac = live.current;
    return () => ac.abort();
  }, []);

  const scope = useMemo(
    () => (whole ? ('all' as const) : frames.filter((f) => ticked.has(f.id)).map((f) => f.id)),
    [whole, ticked, frames],
  );
  const empty = scope !== 'all' && scope.length === 0;
  const native = canExport();
  // A warning lists the cards of the scope (and action) it was shown for: Continue anyway must not skip the check
  // for another scope.
  const scopeKey = scope === 'all' ? 'all' : scope.join(',');
  useEffect(() => {
    setExportUnread(null);
    setCompose((c) => (c.phase === 'unread' ? { phase: 'idle' } : c));
    setDeckCompose((c) => (c.phase === 'unread' ? { phase: 'idle' } : c));
  }, [scopeKey, mode]);

  // P4.5: the saved instructions and the composed document, if any.
  useEffect(() => {
    const ac = new AbortController();
    wire.orb.port.get(canvasId, ac.signal).then(
      (r) => {
        const text = r.instructions?.instructions ?? r.doc?.instructions ?? '';
        setInstructions(text);
        setDocumentFormat(r.instructions?.format ?? r.doc?.format ?? (text.trim() ? 'custom' : 'report'));
        setSaved(r.doc);
      },
      () => undefined,
    );
    return () => ac.abort();
  }, [wire, canvasId]);

  // P6.17: the saved deck, its format and instructions.
  useEffect(() => {
    const ac = new AbortController();
    wire.orb.deck.get(canvasId, ac.signal).then(
      (r) => {
        if (r.instructions) {
          setDeckInstructions(r.instructions.instructions);
          setDeckFormat(r.instructions.format);
        }
        setDeckSaved(r.deck);
      },
      () => undefined,
    );
    return () => ac.abort();
  }, [wire, canvasId]);

  const composingDeck = deckCompose.phase === 'composing';
  const runComposeDeck = async (continueUnread: boolean) => {
    if (empty || composingDeck) return;
    const target: PrintScope = scope;
    if (!continueUnread) {
      const unread = unreadMustRead(board, target);
      if (unread.length > 0) return setDeckCompose({ phase: 'unread', cards: unread });
    }
    const slides: { id: string; title: string }[] = [];
    let rejected = 0;
    setDeckCompose({ phase: 'composing', slides: [], rejected: 0 });
    try {
      for await (const event of wire.orb.deck.compose(
        canvasId,
        {
          scope: target,
          ...(deckFormat ? { format: deckFormat } : {}),
          instructions: deckInstructions,
          continueUnread,
        },
        { signal: live.current.signal },
      )) {
        if (event.type === 'unread') return setDeckCompose({ phase: 'unread', cards: event.cards });
        if (event.type === 'slide') {
          const at = slides.findIndex((x) => x.id === event.slideId);
          if (at < 0) slides.push({ id: event.slideId, title: event.title });
          else slides[at] = { id: event.slideId, title: event.title };
          setDeckCompose({ phase: 'composing', slides: [...slides], rejected });
        } else if (event.type === 'rejected') {
          rejected++;
          setDeckCompose({ phase: 'composing', slides: [...slides], rejected });
        } else if (event.type === 'done') {
          setDeckCompose({ phase: 'composed', slides: [...slides] });
          setDeckSaved((await wire.orb.deck.get(canvasId, live.current.signal)).deck);
          return;
        } else if (event.type === 'failed') {
          return setDeckCompose({ phase: 'failed', message: event.message });
        }
      }
    } catch (err) {
      if (!live.current.signal.aborted) setDeckCompose({ phase: 'failed', message: (err as Error).message });
    }
  };

  const composing = compose.phase === 'composing';
  const runCompose = async (continueUnread: boolean) => {
    if (empty || composing) return;
    const target: PrintScope = scope;
    setExportUnread(null);
    if (!continueUnread) {
      const unread = unreadMustRead(board, target);
      if (unread.length > 0) return setCompose({ phase: 'unread', cards: unread });
    }
    const sections: { id: string; heading: string }[] = [];
    let rejected = 0;
    setCompose({ phase: 'composing', sections: [], rejected: 0 });
    try {
      for await (const event of wire.orb.port.compose(
        canvasId,
        { mode: 'doc', format: documentFormat, scope: target, instructions, continueUnread },
        { signal: live.current.signal },
      )) {
        if (event.type === 'unread') return setCompose({ phase: 'unread', cards: event.cards });
        if (event.type === 'section') {
          if (!sections.some((x) => x.id === event.sectionId))
            sections.push({ id: event.sectionId, heading: event.heading });
          setCompose({ phase: 'composing', sections: [...sections], rejected });
        } else if (event.type === 'rejected') {
          rejected++;
          setCompose({ phase: 'composing', sections: [...sections], rejected });
        } else if (event.type === 'done') {
          setCompose({ phase: 'composed', sections: [...sections] });
          const r = await wire.orb.port.get(canvasId, live.current.signal);
          setSaved(r.doc);
          return;
        } else if (event.type === 'failed') {
          setSaved((await wire.orb.port.get(canvasId, live.current.signal)).doc);
          return setCompose({ phase: 'failed', message: event.message });
        }
      }
    } catch (err) {
      if (!live.current.signal.aborted) setCompose({ phase: 'failed', message: (err as Error).message });
    }
  };

  const reportIssues =
    saved?.format === 'report' ? reportProblems(saved, reportPlan(board, saved.scope), board) : [];
  const reportNeedsComposition =
    mode === 'doc' && documentFormat === 'report' && (saved?.format !== 'report' || reportIssues.length > 0);

  const toggle = (id: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const run = async (continueUnread = false) => {
    if (empty || state.phase === 'exporting') return;
    // PRD Port › Composer: every Port warns about unread Must read cards in scope. A composed document was checked
    // when it was composed; a Canvas PDF or the standard-format document is checked here.
    if (!continueUnread && (mode === 'canvas' || (mode === 'doc' && !saved))) {
      const unread = unreadMustRead(board, scope);
      if (unread.length > 0) return setExportUnread(unread);
    }
    setExportUnread(null);
    setCompose((c) => (c.phase === 'unread' ? { phase: 'idle' } : c));
    setState({ phase: 'exporting' });
    try {
      const result = await exportPdf(
        wire,
        mode === 'canvas'
          ? { kind: 'canvas', canvasId, layout, theme, scope }
          : mode === 'deck'
            ? { kind: 'deck', canvasId }
            : { kind: 'doc', canvasId, scope: saved ? saved.scope : scope },
        live.current.signal,
      );
      if (!live.current.signal.aborted) setState({ phase: 'done', result });
    } catch (err) {
      if (!live.current.signal.aborted) setState({ phase: 'error', message: (err as Error).message });
    }
  };

  return (
    <div
      className={s.backdrop}
      data-panel="composer"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && state.phase !== 'exporting') onClose();
      }}
    >
      <section
        ref={sheet}
        className={s.sheet}
        role="dialog"
        aria-modal="true"
        aria-label="Publish Port"
        tabIndex={-1}
        data-testid="composer"
        data-state={state.phase}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && state.phase !== 'exporting') {
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <header className={s.head}>
          <div>
            <span className={s.kicker}>Port</span>
            <h2 className={s.title}>Publish Port</h2>
          </div>
          <button
            type="button"
            className={s.close}
            aria-label="Close"
            data-testid="composer-close"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </header>

        <Segmented
          label="Mode"
          value={mode}
          onChange={setMode}
          testid="composer-mode"
          options={[
            { value: 'canvas', label: 'Canvas PDF' },
            { value: 'doc', label: 'Research document' },
            { value: 'deck', label: 'Slides' },
          ]}
        />

        <div className={s.field}>
          <span className={s.label}>Scope</span>
          <label className={s.check}>
            <input
              type="radio"
              name="scope"
              checked={whole}
              onChange={() => setWhole(true)}
              data-testid="composer-scope-all"
            />
            The whole board
          </label>
          <label className={s.check}>
            <input
              type="radio"
              name="scope"
              checked={!whole}
              onChange={() => setWhole(false)}
              data-testid="composer-scope-frames"
            />
            Selected frames
          </label>
          {!whole && (
            <ul className={s.frames} data-testid="composer-frames">
              {frames.length === 0 && <li className={s.muted}>This board has no frames yet.</li>}
              {frames.map((f, i) => (
                <li key={f.id}>
                  <label className={s.check}>
                    <input
                      type="checkbox"
                      checked={ticked.has(f.id)}
                      onChange={() => toggle(f.id)}
                      data-testid="composer-frame"
                      data-frame-id={f.id}
                    />
                    <span className={s.frameNo}>{String(i + 1).padStart(2, '0')}</span> {f.title}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {mode === 'canvas' ? (
          <>
            <Segmented
              label="Layout"
              value={layout}
              onChange={setLayout}
              testid="composer-layout"
              options={[
                { value: 'frames', label: 'One page per frame' },
                { value: 'poster', label: 'Poster' },
              ]}
            />
            <Segmented
              label="Theme"
              value={theme}
              onChange={setTheme}
              testid="composer-theme"
              options={[
                { value: 'light', label: 'Light' },
                { value: 'night', label: 'Night, as on screen' },
              ]}
            />
          </>
        ) : mode === 'deck' ? (
          <>
            <div className={s.field}>
              <label className={s.label} htmlFor="composer-deck-format">
                Format
              </label>
              <select
                id="composer-deck-format"
                className={s.documentFormat}
                value={deckFormat}
                onChange={(e) => setDeckFormat(e.target.value)}
                data-testid="composer-deck-format"
              >
                <option value="">The template's deck (standard when it has none)</option>
                {DECK_FORMATS.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="composer-deck-instructions">
                Instructions
              </label>
              <textarea
                id="composer-deck-instructions"
                className={s.textarea}
                rows={3}
                maxLength={2000}
                placeholder="For example: a 10 minute pitch for the partners, lead with the market. Empty: the format's outline."
                value={deckInstructions}
                onChange={(e) => setDeckInstructions(e.target.value)}
                data-testid="composer-deck-instructions"
              />
            </div>
            {deckCompose.phase === 'unread' && (
              <UnreadWarning
                cards={deckCompose.cards}
                onOpenCard={onOpenCard}
                onContinue={() => void runComposeDeck(true)}
              />
            )}
            {(deckCompose.phase === 'composing' || deckCompose.phase === 'composed') && (
              <ol className={s.progress} data-testid="composer-deck-progress" data-phase={deckCompose.phase}>
                {deckCompose.slides.map((x) => (
                  <li key={x.id} data-testid="composer-progress-slide" data-slide-id={x.id}>
                    {x.title}
                  </li>
                ))}
                {deckCompose.phase === 'composing' && (
                  <li className={s.pending}>
                    {deckCompose.slides.length === 0 ? 'orb is planning the slides…' : 'Writing…'}
                  </li>
                )}
              </ol>
            )}
            {deckCompose.phase === 'failed' && (
              <p className={s.error} role="alert" data-testid="composer-deck-error">
                {deckCompose.message}
              </p>
            )}
            <p className={s.muted} data-testid="composer-deck-state">
              {deckSaved
                ? `A deck of ${deckSaved.slides.length} slide${deckSaved.slides.length === 1 ? '' : 's'} is saved; Export prints it as PDF slides.`
                : 'No slides composed yet: Compose writes them from the cards.'}{' '}
              <a href={routeHref({ name: 'deck', id: canvasId })} data-testid="composer-slide-view">
                Open the slide view
              </a>
            </p>
          </>
        ) : (
          <>
            <div className={s.field}>
              <label className={s.label} htmlFor="composer-document-format">
                Document format
              </label>
              <select
                id="composer-document-format"
                className={s.documentFormat}
                data-testid="composer-document-format"
                value={documentFormat}
                onChange={(e) => setDocumentFormat(e.target.value as 'report' | 'custom')}
                disabled={composing}
              >
                <option value="report">Professional research report</option>
                <option value="custom">Brief or custom structure</option>
              </select>
              <p className={s.muted}>
                {documentFormat === 'report'
                  ? 'Executive summary, methodology, detailed analysis, recommendations and limitations. Every section is checked before completion.'
                  : 'Choose this for a short memo or a structure you specify below. Paragraph citations are still required.'}
              </p>
            </div>
            <div className={s.field}>
              <label className={s.label} htmlFor="composer-instructions">
                Instructions
              </label>
              <textarea
                id="composer-instructions"
                className={s.textarea}
                rows={3}
                maxLength={2000}
                placeholder={
                  documentFormat === 'report'
                    ? 'Audience, purpose, emphasis and specific questions the report must answer.'
                    : 'For example: a one-page investor memo, or your required section structure.'
                }
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                data-testid="composer-instructions"
              />
            </div>
            {compose.phase === 'unread' && (
              <UnreadWarning
                cards={compose.cards}
                onOpenCard={onOpenCard}
                onContinue={() => void runCompose(true)}
              />
            )}
            {(compose.phase === 'composing' || compose.phase === 'composed') && (
              <ol className={s.progress} data-testid="composer-progress" data-phase={compose.phase}>
                {compose.sections.map((x) => (
                  <li key={x.id} data-testid="composer-progress-section" data-section-id={x.id}>
                    {x.heading}
                  </li>
                ))}
                {compose.phase === 'composing' && (
                  <li className={s.pending}>
                    {compose.sections.length === 0 ? 'orb is planning the sections…' : 'Writing…'}
                  </li>
                )}
              </ol>
            )}
            {compose.phase === 'failed' && (
              <p className={s.error} role="alert" data-testid="composer-compose-error">
                {compose.message}
              </p>
            )}
            <p className={s.muted} data-testid="composer-doc-state">
              {saved
                ? reportIssues.length
                  ? `Draft saved: ${reportIssues.length} report checks still need attention. Compose again to finish it.`
                  : `A document of ${saved.sections.length} section${saved.sections.length === 1 ? '' : 's'} is saved; Export prints it.`
                : documentFormat === 'report'
                  ? 'Compose the report before exporting. Its complete sections, citations and evidence are checked.'
                  : 'Nothing composed yet: Export produces a board evidence compilation.'}{' '}
              <a href={routeHref({ name: 'port', id: canvasId })} data-testid="composer-reading-view">
                Open the reading view
              </a>
            </p>
          </>
        )}

        {exportUnread && (
          <UnreadWarning cards={exportUnread} onOpenCard={onOpenCard} onContinue={() => void run(true)} />
        )}

        <footer className={s.foot}>
          <div className={s.status} role="status" data-testid="composer-status">
            {!native && 'Exporting a PDF needs the orb app.'}
            {native && state.phase === 'exporting' && 'Exporting…'}
            {state.phase === 'error' && <span className={s.error}>Export failed: {state.message}</span>}
            {state.phase === 'done' && (
              <span
                data-testid="composer-saved"
                data-path={state.result.export.path}
                data-file={state.result.export.file}
                data-pages={state.result.pages}
                data-expected-pages={state.result.expectedPages}
                data-card-types={JSON.stringify(state.result.cardTypes)}
                data-snapshots={state.result.snapshots}
                data-total-ms={state.result.totalMs}
              >
                Saved {state.result.export.path} ({state.result.pages}{' '}
                {state.result.pages === 1 ? 'page' : 'pages'})
              </span>
            )}
          </div>
          {state.phase === 'done' && (
            <button
              type="button"
              className={s.secondary}
              data-testid="composer-reveal"
              onClick={() => void revealExport(state.result.export.file)}
            >
              Reveal in Finder
            </button>
          )}
          {mode === 'deck' && (
            <button
              type="button"
              className={s.primary}
              data-testid="composer-compose-deck"
              disabled={empty || composingDeck || state.phase === 'exporting'}
              onClick={() => void runComposeDeck(false)}
            >
              {composingDeck ? 'Composing…' : deckSaved ? 'Compose again' : 'Compose slides'}
            </button>
          )}
          {mode === 'doc' && (
            <button
              type="button"
              className={s.primary}
              data-testid="composer-compose"
              disabled={empty || composing || state.phase === 'exporting'}
              onClick={() => void runCompose(false)}
            >
              {composing ? 'Composing…' : saved ? 'Compose again' : 'Compose'}
            </button>
          )}
          <button
            type="button"
            className={mode === 'doc' || mode === 'deck' ? s.secondary : s.primary}
            data-testid="composer-export"
            disabled={
              !native ||
              reportNeedsComposition ||
              (mode === 'deck' ? !deckSaved || composingDeck : empty || composing) ||
              state.phase === 'exporting'
            }
            onClick={() => void run()}
          >
            {state.phase === 'exporting'
              ? 'Exporting…'
              : mode === 'deck'
                ? 'Export PDF slides'
                : 'Export PDF'}
          </button>
        </footer>
      </section>
    </div>
  );
}
