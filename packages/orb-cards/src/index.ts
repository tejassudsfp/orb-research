/**
 * `@orb/cards`: the card registry (host halves of the PRD card plugin contract: Data, Agent tools, Describe) for
 * every card type. Pure: no harness imports; orb-canvas registers the shared board tools over it.
 */
export {
  AGENT_FIELD_NAMES,
  CARD_REGISTRY,
  CardFieldError,
  QUOTE_MAX_WORDS,
  buildCardData,
  cardDef,
  describeCard,
  fieldGuide,
  mayPlace,
  patchCardData,
  placeableTypes,
} from './registry.js';
export type { CardDataContext, CardDef, CardOrigin } from './registry.js';
export { DESCRIBE_MAX, clip, mermaidSummary, visibleText } from './describe.js';
export type { CardTypeSpec, DescribableCard } from './spec.js';
