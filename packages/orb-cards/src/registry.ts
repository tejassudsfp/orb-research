/**
 * The card registry (BUILD_PLAN P3.1, PRD › "Card types and the card plugin contract"; P6.2 card platform): one entry
 * per card type with the host halves of the contract, assembled from
 *
 * - the shared manifest (packages/shared/src/cardTypes.ts): the `Card.data` **schema** and the agent **roles** that
 *   may place the type (BUILD_PLAN §2.4; enforced by role inside the shared `place_card` / `update_card` tools, not by
 *   prompts);
 * - the type's own module (`./types/<type>.ts`): the agent **fields** and `toData`, its own **tools**, and
 *   **describe**, the plain text `query_board` returns.
 *
 * Render and Print are the UI halves (apps/ui/src/cards/types). Pure and harness-free: orb-canvas registers the tools.
 */
import { CARD_TYPES, type AgentName, type CardType } from '@orb/shared';
import { z } from 'zod';
import { clip } from './describe.js';
import {
  CardFieldError,
  type CardDataContext,
  type CardOrigin,
  type DescribableCard,
  type Fields,
} from './spec.js';
import { SPECS } from './types/index.js';

export { CardFieldError };
export type { CardDataContext, CardOrigin };
export { QUOTE_MAX_WORDS } from './types/quote.js';

export type CardDef = {
  type: CardType;
  /** The kind name an agent reads ("design frame"). */
  label: string;
  /** One line for agents: what the card is for. */
  purpose: string;
  origin: CardOrigin;
  /** Agent roles that may place this type (BUILD_PLAN §2.4). Empty = only the user creates it. */
  allowedRoles: readonly AgentName[];
  /** The `Card.data` schema (packages/shared). */
  schema: z.ZodType;
  /** The fields an agent gives `place_card` for this type (strict: other fields are refused). */
  fields?: z.ZodObject;
  /** The agent fields as one line of the tool description. */
  fieldHelp?: string;
  /**
   * Card data from (some of) the agent's fields. `mode: 'create'` fills defaults; `'update'` returns only what the
   * given fields change (the caller merges it over the current data and re-checks the whole against `schema`).
   */
  toData?(fields: Fields, ctx: CardDataContext, mode: 'create' | 'update'): Promise<Fields> | Fields;
  /** The card's own tools, beyond the shared board tools. */
  tools?: readonly string[];
  describe(card: DescribableCard): string;
};

/** Plain-text description of a card's content (at most DESCRIBE_MAX characters, one line). */
export function describeCard(card: DescribableCard): string {
  const spec = SPECS[card.type] as { describe(data: unknown, card: DescribableCard): string };
  return clip(spec.describe(card.data, card));
}

const defs: CardDef[] = (Object.keys(CARD_TYPES) as CardType[]).map((type) => {
  const { describe: _describe, label, ...spec } = SPECS[type] as (typeof SPECS)[CardType];
  return {
    ...spec,
    type,
    label: label ?? CARD_TYPES[type].label,
    allowedRoles: CARD_TYPES[type].roles,
    schema: CARD_TYPES[type].schema,
    describe: describeCard,
  };
});

/** Every card type's registry entry, keyed by type. */
export const CARD_REGISTRY: Readonly<Record<CardType, CardDef>> = Object.freeze(
  Object.fromEntries(defs.map((d) => [d.type, Object.freeze(d)])) as Record<CardType, CardDef>,
);

/** The registry entry of a card type. */
export const cardDef = (type: CardType): CardDef => CARD_REGISTRY[type];

/** The card types a role may place (BUILD_PLAN §2.4), in registry order. */
export const placeableTypes = (role: AgentName): CardType[] =>
  defs.filter((d) => d.allowedRoles.includes(role)).map((d) => d.type);

/** True when `role` may place (and update) cards of `type`. */
export const mayPlace = (role: AgentName, type: CardType): boolean =>
  CARD_REGISTRY[type].allowedRoles.includes(role);

/** Every field name any card type takes from an agent (the flat parameter list of `place_card`). */
export const AGENT_FIELD_NAMES: readonly string[] = [
  ...new Set(defs.flatMap((d) => (d.fields ? Object.keys(d.fields.shape) : []))),
];

/** The agent-field guide for the tool descriptions: one line per type the roles may place. */
export function fieldGuide(types: readonly CardType[] = defs.map((d) => d.type)): string {
  return types
    .map((t) => CARD_REGISTRY[t])
    .filter((d) => d.fields)
    .map((d) => `- ${d.type} (${d.label}): ${d.purpose} Fields: ${d.fieldHelp}.`)
    .join('\n');
}

function fieldIssue(type: CardType, err: z.ZodError): CardFieldError {
  const issue = err.issues[0];
  if (issue?.code === 'unrecognized_keys') {
    return new CardFieldError(
      `${issue.keys.join(', ')} ${issue.keys.length === 1 ? 'does' : 'do'} not apply to ${type} cards`,
    );
  }
  const path = issue?.path.join('.') || 'fields';
  return new CardFieldError(`invalid ${type} card ${path}: ${issue?.message ?? 'bad value'}`);
}

/** Drop absent values (`undefined`, `null` and empty strings) the model sent for fields it did not mean to set. */
function present(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null && v !== '') out[k] = v;
  return out;
}

/**
 * Card data for a new agent card of `type` from the agent's fields: checks the fields (strict, per type), builds the
 * data, then checks the result against the type's `Card.data` schema. Throws CardFieldError with a message for the
 * model. Does NOT check the role (see `mayPlace`).
 */
export async function buildCardData(type: CardType, fields: Fields, ctx: CardDataContext): Promise<Fields> {
  const def = CARD_REGISTRY[type];
  if (!def.fields || !def.toData) throw new CardFieldError(`agents cannot create ${type} cards`);
  const parsed = def.fields.safeParse(present(fields));
  if (!parsed.success) throw fieldIssue(type, parsed.error);
  const data = await def.toData(parsed.data as Fields, ctx, 'create');
  const checked = def.schema.safeParse(data);
  if (!checked.success) throw fieldIssue(type, checked.error);
  return checked.data as Fields;
}

/**
 * New card data for an agent's update of a `type` card: the given fields (any subset, same per-type checks) merged
 * over `current`, then checked against the type's schema. Returns undefined when no field was given.
 */
export async function patchCardData(
  type: CardType,
  current: unknown,
  fields: Fields,
  ctx: CardDataContext,
): Promise<Fields | undefined> {
  const def = CARD_REGISTRY[type];
  if (!def.fields || !def.toData) throw new CardFieldError(`agents cannot edit ${type} cards`);
  const given = present(fields);
  if (Object.keys(given).length === 0) return undefined;
  const parsed = def.fields.partial().safeParse(given);
  if (!parsed.success) throw fieldIssue(type, parsed.error);
  const change = await def.toData(parsed.data as Fields, { ...ctx, current }, 'update');
  const base = current && typeof current === 'object' ? (current as Fields) : {};
  const checked = def.schema.safeParse({ ...base, ...change });
  if (!checked.success) throw fieldIssue(type, checked.error);
  return checked.data as Fields;
}
