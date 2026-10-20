/**
 * Home (BUILD_PLAN P2.6, PRD Home; look from design/screens/home.html):
 *   - tagline + three rotating topic words (pool of 24, every 2.8 s, paused under Reduce Motion), and the night/day
 *     toggle (saved in orb.json by the App);
 *   - the ask box: Enter creates a canvas; a link typed in it, or a file, link or text dropped on it, creates a canvas
 *     seeded with that item (seed.ts); template chips pick one of the five templates (frames + agent brief);
 *   - recent canvases as tiles with a mini preview (frames as coloured rects) and the agents' status;
 *   - full-text search across every canvas (`orb/canvas.search`, index.sqlite).
 *
 * P5.1 warming up: with no `wire`, Home is the boot page main shows at launch while the sidecar starts
 * (`orb-boot://app/`). The box reads "Warming up…", Start and the engine-backed controls wait, and what the user
 * types is handed to the live Home (window.orbNative.boot) when the sidecar is ready. Its test ids carry a `warming-`
 * prefix so nothing written for the live Home can act on the boot page by accident.
 */
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import {
  SEARCH_MARK_CLOSE,
  SEARCH_MARK_OPEN,
  TEMPLATES,
  formatTokens,
  formatUsd,
  intakeTitle,
  isHttpUrl,
  specOf,
  templateOf,
  type CanvasSummary,
  type FrameColor,
  type SearchHit,
  type TemplateId,
  type ThemeMode,
} from '@orb/shared';
import { routeHref } from '../../app/router.js';
import { navigate } from '../../app/useRoute.js';
import { itemsFromTransfer, type IngestItem } from '../../cards/ingest.js';
import { cardTypeLabel } from '../../cards/labels.js';
import { pdfSummary } from '../../cards/pdf.js';
import { imageSize } from '../../cards/useIngest.js';
import { OrbLockup, OrbMark } from '../../brand/OrbMark.js';
import { ArrowRightIcon, MoonIcon, SunIcon } from '../../components/icons.js';
import { orbNative } from '../../print/native.js';
import { KeychainHint } from '../../app/KeychainHint.js';
import { isWireError, type OrbPingValue, type Wire } from '../../wire/index.js';
import { IntakeForm, type IntakeSubmit } from './IntakeForm.js';
import { seedCanvas, startFromIntake } from './seed.js';
import s from './Home.module.css';
import { onReduceMotionChange, reduceMotion } from '../../theme/motion.js';

/** The prototype's pool of 24 topic words. */
export const TOPIC_WORDS = [
  'Kites',
  'Nebula',
  'Ocean',
  'Saffron',
  'Monsoons',
  'Black holes',
  'Tea',
  'Chess',
  'Coral',
  'Volcanoes',
  'Bridges',
  'Bees',
  'Jazz',
  'Glaciers',
  'Silk',
  'Comets',
  'Fungi',
  'Lighthouses',
  'Origami',
  'Cricket',
  'Tides',
  'Spices',
  'Satellites',
  'Deserts',
];

/** Tiles shown before "See all". */
export const RECENT_TILES = 8;

function pickWords(): string[] {
  const pool = TOPIC_WORDS.slice();
  return [0, 1, 2].map(() => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
}

/** Three words that change every 2.8 s; paused under Reduce Motion (macOS or Settings). */
function useRotatingWords(): string[] {
  const [words, setWords] = useState(() => ['Kites', 'Nebula', 'Ocean']);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(timer);
      timer = reduceMotion() ? undefined : setInterval(() => setWords(pickWords()), 2800);
    };
    sync();
    const off = onReduceMotionChange(sync);
    return () => {
      clearInterval(timer);
      off();
    };
  }, []);
  return words;
}

const FRAME_STROKE: Record<FrameColor, string> = {
  sky: 'var(--orb-sky)',
  signal: 'var(--orb-signal)',
  rho: 'var(--orb-rho)',
  paper: 'var(--orb-text-faint)',
};

