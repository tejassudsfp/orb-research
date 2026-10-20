/**
 * The host half of one card type (P6.2 card platform): what an agent may give `place_card` for it, how that becomes
 * card data, and how the card is described to agents. One module per type in `./types/`; the registry
 * (`./registry.ts`) adds the shared manifest's schema and roles (packages/shared/src/cardTypes.ts).
 */
import type { AssetRef, CardType } from '@orb/shared';
import { z } from 'zod';

/** Where a card's data comes from (PRD card contract part 1). */
export type CardOrigin = 'user' | 'static' | 'fetched' | 'file' | 'captured';

/** What `toData` may need from the canvas service. */
export type CardDataContext = {
  /** The asset behind an `assets/…` path of this canvas (throws when there is none). */
  resolveAsset(path: string): Promise<AssetRef>;
  /** Clock (ms). */
  now: number;
  /** P6.6: the card's current data, on an update (a checklist keeps the user's ticks). */
  current?: unknown;
};

/** A field an agent supplied that does not fit the card type (the tools turn it into a message for the model). */
export class CardFieldError extends Error {
  override name = 'CardFieldError';
}

export type Fields = Record<string, unknown>;

export type DescribableCard = { type: CardType; data: unknown };

/** One card type's host half, as its module in `./types/` writes it. */
export type CardTypeSpec<T extends CardType = CardType> = {
  type: T;
  /** The kind name agents read ("design frame"); default: the manifest label. */
  label?: string;
  /** One line for agents: what the card is for. */
  purpose: string;
  origin: CardOrigin;
  /** The fields an agent gives `place_card` for this type (strict: other fields are refused). None: user-only. */
  fields?: z.ZodObject;
  /** The agent fields as one line of the tool description. */
  fieldHelp?: string;
  /**
   * Card data from (some of) the agent's fields. `mode: 'create'` fills defaults; `'update'` returns only what the
   * given fields change (the caller merges it over the current data and re-checks the whole against the schema).
   */
  toData?(fields: Fields, ctx: CardDataContext, mode: 'create' | 'update'): Promise<Fields> | Fields;
  /** The card's own tools, beyond the shared board tools. */
  tools?: readonly string[];
  /** Plain-text description of the card's content for agents (before clipping to DESCRIBE_MAX). */
  describe(data: unknown, card: DescribableCard): string;
};

// ---- Helpers the type modules share ----

export const Title = z.string().trim().min(1).max(200);
export const Body = (max: number) => z.string().trim().max(max);
export const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
export const CardRefField = z.string().regex(/^c_[A-Za-z0-9]{1,64}$/);

/** Copy the given fields to their data names. */
export const pick = (fields: Fields, map: Record<string, string>): Fields => {
  const out: Fields = {};
  for (const [from, to] of Object.entries(map)) if (fields[from] !== undefined) out[to] = fields[from];
  return out;
};

export const TEXT_MAP = { title: 'title', body: 'body' };

/** The asset an agent named by its `assets/…` path (an image when `kind` says so). */
export async function assetOf(
  fields: Fields,
  ctx: CardDataContext,
  kind: 'image' | 'any',
): Promise<AssetRef | undefined> {
  if (fields.asset === undefined) return undefined;
  const ref = await ctx.resolveAsset(String(fields.asset));
  if (kind === 'image' && !ref.mime.startsWith('image/'))
    throw new CardFieldError(`asset ${ref.path} is not an image`);
  return ref;
}
