/**
 * The Port reading view (BUILD_PLAN P4.5, PRD Port › Reading view; look from design/screens/port.html, minus "Copy
 * link" and "Fork this board", with "Back to canvas" in place of "See the research behind this"):
 *
 * - the composed research document (`port.get`): sections with numbered citations; each citation links back to its
 *   card on the canvas (`#/canvas/<id>?focus=<card>`), and the reference list names the cards and their URLs;
 * - figures Orb placed in a section are drawn with the cards' print halves; the aside lists the scope's frames;
 * - inline editing: a paragraph opens as a text box (Save keeps its citations: `port.saveDoc` changes text only),
 *   headings too; "Add paragraph" writes a user paragraph, marked as yours and exempt from the citation rule;
 * - per-section Regenerate: Orb rewrites that section with the saved instructions (`port.regenerateSection`).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AGENT_LABELS, type AgentName, type BoardState, type PortDoc, type PortSaveArgs } from '@orb/shared';
import { routeHref } from '../../app/router.js';
import { OrbLockup } from '../../brand/OrbMark.js';
import { BoardIcon } from '../../components/icons.js';
import type { Wire } from '../../wire/index.js';
import { loadBoard } from '../../print/PrintApp.js';
import { PrintCard } from '../../print/PrintCard.js';
import { PrintCtx, type PrintContext } from '../../print/kit.js';
import { composedOutline, type ComposedParagraph, type ComposedSection } from '../../print/outline.js';
import print from '../../print/print.module.css';
import s from './Port.module.css';

type Loaded = { title: string; board: BoardState; doc: PortDoc | null };

/** The edits of the whole document with one change applied (`port.saveDoc` takes the full text). */
function editsOf(
  doc: PortDoc,
  change: (sectionId: string, paragraphs: { id?: string; text: string }[]) => { id?: string; text: string }[],
  heading?: { sectionId: string; text: string },
): PortSaveArgs {
  return {
    version: doc.version,
    sections: doc.sections.map((sec) => ({
      id: sec.id,
      heading: heading?.sectionId === sec.id ? heading.text : sec.heading,
      paragraphs: change(
        sec.id,
        sec.paragraphs.map((p) => ({ id: p.id, text: p.text })),
      ),
    })),
  };
}

