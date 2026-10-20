/** Person or organisation: an avatar (photo, or initials), name, role and org, summary and facts. */
import { EntityData, initialsOf, readCardData, cardTitle, type Card } from '@orb/shared';
import { PrintBody, PrintLink, type PrintHalf } from '../../print/kit.js';
import { useCardActions } from '../context.js';
import { EditFields, ImagePick, isUserCard, type FieldDef } from '../media/edit.js';
import { pptxHook } from '../pptx.js';
import { type CardBody, type CardUi, ReaderText, TextBody } from './kit.js';
import c from '../cards.module.css';
import m from '../media/media.module.css';

const FIELDS: FieldDef[] = [
  { key: 'title', label: 'Name', max: 200 },
  { key: 'role', label: 'Role', max: 200 },
  { key: 'org', label: 'Organisation', max: 200 },
  { key: 'location', label: 'Location', max: 200 },
  { key: 'url', label: 'Link', kind: 'url', max: 4096, placeholder: 'https://' },
  { key: 'body', label: 'Summary', kind: 'area', max: 4000 },
];

function Avatar({ card, d }: { card: Card; d: EntityData }) {
  const { assetUrl } = useCardActions();
  return (
    <span className={d.kind === 'org' ? `${m.avatar} ${m.org}` : m.avatar} aria-hidden="true" data-testid="entity-avatar">
      {d.photo ? <img src={assetUrl(d.photo)} alt="" /> : initialsOf(cardTitle(card))}
    </span>
  );
}

const subline = (d: EntityData) => [d.role, d.org, d.location].filter(Boolean).join(' · ');

const Facts = ({ facts, max }: { facts: NonNullable<EntityData['facts']>; max?: number }) => (
  <dl className={m.facts} data-testid="entity-facts">
    {facts.slice(0, max ?? facts.length).flatMap((f, i) => [
      <dt key={`t${i}`}>{f.label}</dt>,
      <dd key={`d${i}`}>{f.value}</dd>,
    ])}
  </dl>
);

const Body: CardBody = ({ card, lod }) => {
  const d = readCardData(EntityData, card.data);
  if (!d) return <TextBody card={card} lod={lod} />;
  return (
    <>
      <div className={m.row}>
        <Avatar card={card} d={d} />
        <p className={m.sub} data-testid="entity-sub">
          {subline(d) || (d.kind === 'org' ? 'Organisation' : 'Person')}
        </p>
      </div>
      {d.body && <p className={m.text}>{d.body}</p>}
      {lod === 'full' && d.facts && d.facts.length > 0 && <Facts facts={d.facts} max={3} />}
    </>
  );
};

function Reader({ card }: { card: Card }) {
  const { openLink } = useCardActions();
  const d = readCardData(EntityData, card.data);
  if (!d) return <ReaderText card={card} />;
  return (
    <>
      <div className={m.row}>
        <Avatar card={card} d={d} />
        <p className={m.sub}>{subline(d) || (d.kind === 'org' ? 'Organisation' : 'Person')}</p>
      </div>
      {isUserCard(card) ? (
        <>
          <EditFields card={card} fields={FIELDS} />
          <ImagePick card={card} field="photo" label="Photo or logo" />
        </>
      ) : (
        d.body && <p className={`${m.text} ${m.full}`} data-testid="reader-text">{d.body}</p>
      )}
      {d.facts && d.facts.length > 0 && <Facts facts={d.facts} />}
      {d.url && (
        <button type="button" className={c.chip} data-testid="reader-open-link" onClick={() => openLink(card.id, d.url!)}>
          Open link in browser
        </button>
      )}
    </>
  );
}

const Print: PrintHalf = ({ card }) => {
  const d = readCardData(EntityData, card.data);
  if (!d) return null;
  return (
    <>
      {subline(d) && <p className={m.sub}>{subline(d)}</p>}
      <PrintBody>{d.body}</PrintBody>
      {d.facts && d.facts.length > 0 && <Facts facts={d.facts} />}
      {d.url && <PrintLink url={d.url} />}
    </>
  );
};

export const entity: CardUi = { Body, Reader, Print, pptx: pptxHook };
