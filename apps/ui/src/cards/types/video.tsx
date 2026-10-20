/**
 * Video or social post (P6.6): a thumbnail (captured or provided), the title, platform and author, and an Open link
 * button. It is NEVER embedded: no iframe, no player, nothing is fetched from the video's site. The link opens in
 * the default browser (window-open handler in Electron main).
 */
import { VideoData, readCardData, videoPlatformOf, type Card } from '@orb/shared';
import { PrintBody, PrintLink, PrintCtx, type PrintHalf } from '../../print/kit.js';
import { useContext } from 'react';
import { useCardActions } from '../context.js';
import { EditFields, ImagePick, isUserCard, type FieldDef } from '../media/edit.js';
import { pptxHook } from '../pptx.js';
import { type CardBody, type CardUi, ReaderText, TextBody } from './kit.js';
import c from '../cards.module.css';
import m from '../media/media.module.css';

const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Title', max: 500 },
  { key: 'url', label: 'Link', kind: 'url', max: 4096, placeholder: 'https://' },
  { key: 'platform', label: 'Platform', max: 60 },
  { key: 'author', label: 'Channel or author', max: 200 },
  { key: 'duration', label: 'Length', max: 20 },
  { key: 'body', label: 'What it says', kind: 'area', max: 4000 },
];

const metaOf = (d: VideoData) =>
  [videoPlatformOf(d), d.author, d.duration].filter(Boolean).join(' · ');

function Thumb({ d }: { d: VideoData }) {
  const { assetUrl } = useCardActions();
  return (
    <div className={m.thumb} data-testid="video-thumb">
      {d.thumb ? <img src={assetUrl(d.thumb)} alt="" /> : <span>No thumbnail</span>}
      <span className={m.play} aria-hidden="true">
        ▶ {videoPlatformOf(d) || 'video'}
      </span>
    </div>
  );
}

const Body: CardBody = ({ card, lod }) => {
  const { openLink } = useCardActions();
  const d = readCardData(VideoData, card.data);
  if (!d) return <TextBody card={card} lod={lod} />;
  return (
    <>
      <Thumb d={d} />
      {metaOf(d) && <p className={m.sub}>{metaOf(d)}</p>}
      {lod === 'full' && d.url && (
        <button
          type="button"
          className={c.cardButton}
          data-card-action="open-link"
          data-testid="card-open-link"
          onClick={() => openLink(card.id, d.url!)}
        >
          Open in browser
        </button>
      )}
    </>
  );
};

function Reader({ card }: { card: Card }) {
  const { openLink } = useCardActions();
  const d = readCardData(VideoData, card.data);
  if (!d) return <ReaderText card={card} />;
  return (
    <>
      <Thumb d={d} />
      <p className={m.sub}>{metaOf(d)}</p>
      {isUserCard(card) ? (
        <>
          <EditFields card={card} fields={FIELDS} />
          <ImagePick card={card} field="thumb" label="Thumbnail" />
        </>
      ) : (
        d.body && <p className={`${m.text} ${m.full}`} data-testid="reader-text">{d.body}</p>
      )}
      <p className={c.muted}>Videos are never played inside orb: the link opens in your browser.</p>
      {d.url && (
        <button type="button" className={c.chip} data-testid="reader-open-link" onClick={() => openLink(card.id, d.url!)}>
          Open in browser
        </button>
      )}
    </>
  );
}

const Print: PrintHalf = ({ card }) => {
  const { assetUrl } = useContext(PrintCtx);
  const d = readCardData(VideoData, card.data);
  if (!d) return null;
  return (
    <>
      {d.thumb && <img className={m.thumbPrint} src={assetUrl(d.thumb.path)} alt="" data-testid="print-video-thumb" />}
      {metaOf(d) && <p className={m.sub}>{metaOf(d)}</p>}
      <PrintBody>{d.body}</PrintBody>
      {d.url && <PrintLink url={d.url} />}
    </>
  );
};

export const video: CardUi = { Body, Reader, Print, pptx: pptxHook };
