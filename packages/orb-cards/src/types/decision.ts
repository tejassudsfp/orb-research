/** Decision (P6.5): options, a choice, the rationale and a status; optionally a weighted rubric. */
import {
  DECISION_LIMITS,
  DECISION_STATUSES,
  DecisionCriterion,
  DecisionData,
  DecisionOption,
  decisionTotals,
  readCardData,
} from '@orb/shared';
import { z } from 'zod';
import { Body, Title, pick, type CardTypeSpec } from '../spec.js';
import { bodyOf } from '../describe.js';

export const decision: CardTypeSpec<'decision'> = {
  type: 'decision',
  purpose:
    'A decision to make or made: the options, the choice, why, and its status. With criteria and per-option scores it ranks the options by weighted total.',
  origin: 'static',
  fields: z.strictObject({
    title: Title,
    body: Body(4000).optional(),
    options: z.array(DecisionOption).min(2).max(DECISION_LIMITS.options),
    choice: z.string().trim().min(1).max(200).optional(),
    rationale: Body(4000).optional(),
    decisionStatus: z.enum(DECISION_STATUSES).optional(),
    criteria: z.array(DecisionCriterion).max(DECISION_LIMITS.criteria).optional(),
  }),
  fieldHelp:
    'title = the decision, body? = context, options = 2 to 8 of {label, note?, scores?}, choice? = the chosen option\'s label, rationale?, decisionStatus? ("open" default | "decided" needs a choice | "revisit"), criteria? = [{name, weight}] with one score 0 to 10 per criterion in each option\'s scores (the card then shows weighted totals)',
  toData: (f, _ctx, mode) => ({
    ...pick(f, {
      title: 'title',
      body: 'body',
      options: 'options',
      choice: 'choice',
      rationale: 'rationale',
      decisionStatus: 'status',
      criteria: 'criteria',
    }),
    ...(mode === 'create' && f.decisionStatus === undefined ? { status: 'open' } : {}),
  }),
  describe: (data) => {
    const d = readCardData(DecisionData, data);
    if (!d) return bodyOf(data);
    const totals = decisionTotals(d);
    const options = d.options
      .map((o) => {
        const t = totals?.find((x) => x.label === o.label);
        return t ? `${o.label} (${t.total}/10, #${t.rank})` : o.label;
      })
      .join('; ');
    return (
      `Decision ${d.status ?? 'open'}. Options: ${options}.` +
      (d.choice ? ` Chosen: ${d.choice}.` : '') +
      (d.rationale ? ` Why: ${d.rationale}` : '')
    );
  },
};