function Paragraph({
  canvasId,
  para,
  busy,
  onSave,
  onRemove,
}: {
  canvasId: string;
  para: ComposedParagraph;
  busy: boolean;
  onSave: (text: string) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(para.text);
  useEffect(() => setText(para.text), [para.text]);
  if (editing) {
    return (
      <div className={s.editBox} data-testid="port-paragraph-editor">
        <textarea
          className={s.editText}
          value={text}
          rows={Math.min(14, Math.max(3, Math.ceil(text.length / 90)))}
          onChange={(e) => setText(e.target.value)}
          aria-label="Paragraph text"
          data-testid="port-edit-text"
          autoFocus
        />
        <div className={s.editBar}>
          {!para.userAuthored && para.cites.length > 0 && (
            <span className={s.editNote}>Keeps its {para.cites.length === 1 ? 'citation' : 'citations'}</span>
          )}
          <button
            type="button"
            className={s.ghost}
            data-testid="port-edit-remove"
            disabled={busy}
            onClick={() => void onRemove().then(() => setEditing(false))}
          >
            Remove
          </button>
          <button
            type="button"
            className={s.ghost}
            data-testid="port-edit-cancel"
            onClick={() => {
              setText(para.text);
              setEditing(false);
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className={s.save}
            data-testid="port-edit-save"
            disabled={busy || !text.trim()}
            onClick={() => void onSave(text.trim()).then(() => setEditing(false))}
          >
            Save
          </button>
        </div>
      </div>
    );
  }
  return (
    <p
      className={para.userAuthored ? `${s.para} ${s.userPara}` : s.para}
      data-testid="port-paragraph"
      data-paragraph-id={para.id}
      data-user-authored={para.userAuthored ? 'true' : undefined}
      data-edited={para.edited ? 'true' : undefined}
    >
      <span className={s.paraText}>{para.text}</span>
      {para.cites.map((c) => (
        <a
          key={c.cardId}
          className={s.cite}
          href={routeHref({ name: 'canvas', id: canvasId, focus: c.cardId })}
          title={`${c.n}. ${c.title}`}
          data-testid="port-cite"
          data-n={c.n}
          data-card-id={c.cardId}
        >
          {c.frame ? `${c.frame} ${c.n}` : c.n}
        </a>
      ))}
      {para.userAuthored && <span className={s.tag}>You</span>}
      {para.edited && <span className={s.tag}>Edited</span>}
      <button
        type="button"
        className={s.editButton}
        aria-label="Edit paragraph"
        data-testid="port-edit"
        disabled={busy}
        onClick={() => setEditing(true)}
      >
        Edit
      </button>
    </p>
  );
}

function Section({
  canvasId,
  section,
  busy,
  regenerating,
  onRegenerate,
  onHeading,
  onParagraphs,
}: {
  canvasId: string;
  section: ComposedSection;
  busy: boolean;
  regenerating: boolean;
  onRegenerate: () => void;
  onHeading: (text: string) => Promise<void>;
  onParagraphs: (
    change: (paragraphs: { id?: string; text: string }[]) => { id?: string; text: string }[],
  ) => Promise<void>;
}) {
  const [heading, setHeading] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  return (
    <section
      id={`port-section-${section.id}`}
      className={s.section}
      data-testid="port-section"
      data-section-id={section.id}
      data-state={regenerating ? 'regenerating' : 'ready'}
      aria-busy={regenerating || undefined}
    >
      <div className={s.sectionHead}>
        {heading === null ? (
          <h2
            className={s.h2}
            data-testid="port-heading"
            onDoubleClick={() => !busy && setHeading(section.heading)}
          >
            {section.heading}
          </h2>
        ) : (
          <form
            className={s.headingForm}
            onSubmit={(e) => {
              e.preventDefault();
              if (heading.trim()) void onHeading(heading.trim()).then(() => setHeading(null));
            }}
          >
            <input
              className={s.headingInput}
              value={heading}
              maxLength={120}
              onChange={(e) => setHeading(e.target.value)}
              aria-label="Section heading"
              data-testid="port-heading-input"
              autoFocus
            />
            <button type="submit" className={s.save} disabled={busy}>
              Save
            </button>
            <button type="button" className={s.ghost} onClick={() => setHeading(null)}>
              Cancel
            </button>
          </form>
        )}
        <div className={s.sectionActions}>
          <button
            type="button"
            className={s.ghost}
            data-testid="port-heading-edit"
            disabled={busy}
            onClick={() => setHeading(section.heading)}
          >
            Rename
          </button>
          <button
            type="button"
            className={s.regen}
            data-testid="port-regenerate"
            disabled={busy}
            onClick={onRegenerate}
          >
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </button>
        </div>
      </div>
      {section.paragraphs.map((para) => (
        <Paragraph
          key={para.id}
          canvasId={canvasId}
          para={para}
          busy={busy}
          onSave={(text) => onParagraphs((ps) => ps.map((p) => (p.id === para.id ? { ...p, text } : p)))}
          onRemove={() => onParagraphs((ps) => ps.filter((p) => p.id !== para.id))}
        />
      ))}
      {section.figures.map((f) => (
        <div key={f.card.id} className={`${print.docRoot} ${s.figure}`} data-testid="port-figure">
          <PrintCard
            card={f.card}
            mode="figure"
            label={f.label}
            caption={f.caption}
            {...(f.source !== undefined ? { source: f.source } : {})}
          />
        </div>
      ))}
      {adding === null ? (
        <button
          type="button"
          className={s.add}
          data-testid="port-add-paragraph"
          disabled={busy}
          onClick={() => setAdding('')}
        >
          Add paragraph
        </button>
      ) : (
        <div className={s.editBox}>
          <textarea
            className={s.editText}
            rows={3}
            value={adding}
            placeholder="Your paragraph. It is marked as yours and needs no citation."
            onChange={(e) => setAdding(e.target.value)}
            aria-label="New paragraph"
            data-testid="port-add-text"
            autoFocus
          />
          <div className={s.editBar}>
            <button type="button" className={s.ghost} onClick={() => setAdding(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={s.save}
              data-testid="port-add-save"
              disabled={busy || !adding.trim()}
              onClick={() =>
                void onParagraphs((ps) => [...ps, { text: adding.trim() }]).then(() => setAdding(null))
              }
            >
              Add
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function PortScreen({ wire, canvasId }: { wire: Wire; canvasId: string }) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState<string>();

  const load = useCallback(
    async (signal: AbortSignal) => {
      const [list, board, port] = await Promise.all([
        wire.orb.canvas.list(signal),
        loadBoard(wire, canvasId, signal),
        wire.orb.port.get(canvasId, signal),
      ]);
      const title = list.find((c) => c.id === canvasId)?.title ?? 'Research document';
      setLoaded({ title, board, doc: port.doc });
    },
    [wire, canvasId],
  );

  useEffect(() => {
    const ac = new AbortController();
    load(ac.signal).catch((err: unknown) => !ac.signal.aborted && setError((err as Error).message));
    return () => ac.abort();
  }, [load]);

  const outline = useMemo(
    () => (loaded?.doc ? composedOutline(loaded.doc, loaded.board) : undefined),
    [loaded],
  );
  const ctx = useMemo<PrintContext>(
    () => ({
      assetUrl: (path) => wire.assets.url(canvasId, { path }),
      snapshots: new Map(),
      frameUrl: (cardId, version) => wire.assets.designFrameUrl(canvasId, cardId, version),
    }),
    [wire, canvasId],
  );
  const agents = useMemo(() => {
    if (!loaded?.doc) return [];
    const who = new Set<AgentName>(['orb']);
    for (const sec of loaded.doc.sections)
      for (const p of sec.paragraphs)
        for (const id of p.cardIds) {
          const card = loaded.board.cards[id];
          if (card?.provenance.kind === 'agent') who.add(card.provenance.agent);
        }
    return [...who].map((a) => AGENT_LABELS[a]);
  }, [loaded]);

  const save = async (args: PortSaveArgs) => {
    setSaving(true);
    setError(undefined);
    try {
      const { doc } = await wire.orb.port.saveDoc(canvasId, args);
      setLoaded((l) => (l ? { ...l, doc } : l));
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const regenerate = async (sectionId: string) => {
    setRegenerating(sectionId);
    setError(undefined);
    try {
      await wire.orb.port.regenerateSection(canvasId, sectionId);
      const ac = new AbortController();
      await load(ac.signal);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRegenerating(undefined);
    }
  };

  const busy = saving || regenerating !== undefined;
  const doc = loaded?.doc;
  const date = doc
    ? new Date(doc.composedAt).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '';
  const cited = outline?.references.length ?? 0;

  return (
    <main
      className={s.page}
      data-testid="port-screen"
      data-canvas-id={canvasId}
      data-state={!loaded ? 'loading' : doc ? 'composed' : 'empty'}
      data-version={doc?.version}
    >
      <div className={s.glow} aria-hidden="true" />
      <div className={s.shell}>
        <div className={s.topBar}>
          <div className={s.brand}>
            <OrbLockup markSize={28} testId="brand-lockup" />
            <span className={s.chip}>PORT</span>
          </div>
          <a
            href={routeHref({ name: 'canvas', id: canvasId })}
            className={s.back}
            data-testid="back-to-canvas"
          >
            <BoardIcon size={16} />
            Back to canvas
          </a>
        </div>

        {error && (
          <p className={s.error} role="alert" data-testid="port-error">
            {error}
          </p>
        )}

        {loaded && !doc && (
          <div className={s.hero}>
            <span className={s.eyebrow}>Port</span>
            <h1 className={s.h1}>{loaded.title}</h1>
            <p className={s.lead} data-testid="port-empty">
              Nothing has been composed for this canvas yet. Publish Port on the canvas, choose Research
              document and Compose: orb writes the document from the cards, and every claim cites back to
              them.
            </p>
          </div>
        )}

        {loaded && doc && outline && (
          <>
            <div className={s.hero}>
              <span className={s.eyebrow}>
                {doc.format === 'report' ? 'Research report' : 'Research document'}
              </span>
              <h1 className={s.h1} data-testid="port-title">
                {doc.title}
              </h1>
              {/* P5.6: the lead describes the document (design/screens/port.html); the compose instructions are
                  a request to orb, not a summary for the reader, so they are not shown here. */}
              <p className={s.lead} data-testid="port-lead">
                {`${outline.sections.length} sections of analysis, supporting evidence and source references.`}
              </p>
              <div className={s.byline}>
                <span className={s.avatar} aria-hidden="true">
                  O
                </span>
                <span>
                  {agents.length ? `${agents.join(', ').replace(/, ([^,]*)$/, ' and $1')} · ` : ''}
                  {date} · Version {doc.version} · {cited} cited {cited === 1 ? 'card' : 'cards'}
                </span>
              </div>
              {Boolean(outline.document?.problems.length) && (
                <div className={s.draft} role="status" data-testid="port-report-draft">
                  <strong>Draft - further development required</strong>
                  <ul>
                    {outline.document!.problems.slice(0, 4).map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className={s.columns}>
              <PrintCtx.Provider value={ctx}>
                <article className={s.article} data-testid="port-article">
                  {outline.sections.map((section) => (
                    <Section
                      key={section.id}
                      canvasId={canvasId}
                      section={section}
                      busy={busy}
                      regenerating={regenerating === section.id}
                      onRegenerate={() => void regenerate(section.id)}
                      onHeading={(text) =>
                        save(editsOf(doc, (_, ps) => ps, { sectionId: section.id, text })).catch(
                          () => undefined,
                        )
                      }
                      onParagraphs={(change) =>
                        save(editsOf(doc, (id, ps) => (id === section.id ? change(ps) : ps))).catch(
                          () => undefined,
                        )
                      }
                    />
                  ))}
                  {outline.references.length > 0 && (
                    <section className={s.section} data-testid="port-references">
                      <h2 className={s.h2}>References</h2>
                      <ol className={s.refs}>
                        {outline.references.map((r) => (
                          <li key={r.n} value={r.n} data-testid="port-reference" data-card-id={r.cardId}>
                            <a href={routeHref({ name: 'canvas', id: canvasId, focus: r.cardId })}>
                              {r.title}
                            </a>
                            {r.url && (
                              <>
                                {' · '}
                                <a href={r.url} target="_blank" rel="noreferrer" className={s.url}>
                                  {r.url}
                                </a>
                              </>
                            )}
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}
                </article>
              </PrintCtx.Provider>

              <aside className={s.aside}>
                <nav aria-label="Contents" className={s.contents} data-testid="port-contents">
                  <h2>Contents</h2>
                  <ol>
                    {outline.sections.map((section) => (
                      <li key={section.id}>
                        <button
                          type="button"
                          onClick={() => {
                            const target = document.getElementById(`port-section-${section.id}`);
                            target?.scrollIntoView({ block: 'start' });
                            target?.setAttribute('tabindex', '-1');
                            target?.focus({ preventScroll: true });
                          }}
                        >
                          {section.heading}
                        </button>
                      </li>
                    ))}
                  </ol>
                </nav>
                <span className={s.asideLabel}>FROM THE BOARD</span>
                {outline.frames.map((f) => (
                  <a
                    key={f.id}
                    className={s.frameLink}
                    href={routeHref({ name: 'canvas', id: canvasId, focus: f.id })}
                    data-testid="port-frame"
                  >
                    <span className={`${s.dot} ${s[`dot_${f.color}`] ?? ''}`} aria-hidden="true" />
                    {f.title}, {f.cards} {f.cards === 1 ? 'card' : 'cards'}
                  </a>
                ))}
                {outline.frames.length === 0 && <span className={s.asideNote}>The whole board.</span>}
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
