/**
 * The research document's print route (BUILD_PLAN P4.4 `/print/doc`, PRD Port › Research document): A4 portrait,
 * light, flowing pages with a running footer (`@page` margin boxes: "orb · " and the canvas title and "Page n of N"). The
 * standard format from outline.ts: title and summary, one section per frame with its cards as numbered figures and
 * tables, open questions, and the numbered source list with clickable links. P4.5 adds the composed prose.
 */
import { PrintCard } from './PrintCard.js';
import type { ComposedOutline, DocOutline } from './outline.js';
import { cssString } from './plan.js';
import { OrbLockup } from '../brand/OrbMark.js';
import { cardUrl } from '@orb/shared';
import p from './print.module.css';

const pageStyle = (title: string) => `@page {
  size: A4;
  margin: 18mm 16mm 20mm;
  @bottom-left { content: ${cssString(`orb · ${title.slice(0, 72)}`)}; font: 400 8pt Geist, sans-serif; color: rgba(17, 23, 29, 0.6); }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 400 8pt Geist, sans-serif; color: rgba(17, 23, 29, 0.6); }
}`;

/**
 * P4.5: the composed document (`port.get`): Orb's sections with numbered citations (`[n]` links to the reference
 * list), the figures Orb placed in each section, then every other card of the scope ("From the board", so every
 * canvas element renders), and the numbered references with clickable source links.
 */