/** A tile's mini preview: the board's frames as coloured rects (its cards when it has no frames yet). */
export function TilePreview({ preview }: { preview: CanvasSummary['preview'] }) {
  const rects = preview.frames.length > 0 ? preview.frames : preview.cards;
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of [...preview.frames, ...preview.cards]) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  const pad = Math.max(maxX - minX, maxY - minY) * 0.06 + 8;
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`;
  return (
    <svg className={s.previewSvg} viewBox={vb} preserveAspectRatio="xMidYMid meet" data-testid="tile-preview">
      {preview.frames.map((f, i) => (
        <rect
          key={`f${i}`}
          x={f.x}
          y={f.y}
          width={f.w}
          height={f.h}
          rx={Math.min(f.w, f.h) * 0.06}
          fill="none"
          stroke={FRAME_STROKE[f.color]}
          strokeWidth={1.25}
          vectorEffect="non-scaling-stroke"
          data-frame-color={f.color}
        />
      ))}
      {preview.cards.map((c, i) => (
        <rect
          key={`c${i}`}
          x={c.x}
          y={c.y}
          width={c.w}
          height={c.h}
          rx={Math.min(c.w, c.h) * 0.08}
          className={s.previewCard}
        />
      ))}
    </svg>
  );
}

/** Snippet text with the matched terms in `<mark>`. */
function Snippet({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest.length > 0) {
    const open = rest.indexOf(SEARCH_MARK_OPEN);
    if (open === -1) {
      parts.push(rest);
      break;
    }
    if (open > 0) parts.push(rest.slice(0, open));
    const close = rest.indexOf(SEARCH_MARK_CLOSE, open + 1);
    const end = close === -1 ? rest.length : close;
    parts.push(<mark key={key++}>{rest.slice(open + 1, end)}</mark>);
    rest = close === -1 ? '' : rest.slice(close + 1);
  }
  return <>{parts}</>;
}

const unmarked = (snippet: string) =>
  snippet.replaceAll(SEARCH_MARK_OPEN, '').replaceAll(SEARCH_MARK_CLOSE, '');

const hitKind = (hit: SearchHit) =>
  hit.kind === 'canvas' ? 'Canvas' : hit.kind === 'frame' ? 'Frame' : cardTypeLabel(hit.cardType ?? 'note');

const ACCEPTS = ['Files', 'text/uri-list', 'text/plain'];
const accepts = (dt: DataTransfer | null) => !!dt && ACCEPTS.some((t) => dt.types.includes(t));

export function HomeScreen({
  wire,
  theme,
  onTheme,
}: {
  /** Absent on the warming-up boot page (P5.1). */
  wire: Wire | undefined;
  theme: ThemeMode;
  onTheme: (mode: ThemeMode) => void;
}) {
  const warming = !wire;
  const tid = (id: string) => (warming ? `warming-${id}` : id);
  const words = useRotatingWords();
  const [pong, setPong] = useState<OrbPingValue>();
  const [canvases, setCanvases] = useState<CanvasSummary[]>();
  const [prompt, setPrompt] = useState('');
  const [template, setTemplate] = useState<TemplateId>();
  // P6.11: a v2 template (VC due diligence...) asks its intake form first.
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [dropActive, setDropActive] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ q: string; hits: SearchHit[] }>();
  const input = useRef<HTMLInputElement>(null);
  const night = theme === 'night';

  const report = (e: unknown) =>
    setError(isWireError(e) ? `${e.code}: ${e.message}` : ((e as Error)?.message ?? String(e)));

  // P4.2: without a working model key the box explains that one is needed and links to Settings.
  const [keyNeeded, setKeyNeeded] = useState(false);
  useEffect(() => {
    if (!wire) return;
    const ac = new AbortController();
    wire.orb.models.describe(ac.signal).then(
      (d) => setKeyNeeded(!d.anyUsable),
      () => undefined,
    );
    return () => ac.abort();
  }, [wire]);

  useEffect(() => {
    if (!wire) return;
    const ac = new AbortController();
    wire.orb.ping(ac.signal).then(setPong, (e: unknown) => !ac.signal.aborted && report(e));
    wire.orb.canvas.list(ac.signal).then(setCanvases, (e: unknown) => !ac.signal.aborted && report(e));
    return () => ac.abort();
  }, [wire]);

  // P5.1: a performance mark when the live Home first has its canvases (apps/desktop/e2e/startup.spec.ts reads it).
  const loaded = canvases !== undefined;
  useEffect(() => {
    if (loaded && performance.getEntriesByName('orb:home-live').length === 0)
      performance.mark('orb:home-live');
  }, [loaded]);

  // Search as you type (debounced); the newest query wins.
  useEffect(() => {
    const q = query.trim();
    if (!q || !wire) {
      setResults(undefined);
      return;
    }
    const ac = new AbortController();
    const timer = setTimeout(() => {
      wire.orb.canvas.search({ q }, ac.signal).then(
        (r) => setResults({ q, hits: r.hits }),
        (e: unknown) => !ac.signal.aborted && report(e),
      );
    }, 150);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [wire, query]);

  // A drop that misses the ask box must not navigate the window to the file or link.
  useEffect(() => {
    const stop = (e: globalThis.DragEvent) => {
      if (accepts(e.dataTransfer)) e.preventDefault();
    };
    window.addEventListener('dragover', stop);
    window.addEventListener('drop', stop);
    return () => {
      window.removeEventListener('dragover', stop);
      window.removeEventListener('drop', stop);
    };
  }, []);

  // P5.1: hand the draft over. The boot page keeps main's copy current; the live Home takes it once on mount.
  useEffect(() => {
    if (!warming) return;
    orbNative()?.boot?.setDraft({ prompt, ...(template ? { template } : {}) });
  }, [warming, prompt, template]);
  useEffect(() => {
    if (warming) return;
    let live = true;
    void orbNative()
      ?.boot?.takeDraft()
      .then((draft) => {
        if (!live || !draft) return;
        setPrompt((cur) => cur || draft.prompt);
        const t = TEMPLATES.find((x) => x.id === draft.template);
        if (t) setTemplate((cur) => cur ?? t.id);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [warming]);

  async function seed(items: IngestItem[], text: string) {
    if (!wire || busy || items.length === 0) return;
    setError(undefined);
    setBusy(
      items.length === 1 ? 'Starting a canvas from it…' : `Starting a canvas from ${items.length} items…`,
    );
    try {
      const { meta, errors } = await seedCanvas(
        wire,
        items,
        { prompt: text, template },
        { pdfSummary, imageSize },
      );
      if (errors.length > 0) console.warn(`orb: some dropped items were skipped: ${errors.join(' · ')}`);
      navigate({ name: 'canvas', id: meta.id });
    } catch (err) {
      report(err);
      setBusy(undefined);
    }
  }

  async function startIntake({ answers, depth, items }: IntakeSubmit) {
    const spec = specOf(template);
    if (!wire || !spec || busy) return;
    setError(undefined);
    setBusy(
      items.length > 0
        ? `Creating the canvas and adding ${items.length} file${items.length === 1 ? '' : 's'}…`
        : 'Creating…',
    );
    try {
      const { meta, errors } = await startFromIntake(
        wire,
        { prompt: intakeTitle(spec, answers), template: spec.id, intake: answers, depth, items },
        { pdfSummary, imageSize },
      );
      if (errors.length > 0) console.warn(`orb: some materials were skipped: ${errors.join(' · ')}`);
      setIntakeOpen(false);
      navigate({ name: 'canvas', id: meta.id });
    } catch (err) {
      report(err);
      setBusy(undefined);
    }
  }

  async function create(e?: FormEvent) {
    e?.preventDefault();
    if (!wire || busy) return;
    const text = prompt.trim();
    // P6.11: a template with an intake form asks it first (what is in the box becomes its first answer).
    if (specOf(template) && !isHttpUrl(text)) {
      setIntakeOpen(true);
      return;
    }
    // A link typed or pasted into the box seeds the canvas with it (a Source card).
    if (isHttpUrl(text)) return seed([{ kind: 'url', url: text }], '');
    const title = text || (template ? templateOf(template).label : '');
    if (!title) return;
    setError(undefined);
    setBusy('Creating…');
    try {
      // start: Orb's new-canvas turn (P3.3: it proposes frames and starts Scout and Critic).
      const meta = await wire.orb.canvas.create({
        prompt: title,
        start: true,
        ...(template ? { template } : {}),
      });
      navigate({ name: 'canvas', id: meta.id });
    } catch (err) {
      report(err);
      setBusy(undefined);
    }
  }

  const onDragOver = (e: DragEvent<HTMLFormElement>) => {
    if (warming || !accepts(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDropActive(true);
  };
  const onDragLeave = (e: DragEvent<HTMLFormElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDropActive(false);
  };
  const onDrop = (e: DragEvent<HTMLFormElement>) => {
    setDropActive(false);
    if (warming || !accepts(e.dataTransfer)) return;
    e.preventDefault();
    void seed(itemsFromTransfer(e.dataTransfer), prompt.trim());
  };

  const chosen = template ? templateOf(template) : undefined;
  const tiles = canvases ?? [];
  const visible = showAll ? tiles : tiles.slice(0, RECENT_TILES);
  const searching = query.trim().length > 0;

  return (
    <main
      className={`${s.home} ${night ? s.night : s.day}`}
      data-testid={tid('home-screen')}
      data-warming={warming ? 'yes' : 'no'}
      aria-busy={warming}
    >
      <div aria-hidden="true" className={s.glow1} />
      <div aria-hidden="true" className={s.glow2} />
      <div aria-hidden="true" className={s.glow3} />

      <header className={s.topBar}>
        <div className={s.brand}>
          <OrbLockup markSize={30} testId="brand-lockup" />
        </div>
        <div className={s.topActions}>
          {warming ? (
            // Settings live in the engine; the link appears with the live Home.
            <span className={`${s.pillButton} ${s.pillWaiting}`} aria-disabled="true">
              Settings
            </span>
          ) : (
            <a href={routeHref({ name: 'settings' })} className={s.pillButton} data-testid="open-settings">
              Settings
            </a>
          )}
          <button
            type="button"
            className={s.pillButton}
            aria-label={night ? 'Switch to light mode' : 'Switch to dark mode'}
            data-testid={tid('theme-toggle')}
            disabled={warming}
            onClick={() => onTheme(night ? 'day' : 'night')}
          >
            {night ? <SunIcon /> : <MoonIcon />}
            <span>{night ? 'Light mode' : 'Dark mode'}</span>
          </button>
        </div>
      </header>

      <div className={s.hero}>
        <span className={s.tagline} data-testid={tid('home-tagline')}>
          {night ? 'Don’t go gentle into the night!' : 'Everything the sun touches'}
        </span>
        <h1 className={s.words} data-testid={tid('topic-words')}>
          {words[0]}? <span className={s.accentWord}>{words[1]}?</span> {words[2]}?
        </h1>
      </div>

      <div className={s.askBlock}>
        <form
          className={`${s.ask} ${dropActive ? s.askDrop : ''}`}
          data-testid={tid('home-ask')}
          data-drop={dropActive ? 'active' : 'idle'}
          onSubmit={(e) => void create(e)}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <label htmlFor="orb-ask" className="orb-sr-only">
            Start a new research canvas
          </label>
          <input
            ref={input}
            id="orb-ask"
            data-testid={tid('home-prompt')}
            className={s.askInput}
            type="text"
            autoComplete="off"
            placeholder={
              dropActive
                ? 'Drop to start a canvas from it'
                : (chosen?.placeholder ?? 'Ask anything, paste a link, or drop a file')
            }
            aria-describedby={warming ? 'orb-warming' : undefined}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <button
            type="submit"
            aria-label="Start canvas"
            data-testid={tid('orb-create')}
            className={s.askGo}
            disabled={warming || (!prompt.trim() && !template) || !!busy}
          >
            <ArrowRightIcon />
          </button>
        </form>
        <div className={s.chips} role="group" aria-label="Templates">
          {TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`${s.pillButton} ${template === t.id ? s.chipOn : ''}`}
              aria-pressed={template === t.id}
              data-testid={tid('template-chip')}
              data-template={t.id}
              onClick={() => {
                const off = template === t.id;
                setTemplate(off ? undefined : t.id);
                // P6.11: picking a template that has an intake form opens it (the warming-up Home only selects).
                if (!off && t.spec && !warming) setIntakeOpen(true);
                else input.current?.focus();
              }}
            >
              <span aria-hidden="true" className={s.chipDot} style={{ background: t.dot }} />
              {t.label}
            </button>
          ))}
        </div>
        {warming && (
          <p className={`${s.notice} ${s.warming}`} id="orb-warming" data-testid="home-warming" role="status">
            <span aria-hidden="true" className={s.warmingDot} />
            Warming up… you can start typing.
          </p>
        )}
        <KeychainHint wire={wire} className={s.notice} />
        {keyNeeded && (
          <p className={s.notice} data-testid={tid('home-key-needed')} role="status">
            Agents need a model key before they can work.{' '}
            <a href={routeHref({ name: 'settings' })} className={s.noticeLink}>
              Add one in Settings
            </a>
          </p>
        )}
        {busy && (
          <p className={s.notice} data-testid={tid('home-busy')} role="status">
            {busy}
          </p>
        )}
        {error && (
          <p className={s.error} data-testid={tid('orb-error')} role="alert">
            {error}
          </p>
        )}
      </div>

      <section className={s.canvases} aria-labelledby="orb-your-canvases">
        <div className={s.sectionHead}>
          <span className={s.sectionLabel} id="orb-your-canvases">
            {searching ? 'Search results' : 'Your canvases'}
          </span>
          <div className={s.sectionTools}>
            <label htmlFor="orb-search" className="orb-sr-only">
              Search all canvases
            </label>
            <input
              id="orb-search"
              type="search"
              className={s.search}
              data-testid={tid('home-search')}
              placeholder="Search canvases"
              disabled={warming}
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setQuery('');
              }}
            />
            {!searching && tiles.length > RECENT_TILES && (
              <button
                type="button"
                className={s.seeAll}
                data-testid={tid('see-all')}
                aria-expanded={showAll}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? 'Show recent' : `See all (${tiles.length})`}
              </button>
            )}
          </div>
        </div>

        {searching ? (
          <ul
            className={s.results}
            data-testid={tid('search-results')}
            data-query={results?.q ?? ''}
            aria-live="polite"
          >
            {results?.hits.map((hit) => (
              <li key={`${hit.canvasId}/${hit.itemId}`}>
                <button
                  type="button"
                  className={s.result}
                  data-testid={tid('search-hit')}
                  data-canvas-id={hit.canvasId}
                  data-item-id={hit.itemId}
                  onClick={() =>
                    navigate(
                      hit.kind === 'canvas'
                        ? { name: 'canvas', id: hit.canvasId }
                        : { name: 'canvas', id: hit.canvasId, focus: hit.itemId },
                    )
                  }
                >
                  <span className={s.resultMeta}>
                    {hit.canvasTitle} · {hitKind(hit)}
                  </span>
                  <span className={s.resultTitle} data-testid={tid('search-hit-title')}>
                    {/* The match is in the title itself: highlight it there instead of repeating it below. */}
                    {hit.snippet && unmarked(hit.snippet) === hit.title ? (
                      <Snippet text={hit.snippet} />
                    ) : (
                      hit.title
                    )}
                  </span>
                  {hit.snippet && unmarked(hit.snippet) !== hit.title && (
                    <span className={s.resultSnippet}>
                      <Snippet text={hit.snippet} />
                    </span>
                  )}
                </button>
              </li>
            ))}
            {results && results.hits.length === 0 && (
              <li className={s.empty}>Nothing matches “{results.q}”.</li>
            )}
          </ul>
        ) : (
          <>
            <ul
              className={s.tiles}
              data-testid={tid('orb-canvas-list')}
              data-loaded={canvases ? 'yes' : 'no'}
            >
              {visible.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`${s.tile} ${c.status.working > 0 ? s.tileLive : ''}`}
                    data-testid={tid('orb-canvas-open')}
                    data-canvas-id={c.id}
                    data-frames={c.preview.frames.length}
                    data-cards={c.preview.cardCount}
                    onClick={() => navigate({ name: 'canvas', id: c.id })}
                  >
                    <div aria-hidden="true" className={s.tilePreview}>
                      <TilePreview preview={c.preview} />
                      {c.status.working > 0 && <span className={s.tileDot} />}
                    </div>
                    <div className={s.tileText}>
                      <span className={s.tileTitle}>{c.title}</span>
                      <span className={s.tileMeta} data-testid={tid('tile-status')}>
                        {[
                          c.status.label,
                          c.template ? templateOf(c.template).label : undefined,
                          `${c.preview.cardCount} card${c.preview.cardCount === 1 ? '' : 's'}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      {c.cost && (
                        <span
                          className={s.tileCost}
                          data-testid={tid('tile-cost')}
                          data-total={c.cost.total}
                          data-usd={c.cost.usd}
                        >
                          {c.cost.planOnly
                            ? `${formatTokens(c.cost.total)} · ChatGPT plan`
                            : `${formatTokens(c.cost.total)} · ${formatUsd(c.cost.usd)}${c.cost.partial ? '+' : ''}`}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            {warming && <p className={s.empty}>Loading your canvases…</p>}
            {canvases && canvases.length === 0 && (
              <p className={`${s.empty} ${s.emptyBrand}`} data-testid="home-empty">
                <OrbMark size={24} />
                No canvases yet. Ask something above to start one.
              </p>
            )}
          </>
        )}
      </section>

      <p className={s.status} data-testid={tid('orb-ping')}>
        {pong
          ? `${pong.service} ${pong.version}`
          : warming
            ? 'Starting the local engine…'
            : 'Connecting to the local engine…'}
      </p>
      {intakeOpen && chosen?.spec && !warming && (
        <IntakeForm
          spec={chosen.spec}
          initial={prompt.trim()}
          busy={busy}
          error={error}
          onSubmit={(submit) => void startIntake(submit)}
          onCancel={() => {
            setIntakeOpen(false);
            setError(undefined);
            input.current?.focus();
          }}
        />
      )}
    </main>
  );
}