export function ComposedDocPrint({ outline, date }: { outline: ComposedOutline; date: string }) {
  const linkedSources = outline.references.filter((r) => r.url).length;
  const topics =
    outline.frames.length +
    Number([...outline.cards, ...outline.appendix.map((f) => f.card)].some((card) => card.frameId === null));
  return (
    <>
      <style>{pageStyle(outline.title)}</style>
      <main
        className={`${p.doc} ${outline.document?.format === 'report' ? p.professionalReport : ''}`}
        data-testid="print-doc"
        data-composed="true"
      >
        <header className={p.reportCover} data-testid="report-cover">
          <OrbLockup markSize={24} className={p.docBrand} testId="print-doc-brand" />
          <span className={p.eyebrow}>
            {outline.document?.format === 'report' ? 'Research report' : 'Research document'}
          </span>
          <h1
            className={p.docTitle}
            style={
              outline.title.length > 120
                ? { fontSize: '24pt' }
                : outline.title.length > 80
                  ? { fontSize: '28pt' }
                  : undefined
            }
          >
            {outline.title}
          </h1>
          <p className={p.reportSubtitle}>Analysis, evidence and recommendations</p>
          <dl className={p.reportMetadata}>
            <div>
              <dt>Prepared</dt>
              <dd>
                {outline.document
                  ? new Date(outline.document.composedAt).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })
                  : date}
              </dd>
            </div>
            {outline.document && (
              <div>
                <dt>Last updated</dt>
                <dd>
                  {new Date(outline.document.updatedAt).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </dd>
              </div>
            )}
            <div>
              <dt>Document version</dt>
              <dd>{outline.document?.version ?? 1}</dd>
            </div>
            <div>
              <dt>Research coverage</dt>
              <dd>
                {topics} {topics === 1 ? 'topic' : 'topics'} · {outline.sections.length} sections
              </dd>
            </div>
            <div>
              <dt>Evidence base</dt>
              <dd>
                {outline.references.length} cited records · {linkedSources} linked source{' '}
                {linkedSources === 1 ? 'record' : 'records'}
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                {outline.document?.problems.length
                  ? 'Draft - further development required'
                  : 'Prepared document'}
              </dd>
            </div>
          </dl>
          {Boolean(outline.document?.problems.length) && (
            <div className={p.reportDraft}>
              <strong>Draft review points</strong>
              <ul>
                {outline.document!.problems.slice(0, 4).map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          )}
          <p className={p.reportCoverNote}>
            Numbered references identify the records supporting the analysis. Research qualifications and
            evidence limitations should be read with the conclusions.
          </p>
        </header>
        <nav className={p.reportContents} aria-label="Contents" data-testid="report-contents">
          <h2 className={p.docH2}>Contents</h2>
          <ol>
            {outline.sections.map((section, i) => (
              <li key={section.id}>
                <a href={`#report-section-${i + 1}`}>{section.heading}</a>
              </li>
            ))}
          </ol>
          {outline.appendix.length > 0 && (
            <p>
              <a href="#report-exhibits">
                Appendix A.{' '}
                {outline.document?.format === 'report' ? 'Evidence register' : 'Supporting evidence exhibits'}
              </a>
            </p>
          )}
          {outline.references.length > 0 && (
            <p>
              <a href="#report-references">References</a>
            </p>
          )}
        </nav>
        {outline.sections.map((section, index) => (
          <section
            key={section.id}
            className={p.docSection}
            data-testid="print-section"
            data-section-id={section.id}
            id={`report-section-${index + 1}`}
          >
            <h2 className={p.docH2}>
              <span className={p.sectionNumber}>{index + 1}.</span> {section.heading}
            </h2>
            {section.paragraphs.map((para) => (
              <p
                key={para.id}
                className={para.userAuthored ? `${p.para} ${p.userPara}` : p.para}
                data-testid="print-paragraph"
              >
                {para.text}
                {para.cites.length > 0 && (
                  <span className={p.citeGroup}>
                    {'\u00a0'}
                    {para.cites.map((c) => (
                      <a key={c.cardId} className={p.citeRef} href={`#ref-${c.n}`} data-testid="print-cite">
                        [{c.n}]
                      </a>
                    ))}
                  </span>
                )}
              </p>
            ))}
            {section.figures.map((f) => (
              <PrintCard
                key={f.card.id}
                card={f.card}
                mode="figure"
                label={f.label}
                caption={f.caption}
                {...(f.source !== undefined ? { source: f.source } : {})}
              />
            ))}
          </section>
        ))}
        {outline.appendix.length > 0 && (
          <section
            className={`${p.docSection} ${p.reportAppendix}`}
            id="report-exhibits"
            data-testid="print-appendix"
          >
            <h2 className={p.docH2}>
              Appendix A.{' '}
              {outline.document?.format === 'report' ? 'Evidence register' : 'Supporting evidence exhibits'}
            </h2>
            <p className={p.para}>
              {outline.document?.format === 'report'
                ? 'Additional records in the selected research scope are registered below by source and topic. Selected exhibits appear with the analysis; this register provides traceability without repeating their full contents.'
                : 'Supporting records in the selected research scope are reproduced below. Their inclusion records the evidence base; the analysis distinguishes supported findings from unresolved claims.'}
            </p>
            {outline.document?.format === 'report' ? (
              <table className={`${p.table} ${p.reportRegister}`} data-testid="report-evidence-register">
                <thead>
                  <tr>
                    <th scope="col">Supporting record</th>
                    <th scope="col">Research topic</th>
                    <th scope="col">Type</th>
                  </tr>
                </thead>
                <tbody>
                  {outline.appendix.map((f) => (
                    <tr key={f.card.id}>
                      <td>
                        <strong>{f.caption}</strong>
                        {cardUrl(f.card) && (
                          <div>
                            <a className={p.link} href={cardUrl(f.card)}>
                              {cardUrl(f.card)}
                            </a>
                          </div>
                        )}
                      </td>
                      <td>
                        {outline.frames.find((frame) => frame.id === f.card.frameId)?.title ??
                          'Additional findings'}
                      </td>
                      <td>
                        {f.card.type === 'database'
                          ? 'Dataset'
                          : f.card.type.charAt(0).toUpperCase() + f.card.type.slice(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              outline.appendix.map((f) => (
                <PrintCard
                  key={f.card.id}
                  card={f.card}
                  mode="figure"
                  label={f.label}
                  {...(f.source !== undefined ? { source: f.source } : {})}
                />
              ))
            )}
          </section>
        )}
        {outline.references.length > 0 && (
          <section className={p.docSection} id="report-references" data-testid="print-sources">
            <h2 className={p.docH2}>References</h2>
            <ol className={p.sources}>
              {outline.references.map((r) => (
                <li key={r.n} value={r.n} id={`ref-${r.n}`}>
                  {r.title}
                  {r.url ? (
                    <>
                      .{' '}
                      <a className={p.link} href={r.url} data-testid="print-link">
                        {r.url}
                      </a>
                    </>
                  ) : (
                    ' (card on the board)'
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
    </>
  );
}

export function DocPrint({ outline, date }: { outline: DocOutline; date: string }) {
  return (
    <>
      <style>{`@page {
  size: A4;
  margin: 18mm 16mm 20mm;
  @bottom-left { content: ${cssString(`orb · ${outline.title}`)}; font: 400 8pt Geist, sans-serif; color: rgba(17, 23, 29, 0.6); }
  @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 400 8pt Geist, sans-serif; color: rgba(17, 23, 29, 0.6); }
}`}</style>
      <main className={p.doc} data-testid="print-doc">
        <header className={p.docHead}>
          <OrbLockup markSize={24} className={p.docBrand} testId="print-doc-brand" />
          <span className={p.eyebrow}>Board evidence compilation</span>
          <h1 className={p.docTitle}>{outline.title}</h1>
          <p className={p.docSummary}>{outline.summary}</p>
          <p className={p.meta}>{date}</p>
        </header>
        {outline.sections.map((section) => (
          <section key={section.id} className={p.docSection} data-testid="print-section">
            <h2 className={p.docH2}>{section.heading}</h2>
            {section.figures.length === 0 && <p className={p.meta}>No cards in this frame.</p>}
            {section.figures.map((f) => (
              <PrintCard
                key={f.card.id}
                card={f.card}
                mode="figure"
                label={f.label}
                {...(f.source !== undefined ? { source: f.source } : {})}
              />
            ))}
          </section>
        ))}
        {outline.openQuestions.length > 0 && (
          <section className={p.docSection} data-testid="print-questions">
            <h2 className={p.docH2}>Open questions</h2>
            {outline.openQuestions.map((f) => (
              <PrintCard key={f.card.id} card={f.card} mode="figure" label={f.label} />
            ))}
          </section>
        )}
        {outline.sources.length > 0 && (
          <section className={p.docSection} data-testid="print-sources">
            <h2 className={p.docH2}>Sources</h2>
            <ol className={p.sources}>
              {outline.sources.map((s) => (
                <li key={s.n} value={s.n}>
                  {s.title}.{' '}
                  <a className={p.link} href={s.url} data-testid="print-link">
                    {s.url}
                  </a>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
    </>
  );
}
